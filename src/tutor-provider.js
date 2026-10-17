const ratioTargets = {
  A0: { target: 0.2, min: 0.1, max: 0.3 },
  A1: { target: 0.4, min: 0.3, max: 0.5 },
  A2: { target: 0.6, min: 0.5, max: 0.7 },
  B1: { target: 0.8, min: 0.7, max: 0.9 },
  B2: { target: 0.95, min: 0.9, max: 1 },
  C1: { target: 0.98, min: 0.96, max: 0.99 },
  C2: { target: 0.99, min: 0.98, max: 1 },
}
const languageRatioTolerance = 0.04

const blockedTopics = /\b(?:sexual|porn(?:ography)?|erotic|suicide|self[- ]harm|harmful|harm|hurt|kill|murder|bomb|weapon|poison|drug|violence|assault)\b|automutilation|blesser|blessure|tuer|meurtre|bombe|arme|empoisonner|drogue|violence|agression|pornographie|érotique|sexuel|色情|自杀|自殘|自残|杀人|炸弹|武器|毒品|暴力|伤害/i

export const defaultTutorProfile = {
  tutorName: 'Ira',
  nativeLanguage: 'English',
  targetLanguage: 'Mandarin Chinese',
  targetLanguageCode: 'zh',
  level: 'A1',
  goals: 'practise useful everyday conversation',
  interests: 'cafés, food, and travel',
  lessonTitle: 'Ordering at a café in Taipei',
  objectives: 'greet the barista and order a drink politely',
  vocabulary: '你好 (hello), 咖啡 (coffee), 牛奶 (milk), 谢谢 (thank you)',
  grammarPoint: 'Use 想 + verb to say what you would like.',
  errorProfile: 'No recurring errors have been recorded yet.',
  memorySummary: 'No saved learner memory is available yet.',
}

function stringSchema(maxLength = 160) {
  return { type: 'string', minLength: 1, maxLength }
}

function cardVariant(type, fields) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'type', 'title', ...fields.required],
    properties: {
      id: stringSchema(100),
      type: { const: type },
      title: stringSchema(120),
      ...fields.properties,
    },
  }
}

const whiteboardCardSchema = {
  oneOf: [
    cardVariant('vocab_card', {
      required: ['word', 'transliteration', 'translation', 'example_sentence'],
      properties: {
        word: stringSchema(80),
        transliteration: { type: 'string', maxLength: 120 },
        translation: stringSchema(120),
        example_sentence: stringSchema(200),
        image: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['src', 'license'],
              properties: { src: stringSchema(200), license: stringSchema(120) },
            },
          ],
        },
      },
    }),
    cardVariant('grammar_card', {
      required: ['pattern', 'explanation', 'examples'],
      properties: {
        pattern: stringSchema(120),
        explanation: stringSchema(200),
        examples: { type: 'array', minItems: 2, maxItems: 3, items: stringSchema(160) },
      },
    }),
    cardVariant('dialogue_card', {
      required: ['lines'],
      properties: {
        lines: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['speaker', 'text'],
            properties: {
              speaker: stringSchema(50),
              text: stringSchema(160),
              transliteration: { type: 'string', maxLength: 160 },
              translation: { type: 'string', maxLength: 160 },
            },
          },
        },
      },
    }),
    cardVariant('tone_or_sound_card', {
      required: ['sound', 'tip'],
      properties: {
        sound: stringSchema(80),
        tip: stringSchema(200),
        contour: { type: 'string', maxLength: 120 },
      },
    }),
    cardVariant('word_order_card', {
      required: ['blocks', 'answer'],
      properties: {
        blocks: { type: 'array', minItems: 2, items: stringSchema(80) },
        answer: stringSchema(200),
      },
    }),
    cardVariant('summary_card', {
      required: ['takeaways'],
      properties: {
        takeaways: { type: 'array', minItems: 1, items: stringSchema(160) },
      },
    }),
  ],
}

export const tutorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply_text', 'native_support', 'corrections', 'new_words', 'next_action'],
  properties: {
    reply_text: stringSchema(500),
    native_support: stringSchema(240),
    corrections: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['original', 'corrected', 'explanation'],
        properties: {
          original: stringSchema(100),
          corrected: stringSchema(100),
          explanation: stringSchema(160),
        },
      },
    },
    new_words: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['word', 'meaning'],
        properties: {
          word: stringSchema(80),
          meaning: stringSchema(120),
        },
      },
    },
    whiteboard_card: whiteboardCardSchema,
    next_action: { type: 'string', enum: ['continue', 'practice', 'show_whiteboard', 'finish'] },
  },
}

