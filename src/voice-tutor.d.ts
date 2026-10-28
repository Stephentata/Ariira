export const VOICE_DAILY_TURN_LIMIT: number
export const VOICE_DAILY_LIMIT_KEY: string
export function getNextVoiceStage(
  stage: 'opening' | 'name' | 'small-talk' | 'topic' | 'teaching' | 'conversation',
  uncertainRecognition?: boolean,
): 'opening' | 'name' | 'small-talk' | 'topic' | 'teaching' | 'conversation'

export type TutorPhraseCard = {
  phrase: string
  pinyin: string
  meaning: string
  toneTip: string
}

export function consumeVoiceTurn(storage: Pick<Storage, 'getItem' | 'setItem'>, now?: Date): number
export function extractLearnerName(text: string, fallback?: string): string
export function stripTutorCardMarkers(text: string): string
export function parseTutorCard(text: string): { displayText: string; card: TutorPhraseCard | null }
export function getStreamableTutorText(text: string): string
export function takeCompleteSentences(text: string): { sentences: string[]; remainder: string }
export function streamTutorReply(response: Response, onText: (fullText: string, token: string) => void): Promise<string>
