export type LessonStageId = 'warmup' | 'teach' | 'practice' | 'roleplay' | 'recap' | 'save'

export type LessonSession = {
  lessonId: string
  stageIndex: number
  exerciseIndex: number
  status: 'active' | 'completed'
  skippedStages: number[]
}

export const LESSON_STAGES: ReadonlyArray<{
  id: LessonStageId
  label: string
  minutes: number
}>

export function createLessonSession(lessonId: string): LessonSession
export function isLessonSession(value: unknown): value is LessonSession
export function advanceLessonSession(session: LessonSession): LessonSession
export function skipLessonStage(session: LessonSession): LessonSession
export function repeatLessonStage(session: LessonSession): LessonSession
export function loadLessonSession(storage: Pick<Storage, 'getItem'>, lessonId: string): LessonSession | null
export function saveLessonSession(storage: Pick<Storage, 'setItem'>, session: LessonSession): void
export function createMockTutorReply(stageId: string, learnerText: string, languageCode?: 'zh' | 'fr'): string
