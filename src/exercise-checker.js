export const CLOSED_EXERCISE_TYPES = Object.freeze([
  'multiple_choice',
  'listen_and_choose',
  'listen_and_type',
  'fill_blank',
  'sentence_building',
  'translate_native_to_target',
  'translate_target_to_native',
  'match_pairs',
  'spot_mistake',
  'reading_comprehension',
])

function normalizeText(value) {
  if (typeof value !== 'string') return ''
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

function isStringRecord(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  )
}

function canBuildSentence(exercise) {
  const answer = normalizeText(exercise.answer_key)
  const tokens = exercise.options.map(normalizeText).filter(Boolean)

  function findNext(remainder, usedTokens) {
    if (remainder === '') return true
    return tokens.some((token, index) =>
      !usedTokens.has(index) &&
      remainder.startsWith(token) &&
      findNext(remainder.slice(token.length), new Set([...usedTokens, index])),
    )
  }

  return findNext(answer, new Set())
}

export function isClosedExercise(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const exercise = value
  if (
    typeof exercise.id !== 'string' ||
    typeof exercise.type !== 'string' ||
    !CLOSED_EXERCISE_TYPES.includes(exercise.type) ||
    typeof exercise.prompt !== 'string' ||
    typeof exercise.explanation !== 'string' ||
    typeof exercise.hint !== 'string' ||
    !Array.isArray(exercise.accepted_variants) ||
    !exercise.accepted_variants.every((variant) => typeof variant === 'string')
  ) {
    return false
  }

  if (exercise.type === 'match_pairs') {
    return (
      isStringRecord(exercise.answer_key) &&
      Object.keys(exercise.answer_key).length > 0 &&
      Object.values(exercise.answer_key).every((meaning) => meaning.trim() !== '')
    )
  }
  if (typeof exercise.answer_key !== 'string') return false

  if (
    exercise.type === 'multiple_choice' ||
    exercise.type === 'listen_and_choose' ||
    exercise.type === 'spot_mistake' ||
    exercise.type === 'reading_comprehension'
  ) {
    return (
      Array.isArray(exercise.options) &&
      exercise.options.length >= 2 &&
      exercise.options.every((option) => typeof option === 'string') &&
      exercise.options.includes(exercise.answer_key) &&
      (exercise.type !== 'listen_and_choose' || (
        typeof exercise.listen_text === 'string' && exercise.listen_text.trim() !== ''
      )) &&
      (exercise.type !== 'reading_comprehension' || (
        typeof exercise.reading_text === 'string' && exercise.reading_text.trim() !== ''
      ))
    )
  }
  if (exercise.type === 'listen_and_type') return typeof exercise.listen_text === 'string' && exercise.listen_text.trim() !== ''
  if (exercise.type === 'sentence_building') {
    return (
      Array.isArray(exercise.options) &&
      exercise.options.length >= 2 &&
      exercise.options.every((option) => typeof option === 'string') &&
      canBuildSentence(exercise)
    )
  }
  return true
}

export function isShortWritingExercise(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const exercise = value
  return (
    typeof exercise.id === 'string' &&
    exercise.type === 'short_writing' &&
    Array.isArray(exercise.skill) &&
    exercise.skill.includes('writing') &&
    typeof exercise.objective_id === 'string' &&
    typeof exercise.prompt === 'string' &&
    typeof exercise.answer_key === 'object' &&
    exercise.answer_key !== null &&
    !Array.isArray(exercise.answer_key) &&
    typeof exercise.answer_key.sample_answer === 'string' &&
    exercise.answer_key.sample_answer.trim() !== '' &&
    Array.isArray(exercise.accepted_variants) &&
    exercise.accepted_variants.every((variant) => typeof variant === 'string') &&
    typeof exercise.explanation === 'string' &&
    typeof exercise.hint === 'string' &&
    Array.isArray(exercise.success_criteria) &&
    exercise.success_criteria.length > 0 &&
    exercise.success_criteria.every((criterion) => typeof criterion === 'string' && criterion.trim() !== '')
  )
}

export function checkClosedExerciseAnswer(exercise, response) {
  if (!isClosedExercise(exercise)) {
    throw new Error('This exercise is invalid or is not a code-checked exercise.')
  }

  if (exercise.type === 'match_pairs') {
    if (!isStringRecord(response)) return false
    const expectedPairs = Object.entries(exercise.answer_key)
    const submittedPairs = Object.entries(response)
    return (
      expectedPairs.length === submittedPairs.length &&
      expectedPairs.every(([key, value]) =>
        Object.hasOwn(response, key) &&
        normalizeText(response[key]) === normalizeText(value),
      )
    )
  }

  if (typeof response !== 'string') return false
  const acceptedAnswers = [exercise.answer_key, ...exercise.accepted_variants]
  return acceptedAnswers.some((answer) => normalizeText(response) === normalizeText(answer))
}

export function formatExpectedAnswer(exercise) {
  if (!isClosedExercise(exercise)) {
    throw new Error('Cannot format an invalid exercise answer.')
  }
  if (exercise.type === 'match_pairs') {
    return Object.entries(exercise.answer_key)
      .map(([target, meaning]) => `${target} → ${meaning}`)
      .join(' · ')
  }
  return exercise.answer_key
}

export function createExerciseResponse(exercise, response) {
  if (!isClosedExercise(exercise)) {
    throw new Error('Cannot submit an invalid exercise.')
  }
  if (
    exercise.type === 'multiple_choice' ||
    exercise.type === 'listen_and_choose' ||
    exercise.type === 'spot_mistake' ||
    exercise.type === 'reading_comprehension'
  ) {
    if (!exercise.options.includes(response)) {
      throw new Error('Choose one of the available options.')
    }
    return response
  }
  if (exercise.type === 'match_pairs') {
    if (!isStringRecord(response)) throw new Error('Connect every word with a meaning first.')
    const expectedTargets = Object.keys(exercise.answer_key)
    if (
      Object.keys(response).length !== expectedTargets.length ||
      expectedTargets.some((target) => typeof response[target] !== 'string' || response[target].trim() === '')
    ) {
      throw new Error('Connect every word with a meaning first.')
    }
    return response
  }
  if (typeof response !== 'string' || response.trim() === '') {
    throw new Error('Enter or build an answer before checking it.')
  }
  return response
}
