import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getLearningProgressSummary,
  LEARNING_PROGRESS_STORAGE_KEY,
  readLearningProgress,
  recordExerciseAttempt,
  recordLessonCompleted,
  recordPracticeSeconds,
} from '../src/learning-progress.js'

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('records visible practice time by local date and summarizes actual activity', () => {
  const storage = createMemoryStorage()
  const monday = new Date(2026, 0, 5, 12)
  const tuesday = new Date(2026, 0, 6, 12)
  recordPracticeSeconds(storage, 60, monday)
  recordPracticeSeconds(storage, 30, tuesday)

  const summary = getLearningProgressSummary(readLearningProgress(storage), tuesday)
  assert.equal(summary.activitySeconds, 90)
  assert.equal(summary.weekSeconds, 90)
  assert.equal(summary.todaySeconds, 30)
  assert.equal(summary.currentStreak, 2)
  assert.equal(summary.bestStreak, 2)
  assert.deepEqual(summary.week.map((day) => day.seconds).slice(0, 2), [60, 30])
  assert.throws(() => recordPracticeSeconds(storage, 0, tuesday), /between 1 and 300/)
})

test('tracks objective and skill outcomes and gives practice recommendations from recent results', () => {
  const storage = createMemoryStorage()
  for (const correct of [true, true, true]) {
    recordExerciseAttempt(storage, { objectiveId: 'greet-someone', skills: ['reading', 'vocabulary'], correct })
  }
  recordExerciseAttempt(storage, { objectiveId: 'say-goodbye', skills: ['writing'], correct: false })
  recordExerciseAttempt(storage, { objectiveId: 'say-goodbye', skills: ['writing'], correct: false })

  const summary = getLearningProgressSummary(readLearningProgress(storage), new Date(2026, 0, 5))
  assert.deepEqual(summary.objectives, [
    { id: 'greet-someone', correct: 3, attempts: 3, mastery: 100, recommendation: 'ready' },
    { id: 'say-goodbye', correct: 0, attempts: 2, mastery: 0, recommendation: 'revisit' },
  ])
  assert.equal(summary.skills.find((skill) => skill.id === 'reading').mastery, 100)
  assert.equal(summary.skills.find((skill) => skill.id === 'writing').mastery, 0)
  assert.deepEqual(summary.topErrors, [{ id: 'say-goodbye', count: 2 }])
})

test('keeps objective, skill, error, and lesson outcomes separate by language', () => {
  const storage = createMemoryStorage()
  recordExerciseAttempt(storage, {
    objectiveId: 'greet-someone',
    skills: ['reading', 'vocabulary'],
    correct: true,
  })
  recordExerciseAttempt(storage, {
    objectiveId: 'greet-someone',
    skills: ['reading', 'vocabulary'],
    correct: false,
    languageCode: 'fr',
  })
  recordLessonCompleted(storage)
  recordLessonCompleted(storage, 'fr')

  const progress = readLearningProgress(storage)
  const mandarin = getLearningProgressSummary(progress, new Date(2026, 0, 5), 'zh')
  const french = getLearningProgressSummary(progress, new Date(2026, 0, 5), 'fr')

  assert.deepEqual(mandarin.objectives.map(({ id, correct, attempts }) => ({ id, correct, attempts })), [
    { id: 'greet-someone', correct: 1, attempts: 1 },
  ])
  assert.deepEqual(french.objectives.map(({ id, correct, attempts }) => ({ id, correct, attempts })), [
    { id: 'greet-someone', correct: 0, attempts: 1 },
  ])
  assert.equal(mandarin.skills.find(({ id }) => id === 'reading')?.attempts, 1)
  assert.equal(french.skills.find(({ id }) => id === 'reading')?.attempts, 1)
  assert.deepEqual(mandarin.topErrors, [])
  assert.deepEqual(french.topErrors, [{ id: 'greet-someone', count: 1 }])
  assert.equal(mandarin.lessonsCompleted, 1)
  assert.equal(french.lessonsCompleted, 1)
  assert.equal(french.activitySeconds, mandarin.activitySeconds)
})

test('reads existing unpartitioned progress as Mandarin without altering its history', () => {
  const storage = createMemoryStorage()
  const original = {
    activityByDate: {},
    objectives: { 'greet-someone': { correct: 2, incorrect: 0, recent: [true, true] } },
    skills: { reading: { correct: 2, attempts: 2 } },
    errors: {},
    lessonsCompleted: 3,
  }
  storage.setItem(LEARNING_PROGRESS_STORAGE_KEY, JSON.stringify(original))

  const progress = readLearningProgress(storage)
  assert.equal(getLearningProgressSummary(progress, new Date(2026, 0, 5), 'zh').lessonsCompleted, 3)
  assert.deepEqual(getLearningProgressSummary(progress, new Date(2026, 0, 5), 'fr').objectives, [])
  assert.deepEqual(progress.objectives, original.objectives)
  assert.deepEqual(progress.languageProgress, {})
})

test('stores lesson completions and rejects invalid or damaged progress without resetting it', () => {
  const storage = createMemoryStorage()
  recordLessonCompleted(storage)
  assert.equal(getLearningProgressSummary(readLearningProgress(storage)).lessonsCompleted, 1)
  assert.throws(
    () => recordExerciseAttempt(storage, { objectiveId: '', correct: true }),
    /objective ID/,
  )
  storage.setItem(LEARNING_PROGRESS_STORAGE_KEY, '{broken')
  assert.throws(() => readLearningProgress(storage), /damaged/)
  assert.throws(() => recordLessonCompleted(storage), /damaged/)
})

test('rejects invalid language-scoped progress instead of dropping it', () => {
  const storage = createMemoryStorage()
  storage.setItem(LEARNING_PROGRESS_STORAGE_KEY, JSON.stringify({
    activityByDate: {},
    objectives: {},
    skills: {},
    errors: {},
    lessonsCompleted: 0,
    languageProgress: { fr: { objectives: {}, skills: { unknown: { correct: 1, attempts: 1 } }, errors: {}, lessonsCompleted: 0 } },
  }))
  assert.throws(() => readLearningProgress(storage), /invalid/)
})
