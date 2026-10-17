import type { LanguageOption } from './language-options.js'

export type KnowledgeRecord = {
  id: string
  language: string
  level: 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  section: string
  skill: 'speaking' | 'listening' | 'grammar' | 'vocab' | 'pronunciation'
  content: string
  source_name: string
  source_url: string
  licence: string
  attribution_text: string
  quality_flag: 'approved' | 'reference' | 'unreviewed' | 'unproofread' | 'rejected'
  author?: string
  sentence_url?: string
  audio_url?: string
  audio_licence?: string
  audio_attribution_text?: string
  notes?: string
}

export const KNOWLEDGE_RECORDS: readonly KnowledgeRecord[]
export const KNOWLEDGE_INDEX: Readonly<Record<string, readonly string[]>>
export const KNOWLEDGE_SOURCES: readonly {
  id: string
  name: string
  url: string
  licence: string
  attribution_text: string
  status: string
  usage_note: string
}[]
export function getKnowledgeCoverage(languages?: readonly LanguageOption[], sections?: readonly string[], knowledgeRecords?: readonly KnowledgeRecord[]): {
  languages: Array<{ code: string; name: string; sections: Array<{ section: string; count: number }> }>
  approvedRecords: number
  unreviewedRecords: number
  gaps: Array<{ language: string; section: string }>
  sources: typeof KNOWLEDGE_SOURCES
}
