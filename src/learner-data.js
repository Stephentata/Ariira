const SETTINGS_KEY = 'ari-learner-settings'
const HISTORY_KEY = 'ari-tutor-history'
const MAX_MEMORY_ITEMS = 12
const MAX_HISTORY_SESSIONS = 30
const MAX_TRANSCRIPT_MESSAGES = 100
const SUPPORTED_LANGUAGE_CODES = new Set([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'zh', 'ko', 'hi', 'ar', 'tr', 'ru', 'vi', 'th', 'id',
  'nl', 'pl', 'sv', 'da', 'no', 'fi', 'el', 'he', 'uk', 'cs', 'ro', 'hu', 'ms', 'sw',
])

export const DEFAULT_LEARNER_SETTINGS = Object.freeze({
  transcriptSaving: false,
  liveTranscript: true,
  mascotColor: 'Tutor style',
  personality: 'Friendly',
  goals: '',
  interests: '',
  memory: [],
  dailyGoalMinutes: 15,
  nativeLanguageCode: 'en',
  targetLanguageCode: 'zh',
  tutorName: 'Ira',
  tutorMode: 'balanced',
  onboardingComplete: false,
  displayName: '',
  level: 'A1',
  ageRange: '',
  progressTimeline: '',
  aiTutorComfort: '',
  pronunciationGoal: '',
  learningPlanStyle: '',
  practiceTimeOfDay: '',
  reminderEnabled: false,
})

function isLearnerSettings(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.transcriptSaving === 'boolean' &&
    (value.liveTranscript === undefined || typeof value.liveTranscript === 'boolean') &&
    (value.mascotColor === undefined || ['Tutor style', 'Sapphire', 'Rose', 'Onyx'].includes(value.mascotColor)) &&
    (value.mascotColorPreferenceVersion === undefined || [1, 2].includes(value.mascotColorPreferenceVersion)) &&
    (value.personality === undefined || ['Friendly', 'Cheerful', 'Witty', 'Formal', 'Motivational', 'Short answers', 'Detailed explanations'].includes(value.personality)) &&
    typeof value.goals === 'string' &&
    value.goals.length <= 240 &&
    typeof value.interests === 'string' &&
    value.interests.length <= 240 &&
    (value.nativeLanguageCode === undefined || SUPPORTED_LANGUAGE_CODES.has(value.nativeLanguageCode)) &&
    (value.targetLanguageCode === undefined || SUPPORTED_LANGUAGE_CODES.has(value.targetLanguageCode)) &&
    (value.tutorName === undefined || value.tutorName === 'Ari' || value.tutorName === 'Ira') &&
    (value.tutorMode === undefined || ['soft', 'balanced', 'strict'].includes(value.tutorMode)) &&
    (value.onboardingComplete === undefined || typeof value.onboardingComplete === 'boolean') &&
    (value.displayName === undefined || (typeof value.displayName === 'string' && value.displayName.length <= 60)) &&
    (value.level === undefined || ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(value.level)) &&
    (value.ageRange === undefined || (typeof value.ageRange === 'string' && value.ageRange.length <= 30)) &&
    (value.progressTimeline === undefined || (typeof value.progressTimeline === 'string' && value.progressTimeline.length <= 30)) &&
    (value.aiTutorComfort === undefined || (typeof value.aiTutorComfort === 'string' && value.aiTutorComfort.length <= 30)) &&
    (value.pronunciationGoal === undefined || (typeof value.pronunciationGoal === 'string' && value.pronunciationGoal.length <= 60)) &&
    (value.learningPlanStyle === undefined || (typeof value.learningPlanStyle === 'string' && value.learningPlanStyle.length <= 60)) &&
    (value.practiceTimeOfDay === undefined || (typeof value.practiceTimeOfDay === 'string' && value.practiceTimeOfDay.length <= 20)) &&
    (value.reminderEnabled === undefined || typeof value.reminderEnabled === 'boolean') &&
    (value.dailyGoalMinutes === undefined ||
      (Number.isInteger(value.dailyGoalMinutes) && value.dailyGoalMinutes >= 5 && value.dailyGoalMinutes <= 120)) &&
    Array.isArray(value.memory) &&
    value.memory.length <= MAX_MEMORY_ITEMS &&
    value.memory.every((item) => typeof item === 'string' && item.trim() !== '' && item.length <= 160)
  )
}