export class OllamaLLMProvider {
  constructor({
    endpoint = '/api/ollama/api/chat',
    model = 'qwen2.5-coder:7b',
    fetcher = (input, options) => globalThis.fetch(input, options),
    logger = console,
  } = {}) {
    this.endpoint = endpoint
    this.model = model
    this.fetcher = fetcher
    this.logger = logger
  }

  async chat(messages, schema) {
    const startedAt = Date.now()
    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: schema,
          options: { temperature: 0.3 },
          messages,
        }),
      })

      if (!response.ok) {
        let detail = response.statusText || 'request failed'
        try {
          const errorResponse = await response.json()
          if (typeof errorResponse?.error === 'string' && errorResponse.error.trim()) {
            detail = errorResponse.error
          }
        } catch {
          // Keep the HTTP status text when an upstream error is not JSON.
        }
        throw new Error(`Tutor service returned ${response.status}: ${detail}`)
      }

      const result = await response.json()
      if (
        typeof result !== 'object' ||
        result === null ||
        !('message' in result) ||
        typeof result.message !== 'object' ||
        result.message === null ||
        !('content' in result.message) ||
        typeof result.message.content !== 'string'
      ) {
        throw new Error('The AI tutor returned an unexpected response. Please try again.')
      }

      let parsed
      try {
        parsed = JSON.parse(result.message.content)
      } catch {
        throw new Error('The AI tutor did not return valid structured data. Please try again.')
      }

      this.logger.info('[LLMProvider] Tutor chat completed', {
        model: this.model,
        latencyMs: Date.now() - startedAt,
      })
      return parsed
    } catch (error) {
      this.logger.error('[LLMProvider] Tutor chat failed', {
        model: this.model,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown provider error',
      })
      throw error
    }
  }
}

export function getTargetLanguageRatio(level) {
  const ratio = ratioTargets[level]
  if (!ratio) throw new Error(`Unsupported CEFR level: ${level}`)
  return ratio.target
}

export function getLanguageRatio(text) {
  const mandarinCharacters = (text.match(/\p{Script=Han}/gu) ?? []).length
  const nativeCharacters = (text.match(/[A-Za-z]/g) ?? []).length
  const countedUnits = mandarinCharacters + nativeCharacters
  return countedUnits === 0 ? 0 : mandarinCharacters / countedUnits
}

export function getTutorResponseLanguageRatio(value) {
  if (!isRecord(value)) return 0
  const conversation = [value.reply_text, value.native_support]
    .filter((text) => typeof text === 'string')
    .join(' ')
  return getLanguageRatio(conversation)
}

