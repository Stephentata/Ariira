import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLessonValidator, readLessonFiles } from '../scripts/validate-lessons.mjs'

const validateLesson = await createLessonValidator()

test('all starter lessons match the lesson schema and remain marked unreviewed', async () => {
  const lessons = await readLessonFiles()
  assert.equal(lessons.length, 4)

  for (const { fileName, lesson } of lessons) {
    assert.equal(validateLesson(lesson), true, `${fileName}: ${JSON.stringify(validateLesson.errors)}`)
    assert.equal(lesson.reviewed, false)
    assert.equal(lesson.native_language, 'en')
    assert.ok(['fr', 'zh'].includes(lesson.language))
  }
  assert.equal(lessons.filter(({ lesson }) => lesson.language === 'zh').length, 3)
  assert.equal(lessons.filter(({ lesson }) => lesson.language === 'fr').length, 1)
})

test('French preview has fixed-answer exercises and remains unreviewed', async () => {
  const lessons = await readLessonFiles()
  const french = lessons.find(({ lesson }) => lesson.id === 'fr-a1-u01-l01')?.lesson

  assert.ok(french)
  assert.equal(validateLesson(french), true, JSON.stringify(validateLesson.errors))
  assert.equal(french.reviewed, false)
  assert.equal(french.language, 'fr')
  assert.ok(french.exercises.some(({ type }) => type === 'reading_comprehension'))
  assert.ok(french.exercises.some(({ type }) => type === 'short_writing'))
  assert.ok(french.exercises.every(({ objective_id }) => french.objectives.includes(objective_id)))
})

test('rejects an unsupported CEFR level', async () => {
  const [{ lesson }] = await readLessonFiles()
  const invalidLesson = { ...lesson, level: 'C2' }

  assert.equal(validateLesson(invalidLesson), false)
  assert.ok(validateLesson.errors?.some((issue) => issue.instancePath === '/level'))
})

test('rejects a vocabulary item missing its reviewed translation field', async () => {
  const [{ lesson }] = await readLessonFiles()
  const invalidLesson = {
    ...lesson,
    vocabulary: [{ ...lesson.vocabulary[0] }],
  }
  delete invalidLesson.vocabulary[0].translation_en

  assert.equal(validateLesson(invalidLesson), false)
  assert.ok(validateLesson.errors?.some((issue) => issue.instancePath === '/vocabulary/0'))
})

test('requires reviewer details before a lesson can be marked reviewed', async () => {
  const [{ lesson }] = await readLessonFiles()
  const invalidLesson = { ...lesson, reviewed: true }

  assert.equal(validateLesson(invalidLesson), false)
  assert.ok(validateLesson.errors?.some((issue) => issue.message?.includes('reviewed_by')))
})
