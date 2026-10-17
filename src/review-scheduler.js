export const DAILY_REVIEW_LIMIT = 20

const MINIMUM_EASE = 1.3
const RECALL_RATINGS = Object.freeze(['again', 'hard', 'good', 'easy'])

function localDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isValidReviewCard(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.id === 'string' &&
    value.id.trim() !== '' &&
    typeof value.word === 'string' &&
    value.word.trim() !== '' &&
    typeof value.translation === 'string' &&
    value.translation.trim() !== '' &&
    typeof value.transliteration === 'string' &&
    typeof value.exampleSentence === 'string' &&
    typeof value.dueAt === 'string' &&
    Number.isFinite(Date.parse(value.dueAt)) &&
    Number.isFinite(value.intervalDays) &&
    value.intervalDays >= 0 &&
    Number.isFinite(value.ease) &&
    value.ease >= MINIMUM_EASE &&
    Number.isInteger(value.repetitions) &&
    value.repetitions >= 0 &&
    Number.isInteger(value.lapseCount) &&
    value.lapseCount >= 0 &&
    (value.lastReviewedAt === undefined ||
      value.lastReviewedAt === null ||
      (typeof value.lastReviewedAt === 'string' && Number.isFinite(Date.parse(value.lastReviewedAt)))) &&
    ['new', 'learning', 'review', 'mastered', 'lapsed'].includes(value.state) &&
    ['again', 'hard', 'good', 'easy', null].includes(value.lastResult) &&
    typeof value.source === 'string' &&
    value.source.trim() !== '' &&
    (value.languageCode === undefined || (typeof value.languageCode === 'string' && value.languageCode.trim() !== ''))
  )
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

export function createReviewCard(item, now = new Date()) {
  if (
    typeof item !== 'object' ||
    item === null ||
    typeof item.id !== 'string' ||
    item.id.trim() === '' ||
    typeof item.word !== 'string' ||
    item.word.trim() === '' ||
    typeof item.translation !== 'string' ||
    item.translation.trim() === '' ||
    typeof item.source !== 'string' ||
    item.source.trim() === ''
  ) {
    throw new Error('A review item needs an ID, word, translation, and source.')
  }

  return {
    id: item.id,
    word: item.word,
    transliteration: typeof item.transliteration === 'string' ? item.transliteration : '',
    translation: item.translation,
    exampleSentence: typeof item.exampleSentence === 'string' ? item.exampleSentence : '',
    source: item.source,
    languageCode: item.languageCode ?? 'zh',
    dueAt: now.toISOString(),
    intervalDays: 0,
    ease: 2.5,
    repetitions: 0,
    lapseCount: 0,
    lastReviewedAt: null,
    lastResult: null,
    state: 'new',
  }
}

export function addNewReviewItems(cards, items, now = new Date()) {
  if (!Array.isArray(cards) || !cards.every(isValidReviewCard)) {
    throw new Error('Cannot add vocabulary to an invalid review deck.')
  }
  if (!Array.isArray(items)) throw new Error('New review items must be a list.')
  const knownIds = new Set(cards.map((card) => card.id))
  const newCards = []
  for (const item of items) {
    if (knownIds.has(item?.id)) continue
    const card = createReviewCard(item, now)
    knownIds.add(card.id)
    newCards.push(card)
  }
  return [...cards, ...newCards]
}

export function addLessonVocabularyToReviewDeck(storage, lessonId, vocabulary, now = new Date(), languageCode = 'zh') {
  if (typeof lessonId !== 'string' || lessonId.trim() === '' || !Array.isArray(vocabulary)) {
    throw new Error('A lesson ID and vocabulary list are required to add lesson words.')
  }
  if (typeof languageCode !== 'string' || languageCode.trim() === '') {
    throw new Error(`Unsupported review language: ${languageCode}`)
  }
  const cards = readReviewDeck(storage) ?? []
  const items = vocabulary.map((item) => ({
    id: `${lessonId}:${item.id}`,
    word: item.text,
    transliteration: item.transliteration,
    translation: item.translation_en,
    exampleSentence: item.example_sentence,
    source: lessonId,
    languageCode,
  }))
  const updated = addNewReviewItems(cards, items, now)
  saveReviewDeck(storage, updated)
  return updated.length - cards.length
}

