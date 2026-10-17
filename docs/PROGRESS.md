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

## M13 — Ari logo and color system

**Status:** The provided Ari app icon is used for the app brand and browser icon. Shared light and dark theme tokens now use the supplied deep-teal-to-mint palette, and previous blue/purple interface accents were recolored to match. Error feedback retains its distinct red treatment for clarity.
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
- Exercise results do not yet update mastery or reprioritize the review queue; review scheduling currently uses self-ratings.

## M4 — Vocabulary and review

**Status:** Implemented and verified in the local development preview. Review data is device-local; lesson-derived Mandarin remains unreviewed and development-only.

### Works

- Completing the lesson whiteboard stage adds its vocabulary to the local review deck once; skipping the teaching stage does not add unseen words.
- Review cards persist their due date, interval, ease, repetition count, lapse count, last rating, state, and source in browser storage.
- The SM-2-style scheduler supports Again, Hard, Good, and Easy ratings, with a short Again retry, increasing intervals, and a minimum ease factor.
- A local-calendar daily limit prevents more than 20 cards from being rated in one day, including across review-page visits. Review timestamps are stored with the cards, and remaining due cards stay queued for another day.
- The Vocabulary page includes flashcards, listen-and-type, spoken-word practice, and use-in-a-sentence modes. Browser speech features explain availability and privacy limits; learner audio is not stored by Ari.
- The lesson warm-up presents up to five due words from the same capped review queue. When no card is due, it clearly allows the lesson to continue without a review.
- Damaged deck or daily-limit data is reported; it is not silently reset or presented as an empty, successful review.
- Sample vocabulary and UI are loaded only in development. The words remain visibly marked unreviewed and are not included in the production JavaScript bundle.

### Verification

- `npm test`: 29 tests passed, including scheduling intervals, lapsed cards, duplicate-safe lesson vocabulary addition, daily-cap persistence/reset, saved-card migration, malformed saved progress, and the previous M1–M3 tests.
- `npm run validate:lessons`: all 3 lesson files passed; all remain unreviewed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Manual browser check: advancing from the whiteboard added two lesson words to the deck; the review page showed both as due; rating one Good scheduled it for later; the next lesson warm-up offered the remaining due word.
- `git diff --check`: passed.

### Manual test checklist

1. Open a lesson and check that its warm-up does not show words you have not learned yet.
2. Advance to the whiteboard, then continue to practice; confirm the lesson vocabulary is added to the Vocabulary page.
3. Reveal a flashcard meaning, rate recall, and confirm that the due queue advances.
4. Try Listen & type, Speak the word, and Use in a sentence; confirm the prompt and browser capability or privacy notice for each.
5. Rate up to 20 cards, then confirm the app reports the daily limit and leaves remaining cards for tomorrow.
6. Reopen the app on the same day and confirm the daily count and scheduled card dates persist.
7. Confirm the sample-content warning remains visible and the sample words do not appear in a production build.

### Still missing / known problems

- Mandarin sample words remain unreviewed; they must not be used as trusted instruction.
- Speech playback and speech recognition depend on browser voices and speech services. Recognition is approximate and may send audio according to the browser provider's privacy policy; Ari does not store learner recordings.
- The local deck currently adds vocabulary from the lesson whiteboard stage. Words saved from tutor conversations or the translator, account sync, and an FSRS scheduler are not implemented.
- Incorrect exercise answers and tutor corrections do not yet reprioritize review cards.

## M5 — Tutor chat with local LLM

**Status:** Local development is verified with Ollama. Production is wired through a Cloudflare Pages Function to Workers AI; live inference still requires the deployment smoke test. The prototype is not approved as authoritative Mandarin instruction.

### Works

- Tutor chat uses the `LLMProvider` interface. Local development uses Ollama through the Vite development proxy. Production uses a Cloudflare Pages Function and a Cloudflare Workers AI binding; the Function adapts the existing Ollama-shaped request to Workers AI JSON-schema mode and returns the provider-compatible response shape.
- Ira's Section 10 prompt is filled from a learner profile, lesson context, vocabulary, grammar point, error profile, memory summary, and CEFR level. The current profile is a fixed English-to-Mandarin A1 café practice profile.
- The prompt and checker apply level-based target-language ratios (A1 30–50%, A2 50–70%, B1 70–90%, B2 90–100%). The check measures Han characters against English letters in the Mandarin reply and its brief English support, with a 4-percentage-point tolerance for this heuristic.
- The model receives a strict structured-output schema. The app validates JSON shape, reply length and sentence count, a two-correction limit, new-word data, optional whiteboard cards against the lesson card types, safe-topic terms, and language ratio before displaying a reply.
- Corrections, new words, and optional whiteboard cards appear in the transcript as explicitly AI-generated content. They do not change exercise answer keys or automatically enter the review deck.
- The request includes at most the latest 16 chat messages plus the system prompt. Chat history is kept in page memory only; it is not persisted.
- Provider success/failure logs include model and latency without logging conversation text. Invalid provider replies are reported in the UI with a retry action; there is no success-shaped fallback.
- The Pages Function validates bounded chat input, maps the schema into Workers AI JSON mode, fixes the production model to `@cf/meta/llama-3.1-8b-instruct`, and returns errors instead of fabricating a reply.

