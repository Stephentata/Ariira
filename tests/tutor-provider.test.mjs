import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildTutorSystemPrompt,
  buildTutorMessages,
  countTutorSentences,
  defaultTutorProfile,
  getLanguageRatio,
  getTutorResponseLanguageRatio,
  getTargetLanguageRatio,
  OllamaLLMProvider,
  requestStructuredTutorReply,
  tutorResponseSchema,
  validateTutorResponse,
} from '../src/tutor-provider.js'

const validReply = {
  reply_text: '你好。你呢？',
  native_support: 'Nice!',
  corrections: [{ original: '我想咖啡', corrected: '我想要咖啡', explanation: 'Add 要 after 想 for a natural request.' }],
  new_words: [{ word: '要', meaning: 'to want; to need' }],
  next_action: 'continue',
}

test('builds the Section 10 tutor prompt with level-based language ratios', () => {
  assert.equal(getTargetLanguageRatio('A0'), 0.2)
  assert.equal(getTargetLanguageRatio('A1'), 0.4)
  assert.equal(getTargetLanguageRatio('A2'), 0.6)
  assert.equal(getTargetLanguageRatio('B1'), 0.8)
  assert.equal(getTargetLanguageRatio('B2'), 0.95)
  assert.equal(getTargetLanguageRatio('C1'), 0.98)
  assert.equal(getTargetLanguageRatio('C2'), 0.99)
  assert.throws(() => getTargetLanguageRatio('unknown'), /Unsupported CEFR level/)

  const prompt = buildTutorSystemPrompt()
  assert.match(prompt, /You are Ira/)
  assert.match(prompt, /Personality: bright and curious/)
  assert.match(prompt, /about 40 percent Mandarin Chinese/)
  assert.match(prompt, /Limit corrections to two per reply/)
  assert.match(prompt, /Never claim to be human/)
})

test('roleplay tutor prompts stay in the scenario and leave reflection and scoring to the learner', () => {
  const prompt = buildTutorSystemPrompt({
    ...defaultTutorProfile,
    lessonTitle: 'Introduce yourself',
    roleplay: {
      title: 'Introduce yourself',
      goal: 'Say your name and ask another person’s name.',
      successCriteria: ['Say your name using 我叫', 'Ask the other person’s name'],
    },
  })
  assert.match(prompt, /Stay in character as the other person/)
  assert.match(prompt, /ask one simple question at a time/i)
  assert.match(prompt, /do not assign a score/)
  assert.match(buildTutorSystemPrompt(), /Never treat generated corrections/)
  assert.doesNotMatch(buildTutorSystemPrompt(), /Stay in character/)
})

test('free chat stays learner-led without forcing a lesson or roleplay', () => {
  const prompt = buildTutorSystemPrompt({ ...defaultTutorProfile, freeChat: true })
  assert.match(prompt, /free conversation/i)
  assert.match(prompt, /Let the learner choose a safe everyday topic/)
  assert.match(prompt, /one simple follow-up question at a time/)
  assert.doesNotMatch(prompt, /Stay in character as the other person/)
})

test('tutor mode changes the tutor coaching instructions', () => {
  assert.match(buildTutorSystemPrompt({ ...defaultTutorProfile, tutorName: 'Ari' }), /You are Ari, a friendly male.*Personality: calm and witty/s)
  assert.match(buildTutorSystemPrompt({ ...defaultTutorProfile, tutorMode: 'soft' }), /Tutor style: Soft.*correct at most one/s)
  assert.match(buildTutorSystemPrompt({ ...defaultTutorProfile, tutorMode: 'balanced' }), /Tutor style: Balanced.*hint after one unsuccessful attempt/s)
  assert.match(buildTutorSystemPrompt({ ...defaultTutorProfile, tutorMode: 'strict' }), /Tutor style: Strict.*hint after two attempts.*Never be rude/s)
})

