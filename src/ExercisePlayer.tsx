import { useState, type FormEvent } from 'react'
import { getTutorSpeechGender } from './speech-options.js'
import { readLearnerSettings } from './learner-data.js'
import { playSpeechAudio } from './speech-playback.js'
import {
  checkClosedExerciseAnswer,
  createExerciseResponse,
  formatExpectedAnswer,
  type ClosedExercise,
  type LessonExercise,
  type ShortWritingExercise,
} from './exercise-checker.js'

type Props = {
  exercise: LessonExercise
  index: number
  total: number
  targetLocale: string
  targetLanguageName: string
  onAttempt: (correct: boolean) => void
  onComplete: () => void
}

function usesChoiceButtons(type: ClosedExercise['type'] | ShortWritingExercise['type']) {
  return type === 'multiple_choice' || type === 'listen_and_choose' || type === 'spot_mistake' || type === 'reading_comprehension'
}

function usesTextInput(type: ClosedExercise['type'] | ShortWritingExercise['type']) {
  return (
    type === 'listen_and_type' ||
    type === 'fill_blank' ||
    type === 'translate_native_to_target' ||
    type === 'translate_target_to_native'
  )
}

export default function ExercisePlayer({ exercise, index, total, targetLocale, targetLanguageName, onAttempt, onComplete }: Props) {
  const [answer, setAnswer] = useState('')
  const [selectedBlocks, setSelectedBlocks] = useState<number[]>([])
  const [pairAnswers, setPairAnswers] = useState<Record<string, string>>({})
  const [hintVisible, setHintVisible] = useState(false)
  const [explainMoreVisible, setExplainMoreVisible] = useState(false)
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null)
  const [interactionError, setInteractionError] = useState('')
  const [speechNotice, setSpeechNotice] = useState('')
  const [writingSubmitted, setWritingSubmitted] = useState(false)
  const choices = 'options' in exercise ? exercise.options ?? [] : []
  const matchPairs = exercise.type === 'match_pairs' ? Object.entries(exercise.answer_key) : []
  const allPairsAnswered = matchPairs.length > 0 && matchPairs.every(([target]) => pairAnswers[target])

  function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setInteractionError('')
    if (exercise.type === 'short_writing') {
      if (!answer.trim()) {
        setInteractionError('Write a draft before reviewing it.')
        return
      }
      setWritingSubmitted(true)
      return
    }
    try {
      const response = exercise.type === 'match_pairs'
        ? createExerciseResponse(exercise, pairAnswers)
        : createExerciseResponse(exercise, answer)
      const correct = checkClosedExerciseAnswer(exercise, response)
      onAttempt(correct)
      setFeedback({
        correct,
        message: correct ? 'Correct — nicely done.' : `Not quite. The answer is: ${formatExpectedAnswer(exercise)}`,
      })
      setExplainMoreVisible(false)
    } catch (error) {
      setInteractionError(error instanceof Error ? error.message : 'Could not check this response.')
    }
  }

  function selectBlock(blockIndex: number) {
    setSelectedBlocks((selected) => [...selected, blockIndex])
    setAnswer((current) => current + choices[blockIndex])
    setFeedback(null)
  }

  function undoLastBlock() {
    setSelectedBlocks((selected) => selected.slice(0, -1))
    setAnswer((current) => {
      const lastIndex = selectedBlocks.at(-1)
      return lastIndex === undefined ? current : current.slice(0, -choices[lastIndex].length)
    })
    setFeedback(null)
  }

  async function playListeningPrompt() {
    if (!('listen_text' in exercise) || !exercise.listen_text) {
      setSpeechNotice('This exercise does not include a listening prompt.')
      return
    }
    try {
      setSpeechNotice('Generating speech locally with Ari’s voice service…')
      const tutorName = readLearnerSettings(window.localStorage).tutorName
      await playSpeechAudio(exercise.listen_text, targetLocale, getTutorSpeechGender(tutorName))
      setSpeechNotice('')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setSpeechNotice(error instanceof Error ? `Voice playback failed: ${error.message}` : 'Voice playback failed.')
    }
  }

  function updateAnswer(nextAnswer: string) {
    setAnswer(nextAnswer)
    setFeedback(null)
    setInteractionError('')
  }

  return (
    <section className="exercise-card" aria-labelledby={`exercise-title-${exercise.id}`}>
      <div className="exercise-card-topline">
        <span>EXERCISE {index + 1} OF {total}</span>
        <span className="exercise-type-label">{exercise.type.replaceAll('_', ' ')}</span>
      </div>
      <h3 id={`exercise-title-${exercise.id}`}>{exercise.prompt}</h3>

      {exercise.type === 'reading_comprehension' && (
        <blockquote className="exercise-reading-passage" lang={targetLocale}>{exercise.reading_text}</blockquote>
      )}
      {(exercise.type === 'listen_and_choose' || exercise.type === 'listen_and_type') && (
        <div className="exercise-listen-control">
          <button className="button button-outline" type="button" onClick={playListeningPrompt}>▶ Hear prompt</button>
          <span>Browser speech playback · no recording stored</span>
        </div>
      )}
      {speechNotice && <p className="exercise-speech-notice" role="status">{speechNotice}</p>}

      {!feedback && !writingSubmitted && (
        <form className="exercise-answer-form" onSubmit={submitAnswer}>
          {usesChoiceButtons(exercise.type) && (
            <fieldset className="exercise-choices">
              <legend>Choose one answer</legend>
              {choices.map((choice) => (
                <label className={`exercise-choice ${answer === choice ? 'is-selected' : ''}`} key={choice}>
                  <input
                    type="radio"
                    name={`answer-${exercise.id}`}
                    value={choice}
                    checked={answer === choice}
                    onChange={() => updateAnswer(choice)}
                  />
                  <span>{choice}</span>
                </label>
              ))}
            </fieldset>
          )}

          {usesTextInput(exercise.type) && (
            <label className="exercise-text-answer">
              <span>{exercise.type === 'translate_target_to_native' ? 'Your answer in English' : 'Your answer'}</span>
              <input
                type="text"
                maxLength={300}
                value={answer}
                onChange={(event) => updateAnswer(event.target.value)}
                placeholder={exercise.type === 'fill_blank' ? 'Type the missing word…' : 'Type your answer…'}
                lang={exercise.type === 'translate_target_to_native' ? 'en' : targetLocale}
                autoComplete="off"
              />
            </label>
          )}

          {exercise.type === 'short_writing' && (
            <label className="exercise-text-answer exercise-writing-answer">
              <span>Your {targetLanguageName} draft</span>
              <textarea
                maxLength={500}
                rows={4}
                value={answer}
                onChange={(event) => updateAnswer(event.target.value)}
                placeholder="Write your own version…"
                lang={targetLocale}
                autoComplete="off"
              />
            </label>
          )}

          {exercise.type === 'sentence_building' && (
            <div className="exercise-sentence-builder">
              <div className="exercise-built-sentence" aria-live="polite" lang={targetLocale}>
                {answer || <span>Tap the blocks to build a sentence…</span>}
              </div>
              <div className="exercise-word-blocks" aria-label="Available word blocks">
                {choices.map((block, blockIndex) => (
                  <button
                    type="button"
                    key={`${block}-${blockIndex}`}
                    disabled={selectedBlocks.includes(blockIndex)}
                    onClick={() => selectBlock(blockIndex)}
                    lang={targetLocale}
                  >
                    {block}
                  </button>
                ))}
              </div>
              {selectedBlocks.length > 0 && <button className="exercise-text-action" type="button" onClick={undoLastBlock}>Undo last block</button>}
            </div>
          )}

          {exercise.type === 'match_pairs' && (
            <div className="exercise-match-list">
              {matchPairs.map(([target], pairIndex) => (
                <label className="exercise-match-row" key={target}>
                  <span lang={targetLocale}>{target}</span>
                  <span aria-hidden="true">→</span>
                  <select
                    aria-label={`Meaning for ${target}`}
                    value={pairAnswers[target] ?? ''}
                    onChange={(event) => {
                      setPairAnswers((current) => ({ ...current, [target]: event.target.value }))
                      setFeedback(null)
                    }}
                  >
                    <option value="">Choose a meaning</option>
                    {[...new Set(matchPairs.map(([, meaning]) => meaning))].map((meaning) => (
                      <option key={`${pairIndex}-${meaning}`} value={meaning}>{meaning}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          <div className="exercise-form-footer">
            {!hintVisible
              ? <button className="exercise-text-action" type="button" onClick={() => setHintVisible(true)}>Show hint</button>
              : <p className="exercise-hint"><strong>Hint:</strong> {exercise.hint}</p>}
            <button
              className="button button-dark"
              type="submit"
              disabled={
                (exercise.type !== 'short_writing' && usesChoiceButtons(exercise.type) && !answer) ||
                (exercise.type !== 'short_writing' && usesTextInput(exercise.type) && !answer.trim()) ||
                (exercise.type === 'short_writing' && !answer.trim()) ||
                (exercise.type === 'sentence_building' && !answer) ||
                (exercise.type === 'match_pairs' && !allPairsAnswered)
              }
            >
              {exercise.type === 'short_writing' ? 'Review my draft' : 'Check answer'}
            </button>
          </div>
        </form>
      )}

      {interactionError && <p className="exercise-interaction-error" role="alert">{interactionError}</p>}

      {exercise.type === 'short_writing' && writingSubmitted && (
        <section className="exercise-writing-review" aria-label="Writing self-review">
          <p><strong>Your draft</strong></p>
          <p className="exercise-writing-draft" lang={targetLocale}>{answer}</p>
          <p>{exercise.explanation}</p>
          <fieldset>
            <legend>Reflect on your draft (optional)</legend>
            {exercise.success_criteria.map((criterion) => (
              <label key={criterion}>
                <input type="checkbox" />
                <span>{criterion}</span>
              </label>
            ))}
          </fieldset>
          <details>
            <summary>See one possible example</summary>
            <p className="exercise-writing-draft" lang={targetLocale}>{exercise.answer_key.sample_answer}</p>
          </details>
          <p className="exercise-writing-note">Your writing is not automatically scored and does not change your level or progress.</p>
          <button className="button button-dark" type="button" onClick={onComplete}>Continue →</button>
        </section>
      )}

      {feedback && (
        <div className={`exercise-feedback ${feedback.correct ? 'is-correct' : 'is-incorrect'}`} role="status" aria-live="polite">
          <strong>{feedback.message}</strong>
          <p>{exercise.explanation}</p>
          {exercise.explain_more && (
            <>
              <button className="exercise-text-action" type="button" onClick={() => setExplainMoreVisible((visible) => !visible)}>
                {explainMoreVisible ? 'Show less' : 'Explain more'}
              </button>
              {explainMoreVisible && <p>{exercise.explain_more}</p>}
            </>
          )}
          {feedback.correct ? (
            <button className="button button-dark" type="button" onClick={onComplete}>Next exercise →</button>
          ) : (
            <button className="button button-outline" type="button" onClick={() => { setFeedback(null); setAnswer(''); setSelectedBlocks([]); setPairAnswers({}) }}>
              Try again
            </button>
          )}
        </div>
      )}
    </section>
  )
}
