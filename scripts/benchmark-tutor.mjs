import {
  buildTutorMessages,
  countTutorSentences,
  defaultTutorProfile,
  getTutorResponseLanguageRatio,
  OllamaLLMProvider,
  tutorResponseSchema,
  validateTutorResponse,
} from '../src/tutor-provider.js'

const model = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b'
const endpoint = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/chat'
const provider = new OllamaLLMProvider({ model, endpoint })
const history = [
  {
    role: 'tutor',
    text: '你好，欢迎来到咖啡馆。No rush; we can practise slowly. 你想喝什么？',
  },
]
const learnerPrompts = [
  'I would like a coffee, please.',
  'Can I have milk in it?',
  '我想要咖啡，不要糖。',
]
const results = []

try {
  for (const prompt of learnerPrompts) {
    history.push({ role: 'user', text: prompt })
    const startedAt = Date.now()
    const rawReply = await provider.chat(buildTutorMessages(history), tutorResponseSchema)
    const latencyMs = Date.now() - startedAt
    let reply
    let rejection = ''
    try {
      reply = validateTutorResponse(rawReply, defaultTutorProfile.level)
    } catch (error) {
      rejection = error instanceof Error ? error.message : 'Unknown validation failure'
    }
    const replyText = typeof rawReply?.reply_text === 'string' ? rawReply.reply_text : ''
    results.push({
      accepted: Boolean(reply),
      latencyMs,
      languageRatio: Number(getTutorResponseLanguageRatio(rawReply).toFixed(2)),
      sentences: countTutorSentences(replyText),
      corrections: Array.isArray(rawReply?.corrections) ? rawReply.corrections.length : null,
      rejection: rejection || undefined,
      reply: replyText,
      nativeSupport: typeof rawReply?.native_support === 'string' ? rawReply.native_support : '',
    })
    history.push({
      role: 'tutor',
      text: replyText || JSON.stringify(rawReply),
      corrections: reply?.corrections,
      newWords: reply?.new_words,
      whiteboardCard: reply?.whiteboard_card,
      nextAction: reply?.next_action,
    })
  }
} catch (error) {
  console.error(`Tutor benchmark failed for ${model}:`, error instanceof Error ? error.message : error)
  process.exitCode = 1
}

if (process.exitCode !== 1) {
  console.log(JSON.stringify({
    model,
    endpoint,
    level: 'A1',
    accepted: results.every((result) => result.accepted),
    cases: results,
  }, null, 2))
  if (results.some((result) => !result.accepted)) process.exitCode = 1
}
