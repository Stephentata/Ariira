import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  getLearningProgressSummary,
  readLearningProgress,
  recordPracticeSeconds,
  type LearningProgress,
} from './learning-progress.js'
import {
  clearAriData,
  DEFAULT_LEARNER_SETTINGS,
  deleteTutorSession,
  readLearnerSettings,
  readTutorHistory,
  saveLearnerSettings,
  saveTutorSession,
  type LearnerSettings,
  type TutorHistorySession,
} from './learner-data.js'
import { addNewReviewItems, readReviewDeck, saveReviewDeck } from './review-scheduler.js'
import { evaluatePlacementCheck, PLACEMENT_QUESTIONS, type PlacementResult } from './placement-check.js'
import { type RoleplayScenario } from './roleplay-scenarios.js'
import {
  DEFAULT_SPEECH_PREFERENCES,
  getTutorSpeechGender,
  readSpeechPreferences,
  saveSpeechPreferences,
  type SpeechPreferences,
} from './speech-options.js'
import { cancelSpeechPlayback, playSpeechAudio } from './speech-playback.js'
import { isLikelyNativeLanguage, isLowConfidenceSpeech, parsePracticePhraseOptions } from './speech-input.js'
import { LANGUAGES } from './language-options.js'
import { TutorService } from './tutor-service.js'
import KnowledgeAdmin from './KnowledgeAdmin'
import { recordSafeguardEvent } from './safeguard-telemetry.js'
import TutorLibrary from './TutorLibrary'
import OnboardingFlow from './OnboardingFlow'
import TutorAvatar from './TutorAvatar'
import { initialTheme } from './theme-preference.js'
import { validateSessionLanguage } from './session-language.js'
import {
  type WhiteboardCard,
  type TutorCorrection,
  type TutorNewWord,
  type TutorReply,
} from './tutor-provider.js'
import './App.css'

const LessonPlayer = import.meta.env.DEV ? lazy(() => import('./LessonPlayer')) : null
const ReviewDeck = import.meta.env.DEV ? lazy(() => import('./ReviewDeck')) : null

type Page = 'home' | 'explore' | 'lesson' | 'translate' | 'vocabulary' | 'progress' | 'settings'
type Theme = 'light' | 'dark'
type VoiceInputMode = 'tap' | 'hold'
type SpeechPreferenceState = { preferences: SpeechPreferences; error: string }
type LearningSnapshot = {
  progress: LearningProgress
  words: number
  masteredWords: number
  dueWords: number
  error: string
}
type LearnerDataSnapshot = {
  settings: LearnerSettings
  history: TutorHistorySession[]
  error: string
}
type TutorMessage = {
  id: number
  role: 'tutor' | 'user'
  text: string
  pinyin?: string
  meaning?: string
  note?: string
  corrections?: Array<TutorCorrection & { error_type?: string }>
  newWords?: TutorNewWord[]
  whiteboardCard?: WhiteboardCard
  nextAction?: TutorReply['next_action']
  sources?: Array<{ name: string; url: string; licence: string; attribution_text: string }>
  verification?: 'grounded' | 'unverified'
  hintLevel?: number
  failureCount?: number
  cooldown?: boolean
  safeguard?: 'distress' | 'safe-word' | 'redirect'
  learningState?: { failures: number; outcomes: boolean[]; errorPatterns: Record<string, number> }
}
type SessionSummary = {
  corrections: number
  newWords: number
  minutes: number
  score: number | null
  suggestedNextArea: string
  sentencesSpoken: number
}

type SpeechRecognitionAlternativeLike = { transcript: string; confidence?: number }
type SpeechRecognitionResultLike = ArrayLike<SpeechRecognitionAlternativeLike> & { isFinal: boolean }
type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}
type SpeechRecognitionErrorLike = { error: string }
type SpeechTurnEvidence = {
  alternatives: Array<{ transcript: string; confidence: number | null }>
  nativeLanguageLikely?: boolean
}
type BrowserSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  grammars?: unknown
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition

