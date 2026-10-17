import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addLessonVocabularyToReviewDeck,
  addNewReviewItems,
  createReviewCard,
  DAILY_REVIEW_LIMIT,
  getDailyReviewCount,
  getDueReviewCards,
  readReviewDeck,
  saveReviewDeck,
  scheduleReview,
} from '../src/review-scheduler.js'

const now = new Date('2026-01-01T12:00:00.000Z')
const sampleItem = {
  id: 'lesson-1:nihao',
  word: '你好',
  transliteration: 'nǐ hǎo',
  translation: 'hello',
  source: 'lesson-1',
}

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('new vocabulary is due immediately and added only once', () => {
  const first = addNewReviewItems([], [sampleItem, sampleItem], now)
  const updated = addNewReviewItems(first, [sampleItem], now)

  assert.equal(first.length, 1)
  assert.equal(first[0].state, 'new')
  assert.equal(first[0].dueAt, now.toISOString())
  assert.deepEqual(updated, first)
  assert.throws(() => addNewReviewItems([], null, now), /must be a list/)
  assert.throws(() => createReviewCard({ ...sampleItem, word: ' ' }, now), /ID, word, translation/)
})

test('due queue sorts by due time and enforces the daily cap', () => {
  const cards = Array.from({ length: DAILY_REVIEW_LIMIT + 5 }, (_, index) => ({
    ...createReviewCard({ ...sampleItem, id: `item-${index}` }, now),
    dueAt: new Date(now.getTime() - (DAILY_REVIEW_LIMIT + 5 - index) * 1000).toISOString(),
  }))

  const due = getDueReviewCards(cards, now, DAILY_REVIEW_LIMIT + 3)
  assert.equal(due.length, DAILY_REVIEW_LIMIT)
  assert.equal(due[0].id, 'item-0')
  assert.equal(getDueReviewCards(cards, now, 3).length, 3)
  assert.throws(() => getDueReviewCards(cards, now, -1), /non-negative integer/)
})

test('daily review count derives from persisted card timestamps and resets on the next local day', () => {
  const today = new Date(2026, 0, 1, 12)
  const tomorrow = new Date(2026, 0, 2, 12)
  const cards = Array.from({ length: DAILY_REVIEW_LIMIT }, (_, index) =>
    scheduleReview(createReviewCard({ ...sampleItem, id: `daily-${index}` }, today), 'good', today),
  )

  assert.equal(getDailyReviewCount(cards, today), DAILY_REVIEW_LIMIT)
  assert.equal(getDueReviewCards(cards, today, DAILY_REVIEW_LIMIT - getDailyReviewCount(cards, today)).length, 0)
  assert.equal(getDailyReviewCount(cards, tomorrow), 0)
  assert.throws(() => getDailyReviewCount([{}], today), /invalid deck/)
})

test('Again lapses a card and schedules a short retry without changing the original', () => {
  const card = createReviewCard(sampleItem, now)
  const retried = scheduleReview(card, 'again', now)

  assert.equal(card.state, 'new')
  assert.equal(retried.state, 'lapsed')
  assert.equal(retried.repetitions, 0)
  assert.equal(retried.lapseCount, 1)
  assert.equal(retried.lastResult, 'again')
  assert.equal(Date.parse(retried.dueAt), now.getTime() + 10 * 60 * 1000)
  assert.equal(getDueReviewCards([retried], now).length, 0)
})

test('Good ratings follow one-day, six-day, then ease-based intervals', () => {
  const first = scheduleReview(createReviewCard(sampleItem, now), 'good', now)
  const second = scheduleReview(first, 'good', now)
  const third = scheduleReview(second, 'good', now)

  assert.equal(first.intervalDays, 1)
  assert.equal(second.intervalDays, 6)
  assert.equal(third.intervalDays, 6 * third.ease)
  assert.equal(third.state, 'review')
  assert.equal(third.repetitions, 3)
})

test('Hard and Easy ratings use longer scheduling intervals and ease never falls below 1.3', () => {
  const card = createReviewCard(sampleItem, now)
  const hard = scheduleReview(card, 'hard', now)
  const hardMastered = scheduleReview(
    scheduleReview(scheduleReview(card, 'hard', now), 'hard', now),
    'hard',
    now,
  )
  const easy = scheduleReview(card, 'easy', now)

  assert.equal(hard.intervalDays, 1)
  assert.equal(hard.state, 'learning')
  assert.equal(hardMastered.state, 'review')
  assert.equal(easy.intervalDays, 4)
  assert.equal(easy.state, 'learning')
  assert.ok(hard.ease >= 1.3)
  assert.throws(() => scheduleReview(card, 'unknown', now), /Unsupported recall rating/)
})

