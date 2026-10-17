# AI TUTOR LEARNING SYSTEM: SPECIFICATION

> Save this file in your project folder as `TUTOR_SPEC.md`. It is the full specification for Mode A (AI Language Learning). Do NOT ask the coding agent to build everything at once. Follow Section 18 (milestones) one milestone at a time.

---

## 0. INSTRUCTIONS FOR THE CODING AGENT (READ FIRST)

1. Read this entire file, then summarise your understanding in 10 lines or fewer and WAIT for approval.
2. Work on ONE milestone at a time (Section 18). Do not start the next milestone without approval.
3. For every milestone: inspect existing code, propose a short plan, wait for approval, implement, run tests, show the test output, then commit to Git.
4. Never mark a feature complete without showing passing tests or a working demonstration.
5. Use mock AI providers first (Section 15). Real AI models are connected only when a milestone says so.
6. All lesson content (vocabulary, grammar, correct answers) lives in versioned data files that a human can review. The AI model must NEVER be the source of truth for correct answers in exercises. Code checks answers against the answer key.
7. Never put API keys in code. Use environment variables.
8. Ask the user a question whenever a requirement is unclear. Ask only one question at a time. The user is a complete beginner at programming, so explain decisions in plain English.
9. Do not copy any code, text, images, branding, characters, or protected assets from Tenmin or any other app. The product must be original. Use the other apps only as inspiration for features.

---

## 1. PRODUCT GOAL AND DESIGN PRINCIPLES

Build an AI language tutor that combines three things that existing apps usually split apart:

- **Conversation-first practice** (the strength of Tenmin, Speak, Praktika): short daily live sessions with a tutor who listens, responds, corrects, and adapts.
- **Structured curriculum** (the strength of Speak, Duolingo, Babbel): a clear path with units, objectives, and levels, so the learner always knows what comes next.
- **Full skills coverage** (a known weakness of Tenmin, which reviewers say is mostly speaking and listening, mostly beginner-level, and ignores the level chosen at sign-up): vocabulary, grammar, reading, writing, listening, speaking, and review with spaced repetition.

Principles:

1. **Ten-minute daily session** as the core habit loop. Longer sessions are allowed but never required.
2. **Level actually matters.** The chosen level must visibly change content, vocabulary, speed, and the tutor's language ratio.
3. **Learner talks more than the tutor.** Target at least 50 percent of session time as learner output.
4. **Honest feedback.** Pronunciation scores are approximate and must be labelled as such. Never claim certainty the system does not have.
5. **Privacy by default.** Audio is not stored unless the learner opts in. The learner can delete history and memory at any time.
6. **Works for a Chinese-speaking learner of English AND an English-speaking learner of Chinese** and for any supported pair. The interface language is separate from the native language, which is separate from the target language.

---

## 2. LEARNER PROFILE AND LANGUAGE SETUP

Each learner profile stores:

- `interface_language` (language of buttons and menus)
- `native_language` (used for explanations and translations)
- `target_language` (can have several, each with its own progress)
- `level` per target language: CEFR A1, A2, B1, B2 (C1 and C2 later)
- `goals` (travel, work, study, exams, family, culture, casual)
- `interests` (food, sports, technology, music, business, anime, and so on, chosen from a list plus free text)
- `daily_minutes_goal` (5, 10, 15, 20)
- `tutor_persona` (see Section 12)
- `privacy_settings` (save audio: off by default; save transcripts: on or off; memory: on or off)

Onboarding (maximum 2 minutes, skippable): choose target language, native language, goal, interests, then either "I know my level" or "Test my level" (Section 9).

---

## 3. CURRICULUM STRUCTURE

Hierarchy: **Language > Level > Unit (module) > Lesson (session) > Objective (can-do statement).**

