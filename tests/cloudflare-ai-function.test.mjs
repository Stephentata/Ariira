import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequestPost } from '../functions/api/ollama/api/chat.js'

const payload = {
  model: 'qwen2.5-coder:7b',
  stream: false,
  format: {
    type: 'object',
    properties: { reply_text: { type: 'string' } },
    required: ['reply_text'],
  },
  options: { temperature: 0.3 },
  messages: [{ role: 'user', content: 'I want coffee.' }],
}

function request(body) {
  return new Request('https://ariira.pages.dev/api/ollama/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

test('Pages chat function maps the Ollama-compatible request to Workers AI', async () => {
  let model
  let input
  const response = await onRequestPost({
    request: request(JSON.stringify(payload)),
    env: {
      AI: {
        run: async (requestedModel, parameters) => {
          model = requestedModel
          input = parameters
          return { response: { reply_text: '我想喝咖啡。' } }
        },
      },
    },
  })

  assert.equal(response.status, 200)
  assert.equal(model, '@cf/meta/llama-3.1-8b-instruct')
  assert.deepEqual(input.messages, payload.messages)
  assert.deepEqual(input.response_format, {
    type: 'json_schema',
    json_schema: payload.format,
  })
  assert.equal(input.temperature, 0.3)
  assert.equal(input.max_tokens, 1536)
  assert.deepEqual(await response.json(), {
    message: { role: 'assistant', content: '{"reply_text":"我想喝咖啡。"}' },
  })
})

test('Pages chat function reports a missing Workers AI binding clearly', async () => {
  const response = await onRequestPost({ request: request(JSON.stringify(payload)), env: {} })

  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /AI binding named AI/)
})

test('Pages chat function rejects malformed and oversized chat requests', async () => {
  const invalidJson = await onRequestPost({ request: request('{bad'), env: { AI: { run() {} } } })
  assert.equal(invalidJson.status, 400)

  const oversized = await onRequestPost({
    request: request(JSON.stringify({
      ...payload,
      messages: [{ role: 'user', content: 'x'.repeat(48_001) }],
    })),
    env: { AI: { run() {} } },
  })
  assert.equal(oversized.status, 400)
})

test('Pages chat function returns an explicit error when Workers AI fails', async () => {
  const originalError = console.error
  console.error = () => {}
  try {
    const response = await onRequestPost({
      request: request(JSON.stringify(payload)),
      env: { AI: { run: async () => { throw new Error('upstream unavailable') } } },
    })
    assert.equal(response.status, 502)
    assert.match((await response.json()).error, /could not complete the tutor reply/)
  } finally {
    console.error = originalError
  }
})