export function countTutorSentences(text) {
  return (text.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/gu) ?? [])
    .filter((sentence) => sentence.trim().length > 0).length
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.includes(key))
}

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isWhiteboardCard(value) {
  if (!isRecord(value) || !isNonEmptyString(value.id, 100) || !isNonEmptyString(value.title, 120)) return false

  switch (value.type) {
    case 'vocab_card':
      return hasOnlyKeys(value, ['id', 'type', 'title', 'word', 'transliteration', 'translation', 'example_sentence', 'image']) &&
        isNonEmptyString(value.word, 80) &&
        typeof value.transliteration === 'string' &&
        value.transliteration.length <= 120 &&
        isNonEmptyString(value.translation, 120) &&
        isNonEmptyString(value.example_sentence, 200) &&
        (
          value.image === undefined ||
          value.image === null ||
          (
            isRecord(value.image) &&
            hasOnlyKeys(value.image, ['src', 'license']) &&
            isNonEmptyString(value.image.src, 200) &&
            isNonEmptyString(value.image.license, 120)
          )
        )
    case 'grammar_card':
      return hasOnlyKeys(value, ['id', 'type', 'title', 'pattern', 'explanation', 'examples']) &&
        isNonEmptyString(value.pattern, 120) &&
        isNonEmptyString(value.explanation, 200) &&
        Array.isArray(value.examples) &&
        value.examples.length >= 2 &&
        value.examples.length <= 3 &&
        value.examples.every((example) => isNonEmptyString(example, 160))
    case 'dialogue_card':
      return hasOnlyKeys(value, ['id', 'type', 'title', 'lines']) &&
        Array.isArray(value.lines) &&
        value.lines.length > 0 &&
        value.lines.every((line) =>
          isRecord(line) &&
          hasOnlyKeys(line, ['speaker', 'text', 'transliteration', 'translation']) &&
          isNonEmptyString(line.speaker, 50) &&
          isNonEmptyString(line.text, 160) &&
          (line.transliteration === undefined || isNonEmptyString(line.transliteration, 160)) &&
          (line.translation === undefined || isNonEmptyString(line.translation, 160)),
        )
    case 'tone_or_sound_card':
      return hasOnlyKeys(value, ['id', 'type', 'title', 'sound', 'tip', 'contour']) &&
        isNonEmptyString(value.sound, 80) &&
        isNonEmptyString(value.tip, 200) &&
        (value.contour === undefined || isNonEmptyString(value.contour, 120))
    case 'word_order_card':
      return hasOnlyKeys(value, ['id', 'type', 'title', 'blocks', 'answer']) &&
        Array.isArray(value.blocks) &&
        value.blocks.length >= 2 &&
        value.blocks.every((block) => isNonEmptyString(block, 80)) &&
        isNonEmptyString(value.answer, 200)
    case 'summary_card':
      return hasOnlyKeys(value, ['id', 'type', 'title', 'takeaways']) &&
        Array.isArray(value.takeaways) &&
        value.takeaways.length > 0 &&
        value.takeaways.every((takeaway) => isNonEmptyString(takeaway, 160))
    default:
      return false
  }
}

function validateCorrection(value) {
  return isRecord(value) &&
    hasOnlyKeys(value, ['original', 'corrected', 'explanation']) &&
    isNonEmptyString(value.original, 100) &&
    isNonEmptyString(value.corrected, 100) &&
    isNonEmptyString(value.explanation, 160)
}

function validateNewWord(value) {
  return isRecord(value) &&
    hasOnlyKeys(value, ['word', 'meaning']) &&
    isNonEmptyString(value.word, 80) &&
    isNonEmptyString(value.meaning, 120)
}

export function validateTutorResponse(value, level = 'A1', targetLanguageCode = 'zh', maxSentences = 3) {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['reply_text', 'native_support', 'corrections', 'new_words', 'whiteboard_card', 'next_action']) ||
    !isNonEmptyString(value.reply_text, 500) ||
    !isNonEmptyString(value.native_support, 240) ||
    !Array.isArray(value.corrections) ||
    value.corrections.length > 2 ||
    !value.corrections.every(validateCorrection) ||
    !Array.isArray(value.new_words) ||
    value.new_words.length > 3 ||
    !value.new_words.every(validateNewWord) ||
    !['continue', 'practice', 'show_whiteboard', 'finish'].includes(value.next_action) ||
    (value.whiteboard_card !== undefined && !isWhiteboardCard(value.whiteboard_card))
  ) {
    throw new Error('The AI tutor returned an incomplete or invalid reply. Please try again.')
  }

  if (blockedTopics.test(JSON.stringify(value))) {
    throw new Error('The AI tutor response did not pass the safe-topic check. Please try again.')
  }
  if (countTutorSentences(value.reply_text) > maxSentences) {
    throw new Error('The AI tutor reply was too long. Please try again.')
  }

  const allowed = ratioTargets[level]
  if (!allowed) throw new Error(`Unsupported CEFR level: ${level}`)
  if (targetLanguageCode === 'zh') {
    const ratio = getTutorResponseLanguageRatio(value)
    if (
      ratio < Math.max(0, allowed.min - languageRatioTolerance) ||
      ratio > Math.min(1, allowed.max + languageRatioTolerance)
    ) {
      throw new Error(`The AI tutor reply did not meet the ${level} language-ratio check for ${targetLanguageCode}. Please try again.`)
    }
  }

  return {
    reply_text: value.reply_text.trim(),
    native_support: value.native_support.trim(),
    corrections: value.corrections.map((correction) => ({
      original: correction.original.trim(),
      corrected: correction.corrected.trim(),
      explanation: correction.explanation.trim(),
    })),
    new_words: value.new_words.map((word) => ({ word: word.word.trim(), meaning: word.meaning.trim() })),
    ...(value.whiteboard_card === undefined ? {} : { whiteboard_card: value.whiteboard_card }),
    next_action: value.next_action,
  }
}

