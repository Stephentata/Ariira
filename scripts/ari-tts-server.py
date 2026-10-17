import io
import json
import logging
import os
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tts_providers import (
    AudioCache,
    AudioResult,
    ConfiguredTTSProvider,
    KokoroTTSProvider,
    ProviderError,
    TencentTTSProvider,
    TTSRouter,
    load_voice_mapping,
)

LAB_ROOT = Path(os.environ.get(
    "ARI_VOICE_LAB",
    Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local")) / "AriVoiceLab",
))
OPENVOICE_ROOT = LAB_ROOT / "OpenVoice"
CONVERTER_ROOT = LAB_ROOT / "checkpoints_v2" / "converter"
SAMPLE_ROOT = LAB_ROOT / "samples"
NLTK_DATA_ROOT = LAB_ROOT / "nltk_data"
SPEECH_DEVICE = os.environ.get("ARI_TTS_DEVICE", "cpu")
PORT = int(os.environ.get("ARI_TTS_PORT", "3901"))
LANGUAGE_NAMES = {"en": "EN", "fr": "FR", "es": "ES", "zh": "ZH", "ja": "JP"}
LANGUAGE_LABELS = {
    "en": "english",
    "fr": "french",
    "es": "spanish",
    "zh": "chinese",
    "ja": "japanese",
}
AZURE_SPEECH_KEY = os.environ.get("ARI_AZURE_SPEECH_KEY", "").strip()
AZURE_SPEECH_REGION = os.environ.get("ARI_AZURE_SPEECH_REGION", "").strip().lower()
TTS_PROVIDER = os.environ.get("ARI_TTS_PROVIDER", "auto").strip().lower()
DEPLOYMENT_REGION = os.environ.get("ARI_DEPLOYMENT_REGION", "global").strip().lower()
GLABS_BASE_URL = os.environ.get("ARI_GLABS_BASE_URL", "http://127.0.0.1:8766").rstrip("/")
GLABS_API_KEY = os.environ.get("ARI_GLABS_API_KEY", "").strip()
GLABS_FEMALE_PRESET_ID = os.environ.get("ARI_GLABS_FEMALE_PRESET_ID", "").strip()
GLABS_MALE_PRESET_ID = os.environ.get("ARI_GLABS_MALE_PRESET_ID", "").strip()
GLABS_TIMEOUT_SECONDS = int(os.environ.get("ARI_GLABS_TIMEOUT_SECONDS", "600"))
GLABS_POLL_INTERVAL_SECONDS = 2
GLABS_MAX_JSON_BYTES = 64 * 1024
AZURE_SPEECH_CONFIGURED = bool(AZURE_SPEECH_KEY and AZURE_SPEECH_REGION)
VOICE_MAPPING_PATH = Path(os.environ.get(
    "ARI_VOICE_MAPPING_PATH", Path(__file__).with_name("voice-mapping.json")
))
ENABLE_VOICE_BAKEOFF = os.environ.get("ARI_ENABLE_VOICE_BAKEOFF", "").strip().lower() in (
    "1", "true", "yes",
)
AZURE_VOICES = {
    "en": {
        "female": ("en-GB-SoniaNeural", "en-GB"),
        "male": ("en-GB-RyanNeural", "en-GB"),
    },
    "es": {
        "female": ("es-ES-ElviraNeural", "es-ES"),
        "male": ("es-ES-AlvaroNeural", "es-ES"),
    },
    "fr": {
        "female": ("fr-FR-DeniseNeural", "fr-FR"),
        "male": ("fr-FR-HenriNeural", "fr-FR"),
    },
    "zh": {
        "female": ("zh-CN-XiaoxiaoNeural", "zh-CN"),
        "male": ("zh-CN-YunxiNeural", "zh-CN"),
    },
    "ja": {
        "female": ("ja-JP-NanamiNeural", "ja-JP"),
        "male": ("ja-JP-KeitaNeural", "ja-JP"),
    },
}
# OpenVoice's bundled demo_speaker1 reference has the higher-pitched voice.
FEMALE_REFERENCE = SAMPLE_ROOT / "demo_speaker1.wav"
MALE_REFERENCE = SAMPLE_ROOT / "demo_speaker0.wav"
MAX_TEXT_LENGTH = 4096
MAX_AUDIO_BYTES = 16 * 1024 * 1024
LOCAL_RUNTIME_LOADED = False