function getInitialSpeechPreferenceState(): SpeechPreferenceState {
  try {
    return { preferences: readSpeechPreferences(window.localStorage), error: '' }
  } catch (error) {
    return {
      preferences: { ...DEFAULT_SPEECH_PREFERENCES },
      error: error instanceof Error ? error.message : 'Could not load saved voice preferences.',
    }
  }
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

function loadLearningSnapshot(): LearningSnapshot {
  let progress: LearningProgress = {
    activityByDate: {},
    objectives: {},
    skills: {},
    errors: {},
    lessonsCompleted: 0,
    languageProgress: {},
  }
  let words = 0
  let masteredWords = 0
  let dueWords = 0
  const errors: string[] = []
  try {
    progress = readLearningProgress(window.localStorage)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Could not read learning progress.')
  }
  try {
    const cards = readReviewDeck(window.localStorage) ?? []
    words = cards.length
    masteredWords = cards.filter((card) => card.state === 'mastered').length
    const now = new Date()
    dueWords = cards.filter((card) => Date.parse(card.dueAt) <= now.getTime()).length
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Could not read your vocabulary review deck.')
  }
  return { progress, words, masteredWords, dueWords, error: errors.join(' ') }
}

function loadLearnerDataSnapshot(): LearnerDataSnapshot {
  let settings: LearnerSettings = { ...DEFAULT_LEARNER_SETTINGS, memory: [] }
  let history: TutorHistorySession[] = []
  const errors: string[] = []
  try {
    settings = readLearnerSettings(window.localStorage)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Could not read learner settings.')
  }
  try {
    history = readTutorHistory(window.localStorage)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Could not read conversation history.')
  }
  return { settings, history, error: errors.join(' ') }
}

function formatPracticeTime(seconds: number) {
  const totalMinutes = Math.floor(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours}h ${minutes}m` : `${totalMinutes} min`
}

function formatObjectiveName(value: string) {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

type IconName =
  | 'home'
  | 'sparkles'
  | 'translate'
  | 'book'
  | 'chart'
  | 'settings'
  | 'arrow'
  | 'play'
  | 'mic'
  | 'swap'
  | 'volume'
  | 'clock'
  | 'repeat'
  | 'keyboard'
  | 'captions'
  | 'check'
  | 'plus'
  | 'chevron'
  | 'close'
  | 'moon'
  | 'sun'

const icons: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>,
  sparkles: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
  translate: <><path d="M4 5h12M10 3v2m3 0c-.5 4-3.5 7-7 9" /><path d="M6 9c1.5 2 3.5 3.5 6 4.5M14 20l4-9 4 9m-6.5-3h5" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z" /><path d="M4 17a2.5 2.5 0 0 1 2.5-2.5H20M8 7h8" /></>,
  chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 1.9Z" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  play: <><path d="m8 5 12 7-12 7V5Z" /></>,
  mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-4 0h8" /></>,
  swap: <><path d="m16 3 4 4-4 4M4 7h16M8 21l-4-4 4-4m12 4H4" /></>,
  volume: <><path d="M11 5 6 9H3v6h3l5 4V5Zm4 4a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  repeat: <><path d="m17 1 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
  keyboard: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h.01M10 9h.01M13 9h.01M16 9h.01M7 12h.01M10 12h.01M13 12h.01M16 12h.01M8 15h8" /></>,
  captions: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 10H8.5a1.5 1.5 0 0 0 0 3H10m6-3h-1.5a1.5 1.5 0 0 0 0 3H16" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  chevron: <path d="m7 10 5 5 5-5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  moon: <path d="M20.8 13A8.5 8.5 0 0 1 11 3.2 8.7 8.7 0 1 0 20.8 13Z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m17.1-7.1-1.4 1.4M6.3 17.7l-1.4 1.4m14.2 0-1.4-1.4M6.3 6.3 4.9 4.9" /></>,
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name]}
    </svg>
  )
}

const navigation: { id: Page; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'explore', label: 'Explore', icon: 'sparkles' },
  { id: 'vocabulary', label: 'Saved words', icon: 'book' },
  { id: 'progress', label: 'My progress', icon: 'chart' },
]

const languages = LANGUAGES

const samples: Record<string, string> = {
  'hello|zh': '你好！',
  'good morning|zh': '早上好！',
  'thank you|zh': '谢谢！',
  'where is the station?|zh': '车站在哪里？',
  'hello|es': '¡Hola!',
  'good morning|es': '¡Buenos días!',
  'thank you|es': '¡Gracias!',
  'where is the station?|es': '¿Dónde está la estación?',
  'hello|fr': 'Bonjour !',
  'good morning|fr': 'Bonjour !',
  'thank you|fr': 'Merci !',
  'where is the station?|fr': 'Où est la gare ?',
  'hello|ja': 'こんにちは！',
  'good morning|ja': 'おはようございます！',
  'thank you|ja': 'ありがとうございます！',
  'where is the station?|ja': '駅はどこですか？',
}

function getTutorWelcomeMessages(languageCode: string): TutorMessage[] {
  void languageCode
  return []
}

async function requestTutorReply(
  history: TutorMessage[],
  id: number,
  settings?: LearnerSettings,
  scenario?: RoleplayScenario | null,
  freeChat = false,
  lessonTitle = 'Order your first coffee',
  adaptiveState: { failures: number; outcomes: boolean[]; errorPatterns: Record<string, number> } = {
    failures: 0,
    outcomes: [],
    errorPatterns: {},
  },
  section = 'Food',
  openingPhase?: 'welcome' | 'teaching',
  speechEvidence?: SpeechTurnEvidence,
): Promise<TutorMessage> {
  const nativeLanguage = languages.find((language) => language.code === settings?.nativeLanguageCode)
  const targetLanguage = languages.find((language) => language.code === settings?.targetLanguageCode)
  const service = new TutorService()
  const savedWords = readReviewDeck(window.localStorage) ?? []
  const wordsToReview = savedWords
    .filter((word) => Date.parse(word.dueAt) <= Date.now())
    .slice(0, 8)
    .map((word) => `${word.word} (${word.translation})`)
  const context = scenario
    ? {
      kind: 'roleplay' as const,
      title: scenario.title,
      section,
      goal: `${scenario.goal} Success criteria: ${scenario.successCriteria.join('; ')}.`,
      successCriteria: scenario.successCriteria,
      vocabulary: scenario.vocabulary,
      grammarPoint: scenario.grammarPoint,
    }
    : freeChat
      ? { kind: 'free-chat' as const, title: lessonTitle, section }
      : { kind: 'lesson' as const, title: lessonTitle, section }
  await service.startSession({
    language: targetLanguage?.name ?? 'Spanish',
    languageCode: targetLanguage?.code,
    nativeLanguage: nativeLanguage?.name ?? 'English',
    level: settings?.level ?? 'A1',
    lessonOrRoleplay: context,
    tutor: settings?.tutorName ?? 'Ari',
    mode: settings?.tutorMode ?? 'balanced',
    personality: settings?.personality,
    openingPhase,
    interests: settings?.interests.split(',').map((interest) => interest.trim()).filter(Boolean),
    goals: settings?.goals,
    memorySummary: [
      ...(settings?.memory ?? []),
      ...(wordsToReview.length ? [`Words due for spaced review: ${wordsToReview.join(', ')}`] : []),
      ...(speechEvidence
        ? [`Speech recognition alternatives and confidence (do not treat uncertain recognition as a learner error): ${speechEvidence.alternatives.length ? speechEvidence.alternatives.map((item) => `"${item.transcript}"${item.confidence === null ? '' : ` (${Math.round(item.confidence * 100)}% confidence)`}`).join(' / ') : 'not provided by the browser'}. Treat missing confidence, a best-candidate confidence below 60%, or similarly confident alternatives with materially different meanings as uncertain: ask “Did you say …?” or invite a repeat, without corrections, failure counts, or pronunciation scoring. First infer learner intent. ${speechEvidence.nativeLanguageLikely ? 'This likely is native-language speech, so treat it as “How do I say this?” and give the target-language phrase plus a short drill. ' : ''}Only correct language errors when the utterance is clearly understood; give pronunciation feedback only at high confidence.`]
        : []),
    ].join('; ') || undefined,
    adaptiveState,
    history: history.slice(0, -1).map(({ role, text }) => ({ role, text })),
  })
  const learnerTurn = history.at(-1)
  if (!learnerTurn || learnerTurn.role !== 'user') throw new Error('Send a learner response before requesting the tutor.')
  await service.sendUserTurn(learnerTurn.text)
  const content = await service.getTutorTurn()
  await service.endSession()
  return {
    id,
    role: 'tutor',
    text: content.reply,
    pinyin: content.romanisation,
    meaning: content.translation,
    corrections: content.corrections.map((correction, index) => ({
      ...correction,
      ...(index === 0 && content.correction ? { error_type: content.correction.error_type } : {}),
    })),
    newWords: content.new_words,
    whiteboardCard: content.whiteboard_card,
    nextAction: content.next_action,
    sources: content.sources,
    verification: content.verification,
    hintLevel: content.hint_level,
    failureCount: content.failureCount,
    cooldown: content.cooldown,
    safeguard: content.safeguard,
    learningState: content.learningState,
  }
}

function TutorWhiteboardCard({ card }: { card: WhiteboardCard }) {
  return (
    <section className="tutor-whiteboard-card" aria-label={`Whiteboard card: ${card.title}`}>
      <span>{card.title.toUpperCase()} · AI-GENERATED</span>
      <h3>{card.title}</h3>
      {card.type === 'vocab_card' && (
        <>
          <p><strong>{card.word}</strong> · {card.transliteration} · {card.translation}</p>
          <p>{card.example_sentence}</p>
        </>
      )}
      {card.type === 'grammar_card' && (
        <>
          <p><strong>{card.pattern}</strong> · {card.explanation}</p>
          <ul>{card.examples.map((example) => <li key={example}>{example}</li>)}</ul>
        </>
      )}
      {card.type === 'dialogue_card' && (
        <ul>{card.lines.map((line, index) => <li key={`${line.speaker}-${index}`}><strong>{line.speaker}:</strong> {line.text}{line.translation && ` — ${line.translation}`}</li>)}</ul>
      )}
      {card.type === 'tone_or_sound_card' && <p><strong>{card.sound}</strong> · {card.tip}</p>}
      {card.type === 'word_order_card' && <p>{card.blocks.join(' · ')} → <strong>{card.answer}</strong></p>}
      {card.type === 'summary_card' && <ul>{card.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}</ul>}
    </section>
  )
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [libraryKind, setLibraryKind] = useState<'lessons' | 'roleplays' | 'free-chat'>('lessons')
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [learningSnapshot, setLearningSnapshot] = useState<LearningSnapshot>(() => loadLearningSnapshot())
  const [learnerData, setLearnerData] = useState<LearnerDataSnapshot>(() => loadLearnerDataSnapshot())
  const [memoryInput, setMemoryInput] = useState('')
  const [displayNameDraft, setDisplayNameDraft] = useState(() => learnerData.settings.displayName)
  const [placementAnswers, setPlacementAnswers] = useState<string[]>(() => PLACEMENT_QUESTIONS.map(() => ''))
  const [placementResult, setPlacementResult] = useState<PlacementResult | null>(null)
  const [activeRoleplay, setActiveRoleplay] = useState<RoleplayScenario | null>(null)
  const [activeLessonTitle, setActiveLessonTitle] = useState('Order your first coffee')
  const [activeSection, setActiveSection] = useState('Food')
  const [liveSession, setLiveSession] = useState(false)
  const [sessionPaused, setSessionPaused] = useState(false)
  const [sessionPlanOpen, setSessionPlanOpen] = useState(false)
  const [sessionNotesOpen, setSessionNotesOpen] = useState(false)
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null)
  const [safeguardOffer, setSafeguardOffer] = useState(false)
  const [lessonRoleplayActive, setLessonRoleplayActive] = useState(false)
  const [activeFreeChat, setActiveFreeChat] = useState(false)
  const [freeChatDurationMinutes, setFreeChatDurationMinutes] = useState(10)
  const [freeChatTopic, setFreeChatTopic] = useState('')
  const [roleplayComplete, setRoleplayComplete] = useState(false)
  const [roleplayReflection, setRoleplayReflection] = useState<boolean[]>([])
  const [dataMessage, setDataMessage] = useState('')
  const [theme, setTheme] = useState<Theme>(() => initialTheme(window.localStorage, window.matchMedia('(prefers-color-scheme: dark)').matches))
  const [mascotPoked, setMascotPoked] = useState(false)
  const [mascotDragging, setMascotDragging] = useState(false)
  const mascotPokeTimerRef = useRef<number | null>(null)
  const tutorReactionTimerRef = useRef<number | null>(null)
  const mascotDragRef = useRef({ pointerId: -1, startX: 0, startY: 0, lastX: 0, lastY: 0, dragged: false })
  const mascotRotationRef = useRef({ x: 0, y: 0 })
  const [sourceCode, setSourceCode] = useState(() => learnerData.settings.nativeLanguageCode)
  const [targetCode, setTargetCode] = useState(() => learnerData.settings.targetLanguageCode)
  const [phrase, setPhrase] = useState('')
  const [translation, setTranslation] = useState('')
  const [translationMessage, setTranslationMessage] = useState('')
  const [tutorInput, setTutorInput] = useState('')
  const initialTutorMessages = getTutorWelcomeMessages(learnerData.settings.targetLanguageCode)
  const [tutorMessages, setTutorMessages] = useState(initialTutorMessages)
  const tutorMessagesRef = useRef(initialTutorMessages)
  const [showPinyin, setShowPinyin] = useState(true)
  const [showMeaning, setShowMeaning] = useState(true)
  const [tutorPending, setTutorPending] = useState(false)
  const [tutorError, setTutorError] = useState('')
  const [tutorRetryHistory, setTutorRetryHistory] = useState<TutorMessage[] | null>(null)
  const [voiceConversation, setVoiceConversation] = useState(false)
  const [voiceListening, setVoiceListening] = useState(false)
  const [voiceSpeaking, setVoiceSpeaking] = useState(false)
  const [voiceAudioLevel, setVoiceAudioLevel] = useState(0)
  const [tutorReaction, setTutorReaction] = useState<'understood' | 'unclear' | 'correcting' | null>(null)
  const audioLevelUpdatedAtRef = useRef(0)
  const microphoneLevelUpdatedAtRef = useRef(0)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [learnerSpeechDraft, setLearnerSpeechDraft] = useState('')
  const [speechReadyToSend, setSpeechReadyToSend] = useState(false)
  const learnerSpeechDraftRef = useRef('')
  const [lastLearnerSpeech, setLastLearnerSpeech] = useState('')
  const speechAlternativesRef = useRef<SpeechTurnEvidence['alternatives']>([])
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [showHelpPhrases, setShowHelpPhrases] = useState(false)
  const [helpPhraseAfterMessageId, setHelpPhraseAfterMessageId] = useState<number | null>(null)
  const [speechCorrectionEditing, setSpeechCorrectionEditing] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [voiceInputMode] = useState<VoiceInputMode>('tap')
  const [voiceLatencyMs, setVoiceLatencyMs] = useState<number | null>(null)
  const [speechPreferenceState, setSpeechPreferenceState] = useState(getInitialSpeechPreferenceState)
  const [previewingTutorVoice, setPreviewingTutorVoice] = useState<'Ari' | 'Ira' | null>(null)
  const speechPreferences = speechPreferenceState.preferences
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const voiceConversationRef = useRef(false)
  const sessionPausedRef = useRef(false)
  const tutorNeedsResumeSpeechRef = useRef(false)
  const voiceGestureUnlockedRef = useRef(false)
  const voiceOpeningPlayedRef = useRef(false)
  const tutorPendingRef = useRef(false)
  const voiceSpeakingRef = useRef(false)
  const recognitionRunningRef = useRef(false)
  const recognitionTimerRef = useRef<number | null>(null)
  const tapSilenceTimerRef = useRef<number | null>(null)
  const tapTranscriptRef = useRef('')
  const tapAlternativesRef = useRef<SpeechTurnEvidence['alternatives']>([])
  const tapToSendRef = useRef(false)
  const microphoneStreamRef = useRef<MediaStream | null>(null)
  const microphoneFrameRef = useRef<number | null>(null)
  const speechGenerationRef = useRef(0)
  const holdToSpeakActiveRef = useRef(false)
  const pushToTalkSessionRef = useRef(false)
  const holdTranscriptRef = useRef('')
  const tutorSessionIdRef = useRef('')
  const tutorStartedAtRef = useRef(Date.now())
  const tutorAdaptationRef = useRef<{ failures: number; outcomes: boolean[]; errorPatterns: Record<string, number> }>({
    failures: 0,
    outcomes: [],
    errorPatterns: {},
  })

  function updateLearnerSpeechDraft(text: string) {
    learnerSpeechDraftRef.current = text
    setLearnerSpeechDraft(text)
  }

  function updateVoiceAudioLevel(level: number) {
    const now = performance.now()
    if (level === 0 || now - audioLevelUpdatedAtRef.current >= 80) {
      audioLevelUpdatedAtRef.current = now
      setVoiceAudioLevel(level)
    }
  }

  function updateMicrophoneLevel(level: number) {
    const now = performance.now()
    if (now - microphoneLevelUpdatedAtRef.current >= 80 || level === 0) {
      microphoneLevelUpdatedAtRef.current = now
      setMicrophoneLevel(level)
    }
  }

  const sourceLanguage = languages.find((language) => language.code === sourceCode) ?? languages[0]
  const targetLanguage = languages.find((language) => language.code === targetCode) ?? languages[1]
  const tutorVoiceGender = getTutorSpeechGender(learnerData.settings.tutorName)
  const learningSummary = useMemo(
    () => getLearningProgressSummary(learningSnapshot.progress, new Date(), targetCode),
    [learningSnapshot.progress, targetCode],
  )
  const canOpenLessonPreview = import.meta.env.DEV
  const pageTitle = page === 'lesson' ? 'Text lesson' : navigation.find((item) => item.id === page)?.label ?? 'Settings'
  const sessionLanguageReady = targetCode === learnerData.settings.targetLanguageCode
  const canStartTutor = learnerData.settings.onboardingComplete && sessionLanguageReady

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'dark' ? '#04222b' : '#e2f4f0',
    )
  }, [theme])

  useEffect(() => () => {
    if (mascotPokeTimerRef.current !== null) window.clearTimeout(mascotPokeTimerRef.current)
    if (tutorReactionTimerRef.current !== null) window.clearTimeout(tutorReactionTimerRef.current)
    if (tapSilenceTimerRef.current !== null) window.clearTimeout(tapSilenceTimerRef.current)
    if (microphoneFrameRef.current !== null) window.cancelAnimationFrame(microphoneFrameRef.current)
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  useEffect(() => {
    const refresh = () => setLearningSnapshot(loadLearningSnapshot())
    const refreshLearnerData = () => setLearnerData(loadLearnerDataSnapshot())
    window.addEventListener('ari-progress-updated', refresh)
    window.addEventListener('storage', refresh)
    window.addEventListener('storage', refreshLearnerData)
    return () => {
    window.removeEventListener('ari-progress-updated', refresh)
    window.removeEventListener('storage', refresh)
    window.removeEventListener('storage', refreshLearnerData)
    }
  }, [])

  useEffect(() => {
    if (!liveSession && !['lesson', 'vocabulary'].includes(page)) return
    let lastRecordedAt = Date.now()
    const recordElapsedTime = (includeJustHiddenTime = false) => {
      if (document.hidden && !includeJustHiddenTime) {
        lastRecordedAt = Date.now()
        return
      }
      const now = Date.now()
      const seconds = Math.floor((now - lastRecordedAt) / 1000)
      lastRecordedAt = now
      if (seconds < 1) return
      try {
        recordPracticeSeconds(window.localStorage, Math.min(seconds, 300))
        setLearningSnapshot(loadLearningSnapshot())
      } catch (error) {
        setLearningSnapshot((current) => ({
          ...current,
          error: error instanceof Error ? error.message : 'Could not save practice time.',
        }))
      }
    }
    const onVisibilityChange = () => {
      if (document.hidden) recordElapsedTime(true)
      else lastRecordedAt = Date.now()
    }
    const timer = window.setInterval(recordElapsedTime, 15_000)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      recordElapsedTime()
    }
  }, [page, liveSession])

  useEffect(() => {
    if (!liveSession && voiceConversationRef.current) stopVoiceConversation()
  }, [liveSession])

  useEffect(() => {
    if (!voiceListening || page !== 'home' || !navigator.mediaDevices?.getUserMedia) {
      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
      microphoneStreamRef.current = null
      if (microphoneFrameRef.current !== null) window.cancelAnimationFrame(microphoneFrameRef.current)
      microphoneFrameRef.current = null
      updateMicrophoneLevel(0)
      return
    }
    let cancelled = false
    let audioContext: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null
    let stream: MediaStream | null = null
    const connectMeter = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        microphoneStreamRef.current = stream
        audioContext = new AudioContext()
        source = audioContext.createMediaStreamSource(stream)
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        const samples = new Uint8Array(analyser.frequencyBinCount)
        const updateLevel = () => {
          if (!analyser || cancelled) return
          analyser.getByteTimeDomainData(samples)
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length)
          updateMicrophoneLevel(Math.min(1, rms * 4))
          microphoneFrameRef.current = window.requestAnimationFrame(updateLevel)
        }
        updateLevel()
      } catch (error) {
        if (!cancelled) {
          setDataMessage(error instanceof Error
            ? `Live microphone meter unavailable: ${error.message}`
            : 'Live microphone meter unavailable. Voice recognition may still work.')
        }
      }
    }
    void connectMeter()
    return () => {
      cancelled = true
      if (microphoneFrameRef.current !== null) window.cancelAnimationFrame(microphoneFrameRef.current)
      microphoneFrameRef.current = null
      stream?.getTracks().forEach((track) => track.stop())
      if (microphoneStreamRef.current === stream) microphoneStreamRef.current = null
      source?.disconnect()
      analyser?.disconnect()
      if (audioContext) {
        void audioContext.close().catch((error: unknown) => {
          setDataMessage(error instanceof Error
            ? `Microphone meter cleanup failed: ${error.message}`
            : 'Microphone meter cleanup failed.')
        })
      }
      updateMicrophoneLevel(0)
    }
  }, [voiceListening, page])

  useEffect(() => {
    const pauseForInterruption = () => {
      if (document.hidden && liveSession) pauseVoiceConversation()
    }
    document.addEventListener('visibilitychange', pauseForInterruption)
    if (page !== 'home' && liveSession) {
      pauseVoiceConversation()
    } else if (
      page === 'home' &&
      liveSession &&
      voiceGestureUnlockedRef.current &&
      !voiceConversationRef.current &&
      !tutorPendingRef.current &&
      !voiceSpeakingRef.current &&
      !sessionPaused
    ) {
      startVoiceConversation()
    }
    return () => document.removeEventListener('visibilitychange', pauseForInterruption)
  }, [page, liveSession, voiceSpeaking, tutorPending, sessionPaused])

  useEffect(() => () => {
    voiceConversationRef.current = false
    const recognition = recognitionRef.current
    if (recognition) {
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      if (recognitionRunningRef.current) recognition.abort()
    }
    recognitionRunningRef.current = false
    cancelSpeechPlayback()
    if (recognitionTimerRef.current !== null) window.clearTimeout(recognitionTimerRef.current)
  }, [])

  function changeTheme(nextTheme: Theme) {
    setTheme(nextTheme)
    window.localStorage.setItem('ari-language-theme', nextTheme)
  }

  function updateLearnerSettings(update: Partial<LearnerSettings>) {
    const settings = { ...learnerData.settings, ...update }
    try {
      saveLearnerSettings(window.localStorage, settings)
      setLearnerData((current) => ({ ...current, settings, error: '' }))
      setDataMessage('Your learner settings were saved on this device.')
      return true
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : 'Could not save learner settings.')
      return false
    }
  }

  function recordSafeguard(type: 'distress' | 'three-failures' | 'safe-word' | 'unsafe-redirect') {
    try {
      recordSafeguardEvent(window.localStorage, type)
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : 'Could not record the safety event.')
    }
  }

  function applyTutorSafeguard(reply: TutorMessage) {
    if (reply.learningState) tutorAdaptationRef.current = reply.learningState
    if (reply.safeguard === 'distress' || reply.safeguard === 'safe-word') {
      recordSafeguard(reply.safeguard === 'safe-word' ? 'safe-word' : 'distress')
      setSafeguardOffer(true)
    } else if (reply.safeguard === 'redirect') {
      recordSafeguard('unsafe-redirect')
    }
    if (reply.cooldown) {
      if (reply.failureCount === 3) recordSafeguard('three-failures')
      setSafeguardOffer(true)
    }
  }

  async function startTutorOpening(
    scenario: RoleplayScenario | null,
    freeChat: boolean,
    title: string,
    section: string,
  ) {
    try {
      validateSessionLanguage(
        targetCode,
        learnerData.settings.targetLanguageCode,
        scenario?.openingLine && /[\u3400-\u9fff]/u.test(scenario.openingLine) ? 'zh' : undefined,
      )
    } catch (error) {
      setTutorError(error instanceof Error ? error.message : 'The session language does not match your settings.')
      setLiveSession(false)
      return
    }
    const tutorName = learnerData.settings.tutorName
    const learnerName = learnerData.settings.displayName.trim() || 'learner'
    const openingPrompt = [
      `Open a guided ${targetLanguage.name} speaking session for ${learnerName}. You are ${tutorName}; the selected area is "${title}" (${section}).`,
      `In two or three short sentences, greet ${learnerName} by name, introduce yourself, say what you will practise today, and ask one easy check-in question.`,
      `Speak in ${targetLanguage.name}; use ${sourceLanguage.name} only for brief support. Do not greet in another language.`,
      freeChat ? 'Choose a friendly opening topic based on the learner interests.' : 'Stay focused on the selected lesson or roleplay area.',
      freeChat ? `Keep the practice to about ${freeChatDurationMinutes} minutes and let the learner guide the topic${title !== 'Free chat' ? `, starting with "${title}"` : ''}.` : '',
    ].join(' ')
    const promptTurn: TutorMessage = { id: Date.now(), role: 'user', text: openingPrompt }
    setTutorPending(true)
    tutorPendingRef.current = true
    setTutorError('')
    setVoiceError('')
    try {
      const welcome = await requestTutorReply(
        [promptTurn],
        Date.now() + 1,
        learnerData.settings,
        scenario,
        freeChat,
        title,
        tutorAdaptationRef.current,
        section,
        'welcome',
      )
      const welcomeMessage = { ...welcome, role: 'tutor' as const }
      updateTutorMessages([welcomeMessage])
      const teachingPrompt: TutorMessage = {
        id: Date.now() + 2,
        role: 'user',
        text: `Continue without greeting again. For the selected ${section} area "${title}", teach one useful ${targetLanguage.name} phrase at ${learnerData.settings.level}, then ask me to repeat or vary it. Prefer a relevant retrieved knowledge-base example; if none is available, use careful general knowledge and mark it unverified. Use my saved goals, interests, and due words when relevant.`,
      }
      try {
        const teaching = await requestTutorReply(
          [promptTurn, welcomeMessage, teachingPrompt],
          Date.now() + 3,
          learnerData.settings,
          scenario,
          freeChat,
          title,
          tutorAdaptationRef.current,
          section,
          'teaching',
        )
        const teachingMessage = { ...teaching, role: 'tutor' as const }
        const openingMessages = [welcomeMessage, teachingMessage]
        updateTutorMessages(openingMessages)
        saveCurrentTutorHistory(openingMessages)
        speakTutorReply({
          ...teachingMessage,
          text: `${welcomeMessage.text} ${teachingMessage.text}`,
          meaning: [welcomeMessage.meaning, teachingMessage.meaning].filter(Boolean).join(' '),
        })
      } catch (error) {
        saveCurrentTutorHistory([welcomeMessage])
        speakTutorReply(welcomeMessage)
        setTutorError(error instanceof Error ? error.message : `${tutorName} could not begin the lesson. Please retry.`)
      }
    } catch (error) {
      setTutorError(error instanceof Error ? error.message : `${tutorName} could not start the session. Please retry.`)
    } finally {
      setTutorPending(false)
      tutorPendingRef.current = false
    }
  }

  function addMemoryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const item = memoryInput.trim()
    if (!item) return
    if (learnerData.settings.memory.length >= 12) {
      setDataMessage('You can save up to 12 memory notes. Remove one before adding another.')
      return
    }
    if (item.length > 160) {
      setDataMessage('Memory notes must be 160 characters or fewer.')
      return
    }
    if (learnerData.settings.memory.includes(item)) {
      setDataMessage('That memory note is already saved.')
      return
    }
    updateLearnerSettings({ memory: [...learnerData.settings.memory, item] })
    setMemoryInput('')
  }

  function removeMemoryItem(item: string) {
    updateLearnerSettings({ memory: learnerData.settings.memory.filter((saved) => saved !== item) })
  }

  function exportAriData() {
    try {
      const data: Record<string, unknown> = {}
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index)
        if (!key?.startsWith('ari-')) continue
        const serialized = window.localStorage.getItem(key)
        if (serialized === null) continue
        try {
          data[key] = JSON.parse(serialized)
        } catch {
          data[key] = serialized
        }
      }
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'ari-learning-data.json'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDataMessage('Your Ari data export has been downloaded.')
    } catch (error) {
      setDataMessage(error instanceof Error ? `Could not export your data: ${error.message}` : 'Could not export your Ari data.')
    }
  }

  function deleteAllAriData() {
    if (tutorPendingRef.current) {
      setDataMessage(`Wait for ${learnerData.settings.tutorName}’s reply to finish before deleting all data.`)
      return
    }
    if (!window.confirm('Delete all Ari learning data saved in this browser? This cannot be undone.')) return
    try {
      clearAriData(window.localStorage)
      setSpeechPreferenceState(getInitialSpeechPreferenceState())
      setVoiceError('')
      tutorSessionIdRef.current = ''
      tutorStartedAtRef.current = Date.now()
      setTheme('light')
      setLearnerData(loadLearnerDataSnapshot())
      setLearningSnapshot(loadLearningSnapshot())
      updateTutorMessages([])
      setPage('home')
      setDataMessage('Ari data saved in this browser has been deleted.')
    } catch (error) {
      setDataMessage(error instanceof Error ? `Could not delete your data: ${error.message}` : 'Could not delete your Ari data.')
    }
  }

  function saveCurrentTutorHistory(messages: TutorMessage[]) {
    if (!learnerData.settings.transcriptSaving) return
    try {
      if (!tutorSessionIdRef.current) tutorSessionIdRef.current = `conversation-${tutorStartedAtRef.current}`
      const transcript = messages.filter((message) => message.id > 2)
      if (!transcript.length) return
      const history = saveTutorSession(window.localStorage, tutorSessionIdRef.current, transcript)
      setLearnerData((current) => ({ ...current, history, error: '' }))
    } catch (error) {
      setLearnerData((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Could not save this conversation.',
      }))
    }
  }

  function removeTutorHistory(id: string) {
    try {
      const history = deleteTutorSession(window.localStorage, id)
      setLearnerData((current) => ({ ...current, history, error: '' }))
    } catch (error) {
      setLearnerData((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Could not delete this conversation.',
      }))
    }
  }

  function translatePhrase() {
    const key = `${phrase.trim().toLowerCase()}|${targetCode}`
    const result = samples[key]
    if (!phrase.trim()) {
      setTranslation('')
      setTranslationMessage('Type a phrase first to try a sample translation.')
      return
    }
    if (!result) {
      setTranslation('')
      setTranslationMessage('This prototype only includes a few sample phrases. Live translation is not connected yet.')
      return
    }
    setTranslation(result)
    setTranslationMessage('Sample translation · live translation is not connected yet')
  }

  function updateSpeechPreferences(update: Partial<SpeechPreferences>) {
    const preferences = { ...speechPreferences, ...update }
    try {
      saveSpeechPreferences(window.localStorage, preferences)
      setSpeechPreferenceState({ preferences, error: '' })
    } catch (error) {
      setSpeechPreferenceState({
        preferences: speechPreferences,
        error: error instanceof Error ? error.message : 'Could not save voice preferences.',
      })
    }
  }

  function speakWord(word: string, locale = 'zh-CN') {
    void playSpeechAudio(word, locale, tutorVoiceGender, globalThis, { flavor: speechPreferences.flavor, rate: speechPreferences.rate }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setVoiceError(error instanceof Error ? error.message : 'Ari’s local voice service could not play this speech.')
    })
  }

  async function previewTutorVoice(flavor = speechPreferences.flavor, tutorName = learnerData.settings.tutorName) {
    setVoiceError('')
    setPreviewingTutorVoice(tutorName)
    const preview = targetCode === 'fr'
      ? `Bonjour, je m'appelle ${tutorName}. On va apprendre en s’amusant.`
      : targetCode === 'zh'
        ? `你好，我是${tutorName}。我们一起轻松有趣地学习吧。`
        : `Hello, I’m ${tutorName}. Let’s make learning ${targetLanguage.name} fun.`
    try {
      await playSpeechAudio(preview, targetLanguage.locale, getTutorSpeechGender(tutorName), globalThis, { flavor, rate: speechPreferences.rate })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setVoiceError(error instanceof Error ? error.message : 'Ari’s local voice service could not play this voice sample.')
    } finally {
      setPreviewingTutorVoice(null)
    }
  }

  async function speakTranslation() {
    if (!translation) return
    setTranslationMessage('Generating speech locally with Ari’s voice service…')
    try {
      await playSpeechAudio(translation, targetLanguage.locale, tutorVoiceGender, globalThis, { flavor: speechPreferences.flavor, rate: speechPreferences.rate })
      setTranslationMessage('')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setTranslationMessage(error instanceof Error ? error.message : 'Ari’s local voice service could not play this translation.')
    }
  }

  function startVoiceRecognition() {
    const recognition = recognitionRef.current
    if (!recognition || !voiceConversationRef.current || tutorPendingRef.current || voiceSpeakingRef.current) return
    try {
      speechAlternativesRef.current = []
      recognition.start()
      recognitionRunningRef.current = true
      setVoiceListening(true)
    } catch (error) {
      recognitionRunningRef.current = false
      voiceConversationRef.current = false
      holdToSpeakActiveRef.current = false
      pushToTalkSessionRef.current = false
      setVoiceConversation(false)
      setVoiceListening(false)
      const denied = error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      setVoiceError(denied
        ? 'Microphone access is blocked. Allow it in your browser settings, then try again.'
        : error instanceof Error
          ? `Couldn't start listening: ${error.message}`
          : 'Couldn’t start listening. Check microphone access and try again.')
      updateLearnerSettings({ liveTranscript: true })
    }
  }

  function scheduleVoiceRecognition() {
    if (recognitionTimerRef.current !== null) window.clearTimeout(recognitionTimerRef.current)
    recognitionTimerRef.current = window.setTimeout(() => {
      recognitionTimerRef.current = null
      if (recognitionRunningRef.current) {
        scheduleVoiceRecognition()
        return
      }
      startVoiceRecognition()
    }, 300)
  }

  function speakTutorReply(reply: TutorMessage, onComplete?: () => void, rate = speechPreferences.rate, reactToLearner = false) {
    if (sessionPausedRef.current) {
      tutorNeedsResumeSpeechRef.current = true
      return
    }
    if (reactToLearner) {
      const reaction = reply.corrections?.length
        ? 'correcting'
        : /did you say|is that right|could you repeat|didn.t catch|what did you mean/i.test(reply.text)
          ? 'unclear'
          : 'understood'
      setTutorReaction(reaction)
      if (tutorReactionTimerRef.current !== null) window.clearTimeout(tutorReactionTimerRef.current)
      tutorReactionTimerRef.current = window.setTimeout(() => {
        setTutorReaction(null)
        tutorReactionTimerRef.current = null
      }, 850)
    }
    voiceOpeningPlayedRef.current = true
    const generation = speechGenerationRef.current + 1
    speechGenerationRef.current = generation
    voiceSpeakingRef.current = true
    setVoiceSpeaking(true)
    setVoiceListening(false)
    setVoiceTranscript(`${reply.text}${reply.meaning ? ` — ${reply.meaning}` : ''}`)
    if (recognitionRunningRef.current) recognitionRef.current?.stop()
    const finishSpeaking = () => {
      if (generation !== speechGenerationRef.current) return
      voiceSpeakingRef.current = false
      setVoiceSpeaking(false)
      setVoiceTranscript(`${reply.text}${reply.meaning?.trim() ? ` — ${reply.meaning.trim()}` : ''}`)
      if (!voiceConversationRef.current) return
      if (onComplete) onComplete()
      else if (voiceInputMode === 'tap') scheduleVoiceRecognition()
      else stopVoiceConversation()
    }
    void (async () => {
      try {
        await playSpeechAudio(reply.text, targetLanguage.locale, tutorVoiceGender, globalThis, {
          flavor: speechPreferences.flavor,
          rate,
          onLevel: updateVoiceAudioLevel,
          onLevelError: (error) => setDataMessage(error instanceof Error
            ? `Tutor audio is playing, but the live mascot volume meter is unavailable: ${error.message}`
            : 'Tutor audio is playing, but the live mascot volume meter is unavailable.'),
          onBoundary: (index, length) => {
            if (index >= 0 && length > 0) setVoiceTranscript(reply.text.slice(0, index + length))
          },
        })
        if (generation !== speechGenerationRef.current) return
        const spokenMeaning = reply.meaning?.trim()
        if (spokenMeaning) {
          await playSpeechAudio(spokenMeaning, sourceLanguage.locale, tutorVoiceGender, globalThis, {
            flavor: speechPreferences.flavor,
            rate,
            onLevel: updateVoiceAudioLevel,
            onLevelError: (error) => setDataMessage(error instanceof Error
              ? `Tutor audio is playing, but the live mascot volume meter is unavailable: ${error.message}`
              : 'Tutor audio is playing, but the live mascot volume meter is unavailable.'),
            onBoundary: (index, length) => {
              if (index >= 0 && length > 0) setVoiceTranscript(spokenMeaning.slice(0, index + length))
            },
          })
        }
      } catch (error) {
        if (generation !== speechGenerationRef.current) return
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setVoiceError(error instanceof Error ? error.message : 'Ari’s local voice service could not play this reply.')
          updateLearnerSettings({ liveTranscript: true })
          if (voiceConversationRef.current) stopVoiceConversation()
        }
      } finally {
        finishSpeaking()
      }
    })()
  }

  function startVoiceConversation() {
    const SpeechRecognition = getSpeechRecognitionConstructor()
    if (!SpeechRecognition) {
      setVoiceError('Voice input is not supported in this browser. Try the latest version of Chrome or Edge.')
      updateLearnerSettings({ liveTranscript: true })
      return
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 3
    recognition.lang = targetLanguage.locale
    const grammarHost = globalThis as typeof globalThis & {
      SpeechGrammarList?: new () => { addFromString: (grammar: string, weight: number) => void }
    }
    let grammarHintWarning = ''
    if (grammarHost.SpeechGrammarList) {
      let savedVocabulary: string[] = []
      try {
        savedVocabulary = (readReviewDeck(window.localStorage) ?? []).map((word) => word.word)
      } catch (error) {
        setDataMessage(error instanceof Error ? `Saved word hints could not be loaded: ${error.message}` : 'Saved word hints could not be loaded.')
      }
      const recentTutorText = [...tutorMessagesRef.current].reverse().find((message) => message.role === 'tutor')?.text
      const hints = [
        activeLessonTitle,
        activeSection,
        learnerData.settings.displayName,
        ...learnerData.settings.interests.split(','),
        ...(activeRoleplay?.vocabulary ?? []),
        ...(recentTutorText ? [recentTutorText] : []),
        ...savedVocabulary,
      ]
        .map((hint) => hint.trim().replace(/[^\p{L}\p{N}' -]/gu, ''))
        .filter(Boolean)
      if (hints.length) {
        try {
          const grammar = new grammarHost.SpeechGrammarList()
          grammar.addFromString(`#JSGF V1.0; grammar tutor; public <hint> = ${hints.slice(0, 30).join(' | ')};`, 1)
          recognition.grammars = grammar
        } catch (error) {
          grammarHintWarning = error instanceof Error
            ? `This browser could not apply lesson vocabulary hints: ${error.message}`
            : 'This browser could not apply lesson vocabulary hints.'
        }
      }
    }
    recognition.onresult = (event) => {
      let interim = ''
      let finalTranscript = ''
      const alternatives: SpeechTurnEvidence['alternatives'] = []
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
          for (let candidate = 0; candidate < result.length; candidate += 1) {
            const alternative = result[candidate]
            if (alternative.transcript.trim()) {
              alternatives.push({
                transcript: alternative.transcript.trim(),
                confidence: typeof alternative.confidence === 'number' ? alternative.confidence : null,
              })
            }
          }
        }
        else interim += result[0].transcript
      }
      if (interim) {
        updateLearnerSpeechDraft(interim)
        setVoiceTranscript(interim)
      }
      if (finalTranscript.trim()) {
        const text = finalTranscript.trim()
        tapTranscriptRef.current = [tapTranscriptRef.current, text].filter(Boolean).join(' ')
        tapAlternativesRef.current = [...tapAlternativesRef.current, ...alternatives].slice(-9)
        updateLearnerSpeechDraft(tapTranscriptRef.current)
        setLastLearnerSpeech(tapTranscriptRef.current)
        speechAlternativesRef.current = tapAlternativesRef.current
        setVoiceTranscript(text)
        if (pushToTalkSessionRef.current) {
          holdTranscriptRef.current = [holdTranscriptRef.current, text].filter(Boolean).join(' ')
        } else {
          tapToSendRef.current = true
          setSpeechReadyToSend(true)
          if (tapSilenceTimerRef.current !== null) window.clearTimeout(tapSilenceTimerRef.current)
          const beginner = /^(A0|A1|A2|Beginner)/i.test(learnerData.settings.level)
          tapSilenceTimerRef.current = window.setTimeout(() => {
            tapSilenceTimerRef.current = null
            tapToSendRef.current = false
            setSpeechReadyToSend(false)
            const utterance = tapTranscriptRef.current.trim()
            const utteranceAlternatives = tapAlternativesRef.current
            tapTranscriptRef.current = ''
            tapAlternativesRef.current = []
            updateLearnerSpeechDraft('')
            if (utterance) void sendTutorMessage(utterance, {
              alternatives: utteranceAlternatives,
              nativeLanguageLikely: isLikelyNativeLanguage(utterance, learnerData.settings.nativeLanguageCode, targetCode),
            })
          }, beginner ? 1500 : 900)
        }
      }
    }
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      const messages: Record<string, string> = {
        'not-allowed': 'Microphone access was denied. Allow microphone access in your browser, then start again.',
        'permission-denied': 'Microphone access was denied. Allow microphone access in your browser, then start again.',
        'service-not-allowed': 'Your browser blocked its speech recognition service.',
        'audio-capture': 'No microphone was found. Connect a microphone and try again.',
        network: 'The browser speech-recognition service could not connect. This may be an offline or browser-provider issue; try again when online, use the mic test, or type instead.',
        security: 'Voice input needs a secure page (HTTPS or localhost) and microphone permission. You can type instead.',
      }
      setVoiceError(messages[event.error] ?? `Speech recognition failed (${event.error}). Check your microphone and try again.`)
      updateLearnerSettings({ liveTranscript: true })
      recognitionRunningRef.current = false
      voiceConversationRef.current = false
      holdToSpeakActiveRef.current = false
      pushToTalkSessionRef.current = false
      setVoiceConversation(false)
      setVoiceListening(false)
    }
    recognition.onend = () => {
      recognitionRunningRef.current = false
      setVoiceListening(false)
      if (pushToTalkSessionRef.current) {
        pushToTalkSessionRef.current = false
        holdToSpeakActiveRef.current = false
        const text = (holdTranscriptRef.current || learnerSpeechDraftRef.current).trim()
        holdTranscriptRef.current = ''
        if (text) {
          void sendTutorMessage(text, {
            alternatives: speechAlternativesRef.current,
            nativeLanguageLikely: isLikelyNativeLanguage(text, learnerData.settings.nativeLanguageCode, targetCode),
          })
          return
        }
        setVoiceTranscript(`I didn’t hear speech. Hold ${learnerData.settings.tutorName} and try again.`)
        setVoiceConversation(true)
        voiceConversationRef.current = true
        if (voiceInputMode === 'tap') scheduleVoiceRecognition()
        return
      }
      if (
        voiceInputMode === 'tap' &&
        !tapToSendRef.current &&
        voiceConversationRef.current &&
        !tutorPendingRef.current &&
        !voiceSpeakingRef.current
      ) {
        scheduleVoiceRecognition()
      }
    }
    recognitionRef.current = recognition
    voiceConversationRef.current = true
    setVoiceConversation(true)
    setVoiceError('')
    if (grammarHintWarning) setVoiceError(grammarHintWarning)
    setVoiceTranscript('')
    setVoiceLatencyMs(null)
    const hasLearnerTurn = tutorMessages.some((message) => message.role === 'user')
    if (voiceInputMode === 'hold' || hasLearnerTurn || voiceOpeningPlayedRef.current) {
      startVoiceRecognition()
    } else {
      const openingMessages = tutorMessages.filter((message) => message.role === 'tutor')
      const speakOpeningMessage = (index: number) => {
        const message = openingMessages[index]
        if (!message) {
          scheduleVoiceRecognition()
          return
        }
        speakTutorReply(message, () => speakOpeningMessage(index + 1))
      }
      speakOpeningMessage(0)
    }
  }

  function handleVoiceButton() {
    if (!liveSession) {
      startHomeLesson()
      return
    }
    if (voiceSpeakingRef.current) {
      speechGenerationRef.current += 1
      cancelSpeechPlayback()
      voiceSpeakingRef.current = false
      setVoiceSpeaking(false)
      updateVoiceAudioLevel(0)
      setVoiceTranscript(`${learnerData.settings.tutorName} paused. Go ahead.`)
      startVoiceConversation()
      return
    }
    if (voiceInputMode === 'tap' && (voiceListening || speechReadyToSend) && (learnerSpeechDraft || tapTranscriptRef.current)) {
      if (tapSilenceTimerRef.current !== null) window.clearTimeout(tapSilenceTimerRef.current)
      tapSilenceTimerRef.current = null
      tapToSendRef.current = false
      setSpeechReadyToSend(false)
      const text = (tapTranscriptRef.current || learnerSpeechDraft).trim()
      tapTranscriptRef.current = ''
      updateLearnerSpeechDraft('')
      if (recognitionRunningRef.current) recognitionRef.current?.stop()
      if (text) void sendTutorMessage(text, {
        alternatives: speechAlternativesRef.current,
        nativeLanguageLikely: isLikelyNativeLanguage(text, learnerData.settings.nativeLanguageCode, targetCode),
      })
      return
    }
    if (!voiceConversationRef.current) {
      startVoiceConversation()
      return
    }
    if (!recognitionRunningRef.current && !tutorPendingRef.current) {
      if (!recognitionRef.current) startVoiceConversation()
      else startVoiceRecognition()
    }
  }

  function beginHoldToSpeak() {
    if (!liveSession) {
      startHomeLesson()
      return
    }
    if (tutorPendingRef.current || holdToSpeakActiveRef.current) return
    setVoiceError('')
    setVoiceLatencyMs(null)
    holdTranscriptRef.current = ''
    holdToSpeakActiveRef.current = true
    pushToTalkSessionRef.current = true

    if (voiceSpeakingRef.current) {
      speechGenerationRef.current += 1
      cancelSpeechPlayback()
      voiceSpeakingRef.current = false
      setVoiceSpeaking(false)
      setVoiceTranscript(`${learnerData.settings.tutorName} interrupted. Speak now, then release to send.`)
    }

    if (!voiceConversationRef.current || !recognitionRef.current) {
      startVoiceConversation()
    } else if (!recognitionRunningRef.current) {
      startVoiceRecognition()
    }

    if (!voiceConversationRef.current || !recognitionRunningRef.current) {
      holdToSpeakActiveRef.current = false
      pushToTalkSessionRef.current = false
    }
  }

  function endHoldToSpeak() {
    if (!holdToSpeakActiveRef.current) return
    holdToSpeakActiveRef.current = false
    if (recognitionRunningRef.current) {
      recognitionRef.current?.stop()
      setVoiceListening(false)
    }
  }

  function requestHelpPhrases() {
    const previousTutorId = latestTutorMessage?.id ?? 0
    setHelpPhraseAfterMessageId(previousTutorId)
    void sendTutorMessage(
      `Give me exactly 2 or 3 short phrases I can use to say “${lastLearnerSpeech || activeLessonTitle}” in ${targetLanguage.name}. Write one phrase per numbered line using this exact format: target-language phrase | ${sourceLanguage.name} translation. Ask me to choose one to hear and repeat.`,
    )
    setShowHelpPhrases(true)
  }

  function focusTutorTextInput() {
    updateLearnerSettings({ liveTranscript: true })
    const transcript = document.querySelector<HTMLDetailsElement>('.home-stage-session .text-practice')
    if (transcript) transcript.open = true
    window.requestAnimationFrame(() => {
      const input = document.querySelector<HTMLTextAreaElement>('.home-stage-session .tutor-composer textarea, .home-studio .tutor-composer textarea')
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      input?.focus({ preventScroll: true })
    })
  }

  function playPracticePhrase(phrase: { phrase: string; translation: string }) {
    speakTutorReply({
      id: Date.now(),
      role: 'tutor',
      text: phrase.phrase,
      meaning: phrase.translation,
    })
  }

  function startSpeechRetry() {
    tapTranscriptRef.current = ''
    updateLearnerSpeechDraft('')
    setVoiceError('')
    if (voiceSpeakingRef.current) {
      speechGenerationRef.current += 1
      cancelSpeechPlayback()
      voiceSpeakingRef.current = false
      setVoiceSpeaking(false)
      updateVoiceAudioLevel(0)
    }
    const currentRecognition = recognitionRef.current
    if (currentRecognition) {
      currentRecognition.onend = null
      currentRecognition.onerror = null
      currentRecognition.onresult = null
      if (recognitionRunningRef.current) currentRecognition.abort()
    }
    recognitionRef.current = null
    recognitionRunningRef.current = false
    startVoiceConversation()
  }

  function cancelSpeechCapture() {
    if (tapSilenceTimerRef.current !== null) window.clearTimeout(tapSilenceTimerRef.current)
    tapSilenceTimerRef.current = null
    tapToSendRef.current = false
    setSpeechReadyToSend(false)
    tapTranscriptRef.current = ''
    holdTranscriptRef.current = ''
    holdToSpeakActiveRef.current = false
    pushToTalkSessionRef.current = false
    updateLearnerSpeechDraft('')
    setLastLearnerSpeech('')
    tapAlternativesRef.current = []
    speechAlternativesRef.current = []
    voiceConversationRef.current = false
    setVoiceConversation(false)
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      if (recognitionRunningRef.current) recognition.abort()
    }
    recognitionRunningRef.current = false
    setVoiceListening(false)
  }

  function stopVoiceConversation() {
    speechGenerationRef.current += 1
    voiceConversationRef.current = false
    holdToSpeakActiveRef.current = false
    pushToTalkSessionRef.current = false
    holdTranscriptRef.current = ''
    if (tapSilenceTimerRef.current !== null) window.clearTimeout(tapSilenceTimerRef.current)
    tapSilenceTimerRef.current = null
    tapToSendRef.current = false
    setSpeechReadyToSend(false)
    tapTranscriptRef.current = ''
    updateLearnerSpeechDraft('')
    setVoiceConversation(false)
    setVoiceListening(false)
    voiceSpeakingRef.current = false
    setVoiceSpeaking(false)
    updateVoiceAudioLevel(0)
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      if (recognitionRunningRef.current) recognition.abort()
    }
    recognitionRunningRef.current = false
    cancelSpeechPlayback()
    if (recognitionTimerRef.current !== null) {
      window.clearTimeout(recognitionTimerRef.current)
      recognitionTimerRef.current = null
    }
  }

  function pauseVoiceConversation() {
    sessionPausedRef.current = true
    setSessionPaused(true)
    if (voiceSpeakingRef.current) tutorNeedsResumeSpeechRef.current = true
    voiceConversationRef.current = false
    holdToSpeakActiveRef.current = false
    pushToTalkSessionRef.current = false
    holdTranscriptRef.current = ''
    if (tapSilenceTimerRef.current !== null) window.clearTimeout(tapSilenceTimerRef.current)
    tapSilenceTimerRef.current = null
    tapToSendRef.current = false
    setSpeechReadyToSend(false)
    tapTranscriptRef.current = ''
    updateLearnerSpeechDraft('')
    setVoiceConversation(false)
    setVoiceListening(false)
    voiceSpeakingRef.current = false
    setVoiceSpeaking(false)
    updateVoiceAudioLevel(0)
    speechGenerationRef.current += 1
    cancelSpeechPlayback()
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      if (recognitionRunningRef.current) recognition.abort()
    }
    recognitionRunningRef.current = false
    if (recognitionTimerRef.current !== null) {
      window.clearTimeout(recognitionTimerRef.current)
      recognitionTimerRef.current = null
    }
  }

  function swapLanguages() {
    setSourceCode(targetCode)
    setTargetCode(sourceCode)
    setPhrase('')
    setTranslation('')
    setTranslationMessage('')
  }

  function updateTutorMessages(messages: TutorMessage[]) {
    tutorMessagesRef.current = messages
    setTutorMessages(messages)
  }

  async function sendTutorMessage(message = tutorInput, speechEvidence?: SpeechTurnEvidence) {
    const text = roleplayComplete ? '' : message.trim()
    if (!text || tutorPendingRef.current) return
    const userMessage: TutorMessage = {
      id: Date.now(),
      role: 'user',
      text,
    }
    const nextHistory = [...tutorMessagesRef.current, userMessage]
    updateTutorMessages(nextHistory)
    setTutorInput('')
    setSpeechReadyToSend(false)
    setLastLearnerSpeech(text)
    tapAlternativesRef.current = []
    speechAlternativesRef.current = []
    updateLearnerSpeechDraft('')
    setShowHelpPhrases(false)
    setTutorError('')
    setTutorRetryHistory(null)
    setTutorPending(true)
    tutorPendingRef.current = true
    if (recognitionRunningRef.current) {
      recognitionRef.current?.stop()
      setVoiceListening(false)
    }
    const responseStartedAt = performance.now()
    try {
      const reply = await requestTutorReply(nextHistory, userMessage.id + 1, learnerData.settings, activeRoleplay, activeFreeChat, activeLessonTitle, tutorAdaptationRef.current, activeSection, undefined, speechEvidence)
      const safeSpeechReply = speechEvidence && isLowConfidenceSpeech(speechEvidence.alternatives)
        ? { ...reply, corrections: [], failureCount: 0, cooldown: false, learningState: undefined }
        : reply
      applyTutorSafeguard(safeSpeechReply)
      if (voiceConversationRef.current) setVoiceLatencyMs(Math.round(performance.now() - responseStartedAt))
      const completedHistory = [...tutorMessagesRef.current, safeSpeechReply]
      updateTutorMessages(completedHistory)
      saveCurrentTutorHistory(completedHistory)
      speakTutorReply(safeSpeechReply, undefined, speechPreferences.rate, true)
    } catch (error) {
      setTutorError(error instanceof Error ? error.message : 'The local tutor could not reply. Please try again.')
      setTutorRetryHistory(nextHistory)
    } finally {
      setTutorPending(false)
      tutorPendingRef.current = false
      if (voiceConversationRef.current && !voiceSpeakingRef.current) {
        if (voiceInputMode === 'tap') scheduleVoiceRecognition()
        else stopVoiceConversation()
      }
    }
  }

  async function replaceLastSpeechTurn(message: string) {
    const text = message.trim()
    if (!text || tutorPendingRef.current) return
    const existingHistory = tutorMessagesRef.current
    const lastLearnerIndex = existingHistory.map((item) => item.role).lastIndexOf('user')
    if (lastLearnerIndex < 0) {
      setSpeechCorrectionEditing(false)
      await sendTutorMessage(text)
      return
    }

    const correctedTurn = { ...existingHistory[lastLearnerIndex], text }
    const correctedHistory = [...existingHistory.slice(0, lastLearnerIndex), correctedTurn]
    updateTutorMessages(correctedHistory)
    setTutorInput('')
    setLastLearnerSpeech(text)
    setSpeechCorrectionEditing(false)
    setTutorError('')
    setTutorRetryHistory(null)
    setTutorPending(true)
    tutorPendingRef.current = true
    if (recognitionRunningRef.current) {
      recognitionRef.current?.stop()
      setVoiceListening(false)
    }
    try {
      const reply = await requestTutorReply(
        correctedHistory,
        Date.now(),
        learnerData.settings,
        activeRoleplay,
        activeFreeChat,
        activeLessonTitle,
        tutorAdaptationRef.current,
        activeSection,
      )
      applyTutorSafeguard(reply)
      const completedHistory = [...correctedHistory, reply]
      updateTutorMessages(completedHistory)
      saveCurrentTutorHistory(completedHistory)
      speakTutorReply(reply, undefined, speechPreferences.rate, true)
    } catch (error) {
      setTutorError(error instanceof Error ? error.message : 'The corrected reply could not be processed. Please try again.')
      setTutorRetryHistory(correctedHistory)
    } finally {
      setTutorPending(false)
      tutorPendingRef.current = false
      if (voiceConversationRef.current && !voiceSpeakingRef.current) {
        if (voiceInputMode === 'tap') scheduleVoiceRecognition()
        else stopVoiceConversation()
      }
    }
  }

  async function retryTutorMessage() {
    if (!tutorRetryHistory || tutorPendingRef.current) return
    setTutorError('')
    setTutorPending(true)
    tutorPendingRef.current = true
    if (recognitionRunningRef.current) {
      recognitionRef.current?.stop()
      setVoiceListening(false)
    }
    const responseStartedAt = performance.now()
    try {
      const reply = await requestTutorReply(tutorRetryHistory, Date.now(), learnerData.settings, activeRoleplay, activeFreeChat, activeLessonTitle, tutorAdaptationRef.current, activeSection)
      applyTutorSafeguard(reply)
      if (voiceConversationRef.current) setVoiceLatencyMs(Math.round(performance.now() - responseStartedAt))
      const completedHistory = [...tutorMessagesRef.current, reply]
      updateTutorMessages(completedHistory)
      saveCurrentTutorHistory(completedHistory)
      setTutorRetryHistory(null)
      speakTutorReply(reply, undefined, speechPreferences.rate, true)
    } catch (error) {
      setTutorError(error instanceof Error ? error.message : 'The local tutor could not reply. Please try again.')
    } finally {
      setTutorPending(false)
      tutorPendingRef.current = false
      if (voiceConversationRef.current && !voiceSpeakingRef.current) {
        if (voiceInputMode === 'tap') scheduleVoiceRecognition()
        else stopVoiceConversation()
      }
    }
  }

  function resetTutorConversation() {
    if (tutorPendingRef.current) return
    if (voiceConversationRef.current) stopVoiceConversation()
    const currentScenario = activeRoleplay
    const isFreeChat = activeFreeChat
    const title = currentScenario?.title ?? (isFreeChat ? freeChatTopic || 'Free chat' : activeLessonTitle)
    updateTutorMessages([])
    tutorSessionIdRef.current = ''
    tutorStartedAtRef.current = Date.now()
    tutorAdaptationRef.current = { failures: 0, outcomes: [], errorPatterns: {} }
    setSafeguardOffer(false)
    setTutorInput('')
    setTutorError('')
    setTutorRetryHistory(null)
    setRoleplayComplete(false)
    setRoleplayReflection([])
    setSessionSummary(null)
    voiceOpeningPlayedRef.current = false
    void startTutorOpening(currentScenario, isFreeChat, title, activeSection)
  }

  function beginRoleplay(scenario: RoleplayScenario, fromLesson = false, section = 'Social') {
    if (tutorPendingRef.current) return
    if (targetCode !== 'zh' && /[\u3400-\u9fff]/u.test(scenario.openingLine || '')) {
      setDataMessage(`This sample roleplay is written in Mandarin. Change your learning language in Settings before starting it.`)
      return
    }
    if (voiceConversationRef.current) stopVoiceConversation()
    setActiveRoleplay(scenario)
    setActiveLessonTitle(scenario.title)
    setActiveSection(section)
    setLessonRoleplayActive(fromLesson)
    setActiveFreeChat(false)
    setRoleplayComplete(false)
    setRoleplayReflection(scenario.successCriteria.map(() => false))
    tutorSessionIdRef.current = ''
    tutorStartedAtRef.current = Date.now()
    tutorAdaptationRef.current = { failures: 0, outcomes: [], errorPatterns: {} }
    setSafeguardOffer(false)
    setTutorInput('')
    setTutorError('')
    setTutorRetryHistory(null)
    updateTutorMessages([])
    setSessionSummary(null)
    voiceOpeningPlayedRef.current = false
    setPage('home')
    setLiveSession(false)
  }

  function beginLessonRoleplay(scenario: RoleplayScenario) {
    if (tutorPendingRef.current) return
    beginRoleplay(scenario, true)
  }

  function returnToLessonRecap() {
    setLessonRoleplayActive(false)
    setPage('lesson')
  }

  function beginFreeChat(topic = '', durationMinutes = 10) {
    if (tutorPendingRef.current) return
    if (voiceConversationRef.current) stopVoiceConversation()
    setActiveRoleplay(null)
    const selectedTopic = topic.trim()
    setFreeChatTopic(selectedTopic)
    setActiveLessonTitle(selectedTopic || 'Free chat')
    setFreeChatDurationMinutes(durationMinutes)
    setActiveSection('Social')
    setLessonRoleplayActive(false)
    setActiveFreeChat(true)
    setRoleplayComplete(false)
    setRoleplayReflection([])
    tutorSessionIdRef.current = ''
    tutorStartedAtRef.current = Date.now()
    tutorAdaptationRef.current = { failures: 0, outcomes: [], errorPatterns: {} }
    setSafeguardOffer(false)
    setTutorInput('')
    setTutorError('')
    setTutorRetryHistory(null)
    updateTutorMessages([])
    setSessionSummary(null)
    voiceOpeningPlayedRef.current = false
    setPage('home')
    setLiveSession(false)
  }

  function beginLesson(title: string, section = 'Beginner') {
    if (tutorPendingRef.current) return
    if (voiceConversationRef.current) stopVoiceConversation()
    setActiveRoleplay(null)
    setActiveLessonTitle(title)
    setActiveSection(section)
    setLessonRoleplayActive(false)
    setActiveFreeChat(false)
    setRoleplayComplete(false)
    setRoleplayReflection([])
    tutorSessionIdRef.current = ''
    tutorStartedAtRef.current = Date.now()
    tutorAdaptationRef.current = { failures: 0, outcomes: [], errorPatterns: {} }
    setSafeguardOffer(false)
    setTutorInput('')
    setTutorError('')
    setTutorRetryHistory(null)
    updateTutorMessages([])
    setSessionSummary(null)
    setPage('home')
    setLiveSession(false)
  }

  function startHomeLesson() {
    if (!learnerData.settings.onboardingComplete) {
      setOnboardingOpen(true)
      return
    }
    if (!sessionLanguageReady) {
      setTutorError('Your lesson language does not match your language setting. Update Settings > Languages before starting.')
      return
    }
    const speechRecognitionUnavailable = !getSpeechRecognitionConstructor()
    voiceGestureUnlockedRef.current = true
    voiceOpeningPlayedRef.current = false
    sessionPausedRef.current = false
    tutorNeedsResumeSpeechRef.current = false
    setSessionPaused(false)
    setSessionPlanOpen(false)
    setSessionNotesOpen(false)
    tapTranscriptRef.current = ''
    speechAlternativesRef.current = []
    tapAlternativesRef.current = []
    setLastLearnerSpeech('')
    updateLearnerSpeechDraft('')
    setSpeechCorrectionEditing(false)
    setShowHelpPhrases(false)
    voiceConversationRef.current = true
    setVoiceConversation(true)
    globalThis.speechSynthesis?.resume()
    tutorSessionIdRef.current = ''
    tutorStartedAtRef.current = Date.now()
    tutorAdaptationRef.current = { failures: 0, outcomes: [], errorPatterns: {} }
    setSafeguardOffer(false)
    setTutorInput('')
    setTutorError('')
    setTutorRetryHistory(null)
    setRoleplayComplete(false)
    setRoleplayReflection([])
    setSessionSummary(null)
    setLiveSession(true)
    void startTutorOpening(
      activeRoleplay,
      activeFreeChat,
      activeRoleplay?.title ?? (activeFreeChat ? freeChatTopic || 'Free chat' : activeLessonTitle),
      activeSection,
    )
    if (speechRecognitionUnavailable) {
      setVoiceError('Voice recognition is unavailable in this browser. The lesson will continue with typed replies.')
      updateLearnerSettings({ liveTranscript: true })
    }
  }

  function endTutorSession() {
    if (tutorPendingRef.current) return
    if (!window.confirm('End and see your summary?')) return
    if (voiceConversationRef.current) stopVoiceConversation()
    const messages = tutorMessagesRef.current
    const learnerTurns = messages.filter((message) => message.role === 'user')
    const corrections = messages.reduce((total, message) => total + (message.corrections?.length ?? 0), 0)
    const newWords = new Set(messages.flatMap((message) => message.newWords?.map((word) => word.word) ?? [])).size
    const minutes = Math.max(1, Math.round((Date.now() - tutorStartedAtRef.current) / 60_000))
    setSessionSummary({
      corrections,
      newWords,
      minutes,
      score: null,
      suggestedNextArea: activeSection === 'Food' ? 'Travel' : 'Food',
      sentencesSpoken: learnerTurns.length,
    })
    saveCurrentTutorHistory(messages)
    setLiveSession(false)
    sessionPausedRef.current = false
    tutorNeedsResumeSpeechRef.current = false
    setSessionPaused(false)
    setPage('home')
    setSessionMenuOpen(false)
  }

  function resumeTutorSession() {
    if (!liveSession || !sessionPaused) return
    sessionPausedRef.current = false
    setSessionPaused(false)
    if (tutorNeedsResumeSpeechRef.current) {
      tutorNeedsResumeSpeechRef.current = false
      const lastTutorMessage = [...tutorMessagesRef.current].reverse().find((message) => message.role === 'tutor')
      if (lastTutorMessage) speakTutorReply(lastTutorMessage)
      else startVoiceConversation()
    } else {
      startVoiceConversation()
    }
  }

  function saveTranscriptWord(rawWord: string, contextTranslation: string, messageId: number) {
    const word = rawWord.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}'’-]+$/gu, '')
    if (!word) return
    try {
      const cards = readReviewDeck(window.localStorage) ?? []
      const languageCode = targetCode
      const added = addNewReviewItems(cards, [{
        id: `conversation-${messageId}-${word.toLocaleLowerCase()}`,
        word,
        transliteration: '',
        translation: contextTranslation || 'Review this word in its conversation.',
        exampleSentence: tutorMessagesRef.current.find((message) => message.id === messageId)?.text ?? '',
        source: 'Tutor conversation',
        languageCode,
      }])
      if (added.length === cards.length) {
        setDataMessage(`“${word}” is already saved for review.`)
        return
      }
      saveReviewDeck(window.localStorage, added)
      setLearningSnapshot(loadLearningSnapshot())
      setDataMessage(`Saved “${word}” for review with its conversation context.`)
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : 'Could not save that word for review.')
    }
  }

  function changeLearningLanguage(code: string) {
    if (!updateLearnerSettings({ targetLanguageCode: code })) return
    if (voiceConversationRef.current) stopVoiceConversation()
    setTargetCode(code)
    setActiveRoleplay(null)
    setLessonRoleplayActive(false)
    setActiveFreeChat(false)
    setRoleplayComplete(false)
    setRoleplayReflection([])
    tutorSessionIdRef.current = ''
    tutorStartedAtRef.current = Date.now()
    tutorAdaptationRef.current = { failures: 0, outcomes: [], errorPatterns: {} }
    setSafeguardOffer(false)
    setTutorInput('')
    setTutorError('')
    setTutorRetryHistory(null)
    updateTutorMessages(getTutorWelcomeMessages(code))
  }

  function changeTutorName(name: 'Ari' | 'Ira') {
    if (!updateLearnerSettings({ tutorName: name })) return
    updateSpeechPreferences({
      gender: getTutorSpeechGender(name),
      flavor: name === 'Ari' ? 'Playful' : 'Airy',
    })
  }

  async function testMicrophone() {
    setVoiceError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('This browser does not support microphone testing. You can type instead or try a current browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      setVoiceError('')
      setDataMessage('Microphone test passed. Your browser granted temporary microphone access.')
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      setVoiceError(denied
        ? 'Microphone permission was denied. Allow access in your browser or device settings, then retry. You can type instead.'
        : error instanceof DOMException && error.name === 'NotFoundError'
          ? 'No microphone was found. Connect or enable a microphone, then retry. You can type instead.'
          : 'The microphone test failed. Check that your device is online and the microphone is connected, then retry or type instead.')
    }
  }

  function reactToMascotPoke() {
    if (mascotPokeTimerRef.current !== null) window.clearTimeout(mascotPokeTimerRef.current)
    setMascotPoked(true)
    mascotPokeTimerRef.current = window.setTimeout(() => {
      setMascotPoked(false)
      mascotPokeTimerRef.current = null
    }, 700)
  }

  function beginMascotInteraction(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return
    mascotDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      dragged: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveMascot(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = mascotDragRef.current
    if (drag.pointerId === event.pointerId) {
      const deltaX = event.clientX - drag.lastX
      const deltaY = event.clientY - drag.lastY
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      if (!drag.dragged && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8) {
        drag.dragged = true
        setMascotDragging(true)
      }
      if (drag.dragged) {
        mascotRotationRef.current.x -= deltaY * 0.8
        mascotRotationRef.current.y += deltaX * 0.8
        const orb = event.currentTarget.querySelector<HTMLElement>('.tutor-orb')
        orb?.style.setProperty('--ball-rotation-x', `${mascotRotationRef.current.x}deg`)
        orb?.style.setProperty('--ball-rotation-y', `${mascotRotationRef.current.y}deg`)
      }
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5
    event.currentTarget.style.setProperty('--poke-tilt-x', `${x * 12}deg`)
    event.currentTarget.style.setProperty('--poke-tilt-y', `${y * -12}deg`)
  }

  function endMascotInteraction(event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) {
    const drag = mascotDragRef.current
    if (drag.pointerId !== event.pointerId) return
    mascotDragRef.current.pointerId = -1
    setMascotDragging(false)
    if (!cancelled && !drag.dragged) reactToMascotPoke()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function resetMascotTilt(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.style.setProperty('--poke-tilt-x', '0deg')
    event.currentTarget.style.setProperty('--poke-tilt-y', '0deg')
  }

  function openExplore() {
    setLibraryKind('lessons')
    setPage('explore')
  }

  function finishRoleplay() {
    if (!activeRoleplay || tutorPendingRef.current) return
    if (voiceConversationRef.current) stopVoiceConversation()
    setRoleplayComplete(true)
  }

  function submitTutorMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendTutorMessage()
  }

  function tryPhrase(example: string) {
    setPhrase(example)
    const key = `${example.toLowerCase()}|${targetCode}`
    const result = samples[key]
    setTranslation(result ?? '')
    setTranslationMessage(result
      ? 'Sample translation · live translation is not connected yet'
      : 'This example is available for selected sample languages only.')
  }

  const voiceMode = tutorPending
    ? 'thinking'
    : voiceSpeaking
      ? 'speaking'
      : voiceListening
        ? 'listening'
        : voiceConversation
          ? 'active'
          : 'idle'
  const latestTutorMessage = [...tutorMessages].reverse().find((message) => message.role === 'tutor')
  const helpPhraseOptions = showHelpPhrases && latestTutorMessage && latestTutorMessage.id > (helpPhraseAfterMessageId ?? 0)
    ? parsePracticePhraseOptions(latestTutorMessage.text)
    : []
  const tutorShortcutButtons = (
    <div className="session-tutor-shortcuts" role="group" aria-label="Tutor help">
      <button type="button" aria-label="Cancel listening" title="Cancel listening" disabled={!voiceListening && !speechReadyToSend} onClick={cancelSpeechCapture}><Icon name="close" size={20} /></button>
      <button type="button" aria-label="Repeat" title="Repeat" disabled={!liveSession || tutorPending || !latestTutorMessage} onClick={() => { if (latestTutorMessage) speakTutorReply(latestTutorMessage) }}><Icon name="repeat" size={20} /></button>
      <button type="button" aria-label="Help me say it" title="Help me say it" disabled={!liveSession || tutorPending} onClick={requestHelpPhrases}><Icon name="translate" size={20} /></button>
      <button type="button" aria-label="I don't know" title="I don't know" disabled={!liveSession || tutorPending} onClick={() => void sendTutorMessage('I don’t know. Give me one helpful hint in my target language and a translation.')}><Icon name="sparkles" size={20} /></button>
      <button type="button" aria-label="Type instead" title="Type instead" disabled={!liveSession} onClick={focusTutorTextInput}><Icon name="keyboard" size={20} /></button>
    </div>
  )
  return (
    <div className={`app-shell ${page === 'home' && !liveSession ? 'home-idle-shell' : ''} ${page === 'home' && liveSession ? 'home-session-shell' : ''}`} data-theme={theme} data-tutor-mode={learnerData.settings.tutorMode} data-tutor-color={learnerData.settings.mascotColor.toLowerCase()}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage('home')} aria-label="Go to home">
          <img className="brand-mark" src="/ari-language-app-logo.png" alt="" />
          <span className="brand-wordmark"><strong>Ariira</strong><small>Language app</small></span>
        </button>

        <div className="sidebar-label">YOUR SPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              key={item.id}
              onClick={() => setPage(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-icon"><Icon name="sparkles" size={18} /></div>
            <p className="plan-title">Small steps, big fluency.</p>
            <p className="plan-copy">A little practice every day adds up.</p>
              <div className="plan-progress" role="progressbar" aria-label="Daily practice goal" aria-valuemin={0} aria-valuemax={learnerData.settings.dailyGoalMinutes} aria-valuenow={Math.min(learnerData.settings.dailyGoalMinutes, Math.floor(learningSummary.todaySeconds / 60))}><span style={{ width: `${Math.min(100, learningSummary.todaySeconds / (learnerData.settings.dailyGoalMinutes * 60) * 100)}%` }} /></div>
              <div className="plan-foot"><span>{Math.floor(learningSummary.todaySeconds / 60)} total min · {Math.floor(learningSummary.todaySeconds / 60) >= learnerData.settings.dailyGoalMinutes ? 'Goal reached' : `goal ${learnerData.settings.dailyGoalMinutes} min`}</span><strong>{learningSummary.week.filter((day) => day.seconds > 0).length}/7 days</strong></div>
          </div>
          <div className="profile-row">
            <div className="avatar">{(learnerData.settings.displayName || 'L').charAt(0).toUpperCase()}</div>
            <div className="profile-copy"><strong>{learnerData.settings.displayName || 'Learner'}</strong><span>{learnerData.settings.level} · {learnerData.settings.targetLanguageCode.toUpperCase()}</span></div>
            <button className="icon-button profile-menu" aria-label="Profile options"><Icon name="chevron" size={17} /></button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">{page === 'home' && liveSession ? <strong className="session-mobile-brand">Ariira</strong> : <>Your space <span>/</span> <strong>{page === 'home' ? 'Home' : pageTitle}</strong></>}</div>
          <div className="topbar-actions">
            {page === 'home' && (
              <details className="session-menu topbar-session-menu" open={sessionMenuOpen} onToggle={(event) => setSessionMenuOpen(event.currentTarget.open)}>
                <summary aria-label="Home menu">Menu</summary>
                <div className="session-menu-actions">
                  <button type="button" onClick={resetTutorConversation} disabled={!liveSession || tutorPending}>Start over</button>
                  <button type="button" onClick={endTutorSession} disabled={!liveSession || tutorPending}>End session</button>
                  <button type="button" onClick={() => setPage('settings')}>Settings</button>
                </div>
              </details>
            )}
            <button className="streak-pill" aria-label={`Your ${learningSummary.currentStreak} day streak`}><span>✦</span> {learningSummary.currentStreak} day streak</button>
            <button
              className="theme-switch"
              onClick={() => changeTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-pressed={theme === 'dark'}
            >
              <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
              <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>
            <button className="avatar avatar-small" onClick={() => setPage('settings')} aria-label="Open settings">{(learnerData.settings.displayName || 'L').charAt(0).toUpperCase()}</button>
          </div>
        </header>

        {page === 'home' && !liveSession && (
          <div className="page-content home-page-content">
            <section className="welcome-row">
              <div>
                <p className="eyebrow">{new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()} · YOUR DASHBOARD</p>
                <h1>A little progress,<br className="mobile-break" /> every day <span className="heading-sparkle">✳</span></h1>
                <p className="welcome-copy">You're building a lovely habit. Ready for today's practice?</p>
              </div>
              <div className="week-streak" aria-label="Weekly learning streak">
                <span className="streak-caption">YOUR WEEK</span>
                <div className="streak-days">
                  {learningSummary.week.map((day, index) => (
                    <div className="streak-day" key={day.key}>
                      <span className={`day-dot ${day.seconds > 0 ? 'completed' : ''} ${index === (new Date().getDay() + 6) % 7 ? 'today' : ''}`}>{day.seconds > 0 ? '✓' : ''}</span>
                      <span>{day.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="home-studio" aria-label="Home tutor stage">
                <div className="home-tutor-panel">
                  <div className="home-chapter-label">{activeSection} · {learnerData.settings.level}</div>
                  <h1>{activeLessonTitle}{activeSection === 'Food' && !activeRoleplay && !activeFreeChat && <span aria-hidden="true">☕</span>}</h1>
                  <p className="home-tutor-prompt">A little speaking practice with {learnerData.settings.tutorName} can take you a long way.</p>
                  {!learnerData.settings.onboardingComplete && (
                    <div className="home-setup-required" role="status">
                      <p>Complete your learner profile before starting a tutor session.</p>
                      <button className="button button-outline" type="button" onClick={() => setOnboardingOpen(true)}>Complete setup</button>
                    </div>
                  )}
                  <div className="home-stage-toolbar">
                    <span className={`online-dot ${tutorError ? 'model-error' : ''}`} role="status" aria-live="polite">
                      {tutorError ? 'Ready for typed practice' : `Talk with ${learnerData.settings.tutorName}`}
                    </span>
                    {learnerData.settings.tutorMode === 'strict' && <button className="button button-outline ease-up-button" type="button" onClick={() => updateLearnerSettings({ tutorMode: 'balanced' })}>Ease up</button>}
                  </div>
                  {sessionSummary && (
                    <section className="session-summary-card" aria-label="End of session summary">
                      <p className="eyebrow">SESSION COMPLETE</p>
                      <h2>Nice work with {learnerData.settings.tutorName}.</h2>
                      <p>{sessionSummary.minutes} min · {sessionSummary.corrections} corrections · {sessionSummary.newWords} new words</p>
                      <p>{sessionSummary.sentencesSpoken} learner {sessionSummary.sentencesSpoken === 1 ? 'utterance' : 'utterances'}</p>
                      <small>{sessionSummary.score === null ? 'This session was not scored.' : `Score: ${sessionSummary.score}`}</small>
                      <p className="session-summary-next">Suggested next area: <strong>{sessionSummary.suggestedNextArea}</strong></p>
                    </section>
                  )}
                  <button
                    className={`home-mascot-wrap ${mascotPoked ? 'is-poked' : ''} ${mascotDragging ? 'is-dragging' : ''}`}
                    type="button"
                    aria-label={liveSession
                      ? voiceInputMode === 'hold'
                        ? `Hold ${learnerData.settings.tutorName} to speak`
                        : `Press to speak with ${learnerData.settings.tutorName}`
                      : voiceInputMode === 'hold'
                        ? `Start speaking with ${learnerData.settings.tutorName}`
                        : `Press to speak with ${learnerData.settings.tutorName}`}
                    title={liveSession ? 'Tap to speak or interrupt your tutor' : 'Tap to start a speaking session'}
                    onPointerDown={(event) => {
                      beginMascotInteraction(event)
                      if (liveSession && voiceInputMode === 'hold') beginHoldToSpeak()
                      else if (!liveSession && voiceInputMode === 'hold') startHomeLesson()
                    }}
                    onPointerMove={moveMascot}
                    onPointerUp={(event) => {
                      endMascotInteraction(event)
                      if (voiceInputMode === 'hold' && liveSession) endHoldToSpeak()
                    }}
                    onPointerCancel={(event) => {
                      endMascotInteraction(event, true)
                      if (voiceInputMode === 'hold' && liveSession) endHoldToSpeak()
                    }}
                    onPointerLeave={resetMascotTilt}
                    onKeyDown={(event) => {
                      if (voiceInputMode === 'hold' && (event.key === ' ' || event.key === 'Enter')) {
                        event.preventDefault()
                        if (liveSession) beginHoldToSpeak()
                        else startHomeLesson()
                      }
                    }}
                    onKeyUp={(event) => {
                      if (voiceInputMode === 'hold' && liveSession && (event.key === ' ' || event.key === 'Enter')) {
                        event.preventDefault()
                        endHoldToSpeak()
                      }
                    }}
                    onClick={() => {
                      if (voiceInputMode === 'tap' && !mascotDragRef.current.dragged) handleVoiceButton()
                    }}
                  >
                    <TutorAvatar mode={voiceMode} tutor={learnerData.settings.tutorName} audioLevel={voiceSpeaking ? voiceAudioLevel : 0} microphoneLevel={microphoneLevel} reaction={tutorReaction} />
                  </button>
                  <button
                    className="home-start-button voice-press-button"
                    type="button"
                    onClick={voiceInputMode === 'tap' ? handleVoiceButton : undefined}
                    onPointerDown={voiceInputMode === 'hold' ? () => { if (liveSession) beginHoldToSpeak(); else startHomeLesson() } : undefined}
                    onPointerUp={voiceInputMode === 'hold' && liveSession ? endHoldToSpeak : undefined}
                    onPointerLeave={voiceInputMode === 'hold' && liveSession ? endHoldToSpeak : undefined}
                    onKeyDown={(event) => {
                      if (voiceInputMode === 'hold' && (event.key === ' ' || event.key === 'Enter')) {
                        event.preventDefault()
                        if (liveSession) beginHoldToSpeak()
                        else startHomeLesson()
                      }
                    }}
                    onKeyUp={(event) => {
                      if (voiceInputMode === 'hold' && liveSession && (event.key === ' ' || event.key === 'Enter')) {
                        event.preventDefault()
                        endHoldToSpeak()
                      }
                    }}
                    disabled={!canStartTutor || (tutorPending && !voiceSpeaking)}
                    aria-label={voiceSpeaking ? `${learnerData.settings.tutorName} is speaking; press to interrupt` : voiceListening ? 'Listening; release to send' : 'Press to speak'}
                  >
                    {tutorPending ? 'Thinking...' : voiceSpeaking ? `${learnerData.settings.tutorName} is speaking · tap to interrupt` : voiceListening ? voiceInputMode === 'hold' ? 'Listening... release to send' : 'Listening...' : speechReadyToSend ? 'Tap again to send' : 'Press to speak'}
                    <span aria-hidden="true"> ›</span>
                  </button>
                  {!learnerData.settings.onboardingComplete && <p className="home-language-warning" role="alert">Finish setup before starting your lesson.</p>}
                  {!sessionLanguageReady && <p className="home-language-warning" role="alert">Your lesson language and profile language do not match. Update Settings → Languages before starting.</p>}
                  <div className="home-tutor-choices">
                    <div className="home-mode-choices" role="group" aria-label="Choose your tutor style">
                      {([
                        { id: 'soft', title: 'Soft Tutor', description: 'Gentle, encouraging, lots of hints.' },
                        { id: 'balanced', title: 'Balanced Tutor', description: 'Friendly, clear, and just challenging enough.' },
                        { id: 'strict', title: 'Strict Tutor', description: 'Precise feedback and a brisker pace.' },
                      ] as const).map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          className={`home-mode-choice mode-${mode.id} ${learnerData.settings.tutorMode === mode.id ? 'is-selected' : ''}`}
                          aria-label={mode.title}
                          aria-pressed={learnerData.settings.tutorMode === mode.id}
                          onClick={() => updateLearnerSettings({ tutorMode: mode.id })}
                        >
                          <span className="home-mode-swatch" />
                          <span>{capitalize(mode.id)}</span>
                        </button>
                      ))}
                    </div>
                    <p className="home-mode-description">
                      {learnerData.settings.tutorMode === 'soft'
                        ? 'Gentle, encouraging, lots of hints.'
                        : learnerData.settings.tutorMode === 'strict'
                          ? 'Precise feedback and a brisker pace.'
                          : 'Friendly, clear, and just challenging enough.'}
                    </p>
                    {tutorShortcutButtons}
                  </div>
                  {learnerData.settings.liveTranscript && liveSession && <p className="home-live-caption" aria-live="polite">{voiceTranscript || tutorMessages.at(-1)?.text || `${learnerData.settings.tutorName} will greet you and begin the lesson.`}</p>}
                  {!liveSession && <button className="home-free-chat-shortcut" type="button" onClick={() => { setLibraryKind('free-chat'); setPage('explore') }}>Free chat</button>}
                </div>
            </section>

            <div className="home-legacy-content" aria-hidden="true">
            <section className="learning-card">
              <div className="learning-copy">
                <div className="lesson-kicker"><span className="lesson-dot" /> YOUR NEXT LESSON <span className="lesson-time"><Icon name="clock" size={14} /> 10 MIN</span></div>
                <h2>{targetCode === 'fr' ? (canOpenLessonPreview ? 'Your French lesson preview' : 'Your French conversation') : 'Your next text lesson'}</h2>
                <p>{targetCode === 'fr'
                  ? canOpenLessonPreview
                    ? `Try an unreviewed French A1 sample lesson or practise in an open conversation with ${learnerData.settings.tutorName}.`
                    : `Practise French in an open conversation with ${learnerData.settings.tutorName}. French lessons are still being prepared for review.`
                  : `Practise a few Mandarin greetings in a short, guided lesson with ${learnerData.settings.tutorName}.`}</p>
                <div className="lesson-meta"><span className="language-chip"><span>{targetLanguage.flag}</span> {targetLanguage.name}</span>                <span className="level-chip">{learnerData.settings.level} · {learnerData.settings.level === 'A0' ? 'STARTING' : 'LEARNER'}</span></div>
                {canOpenLessonPreview && (targetCode === 'zh' || targetCode === 'fr') && <button className="button button-dark" onClick={() => setPage('lesson')}>
                  {targetCode === 'fr' ? 'Open French lesson preview' : 'Open text lesson'} <Icon name="arrow" size={17} />
                </button>}
                {targetCode === 'fr' && <button className="button button-dark" onClick={() => { setLibraryKind('free-chat'); setPage('explore') }}>
                  Start French chat <Icon name="arrow" size={17} />
                </button>}
                <button className="lesson-voice-link" onClick={() => beginLesson(activeLessonTitle, 'Food')}>
                  Prefer a conversation? Talk with {learnerData.settings.tutorName} <Icon name="arrow" size={15} />
                </button>
              </div>
              <div className="lesson-art" aria-hidden="true">
                <span className="character-rebuild-orb"><Icon name="sparkles" size={32} /></span>
              </div>
            </section>

            <section className="stats-grid" aria-label="Learning overview">
              <article className="stat-card stat-highlight">
                <div className="stat-icon stat-icon-peach"><Icon name="clock" size={18} /></div>
                <span className="stat-label">TIME THIS WEEK</span>
                <strong>{Math.round(learningSummary.weekSeconds / 60)} <small>min</small></strong>
                <span className="stat-note">{Math.floor(learningSummary.todaySeconds / 60)} / {learnerData.settings.dailyGoalMinutes} min goal today</span>
              </article>
              <article className="stat-card">
                <div className="stat-icon stat-icon-lavender"><Icon name="book" size={18} /></div>
                <span className="stat-label">WORDS IN YOUR DECK</span>
                <strong>{learningSnapshot.words}</strong>
                <span className="stat-note">{learningSnapshot.masteredWords} mastered by review</span>
              </article>
              <article className="stat-card">
                <div className="stat-icon stat-icon-mint"><Icon name="chart" size={18} /></div>
                <span className="stat-label">DAY STREAK</span>
                <strong>{learningSummary.currentStreak} <small>days</small></strong>
                <span className="stat-note">Based on active practice days</span>
              </article>
              <button className="stat-card stat-link-card" onClick={() => setPage('progress')}>
                <div className="stat-icon stat-icon-blue"><Icon name="sparkles" size={18} /></div>
                <span className="stat-label">YOUR LEVEL</span>
                <strong>{learnerData.settings.level} <small>Self-check</small></strong>
                <span className="stat-note">See your progress <Icon name="arrow" size={14} /></span>
              </button>
            </section>

            <section className="lower-grid">
              <div className="panel practice-panel">
                <div className="section-heading"><div><p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h3>Make it a moment</h3></div><button className="text-button" onClick={() => setPage('explore')}>See all <Icon name="arrow" size={15} /></button></div>
                <div className="practice-options">
                  <button className="practice-option" onClick={() => beginLesson(activeLessonTitle, 'Food')}>
                    <span className="practice-icon practice-chat"><Icon name="sparkles" size={19} /></span><span className="practice-label"><strong>Chat with your tutor</strong><small>A friendly conversation, just for you</small></span><Icon name="arrow" size={17} />
                  </button>
                  <button className="practice-option" onClick={() => setPage('translate')}>
                    <span className="practice-icon practice-translate"><Icon name="translate" size={19} /></span><span className="practice-label"><strong>Try a translation</strong><small>Find the words for what you mean</small></span><Icon name="arrow" size={17} />
                  </button>
                  <button className="practice-option" onClick={() => setPage('vocabulary')}>
                    <span className="practice-icon practice-review"><Icon name="book" size={19} /></span><span className="practice-label"><strong>Review your words</strong><small>Practise words when they’re due</small></span><Icon name="arrow" size={17} />
                  </button>
                </div>
              </div>
              <div className="panel words-panel">
                <div className="section-heading"><div><p className="eyebrow">A FEW GOOD WORDS</p><h3>Recently learned</h3></div><button className="text-button" onClick={() => setPage('vocabulary')}>View all <Icon name="arrow" size={15} /></button></div>
                <div className="word-list">
                  <p>Your reviewed curriculum words will appear here. Open your review garden to practise words that are due.</p>
                  <button className="text-button" onClick={() => setPage('vocabulary')}>Open review garden <Icon name="arrow" size={15} /></button>
                </div>
              </div>
            </section>
            <footer className="page-footer"><span>A calm little corner for your language journey.</span><span>Made for curious minds <span className="footer-heart">♥</span></span></footer>
            </div>
          </div>
        )}

        {page === 'explore' && (
          <TutorLibrary
            initialKind={libraryKind}
            onKindChange={setLibraryKind}
            onStartLesson={(title, section) => beginLesson(title, section)}
            onStartRoleplay={(scenario, section) => {
              beginRoleplay(scenario, false, section)
            }}
            onStartFreeChat={beginFreeChat}
          />
        )}

        {page === 'lesson' && canOpenLessonPreview && LessonPlayer && (targetCode === 'zh' || targetCode === 'fr') && (
          <Suspense fallback={<div className="page-content">Opening the text lesson…</div>}>
            <LessonPlayer
              targetLanguageCode={targetCode}
              onExit={() => setPage('home')}
              onReviewWords={() => setPage('vocabulary')}
              onStartRoleplay={beginLessonRoleplay}
            />
          </Suspense>
        )}

        {page === 'translate' && (
          <div className="page-content subpage-content">
            <div className="subpage-intro"><p className="eyebrow">A LITTLE HELP WITH THE WORDS</p><h1>Say it your way.</h1><p>Find the right words, one phrase at a time.</p></div>
            <section className="translator-card">
              <div className="language-selectors">
                <label className="language-select"><span>FROM</span><span className="language-select-control"><span>{sourceLanguage.flag}</span><select aria-label="Translate from" value={sourceCode} onChange={(event) => setSourceCode(event.target.value)}>{languages.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}</select><Icon name="chevron" size={16} /></span></label>
                <button className="swap-button" onClick={swapLanguages} aria-label="Swap languages"><Icon name="swap" size={19} /></button>
                <label className="language-select"><span>TO</span><span className="language-select-control"><span>{targetLanguage.flag}</span><select aria-label="Translate to" value={targetCode} onChange={(event) => { setTargetCode(event.target.value); setTranslation(''); setTranslationMessage('') }}>{languages.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}</select><Icon name="chevron" size={16} /></span></label>
              </div>
              <div className="translation-workspace">
                <div className="translation-side">
                  <div className="translation-side-label">{sourceLanguage.name} <span>Original</span></div>
                  <textarea value={phrase} onChange={(event) => { setPhrase(event.target.value); setTranslation(''); setTranslationMessage('') }} placeholder="Type a word or phrase…" aria-label="Text to translate" maxLength={300} />
                  <div className="translation-controls"><button className="icon-button mic-button" aria-label="Voice input is not available in this preview" title="Voice input is not connected yet"><Icon name="mic" size={18} /></button><span>{phrase.length}/300</span></div>
                </div>
                <div className="translation-side translation-result">
                  <div className="translation-side-label">{targetLanguage.name} <span>Translation</span></div>
                  {translation ? <p className="translated-text" lang={targetLanguage.locale}>{translation}</p> : <p className="translation-placeholder">Your translation will appear here.</p>}
                  {translation && <button className="icon-button result-audio" onClick={speakTranslation} aria-label="Speak translation"><Icon name="volume" size={18} /></button>}
                  <div className="translation-controls"><span>{translation ? 'Sample phrase' : ' '}</span><span /></div>
                </div>
              </div>
              <div className="translate-submit-row"><div className="demo-disclaimer"><span className="info-dot">i</span><span>{translationMessage || 'Preview mode · a few sample phrases are available'}</span></div><button className="button button-dark translate-button" onClick={translatePhrase}>Translate <Icon name="arrow" size={17} /></button></div>
            </section>
            <section className="examples-section"><div className="section-heading"><div><p className="eyebrow">NEED A PLACE TO START?</p><h3>Try a little phrase</h3></div></div><div className="example-list">{['Hello', 'Good morning', 'Thank you', 'Where is the station?'].map((example) => <button className="example-chip" key={example} onClick={() => tryPhrase(example)}>{example}<Icon name="arrow" size={14} /></button>)}</div></section>
            <div className="prototype-note"><Icon name="sparkles" size={17} /><span>This is an early preview. Voice input and live AI translation will be added in a later step.</span></div>
          </div>
        )}

        {page === 'home' && liveSession && (
          <div className="page-content subpage-content home-stage-session">
            <div className="tutor-layout">
              <section className="tutor-card">
                <div className="tutor-topline">
                  <span className="tutor-avatar" aria-hidden="true"><Icon name="sparkles" size={19} /></span>
                  <span className="tutor-identity"><strong>{learnerData.settings.tutorName}</strong><small>{activeRoleplay?.title ?? (activeFreeChat ? freeChatTopic || 'Free chat' : activeLessonTitle)} · {targetLanguage.name}</small></span>
                  <span className={`online-dot ${tutorError ? 'model-error' : ''}`} aria-live="polite">
                    {tutorError ? 'Local AI unavailable' : tutorPending ? `${learnerData.settings.tutorName} is thinking…` : 'Local AI · ready'}
                  </span>
                  <button className="live-transcript-toggle" type="button" aria-pressed={learnerData.settings.liveTranscript} onClick={() => updateLearnerSettings({ liveTranscript: !learnerData.settings.liveTranscript })}>Live transcript {learnerData.settings.liveTranscript ? 'On' : 'Off'}</button>
                  <button className="live-transcript-toggle" type="button" aria-expanded={sessionPlanOpen} onClick={() => { setSessionPlanOpen((open) => !open); setSessionNotesOpen(false) }}>Lesson plan</button>
                  <button className="live-transcript-toggle" type="button" aria-expanded={sessionNotesOpen} onClick={() => { setSessionNotesOpen((open) => !open); setSessionPlanOpen(false) }}>Notes</button>
                  {learnerData.settings.tutorMode === 'strict' && <button className="button button-outline ease-up-button" type="button" onClick={() => { updateLearnerSettings({ tutorMode: 'balanced' }); setSafeguardOffer(false) }}>Ease up</button>}
                </div>
                <div className="session-tutor-quick-tools">
                  <div className="home-mode-choices" role="group" aria-label="Choose your tutor style">
                    {([
                      { id: 'soft', title: 'Soft Tutor' },
                      { id: 'balanced', title: 'Balanced Tutor' },
                      { id: 'strict', title: 'Strict Tutor' },
                    ] as const).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        className={`home-mode-choice mode-${mode.id} ${learnerData.settings.tutorMode === mode.id ? 'is-selected' : ''}`}
                        aria-label={mode.title}
                        aria-pressed={learnerData.settings.tutorMode === mode.id}
                        onClick={() => updateLearnerSettings({ tutorMode: mode.id })}
                      >
                        <span className="home-mode-swatch" />
                        <span>{capitalize(mode.id)}</span>
                      </button>
                    ))}
                  </div>
                  {tutorShortcutButtons}
                </div>
                {sessionPaused && (
                  <section className="session-paused-panel" role="status" aria-live="polite">
                    <strong>Session paused</strong>
                    <span>Your conversation and lesson context are saved on this page.</span>
                    <div>
                      <button type="button" onClick={resumeTutorSession}>Resume where we stopped</button>
                      <button type="button" onClick={() => { sessionPausedRef.current = false; setSessionPaused(false); resetTutorConversation() }}>Start the exercise again</button>
                    </div>
                  </section>
                )}
                {sessionPlanOpen && (
                  <section className="session-resource-panel" aria-label="Lesson plan and goals">
                    <div className="section-heading">
                      <div><p className="eyebrow">TODAY’S PRACTICE</p><h3>{activeRoleplay?.title ?? (activeFreeChat ? freeChatTopic || 'Free chat' : activeLessonTitle)}</h3></div>
                      <button type="button" className="icon-button" aria-label="Close lesson plan" onClick={() => setSessionPlanOpen(false)}>×</button>
                    </div>
                    <p>{targetLanguage.name} · {learnerData.settings.level} · {capitalize(learnerData.settings.tutorMode)} coaching</p>
                    <ol className="session-plan-list">
                      {['Warm-up and review', 'Model a useful phrase', 'Notice meaning and pronunciation', 'Practise and personalise', 'Use it in a mini-dialogue', 'Recall and wrap-up'].map((step) => <li key={step}>{step}</li>)}
                    </ol>
                    <small>{tutorMessages.filter((message) => message.role === 'user').length} learner turns so far</small>
                  </section>
                )}
                {sessionNotesOpen && (
                  <section className="session-resource-panel" aria-label="Phrases and notes for this session">
                    <div className="section-heading">
                      <div><p className="eyebrow">SESSION NOTES</p><h3>Tutor phrases and replies</h3></div>
                      <button type="button" className="icon-button" aria-label="Close session notes" onClick={() => setSessionNotesOpen(false)}>×</button>
                    </div>
                    {tutorMessages.filter((message) => message.role === 'tutor').length
                      ? <ul className="session-notes-list">{tutorMessages.filter((message) => message.role === 'tutor').map((message) => <li key={message.id}><span lang={targetLanguage.locale}>{message.text}</span>{message.pinyin && <small>{message.pinyin}</small>}{message.meaning && <small>{message.meaning}</small>}</li>)}</ul>
                      : <p>Your tutor’s phrases and notes will appear here.</p>}
                  </section>
                )}
                <section className={`voice-panel is-${voiceMode}`} aria-label={`Voice conversation with ${learnerData.settings.tutorName}`}>
                  <div className="voice-panel-heading">
                    <span className="voice-status-dot" />
                    <span role="status" aria-live="polite">
                      {sessionPaused ? 'Paused' : tutorPending ? 'Checking...' : voiceSpeaking ? `${learnerData.settings.tutorName} is speaking` : voiceListening ? 'Listening...' : 'Your turn'}
                    </span>
                  </div>
                  <p className="voice-prompt">
                    {tutorPending
                      ? 'Thinking about your answer.'
                      : voiceInputMode === 'hold'
                        ? voiceSpeaking
                          ? `Hold ${learnerData.settings.tutorName} to interrupt, then speak and release.`
                          : voiceListening
                            ? 'Keep holding while you speak. Release to send your turn.'
                            : `Press and hold ${learnerData.settings.tutorName} while you speak. Release to send.`
                        : voiceSpeaking
                          ? `Tap ${learnerData.settings.tutorName} to interrupt, or speak when they’re done.`
                          : voiceListening
                            ? `Speak naturally. ${learnerData.settings.tutorName} will answer when you pause.`
                            : voiceConversation
                              ? `Go ahead — ${learnerData.settings.tutorName} is listening for your next thought.`
                                : voiceError
                                  ? 'Voice is unavailable. Type a reply below or retry your microphone.'
                                  : 'Speak naturally, then pause when you finish, or type a reply below.'}
                  </p>
                  {learnerData.settings.tutorMode === 'strict' && <p className="strict-safe-word">You can type “ease up” or use the Ease up button at any time. Strict feedback stays respectful.</p>}
                  <div className={`mobile-tutor-thought is-${voiceMode}`} role="status" aria-live="polite" aria-label={tutorPending ? `${learnerData.settings.tutorName} is thinking` : voiceSpeaking ? `${learnerData.settings.tutorName} is speaking` : voiceListening ? `${learnerData.settings.tutorName} is listening` : 'Ready when you are'}>
                    <span /><span /><span />
                  </div>
                  <div className="voice-controls">
                    <div className="voice-avatar-orbit">
                      <button
                        className={`voice-main-button mode-${voiceInputMode}`}
                        type="button"
                        onClick={voiceInputMode === 'tap' ? handleVoiceButton : undefined}
                        onPointerDown={voiceInputMode === 'hold' ? beginHoldToSpeak : undefined}
                        onPointerUp={voiceInputMode === 'hold' ? endHoldToSpeak : undefined}
                        onPointerLeave={voiceInputMode === 'hold' ? endHoldToSpeak : undefined}
                        onPointerCancel={voiceInputMode === 'hold' ? endHoldToSpeak : undefined}
                        onKeyDown={(event) => {
                          if (voiceInputMode === 'hold' && (event.key === ' ' || event.key === 'Enter')) {
                            event.preventDefault()
                            beginHoldToSpeak()
                          }
                        }}
                        onKeyUp={(event) => {
                          if (voiceInputMode === 'hold' && (event.key === ' ' || event.key === 'Enter')) {
                            event.preventDefault()
                            endHoldToSpeak()
                          }
                        }}
                        aria-pressed={voiceInputMode === 'hold' ? voiceListening || voiceSpeaking : voiceConversation}
                        aria-label={voiceInputMode === 'hold'
                          ? voiceSpeaking ? `Hold ${learnerData.settings.tutorName} to interrupt and speak` : voiceListening ? `Listening; release ${learnerData.settings.tutorName} to send` : 'Press to speak'
                          : voiceSpeaking ? `${learnerData.settings.tutorName} is speaking; tap to interrupt` : 'Press to speak'}
                        disabled={roleplayComplete || (tutorPending && !voiceConversation)}
                      >
                        <TutorAvatar mode={voiceMode} tutor={learnerData.settings.tutorName} audioLevel={voiceSpeaking ? voiceAudioLevel : 0} microphoneLevel={microphoneLevel} reaction={tutorReaction} />
                      </button>
                    </div>
                    <span className="voice-main-label">
                      {voiceListening ? voiceInputMode === 'hold' ? 'Listening... release to send' : 'Listening...' : speechReadyToSend ? 'Tap again to send' : voiceSpeaking ? `${learnerData.settings.tutorName} is speaking` : tutorPending ? 'Thinking...' : 'Press to speak'}
                    </span>
                  </div>
                  <button
                    className="voice-press-button"
                    type="button"
                    onClick={voiceInputMode === 'tap' ? handleVoiceButton : undefined}
                    onPointerDown={voiceInputMode === 'hold' ? beginHoldToSpeak : undefined}
                    onPointerUp={voiceInputMode === 'hold' ? endHoldToSpeak : undefined}
                    onPointerLeave={voiceInputMode === 'hold' ? endHoldToSpeak : undefined}
                    onPointerCancel={voiceInputMode === 'hold' ? endHoldToSpeak : undefined}
                    onKeyDown={(event) => {
                      if (voiceInputMode === 'hold' && (event.key === ' ' || event.key === 'Enter')) {
                        event.preventDefault()
                        beginHoldToSpeak()
                      }
                    }}
                    onKeyUp={(event) => {
                      if (voiceInputMode === 'hold' && (event.key === ' ' || event.key === 'Enter')) {
                        event.preventDefault()
                        endHoldToSpeak()
                      }
                    }}
                    disabled={tutorPending || roleplayComplete}
                  >
                    {tutorPending ? 'Thinking...' : voiceSpeaking ? `${learnerData.settings.tutorName} is speaking` : voiceListening ? voiceInputMode === 'hold' ? 'Listening... release to send' : 'Listening...' : speechReadyToSend ? 'Tap again to send' : 'Press to speak'}
                  </button>
                  {(voiceListening || speechReadyToSend) && <div className="speech-capture-line" aria-live="polite"><strong>You said:</strong> {learnerSpeechDraft || 'Listening…'} <button type="button" onClick={cancelSpeechCapture}>Cancel</button></div>}
                  {lastLearnerSpeech && !voiceListening && !speechReadyToSend && <div className="speech-capture-line"><button type="button" onClick={() => { setTutorInput(lastLearnerSpeech); setSpeechCorrectionEditing(true); updateLearnerSettings({ liveTranscript: true }) }}><strong>You said:</strong> {lastLearnerSpeech}</button><button type="button" onClick={startSpeechRetry}>Say it again</button><button type="button" onClick={() => { setTutorInput(lastLearnerSpeech); setSpeechCorrectionEditing(true); updateLearnerSettings({ liveTranscript: true }) }}>That’s not what I said</button></div>}
                  {voiceListening && <div className="microphone-meter" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(microphoneLevel * 100)}><span style={{ transform: `scaleX(${microphoneLevel})` }} /></div>}
                  {voiceListening && microphoneLevel > .78 && <p className="voice-support-note" role="status">The room is noisy or the tutor may be echoing into your microphone. Move closer or try headphones.</p>}
                  {voiceListening && microphoneLevel < .006 && <p className="voice-support-note" role="status">No microphone level detected yet. Check that the microphone is not muted.</p>}
                  {showHelpPhrases && <><p className="voice-help-prompt">Choose a phrase to hear it, then say it back to {learnerData.settings.tutorName}.</p>{helpPhraseOptions.map((option) => <button className="voice-help-phrase" type="button" key={option.phrase} onClick={() => playPracticePhrase(option)}>{option.phrase} <span>{option.translation}</span></button>)}</>}
                  {speechCorrectionEditing && <div className="speech-correction-editor"><label htmlFor="speech-correction-input-live">Correct what you said</label><input id="speech-correction-input-live" value={tutorInput} onChange={(event) => setTutorInput(event.target.value)} /><button type="button" disabled={!tutorInput.trim() || tutorPending} onClick={() => void replaceLastSpeechTurn(tutorInput)}>Send corrected reply</button></div>}
                  {learnerData.settings.liveTranscript && (voiceTranscript || voiceListening)
                    ? <p className={`voice-live-transcript ${voiceTranscript ? 'has-transcript' : ''}`} aria-live="polite">{voiceTranscript || `${learnerData.settings.tutorName} is listening for your voice…`}</p>
                    : null}
                  {voiceLatencyMs !== null && <p className="voice-latency" role="status">Reply ready in {(voiceLatencyMs / 1000).toFixed(1)} s, before speech playback.</p>}
                  {!getSpeechRecognitionConstructor() && <p className="voice-support-note">Voice input needs a browser with speech recognition, such as the latest Chrome or Edge.</p>}
                  {voiceError && <div className="voice-error-actions" role="alert"><p className="voice-error">{voiceError}</p><div><button type="button" onClick={() => { updateLearnerSettings({ liveTranscript: true }); document.querySelector('.text-practice')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>Type instead</button><button type="button" onClick={startVoiceConversation}>Retry mic</button><button type="button" onClick={() => void testMicrophone()}>Test microphone</button></div></div>}
                  {tutorError && <div className="voice-tutor-error" role="alert"><span>{tutorError}</span>{tutorRetryHistory && <button type="button" onClick={() => void retryTutorMessage()} disabled={tutorPending}>Try again</button>}</div>}
                </section>
                {safeguardOffer && (
                  <section className="tutor-safeguard-offer" role="status">
                    <strong>{tutorAdaptationRef.current.failures >= 3 ? 'Let’s make this easier.' : 'Let’s pause and reset.'}</strong>
                    <span>{tutorAdaptationRef.current.failures >= 3 ? 'We can try a simpler prompt or change coaching style.' : 'You are in control of the pace and coaching style.'}</span>
                    <div>
                      {tutorAdaptationRef.current.failures >= 3 && <button type="button" onClick={() => beginLesson('Everyday phrases', 'Beginner')}>Try an easier prompt</button>}
                      <button type="button" onClick={() => { updateLearnerSettings({ tutorMode: 'balanced' }); setSafeguardOffer(false) }}>Switch to Balanced</button>
                      <button type="button" onClick={() => { updateLearnerSettings({ tutorMode: 'soft' }); setSafeguardOffer(false) }}>Switch to Soft</button>
                    </div>
                  </section>
                )}
                <details className="text-practice" onToggle={(event) => {
                  const isOpen = event.currentTarget.open
                  if (isOpen !== learnerData.settings.liveTranscript) updateLearnerSettings({ liveTranscript: isOpen })
                }}>
                  <summary>{learnerData.settings.liveTranscript ? 'Live transcript' : 'Show transcript or type instead'}</summary>
                  <div className="text-practice-content">
                    <div className="conversation-toolbar">
                      <span><Icon name="clock" size={14} /> Just you and {learnerData.settings.tutorName}</span>
                      <div>
                        {targetCode === 'zh' && <button className={`conversation-toggle ${showPinyin ? 'selected' : ''}`} onClick={() => setShowPinyin((visible) => !visible)} aria-pressed={showPinyin}>Pinyin</button>}
                        <button className={`conversation-toggle ${showMeaning ? 'selected' : ''}`} onClick={() => setShowMeaning((visible) => !visible)} aria-pressed={showMeaning}>Meaning</button>
                      </div>
                    </div>
                    <div className="tutor-chat" role="log" aria-label={`${targetLanguage.name} practice conversation with ${learnerData.settings.tutorName}`} aria-live="polite">
                      <div className="conversation-date"><span>{activeRoleplay ? `ROLEPLAY · ${activeRoleplay.title.toUpperCase()}` : activeFreeChat ? 'FREE CHAT' : 'YOUR CAFÉ CONVERSATION'}</span></div>
                      {tutorMessages.map((message) => (
                        <article className={`conversation-message ${message.role === 'user' ? 'from-user' : 'from-tutor'}`} key={message.id}>
                          {message.role === 'tutor' && <span className="message-avatar"><Icon name="sparkles" size={15} /></span>}
                          <div className="message-content">
                            <span className="message-author">{message.role === 'tutor' ? learnerData.settings.tutorName.toUpperCase() : 'YOU'}</span>
                            <p className="message-text" lang={message.role === 'tutor' ? targetLanguage.locale : undefined}>{message.text.split(/(\s+)/).map((part, partIndex) => /\S/.test(part) ? <button className="transcript-word" type="button" key={`${message.id}-${partIndex}`} onClick={() => saveTranscriptWord(part, message.meaning ?? '', message.id)} title="Save this word for review">{part}</button> : part)}</p>
                            {message.role === 'tutor' && showPinyin && message.pinyin && <p className="message-pinyin">{message.pinyin}</p>}
                            {message.role === 'tutor' && showMeaning && message.meaning && <p className="message-meaning">{message.meaning}</p>}
                            {message.role === 'tutor' && message.note && <div className="message-coach-note"><Icon name="sparkles" size={14} /><span>{message.note}</span></div>}
                            {message.role === 'tutor' && message.corrections && message.corrections.length > 0 && (
                              <section className="tutor-corrections" aria-label="Language corrections">
                                <strong>CORRECTION</strong>
                                {message.corrections.map((correction, index) => (
                                  <p key={`${correction.original}-${index}`}>
                                    <span>{correction.original}</span> → <b>{correction.corrected}</b>
                                <small>{correction.error_type ? `${capitalize(correction.error_type.replaceAll('_', ' '))} · ` : ''}{correction.explanation}</small>
                                  </p>
                                ))}
                              </section>
                            )}
                            {message.role === 'tutor' && message.newWords && message.newWords.length > 0 && (
                              <section className="tutor-new-words" aria-label="New vocabulary">
                                <strong>NEW WORDS · AI-GENERATED</strong>
                                {message.newWords.map((word, index) => (
                                  <p key={`${word.word}-${index}`}><b>{word.word}</b><span>{word.meaning}</span></p>
                                ))}
                              </section>
                            )}
                            {message.role === 'tutor' && message.whiteboardCard && <TutorWhiteboardCard card={message.whiteboardCard} />}
                            {message.role === 'tutor' && message.verification === 'unverified' && <p className="teaching-verification">Unverified guidance · no approved source was available for this turn.</p>}
                            {message.role === 'tutor' && message.sources && message.sources.length > 0 && (
                              <details className="teaching-sources">
                                <summary>Sources · {message.sources.length}</summary>
                                {message.sources.map((source) => <article key={`${source.url}-${source.name}`}><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a><span>{source.licence}</span><small>{source.attribution_text}</small></article>)}
                              </details>
                            )}
                          </div>
                          {message.role === 'tutor' && <button className="icon-button chat-audio" onClick={() => speakWord(message.text, targetLanguage.locale)} aria-label={`Hear this ${targetLanguage.name} message`}><Icon name="volume" size={16} /></button>}
                        </article>
                      ))}
                      {tutorPending && <p className="tutor-thinking" role="status">{learnerData.settings.tutorName} is thinking of a reply…</p>}
                    </div>
                    {!roleplayComplete && <div className="suggested-replies">
                      <span>{activeRoleplay ? 'NEED A NUDGE?' : 'YOU COULD SAY'}</span>
                      {activeRoleplay
                        ? activeRoleplay.usefulPhrases.map((phrase) => (
                          <button key={phrase.text} disabled={tutorPending} onClick={() => void sendTutorMessage(phrase.text)}>{phrase.text} · {phrase.translation}</button>
                        ))
                        : activeFreeChat
                          ? <>
                              <button disabled={tutorPending} onClick={() => void sendTutorMessage('I’d like to talk about my day')}>Talk about my day</button>
                              <button disabled={tutorPending} onClick={() => void sendTutorMessage('Ask me an easy question')}>Ask me a question</button>
                            </>
                        : <>
                            <button disabled={tutorPending} onClick={() => void sendTutorMessage('I’d like a coffee, please')}>I’d like a coffee</button>
                            <button disabled={tutorPending} onClick={() => void sendTutorMessage('How do I ask for milk?')}>Ask for milk</button>
                          </>}
                    </div>}
                    {activeRoleplay && !roleplayComplete && (
                      <div className="roleplay-finish-row">
                        <span>{tutorMessages.filter((message) => message.role === 'user').length} learner turns</span>
                        <button className="button button-outline" type="button" onClick={finishRoleplay} disabled={tutorPending || tutorMessages.every((message) => message.role !== 'user')}>Finish roleplay</button>
                      </div>
                    )}
                    {activeRoleplay && roleplayComplete && (
                      <section className="roleplay-summary" aria-label="Roleplay self-review">
                        <p className="eyebrow">SCENE COMPLETE · YOUR SELF-REVIEW</p>
                        <h3>{activeRoleplay.title}</h3>
                        <p>{activeRoleplay.goal}</p>
                        {activeRoleplay.successCriteria.map((criterion, index) => (
                          <label key={criterion}>
                            <input
                              type="checkbox"
                              checked={roleplayReflection[index] ?? false}
                              onChange={(event) => setRoleplayReflection((current) => current.map((checked, itemIndex) => itemIndex === index ? event.target.checked : checked))}
                            />
                            <span>{criterion}</span>
                          </label>
                        ))}
                        <p className="roleplay-summary-note">This is your reflection, not an AI score. The roleplay does not change your level or progress.</p>
                        <button className="button button-primary" type="button" onClick={() => { beginRoleplay(activeRoleplay, lessonRoleplayActive); setSessionSummary(null) }}>Practise this scene again</button>
                        {lessonRoleplayActive && (
                          <div className="roleplay-next-practice">
                            <p>Next small step: revisit the lesson words while they’re fresh.</p>
                            <button className="button button-outline" type="button" onClick={returnToLessonRecap}>Return to lesson recap</button>
                            <button className="text-button" type="button" onClick={() => { setLessonRoleplayActive(false); setPage('vocabulary') }}>Review lesson words</button>
                          </div>
                        )}
                      </section>
                    )}
                    {tutorError && <div className="tutor-error" role="alert"><span>{tutorError}</span>{tutorRetryHistory && <button onClick={() => void retryTutorMessage()} disabled={tutorPending}>Try again</button>}</div>}
                    <form className="tutor-composer" onSubmit={submitTutorMessage}>
                      <textarea
                        aria-label={`Write a message to ${learnerData.settings.tutorName}`}
                        placeholder={tutorPending ? `${learnerData.settings.tutorName} is thinking…` : `Write anything in ${sourceLanguage.name} or ${targetLanguage.name}…`}
                        rows={2}
                        value={tutorInput}
                        onChange={(event) => setTutorInput(event.target.value)}
                        disabled={tutorPending || roleplayComplete}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            void sendTutorMessage()
                          }
                        }}
                      />
                      <div className="composer-footer"><span>{import.meta.env.DEV ? 'Local AI · may occasionally make mistakes' : 'Cloud AI · may occasionally make mistakes'}</span><button className="send-button" type="submit" disabled={!tutorInput.trim() || tutorPending} aria-label="Send message"><Icon name="arrow" size={18} /></button></div>
                    </form>
                    <p className="tutor-preview-note">{import.meta.env.DEV ? 'Your messages are sent to Ollama running on this computer; no cloud AI service is used by this tutor preview.' : 'Your messages are sent to Cloudflare Workers AI to generate tutor replies.'}</p>
                  </div>
                </details>
                <div className="mobile-lesson-dock" role="group" aria-label="Lesson controls">
                  <button type="button" aria-label={voiceListening || speechReadyToSend ? 'Cancel listening' : 'Help me say it'} title={voiceListening || speechReadyToSend ? 'Cancel listening' : 'Help me say it'} disabled={tutorPending} onClick={voiceListening || speechReadyToSend ? cancelSpeechCapture : requestHelpPhrases}><Icon name={voiceListening || speechReadyToSend ? 'close' : 'translate'} size={20} /></button>
                  <button type="button" aria-label="I don't know" title="I don't know" disabled={tutorPending} onClick={() => void sendTutorMessage('I don’t know. Give me one helpful hint in my target language and a translation.')}><Icon name="sparkles" size={20} /></button>
                  <button type="button" aria-label={`${learnerData.settings.liveTranscript ? 'Turn off' : 'Turn on'} captions`} title={`${learnerData.settings.liveTranscript ? 'Turn off' : 'Turn on'} captions`} aria-pressed={learnerData.settings.liveTranscript} onClick={() => updateLearnerSettings({ liveTranscript: !learnerData.settings.liveTranscript })}><Icon name="captions" size={20} /></button>
                  <button type="button" aria-label="Type instead" title="Type instead" onClick={focusTutorTextInput}><Icon name="keyboard" size={20} /></button>
                  <button className="mobile-lesson-exit" type="button" aria-label="End lesson" title="End lesson" disabled={tutorPending} onClick={endTutorSession}><Icon name="close" size={20} /></button>
                </div>
              </section>
            </div>
          </div>
        )}

        {page === 'vocabulary' && (
          ReviewDeck ? (
            <Suspense fallback={<div className="page-content">Opening your review deck...</div>}>
              <ReviewDeck targetLanguageCode={targetCode} />
            </Suspense>
          ) : null
        )}

        {page === 'progress' && (
          <div className="page-content subpage-content">
            <div className="subpage-intro"><p className="eyebrow">YOUR PRACTICE, ON THIS DEVICE</p><h1>Little steps count.</h1><p>Learning records stay in this browser and can be reset by clearing site data.</p></div>
            {learningSnapshot.error && <p className="review-error" role="alert">{learningSnapshot.error}</p>}
            {learnerData.error && <p className="review-error" role="alert">{learnerData.error}</p>}
            <section className="progress-summary">
              <article className="progress-stat"><span className="stat-icon stat-icon-peach"><Icon name="clock" size={18} /></span><span className="stat-label">PRACTICE TIME · LAST 90 DAYS</span><strong>{formatPracticeTime(learningSummary.activitySeconds)}</strong><span className="stat-note">{learningSummary.lessonsCompleted} lesson{learningSummary.lessonsCompleted === 1 ? '' : 's'} completed</span></article>
              <article className="progress-stat"><span className="stat-icon stat-icon-lavender"><Icon name="book" size={18} /></span><span className="stat-label">WORDS IN YOUR DECK</span><strong>{learningSnapshot.words}</strong><span className="stat-note">{learningSnapshot.masteredWords} mastered · {learningSnapshot.dueWords} due</span></article>
              <article className="progress-stat"><span className="stat-icon stat-icon-mint"><Icon name="chart" size={18} /></span><span className="stat-label">CURRENT STREAK</span><strong>{learningSummary.currentStreak} <small>days</small></strong><span className="stat-note">Best: {learningSummary.bestStreak} days in the last 90 days</span></article>
            </section>
            <section className="panel daily-goal-progress-panel" aria-label="Today's practice goal">
              <div className="section-heading"><div><p className="eyebrow">TODAY</p><h3>{Math.floor(learningSummary.todaySeconds / 60) >= learnerData.settings.dailyGoalMinutes ? 'Goal reached' : 'Daily practice goal'}</h3></div><span className="level-chip">{Math.floor(learningSummary.todaySeconds / 60)} total min</span></div>
              <div className="plan-progress" role="progressbar" aria-label="Daily practice goal" aria-valuemin={0} aria-valuemax={learnerData.settings.dailyGoalMinutes} aria-valuenow={Math.min(learnerData.settings.dailyGoalMinutes, Math.floor(learningSummary.todaySeconds / 60))}><span style={{ width: `${Math.min(100, learningSummary.todaySeconds / (learnerData.settings.dailyGoalMinutes * 60) * 100)}%` }} /></div>
              <p>{Math.floor(learningSummary.todaySeconds / 60)} / {learnerData.settings.dailyGoalMinutes} min · {learningSummary.week.filter((day) => day.seconds > 0).length}/7 practice days this week</p>
            </section>
            <section className="panel progress-panel">
              <div className="section-heading"><div><p className="eyebrow">A STEADY RHYTHM</p><h3>Your weekly practice</h3></div><span className="level-chip">{Math.round(learningSummary.weekSeconds / 60)} MIN THIS WEEK</span></div>
              <div className="bar-chart" aria-label="Practice time by day this week">
                {learningSummary.week.map((day) => {
                  const maxSeconds = Math.max(60, ...learningSummary.week.map((entry) => entry.seconds))
                  const height = day.seconds ? Math.max(4, Math.round(day.seconds / maxSeconds * 100)) : 0
                  return <div className="chart-column" key={day.key} title={`${day.seconds} seconds`}><div className="chart-track"><span className={`chart-fill ${day.seconds ? '' : 'future'}`} style={{ height: `${height}%` }} /></div><span>{day.label}</span></div>
                })}
              </div>
              <div className="chart-foot"><span>Daily goal: {learnerData.settings.dailyGoalMinutes} min. Only time with a learning activity open while the page is visible is counted.</span></div>
            </section>
            <section className="panel progress-detail-panel">
              <div className="section-heading"><div><p className="eyebrow">BUILDING YOUR FOUNDATION</p><h3>Objective practice · {targetLanguage.name}</h3></div></div>
              {learningSummary.objectives.length === 0
                ? <p className="progress-empty">Complete code-checked lesson exercises to see objective progress here.</p>
                : <div className="progress-objectives">{learningSummary.objectives.map((objective) => (
                  <article className="objective-progress" key={objective.id}>
                    <div className="objective-progress-heading"><strong>{formatObjectiveName(objective.id)}</strong><span>{objective.mastery}% across {objective.attempts} attempt{objective.attempts === 1 ? '' : 's'}</span></div>
                    <div className="objective-progress-track"><span style={{ width: `${objective.mastery}%` }} /></div>
                    <small>{objective.recommendation === 'ready' ? 'Three strong results in a row — ready for a new challenge.' : objective.recommendation === 'revisit' ? 'Let’s slow down and practise this again.' : 'Keep practising to build a reliable picture.'}</small>
                  </article>
                ))}</div>}
            </section>
            <section className="panel progress-detail-panel">
              <div className="section-heading"><div><p className="eyebrow">YOUR LEARNING MIX</p><h3>Skills · {targetLanguage.name}</h3></div></div>
              <div className="progress-skills">{learningSummary.skills.map((skill) => (
                <div className="skill-progress" key={skill.id}><div><span>{capitalize(skill.id)}</span><small>{skill.attempts ? `${skill.mastery}% · ${skill.attempts} attempts` : 'No attempts yet'}</small></div><div className="objective-progress-track"><span style={{ width: `${skill.mastery}%` }} /></div></div>
              ))}</div>
            </section>
            <section className="panel progress-detail-panel">
              <div className="section-heading"><div><p className="eyebrow">WHAT TO REVISIT</p><h3>Practice suggestions · {targetLanguage.name}</h3></div></div>
              {learningSummary.topErrors.length === 0
                ? <p className="progress-empty">No exercise retry patterns recorded yet. Your first attempts will help personalize this list.</p>
                : <ul className="progress-error-list">{learningSummary.topErrors.map((error) => <li key={error.id}><span>Practise {formatObjectiveName(error.id)}</span><strong>{error.count} retry{error.count === 1 ? '' : 's'}</strong></li>)}</ul>}
            </section>
            <section className="panel progress-detail-panel">
              <div className="section-heading"><div><p className="eyebrow">YOUR SAVED CONVERSATIONS</p><h3>History</h3></div><span className="level-chip">{learnerData.history.length} SAVED</span></div>
              {learnerData.history.length === 0
                ? <p className="progress-empty">{learnerData.settings.transcriptSaving ? 'Your next tutor conversation will appear here. Only text transcripts are stored; audio is never included.' : 'Conversation history is off. Turn it on in Settings if you want Ari to save future text transcripts.'}</p>
                : <div className="history-list">
                    {!learnerData.settings.transcriptSaving && <p className="progress-empty">Saving is now off; these previously saved transcripts remain until you delete them.</p>}
                    {learnerData.history.map((session) => (
                    <details className="history-session" key={session.id}>
                      <summary><span>{new Date(session.updatedAt).toLocaleString()}</span><span>{session.messages.length} messages</span></summary>
                      <div className="history-transcript">{session.messages.map((message, index) => <p className={`history-message is-${message.role}`} key={`${session.id}-${index}`}><strong>{message.role === 'user' ? 'YOU' : learnerData.settings.tutorName.toUpperCase()}</strong>{message.text}</p>)}</div>
                      <button className="exercise-text-action" type="button" onClick={() => removeTutorHistory(session.id)}>Delete this conversation</button>
                    </details>
                    ))}
                  </div>}
            </section>
          </div>
        )}

        {page === 'settings' && (
          <div className="page-content subpage-content">
            <div className="subpage-intro"><p className="eyebrow">MAKE THIS SPACE YOURS</p><h1>Your settings.</h1><p>A few ways to make learning feel like you.</p></div>
            {learnerData.error && <p className="review-error" role="alert">{learnerData.error}</p>}
            <section className="settings-card">
              <div className="setting-row"><span><strong>Your name</strong><small>What your tutor should call you</small></span><label className="settings-select"><input aria-label="Your name" maxLength={60} value={displayNameDraft} onChange={(event) => setDisplayNameDraft(event.target.value)} onBlur={() => { if (displayNameDraft !== learnerData.settings.displayName) updateLearnerSettings({ displayName: displayNameDraft }) }} placeholder="Your name" /></label></div>
              <div className="setting-row"><span><strong>I speak</strong><small>Choose the language for explanations</small></span><label className="settings-select"><select aria-label="Language you speak" value={sourceCode} onChange={(event) => { const code = event.target.value; if (updateLearnerSettings({ nativeLanguageCode: code })) setSourceCode(code) }}>{languages.map((language) => <option key={language.code} value={language.code}>{language.flag} {language.name}</option>)}</select><Icon name="chevron" size={16} /></label></div>
              <div className="setting-row"><span><strong>I'm learning</strong><small>Choose the language you want to practise</small></span><label className="settings-select"><select aria-label="Language you are learning" value={targetCode} disabled={tutorPending} onChange={(event) => changeLearningLanguage(event.target.value)}>{languages.map((language) => <option key={language.code} value={language.code}>{language.flag} {language.name}</option>)}</select><Icon name="chevron" size={16} /></label></div>
              {targetCode === 'fr' && <p className="roleplay-content-note">French free chat is available in Explore. AI-generated French has not yet been reviewed by a native speaker.</p>}
              <div className="setting-row"><span><strong>My level</strong><small>Self-reported starting point</small></span><span className="level-chip">{learnerData.settings.level}</span></div>
              <div className="setting-row"><span><strong>Daily practice goal</strong><small>Choose a gentle target that works for you</small></span><label className="settings-select"><select aria-label="Daily practice goal in minutes" value={learnerData.settings.dailyGoalMinutes} onChange={(event) => updateLearnerSettings({ dailyGoalMinutes: Number(event.target.value) })}>{[5, 10, 15, 20, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select><Icon name="chevron" size={16} /></label></div>
              <div className="setting-row"><span><strong>Practice time</strong><small>Your preferred time of day</small></span><label className="settings-select"><select aria-label="Preferred time of day" value={learnerData.settings.practiceTimeOfDay} onChange={(event) => updateLearnerSettings({ practiceTimeOfDay: event.target.value })}><option value="">Not set</option>{['Morning', 'Afternoon', 'Evening', 'Flexible'].map((time) => <option key={time} value={time}>{time}</option>)}</select><Icon name="chevron" size={16} /></label></div>
              <div className="setting-row"><span><strong>Appearance</strong><small>Choose a light or dark app theme</small></span><button className="settings-theme-switch" onClick={() => changeTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={16} /><span>{theme === 'light' ? 'Light mode' : 'Dark mode'}</span><span className={`theme-toggle-track ${theme === 'dark' ? 'is-dark' : ''}`}><span /></span></button></div>
              <div className="setting-row"><span><strong>Reminder preference</strong><small>Notifications are not scheduled yet</small></span><label className="settings-theme-switch"><span>{learnerData.settings.reminderEnabled ? 'On' : 'Off'}</span><input type="checkbox" aria-label="Save a daily reminder preference" checked={learnerData.settings.reminderEnabled} onChange={(event) => updateLearnerSettings({ reminderEnabled: event.target.checked })} /></label></div>
            </section>
            <section className="settings-card speech-settings-card">
              <div className="settings-section-intro"><p className="eyebrow">TUTOR & VOICE</p><h3>Make your tutor yours</h3><p>{learnerData.settings.tutorName} uses a {tutorVoiceGender}-sounding voice. Voice flavour selection is best-effort and depends on voices available on this device.</p></div>
              <div className="setting-row"><span><strong>Tutor voice</strong><small>Ari uses a male voice; Ira uses a female voice</small></span><span className="level-chip">{learnerData.settings.tutorName} · {tutorVoiceGender}</span></div>
              <div className="speech-gender-choices" role="group" aria-label="Choose tutor and voice gender">
                {([
                  { tutor: 'Ari' as const, gender: 'male', label: 'Male · Ari' },
                  { tutor: 'Ira' as const, gender: 'female', label: 'Female · Ira' },
                ]).map(({ tutor, gender, label }) => (
                  <div className="speech-gender-choice" key={gender}>
                    <button
                      className={`speech-gender-option ${learnerData.settings.tutorName === tutor ? 'is-selected' : ''}`}
                      type="button"
                      aria-pressed={learnerData.settings.tutorName === tutor}
                      onClick={() => changeTutorName(tutor)}
                    >
                      {label}
                    </button>
                    <button
                      className="speech-gender-preview"
                      type="button"
                      disabled={previewingTutorVoice !== null}
                      aria-label={`Preview ${tutor}'s ${gender} voice`}
                      onClick={() => void previewTutorVoice(tutor === 'Ari' ? 'Playful' : 'Airy', tutor)}
                    >
                      <Icon name="volume" size={15} />
                      {previewingTutorVoice === tutor ? 'Playing…' : 'Preview voice'}
                    </button>
                  </div>
                ))}
              </div>
              <div className="tutor-style-setting-row">
                <span><strong>Tutor style</strong><small>Synced across Home and every practice area</small></span>
                <div className="settings-tutor-style-choices" role="group" aria-label="Choose your tutor style in Settings">
                  {(['soft', 'balanced', 'strict'] as const).map((style) => (
                    <button
                      key={style}
                      className={`settings-tutor-style-choice mode-${style}`}
                      type="button"
                      aria-pressed={learnerData.settings.tutorMode === style}
                      onClick={() => updateLearnerSettings({ tutorMode: style })}
                    >
                      <span className="settings-tutor-style-swatch" aria-hidden="true" />
                      {capitalize(style)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setting-row"><span><strong>Tutor personality</strong><small>Preferred response style</small></span><label className="settings-select"><select aria-label="Tutor personality" value={learnerData.settings.personality} onChange={(event) => updateLearnerSettings({ personality: event.target.value })}>{['Friendly', 'Cheerful', 'Witty', 'Formal', 'Motivational', 'Short answers', 'Detailed explanations'].map((style) => <option key={style}>{style}</option>)}</select><Icon name="chevron" size={16} /></label></div>
              <div className="setting-row"><span><strong>Voice flavour</strong><small>{learnerData.settings.tutorName === 'Ari' ? 'Playful, Deep, Bold, or Calm' : 'Warm, Lively, Clear, or Airy'}</small></span><label className="settings-select"><select aria-label="Voice flavour" value={speechPreferences.flavor} onChange={(event) => updateSpeechPreferences({ flavor: event.target.value })}>{(learnerData.settings.tutorName === 'Ari' ? ['Playful', 'Deep', 'Bold', 'Calm'] : ['Warm', 'Lively', 'Clear', 'Airy']).map((flavor) => <option key={flavor}>{flavor}</option>)}</select><Icon name="chevron" size={16} /></label></div>
              <div className="voice-flavor-preview-list">
                {(learnerData.settings.tutorName === 'Ari' ? ['Playful', 'Deep', 'Bold', 'Calm'] : ['Warm', 'Lively', 'Clear', 'Airy']).map((flavor) => <button className="button button-outline" type="button" key={flavor} onClick={() => { updateSpeechPreferences({ flavor }); void previewTutorVoice(flavor) }}>Play {flavor} sample</button>)}
              </div>
              <label className="learner-setting-field voice-speed-setting"><span>Speech speed · {speechPreferences.rate.toFixed(2)}×</span><input aria-label="Speech speed" type="range" min="0.75" max="1.25" step="0.05" value={speechPreferences.rate} onChange={(event) => updateSpeechPreferences({ rate: Number(event.target.value) })} /></label>
              <div className="voice-test-actions"><button className="button button-outline" type="button" onClick={() => void testMicrophone()}>Test microphone</button><button className="button button-outline" type="button" onClick={() => void previewTutorVoice()}>Test speaker</button></div>
              <div className="setting-row transcript-setting"><span><strong>Live transcript by default</strong><small>Show target-language captions, translations, and learner speech during sessions</small></span><button className="settings-theme-switch" type="button" aria-pressed={learnerData.settings.liveTranscript} onClick={() => updateLearnerSettings({ liveTranscript: !learnerData.settings.liveTranscript })}><span>{learnerData.settings.liveTranscript ? 'On' : 'Off'}</span><span className={`theme-toggle-track ${learnerData.settings.liveTranscript ? 'is-dark' : ''}`}><span /></span></button></div>
              <p className="speech-settings-note" role={speechPreferenceState.error ? 'alert' : 'status'}>
                {speechPreferenceState.error || 'Ari is male-voiced and Ira is female-voiced across practice. Speech speed and voice flavour are best-effort; if the local speech service is unavailable, browser playback requires a detectable matching gender and will not silently choose a mismatched voice.'}
              </p>
              {voiceError && <p className="voice-error" role="alert">{voiceError}</p>}
            </section>
            <section className="settings-card placement-card">
              <div className="settings-section-intro"><p className="eyebrow">START HERE · OPTIONAL</p><h3>Find your starting point</h3><p>Set your learning language and daily goal above, then try a short check to find a comfortable place to begin.</p></div>
              {targetCode !== 'zh'
                ? <p className="placement-note">A placement check is not available for {targetLanguage.name} yet. You can still choose your daily goal and continue exploring Ariira.</p>
                : <>
                    <p className="placement-note">This six-question check uses Ari’s small, unreviewed Mandarin A1 sample. It can suggest what to practise first; it is not a validated level test and does not change your level or progress.</p>
                    <div className="placement-questions">
                      {PLACEMENT_QUESTIONS.map((question, index) => (
                        <fieldset className="placement-question" key={question.id}>
                          <legend>{index + 1}. {question.prompt}</legend>
                          {question.options.map((option) => (
                            <label key={option}>
                              <input
                                type="radio"
                                name={`placement-${question.id}`}
                                value={option}
                                checked={placementAnswers[index] === option}
                                onChange={() => {
                                  setPlacementAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? option : answer))
                                  setPlacementResult(null)
                                }}
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                        </fieldset>
                      ))}
                    </div>
                    <div className="placement-actions">
                      <button className="button button-primary" type="button" disabled={placementAnswers.some((answer) => !answer)} onClick={() => setPlacementResult(evaluatePlacementCheck(placementAnswers))}>See my suggestion</button>
                      <button className="exercise-text-action" type="button" onClick={() => { setPlacementAnswers(PLACEMENT_QUESTIONS.map(() => '')); setPlacementResult(null) }}>Start again</button>
                    </div>
                    {placementResult && <p className="placement-result" role="status"><strong>{placementResult.correct} of {placementResult.total} correct.</strong> {placementResult.recommendation} Your saved progress and level are unchanged.</p>}
                  </>}
            </section>
            <section className="settings-card learner-personalisation">
              <div className="settings-section-intro"><p className="eyebrow">HELP {learnerData.settings.tutorName.toUpperCase()} PERSONALISE PRACTICE</p><h3>Your goals and interests</h3><p>These notes stay on this device and may be included in your local tutor prompt.</p></div>
              <label className="learner-setting-field"><span>My learning goal</span><textarea maxLength={240} rows={2} value={learnerData.settings.goals} onChange={(event) => updateLearnerSettings({ goals: event.target.value })} placeholder="For example: feel confident ordering food while travelling" /></label>
              <label className="learner-setting-field"><span>Topics I enjoy</span><textarea maxLength={240} rows={2} value={learnerData.settings.interests} onChange={(event) => updateLearnerSettings({ interests: event.target.value })} placeholder="For example: cooking, music, and travel" /></label>
              <div className="memory-editor"><div><strong>Things {learnerData.settings.tutorName} may remember</strong><small>Add short facts that help personalise examples. Avoid sensitive personal information.</small></div>
                {learnerData.settings.memory.length > 0 && <ul className="memory-list">{learnerData.settings.memory.map((item) => <li key={item}><span>{item}</span><button type="button" className="exercise-text-action" onClick={() => removeMemoryItem(item)} aria-label={`Delete memory: ${item}`}>Delete</button></li>)}</ul>}
                <form className="memory-add-form" onSubmit={addMemoryItem}><input maxLength={160} value={memoryInput} onChange={(event) => setMemoryInput(event.target.value)} placeholder="Add a personalisation note…" aria-label="New learner memory note" /><button className="button button-outline" type="submit" disabled={!memoryInput.trim() || learnerData.settings.memory.length >= 12}>Add note</button></form>
              </div>
              <div className="setting-row transcript-setting"><span><strong>Save tutor text history</strong><small>Off by default. When on, future typed and transcribed tutor conversations are stored on this device. Audio is never saved.</small></span><button className="settings-theme-switch" type="button" aria-pressed={learnerData.settings.transcriptSaving} onClick={() => updateLearnerSettings({ transcriptSaving: !learnerData.settings.transcriptSaving })}><span>{learnerData.settings.transcriptSaving ? 'On' : 'Off'}</span><span className={`theme-toggle-track ${learnerData.settings.transcriptSaving ? 'is-dark' : ''}`}><span /></span></button></div>
            </section>
            <section className="settings-card data-controls">
              <div className="settings-section-intro"><p className="eyebrow">YOUR DATA</p><h3>Export or delete</h3><p>Export downloads Ari data in this browser as JSON. Delete permanently removes Ari-owned local data from this browser, including lesson progress, vocabulary, settings, and saved transcripts.</p></div>
              {dataMessage && <p className="data-status" role="status">{dataMessage}</p>}
              <div className="data-action-row"><button className="button button-outline" type="button" onClick={exportAriData}>Export my Ari data</button><button className="button button-danger-outline" type="button" onClick={deleteAllAriData}>Delete all Ari data</button></div>
            </section>
            {import.meta.env.DEV && <KnowledgeAdmin />}
          </div>
        )}
        <nav className="mobile-bottom-nav" aria-label="Quick navigation">
          {([
            { id: 'home' as const, label: 'Home', icon: 'home' as const },
            { id: 'lesson' as const, label: 'Explore', icon: 'book' as const },
            { id: 'vocabulary' as const, label: 'Saved words', icon: 'sparkles' as const },
            { id: 'progress' as const, label: 'Progress', icon: 'chart' as const },
          ]).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`mobile-nav-item ${page === item.id ? 'is-active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => item.id === 'lesson' ? openExplore() : setPage(item.id)}
            >
              <span className="mobile-nav-icon"><Icon name={item.icon} size={19} />{item.id === 'vocabulary' && learningSnapshot.dueWords > 0 && <span className="mobile-nav-badge">{learningSnapshot.dueWords}</span>}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </main>
      {page !== 'home' && (
        <button
          type="button"
          className={`floating-tutor-bubble ${liveSession && !voiceConversation ? 'is-paused' : liveSession ? 'is-active' : 'is-idle'} ${liveSession && !tutorPending && !voiceSpeaking && !voiceListening ? 'is-waiting' : ''}`}
          aria-label={`Return to your tutor, ${learnerData.settings.tutorName}`}
          title={`Return to ${learnerData.settings.tutorName}`}
          onClick={() => {
            setPage('home')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          <TutorAvatar mode={liveSession ? voiceMode : 'idle'} tutor={learnerData.settings.tutorName} audioLevel={voiceSpeaking ? voiceAudioLevel : 0} microphoneLevel={microphoneLevel} reaction={tutorReaction} />
          {liveSession && <span className="floating-tutor-status" aria-hidden="true">{voiceConversation ? '' : 'Ⅱ'}</span>}
        </button>
      )}
      {onboardingOpen && (
        <div className="onboarding-modal-overlay">
          <div className="onboarding-modal" role="dialog" aria-modal="true" aria-label="Complete your learner profile">
            <OnboardingFlow
              initialTargetCode={learnerData.settings.targetLanguageCode}
              initialNativeCode={learnerData.settings.nativeLanguageCode}
              onComplete={(settings) => {
                if (!updateLearnerSettings(settings)) return
                setDisplayNameDraft(settings.displayName ?? '')
                const nextTarget = settings.targetLanguageCode ?? targetCode
                const nextNative = settings.nativeLanguageCode ?? sourceCode
                setTargetCode(nextTarget)
                setSourceCode(nextNative)
                updateSpeechPreferences({ gender: getTutorSpeechGender(settings.tutorName ?? 'Ira') })
                setPage('home')
                setOnboardingOpen(false)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
