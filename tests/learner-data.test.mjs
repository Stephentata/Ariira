import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clearAriData,
  deleteTutorSession,
  LEARNER_SETTINGS_STORAGE_KEY,
  readLearnerSettings,
  readTutorHistory,
  saveLearnerSettings,
  saveTutorSession,
  TUTOR_HISTORY_STORAGE_KEY,
} from '../src/learner-data.js'

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    get length() { return values.size },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
  }
}

test('transcript saving defaults off and learner profile settings validate and persist locally', () => {
  const storage = createMemoryStorage()
  assert.deepEqual(readLearnerSettings(storage), {
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
  saveLearnerSettings(storage, { ...readLearnerSettings(storage), targetLanguageCode: 'fr' })
  assert.equal(readLearnerSettings(storage).targetLanguageCode, 'fr')
  saveLearnerSettings(storage, { ...readLearnerSettings(storage), tutorName: 'Ari', tutorMode: 'strict' })
  assert.deepEqual(
    [readLearnerSettings(storage).tutorName, readLearnerSettings(storage).tutorMode],
    ['Ari', 'strict'],
  )

  saveLearnerSettings(storage, {
    transcriptSaving: true,
    goals: 'Order food confidently',
    interests: 'Travel and cooking',
    memory: ['Jamie enjoys tea'],
    dailyGoalMinutes: 30,
    nativeLanguageCode: 'es',
    targetLanguageCode: 'ja',
    tutorName: 'Ira',
    tutorMode: 'balanced',
    onboardingComplete: false,
    displayName: '',
    level: 'A1',
    ageRange: '25–34',
    progressTimeline: '2–3 months',
    aiTutorComfort: 'Curious',
    pronunciationGoal: 'Clear and understandable',
    learningPlanStyle: 'Casual conversation',
    practiceTimeOfDay: 'Evening',
    reminderEnabled: true,
  })
  assert.deepEqual(readLearnerSettings(storage), {
    transcriptSaving: true,
    liveTranscript: true,
    mascotColor: 'Tutor style',
    personality: 'Friendly',
    goals: 'Order food confidently',
    interests: 'Travel and cooking',
    memory: ['Jamie enjoys tea'],
    dailyGoalMinutes: 30,
    nativeLanguageCode: 'es',
    targetLanguageCode: 'ja',
    tutorName: 'Ira',
    tutorMode: 'balanced',
    onboardingComplete: false,
    displayName: '',
    level: 'A1',
    ageRange: '25–34',
    progressTimeline: '2–3 months',
    aiTutorComfort: 'Curious',
    pronunciationGoal: 'Clear and understandable',
    learningPlanStyle: 'Casual conversation',
    practiceTimeOfDay: 'Evening',
    reminderEnabled: true,
  })

  storage.setItem(LEARNER_SETTINGS_STORAGE_KEY, JSON.stringify({
    transcriptSaving: false,
    goals: '',
    interests: '',
    memory: [],
  }))
  assert.deepEqual(
    [readLearnerSettings(storage).dailyGoalMinutes, readLearnerSettings(storage).nativeLanguageCode, readLearnerSettings(storage).targetLanguageCode, readLearnerSettings(storage).tutorName, readLearnerSettings(storage).tutorMode, readLearnerSettings(storage).onboardingComplete],
    [15, 'en', 'zh', 'Ira', 'balanced', false],
  )
  assert.throws(() => saveLearnerSettings(storage, {
    transcriptSaving: false,
    goals: '',
    interests: '',
    memory: [],
    dailyGoalMinutes: 121,
  }), /invalid or exceed/)
  assert.throws(() => saveLearnerSettings(storage, {
    ...readLearnerSettings(storage),
    tutorMode: 'unhelpful',
  }), /invalid or exceed/)
  assert.throws(() => saveLearnerSettings(storage, {
    transcriptSaving: false,
    goals: 'x'.repeat(241),
    interests: '',
    memory: [],
    dailyGoalMinutes: 15,
  }), /invalid or exceed/)
  assert.throws(() => saveLearnerSettings(storage, {
    transcriptSaving: false,
    goals: '',
    interests: '',
    memory: [],
    dailyGoalMinutes: 15,
    nativeLanguageCode: 'invalid',
    targetLanguageCode: 'zh',
  }), /invalid or exceed/)
  const completed = { ...readLearnerSettings(storage), onboardingComplete: true }
  saveLearnerSettings(storage, completed)
  assert.equal(readLearnerSettings(storage).onboardingComplete, true)
})

test('legacy default Sapphire follows tutor style while explicit custom colours remain available', () => {
  const storage = createMemoryStorage({
    [LEARNER_SETTINGS_STORAGE_KEY]: JSON.stringify({
      transcriptSaving: false,
      mascotColor: 'Sapphire',
      mascotColorPreferenceVersion: 1,
      goals: '',
      interests: '',
      memory: [],
    }),
  })
  assert.equal(readLearnerSettings(storage).mascotColor, 'Tutor style')

  for (const mascotColor of ['Sapphire', 'Rose', 'Onyx']) {
    saveLearnerSettings(storage, { ...readLearnerSettings(storage), mascotColor, mascotColorPreferenceVersion: 2 })
    assert.equal(readLearnerSettings(storage).mascotColor, mascotColor)
  }
})

test('saves text-only tutor history by session and permits deleting a single transcript', () => {
  const storage = createMemoryStorage()
  const before = new Date('2026-10-11T08:00:00.000Z')
  const after = new Date('2026-10-11T09:00:00.000Z')
  const original = [
    { id: 1, role: 'tutor', text: 'Welcome' },
    { id: 3, role: 'user', text: '你好' },
    { id: 4, role: 'tutor', text: '你好！', meaning: 'Hello!', audio: 'must not be stored' },
  ]
  saveTutorSession(storage, 'first', original.slice(1), before)
  saveTutorSession(storage, 'second', [{ role: 'user', text: '谢谢' }], after)
  saveTutorSession(storage, 'first', [...original.slice(1), { role: 'user', text: '再见' }], new Date('2026-10-11T10:00:00.000Z'))

  const history = readTutorHistory(storage)
  assert.deepEqual(history.map((session) => session.id), ['first', 'second'])
  assert.deepEqual(history[0].messages, [
    { role: 'user', text: '你好' },
    { role: 'tutor', text: '你好！' },
    { role: 'user', text: '再见' },
  ])
  assert.equal('audio' in history[0].messages[1], false)
  assert.deepEqual(deleteTutorSession(storage, 'first').map((session) => session.id), ['second'])
  assert.deepEqual(readTutorHistory(storage).map((session) => session.id), ['second'])
})

test('rejects damaged learner data and clears only Ari-owned local storage keys', () => {
  const storage = createMemoryStorage({
    [LEARNER_SETTINGS_STORAGE_KEY]: '{bad',
    [TUTOR_HISTORY_STORAGE_KEY]: '[]',
    'ari-review-deck': '[]',
    'third-party-data': 'keep',
  })
  assert.throws(() => readLearnerSettings(storage), /damaged/)

  clearAriData(storage)
  assert.equal(storage.getItem(LEARNER_SETTINGS_STORAGE_KEY), null)
  assert.equal(storage.getItem(TUTOR_HISTORY_STORAGE_KEY), null)
  assert.equal(storage.getItem('ari-review-deck'), null)
  assert.equal(storage.getItem('third-party-data'), 'keep')
})
