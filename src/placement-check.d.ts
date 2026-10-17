export type PlacementQuestion = {
  id: string
  prompt: string
  options: readonly string[]
  answer: string
}

export type PlacementResult = {
  correct: number
  total: number
  recommendation: string
}

export const PLACEMENT_QUESTIONS: readonly PlacementQuestion[]
export function evaluatePlacementCheck(responses: string[]): PlacementResult
