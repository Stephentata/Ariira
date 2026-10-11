import { useState, type FormEvent } from 'react'
import starterLesson from '../data/lessons/zh-a1-u01-l01.json'
import {
  advanceLessonSession,
  createLessonSession,
  createMockTutorReply,
  LESSON_STAGES,
  loadLessonSession,
  repeatLessonStage,
  saveLessonSession,
  skipLessonStage,
  type LessonSession,
  type LessonStageId,
} from './lesson-session.js'

type WhiteboardCard =
  | { id: string; type: 'vocab_card'; title: string; word: string; transliteration: string; translation: string; example_sentence: string }
  | { id: string; type: 'grammar_card'; title: string; pattern: string; explanation: string; examples: string[] }
  | { id: string; type: 'dialogue_card'; title: string; lines: { speaker: string; text: string; transliteration?: string; translation?: string }[] }
  | { id: string; type: 'tone_or_sound_card'; title: string; sound: string; tip: string; contour?: string }
  | { id: string; type: 'word_order_card'; title: string; blocks: string[]; answer: string }
  | { id: string; type: 'summary_card'; title: string; takeaways: string[] }
type Props = { onExit: () => void }
type Turn = { role: 'learner' | 'ira'; text: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function parseWhiteboardCard(value: unknown, index: number): WhiteboardCard {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string') {
    throw new Error(`Whiteboard card ${index + 1} is missing its ID or title.`)
  }

  if (
    value.type === 'vocab_card' &&
    typeof value.word === 'string' &&
    typeof value.transliteration === 'string' &&
    typeof value.translation === 'string' &&
    typeof value.example_sentence === 'string'
  ) {
    return {
      id: value.id,
      type: value.type,
      title: value.title,
      word: value.word,
      transliteration: value.transliteration,
      translation: value.translation,
      example_sentence: value.example_sentence,
    }
  }
  if (
    value.type === 'grammar_card' &&
    typeof value.pattern === 'string' &&
    typeof value.explanation === 'string' &&
    isStringArray(value.examples)
  ) {
    return { id: value.id, type: value.type, title: value.title, pattern: value.pattern, explanation: value.explanation, examples: value.examples }
  }
  if (value.type === 'dialogue_card' && Array.isArray(value.lines)) {
    const lines = value.lines.map((line) => {
      if (!isRecord(line) || typeof line.speaker !== 'string' || typeof line.text !== 'string') {
        throw new Error(`Whiteboard dialogue card ${index + 1} contains an invalid line.`)
      }
      if ((line.transliteration !== undefined && typeof line.transliteration !== 'string') ||
        (line.translation !== undefined && typeof line.translation !== 'string')) {
        throw new Error(`Whiteboard dialogue card ${index + 1} contains invalid pronunciation or translation text.`)
      }
      return {
        speaker: line.speaker,
        text: line.text,
        ...(typeof line.transliteration === 'string' ? { transliteration: line.transliteration } : {}),
        ...(typeof line.translation === 'string' ? { translation: line.translation } : {}),
      }
    })
    return { id: value.id, type: value.type, title: value.title, lines }
  }
  if (
    value.type === 'tone_or_sound_card' &&
    typeof value.sound === 'string' &&
    typeof value.tip === 'string' &&
    (value.contour === undefined || typeof value.contour === 'string')
  ) {
    return {
      id: value.id,
      type: value.type,
      title: value.title,
      sound: value.sound,
      tip: value.tip,
      ...(typeof value.contour === 'string' ? { contour: value.contour } : {}),
    }
  }
  if (value.type === 'word_order_card' && isStringArray(value.blocks) && typeof value.answer === 'string') {
    return { id: value.id, type: value.type, title: value.title, blocks: value.blocks, answer: value.answer }
  }
  if (value.type === 'summary_card' && isStringArray(value.takeaways)) {
    return { id: value.id, type: value.type, title: value.title, takeaways: value.takeaways }
  }

  throw new Error(`Whiteboard card ${index + 1} has an unsupported or incomplete card type.`)
}

function getWhiteboardCards(): WhiteboardCard[] {
  const serialized: unknown = JSON.parse(JSON.stringify(starterLesson.whiteboard_cards))
  if (!Array.isArray(serialized)) throw new Error('The lesson whiteboard cards must be a list.')
  return serialized.map(parseWhiteboardCard)
}

