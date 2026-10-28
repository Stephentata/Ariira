import { LANGUAGES_WITH_VOICE } from '../../src/languages.js'

export async function onRequestGet() {
  return new Response(JSON.stringify({
    languages: LANGUAGES_WITH_VOICE,
    chatModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    sttModel: '@cf/openai/whisper-large-v3-turbo',
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
