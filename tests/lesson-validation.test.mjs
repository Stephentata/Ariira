import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLessonValidator, readLessonFiles } from '../scripts/validate-lessons.mjs'

const validateLesson = await createLessonValidator()

test('all starter lessons match the lesson schema and remain marked unreviewed', async () => {
  const lessons = await readLessonFiles()
  assert.equal(lessons.length, 3)

  for (const { fileName, lesson } of lessons) {
    assert.equal(validateLesson(lesson), true, `${fileName}: ${JSON.stringify(validateLesson.errors)}`)
    assert.equal(lesson.reviewed, false)
    assert.equal(lesson.native_language, 'en')
    assert.equal(lesson.language, 'zh')
  }
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
