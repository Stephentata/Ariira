import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLessonValidator, readLessonFiles } from '../scripts/validate-lessons.mjs'
import {
  checkClosedExerciseAnswer,
  CLOSED_EXERCISE_TYPES,
  createExerciseResponse,
  formatExpectedAnswer,
  isClosedExercise,
  isShortWritingExercise,
} from '../src/exercise-checker.js'

const validateLesson = await createLessonValidator()
const lessons = await readLessonFiles()
const mandarinLesson = lessons.find(({ lesson }) => lesson.id === 'zh-a1-u01-l01')?.lesson
const frenchLesson = lessons.find(({ lesson }) => lesson.id === 'fr-a1-u01-l01')?.lesson
assert.ok(mandarinLesson)
assert.ok(frenchLesson)
const exercises = mandarinLesson.exercises

test('starter lesson provides schema-valid examples of all ten closed exercise types', () => {
  const starterLesson = lessons.find(({ lesson }) => lesson.id === 'zh-a1-u01-l01')?.lesson
  assert.ok(starterLesson)
  assert.equal(validateLesson(starterLesson), true, JSON.stringify(validateLesson.errors))
  assert.deepEqual(
    [...new Set(starterLesson.exercises.filter(isClosedExercise).map(({ type }) => type))].sort(),
    [...CLOSED_EXERCISE_TYPES].sort(),
  )
  assert.ok(starterLesson.exercises.filter(({ type }) => type !== 'short_writing').every(isClosedExercise))
})

test('reading comprehension uses its passage and fixed lesson answer; writing stays self-reviewed', () => {
  const reading = exercises.find(({ type }) => type === 'reading_comprehension')
  const writing = exercises.find(({ type }) => type === 'short_writing')
  assert.ok(reading)
  assert.ok(writing)
  assert.equal(isClosedExercise(reading), true)
  assert.equal(checkClosedExerciseAnswer(reading, '再见'), true)
  assert.equal(checkClosedExerciseAnswer(reading, '你好'), false)
  assert.equal(isClosedExercise({ ...reading, reading_text: '' }), false)
  assert.equal(isShortWritingExercise(writing), true)
  assert.equal(isShortWritingExercise({ ...writing, success_criteria: [] }), false)
})

test('French sample reading and translations use their fixed answer keys', () => {
  const reading = frenchLesson.exercises.find(({ type }) => type === 'reading_comprehension')
  const farewell = frenchLesson.exercises.find(({ type }) => type === 'translate_native_to_target')
  assert.ok(reading)
  assert.ok(farewell)
  assert.equal(checkClosedExerciseAnswer(reading, 'Bonjour'), true)
  assert.equal(checkClosedExerciseAnswer(reading, 'Au revoir'), false)
  assert.equal(checkClosedExerciseAnswer(farewell, 'Au revoir'), true)
  assert.equal(checkClosedExerciseAnswer(farewell, 'Bonjour'), false)
})

test('multiple choice, listening choice, and spot-the-mistake use only the fixed answer key', () => {
  for (const exercise of exercises.filter(({ type }) =>
    ['multiple_choice', 'listen_and_choose', 'spot_mistake'].includes(type),
  )) {
    assert.equal(checkClosedExerciseAnswer(exercise, exercise.answer_key), true, exercise.id)
    assert.equal(checkClosedExerciseAnswer(exercise, exercise.options[0] === exercise.answer_key ? exercise.options[1] : exercise.options[0]), false, exercise.id)
  }

  const multipleChoice = exercises.find(({ type }) => type === 'multiple_choice')
  assert.ok(multipleChoice)
  assert.equal(checkClosedExerciseAnswer(multipleChoice, 'HI'), true)
  assert.throws(() => createExerciseResponse(multipleChoice, 'not an option'), /available options/)
})

