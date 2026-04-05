import { pipeline } from '@xenova/transformers'

let transcriber:
  | ((
      audio: Float32Array,
      options: {
        chunk_length_s: number
        stride_length_s: number
        language: string
        task: string
      }
    ) => Promise<{ text: string }>)
  | null = null

async function loadTranscriber(onProgress?: (progress: unknown) => void) {
  if (transcriber) {
    return transcriber
  }

  transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
    progress_callback: onProgress
  })

  return transcriber
}

export async function transcribeAudioBlob(
  audioBlob: Blob,
  onProgress?: (progress: unknown) => void
) {
  const activeTranscriber = await loadTranscriber(onProgress)
  const arrayBuffer = await audioBlob.arrayBuffer()
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  const audioContext = new AudioContextCtor({ sampleRate: 16000 })

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const audioData = audioBuffer.getChannelData(0)
    const result = await activeTranscriber(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'chinese',
      task: 'transcribe'
    })
    return result.text?.trim() || ''
  } finally {
    void audioContext.close()
  }
}
