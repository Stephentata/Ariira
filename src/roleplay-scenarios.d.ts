export type RoleplayScenario = {
  id: string
  level: 'A1' | 'A2' | 'B1' | 'B2'
  title: string
  goal: string
  successCriteria: string[]
  usefulPhrases: Array<{ text: string; transliteration: string; translation: string }>
  openingLine: string
  openingMeaning: string
  vocabulary: string
  grammarPoint: string
}

export type LessonRoleplaySource = {
  vocabulary: Array<{
    text: string
    transliteration?: string
    translation_en: string
  }>
  grammar_point?: string | { explanation_en: string } | null
  roleplay: {
    id: string
    level: string
    title: string
    goal: string
    success_criteria: string[]
    useful_phrases: Array<{
      text: string
      transliteration?: string
      translation: string
    }>
  }
}

export const ROLEPLAY_SCENARIOS: readonly RoleplayScenario[]
export function getRoleplayScenario(id: string): RoleplayScenario
export function createLessonRoleplayScenario(lesson: LessonRoleplaySource): RoleplayScenario
