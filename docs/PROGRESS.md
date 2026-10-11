# Tutor learning system progress

## M1 — Data foundation

**Status:** Implemented; starter lesson content is not approved for learners.

### Works

- JSON Schemas define lessons, vocabulary items, exercises, whiteboard cards, and roleplay scenarios.
- Three English-to-Mandarin A1 lessons are stored as versioned JSON data in one greetings and introductions unit.
- Every lesson is marked `reviewed: false`. Content must not be surfaced to learners until a qualified human reviewer verifies it and reviewer metadata is recorded.
- `npm run validate:lessons` validates all lesson files against the schemas.
- `npm test` checks the sample data and rejects invalid levels, incomplete vocabulary, and missing review metadata.

### Still missing

- Qualified human review of the Mandarin lesson content.
- App integration and learner-facing lesson playback (later milestones).

### Known problems

- Sample vocabulary and answer keys are illustrative and unreviewed; do not rely on them as authoritative language instruction.
- No audio or images are bundled with the starter lessons.
