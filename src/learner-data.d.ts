export type LearnerSettings = {
  transcriptSaving: boolean
  liveTranscript: boolean
  mascotColor: 'Tutor style' | 'Sapphire' | 'Rose' | 'Onyx'
  mascotColorPreferenceVersion?: 2
  personality: string
  goals: string
  interests: string
  memory: string[]
  dailyGoalMinutes: number
  nativeLanguageCode: string
  targetLanguageCode: string
  tutorName: 'Ari' | 'Ira'
  tutorMode: 'soft' | 'balanced' | 'strict'
  onboardingComplete: boolean
  displayName: string
  level: 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  ageRange: string
  progressTimeline: string
  aiTutorComfort: string
  pronunciationGoal: string
  learningPlanStyle: string
  practiceTimeOfDay: string
  reminderEnabled: boolean
}

export type TranscriptMessage = { role: 'user' | 'tutor'; text: string }

export type TutorHistorySession = {
  id: string
  updatedAt: string
  messages: TranscriptMessage[]
}

export const DEFAULT_LEARNER_SETTINGS: Readonly<LearnerSettings>
export function readLearnerSettings(storage: Storage): LearnerSettings
export function saveLearnerSettings(storage: Storage, settings: LearnerSettings): void
export function readTutorHistory(storage: Storage): TutorHistorySession[]
export function saveTutorSession(
  storage: Storage,
  id: string,
  messages: Array<{ role: 'user' | 'tutor'; text: string }>,
  now?: Date,
): TutorHistorySession[]
export function deleteTutorSession(storage: Storage, id: string): TutorHistorySession[]
export function clearAriData(storage: Storage): void
export const LEARNER_SETTINGS_STORAGE_KEY: string
export const TUTOR_HISTORY_STORAGE_KEY: string
