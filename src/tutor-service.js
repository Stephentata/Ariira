import { defaultTutorProfile, requestStructuredTutorReply } from './tutor-provider.js'
import {
  buildTeachingInstructions,
  createDistressResponse,
  createRedirectResponse,
  detectDistress,
  detectUnsafeRequest,
  enrichTutorTurn,
  retrieveKnowledge,
} from './teaching-layer.js'

const levelOrder = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function normalizeLevel(level) {
  return levelOrder.includes(level) ? level : defaultTutorProfile.level
}

function buildProfile(options) {
  const context = options.lessonOrRoleplay
  const roleplay = context?.kind === 'roleplay' ? context : null
  const lessonTitle = context?.title || (context?.kind === 'free-chat' ? 'Free conversation' : defaultTutorProfile.lessonTitle)
  const isMandarin = options.languageCode === 'zh'

  return {
    ...defaultTutorProfile,
    tutorName: options.tutor,
    nativeLanguage: options.nativeLanguage,
    targetLanguage: options.language,
    targetLanguageCode: options.languageCode || defaultTutorProfile.targetLanguageCode,
    level: normalizeLevel(options.level),
    goals: options.goals || defaultTutorProfile.goals,
    interests: options.interests?.join(', ') || defaultTutorProfile.interests,
    lessonTitle,
    objectives: context?.goal || `Practise speaking about ${lessonTitle}.`,
    vocabulary: context?.vocabulary || (isMandarin
      ? defaultTutorProfile.vocabulary
      : 'Use a common phrase grounded in retrieved knowledge for this lesson.'),
    grammarPoint: context?.grammarPoint || (isMandarin
      ? defaultTutorProfile.grammarPoint
      : 'Use a retrieved language point if relevant; do not assume a fixed grammar rule.'),
    tutorMode: options.mode,
    personality: options.personality || '',
    openingPhase: options.openingPhase,
    section: options.lessonOrRoleplay?.section || inferSection(lessonTitle),
    memorySummary: options.memorySummary || defaultTutorProfile.memorySummary,
    freeChat: context?.kind === 'free-chat',
    ...(roleplay ? {
      roleplay: {
        title: roleplay.title,
        goal: roleplay.goal || `Practise the ${roleplay.title} scenario.`,
        successCriteria: roleplay.successCriteria || [],
      },
    } : {}),
  }
}

const sectionNames = ['Beginner', 'Life', 'Food', 'Travel', 'Shopping', 'Grammar', 'Social', 'Culture', 'Romance', 'Health', 'Education', 'Work', 'Entertainment', 'Debates', 'Pronunciation', 'Vocabulary']
function inferSection(title) {
  const normalized = title.toLowerCase()
  return sectionNames.find((section) => normalized.includes(section.toLowerCase())) || 'Beginner'
}

function mapTutorTurn(turn) {
  return {
    reply: turn.reply_text,
    translation: turn.native_support,
    romanisation: '',
    correction: turn.corrections[0] ?? null,
    new_words: turn.new_words,
    score: null,
    corrections: turn.corrections,
    whiteboard_card: turn.whiteboard_card,
    next_action: turn.next_action,
  }
}

export class TutorService {
  constructor({ requestTurn = requestStructuredTutorReply, mock = false } = {}) {
    this.requestTurn = requestTurn
    this.mock = mock
    this.session = null
  }

  async startSession(options) {
    if (!options || !['Ari', 'Ira'].includes(options.tutor)) {
      throw new Error('Choose Ari or Ira before starting a tutor session.')
    }
    if (!['soft', 'balanced', 'strict'].includes(options.mode)) {
      throw new Error('Choose a tutor feedback style before starting a session.')
    }
    if (!options.language?.trim() || !options.nativeLanguage?.trim()) {
      throw new Error('Choose your learning and native languages before starting a session.')
    }
    this.session = {
      profile: buildProfile(options),
      history: (options.history || []).map((turn) => ({ role: turn.role, text: turn.text })),
      startedAt: Date.now(),
      corrections: [],
      words: [],
      failures: options.adaptiveState?.failures ?? 0,
      outcomes: [...(options.adaptiveState?.outcomes ?? [])].slice(-3),
      errorPatterns: { ...(options.adaptiveState?.errorPatterns ?? {}) },
    }
    return { startedAt: this.session.startedAt }
  }

  async sendUserTurn(textOrAudio) {
    if (!this.session) throw new Error('Start a tutor session before sending a turn.')
    if (typeof textOrAudio !== 'string') {
      throw new Error('Audio turns are not connected yet. Use speech recognition to send the transcript as text.')
    }
    const text = textOrAudio.trim()
    if (!text) throw new Error('Enter or say a response before sending it.')
    if (text.length > 1000) throw new Error('Keep each speaking turn to 1,000 characters or fewer.')
    this.session.history.push({ role: 'user', text })
  }

