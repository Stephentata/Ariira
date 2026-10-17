import { env, pipeline } from '@huggingface/transformers'
import { getWhisperLanguage, WHISPER_MODEL, WHISPER_REVISION } from './pronunciation-provider.js'

env.useBrowserCache = true

let transcriberPromise

async function getTranscriber(id) {
  if (!transcriberPromise) {
    transcriberPromise = pipeline(
      'automatic-speech-recognition',
      WHISPER_MODEL,
      {
        revision: WHISPER_REVISION,
        device: 'wasm',
        dtype: 'q4',
        progress_callback: (progress) => {
          if (progress.status === 'progress_total' && progress.total > 0) {
            const percent = Math.round(progress.progress)
            self.postMessage({ id, type: 'progress', message: `Downloading the local speech model: ${percent}%` })
          } else if (progress.status === 'ready') {
            self.postMessage({ id, type: 'progress', message: 'Local speech model ready. Transcribing on this device…' })
          }
        },
      },
    ).catch((error) => {
      transcriberPromise = undefined
      throw error
    })
  } else {
    self.postMessage({ id, type: 'progress', message: 'Preparing local speech model…' })
  }
  return transcriberPromise
}

self.onmessage = async (event) => {
  const { id, samples, language, sampleRate } = event.data
  try {
    self.postMessage({ id, type: 'progress', message: 'Preparing on-device speech recognition…' })
    const transcriber = await getTranscriber(id)
    self.postMessage({ id, type: 'progress', message: 'Transcribing locally on this device…' })
    const result = await transcriber(samples, {
      sampling_rate: sampleRate,
      language: getWhisperLanguage(language),
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    if (typeof result?.text !== 'string' || !result.text.trim()) {
      throw new Error('The local speech model could not recognize any words. Try again closer to the microphone.')
    }
    self.postMessage({ id, type: 'result', text: result.text.trim() })
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      error: error instanceof Error
        ? `Local speech transcription failed: ${error.message}`
        : 'Local speech transcription failed. Please try again.',
    })
  }
}
