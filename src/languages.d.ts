import type { LanguageOption } from './language-options.js'

export type LanguageVoiceMetadata = LanguageOption & {
  voiceNameHints: { male: string[]; female: string[] }
  tutorNotes: string
}

export const LANGUAGES_WITH_VOICE: readonly LanguageVoiceMetadata[]
export function getLanguageVoiceMetadata(code: string): LanguageVoiceMetadata | null
