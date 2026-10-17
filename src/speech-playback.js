import { buildLocalSpeechRequest, requestLocalSpeech } from './speech-options.js'

let playbackGeneration = 0
let activeController = null
let activeAudio = null
let activeObjectUrl = null
let activeAudioCancel = null
let activeSpeechSynthesis = null
let activeSpeechUtterance = null
let rejectActiveSpeech = null
let activeLevelCallback = null

const femaleVoiceNames = /\b(?:female|woman|girl|samantha|victoria|zira|karen|moira|tessa|susan|eva|alice|jenny|aria|ava)\b/i
const maleVoiceNames = /\b(?:male|man|boy|daniel|david|alex|fred|george|guy|james|oliver|tom)\b/i

export function prepareTutorSpeechText(text) {
  return text.replace(/\bAri\b/gi, 'Ah-ree').replace(/\bIra\b/gi, 'Eye-rah')
}

export function selectBrowserSpeechVoice(voices, locale, gender, flavor = '') {
  if (!Array.isArray(voices) || typeof locale !== 'string' || !locale.trim()) return null
  if (gender !== 'female' && gender !== 'male') return null
  const genderPattern = gender === 'female' ? femaleVoiceNames : maleVoiceNames
  const language = locale.split('-')[0].toLowerCase()
  const matchingLanguage = voices.filter((voice) => voice.lang?.split('-')[0].toLowerCase() === language)
  const flavorPattern = {
    Warm: /\b(?:warm|natural|soft|samantha|karen)\b/i,
    Lively: /\b(?:lively|bright|energetic|jenny|aria)\b/i,
    Clear: /\b(?:clear|neural|premium|ava)\b/i,
    Airy: /\b(?:airy|light|moira|tessa)\b/i,
    Playful: /\b(?:playful|fun|alex|guy)\b/i,
    Deep: /\b(?:deep|rich|daniel|david|george)\b/i,
    Bold: /\b(?:bold|strong|tom|james)\b/i,
    Calm: /\b(?:calm|relaxed|fred|oliver)\b/i,
  }[flavor]
  return matchingLanguage.find((voice) => flavorPattern?.test(voice.name ?? '') && genderPattern.test(voice.name ?? ''))
    ?? matchingLanguage.find((voice) => genderPattern.test(voice.name ?? ''))
    ?? voices.find((voice) => genderPattern.test(voice.name ?? ''))
    ?? null
}

export function cancelSpeechPlayback() {
  playbackGeneration += 1
  activeLevelCallback?.(0)
  activeLevelCallback = null
  const cancelAudio = activeAudioCancel
  activeAudioCancel = null
  cancelAudio?.(new DOMException('Speech playback was cancelled.', 'AbortError'))
  activeController?.abort()
  activeController = null

  if (activeAudio) {
    activeAudio.onended = null
    activeAudio.onerror = null
    activeAudio.pause()
    activeAudio.removeAttribute('src')
    activeAudio.load()
    activeAudio = null
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl)
    activeObjectUrl = null
  }
  if (activeSpeechSynthesis) {
    const synthesis = activeSpeechSynthesis
    const reject = rejectActiveSpeech
    activeSpeechSynthesis = null
    activeSpeechUtterance = null
    reject?.(new DOMException('Speech playback was cancelled.', 'AbortError'))
    rejectActiveSpeech = null
    synthesis.cancel()
  }
}

function playBrowserSpeech(text, locale, gender, browserApis, generation, localError, options) {
  const synthesis = browserApis.speechSynthesis
  const Utterance = browserApis.SpeechSynthesisUtterance
  if (!synthesis || typeof Utterance !== 'function') throw localError

  const utterance = new Utterance(text)
  utterance.lang = locale
  const voice = selectBrowserSpeechVoice(synthesis.getVoices(), locale, gender, options.flavor)
  if (!voice) {
    throw new Error(`No ${gender}-sounding browser voice is available. Enable a matching voice on this device or start Ari’s local speech service.`)
  }
  utterance.voice = voice
  utterance.rate = options.rate
  activeSpeechSynthesis = synthesis
  activeSpeechUtterance = utterance
  activeLevelCallback = options.onLevel ?? null

  return new Promise((resolve, reject) => {
    let boundaryTimer = null
    const reportLevel = (level) => options.onLevel?.(level)
    const cleanup = () => {
      utterance.onend = null
      utterance.onerror = null
      utterance.onstart = null
      utterance.onboundary = null
      if (boundaryTimer !== null) clearTimeout(boundaryTimer)
      reportLevel(0)
      if (activeSpeechUtterance === utterance) activeSpeechUtterance = null
      if (activeSpeechSynthesis === synthesis) activeSpeechSynthesis = null
      if (rejectActiveSpeech === cancel) rejectActiveSpeech = null
    }
    const cancel = (error) => {
      cleanup()
      reject(error)
    }
    rejectActiveSpeech = cancel
    utterance.onstart = () => reportLevel(0.35)
    utterance.onboundary = (event) => {
      reportLevel(0.75)
      options.onBoundary?.(event.charIndex, event.charLength)
      if (boundaryTimer !== null) clearTimeout(boundaryTimer)
      boundaryTimer = setTimeout(() => reportLevel(0.25), 100)
    }
    utterance.onend = () => {
      cleanup()
      resolve()
    }
    utterance.onerror = (event) => {
      cleanup()
      reject(new Error(`Browser speech synthesis failed (${event.error || 'unknown error'}).`))
    }

    try {
      if (generation !== playbackGeneration) {
        cancel(new DOMException('Speech playback was cancelled.', 'AbortError'))
        return
      }
      synthesis.speak(utterance)
    } catch (error) {
      cleanup()
      reject(error instanceof Error ? error : new Error('Browser speech synthesis could not start.'))
    }
  })
}

