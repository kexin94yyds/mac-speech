import type {
  SpeechEngine,
  SpeechEngineErrorPayload,
  SpeechEngineHandlers,
  SpeechEngineResultPayload
} from './types'

export class WebSpeechEngine implements SpeechEngine {
  readonly kind = 'web-speech'

  private recognition: AppSpeechRecognition | null = null
  private handlers: SpeechEngineHandlers = {}

  isSupported() {
    return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition)
  }

  setHandlers(handlers: SpeechEngineHandlers) {
    this.handlers = handlers
  }

  start() {
    const recognition = this.ensureRecognition()
    recognition.start()
  }

  stop() {
    this.recognition?.stop()
  }

  abort() {
    this.recognition?.abort()
  }

  private ensureRecognition() {
    if (this.recognition) {
      return this.recognition
    }

    const RecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!RecognitionCtor) {
      throw new Error('SpeechRecognition unavailable')
    }

    const instance = new RecognitionCtor()
    instance.lang = 'zh-CN'
    instance.continuous = true
    instance.interimResults = true
    instance.maxAlternatives = 1

    instance.onstart = () => {
      this.handlers.onStart?.()
    }

    instance.onresult = (event) => {
      const payload = this.resolvePayload(event)
      this.handlers.onResult?.(payload)
    }

    instance.onerror = (event) => {
      const payload: SpeechEngineErrorPayload = {
        error: event.error || 'unknown',
        message: event.message
      }
      this.handlers.onError?.(payload)
    }

    instance.onend = () => {
      this.handlers.onEnd?.()
    }

    this.recognition = instance
    return instance
  }

  private resolvePayload(event: AppSpeechRecognitionEvent): SpeechEngineResultPayload {
    let finalText = ''
    let partialText = ''

    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index]
      const alternative = result[0]
      if (!alternative) {
        continue
      }

      if (result.isFinal) {
        finalText += `${alternative.transcript} `
      } else {
        partialText += `${alternative.transcript} `
      }
    }

    return {
      finalText: finalText.trim(),
      partialText: partialText.trim()
    }
  }
}
