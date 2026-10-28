import { consumeDailyVoiceTurn, getVoiceClientIdentity } from './_voice-quota.js'

const maximumAudioBytes = 10 * 1024 * 1024
const supportedAudioTypes = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
])

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function decodeAudio(value) {
  if (typeof value !== 'string' || !value || value.length > Math.ceil(maximumAudioBytes / 3) * 4) {
    throw new Error('Audio is empty or too large.')
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error('Audio encoding is invalid.')
  const binary = atob(normalized)
  if (!binary.length || binary.length > maximumAudioBytes) throw new Error('Audio is empty or too large.')
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function onRequestPost({ request, env }) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    return jsonResponse({ error: 'Cloudflare Workers AI is not configured. Add the AI binding and redeploy.' }, 503)
  }
  let payload
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400)
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse({ error: 'Request body must be an object.' }, 400)
  }
  const language = typeof payload.language === 'string' ? payload.language.toLowerCase() : ''
  if (!/^[a-z]{2,3}$/.test(language)) return jsonResponse({ error: 'Choose a valid language code.' }, 400)
  const contentType = typeof payload.contentType === 'string' ? payload.contentType.toLowerCase().split(';')[0] : ''
  if (!supportedAudioTypes.has(payload.contentType?.toLowerCase()) && !supportedAudioTypes.has(contentType)) {
    return jsonResponse({ error: 'Use WebM, Ogg, MP4, MP3, or WAV audio.' }, 400)
  }
  let audio
  try {
    audio = decodeAudio(payload.audio)
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Audio is invalid.' }, 400)
  }
  const userId = getVoiceClientIdentity(request)
  if (!userId) return jsonResponse({ error: 'A secure voice-session ID is required to check the daily limit.' }, 400)
  try {
    if (!(await consumeDailyVoiceTurn(request, globalThis.caches?.default, userId, 'stt'))) {
      return jsonResponse({ error: 'You’ve reached today’s voice-practice limit. Come back tomorrow, or type your reply.' }, 429)
    }
  } catch (error) {
    console.error('[Voice tutor] Transcription quota check failed', error)
    return jsonResponse({ error: 'The daily voice limit could not be checked. Please try again later or type your reply.' }, 503)
  }
  try {
    const result = await env.AI.run(env.STT_MODEL || '@cf/openai/whisper-large-v3-turbo', {
      audio: [...audio],
      language,
    })
    const transcript = typeof result?.text === 'string' ? result.text.trim() : ''
    if (!transcript) return jsonResponse({ error: 'Speech recognition did not return any words.' }, 422)
    return jsonResponse({ text: transcript, language })
  } catch (error) {
    console.error('[Voice tutor] Transcription failed', error)
    const status = error && typeof error === 'object' && error.status === 429 ? 429 : 502
    return jsonResponse({
      error: status === 429
        ? 'Today’s voice-practice limit has been reached. Come back tomorrow, or type your reply.'
        : 'Speech recognition could not process that audio. Please try again or type your reply.',
    }, status)
  }
}
