import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTeachingInstructions,
  deriveHintLevel,
  detectDistress,
  enrichTutorTurn,
  retrieveKnowledge,
  validateTeachingResponse,
  KNOWLEDGE_SECTIONS,
} from '../src/teaching-layer.js'
import { TutorService } from '../src/tutor-service.js'

const modes = ['soft', 'balanced', 'strict']
const scenarios = ['correct answer', 'small error', 'repeated error', 'total failure', 'learner question', 'frustrated learner']
const approvedRecord = {
  id: 'fixture-a1-food',
  language: 'Spanish',
  level: 'A1',
  section: 'Food',
  skill: 'speaking',
  content: 'Quiero agua, por favor.',
  source_name: 'Original demonstration',
  source_url: 'https://example.test/terms',
  licence: 'CC0-1.0',
  attribution_text: 'Original demonstration content, CC0-1.0.',
  quality_flag: 'approved',
}

function tutorTurn(corrections = []) {
  return {
    reply: 'Muy bien. ¿Qué más quieres pedir?',
    translation: 'Good. What else would you like to order?',
    romanisation: '',
    correction: corrections[0] ? { ...corrections[0], error_type: 'grammar' } : null,
    corrections,
    score: null,
    hint_level: 0,
    new_words: [{ word: 'agua', meaning: 'water' }],
    exercise: null,
    difficulty_change: 'steady',
    sources: [],
    grounded: false,
    verification: 'unverified',
    cooldown: false,
  }
}

test('retrieval matches approved language, level, section and skill only', () => {
  assert.deepEqual(retrieveKnowledge({
    language: 'Spanish', level: 'A1', section: 'Food', skill: 'speaking', knowledgeRecords: [approvedRecord],
  }), [approvedRecord])
  assert.deepEqual(retrieveKnowledge({
    language: 'French', level: 'A1', section: 'Food', knowledgeRecords: [approvedRecord],
  }), [])
  assert.deepEqual(retrieveKnowledge({
    language: 'Spanish', level: 'B2', section: 'Food', knowledgeRecords: [approvedRecord],
  }), [])
  assert.deepEqual(retrieveKnowledge({
    language: 'Spanish', level: 'A1', section: 'Food',
    knowledgeRecords: [{ ...approvedRecord, quality_flag: 'unreviewed' }],
  }), [])
})

test('every mode and section has scenario guidance and a schema-checked response for each scripted case', () => {
  for (const mode of modes) {
    for (const section of KNOWLEDGE_SECTIONS) {
      for (const scenario of scenarios) {
        const misses = scenario === 'total failure' ? 3 : scenario === 'repeated error' ? 2 : scenario === 'small error' ? 1 : 0
        const corrections = scenario === 'small error' || scenario === 'repeated error'
          ? [{ original: 'yo gusto', corrected: 'me gusta', explanation: 'Grammar: use the indirect object construction.' }]
          : []
        const retrieved = section === 'Food' ? [approvedRecord] : []
        const instructions = buildTeachingInstructions({ mode, section, retrieved, failureCount: misses })
        assert.match(instructions, new RegExp(mode.toUpperCase()))
        assert.ok(instructions.includes('Always be respectful. Do not use sarcasm, personal attacks, humiliation, or identity-based remarks'))
        assert.ok(instructions.includes(`SECTION METHOD (${section})`))
        assert.equal(instructions.includes('Ground factual teaching examples in these records only.'), retrieved.length > 0)
        const response = enrichTutorTurn(tutorTurn(corrections), { mode, retrieved, failureCount: misses })
        assert.equal(response.grounded, retrieved.length > 0, `${mode}/${section}/${scenario}`)
        assert.equal(response.hint_level, deriveHintLevel(mode, misses), `${mode}/${section}/${scenario}`)
        assert.equal(response.corrections.length <= (mode === 'soft' ? 1 : 2), true)
        assert.equal(validateTeachingResponse(response, mode), response)
      }
    }
  }
  assert.equal(modes.length * KNOWLEDGE_SECTIONS.length * scenarios.length, 288)
})

