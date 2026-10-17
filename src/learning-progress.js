const STORAGE_KEY = 'ari-learning-progress'
const MAX_ACTIVITY_DAYS = 90
const MAX_ATTEMPTS_PER_OBJECTIVE = 20
const SKILLS = Object.freeze(['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar'])

function createEmptyProgress() {
  return {
    activityByDate: {},
    objectives: {},
    skills: {},
    errors: {},
    lessonsCompleted: 0,
    languageProgress: {},
  }
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0
}

function isOutcomeProgress(value) {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) &&
    typeof value.objectives === 'object' && value.objectives !== null && !Array.isArray(value.objectives) &&
    typeof value.skills === 'object' && value.skills !== null && !Array.isArray(value.skills) &&
    typeof value.errors === 'object' && value.errors !== null && !Array.isArray(value.errors) &&
    isCount(value.lessonsCompleted) &&
    Object.entries(value.objectives).every(([id, objective]) =>
      id.trim() !== '' &&
      typeof objective === 'object' && objective !== null &&
      isCount(objective.correct) && isCount(objective.incorrect) &&
      Array.isArray(objective.recent) && objective.recent.length <= MAX_ATTEMPTS_PER_OBJECTIVE &&
      objective.recent.length <= objective.correct + objective.incorrect &&
      objective.recent.every((result) => typeof result === 'boolean'),
    ) &&
    Object.entries(value.skills).every(([id, skill]) =>
      SKILLS.includes(id) &&
      typeof skill === 'object' && skill !== null &&
      isCount(skill.correct) && isCount(skill.attempts) && skill.correct <= skill.attempts,
    ) &&
    Object.entries(value.errors).every(([id, count]) => id.trim() !== '' && isCount(count))
  )
}

function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isProgress(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value
  if (
    typeof record.activityByDate !== 'object' || record.activityByDate === null || Array.isArray(record.activityByDate) ||
    typeof record.objectives !== 'object' || record.objectives === null || Array.isArray(record.objectives) ||
    typeof record.skills !== 'object' || record.skills === null || Array.isArray(record.skills) ||
    typeof record.errors !== 'object' || record.errors === null || Array.isArray(record.errors) ||
    !isCount(record.lessonsCompleted) ||
    (record.languageProgress !== undefined &&
      (typeof record.languageProgress !== 'object' || record.languageProgress === null || Array.isArray(record.languageProgress)))
  ) return false

  return (
    Object.entries(record.activityByDate).every(([date, seconds]) =>
      isDateKey(date) && isCount(seconds),
    ) &&
    isOutcomeProgress({
      objectives: record.objectives,
      skills: record.skills,
      errors: record.errors,
      lessonsCompleted: record.lessonsCompleted,
    }) &&
    Object.entries(record.languageProgress ?? {}).every(([languageCode, languageProgress]) =>
      /^[a-z]{2,3}$/.test(languageCode) && isOutcomeProgress(languageProgress),
    )
  )
}

export function readLearningProgress(storage) {
  const serialized = storage.getItem(STORAGE_KEY)
  if (serialized === null) return createEmptyProgress()

  let parsed
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('Saved learning progress is damaged. It was not changed.')
  }
  if (!isProgress(parsed)) throw new Error('Saved learning progress is invalid. It was not changed.')
  return { ...parsed, languageProgress: parsed.languageProgress ?? {} }
}

function writeProgress(storage, progress) {
  storage.setItem(STORAGE_KEY, JSON.stringify(progress))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('ari-progress-updated'))
}

function localDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function recordPracticeSeconds(storage, seconds, now = new Date()) {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) {
    throw new Error('Practice time must be between 1 and 300 seconds.')
  }
  const progress = readLearningProgress(storage)
  const date = localDateKey(now)
  progress.activityByDate[date] = (progress.activityByDate[date] ?? 0) + seconds
  const oldestDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - MAX_ACTIVITY_DAYS)
  const oldestKey = localDateKey(oldestDate)
  for (const recordedDate of Object.keys(progress.activityByDate)) {
    if (recordedDate < oldestKey) delete progress.activityByDate[recordedDate]
  }
  writeProgress(storage, progress)
  return progress
}

function getLanguageOutcomeProgress(progress, languageCode) {
  if (typeof languageCode !== 'string' || !/^[a-z]{2,3}$/.test(languageCode)) {
    throw new Error('A valid language code is required to record learning outcomes.')
  }
  if (languageCode === 'zh') return progress
  progress.languageProgress[languageCode] ??= {
    objectives: {},
    skills: {},
    errors: {},
    lessonsCompleted: 0,
  }
  return progress.languageProgress[languageCode]
}

