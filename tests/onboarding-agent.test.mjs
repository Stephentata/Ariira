import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildOnboardingMessages,
  requestOnboardingReply,
  validateOnboardingReply,
} from '../src/onboarding-agent.js'

const languages = { nativeLanguage: 'English', targetLanguage: 'Mandarin Chinese' }

test('onboarding agent receives language context and follows a privacy-conscious intake prompt', () => {
  const messages = buildOnboardingMessages([
    { role: 'assistant', content: 'What would you like to do in Mandarin?' },
    { role: 'user', content: 'Order food while travelling.' },
  ], languages)

  assert.match(messages[0].content, /Do not assign or infer a CEFR level/)
  assert.match(messages[0].content, /Do not ask for sensitive personal information/)
  assert.match(messages[0].content, /English.*Mandarin Chinese/)
  assert.equal(messages[2].content, 'Order food while travelling.')
})

test('onboarding agent bounds conversation history and validates message input', () => {
  assert.throws(() => buildOnboardingMessages([], languages), /empty or too long/)
  assert.throws(() => buildOnboardingMessages([{ role: 'user', content: '  ' }], languages), /invalid message/)
  assert.throws(() => buildOnboardingMessages([{ role: 'user', content: 'hello' }], {}), /Choose your languages/)
  assert.throws(() => buildOnboardingMessages(
    Array.from({ length: 17 }, (_, index) => ({ role: index % 2 ? 'user' : 'assistant', content: 'hello' })),
    languages,
  ), /empty or too long/)
})

test('onboarding agent validates the local model reply and propagates provider errors', async () => {
  assert.equal(validateOnboardingReply({ reply: '  What would you like to practise?  ' }), 'What would you like to practise?')
  assert.throws(() => validateOnboardingReply({ reply: '' }), /invalid onboarding reply/)
  assert.throws(() => validateOnboardingReply({ reply: 'x'.repeat(361) }), /invalid onboarding reply/)
  assert.throws(() => validateOnboardingReply({ reply: 'Hi', level: 'A1' }), /invalid onboarding reply/)

  const result = await requestOnboardingReply(
    [{ role: 'user', content: 'I want to order food.' }],
    languages,
    { chat: async (_messages, schema) => {
      assert.equal(schema.required[0], 'reply')
      return { reply: 'That sounds useful. What food do you enjoy?' }
    } },
  )
  assert.equal(result, 'That sounds useful. What food do you enjoy?')
  await assert.rejects(
    requestOnboardingReply([{ role: 'user', content: 'Hello' }], languages, {
      chat: async () => { throw new Error('local model unavailable') },
    }),
    /local model unavailable/,
  )
})
