import importlib.util
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch


SERVER_PATH = Path(__file__).with_name("ari-tts-server.py")


class FakeResponse:
    def __init__(self, body, headers=None):
        self.body = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, limit=-1):
        return self.body[:limit] if limit >= 0 else self.body


class AriTtsServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        env = {
            "ARI_TTS_PROVIDER": "g-labs",
            "ARI_GLABS_API_KEY": "test-key",
            "ARI_GLABS_FEMALE_PRESET_ID": "female-preset",
            "ARI_GLABS_MALE_PRESET_ID": "male-preset",
            "ARI_GLABS_BASE_URL": "http://127.0.0.1:8766",
            "ARI_GLABS_TIMEOUT_SECONDS": "30",
            "ARI_ENABLE_VOICE_BAKEOFF": "1",
        }
        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("ARI_AZURE_SPEECH_KEY", None)
            os.environ.pop("ARI_AZURE_SPEECH_REGION", None)
            spec = importlib.util.spec_from_file_location("ari_tts_server", SERVER_PATH)
            cls.server = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.server)

    def test_glabs_submits_selected_preset_polls_and_downloads_audio(self):
        responses = [
            FakeResponse({"task_id": "12abcdef3456"}),
            FakeResponse({"status": "running"}),
            FakeResponse({
                "status": "completed",
                "results": ["/api/files/generated%20voice.mp3"],
            }),
            FakeResponse(b"mock mp3 bytes", {"Content-Type": "audio/mpeg"}),
        ]
        with patch.object(
            self.server.urllib.request, "urlopen", side_effect=responses
        ) as urlopen, patch.object(self.server.time, "sleep"):
            audio, content_type = self.server.synthesize_glabs(
                "Hello, Ari!", "en", "male"
            )

        self.assertEqual(audio, b"mock mp3 bytes")
        self.assertEqual(content_type, "audio/mpeg")
        calls = urlopen.call_args_list
        submit_request = calls[0].args[0]
        self.assertEqual(submit_request.full_url, "http://127.0.0.1:8766/api/voice/design")
        self.assertEqual(submit_request.get_header("X-api-key"), "test-key")
        self.assertEqual(json.loads(submit_request.data)["preset_id"], "male-preset")
        self.assertEqual(json.loads(submit_request.data)["script"], "Hello, Ari!")
        self.assertEqual(json.loads(submit_request.data)["language"], "english")
        self.assertEqual(
            calls[1].args[0].full_url,
            "http://127.0.0.1:8766/api/status/12abcdef3456",
        )
        self.assertEqual(
            calls[3].args[0].full_url,
            "http://127.0.0.1:8766/api/files/generated%20voice.mp3",
        )

    def test_glabs_rejects_audio_url_from_another_origin(self):
        with self.assertRaisesRegex(RuntimeError, "unexpected audio URL"):
            self.server._glabs_result_url(
                "http://attacker.example/api/files/voice.mp3"
            )

    def test_glabs_reports_failed_generation_task(self):
        responses = [
            FakeResponse({"task_id": "12abcdef3456"}),
            FakeResponse({"status": "failed", "error": "Preset not found"}),
        ]
        with patch.object(
            self.server.urllib.request, "urlopen", side_effect=responses
        ) as urlopen:
            with self.assertRaisesRegex(RuntimeError, "Preset not found"):
                self.server.synthesize_glabs("Hello.", "en", "female")
        self.assertEqual(
            json.loads(urlopen.call_args_list[0].args[0].data)["preset_id"],
            "female-preset",
        )

    def test_glabs_rejects_non_audio_download(self):
        responses = [
            FakeResponse({"task_id": "12abcdef3456"}),
            FakeResponse({
                "status": "completed",
                "results": ["/api/files/generated.wav"],
            }),
            FakeResponse(b"not audio", {"Content-Type": "text/html"}),
        ]
        with patch.object(self.server.urllib.request, "urlopen", side_effect=responses):
            with self.assertRaisesRegex(RuntimeError, "unsupported audio format"):
                self.server.synthesize_glabs("Hello.", "en", "female")


if __name__ == "__main__":
    unittest.main()