- A **Level** follows CEFR (A1 to B2 first).
- A **Unit** is a theme with 5 to 8 lessons, for example "Introducing yourself", "Ordering food", "Asking for directions".
- A **Lesson** is one 10-minute session built from the session flow in Section 4.
- An **Objective** is a concrete can-do statement the learner can be tested on, for example "Can ask and answer 'what is your name' and 'where are you from'".

### 3.1 Starter A1 unit list (adapt per language; all content stored in data files)

1. Greetings and introductions
2. Numbers, age, and basic personal information
3. Family and people
4. Food and ordering at a restaurant
5. Shopping and prices
6. Daily routine and time
7. Places and asking for directions
8. Transport and travel basics
9. Hobbies and likes or dislikes
10. Health basics and emergencies

A2 continues with past events, plans, describing people and places, phone calls, work basics, and so on. B1 and B2 add opinions, storytelling, news discussion, workplace scenarios, and abstract topics. B1 and B2 content must actually exist. It is a known complaint that some competitors have almost no intermediate or advanced material.

### 3.2 Script and pronunciation support per language

- **Mandarin Chinese:** characters, pinyin with tone marks, tone practice, stroke order links later, simplified first and traditional later.
- **Japanese:** kana, kanji with furigana, romaji toggle, politeness levels.
- **Korean:** hangul, romanisation toggle, honorific levels.
- **Arabic:** right-to-left layout, optional vowel marks, transliteration toggle, and MSA with a note about dialects.
- **Others (English, French, Spanish, German, Portuguese):** IPA optional, gender and article tagging for nouns.
- Every vocabulary item can show: written form, transliteration, translation, word-by-word gloss, audio, and an example sentence. (Reviewers note that Tenmin added transliterations and word-by-word translations after launch. Build them in from the start.)

### 3.3 Lesson data file format (example, JSON)

```
{
  "id": "zh-a1-u01-l02",
  "language": "zh",
  "level": "A1",
  "unit": "greetings-introductions",
  "title": "Saying your name and where you are from",
  "objectives": ["introduce-name", "say-nationality"],
  "vocabulary": [
    {"id": "zh-wo", "text": "我", "transliteration": "wǒ", "translation_en": "I, me", "audio": null, "image": null},
    {"id": "zh-jiao", "text": "叫", "transliteration": "jiào", "translation_en": "to be called", "audio": null, "image": null}
  ],
  "grammar_point": {"id": "zh-wo-jiao", "explanation_en": "...", "pattern": "我叫 + name", "examples": []},
  "dialogues": [],
  "exercises": [],
  "roleplay": {"scenario_id": "meet-new-person", "success_criteria": ["says own name", "asks the other person's name"]}
}
```

All lesson files must be reviewed by a human who knows the language before release. If the AI model generates draft content, mark it `"reviewed": false` and the app must not show unreviewed content to real users.

---

## 4. THE 10-MINUTE SESSION FLOW (STATE MACHINE)

Each lesson runs through these stages in order. The learner can skip, repeat, or exit at any point and resume later.

Stage
Time
What happens

1. Warm-up recall
~1.5 min
The tutor greets the learner (in the target language at the right ratio) and quizzes 3 to 5 due words or phrases from spaced repetition (Section 8).

2. Teach on the whiteboard
~2 min
The tutor presents 3 to 5 new items with text, transliteration, translation, audio, and an image or icon. Includes one short grammar point with 2 examples.

3. Guided practice
~2.5 min
A mix of 4 to 6 short exercises (Section 6): listen and choose, fill the blank, repeat after the tutor, build a sentence.

4. Roleplay / conversation
~3 min
The learner uses the new language in a scenario (Section 12). The tutor stays within the learner's level.

5. Feedback and recap
~1 min
The tutor summarises: what went well, the top 1 to 3 corrections, new words added to the review deck, and a preview of the next lesson.

6. Save
instant
Store session results, update mastery, schedule reviews, and optionally save the transcript.

Modes inside a session: **text** or **voice** (hold-to-speak or tap-to-toggle), switchable at any time. Voice is not mandatory, so users in noisy places can type.

