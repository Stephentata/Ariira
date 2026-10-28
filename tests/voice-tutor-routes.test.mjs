import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequestPost as onChatPost } from '../functions/api/chat.js'
import { onRequestPost as onSttPost } from '../functions/api/stt.js'
import { onRequestGet as onLanguagesGet } from '../functions/api/languages.js'
import { onRequestPost as onTtsPost } from '../functions/api/tts.js'

const userId = '01234567-89ab-cdef-0123-456789abcdef'

function createCache() {
  const entries = new Map()
  return {
    async match(request) {
      return entries.get(new URL(request.url).pathname) ?? null
    },
    async put(request, response) {
      entries.set(new URL(request.url).pathname, response)
    },
  }
}

async function withCache(cache, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { default: cache },
  })
  try {
    return await callback()
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'caches', descriptor)
    else delete globalThis.caches
  }
}

function chatRequest(body) {
  return new Request('https://ariira.app/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ari-user-id': userId,
    },
    body: JSON.stringify(body),
  })
}

test('language catalog exposes Mandarin notes and browser voice hints', async () => {
  const response = await onLanguagesGet()
  const body = await response.json()
  const mandarin = body.languages.find((language) => language.code === 'zh')
  assert.equal(response.status, 200)
  assert.match(mandarin.tutorNotes, /Simplified Chinese/)
  assert.ok(mandarin.voiceNameHints.female.length)
  assert.ok(mandarin.voiceNameHints.male.length)
})

test('chat route streams with the selected language, style, stage, and 220-token cap', async () => {
  const calls = []
  await withCache(createCache(), async () => {
    const response = await onChatPost({
      request: chatRequest({
        languageCode: 'zh',
        nativeLanguage: 'English',
        tutor: 'Ira',
        style: 'soft',
        level: 'A1',
        topics: ['Food', 'Travel'],
        activeTopic: 'Food',
        stage: 'opening',
        messages: [],
      }),
      env: {
        AI: {
          async run(model, input) {
            calls.push({ model, input })
            return new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('data: {"response":"你好! What name should I use?"}\\n\\n'))
                controller.close()
              },
            })
          },
        },
      },
    })
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8')
    assert.match(await response.text(), /你好!/)
  })
  assert.equal(calls[0].model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast')
  assert.equal(calls[0].input.max_tokens, 220)
  assert.equal(calls[0].input.stream, true)
  assert.match(calls[0].input.messages[0].content, /Simplified Chinese/)
  assert.match(calls[0].input.messages[0].content, /selected in the app: Food, Travel/)
  assert.match(calls[0].input.messages[0].content, /Tutor style is soft/)
})

test('chat route refuses the 31st daily response before calling the model', async () => {
  const cache = createCache()
  const date = new Date().toISOString().slice(0, 10)
  await cache.put(
    new Request(`https://ariira.app/__ari_voice_quota/chat/${date}/${userId}`),
    new Response('30'),
  )
  let modelCalled = false
  await withCache(cache, async () => {
    const response = await onChatPost({
      request: chatRequest({
        languageCode: 'zh',
        tutor: 'Ira',
        style: 'balanced',
        level: 'A1',
        stage: 'opening',
        messages: [],
      }),
      env: { AI: { async run() { modelCalled = true } } },
    })
    assert.equal(response.status, 429)
    assert.match((await response.json()).error, /limit/)
  })
  assert.equal(modelCalled, false)
})

test('STT route forwards native MP4 audio and the explicit language to Whisper', async () => {
  let modelCall
  await withCache(createCache(), async () => {
    const response = await onSttPost({
      request: new Request('https://ariira.app/api/stt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ari-user-id': userId,
        },
        body: JSON.stringify({ audio: 'AQID', contentType: 'audio/mp4', language: 'zh' }),
      }),
      env: {
        AI: {
          async run(model, input) {
            modelCall = { model, input }
            return { text: '你好' }
          },
        },
      },
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { text: '你好', language: 'zh' })
  })
  assert.equal(modelCall.model, '@cf/openai/whisper-large-v3-turbo')
  assert.deepEqual(modelCall.input.audio, [1, 2, 3])
  assert.equal(modelCall.input.language, 'zh')
})

test('STT rejects an unsupported media type without invoking Workers AI', async () => {
  let modelCalled = false
  const response = await onSttPost({
    request: new Request('https://ariira.app/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ari-user-id': userId },
      body: JSON.stringify({ audio: 'AQID', contentType: 'audio/unknown', language: 'zh' }),
    }),
    env: { AI: { async run() { modelCalled = true } } },
  })
  assert.equal(response.status, 400)
  assert.equal(modelCalled, false)
})

test('the public TTS route forwards to the shared MeloTTS handler', async () => {
  const response = await onTtsPost({
    request: new Request('https://ariira.app/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: '你好', language: 'zh', gender: 'female' }),
    }),
    env: {},
  })
  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /Workers AI is not configured/)
})
