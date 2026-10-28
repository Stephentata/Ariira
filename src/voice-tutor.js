export const VOICE_DAILY_TURN_LIMIT = 30
export const VOICE_DAILY_LIMIT_KEY = 'ari-voice-daily-turns'

const nextVoiceStage = Object.freeze({
  opening: 'name',
  name: 'small-talk',
  'small-talk': 'topic',
  topic: 'teaching',
  teaching: 'conversation',
  conversation: 'conversation',
})

export function getNextVoiceStage(stage, uncertainRecognition = false) {
  return uncertainRecognition ? stage : nextVoiceStage[stage] ?? 'opening'
}

export function consumeVoiceTurn(storage, now = new Date()) {
  const date = now.toISOString().slice(0, 10)
  let state
  try {
    state = JSON.parse(storage.getItem(VOICE_DAILY_LIMIT_KEY) ?? 'null')
  } catch {
    throw new Error('Your voice-practice limit could not be checked. Please refresh and try again.')
  }
  const count = state?.date === date && Number.isInteger(state.count) && state.count >= 0
    ? state.count
    : 0
  if (count >= VOICE_DAILY_TURN_LIMIT) {
    throw new Error('You’ve reached today’s voice-practice limit. Come back tomorrow, or keep practising by typing.')
  }
  try {
    storage.setItem(VOICE_DAILY_LIMIT_KEY, JSON.stringify({ date, count: count + 1 }))
  } catch {
    throw new Error('Your voice-practice limit could not be saved. Check your browser storage and try again.')
  }
  return count + 1
}

export function extractLearnerName(text, fallback = '') {
  const value = typeof text === 'string' ? text.trim() : ''
  const patterns = [
    /^(?:my name is|my name's|i am|i'm|call me|you can call me)\s+([\p{L}\p{M}' -]{1,60})[.!?,;]?$/iu,
    /^(?:我叫|我是)\s*([\p{L}\p{M}]{1,20})[。！？]?$/u,
    /^([\p{L}\p{M}]{1,30})[.!?。！？]?$/u,
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (!match) continue
    const name = match[1].trim().replace(/[.!?,;。！？]+$/u, '')
    if (name && !/^(?:yes|no|hello|hi|你好|是的|不是)$/iu.test(name)) return name
  }
  return fallback.trim()
}

export function stripTutorCardMarkers(text) {
  return text.replace(/\[\[card:\s*[\s\S]*?\]\]/gu, '').trim()
}

export function parseTutorCard(text) {
  const match = text.match(/\[\[card:\s*(\{[\s\S]*?\})\s*\]\]/u)
  const displayText = stripTutorCardMarkers(text)
  if (!match) return { displayText, card: null }
  try {
    const value = JSON.parse(match[1])
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { displayText, card: null }
    }
    const phrase = typeof value.phrase === 'string' ? value.phrase.trim() : ''
    if (!phrase) return { displayText, card: null }
    return {
      displayText,
      card: {
        phrase,
        pinyin: typeof value.pinyin === 'string' ? value.pinyin.trim() : '',
        meaning: typeof value.meaning === 'string' ? value.meaning.trim() : '',
        toneTip: typeof value.toneTip === 'string' ? value.toneTip.trim() : '',
      },
    }
  } catch {
    return { displayText, card: null }
  }
}

export function getStreamableTutorText(text) {
  const markerStart = text.lastIndexOf('[[')
  if (markerStart >= 0 && !text.slice(markerStart).includes(']]')) return text.slice(0, markerStart).trimEnd()
  const cardStart = text.indexOf('[[card:')
  const cardPrefixStart = text.lastIndexOf('[[card')
  if (cardStart >= 0) return text.slice(0, cardStart).trimEnd()
  if (cardPrefixStart >= 0 && text.length - cardPrefixStart < 8) return text.slice(0, cardPrefixStart).trimEnd()
  return text
}

export function takeCompleteSentences(text) {
  const sentences = []
  let start = 0
  const expression = /[.!?。！？]+(?:["'”’」』】）)]*)?(?:\s+|$)/gu
  for (const match of text.matchAll(expression)) {
    const end = match.index + match[0].length
    const sentence = text.slice(start, end).trim()
    if (sentence) sentences.push(sentence)
    start = end
  }
  return { sentences, remainder: text.slice(start) }
}

export async function streamTutorReply(response, onText) {
  if (!response.ok) {
    let message = `Tutor service failed (HTTP ${response.status}).`
    try {
      const body = await response.json()
      if (typeof body.error === 'string') message = body.error
    } catch {
      // Keep the HTTP error when the server does not return JSON.
    }
    throw new Error(message)
  }
  if (!response.body) throw new Error('Tutor service returned an empty response.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = ''
  const consumeLine = (line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(':') || trimmed === 'data: [DONE]') return
    const value = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
    let event
    try {
      event = JSON.parse(value)
    } catch {
      throw new Error('Tutor service returned an invalid streaming response.')
    }
    const token = typeof event.response === 'string'
      ? event.response
      : typeof event.text === 'string'
        ? event.text
        : typeof event.token === 'string' ? event.token : ''
    if (token) {
      result += token
      onText(result, token)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split(/\r?\n/u)
    buffer = lines.pop() ?? ''
    for (const line of lines) consumeLine(line)
    if (done) break
  }
  if (buffer.trim()) consumeLine(buffer)
  if (!result.trim()) throw new Error('Tutor service returned an empty reply.')
  return result.trim()
}
