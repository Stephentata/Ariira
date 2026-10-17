import type { KnowledgeRecord } from './knowledge-base.js'
import type { TutorCorrection, TutorNewWord, TutorReply } from './tutor-provider.js'

export const KNOWLEDGE_SECTIONS: readonly string[]
export const SKILLS: readonly string[]
export const CEFR_LEVELS: readonly string[]
export const SECTION_PEDAGOGY: Readonly<Record<string, string>>
export function retrieveKnowledge(options: {
  language: string
  level: string
  section?: string
  skill?: string
  limit?: number
  knowledgeRecords?: readonly KnowledgeRecord[]
}): KnowledgeRecord[]
export function classifyError(correction: TutorCorrection): string
export function detectDistress(text: string): boolean
export function detectUnsafeRequest(text: string): boolean
export function deriveHintLevel(mode: 'soft' | 'balanced' | 'strict', failureCount: number): number
export function buildTeachingInstructions(options: {
  mode: 'soft' | 'balanced' | 'strict'
  section?: string
  retrieved: KnowledgeRecord[]
  failureCount?: number
  difficulty?: string
}): string
export function validateTeachingResponse(value: TutorServiceTurn, mode?: 'soft' | 'balanced' | 'strict'): TutorServiceTurn
export function enrichTutorTurn(turn: TutorServiceTurn, options: {
  mode: 'soft' | 'balanced' | 'strict'
  retrieved: KnowledgeRecord[]
  failureCount?: number
  difficulty?: 'up' | 'down' | 'steady'
}): TutorServiceTurn
export function createDistressResponse(language: string): TutorServiceTurn & { safeguard: string }
export function createRedirectResponse(language: string): TutorServiceTurn & { safeguard: string }
type TutorServiceTurn = {
  reply: string
  translation: string
  romanisation: string
  correction: (TutorCorrection & { error_type: string }) | null
  corrections: Array<TutorCorrection & { error_type?: string }>
  hint_level: number
  new_words: TutorNewWord[]
  exercise: TutorReply['whiteboard_card'] | null
  difficulty_change: 'up' | 'down' | 'steady'
  sources: Array<{ name: string; url: string; licence: string; attribution_text: string }>
  grounded: boolean
  verification: 'grounded' | 'unverified'
  cooldown: boolean
}
