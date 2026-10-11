export type ClosedExerciseType =
  | 'multiple_choice'
  | 'listen_and_choose'
  | 'listen_and_type'
  | 'fill_blank'
  | 'sentence_building'
  | 'translate_native_to_target'
  | 'translate_target_to_native'
  | 'match_pairs'
  | 'spot_mistake'

export type ClosedExercise = {
  id: string
  type: ClosedExerciseType
  prompt: string
  answer_key: string | Record<string, string>
  accepted_variants: string[]
  explanation: string
  explain_more?: string
  hint: string
  options?: string[]
  listen_text?: string
}

export const CLOSED_EXERCISE_TYPES: ReadonlyArray<ClosedExerciseType>
export function isClosedExercise(value: unknown): value is ClosedExercise
export function checkClosedExerciseAnswer(exercise: ClosedExercise, response: unknown): boolean
export function formatExpectedAnswer(exercise: ClosedExercise): string
export function createExerciseResponse(exercise: ClosedExercise, response: unknown): unknown