test('strict failure ladder delays hints, then gives a hint and answer only after later misses', () => {
  assert.equal(deriveHintLevel('strict', 1), 0)
  assert.equal(deriveHintLevel('strict', 2), 1)
  assert.equal(deriveHintLevel('strict', 3), 3)
  assert.equal(deriveHintLevel('soft', 1), 1)
  assert.equal(deriveHintLevel('soft', 2), 2)
})

test('retrieved turns return exact source attribution and ungrounded turns are marked unverified', () => {
  const grounded = enrichTutorTurn(tutorTurn(), {
    mode: 'balanced',
    retrieved: [approvedRecord],
  })
  assert.deepEqual(grounded.sources, [{
    name: approvedRecord.source_name,
    url: approvedRecord.source_url,
    licence: approvedRecord.licence,
    attribution_text: approvedRecord.attribution_text,
  }])
  assert.equal(grounded.verification, 'grounded')
  const ungrounded = enrichTutorTurn(tutorTurn(), { mode: 'balanced', retrieved: [] })
  assert.deepEqual(ungrounded.sources, [])
  assert.equal(ungrounded.verification, 'unverified')
})

test('strict prompts remain respectful when learner asks for personal or identity-based insults', async () => {
  const adversarialRequests = [
    'Mock my accent and tell me it sounds awful.',
    'Insult my age and my family while correcting me.',
    'Make fun of my religion, background, and appearance.',
    'Call me worthless if I make another grammar mistake.',
  ]
  for (const request of adversarialRequests) {
    let profile
    const service = new TutorService({
      requestTurn: async (_history, _provider, receivedProfile) => {
        profile = receivedProfile
        return { reply_text: 'Use this corrected sentence. Please try again.', native_support: 'Try once more.', corrections: [], new_words: [], next_action: 'practice' }
      },
    })
    await service.startSession({
      language: 'Spanish', languageCode: 'es', nativeLanguage: 'English', level: 'A1',
      lessonOrRoleplay: { kind: 'lesson', title: 'Food', section: 'Food' },
      tutor: 'Ari', mode: 'strict',
    })
    await service.sendUserTurn(request)
    const response = await service.getTutorTurn()
    assert.match(profile.teachingInstructions, /Never mock, shame, threaten, or insult/)
    assert.equal(response.safeguard, undefined)
    assert.doesNotMatch(response.reply, /\b(?:stupid|worthless|hopeless|pathetic)\b/i)
    assert.equal(response.verification, 'unverified')
  }
})

test('distress and safe-word signals bypass model generation and return a calm reset', async () => {
  for (const text of ['ease up', 'I am panicking', 'I can’t do this anymore', 'I want to hurt myself']) {
    assert.equal(detectDistress(text), true)
    const service = new TutorService({
      requestTurn: async () => { throw new Error('The model must not be called after a distress signal.') },
    })
    await service.startSession({
      language: 'Spanish', languageCode: 'es', nativeLanguage: 'English', level: 'A1',
      tutor: 'Ari', mode: 'strict',
    })
    await service.sendUserTurn(text)
    const response = await service.getTutorTurn()
    assert.ok(response.reply.includes('pause'))
    assert.equal(response.correction, null)
    assert.equal(response.safeguard, text === 'ease up' ? 'safe-word' : 'distress')
    assert.equal(response.cooldown, true)
  }
})

test('response validator rejects excessive Soft corrections, forged sources, and personal attacks', () => {
  const twoCorrections = tutorTurn([
    { original: 'a', corrected: 'b', explanation: 'Grammar.' },
    { original: 'c', corrected: 'd', explanation: 'Grammar.' },
  ])
  assert.throws(() => validateTeachingResponse(twoCorrections, 'soft'), /required safe output contract/)
  assert.throws(() => validateTeachingResponse({ ...tutorTurn(), grounded: true }, 'balanced'), /required safe output contract/)
  assert.throws(() => validateTeachingResponse({ ...tutorTurn(), reply: 'You are worthless.' }, 'strict'), /required safe output contract/)
})
