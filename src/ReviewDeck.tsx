import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  DAILY_REVIEW_LIMIT,
  getDailyReviewCount,
  getDueReviewCards,
  readReviewDeck,
  saveReviewDeck,
  scheduleReview,
  type RecallRating,
  type ReviewCard,
} from './review-scheduler.js'
import {
  encodePcm16Wav,
  LocalWhisperPronunciationProvider,
  type PronunciationResult,
} from './pronunciation-provider.js'
import { getTutorSpeechGender } from './speech-options.js'
import { readLearnerSettings } from './learner-data.js'
import { playSpeechAudio } from './speech-playback.js'
import { LANGUAGES } from './language-options.js'

type ReviewMode = 'flashcard' | 'listen-and-type' | 'speak-word' | 'use-in-a-sentence'
const MAX_PRONUNCIATION_RECORDING_MS = 10_000
type ReviewState = { cards: ReviewCard[]; error: string; reviewedToday: number }

const modes: { id: ReviewMode; label: string }[] = [
  { id: 'flashcard', label: 'Flashcard' },
  { id: 'listen-and-type', label: 'Listen & type' },
  { id: 'speak-word', label: 'Speak the word' },
  { id: 'use-in-a-sentence', label: 'Use in a sentence' },
]
const ratings: { id: RecallRating; label: string }[] = [
  { id: 'again', label: 'Again' },
  { id: 'hard', label: 'Hard' },
  { id: 'good', label: 'Good' },
  { id: 'easy', label: 'Easy' },
]

