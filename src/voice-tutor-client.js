import { streamTutorReply } from './voice-tutor.js'

const VOICE_USER_ID_KEY = 'ari-voice-user-id'
const MAX_TRANSCRIPTION_AUDIO_BYTES = 10 * 1024 * 1024
const MAX_VOICE_HISTORY_MESSAGES = 16

function isUuid(value) {
  return typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value)
}

export function getOrCreateVoiceUserId(storage, cryptoApi = globalThis.crypto) {
  const saved = storage.getItem(VOICE_USER_ID_KEY)
  if (isUuid(saved)) return saved
  if (!cryptoApi || typeof cryptoApi.randomUUID !== 'function') {
    throw new Error('Secure browser storage is required to check your daily voice limit.')
  }
  const id = cryptoApi.randomUUID()
  storage.setItem(VOICE_USER_ID_KEY, id)
  return id
}

export async function requestVoiceTutorResponse(payload, {
  fetcher = fetch,
  storage = window.localStorage,
  cryptoApi = globalThis.crypto,
  signal,
  onText = () => {},
} = {}) {
  const userId = getOrCreateVoiceUserId(storage, cryptoApi)
  let response
  try {
    response = await fetcher('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ari-user-id': userId,
      },
      body: JSON.stringify({
        ...payload,
        ...(Array.isArray(payload.messages)
          ? { messages: payload.messages.slice(-MAX_VOICE_HISTORY_MESSAGES) }
          : {}),
      }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('The voice tutor could not connect. Check your internet connection and try again.')
  }
  return streamTutorReply(response, onText)
}

export async function requestVoiceTranscription(audioBlob, language, {
  fetcher = fetch,
  storage = window.localStorage,
  cryptoApi = globalThis.crypto,
  signal,
} = {}) {
  if (!(audioBlob instanceof Blob) || !audioBlob.size || audioBlob.size > MAX_TRANSCRIPTION_AUDIO_BYTES) {
    throw new Error('The recording is empty or too large. Keep voice turns under 30 seconds and try again.')
  }
  if (typeof language !== 'string' || !/^[a-z]{2,3}$/i.test(language)) {
    throw new Error('Choose a supported learning language before recording.')
  }
  const bytes = new Uint8Array(await audioBlob.arrayBuffer())
  const userId = getOrCreateVoiceUserId(storage, cryptoApi)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  let response
  try {
    response = await fetcher('/api/stt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ari-user-id': userId,
      },
      body: JSON.stringify({
        audio: btoa(binary),
        contentType: audioBlob.type || 'audio/webm',
        language: language.toLowerCase(),
      }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('Speech recognition could not connect. Check your internet connection or type your reply.')
  }
  if (!response.ok) {
    let message = `Speech recognition failed (HTTP ${response.status}).`
    try {
      const body = await response.json()
      if (typeof body.error === 'string') message = body.error
    } catch {
      // Retain the HTTP status when the server does not return JSON.
    }
    throw new Error(message)
  }
  const result = await response.json()
  if (typeof result.text !== 'string' || !result.text.trim()) {
    throw new Error('Speech recognition did not return any words. Please try again or type your reply.')
  }
  return result.text.trim()
}
