# Ariira

An original, responsive language-learning and translation prototype featuring Ira, a local-AI conversation tutor.

## Run it on Windows

1. Open this folder in VS Code.
2. Open **Terminal → New Terminal**.
3. Install project packages (first run only):

   ```powershell
   npm.cmd install
   ```

4. Start the local preview:

   ```powershell
   npm.cmd run dev
   ```

5. Open the local address printed in the terminal (usually `http://localhost:5173`).
6. To stop the preview, focus the terminal and press **Ctrl+C**.

Use `npm.cmd` in PowerShell: Windows may block the `npm.ps1` script based on its execution policy. There is no need to weaken that policy.

### Speech voices

Provider credentials stay in the speech server environment; never put them in app code, Vite/client configuration, or committed files. The service supports region-specific routing, a self-hosted Kokoro endpoint, Tencent Cloud TTS for China, Azure Speech for Global fallback, and the existing local MeloTTS/OpenVoice fallback.

**China deployment:** Set `ARI_DEPLOYMENT_REGION=china`, host a licensed Kokoro service on a mainland server, and configure Tencent Cloud API credentials plus standard voice IDs from the mainland console:

```powershell
$env:ARI_DEPLOYMENT_REGION = "china"
$env:ARI_TTS_PROVIDER = "auto"
$env:ARI_KOKORO_BASE_URL = "https://YOUR_MAINLAND_KOKORO_HOST"
$env:ARI_KOKORO_VOICE_ZH_MALE = "YOUR_AUDITIONED_KOKORO_ZH_MALE_ID"
$env:ARI_KOKORO_VOICE_ZH_FEMALE = "YOUR_AUDITIONED_KOKORO_ZH_FEMALE_ID"
$env:TENCENTCLOUD_SECRET_ID = "YOUR_TENCENT_SECRET_ID"
$env:TENCENTCLOUD_SECRET_KEY = "YOUR_TENCENT_SECRET_KEY"
$env:ARI_TENCENT_STANDARD_VOICE_ZH_MALE = "YOUR_STANDARD_MALE_VOICETYPE"
$env:ARI_TENCENT_STANDARD_VOICE_ZH_FEMALE = "YOUR_STANDARD_FEMALE_VOICETYPE"
$env:ARI_TENCENT_STANDARD_VOICE_EN_MALE = "YOUR_STANDARD_ENGLISH_MALE_VOICETYPE"
$env:ARI_TENCENT_STANDARD_VOICE_EN_FEMALE = "YOUR_STANDARD_ENGLISH_FEMALE_VOICETYPE"
$env:ARI_TENCENT_PREMIUM_VOICE_ZH_MALE = "YOUR_PREMIUM_MALE_VOICETYPE"
$env:ARI_TENCENT_PREMIUM_VOICE_ZH_FEMALE = "YOUR_PREMIUM_FEMALE_VOICETYPE"
$env:ARI_TENCENT_PREMIUM_VOICE_EN_MALE = "YOUR_PREMIUM_ENGLISH_MALE_VOICETYPE"
$env:ARI_TENCENT_PREMIUM_VOICE_EN_FEMALE = "YOUR_PREMIUM_ENGLISH_FEMALE_VOICETYPE"
$env:ARI_ENABLE_VOICE_BAKEOFF = "true"
powershell -ExecutionPolicy Bypass -File scripts\start-ari-tts.ps1
```

Only use voice IDs verified in the mainland Tencent console. Choose standard voices first; replace them with premium IDs only if a native-speaker bake-off prefers those voices. The router uses Kokoro first for configured supported languages, then Tencent for Chinese, English, and mixed Chinese-English. Tencent is not registered in Global mode.

**Global deployment:** Leave `ARI_DEPLOYMENT_REGION` unset or set it to `global`. Configure Kokoro's HTTPS endpoint and voice IDs to use it first. The default fallback order is Azure Speech, then local MeloTTS/OpenVoice. Azure requires `ARI_AZURE_SPEECH_KEY` and `ARI_AZURE_SPEECH_REGION`; speech text goes to Microsoft Azure and usage charges may apply. The local fallback uses model files in `%LOCALAPPDATA%\AriVoiceLab` and does not send text to a cloud service.

`scripts/voice-mapping.json` records per-region provider order, provider voice mappings, and native-speaker winners. Voice IDs and winners intentionally start unselected. `docs/voice-provider-launch-check.md` records the official public Tencent API facts and the remaining mainland-console, terms, pricing, licensing, and native-speaker checks; Tencent is not ready for production until those checks are completed.

**Internal voice bake-off only:** Do not ship a local Voice Studio. Set `ARI_ENABLE_VOICE_BAKEOFF=true` only in an internal audition environment. Configure standard/premium candidate `VoiceType` IDs in the environment above, then compare e.g. `python scripts\voice-bakeoff.py generate --region china --language zh --providers kokoro,tencent-standard,tencent-premium`. Rate every clip from 1 to 5 with a native speaker, then record the result with `python scripts\voice-bakeoff.py record-winner --region china --language zh --ratings .\voice-bakeoff-results\ratings-zh.csv --rater-name "Reviewer" --native-language Chinese`. The bake-off requires ten sentences for each language and selected provider, with both genders rated. Provider override requests are rejected unless the internal flag is enabled. A Tencent winner is recorded as the production `tencent` provider with that gender's winning standard or premium ID. Restart the speech server after changing `voice-mapping.json`.