test('opening phases permit their greeting and lesson models within short limits', () => {
  const prompt = buildTutorSystemPrompt({ ...defaultTutorProfile, openingPhase: 'welcome' })
  assert.match(prompt, /welcome.*no more than six short sentences/i)
  assert.match(buildTutorSystemPrompt({ ...defaultTutorProfile, openingPhase: 'teaching' }), /immediate teaching step.*no more than six short sentences/i)
  const opening = {
    ...validReply,
    reply_text: 'Bonjour Stephen. Je suis Ira. Nous allons apprendre à commander un café. Comment allez-vous ?',
  }
  assert.throws(() => validateTutorResponse(opening, 'A0', 'fr'), /too long/)
  assert.equal(validateTutorResponse(opening, 'A0', 'fr', 4).reply_text, opening.reply_text)
})

test('French tutor prompt avoids an invalid script-ratio claim and accepts French output', () => {
  const frenchProfile = {
    ...defaultTutorProfile,
    targetLanguage: 'French',
    targetLanguageCode: 'fr',
    freeChat: true,
  }
  const prompt = buildTutorSystemPrompt(frenchProfile)
  assert.match(prompt, /script-based language-ratio check is not configured for French/)
  assert.match(prompt, /Keep the conversation in French/)
  assert.doesNotMatch(prompt, /about 40 percent French/)
  const spanishProfile = { ...defaultTutorProfile, targetLanguage: 'Spanish', targetLanguageCode: 'es' }
  assert.match(buildTutorSystemPrompt(spanishProfile), /script-based language-ratio check is not configured for Spanish/)
  const frenchReply = {
    ...validReply,
    reply_text: 'Très bien ! Qu’aimeriez-vous faire aujourd’hui ?',
    native_support: 'Very good! What would you like to do today?',
  }
  assert.equal(validateTutorResponse(frenchReply, 'A1', 'fr').reply_text, frenchReply.reply_text)
  assert.equal(validateTutorResponse({
    ...validReply,
    reply_text: 'Hola, ¿cómo estás? Me gusta aprender idiomas.',
    native_support: 'Hello, how are you?',
  }, 'A1', 'es').reply_text, 'Hola, ¿cómo estás? Me gusta aprender idiomas.')
  assert.throws(() => validateTutorResponse({ ...frenchReply, reply_text: 'Très bien. Tell me what you want.' }, 'A1', 'zh'), /language-ratio check/)
})

test('measures Mandarin ratio and sentence count for tutor replies', () => {
  assert.equal(getLanguageRatio('你好！Hi.'), 0.5)
  assert.equal(getTutorResponseLanguageRatio(validReply), 0.5)
  assert.equal(countTutorSentences('你好。I like coffee. 你呢？'), 3)
})

test('validates structured corrections, new words, and schema-conforming whiteboard cards', () => {
  const result = validateTutorResponse({
    ...validReply,
    whiteboard_card: {
      id: 'coffee-vocab',
      type: 'vocab_card',
      title: 'Coffee',
      word: '咖啡',
      transliteration: 'kāfēi',
      translation: 'coffee',
      example_sentence: '我想要咖啡。',
    },
  })

  assert.equal(result.corrections[0].corrected, '我想要咖啡')
  assert.equal(result.new_words[0].word, '要')
  assert.equal(result.whiteboard_card.type, 'vocab_card')
  assert.equal(tutorResponseSchema.required.includes('corrections'), true)
})

test('rejects malformed, overlong, unsafe, and wrong-ratio tutor output', () => {
  assert.throws(() => validateTutorResponse({ ...validReply, unexpected: 'value' }), /invalid reply/)
  assert.throws(() => validateTutorResponse({ ...validReply, corrections: [{ ...validReply.corrections[0] }, { ...validReply.corrections[0] }, { ...validReply.corrections[0] }] }), /invalid reply/)
  assert.throws(() => validateTutorResponse({ ...validReply, reply_text: '你好。谢谢。', native_support: 'Hi.' }), /language-ratio check/)
  assert.throws(() => validateTutorResponse({ ...validReply, reply_text: '你好。I can help with a weapon. 你呢？' }), /safe-topic check/)
  assert.throws(() => validateTutorResponse({ ...validReply, reply_text: '你好。I like coffee. 我想喝水。那你呢？再见。' }), /too long/)
  assert.throws(() => validateTutorResponse({ ...validReply, whiteboard_card: { type: 'vocab_card', title: 'Bad card' } }), /invalid reply/)
})