export function getDueReviewCards(cards, now = new Date(), limit = DAILY_REVIEW_LIMIT) {
  if (!Array.isArray(cards) || !cards.every(isValidReviewCard)) {
    throw new Error('Cannot build a review queue from an invalid deck.')
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error('The review queue limit must be a non-negative integer.')
  }
  return cards
    .filter((card) => Date.parse(card.dueAt) <= now.getTime())
    .sort((first, second) => Date.parse(first.dueAt) - Date.parse(second.dueAt))
    .slice(0, Math.min(limit, DAILY_REVIEW_LIMIT))
}

export function getDailyReviewCount(cards, now = new Date()) {
  if (!Array.isArray(cards) || !cards.every(isValidReviewCard)) {
    throw new Error('Cannot count reviews in an invalid deck.')
  }
  return cards.filter((card) =>
    card.lastReviewedAt !== null &&
    localDateKey(new Date(card.lastReviewedAt)) === localDateKey(now),
  ).length
}

export function scheduleReview(card, rating, now = new Date()) {
  if (!isValidReviewCard(card)) throw new Error('Cannot schedule an invalid review card.')
  if (!RECALL_RATINGS.includes(rating)) throw new Error(`Unsupported recall rating: ${rating}`)

  const quality = { again: 1, hard: 3, good: 4, easy: 5 }[rating]
  const ease = Math.max(
    MINIMUM_EASE,
    card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  )
  let intervalDays
  let repetitions
  let lapseCount = card.lapseCount
  let state

  if (rating === 'again') {
    intervalDays = 10 / (24 * 60)
    repetitions = 0
    lapseCount += 1
    state = 'lapsed'
  } else if (rating === 'hard') {
    intervalDays = Math.max(1, card.intervalDays * 1.2)
    repetitions = card.repetitions + 1
    state = repetitions >= 3 ? 'review' : 'learning'
  } else if (rating === 'good') {
    intervalDays = card.repetitions === 0
      ? 1
      : card.repetitions === 1
        ? 6
        : card.intervalDays * ease
    repetitions = card.repetitions + 1
    state = repetitions >= 3 ? 'review' : 'learning'
  } else {
    intervalDays = card.repetitions === 0
      ? 4
      : Math.max(1, card.intervalDays * ease * 1.3)
    repetitions = card.repetitions + 1
    state = repetitions >= 3 ? 'mastered' : 'learning'
  }

  return {
    ...card,
    dueAt: addDays(now, intervalDays),
    intervalDays,
    ease,
    repetitions,
    lapseCount,
    lastReviewedAt: now.toISOString(),
    lastResult: rating,
    state,
  }
}

export function readReviewDeck(storage, key = 'ari-review-deck') {
  const serialized = storage.getItem(key)
  if (serialized === null) return null

  let parsed
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('Saved review progress is damaged. Do not clear it until you have exported or reset it.')
  }
  if (!Array.isArray(parsed) || !parsed.every(isValidReviewCard)) {
    throw new Error('Saved review progress is invalid. The review deck was not changed.')
  }
  if (new Set(parsed.map((card) => card.id)).size !== parsed.length) {
    throw new Error('Saved review progress contains duplicate cards. The review deck was not changed.')
  }
  return parsed.map((card) => ({
    ...card,
    lastReviewedAt: card.lastReviewedAt ?? null,
    languageCode: card.languageCode ?? 'zh',
  }))
}

export function saveReviewDeck(storage, cards, key = 'ari-review-deck') {
  if (!Array.isArray(cards) || !cards.every(isValidReviewCard)) {
    throw new Error('Cannot save an invalid review deck.')
  }
  storage.setItem(key, JSON.stringify(cards))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('ari-progress-updated'))
}