test('review deck persistence validates data and preserves scheduled progress', () => {
  const storage = createMemoryStorage()
  const card = scheduleReview(createReviewCard(sampleItem, now), 'good', now)
  saveReviewDeck(storage, [card])
  assert.deepEqual(readReviewDeck(storage), [card])

  storage.setItem('ari-review-deck', '{damaged')
  assert.throws(() => readReviewDeck(storage), /damaged/)
  storage.setItem('ari-review-deck', JSON.stringify([card, card]))
  assert.throws(() => readReviewDeck(storage), /duplicate cards/)
  assert.throws(() => saveReviewDeck(storage, [{}]), /invalid review deck/)
})

test('review deck loading upgrades cards created before review timestamps existed', () => {
  const storage = createMemoryStorage()
  const legacyCard = createReviewCard(sampleItem, now)
  delete legacyCard.lastReviewedAt
  storage.setItem('ari-review-deck', JSON.stringify([legacyCard]))

  assert.equal(readReviewDeck(storage)[0].lastReviewedAt, null)
  assert.equal(getDailyReviewCount(readReviewDeck(storage), now), 0)
})

test('new source vocabulary can be synced without resetting existing review history', () => {
  const existing = scheduleReview(createReviewCard(sampleItem, now), 'good', now)
  const items = [
    { ...sampleItem, translation: 'different translation' },
    { ...sampleItem, id: 'lesson-1:xiexie', word: '谢谢', translation: 'thank you' },
  ]

  const synced = addNewReviewItems([existing], items, now)
  assert.equal(synced.length, 2)
  assert.deepEqual(synced[0], existing)
  assert.equal(synced[1].state, 'new')
  assert.equal(synced[1].word, '谢谢')
})

test('lesson words enter the review deck when teaching is completed', () => {
  const storage = createMemoryStorage()
  const vocabulary = [{
    id: 'nihao',
    text: '你好',
    transliteration: 'nǐ hǎo',
    translation_en: 'hello',
    example_sentence: '你好！',
  }]

  assert.equal(addLessonVocabularyToReviewDeck(storage, 'lesson-1', vocabulary, now), 1)
  assert.equal(addLessonVocabularyToReviewDeck(storage, 'lesson-1', vocabulary, now), 0)
  const deck = readReviewDeck(storage)
  assert.equal(deck.length, 1)
  assert.equal(deck[0].id, 'lesson-1:nihao')
  assert.equal(deck[0].exampleSentence, '你好！')
  assert.equal(deck[0].source, 'lesson-1')
  assert.equal(deck[0].languageCode, 'zh')
})

test('lesson vocabulary can be added to a separate French review queue', () => {
  const storage = createMemoryStorage()
  const frenchVocabulary = [{
    id: 'bonjour',
    text: 'Bonjour',
    transliteration: 'approx. bon-zhoor',
    translation_en: 'hello; good morning',
    example_sentence: 'Bonjour !',
  }]
  const mandarinVocabulary = [{
    id: 'nihao',
    text: '你好',
    transliteration: 'nǐ hǎo',
    translation_en: 'hello',
    example_sentence: '你好！',
  }]

  addLessonVocabularyToReviewDeck(storage, 'zh-a1-l01', mandarinVocabulary, now)
  assert.equal(addLessonVocabularyToReviewDeck(storage, 'fr-a1-l01', frenchVocabulary, now, 'fr'), 1)
  const deck = readReviewDeck(storage)

  assert.deepEqual(deck.map(({ word, languageCode }) => ({ word, languageCode })), [
    { word: '你好', languageCode: 'zh' },
    { word: 'Bonjour', languageCode: 'fr' },
  ])
  assert.equal(getDueReviewCards(deck.filter(({ languageCode }) => languageCode === 'fr'), now).length, 1)
  assert.equal(addLessonVocabularyToReviewDeck(storage, 'es-a1-l01', frenchVocabulary, now, 'es'), 1)
  assert.equal(readReviewDeck(storage).at(-1).languageCode, 'es')
  assert.throws(
    () => addLessonVocabularyToReviewDeck(storage, 'bad-language', frenchVocabulary, now, ''),
    /Unsupported review language/,
  )
})

test('legacy review cards are migrated to Mandarin without changing schedule', () => {
  const storage = createMemoryStorage()
  const legacyCard = createReviewCard(sampleItem, now)
  delete legacyCard.languageCode
  storage.setItem('ari-review-deck', JSON.stringify([legacyCard]))

  const migrated = readReviewDeck(storage)[0]
  assert.equal(migrated.languageCode, 'zh')
  assert.equal(migrated.dueAt, legacyCard.dueAt)
  assert.equal(migrated.state, legacyCard.state)
})