The Python speech service is the only component that calls cloud providers. In China mode, Tencent's SecretId/SecretKey are used only server-side to sign the `TextToVoice` request. Tencent synthesis is restricted to Chinese, English, and mixed Chinese-English input; speech text is sent to Tencent Cloud and may incur charges according to the chosen voice tier. Cloud outputs are returned as mono PCM WAV, loudness-normalized to a -20 dBFS RMS target with a -1 dBFS peak ceiling, and cached in a bounded server-memory cache for one hour.

All providers use the same server endpoint at `127.0.0.1:3901`; the Vite dev and preview servers proxy app speech requests to it. Start the service in a second VS Code terminal after configuring the deployment region and provider. A separately hosted production build needs a backend proxy that keeps provider credentials server-side.

### Preview on a phone

Start Vite on the local network:

```powershell
npm.cmd run dev -- --host 0.0.0.0
```

Open the **Network** address printed by Vite on a phone connected to the same Wi-Fi as this computer. Keep the development server running while previewing.

## What works in this preview

- Responsive home, tutor, translator, vocabulary, progress, and settings screens.
- First-time learners can choose from English, Mandarin Chinese, Spanish, French, Japanese, Korean, German, Arabic, and Portuguese on the welcome screen; their choice is saved and can be changed in Settings.
- Ari's supplied logo is used in the app brand and browser icon. The shared light/dark theme uses the provided palette throughout the interface: `#04222B`, `#0A3D4A`, `#10686F`, `#1D8B94`, `#4FB8B4`, `#98D8D0`, and `#E2F4F0`.
- Mandarin and French tutor practice, including learner-led chat and sample roleplay scenarios. French lesson and vocabulary samples are explicitly unreviewed.
- The voice tutor uses a lightweight animated, space-like orb instead of a 3D character model. The orb glows and pulses while Ira speaks, with moving color, orbit rings, and a waveform. The mic badge and outer circle/button decoration are removed; the orb itself remains the accessible voice control and respects reduced-motion settings.
- Choose the tutor voice in Settings: Ari uses the male voice and Ira uses the female voice. Spoken tutor names use the AH-ree and EYE-rah pronunciations while visible names stay unchanged. The same voice mapping applies to onboarding previews, tutor replies, translations, vocabulary, and lesson listening prompts. Speech uses the configured regional Kokoro/Tencent/Azure/local provider order. Browser fallback will not silently substitute a voice with an unknown or mismatched gender.
- If voice playback reports that the speech service is unreachable, start it using the provider setup steps in **Speech voices** above.
- Light/dark theme and learner preferences are saved in this browser.
- In local development, tutor replies use Ollama and the `qwen2.5-coder:7b` model. The hosted Cloudflare Pages app uses Cloudflare Workers AI through a server-side Pages Function; tutor messages are sent to Cloudflare for inference and no provider credentials are exposed to the browser.
- Guided Mandarin lessons, exercises, roleplay reflection, vocabulary review, progress summaries, and a practice-time goal.
- Separate Mandarin and French lesson outcomes and vocabulary review queues. Existing untagged review cards and unpartitioned progress remain associated with Mandarin.
- Tutor text history is off by default and can be opted into in Settings. Saved text, settings, review cards, and progress can be exported or deleted from this browser. Nothing is synced to an account.
- Local Whisper Tiny transcription for vocabulary pronunciation practice. Its model downloads on first use and is cached by the browser; recordings are processed on-device and are not retained. The feedback compares recognized text with the target and is not a pronunciation score.
- Pinyin generated on-device from Mandarin tutor text.
- Language selectors and swapping languages in the translator.
- A small set of clearly labeled sample translations for English to Chinese, Spanish, French, and Japanese.
- Browser speech recognition for tutor practice, where supported by the browser.
- The orb is a visual indicator, not a sound-reactive visualizer; it animates from tutor state, not microphone volume.
- A Mandarin placement check that offers a practice suggestion only; it does not change the learner's saved level or progress.

Learner data is stored locally in this browser; it is not account-backed or synchronized across devices. For local development, Ollama must be running with `qwen2.5-coder:7b` available; the Vite server proxies requests to it. For production, the Cloudflare Pages project must have a Workers AI binding named `AI` configured in **Settings > Bindings** and be redeployed. Workers AI usage is subject to Cloudflare account limits and billing. Tutor chat history is held in page memory and sent to the selected inference provider to generate replies; review important learning material because AI can make mistakes.

Browser speech recognition depends on browser support and microphone permission, and may use a browser-provided service. Local Whisper review is a separate on-device path. Neither transcript comparison nor tutor feedback measures proficiency. French transcription has passed one real-microphone smoke test, but its accuracy has not been benchmarked. French lessons and vocabulary are unreviewed samples, not validated curriculum. Translator examples are static samples, not live translation.

## Checks

Run the tests, lesson-data validator, source linter, and production build:

```powershell
npm.cmd test
npm.cmd run validate:lessons
npm.cmd run lint
npm.cmd run build
```

The build runs the TypeScript checks before creating the optimized files in `dist`.
