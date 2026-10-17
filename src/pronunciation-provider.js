export const WHISPER_MODEL = 'onnx-community/whisper-tiny'
export const WHISPER_REVISION = 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7'
const AUDIO_SAMPLE_RATE = 16_000

export function encodePcm16Wav(samples, sampleRate) {
  if (!(samples instanceof Float32Array) || samples.length === 0) {
    throw new Error('The microphone did not capture any audio. Please record the word again.')
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0 || samples.some((sample) => !Number.isFinite(sample))) {
    throw new Error('The microphone audio could not be prepared for transcription.')
  }

  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeText(36, 'data')
  view.setUint32(40, dataSize, true)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(44 + index * bytesPerSample, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export function getWhisperLanguage(language) {
  if (typeof language !== 'string' || language.trim() === '') {
    throw new Error('A language is required for local speech transcription.')
  }
  const languageCode = language.trim().toLowerCase().split(/[-_]/u)[0]
  switch (languageCode) {
    case 'en': return 'english'
    case 'fr': return 'french'
    case 'zh': return 'chinese'
    default:
      throw new Error(`Local speech transcription does not support "${language}". Choose English, French, or Mandarin.`)
  }
}

function normalizePronunciationText(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

function getWordUnits(value, language) {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(language, { granularity: 'word' })
    const words = Array.from(segmenter.segment(value))
      .filter((part) => part.isWordLike)
      .map((part) => part.segment)
    if (words.length > 0) return words
  }

  return value.trim().split(/\s+/u).filter(Boolean)
}

function createFeedback(referenceText, recognizedText, language) {
  const referenceWords = getWordUnits(referenceText, language)
  const recognizedWords = getWordUnits(recognizedText, language)
  const problemWords = Array.from(
    { length: Math.max(referenceWords.length, recognizedWords.length) },
    (_, index) => ({
      target: referenceWords[index] ?? '(no target word)',
      heard: recognizedWords[index] ?? '',
    }),
  ).filter((word) =>
    normalizePronunciationText(word.target) !== normalizePronunciationText(word.heard),
  )
  const understood = problemWords.length === 0 &&
    referenceWords.length === recognizedWords.length &&
    normalizePronunciationText(referenceText) === normalizePronunciationText(recognizedText)
  const isMandarin = language.toLowerCase().startsWith('zh')

  return {
    status: understood ? 'understood' : 'try-again',
    confidence: null,
    referenceText,
    recognizedText,
    problemWords: understood ? [] : problemWords,
    tip: understood
      ? 'The browser heard the target. Try it once more at a natural speaking pace.'
      : 'Listen to the model, then repeat the highlighted word slowly and make each syllable clear.',
    toneFeedbackAvailable: false,
    note: understood
      ? 'The local recognizer heard the phrase; word matching is approximate and this is not a pronunciation score.'
      : 'Speech recognition can mishear clear speech. Word matching is approximate; this is not a pronunciation score.',
    ...(isMandarin ? { toneNote: 'Tone feedback is not available from this check.' } : {}),
  }
}

function validateAssessmentInput(transcript, referenceText, language) {
  if (typeof transcript !== 'string' || !transcript.trim() || !normalizePronunciationText(transcript)) {
    throw new Error('A recognized speech transcript containing spoken text is required.')
  }
  if (typeof referenceText !== 'string' || !referenceText.trim() || !normalizePronunciationText(referenceText)) {
    throw new Error('A target phrase containing spoken text is required.')
  }
  if (typeof language !== 'string' || !language.trim()) {
    throw new Error('A language is required for pronunciation feedback.')
  }
}

export class TranscriptComparisonPronunciationProvider {
  assessTranscript(transcript, referenceText, language) {
    validateAssessmentInput(transcript, referenceText, language)
    return createFeedback(referenceText.trim(), transcript.trim(), language)
  }
}

async function decodeAudioBlob(blob) {
  if (typeof AudioContext === 'undefined') {
    throw new Error('On-device audio decoding is unavailable in this browser.')
  }
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('The microphone did not capture any audio. Please record the word again.')
  }

  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const mono = new Float32Array(decoded.length)
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel)
      for (let index = 0; index < data.length; index += 1) mono[index] += data[index] / decoded.numberOfChannels
    }

    if (decoded.sampleRate === AUDIO_SAMPLE_RATE) return mono

    const outputLength = Math.floor(mono.length * AUDIO_SAMPLE_RATE / decoded.sampleRate)
    if (outputLength === 0) {
      throw new Error('The captured audio is too short to transcribe.')
    }
    const resampled = new Float32Array(outputLength)
    const sampleRatio = decoded.sampleRate / AUDIO_SAMPLE_RATE
    for (let index = 0; index < outputLength; index += 1) {
      const sourcePosition = index * sampleRatio
      const leftIndex = Math.floor(sourcePosition)
      const rightIndex = Math.min(leftIndex + 1, mono.length - 1)
      const fraction = sourcePosition - leftIndex
      resampled[index] = mono[leftIndex] * (1 - fraction) + mono[rightIndex] * fraction
    }
    return resampled
  } finally {
    await context.close()
  }
}

