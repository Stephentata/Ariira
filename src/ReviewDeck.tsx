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

type ReviewMode = 'flashcard' | 'listen-and-type' | 'speak-word' | 'use-in-a-sentence'
type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> }
type SpeechErrorEvent = { error: string }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  abort: () => void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
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

function useReviewDeck() {
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

  return { ...state, now, rateCard }
}

function playCardWord(word: string, setMessage: (message: string) => void) {
  if (!('speechSynthesis' in window)) {
    setMessage('Speech playback is unavailable in this browser.')
    return
  }
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(word)
    utterance.lang = 'zh-CN'
    utterance.onerror = () => setMessage('Your browser could not play this word. You can still review it.')
    utterance.onend = () => setMessage('')
    window.speechSynthesis.speak(utterance)
    setMessage('Playing with your browser’s available voice; no recording is stored.')
  } catch (error) {
    setMessage(error instanceof Error ? `Speech playback failed: ${error.message}` : 'Speech playback failed.')
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
  const [notice, setNotice] = useState('')
  const [speechError, setSpeechError] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const card = cards[0]

  useEffect(() => () => {
    const recognition = recognitionRef.current
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.abort()
    }
  }, [])

  function startSpeechPractice() {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      setSpeechError('Speech recognition is not available in this browser. You can still self-rate your recall.')
      return
    }

    try {
      const recognition = new Recognition()
      recognition.lang = 'zh-CN'
      recognition.continuous = false
      recognition.interimResults = false
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript ?? ''
        setSpeechResult(transcript)
        setSpeechError('')
      }
      recognition.onerror = (event) => {
        setSpeechError(`Could not check your speech (${event.error}). You can still self-rate your recall.`)
      }
      recognition.onend = () => setNotice('')
      recognitionRef.current = recognition
      setNotice('Listening for one Mandarin word. Ari does not store a recording; browser speech handling follows its provider’s privacy policy.')
      recognition.start()
    } catch (error) {
      setSpeechError(error instanceof Error ? `Could not start listening: ${error.message}` : 'Could not start listening.')
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
              onClick={() => {
                setMode(item.id)
                setRevealed(false)
                setAnswer('')
                setAnswerChecked(null)
                setSpeechResult('')
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
            <strong className="review-word" lang="zh-CN">{card.word}</strong>
            {card.transliteration && <span className="review-pronunciation">{card.transliteration}</span>}
            {revealed ? (
              <div className="review-answer">
                <strong>{card.translation}</strong>
                {card.exampleSentence && <p lang="zh-CN">{card.exampleSentence}</p>}
              </div>
            ) : (
              <button className="button button-outline" type="button" onClick={() => setRevealed(true)}>Reveal meaning</button>
            )}
          </>
        )}

        {mode === 'listen-and-type' && (
          <>
            <span className="review-card-kicker">LISTEN AND TYPE THE MANDARIN</span>
            <strong className="review-word-prompt">{card.translation}</strong>
            <button className="button button-outline" type="button" onClick={() => playCardWord(card.word, setNotice)}>Hear the word</button>
            <form className="review-answer-form" onSubmit={checkTypedAnswer}>
              <label htmlFor="review-typed-answer">Your answer in characters</label>
              <input id="review-typed-answer" lang="zh-CN" autoComplete="off" value={answer} onChange={(event) => { setAnswer(event.target.value); setAnswerChecked(null) }} />
              <button className="button button-dark" type="submit" disabled={!answer.trim()}>Check spelling</button>
            </form>
            {answerChecked !== null && <p className={`review-result ${answerChecked ? 'is-correct' : 'is-incorrect'}`} role="status">{answerChecked ? 'Correct — nicely heard.' : `Not quite. The word is ${card.word}.`}</p>}
          </>
        )}

        {mode === 'speak-word' && (
          <>
            <span className="review-card-kicker">SAY THE WORD IN MANDARIN</span>
            <strong className="review-word-prompt">{card.translation}</strong>
            <button className="button button-dark" type="button" onClick={startSpeechPractice}>Speak now</button>
            {speechResult && <p className={`review-result ${normalizeAnswer(speechResult) === normalizeAnswer(card.word) ? 'is-correct' : 'is-incorrect'}`} role="status">Heard: <span lang="zh-CN">{speechResult}</span> · {normalizeAnswer(speechResult) === normalizeAnswer(card.word) ? 'matches the card' : `target: ${card.word}`}</p>}
            <p className="review-privacy-note">Browser speech recognition is approximate. Ari does not store a recording; audio handling depends on the browser’s speech provider.</p>
          </>
        )}

        {mode === 'use-in-a-sentence' && (
          <>
            <span className="review-card-kicker">USE THIS WORD IN A SENTENCE</span>
            <strong className="review-word-prompt">{card.translation}</strong>
            <p className="review-sentence-target" lang="zh-CN">Target word: {card.word}</p>
            <label className="review-answer-form">
              <span>Your sentence</span>
              <textarea rows={2} maxLength={300} value={answer} onChange={(event) => setAnswer(event.target.value)} lang="zh-CN" />
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
                <button className={`review-rating-button rating-${rating.id}`} type="button" key={rating.id} onClick={() => submitRating(rating.id)}>
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

export function WarmupReview() {
  const reviewDeck = useReviewDeck()
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

export default function ReviewDeck() {
  const reviewDeck = useReviewDeck()
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
        <strong>Development preview · unreviewed lesson words</strong>
        <span>These sample Mandarin translations have not been checked by a qualified reviewer. They are for prototype testing only, not instruction.</span>
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
              <div><strong lang="zh-CN">{card.word}</strong>{card.transliteration && <span>{card.transliteration}</span>}</div>
              <span>{card.translation}</span>
              <span className={`review-state state-${card.state}`}>{card.state}</span>
            </article>
        ))}
      </section>
    </div>
  )
}
