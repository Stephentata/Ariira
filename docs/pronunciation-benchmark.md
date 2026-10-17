# Pronunciation benchmark

## Status

**Tier 2 benchmark not run. No pronunciation-accuracy results are available.**

Tier 1 captures microphone audio temporarily and samples mono PCM in the browser for transcription with Transformers.js and the pinned `onnx-community/whisper-tiny` multilingual model (revision `ff4177021cc41f7db950912b73ea4fdf7d01d8e7`, `q4`, WASM). The playable recording remains in memory only; the transcription input does not depend on the browser's MediaRecorder container format. The model assets are downloaded from Hugging Face on first use and cached by the browser. After download, Ari performs transcription locally; captured audio is not sent to Hugging Face or another speech service and is not persisted. The temporary audio URL is revoked when the learner changes mode or leaves the card.

The displayed **Understood / Try again** result compares the recognizer transcript with the target. It is not an accent, phoneme, tone, or pronunciation score. Recognition errors can occur even when speech is clear. Mandarin tone feedback is unavailable.

## Tier 2 benchmark plan

Before evaluating any phoneme-level or audio-based provider, collect a consented test set with native and non-native speakers for each supported language. Include varied proficiency, age-appropriate consent, microphones, noise conditions, and multiple repetitions of the same reference prompts. Keep recordings out of production and document storage, retention, and deletion.

For each provider and language:

1. Record the provider/model version, runtime, hardware, language, and benchmark date.
2. Compare provider output with independent native-speaker annotations for intelligibility and word/phoneme errors. For Mandarin, separately evaluate tone only if the provider claims to measure it.
3. Report sample count, speaker composition, agreement/error rates, confidence calibration, latency, failures, and uncertainty. Do not collapse these into an unsupported universal score.
4. Keep results and limitations visible; do not expose scores in the learner UI until the benchmark supports that use.

## Manual microphone smoke test

A user reported one successful microphone check before the switch to local Whisper: browser speech recognition heard the target and displayed **Understood**. The browser/version, target, speaker details, and recording were not captured. This old-path smoke test does not validate the new local model.

## Tier 1 manual smoke test

On 2026-10-11, the user tested the local Whisper path with the microphone in an external browser. Reference: **再见**. Local transcript: **三千**. App result: **Try again**. The browser version and speaker background were not recorded, and the recording was not retained.

This confirms that one real recording reached local transcription and generated transcript-comparison feedback. It does not tell us whether the learner pronounced the phrase incorrectly: Whisper Tiny may have misrecognized it. It is not an accuracy benchmark.

The user also reported that both the captured recording and the comparison example played. The reference example is browser text-to-speech, not a vetted studio/native recording.

## French Tier 1 manual smoke test

On 2026-10-12, the browser captured the spoken reference **Bonjour** and local Whisper Tiny returned **Bonjour!**. Ari displayed **Understood**. The audio was processed in-browser; it was not sent to a speech service. The browser/version and speaker details were not recorded, and the temporary recording was discarded after the check.

This confirms that French locale selection, microphone capture, PCM decoding, and transcript comparison work for one recording in this browser. It does not validate French recognition accuracy or pronunciation, and it is not a benchmark.

No native/non-native audio set has been supplied, so no Tier 2 phoneme-level provider has been benchmarked. No accuracy results are inferred from mocked transcripts or unit tests.
