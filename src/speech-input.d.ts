export function isLikelyNativeLanguage(text: string, nativeCode: string, targetCode: string): boolean
export function isLowConfidenceSpeech(alternatives: Array<{ transcript: string; confidence: number | null }> | undefined): boolean
export function parsePracticePhraseOptions(text: string): Array<{ phrase: string; translation: string }>
