import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
CORPUS_PATH = ROOT / "voice-bakeoff-corpus.json"
MAPPING_PATH = ROOT / "voice-mapping.json"
SERVICE_URL = "http://127.0.0.1:3901/v1/audio/speech"
RATING_FIELDS = (
    "region",
    "language",
    "sentence_id",
    "gender",
    "provider",
    "text",
    "audio_file",
    "score_1_to_5",
    "rater_name",
    "native_language",
    "notes",
)


def generate(args):
    corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    if args.language not in corpus:
        raise ValueError(f"Unknown bake-off language: {args.language}")
    providers = [provider.strip() for provider in args.providers.split(",") if provider.strip()]
    if len(providers) < 2 or len(providers) != len(set(providers)):
        raise ValueError("Choose at least two unique providers with --providers.")

    output = Path(args.output).resolve()
    audio_dir = output / args.language
    audio_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    phrases = corpus[args.language]
    request_language = "zh" if args.language in ("zh", "zh-en-mixed") else "en"
    for provider in providers:
        for index, text in enumerate(phrases, start=1):
            for gender in ("male", "female"):
                body = json.dumps({
                    "input": text,
                    "language": request_language,
                    "gender": gender,
                    "provider": provider,
                }, ensure_ascii=False).encode("utf-8")
                request = urllib.request.Request(
                    SERVICE_URL,
                    data=body,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                try:
                    with urllib.request.urlopen(request, timeout=600) as response:
                        content_type = response.headers.get("Content-Type", "").lower()
                        if not content_type.startswith("audio/"):
                            raise RuntimeError(
                                f"{provider} returned a non-audio response for sentence {index}."
                            )
                        audio = response.read(16 * 1024 * 1024 + 1)
                except urllib.error.HTTPError as error:
                    details = error.read(512).decode("utf-8", errors="replace")
                    raise RuntimeError(
                        f"{provider} failed for sentence {index} ({error.code}): {details}"
                    ) from error
                if not audio or len(audio) > 16 * 1024 * 1024:
                    raise RuntimeError(
                        f"{provider} returned empty or oversized audio for sentence {index}."
                    )
                extension = ".mp3" if "mpeg" in content_type or "mp3" in content_type else ".wav"
                filename = f"{provider}-{index:02d}-{gender}{extension}"
                (audio_dir / filename).write_bytes(audio)
                rows.append({
                    "region": args.region,
                    "language": args.language,
                    "sentence_id": f"{args.language}-{index:02d}",
                    "gender": gender,
                    "provider": provider,
                    "text": text,
                    "audio_file": filename,
                    "score_1_to_5": "",
                    "rater_name": "",
                    "native_language": "",
                    "notes": "",
                })

    rating_path = output / f"ratings-{args.language}.csv"
    with rating_path.open("w", encoding="utf-8-sig", newline="") as result:
        writer = csv.DictWriter(result, fieldnames=RATING_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Generated {len(rows)} clips in {audio_dir}")
    print(f"Rate each clip in {rating_path}, then run record-winner with that CSV.")


def record_winner(args):
    corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    if args.language not in corpus:
        raise ValueError(f"Unknown bake-off language: {args.language}")
    allowed_providers = (
        {"kokoro", "tencent-standard", "tencent-premium"}
        if args.region == "china"
        else {"kokoro", "azure", "local"}
    )
    expected_ids = {f"{args.language}-{index:02d}" for index in range(1, 11)}
    scores = {}
    seen = set()
    with Path(args.ratings).open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            if row.get("language") != args.language:
                continue
            if row.get("region") != args.region:
                raise ValueError("Rating CSV region does not match the requested deployment region.")
            if row.get("rater_name", "").strip() != args.rater_name.strip():
                raise ValueError("Every rating row must contain the nominated native rater name.")
            if row.get("native_language", "").strip().lower() != args.native_language.strip().lower():
                raise ValueError("Every rating row must confirm the nominated rater's native language.")
            sentence_id = row.get("sentence_id", "")
            provider = row.get("provider", "")
            gender = row.get("gender", "")
            if sentence_id not in expected_ids or gender not in ("male", "female") or not provider:
                raise ValueError("Rating CSV contains an invalid language, sentence, provider, or gender.")
            if provider not in allowed_providers:
                raise ValueError(
                    f"{provider} is not a production bake-off candidate for {args.region}."
                )
            try:
                score = float(row.get("score_1_to_5", ""))
            except ValueError as error:
                raise ValueError("Every clip needs a native-speaker score from 1 to 5.") from error
            if not 1 <= score <= 5:
                raise ValueError("Every clip needs a native-speaker score from 1 to 5.")
            key = (provider, sentence_id, gender)
            if key in seen:
                raise ValueError("Rating CSV contains a duplicate provider/sentence/gender rating.")
            seen.add(key)
            scores.setdefault(provider, {}).setdefault(gender, []).append(score)

    required_per_provider = {
        (provider, sentence_id, gender)
        for provider in scores
        for sentence_id in expected_ids
        for gender in ("male", "female")
    }
    if len(scores) < 2 or seen != required_per_provider:
        raise ValueError(
            "Compare at least two providers, each with a native-speaker score for all 10 sentences "
            "in both Ari (male) and Ira (female) voices."
        )
    averages = {
        provider: {
            gender: sum(scores[provider][gender]) / len(scores[provider][gender])
            for gender in ("male", "female")
        }
        for provider in scores
    }
    winners = {}
    for gender in ("male", "female"):
        best_score = max(averages[provider][gender] for provider in averages)
        tied = [
            provider
            for provider in averages
            if averages[provider][gender] == best_score
        ]
        if len(tied) != 1:
            raise ValueError(f"The {gender} voice bake-off is tied; do not record a winner.")
        winners[gender] = tied[0]

    mapping = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    recorded_winners = {}
    for gender, candidate in winners.items():
        canonical_provider = (
            "tencent" if candidate in ("tencent-standard", "tencent-premium") else candidate
        )
        recorded_winners[gender] = canonical_provider
        mapping["winners"][args.region][args.language][gender] = canonical_provider
        if candidate in ("tencent-standard", "tencent-premium"):
            candidate_voices = mapping["voiceIds"][candidate]
            selected_voices = (
                candidate_voices.get(args.language)
                or candidate_voices.get("zh")
                or {}
            )
            voice_id = selected_voices.get(gender)
            if not voice_id:
                voice_language = args.language if args.language in ("zh", "en") else "zh"
                tier = candidate.removeprefix("tencent-").upper()
                env_key = (
                    f"ARI_TENCENT_{tier}_VOICE_"
                    f"{voice_language.upper()}_{gender.upper()}"
                )
                voice_id = os.environ.get(env_key)
            if not voice_id:
                raise ValueError(
                    f"No {candidate} VoiceType is configured for {args.language} {gender}."
                )
            mapping["voiceIds"]["tencent"].setdefault(args.language, {})[gender] = voice_id
    mapping.setdefault("bakeoffResults", {}).setdefault(args.region, {})[args.language] = {
        "region": args.region,
        "winners": recorded_winners,
        "averageScores": averages,
        "sentenceCount": 10,
        "ratingsPerProviderAndGender": 10,
        "raterName": args.rater_name.strip(),
        "raterNativeLanguage": args.native_language.strip(),
        "ratedAtUtc": datetime.now(timezone.utc).isoformat(),
    }
    MAPPING_PATH.write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Recorded Ari (male): {recorded_winners['male']} and "
        f"Ira (female): {recorded_winners['female']} for {args.language}."
    )
    for provider, gender_scores in sorted(averages.items()):
        print(
            f"{provider}: Ari {gender_scores['male']:.2f}/5, "
            f"Ira {gender_scores['female']:.2f}/5"
        )


def main():
    parser = argparse.ArgumentParser(
        description="Internal-only speech-provider bake-off; does not ship in the app UI."
    )
    commands = parser.add_subparsers(dest="command", required=True)
    generate_parser = commands.add_parser(
        "generate", help="Generate matched audio clips and a native-rating CSV."
    )
    generate_parser.add_argument("--region", choices=("china", "global"), required=True)
    generate_parser.add_argument("--language", choices=("zh", "en", "zh-en-mixed"), required=True)
    generate_parser.add_argument("--providers", required=True, help="Comma-separated provider names.")
    generate_parser.add_argument("--output", default="voice-bakeoff-results")
    generate_parser.set_defaults(run=generate)

    winner_parser = commands.add_parser(
        "record-winner", help="Record the highest-rated provider after complete native ratings."
    )
    winner_parser.add_argument("--region", choices=("china", "global"), required=True)
    winner_parser.add_argument("--language", choices=("zh", "en", "zh-en-mixed"), required=True)
    winner_parser.add_argument("--ratings", required=True)
    winner_parser.add_argument("--rater-name", required=True)
    winner_parser.add_argument("--native-language", required=True)
    winner_parser.set_defaults(run=record_winner)
    args = parser.parse_args()
    try:
        args.run(args)
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Voice bake-off failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
