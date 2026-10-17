import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { LANGUAGES, type LanguageOption } from './language-options.js'
import { getTutorSpeechGender } from './speech-options.js'
import { playSpeechAudio } from './speech-playback.js'
import { TutorService } from './tutor-service.js'
import type { LearnerSettings } from './learner-data.js'
import './OnboardingFlow.css'

type Draft = {
  targetCode: string
  nativeCode: string
  age: string
  reason: string
  timeline: string
  level: string
  placementText: string
  placementReply: string
  mood: string
  mode: LearnerSettings['tutorMode']
  pronunciation: string
  hobbies: string[]
  roleplay: string[]
  planStyle: string
  dailyGoal: number
  timeOfDay: string
  reminder: boolean
  displayName: string
  tutor: LearnerSettings['tutorName']
}

const INITIAL_DRAFT: Draft = {
  targetCode: 'fr', nativeCode: 'en', age: '', reason: '', timeline: '', level: '',
  placementText: '', placementReply: '', mood: '', mode: 'balanced', pronunciation: '',
  hobbies: [], roleplay: [], planStyle: '', dailyGoal: 15, timeOfDay: '', reminder: false,
  displayName: '', tutor: 'Ira',
}

const STEPS = [
  { id: 'targetCode', title: 'What would you like to learn?', note: 'Choose a language. You can change it later.' },
  { id: 'nativeCode', title: 'What language feels most natural to you?', note: 'Your tutor uses this for helpful explanations.' },
  { id: 'age', title: 'Which age group are you in?', note: 'This helps us keep examples relevant.' },
  { id: 'reason', title: 'What brings you here?', note: 'Choose the goal that matters most right now.' },
  { id: 'timeline', title: 'When would you like to feel progress?', note: 'There is no wrong pace.' },
  { id: 'level', title: 'Can you hold a 5-minute conversation on a familiar topic?', note: 'A starting estimate only. You can change it as you practise.' },
  { id: 'placementText', title: 'Let’s have a short placement chat.', note: 'Answer in your learning language if you can. Your tutor will reply; this is not a scored exam.' },
  { id: 'mood', title: 'How do you feel about speaking with an AI tutor?', note: 'We will make the first conversation comfortable.' },
  { id: 'mode', title: 'How would you like feedback?', note: 'Your choice sets the coaching style and app accent.' },
  { id: 'pronunciation', title: 'What is your pronunciation goal?', note: 'We focus on useful, understandable speaking.' },
  { id: 'hobbies', title: 'What do you enjoy?', note: 'Pick a few interests for more personal examples.' },
  { id: 'roleplay', title: 'What situations should we practise?', note: 'Choose any that sound useful.' },
  { id: 'planStyle', title: 'How would you like to learn?', note: 'You can switch between them whenever you like.' },
  { id: 'dailyGoal', title: 'How much time feels realistic each day?', note: 'A small daily habit adds up.' },
  { id: 'timeOfDay', title: 'When do you usually have a moment?', note: 'Reminders are optional and stay on this device.' },
  { id: 'displayName', title: 'What should your tutor call you?', note: 'Then make a small commitment to yourself.' },
  { id: 'plan', title: 'Your personal practice plan', note: 'A starting point built from the preferences you shared.' },
  { id: 'tutor', title: 'Choose your tutor', note: 'Preview a voice, then head to your Home screen.' },
] as const