export function recordExerciseAttempt(storage, { objectiveId, skills = [], correct, languageCode = 'zh' }) {
  if (typeof objectiveId !== 'string' || objectiveId.trim() === '' || typeof correct !== 'boolean') {
    throw new Error('An exercise attempt needs an objective ID and a correctness result.')
  }
  if (!Array.isArray(skills) || !skills.every((skill) => SKILLS.includes(skill))) {
    throw new Error('Exercise skills must be recognized learning-skill names.')
  }

  const progress = readLearningProgress(storage)
  const languageProgress = getLanguageOutcomeProgress(progress, languageCode)
  const objective = languageProgress.objectives[objectiveId] ?? { correct: 0, incorrect: 0, recent: [] }
  objective[correct ? 'correct' : 'incorrect'] += 1
  objective.recent = [...objective.recent, correct].slice(-MAX_ATTEMPTS_PER_OBJECTIVE)
  languageProgress.objectives[objectiveId] = objective

  for (const skillName of skills) {
    const skill = languageProgress.skills[skillName] ?? { correct: 0, attempts: 0 }
    skill.attempts += 1
    if (correct) skill.correct += 1
    languageProgress.skills[skillName] = skill
  }
  if (!correct) {
    const category = objectiveId
    languageProgress.errors[category] = (languageProgress.errors[category] ?? 0) + 1
  }

  writeProgress(storage, progress)
  return progress
}

export function recordLessonCompleted(storage, languageCode = 'zh') {
  const progress = readLearningProgress(storage)
  const languageProgress = getLanguageOutcomeProgress(progress, languageCode)
  languageProgress.lessonsCompleted += 1
  writeProgress(storage, progress)
  return progress
}

export function getLearningProgressSummary(progress, now = new Date(), languageCode = 'zh') {
  if (!isProgress(progress)) throw new Error('Cannot summarize invalid learning progress.')
  const outcomes = languageCode === 'zh'
    ? progress
    : progress.languageProgress?.[languageCode] ?? {
      objectives: {},
      skills: {},
      errors: {},
      lessonsCompleted: 0,
    }

  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayOfWeek = (weekStart.getDay() + 6) % 7
  weekStart.setDate(weekStart.getDate() - dayOfWeek)
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + index)
    const key = localDateKey(date)
    return { key, label: date.toLocaleDateString('en', { weekday: 'short' }).slice(0, 1), seconds: progress.activityByDate[key] ?? 0 }
  })
  const objectiveEntries = Object.entries(outcomes.objectives).map(([id, objective]) => ({
    id,
    correct: objective.correct,
    attempts: objective.correct + objective.incorrect,
    mastery: objective.correct + objective.incorrect === 0
      ? 0
      : Math.round(objective.correct / (objective.correct + objective.incorrect) * 100),
    recommendation: objective.recent.length >= 3 && objective.recent.slice(-3).every(Boolean)
      ? 'ready'
      : objective.recent.filter((result) => !result).length >= 2
        ? 'revisit'
        : 'building',
  }))
  const skillEntries = SKILLS.map((id) => {
    const skill = outcomes.skills[id] ?? { correct: 0, attempts: 0 }
    return { id, correct: skill.correct, attempts: skill.attempts, mastery: skill.attempts ? Math.round(skill.correct / skill.attempts * 100) : 0 }
  })
  const activitySeconds = Object.values(progress.activityByDate).reduce((total, seconds) => total + seconds, 0)
  const weekSeconds = week.reduce((total, day) => total + day.seconds, 0)
  const todaySeconds = progress.activityByDate[localDateKey(now)] ?? 0
  const activeDates = Object.keys(progress.activityByDate).filter((date) => progress.activityByDate[date] > 0).sort()
  let currentStreak = 0
  const today = localDateKey(now)
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const yesterday = localDateKey(yesterdayDate)
  let streakDate = activeDates.includes(today) ? now : activeDates.includes(yesterday) ? yesterdayDate : null
  while (streakDate && progress.activityByDate[localDateKey(streakDate)] > 0) {
    currentStreak += 1
    streakDate = new Date(streakDate.getFullYear(), streakDate.getMonth(), streakDate.getDate() - 1)
  }
  let bestStreak = 0
  let runningStreak = 0
  let previousDate = null
  for (const date of activeDates) {
    const currentDate = new Date(`${date}T00:00:00`)
    const consecutive = previousDate !== null &&
      currentDate.getTime() - previousDate.getTime() === 24 * 60 * 60 * 1000
    runningStreak = consecutive ? runningStreak + 1 : 1
    bestStreak = Math.max(bestStreak, runningStreak)
    previousDate = currentDate
  }

  return {
    week,
    activitySeconds,
    weekSeconds,
    todaySeconds,
    currentStreak,
    bestStreak,
    lessonsCompleted: outcomes.lessonsCompleted,
    objectives: objectiveEntries,
    skills: skillEntries,
    topErrors: Object.entries(outcomes.errors)
      .map(([id, count]) => ({ id, count }))
      .sort((first, second) => second.count - first.count)
      .slice(0, 3),
  }
}

export const LEARNING_PROGRESS_STORAGE_KEY = STORAGE_KEY
