# Tutor teaching layer

## Runtime flow

`TutorService.getTutorTurn()` selects approved records for the learner's target language, CEFR level, section and (where relevant) skill before it calls the existing tutor provider. The retrieved text and section pedagogy are appended to the provider instructions as untrusted reference data. Retrieved records are never treated as instructions and textbook passages must be paraphrased.

The adapter adds source metadata from the records actually retrieved. A turn with no approved matches has `sources: []`, `grounded: false`, and `verification: "unverified"`; the tutor is instructed not to invent a citation. `TutorServiceTurn` carries the app-facing reply, translation, romanisation, correction/error type, hint level, new words, optional exercise, difficulty direction, sources and grounding state. The provider's existing structured contract remains the engine boundary.

The selected section drives the teaching routine in `src/teaching-layer.js`. Per-session state tracks consecutive misses, recent outcomes and error-type counts; the client starts a new state for each newly selected practice. A distress/safe-word turn bypasses model generation and returns a calm pause message. A third consecutive miss offers a simpler prompt and a one-tap Soft/Balanced switch. Safeguard telemetry stores only an event category and timestamp (at most 100 events), never the learner's message.

Strict means precise, brisk and respectful. The requested insulting/roasting persona is intentionally not implemented. No setting, learner-provided prompt or mode can enable personal insults or identity-based ridicule. The Strict session has an always-visible **Ease up** control.

## Knowledge records and sources

- Schema: `data/knowledge-base/record.schema.json`.
- Runtime corpus and section/level/skill index source: `data/knowledge-base/records.json`; the initial corpus is empty. The admin panel reports this as zero approved records and coverage gaps.
- Source register: `data/knowledge-base/sources.json`. Source entries are deliberately marked `reference-only`, `verify-per-file`, `verify-per-record`, or `verify-release` where reuse depends on the exact publication, export, host, or release.
- CEFR is a level reference only. Store independently authored summaries and citations; do not import or reproduce the descriptor text.
- FSI material is dated. Imported records are forced to unreviewed and tagged with a notice to use it for structure/drills only; review modern usage before teaching.
- Tatoeba records require the author, direct sentence-page URL, proofread status `OK`, and an explicit naturalness approval before retrieval. Audio must have separate licence and attribution metadata.
- CC-CEDICT records must carry the exact release licence and attribution; verify the applicable share-alike terms before approving them.
- No third-party sentence, dictionary, lesson or audio content is bundled in this initial corpus.

## Import pipeline

Import attributed UTF-8 JSONL records. Each line should include the required source and licence fields; optional `--language`, `--level`, `--section`, and `--skill` values can tag a homogeneous input batch. Source validation prevents unregistered sources and mismatched source URLs/licences. Cleaning strips markup and normalizes whitespace; the pipeline validates the schema, applies source quality rules, removes duplicate content, and writes records plus a language/level/section/skill index.

```powershell
npm run validate:knowledge
npm run ingest:knowledge -- --input data/knowledge-base/staging/records.jsonl --language Spanish --level A1 --section Food --skill speaking
```

An optional HTTPS download stage can stage a file from the registered source's host (100 MiB limit; redirects are rejected). Review the terms and normalize source-specific files to attributed JSONL before import; this avoids pretending that unlike Tatoeba, FSI, CEFR, and CC-CEDICT formats share one parser.

```powershell
npm run ingest:knowledge -- --download-source tatoeba --download-url https://downloads.tatoeba.org/exports/sentences.tar.bz2 --download-to data/knowledge-base/staging/tatoeba-sentences.tar.bz2
```

The current retriever only returns records with `quality_flag: "approved"`, exact language and section, and the requested or an adjacent CEFR level. Everything else remains unavailable to teaching. The development-only **Knowledge coverage** panel reports approved counts and language/section gaps honestly.

## Review and tests

Use `docs/teacher-review-template.csv` for native-speaker review of accuracy, naturalness, CEFR fit, and register/cultural safety. Do not change a record to approved until its provenance and attribution are complete and a qualified reviewer has accepted it.

Run:

```powershell
npm run validate:knowledge
npm test -- tests/teaching-layer.test.mjs tests/knowledge-ingestion.test.mjs tests/tutor-service.test.mjs
```
