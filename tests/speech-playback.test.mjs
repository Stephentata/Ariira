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
  assert.equal(selectBrowserSpeechVoice(voices, 'de-DE', 'female'), voices[1])
  assert.equal(selectBrowserSpeechVoice([], 'fr-FR', 'female'), null)
  assert.equal(selectBrowserSpeechVoice([{ name: 'Default Voice', lang: 'fr-FR', default: true }], 'fr-FR', 'female'), null)
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
    /local voice service is not responding on port 3901/,
  )
})

test('browser fallback refuses an unverified or mismatched voice', async () => {
  const browser = createBrowserSpeech([{ name: 'Male English', lang: 'en-US', default: true }])
  await assert.rejects(
    playSpeechAudio('Hello', 'en-US', 'female', browser.apis),
    /No female-sounding browser voice is available/,
  )
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
