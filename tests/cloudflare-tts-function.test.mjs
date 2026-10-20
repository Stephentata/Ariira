import assert from 'node:assert/strict'
import test from 'node:test'
import { createTtsHandler } from '../functions/api/ari/tts.js'

function createRequest(payload, options = {}) {
  return new Request('https://ariira.pages.dev/api/ari/tts', {
    method: options.method ?? 'POST',
    headers: options.headers,
    body: options.method === 'GET' ? undefined : payload,
  })
}

function createMockWorkersAi({ audio = new Uint8Array([73, 68, 51, 4, 5]), failure } = {}) {
  const calls = []
  const AI = {
    run: async (requestedModel, input) => {
      calls.push({ requestedModel, input })
      if (failure) throw failure
      return { audio: Buffer.from(audio).toString('base64') }
    },
  }
  return { calls, AI }
}

function createMemoryCache() {
  const values = new Map()
  return {
    match: async (request) => values.get(request.url)?.clone(),
    put: async (request, response) => values.set(request.url, response.clone()),
    size: () => values.size,
  }
}

test('Pages TTS uses the existing Workers AI binding without provider secrets', async () => {
  const cloud = createMockWorkersAi()
  const handler = createTtsHandler({ cache: null })
  const input = { input: 'Bonjour !', language: 'fr', gender: 'female' }
  const response = await handler({
    request: createRequest(JSON.stringify(input)),
    env: { AI: cloud.AI },
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'audio/wav')
  assert.equal(response.headers.get('cache-control'), 'public, max-age=3600')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([73, 68, 51, 4, 5]))
  assert.deepEqual(cloud.calls, [{
    requestedModel: '@cf/myshell-ai/melotts',
    input: { prompt: 'Bonjour !', lang: 'fr' },
  }])
})

test('Pages TTS reports a missing Workers AI binding clearly', async () => {
  const handler = createTtsHandler({ cache: null })
  const response = await handler({
    request: createRequest(JSON.stringify({ input: 'Hello', language: 'en', gender: 'female' })),
    env: {},
  })
  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /Workers AI is not configured.*AI binding/)
})

test('Pages TTS rejects malformed, oversized, unsupported, and invalid requests', async () => {
  const cloud = createMockWorkersAi()
  const handler = createTtsHandler({ cache: null })
  const malformed = await handler({ request: createRequest('{bad'), env: { AI: cloud.AI } })
  assert.equal(malformed.status, 400)

  const tooLong = await handler({
    request: createRequest(JSON.stringify({ input: 'x'.repeat(4097), language: 'en', gender: 'female' })),
    env: { AI: cloud.AI },
  })
  assert.equal(tooLong.status, 400)

  const unsupported = await handler({
    request: createRequest(JSON.stringify({ input: 'Hallo', language: 'de', gender: 'female' })),
    env: { AI: cloud.AI },
  })
  assert.equal(unsupported.status, 400)
  assert.match((await unsupported.json()).error, /English, Spanish, French, Mandarin Chinese, Japanese, and Korean/)

  const invalidGender = await handler({
    request: createRequest(JSON.stringify({ input: 'Hello', language: 'en', gender: 'any' })),
    env: { AI: cloud.AI },
  })
  assert.equal(invalidGender.status, 400)

  const wrongMethod = await handler({
    request: createRequest('', { method: 'GET' }),
    env: { AI: cloud.AI },
  })
  assert.equal(wrongMethod.status, 405)
  assert.equal(cloud.calls.length, 0)
})

test('Pages TTS caches audio for one hour and reuses it across the unused voice-gender field', async () => {
  const cloud = createMockWorkersAi()
  const cache = createMemoryCache()
  const handler = createTtsHandler({ cache, logger: { error() {} } })
  const female = { input: 'Hello', language: 'en', gender: 'female' }
  const male = { ...female, gender: 'male' }

  const first = await handler({
    request: createRequest(JSON.stringify(female)),
    env: { AI: cloud.AI },
  })
  assert.equal(first.status, 200)
  assert.equal(cache.size(), 1)

  const cached = await handler({
    request: createRequest(JSON.stringify(male)),
    env: { AI: cloud.AI },
  })
  assert.equal(cached.status, 200)
  assert.equal(cached.headers.get('content-type'), 'audio/wav')
  assert.equal(cloud.calls.length, 1)
})

test('Pages TTS reports Workers AI usage limits without exposing upstream errors', async () => {
  const handler = createTtsHandler({ cache: null, logger: { error() {} } })
  const response = await handler({
    request: createRequest(JSON.stringify({ input: 'Hello', language: 'en', gender: 'male' })),
    env: { AI: { run: async () => { throw Object.assign(new Error('private upstream details'), { status: 429 }) } } },
  })
  assert.equal(response.status, 429)
  const body = await response.json()
  assert.match(body.error, /current usage limit/)
  assert.doesNotMatch(JSON.stringify(body), /private upstream details/)
})

test('Pages TTS rejects invalid and oversized audio returned by Workers AI', async () => {
  const handler = createTtsHandler({ cache: null, logger: { error() {} } })
  const invalidAudio = await handler({
    request: createRequest(JSON.stringify({ input: 'Hello', language: 'en', gender: 'female' })),
    env: { AI: { run: async () => ({ audio: 'not base64!' }) } },
  })
  assert.equal(invalidAudio.status, 502)

  const oversizedAudio = await handler({
    request: createRequest(JSON.stringify({ input: 'Hello', language: 'en', gender: 'female' })),
    env: { AI: { run: async () => ({ audio: 'A'.repeat(22_369_624) }) } },
  })
  assert.equal(oversizedAudio.status, 502)
})
