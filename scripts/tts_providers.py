import array
import base64
import hashlib
import hmac
import io
import json
import logging
import math
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import wave
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Protocol


MAX_AUDIO_BYTES = 16 * 1024 * 1024
TENCENT_ENDPOINT = "https://tts.tencentcloudapi.com/"
TENCENT_SERVICE = "tts"
TENCENT_VERSION = "2019-08-23"
TENCENT_ACTION = "TextToVoice"
NORMALIZATION_TARGET_DBFS = -20.0
NORMALIZATION_PEAK_DBFS = -1.0
CACHE_TTL_SECONDS = 3600
CACHE_MAX_BYTES = 32 * 1024 * 1024


class ProviderError(RuntimeError):
    pass


class ProviderUnavailable(ProviderError):
    pass


@dataclass(frozen=True)
class AudioResult:
    data: bytes
    content_type: str


class TTSService(Protocol):
    name: str

    def supports(self, language: str, gender: str, text: str) -> bool: ...

    def synthesize(self, text: str, language: str, gender: str) -> AudioResult: ...


class ConfiguredTTSProvider:
    def __init__(self, name, voices, synthesize_fn, languages):
        self.name = name
        self.voices = voices
        self.synthesize_fn = synthesize_fn
        self.languages = set(languages)

    def voice_id(self, language, gender, text=""):
        return (self.voices.get(language) or {}).get(gender)

    def supports(self, language, gender, text):
        return (
            language in self.languages
            and gender in ("male", "female")
            and bool(self.voice_id(language, gender))
            and not (self.name == "local" and _is_mixed_chinese_english(text))
        )

    def synthesize(self, text, language, gender):
        result = self.synthesize_fn(text, language, gender)
        if isinstance(result, AudioResult):
            return result
        content_type = "audio/mpeg" if self.name == "g-labs" else "audio/wav"
        return AudioResult(result, content_type)


def _read_bounded(response, limit=MAX_AUDIO_BYTES):
    payload = response.read(limit + 1)
    if not payload:
        raise ProviderError("Speech provider returned empty audio.")
    if len(payload) > limit:
        raise ProviderError("Speech provider returned oversized audio.")
    return payload


def normalize_wav_loudness(
    audio,
    target_rms_dbfs=NORMALIZATION_TARGET_DBFS,
    peak_ceiling_dbfs=NORMALIZATION_PEAK_DBFS,
):
    try:
        with wave.open(io.BytesIO(audio), "rb") as source:
            params = source.getparams()
            if (
                params.nchannels != 1
                or params.sampwidth != 2
                or params.comptype != "NONE"
                or params.nframes <= 0
            ):
                raise ProviderError(
                    "Speech provider must return mono, 16-bit PCM WAV audio."
                )
            pcm = source.readframes(params.nframes)
    except (wave.Error, EOFError) as error:
        raise ProviderError("Speech provider returned invalid WAV audio.") from error

    samples = array.array("h")
    samples.frombytes(pcm)
    if os.sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        raise ProviderError("Speech provider returned empty WAV audio.")

    peak = max(abs(sample) for sample in samples)
    rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples))
    if peak and rms:
        target_rms = 32767 * 10 ** (target_rms_dbfs / 20)
        peak_ceiling = 32767 * 10 ** (peak_ceiling_dbfs / 20)
        gain = min(target_rms / rms, peak_ceiling / peak)
        for index, sample in enumerate(samples):
            samples[index] = max(-32768, min(32767, round(sample * gain)))

    if os.sys.byteorder != "little":
        samples.byteswap()
    output = io.BytesIO()
    with wave.open(output, "wb") as target:
        target.setparams(params)
        target.writeframes(samples.tobytes())
    return output.getvalue()


class AudioCache:
    def __init__(self, ttl_seconds=CACHE_TTL_SECONDS, max_bytes=CACHE_MAX_BYTES):
        self.ttl_seconds = ttl_seconds
        self.max_bytes = max_bytes
        self._entries = OrderedDict()
        self._size = 0
        self._lock = Lock()

    @staticmethod
    def key(provider, voice_id, language, gender, text):
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        return (provider, voice_id, language, gender, digest)

    def get(self, key):
        now = time.monotonic()
        with self._lock:
            entry = self._entries.pop(key, None)
            if entry is None:
                return None
            inserted, result = entry
            if now - inserted >= self.ttl_seconds:
                self._size -= len(result.data)
                return None
            self._entries[key] = entry
            return result

    def put(self, key, result):
        if len(result.data) > self.max_bytes:
            return
        with self._lock:
            previous = self._entries.pop(key, None)
            if previous:
                self._size -= len(previous[1].data)
            self._entries[key] = (time.monotonic(), result)
            self._size += len(result.data)
            while self._size > self.max_bytes:
                _old_key, (_inserted, old_result) = self._entries.popitem(last=False)
                self._size -= len(old_result.data)


