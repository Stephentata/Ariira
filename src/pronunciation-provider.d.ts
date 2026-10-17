export type PronunciationStatus = 'understood' | 'try-again'

export type PronunciationProblemWord = {
  target: string
  heard: string
}

export type PronunciationResult = {
  status: PronunciationStatus
  confidence: number | null
  referenceText: string
  recognizedText: string
  problemWords: PronunciationProblemWord[]
  tip: string
  toneFeedbackAvailable: false
  note: string
  toneNote?: string
}

export interface PronunciationProvider {
  assess(
    audio: Blob,
    referenceText: string,
    language: string,
    onProgress?: (message: string) => void,
  ): Promise<PronunciationResult>
}

export type SpeechTranscript = {
  text: string
  confidence: null
}

export interface STTProvider {
  transcribe(
    audio: Blob,
    language: string,
    onProgress?: (message: string) => void,
  ): Promise<SpeechTranscript>
}

export class TranscriptComparisonPronunciationProvider {
  assessTranscript(transcript: string, referenceText: string, language: string): PronunciationResult
}

export class LocalWhisperSTTProvider implements STTProvider {
  constructor(options?: {
    workerFactory?: () => Worker
    audioDecoder?: (audio: Blob) => Promise<Float32Array>
  })
  transcribe(
    audio: Blob,
    language: string,
    onProgress?: (message: string) => void,
  ): Promise<SpeechTranscript>
  dispose(): void
}

export class LocalWhisperPronunciationProvider implements PronunciationProvider {
  constructor(sttProvider?: STTProvider)
  assess(
    audio: Blob,
    referenceText: string,
    language: string,
    onProgress?: (message: string) => void,
  ): Promise<PronunciationResult>
  dispose(): void
}

export class MockPronunciationProvider implements PronunciationProvider {
  constructor(transcribe?: (audio: Blob, language: string) => Promise<SpeechTranscript>)
  assess(
    audio: Blob,
    referenceText: string,
    language: string,
    onProgress?: (message: string) => void,
  ): Promise<PronunciationResult>
}

export function normalizePronunciationText(value: string): string
export function getWhisperLanguage(language: string): 'english' | 'french' | 'chinese'
export function encodePcm16Wav(samples: Float32Array, sampleRate: number): Blob