function normalizeAnswer(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

function getInitialReviewState(): ReviewState {
  try {
    const saved = readReviewDeck(window.localStorage)
    return {
      cards: saved ?? [],
      error: '',
      reviewedToday: getDailyReviewCount(saved ?? []),
    }
  } catch (error) {
    return {
      cards: [],
      error: error instanceof Error ? error.message : 'Could not load your review deck.',
      reviewedToday: 0,
    }
  }
}

function useReviewDeck(targetLanguageCode: string) {
  const [state, setState] = useState(getInitialReviewState)
  const [now] = useState(() => new Date())

  function rateCard(card: ReviewCard, rating: RecallRating) {
    if (state.reviewedToday >= DAILY_REVIEW_LIMIT) {
      setState((current) => ({
        ...current,
        error: `The daily review limit of ${DAILY_REVIEW_LIMIT} cards has been reached.`,
      }))
      return
    }
    const cards = state.cards.map((item) => item.id === card.id ? scheduleReview(item, rating) : item)
    try {
      saveReviewDeck(window.localStorage, cards)
      const reviewedToday = getDailyReviewCount(cards)
      setState({ cards, error: '', reviewedToday })
    } catch (error) {
      setState({
        cards,
        error: error instanceof Error ? error.message : 'Could not save your review deck on this device.',
        reviewedToday: state.reviewedToday,
      })
    }
  }

  return {
    ...state,
    cards: state.cards.filter((card) => (card.languageCode ?? 'zh') === targetLanguageCode),
    now,
    rateCard,
  }
}

function playCardWord(word: string, locale: string, setMessage: (message: string) => void) {
  try {
    const gender = getTutorSpeechGender(readLearnerSettings(window.localStorage).tutorName)
    setMessage('Generating speech locally with Ari’s voice service…')
    void playSpeechAudio(word, locale, gender).then(
      () => setMessage(''),
      (error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setMessage(error instanceof Error ? `Voice playback failed: ${error.message}` : 'Voice playback failed.')
      },
    )
  } catch (error) {
    setMessage(error instanceof Error ? `Voice playback failed: ${error.message}` : 'Voice playback failed.')
  }
}

function reviewCardsFor(cards: ReviewCard[], limit: number, now: Date) {
  return getDueReviewCards(cards, now, limit)
}

function ReviewFlow({
  cards,
  rateCard,
  compact = false,
  emptyTitle,
  emptyDescription,
}: {
  cards: ReviewCard[]
  rateCard: (card: ReviewCard, rating: RecallRating) => void
  compact?: boolean
  emptyTitle?: string
  emptyDescription?: string
}) {
  const [mode, setMode] = useState<ReviewMode>('flashcard')
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState('')
  const [answerChecked, setAnswerChecked] = useState<boolean | null>(null)
  const [speechResult, setSpeechResult] = useState('')
  const [pronunciationResult, setPronunciationResult] = useState<PronunciationResult | null>(null)
  const [learnerAudioUrl, setLearnerAudioUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [speechError, setSpeechError] = useState('')
  const [isRequestingMicrophone, setIsRequestingMicrophone] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])
  const pcmChunksRef = useRef<Float32Array[]>([])
  const pcmSampleRateRef = useRef(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const captureTimerRef = useRef<number | null>(null)
  const captureRequestRef = useRef(false)
  const learnerAudioUrlRef = useRef('')
  const mountedRef = useRef(true)
  const [pronunciationProvider] = useState(() => new LocalWhisperPronunciationProvider())
  const card = cards[0]
  const targetLanguage = LANGUAGES.find((language) => language.code === (card?.languageCode ?? 'zh')) ?? LANGUAGES[0]
  const targetLocale = targetLanguage.locale
  const targetLanguageName = targetLanguage.name

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current)
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.ondataavailable = null
        recorder.onerror = null
        recorder.onstop = null
        recorder.stop()
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      stopPcmCapture()
      pronunciationProvider.dispose()
      if (learnerAudioUrlRef.current) URL.revokeObjectURL(learnerAudioUrlRef.current)
    }
  }, [learnerAudioUrlRef, pronunciationProvider])

  function stopPcmCapture() {
    if (audioProcessorRef.current) {
      audioProcessorRef.current.onaudioprocess = null
      audioProcessorRef.current.disconnect()
      audioProcessorRef.current = null
    }
    audioSourceRef.current?.disconnect()
    audioSourceRef.current = null
    const context = audioContextRef.current
    audioContextRef.current = null
    if (context && context.state !== 'closed') {
      void context.close().catch((error: unknown) => {
        console.error('Could not close the pronunciation audio context.', error)
      })
    }
  }

  function collectPcmSamples() {
    const chunks = pcmChunksRef.current
    pcmChunksRef.current = []
    const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0)
    const samples = new Float32Array(sampleCount)
    let offset = 0
    for (const chunk of chunks) {
      samples.set(chunk, offset)
      offset += chunk.length
    }
    return samples
  }

  function clearLearnerAudio() {
    if (learnerAudioUrlRef.current) URL.revokeObjectURL(learnerAudioUrlRef.current)
    learnerAudioUrlRef.current = ''
    setLearnerAudioUrl('')
  }

  function stopSpeechPractice() {
    if (captureTimerRef.current !== null) {
      window.clearTimeout(captureTimerRef.current)
      captureTimerRef.current = null
    }
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    setIsCapturing(false)
    setIsTranscribing(true)
    setNotice('Recording stopped. Preparing your speech for local transcription…')
    recorder.stop()
  }

  async function startSpeechPractice() {
    if (captureRequestRef.current || isCapturing || isTranscribing) return
    captureRequestRef.current = true
    setSpeechResult('')
    setPronunciationResult(null)
    clearLearnerAudio()
    setSpeechError('')
    setIsTranscribing(false)
    setIsRequestingMicrophone(true)
    setNotice('Requesting microphone access…')

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' || typeof AudioContext === 'undefined') {
      captureRequestRef.current = false
      setIsRequestingMicrophone(false)
      setSpeechError('Microphone recording or local audio processing is not supported in this browser. Try current Chrome or Edge on localhost or a secure page.')
      setNotice('')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        captureRequestRef.current = false
        return
      }

      mediaStreamRef.current = stream
      audioChunksRef.current = []
      pcmChunksRef.current = []
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      await audioContext.resume()
      pcmSampleRateRef.current = audioContext.sampleRate
      const audioSource = audioContext.createMediaStreamSource(stream)
      const audioProcessor = audioContext.createScriptProcessor(4096, 1, 1)
      const silentOutput = audioContext.createGain()
      silentOutput.gain.value = 0
      audioProcessor.onaudioprocess = (event) => {
        pcmChunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)))
      }
      audioSource.connect(audioProcessor)
      audioProcessor.connect(silentOutput)
      silentOutput.connect(audioContext.destination)
      audioSourceRef.current = audioSource
      audioProcessorRef.current = audioProcessor

      captureRequestRef.current = false
      setIsRequestingMicrophone(false)
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onerror = (event) => {
        setIsCapturing(false)
        if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current)
        captureTimerRef.current = null
        recorder.onstop = null
        setSpeechError(`Microphone recording failed: ${event.error.message || 'unknown recorder error'}. Please try again.`)
        setNotice('')
        stream.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
        stopPcmCapture()
        pcmChunksRef.current = []
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
        const samples = collectPcmSamples()
        const sampleRate = pcmSampleRateRef.current
        pcmSampleRateRef.current = 0
        stopPcmCapture()
        if (!mountedRef.current) return
        const recording = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        audioChunksRef.current = []
        if (recording.size === 0 || samples.length === 0) {
          setIsTranscribing(false)
          setNotice('')
          setSpeechError('No audio was captured. Please record the word again.')
          return
        }

        const audioUrl = URL.createObjectURL(recording)
        learnerAudioUrlRef.current = audioUrl
        setLearnerAudioUrl(audioUrl)
        setNotice('Preparing local Whisper Tiny. On first use, its model files download once.')
        let transcriptionAudio: Blob
        try {
          transcriptionAudio = encodePcm16Wav(samples, sampleRate)
        } catch (error) {
          setIsTranscribing(false)
          setNotice('')
          setSpeechError(error instanceof Error ? error.message : 'The microphone audio could not be prepared for transcription.')
          return
        }
        void pronunciationProvider.assess(transcriptionAudio, card.word, targetLocale, setNotice)
          .then((result) => {
            if (!mountedRef.current) return
            setSpeechResult(result.recognizedText)
            setPronunciationResult(result)
            setNotice('')
          })
          .catch((error: unknown) => {
            if (!mountedRef.current) return
            setSpeechError(error instanceof Error ? error.message : 'Could not transcribe this recording. Please try again.')
            setNotice('')
          })
          .finally(() => {
            if (mountedRef.current) setIsTranscribing(false)
          })
      }
      recorder.start()
      setIsCapturing(true)
      setNotice('Recording on this device. Say the target, then press Stop. Ari does not save or upload the audio.')
      captureTimerRef.current = window.setTimeout(stopSpeechPractice, MAX_PRONUNCIATION_RECORDING_MS)
    } catch (error) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
      mediaRecorderRef.current = null
      stopPcmCapture()
      pcmChunksRef.current = []
      pcmSampleRateRef.current = 0
      captureRequestRef.current = false
      setIsRequestingMicrophone(false)
      setIsCapturing(false)
      setNotice('')
      const name = error instanceof DOMException ? error.name : ''
      const message = name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Microphone permission was denied or blocked. Allow microphone access for this site in browser settings, then try again.'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError'
          ? 'No microphone was found. Connect or select a microphone, then try again.'
          : name === 'NotReadableError' || name === 'TrackStartError'
            ? 'The microphone is unavailable or being used by another app. Close other microphone apps and try again.'
            : error instanceof Error
              ? `Could not start microphone recording: ${error.message}`
              : 'Could not start microphone recording. Check microphone access and try again.'
      setSpeechError(message)
    }
  }

  function checkTypedAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!card || !answer.trim()) return
    setAnswerChecked(normalizeAnswer(answer) === normalizeAnswer(card.word))
  }

  function submitRating(rating: RecallRating) {
    if (!card) return
    rateCard(card, rating)
  }

  if (!card) {
    return (
      <div className={`review-empty ${compact ? 'is-compact' : ''}`} role="status">
        <strong>{emptyTitle ?? (compact ? 'Warm-up complete' : 'You’re all caught up')}</strong>
        <p>{emptyDescription ?? (compact ? 'That’s today’s due-word warm-up. You can keep going with your lesson.' : 'No more words are due today. New words will appear in a future review queue.')}</p>
      </div>
    )
  }

  return (
    <section className={`review-session ${compact ? 'is-compact' : ''}`} aria-label="Vocabulary review">
      <div className="review-session-heading">
        <span>{compact ? 'WARM-UP RECALL' : 'TODAY’S REVIEW'}</span>
        <strong>{compact ? `${cards.length} due in this warm-up` : `${cards.length} due · up to ${DAILY_REVIEW_LIMIT} per day`}</strong>
      </div>
      {!compact && (
        <div className="review-mode-list" aria-label="Review mode">
          {modes.map((item) => (
            <button
              className={`review-mode-button ${mode === item.id ? 'is-active' : ''}`}
              type="button"
              key={item.id}
              aria-pressed={mode === item.id}
              disabled={isRequestingMicrophone || isCapturing || isTranscribing}
              onClick={() => {
                setMode(item.id)
                setRevealed(false)
                setAnswer('')
                setAnswerChecked(null)
                setSpeechResult('')
                setPronunciationResult(null)
                clearLearnerAudio()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <article className="review-prompt-card">
        {mode === 'flashcard' && (
          <>
            <span className="review-card-kicker">WHAT DOES THIS MEAN?</span>
            <strong className="review-word" lang={targetLocale}>{card.word}</strong>
            {card.transliteration && <span className="review-pronunciation">{card.transliteration}</span>}
            {revealed ? (
              <div className="review-answer">
                <strong>{card.translation}</strong>
                {card.exampleSentence && <p lang={targetLocale}>{card.exampleSentence}</p>}
              </div>
            ) : (
              <button className="button button-outline" type="button" onClick={() => setRevealed(true)}>Reveal meaning</button>
            )}
          </>
        )}

        {mode === 'listen-and-type' && (
          <>
            <span className="review-card-kicker">LISTEN AND TYPE THE {targetLanguageName.toUpperCase()}</span>
            <strong className="review-word-prompt">{card.translation}</strong>
            <button className="button button-outline" type="button" onClick={() => playCardWord(card.word, targetLocale, setNotice)}>Hear the word</button>
            <form className="review-answer-form" onSubmit={checkTypedAnswer}>
              <label htmlFor="review-typed-answer">Your spelling</label>
              <input id="review-typed-answer" lang={targetLocale} autoComplete="off" value={answer} onChange={(event) => { setAnswer(event.target.value); setAnswerChecked(null) }} />
              <button className="button button-dark" type="submit" disabled={!answer.trim()}>Check spelling</button>
            </form>
            {answerChecked !== null && <p className={`review-result ${answerChecked ? 'is-correct' : 'is-incorrect'}`} role="status">{answerChecked ? 'Correct — nicely heard.' : `Not quite. The word is ${card.word}.`}</p>}
          </>
        )}

        {mode === 'speak-word' && (
          <>
            <span className="review-card-kicker">SAY THE WORD IN {targetLanguageName.toUpperCase()}</span>
            <strong className="review-word-prompt">{card.translation}</strong>
            <button className="button button-outline" type="button" onClick={() => playCardWord(card.word, targetLocale, setNotice)}>Hear example pronunciation</button>
            <button
              className="button button-dark"
              type="button"
              onClick={isCapturing ? stopSpeechPractice : startSpeechPractice}
              disabled={isRequestingMicrophone || isTranscribing}
            >
              {isRequestingMicrophone ? 'Waiting for microphone…' : isCapturing ? 'Stop recording' : isTranscribing ? 'Checking locally…' : 'Speak now'}
            </button>
            {speechResult && <p className="review-result" lang={targetLocale}>Heard: {speechResult}</p>}
            {learnerAudioUrl && (
              <div className="pronunciation-audio-compare" aria-label="Compare your recording with the model">
                <div>
                  <strong>Your recording</strong>
                  <audio controls preload="none" src={learnerAudioUrl} aria-label="Play your pronunciation recording" />
                </div>
                <div>
                  <strong>Example pronunciation · browser voice</strong>
                  <button className="button button-outline" type="button" onClick={() => playCardWord(card.word, targetLocale, setNotice)}>Play example</button>
                </div>
              </div>
            )}
            {pronunciationResult && (
              <section className={`pronunciation-feedback is-${pronunciationResult.status}`} aria-label="Pronunciation feedback" role="status">
                <strong>{pronunciationResult.status === 'understood' ? 'Understood' : 'Try again'}</strong>
                <p>Target: <mark lang={targetLocale}>{pronunciationResult.referenceText}</mark></p>
                {pronunciationResult.problemWords.map((word, index) => (
                  <p key={`${word.target}-${index}`}>
                    Check: <mark lang={targetLocale}>{word.target}</mark>
                    {word.heard ? <> · heard: <span lang={targetLocale}>{word.heard}</span></> : ' · not recognized'}
                  </p>
                ))}
                <p>{pronunciationResult.tip}</p>
                <p>{pronunciationResult.toneNote ?? pronunciationResult.note}</p>
              </section>
            )}
            <p className="review-privacy-note">Whisper Tiny transcribes the recording locally in your browser after its model files download. Ari does not upload or persist your audio; an in-memory copy is kept temporarily so you can replay it and is discarded when you leave this card. This approximate text comparison is not a pronunciation score.</p>
          </>
        )}

        {mode === 'use-in-a-sentence' && (
          <>
            <span className="review-card-kicker">USE THIS WORD IN A SENTENCE</span>
            <strong className="review-word-prompt">{card.translation}</strong>
            <p className="review-sentence-target" lang={targetLocale}>Target word: {card.word}</p>
            <label className="review-answer-form">
              <span>Your sentence</span>
              <textarea rows={2} maxLength={300} value={answer} onChange={(event) => setAnswer(event.target.value)} lang={targetLocale} />
            </label>
            <p className="review-privacy-note">Check your sentence yourself, then choose how well you remembered the word.</p>
          </>
        )}

        {notice && <p className="review-privacy-note" role="status">{notice}</p>}
        {speechError && <p className="review-error" role="alert">{speechError}</p>}
        {(revealed || mode !== 'flashcard') && (
          <div className="review-rating">
            <span>How well did you remember?</span>
            <div>
              {ratings.map((rating) => (
                <button
                  className={`review-rating-button rating-${rating.id}`}
                  type="button"
                  key={rating.id}
                  onClick={() => submitRating(rating.id)}
                  disabled={isRequestingMicrophone || isCapturing || isTranscribing}
                >
                  {rating.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </article>
    </section>
  )
}

export function WarmupReview({ targetLanguageCode }: { targetLanguageCode: string }) {
  const reviewDeck = useReviewDeck(targetLanguageCode)
  const remainingToday = Math.max(0, DAILY_REVIEW_LIMIT - reviewDeck.reviewedToday)
  const cards = useMemo(
    () => reviewCardsFor(reviewDeck.cards, Math.min(5, remainingToday), reviewDeck.now),
    [reviewDeck.cards, reviewDeck.now, remainingToday],
  )

  return (
    <div className="warmup-review">
      {reviewDeck.error && <p className="review-error" role="alert">{reviewDeck.error}</p>}
      {!reviewDeck.error && (
        <ReviewFlow
          key={cards[0]?.id ?? 'empty'}
          cards={cards}
          rateCard={reviewDeck.rateCard}
          compact
          emptyTitle={remainingToday === 0 ? 'Daily review limit reached' : undefined}
          emptyDescription={remainingToday === 0
            ? 'You have completed today’s review limit. Your remaining due words will be ready tomorrow.'
            : undefined}
        />
      )}
    </div>
  )
}

export default function ReviewDeck({ targetLanguageCode }: { targetLanguageCode: string }) {
  const targetLanguage = LANGUAGES.find((language) => language.code === targetLanguageCode) ?? LANGUAGES[0]
  const targetLanguageName = targetLanguage.name
  const targetLocale = targetLanguage.locale
  const reviewDeck = useReviewDeck(targetLanguageCode)
  const remainingToday = Math.max(0, DAILY_REVIEW_LIMIT - reviewDeck.reviewedToday)
  const queue = useMemo(
    () => reviewCardsFor(reviewDeck.cards, remainingToday, reviewDeck.now),
    [reviewDeck.cards, reviewDeck.now, remainingToday],
  )
  const newCount = reviewDeck.cards.filter((card) => card.state === 'new').length
  const masteredCount = reviewDeck.cards.filter((card) => card.state === 'mastered').length

  return (
    <div className="page-content subpage-content review-deck-page">
      <div className="subpage-intro">
        <p className="eyebrow">A LITTLE PRACTICE, OFTEN</p>
        <h1>Your review garden.</h1>
        <p>Bring words back at the right time, in a quick practice that fits your day.</p>
      </div>
      <div className="review-preview-warning" role="note">
        <strong>Development preview · unreviewed {targetLanguageName} lesson words</strong>
        <span>These sample {targetLanguageName} translations have not been checked by a qualified reviewer. They are for prototype testing only, not instruction.</span>
      </div>
      {reviewDeck.error && <p className="review-error" role="alert">{reviewDeck.error}</p>}
      <section className="review-overview" aria-label="Review deck summary">
        <article><span>Due in today’s queue</span><strong>{reviewDeck.error ? '—' : queue.length}</strong></article>
        <article><span>New words</span><strong>{reviewDeck.error ? '—' : newCount}</strong></article>
        <article><span>Mastered</span><strong>{reviewDeck.error ? '—' : masteredCount}</strong></article>
        <p>{reviewDeck.error
          ? 'The saved deck could not be read; its contents were not reset.'
          : `${reviewDeck.reviewedToday} of ${DAILY_REVIEW_LIMIT} reviews completed today. The daily cap and scheduling are stored on this device.`}</p>
      </section>
      {!reviewDeck.error && (
        <ReviewFlow
          key={queue[0]?.id ?? 'empty'}
          cards={queue}
          rateCard={reviewDeck.rateCard}
          emptyTitle={remainingToday === 0 ? 'Daily review limit reached' : undefined}
          emptyDescription={remainingToday === 0
            ? 'Your remaining due words will be ready tomorrow.'
            : undefined}
        />
      )}
      <section className="review-library">
        <div className="review-library-heading"><div><p className="eyebrow">YOUR WORDS</p><h2>In this sample deck</h2></div><span>{reviewDeck.cards.length} words</span></div>
        {reviewDeck.error
          ? <p className="review-error">Your saved cards are unavailable until the storage issue is resolved.</p>
          : reviewDeck.cards.map((card) => (
            <article className="review-library-row" key={card.id}>
              <div><strong lang={targetLocale}>{card.word}</strong>{card.transliteration && <span>{card.transliteration}</span>}</div>
              <span>{card.translation}</span>
              <span className={`review-state state-${card.state}`}>{card.state}</span>
            </article>
        ))}
      </section>
    </div>
  )
}