---

## 5. THE WHITEBOARD (VISUAL TEACHING AREA)

The screen has a conversation area and a whiteboard area. The tutor fills the whiteboard with structured **cards**, not free-form drawing. Card types:

- `vocab_card`: word, transliteration, translation, audio button, image or icon, example sentence.
- `grammar_card`: pattern, short explanation in the native language, 2 to 3 examples with the pattern highlighted.
- `dialogue_card`: short model dialogue with replayable lines.
- `tone_or_sound_card`: pitch/tone contour (Chinese) or mouth-position tip for a difficult sound.
- `word_order_card`: draggable word blocks.
- `summary_card`: end-of-session recap.

The LLM may output card content only as validated JSON that matches a schema. Code validates it before display. Invalid output is rejected and retried once, then a safe fallback is shown.

Images: use only openly licensed or self-generated images and simple icons. Record the license for every image in the data file. Do not scrape images from other apps.

---

## 6. EXERCISE TYPES

Every exercise has: `id`, `type`, `skill` (listening, speaking, reading, writing, vocabulary, grammar), `objective_id`, `difficulty` (1 to 5), `prompt`, `answer_key`, `accepted_variants`, `explanation`, and `hint`.

Types to implement over time:

1. Multiple choice (text or image)
2. Listen and choose
3. Listen and type (dictation)
4. Fill in the blank
5. Sentence building (drag word blocks)
6. Translate native to target
7. Translate target to native
8. Match pairs
9. Spot the mistake
10. Repeat after the tutor (speaking, uses Section 7 feedback)
11. Answer the question aloud (open speaking, scored on meaning and grammar)
12. Short writing task (1 to 3 sentences, corrected by the tutor)
13. Short reading passage with comprehension questions

Rules:

- Closed exercises (types 1 to 9) are checked **by code** against the answer key and accepted variants. The AI model is not used to decide right or wrong on these.
- Open exercises (types 11, 12) are evaluated by the AI model using a fixed rubric, and the result is shown with a confidence note.
- A wrong answer always shows a short explanation, and the learner can tap "Explain more" for an AI explanation (similar in spirit to Duolingo's "Explain My Answer").

---

## 7. FEEDBACK SYSTEM

### 7.1 Grammar and vocabulary correction (during conversation)

Rules for the tutor:

- Correct at most **one or two** errors per learner turn so the learner is not overwhelmed. Prioritise errors that block meaning, then errors on the current lesson's target pattern.
- Default technique: **recast** (naturally repeat the correct form inside the reply). Use **explicit correction** when the same error repeats or the learner asks for it.
- Format of an explicit correction: what you said, a better version, a one-line reason in the native language (at A1 and A2).
- Never shame. Praise specific things done well.
- Log every error with its category (tense, word order, article, tone, vocabulary, and so on) to build the learner's **error profile** (Section 9).

### 7.2 Pronunciation feedback (use appropriate technology)

Ordinary speech recognition does not score pronunciation reliably. Use three tiers and label each result honestly:

- **Tier 1, basic (local, free):** compare what speech-to-text heard with the target sentence (for example Whisper locally). A match suggests intelligibility. A mismatch flags words to retry. Show it as "Understood / Try again", NOT as a numeric accuracy score.
- **Tier 2, phoneme-level (local, free, experimental):** evaluate open-source phoneme-level approaches (for example wav2vec2-based tools). One open-source project found during research (OpenPronounce) is English-only and notes the underlying model was trained on adult read speech, so it must be benchmarked before being trusted. Treat as experimental per language.
- **Tier 3, cloud assessment (optional, paid, user opt-in):** services such as Azure Pronunciation Assessment offer phoneme-level scoring with accuracy, fluency, and prosody. Language support, pricing, and availability in mainland China must be verified before adoption.

Requirements:

- Build a `PronunciationProvider` interface (Section 15) so tiers can be swapped.
- Show feedback at word level: highlight the problem word, play the learner's audio next to a model audio, and give one concrete tip.
- For Mandarin, give tone-specific feedback only if the chosen provider can actually measure tone. Otherwise say tone feedback is not available.
- Run a benchmark test with real recorded audio (native and non-native speakers) before enabling any score in the user interface. Record results in `docs/pronunciation-benchmark.md`.

---

## 8. VOCABULARY AND SPACED REPETITION

- Every new word and phrase from a lesson goes into the learner's **review deck** automatically.
- Words the learner got wrong in exercises or used incorrectly in conversation are added or re-prioritised.
- Learners can also save any word from a conversation or from the translator (Mode B) with one tap.
- Scheduling: start with a simple, well-documented algorithm (SM-2 style intervals). Design the module so it can be replaced by a more modern algorithm such as FSRS later.
- Card states: `new`, `learning`, `review`, `mastered`, `lapsed`.
- Daily review queue is capped (default 20 cards) to avoid overwhelm, and it feeds the warm-up stage.
- Review modes: flashcard, listen and type, speak the word, use in a sentence.
- Each card stores: item id, due date, interval, ease or stability value, lapse count, last result, and source (lesson, conversation, translator).

---

## 9. PLACEMENT, PERSONALISATION, AND ADAPTIVE DIFFICULTY

### 9.1 Placement test (optional, 5 to 8 minutes)

Adaptive: start at A2, step up after correct answers and down after errors. Include listening, reading, vocabulary, grammar, and 2 short speaking prompts. Output: a suggested CEFR level with a confidence note, which the learner can accept or change.

### 9.2 Learner model

For each learner and language, track:

- **Objective mastery** (0 to 100 per can-do objective, updated after every relevant exercise or conversation turn).
- **Skill scores** per skill (listening, speaking, reading, writing, vocabulary, grammar).
- **Error profile** (top recurring error categories).
- **Interests and goals** (used to choose scenario themes).
- **Speed and confidence signals** (response time, hint use, number of retries).

### 9.3 Adaptation rules (start simple, document each rule)

- Three strong results in a row on an objective: raise difficulty or move on.
- Two or more failures: slow down, add a hint, re-teach with a new example, and schedule an extra review.
- The tutor's **target-language ratio** follows the level: A0 about 20 to 60 percent target language with native-language support (a wider band for short beginner replies), A1 about 30 to 50 percent, A2 about 50 to 70 percent, B1 about 70 to 90 percent, B2 nearly all target language.
- Vocabulary and sentence length in tutor replies must stay inside the learner's level. If the tutor uses a word above the level, it must gloss it.
- The learner can override: "slower", "simpler", "explain in my language", "harder".

---

## 10. TUTOR BEHAVIOUR (SYSTEM PROMPT TEMPLATE FOR THE LLM)

Use a template like the following. The code fills the `{placeholders}` from the learner profile and current lesson.

```
You are {tutor_name}, a friendly, patient language tutor.
Learner: native language {native_language}, learning {target_language} at CEFR level {level}.
Goals: {goals}. Interests: {interests}.
Current lesson: {lesson_title}. Objectives: {objectives}.
Target vocabulary: {vocab_list}. Target grammar: {grammar_point}.
Learner's recurring errors: {error_profile}.
Things the learner told you earlier (memory): {memory_summary}.

Rules:
1. Keep replies SHORT (1 to 3 sentences) and end with a question or a prompt for the learner to speak or write.
2. Use about {target_language_ratio} percent {target_language}. Use {native_language} only for brief explanations.
3. Stay inside the vocabulary and grammar for level {level}. If you must use a harder word, explain it.
4. Correct at most two errors per learner turn. Prefer natural recasts. Explain briefly in {native_language} at A1 and A2.
5. Steer the conversation toward the target vocabulary and grammar without making it feel like a drill.
6. Praise something specific when the learner does well.
7. Never invent grammar rules. If you are not sure, say so and suggest checking the lesson notes.
8. Never claim to be human. Never discuss unsafe, sexual, or harmful topics. Redirect politely to the lesson.
9. When asked to show something on the whiteboard, output a card as JSON matching the card schema, and nothing else.
10. Output format for each turn: a JSON object with fields "reply_text", "corrections" (list), "new_words" (list), "whiteboard_card" (optional), "next_action".
```

Notes for the agent:

- Small local models (about 7B parameters) can make grammar mistakes and produce unnatural text in Chinese, Japanese, Korean, and Arabic. Add automated checks: valid JSON, reply length limit, language-ratio check, and a banned-topics filter. Log failures. Benchmark each language before offering it to learners.
- Keep conversation context short: the system prompt plus the last 6 to 10 turns plus the memory summary. Do not send the whole history.

---

## 11. CONVERSATION HISTORY AND MEMORY

- Store transcripts per session (text, corrections, new words, timestamps). Transcript saving is a setting. If off, store only the learning results (scores, mastery, review cards) and no raw text.
- **Memory summary:** a short, learner-visible list of facts (name, job, hobbies, goals, upcoming trips) that the tutor can use to personalise chat. The learner can edit or delete any item or turn memory off.
- **Session summary** stored after each lesson: topics covered, wins, top errors, next-step recommendation.
- History screen: list sessions, open a transcript, replay audio (only if the learner opted in to saving audio), and tap a word to save it.
- Export and delete: the learner can export or permanently delete all data.

---

## 12. LEARNING MODES AND SCENARIOS

1. **Guided Lesson** (default): the Section 4 flow.
2. **Roleplay:** scenario cards with a goal, for example order at a restaurant, check in at a hotel, job interview, ask for directions, return an item, make a doctor appointment, meet a neighbour, a phone call. Each has `level`, `success_criteria`, `useful_phrases`, and an end summary of how well the goals were met.
3. **Free Chat:** open conversation about the learner's interests, still level-adapted, with gentle corrections.
4. **Review Mode:** spaced-repetition cards only.
5. **Topic of the Day** (later milestone): a short article or news item rewritten at the learner's level with comprehension questions. Needs a legal content source. Use only licensed or self-written content, and verify rights before use.
6. **Pronunciation Practice:** focused repetition on difficult sounds, using Section 7.2.
7. **Custom Tutor** (later milestone): the learner chooses a tutor name, personality (patient, funny, strict, formal), and voice. Warn the learner that some voices may sound less natural in certain languages. (Reviews of the competitor's custom tutors mention strange accents. Test each voice in each language before offering it.)

Optional later: multiple tutor characters, group practice, and human-tutor handoff.

---

## 13. PROGRESS TRACKING AND MOTIVATION

Dashboard:

- Minutes studied (today, this week, total) against the daily goal
- Current streak and longest streak, with a "streak freeze" option and no guilt-based messages
- Words learned and words due for review
- Objective mastery by unit with a visible progress path
- Skill radar (listening, speaking, reading, writing, vocabulary, grammar)
- Speaking time and number of sentences spoken
- Most common mistakes and a button to practise them
- Weekly summary and estimated CEFR progress, labelled as an estimate

Motivation: gentle reminders (opt-in), achievements for real milestones, and no manipulative dark patterns.

---

## 14. DATA MODEL (OUTLINE)

Tables or collections: `users`, `learner_profiles`, `languages`, `units`, `lessons`, `objectives`, `vocab_items`, `exercises`, `scenarios`, `sessions`, `session_turns`, `corrections`, `review_cards`, `objective_mastery`, `error_profile`, `memory_items`, `settings`, `audit_log`.

Start with a simple local database (for example SQLite) behind a repository layer so it can move to a hosted database later without rewriting features. Do not store passwords in plain text. Do not store audio unless opted in.

---

## 15. MODULAR AI SERVICE INTERFACES

Create these interfaces first, each with a **mock** implementation (returns fixed, predictable answers for tests) and a **local** implementation:

- `LLMProvider.chat(messages, schema) -> structured_response` (local default: Ollama)
- `STTProvider.transcribe(audio, language) -> text, confidence` (local default: Whisper-family model)
- `TTSProvider.speak(text, language, voice, speed) -> audio` (local default: an open-source offline voice engine)
- `PronunciationProvider.assess(audio, reference_text, language) -> result, confidence`
- `LanguageDetector.detect(text_or_audio) -> language, confidence`

Rules: the rest of the app only talks to the interfaces. Provider choice is a configuration setting per language and per region. Every provider call logs latency and errors. If a provider is unavailable, the app degrades gracefully (for example, falls back to text mode) and tells the user.

Mainland China note: do not assume international AI services are reachable there. Keep provider selection configurable by region so local Chinese services can be added without changing the lesson logic.

---

## 16. SAFETY, PRIVACY, AND QUALITY CONTROLS

- Curriculum content comes from reviewed data files. The LLM handles conversation and explanations, not the answer key.
- Content filter on both learner input and tutor output. The tutor refuses unsafe topics and redirects to the lesson.
- Age: if the learner may be a minor, use age-appropriate content and the strictest privacy defaults. Verify legal requirements per market before launch.
- Voice data: off by default, clear consent screen, easy deletion.
- Never tell the learner the tutor is perfect. Include a "Report a mistake" button on every tutor message and every exercise.
- Log tutor errors reported by users and use them to improve prompts and lesson files.

---

## 17. TESTING AND ACCEPTANCE CRITERIA

For every milestone the agent must show evidence:

- Unit tests for scheduling logic, answer checking, mastery updates, and schema validation.
- Tests using the mock providers for the full session flow.
- Tests that invalid LLM output (bad JSON, too long, wrong language) is rejected and handled.
- Manual test checklist for the user to run, written in plain English.
- For voice and pronunciation: real recorded audio tests with results recorded in `docs/`.
- For each language: a short native-speaker review checklist for content and tutor replies before that language is marked as supported.

---

## 18. MILESTONES (BUILD IN THIS ORDER, ONE AT A TIME)

1. **M1 Data foundation.** Define the JSON schemas (lesson, vocabulary, exercise, card, scenario) and create ONE sample A1 unit with 3 lessons in ONE language pair. Add a validator script and tests.
2. **M2 Text lesson player.** Build the lesson flow (Section 4) in text only, with mock AI and a simple whiteboard that shows cards.
3. **M3 Exercises.** Implement exercise types 1 to 9 with code-checked answers, plus hints and explanations.
4. **M4 Vocabulary and review.** Implement the review deck and scheduling, the daily queue, and the warm-up stage.
5. **M5 Tutor chat with local LLM.** Connect `LLMProvider` to Ollama. Add the Section 10 prompt, structured output validation, corrections, and the language-ratio logic. Benchmark and document quality.
6. **M6 Voice.** Add speech recognition and spoken tutor replies with hold-to-speak. Measure latency and handle microphone permission errors.
7. **M7 Pronunciation.** Implement Tier 1 first. Benchmark Tier 2 with real audio. Only then decide what the user interface may show.
8. **M8 Progress and personalisation.** Mastery tracking, error profile, adaptive rules, dashboard, memory summary, and history.
9. **M9 Placement test and onboarding.**
10. **M10 Roleplay scenarios and Free Chat, then writing and reading tasks.**
11. **M11 More languages and levels.** Add languages one at a time with a native-speaker review.

After each milestone, the agent must update `docs/PROGRESS.md` with what works, what was tested, what is still missing, and known problems.

---

## 19. FEATURES TO CONSIDER LATER

- Video-style avatar tutor (inspired by avatar-led apps, but costly to run)
- Peer practice rooms with other learners
- Exam preparation modes
- Integrated reading library with tap-to-translate
- Offline mode for lessons and review
- Teacher or classroom dashboard
- Human tutor integration