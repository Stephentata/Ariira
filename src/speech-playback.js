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
const cloudSpeechCache = new Map()
let unlockedAudioContext = null

const femaleVoiceNames = /\b(?:female|woman|girl|samantha|victoria|zira|karen|moira|tessa|susan|eva|alice|jenny|aria|ava)\b/i
const maleVoiceNames = /\b(?:male|man|boy|daniel|david|alex|fred|george|guy|james|oliver|tom)\b/i

export function prepareTutorSpeechText(text) {
  return text.replace(/\bAri\b/gi, 'Ah-ree').replace(/\bIra\b/gi, 'Eye-rah')
}

export function unlockSpeechPlayback(browserApis = globalThis, onError = () => {}) {
  try {
    const synthesis = browserApis.speechSynthesis
    const Utterance = browserApis.SpeechSynthesisUtterance
    if (synthesis && typeof Utterance === 'function') {
      synthesis.resume()
      const silentUtterance = new Utterance(' ')
      silentUtterance.volume = 0
      synthesis.speak(silentUtterance)
    }
    const AudioContextConstructor = browserApis.AudioContext
      ?? browserApis.webkitAudioContext
    if (typeof AudioContextConstructor === 'function') {
      unlockedAudioContext ??= new AudioContextConstructor()
      void unlockedAudioContext.resume().catch(onError)
      const oscillator = unlockedAudioContext.createOscillator()
      const gain = unlockedAudioContext.createGain()
      gain.gain.value = 0
      oscillator.connect(gain)
      gain.connect(unlockedAudioContext.destination)
      oscillator.start()
      oscillator.stop(unlockedAudioContext.currentTime + 0.01)
    }
  } catch (error) {
    onError(error)
  }
}

export function selectBrowserSpeechVoice(voices, locale, gender, flavor = '', nameHints = []) {
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
  const prioritizedHints = Array.isArray(nameHints)
    ? nameHints.filter((hint) => typeof hint === 'string' && hint.trim())
    : []
  for (const hint of prioritizedHints) {
    const match = matchingLanguage.find((voice) => (voice.name ?? '').toLowerCase().includes(hint.toLowerCase()))
    if (match) return match
  }
  return matchingLanguage.find((voice) => flavorPattern?.test(voice.name ?? '') && genderPattern.test(voice.name ?? ''))
    ?? matchingLanguage.find((voice) => genderPattern.test(voice.name ?? ''))
    ?? matchingLanguage[0]
    ?? null
}

function getVoiceDelivery(flavor, rate) {
  const styles = {
    Warm: { rate: 1.02, pitch: 1.02 },
    Lively: { rate: 1.06, pitch: 1.08 },
    Clear: { rate: 1.03, pitch: 1.02 },
    Airy: { rate: 1.03, pitch: 1.06 },
    Playful: { rate: 1.05, pitch: 1.07 },
    Deep: { rate: 1, pitch: 0.94 },
    Bold: { rate: 1.04, pitch: 1.01 },
    Calm: { rate: 0.97, pitch: 0.98 },
  }
  const style = styles[flavor] ?? { rate: 1, pitch: 1 }
  const requestedRate = Number.isFinite(rate) ? rate : 1
  return {
    rate: Math.min(1.25, Math.max(0.75, requestedRate * style.rate)),
    pitch: style.pitch,
  }
}

async function getBrowserSpeechVoices(synthesis) {
  const voices = synthesis.getVoices()
  if (voices.length || typeof synthesis.addEventListener !== 'function') return voices
  return new Promise((resolve) => {
    let timeout
    const finish = () => {
      synthesis.removeEventListener?.('voiceschanged', finish)
      clearTimeout(timeout)
      resolve(synthesis.getVoices())
    }
    synthesis.addEventListener('voiceschanged', finish, { once: true })
    timeout = setTimeout(finish, 1200)
  })
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

async function playBrowserSpeech(text, locale, gender, browserApis, generation, localError, options) {
  const synthesis = browserApis.speechSynthesis
  const Utterance = browserApis.SpeechSynthesisUtterance
  if (!synthesis || typeof Utterance !== 'function') throw localError

  activeSpeechSynthesis = synthesis
  const voices = await getBrowserSpeechVoices(synthesis)
  if (generation !== playbackGeneration) {
    throw new DOMException('Speech playback was cancelled.', 'AbortError')
  }
  const utterance = new Utterance(text)
  utterance.lang = locale
  const voice = selectBrowserSpeechVoice(voices, locale, gender, options.flavor, options.voiceNameHints)
  if (!voice) {
    activeSpeechSynthesis = null
    throw new Error(`No installed browser voice supports ${locale}. Configure hosted speech for this language or add a matching voice in your device settings. Speech service detail: ${localError instanceof Error ? localError.message : 'unavailable'}`)
  }
  const delivery = getVoiceDelivery(options.flavor, options.rate)
  utterance.voice = voice
  utterance.rate = delivery.rate
  utterance.pitch = delivery.pitch
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
  if (options.provider === 'browser') {
    return playBrowserSpeech(
      speechText,
      locale,
      gender,
      browserApis,
      generation,
      new Error('Browser speech synthesis was selected.'),
      options,
    )
  }
  const controller = new AbortController()
  activeController = controller
  let audioBlob
  try {
    const cacheKey = `${locale.toLowerCase()}|${gender}|${speechText}`
    audioBlob = cloudSpeechCache.get(cacheKey)
    if (!audioBlob) {
      audioBlob = await requestLocalSpeech(speechText, locale, gender, options.fetcher ?? fetch, controller.signal)
      if (cloudSpeechCache.size >= 64) cloudSpeechCache.delete(cloudSpeechCache.keys().next().value)
      cloudSpeechCache.set(cacheKey, audioBlob)
    }
  } catch (error) {
    if (
      generation !== playbackGeneration ||
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === 'AbortError')
    ) {
      throw error
    }
    activeController = null
    options.onFallback?.(error)
    return playBrowserSpeech(speechText, locale, gender, browserApis, generation, error, options)
  }

  if (generation !== playbackGeneration || controller.signal.aborted) {
    throw new DOMException('Speech playback was cancelled.', 'AbortError')
  }

  activeController = null
  const objectUrl = URL.createObjectURL(audioBlob)
  const AudioConstructor = browserApis.Audio ?? Audio
  const audio = new AudioConstructor(objectUrl)
  audio.playbackRate = getVoiceDelivery(options.flavor, options.rate).rate
  activeObjectUrl = objectUrl
  activeAudio = audio
  activeLevelCallback = options.onLevel ?? null

  try {
    await new Promise((resolve, reject) => {
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
  } catch (error) {
    if (
      generation !== playbackGeneration ||
      (error instanceof DOMException && error.name === 'AbortError')
    ) {
      throw error
    }
    options.onFallback?.(error)
    return playBrowserSpeech(speechText, locale, gender, browserApis, generation, error, options)
  }
}
