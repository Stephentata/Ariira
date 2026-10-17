const model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const maximumMessages = 30
const maximumMessageLength = 20_000
const maximumTotalLength = 48_000

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function isValidPayload(payload) {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !Array.isArray(payload.messages) ||
    payload.messages.length === 0 ||
    payload.messages.length > maximumMessages ||
    typeof payload.format !== 'object' ||
    payload.format === null ||
    Array.isArray(payload.format)
  ) {
    return false
  }

  let totalLength = 0
  for (const message of payload.messages) {
    if (
      typeof message !== 'object' ||
      message === null ||
      !['system', 'user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      message.content.length > maximumMessageLength
    ) {
      return false
    }
    totalLength += message.content.length
  }
  return totalLength <= maximumTotalLength
}

export async function onRequestPost({ request, env }) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    return jsonResponse({
      error: 'Cloudflare Workers AI is not configured for this Pages project. Add an AI binding named AI and redeploy.',
    }, 503)
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400)
  }

  if (!isValidPayload(payload)) {
    return jsonResponse({ error: 'Request must include valid chat messages and a JSON schema.' }, 400)
  }

  try {
    const result = await env.AI.run(model, {
      messages: payload.messages,
      response_format: {
        type: 'json_schema',
        json_schema: payload.format,
      },
      temperature: typeof payload.options?.temperature === 'number'
        ? Math.max(0, Math.min(1, payload.options.temperature))
        : 0.3,
      max_tokens: 1536,
    })
    const response = result?.response ?? result
    const content = typeof response === 'string' ? response : JSON.stringify(response)

    if (!content || content === 'undefined') {
      throw new Error('Workers AI returned an empty response.')
    }

    return jsonResponse({ message: { role: 'assistant', content } })
  } catch (error) {
    console.error('[Workers AI] Tutor inference failed', error)
    const detail = error instanceof Error
      ? error.message.replace(/\s+/g, ' ').slice(0, 240)
      : 'Unknown Workers AI error.'
    return jsonResponse({ error: `Cloudflare Workers AI request failed: ${detail}` }, 502)
  }
}
