export type SpeechGender = 'female' | 'male'
export type SpeechPreferences = { gender: SpeechGender; flavor: string; rate: number }

export const SPEECH_PREFERENCES_KEY: string
export const DEFAULT_SPEECH_PREFERENCES: Readonly<SpeechPreferences>
export function getTutorPreviewText(languageCode: string): string
export function getTutorSpeechGender(tutorName: 'Ari' | 'Ira'): SpeechGender
export function readSpeechPreferences(storage: Pick<Storage, 'getItem'>): SpeechPreferences
export function saveSpeechPreferences(storage: Pick<Storage, 'setItem'>, preferences: SpeechPreferences): void
export function buildLocalSpeechRequest(
  text: string,
  locale: string,
  gender: SpeechGender,
): {
  input: string
  language: string
  gender: SpeechGender
}
export function requestLocalSpeech(
  text: string,
  locale: string,
  gender: SpeechGender,
  fetcher?: typeof fetch,
  signal?: AbortSignal,
): Promise<Blob>
