export interface SpeechEngineResultPayload {
  finalText: string
  partialText: string
}

export interface SpeechEngineErrorPayload {
  error: string
  message?: string
}

export interface SpeechEngineHandlers {
  onStart?: () => void
  onResult?: (payload: SpeechEngineResultPayload) => void
  onError?: (payload: SpeechEngineErrorPayload) => void
  onEnd?: () => void
}

export interface SpeechEngine {
  readonly kind: string
  isSupported(): boolean
  setHandlers(handlers: SpeechEngineHandlers): void
  start(): void
  stop(): void
  abort(): void
}
