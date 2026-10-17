import csv
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


BAKEOFF_PATH = Path(__file__).with_name("voice-bakeoff.py")
SPEC = importlib.util.spec_from_file_location("voice_bakeoff", BAKEOFF_PATH)
voice_bakeoff = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(voice_bakeoff)


class VoiceBakeoffTests(unittest.TestCase):
    def test_records_gender_specific_tencent_voice_tier_after_complete_ratings(self):
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            mapping_path = temp_path / "voice-mapping.json"
            mapping = json.loads(voice_bakeoff.MAPPING_PATH.read_text(encoding="utf-8"))
            mapping["voiceIds"]["tencent-standard"]["zh"] = {
                "male": "1001",
                "female": "1002",
            }
            mapping["voiceIds"]["tencent-premium"]["zh"] = {
                "male": "2001",
                "female": "2002",
            }
            mapping_path.write_text(json.dumps(mapping), encoding="utf-8")
            rating_path = temp_path / "ratings.csv"
            with rating_path.open("w", encoding="utf-8", newline="") as output:
                writer = csv.DictWriter(output, fieldnames=voice_bakeoff.RATING_FIELDS)
                writer.writeheader()
                for provider in ("tencent-standard", "tencent-premium"):
                    for index in range(1, 11):
                        for gender in ("male", "female"):
                            score = (
                                5 if provider == "tencent-premium" and gender == "male"
                                else 5 if provider == "tencent-standard" and gender == "female"
                                else 3
                            )
                            writer.writerow({
                                "region": "china",
                                "language": "zh",
                                "sentence_id": f"zh-{index:02d}",
                                "gender": gender,
                                "provider": provider,
                                "score_1_to_5": score,
                                "rater_name": "Native Reviewer",
                                "native_language": "Chinese",
                            })

            args = SimpleNamespace(
                language="zh",
                region="china",
                ratings=str(rating_path),
                rater_name="Native Reviewer",
                native_language="Chinese",
            )
            with patch.object(voice_bakeoff, "MAPPING_PATH", mapping_path):
                voice_bakeoff.record_winner(args)

            updated = json.loads(mapping_path.read_text(encoding="utf-8"))
            self.assertEqual(
                updated["winners"]["china"]["zh"],
                {"male": "tencent", "female": "tencent"},
            )
            self.assertEqual(updated["voiceIds"]["tencent"]["zh"]["male"], "2001")
            self.assertEqual(updated["voiceIds"]["tencent"]["zh"]["female"], "1002")

    def test_rejects_incomplete_native_ratings(self):
        with tempfile.TemporaryDirectory() as temp:
            rating_path = Path(temp) / "ratings.csv"
            with rating_path.open("w", encoding="utf-8", newline="") as output:
                writer = csv.DictWriter(output, fieldnames=voice_bakeoff.RATING_FIELDS)
                writer.writeheader()
                writer.writerow({
                    "region": "china",
                    "language": "zh",
                    "sentence_id": "zh-01",
                    "gender": "male",
                    "provider": "kokoro",
                    "score_1_to_5": 5,
                    "rater_name": "Native Reviewer",
                    "native_language": "Chinese",
                })
            args = SimpleNamespace(
                language="zh",
                region="china",
                ratings=str(rating_path),
                rater_name="Native Reviewer",
                native_language="Chinese",
            )
            with self.assertRaisesRegex(ValueError, "Compare at least two providers"):
                voice_bakeoff.record_winner(args)


if __name__ == "__main__":
    unittest.main()
