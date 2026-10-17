import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildLocalSpeechRequest,
  DEFAULT_SPEECH_PREFERENCES,
  getTutorSpeechGender,
  readSpeechPreferences,
  requestLocalSpeech,
  saveSpeechPreferences,
  SPEECH_PREFERENCES_KEY,
} from '../src/speech-options.js'

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('speech preferences provide voice style defaults and migrate older settings', () => {
  const storage = createMemoryStorage()
  assert.deepEqual(readSpeechPreferences(storage), DEFAULT_SPEECH_PREFERENCES)
  assert.deepEqual(DEFAULT_SPEECH_PREFERENCES, { gender: 'female', flavor: 'Airy', rate: 1 })

  storage.setItem(SPEECH_PREFERENCES_KEY, JSON.stringify({
    voiceURI: 'old-voice',
    style: 'playful',
    gender: 'male',
  }))
  assert.deepEqual(readSpeechPreferences(storage), { gender: 'male', flavor: 'Airy', rate: 1 })

  const preferences = { gender: 'female', flavor: 'Warm', rate: 1.1 }
  saveSpeechPreferences(storage, preferences)
  assert.deepEqual(readSpeechPreferences(storage), preferences)
  assert.throws(() => saveSpeechPreferences(storage, { gender: 'any' }), /female or male/)
  storage.setItem(SPEECH_PREFERENCES_KEY, JSON.stringify({ gender: 'any', style: 'playful' }))
  assert.deepEqual(readSpeechPreferences(storage), { gender: 'female', flavor: 'Airy', rate: 1 })
  storage.setItem(SPEECH_PREFERENCES_KEY, JSON.stringify({ gender: 'unknown' }))
  assert.throws(() => readSpeechPreferences(storage), /invalid/)
  storage.setItem(SPEECH_PREFERENCES_KEY, '{')
  assert.throws(() => readSpeechPreferences(storage), /damaged/)
})

test('Ari and Ira always map to their configured tutor voice genders', () => {
  assert.equal(getTutorSpeechGender('Ari'), 'male')
  assert.equal(getTutorSpeechGender('Ira'), 'female')
  assert.throws(() => getTutorSpeechGender('Unknown'), /Choose Ari or Ira/)
})

test('local speech requests contain the source text, language, and selected gender', () => {
  assert.deepEqual(buildLocalSpeechRequest('Bonjour !', 'fr-FR', 'female'), {
    input: 'Bonjour !',
    language: 'fr',
    gender: 'female',
  })
  assert.deepEqual(buildLocalSpeechRequest('你好', 'zh-CN', 'male'), {
    input: '你好',
    language: 'zh',
    gender: 'male',
  })
  assert.equal(buildLocalSpeechRequest('こんにちは', 'ja-JP', 'female').language, 'ja')
  assert.throws(() => buildLocalSpeechRequest('', 'fr-FR', 'female'), /text/)
  assert.throws(() => buildLocalSpeechRequest('Hi', 'en-US', 'any'), /female or male/)
})

test('local speech client returns valid audio and surfaces service errors', async () => {
  let request
  const audioBytes = new Uint8Array([1, 2, 3])
  const audio = await requestLocalSpeech('你好', 'zh-CN', 'male', async (url, options) => {
    request = { url, options }
    return new Response(new Blob([audioBytes], { type: 'audio/wav' }), { status: 200 })
  })
  assert.equal(request.url, '/api/ari/tts')
  assert.equal(request.options.method, 'POST')
  assert.equal(JSON.parse(request.options.body).gender, 'male')
  assert.deepEqual(new Uint8Array(await audio.arrayBuffer()), audioBytes)

  await assert.rejects(
    requestLocalSpeech('Hello', 'en-US', 'female', async () => new Response(JSON.stringify({
      error: { message: 'The OmniVoice model is not installed.' },
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })),
    /The OmniVoice model is not installed/,
  )
  await assert.rejects(
    requestLocalSpeech('Hello', 'en-US', 'female', async () => new Response('Bad Gateway', { status: 502 })),
    /cannot reach its local speech service on port 3901.*Start the Ari voice service/,
  )
  await assert.rejects(
    requestLocalSpeech('Hello', 'en-US', 'female', async () => new Response('Gateway Timeout', { status: 504 })),
    /took too long to generate speech/,
  )
  await assert.rejects(
    requestLocalSpeech('Hello', 'en-US', 'female', async () => new Response('ok', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })),
    /non-audio response/,
  )
  await assert.rejects(
    requestLocalSpeech('Hello', 'en-US', 'female', async () => {
      throw new TypeError('connection refused')
    }),
    /local voice service is not responding on port 3901/,
  )
})
