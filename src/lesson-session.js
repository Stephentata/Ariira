export const LESSON_STAGES = Object.freeze([
  { id: 'warmup', label: 'Warm-up', minutes: 1.5 },
  { id: 'teach', label: 'Whiteboard', minutes: 2 },
  { id: 'practice', label: 'Practice', minutes: 2.5 },
  { id: 'roleplay', label: 'Roleplay', minutes: 3 },
  { id: 'recap', label: 'Recap', minutes: 1 },
  { id: 'save', label: 'Save', minutes: 0 },
])

export function createLessonSession(lessonId) {
  if (typeof lessonId !== 'string' || lessonId.trim() === '') {
    throw new Error('A lesson ID is required to start a lesson session.')
  }

  return {
    lessonId,
    stageIndex: 0,
    exerciseIndex: 0,
    status: 'active',
    skippedStages: [],
  }
}

export function isLessonSession(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.lessonId === 'string' &&
    Number.isInteger(value.stageIndex) &&
    value.stageIndex >= 0 &&
    value.stageIndex < LESSON_STAGES.length &&
    (value.exerciseIndex === undefined || (Number.isInteger(value.exerciseIndex) && value.exerciseIndex >= 0)) &&
    (value.status === 'active' || value.status === 'completed') &&
    Array.isArray(value.skippedStages) &&
    value.skippedStages.every((index) => Number.isInteger(index) && index >= 0 && index < LESSON_STAGES.length)
  )
}

export function advanceLessonSession(session) {
  if (!isLessonSession(session) || session.status !== 'active') {
    throw new Error('Only an active lesson session can advance.')
  }
  if (session.stageIndex === LESSON_STAGES.length - 1) {
    return { ...session, status: 'completed' }
  }

  return { ...session, stageIndex: session.stageIndex + 1 }
}

export function skipLessonStage(session) {
  if (!isLessonSession(session) || session.status !== 'active') {
    throw new Error('Only an active lesson session can skip a stage.')
  }
  if (session.stageIndex === LESSON_STAGES.length - 1) {
    return { ...session, status: 'completed' }
  }

  return {
    ...session,
    stageIndex: session.stageIndex + 1,
    skippedStages: [...session.skippedStages, session.stageIndex],
  }
}

export function repeatLessonStage(session) {
  if (!isLessonSession(session) || session.status !== 'active') {
    throw new Error('Only an active lesson session can repeat a stage.')
  }
  return { ...session }
}

export function loadLessonSession(storage, lessonId) {
  const savedSession = storage.getItem(`ari-lesson-session:${lessonId}`)
  if (savedSession === null) return null

  let parsed
  try {
    parsed = JSON.parse(savedSession)
  } catch {
    throw new Error('Saved lesson progress is damaged. Start a new lesson to replace it.')
  }

  if (!isLessonSession(parsed) || parsed.lessonId !== lessonId) {
    throw new Error('Saved lesson progress is invalid. Start a new lesson to replace it.')
  }
  return { ...parsed, exerciseIndex: parsed.exerciseIndex ?? 0 }
}

export function saveLessonSession(storage, session) {
  if (!isLessonSession(session)) {
    throw new Error('Cannot save invalid lesson progress.')
  }
  storage.setItem(`ari-lesson-session:${session.lessonId}`, JSON.stringify(session))
}

export function createMockTutorReply(stageId, learnerText) {
  if (typeof learnerText !== 'string' || learnerText.trim() === '') {
    throw new Error('Write a response before asking Ira for feedback.')
  }

  const replies = {
    warmup: 'Thanks for giving that a try. We’ll explore the words together on the whiteboard.',
    roleplay: 'I’m following along. Let’s keep the conversation going one small phrase at a time.',
  }
  const reply = replies[stageId]
  if (!reply) throw new Error(`The mock tutor does not support the "${stageId}" stage.`)
  return reply
}
