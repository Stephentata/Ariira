export type TutorLevel = 'A1' | 'A2' | 'B1' | 'B2'
export type TutorCorrection = { original: string; corrected: string; explanation: string }
export type TutorNewWord = { word: string; meaning: string }
export type WhiteboardCard =
  | { id: string; type: 'vocab_card'; title: string; word: string; transliteration: string; translation: string; example_sentence: string; image?: { src: string; license: string } | null }
  | { id: string; type: 'grammar_card'; title: string; pattern: string; explanation: string; examples: string[] }
  | { id: string; type: 'dialogue_card'; title: string; lines: Array<{ speaker: string; text: string; transliteration?: string; translation?: string }> }
  | { id: string; type: 'tone_or_sound_card'; title: string; sound: string; tip: string; contour?: string }
  | { id: string; type: 'word_order_card'; title: string; blocks: string[]; answer: string }
  | { id: string; type: 'summary_card'; title: string; takeaways: string[] }
export type TutorReply = {
  reply_text: string
  native_support: string
  corrections: TutorCorrection[]
  new_words: TutorNewWord[]
  whiteboard_card?: WhiteboardCard
  next_action: 'continue' | 'practice' | 'show_whiteboard' | 'finish'
}
export type TutorHistoryMessage = {
  role: 'tutor' | 'user'
  text: string
  corrections?: TutorCorrection[]
  newWords?: TutorNewWord[]
  whiteboardCard?: WhiteboardCard
  nextAction?: TutorReply['next_action']
}
export type TutorProfile = {
  tutorName: string
  nativeLanguage: string
  targetLanguage: string
  targetLanguageCode: string
  level: TutorLevel
  goals: string
  interests: string
  lessonTitle: string
  objectives: string
  vocabulary: string
  grammarPoint: string
  errorProfile: string
  memorySummary: string
  tutorMode?: 'soft' | 'balanced' | 'strict'
  openingPhase?: 'welcome' | 'teaching'
  freeChat?: boolean
  roleplay?: {
    title: string
    goal: string
    successCriteria: string[]
  }
}
export type LLMChatMessage = { role: 'system' | 'assistant' | 'user'; content: string }
export type LLMProvider = {
  chat(messages: LLMChatMessage[], schema: Record<string, unknown>): Promise<unknown>
}

export const defaultTutorProfile: TutorProfile
export const tutorResponseSchema: Record<string, unknown>
export class OllamaLLMProvider implements LLMProvider {
  constructor(options?: {
    endpoint?: string
    model?: string
    fetcher?: typeof fetch
    logger?: Pick<Console, 'info' | 'error'>
  })
  chat(messages: LLMChatMessage[], schema: Record<string, unknown>): Promise<unknown>
}
export const ollamaProvider: OllamaLLMProvider
export function getTargetLanguageRatio(level: TutorLevel): number
export function getLanguageRatio(text: string): number
export function getTutorResponseLanguageRatio(value: unknown): number
export function countTutorSentences(text: string): number
export function validateTutorResponse(value: unknown, level?: TutorLevel, targetLanguageCode?: string, maxSentences?: number): TutorReply
export function buildTutorSystemPrompt(profile?: TutorProfile): string
export function buildTutorMessages(history: TutorHistoryMessage[], profile?: TutorProfile): LLMChatMessage[]
export function requestStructuredTutorReply(
  history: TutorHistoryMessage[],
  provider?: LLMProvider,
  profile?: TutorProfile,
): Promise<TutorReply>