export function readLearnerSettings(storage) {
  const serialized = storage.getItem(SETTINGS_KEY)
  if (serialized === null) return { ...DEFAULT_LEARNER_SETTINGS, memory: [] }
  let parsed
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('Saved learner settings are damaged. They were not changed.')
  }
  if (!isLearnerSettings(parsed)) throw new Error('Saved learner settings are invalid. They were not changed.')
  const mascotColorPreferenceVersion = parsed.mascotColorPreferenceVersion
  const settings = { ...parsed }
  if (mascotColorPreferenceVersion !== 2) delete settings.mascotColorPreferenceVersion
  return {
    ...DEFAULT_LEARNER_SETTINGS,
    ...settings,
    dailyGoalMinutes: parsed.dailyGoalMinutes ?? DEFAULT_LEARNER_SETTINGS.dailyGoalMinutes,
    nativeLanguageCode: parsed.nativeLanguageCode ?? DEFAULT_LEARNER_SETTINGS.nativeLanguageCode,
    targetLanguageCode: parsed.targetLanguageCode ?? DEFAULT_LEARNER_SETTINGS.targetLanguageCode,
    tutorName: parsed.tutorName ?? DEFAULT_LEARNER_SETTINGS.tutorName,
    tutorMode: parsed.tutorMode ?? DEFAULT_LEARNER_SETTINGS.tutorMode,
    onboardingComplete: parsed.onboardingComplete ?? DEFAULT_LEARNER_SETTINGS.onboardingComplete,
    displayName: parsed.displayName ?? DEFAULT_LEARNER_SETTINGS.displayName,
    level: parsed.level ?? DEFAULT_LEARNER_SETTINGS.level,
    ageRange: parsed.ageRange ?? DEFAULT_LEARNER_SETTINGS.ageRange,
    progressTimeline: parsed.progressTimeline ?? DEFAULT_LEARNER_SETTINGS.progressTimeline,
    aiTutorComfort: parsed.aiTutorComfort ?? DEFAULT_LEARNER_SETTINGS.aiTutorComfort,
    pronunciationGoal: parsed.pronunciationGoal ?? DEFAULT_LEARNER_SETTINGS.pronunciationGoal,
    learningPlanStyle: parsed.learningPlanStyle ?? DEFAULT_LEARNER_SETTINGS.learningPlanStyle,
    practiceTimeOfDay: parsed.practiceTimeOfDay ?? DEFAULT_LEARNER_SETTINGS.practiceTimeOfDay,
    reminderEnabled: parsed.reminderEnabled ?? DEFAULT_LEARNER_SETTINGS.reminderEnabled,
    liveTranscript: parsed.liveTranscript ?? DEFAULT_LEARNER_SETTINGS.liveTranscript,
    mascotColor: parsed.mascotColor === 'Sapphire' && mascotColorPreferenceVersion !== 2
      ? DEFAULT_LEARNER_SETTINGS.mascotColor
      : parsed.mascotColor ?? DEFAULT_LEARNER_SETTINGS.mascotColor,
    personality: parsed.personality ?? DEFAULT_LEARNER_SETTINGS.personality,
    memory: [...parsed.memory],
  }
}

