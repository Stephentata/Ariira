import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  advanceLessonSession,
  createLessonSession,
  createMockTutorReply,
  LESSON_STAGES,
  loadLessonSession,
  repeatLessonStage,
  saveLessonSession,
  skipLessonStage,
} from '../src/lesson-session.js'

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('completes the full text lesson using predictable mock tutor replies', () => {
  let session = createLessonSession('zh-a1-u01-l01')
  assert.equal(session.stageIndex, 0)
  assert.equal(LESSON_STAGES.length, 6)

  for (const stage of LESSON_STAGES) {
    assert.equal(LESSON_STAGES[session.stageIndex].id, stage.id)
    if (stage.id === 'warmup' || stage.id === 'roleplay') {
      assert.equal(typeof createMockTutorReply(stage.id, '你好'), 'string')
    }
    session = advanceLessonSession(session)
  }

  assert.equal(session.status, 'completed')
  assert.equal(session.stageIndex, LESSON_STAGES.length - 1)
})

test('can skip and repeat a stage without losing the active session', () => {
  const first = createLessonSession('zh-a1-u01-l01')
  const repeated = repeatLessonStage(first)
  assert.notEqual(repeated, first)
  assert.equal(repeated.stageIndex, 0)

  const skipped = skipLessonStage(repeated)
  assert.equal(skipped.stageIndex, 1)
  assert.deepEqual(skipped.skippedStages, [0])
  assert.equal(skipped.status, 'active')
})

test('saves and resumes an active session at its current stage', () => {
  const storage = createMemoryStorage()
  const expected = {
    ...advanceLessonSession(createLessonSession('zh-a1-u01-l01')),
    exerciseIndex: 2,
  }

  saveLessonSession(storage, expected)

  assert.deepEqual(loadLessonSession(storage, 'zh-a1-u01-l01'), expected)
  assert.equal(loadLessonSession(storage, 'zh-a1-u01-l02'), null)
})

test('upgrades a saved M2 session with no exercise position', () => {
  const storage = createMemoryStorage()
  const oldSession = {
    lessonId: 'zh-a1-u01-l01',
    stageIndex: 2,
    status: 'active',
    skippedStages: [],
  }
  storage.setItem('ari-lesson-session:zh-a1-u01-l01', JSON.stringify(oldSession))

  assert.deepEqual(loadLessonSession(storage, 'zh-a1-u01-l01'), {
    ...oldSession,
    exerciseIndex: 0,
  })
})

test('reports damaged saved progress instead of silently resetting it', () => {
  const storage = createMemoryStorage()
  storage.setItem('ari-lesson-session:zh-a1-u01-l01', '{not valid json')

  assert.throws(
    () => loadLessonSession(storage, 'zh-a1-u01-l01'),
    /Saved lesson progress is damaged/,
  )
})

test('mock tutor requires input and only responds during conversation stages', () => {
  assert.throws(() => createMockTutorReply('warmup', '  '), /Write a response/)
  assert.match(createMockTutorReply('warmup', '你好'), /Thanks for giving that a try/)
  assert.match(createMockTutorReply('roleplay', '你好'), /conversation/)
  assert.throws(() => createMockTutorReply('teach', 'hello'), /does not support/)
  assert.throws(() => createMockTutorReply('practice', 'hello'), /does not support/)
})

test('only an active session can advance or skip', () => {
  const completed = { ...createLessonSession('zh-a1-u01-l01'), status: 'completed' }

  assert.throws(() => advanceLessonSession(completed), /active lesson session/)
  assert.throws(() => skipLessonStage(completed), /active lesson session/)
})