if TTS_PROVIDER not in ("auto", "azure", "g-labs", "local", "kokoro", "tencent"):
    raise RuntimeError(
        "ARI_TTS_PROVIDER must be auto, azure, g-labs, local, kokoro, or tencent."
    )
if DEPLOYMENT_REGION not in ("china", "global"):
    raise RuntimeError("ARI_DEPLOYMENT_REGION must be china or global.")

if bool(AZURE_SPEECH_KEY) != bool(AZURE_SPEECH_REGION):
    raise RuntimeError(
        "Set both ARI_AZURE_SPEECH_KEY and ARI_AZURE_SPEECH_REGION to enable Azure Speech."
    )
if AZURE_SPEECH_REGION and not all(
    character.isalnum() or character == "-" for character in AZURE_SPEECH_REGION
):
    raise RuntimeError("ARI_AZURE_SPEECH_REGION must be a valid Azure region name.")
VOICE_IDS, VOICE_WINNERS = load_voice_mapping(VOICE_MAPPING_PATH)
if TTS_PROVIDER == "azure" and not AZURE_SPEECH_CONFIGURED:
    raise RuntimeError("Azure Speech requires both ARI_AZURE_SPEECH_KEY and ARI_AZURE_SPEECH_REGION.")
if TTS_PROVIDER == "g-labs" and not ENABLE_VOICE_BAKEOFF:
    raise RuntimeError("G-Labs Voice Studio is available only for internal voice bake-off.")
if ENABLE_VOICE_BAKEOFF:
    parsed_glabs_url = urllib.parse.urlsplit(GLABS_BASE_URL)
    if (
        parsed_glabs_url.scheme != "http"
        or not parsed_glabs_url.netloc
        or parsed_glabs_url.username
        or parsed_glabs_url.password
        or parsed_glabs_url.hostname not in ("127.0.0.1", "localhost", "::1")
        or parsed_glabs_url.path not in ("", "/")
        or parsed_glabs_url.query
        or parsed_glabs_url.fragment
    ):
        raise RuntimeError(
            "ARI_GLABS_BASE_URL must be a loopback HTTP URL without credentials, path, query, or fragment."
        )
    if TTS_PROVIDER == "g-labs" and not GLABS_API_KEY:
        raise RuntimeError("Set ARI_GLABS_API_KEY to enable the G-Labs Voice Studio provider.")
    if TTS_PROVIDER == "g-labs" and (
        not GLABS_FEMALE_PRESET_ID or not GLABS_MALE_PRESET_ID
    ):
        raise RuntimeError(
            "Set both ARI_GLABS_FEMALE_PRESET_ID and ARI_GLABS_MALE_PRESET_ID "
            "to saved Voice Studio preset IDs."
        )
    if GLABS_TIMEOUT_SECONDS <= 0:
        raise RuntimeError("ARI_GLABS_TIMEOUT_SECONDS must be a positive number.")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
models = {}
model_lock = threading.Lock()
tts_lock = threading.Lock()
converter = None
speaker_embeddings = {}
np = None
sf = None
torch = None
TTS = None
ToneColorConverter = None


def ensure_local_runtime():
    global LOCAL_RUNTIME_LOADED, np, sf, torch, TTS, ToneColorConverter
    if LOCAL_RUNTIME_LOADED:
        return

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ.setdefault("NLTK_DATA", str(NLTK_DATA_ROOT))
    sys.path.insert(0, str(OPENVOICE_ROOT))
    import nltk

    nltk.data.path.insert(0, str(NLTK_DATA_ROOT))
    try:
        nltk.data.find("corpora/cmudict.zip")
    except LookupError as error:
        raise FileNotFoundError(
            f"Offline NLTK cmudict archive not found under {NLTK_DATA_ROOT}"
        ) from error
    try:
        nltk.data.find("taggers/averaged_perceptron_tagger.zip")
    except LookupError:
        modern_tagger = NLTK_DATA_ROOT / "taggers" / "averaged_perceptron_tagger_eng.zip"
        if not modern_tagger.is_file():
            raise FileNotFoundError(
                f"Offline NLTK averaged perceptron tagger not found under {NLTK_DATA_ROOT}"
            )
        legacy_tagger = modern_tagger.with_name("averaged_perceptron_tagger.zip")
        with zipfile.ZipFile(modern_tagger) as source, zipfile.ZipFile(legacy_tagger, "w") as target:
            for name in source.namelist():
                target.writestr(
                    name.replace("averaged_perceptron_tagger_eng/", "averaged_perceptron_tagger/", 1),
                    source.read(name),
                )

    import numpy
    import soundfile
    import torch_module
    from melo.api import TTS as tts_class
    from openvoice.api import ToneColorConverter as converter_class

    np = numpy
    sf = soundfile
    torch = torch_module
    TTS = tts_class
    ToneColorConverter = converter_class
    LOCAL_RUNTIME_LOADED = True