test('listening dictation, fill-in, sentence building, and translation accept normalized variants', () => {
  for (const type of ['listen_and_type', 'fill_blank', 'sentence_building', 'translate_native_to_target', 'translate_target_to_native']) {
    const exercise = exercises.find((item) => item.type === type)
    assert.ok(exercise, `Missing ${type} example`)
    assert.equal(checkClosedExerciseAnswer(exercise, exercise.answer_key), true, type)
    if (exercise.accepted_variants.length) {
      assert.equal(checkClosedExerciseAnswer(exercise, exercise.accepted_variants[0]), true, type)
    }
  }

  const dictation = exercises.find(({ type }) => type === 'listen_and_type')
  assert.ok(dictation)
  assert.equal(checkClosedExerciseAnswer(dictation, ' 你好 '), true)
})

test('matching requires every correct pair and rejects incomplete or extra pairs', () => {
  const exercise = exercises.find(({ type }) => type === 'match_pairs')
  assert.ok(exercise)
  assert.equal(checkClosedExerciseAnswer(exercise, exercise.answer_key), true)
  assert.equal(
    checkClosedExerciseAnswer(exercise, { '你好': 'goodbye', '再见': 'hello' }),
    false,
  )
  assert.equal(checkClosedExerciseAnswer(exercise, { '你好': 'hello' }), false)
  assert.equal(
    checkClosedExerciseAnswer(exercise, { ...exercise.answer_key, extra: 'value' }),
    false,
  )
  assert.equal(formatExpectedAnswer(exercise), '你好 → hello · 再见 → goodbye')
  assert.throws(() => createExerciseResponse(exercise, { '你好': 'hello' }), /Connect every word/)
})

test('invalid exercises and empty responses are rejected explicitly', () => {
  assert.equal(isClosedExercise({}), false)
  assert.throws(() => checkClosedExerciseAnswer({}, 'answer'), /invalid or is not/)

  const exercise = exercises.find(({ type }) => type === 'translate_native_to_target')
  assert.ok(exercise)
  assert.throws(() => createExerciseResponse(exercise, '  '), /Enter or build/)
})

test('rejects exercises whose listening prompt or sentence blocks are incomplete', () => {
  const listening = exercises.find(({ type }) => type === 'listen_and_choose')
  const sentence = exercises.find(({ type }) => type === 'sentence_building')
  assert.ok(listening)
  assert.ok(sentence)
  assert.equal(isClosedExercise({ ...listening, listen_text: '' }), false)
  assert.equal(isClosedExercise({ ...sentence, options: ['再', '你好'] }), false)
})

test('schema rejects missing listening text and unsupported answer-key shapes', () => {
  const starterLesson = lessons.find(({ lesson }) => lesson.id === 'zh-a1-u01-l01')?.lesson
  assert.ok(starterLesson)
  const missingListeningText = JSON.parse(JSON.stringify(starterLesson))
  delete missingListeningText.exercises[1].listen_text
  assert.equal(validateLesson(missingListeningText), false)

  const invalidSentenceAnswer = JSON.parse(JSON.stringify(starterLesson))
  const sentenceIndex = invalidSentenceAnswer.exercises.findIndex(({ type }) => type === 'sentence_building')
  assert.notEqual(sentenceIndex, -1)
  invalidSentenceAnswer.exercises[sentenceIndex].answer_key = ['再', '见']
  assert.equal(validateLesson(invalidSentenceAnswer), false)

  const invalidReadingPassage = JSON.parse(JSON.stringify(starterLesson))
  const readingIndex = invalidReadingPassage.exercises.findIndex(({ type }) => type === 'reading_comprehension')
  assert.notEqual(readingIndex, -1)
  delete invalidReadingPassage.exercises[readingIndex].reading_text
  assert.equal(validateLesson(invalidReadingPassage), false)
})

test('choice options must contain a correct answer before an exercise can render', () => {
  const exercise = exercises.find(({ type }) => type === 'multiple_choice')
  assert.ok(exercise)
  assert.equal(
    isClosedExercise({ ...exercise, options: exercise.options.filter((option) => option !== exercise.answer_key) }),
    false,
  )
})
