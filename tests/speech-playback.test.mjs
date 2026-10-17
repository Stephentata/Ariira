import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cancelSpeechPlayback,
  playSpeechAudio,
  selectBrowserSpeechVoice,
} from '../src/speech-playback.js'

class FakeUtterance {
  constructor(text) {
    this.text = text
    this.lang = ''
    this.voice = null
    this.onend = null
    this.onerror = null
  }
}

function createBrowserSpeech(voices, { finish = true } = {}) {
  let utterance = null
  let cancelled = false
  const synthesis = {
    getVoices: () => voices,
    speak: (item) => {
      utterance = item
      if (finish) queueMicrotask(() => item.onend?.())
    },
    cancel: () => { cancelled = true },
  }
  return {
    apis: { speechSynthesis: synthesis, SpeechSynthesisUtterance: FakeUtterance },
    getUtterance: () => utterance,
    wasCancelled: () => cancelled,
  }
}

test('browser voice selection prefers the requested gender in the target language', () => {
  const voices = [
    { name: 'Male French', lang: 'fr-FR' },
    { name: 'Female French', lang: 'fr-CA' },
    { name: 'Female English', lang: 'en-US' },
  ]
  assert.equal(selectBrowserSpeechVoice(voices, 'fr-FR', 'female'), voices[1])
  assert.equal(selectBrowserSpeechVoice(voices, 'fr-FR', 'male'), voices[0])
  assert.equal(selectBrowserSpeechVoice(voices, 'de-DE', 'female'), null)
  assert.equal(selectBrowserSpeechVoice([{ name: 'Windows French', lang: 'fr-FR' }], 'fr-FR', 'male').name, 'Windows French')
  assert.equal(selectBrowserSpeechVoice([], 'fr-FR', 'female'), null)
  assert.equal(selectBrowserSpeechVoice([{ name: 'Default Voice', lang: 'fr-FR', default: true }], 'fr-FR', 'female')?.name, 'Default Voice')
})

test('local playback failure falls back to browser synthesis using the selected voice and locale', async () => {
  const voices = [
    { name: 'French female', lang: 'fr-FR' },
    { name: 'French male', lang: 'fr-FR' },
  ]
  const browser = createBrowserSpeech(voices)

  await playSpeechAudio('Bonjour !', 'fr-FR', 'female', browser.apis)

  assert.equal(browser.getUtterance().text, 'Bonjour !')
  assert.equal(browser.getUtterance().lang, 'fr-FR')
  assert.equal(browser.getUtterance().voice, voices[0])
})

test('spoken tutor names use their supplied phonetic forms in browser fallback', async () => {
  const browser = createBrowserSpeech([{ name: 'Female English', lang: 'en-US' }])
  await playSpeechAudio('I’m Ari, and this is Ira.', 'en-US', 'female', browser.apis)

  assert.equal(browser.getUtterance().text, 'I’m Ah-ree, and this is Eye-rah.')
})

test('local playback errors remain explicit when browser synthesis is unavailable', async () => {
  await assert.rejects(
    playSpeechAudio('Hello', 'en-US', 'female', {}),
    /speech service is not responding.*Check the server connection/,
  )
})

test('browser fallback prefers the target language when voice gender is not identifiable', async () => {
  const voice = { name: 'Windows English', lang: 'en-US', default: true }
  const browser = createBrowserSpeech([voice])
  await playSpeechAudio('Hello', 'en-US', 'female', browser.apis)
  assert.equal(browser.getUtterance().voice, voice)
})

test('browser fallback error includes the missing hosted speech configuration', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: 'Cloudflare Workers AI is not configured. Add the AI binding to the Pages project.',
  }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  try {
    const browser = createBrowserSpeech([])
    await assert.rejects(
      playSpeechAudio('Hello', 'en-GB', 'female', browser.apis),
      /No installed browser voice supports en-GB.*Add the AI binding to the Pages project/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('browser fallback waits briefly for asynchronously loaded device voices', async () => {
  let voices = []
  let voicesChanged
  let utterance
  const voice = { name: 'Windows French', lang: 'fr-FR' }
  const synthesis = {
    getVoices: () => voices,
    addEventListener: (_type, listener) => { voicesChanged = listener },
    removeEventListener: () => { voicesChanged = null },
    speak: (item) => {
      utterance = item
      queueMicrotask(() => item.onend?.())
    },
    cancel: () => {},
  }
  const playback = playSpeechAudio('Bonjour !', 'fr-FR', 'female', {
    speechSynthesis: synthesis,
    SpeechSynthesisUtterance: FakeUtterance,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(typeof voicesChanged, 'function')
  voices = [voice]
  voicesChanged()
  await playback
  assert.equal(utterance.voice, voice)
})

test('lively and playful browser styles adjust delivery while preserving the selected voice', async () => {
  const livelyVoice = { name: 'Windows French', lang: 'fr-FR' }
  const livelyBrowser = createBrowserSpeech([livelyVoice])
  await playSpeechAudio('Bonjour !', 'fr-FR', 'female', livelyBrowser.apis, { flavor: 'Lively', rate: 1 })
  assert.equal(livelyBrowser.getUtterance().voice, livelyVoice)
  assert.equal(livelyBrowser.getUtterance().rate, 1.06)
  assert.equal(livelyBrowser.getUtterance().pitch, 1.08)

  const playfulBrowser = createBrowserSpeech([{ name: 'Windows English', lang: 'en-GB' }])
  await playSpeechAudio('Hello!', 'en-GB', 'male', playfulBrowser.apis, { flavor: 'Playful', rate: 1 })
  assert.equal(playfulBrowser.getUtterance().rate, 1.05)
  assert.equal(playfulBrowser.getUtterance().pitch, 1.07)
})

test('cancelling browser speech rejects its pending playback as an abort', async () => {
  const browser = createBrowserSpeech([{ name: 'Male English', lang: 'en-US' }], { finish: false })
  const playback = playSpeechAudio('Hello', 'en-US', 'male', browser.apis)
  await new Promise((resolve) => setTimeout(resolve, 0))
  cancelSpeechPlayback()

  await assert.rejects(playback, { name: 'AbortError' })
  assert.equal(browser.wasCancelled(), true)
})

test('browser speech reports output activity and clears its level when playback ends', async () => {
  const browser = createBrowserSpeech([{ name: 'Female English', lang: 'en-US' }], { finish: false })
  const levels = []
  const playback = playSpeechAudio('Listen to me speak.', 'en-US', 'female', browser.apis, {
    onLevel: (level) => levels.push(level),
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  const utterance = browser.getUtterance()
  utterance.onstart()
  utterance.onboundary()
  utterance.onend()
  await playback

  assert.ok(levels.includes(0.35))
  assert.ok(levels.includes(0.75))
  assert.equal(levels.at(-1), 0)
})