def get_converter():
    ensure_local_runtime()
    global converter
    if converter is None:
        config_path = CONVERTER_ROOT / "config.json"
        checkpoint_path = CONVERTER_ROOT / "checkpoint.pth"
        if not config_path.is_file() or not checkpoint_path.is_file():
            raise FileNotFoundError(
                f"OpenVoice converter files are missing under {CONVERTER_ROOT}"
            )
        converter = ToneColorConverter(str(config_path), device=SPEECH_DEVICE)
        converter.watermark_model = None
        converter.load_ckpt(str(checkpoint_path))
        logging.info("OpenVoice converter loaded on %s", SPEECH_DEVICE)
    return converter


def get_speaker_embedding(gender):
    if gender not in speaker_embeddings:
        reference = FEMALE_REFERENCE if gender == "female" else MALE_REFERENCE
        if not reference.is_file():
            raise FileNotFoundError(
                f"OpenVoice {gender} reference audio is missing: {reference}"
            )
        speaker_embeddings[gender] = get_converter().extract_se(str(reference))
    return speaker_embeddings[gender]


def get_tts_model(language):
    ensure_local_runtime()
    with model_lock:
        if language not in models:
            models[language] = TTS(language=language, device=SPEECH_DEVICE)
            logging.info("MeloTTS %s model loaded on %s", language, SPEECH_DEVICE)
        return models[language]


def synthesize(text, language_code, gender):
    return synthesize_local(text, language_code, gender)


def synthesize_local(text, language_code, gender):
    language = LANGUAGE_NAMES[language_code]
    tts = get_tts_model(language)
    speaker_ids = tts.hps.data.spk2id
    speaker_name = "EN-Default" if language == "EN" else list(speaker_ids.keys())[0]
    if speaker_name not in speaker_ids:
        raise RuntimeError(f"MeloTTS has no configured speaker {speaker_name!r}")

    with tempfile.TemporaryDirectory(prefix="ari-tts-") as temp_dir:
        base_path = Path(temp_dir) / "base.wav"
        converted_path = Path(temp_dir) / "converted.wav"
        with tts_lock, torch.inference_mode():
            tts.tts_to_file(
                text,
                speaker_ids[speaker_name],
                str(base_path),
                quiet=True,
            )
            converter_model = get_converter()
            source_embedding = converter_model.extract_se(str(base_path))
            converter_model.convert(
                str(base_path),
                source_embedding,
                get_speaker_embedding(gender),
                output_path=str(converted_path),
            )
        audio, sample_rate = sf.read(str(converted_path), dtype="float32")
        audio_bytes = io.BytesIO()
        sf.write(audio_bytes, audio, sample_rate, format="WAV", subtype="PCM_16")
        return audio_bytes.getvalue()