const ageOptions = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55+']
const reasonOptions = ['Travel', 'Career', 'Study abroad', 'Living abroad', 'Personal growth', 'Entertainment', 'Family', 'Dating']
const timelineOptions = ['1 month', '2–3 months', '6 months', '1 year', 'No rush']
const levelOptions: Array<{ value: LearnerSettings['level']; label: string; detail: string }> = [
  { value: 'A0', label: 'Not yet', detail: 'I’m starting from the beginning.' },
  { value: 'A1', label: 'A little', detail: 'I can use a few simple phrases.' },
  { value: 'A2', label: 'Somewhat', detail: 'I can manage simple familiar chats.' },
  { value: 'B1', label: 'Yes, mostly', detail: 'I can keep a familiar conversation going.' },
]
const moodOptions = ['Excited', 'Curious', 'A little cautious', 'Not sure yet']
const styleOptions: Array<{ id: Draft['mode']; label: string; copy: string }> = [
  { id: 'soft', label: 'Soft', copy: 'Warm support and gentle hints.' },
  { id: 'balanced', label: 'Balanced', copy: 'Kind encouragement and useful corrections.' },
  { id: 'strict', label: 'Strict', copy: 'Precise, faster-paced practice.' },
]
const pronunciationOptions = ['Clear and understandable', 'Work toward a native-like sound']
const hobbyOptions = ['Food', 'Music', 'Travel', 'Movies', 'Sports', 'Books', 'Art', 'Technology', 'Nature', 'Gaming']
const roleplayOptions = ['Everyday life', 'Travel', 'Work and career', 'Study', 'Romance and dating', 'Fun and games']
const planOptions = ['Casual conversation', 'A structured learning plan']
const times = ['Morning', 'Afternoon', 'Evening', 'Flexible']
const dailyGoals = [5, 10, 15, 30, 40, 60]
const stepsBeforePlan = 16

function languageByCode(code: string): LanguageOption {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0]
}

function ChoiceGrid({ values, selected, onSelect }: { values: Array<{ value: string; label: string; detail?: string }>; selected: string; onSelect: (value: string) => void }) {
  return (
    <div className="onboarding-choice-grid">
      {values.map((item) => (
        <button key={item.value} type="button" className={`onboarding-choice ${selected === item.value ? 'is-selected' : ''}`} aria-pressed={selected === item.value} onClick={() => onSelect(item.value)}>
          <span>{item.label}</span>{item.detail && <small>{item.detail}</small>}
        </button>
      ))}
    </div>
  )
}

