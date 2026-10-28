import { createTtsHandler } from './ari/tts.js'

const onRequestPostWithWorkersAi = createTtsHandler()

export async function onRequestPost(context) {
  return onRequestPostWithWorkersAi(context)
}
