const model = '@cf/myshell-ai/melotts'
const maximumRequestBytes = 64 * 1024
const maximumTextLength = 4096
const maximumAudioBytes = 16 * 1024 * 1024
const cacheTtlSeconds = 3600
const supportedLanguages = new Set(['en', 'es', 'fr', 'ja', 'zh', 'ko'])

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

async function readJsonBody(request) {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength !== null && Number(declaredLength) > maximumRequestBytes) {
    throw new Error('Speech request is too large.')
  }
  if (!request.body) throw new Error('Request body must be valid JSON.')

  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maximumRequestBytes) {
      await reader.cancel()
      throw new Error('Speech request is too large.')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

function validateSpeechRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'Request body must be a JSON object.'
  }
  if (
    typeof payload.input !== 'string' ||
    !payload.input.trim() ||
    payload.input.length > maximumTextLength
  ) {
    return `Speech text must contain between 1 and ${maximumTextLength} characters.`
  }
  if (
    typeof payload.language !== 'string' ||
    !supportedLanguages.has(payload.language)
  ) {
    return 'Cloud speech currently supports English, Spanish, French, Mandarin Chinese, Japanese, and Korean.'
  }
  if (payload.gender !== 'female' && payload.gender !== 'male') {
    return 'Choose either a female or male voice.'
  }
  return null
}

async function readBoundedAudio(stream) {
  if (!stream) throw new Error('Workers AI returned empty audio.')
  const reader = stream.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maximumAudioBytes) {
      await reader.cancel()
      throw new Error('Workers AI returned oversized audio.')
    }
    chunks.push(value)
  }
  if (!size) throw new Error('Workers AI returned empty audio.')
  const audio = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    audio.set(chunk, offset)
    offset += chunk.byteLength
  }
  return audio
}

function decodeBase64Audio(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > Math.ceil(maximumAudioBytes / 3) * 4
  ) {
    throw new Error('Workers AI returned empty or oversized audio.')
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error('Workers AI returned invalid encoded audio.')
  }

  let binary
  try {
    binary = atob(normalized)
  } catch {
    throw new Error('Workers AI returned invalid encoded audio.')
  }
  if (!binary.length || binary.length > maximumAudioBytes) {
    throw new Error('Workers AI returned empty or oversized audio.')
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function extractAudio(result) {
  if (result instanceof Response) {
    const contentType = result.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.includes('audio/mpeg') && !contentType.includes('audio/mp3')) {
      throw new Error('Workers AI returned a non-audio response.')
    }
    return readBoundedAudio(result.body)
  }
  if (result instanceof ArrayBuffer) {
    if (!result.byteLength || result.byteLength > maximumAudioBytes) {
      throw new Error('Workers AI returned empty or oversized audio.')
    }
    return Promise.resolve(new Uint8Array(result))
  }
  if (ArrayBuffer.isView(result)) {
    if (!result.byteLength || result.byteLength > maximumAudioBytes) {
      throw new Error('Workers AI returned empty or oversized audio.')
    }
    return Promise.resolve(new Uint8Array(result.buffer, result.byteOffset, result.byteLength))
  }

  const encoded = typeof result === 'string'
    ? result
    : result && typeof result === 'object' && !Array.isArray(result)
      ? result.audio
      : null
  return Promise.resolve(decodeBase64Audio(encoded))
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function getCacheKey(request, value) {
  const url = new URL(request.url)
  url.pathname = `/__ari_tts_cache/${value}`
  url.search = ''
  return new Request(url.toString(), { method: 'GET' })
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown speech service error.'
}

export function createTtsHandler({
  cache = globalThis.caches?.default,
  logger = console,
} = {}) {
  return async function onRequestPost({ request, env }) {
    if (!env.AI || typeof env.AI.run !== 'function') {
      return jsonResponse({
        error: 'Cloudflare Workers AI is not configured. Add the existing AI binding to this Pages project.',
      }, 503)
    }
    if (request.method !== 'POST') return jsonResponse({ error: 'Use POST to generate speech.' }, 405)

    let payload
    try {
      payload = await readJsonBody(request)
    } catch (error) {
      const message = getErrorMessage(error)
      return jsonResponse({ error: message }, message === 'Speech request is too large.' ? 413 : 400)
    }

    const validationError = validateSpeechRequest(payload)
    if (validationError) return jsonResponse({ error: validationError }, 400)

    const cacheKey = getCacheKey(request, await sha256(
      `cloudflare-melotts-v1|${payload.language}|${payload.input}`,
    ))
    if (cache) {
      try {
        const cached = await cache.match(cacheKey)
        if (cached) return cached
      } catch (error) {
        logger.error('[Workers AI TTS] Audio cache lookup failed', { error: getErrorMessage(error) })
      }
    }

    let result
    try {
      result = await env.AI.run(model, {
        prompt: payload.input,
        lang: payload.language,
      })
    } catch (error) {
      logger.error('[Workers AI TTS] Synthesis failed', { error: getErrorMessage(error) })
      const status = error && typeof error === 'object' && error.status === 429 ? 429 : 502
      const message = status === 429
        ? 'Cloud speech is at its current usage limit. Please try again later.'
        : 'Cloud speech could not generate audio. Please try again shortly.'
      return jsonResponse({ error: message }, status)
    }

    let audio
    try {
      audio = await extractAudio(result)
    } catch (error) {
      logger.error('[Workers AI TTS] Audio response was invalid', { error: getErrorMessage(error) })
      return jsonResponse({ error: 'Cloud speech returned audio that could not be played.' }, 502)
    }

    const response = new Response(audio, {
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': `public, max-age=${cacheTtlSeconds}`,
      },
    })
    if (cache) {
      try {
        await cache.put(cacheKey, response.clone())
      } catch (error) {
        logger.error('[Workers AI TTS] Audio cache write failed', { error: getErrorMessage(error) })
      }
    }
    return response
  }
}

const onRequestPostWithWorkersAi = createTtsHandler()

export async function onRequestPost(context) {
  return onRequestPostWithWorkersAi(context)
}
