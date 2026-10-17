import base64
import io
import json
import math
import sys
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tts_providers import (
    AudioCache,
    AudioResult,
    ConfiguredTTSProvider,
    KokoroTTSProvider,
    ProviderError,
    TencentTTSProvider,
    TTSRouter,
    _is_mixed_chinese_english,
    _split_text,
    normalize_wav_loudness,
)


def make_wav(amplitude=4000, sample_rate=24000):
    samples = [int(amplitude * math.sin(index / 8)) for index in range(2400)]
    stream = io.BytesIO()
    with wave.open(stream, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(b"".join(sample.to_bytes(2, "little", signed=True) for sample in samples))
    return stream.getvalue()


class FakeResponse:
    def __init__(self, data, headers=None):
        self.data = data
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, limit=-1):
        return self.data[:limit] if limit >= 0 else self.data


class TTSProviderTests(unittest.TestCase):
    def test_mixed_chinese_english_detection(self):
        self.assertTrue(_is_mixed_chinese_english("你好, hello"))
        self.assertFalse(_is_mixed_chinese_english("你好，欢迎。"))
        self.assertFalse(_is_mixed_chinese_english("Hello, welcome."))

    def test_tencent_sends_signed_standard_wav_request(self):
        wav = make_wav()
        response_body = json.dumps({
            "Response": {"Audio": base64.b64encode(wav).decode("ascii")}
        }).encode("utf-8")
        provider = TencentTTSProvider(
            "test-id",
            "test-secret",
            {"zh": {"male": 1001, "female": 1002}},
        )
        with patch(
            "tts_providers.urllib.request.urlopen",
            return_value=FakeResponse(
                response_body, {"Content-Type": "application/json"}
            ),
        ) as urlopen, patch("tts_providers.time.time", return_value=1_700_000_000):
            result = provider.synthesize("你好，今天练习。", "zh", "male")

        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_header("X-tc-action"), "TextToVoice")
        self.assertEqual(request.get_header("X-tc-version"), "2019-08-23")
        self.assertIn("Credential=test-id/", request.get_header("Authorization"))
        payload = json.loads(request.data)
        self.assertEqual(payload["VoiceType"], 1001)
        self.assertEqual(payload["Codec"], "wav")
        self.assertEqual(payload["SampleRate"], 24000)
        self.assertEqual(result.content_type, "audio/wav")
        with wave.open(io.BytesIO(result.data), "rb") as audio:
            self.assertEqual(audio.getframerate(), 24000)

    def test_tencent_accepts_mixed_text_only_for_chinese_or_english(self):
        provider = TencentTTSProvider(
            "id",
            "key",
            {
                "zh": {"male": 1001, "female": 1002},
                "en": {"male": 2001, "female": 2002},
            },
        )
        self.assertTrue(provider.supports("zh", "female", "中文 and English"))
        self.assertTrue(provider.supports("en", "male", "English 与中文"))
        self.assertFalse(provider.supports("fr", "female", "Bonjour"))
        self.assertFalse(provider.supports("zh", "other", "你好"))

    def test_tencent_splits_text_to_documented_language_limits(self):
        chinese_parts = _split_text("中文" * 180, 150)
        english_parts = _split_text("word " * 120, 500)
        self.assertTrue(all(len(part) <= 150 for part in chinese_parts))
        self.assertTrue(all(len(part) <= 500 for part in english_parts))
        self.assertEqual("".join(chinese_parts), "中文" * 180)
        self.assertEqual("".join(english_parts), "word " * 120)

    def test_tencent_synthesizes_overlong_english_in_bounded_chunks(self):
        wav = make_wav()
        response_body = json.dumps({
            "Response": {"Audio": base64.b64encode(wav).decode("ascii")}
        }).encode("utf-8")
        provider = TencentTTSProvider(
            "test-id", "test-secret", {"en": {"male": 1001}}
        )
        responses = [
            FakeResponse(response_body),
            FakeResponse(response_body),
        ]
        with patch(
            "tts_providers.urllib.request.urlopen", side_effect=responses
        ) as urlopen:
            result = provider.synthesize("word " * 101, "en", "male")
        self.assertEqual(urlopen.call_count, 2)
        self.assertEqual(result.content_type, "audio/wav")
        for call in urlopen.call_args_list:
            payload = json.loads(call.args[0].data)
            self.assertLessEqual(len(payload["Text"]), 500)

    def test_tencent_propagates_cloud_api_errors_without_exposing_credentials(self):
        body = json.dumps({
            "Response": {
                "Error": {
                    "Code": "AuthFailure.SignatureFailure",
                    "Message": "Invalid credentials",
                }
            }
        }).encode("utf-8")
        provider = TencentTTSProvider(
            "secret-id",
            "secret-key",
            {"en": {"male": 1001}},
        )
        with patch(
            "tts_providers.urllib.request.urlopen",
            return_value=FakeResponse(body),
        ):
            with self.assertRaisesRegex(ProviderError, "SignatureFailure"):
                provider.synthesize("Hello.", "en", "male")

    def test_kokoro_requires_https_for_remote_servers(self):
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            KokoroTTSProvider(
                "http://tts.example.com",
                {"en": {"male": "voice-m", "female": "voice-f"}},
            )
        provider = KokoroTTSProvider(
            "http://127.0.0.1:8080",
            {"en": {"male": "voice-m", "female": "voice-f"}},
        )
        self.assertTrue(provider.supports("en", "male", "Hello"))
        self.assertFalse(provider.supports("en", "male", "你好, hello"))

    def test_router_falls_back_and_caches_normalized_result(self):
        generated = []
        wav = make_wav(amplitude=800)

        def fail(_text, _language, _gender):
            raise ProviderError("unavailable")

        def synthesize(_text, _language, _gender):
            generated.append(True)
            return AudioResult(wav, "audio/wav")

        providers = {
            "kokoro": ConfiguredTTSProvider(
                "kokoro",
                {"en": {"male": "kokoro-m", "female": "kokoro-f"}},
                fail,
                ("en",),
            ),
            "azure": ConfiguredTTSProvider(
                "azure",
                {"en": {"male": "azure-m", "female": "azure-f"}},
                synthesize,
                ("en",),
            ),
        }
        router = TTSRouter(
            "global",
            providers,
            {"en": ["kokoro", "azure"]},
            cache=AudioCache(ttl_seconds=60, max_bytes=100_000),
        )
        first, first_provider = router.synthesize("Hello.", "en", "male")
        second, second_provider = router.synthesize("Hello.", "en", "male")
        self.assertEqual(first_provider, "azure")
        self.assertEqual(second_provider, "azure")
        self.assertEqual(first.data, second.data)
        self.assertEqual(len(generated), 1)

    def test_router_uses_recorded_provider_winner_per_gender(self):
        provider = lambda name: ConfiguredTTSProvider(
            name,
            {"en": {"male": f"{name}-male", "female": f"{name}-female"}},
            lambda _text, _language, _gender: AudioResult(
                make_wav(), "audio/wav"
            ),
            ("en",),
        )
        router = TTSRouter(
            "global",
            {"kokoro": provider("kokoro"), "azure": provider("azure")},
            {"en": ["kokoro", "azure"]},
            {"en": {"male": "azure", "female": "kokoro"}},
        )
        self.assertEqual(router.provider_order("en", "male", "Hello"), ["azure", "kokoro"])
        self.assertEqual(router.provider_order("en", "female", "Hello"), ["kokoro", "azure"])

    def test_shared_wav_normalization_targets_level_and_limits_peaks(self):
        normalized = normalize_wav_loudness(make_wav(amplitude=600))
        with wave.open(io.BytesIO(normalized), "rb") as audio:
            samples = [
                int.from_bytes(audio.readframes(1), "little", signed=True)
                for _ in range(audio.getnframes())
            ]
        rms = math.sqrt(sum(value * value for value in samples) / len(samples))
        dbfs = 20 * math.log10(rms / 32767)
        self.assertLessEqual(dbfs, -20.0)
        self.assertGreater(dbfs, -21.0)
        self.assertLessEqual(max(abs(value) for value in samples) / 32767, 10 ** (-1 / 20) + 0.001)


if __name__ == "__main__":
    unittest.main()
