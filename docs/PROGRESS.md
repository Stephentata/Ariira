# Tutor learning system progress

## M1 — Data foundation

**Status:** Complete; starter lesson content is not approved for learners.

### Works

- JSON Schemas define lessons, vocabulary items, exercises, whiteboard cards, and roleplay scenarios.
- Three English-to-Mandarin A1 lessons are stored as versioned JSON data in one greetings and introductions unit.
- Every lesson is marked `reviewed: false`. Content must not be surfaced to learners until a qualified human reviewer verifies it and reviewer metadata is recorded.
- `npm run validate:lessons` validates all lesson files against the schemas.
- `npm test` checks the sample data and rejects invalid levels, incomplete vocabulary, and missing review metadata.

### Still missing

- Qualified human review of the Mandarin lesson content.

### Known problems

- Sample vocabulary and answer keys are illustrative and unreviewed; do not rely on them as authoritative language instruction.
- No audio or images are bundled with the starter lessons.

## M2 — Text lesson player

**Status:** Implemented and verified in the local development preview. The unreviewed sample is hidden outside development mode.

### Works

- The home lesson card opens a six-stage text flow: warm-up, whiteboard teaching, guided practice, roleplay, recap, and save.
- Learners can submit text to Ira's deterministic mock tutor, repeat or skip stages, exit, and resume at the saved stage.
- The whiteboard renders structured vocabulary, grammar, dialogue, sound, word-order, and summary cards from lesson data; card shapes are checked before rendering.
- Session progress is saved in browser storage. Invalid or unavailable saved progress is reported rather than silently treated as successful.
- Guided practice is explicitly not scored; answer checking and exercises remain in M3.
- The sample lesson player is development-only because the Mandarin content is unreviewed. Its preview displays a clear warning and does not update learner mastery or review data.

### Verification

- `npm test`: 10 tests passed, including a complete mock-tutor lesson flow, skipping/repeating stages, resuming saved progress, malformed progress handling, and M1 schema validation.
- `npm run validate:lessons`: all 3 sample lessons passed; all remain marked unreviewed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Manual browser check: opened the text lesson, sent a warm-up response to mock Ira, advanced to the whiteboard, and confirmed the lesson card displayed.
- `git diff --check`: passed.

### Manual test checklist

1. Start the app in development mode and choose **Open text lesson** from Home.
2. Confirm the unreviewed-content warning is visible.
3. Type a response during Warm-up and send it; confirm Ira returns a predictable, unscored reply.
4. Choose **Next step** and confirm the whiteboard shows the lesson's vocabulary card.
5. Repeat a stage, skip a stage, and use **Back to home** partway through.
6. Open the text lesson again and confirm it resumes at the saved stage.
7. Continue to **Save & finish**, then confirm the completion screen says progress is saved on this device.
8. Confirm the voice tutor still opens separately from the home card.

### Still missing / known problems

- Qualified human review is required before the sample lesson can be used for teaching or exposed to learners.
- Guided practice and roleplay use mock replies only; exercise types, code-checked answers, and genuine tutor conversation are later milestones.
- Session data is local to this browser and is not synced to an account.
- No audio or images are bundled with the starter lessons.

## M3 — Exercises

**Status:** Implemented and verified. Exercises remain part of the unreviewed, development-only sample.

### Works

- The lesson player supports all nine closed exercise types from the specification: multiple choice, listen and choose, listen and type, fill in the blank, sentence building, native-to-target translation, target-to-native translation, matching pairs, and spot the mistake.
- Correctness is determined only by the lesson's fixed `answer_key` and `accepted_variants`; the tutor does not grade exercise answers.
- Text answers compare without case, whitespace, or punctuation differences; pair matching checks every key and value; sentence blocks must be able to form the answer.
- Incorrect answers show the expected answer and the lesson's explanation. Learners can request more detail, view a hint, retry, and continue after a correct response.
- Listening examples use optional browser speech synthesis of lesson text. There are no recordings, uploaded audio, or stored audio; browser playback failures are reported while text interaction remains available.
- Exercise position is saved on the device without storing the learner's raw answer. Existing M2 saved sessions without an exercise position resume at the first exercise.
- Exercise schema conditions validate the structured fields required by listening, choice, matching, and sentence-building exercises.
- The lesson remains `reviewed: false` and is only available in development mode with an explicit unreviewed-content warning.

### Verification

- `npm test`: 19 tests passed, covering schema validation, all nine exercise types, fixed-key answer checks, accepted variants, incomplete or extra matching pairs, invalid exercise data, session persistence, and M2 session migration.
- `npm run validate:lessons`: all 3 lesson files passed; all remain unreviewed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Manual browser check: wrong multiple-choice answer displayed the expected answer and explanation; **Explain more** opened the lesson detail; correct answer advanced to the second, listening exercise.
- `git diff --check`: passed.

### Manual test checklist

1. In development mode, open **Open text lesson** from Home and confirm the unreviewed-content warning.
2. Advance to **A little guided practice**.
3. Choose an incorrect option; confirm the answer and explanation appear, then open **Explain more**.
4. Retry with the correct choice and choose **Next exercise**.
5. Use **Hear prompt** on the listening exercise; if browser speech is unavailable, confirm a clear notice appears and the text controls still work.
6. Try each exercise by following its prompt; verify a wrong response can be retried and the lesson only advances after a correct answer or an explicit stage skip.
7. Leave and reopen the player during practice; confirm the exercise position resumes without any typed answer being restored.

### Still missing / known problems

- Qualified human review is required before any Mandarin example is used as instruction.
- Listening playback depends on browser-installed voices; it is not a pronunciation assessment or recorded model audio.
- The checker does not yet implement AI-evaluated open answers, spoken learner responses, or broader exercise types 10–13.
- Exercise results do not yet affect learner mastery or the vocabulary review queue.
