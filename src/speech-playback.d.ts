import type { SpeechGender } from './speech-options.js'

export function cancelSpeechPlayback(): void
export function prepareTutorSpeechText(text: string): string
export type BrowserSpeechVoice = { lang?: string; name?: string; default?: boolean }
export function selectBrowserSpeechVoice(
  voices: BrowserSpeechVoice[],
  locale: string,
  gender: SpeechGender,
  flavor?: string,
): BrowserSpeechVoice | null
export function playSpeechAudio(
  text: string,
  locale: string,
  gender: SpeechGender,
  browserApis?: typeof globalThis,
  options?: {
    flavor?: string
    rate?: number
    onLevel?: (level: number) => void
    onBoundary?: (charIndex: number, charLength: number) => void
    onLevelError?: (error: unknown) => void
  },
): Promise<void>
