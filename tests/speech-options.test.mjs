import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LANGUAGES } from '../src/language-options.js'
import {
  buildLocalSpeechRequest,
  DEFAULT_SPEECH_PREFERENCES,
  getTutorPreviewText,
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

test('profile voice previews use target-language samples across the language catalog', () => {
  const samples = {
    en: 'Hello! Let’s practise together.',
    fr: 'Bonjour ! On va pratiquer ensemble.',
    zh: '你好！我们一起练习吧。',
    es: '¡Hola! Vamos a practicar juntos.',
    ja: 'こんにちは！一緒に練習しましょう。',
    ko: '안녕하세요! 함께 연습해요.',
    de: 'Hallo! Lass uns zusammen üben.',
    ar: 'مرحبًا! لنتدرب معًا.',
    pt: 'Olá! Vamos praticar juntos.',
    it: 'Ciao! Esercitiamoci insieme.',
    hi: 'नमस्ते! आइए साथ में अभ्यास करें।',
    tr: 'Merhaba! Hadi birlikte pratik yapalım.',
    ru: 'Привет! Давай потренируемся вместе.',
    vi: 'Xin chào! Cùng luyện tập nhé.',
    th: 'สวัสดี! มาฝึกไปด้วยกันนะ',
    id: 'Halo! Mari berlatih bersama.',
    nl: 'Hallo! Laten we samen oefenen.',
    pl: 'Cześć! Poćwiczmy razem.',
    sv: 'Hej! Nu övar vi tillsammans.',
    da: 'Hej! Lad os øve sammen.',
    no: 'Hei! La oss øve sammen.',
    fi: 'Hei! Harjoitellaan yhdessä.',
    el: 'Γεια! Ας εξασκηθούμε μαζί.',
    he: 'שלום! בואו נתרגל יחד.',
    uk: 'Привіт! Попрактикуймося разом.',
    cs: 'Ahoj! Pojďme společně procvičovat.',
    ro: 'Bună! Hai să exersăm împreună.',
    hu: 'Szia! Gyakoroljunk együtt.',
    ms: 'Helo! Mari berlatih bersama.',
    sw: 'Habari! Tufanye mazoezi pamoja.',
  }
  for (const [languageCode, sample] of Object.entries(samples)) {
    assert.equal(getTutorPreviewText(languageCode), sample)
  }
  for (const language of LANGUAGES) {
    assert.ok(getTutorPreviewText(language.code), `missing preview sample for ${language.code}`)
  }
  assert.throws(() => getTutorPreviewText('xx'), /No tutor voice preview text/)
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
    /cannot reach the speech service.*Check the configured voice service/,
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
    /speech service is not responding.*Check the server connection/,
  )
})
