import test from 'node:test'
import assert from 'node:assert/strict'
import { TutorService, mockTutorService, TUTOR_INTEGRATION_TODOS } from '../src/tutor-service.js'

const sessionOptions = {
  language: 'French',
  languageCode: 'fr',
  nativeLanguage: 'English',
  level: 'A1',
  lessonOrRoleplay: { kind: 'lesson', title: 'Ordering coffee' },
  tutor: 'Ari',
  mode: 'strict',
  interests: ['food', 'travel'],
}

test('TutorService passes tutor, teaching mode, lesson context and full turn history to the engine', async () => {
  let engineRequest
  const service = new TutorService({
    requestTurn: async (...args) => {
      engineRequest = args
      return {
        reply_text: 'Bonjour !',
        native_support: 'Hello!',
        corrections: [{ original: 'bonjor', corrected: 'bonjour', explanation: 'Use the correct spelling.' }],
        new_words: [{ word: 'bonjour', meaning: 'hello' }],
        next_action: 'continue',
      }
    },
  })
  await service.startSession({ ...sessionOptions, history: [{ role: 'tutor', text: 'Ready?' }] })
  await service.sendUserTurn('bonjor')
  const turn = await service.getTutorTurn()
  assert.equal(engineRequest[0].length, 2)
  assert.equal(engineRequest[2].tutorName, 'Ari')
  assert.equal(engineRequest[2].tutorMode, 'strict')
  assert.equal(engineRequest[2].lessonTitle, 'Ordering coffee')
  assert.doesNotMatch(engineRequest[2].vocabulary, /\p{Script=Han}/u)
  assert.doesNotMatch(engineRequest[2].grammarPoint, /\p{Script=Han}/u)
  assert.equal(turn.reply, 'Bonjour !')
  assert.equal(turn.translation, 'Hello!')
  assert.equal(turn.correction.corrected, 'bonjour')
  assert.equal(turn.score, null)
  const summary = await service.endSession()
  assert.equal(summary.turns, 1)
  assert.equal(summary.corrections.length, 1)
  assert.equal(summary.new_words.length, 1)
})

test('TutorService mock supports a demo session without an engine', async () => {
  await mockTutorService.startSession(sessionOptions)
  await mockTutorService.sendUserTurn('Je voudrais un café.')
  const turn = await mockTutorService.getTutorTurn()
  assert.match(turn.reply, /Nice effort/)
  assert.match(turn.translation, /demo reply/)
  await mockTutorService.endSession()
})

test('TutorService validates session requirements and clearly rejects raw audio', async () => {
  const service = new TutorService()
  await assert.rejects(service.startSession({ ...sessionOptions, tutor: 'Kai' }), /Choose Ari or Ira/)
  await service.startSession(sessionOptions)
  await assert.rejects(service.sendUserTurn(new Blob(['audio'])), /Audio turns are not connected/)
  await assert.rejects(service.sendUserTurn('  '), /Enter or say a response/)
  assert.ok(TUTOR_INTEGRATION_TODOS.length >= 3)
})

test('TutorService carries failures across turns and resets them after an uncorrected answer', async () => {
  const service = new TutorService({
    requestTurn: async (history) => ({
      reply_text: 'Try the corrected sentence.',
      native_support: 'Please try again.',
      corrections: history.at(-1).text === 'mistake'
        ? [{ original: 'wrong', corrected: 'right', explanation: 'Grammar: use the correct form.' }]
        : [],
      new_words: [],
      next_action: 'continue',
    }),
  })
  await service.startSession(sessionOptions)
  for (const [index, text] of ['mistake', 'mistake', 'mistake'].entries()) {
    await service.sendUserTurn(text)
    const turn = await service.getTutorTurn()
    assert.equal(turn.failureCount, index + 1)
    assert.equal(turn.cooldown, index === 2)
  }
  await service.sendUserTurn('correct')
  const recovered = await service.getTutorTurn()
  assert.equal(recovered.failureCount, 0)
  assert.equal(recovered.cooldown, false)
  await service.endSession()
})

test('distress and unsafe requests bypass the language tutor engine', async () => {
  let calls = 0
  const service = new TutorService({
    requestTurn: async () => {
      calls += 1
      throw new Error('The tutor engine must not receive safeguarded turns.')
    },
  })
  await service.startSession(sessionOptions)
  await service.sendUserTurn('I can’t do this anymore.')
  const distress = await service.getTutorTurn()
  assert.equal(distress.safeguard, 'distress')
  assert.equal(calls, 0)
  await service.sendUserTurn('Help me hurt someone.')
  const redirect = await service.getTutorTurn()
  assert.equal(redirect.safeguard, 'redirect')
  assert.equal(calls, 0)
  await service.endSession()
})