### Verification

- `npm test`: 36 tests passed, including mock-provider requests, invalid JSON and provider errors, structured-response rejection, prompt ratios, safe redirects, context bounds, and the previous M1–M4 tests.
- `npm run validate:lessons`: all 3 sample lessons passed; all remain unreviewed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run benchmark:tutor`: 3/3 English-to-Mandarin A1 café turns passed the automated response checks on `qwen2.5-coder:7b`. Measured provider latencies were 886 ms, 687 ms, and 674 ms (749 ms mean); measured ratios were 27%, 27%, and 32%. The first two pass only with the documented 4-point heuristic tolerance.
- Browser check: a typed coffee order and a milk follow-up received context-aware local-model replies with generated pinyin and English support. A stubbed response also verified correction, new-word, and whiteboard rendering.
- `git diff --check`: passed.
- Pages Function unit tests cover Workers AI request mapping, missing binding, malformed/oversized requests, and inference failures. Production inference remains to be smoke-tested after deployment.

### Manual test checklist

1. Run Ollama locally with the configured model, then start Ari in development mode.
2. Open **AI tutor**, expand **View transcript or type instead**, and ask for a coffee.
3. Ask a follow-up about milk; confirm Ira uses the earlier order in her response.
4. Confirm generated Chinese, pinyin, English support, and any correction or vocabulary panels appear in the transcript.
5. Ask a safe-topic-blocked phrase such as how to say “weapon”; confirm Ari redirects without sending that message to the model.
6. Stop Ollama and send a message; confirm Ari reports the connection error and offers **Try again** instead of inventing a reply.
7. Run `npm run benchmark:tutor` to repeat the three-turn automated benchmark. Set `OLLAMA_MODEL` or `OLLAMA_URL` only when testing another local Ollama model or endpoint.

### Still missing / known problems

- The benchmark checks formatting, response length, safety keywords, and a script-based language ratio; it does not establish grammatical accuracy, cultural naturalness, or teaching quality. A qualified Mandarin speaker must review the model's replies before the language can be represented as supported instruction.
- The benchmark model is a locally installed coder-tuned 7B model. It sometimes falls just outside the nominal A1 ratio, so the small tolerance is necessary; a different model may need a fresh benchmark and threshold review.
- The safety check is a lightweight keyword filter, not a comprehensive content-safety system. It can produce false positives and cannot guarantee that every unsafe request or answer is caught.
- Language-ratio measurement currently recognizes Mandarin Han characters and English letters only. Other language pairs need their own validated counting and review.
- The learner profile and lesson context are fixed for the café prototype. Persistent memory, transcript settings, user-configurable goals, and an account-backed tutor are not implemented.
- Production requires a Workers AI binding named `AI` on the Cloudflare Pages project; configure it in **Settings > Bindings**, then redeploy. Workers AI usage is subject to Cloudflare account limits and billing.
- AI-generated corrections and new words are not saved into review cards, and the transcript does not yet include a **Report a mistake** action.
- The sample Mandarin lessons remain unreviewed and are not used as authoritative tutor content.

## M6 — Voice

**Status:** Implemented and verified with mocked browser speech APIs. Real microphone/audio verification remains outstanding.

**Current UI:** Voice input uses tap-to-speak only. The Tap to chat / Hold to speak selector has been removed; hold-to-speak checks below document the earlier implementation and are not reachable from the app UI.

### Works

- The AI tutor uses a single tap-to-speak flow: it starts a spoken lesson, listens continuously, sends finalized speech turns, speaks Ira's Mandarin reply followed by its English support, and resumes listening after playback.
- Recognition and speech synthesis are stopped when the voice session ends or the learner leaves the tutor page.
- Microphone denial, missing microphone, blocked speech service, network failure, unsupported browser features, and no-speech capture have explicit feedback.
- Voice replies show the elapsed time from starting the tutor request until its reply is ready; this measurement excludes speech playback.
- Ari does not record or save microphone audio. The browser's speech service may process audio according to its own provider and privacy policy.

### Historical verification

- The original two-mode implementation passed 36 tests.
- `npm run lint`: passed.
- `npm run build`: passed.
- Browser simulation with mocked `SpeechRecognition`, speech synthesis, and tutor response: the former tap mode spoke Ira's welcome, accepted a simulated finalized turn, spoke the reply, and resumed listening. The former hold mode started recognition while pressed, submitted the finalized transcript on release, spoke Ira's Mandarin reply and English support, and displayed the latency indicator.
- Browser simulation of microphone permission denial displayed actionable guidance and returned the voice control to idle.
- No real microphone audio or recorded speech was tested.

### Manual test checklist

1. Use a supported browser (for example, current Chrome or Edge), allow microphone access, and start the development app with the local Ollama model available.
2. Open the tutor and tap **Press to speak**. Confirm Ira speaks the welcome and then listens.
3. Speak a short turn and pause; confirm the transcript appears, Ira replies aloud, a latency indicator appears before playback, and the listener resumes afterward.
4. While Ira is speaking, tap the Ira button and speak to confirm interruption.
5. Leave a voice capture without speaking; confirm the no-speech prompt appears and capture stops.
6. Deny microphone access (or use browser site settings to revoke it); confirm Ari explains how to restore permission.
7. Navigate away during a voice session; confirm recognition and speech playback stop.
8. Expand **View transcript or type instead** and confirm the text transcript remains available alongside voice interaction.

### Still missing / known problems

- Browser speech recognition is approximate and may send audio to the browser's speech provider; its availability and privacy behavior depend on the browser and platform.
- Real microphone/audio validation is still required on supported desktop and mobile browsers, including permission, backgrounding, and device-switching behavior.
- Ira's speech uses browser-installed speech synthesis voices, not a dedicated natural voice model. Mandarin pronunciation and voice quality depend on the selected system voice.
- **Superseded:** the experimental bust, procedural arms, and portrait stand-ins were removed from the app. The direction briefly pivoted to a Blender-built teal mascot blockout, then the model viewer was removed in favor of the simpler animated orb described in M12. The saved human draft remains at `D:\Downloads\IraNeutral.vroid` as a backup.
- The latency indicator measures only tutor response generation, not end-to-end time to the first spoken audio.

## M7 — Pronunciation

**Status:** Local Tier 1 implementation is in place; M7 remains incomplete until the local microphone path is verified and Tier 2 is evaluated with consented native and non-native recordings.

### Works

- Added `STTProvider` and `PronunciationProvider` contracts, a deterministic mock, and a local Whisper Tiny implementation using Transformers.js in a module worker.
- Vocabulary review's **Speak the word** mode explicitly records up to 10 seconds through `getUserMedia` and `MediaRecorder`, decodes and resamples the audio locally, then transcribes it with a pinned, quantized multilingual Whisper Tiny model. The first run downloads model files from Hugging Face; the browser cache can reuse them. Transcription runs on-device, not through the browser's remote speech-recognition service.
- The learner can stop the recording, read the local transcript, and compare **Understood** / **Try again** feedback against the reference. The result is text matching only, never a numeric score or confidence estimate.
- Mismatched words are highlighted and paired with one retry tip. Both learner audio (temporary in-memory object URL) and a browser-synthesized reference voice can be replayed for A/B comparison. The recording is not uploaded or persisted; the temporary URL is revoked when the learner changes mode or leaves the card.
- Permission-denied, missing-device, busy-device, unsupported-recorder, empty-audio, worker, and model errors are surfaced. Recording stops automatically after 10 seconds.
- Mandarin tone feedback remains explicitly unavailable.
- Added [the pronunciation benchmark record](./pronunciation-benchmark.md); it separates Tier 1 checks from the still-required Tier 2 research/benchmark.

### Verification

- `npm test`: 45 tests passed, including transcript normalization, match/mismatch feedback, word-level mismatch detection, unavailable tone feedback, local-provider integration, worker messages, and explicit invalid-input errors.
- `npm run lint`: passed.
- `npm run build`: passed.
- User-reported real-microphone Tier 1 test in an external browser: after Whisper Tiny loaded, a recording for target **再见** was transcribed locally as **三千** and correctly surfaced as **Try again**. This verifies that the local audio-to-text path ran on one sample; the mismatch is not evidence of a learner error or accuracy benchmark. Browser version and speaker background were not recorded, and the audio was not retained.
- Browser simulation before the local provider replacement tested only the old browser-recognizer transcript comparison. It is not evidence for local Whisper transcription.
- A prior user-reported real-microphone smoke test also used the old browser speech-recognition path, not the local model.
- No native/non-native Tier 2 audio dataset or benchmark result is available.

### Manual test checklist

1. Open the running development app in current Chrome or Edge on localhost or HTTPS. Choose **Vocabulary** → **Speak the word**.
2. Play **Hear example pronunciation**, click **Speak now**, allow microphone access, say the target, then click **Stop recording**.
3. On first use, wait for Whisper Tiny's model download and local transcription to finish. Confirm the recognized text and **Understood** / **Try again** feedback appear.
4. Compare **Your recording** with **Example pronunciation · browser voice**. Confirm the learner recording cannot be downloaded from the UI and is removed when leaving the card.
5. Say a different word; confirm only mismatched words are highlighted and no numeric score is shown.
6. Test denied permission, no microphone, another app holding the microphone, no speech, a browser offline after the first model download, and navigation away during capture.
7. Complete the Tier 2 benchmark described in [pronunciation-benchmark.md](./pronunciation-benchmark.md) using separate, consented native and non-native speakers before enabling any phoneme-level/tone feedback or score.

### Still missing / known problems

- The local model's first-user test succeeded end to end, but only one short learner recording has been tested. It does not measure recognition reliability across speakers, devices, and environments.
- The Whisper Tiny assets are downloaded from Hugging Face on first use. Model acquisition needs network access; actual transcription is local after the assets are cached. Device memory, compute, and download time vary.
- The local model is general-purpose ASR, not a pronunciation assessor. A transcript match is only a rough intelligibility signal; it is not evidence of correct accent, phonemes, or tones.
- Transcript-to-reference alignment is approximate and may mark errors in fluent speech or miss pronunciation errors.
- No real native/non-native recorded-audio set or Tier 2 phoneme-level model has been benchmarked. This is a required open item before M7 can be called complete.
- Tone-specific Mandarin feedback remains unsupported.
- Sample Mandarin vocabulary remains unreviewed and is still only for development prototype testing.

## M8 — Progress and personalisation

**Status:** Local progress tracking, learner personalisation, privacy controls, and responsive mobile views are implemented. Richer learning adaptation remains deferred.

### Works

- Replaced hard-coded progress and streak numbers with actual browser-local records. Practice time counts only while the lesson, tutor, or vocabulary activity is open and the page is visible; daily activity is retained for the most recent 90 days.
- The dashboard shows weekly active practice, current streak, lesson completions, review-deck size, mastered and due vocabulary, objective results, skill results, and frequent retry objectives.
- Code-checked lesson exercise attempts update objective and skill accuracy using the fixed lesson answer key. Incorrect attempts are counted by objective; no learner response text is stored.
- Objective suggestions use documented simple rules: three correct results in a row suggest moving on; two or more misses among the latest three suggest revisiting. Otherwise, the objective remains in progress.
- Progress, learner goals/interests, and up to 12 editable memory notes are stored in `localStorage`; the tutor prompt uses the saved personalisation when generating replies.
- Tutor transcript saving is off by default. When explicitly enabled, typed and transcribed tutor text is saved locally; audio is never saved. Learners can review/delete individual transcripts.
- Settings include JSON export and an explicit confirmation before deleting Ari-owned local-storage keys. Other applications' browser storage is left untouched.
- Invalid or damaged records are reported rather than silently reset. No account sync is introduced.
- The home dashboard's placeholder time, word, and streak counts now use local data too.
- Learners can configure a daily practice goal (5–120 minutes); the dashboard shows today's time toward that goal and the best streak within retained activity.
- Primary navigation includes Settings on mobile, with safe-area-aware bottom navigation and responsive tutor, progress, and settings layouts down to narrow phone widths.
- Practice timing stops while the page is backgrounded; time is recorded through the moment a tab becomes hidden.

### Verification

- `npm test`: 52 tests passed, including progress persistence, daily/weekly activity summaries, current and best streaks, objective and skill accuracy, adaptive suggestions, retry counts, daily-goal migration and validation, learner settings, opt-in transcripts, transcript deletion, Ari-only data deletion, and damaged-data handling.
- `npm run lint` and `npm run build`: passed.
- VS Code Problems reported no errors in the changed application files. Browser checks at 320 px, 390 px, and desktop widths found no horizontal page scrolling on Home, AI tutor, My progress, or Settings.

### Manual test checklist

1. Open the development app and note that progress starts at zero (or reflects records already saved in this browser).
2. Open **My progress** and confirm blank objectives and skills are clearly labeled as not attempted, not shown as completed.
3. Open the development text lesson, answer an exercise incorrectly, retry correctly, and revisit **My progress**. Confirm both attempts affect the objective/skill results and the retry appears as practice guidance.
4. Get three consecutive correct results for an objective and confirm the dashboard suggests moving to a new challenge.
5. Keep a learning page open and visible for at least 15 seconds; confirm practice time and the week's chart update. Hide the tab and confirm time through the moment it becomes hidden is saved, but background time is not counted.
6. Rate a review card and confirm deck, due, and mastered counts reflect the saved review data.
7. Complete a lesson and confirm the completion count updates once.
8. In **Settings**, add a goal, an interest, and a memory note; open the tutor and confirm Ira can use this context naturally.
9. Confirm tutor history is off by default. Turn it on, send a text or voice-transcribed tutor message, then review and delete its transcript from **My progress**. Turn history saving off and confirm future conversations are not added.
10. Export data and verify the downloaded JSON contains Ari-owned settings/progress. Use **Delete all Ari data**, confirm the prompt, and verify the app returns to a clean local state.
11. Refresh the page and confirm the records persist in this browser. Do not clear browser site data unless you intend to reset this local progress.
12. Test Home, Tutor, My progress, and Settings at 320 px and 390 px widths, then desktop width; confirm no horizontal page scrolling and that mobile navigation remains usable.
13. Change the daily goal in Settings and confirm today's progress updates against the new goal. Verify existing settings from before the goal was added still display the 15-minute default.

### Still missing / known problems

- Objective and skill percentages are estimated answer accuracy from code-checked lesson exercises, not a validated language proficiency or CEFR score. Unreviewed sample lesson results must not be treated as authoritative Mandarin mastery.
- Vocabulary review ratings affect the review scheduler but are not yet combined with exercise results into objective mastery.
- Active practice time measures time with a learning page visible, not attention or actual engagement; it can overcount idle time.
- The current sample lesson supports only a small number of objectives and skills. Objectives with no attempts remain unscored.
- Session summaries after a lesson, streak freezes, and automatic exercise difficulty changes are not implemented. The best streak only reflects the retained 90-day activity window. The dashboard recommends next steps rather than silently changing lesson content.
- Tutor transcript history stores text only; it does not preserve audio, timing, corrections, or generated whiteboard cards as structured history fields.

## M9 — Placement test and onboarding

**Status:** A settings-based first-setup flow and a limited, transparent Mandarin A1 orientation check are implemented. M9 is not a validated placement assessment and is not complete for learner launch.

### Works

- First-time users see a dismissible home welcome card that links to language, practice-goal, and orientation-check setup. They can also skip setup; completion persists locally and the welcome card stays dismissed.
- An optional, short onboarding conversation with Ira reuses Ari's configured local Ollama provider. It learns goals conversationally, asks one question at a time, has bounded turns, and provides a Settings handoff. It does not assign a level, change preferences automatically, or save chat history.
- Onboarding chat tells the learner it is sent to the configured local Ollama model and not saved as tutor history; provider and output-validation errors remain visible so the learner can continue in Settings without it.
- Settings now lets learners choose their explanation language and learning language; both choices persist locally and are used in Ira's tutor profile.
- The setup area includes an optional six-question check based on the current Mandarin greetings and introductions sample. It returns a practice suggestion without changing saved progress or claiming a CEFR level.
- The check is limited to Mandarin. For other target languages, Settings explains that no placement check is available yet.
- Older learner settings migrate to English explanations, Mandarin learning, and an unfinished onboarding state by default. Unsupported language codes and damaged preferences are rejected rather than silently accepted.

### Verification

- Placement logic tests cover all recommendation bands and reject incomplete or malformed answers. Onboarding-agent tests cover language-aware prompts, history/input limits, response validation, and provider failures.
- Learner settings tests cover language preference persistence, legacy defaults, onboarding completion persistence, and unsupported codes.
- `npm test`: 57 tests passed.
- `npm run lint` and `npm run build`: passed.
- Manual browser check: the local Ollama model answered a goal-setting message in the chat. At 320 px there was no horizontal overflow; chat contents remained ephemeral. Complete the six-item quiz, confirm each score band suggests an appropriate next practice step, verify the result does not change the level or progress, and check that selected language preferences survive refresh.

### Still missing / known problems

- The Mandarin A1 lesson examples are explicitly marked unreviewed. This short check is a prototype orientation aid only; it must not be used to place learners, set a CEFR level, or substantiate proficiency.
- No native-language-reviewed placement content, adaptive test, placement history, or post-test personalized curriculum exists yet. Onboarding is a small welcome card, optional conversational intake, and settings checklist—not a multi-step guided wizard.
- A production placement assessment requires reviewed content for each supported language and level, a documented scoring model, and evaluation with representative learners.

## M10 — Roleplay and open conversation (in progress)

**Status:** Mandarin sample roleplay scenes and learner-led Free Chat are available in the tutor. The sample text lesson now includes a passage-based reading check and a self-reviewed short-writing task. This is a prototype slice, not reviewed launch curriculum.

### Works

- The tutor offers three optional Mandarin A1 roleplay scenes with goals, phrase hints, an in-character local tutor prompt, and an end-of-scene learner self-review.
- Roleplay self-review is not an AI score and does not change level or progress. The learner can restart or leave a scene.
- Free Chat starts a separate conversation with no fixed café scenario or lesson objective. Learners can type, use the existing voice controls (which speak the active mode's opening), or select a couple of suggested ways to begin; Ira is prompted to follow safe everyday topics at the learner's level.
- Both modes reuse the local Ollama tutor, text/voice controls, corrections, and the existing tutor-history opt-in. Audio is not stored by Ari.
- Roleplay scenes are only shown as available for Mandarin. The UI labels their content as unreviewed development samples.
- The lesson roleplay stage can hand off to Ira's guided tutor using a scenario built from that lesson's title, goal, success criteria, vocabulary, and grammar notes. The lesson is advanced and saved at recap before navigating to the tutor.
- When a roleplay starts from a lesson, its self-review offers a return to the saved lesson recap or a vocabulary-review route for the lesson words. Retrying the scene preserves its lesson context; leaving roleplay, starting Free Chat, or changing languages clears that context.
- Lesson data supports `reading_comprehension` exercises with a passage and code-checked answer choices. The checker validates that a passage exists and scores only against the fixed lesson answer key.
- `short_writing` exercises accept an open-ended learner draft, show a possible example and self-review criteria, and do not automatically score the draft or update learner progress.
- The lesson practice stage mixes code-checked tasks with self-reviewed writing while recording only answer-key exercise outcomes.

### Verification

- Exercise and lesson schema tests cover reading passages, fixed-answer checks, and required writing self-review criteria.
- Tutor-provider tests cover free-chat and roleplay prompt constraints, safe-topic redirection, and structured response validation.
- `npm test`: 61 tests passed.
- `npm run lint` and `npm run build`: passed; TypeScript and VS Code Problems diagnostics reported no errors in the changed files.
- Browser check: at a 320 px viewport there was no horizontal overflow. A local Ollama reply followed the learner's Free Chat topic, and a roleplay turn could be sent and ended with the expected self-review and no score.
- Browser check: the French lesson handoff displayed lesson-derived vocabulary hints; after a learner turn, self-review appeared, retry retained the lesson context, returning restored the saved recap, and the recap's vocabulary action opened the review deck with the sample words.
- Current full suite: `npm test` passed all 79 tests.
- Desktop browser check at 1440 px also showed no horizontal overflow.
- Browser check at 390 px verified a fixed-answer reading response and self-reviewed writing draft through the end of the practice stage.

### Still missing / known problems

- Roleplay data is copied from unreviewed sample lessons and is not validated curriculum. The French handoff check used one short conversation; roleplay quality still needs broader review.
- Free Chat is currently available inside the Mandarin-focused tutor interface; language-neutral layouts and prompt quality across other language pairs have not been verified.
- The reading passage and short-writing task are additional unreviewed sample data, shown only in the prototype lesson preview. Do not use their results as validated curriculum or proficiency evidence.
- Short-writing drafts and self-review checkboxes are transient and are not saved as tutor history or structured progress. Free Chat and roleplay have no cross-device history or structured learning outcomes.
- Do not treat roleplay reflection, AI-generated corrections, or free-chat turns as proof of proficiency or mastery.

## M11 — French language expansion (in progress)

**Status:** French is supported for local-model Free Chat, one unreviewed A1 lesson preview, and a separate sample vocabulary review queue. Reviewed curriculum and placement checks are not available; this does not complete M11.

### Works

- Selecting French in Settings switches the tutor to a French-language opening and learner-led Free Chat. Tutor labels, transcript language, input prompt, browser speech voice, and native-language support playback follow the selected languages.
- The tutor prompt requests French conversation with concise support in the learner's explanation language. The current script-ratio check remains Mandarin-only: French and English both use Latin script, so character counts cannot establish which language a sentence uses. French replies still receive structure, length, and safe-topic validation, but are not automatically verified as French.
- The browser can use an available French speech-recognition locale selected in the voice input control. Actual voice recognition depends on browser/provider availability.
- Settings and Home distinguish French conversation practice from the Mandarin-only text lesson and placement check.
- A French A1 greetings/farewells lesson is available in the development preview. Its lesson data, whiteboard, fixed-answer practice, reading task, self-reviewed writing task, and mock roleplay use the shared lesson player. It is explicitly unreviewed and does not qualify as curriculum.
- The player selects the lesson by the learner's target language. French speech playback uses the French browser locale, French-only mock lesson replies are used, and fixed-answer outcomes/objectives/skills/error suggestions/lesson completions are stored separately by language. Existing unpartitioned progress remains the Mandarin record; practice-time totals remain language-neutral.
- The Progress page shows objective and skill outcomes for the selected target language. French attempts no longer leak into Mandarin results.
- Lesson words carry a language code in the shared review scheduler. Legacy untagged cards migrate as Mandarin; the Vocabulary page and lesson warm-up filter by the selected target language, speech playback/recognition use its locale, and rating French cards preserves other-language cards. French cards currently have the same scheduling but an independent due queue; the daily 20-card cap remains shared across languages.
- Local Whisper transcription maps `fr-FR` to French instead of silently forcing the English model language. The transcription helper supports English, French, and Mandarin explicitly and reports unsupported languages rather than mislabeling their audio.
- Pronunciation capture feeds Whisper from mono PCM sampled in the browser, avoiding browser-specific decoding failures for compressed MediaRecorder formats. The replayable recording remains temporary and local.

### Verification

- Tutor tests cover French prompt instructions, French response validation without the invalid script-ratio check, and a French safe-topic redirect.
- Learner settings tests verify French target-language persistence.
- `npm test`: 73 tests passed, including French exercise answer keys, French mock replies, and language-separated progress with legacy Mandarin-data compatibility.
- `npm run validate:lessons`: all four lesson files passed; all remain unreviewed.
- `npm run lint`, `npm run build`, `git diff --check`, and changed-file diagnostics: passed.
- Browser check at a 375 px effective viewport: Settings switched to French, the tutor showed its French opening with Pinyin hidden, and the configured local Ollama model answered a French conversation turn. No horizontal overflow occurred.
- Browser check: French preview opened through Home, displayed the unreviewed warning and French warm-up, rendered the French whiteboard cards and fixed-answer exercise, and returned to Home with the previous Mandarin setting restored.
- Browser check: advancing to the French whiteboard added language-tagged French words to the review deck; Vocabulary filtered to French and showed the French-only warning/cards. Settings and review/session storage were restored after the test.
- Pronunciation-provider tests verify explicit Whisper language selection for English, French, and Mandarin, and reject unsupported/empty locale values.
- Real-microphone French smoke test on 2026-10-12: reference `Bonjour`, local transcript `Bonjour!`, result **Understood**. This verifies one end-to-end recording only; it is not an accuracy benchmark.
- The browser test's opt-in transcript was deleted afterward; the previous saved learner settings were restored.

### Still missing / known problems

- No native French reviewer was available in this coding workflow. AI-generated French, the authored opening line, and existing French translator samples are not native-speaker-reviewed curriculum.
- The French sample lesson and roleplay have not been checked by a native speaker. Its authored pronunciation hints are rough prototypes, not reliable pronunciation guidance.
- No reviewed French vocabulary set or placement check exists. French sample words can be reviewed in their own queue, but remain unreviewed and have not been checked by a native speaker.
- French microphone practice passed one real-recording smoke test with Whisper Tiny text matching. Recognition accuracy remains unbenchmarked, and this is not a pronunciation assessment. Mandarin tone feedback remains unavailable. Do not treat generated French corrections or turns as authoritative teaching or a proficiency result.

## M12 — Tutor orb visual

**Status:** The voice tutor now uses a lightweight CSS-animated orb instead of the experimental 3D mascot viewer.

### Works

- The button renders a glowing purple-blue sphere with drifting nebula colors and thin orbit rings using CSS; no character model, WebGL, or model download is required.
- The existing tutor states drive the orb: it pulses while Ira speaks, with a small waveform, and changes ring/glow behavior while listening or thinking.
- The microphone badge and outer circular control border have been removed; the orb remains the accessible, tap-responsive voice control.
- `prefers-reduced-motion` turns off orb animation without affecting the voice controls.

### Still missing / known problems

- The orb reacts to tutor state, not live microphone or audio amplitude; it is a decorative voice-state indicator, not an audio visualizer.

### Verification

- `npm test`: 73 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed.

## M13 — Personalized speaking home

**Status:** Added a responsive tutor-first Home screen and persistent tutor persona/style preferences.

### Works

- Home shows a learning-language selector, lesson context, animated orb mascot, Ari/Ira selector, Soft/Balanced/Strict style swatches, and a Start Talking entry into the existing tutor conversation.
- The orb has distinct Ari/Ira hair details, eyes with periodic blinks, gentle floating and morph animation, and reuses the existing listening/speaking voice states. Reduced-motion preferences disable its animations.
- The two-page Home panel switches between tutor practice and local daily/weekly progress with touch swipes or accessible pagination buttons.
- On narrow screens, a floating four-destination navigation pill links Home, Explore, Saved words, and Progress. The existing sidebar remains available on wider screens.
- Tutor name and coaching style persist in learner settings; old settings migrate to Ira/Balanced. Ari selects the configured male local voice, Ira the female voice. The tutor prompt receives the selected persona and style, and style remains switchable during a conversation.
- Mode colors drive the Home accent, tutor orb, selection states, and Start Talking button. Dark mode remains supported.
- The tutor orb is an accessible, touchable ball: pointer movement adds a gentle tilt, poking produces a springy squash/ripple reaction, and tutor speech triggers a pulsing glow and animated sound-wave details. Poking does not activate the microphone.
- The Home tutor ball is a Blender-authored GLB rendered with Three.js. It uses one continuous head-and-flippers mesh, high-set eyes seated into the shell, and distinct Ari cowlick/Ira curl details. A soft mode-colored glow and two animated orbit rings restore the original orb accent. Drag rotation turns the model itself; idle spin, poke squash, and speaking reactions animate the 3D model. Dragging does not start voice capture.
- The model shape follows the supplied Tenmin reference clip's soft rounded body, high-set eyes, and side flippers. The selected tutor mode's accent color is applied to the model at runtime.
- Tutor generation and speech continue to use Ari’s existing local Ollama and local speech services. No Anthropic API key or browser-exposed secret was added.

### Still missing / known problems

- This iteration does not add an Anthropic API integration; the tutor remains local-first and uses the configured Ollama model.
- Speech playback tries Ari’s configured local service first, then falls back to browser `speechSynthesis`, preferring a voice matching the selected tutor and target-language locale. Browser/system voice availability varies and may use browser-provided services.
- Tapping arbitrary transcript words to save them is not yet connected; the existing lesson vocabulary and review-deck flows remain unchanged.
- Tutor/lesson sample content remains subject to its existing review caveats.

### Verification

- `npm test`: 84 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Changed-file diagnostics: no errors.
- Browser check: Ari/Ira selection updates the corresponding model detail, pointer dragging visibly rotates the 3D model, and poking leaves the tutor on Home. The Home screen also retains the floating four-item navigation, language selector, tutor/style controls, and Start Talking button.

## M14 — Onboarding, tutor adapter, and practice library

**Status:** Implemented; adapter tests and production build verified.

### Works

- New learners complete the guided, one-question-at-a-time onboarding before entering Home. It covers learning/native language, goals, pace, self-reported starting level, feedback style, interests, daily goal, and tutor choice. The placement chat uses the existing tutor through `TutorService`; it is clearly described as unscored.
- Onboarding preferences are saved through the existing learner-settings storage, including display name, language pair, level, daily goal, age range, timeline, AI-tutor comfort, pronunciation goal, learning style, preferred practice time, reminder preference, tutor, feedback mode, and interests.
- A single `TutorService` adapter wraps the existing local tutor provider. Conversation and retry turns now pass through the adapter, carrying tutor, mode, language, level, lesson/roleplay context, learner memory, and prior transcript history. The engine itself remains unchanged.
- A mock `TutorService` implementation remains available for isolated UI development and tests. It is not silently substituted for the real tutor when the local engine fails.
- Explore now has Lessons and Roleplays tabs, category filters, two-column topic cards, custom topic entry, and scenario cards. Starting an item sets its lesson or roleplay context for subsequent tutor turns.
- The shared 30-language catalog is used by onboarding and app language selectors. Tutor greetings no longer show Mandarin text for unrelated target languages.
- The profile uses the saved learner name and self-reported level; the mobile navigation exposes Home, Explore, Saved words, and Progress.

### Tutor integration TODOs

- Voice input currently sends browser-recognized text transcripts; direct audio-turn input is not supported.
- The engine does not return session scores. The adapter intentionally returns `score: null`.
- Engine-generated romanisation is currently available only for Mandarin.
- Voice-flavour and tutor-personality customization are not yet supported by the tutor engine.
- The onboarding reminder is a preference only; browser/system notification scheduling is not connected.

### Verification

- `npm test`: all 87 tests passed, including adapter and learner-settings persistence coverage.
- `npm run lint`: passed.
- `npm run build`: passed; Vite reports the existing large-chunk advisory.
- Browser check at 390 × 844: onboarding language selection and Continue controls render within the mobile layout.
- `git diff --check`: passed.

## M15 — Grounded teaching and safety

**Status:** Implemented and verified; the knowledge pipeline is ready, but the initial approved corpus is intentionally empty.

### Works

- `TutorService` retrieves approved, attributed records by target language, CEFR level, section, and skill before asking the existing tutor provider to teach. It attaches exact source metadata to grounded turns and labels turns unverified when there is no approved match.
- Section-specific pedagogy, mode-specific guidance, bounded new vocabulary, correction/error metadata, failure ladders, and adaptive difficulty are assembled and validated at the adapter boundary.
- The knowledge record schema and source register capture licence, attribution, quality, and source-specific review requirements. The JSONL import pipeline validates, cleans, deduplicates, indexes, and applies conservative Tatoeba/FSI gates. The HTTPS staging option rejects cross-host URLs and redirects.
- The development-only Knowledge coverage panel shows available approved records and coverage gaps; no third-party source material has been bundled.
- Strict remains exacting and respectful. The requested insulting/roasting persona and intensity controls are not implemented. Distress and the “Ease up” safe word bypass generation, repeated failures offer cooldown support, and telemetry stores only bounded event categories and timestamps.
- `docs/teacher-review-template.csv` provides a native-speaker review sheet before records are approved for teaching.

### Verification

- `npm test`: all 103 tests passed, including scripted teaching scenarios across modes and sections, ingestion quality/provenance checks, failure cooldowns, distress bypass, and privacy-bounded telemetry.
- `npm run validate:knowledge`: passed; 0 records and 0 approved retrieval records.
- `npm run lint`: passed.
- `npm run build`: passed; Vite reports the existing large-chunk advisory.
- `git diff --check`: passed.

### Still missing

- Add source-specific parsers and real records only after confirming the exact export/release licences and recording required attributions; then obtain native-speaker review. Until then, all teaching is honestly marked unverified.
- Provider turns do not provide a reliable numeric score; the adapter leaves `score` null.
