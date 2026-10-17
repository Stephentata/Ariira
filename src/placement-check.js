export const PLACEMENT_QUESTIONS = Object.freeze([
  {
    id: 'hello',
    prompt: 'What does 你好 mean?',
    options: ['Hello', 'Goodbye', 'Thank you'],
    answer: 'Hello',
  },
  {
    id: 'goodbye',
    prompt: 'What does 再见 mean?',
    options: ['Good morning', 'Goodbye', 'Please'],
    answer: 'Goodbye',
  },
  {
    id: 'name',
    prompt: '我叫 Jamie。 means…',
    options: ['I am Jamie.', 'My name is Jamie.', 'Where is Jamie?'],
    answer: 'My name is Jamie.',
  },
  {
    id: 'ask-name',
    prompt: '你叫什么名字？ asks…',
    options: ['Where are you from?', 'What is your name?', 'How are you?'],
    answer: 'What is your name?',
  },
  {
    id: 'nationality',
    prompt: '我是英国人。 means…',
    options: ['I am British.', 'I am learning English.', 'I live in Beijing.'],
    answer: 'I am British.',
  },
  {
    id: 'ask-origin',
    prompt: '你是哪里人？ asks…',
    options: ['What do you like?', 'Where are you from?', 'What is your name?'],
    answer: 'Where are you from?',
  },
])

export function evaluatePlacementCheck(responses) {
  if (!Array.isArray(responses) || responses.length !== PLACEMENT_QUESTIONS.length) {
    throw new Error('Answer every placement check question before viewing the result.')
  }
  if (responses.some((response) => typeof response !== 'string')) {
    throw new Error('Placement check answers must be selected from the provided choices.')
  }
  if (responses.some((response, index) => !PLACEMENT_QUESTIONS[index].options.includes(response))) {
    throw new Error('Placement check answers must match one of the choices for each question.')
  }
  const correct = responses.reduce(
    (total, response, index) => total + Number(response === PLACEMENT_QUESTIONS[index].answer),
    0,
  )
  if (correct <= 2) {
    return {
      correct,
      total: PLACEMENT_QUESTIONS.length,
      recommendation: 'Start with the introductory greetings lessons and take your time.',
    }
  }
  if (correct <= 4) {
    return {
      correct,
      total: PLACEMENT_QUESTIONS.length,
      recommendation: 'Review the greetings and introductions lessons, then try the check again.',
    }
  }
  return {
    correct,
    total: PLACEMENT_QUESTIONS.length,
    recommendation: 'You recognized most of this small sample. Try the A1 lessons and skip familiar practice when ready.',
  }
}
