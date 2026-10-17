import { ollamaProvider } from './tutor-provider.js'

const replySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply'],
  properties: {
    reply: { type: 'string', minLength: 1, maxLength: 360 },
  },
}

const MAX_TURNS = 8

export function buildOnboardingMessages(history, { nativeLanguage, targetLanguage }) {
  if (!Array.isArray(history) || history.length === 0 || history.length > MAX_TURNS * 2) {
    throw new Error('The onboarding conversation is empty or too long. Start a fresh conversation.')
  }
  if (history.some((message) =>
    !message ||
    !['assistant', 'user'].includes(message.role) ||
    typeof message.content !== 'string' ||
    message.content.trim() === '' ||
    message.content.length > 500
  )) {
    throw new Error('The onboarding conversation contains an invalid message.')
  }
  if (typeof nativeLanguage !== 'string' || !nativeLanguage.trim() ||
      typeof targetLanguage !== 'string' || !targetLanguage.trim()) {
    throw new Error('Choose your languages before starting the onboarding conversation.')
  }

  return [
    {
      role: 'system',
      content: [
        'You are Ira, a warm and concise language-learning onboarding guide.',
        `The learner speaks ${nativeLanguage} and wants to learn ${targetLanguage}.`,
        'Have a short, natural conversation to learn their practical goal, interests, and preferred practice rhythm.',
        'Ask only one simple question at a time. Keep replies under 60 words and use the learner’s native language.',
        'Do not assign or infer a CEFR level, claim to assess proficiency, or make up placement results.',
        'Do not ask for sensitive personal information. Never claim to be human.',
        'The learner can skip the conversation at any time. Do not claim that this chat changes settings or is saved.',
        'Return only a JSON object with one concise reply string.',
      ].join(' '),
    },
    ...history.slice(-MAX_TURNS * 2),
  ]
}

export function validateOnboardingReply(value) {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    typeof value.reply !== 'string' ||
    value.reply.trim() === '' ||
    value.reply.length > 360
  ) {
    throw new Error('Ira returned an invalid onboarding reply. Please try again.')
  }
  return value.reply.trim()
}

export async function requestOnboardingReply(history, languages, provider = ollamaProvider) {
  const messages = buildOnboardingMessages(history, languages)
  const result = await provider.chat(messages, replySchema)
  return validateOnboardingReply(result)
}