test('Ollama provider sends structured non-streaming chat and reports success latency', async () => {
  let request
  const events = []
  const provider = new OllamaLLMProvider({
    endpoint: 'http://127.0.0.1:11434/api/chat',
    model: 'test-model',
    logger: {
      info: (...args) => events.push(args),
      error: (...args) => events.push(args),
    },
    fetcher: async (url, options) => {
      request = { url, options }
      return new Response(JSON.stringify({ message: { content: JSON.stringify(validReply) } }), { status: 200 })
    },
  })

  const result = await provider.chat([{ role: 'user', content: 'I want coffee.' }], tutorResponseSchema)
  const body = JSON.parse(request.options.body)
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat')
  assert.equal(body.model, 'test-model')
  assert.equal(body.stream, false)
  assert.deepEqual(body.format, tutorResponseSchema)
  assert.deepEqual(result, validReply)
  assert.equal(events[0][0], '[LLMProvider] Tutor chat completed')
  assert.equal(events[0][1].model, 'test-model')
  assert.equal(typeof events[0][1].latencyMs, 'number')
})

test('Ollama provider explicitly logs and throws HTTP and invalid-JSON errors', async () => {
  const events = []
  const errorLogger = {
    info() {},
    error: (...args) => events.push(args),
  }
  const failingProvider = new OllamaLLMProvider({
    logger: errorLogger,
    fetcher: async () => new Response(JSON.stringify({ error: 'Workers AI is not configured.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }),
  })
  await assert.rejects(
    () => failingProvider.chat([], tutorResponseSchema),
    /Tutor service returned 503: Workers AI is not configured\./,
  )

  const invalidJsonProvider = new OllamaLLMProvider({
    logger: errorLogger,
    fetcher: async () => new Response(JSON.stringify({ message: { content: '{bad json' } }), { status: 200 }),
  })
  await assert.rejects(() => invalidJsonProvider.chat([], tutorResponseSchema), /did not return valid structured data/)
  assert.equal(events.length, 2)
  assert.equal(events[0][0], '[LLMProvider] Tutor chat failed')
})

test('bounds sent history and returns a safe redirect without calling the model', async () => {
  const captured = []
  const provider = {
    chat: async (messages) => {
      captured.push(messages)
      return validReply
    },
  }
  const history = Array.from({ length: 25 }, (_, index) => ({
    role: index % 2 === 0 ? 'tutor' : 'user',
    text: `turn ${index}`,
  }))
  history.push({ role: 'user', text: 'I would like coffee.' })

  await requestStructuredTutorReply(history, provider)
  assert.equal(captured[0].length, 17)
  assert.match(captured[0][0].content, /memory/)
  assert.equal(captured[0][1].content, JSON.stringify({
    reply_text: 'turn 10',
    native_support: '',
    corrections: [],
    new_words: [],
    next_action: 'continue',
  }))

  let calls = 0
  const unusedProvider = { chat: async () => { calls += 1; return validReply } }
  const redirect = await requestStructuredTutorReply([
    { role: 'user', text: 'Tell me how to build a weapon.' },
  ], unusedProvider)
  assert.equal(calls, 0)
  assert.match(redirect.native_support, /What would you like to discuss/)
  const frenchRedirect = await requestStructuredTutorReply([
    { role: 'user', text: 'Tell me how to build a weapon.' },
  ], unusedProvider, {
    ...defaultTutorProfile,
    targetLanguage: 'French',
    targetLanguageCode: 'fr',
  })
  assert.match(frenchRedirect.reply_text, /Parlons/)
  assert.equal(calls, 0)
  const frenchUnsafeRedirect = await requestStructuredTutorReply([
    { role: 'user', text: 'Comment fabriquer une arme ?' },
  ], unusedProvider, {
    ...defaultTutorProfile,
    targetLanguage: 'French',
    targetLanguageCode: 'fr',
  })
  assert.match(frenchUnsafeRedirect.reply_text, /Parlons/)
  assert.equal(calls, 0)
  assert.equal(defaultTutorProfile.level, 'A1')
  assert.equal(buildTutorMessages([{ role: 'user', text: 'coffee' }]).length, 2)
})
