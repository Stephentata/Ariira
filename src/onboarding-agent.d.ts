import type { LLMProvider } from './tutor-provider.js'

export type OnboardingMessage = { role: 'assistant' | 'user'; content: string }
export function buildOnboardingMessages(
  history: OnboardingMessage[],
  languages: { nativeLanguage: string; targetLanguage: string },
): Array<{ role: 'system' | 'assistant' | 'user'; content: string }>
export function validateOnboardingReply(value: unknown): string
export function requestOnboardingReply(
  history: OnboardingMessage[],
  languages: { nativeLanguage: string; targetLanguage: string },
  provider?: LLMProvider,
): Promise<string>