export function saveLearnerSettings(storage, settings) {
  if (!isLearnerSettings(settings)) throw new Error('Learner settings are invalid or exceed their allowed limits.')
  storage.setItem(SETTINGS_KEY, JSON.stringify({
    transcriptSaving: settings.transcriptSaving,
    liveTranscript: settings.liveTranscript ?? DEFAULT_LEARNER_SETTINGS.liveTranscript,
    mascotColor: settings.mascotColor ?? DEFAULT_LEARNER_SETTINGS.mascotColor,
    mascotColorPreferenceVersion: settings.mascotColorPreferenceVersion === 2 ? 2 : 1,
    personality: settings.personality ?? DEFAULT_LEARNER_SETTINGS.personality,
    goals: settings.goals.trim(),
    interests: settings.interests.trim(),
    memory: settings.memory.map((item) => item.trim()),
    dailyGoalMinutes: settings.dailyGoalMinutes,
    nativeLanguageCode: settings.nativeLanguageCode ?? DEFAULT_LEARNER_SETTINGS.nativeLanguageCode,
    targetLanguageCode: settings.targetLanguageCode ?? DEFAULT_LEARNER_SETTINGS.targetLanguageCode,
    tutorName: settings.tutorName ?? DEFAULT_LEARNER_SETTINGS.tutorName,
    tutorMode: settings.tutorMode ?? DEFAULT_LEARNER_SETTINGS.tutorMode,
    onboardingComplete: settings.onboardingComplete ?? DEFAULT_LEARNER_SETTINGS.onboardingComplete,
    displayName: settings.displayName?.trim() ?? DEFAULT_LEARNER_SETTINGS.displayName,
    level: settings.level ?? DEFAULT_LEARNER_SETTINGS.level,
    ageRange: settings.ageRange ?? DEFAULT_LEARNER_SETTINGS.ageRange,
    progressTimeline: settings.progressTimeline ?? DEFAULT_LEARNER_SETTINGS.progressTimeline,
    aiTutorComfort: settings.aiTutorComfort ?? DEFAULT_LEARNER_SETTINGS.aiTutorComfort,
    pronunciationGoal: settings.pronunciationGoal ?? DEFAULT_LEARNER_SETTINGS.pronunciationGoal,
    learningPlanStyle: settings.learningPlanStyle ?? DEFAULT_LEARNER_SETTINGS.learningPlanStyle,
    practiceTimeOfDay: settings.practiceTimeOfDay ?? DEFAULT_LEARNER_SETTINGS.practiceTimeOfDay,
    reminderEnabled: settings.reminderEnabled ?? DEFAULT_LEARNER_SETTINGS.reminderEnabled,
  }))
}

function isTranscriptMessage(message) {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message.role === 'user' || message.role === 'tutor') &&
    typeof message.text === 'string' &&
    message.text.trim() !== '' &&
    message.text.length <= 1000
  )
}

function isHistorySession(session) {
  return (
    typeof session === 'object' &&
    session !== null &&
    typeof session.id === 'string' &&
    session.id.trim() !== '' &&
    typeof session.updatedAt === 'string' &&
    Number.isFinite(Date.parse(session.updatedAt)) &&
    Array.isArray(session.messages) &&
    session.messages.length > 0 &&
    session.messages.length <= MAX_TRANSCRIPT_MESSAGES &&
    session.messages.every(isTranscriptMessage)
  )
}

export function readTutorHistory(storage) {
  const serialized = storage.getItem(HISTORY_KEY)
  if (serialized === null) return []
  let parsed
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('Saved conversation history is damaged. It was not changed.')
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > MAX_HISTORY_SESSIONS ||
    !parsed.every(isHistorySession) ||
    new Set(parsed.map((session) => session.id)).size !== parsed.length
  ) {
    throw new Error('Saved conversation history is invalid. It was not changed.')
  }
  return parsed.map((session) => ({
    ...session,
    messages: session.messages.map(({ role, text }) => ({ role, text })),
  }))
}

export function saveTutorSession(storage, id, messages, now = new Date()) {
  if (typeof id !== 'string' || id.trim() === '' || !Array.isArray(messages)) {
    throw new Error('A conversation session ID and transcript are required.')
  }
  const transcript = messages
    .filter((message) => message.role === 'user' || message.role === 'tutor')
    .map(({ role, text }) => ({ role, text }))
  if (!transcript.length || transcript.length > MAX_TRANSCRIPT_MESSAGES || !transcript.every(isTranscriptMessage)) {
    throw new Error('The conversation transcript is empty, invalid, or too long to save.')
  }
  const history = readTutorHistory(storage)
  const updated = [...history.filter((session) => session.id !== id), {
    id,
    updatedAt: now.toISOString(),
    messages: transcript,
  }]
    .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
    .slice(0, MAX_HISTORY_SESSIONS)
  storage.setItem(HISTORY_KEY, JSON.stringify(updated))
  return updated
}

export function deleteTutorSession(storage, id) {
  if (typeof id !== 'string' || id.trim() === '') throw new Error('A conversation session ID is required.')
  const history = readTutorHistory(storage)
  const updated = history.filter((session) => session.id !== id)
  storage.setItem(HISTORY_KEY, JSON.stringify(updated))
  return updated
}

export function clearAriData(storage) {
  const keys = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith('ari-')) keys.push(key)
  }
  for (const key of keys) storage.removeItem(key)
}

export const LEARNER_SETTINGS_STORAGE_KEY = SETTINGS_KEY
export const TUTOR_HISTORY_STORAGE_KEY = HISTORY_KEY