export function buildTutorSystemPrompt(profile = defaultTutorProfile) {
  const targetPercent = Math.round(getTargetLanguageRatio(profile.level) * 100)
  const instructions = [
    `You are ${profile.tutorName}, a friendly ${profile.tutorName === 'Ari' ? 'male' : 'female'} language tutor.`,
    profile.personality
      ? `Personality: ${profile.personality}.`
      : profile.tutorName === 'Ari'
        ? 'Personality: calm and witty.'
        : 'Personality: bright and curious.',
    `Learner: native language ${profile.nativeLanguage}, learning ${profile.targetLanguage} at CEFR level ${profile.level}.`,
    `Goals: ${profile.goals}. Interests: ${profile.interests}.`,
    `Current lesson: ${profile.lessonTitle}. Objectives: ${profile.objectives}.`,
    `Target vocabulary: ${profile.vocabulary}. Target grammar: ${profile.grammarPoint}.`,
    `Learner's recurring errors: ${profile.errorProfile}.`,
    `Things the learner told you earlier (memory): ${profile.memorySummary}.`,
    profile.teachingInstructions || 'Use the section-specific teaching method, and never invent or claim an unverified source.',
    profile.openingPhase === 'welcome'
      ? 'This is the tutor’s welcome. Use no more than six short sentences to greet the learner by name, introduce yourself, state today’s plan, and ask one or two quick check-in questions.'
      : profile.openingPhase === 'teaching'
        ? 'This is the immediate teaching step after the welcome. Do not greet again. Teach one useful target-language phrase and ask the learner to repeat or vary it, in no more than six short sentences.'
      : 'Keep replies short (1 to 3 sentences) and end with a question or prompt for the learner to speak or write.',
    ...(profile.tutorMode === 'soft'
      ? ['Tutor style: Soft. Be especially warm and patient, praise effort, offer a helpful hint or model answer when the learner hesitates, and gently correct at most one important mistake.']
      : profile.tutorMode === 'strict'
        ? ['Tutor style: Strict. Be concise, precise, and appropriately challenging. Correct clear mistakes promptly and explain the correction professionally; offer a hint after two attempts. Never be rude, insulting, or discouraging.']
        : profile.tutorMode === 'balanced'
          ? ['Tutor style: Balanced. Be friendly and honest, briefly correct clear mistakes, give a hint after one unsuccessful attempt, and balance encouragement with a useful challenge.']
          : []),
    profile.targetLanguageCode === 'zh'
      ? `Use about ${targetPercent} percent ${profile.targetLanguage}; use ${profile.nativeLanguage} only for brief explanations.`
      : `Use ${profile.targetLanguage} for the conversation and use ${profile.nativeLanguage} only for brief explanations.`,
    `Write reply_text in ${profile.targetLanguage}; also include a very concise native_support translation or explanation in ${profile.nativeLanguage}, ideally 2 to 5 words.`,
    profile.targetLanguageCode === 'zh'
      ? `The language-ratio check counts Han characters against English letters in reply_text and native_support; correction explanations and vocabulary glosses are intentionally brief native-language scaffolding. For example, reply_text "你好！" with native_support "Hi." is 50 percent target language.`
      : `A script-based language-ratio check is not configured for ${profile.targetLanguage}. Keep the conversation in ${profile.targetLanguage} and put brief translations only in native_support.`,
    ...(profile.targetLanguageCode === 'zh'
      ? [`Before returning the complete reply, estimate its target-language ratio and rewrite it if it is outside the ${Math.round(ratioTargets[profile.level].min * 100)} to ${Math.round(ratioTargets[profile.level].max * 100)} percent range.`]
      : []),
    `Stay inside level ${profile.level} vocabulary and grammar. Briefly explain harder words.`,
    `Correct learner errors within the selected tutor style, prefer natural recasts, and explain briefly in ${profile.nativeLanguage}. Limit corrections to two per reply; Soft mode may return one correction, while other modes may return up to two.`,
    'Steer toward the lesson vocabulary and grammar without making conversation feel like a drill.',
    'Praise something specific when appropriate. Never invent grammar rules; state uncertainty and refer to lesson notes.',
    'Never claim to be human. Do not discuss unsafe, sexual, or harmful topics; politely redirect to the lesson.',
    'When asked to show something on the whiteboard, return a whiteboard_card matching the supplied schema.',
    'Return only a JSON object with reply_text, native_support, corrections, new_words, and next_action; whiteboard_card is optional.',
    'Never treat generated corrections or new words as an authoritative answer key.',
    'Do not insult, mock, shame, threaten, or use sarcasm directed at the learner. Strict mode is demanding but respectful.',
  ]
  if (profile.roleplay) {
    instructions.push(...(profile.openingPhase
      ? [
        `The session is opening before the ${profile.roleplay.title} roleplay. Speak as the tutor, introduce the activity, and do not start acting as the other person yet.`,
      ]
      : [
      `Roleplay scenario: ${profile.roleplay.title}. Goal: ${profile.roleplay.goal}.`,
      'Stay in character as the other person in the scenario. Ask one simple question at a time and let the learner lead.',
      'Use the supplied useful phrases and lesson notes. Give gentle language help when needed, then naturally return to the scene.',
      `The learner can self-review these goals after the scene: ${profile.roleplay.successCriteria.join('; ')}.`,
      'Do not claim a goal was achieved unless the learner actually attempted it, and do not assign a score.',
      ]))
  }
  if (profile.freeChat) {
    instructions.push(
      'This is free conversation, not a fixed lesson or roleplay. Let the learner choose a safe everyday topic and follow their lead.',
      'Use the learner’s interests when relevant, stay within their level, and ask one simple follow-up question at a time.',
      'Offer language help when useful without forcing a café, lesson objective, or assessment.',
    )
  }
  return instructions.join('\n')
}