const whiteboardCards = getWhiteboardCards()

function getInitialSession(): { session: LessonSession; error: string } {
  try {
    return {
      session: loadLessonSession(window.localStorage, starterLesson.id) ?? createLessonSession(starterLesson.id),
      error: '',
    }
  } catch (error) {
    return {
      session: createLessonSession(starterLesson.id),
      error: error instanceof Error ? error.message : 'Could not read saved lesson progress.',
    }
  }
}

function Whiteboard({ card }: { card: WhiteboardCard }) {
  if (card.type === 'vocab_card') {
    return (
      <article className="lesson-whiteboard-card">
        <span className="lesson-card-kind">NEW WORD</span>
        <h3 lang="zh-CN">{card.word}</h3>
        <p className="lesson-card-pronunciation">{card.transliteration}</p>
        <p className="lesson-card-translation">{card.translation}</p>
        <div className="lesson-card-example"><span>EXAMPLE</span><p lang="zh-CN">{card.example_sentence}</p></div>
      </article>
    )
  }

  if (card.type === 'grammar_card') {
    return (
      <article className="lesson-whiteboard-card">
        <span className="lesson-card-kind">GRAMMAR</span>
        <h3>{card.title}</h3>
        <p className="lesson-card-pattern">{card.pattern}</p>
        <p>{card.explanation}</p>
        <ul>{card.examples.map((example) => <li key={example}>{example}</li>)}</ul>
      </article>
    )
  }

  if (card.type === 'dialogue_card') {
    return (
      <article className="lesson-whiteboard-card">
        <span className="lesson-card-kind">DIALOGUE</span>
        <h3>{card.title}</h3>
        {card.lines.map((line, index) => (
          <p className="lesson-dialogue-line" key={`${line.speaker}-${index}`}>
            <strong>{line.speaker}</strong><span lang="zh-CN">{line.text}</span>
            {line.transliteration && <small>{line.transliteration}</small>}
            {line.translation && <small>{line.translation}</small>}
          </p>
        ))}
      </article>
    )
  }

  if (card.type === 'tone_or_sound_card') {
    return (
      <article className="lesson-whiteboard-card">
        <span className="lesson-card-kind">SOUND TIP</span>
        <h3>{card.sound}</h3>
        <p>{card.tip}</p>
        {card.contour && <p className="lesson-card-pattern">{card.contour}</p>}
      </article>
    )
  }

  if (card.type === 'word_order_card') {
    return (
      <article className="lesson-whiteboard-card">
        <span className="lesson-card-kind">WORD ORDER</span>
        <h3>{card.title}</h3>
        <div className="lesson-word-blocks">{card.blocks.map((block, index) => <span key={`${block}-${index}`}>{block}</span>)}</div>
      </article>
    )
  }

  return (
    <article className="lesson-whiteboard-card">
      <span className="lesson-card-kind">TAKEAWAYS</span>
      <h3>{card.title}</h3>
      <ul>{card.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}</ul>
    </article>
  )
}

function stagePrompt(stageId: LessonStageId) {
  if (stageId === 'warmup') return 'Before we begin, how would you greet someone in Mandarin? A guess is welcome.'
  if (stageId === 'practice') return 'Try writing a short greeting or farewell using one of the words on the whiteboard.'
  if (stageId === 'roleplay') return 'Imagine meeting someone new. Write a greeting you would use to start.'
  return ''
}

