# Regional voice provider launch check

**Status: not approved for production launch.** Public documentation was reviewed
on 2026-10-17. No authenticated Tencent mainland console session, billing account,
or native-speaker panel was available, so account-specific rates, enabled voice
inventory, account eligibility, and current commercial terms are not verified.
Do not route production traffic to Tencent until the open checks below are
completed and recorded by the account owner.

## Tencent Cloud TTS: public facts verified

| Item | Publicly verified fact | Launch status |
| --- | --- | --- |
| Synthesis API | Cloud API `TextToVoice`, endpoint `tts.tencentcloudapi.com`, version `2019-08-23` | Implemented; requires authenticated smoke test |
| Voice selection | `VoiceType` is an integer ID; the API documentation links to the current voice list | Exact mainland-account IDs pending |
| Output | WAV is supported; 24 kHz is supported only by some voice IDs; 16 kHz is the documented default | Implementation requests WAV at 24 kHz; verify chosen IDs in console |
| Text limit | API reference documents at most 150 Chinese characters or 500 English letters per request | Provider splits long input into bounded sentence/word chunks |
| Voice tiers | Documentation distinguishes voice classes and says prices vary by voice; the purchase guide is authoritative for charging | Standard/premium per-character prices pending console check |
| Credentials | Server uses Tencent Cloud SecretId/SecretKey to sign the request; credentials remain server-side | Account activation and least-privilege policy pending |
| Concurrency | API documentation lists default concurrent request limits by voice class | Confirm account quota and request increases if necessary |
| Terms | Public API reference is not a substitute for the product-specific service terms and commercial usage rights | Pending mainland-console/legal review |

Public references:

- [Tencent Cloud TextToVoice API](https://cloud.tencent.com/document/product/1073/37995)
- [Tencent Cloud TTS purchase guide](https://cloud.tencent.com/document/product/1073/34112)
- [Tencent Cloud TTS voice list](https://cloud.tencent.com/document/product/1073/92668)
- [Tencent Cloud realtime TTS setup](https://cloud.tencent.com/document/product/1073/94308)

The application deliberately leaves the Tencent voice IDs blank in
[`../scripts/voice-mapping.json`](../scripts/voice-mapping.json). Do not copy
sample IDs from API Explorer or another account as production choices. The
account owner must verify each standard male/female Chinese and English voice
ID, its tier, language/accent support, and 24 kHz availability in the mainland
console. Configure premium candidates for internal bake-off only. The winner is
recorded separately for Ari (male) and Ira (female) per language; a premium
VoiceType is copied into the production Tencent mapping only when it wins that
gender's ten-sentence native-speaker comparison against the standard voice.

## Kokoro license review

The upstream Kokoro repository describes Kokoro-82M weights as Apache-licensed,
and its source repository includes an Apache License 2.0. That does not by itself
clear all dependencies, deployed voice assets, model-card restrictions, or
third-party phonemizer/licensing obligations.

- [Kokoro upstream README](https://github.com/hexgrad/kokoro)
- [Kokoro source license](https://github.com/hexgrad/kokoro/blob/main/LICENSE)
- [Kokoro-82M model card](https://huggingface.co/hexgrad/Kokoro-82M)

**Release gate:** retain the notices for all dependencies and model/voice
artifacts actually deployed on the self-hosted mainland server; verify their
individual licenses and terms before launch. Kokoro's configured endpoint and
voice IDs remain unset pending that audit and voice audition.

## Native-speaker bake-off

No voice was selected by this review. The internal-only corpus contains ten
sentences each for Chinese, English, and mixed Chinese-English. Rate both the
male Ari and female Ira clips from every candidate provider for every sentence.
The score winner is stored independently by gender and language. Only a
complete, non-tied native-speaker rating set can be written to the voice
mapping. The external/local Voice Studio is for internal audition only and
must not be bundled or deployed with the application.

## Mainland-console record to complete before launch

| Check | Result / evidence | Owner / date |
| --- | --- | --- |
| Tencent account eligibility and TTS product activation | Pending | |
| SecretId/SecretKey scope and production secret storage | Pending | |
| Standard Chinese male/female voice IDs and language support | Pending | |
| Standard English male/female voice IDs and language support | Pending | |
| 24 kHz support for each selected Tencent voice | Pending | |
| Current standard and premium prices, billing unit, free quota, taxes | Pending | |
| Account concurrency/QPS quota and production limits | Pending | |
| Current Tencent TTS terms and commercial-use rights | Pending | |
| Kokoro code, model, dependency, phonemizer, and voice-asset licenses | Pending | |
| Ten-sentence-per-language native-speaker ratings for both genders | Pending | |
| Regional latency, error-rate, and billing smoke tests | Pending | |