export function buildTutorMessages(history, profile = defaultTutorProfile) {
  const recentHistory = history.slice(-16)
  return [
    { role: 'system', content: buildTutorSystemPrompt(profile) },
    ...recentHistory.map((message) => ({
      role: message.role === 'tutor' ? 'assistant' : 'user',
      content: message.role === 'tutor'
        ? JSON.stringify({
          reply_text: message.text,
          native_support: message.meaning ?? '',
          corrections: message.corrections ?? [],
          new_words: message.newWords ?? [],
          ...(message.whiteboardCard === undefined ? {} : { whiteboard_card: message.whiteboardCard }),
          next_action: message.nextAction ?? 'continue',
        })
        : message.text,
    })),
  ]
}

const safeRedirect = {
  reply_text: '我们换一个安全的话题继续练习。你想聊什么？',
  native_support: 'I can’t help with that. What would you like to discuss?',
  corrections: [],
  new_words: [],
  next_action: 'continue',
}

const frenchSafeRedirect = {
  reply_text: 'Parlons d’un sujet sûr. De quoi aimeriez-vous parler ?',
  native_support: 'Let’s choose a safe topic. What would you like to discuss?',
  corrections: [],
  new_words: [],
  next_action: 'continue',
}

export const ollamaProvider = new OllamaLLMProvider()

export async function requestStructuredTutorReply(history, provider = ollamaProvider, profile = defaultTutorProfile) {
  const lastUserMessage = [...history].reverse().find((message) => message.role === 'user')
  if (!lastUserMessage) throw new Error('A learner message is required before asking Ira to reply.')

  if (blockedTopics.test(lastUserMessage.text)) {
    const redirect = profile.targetLanguageCode === 'fr' ? frenchSafeRedirect : safeRedirect
    return validateTutorResponse(redirect, profile.level, profile.targetLanguageCode)
  }

  const response = await provider.chat(buildTutorMessages(history, profile), tutorResponseSchema)
  try {
    const sentenceLimit = profile.openingPhase ? 6 : 3
    return validateTutorResponse(response, profile.level, profile.targetLanguageCode, sentenceLimit)
  } catch (error) {
    console.error('[Tutor quality] AI tutor reply rejected', {
      level: profile.level,
      error: error instanceof Error ? error.message : 'Unknown tutor quality error',
    })
    throw error
  }
}