export class LocalWhisperSTTProvider {
  constructor({ workerFactory, audioDecoder = decodeAudioBlob } = {}) {
    this.workerFactory = workerFactory ?? (() => {
      if (typeof Worker === 'undefined') {
        throw new Error('On-device speech recognition needs a browser that supports module workers.')
      }
      return new Worker(new URL('./pronunciation-worker.js', import.meta.url), { type: 'module' })
    })
    this.audioDecoder = audioDecoder
    this.worker = null
    this.nextRequestId = 1
    this.pending = new Map()
  }

  async transcribe(audio, language, onProgress = () => {}) {
    if (typeof language !== 'string' || !language.trim()) {
      throw new Error('Choose a language before recording pronunciation practice.')
    }
    const samples = await this.audioDecoder(audio)
    if (!(samples instanceof Float32Array) || samples.length === 0) {
      throw new Error('The microphone recording could not be prepared for transcription.')
    }
    const worker = this.getWorker()
    const id = this.nextRequestId++

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress })
      try {
        worker.postMessage({ id, samples, language, sampleRate: AUDIO_SAMPLE_RATE }, [samples.buffer])
      } catch (error) {
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error('Could not send audio to the local transcription worker.'))
      }
    })
  }

  getWorker() {
    if (this.worker) return this.worker
    const worker = this.workerFactory()
    worker.onmessage = (event) => {
      const message = event.data
      const request = this.pending.get(message.id)
      if (!request) return
      if (message.type === 'progress') {
        request.onProgress(message.message)
      } else {
        this.pending.delete(message.id)
        if (message.type === 'result') request.resolve({ text: message.text, confidence: null })
        else request.reject(new Error(message.error))
      }
    }
    worker.onerror = (event) => {
      const error = new Error(event.message || 'The local speech model worker failed.')
      for (const request of this.pending.values()) request.reject(error)
      this.pending.clear()
      worker.terminate()
      this.worker = null
    }
    this.worker = worker
    return worker
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    for (const request of this.pending.values()) {
      request.reject(new Error('Pronunciation checking was cancelled.'))
    }
    this.pending.clear()
  }
}

export class LocalWhisperPronunciationProvider {
  constructor(sttProvider = new LocalWhisperSTTProvider()) {
    this.sttProvider = sttProvider
  }

  async assess(audio, referenceText, language, onProgress = () => {}) {
    if (typeof referenceText !== 'string' || !referenceText.trim() || !normalizePronunciationText(referenceText)) {
      throw new Error('A target phrase containing spoken text is required.')
    }
    const transcript = await this.sttProvider.transcribe(audio, language, onProgress)
    validateAssessmentInput(transcript.text, referenceText, language)
    return createFeedback(referenceText.trim(), transcript.text.trim(), language)
  }

  dispose() {
    this.sttProvider.dispose?.()
  }
}

export class MockPronunciationProvider {
  constructor(transcribe = async () => ({ text: '你好', confidence: null })) {
    this.transcribe = transcribe
  }

  async assess(audio, referenceText, language) {
    const transcript = await this.transcribe(audio, language)
    validateAssessmentInput(transcript.text, referenceText, language)
    return createFeedback(referenceText.trim(), transcript.text.trim(), language)
  }
}

export { normalizePronunciationText }
