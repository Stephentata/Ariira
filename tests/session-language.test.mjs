import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSessionLanguage } from '../src/session-language.js'

test('session language validation permits matching profile and lesson languages', () => {
  assert.equal(validateSessionLanguage('fr', 'fr', 'fr'), true)
})

test('session language validation blocks stale profiles and lesson-language mismatches', () => {
  assert.throws(() => validateSessionLanguage('fr', 'zh', 'fr'), /selected learning language/)
  assert.throws(() => validateSessionLanguage('fr', 'fr', 'zh'), /lesson is not written/)
})
