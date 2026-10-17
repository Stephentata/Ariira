import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluatePlacementCheck, PLACEMENT_QUESTIONS } from '../src/placement-check.js'

test('placement check gives transparent practice suggestions for its six sample items', () => {
  assert.equal(PLACEMENT_QUESTIONS.length, 6)
  const incorrectAnswers = PLACEMENT_QUESTIONS.map((question) => question.options.find((option) => option !== question.answer))
  assert.match(evaluatePlacementCheck(incorrectAnswers).recommendation, /introductory/)
  assert.match(evaluatePlacementCheck(PLACEMENT_QUESTIONS.map((question, index) => index < 2 ? question.answer : incorrectAnswers[index])).recommendation, /introductory/)
  assert.match(evaluatePlacementCheck(PLACEMENT_QUESTIONS.map((question, index) => index < 4 ? question.answer : incorrectAnswers[index])).recommendation, /Review/)
  assert.match(evaluatePlacementCheck(PLACEMENT_QUESTIONS.map((question) => question.answer)).recommendation, /A1 lessons/)
})

test('placement check rejects incomplete and non-string responses', () => {
  assert.throws(() => evaluatePlacementCheck(['Hello']), /Answer every/)
  assert.throws(() => evaluatePlacementCheck([1, 2, 3, 4, 5, 6]), /selected from/)
  assert.throws(() => evaluatePlacementCheck(['Hello', 'Goodbye', 'wrong', '', '', '']), /match one of the choices/)
})