class TencentTTSProvider:
    name = "tencent"

    def __init__(self, secret_id, secret_key, voice_ids, region="ap-guangzhou"):
        self.secret_id = secret_id.strip()
        self.secret_key = secret_key.strip()
        self.voice_ids = voice_ids
        self.region = region.strip()
        if not self.region or not all(
            character.isalnum() or character == "-" for character in self.region
        ):
            raise ValueError("Tencent Cloud region must contain only letters, digits, and hyphens.")

    def voice_id(self, language, gender, text=""):
        key = "zh-en-mixed" if _is_mixed_chinese_english(text) else language
        voices = self.voice_ids.get(key) or self.voice_ids.get(language) or {}
        return voices.get(gender)

    def supports(self, language, gender, text):
        return (
            language in ("zh", "en")
            and gender in ("male", "female")
            and bool(self.secret_id and self.secret_key and self.voice_id(language, gender, text))
        )

    def _tc3_signature(self, secret_key, timestamp, body):
        date = datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y-%m-%d")
        canonical_headers = (
            "content-type:application/json; charset=utf-8\n"
            "host:tts.tencentcloudapi.com\n"
        )
        signed_headers = "content-type;host"
        canonical_request = (
            f"POST\n/\n\n{canonical_headers}{signed_headers}\n"
            f"{hashlib.sha256(body).hexdigest()}"
        )
        credential_scope = f"{date}/{TENCENT_SERVICE}/tc3_request"
        string_to_sign = "\n".join((
            "TC3-HMAC-SHA256",
            str(timestamp),
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ))
        secret_date = hmac.new(
            ("TC3" + secret_key).encode("utf-8"),
            date.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        secret_service = hmac.new(
            secret_date, TENCENT_SERVICE.encode("utf-8"), hashlib.sha256
        ).digest()
        secret_signing = hmac.new(
            secret_service, b"tc3_request", hashlib.sha256
        ).digest()
        signature = hmac.new(
            secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        authorization = (
            f"TC3-HMAC-SHA256 Credential={self.secret_id}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )
        return authorization

    def synthesize(self, text, language, gender):
        if not self.supports(language, gender, text):
            raise ProviderUnavailable(
                "Tencent TTS is not configured for this language and voice."
            )
        max_chars = 150 if language == "zh" or _is_mixed_chinese_english(text) else 500
        segments = _split_text(text, max_chars)
        voice_type = int(self.voice_id(language, gender, text))
        audio_segments = [
            self._synthesize_segment(segment, voice_type)
            for segment in segments
        ]
        return AudioResult(_join_wav_chunks(audio_segments), "audio/wav")

    def _synthesize_segment(self, text, voice_type):
        payload = json.dumps({
            "Text": text,
            "SessionId": uuid.uuid4().hex,
            "VoiceType": voice_type,
            "SampleRate": 24000,
            "Codec": "wav",
            "ModelType": 1,
        }, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        timestamp = int(time.time())
        request = urllib.request.Request(
            TENCENT_ENDPOINT,
            data=payload,
            headers={
                "Authorization": self._tc3_signature(
                    self.secret_key, timestamp, payload
                ),
                "Content-Type": "application/json; charset=utf-8",
                "Host": "tts.tencentcloudapi.com",
                "X-TC-Action": TENCENT_ACTION,
                "X-TC-Timestamp": str(timestamp),
                "X-TC-Version": TENCENT_VERSION,
                "X-TC-Region": self.region,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = _read_bounded(response)
            try:
                body = json.loads(raw)
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise ProviderError("Tencent TTS returned invalid JSON.") from error
        except urllib.error.HTTPError as error:
            raise ProviderError(
                f"Tencent TTS request failed (HTTP {error.code})."
            ) from error
        except urllib.error.URLError as error:
            raise ProviderError("Could not connect to Tencent Cloud TTS.") from error

        response = body.get("Response") if isinstance(body, dict) else None
        if not isinstance(response, dict):
            raise ProviderError("Tencent TTS returned an invalid response.")
        api_error = response.get("Error")
        if isinstance(api_error, dict):
            code = str(api_error.get("Code", "unknown"))
            message = str(api_error.get("Message", "request failed"))[:240]
            raise ProviderError(f"Tencent TTS error {code}: {message}")
        encoded_audio = response.get("Audio")
        if not isinstance(encoded_audio, str):
            raise ProviderError("Tencent TTS response contained no audio.")
        try:
            audio = base64.b64decode(encoded_audio, validate=True)
        except (ValueError, base64.binascii.Error) as error:
            raise ProviderError("Tencent TTS returned invalid encoded audio.") from error
        if not audio or len(audio) > MAX_AUDIO_BYTES:
            raise ProviderError("Tencent TTS returned empty or oversized audio.")
        return audio


def _is_mixed_chinese_english(text):
    has_chinese = any(
        "\u3400" <= character <= "\u9fff" or "\uf900" <= character <= "\ufaff"
        for character in text
    )
    has_english = any(character.isascii() and character.isalpha() for character in text)
    return has_chinese and has_english


def _split_text(text, max_chars):
    segments = re.findall(r".+?(?:[.!?。！？；;\n]+|$)", text, flags=re.S)
    if not segments:
        segments = [text]
    chunks = []
    current = ""
    for segment in segments:
        if len(segment) > max_chars:
            words = re.findall(r"\S+\s*|\s+", segment)
            pieces = words if words and max(map(len, words)) <= max_chars else list(segment)
            if current:
                chunks.append(current)
                current = ""
            piece = ""
            for part in pieces:
                if len(piece) + len(part) > max_chars:
                    if piece:
                        chunks.append(piece)
                    piece = part
                else:
                    piece += part
            current = piece
            continue
        if len(current) + len(segment) > max_chars:
            if current:
                chunks.append(current)
            current = segment
        else:
            current += segment
    if current:
        chunks.append(current)
    return [chunk for chunk in chunks if chunk.strip()]


def _join_wav_chunks(chunks, pause_seconds=0.18):
    if not chunks:
        raise ProviderError("Tencent TTS produced no audio segments.")
    frames = []
    sample_rate = None
    for chunk in chunks:
        try:
            with wave.open(io.BytesIO(chunk), "rb") as source:
                params = source.getparams()
                if (
                    params.nchannels != 1
                    or params.sampwidth != 2
                    or params.comptype != "NONE"
                    or params.nframes <= 0
                ):
                    raise ProviderError(
                        "Tencent TTS must return mono, 16-bit PCM WAV audio."
                    )
                if sample_rate is None:
                    sample_rate = params.framerate
                elif sample_rate != params.framerate:
                    raise ProviderError(
                        "Tencent TTS returned segments with different sample rates."
                    )
                frames.append(source.readframes(params.nframes))
        except (wave.Error, EOFError) as error:
            raise ProviderError("Tencent TTS returned invalid WAV audio.") from error
    pause = b"\x00\x00" * round(sample_rate * pause_seconds)
    total_size = sum(map(len, frames)) + len(pause) * (len(frames) - 1)
    if total_size > MAX_AUDIO_BYTES:
        raise ProviderError("Tencent TTS returned oversized combined audio.")
    output = io.BytesIO()
    with wave.open(output, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(sample_rate)
        for index, frame in enumerate(frames):
            if index:
                target.writeframesraw(pause)
            target.writeframesraw(frame)
    return output.getvalue()


class KokoroTTSProvider:
    name = "kokoro"

    def __init__(self, base_url, voice_ids, api_key=""):
        self.base_url = base_url.rstrip("/")
        self.voice_ids = voice_ids
        self.api_key = api_key.strip()
        parsed = urllib.parse.urlsplit(self.base_url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("ARI_KOKORO_BASE_URL must be an HTTP(S) URL.")
        if (
            parsed.scheme == "http"
            and parsed.hostname not in ("127.0.0.1", "localhost", "::1")
        ):
            raise ValueError(
                "Non-loopback Kokoro endpoints must use HTTPS."
            )
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError(
                "ARI_KOKORO_BASE_URL cannot contain credentials, query, or fragment."
            )

    def voice_id(self, language, gender, text=""):
        return (self.voice_ids.get(language) or {}).get(gender)

    def supports(self, language, gender, text):
        if _is_mixed_chinese_english(text):
            return False
        return bool(self.voice_id(language, gender))

    def synthesize(self, text, language, gender):
        voice = self.voice_id(language, gender)
        if not voice:
            raise ProviderUnavailable("No Kokoro voice is mapped for this language.")
        payload = json.dumps({
            "model": "kokoro",
            "input": text,
            "voice": voice,
            "response_format": "wav",
            "speed": 1.0,
        }, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json", "Accept": "audio/wav"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = urllib.request.Request(
            f"{self.base_url}/v1/audio/speech",
            data=payload,
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                content_type = response.headers.get("Content-Type", "").split(";")[0].lower()
                if content_type not in ("audio/wav", "audio/x-wav", "audio/wave"):
                    raise ProviderError("Kokoro returned a non-WAV audio response.")
                audio = _read_bounded(response)
        except urllib.error.HTTPError as error:
            raise ProviderError(
                f"Kokoro request failed (HTTP {error.code})."
            ) from error
        except urllib.error.URLError as error:
            raise ProviderError(
                "Could not connect to the configured Kokoro server."
            ) from error
        return AudioResult(audio, "audio/wav")


class TTSRouter:
    def __init__(
        self, region, providers, orders, winners=None, cache=None, normalization=None
    ):
        if region not in ("china", "global"):
            raise ValueError("Deployment region must be china or global.")
        self.region = region
        self.providers = providers
        self.orders = orders
        self.winners = winners or {}
        self.cache = cache or AudioCache()
        self.normalization = normalization or {
            "targetRmsDbfs": NORMALIZATION_TARGET_DBFS,
            "peakCeilingDbfs": NORMALIZATION_PEAK_DBFS,
        }
        target_dbfs = self.normalization["targetRmsDbfs"]
        peak_dbfs = self.normalization["peakCeilingDbfs"]
        if (
            not isinstance(target_dbfs, (int, float))
            or not isinstance(peak_dbfs, (int, float))
            or not math.isfinite(target_dbfs)
            or not math.isfinite(peak_dbfs)
            or target_dbfs > 0
            or peak_dbfs > 0
            or peak_dbfs < target_dbfs
        ):
            raise ValueError("Voice normalization levels must be finite, non-positive dBFS values.")

    def provider_order(self, language, gender, text):
        category = "zh-en-mixed" if _is_mixed_chinese_english(text) else language
        default_order = self.orders.get(category, ())
        winner = self.winners.get(category)
        if isinstance(winner, dict):
            winner = winner.get(gender)
        if winner and winner in self.providers and winner in default_order:
            return [winner] + [name for name in default_order if name != winner]
        return list(default_order)

    def synthesize(self, text, language, gender, provider_override=None):
        order = (
            [provider_override]
            if provider_override
            else self.provider_order(language, gender, text)
        )
        failures = []
        for provider_name in order:
            provider = self.providers.get(provider_name)
            if provider is None:
                failures.append(f"{provider_name} is not configured")
                continue
            if not provider.supports(language, gender, text):
                failures.append(f"{provider_name} does not support this voice and text")
                continue
            voice_id = getattr(provider, "voice_id", lambda *_args: "")(
                language, gender, text
            )
            cache_key = self.cache.key(
                provider_name, voice_id or "", language, gender, text
            )
            cached = self.cache.get(cache_key)
            if cached is not None:
                return cached, provider_name
            try:
                result = provider.synthesize(text, language, gender)
                if not isinstance(result, AudioResult):
                    raise ProviderError("Speech provider returned an invalid audio result.")
                if result.content_type in ("audio/wav", "audio/x-wav"):
                    result = AudioResult(
                        normalize_wav_loudness(
                            result.data,
                            self.normalization["targetRmsDbfs"],
                            self.normalization["peakCeilingDbfs"],
                        ),
                        "audio/wav",
                    )
                self.cache.put(cache_key, result)
                return result, provider_name
            except (ProviderError, RuntimeError, OSError, ImportError, ValueError) as error:
                logging.warning("%s TTS failed: %s", provider_name, error)
                failures.append(f"{provider_name}: {error}")
        raise ProviderError("No configured TTS provider could synthesize speech. " + "; ".join(failures))


def load_voice_mapping(path):
    with open(path, "r", encoding="utf-8") as source:
        mapping = json.load(source)
    if not isinstance(mapping, dict):
        raise ValueError("Voice mapping must be a JSON object.")
    voice_ids = mapping.get("voiceIds")
    winners = mapping.get("winners")
    if not isinstance(voice_ids, dict) or not isinstance(winners, dict):
        raise ValueError("Voice mapping needs voiceIds and winners objects.")
    return voice_ids, winners