def synthesize_azure(text, language_code, gender):
    voice, locale = AZURE_VOICES[language_code][gender]
    ssml = (
        f'<speak version="1.0" xml:lang="{locale}" '
        'xmlns="http://www.w3.org/2001/10/synthesis">'
        f'<voice name="{voice}" xml:lang="{locale}">{escape(text)}</voice>'
        '</speak>'
    ).encode("utf-8")
    request = urllib.request.Request(
        f"https://{AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1",
        data=ssml,
        headers={
            "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
            "User-Agent": "AriLanguageApp",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            content_type = response.headers.get("Content-Type", "").lower()
            if not content_type.startswith("audio/"):
                raise RuntimeError("Azure Speech returned a non-audio response.")
            audio = response.read(MAX_AUDIO_BYTES + 1)
            if not audio or len(audio) > MAX_AUDIO_BYTES:
                raise RuntimeError("Azure Speech returned empty or oversized audio.")
            return audio
    except urllib.error.HTTPError as error:
        logging.error("Azure Speech request failed with HTTP %s", error.code)
        if error.code in (401, 403):
            message = "Azure Speech rejected the key or region. Check your Speech resource credentials."
        elif error.code == 429:
            message = "Azure Speech quota or rate limit reached. Check your Azure Speech plan."
        else:
            message = f"Azure Speech could not generate audio (HTTP {error.code})."
        raise RuntimeError(message) from error
    except urllib.error.URLError as error:
        raise RuntimeError("Could not connect to the Azure Speech endpoint. Check internet access and the configured region.") from error


def _glabs_request(path, method="GET", payload=None, authenticated=True):
    headers = {"Accept": "application/json"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if authenticated:
        headers["X-API-Key"] = GLABS_API_KEY
    request = urllib.request.Request(
        f"{GLABS_BASE_URL}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read(GLABS_MAX_JSON_BYTES + 1)
            if len(raw) > GLABS_MAX_JSON_BYTES:
                raise RuntimeError("G-Labs Voice Studio returned an oversized JSON response.")
            try:
                return json.loads(raw)
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise RuntimeError("G-Labs Voice Studio returned invalid JSON.") from error
    except urllib.error.HTTPError as error:
        logging.error("G-Labs Voice Studio request failed with HTTP %s", error.code)
        if error.code == 401:
            message = "G-Labs Voice Studio rejected its API key. Check ARI_GLABS_API_KEY."
        elif error.code == 404:
            message = "G-Labs Voice Studio endpoint or task was not found."
        else:
            message = f"G-Labs Voice Studio request failed (HTTP {error.code})."
        raise RuntimeError(message) from error
    except urllib.error.URLError as error:
        raise RuntimeError(
            "Could not connect to G-Labs Voice Studio. Check that its Webhook server is running."
        ) from error


def _glabs_result_url(value):
    if not isinstance(value, str) or not value:
        raise RuntimeError("G-Labs Voice Studio returned an invalid audio URL.")
    result = urllib.parse.urlsplit(urllib.parse.urljoin(f"{GLABS_BASE_URL}/", value))
    base = urllib.parse.urlsplit(GLABS_BASE_URL)
    if (
        result.scheme != base.scheme
        or result.hostname != base.hostname
        or result.port != base.port
        or not result.path.startswith("/api/files/")
        or not result.path.removeprefix("/api/files/")
    ):
        raise RuntimeError("G-Labs Voice Studio returned an unexpected audio URL.")
    file_name = urllib.parse.unquote(result.path.removeprefix("/api/files/"))
    if "/" in file_name or "\\" in file_name or file_name in (".", ".."):
        raise RuntimeError("G-Labs Voice Studio returned an unsafe audio file path.")
    return result.geturl()


def synthesize_glabs(text, language_code, gender):
    preset_id = (
        GLABS_FEMALE_PRESET_ID if gender == "female" else GLABS_MALE_PRESET_ID
    )
    submitted = _glabs_request(
        "/api/voice/design",
        method="POST",
        payload={
            "preset_id": preset_id,
            "script": text,
            "language": LANGUAGE_LABELS[language_code],
            "output_format": "mp3",
        },
    )
    task_id = submitted.get("task_id") if isinstance(submitted, dict) else None
    if not isinstance(task_id, str) or not task_id or len(task_id) > 128:
        raise RuntimeError("G-Labs Voice Studio returned an invalid task ID.")
    deadline = time.monotonic() + GLABS_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        status = _glabs_request(
            f"/api/status/{urllib.parse.quote(task_id, safe='')}"
        )
        if not isinstance(status, dict):
            raise RuntimeError("G-Labs Voice Studio returned an invalid task status.")
        task_state = status.get("status")
        if task_state == "failed":
            detail = status.get("error")
            raise RuntimeError(
                "G-Labs Voice Studio could not generate audio"
                + (f": {detail[:300]}" if isinstance(detail, str) and detail else ".")
            )
        if task_state == "completed":
            results = status.get("results")
            if not isinstance(results, list) or len(results) != 1:
                raise RuntimeError(
                    "G-Labs Voice Studio returned an unexpected number of audio files."
                )
            audio_url = _glabs_result_url(results[0])
            request = urllib.request.Request(audio_url, headers={"Accept": "audio/*"})
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    content_type = response.headers.get("Content-Type", "").lower()
                    if content_type not in ("audio/mpeg", "audio/wav", "audio/x-wav"):
                        raise RuntimeError(
                            "G-Labs Voice Studio returned an unsupported audio format."
                        )
                    audio = response.read(MAX_AUDIO_BYTES + 1)
                    if not audio or len(audio) > MAX_AUDIO_BYTES:
                        raise RuntimeError(
                            "G-Labs Voice Studio returned empty or oversized audio."
                        )
                    return audio, content_type
            except urllib.error.HTTPError as error:
                raise RuntimeError(
                    f"Could not download G-Labs Voice Studio audio (HTTP {error.code})."
                ) from error
            except urllib.error.URLError as error:
                raise RuntimeError(
                    "Could not download the generated G-Labs Voice Studio audio."
                ) from error
        if task_state not in ("pending", "running"):
            raise RuntimeError("G-Labs Voice Studio returned an unknown task status.")
        time.sleep(min(GLABS_POLL_INTERVAL_SECONDS, max(0, deadline - time.monotonic())))
    raise RuntimeError(
        f"G-Labs Voice Studio synthesis timed out after {GLABS_TIMEOUT_SECONDS} seconds."
    )


def _voice_ids_for(provider_name, language, env_prefix=None):
    configured = dict(
        VOICE_IDS.get(provider_name, {}).get(language, {})
    )
    if env_prefix:
        for gender in ("male", "female"):
            key = f"{env_prefix}_{language.upper()}_{gender.upper()}"
            if os.environ.get(key, "").strip():
                configured[gender] = os.environ[key].strip()
    return configured


def _tencent_voice_ids(provider_name="tencent", env_prefix="ARI_TENCENT_VOICE"):
    voice_ids = {}
    for language in ("zh", "en", "zh-en-mixed"):
        voice_ids[language] = _voice_ids_for(
            provider_name, language, env_prefix
        )
        for gender in ("male", "female"):
            value = voice_ids[language].get(gender)
            if value is not None:
                try:
                    voice_ids[language][gender] = str(int(value))
                except (TypeError, ValueError) as error:
                    raise RuntimeError(
                        f"Tencent {language} {gender} voice ID must be a numeric VoiceType."
                    ) from error
    return voice_ids


def _build_tts_router():
    providers = {}
    azure_voices = {
        language: {
            gender: voice
            for gender, (voice, _locale) in voices.items()
        }
        for language, voices in AZURE_VOICES.items()
    }
    if AZURE_SPEECH_CONFIGURED:
        providers["azure"] = ConfiguredTTSProvider(
            "azure",
            azure_voices,
            lambda text, language, gender: AudioResult(
                synthesize_azure(text, language, gender), "audio/wav"
            ),
            AZURE_VOICES.keys(),
        )

    kokoro_base_url = os.environ.get("ARI_KOKORO_BASE_URL", "").strip()
    if kokoro_base_url:
        kokoro_voices = {
            language: _voice_ids_for("kokoro", language, "ARI_KOKORO_VOICE")
            for language in ("zh", "en", "fr", "es", "ja")
        }
        providers["kokoro"] = KokoroTTSProvider(
            kokoro_base_url,
            kokoro_voices,
            os.environ.get("ARI_KOKORO_API_KEY", ""),
        )

    tencent_secret_id = os.environ.get("TENCENTCLOUD_SECRET_ID", "").strip()
    tencent_secret_key = os.environ.get("TENCENTCLOUD_SECRET_KEY", "").strip()
    if DEPLOYMENT_REGION == "china" and bool(tencent_secret_id) != bool(tencent_secret_key):
        raise RuntimeError(
            "Set both TENCENTCLOUD_SECRET_ID and TENCENTCLOUD_SECRET_KEY to enable Tencent TTS."
        )
    if (
        DEPLOYMENT_REGION == "china"
        and tencent_secret_id
        and tencent_secret_key
    ):
        providers["tencent"] = TencentTTSProvider(
            tencent_secret_id,
            tencent_secret_key,
            _tencent_voice_ids(),
            os.environ.get("ARI_TENCENT_REGION", "ap-guangzhou"),
        )
        if ENABLE_VOICE_BAKEOFF:
            for candidate, prefix in (
                ("tencent-standard", "ARI_TENCENT_STANDARD_VOICE"),
                ("tencent-premium", "ARI_TENCENT_PREMIUM_VOICE"),
            ):
                providers[candidate] = TencentTTSProvider(
                    tencent_secret_id,
                    tencent_secret_key,
                    _tencent_voice_ids(candidate, prefix),
                    os.environ.get("ARI_TENCENT_REGION", "ap-guangzhou"),
                )

    local_voices = {
        language: {"male": "local-male", "female": "local-female"}
        for language in LANGUAGE_NAMES
    }
    providers["local"] = ConfiguredTTSProvider(
        "local", local_voices, synthesize_local, LANGUAGE_NAMES.keys()
    )

    if ENABLE_VOICE_BAKEOFF:
        if GLABS_API_KEY and GLABS_FEMALE_PRESET_ID and GLABS_MALE_PRESET_ID:
            providers["g-labs"] = ConfiguredTTSProvider(
                "g-labs",
                {
                    language: {
                        "male": GLABS_MALE_PRESET_ID,
                        "female": GLABS_FEMALE_PRESET_ID,
                    }
                    for language in LANGUAGE_NAMES
                },
                lambda text, language, gender: AudioResult(
                    *synthesize_glabs(text, language, gender)
                ),
                LANGUAGE_NAMES.keys(),
            )
        elif TTS_PROVIDER == "g-labs":
            raise RuntimeError(
                "Internal G-Labs bake-off requires its API key and both preset IDs."
            )

    region_config = json.loads(VOICE_MAPPING_PATH.read_text(encoding="utf-8"))
    orders = region_config["regions"][DEPLOYMENT_REGION]
    normalization = region_config["normalization"]
    audio_cache = AudioCache(
        ttl_seconds=normalization["cacheTtlSeconds"],
        max_bytes=normalization["cacheMaxBytes"],
    )
    return TTSRouter(
        DEPLOYMENT_REGION,
        providers,
        orders,
        VOICE_WINNERS[DEPLOYMENT_REGION],
        audio_cache,
        normalization,
    )


TTS_ROUTER = _build_tts_router()
SPEECH_PROVIDER = f"regional TTS router ({DEPLOYMENT_REGION})"


def synthesize_with_provider(text, language_code, gender, provider_override=None):
    if TTS_PROVIDER != "auto":
        provider_override = TTS_PROVIDER
    result, provider_name = TTS_ROUTER.synthesize(
        text, language_code, gender, provider_override
    )
    logging.info("Speech generated with %s for %s (%s)", provider_name, language_code, gender)
    return result


class SpeechHandler(BaseHTTPRequestHandler):
    def send_json(self, status, message):
        payload = json.dumps({"error": {"message": message}}).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path != "/health":
            self.send_json(404, "Unknown endpoint.")
            return
        payload = json.dumps({
            "status": "ready",
            "device": SPEECH_DEVICE,
            "provider": SPEECH_PROVIDER,
            "languages": list(LANGUAGE_NAMES),
            "region": DEPLOYMENT_REGION,
            "configuredProviders": sorted(TTS_ROUTER.providers),
            "voiceBakeoffEnabled": ENABLE_VOICE_BAKEOFF,
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        if self.path != "/v1/audio/speech":
            self.send_json(404, "Unknown endpoint.")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 64 * 1024:
                self.send_json(400, "Request body must be between 1 and 65536 bytes.")
                return
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                self.send_json(400, "Request body must be a JSON object.")
                return
            text = body.get("input")
            language = body.get("language")
            gender = body.get("gender")
            provider = body.get("provider")
            if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT_LENGTH:
                self.send_json(400, f"Speech text must contain between 1 and {MAX_TEXT_LENGTH} characters.")
                return
            if language not in LANGUAGE_NAMES:
                self.send_json(400, "Supported speech languages are English, French, Spanish, Mandarin, and Japanese.")
                return
            if gender not in ("female", "male"):
                self.send_json(400, "Choose either a female or male voice.")
                return
            if provider is not None:
                if not ENABLE_VOICE_BAKEOFF:
                    self.send_json(400, "Provider overrides are disabled outside internal voice bake-off.")
                    return
                if not isinstance(provider, str) or provider not in TTS_ROUTER.providers:
                    self.send_json(400, "Choose a configured provider for internal voice bake-off.")
                    return

            audio = synthesize_with_provider(text, language, gender, provider)
            self.send_response(200)
            self.send_header("Content-Type", audio.content_type)
            self.send_header("Content-Length", str(len(audio.data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(audio.data)
        except json.JSONDecodeError:
            self.send_json(400, "Request body must be valid JSON.")
        except (BrokenPipeError, ConnectionResetError):
            logging.info("Speech request ended before its response was delivered")
        except Exception as error:
            logging.exception("Speech generation failed")
            self.send_json(503, f"Speech generation failed: {str(error)[:300]}")

    def log_message(self, format_string, *args):
        logging.info("%s - %s", self.address_string(), format_string % args)


if __name__ == "__main__":
    logging.info(
        "Ari speech service listening on http://127.0.0.1:%s (provider=%s, device=%s)",
        PORT,
        SPEECH_PROVIDER,
        SPEECH_DEVICE,
    )
    ThreadingHTTPServer(("127.0.0.1", PORT), SpeechHandler).serve_forever()
