export type RecallRating = 'again' | 'hard' | 'good' | 'easy'
export type ReviewItem = {
  id: string
  word: string
  transliteration?: string
  translation: string
  exampleSentence?: string
  source: string
  languageCode?: string
}
export type ReviewCard = ReviewItem & {
  transliteration: string
  exampleSentence: string
  dueAt: string
  intervalDays: number
  ease: number
  repetitions: number
  lapseCount: number
  lastReviewedAt: string | null
  lastResult: RecallRating | null
  state: 'new' | 'learning' | 'review' | 'mastered' | 'lapsed'
}

export const DAILY_REVIEW_LIMIT: 20
export function createReviewCard(item: ReviewItem, now?: Date): ReviewCard
export function addNewReviewItems(cards: ReviewCard[], items: ReviewItem[], now?: Date): ReviewCard[]
export function addLessonVocabularyToReviewDeck(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  lessonId: string,
  vocabulary: Array<{
    id: string
    text: string
    transliteration?: string
    translation_en: string
    example_sentence?: string
  }>,
  now?: Date,
  languageCode?: string,
): number
export function getDueReviewCards(cards: ReviewCard[], now?: Date, limit?: number): ReviewCard[]
export function getDailyReviewCount(cards: ReviewCard[], now?: Date): number
export function scheduleReview(card: ReviewCard, rating: RecallRating, now?: Date): ReviewCard
export function readReviewDeck(
  storage: Pick<Storage, 'getItem'>,
  key?: string,
): ReviewCard[] | null
export function saveReviewDeck(
  storage: Pick<Storage, 'setItem'>,
  cards: ReviewCard[],
  key?: string,
): void
