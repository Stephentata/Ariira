import test from 'node:test'
import assert from 'node:assert/strict'
import {
  consumeVoiceTurn,
  extractLearnerName,
  getNextVoiceStage,
  getStreamableTutorText,
  parseTutorCard,
  takeCompleteSentences,
} from '../src/voice-tutor.js'
import {
  getOrCreateVoiceUserId,
  requestVoiceTutorResponse,
  requestVoiceTranscription,
} from '../src/voice-tutor-client.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('daily voice turns reset by date and reject the 31st turn', () => {
  const storage = createStorage()
  const day = new Date('2026-02-01T10:00:00.000Z')
  for (let turn = 1; turn <= 30; turn += 1) assert.equal(consumeVoiceTurn(storage, day), turn)
  assert.throws(() => consumeVoiceTurn(storage, day), /limit/)
  assert.equal(consumeVoiceTurn(storage, new Date('2026-02-02T00:00:00.000Z')), 1)
})

test('learner name extraction supports English and Mandarin answers', () => {
  assert.equal(extractLearnerName("My name's Jamie!"), 'Jamie')
  assert.equal(extractLearnerName('我叫小明。'), '小明')
  assert.equal(extractLearnerName('hello', 'Ari'), 'Ari')
})

test('voice stages progress in order and hold when recognition is uncertain', () => {
  assert.equal(getNextVoiceStage('opening'), 'name')
  assert.equal(getNextVoiceStage('name'), 'small-talk')
  assert.equal(getNextVoiceStage('small-talk'), 'topic')
  assert.equal(getNextVoiceStage('topic'), 'teaching')
  assert.equal(getNextVoiceStage('teaching'), 'conversation')
  assert.equal(getNextVoiceStage('conversation'), 'conversation')
  assert.equal(getNextVoiceStage('name', true), 'name')
})

test('phrase cards are stripped from speech and parsed for display', () => {
  const reply = '说 你好 (nǐ hǎo), meaning hello. [[card: {"phrase":"你好","pinyin":"nǐ hǎo","meaning":"hello","toneTip":"Third tone"}]]'
  assert.equal(getStreamableTutorText('Say hello. [[ca'), 'Say hello.')
  const parsed = parseTutorCard(reply)
  assert.equal(parsed.displayText, '说 你好 (nǐ hǎo), meaning hello.')
  assert.deepEqual(parsed.card, {
    phrase: '你好',
    pinyin: 'nǐ hǎo',
    meaning: 'hello',
    toneTip: 'Third tone',
  })
})

test('sentence parsing leaves incomplete text queued', () => {
  assert.deepEqual(takeCompleteSentences('Hello there. What is your name? Next'), {
    sentences: ['Hello there.', 'What is your name?'],
    remainder: 'Next',
  })
})

test('voice user identity is stable and has UUID shape', () => {
  const storage = createStorage()
  const cryptoApi = { randomUUID: () => '01234567-89ab-cdef-0123-456789abcdef' }
  assert.equal(getOrCreateVoiceUserId(storage, cryptoApi), cryptoApi.randomUUID())
  assert.equal(getOrCreateVoiceUserId(storage, cryptoApi), cryptoApi.randomUUID())
})

test('voice chat sends settings and identity, then reads streamed text', async () => {
  const storage = createStorage()
  const chunks = [
    'data: {"response":"Hello there. "}\n\n',
    'data: {"response":"What is your name?"}\n\n',
    'data: [DONE]\n\n',
  ]
  const seen = []
  let request
  const result = await requestVoiceTutorResponse(
    { languageCode: 'zh', stage: 'opening', tutor: 'Ira' },
    {
      storage,
      cryptoApi: { randomUUID: () => '01234567-89ab-cdef-0123-456789abcdef' },
      fetcher: async (url, options) => {
        request = { url, options }
        return new Response(new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
            controller.close()
          },
        }), { headers: { 'Content-Type': 'text/event-stream' } })
      },
      onText: (fullText) => seen.push(fullText),
    },
  )
  assert.equal(request.url, '/api/chat')
  assert.equal(request.options.headers['x-ari-user-id'], '01234567-89ab-cdef-0123-456789abcdef')
  assert.deepEqual(JSON.parse(request.options.body), { languageCode: 'zh', stage: 'opening', tutor: 'Ira' })
  assert.equal(result, 'Hello there. What is your name?')
  assert.deepEqual(seen, ['Hello there. ', 'Hello there. What is your name?'])
})

test('voice chat only sends the most recent sixteen history messages', async () => {
  let requestBody
  const messages = Array.from({ length: 24 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `Turn ${index + 1}`,
  }))
  await requestVoiceTutorResponse(
    { languageCode: 'zh', stage: 'conversation', tutor: 'Ira', messages },
    {
      storage: createStorage(),
      cryptoApi: { randomUUID: () => '01234567-89ab-cdef-0123-456789abcdef' },
      fetcher: async (_url, options) => {
        requestBody = JSON.parse(options.body)
        return new Response('data: {"response":"好。"}\n\n')
      },
    },
  )
  assert.equal(requestBody.messages.length, 16)
  assert.equal(requestBody.messages[0].content, 'Turn 9')
  assert.equal(requestBody.messages.at(-1).content, 'Turn 24')
})

test('voice transcription submits the browser media type and explicit language', async () => {
  let request
  const text = await requestVoiceTranscription(
    new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }),
    'zh',
    {
      storage: createStorage(),
      cryptoApi: { randomUUID: () => '01234567-89ab-cdef-0123-456789abcdef' },
      fetcher: async (url, options) => {
        request = { url, options }
        return Response.json({ text: '你好' })
      },
    },
  )
  assert.equal(text, '你好')
  assert.equal(request.url, '/api/stt')
  assert.equal(request.options.headers['x-ari-user-id'], '01234567-89ab-cdef-0123-456789abcdef')
  assert.deepEqual(JSON.parse(request.options.body), {
    audio: 'AQID',
    contentType: 'audio/mp4',
    language: 'zh',
  })
})