export default function LessonPlayer({ onExit }: Props) {
  const [initial] = useState(getInitialSession)
  const [session, setSession] = useState(initial.session)
  const [storageError, setStorageError] = useState(initial.error)
  const [learnerInput, setLearnerInput] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const currentStage = LESSON_STAGES[session.stageIndex]
  const completedStages = session.status === 'completed' ? LESSON_STAGES.length : session.stageIndex

  function changeStage(nextSession: LessonSession) {
    try {
      saveLessonSession(window.localStorage, nextSession)
      setStorageError('')
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Could not save lesson progress on this device.')
    }
    setSession(nextSession)
    setLearnerInput('')
    setTurns([])
  }

  function sendToMockTutor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = learnerInput.trim()
    if (!text || (currentStage.id !== 'warmup' && currentStage.id !== 'practice' && currentStage.id !== 'roleplay')) return

    const reply = createMockTutorReply(currentStage.id, text)
    setTurns((existing) => [...existing, { role: 'learner', text }, { role: 'ira', text: reply }])
    setLearnerInput('')
  }

  function restartLesson() {
    changeStage(createLessonSession(starterLesson.id))
  }

  const showConversation = currentStage.id === 'warmup' || currentStage.id === 'practice' || currentStage.id === 'roleplay'
  const stageTitle = currentStage.id === 'warmup'
    ? 'Let’s wake up a few words'
    : currentStage.id === 'teach'
      ? 'A couple of useful words'
      : currentStage.id === 'practice'
        ? 'Try it in your own words'
        : currentStage.id === 'roleplay'
          ? starterLesson.roleplay.title
          : currentStage.id === 'recap'
            ? 'A small recap'
            : 'Your lesson is saved'

  return (
    <div className="page-content subpage-content lesson-player">
      <div className="lesson-player-topline">
        <button className="text-button" type="button" onClick={onExit}>← Back to home</button>
        <span className="lesson-save-indicator">Progress saves on this device</span>
      </div>
      <div className="lesson-preview-warning" role="note">
        <strong>Unreviewed lesson preview</strong>
        <span>This sample Mandarin content has not been checked by a qualified reviewer. It is for prototype testing only, not instruction.</span>
      </div>
      {storageError && <p className="lesson-storage-error" role="alert">{storageError}</p>}

      <header className="lesson-session-heading">
        <div>
          <p className="eyebrow">TEXT LESSON · ENGLISH TO MANDARIN · A1</p>
          <h1>{starterLesson.title}</h1>
          <p>Practice the lesson flow with Ira. This prototype uses predictable mock replies and never grades your answers.</p>
        </div>
        <span className="lesson-duration"><span aria-hidden="true">◷</span> 10 min</span>
      </header>

      <nav className="lesson-stage-list" aria-label="Lesson stages">
        {LESSON_STAGES.map((stage, index) => {
          const isCurrent = session.status === 'active' && session.stageIndex === index
          const isComplete = session.status === 'completed' || index < session.stageIndex
          return (
            <span
              className={`lesson-stage ${isCurrent ? 'is-current' : ''} ${isComplete ? 'is-complete' : ''}`}
              key={stage.id}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="lesson-stage-number">{isComplete ? '✓' : index + 1}</span>
              <span className="lesson-stage-label">{stage.label}</span>
            </span>
          )
        })}
      </nav>

      {session.status === 'completed' ? (
        <section className="lesson-complete-card" aria-live="polite">
          <span className="lesson-complete-icon" aria-hidden="true">✓</span>
          <p className="eyebrow">SESSION COMPLETE</p>
          <h2>That’s a lovely little step.</h2>
          <p>Your progress is saved on this device. The sample lesson remains unreviewed and does not update real learning progress.</p>
          {session.skippedStages.length > 0 && <p>You skipped {session.skippedStages.length} stage{session.skippedStages.length === 1 ? '' : 's'}; you can revisit them when you restart.</p>}
          <div className="lesson-action-row">
            <button className="button button-outline" type="button" onClick={onExit}>Back to home</button>
            <button className="button button-dark" type="button" onClick={restartLesson}>Start again</button>
          </div>
        </section>
      ) : (
        <>
          <div className="lesson-session-grid">
            <section className="lesson-stage-panel" aria-labelledby="lesson-stage-title">
              <div className="lesson-stage-panel-heading">
                <div><span className="lesson-stage-kicker">STAGE {session.stageIndex + 1} OF {LESSON_STAGES.length}</span><h2 id="lesson-stage-title">{stageTitle}</h2></div>
                {currentStage.minutes > 0 && <span className="lesson-stage-time">~{currentStage.minutes} min</span>}
              </div>
              {currentStage.id === 'warmup' && <p className="lesson-stage-description">Start with what you remember. Ira will offer encouragement, not a score.</p>}
              {currentStage.id === 'teach' && <p className="lesson-stage-description">Read the lesson cards at your own pace. They are loaded from the sample lesson data.</p>}
              {currentStage.id === 'practice' && <p className="lesson-stage-description">{stagePrompt(currentStage.id)}</p>}
              {currentStage.id === 'roleplay' && <p className="lesson-stage-description">{starterLesson.roleplay.goal}</p>}
              {currentStage.id === 'recap' && (
                <div className="lesson-recap">
                  <p>You moved through {completedStages} of {LESSON_STAGES.length} stages in this preview.</p>
                  <p>Lesson objectives: {starterLesson.objectives.join(', ')}.</p>
                  <p>No answers were scored, and no learning history was changed.</p>
                </div>
              )}
              {currentStage.id === 'save' && (
                <div className="lesson-save-copy">
                  <p>Finish this practice preview to save your current stage on this device.</p>
                  <p>Saving here does not add words to a real review deck or change mastery.</p>
                </div>
              )}

              {showConversation && (
                <>
                  {currentStage.id === 'warmup' && (
                    <div className="lesson-warmup-prompt">
                      <span className="lesson-ira-mark">I</span>
                      <p>{stagePrompt(currentStage.id)}</p>
                    </div>
                  )}
                  {currentStage.id === 'roleplay' && (
                    <div className="lesson-roleplay-brief">
                      <span>SCENARIO</span><strong>{starterLesson.roleplay.title}</strong><p>{starterLesson.roleplay.goal}</p>
                    </div>
                  )}
                  {turns.length > 0 && (
                    <div className="lesson-turns" role="log" aria-label="Mock lesson conversation with Ira" aria-live="polite">
                      {turns.map((turn, index) => (
                        <p className={`lesson-turn is-${turn.role}`} key={`${turn.role}-${index}`}>
                          <strong>{turn.role === 'ira' ? 'IRA' : 'YOU'}</strong><span>{turn.text}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  <form className="lesson-response-form" onSubmit={sendToMockTutor}>
                    <label htmlFor="lesson-response">{currentStage.id === 'roleplay' ? 'Your turn' : 'Write your response'}</label>
                    <textarea
                      id="lesson-response"
                      rows={3}
                      maxLength={300}
                      value={learnerInput}
                      onChange={(event) => setLearnerInput(event.target.value)}
                      placeholder={currentStage.id === 'roleplay' ? 'Try a short greeting…' : 'Type a response…'}
                    />
                    <div className="lesson-response-footer"><span>Text only · mock tutor · not scored</span><button className="button button-dark" type="submit" disabled={!learnerInput.trim()}>Send to Ira</button></div>
                  </form>
                </>
              )}
            </section>

            <aside className="lesson-whiteboard" aria-label="Lesson whiteboard">
              <div className="lesson-whiteboard-heading"><span className="lesson-whiteboard-icon" aria-hidden="true">✳</span><div><span>IRA’S WHITEBOARD</span><strong>{currentStage.id === 'teach' ? 'Lesson cards' : 'Today’s focus'}</strong></div></div>
              {currentStage.id === 'teach'
                ? whiteboardCards.map((card) => <Whiteboard key={card.id} card={card} />)
                : currentStage.id === 'roleplay'
                  ? <div className="lesson-board-note"><span>TRY THIS SCENARIO</span><strong>{starterLesson.roleplay.title}</strong><p>{starterLesson.roleplay.goal}</p></div>
                  : currentStage.id === 'recap'
                    ? <div className="lesson-board-note"><span>OBJECTIVES</span><ul>{starterLesson.objectives.map((objective) => <li key={objective}>{objective.replaceAll('-', ' ')}</li>)}</ul></div>
                    : <div className="lesson-board-note"><span>LESSON FLOW</span><strong>{currentStage.label}</strong><p>{currentStage.id === 'warmup' ? 'Share what you already remember.' : currentStage.id === 'practice' ? 'Try a phrase without worrying about mistakes.' : 'Complete the stages at your own pace.'}</p></div>}
              {currentStage.id !== 'teach' && <p className="lesson-board-disclaimer">Cards are structured from lesson data; this sample has not been reviewed.</p>}
            </aside>
          </div>

          <footer className="lesson-navigation">
            <div className="lesson-navigation-secondary">
              <button className="button button-outline" type="button" onClick={() => changeStage(repeatLessonStage(session))}>Repeat this stage</button>
              <button className="lesson-skip-button" type="button" onClick={() => changeStage(skipLessonStage(session))}>Skip this stage</button>
            </div>
            <button className="button button-dark" type="button" onClick={() => changeStage(advanceLessonSession(session))}>
              {currentStage.id === 'save' ? 'Save & finish' : 'Next step'} <span aria-hidden="true">→</span>
            </button>
          </footer>
        </>
      )}
    </div>
  )
}