export async function playSpeechAudio(text, locale, gender, browserApis = globalThis, options = {}) {
  const speechText = prepareTutorSpeechText(text)
  buildLocalSpeechRequest(speechText, locale, gender)
  cancelSpeechPlayback()
  const generation = playbackGeneration
  const controller = new AbortController()
  activeController = controller
  let audioBlob
  try {
    audioBlob = await requestLocalSpeech(speechText, locale, gender, fetch, controller.signal)
  } catch (error) {
    if (
      generation !== playbackGeneration ||
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === 'AbortError')
    ) {
      throw error
    }
    activeController = null
    return playBrowserSpeech(speechText, locale, gender, browserApis, generation, error, options)
  }

  if (generation !== playbackGeneration || controller.signal.aborted) {
    throw new DOMException('Speech playback was cancelled.', 'AbortError')
  }

  activeController = null
  const objectUrl = URL.createObjectURL(audioBlob)
  const audio = new Audio(objectUrl)
  activeObjectUrl = objectUrl
  activeAudio = audio
  activeLevelCallback = options.onLevel ?? null

  return new Promise((resolve, reject) => {
    let audioContext = null
    let animationFrame = null
    let lastBoundaryStart = -1
    const reportLevel = (level) => options.onLevel?.(level)
    const cleanup = () => {
      audio.onended = null
      audio.onerror = null
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
      reportLevel(0)
      if (activeAudio === audio) activeAudio = null
      if (activeObjectUrl === objectUrl) activeObjectUrl = null
      if (activeAudioCancel === cancel) activeAudioCancel = null
      URL.revokeObjectURL(objectUrl)
      if (audioContext) {
        void audioContext.close().catch((error) => options.onLevelError?.(error))
      }
    }
    const cancel = (error) => {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      cleanup()
      reject(error)
    }
    audio.onended = () => {
      cleanup()
      resolve()
    }
    audio.onerror = () => {
      cleanup()
      reject(new Error('Your browser could not play the audio generated by Ari’s local voice service.'))
    }
    activeAudioCancel = cancel
    try {
      audioContext = new AudioContext()
      const source = audioContext.createMediaElementSource(audio)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyser.connect(audioContext.destination)
      const samples = new Uint8Array(analyser.frequencyBinCount)
      const sampleLevel = () => {
        analyser.getByteTimeDomainData(samples)
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length)
        reportLevel(Math.min(1, rms * 4))
        if (Number.isFinite(audio.duration) && audio.duration > 0 && text.length > 0) {
          const currentCharacter = Math.min(text.length - 1, Math.floor(audio.currentTime / audio.duration * text.length))
          const wordStart = text.lastIndexOf(' ', currentCharacter) + 1
          if (wordStart !== lastBoundaryStart) {
            lastBoundaryStart = wordStart
            const nextSpace = text.indexOf(' ', currentCharacter)
            options.onBoundary?.(wordStart, (nextSpace < 0 ? text.length : nextSpace) - wordStart)
          }
        }
        animationFrame = requestAnimationFrame(sampleLevel)
      }
      animationFrame = requestAnimationFrame(sampleLevel)
    } catch (error) {
      options.onLevelError?.(error)
      reportLevel(0.35)
    }
    audio.play().catch((error) => {
      cleanup()
      reject(error instanceof Error ? error : new Error('Audio playback was blocked by the browser.'))
    })
  })
}
