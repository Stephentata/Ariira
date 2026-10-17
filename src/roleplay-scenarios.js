export const ROLEPLAY_SCENARIOS = Object.freeze([
  {
    id: 'meet-someone-zh-a1',
    level: 'A1',
    title: 'Meet someone',
    goal: 'Greet someone and say goodbye.',
    successCriteria: ['Use a greeting', 'Use a farewell'],
    usefulPhrases: [
      { text: '你好！', transliteration: 'Nǐ hǎo!', translation: 'Hello!' },
      { text: '再见！', transliteration: 'Zàijiàn!', translation: 'Goodbye!' },
    ],
    openingLine: '你好！很高兴认识你。你叫什么名字？',
    openingMeaning: 'Hello! Nice to meet you. What is your name?',
    vocabulary: '你好 (hello), 再见 (goodbye)',
    grammarPoint: 'Use 你好 to greet someone and 再见 when leaving.',
  },
  {
    id: 'introduce-yourself-zh-a1',
    level: 'A1',
    title: 'Introduce yourself',
    goal: 'Say your name and ask another person’s name.',
    successCriteria: ['Say your name using 我叫', 'Ask the other person’s name'],
    usefulPhrases: [
      { text: '我叫 Jamie。', transliteration: 'Wǒ jiào Jamie.', translation: 'My name is Jamie.' },
      { text: '你叫什么名字？', transliteration: 'Nǐ jiào shénme míngzi?', translation: 'What is your name?' },
    ],
    openingLine: '你好！我叫 Ira。你叫什么名字？',
    openingMeaning: 'Hello! My name is Ira. What is your name?',
    vocabulary: '我 (I), 叫 (to be called), 名字 (name)',
    grammarPoint: 'Use 我叫 + name to say what you are called.',
  },
  {
    id: 'new-friend-country-zh-a1',
    level: 'A1',
    title: 'Meet a new friend',
    goal: 'Ask where someone is from and answer with your nationality.',
    successCriteria: ['Ask where someone is from', 'Answer with a country plus 人'],
    usefulPhrases: [
      { text: '你是哪里人？', transliteration: 'Nǐ shì nǎlǐ rén?', translation: 'Where are you from?' },
      { text: '我是英国人。', transliteration: 'Wǒ shì Yīngguó rén.', translation: 'I am British.' },
    ],
    openingLine: '你好！我是英国人。你是哪里人？',
    openingMeaning: 'Hello! I’m British. Where are you from?',
    vocabulary: '是 (to be), 人 (person), 哪里 (where), 英国 (Britain)',
    grammarPoint: 'Add 人 after a country name to say you are from there.',
  },
])

export function getRoleplayScenario(id) {
  const scenario = ROLEPLAY_SCENARIOS.find((item) => item.id === id)
  if (!scenario) throw new Error(`Unknown roleplay scenario: ${id}`)
  return scenario
}

export function createLessonRoleplayScenario(lesson) {
  const level = lesson.roleplay.level
  if (level !== 'A1' && level !== 'A2' && level !== 'B1' && level !== 'B2') {
    throw new Error(`Lesson "${lesson.roleplay.id}" has an unsupported roleplay level: ${level}`)
  }
  const sourcePhrases = lesson.roleplay.useful_phrases.length > 0
    ? lesson.roleplay.useful_phrases
    : lesson.vocabulary.map((word) => ({
      text: word.text,
      transliteration: word.transliteration ?? '',
      translation: word.translation_en,
    }))
  if (sourcePhrases.length === 0) {
    throw new Error(`Lesson "${lesson.roleplay.id}" must include a useful phrase or vocabulary item.`)
  }
  const phrases = sourcePhrases.map((phrase) => ({
    ...phrase,
    transliteration: phrase.transliteration ?? '',
  }))
  const openingPhrase = phrases[0]

  return {
    id: lesson.roleplay.id,
    level,
    title: lesson.roleplay.title,
    goal: lesson.roleplay.goal,
    successCriteria: lesson.roleplay.success_criteria,
    usefulPhrases: phrases,
    openingLine: openingPhrase.text,
    openingMeaning: openingPhrase.translation,
    vocabulary: lesson.vocabulary.map((word) => `${word.text} (${word.translation_en})`).join(', '),
    grammarPoint: typeof lesson.grammar_point === 'string'
      ? lesson.grammar_point
      : lesson.grammar_point?.explanation_en ?? 'Use the lesson phrases in the scene; no grammar note is supplied.',
  }
}