  async getTutorTurn() {
    if (!this.session || !this.session.history.some((turn) => turn.role === 'user')) {
      throw new Error('Send a learner turn before requesting the tutor response.')
    }
    const learnerTurn = this.session.history.at(-1)
    if (detectDistress(learnerTurn.text)) {
      this.session.failures = 0
      return {
        ...createDistressResponse(this.session.profile.nativeLanguage),
        safeguard: /\bease up\b/i.test(learnerTurn.text) ? 'safe-word' : 'distress',
        failureCount: 0,
        learningState: { failures: 0, outcomes: [...this.session.outcomes], errorPatterns: { ...this.session.errorPatterns } },
      }
    }
    if (detectUnsafeRequest(learnerTurn.text)) {
      return { ...createRedirectResponse(this.session.profile.nativeLanguage), failureCount: this.session.failures }
    }
    const profile = { ...this.session.profile }
    const retrieved = retrieveKnowledge({
      language: profile.targetLanguage,
      level: profile.level,
      section: profile.section,
      skill: profile.section === 'Grammar' ? 'grammar' : profile.section === 'Pronunciation' ? 'pronunciation' : undefined,
    })
    const teachingInstructions = buildTeachingInstructions({
      mode: profile.tutorMode,
      section: profile.section,
      retrieved,
      failureCount: this.session.failures + 1,
      difficulty: this.session.outcomes.slice(-3).filter(Boolean).length >= 2
        ? 'up'
        : this.session.outcomes.length >= 2 ? 'down' : 'steady',
    })
    profile.teachingInstructions = teachingInstructions
    profile.errorProfile = Object.entries(this.session.errorPatterns).map(([type, count]) => `${type}: ${count}`).join(', ') || profile.errorProfile
    const result = this.mock
      ? await this.mockTurn()
      : await this.requestTurn(
        this.session.history.map((turn) => ({ role: turn.role, text: turn.text })),
        undefined,
        profile,
      )
    const turn = mapTutorTurn(result)
    if (this.session.profile.targetLanguageCode === 'zh') {
      const { pinyin } = await import('pinyin-pro')
      turn.romanisation = (turn.reply.match(/\p{Script=Han}+/gu) ?? [])
        .map((segment) => pinyin(segment, { type: 'array' }).join(' '))
        .join(' … ')
    }
    this.session.history.push({
      role: 'tutor',
      text: turn.reply,
      corrections: turn.corrections,
      newWords: turn.new_words,
    })
    const failed = turn.corrections.length > 0 || !learnerTurn.text.trim() || /^(?:i (?:don't know|give up|can't)|no idea|pass|skip)$/i.test(learnerTurn.text.trim())
    this.session.failures = failed ? this.session.failures + 1 : 0
    this.session.outcomes.push(!failed)
    this.session.outcomes = this.session.outcomes.slice(-3)
    for (const correction of turn.corrections) {
      const explanation = correction.explanation.toLowerCase()
      const category = /pronounc|tone|sound/.test(explanation) ? 'pronunciation'
        : /register|polite|formal|rude/.test(explanation) ? 'register'
          : /word order|order/.test(explanation) ? 'word_order'
            : /vocab|word choice/.test(explanation) ? 'vocabulary'
              : /grammar|tense|particle|conjugat/.test(explanation) ? 'grammar' : 'slip'
      this.session.errorPatterns[category] = (this.session.errorPatterns[category] || 0) + 1
    }
    this.session.corrections.push(...turn.corrections)
    this.session.words.push(...turn.new_words)
    return {
      ...enrichTutorTurn(turn, {
        mode: this.session.profile.tutorMode,
        retrieved,
        failureCount: this.session.failures,
        difficulty: profile.teachingInstructions.includes('difficulty direction: up') ? 'up'
          : profile.teachingInstructions.includes('difficulty direction: down') ? 'down' : 'steady',
      }),
      failureCount: this.session.failures,
      learningState: {
        failures: this.session.failures,
        outcomes: [...this.session.outcomes],
        errorPatterns: { ...this.session.errorPatterns },
      },
    }
  }

  async endSession() {
    if (!this.session) return { turns: 0, corrections: [], new_words: [], durationSeconds: 0, score: null }
    const summary = {
      turns: this.session.history.filter((turn) => turn.role === 'user').length,
      corrections: [...this.session.corrections],
      new_words: [...this.session.words],
      durationSeconds: Math.max(0, Math.round((Date.now() - this.session.startedAt) / 1000)),
      score: null,
    }
    this.session = null
    return summary
  }

  async mockTurn() {
    const learnerTurn = this.session.history.at(-1)?.text || ''
    return {
      reply_text: `Nice effort. Let’s build on “${learnerTurn.slice(0, 80)}”. Can you add one more detail?`,
      native_support: 'This is a demo reply from the mock tutor service.',
      corrections: [],
      new_words: [],
      next_action: 'continue',
    }
  }
}

export const mockTutorService = new TutorService({ mock: true })

export const TUTOR_INTEGRATION_TODOS = Object.freeze([
  'Connect direct audio-turn input to the tutor engine; the current adapter accepts recognized text transcripts.',
  'Provide engine-generated romanisation for non-Mandarin target languages.',
  'Provide a tutor-generated session score and scoring rubric; no score is fabricated by the adapter.',
  'Add tutor engine support for voice flavour and tutor personality preferences.',
])
