export const SPEECH_PREFERENCES_KEY = 'ari-speech-preferences'

export const DEFAULT_SPEECH_PREFERENCES = Object.freeze({ gender: 'female', flavor: 'Airy', rate: 1 })
const VOICE_FLAVORS = new Set(['Warm', 'Lively', 'Clear', 'Airy', 'Playful', 'Deep', 'Bold', 'Calm'])

export function getTutorSpeechGender(tutorName) {
  if (tutorName === 'Ari') return 'male'
  if (tutorName === 'Ira') return 'female'
  throw new Error('Choose Ari or Ira to select a tutor voice.')
}

const TUTOR_PREVIEW_TEXT = Object.freeze({
  en: 'Hello! Let’s practise together.',
  es: '¡Hola! Vamos a practicar juntos.',
  fr: 'Bonjour ! On va pratiquer ensemble.',
  de: 'Hallo! Lass uns zusammen üben.',
  it: 'Ciao! Esercitiamoci insieme.',
  pt: 'Olá! Vamos praticar juntos.',
  ja: 'こんにちは！一緒に練習しましょう。',
  zh: '你好！我们一起练习吧。',
  ko: '안녕하세요! 함께 연습해요.',
  hi: 'नमस्ते! आइए साथ में अभ्यास करें।',
  ar: 'مرحبًا! لنتدرب معًا.',
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
})

export function getTutorPreviewText(languageCode) {
  const sample = TUTOR_PREVIEW_TEXT[languageCode]
  if (!sample) throw new Error(`No tutor voice preview text is configured for ${languageCode}.`)
  return sample
}

export function readSpeechPreferences(storage) {
  const serialized = storage.getItem(SPEECH_PREFERENCES_KEY)
  if (serialized === null) return { ...DEFAULT_SPEECH_PREFERENCES }

  let parsed
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('Saved voice preferences are damaged. They were not changed.')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Saved voice preferences are invalid. They were not changed.')
  }
  if (parsed.gender !== undefined && parsed.gender !== 'female' && parsed.gender !== 'male' && parsed.gender !== 'any') {
    throw new Error('Saved voice preferences are invalid. They were not changed.')
  }
  if (parsed.flavor !== undefined && !VOICE_FLAVORS.has(parsed.flavor)) {
    throw new Error('Saved voice preferences are invalid. They were not changed.')
  }
  if (parsed.rate !== undefined && (!Number.isFinite(parsed.rate) || parsed.rate < 0.75 || parsed.rate > 1.25)) {
    throw new Error('Saved voice preferences are invalid. They were not changed.')
  }
  return {
    gender: parsed.gender === 'male' ? 'male' : 'female',
    flavor: parsed.flavor ?? DEFAULT_SPEECH_PREFERENCES.flavor,
    rate: parsed.rate ?? DEFAULT_SPEECH_PREFERENCES.rate,
  }
}

export function saveSpeechPreferences(storage, preferences) {
  if (preferences?.gender !== 'female' && preferences?.gender !== 'male') {
    throw new Error('Choose either a female or male voice.')
  }
  const flavor = VOICE_FLAVORS.has(preferences.flavor)
    ? preferences.flavor
    : DEFAULT_SPEECH_PREFERENCES.flavor
  const rate = Number.isFinite(preferences.rate) && preferences.rate >= 0.75 && preferences.rate <= 1.25
    ? preferences.rate
    : DEFAULT_SPEECH_PREFERENCES.rate
  storage.setItem(SPEECH_PREFERENCES_KEY, JSON.stringify({ gender: preferences.gender, flavor, rate }))
}

export function buildLocalSpeechRequest(text, locale, gender) {
  if (typeof text !== 'string' || !text.trim() || text.length > 4096) {
    throw new Error('Speech text must contain between 1 and 4096 characters.')
  }
  if (typeof locale !== 'string' || !locale.trim()) {
    throw new Error('A language is required to generate speech.')
  }
  if (gender !== 'female' && gender !== 'male') {
    throw new Error('Choose either a female or male voice.')
  }

  return {
    input: text,
    language: locale.split('-')[0].toLowerCase(),
    gender,
  }
}

async function getErrorMessage(response) {
  let detail = ''
  try {
    const body = await response.json()
    const error = body?.error
    const message = typeof error === 'string'
      ? error
      : error?.message ?? body?.detail ?? body?.message
    if (typeof message === 'string') detail = message.slice(0, 400)
  } catch {
    detail = ''
  }
  if (detail) return detail
  if (response.status === 502) {
    return 'Ari cannot reach the speech service. Check the configured voice service, then try again.'
  }
  if (response.status === 504) {
    return 'Ari’s speech service took too long to generate speech. Please try again shortly.'
  }
  if (response.status === 500 || response.status === 503) {
    return 'Ari’s speech service is not configured or could not generate speech. Check its server settings, then try again.'
  }
  return `Ari’s speech service could not generate speech (HTTP ${response.status}).`
}

export async function requestLocalSpeech(text, locale, gender, fetcher = fetch, signal) {
  const body = buildLocalSpeechRequest(text, locale, gender)
  let response
  try {
    response = await fetcher('/api/ari/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('Ari’s speech service is not responding. Check the server connection, then try again.')
  }

  if (!response.ok) throw new Error(await getErrorMessage(response))
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('audio/')) {
    throw new Error('Ari’s speech service returned a non-audio response.')
  }

  const audio = await response.blob()
  if (!audio.size) throw new Error('Ari’s speech service returned an empty audio response.')
  return audio
}
