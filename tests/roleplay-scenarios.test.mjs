import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLessonRoleplayScenario, getRoleplayScenario, ROLEPLAY_SCENARIOS } from '../src/roleplay-scenarios.js'

test('roleplay scenarios include goals, criteria, and useful phrases for the sample lessons', () => {
  assert.equal(ROLEPLAY_SCENARIOS.length, 3)
  for (const scenario of ROLEPLAY_SCENARIOS) {
    assert.ok(scenario.id)
    assert.equal(scenario.level, 'A1')
    assert.ok(scenario.goal)
    assert.ok(scenario.successCriteria.length > 0)
    assert.ok(scenario.usefulPhrases.length > 0)
    assert.ok(scenario.openingLine)
    assert.ok(scenario.openingMeaning)
  }
  assert.equal(getRoleplayScenario('introduce-yourself-zh-a1').title, 'Introduce yourself')
  assert.throws(() => getRoleplayScenario('missing-scenario'), /Unknown roleplay scenario/)
})

test('lesson roleplay uses lesson vocabulary when useful phrases are not supplied', () => {
  const scenario = createLessonRoleplayScenario({
    roleplay: {
      id: 'meet-someone-zh-a1',
      level: 'A1',
      title: 'Meet someone',
      goal: 'Greet someone and say goodbye.',
      success_criteria: ['Use a greeting', 'Use a farewell'],
      useful_phrases: [],
    },
    vocabulary: [
      { text: '你好！', transliteration: 'Nǐ hǎo!', translation_en: 'Hello!' },
      { text: '再见！', translation_en: 'Goodbye!' },
    ],
    grammar_point: null,
  })

  assert.equal(scenario.id, 'meet-someone-zh-a1')
  assert.equal(scenario.openingLine, '你好！')
  assert.equal(scenario.openingMeaning, 'Hello!')
  assert.deepEqual(scenario.successCriteria, ['Use a greeting', 'Use a farewell'])
  assert.deepEqual(scenario.usefulPhrases, [
    { text: '你好！', transliteration: 'Nǐ hǎo!', translation: 'Hello!' },
    { text: '再见！', transliteration: '', translation: 'Goodbye!' },
  ])
  assert.equal(scenario.vocabulary, '你好！ (Hello!), 再见！ (Goodbye!)')
})

test('lesson roleplay preserves supplied phrases and uses a structured grammar explanation', () => {
  const scenario = createLessonRoleplayScenario({
    roleplay: {
      id: 'say-name-zh-a1',
      level: 'A1',
      title: 'Say your name',
      goal: 'Say your name and ask another person’s name.',
      success_criteria: ['Say your name'],
      useful_phrases: [
        { text: '我叫 Jamie。', transliteration: 'Wǒ jiào Jamie.', translation: 'My name is Jamie.' },
      ],
    },
    vocabulary: [{ text: '我', translation_en: 'I' }],
    grammar_point: { explanation_en: 'Use 我叫 followed by a name to say what you are called.' },
  })

  assert.equal(scenario.openingLine, '我叫 Jamie。')
  assert.equal(scenario.openingMeaning, 'My name is Jamie.')
  assert.equal(scenario.grammarPoint, 'Use 我叫 followed by a name to say what you are called.')
  assert.equal(scenario.usefulPhrases.length, 1)
})

test('lesson roleplay rejects a lesson with no usable opening phrase', () => {
  assert.throws(() => createLessonRoleplayScenario({
    roleplay: {
      id: 'empty-lesson',
      level: 'A1',
      title: 'Empty lesson',
      goal: 'Practise a scene.',
      success_criteria: ['Try a phrase'],
      useful_phrases: [],
    },
    vocabulary: [],
  }), /must include a useful phrase or vocabulary item/)
})
