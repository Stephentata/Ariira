import type { TutorCorrection, TutorNewWord, TutorReply, TutorProfile } from './tutor-provider.js'

export type TutorServiceMode = 'soft' | 'balanced' | 'strict'
export type TutorServiceTurn = {
  reply: string
  translation: string
  romanisation: string
  correction: (TutorCorrection & { error_type: string }) | null
  corrections: Array<TutorCorrection & { error_type?: string }>
  new_words: TutorNewWord[]
  score: number | null
  hint_level: number
  exercise: TutorReply['whiteboard_card'] | null
  difficulty_change: 'up' | 'down' | 'steady'
  sources: Array<{ name: string; url: string; licence: string; attribution_text: string }>
  grounded: boolean
  verification: 'grounded' | 'unverified'
  cooldown: boolean
  failureCount: number
  safeguard?: 'distress' | 'safe-word' | 'redirect'
  learningState?: { failures: number; outcomes: boolean[]; errorPatterns: Record<string, number> }
  whiteboard_card?: TutorReply['whiteboard_card']
  next_action: TutorReply['next_action']
}
export type TutorSessionOptions = {
  language: string
  languageCode?: string
  nativeLanguage: string
  level: string
  lessonOrRoleplay?: {
    kind?: 'lesson' | 'roleplay' | 'free-chat'
    title: string
    section?: string
    goal?: string
    successCriteria?: string[]
    vocabulary?: string
    grammarPoint?: string
  }
  tutor: 'Ari' | 'Ira'
  mode: TutorServiceMode
  personality?: string
  openingPhase?: 'welcome' | 'teaching'
  interests?: string[]
  goals?: string
  memorySummary?: string
  history?: Array<{ role: 'tutor' | 'user'; text: string }>
  adaptiveState?: { failures: number; outcomes: boolean[]; errorPatterns: Record<string, number> }
}
export type TutorSessionSummary = {
  turns: number
  corrections: TutorCorrection[]
  new_words: TutorNewWord[]
  durationSeconds: number
  score: number | null
}
export class TutorService {
  constructor(options?: {
    requestTurn?: (history: Array<{ role: 'tutor' | 'user'; text: string }>, provider?: undefined, profile?: TutorProfile) => Promise<TutorReply>
    mock?: boolean
  })
  startSession(options: TutorSessionOptions): Promise<{ startedAt: number }>
  sendUserTurn(textOrAudio: string | Blob): Promise<void>
  getTutorTurn(): Promise<TutorServiceTurn>
  endSession(): Promise<TutorSessionSummary>
}
export const mockTutorService: TutorService
export const TUTOR_INTEGRATION_TODOS: readonly string[]
