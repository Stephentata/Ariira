export type LearningSkill = 'listening' | 'speaking' | 'reading' | 'writing' | 'vocabulary' | 'grammar'

export type LearningProgress = {
  activityByDate: Record<string, number>
  objectives: Record<string, { correct: number; incorrect: number; recent: boolean[] }>
  skills: Record<string, { correct: number; attempts: number }>
  errors: Record<string, number>
  lessonsCompleted: number
  languageProgress: Record<string, {
    objectives: Record<string, { correct: number; incorrect: number; recent: boolean[] }>
    skills: Record<string, { correct: number; attempts: number }>
    errors: Record<string, number>
    lessonsCompleted: number
  }>
}

export function readLearningProgress(storage: Storage): LearningProgress
export function recordPracticeSeconds(storage: Storage, seconds: number, now?: Date): LearningProgress
export function recordExerciseAttempt(
  storage: Storage,
  attempt: { objectiveId: string; skills?: LearningSkill[]; correct: boolean; languageCode?: string },
): LearningProgress
export function recordLessonCompleted(storage: Storage, languageCode?: string): LearningProgress
export function getLearningProgressSummary(progress: LearningProgress, now?: Date, languageCode?: string): {
  week: Array<{ key: string; label: string; seconds: number }>
  activitySeconds: number
  weekSeconds: number
  todaySeconds: number
  currentStreak: number
  bestStreak: number
  lessonsCompleted: number
  objectives: Array<{ id: string; correct: number; attempts: number; mastery: number; recommendation: 'ready' | 'revisit' | 'building' }>
  skills: Array<{ id: string; correct: number; attempts: number; mastery: number }>
  topErrors: Array<{ id: string; count: number }>
}
export const LEARNING_PROGRESS_STORAGE_KEY: string