export default function OnboardingFlow({ initialTargetCode, initialNativeCode, onComplete }: {
  initialTargetCode: string
  initialNativeCode: string
  onComplete: (settings: Partial<LearnerSettings>) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...INITIAL_DRAFT, targetCode: initialTargetCode, nativeCode: initialNativeCode }))
  const [step, setStep] = useState(0)
  const [languageSearch, setLanguageSearch] = useState('')
  const [placementPending, setPlacementPending] = useState(false)
  const [placementError, setPlacementError] = useState('')
  const [placementSkipped, setPlacementSkipped] = useState(false)
  const [previewingTutor, setPreviewingTutor] = useState<'Ari' | 'Ira' | null>(null)
  const [voicePreviewError, setVoicePreviewError] = useState('')
  const [commitProgress, setCommitProgress] = useState(0)
  const [commitComplete, setCommitComplete] = useState(false)
  const [planProgress, setPlanProgress] = useState(0)
  const [planReady, setPlanReady] = useState(false)
  const commitTimerRef = useRef<number | null>(null)
  const commitIntervalRef = useRef<number | null>(null)
  const commitStartRef = useRef(0)

  const targetLanguage = languageByCode(draft.targetCode)
  const nativeLanguage = languageByCode(draft.nativeCode)
  const visibleLanguages = useMemo(() => LANGUAGES.filter((language) =>
    `${language.name} ${language.code}`.toLowerCase().includes(languageSearch.trim().toLowerCase()),
  ), [languageSearch])

  useEffect(() => {
    if (step !== 16 || planReady) return
    const started = Date.now()
    const timer = window.setInterval(() => {
      const progress = Math.min(100, Math.round((Date.now() - started) / 20))
      setPlanProgress(progress)
      if (progress >= 100) {
        window.clearInterval(timer)
        setPlanReady(true)
      }
    }, 40)
    return () => window.clearInterval(timer)
  }, [planReady, step])

  useEffect(() => () => {
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current)
    if (commitIntervalRef.current !== null) window.clearInterval(commitIntervalRef.current)
  }, [])

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function toggleMulti(key: 'hobbies' | 'roleplay', value: string) {
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value],
    }))
  }

  function selectedForCurrentStep() {
    const id = STEPS[step]?.id
    if (!id) return false
    if (id === 'targetCode') return Boolean(draft.targetCode)
    if (id === 'nativeCode') return Boolean(draft.nativeCode)
    if (id === 'hobbies') return draft.hobbies.length > 0
    if (id === 'roleplay') return draft.roleplay.length > 0
    if (id === 'dailyGoal') return draft.dailyGoal > 0
    if (id === 'placementText') return Boolean(draft.placementReply || placementSkipped)
    if (id === 'plan') return planReady
    if (id === 'tutor') return Boolean(draft.tutor)
    return Boolean(draft[id as keyof Draft])
  }

  function moveNext() {
    if (!selectedForCurrentStep()) return
    if (step === 16) {
      setStep(17)
      return
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  function stopCommit() {
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current)
    if (commitIntervalRef.current !== null) window.clearInterval(commitIntervalRef.current)
    commitTimerRef.current = null
    commitIntervalRef.current = null
    setCommitProgress(0)
  }

  function startCommit(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    if (!draft.displayName.trim()) return
    stopCommit()
    commitStartRef.current = Date.now()
    commitIntervalRef.current = window.setInterval(() => {
      setCommitProgress(Math.min(100, ((Date.now() - commitStartRef.current) / 1200) * 100))
    }, 25)
    commitTimerRef.current = window.setTimeout(() => {
      stopCommit()
      setCommitComplete(true)
      setStep(16)
    }, 1200)
  }

  async function sendPlacementMessage() {
    const text = draft.placementText.trim()
    if (!text || placementPending) return
    setPlacementPending(true)
    setPlacementError('')
    setPlacementSkipped(false)
    try {
      const service = new TutorService()
      await service.startSession({
        language: targetLanguage.name,
        languageCode: targetLanguage.code,
        nativeLanguage: nativeLanguage.name,
        level: levelOptions.find(({ value }) => value === draft.level)?.value ?? 'A1',
        lessonOrRoleplay: { kind: 'lesson', title: 'A quick getting-to-know-you conversation' },
        tutor: draft.tutor,
        mode: draft.mode,
        interests: [],
      })
      await service.sendUserTurn(text)
      const turn = await service.getTutorTurn()
      await service.endSession()
      update('placementReply', turn.reply)
    } catch (error) {
      setPlacementError(error instanceof Error ? error.message : 'The tutor could not reply. Check that the local tutor is running, then retry.')
    } finally {
      setPlacementPending(false)
    }
  }

  async function previewTutor(tutor: 'Ari' | 'Ira') {
    setVoicePreviewError('')
    setPreviewingTutor(tutor)
    const preview = targetLanguage.code === 'fr'
      ? `Bonjour, je m'appelle ${tutor}. Prêt à pratiquer ensemble ?`
      : targetLanguage.code === 'zh'
        ? `你好，我是${tutor}。我们一起练习吧。`
        : `Hi, I’m ${tutor}. Ready to practise together?`
    try {
      await playSpeechAudio(preview, targetLanguage.locale, getTutorSpeechGender(tutor), globalThis, {
        flavor: tutor === 'Ari' ? 'Playful' : 'Airy',
        rate: 1,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setVoicePreviewError(error instanceof Error ? error.message : 'Could not preview this tutor voice.')
    } finally {
      setPreviewingTutor(null)
    }
  }

  function finish() {
    onComplete({
      onboardingComplete: true,
      displayName: draft.displayName.trim(),
      ageRange: draft.age,
      progressTimeline: draft.timeline,
      aiTutorComfort: draft.mood,
      pronunciationGoal: draft.pronunciation,
      learningPlanStyle: draft.planStyle,
      practiceTimeOfDay: draft.timeOfDay,
      reminderEnabled: draft.reminder,
      nativeLanguageCode: draft.nativeCode,
      targetLanguageCode: draft.targetCode,
      tutorName: draft.tutor,
      tutorMode: draft.mode,
      level: levelOptions.find(({ value }) => value === draft.level)?.value ?? 'A1',
      dailyGoalMinutes: draft.dailyGoal,
      goals: `${draft.reason}; progress horizon: ${draft.timeline}; ${draft.planStyle}`,
      interests: [...draft.hobbies, ...draft.roleplay.map((item) => `Roleplay: ${item}`)].join(', '),
    })
  }

  const current = STEPS[step]
  const progress = step < stepsBeforePlan ? ((step + 1) / STEPS.length) * 100 : step === 17 ? 100 : 94

  return (
    <main className="onboarding-flow" data-step={current.id} aria-labelledby="onboarding-question">
      <div className="onboarding-flow-header">
        <button className="onboarding-back" type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || step === 16} aria-label="Go back">‹</button>
        <div className="onboarding-progress-track" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: `${progress}%` }} /></div>
        <span>{Math.min(step + 1, STEPS.length)}/{STEPS.length}</span>
      </div>

      <section className="onboarding-flow-card">
        <p className="eyebrow">ARI & IRA · YOUR SPEAKING JOURNEY</p>
        <h1 id="onboarding-question">{current.title}</h1>
        <p className="onboarding-step-note">{current.note}</p>

        {(current.id === 'targetCode' || current.id === 'nativeCode') && (
          <>
            <label className="onboarding-search-label" htmlFor="onboarding-language-search">Search languages</label>
            <input id="onboarding-language-search" className="onboarding-search" value={languageSearch} onChange={(event) => setLanguageSearch(event.target.value)} placeholder="Type a language…" />
            <div className="onboarding-language-grid" role="radiogroup" aria-label={current.id === 'targetCode' ? 'Learning language' : 'Native language'}>
              {visibleLanguages.map((language) => {
                const selected = current.id === 'targetCode' ? draft.targetCode === language.code : draft.nativeCode === language.code
                return <button key={language.code} type="button" className={`onboarding-language-card ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={() => current.id === 'targetCode' ? update('targetCode', language.code) : update('nativeCode', language.code)}><span>{language.flag}</span><span>{language.name}</span></button>
              })}
            </div>
          </>
        )}

        {current.id === 'age' && <ChoiceGrid values={ageOptions.map((value) => ({ value, label: value }))} selected={draft.age} onSelect={(value) => update('age', value)} />}
        {current.id === 'reason' && <ChoiceGrid values={reasonOptions.map((value) => ({ value, label: value }))} selected={draft.reason} onSelect={(value) => update('reason', value)} />}
        {current.id === 'timeline' && <ChoiceGrid values={timelineOptions.map((value) => ({ value, label: value }))} selected={draft.timeline} onSelect={(value) => update('timeline', value)} />}
        {current.id === 'level' && <ChoiceGrid values={levelOptions.map((item) => ({ value: item.value, label: item.label, detail: item.detail }))} selected={draft.level} onSelect={(value) => update('level', value)} />}
        {current.id === 'placementText' && (
          <div className="onboarding-placement">
            <p className="onboarding-tutor-prompt"><strong>{draft.tutor}:</strong> {targetLanguage.name === 'French' ? 'Bonjour ! Qu’aimes-tu faire pendant ton temps libre ?' : `Tell me a little about what you enjoy, in ${targetLanguage.name} if you can.`}</p>
            <textarea value={draft.placementText} onChange={(event) => update('placementText', event.target.value)} placeholder="Try a short answer in your new language…" maxLength={500} aria-label="Your placement chat response" />
            <button type="button" className="onboarding-secondary-button" onClick={() => void sendPlacementMessage()} disabled={!draft.placementText.trim() || placementPending}>{placementPending ? 'Ira is thinking…' : 'Send to Ira'}</button>
            {placementError && <p className="onboarding-inline-error" role="alert">{placementError}</p>}
            {draft.placementReply && <div className="onboarding-tutor-reply"><strong>{draft.tutor} replied</strong><p>{draft.placementReply}</p><small>We use your self-reported starting level; the engine does not return a placement score yet.</small></div>}
            {!draft.placementReply && <button type="button" className="onboarding-secondary-button" onClick={() => { setPlacementSkipped(true); setStep((value) => Math.min(value + 1, STEPS.length - 1)) }}>Continue with my self-check</button>}
          </div>
        )}
        {current.id === 'mood' && <ChoiceGrid values={moodOptions.map((value) => ({ value, label: value }))} selected={draft.mood} onSelect={(value) => update('mood', value)} />}
        {current.id === 'mode' && (
          <div className="onboarding-style-grid">
            {styleOptions.map((style) => <button key={style.id} type="button" className={`onboarding-style-card mode-${style.id} ${draft.mode === style.id ? 'is-selected' : ''}`} aria-pressed={draft.mode === style.id} onClick={() => update('mode', style.id)}><span className="onboarding-style-swatch" /><strong>{style.label} Tutor</strong><small>{style.copy}</small></button>)}
          </div>
        )}
        {current.id === 'pronunciation' && <ChoiceGrid values={pronunciationOptions.map((value) => ({ value, label: value }))} selected={draft.pronunciation} onSelect={(value) => update('pronunciation', value)} />}
        {current.id === 'hobbies' && <div className="onboarding-chip-grid">{hobbyOptions.map((value) => <button key={value} type="button" className={`onboarding-select-chip ${draft.hobbies.includes(value) ? 'is-selected' : ''}`} aria-pressed={draft.hobbies.includes(value)} onClick={() => toggleMulti('hobbies', value)}>{value}</button>)}</div>}
        {current.id === 'roleplay' && <div className="onboarding-chip-grid">{roleplayOptions.map((value) => <button key={value} type="button" className={`onboarding-select-chip ${draft.roleplay.includes(value) ? 'is-selected' : ''}`} aria-pressed={draft.roleplay.includes(value)} onClick={() => toggleMulti('roleplay', value)}>{value}</button>)}</div>}
        {current.id === 'planStyle' && <ChoiceGrid values={planOptions.map((value) => ({ value, label: value }))} selected={draft.planStyle} onSelect={(value) => update('planStyle', value)} />}
        {current.id === 'dailyGoal' && (
          <div className="onboarding-goal-picker">
            <ChoiceGrid values={dailyGoals.map((value) => ({ value: String(value), label: `${value} min` }))} selected={String(draft.dailyGoal)} onSelect={(value) => update('dailyGoal', Number(value))} />
            <div className="onboarding-growth-curve"><svg viewBox="0 0 320 92" role="img" aria-label={`${(draft.dailyGoal * 30 / 60).toFixed(1)} practice hours per month`}><path d="M8 82 C70 70 84 54 128 52 S208 23 312 8" /><path className="curve-fill" d="M8 82 C70 70 84 54 128 52 S208 23 312 8 L312 92 L8 92Z" /></svg><span><strong>{(draft.dailyGoal * 30 / 60).toFixed(1)} hours</strong> of practice per month at this pace</span></div>
          </div>
        )}
        {current.id === 'timeOfDay' && <><ChoiceGrid values={times.map((value) => ({ value, label: value }))} selected={draft.timeOfDay} onSelect={(value) => update('timeOfDay', value)} /><label className="onboarding-reminder"><input type="checkbox" checked={draft.reminder} onChange={(event) => update('reminder', event.target.checked)} /> Save a reminder preference (notifications are not scheduled yet)</label></>}
        {current.id === 'displayName' && (
          <div className="onboarding-name-step">
            <label htmlFor="onboarding-name">Your name</label><input id="onboarding-name" value={draft.displayName} onChange={(event) => update('displayName', event.target.value)} maxLength={60} placeholder="What should we call you?" />
            <p className="onboarding-commit-copy">“I, {draft.displayName.trim() || 'your name'}, commit to practising speaking every day.”</p>
            <button className="onboarding-commit-button" type="button" onPointerDown={startCommit} onPointerUp={stopCommit} onPointerLeave={stopCommit} onPointerCancel={stopCommit} disabled={!draft.displayName.trim()}><span style={{ width: `${commitProgress}%` }} />Hold to commit</button>
          </div>
        )}
        {current.id === 'plan' && !planReady && <div className="onboarding-plan-loading" role="status"><div className="onboarding-loading-orb" /><strong>Creating your personal plan…</strong><div className="onboarding-progress-track"><span style={{ width: `${planProgress}%` }} /></div><span>{planProgress}% · matching practice to your goals</span></div>}
        {current.id === 'plan' && planReady && (
          <div className="onboarding-study-plan">
            <div className="onboarding-level-ladder"><span>YOUR STARTING LEVEL</span>{['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => <span key={level} className={draft.level === level ? 'is-current' : ''}>{level}</span>)}<small>{draft.level} self-check · tutor calibration is not scored yet</small></div>
            <div className="onboarding-plan-items"><p><strong>Vocabulary</strong><span>Useful words around {draft.hobbies.slice(0, 2).join(' and ') || 'everyday life'}</span></p><p><strong>Grammar</strong><span>One useful pattern at a time</span></p><p><strong>Speaking</strong><span>{draft.roleplay.slice(0, 2).join(' and ') || 'Everyday conversations'}</span></p><p><strong>AI guidance</strong><span>{draft.mode} feedback, adjusted to your practice goal</span></p></div>
            <div className="onboarding-plan-curve"><span>Your practice habit grows with you</span><svg viewBox="0 0 320 70" aria-hidden="true"><path d="M5 62 C65 56 80 48 130 43 S214 22 315 7" /></svg></div>
          </div>
        )}
        {current.id === 'tutor' && (
          <div className="onboarding-tutor-grid">
            {(['Ari', 'Ira'] as const).map((tutor) => (
              <article key={tutor} className={`onboarding-tutor-card ${draft.tutor === tutor ? 'is-selected' : ''}`}>
                <button className="onboarding-tutor-select" type="button" aria-pressed={draft.tutor === tutor} onClick={() => update('tutor', tutor)}>
                  <span className={`onboarding-tutor-orb tutor-${tutor.toLowerCase()}`}><i /><i /></span>
                  <strong>{tutor}</strong>
                  <small>{tutor === 'Ari' ? 'Male voice · calm & witty' : 'Female voice · bright & curious'}</small>
                </button>
                <button className="onboarding-voice-preview" type="button" disabled={previewingTutor !== null} onClick={() => void previewTutor(tutor)}>
                  {previewingTutor === tutor ? 'Playing…' : `Preview ${tutor}'s voice`}
                </button>
              </article>
            ))}
            {voicePreviewError && <p className="onboarding-inline-error" role="alert">{voicePreviewError}</p>}
          </div>
        )}
      </section>

      <footer className="onboarding-flow-footer">
        {step === 17
          ? <button className="onboarding-continue-button" type="button" onClick={finish}>Go to Home <span>›</span></button>
          : <button className="onboarding-continue-button" type="button" onClick={moveNext} disabled={!selectedForCurrentStep() || (step === 15 && !commitComplete)}>{step === 15 ? 'Hold above to commit' : step === 16 ? 'Choose my tutor' : 'Continue'} <span>›</span></button>}
      </footer>
    </main>
  )
}
