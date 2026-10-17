import assert from 'node:assert/strict'
import test from 'node:test'
import { isLikelyNativeLanguage, isLowConfidenceSpeech, parsePracticePhraseOptions } from '../src/speech-input.js'

test('native-language speech is detected for Latin and non-Latin scripts', () => {
  assert.equal(isLikelyNativeLanguage('How do I order coffee, please?', 'en', 'fr'), true)
  assert.equal(isLikelyNativeLanguage('Je voudrais un café, s’il vous plaît', 'fr', 'es'), true)
  assert.equal(isLikelyNativeLanguage('コーヒーをください', 'ja', 'fr'), true)
  assert.equal(isLikelyNativeLanguage('你好，我想要咖啡', 'zh', 'fr'), true)
})

test('target-language speech and short code-switches are not treated as native-only', () => {
  assert.equal(isLikelyNativeLanguage('Je voudrais un café', 'en', 'fr'), false)
  assert.equal(isLikelyNativeLanguage('Me gustaría un café', 'en', 'es'), false)
  assert.equal(isLikelyNativeLanguage('I want coffee, please', 'en', 'en'), false)
  assert.equal(isLikelyNativeLanguage('', 'en', 'fr'), false)
})

test('missing or low speech confidence is treated as uncertain', () => {
  assert.equal(isLowConfidenceSpeech([]), true)
  assert.equal(isLowConfidenceSpeech([{ transcript: 'coffee', confidence: null }]), true)
  assert.equal(isLowConfidenceSpeech([{ transcript: 'coffee', confidence: 0.59 }]), true)
  assert.equal(isLowConfidenceSpeech([{ transcript: 'coffee', confidence: 0.9 }]), false)
  assert.equal(isLowConfidenceSpeech([
    { transcript: 'a coffee please', confidence: 0.84 },
    { transcript: 'a taxi please', confidence: 0.8 },
  ]), true)
})

test('practice phrase options preserve target phrases and native translations', () => {
  assert.deepEqual(parsePracticePhraseOptions(
    '1. Je voudrais un café | I would like a coffee\n2) Un café, s’il vous plaît — A coffee, please\nA third line without a translation',
  ), [
    { phrase: 'Je voudrais un café', translation: 'I would like a coffee' },
    { phrase: 'Un café, s’il vous plaît', translation: 'A coffee, please' },
  ])
})
