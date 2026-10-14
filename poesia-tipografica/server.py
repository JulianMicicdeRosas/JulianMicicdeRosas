#!/usr/bin/env python3
"""
server.py — Poesía Tipográfica · cerebro de la instalación.

    micrófono ──► AudioEngine ──(RMS/FFT cada 10 ms)──────────────► "audio_reactive"
                      │
                      └─(PCM16 24 kHz)──► RealtimeTranscriber (OpenAI) ──► "word_delta"
                                                    │                     "verse_completed"
                                                    └─(verso)──► ArtDirector (Ollama/DeepSeek) ──► "art_direction"

Todo se difunde al frontend Three.js por ws://WS_HOST:WS_PORT (por defecto ws://localhost:8765).

Uso:
    python server.py                 # modo instalación
    python server.py --list-devices  # listar micrófonos
    python server.py --no-openai     # sólo audio reactivo + director (inyectar versos desde el navegador)
    python server.py --no-audio      # sin micrófono (calibración del proyector)
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import logging
import math
import os
import random
import re
import subprocess
import sys
import time
import unicodedata
from collections import deque
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

import httpx
import numpy as np
from dotenv import load_dotenv
from websockets.asyncio.client import connect as ws_connect
from websockets.asyncio.server import ServerConnection, broadcast, serve
from websockets.exceptions import ConnectionClosed, InvalidStatus, InvalidURI

try:  # PortAudio puede faltar en máquinas de desarrollo; en Windows viene incluido en la wheel.
    import sounddevice as sd
except Exception as _sd_exc:  # pragma: no cover - depende del sistema
    sd = None
    _SD_IMPORT_ERROR: Exception | None = _sd_exc
else:
    _SD_IMPORT_ERROR = None

log = logging.getLogger("poesia")


# ════════════════════════════════════════════════════════════════════════════
#  Configuración
# ════════════════════════════════════════════════════════════════════════════

def _env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    return default if value is None or value.strip() == "" else value.strip()


def _env_bool(name: str, default: bool) -> bool:
    return _env(name, "true" if default else "false").lower() in ("1", "true", "yes", "si", "sí", "on")


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(float(_env(name, str(default))))
    except ValueError:
        return default


# ── Clave de OpenAI: fuera de la carpeta del proyecto ────────────────────────
# macOS → Llavero (servicio "poesia-tipografica"); otros sistemas → ~/.poesia-tipografica/openai_key (600).
# Así actualizar o volver a descargar el proyecto no borra la clave, y se puede cambiar desde el panel C.
KEY_SERVICE = "poesia-tipografica"
KEY_ACCOUNT = "openai"
KEY_FILE = os.path.join(os.path.expanduser("~"), ".poesia-tipografica", "openai_key")
PLACEHOLDER_KEYS = {"", "sk-...", "sk-…", "tu-clave", "TU_CLAVE"}


def _read_stored_key() -> str:
    if sys.platform == "darwin":
        try:
            r = subprocess.run(["security", "find-generic-password", "-s", KEY_SERVICE, "-a", KEY_ACCOUNT, "-w"],
                               capture_output=True, text=True, timeout=5)
            if r.returncode == 0 and r.stdout.strip():
                return r.stdout.strip()
        except Exception:
            pass
    try:
        with open(KEY_FILE, encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        return ""


def load_api_key(env_value: str) -> tuple[str, str]:
    """(clave, origen). La guardada (Llavero/archivo) manda sobre .env: es la última que se pegó."""
    stored = _read_stored_key()
    if stored:
        return stored, "Llavero de macOS" if sys.platform == "darwin" else KEY_FILE
    env_value = (env_value or "").strip()
    if env_value not in PLACEHOLDER_KEYS:
        return env_value, ".env"
    return "", ""


def save_api_key(key: str) -> str:
    """Guarda la clave fuera del proyecto. Devuelve dónde quedó."""
    if sys.platform == "darwin":
        r = subprocess.run(["security", "add-generic-password", "-U", "-s", KEY_SERVICE, "-a", KEY_ACCOUNT,
                            "-l", "Poesía Tipográfica · OpenAI", "-w", key],
                           capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            return "Llavero de macOS"
        log.warning("No pude guardar en el Llavero (%s); uso archivo", r.stderr.strip())
    os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)
    fd = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(key)
    return KEY_FILE


def mask_key(key: str) -> str:
    return f"{key[:7]}…{key[-4:]}" if len(key) > 14 else ("(vacía)" if not key else "…")


@dataclass
class Config:
    openai_api_key: str
    openai_key_source: str
    realtime_api: str
    realtime_ga_url: str
    realtime_url: str
    transcription_model: str
    transcription_language: str
    transcription_prompt: str
    vad_threshold: float
    vad_silence_ms: int
    vad_prefix_ms: int

    audio_device: str
    audio_channel: int
    sample_rate: int
    block_ms: int
    fft_size: int
    floor_db: float
    ceil_db: float
    openai_chunk_ms: int

    ws_host: str
    ws_port: int

    llm_provider: str
    llm_fallback_deepseek: bool
    llm_timeout: float
    llm_temperature: float
    ollama_url: str
    ollama_model: str
    ollama_keep_alive: str
    deepseek_key: str
    openai_director_model: str
    deepseek_base_url: str
    deepseek_model: str

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            openai_api_key=(_key := load_api_key(_env("OPENAI_API_KEY")))[0],
            openai_key_source=_key[1],
            realtime_api=_env("OPENAI_REALTIME_API", "auto").lower(),
            realtime_ga_url=_env("OPENAI_REALTIME_GA_URL", "wss://api.openai.com/v1/realtime?intent=transcription"),
            realtime_url=_env("OPENAI_REALTIME_URL",
                              "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview"),
            transcription_model=_env("TRANSCRIPTION_MODEL", "gpt-4o-transcribe"),
            transcription_language=_env("TRANSCRIPTION_LANGUAGE", "es"),
            # la pista vieja por defecto se colaba en la transcripción: se ignora aunque siga en .env
            transcription_prompt="" if _env("TRANSCRIPTION_PROMPT", "").startswith("Lectura de poesía")
            else _env("TRANSCRIPTION_PROMPT", ""),
            vad_threshold=_env_float("VAD_THRESHOLD", 0.5),
            vad_silence_ms=_env_int("VAD_SILENCE_MS", 350),
            vad_prefix_ms=_env_int("VAD_PREFIX_PADDING_MS", 300),
            audio_device=_env("AUDIO_DEVICE"),
            audio_channel=max(1, _env_int("AUDIO_CHANNEL", 1)),  # entrada de la placa (Focusrite: 1..18)
            sample_rate=_env_int("AUDIO_SAMPLE_RATE", 24000),
            block_ms=max(5, _env_int("AUDIO_BLOCK_MS", 10)),
            fft_size=max(512, _env_int("AUDIO_FFT_SIZE", 2048)),
            floor_db=_env_float("AUDIO_FLOOR_DB", -58.0),
            ceil_db=_env_float("AUDIO_CEIL_DB", -14.0),
            openai_chunk_ms=max(20, _env_int("OPENAI_CHUNK_MS", 100)),
            ws_host=_env("WS_HOST", "localhost"),
            ws_port=_env_int("WS_PORT", 8765),
            llm_provider=_env("LLM_PROVIDER", "ollama").lower(),
            llm_fallback_deepseek=_env_bool("LLM_FALLBACK_TO_DEEPSEEK", True),
            llm_timeout=_env_float("LLM_TIMEOUT_S", 25.0),
            llm_temperature=_env_float("LLM_TEMPERATURE", 0.7),
            ollama_url=_env("OLLAMA_URL", "http://localhost:11434/api/chat"),
            ollama_model=_env("OLLAMA_MODEL", "qwen2.5:7b"),
            ollama_keep_alive=_env("OLLAMA_KEEP_ALIVE", "30m"),
            deepseek_key=_env("DEEPSEEK_API_KEY"),
            openai_director_model=_env("OPENAI_DIRECTOR_MODEL", "gpt-4.1-mini"),
            deepseek_base_url=_env("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").rstrip("/"),
            deepseek_model=_env("DEEPSEEK_MODEL", "deepseek-chat"),
        )


def _now_ms() -> int:
    return int(time.time() * 1000)


# ════════════════════════════════════════════════════════════════════════════
#  Ajustes persistentes del show (micrófono, artistas, loop, prompt estético)
# ════════════════════════════════════════════════════════════════════════════

class SettingsStore:
    """settings.local.json junto a server.py. Lo escribe el panel C del frontend."""

    KEYS = ("device", "artists", "loop", "prompt_estetica", "avisos", "pointcloud", "profundidad", "nube", "orbita",
            "curaduria", "imagenes", "prompt_grilla", "polaridad", "director", "cadencia", "estilos", "glitch_ambiente", "ascii_filas",
            "marca", "muro", "formato", "canal")

    def __init__(self, path: str) -> None:
        self.path = path
        self.data: dict[str, Any] = {}
        try:
            with open(path, encoding="utf-8") as fh:
                loaded = json.load(fh)
            if isinstance(loaded, dict):
                self.data = {k: v for k, v in loaded.items() if k in self.KEYS}
        except FileNotFoundError:
            pass
        except Exception as exc:
            log.warning("No pude leer %s: %s", path, exc)

    def get(self, key: str, default: Any = None) -> Any:
        return self.data.get(key, default)

    def update(self, patch: dict[str, Any]) -> None:
        for k, v in patch.items():
            if k in self.KEYS:
                self.data[k] = v
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(self.data, fh, ensure_ascii=False, indent=1)
        os.replace(tmp, self.path)  # escritura atómica: un corte de luz no corrompe el archivo


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Carpeta del usuario, FUERA del proyecto: actualizar o volver a descargar el programa no borra
# los logos ni los ajustes. macOS/Windows: Documentos/Umbral (se puede cambiar con UMBRAL_DIR).
_docs = os.path.join(os.path.expanduser("~"), "Documents")
USER_DIR = os.path.realpath(os.environ.get("UMBRAL_DIR") or os.path.join(_docs if os.path.isdir(_docs) else os.path.expanduser("~"), "Umbral"))
LOGO_GROUPS = ("flat", "organizadores", "socio-cultural", "patrocinadores", "acompanan", "embajadas", "media-partner")


def ensure_user_dir() -> None:
    """Crea Documentos/Umbral/logos/<grupo> (ver LOGO_GROUPS) con un LEEME."""
    try:
        logos = os.path.join(USER_DIR, "logos")
        os.makedirs(logos, exist_ok=True)
        existing = {_norm_folder(e) for e in os.listdir(logos)}
        for g in LOGO_GROUPS:
            if _norm_folder(g) not in existing:  # no duplicar «socio cultural» / «Socio_Cultural»…
                os.makedirs(os.path.join(logos, g), exist_ok=True)
        readme = os.path.join(USER_DIR, "LEEME.txt")
        if not os.path.exists(readme):
            with open(readme, "w", encoding="utf-8") as fh:
                fh.write("Umbral · carpeta de la muestra (no se borra al actualizar el programa)\n\n"
                         "logos/flat             → abre el loop: el logo de FLAT (centro del evento)\n"
                         "logos/organizadores    → primero\n"
                         "logos/socio-cultural   → segundo (más tiempo en pantalla)\n"
                         "logos/patrocinadores   → tercero\n"
                         "logos/acompanan        → cuarto\n"
                         "logos/embajadas        → quinto\n"
                         "logos/media-partner    → sexto\n\n"
                         "Copia los archivos (PNG transparente ideal; JPG con fondo blanco también) en cada carpeta.\n"
                         "Se muestran en orden alfabético: para forzar un orden, numéralos (01-flat.png, 02-...).\n"
                         "No hace falta reiniciar: el loop relee las carpetas en cada vuelta.\n\n"
                         "ajustes.json → artistas, curaduría, loop y demás opciones del panel C.\n")
    except OSError as exc:
        log.warning("No pude crear %s: %s", USER_DIR, exc)
LOGO_EXT = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
            ".svg": "image/svg+xml", ".gif": "image/gif"}
_logo_cache: dict[str, tuple[float, int, str]] = {}


def _norm_folder(name: str) -> str:
    return re.sub(r"[\s_\-]+", "", strip_accents(name.lower()))


def _has_images(path: str) -> bool:
    try:
        return any(os.path.splitext(n)[1].lower() in LOGO_EXT for n in os.listdir(path))
    except OSError:
        return False


def _resolve_logo_folder(folder: str) -> str:
    """Busca la carpeta en Documentos/Umbral y luego en el proyecto, tolerando «socio cultural» /
    «socio-cultural» / «socio_cultural» y mayúsculas. Sólo dentro de esas dos raíces."""
    folder = (folder or "").strip().strip("/\\")
    found: list[str] = []
    for root in (USER_DIR, BASE_DIR):
        target = os.path.realpath(os.path.join(root, folder))
        if not (target == root or target.startswith(root + os.sep)):
            continue
        parent, name = os.path.split(target)
        if not os.path.isdir(parent):
            continue
        # mismo nombre ignorando mayúsculas, tildes, espacios, guiones y guiones bajos
        for entry in sorted(os.listdir(parent)):
            full = os.path.join(parent, entry)
            if os.path.isdir(full) and _norm_folder(entry) == _norm_folder(name):
                found.append(full)
    with_images = [f for f in found if _has_images(f)]
    return (with_images or found or [""])[0]


FLAT_LOGO_URL = "https://centroeesonoros.org/wp-content/uploads/2026/08/FLAT-Logo-web-2-e1785969706315.png"


def ensure_flat_logo() -> str:
    """Si no hay logo de FLAT, lo toma de Descargas (FLAT-Logo*.png) o lo baja de la web a Documentos/Umbral/logos/flat."""
    if _has_images(_resolve_logo_folder("logos/flat") or ""):
        return "ya estaba"
    dest_dir = os.path.join(USER_DIR, "logos", "flat")
    os.makedirs(dest_dir, exist_ok=True)
    home = os.path.expanduser("~")
    cands = []
    for d in ("Downloads", "Descargas", "Desktop", "Escritorio"):
        folder = os.path.join(home, d)
        if not os.path.isdir(folder):
            continue
        for name in os.listdir(folder):
            n = name.lower()
            if n.startswith("flat") and "logo" in n and os.path.splitext(n)[1] in LOGO_EXT:
                cands.append(os.path.join(folder, name))
    if cands:
        src = max(cands, key=os.path.getmtime)
        import shutil
        shutil.copy2(src, os.path.join(dest_dir, os.path.basename(src)))
        log.info("Logo de FLAT copiado de %s", src)
        return f"copiado de {src}"
    try:
        r = httpx.get(FLAT_LOGO_URL, timeout=12, follow_redirects=True)
        r.raise_for_status()
        if not r.content.startswith(b"\x89PNG"):
            raise RuntimeError("la respuesta no es un PNG")
        with open(os.path.join(dest_dir, "FLAT-Logo.png"), "wb") as fh:
            fh.write(r.content)
        log.info("Logo de FLAT descargado de la web")
        return "descargado"
    except Exception as exc:  # noqa: BLE001
        log.warning("Sin logo de FLAT (ponlo en %s): %s", dest_dir, exc)
        return f"falta: {exc}"


def read_logo_folder(folder: str) -> list[dict[str, str]]:
    """Lee todos los logos de una carpeta (relativa al proyecto) como data URLs, en orden alfabético.
    Así basta con soltar archivos en la carpeta: el loop se adapta a la cantidad."""
    path = _resolve_logo_folder(folder)
    if not path:
        return []
    out = []
    for name in sorted(os.listdir(path), key=str.lower):
        ext = os.path.splitext(name)[1].lower()
        full = os.path.join(path, name)
        if ext not in LOGO_EXT or name.startswith(".") or not os.path.isfile(full):
            continue
        st = os.stat(full)
        if st.st_size > 6 * 2 ** 20:
            log.warning("Logo %s supera 6 MB; lo salto", name)
            continue
        hit = _logo_cache.get(full)
        if not hit or hit[0] != st.st_mtime or hit[1] != st.st_size:
            with open(full, "rb") as fh:
                data = base64.b64encode(fh.read()).decode("ascii")
            hit = (st.st_mtime, st.st_size, f"data:{LOGO_EXT[ext]};base64,{data}")
            _logo_cache[full] = hit
        out.append({"name": name, "src": hit[2]})
    return out


# ════════════════════════════════════════════════════════════════════════════
#  Hub WebSocket local (Three.js)
# ════════════════════════════════════════════════════════════════════════════

class FrontendHub:
    """Servidor WebSocket local. Difunde sin backpressure (los clientes son locales)."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.clients: set[ServerConnection] = set()
        self.on_message: Callable[[dict[str, Any], ServerConnection], Awaitable[None]] | None = None
        self.status: dict[str, Any] = {"mic": "init", "openai": "init", "llm": cfg.llm_provider}
        # Estado del show dictado por el frontend: sólo se transcribe mientras recording=True.
        self.session: dict[str, Any] = {"recording": False, "mode": "poema"}
        self.hello_extra: Callable[[], dict[str, Any]] = lambda: {}

    async def handler(self, ws: ServerConnection) -> None:
        self.clients.add(ws)
        peer = getattr(ws, "remote_address", None)
        log.info("Frontend conectado %s (%d clientes)", peer, len(self.clients))
        try:
            await ws.send(self._encode("hello", server="poesia-tipografica", version=2,
                                       sample_rate=self.cfg.sample_rate, status=self.status,
                                       **self.hello_extra()))
            async for raw in ws:
                if isinstance(raw, bytes):
                    continue
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not isinstance(msg, dict):
                    continue
                if msg.get("type") == "ping":
                    await ws.send(self._encode("pong", t=msg.get("t"), server_t=_now_ms()))
                    continue
                if self.on_message is not None:
                    try:
                        await self.on_message(msg, ws)
                    except Exception:  # un mensaje malformado nunca tumba el servidor
                        log.exception("Error procesando mensaje del frontend")
        except ConnectionClosed:
            pass
        finally:
            self.clients.discard(ws)
            log.info("Frontend desconectado %s (%d clientes)", peer, len(self.clients))

    @staticmethod
    def _encode(type_: str, **payload: Any) -> str:
        return json.dumps({"type": type_, **payload}, ensure_ascii=False, separators=(",", ":"))

    def emit(self, type_: str, **payload: Any) -> None:
        if not self.clients:
            return
        broadcast(self.clients, self._encode(type_, **payload))

    async def reply(self, ws: ServerConnection | None, type_: str, **payload: Any) -> None:
        if ws is None:
            self.emit(type_, **payload)
        else:
            try:
                await ws.send(self._encode(type_, **payload))
            except ConnectionClosed:
                pass

    def set_status(self, **changes: Any) -> None:
        self.status.update(changes)
        self.emit("status", status=self.status)


# ════════════════════════════════════════════════════════════════════════════
#  Audio: captura + análisis RMS/FFT + envío a OpenAI
# ════════════════════════════════════════════════════════════════════════════

class LinearResampler:
    """Remuestreo lineal en streaming (sólo si el dispositivo no acepta 24 kHz)."""

    def __init__(self, src_rate: float, dst_rate: float) -> None:
        self.ratio = src_rate / dst_rate
        self._pos = 0.0
        self._tail = np.zeros(1, dtype=np.float32)

    def process(self, x: np.ndarray) -> np.ndarray:
        buf = np.concatenate((self._tail, x))
        last = len(buf) - 1
        if self._pos > last:
            self._pos -= len(x)
            self._tail = buf[-1:]
            return np.zeros(0, dtype=np.float32)
        count = int(math.floor((last - self._pos) / self.ratio)) + 1
        t = self._pos + np.arange(count, dtype=np.float64) * self.ratio
        out = np.interp(t, np.arange(len(buf)), buf).astype(np.float32)
        self._pos = float(t[-1] + self.ratio - last)
        self._tail = buf[-1:]
        return out


class AudioEngine:
    VOICE_LO_HZ = 70.0
    VOICE_HI_HZ = 1100.0
    N_BANDS = 8

    def __init__(self, cfg: Config, hub: FrontendHub, openai_queue: asyncio.Queue[bytes] | None,
                 loop: asyncio.AbstractEventLoop) -> None:
        self.cfg = cfg
        self.hub = hub
        self.openai_queue = openai_queue
        self.loop = loop
        self.sr = cfg.sample_rate
        self.block = max(64, int(self.sr * cfg.block_ms / 1000))
        self.fft_size = int(2 ** math.ceil(math.log2(cfg.fft_size)))
        self.ring = np.zeros(self.fft_size, dtype=np.float32)
        self.window = np.hanning(self.fft_size).astype(np.float32)
        self.freqs = np.fft.rfftfreq(self.fft_size, 1.0 / self.sr)
        self.voice_mask = (self.freqs >= self.VOICE_LO_HZ) & (self.freqs <= self.VOICE_HI_HZ)
        self.voice_idx = np.nonzero(self.voice_mask)[0]
        edges = np.geomspace(80.0, min(9000.0, self.sr / 2 - 1), self.N_BANDS + 1)
        self.band_slices = [
            (int(np.searchsorted(self.freqs, lo)), max(int(np.searchsorted(self.freqs, hi)),
                                                       int(np.searchsorted(self.freqs, lo)) + 1))
            for lo, hi in zip(edges[:-1], edges[1:])
        ]
        self.raw_q: asyncio.Queue[bytes] = asyncio.Queue(maxsize=400)
        self.env = 0.0
        self.freq_smooth = 0.0
        self.peak_hold = 1e-3
        self.chunk_bytes = int(self.sr * cfg.openai_chunk_ms / 1000) * 2
        self.pcm_acc = bytearray()
        self.overflows = 0
        self.resampler: LinearResampler | None = None
        self.device_override: str | None = None  # elegido desde el panel C (tiene prioridad sobre .env)
        self.channel_override: int | None = None  # entrada de una placa multicanal, 1 = la primera
        self.nch = 1  # canales abiertos en el stream (se usa sólo self.ch_idx)
        self.ch_idx = 0
        self._restart = False
        self.device_name = ""
        self.zero_blocks = 0  # bloques de silencio digital absoluto (macOS sin permiso de micrófono)

    def request_channel(self, channel: int | str | None) -> None:
        try:
            self.channel_override = max(1, int(channel)) if channel not in (None, "") else None
        except (TypeError, ValueError):
            self.channel_override = None
        self._restart = True

    def request_device(self, device: str | int | None) -> None:
        """Cambia de micrófono en caliente: el bucle cierra el stream y reabre con el nuevo."""
        self.device_override = "" if device in (None, "") else str(device)
        self._restart = True

    @staticmethod
    def list_devices() -> list[dict[str, Any]]:
        if sd is None:
            return []
        out = []
        try:
            default_in = sd.default.device[0] if sd.default.device else None
            for idx, info in enumerate(sd.query_devices()):
                if info.get("max_input_channels", 0) > 0:
                    out.append({"index": idx, "name": info["name"],
                                "hostapi": sd.query_hostapis(info["hostapi"])["name"],
                                "samplerate": int(info["default_samplerate"]),
                                "channels": int(info["max_input_channels"]),
                                "default": idx == default_in})
        except Exception as exc:
            log.warning("No pude listar dispositivos: %s", exc)
        return out

    # --- hilo de PortAudio → bucle asyncio --------------------------------
    def _callback(self, indata, frames, time_info, status) -> None:  # noqa: ANN001
        if status:
            self.overflows += 1
        self.loop.call_soon_threadsafe(self._push, bytes(indata))

    def _push(self, data: bytes) -> None:
        try:
            self.raw_q.put_nowait(data)
        except asyncio.QueueFull:
            try:
                self.raw_q.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self.raw_q.put_nowait(data)

    def _resolve_device(self) -> int | str | None:
        dev = self.cfg.audio_device if self.device_override is None else self.device_override
        if not dev:
            return None
        if dev.lstrip("-").isdigit():
            return int(dev)
        needle = dev.lower()
        for idx, info in enumerate(sd.query_devices()):
            if info.get("max_input_channels", 0) > 0 and needle in info.get("name", "").lower():
                return idx
        log.warning("Dispositivo '%s' no encontrado; uso el de entrada por defecto", dev)
        return None

    def _open_stream(self):  # noqa: ANN202
        device = self._resolve_device()
        info = sd.query_devices(device, "input")
        # placa multicanal (p. ej. Focusrite 18i20): se abren los canales hasta el elegido y se usa sólo ése
        want = self.channel_override or self.cfg.audio_channel
        maxch = max(1, int(info.get("max_input_channels", 1)))
        if want > maxch:
            log.warning("El dispositivo tiene %d entrada(s); el canal %d no existe, uso el %d", maxch, want, maxch)
        ch = min(want, maxch)
        self.nch, self.ch_idx = ch, ch - 1
        self.device_name = f"{info['name']} · canal {ch}" if maxch > 1 else info["name"]
        try:
            stream = sd.RawInputStream(samplerate=self.sr, channels=self.nch, dtype="int16",
                                       blocksize=self.block, device=device, latency="low",
                                       callback=self._callback)
            self.resampler = None
            log.info("Micrófono abierto a %d Hz, bloque %d muestras (%.1f ms)",
                     self.sr, self.block, 1000 * self.block / self.sr)
            return stream
        except Exception as exc:  # el dispositivo no soporta 24 kHz: abrir nativo y remuestrear
            native = int(info["default_samplerate"])
            log.warning("No se pudo abrir a %d Hz (%s). Abro a %d Hz y remuestreo.", self.sr, exc, native)
            native_block = max(64, int(native * self.cfg.block_ms / 1000))
            stream = sd.RawInputStream(samplerate=native, channels=self.nch, dtype="int16",
                                       blocksize=native_block, device=device, latency="low",
                                       callback=self._callback)
            self.resampler = LinearResampler(native, self.sr)
            return stream

    async def run(self) -> None:
        if sd is None:
            log.error("sounddevice no disponible (%s). Audio desactivado.", _SD_IMPORT_ERROR)
            self.hub.set_status(mic="unavailable")
            return
        backoff = 1.0
        while True:
            stream = None
            try:
                self._restart = False
                stream = self._open_stream()
                stream.start()
                self.hub.set_status(mic="ok", mic_device=self.device_name)
                backoff = 1.0
                while not self._restart:
                    # Watchdog: si el driver deja de entregar bloques (USB desconectado), reabrir.
                    data = await asyncio.wait_for(self.raw_q.get(), timeout=2.5)
                    self._process(data)
                log.info("Cambio de micrófono solicitado")
                backoff = 0.05
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.error("Fallo de audio: %s — reintento en %.0fs", exc, backoff)
                self.hub.set_status(mic="error", mic_device=str(exc)[:120])
            finally:
                if stream is not None:
                    try:
                        stream.stop()
                        stream.close()
                    except Exception:
                        pass
            while not self.raw_q.empty():
                self.raw_q.get_nowait()
            await asyncio.sleep(backoff)
            backoff = min(max(backoff, 0.5) * 2, 15.0)

    # --- análisis --------------------------------------------------------
    def _check_digital_silence(self, data: bytes) -> None:
        """macOS sin permiso de micrófono (o un mute de hardware) entrega ceros exactos, no un error."""
        if any(data):
            if self.zero_blocks >= 300:
                self.hub.set_status(mic="ok", mic_device=self.device_name)
            self.zero_blocks = 0
            return
        self.zero_blocks += 1
        if self.zero_blocks == 300:  # ~3 s
            hint = ("macOS: Ajustes del Sistema → Privacidad y seguridad → Micrófono → activar Terminal"
                    if sys.platform == "darwin" else "revisa que el micrófono no esté silenciado")
            log.warning("El micrófono entrega silencio digital absoluto. %s", hint)
            self.hub.set_status(mic="silencio", mic_device=hint)

    def _process(self, data: bytes) -> None:
        if self.nch > 1:  # quedarse con el canal elegido
            data = np.frombuffer(data, dtype=np.int16).reshape(-1, self.nch)[:, self.ch_idx].tobytes()
        self._check_digital_silence(data)
        x = np.frombuffer(data, dtype=np.int16).astype(np.float32) * (1.0 / 32768.0)
        if self.resampler is not None:
            x = self.resampler.process(x)
            if x.size == 0:
                return
            pcm = (np.clip(x, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()
        else:
            pcm = data

        n = x.size
        if n >= self.fft_size:
            self.ring[:] = x[-self.fft_size:]
        else:
            self.ring[:-n] = self.ring[n:]
            self.ring[-n:] = x

        rms = float(np.sqrt(np.mean(x * x) + 1e-12))
        db = 20.0 * math.log10(rms + 1e-9)
        level = (db - self.cfg.floor_db) / (self.cfg.ceil_db - self.cfg.floor_db)
        level = min(1.0, max(0.0, level))
        # envolvente: ataque instantáneo, liberación suave
        coef = 0.65 if level > self.env else 0.12
        self.env += (level - self.env) * coef

        spec = np.abs(np.fft.rfft(self.ring * self.window))
        freq = 0.0
        if self.env > 0.04 and self.voice_idx.size:
            voice = spec[self.voice_idx]
            k = int(np.argmax(voice))
            peak = float(voice[k])
            if peak > 3.0 * float(np.mean(voice) + 1e-9):
                gi = int(self.voice_idx[k])
                if 0 < gi < len(spec) - 1:  # interpolación parabólica del pico
                    a, b, c = spec[gi - 1], spec[gi], spec[gi + 1]
                    denom = a - 2 * b + c
                    off = 0.5 * (a - c) / denom if abs(denom) > 1e-12 else 0.0
                    freq = float((gi + off) * self.sr / self.fft_size)
                else:
                    freq = float(self.freqs[gi])
        if freq > 0:
            self.freq_smooth += (freq - self.freq_smooth) * 0.5
        else:
            self.freq_smooth *= 0.97

        total = float(np.sum(spec) + 1e-9)
        centroid = float(np.sum(self.freqs * spec) / total)
        bands = [float(np.mean(spec[a:b])) for a, b in self.band_slices]
        bmax = max(bands) if bands else 0.0
        self.peak_hold = max(bmax, self.peak_hold * 0.995, 1e-3)
        bands = [round(min(1.0, v / self.peak_hold), 3) for v in bands]

        self.hub.emit("audio_reactive", t=_now_ms(), rms=round(self.env, 4), level=round(level, 4),
                      db=round(db, 1), freq=round(self.freq_smooth, 1), centroid=round(centroid, 1),
                      bands=bands)

        if self.openai_queue is not None and not self.hub.session.get("recording"):
            self.pcm_acc.clear()  # fuera de grabación no se envía nada (ni se paga) a OpenAI
        elif self.openai_queue is not None:
            self.pcm_acc.extend(pcm)
            while len(self.pcm_acc) >= self.chunk_bytes:
                chunk = bytes(self.pcm_acc[:self.chunk_bytes])
                del self.pcm_acc[:self.chunk_bytes]
                try:
                    self.openai_queue.put_nowait(chunk)
                except asyncio.QueueFull:  # sin conexión: descartar lo más viejo
                    try:
                        self.openai_queue.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                    self.openai_queue.put_nowait(chunk)


# ════════════════════════════════════════════════════════════════════════════
#  OpenAI Realtime: transcripción pura
# ════════════════════════════════════════════════════════════════════════════

# ── Limpieza de la transcripción ─────────────────────────────────────────────
# Fuera: anotaciones entre [] () {} ** ♪ y las "alucinaciones" típicas de los modelos de transcripción en
# silencio o con música (créditos de subtítulos, saludos de video), y cualquier eco de la pista de contexto.
HALLUCINATIONS = [
    "subtitulos realizados por la comunidad de amara.org", "subtitulos por la comunidad de amara.org",
    "subtitulos realizados por", "subtitulado por", "subtitulos por", "amara.org", "gracias por ver el video",
    "gracias por ver", "gracias por mirar", "no olvides suscribirte", "suscribete", "dale like",
    "lectura de poesia en espanol", "con pausas y versos", "transcripcion", "musica de fondo", "musica",
    "aplausos", "risas", "silencio", "inaudible",
]


def _strip_hallucinations(text: str) -> str:
    t = text
    low = strip_accents(t.lower())
    for h in sorted(HALLUCINATIONS, key=len, reverse=True):
        i = low.find(h)
        while i >= 0:
            # sólo frases sueltas o completas, no partes de palabras ("musical", "silencios" del poema quedan)
            before = low[i - 1] if i > 0 else " "
            after = low[i + len(h)] if i + len(h) < len(low) else " "
            if not before.isalnum() and not after.isalnum() and (len(h) > 12 or low.strip(" .,¡!¿?") == h):
                t = t[:i] + " " * len(h) + t[i + len(h):]
                low = low[:i] + " " * len(h) + low[i + len(h):]
            i = low.find(h, i + 1)
    return t


def clean_transcript(text: str) -> str:
    t = re.sub(r"\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|\*[^*]*\*|[♪♫]+", " ", text or "")
    t = _strip_hallucinations(t)
    t = re.sub(r"\s+", " ", t).strip(" .,;:-–—")
    return t


class DeltaCleaner:
    """Filtra anotaciones entre corchetes/paréntesis también en los fragmentos que llegan en vivo."""

    OPEN, CLOSE = "[({*", "])}*"

    def __init__(self) -> None:
        self.depth = 0
        self.closer = ""

    def feed(self, delta: str) -> str:
        out = []
        for ch in delta:
            if self.depth:
                if ch == self.closer:
                    self.depth = 0
                continue
            if ch in self.OPEN:
                self.depth = 1
                self.closer = self.CLOSE[self.OPEN.index(ch)]
                continue
            if ch in "♪♫":
                continue
            out.append(ch)
        return "".join(out)


class RealtimeTranscriber:
    """Sesión Realtime de sólo transcripción.

    Protocolos:
      ga   → API Realtime actual: wss://…/v1/realtime?intent=transcription, session.type = "transcription"
      beta → API beta histórica: ?model=gpt-4o-realtime-preview + encabezado OpenAI-Beta: realtime=v1
    Con OPENAI_REALTIME_API=auto (por defecto) se prueba ga y, si OpenAI rechaza la configuración, beta.
    """

    def __init__(self, cfg: Config, hub: FrontendHub, audio_q: asyncio.Queue[bytes],
                 on_completed: Callable[[str, str, str], None]) -> None:
        self.cfg = cfg
        self.hub = hub
        self.audio_q = audio_q
        self.on_completed = on_completed
        self.partials: dict[str, str] = {}
        self.cleaners: dict[str, DeltaCleaner] = {}
        mode = cfg.realtime_api if cfg.realtime_api in ("ga", "beta") else "auto"
        self.protocols = ["ga", "beta"] if mode == "auto" else [mode]
        self.pi = 0
        self.configured = False
        self.fatal = False  # clave rechazada: no tiene sentido alternar protocolo
        self.key_event: asyncio.Event | None = None
        self.ws = None

    def set_key(self, key: str) -> None:
        """Clave nueva desde el panel C: reconectar ya, sin reiniciar nada."""
        self.cfg.openai_api_key = key
        self.pi = 0
        if self.key_event is not None:
            self.key_event.set()
        if self.ws is not None:
            asyncio.ensure_future(self.ws.close())

    @property
    def protocol(self) -> str:
        return self.protocols[self.pi % len(self.protocols)]

    def _transcription(self) -> dict[str, Any]:
        tr: dict[str, Any] = {"model": self.cfg.transcription_model}
        if self.cfg.transcription_language:
            tr["language"] = self.cfg.transcription_language
        if self.cfg.transcription_prompt:
            tr["prompt"] = self.cfg.transcription_prompt
        return tr

    def _vad(self) -> dict[str, Any]:
        return {"type": "server_vad", "threshold": self.cfg.vad_threshold,
                "prefix_padding_ms": self.cfg.vad_prefix_ms, "silence_duration_ms": self.cfg.vad_silence_ms}

    def _session_update(self, protocol: str | None = None) -> dict[str, Any]:
        if (protocol or self.protocol) == "ga":
            return {
                "type": "session.update",
                "session": {
                    "type": "transcription",
                    "audio": {"input": {
                        "format": {"type": "audio/pcm", "rate": 24000},
                        "transcription": self._transcription(),
                        "turn_detection": self._vad(),
                    }},
                },
            }
        vad = self._vad()
        vad.update({"create_response": False, "interrupt_response": False})  # transcripción exclusiva
        return {
            "type": "session.update",
            "session": {
                "modalities": ["text"],  # nunca audio de respuesta
                "instructions": "Sólo transcribe. No respondas.",
                "input_audio_format": "pcm16",
                "input_audio_transcription": self._transcription(),
                "turn_detection": vad,
            },
        }

    def _endpoint(self, protocol: str) -> tuple[str, dict[str, str]]:
        headers = {"Authorization": f"Bearer {self.cfg.openai_api_key}"}
        if protocol == "ga":
            return self.cfg.realtime_ga_url, headers
        headers["OpenAI-Beta"] = "realtime=v1"
        return self.cfg.realtime_url, headers

    def _report(self, state: str, detail: str) -> None:
        self.hub.set_status(openai=state, openai_detail=detail[:240])

    async def run(self) -> None:
        self.key_event = asyncio.Event()
        backoff = 1.0
        while True:
            if not self.cfg.openai_api_key:
                log.warning("Sin clave de OpenAI: pégala en el panel C (tecla C) → Clave de OpenAI.")
                self._report("sin clave", "pega la clave en el panel C → Clave de OpenAI")
                await self.key_event.wait()
                self.key_event.clear()
                continue
            proto = self.protocol
            url, headers = self._endpoint(proto)
            self.configured = False
            try:
                log.info("Conectando a OpenAI Realtime (API %s)…", proto)
                self._report("connecting", f"API {proto}")
                async with ws_connect(url, additional_headers=headers, max_size=None,
                                      open_timeout=15, ping_interval=20, ping_timeout=20,
                                      close_timeout=5) as ws:
                    self.ws = ws
                    await ws.send(json.dumps(self._session_update(proto)))
                    # audio acumulado mientras estábamos desconectados: conservar sólo ~0.5 s
                    keep = max(1, 500 // self.cfg.openai_chunk_ms)
                    while self.audio_q.qsize() > keep:
                        self.audio_q.get_nowait()
                    sender = asyncio.create_task(self._sender(ws), name="oa-sender")
                    receiver = asyncio.create_task(self._receiver(ws), name="oa-receiver")
                    done, pending = await asyncio.wait({sender, receiver}, return_when=asyncio.FIRST_COMPLETED)
                    for task in pending:
                        task.cancel()
                    await asyncio.gather(*pending, return_exceptions=True)
                    for task in done:
                        exc = task.exception()
                        if exc is not None:
                            raise exc
                    if self.configured:
                        backoff = 1.0
            except asyncio.CancelledError:
                raise
            except InvalidStatus as exc:
                code = exc.response.status_code
                body = ""
                try:
                    body = json.loads(exc.response.body or b"{}").get("error", {}).get("message", "")
                except Exception:
                    body = (exc.response.body or b"")[:160].decode("utf-8", "replace")
                reason = {401: "clave rechazada (401): revisa OPENAI_API_KEY o genera una nueva",
                          403: "sin acceso (403): la cuenta/proyecto no tiene permiso para Realtime",
                          429: "límite o sin saldo (429): revisa Billing en platform.openai.com"}.get(code, f"HTTP {code}")
                log.error("OpenAI rechazó la conexión (API %s): %s %s", proto, reason, body)
                self._report("error", f"{reason} {body}".strip())
                if code in (401, 403, 429):
                    self.fatal = True
                    backoff = 60.0
            except (OSError, ConnectionClosed, TimeoutError, InvalidURI) as exc:
                log.warning("Conexión OpenAI perdida: %s", exc)
                if not self.configured:
                    self._report("error", f"sin conexión con OpenAI: {exc}")
            except Exception as exc:
                log.exception("Error inesperado en OpenAI Realtime")
                self._report("error", f"inesperado: {exc}")
            # si la configuración nunca fue aceptada, probar el otro protocolo
            if not self.configured and not self.fatal and len(self.protocols) > 1:
                self.pi += 1
                log.info("Pruebo la API %s de OpenAI Realtime", self.protocol)
            self.fatal = False
            if self.hub.status.get("openai") == "connected":
                self._report("reconnecting", f"API {proto}")
            self.ws = None
            delay = backoff + random.uniform(0, 0.5)
            log.info("Reconectando a OpenAI en %.1fs", delay)
            self.key_event.clear()
            try:  # una clave nueva interrumpe la espera
                await asyncio.wait_for(self.key_event.wait(), timeout=delay)
                self.key_event.clear()
                backoff = 1.0
                continue
            except asyncio.TimeoutError:
                pass
            backoff = min(backoff * 2, 30.0)

    async def _sender(self, ws) -> None:  # noqa: ANN001
        while True:
            chunk = await self.audio_q.get()
            if not chunk:  # centinela: fin de grabación → descartar el audio pendiente en OpenAI
                await ws.send(json.dumps({"type": "input_audio_buffer.clear"}))
                continue
            await ws.send(json.dumps({"type": "input_audio_buffer.append",
                                      "audio": base64.b64encode(chunk).decode("ascii")}))

    async def _receiver(self, ws) -> None:  # noqa: ANN001
        async for raw in ws:
            try:
                ev = json.loads(raw)
            except json.JSONDecodeError:
                continue
            et = ev.get("type", "")
            if et == "conversation.item.input_audio_transcription.delta":
                item_id = ev.get("item_id", "")
                delta = self.cleaners.setdefault(item_id, DeltaCleaner()).feed(ev.get("delta", ""))
                if delta:
                    self.partials[item_id] = self.partials.get(item_id, "") + delta
                    self.hub.emit("word_delta", item_id=item_id, delta=delta, t=_now_ms())
            elif et == "conversation.item.input_audio_transcription.completed":
                item_id = ev.get("item_id", "")
                raw = (ev.get("transcript") or self.partials.get(item_id, "")).strip()
                text = clean_transcript(raw)
                self.partials.pop(item_id, None)
                self.cleaners.pop(item_id, None)
                if not text:
                    if raw:
                        log.info("Descartado (anotación / alucinación): %s", raw[:80])
                    self.hub.emit("verse_discard", item_id=item_id)
                if text:
                    log.info("Verso: %s", text)
                    self.hub.emit("verse_completed", item_id=item_id, text=text, t=_now_ms())
                    self.on_completed(text, item_id, "voice")
            elif et == "conversation.item.input_audio_transcription.failed":
                log.warning("Transcripción fallida: %s", ev.get("error"))
                self.partials.pop(ev.get("item_id", ""), None)
            elif et == "input_audio_buffer.speech_started":
                self.hub.emit("speech", state="started", item_id=ev.get("item_id"), t=_now_ms())
            elif et == "input_audio_buffer.speech_stopped":
                self.hub.emit("speech", state="stopped", item_id=ev.get("item_id"), t=_now_ms())
            elif et == "response.created":  # por seguridad: nunca generar respuestas
                await ws.send(json.dumps({"type": "response.cancel"}))
            elif et in ("session.updated", "transcription_session.updated"):
                if not self.configured:
                    self.configured = True
                    log.info("OpenAI Realtime listo (API %s, %s)", self.protocol, self.cfg.transcription_model)
                    self._report("connected", f"API {self.protocol} · {self.cfg.transcription_model}")
            elif et in ("session.created", "transcription_session.created"):
                log.debug("OpenAI: %s", et)
            elif et == "error":
                err = ev.get("error", {}) or {}
                msg = f"{err.get('code') or err.get('type') or 'error'}: {err.get('message', '')}"
                log.error("OpenAI error (API %s): %s", self.protocol, msg)
                if err.get("code") in ("invalid_api_key",):
                    self.fatal = True
                if not self.configured:
                    self._report("error", msg)
                    return  # configuración rechazada → reconectar (y en auto, probar el otro protocolo)
                if err.get("code") in ("session_expired", "session_terminated"):
                    return  # fuerza reconexión limpia


# ════════════════════════════════════════════════════════════════════════════
#  Director de Arte Semántico
# ════════════════════════════════════════════════════════════════════════════

FIGURES = ["luna", "corazon", "gota", "ojo", "sol", "estrella", "espiral", "ola", "arbol", "pajaro",
           "pez", "hoja", "flor", "montana", "llama", "mariposa", "reloj", "casa", "mano", "nube"]
PHYSICS = ["lluvia_text_rain", "enjambre_lozano", "vortice_sandison", "dispersion_ceniza"]
MODES = ["concreto", "simbolico", "hibrido"]
FILLS = ["contorno", "volumen", "ambos"]
TYPES = ["serif", "mono", "mixta"]
ACCENTS = {"ambar": "#E3A14B", "carmin": "#B3122E", "ninguno": "#C9C4BA"}
DEFAULT_PALETTE = {"base": "#F4F1EA", "secundario": "#8C8984", "acento": "#C9C4BA", "uso_acento": 0.0}

# Parte técnica fija (contrato JSON): no editable desde el panel para que el frontend nunca reciba basura.
SCHEMA_PROMPT = f"""Eres el director de arte de una instalación de poesía proyectada en un museo de arte contemporáneo
(herencia de Camille Utterback "Text Rain", Rafael Lozano-Hemmer "Subtitled Public", Charles Sandison, Jeffrey Shaw).
Recibes un verso recién leído en voz alta. Decides cómo sus propias letras deben moverse y qué figura formar.
Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional, con estas claves:

{{
  "modo_visual": "concreto" | "simbolico" | "hibrido",
  "figura": "nombre corto de lo que se dibuja (una o dos palabras)",
  "svg_paths": [ "d de un <path> SVG cerrado en un viewBox 0 0 512 512", ... ],
  "relleno": "contorno" | "volumen" | "ambos",
  "fisica": {{
     "modo": "lluvia_text_rain" | "enjambre_lozano" | "vortice_sandison" | "dispersion_ceniza",
     "intensidad": 0..1, "velocidad": 0..1, "turbulencia": 0..1, "densidad": 0..1
  }},
  "paleta": {{ "base": "#F4F1EA", "secundario": "<gris ceniza hex>", "acento": "ambar" | "carmin" | "ninguno", "uso_acento": 0..0.25 }},
  "tipografia": "serif" | "mono" | "mixta",
  "palabras_clave": [hasta 6 palabras del verso, en minúsculas],
  "emocion": "una palabra",
  "duracion_s": 8..30
}}

Reglas técnicas de svg_paths: sólo comandos M L C Q Z en MAYÚSCULA, coordenadas ENTERAS absolutas dentro de 0..512,
formas cerradas con Z, sin transformaciones."""

# Cómo se generan las imágenes (se elige en el panel C).
IMAGES_LIVE = """Imágenes EN VIVO: cada estrofa DEBE producir una imagen. modo_visual es SIEMPRE "concreto" o "hibrido"
(nunca "simbolico"): si la estrofa es abstracta, dibuja una metáfora visual de ella. svg_paths es OBLIGATORIO:
1 a 4 paths que formen una silueta reconocible y sintética de lo que evoca el verso (no un ícono genérico: interpreta),
con 60 comandos como máximo en total, ocupando buena parte del lienzo 512×512. Sé conciso: nada de texto extra."""
IMAGES_LIBRARY = f"""Imágenes CURADAS: cada estrofa produce una imagen (modo_visual "concreto" o "hibrido", nunca
"simbolico"). Deja svg_paths como [] y elige "figura" EXACTAMENTE de esta lista: {FIGURES}."""

# Imágenes en GRILLA DE TEXTO: el modelo devuelve la silueta como texto (# = figura, . = fondo); el programa la
# compone con las palabras dichas, en positivo (la figura hecha de palabras) o en negativo (hueco en el muro).
GRID_W, GRID_H = 48, 26
IMAGES_GRID = f"""Imágenes en GRILLA DE TEXTO: cada estrofa DEBE producir una imagen. modo_visual es "concreto" o "hibrido".
Agrega la clave "grilla": una lista de EXACTAMENTE {GRID_H} cadenas de EXACTAMENTE {GRID_W}
caracteres cada una, usando SOLO "#" (figura) y "." (fondo). Además, en svg_paths, 1 a 3 paths cerrados que dibujen la
MISMA silueta rellena (respaldo si la grilla falla; 40 comandos como máximo en total). Cada carácter es una celda el doble de alta que ancha:
dibuja la figura más ancha de lo que parece en texto para que no quede estirada. Una sola silueta, rellena (no sólo el
contorno), sin texto ni letras dentro de la grilla. En "figura" escribe el concepto dibujado."""
GRID_POLARITY = """Agrega la clave "polaridad": "positivo" (la figura queda hecha de palabras sobre negro) o "negativo"
(la figura es un hueco negro calado en un muro de palabras). Elige según la estrofa y alterna."""

# Parte estética de la grilla: editable desde el panel C.
DEFAULT_GRID_AESTHETIC = """- Elige UN concepto concreto y dibujable que nazca de lo dicho (un objeto, un animal, una parte del cuerpo, un
  elemento de la naturaleza); si la estrofa es abstracta, una metáfora visual simple de ella.
- Silueta sintética y frontal o de perfil, de lectura inmediata a distancia, como un sello o una sombra chinesca.
- Formas grandes y macizas, ocupando entre el 40 % y el 70 % de la grilla, centrada, con aire alrededor.
- Sin detalles de un solo carácter, sin líneas finas sueltas ni ruido; bordes limpios.
- Varía de una estrofa a otra: no repitas la figura anterior."""

# Parte estética: editable en vivo desde el panel C del frontend (se guarda en settings.local.json).
DEFAULT_AESTHETIC = """- "concreto": la figura se dibuja nítida con las letras (caligrama, ASCII, glitch o marca).
- "hibrido": figura más tenue mientras la física de las letras sigue alrededor; ideal para estrofas abstractas
  (tiempo, olvido, deseo…): dibuja una metáfora visual, no un ícono literal.
- Alterna entre concreto e hibrido.
- lluvia_text_rain: caída, llanto, peso. enjambre_lozano: multitud, voces, nosotros. vortice_sandison: tiempo, vértigo,
  cosmos. dispersion_ceniza: olvido, muerte, memoria que se borra.
- Estética de museo: base hueso, grises ceniza; el acento ámbar o carmín es muy puntual (uso_acento bajo)."""


STYLE_HELP = {
    "caligrama": "las letras del verso recorren el contorno y rellenan el volumen; lírico, orgánico",
    "ascii": "grilla monoespaciada estricta donde la densidad de los signos modela la luz; seco, documental",
    "glitch": "la imagen se rompe en ráfagas: bandas desplazadas, letras sustituidas; error, interferencia, crisis",
    "marca": "identidad gráfica de FLAT: ordenada, plana, tipográfica; para versos afirmativos o institucionales",
}


def build_system_prompt(aesthetic: str | None, curaduria: str | None = None, imagenes: str = "llm",
                        estilos: list[str] | None = None, grid_aesthetic: str | None = None,
                        polaridad: str = "alternar") -> str:
    text = (aesthetic or "").strip() or DEFAULT_AESTHETIC
    if imagenes == "grilla":
        parts = [SCHEMA_PROMPT, IMAGES_GRID]
        if polaridad == "llm":
            parts.append(GRID_POLARITY)
        parts.append("Estética de la grilla:\n" + ((grid_aesthetic or "").strip() or DEFAULT_GRID_AESTHETIC))
    else:
        parts = [SCHEMA_PROMPT, IMAGES_LIBRARY if imagenes == "biblioteca" else IMAGES_LIVE]
    est = [e for e in (estilos or []) if e in STYLE_HELP]
    if len(est) > 1:
        parts.append('Agrega la clave "estilo" con uno de ' + str(est) + ". Elige el que la estrofa pida y alterna:\n"
                     + "\n".join(f"- {e}: {STYLE_HELP[e]}" for e in est))
    cur = (curaduria or "").strip()
    if cur:
        parts.append("TEXTO CURATORIAL de la muestra, escrito por el curador. Es la guía principal: cada figura, "
                     "movimiento y color debe poder leerse desde este texto:\n«" + cur + "»")
    parts.append("Reglas visuales:\n" + text)
    return "\n\n".join(parts)


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


LEX_FIGURES: dict[str, list[str]] = {
    "luna": ["luna", "lunar", "noche", "nocturno", "eclipse"],
    "corazon": ["corazon", "amor", "latido", "pecho", "amar", "amada", "amado", "beso"],
    "gota": ["lagrima", "lagrimas", "gota", "llorar", "llanto", "rocio"],
    "ojo": ["ojo", "ojos", "mirada", "mirar", "pupila", "ver", "veo"],
    "sol": ["sol", "luz", "dia", "amanecer", "alba", "mediodia", "verano"],
    "estrella": ["estrella", "estrellas", "astro", "constelacion", "cielo"],
    "espiral": ["espiral", "remolino", "vertigo", "laberinto", "caracol"],
    "ola": ["mar", "ola", "olas", "oceano", "agua", "rio", "marea", "orilla"],
    "arbol": ["arbol", "arboles", "bosque", "raiz", "raices", "rama", "ramas", "tronco"],
    "pajaro": ["pajaro", "pajaros", "ave", "aves", "vuelo", "volar", "alas", "golondrina"],
    "pez": ["pez", "peces", "escama", "anzuelo"],
    "hoja": ["hoja", "hojas", "otono"],
    "flor": ["flor", "flores", "rosa", "petalo", "petalos", "jardin", "primavera"],
    "montana": ["montana", "montanas", "piedra", "cumbre", "cerro", "volcan"],
    "llama": ["fuego", "llama", "llamas", "arder", "arde", "quemar", "hoguera", "incendio", "vela"],
    "mariposa": ["mariposa", "mariposas", "crisalida", "polilla"],
    "reloj": ["reloj", "hora", "horas", "minuto", "espera", "esperar"],
    "casa": ["casa", "hogar", "puerta", "ventana", "techo", "habitacion"],
    "mano": ["mano", "manos", "dedos", "tocar", "caricia", "palma"],
    "nube": ["nube", "nubes", "niebla", "bruma", "tormenta"],
}
LEX_PHYSICS: dict[str, list[str]] = {
    "lluvia_text_rain": ["lluvia", "llueve", "caer", "cae", "caen", "caida", "llanto", "lagrimas", "peso", "descender"],
    "enjambre_lozano": ["nosotros", "multitud", "voces", "gente", "ciudad", "pajaros", "abejas", "todos", "juntos"],
    "vortice_sandison": ["tiempo", "viento", "remolino", "girar", "gira", "vertigo", "eterno", "universo", "cosmos", "infinito"],
    "dispersion_ceniza": ["ceniza", "cenizas", "polvo", "olvido", "olvidar", "muerte", "morir", "humo", "ruina", "adios", "nada"],
}
LEX_ACCENT = {
    "carmin": ["sangre", "herida", "corazon", "rojo", "beso", "fuego", "amor", "rosa"],
    "ambar": ["sol", "luz", "oro", "dorado", "fuego", "vela", "otono", "miel", "amanecer"],
}
STOPWORDS = set(strip_accents(w) for w in (
    "el la los las un una unos unas de del al a en y o u que se su sus mi mis tu tus me te le lo nos es son fue "
    "como con por para sin sobre entre hasta desde cuando donde quien ya no si mas pero muy tan este esta eso "
    "ese esa hay ha he yo tú él ella ellos todo toda").split())

HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
SVG_RE = re.compile(r"^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+\-]+$")


def _clamp01(value: Any, default: float) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(v):
        return default
    return min(1.0, max(0.0, v))


def _hex_luminance(hex_color: str) -> float:
    r, g, b = (int(hex_color[i:i + 2], 16) / 255.0 for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def valid_svg_path(d: Any) -> bool:
    if not isinstance(d, str):
        return False
    d = d.strip()
    if not (6 <= len(d) <= 12000) or not SVG_RE.match(d) or d[0] not in "Mm":
        return False
    numbers = re.findall(r"-?\d*\.?\d+(?:[eE][-+]?\d+)?", d)
    return len(numbers) >= 4


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zñü]+", strip_accents(text.lower()))


def keywords_of(text: str, limit: int = 6) -> list[str]:
    words = re.findall(r"[a-záéíóúüñ]+", text.lower())
    out: list[str] = []
    for w in sorted(set(words), key=lambda s: (-len(s), words.index(s))):
        if strip_accents(w) not in STOPWORDS and len(w) > 2:
            out.append(w)
        if len(out) >= limit:
            break
    return out


def heuristic_direction(text: str, last_modes: list[str]) -> dict[str, Any]:
    """Director de respaldo sin LLM: léxico poético → morfología visual."""
    toks = tokenize(text)
    tokset = set(toks)
    figure = None
    best = 0
    for name, words in LEX_FIGURES.items():
        score = sum(1 for w in words if w in tokset)
        if score > best:
            figure, best = name, score
    physics = None
    best_p = 0
    for name, words in LEX_PHYSICS.items():
        score = sum(1 for w in words if w in tokset)
        if score > best_p:
            physics, best_p = name, score
    if physics is None:
        physics = random.choice(PHYSICS)

    if figure and best_p > 0:
        mode = "hibrido"
    elif figure:
        mode = "concreto"
    else:
        mode = "simbolico"
    if len(last_modes) >= 2 and last_modes[-1] == last_modes[-2] == mode:  # forzar alternancia
        if mode == "simbolico":
            mode, figure = "hibrido", figure or random.choice(FIGURES)
        else:
            mode = "simbolico"

    accent = "ninguno"
    for name, words in LEX_ACCENT.items():
        if any(w in tokset for w in words):
            accent = name
            break
    intens = min(1.0, 0.35 + 0.08 * len(toks))
    return {
        "modo_visual": mode,
        "figura": figure or random.choice(FIGURES),
        "svg_paths": [],
        "relleno": "ambos",
        "fisica": {"modo": physics, "intensidad": round(intens, 2), "velocidad": 0.45,
                   "turbulencia": 0.4 if physics != "dispersion_ceniza" else 0.7, "densidad": 0.6},
        "paleta": {"base": "#F4F1EA", "secundario": "#8C8984", "acento": ACCENTS[accent],
                   "uso_acento": 0.0 if accent == "ninguno" else 0.12},
        "tipografia": "mixta",
        "palabras_clave": keywords_of(text),
        "emocion": "contemplacion",
        "duracion_s": 14,
    }


GRID_BG = set(" .·-_,'`0~:")


def _grid_rows(raw: Any) -> list[str] | None:
    """Acepta lo que devuelva el modelo: lista de cadenas, cadena con saltos, lista de listas o {"filas": [...]}."""
    if isinstance(raw, dict):
        raw = next((raw[k] for k in ("filas", "rows", "grilla", "grid", "lineas") if k in raw), None)
    if isinstance(raw, str):
        raw = raw.strip("\n").splitlines()
    if not isinstance(raw, list) or not raw:
        return None
    rows = []
    for r in raw:
        if isinstance(r, list):
            r = "".join(str(x)[:1] if str(x) else " " for x in r)
        elif not isinstance(r, (str, int)):
            continue
        r = str(r).rstrip("\r")
        if r.strip().startswith("```"):
            continue
        rows.append(r)
    while rows and not rows[0].strip(" ."):  # filas vacías de los bordes: se recentra después
        rows.pop(0)
    while rows and not rows[-1].strip(" ."):
        rows.pop()
    return rows or None


def check_grid(raw: Any) -> tuple[list[str] | None, str]:
    """Normaliza la grilla del modelo a GRID_H × GRID_W de '#'/'.'. Devuelve (grilla, motivo si no sirve)."""
    if raw is None or raw == "" or raw == []:
        return None, "el modelo no devolvió «grilla»"
    rows = _grid_rows(raw)
    if not rows:
        if isinstance(raw, (list, str)):
            return None, "la grilla vino vacía"
        return None, f"formato de grilla no reconocido ({type(raw).__name__})"
    bits = [[0 if ch in GRID_BG else 1 for ch in r] for r in rows]
    h, w = len(bits), max(len(r) for r in bits)
    bits = [r + [0] * (w - len(r)) for r in bits]
    total = sum(map(sum, bits))
    if total and total / (w * h) > 0.85:  # el modelo invirtió figura y fondo
        bits = [[1 - v for v in r] for r in bits]
    # recortar a la figura y encajarla centrada (~80 % del alto o 90 % del ancho), sin deformar
    ys = [y for y, r in enumerate(bits) if any(r)]
    xs = [x for x in range(w) if any(bits[y][x] for y in range(h))]
    if not ys:
        return None, "la grilla vino vacía"
    y0, y1, x0, x1 = ys[0], ys[-1] + 1, xs[0], xs[-1] + 1
    bh, bw = y1 - y0, x1 - x0
    sc = min(GRID_H * 0.8 / bh, GRID_W * 0.9 / bw)
    sc = max(0.25, min(sc, 4.0))
    oh, ow = max(1, round(bh * sc)), max(1, round(bw * sc))
    oy, ox = (GRID_H - oh) // 2, (GRID_W - ow) // 2
    out = []
    for gy in range(GRID_H):
        line = []
        for gx in range(GRID_W):
            ly, lx = gy - oy, gx - ox
            on = 0 <= ly < oh and 0 <= lx < ow and bits[y0 + min(bh - 1, int(ly / sc))][x0 + min(bw - 1, int(lx / sc))]
            line.append("#" if on else ".")
        out.append("".join(line))
    filled = sum(r.count("#") for r in out) / (GRID_W * GRID_H)
    if filled < 0.03:
        return None, f"figura demasiado chica ({filled:.0%} de la grilla)"
    if filled > 0.9:
        return None, f"grilla casi llena ({filled:.0%}): sin figura reconocible"
    return out, ""


def clean_grid(raw: Any) -> list[str] | None:
    return check_grid(raw)[0]


def sanitize_direction(raw: Any, text: str, last_modes: list[str]) -> dict[str, Any]:
    """Convierte la salida (posiblemente defectuosa) del LLM en el contrato estricto del frontend."""
    base = heuristic_direction(text, last_modes)
    if not isinstance(raw, dict):
        return base
    out = dict(base)

    mode = str(raw.get("modo_visual", "")).lower().strip()
    mode = strip_accents(mode)
    if mode in MODES:
        out["modo_visual"] = mode
    estilo = strip_accents(str(raw.get("estilo", "")).lower().strip())
    if estilo in STYLE_HELP:
        out["estilo"] = estilo
    fig_raw = str(raw.get("figura", "")).strip()
    fig = strip_accents(fig_raw.lower())
    if fig in FIGURES:
        out["figura"] = fig
    elif fig_raw:
        # imágenes en vivo: nombre libre; la biblioteca de respaldo usa la heurística si el dibujo falla
        out["figura_libre"] = re.sub(r"[^\w\s-]", "", fig_raw, flags=re.UNICODE)[:32]
    if "grilla" in raw or "grid" in raw:
        grid, why = check_grid(raw.get("grilla", raw.get("grid")))
        if grid:
            out["grilla"] = grid
        else:
            out["grilla_problema"] = why
    pol = strip_accents(str(raw.get("polaridad", "")).lower().strip())
    if pol in ("positivo", "negativo"):
        out["polaridad"] = pol
    paths = raw.get("svg_paths", [])
    if isinstance(paths, str):
        paths = [paths]
    if isinstance(paths, list):
        out["svg_paths"] = [p.strip() for p in paths if valid_svg_path(p)][:4]
    fill = strip_accents(str(raw.get("relleno", "")).lower())
    if fill in FILLS:
        out["relleno"] = fill

    fis = raw.get("fisica", {})
    if isinstance(fis, str):
        fis = {"modo": fis}
    if isinstance(fis, dict):
        pm = strip_accents(str(fis.get("modo", "")).lower().strip())
        match = next((p for p in PHYSICS if pm == p or (pm and pm.split("_")[0] == p.split("_")[0])), None)
        out["fisica"] = {
            "modo": match or base["fisica"]["modo"],
            "intensidad": _clamp01(fis.get("intensidad"), base["fisica"]["intensidad"]),
            "velocidad": _clamp01(fis.get("velocidad"), base["fisica"]["velocidad"]),
            "turbulencia": _clamp01(fis.get("turbulencia"), base["fisica"]["turbulencia"]),
            "densidad": _clamp01(fis.get("densidad"), base["fisica"]["densidad"]),
        }

    pal = raw.get("paleta", {})
    if isinstance(pal, dict):
        palette = dict(DEFAULT_PALETTE)
        b = str(pal.get("base", ""))
        if HEX_RE.match(b) and _hex_luminance(b) > 0.7:
            palette["base"] = b.upper()
        s = str(pal.get("secundario", ""))
        if HEX_RE.match(s) and 0.12 < _hex_luminance(s) < 0.75:
            palette["secundario"] = s.upper()
        a = strip_accents(str(pal.get("acento", "")).lower().strip())
        if a in ACCENTS:
            palette["acento"] = ACCENTS[a]
        elif HEX_RE.match(a):
            palette["acento"] = a.upper()
        palette["uso_acento"] = min(0.25, _clamp01(pal.get("uso_acento"), 0.08))
        if a == "ninguno":
            palette["uso_acento"] = 0.0
        out["paleta"] = palette

    typ = strip_accents(str(raw.get("tipografia", "")).lower())
    if typ in TYPES:
        out["tipografia"] = typ
    kws = raw.get("palabras_clave", [])
    if isinstance(kws, list):
        clean = [str(k).lower().strip()[:24] for k in kws if isinstance(k, (str, int)) and str(k).strip()]
        if clean:
            out["palabras_clave"] = clean[:6]
    emo = raw.get("emocion")
    if isinstance(emo, str) and emo.strip():
        out["emocion"] = emo.strip().lower()[:32]
    try:
        out["duracion_s"] = float(min(40.0, max(6.0, float(raw.get("duracion_s", base["duracion_s"])))))
    except (TypeError, ValueError):
        pass
    return out


def extract_json(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise


# ── Cadencia: cada cuánto se pide una imagen nueva ─────────────────────────────
# Criterio por ESTROFA: se acumulan versos hasta tener material (palabras) y una pausa de cierre;
# además un tiempo mínimo entre imágenes (para que cada figura se vea) y un tope (lectura de corrido).
CADENCE_PRESETS = {
    "verso": {"min_s": 0, "palabras": 1, "pausa_s": 0, "max_s": 0},
    "estrofa": {"min_s": 14, "palabras": 10, "pausa_s": 1.8, "max_s": 45},
    "contemplativa": {"min_s": 25, "palabras": 20, "pausa_s": 2.5, "max_s": 70},
}


def cadence_params(raw: Any) -> dict[str, float]:
    base = dict(CADENCE_PRESETS["estrofa"])
    if isinstance(raw, dict):
        if raw.get("preset") in CADENCE_PRESETS:
            base.update(CADENCE_PRESETS[raw["preset"]])
        for k, lo, hi in (("min_s", 0, 300), ("palabras", 1, 200), ("pausa_s", 0, 15), ("max_s", 0, 600)):
            try:
                if raw.get(k) is not None and raw.get("preset") in (None, "personalizada"):
                    base[k] = min(hi, max(lo, float(raw[k])))
            except (TypeError, ValueError):
                pass
    return base


class ArtDirector:
    def __init__(self, cfg: Config, hub: FrontendHub, settings: SettingsStore | None = None) -> None:
        self.cfg = cfg
        self.hub = hub
        self.settings = settings
        self.queue: asyncio.Queue[tuple[str, str, str]] = asyncio.Queue(maxsize=16)
        self.history: deque[str] = deque(maxlen=4)
        self.modes: deque[str] = deque(maxlen=4)
        self.http: httpx.AsyncClient | None = None
        # estrofa en curso
        self.stanza: list[str] = []
        self.stanza_item = ""
        self.stanza_source = "voice"
        self.last_verse_t = 0.0
        self.last_image_t = 0.0

    # ── cadencia ─────────────────────────────────────────────────────────────
    def reset_stanza(self) -> None:
        """Al empezar a grabar / cambiar de artista: estrofa vacía y reloj listo para la primera imagen."""
        self.stanza.clear()
        p = cadence_params(self.settings.get("cadencia") if self.settings else None)
        self.last_image_t = time.monotonic() - p["min_s"]
        self._emit_cadence()

    def add_verse(self, text: str, item_id: str = "", source: str = "voice") -> None:
        text = (text or "").strip()
        if not text:
            return
        self.stanza.append(text)
        self.stanza_item, self.stanza_source = item_id, source
        self.last_verse_t = time.monotonic()
        self._emit_cadence()

    def _words(self) -> int:
        return sum(len(v.split()) for v in self.stanza)

    def _ready(self) -> str:
        """Motivo para pedir imagen ahora, o '' si hay que seguir acumulando."""
        if not self.stanza:
            return ""
        p = cadence_params(self.settings.get("cadencia") if self.settings else None)
        now = time.monotonic()
        since_img, since_verse, words = now - self.last_image_t, now - self.last_verse_t, self._words()
        if since_img < p["min_s"]:
            return ""
        if words >= p["palabras"] and since_verse >= p["pausa_s"]:
            return "estrofa"
        if words >= 3 * p["palabras"]:
            return "lectura de corrido"
        if p["max_s"] and since_img >= p["max_s"]:
            return "tope de tiempo"
        return ""

    def _emit_cadence(self, fired: str = "") -> None:
        p = cadence_params(self.settings.get("cadencia") if self.settings else None)
        self.hub.emit("cadence", palabras=self._words(), objetivo=int(p["palabras"]),
                      desde_imagen=round(time.monotonic() - self.last_image_t, 1) if self.last_image_t else None,
                      min_s=p["min_s"], disparo=fired)

    async def cadence_loop(self) -> None:
        self.reset_stanza()
        while True:
            await asyncio.sleep(0.3)
            why = self._ready()
            if why:
                text = " / ".join(self.stanza)
                self.stanza.clear()
                self.last_image_t = time.monotonic()
                log.info("Imagen pedida (%s): %s", why, text[:90])
                self.submit(text, self.stanza_item, self.stanza_source)
                self._emit_cadence(why)

    def submit(self, text: str, item_id: str = "", source: str = "voice") -> None:
        text = (text or "").strip()
        if not text:
            return
        try:
            self.queue.put_nowait((text, item_id, source))
        except asyncio.QueueFull:
            self.queue.get_nowait()
            self.queue.put_nowait((text, item_id, source))

    async def run(self) -> None:
        self.http = httpx.AsyncClient(timeout=httpx.Timeout(self.cfg.llm_timeout, connect=4.0))
        cadence = asyncio.create_task(self.cadence_loop(), name="cadence")
        try:
            while True:
                job = await self.queue.get()
                # Si hay atraso, dirigir sólo el verso más reciente; los saltados alimentan el contexto.
                while not self.queue.empty():
                    self.history.append(job[0])
                    job = self.queue.get_nowait()
                text, item_id, source = job
                t0 = time.perf_counter()
                direction, provider = await self.direct(text)
                self.history.append(text)
                self.modes.append(direction["modo_visual"])
                direction.update({"verso": text, "item_id": item_id, "source": source, "provider": provider,
                                  "latencia_ms": int((time.perf_counter() - t0) * 1000), "t": _now_ms()})
                direction["imagenes"] = self._images_mode()
                log.info("Dirección [%s %dms] %s / %s / %s", provider, direction["latencia_ms"],
                         direction["modo_visual"], direction["figura"], direction["fisica"]["modo"])
                self.hub.emit("art_direction", data=direction)
        finally:
            cadence.cancel()
            await self.http.aclose()

    def _messages(self, text: str) -> list[dict[str, str]]:
        context = " / ".join(self.history) if self.history else "(inicio del poema)"
        recent = ", ".join(self.modes) if self.modes else "ninguno"
        user = (f"Versos anteriores: {context}\nModos visuales recientes: {recent}\n"
                f"Estrofa actual (versos separados por /): «{text}»\nUna sola imagen para toda la estrofa. "
                f"Devuelve sólo el JSON.")
        st = self.settings
        est = (st.get("estilos") or {}) if st else {}
        allowed = est.get("activos") if est.get("modo", "llm") == "llm" else None
        prompt = build_system_prompt(st.get("prompt_estetica") if st else None, st.get("curaduria") if st else None,
                                     self._images_mode(), allowed, st.get("prompt_grilla") if st else None,
                                     (st.get("polaridad") or "alternar") if st else "alternar")
        return [{"role": "system", "content": prompt}, {"role": "user", "content": user}]

    def _images_mode(self) -> str:
        mode = (self.settings or {}).get("imagenes") or "grilla"
        return mode if mode in ("biblioteca", "llm", "grilla") else "grilla"

    def _max_tokens(self) -> int:
        return 700 if self._images_mode() == "biblioteca" else 2600  # dibujar SVG necesita más salida

    async def _ollama(self, text: str, messages: list[dict[str, str]] | None = None,
                      max_tokens: int | None = None) -> Any:
        assert self.http is not None
        r = await self.http.post(self.cfg.ollama_url, json={
            "model": self.cfg.ollama_model, "messages": messages or self._messages(text), "format": "json",
            "stream": False, "keep_alive": self.cfg.ollama_keep_alive,
            "options": {"temperature": self.cfg.llm_temperature, "num_predict": max_tokens or self._max_tokens()},
        })
        r.raise_for_status()
        return extract_json(r.json()["message"]["content"])

    async def _deepseek(self, text: str, messages: list[dict[str, str]] | None = None,
                        max_tokens: int | None = None) -> Any:
        assert self.http is not None
        if not self.cfg.deepseek_key:
            raise RuntimeError("DEEPSEEK_API_KEY vacío")
        r = await self.http.post(f"{self.cfg.deepseek_base_url}/chat/completions", headers={
            "Authorization": f"Bearer {self.cfg.deepseek_key}"}, json={
            "model": self.cfg.deepseek_model, "messages": messages or self._messages(text),
            "response_format": {"type": "json_object"}, "temperature": self.cfg.llm_temperature,
            "max_tokens": max_tokens or self._max_tokens(), "stream": False,
        })
        r.raise_for_status()
        return extract_json(r.json()["choices"][0]["message"]["content"])

    async def _openai(self, text: str, messages: list[dict[str, str]] | None = None,
                      max_tokens: int | None = None) -> Any:
        """Director con la misma clave de OpenAI (rápido: recomendado para imágenes en vivo)."""
        assert self.http is not None
        if not self.cfg.openai_api_key:
            raise RuntimeError("sin clave de OpenAI")
        models = list(dict.fromkeys([self.cfg.openai_director_model, "gpt-4.1-mini", "gpt-4o-mini"]))
        last: Exception | None = None
        for model in models:
            r = await self.http.post("https://api.openai.com/v1/chat/completions", headers={
                "Authorization": f"Bearer {self.cfg.openai_api_key}"}, json={
                "model": model, "messages": messages or self._messages(text), "response_format": {"type": "json_object"},
                "temperature": self.cfg.llm_temperature, "max_tokens": max_tokens or self._max_tokens(),
            })
            if r.status_code in (400, 404) and "model" in r.text:
                last = RuntimeError(f"modelo {model} no disponible")
                continue  # probar el siguiente modelo
            r.raise_for_status()
            return extract_json(r.json()["choices"][0]["message"]["content"])
        raise last or RuntimeError("OpenAI no respondió")

    async def direct(self, text: str) -> tuple[dict[str, Any], str]:
        providers = {"ollama": self._ollama, "openai": self._openai, "deepseek": self._deepseek}
        default = "openai" if self.cfg.openai_api_key else self.cfg.llm_provider
        first = (self.settings.get("director") if self.settings else None) or default
        first = first if first in providers else "ollama"
        order = [first] + [p for p in ("openai", "ollama", "deepseek") if p != first]
        chain: list[tuple[str, Callable[[str], Awaitable[Any]]]] = []
        for name in order:  # respaldo: los que estén disponibles
            if name == "openai" and not self.cfg.openai_api_key:
                continue
            if name == "deepseek" and not self.cfg.deepseek_key:
                continue
            chain.append((name, providers[name]))
        for name, fn in chain:
            try:
                raw = await fn(text)
                if self.hub.status.get("llm") != name:
                    self.hub.set_status(llm=name)
                direction = sanitize_direction(raw, text, list(self.modes))
                if self._images_mode() == "grilla" and not direction.get("grilla"):
                    direction.setdefault("grilla_problema", "el modelo no devolvió «grilla»")
                    await self._retry_grid(fn, direction, text)
                return self._always_image(direction), name
            except Exception as exc:
                log.warning("LLM %s falló: %s", name, exc)
        if self.hub.status.get("llm") != "heuristic":
            self.hub.set_status(llm="heuristic")
        return self._always_image(heuristic_direction(text, list(self.modes))), "heuristic"

    async def _retry_grid(self, fn: Callable[..., Awaitable[Any]], direction: dict[str, Any], text: str) -> None:
        """Segundo intento, sólo la grilla: pedido corto y enfocado (a menor resolución, que el modelo dibuja mejor)."""
        concept = direction.get("figura_libre") or direction.get("figura") or "luna"
        st = self.settings or {}
        aesthetic = (st.get("prompt_grilla") or "").strip() or DEFAULT_GRID_AESTHETIC
        w, h = GRID_W // 2, GRID_H // 2
        system = (f"Dibujas siluetas como arte ASCII. Responde SOLO con JSON: {{\"grilla\": [{h} cadenas de {w} "
                  f"caracteres]}} usando \"#\" para la figura y \".\" para el fondo. Cada carácter es una celda el doble "
                  f"de alta que ancha. Una sola silueta maciza, centrada, reconocible.\nEstética:\n{aesthetic}")
        user = f"Dibuja: «{concept}» (nace de estos versos: «{text[:300]}»)."
        try:
            raw = await fn(text, [{"role": "system", "content": system}, {"role": "user", "content": user}], 900)
            grid, why = check_grid(raw if isinstance(raw, dict) else {"grilla": raw})
        except Exception as exc:  # noqa: BLE001
            grid, why = None, f"reintento falló: {exc}"
        if grid:
            direction["grilla"] = grid
            direction["grilla_origen"] = "reintento"
            direction.pop("grilla_problema", None)
        else:
            direction["grilla_problema"] = f"{direction.get('grilla_problema')}; reintento: {why}"

    @staticmethod
    def _always_image(direction: dict[str, Any]) -> dict[str, Any]:
        """Cada estrofa produce una imagen: «simbolico» pasa a «hibrido» (la biblioteca cubre si no hay dibujo)."""
        if direction.get("modo_visual") not in ("concreto", "hibrido"):
            direction["modo_visual"] = "hibrido"
        return direction


# ════════════════════════════════════════════════════════════════════════════
#  Main
# ════════════════════════════════════════════════════════════════════════════

async def main_async(args: argparse.Namespace) -> None:
    cfg = Config.from_env()
    loop = asyncio.get_running_loop()
    ensure_user_dir()
    await asyncio.to_thread(ensure_flat_logo)
    settings_path = args.settings or os.path.join(USER_DIR, "ajustes.json")
    legacy = os.path.join(BASE_DIR, "settings.local.json")
    if not args.settings and not os.path.exists(settings_path) and os.path.exists(legacy):
        try:  # migrar ajustes que quedaron dentro del proyecto
            import shutil
            shutil.copyfile(legacy, settings_path)
            log.info("Ajustes migrados a %s", settings_path)
        except OSError:
            settings_path = legacy
    settings = SettingsStore(settings_path)
    log.info("Carpeta de la muestra: %s", USER_DIR)
    hub = FrontendHub(cfg)
    director = ArtDirector(cfg, hub, settings)
    use_openai = not args.no_openai
    oa_queue: asyncio.Queue[bytes] | None = asyncio.Queue(maxsize=300) if use_openai else None
    audio = AudioEngine(cfg, hub, oa_queue, loop) if not args.no_audio else None
    if audio is not None and settings.get("device") not in (None, ""):
        audio.device_override = str(settings.get("device"))
    if audio is not None and settings.get("canal") not in (None, ""):
        audio.request_channel(settings.get("canal"))

    def key_status() -> dict[str, Any]:
        return {"has_key": bool(cfg.openai_api_key), "masked": mask_key(cfg.openai_api_key),
                "source": cfg.openai_key_source}

    hub.hello_extra = lambda: {"settings": settings.data, "default_prompt": DEFAULT_AESTHETIC,
                                     "default_prompt_grilla": DEFAULT_GRID_AESTHETIC, "key": key_status(),
                               "user_dir": USER_DIR,
                               "session": hub.session}

    def on_verse(text: str, item_id: str, source: str) -> None:
        # Se dirige arte grabando, en modo poema y en modo palabras (las ilustraciones se calan en el muro).
        if hub.session.get("recording"):
            director.add_verse(text, item_id, source)

    transcriber = RealtimeTranscriber(cfg, hub, oa_queue, on_verse) if oa_queue is not None else None

    async def on_frontend(msg: dict[str, Any], ws: ServerConnection) -> None:
        kind = msg.get("type")
        if kind == "inject_verse":  # modo debug del navegador
            director.add_verse(str(msg.get("text", ""))[:600], str(msg.get("item_id", "")), "debug")
        elif kind == "session":
            was = hub.session.get("recording")
            hub.session = {"recording": bool(msg.get("recording")),
                           "mode": "palabras" if msg.get("mode") == "palabras" else "poema"}
            log.info("Sesión: %s", hub.session)
            if hub.session["recording"] and not was:
                director.reset_stanza()
            if oa_queue is not None and was and not hub.session["recording"]:
                while not oa_queue.empty():
                    oa_queue.get_nowait()
                oa_queue.put_nowait(b"")  # centinela → input_audio_buffer.clear
        elif kind == "list_devices":
            current = audio.device_override if audio and audio.device_override is not None else cfg.audio_device
            await hub.reply(ws, "devices", devices=AudioEngine.list_devices(), current=current or "",
                            active=audio.device_name if audio else "",
                            channel=(audio.channel_override or cfg.audio_channel) if audio else cfg.audio_channel)
        elif kind == "set_channel":
            ch = msg.get("channel")
            settings.update({"canal": ch})
            if audio is not None:
                audio.request_channel(ch)
        elif kind == "set_device":
            dev = msg.get("device")
            dev = "" if dev in (None, "") else str(dev)
            settings.update({"device": dev})
            if audio is not None:
                audio.request_device(dev)
        elif kind == "save_settings" and isinstance(msg.get("settings"), dict):
            settings.update(msg["settings"])
            hub.emit("settings", settings=settings.data)
        elif kind == "set_api_key":
            key = str(msg.get("key", "")).strip()
            if not key.startswith("sk-") or len(key) < 20 or any(c.isspace() for c in key):
                await hub.reply(ws, "key_status", ok=False, error="La clave debe empezar con sk- y estar completa.",
                                **key_status())
                return
            where = await asyncio.to_thread(save_api_key, key)
            cfg.openai_api_key, cfg.openai_key_source = key, where
            log.info("Clave de OpenAI actualizada (%s) → %s", mask_key(key), where)
            if transcriber is not None:
                transcriber.set_key(key)
            hub.emit("key_status", ok=True, **key_status())
        elif kind == "open_folder":
            target = os.path.join(USER_DIR, "logos") if msg.get("que") == "logos" else USER_DIR
            ensure_user_dir()
            try:
                if sys.platform == "darwin":
                    subprocess.Popen(["open", target])
                elif sys.platform == "win32":
                    os.startfile(target)  # type: ignore[attr-defined]
                else:
                    subprocess.Popen(["xdg-open", target])
            except Exception as exc:
                log.warning("No pude abrir %s: %s", target, exc)
        elif kind == "list_logos":
            folder = str(msg.get("carpeta", ""))[:200]
            logos = await asyncio.to_thread(read_logo_folder, folder)
            await hub.reply(ws, "logos", id=msg.get("id"), carpeta=folder, logos=logos)
        elif kind == "test_grid":  # panel C: probar el prompt de la grilla con un texto de ejemplo
            text = str(msg.get("text", "")).strip()[:600] or "la luna se moja en el agua quieta del patio"
            t0 = time.perf_counter()
            try:
                direction, provider = await director.direct(text)
            except Exception as exc:  # nunca tumbar el servidor por una prueba
                await hub.reply(ws, "grid_test", ok=False, error=str(exc))
                return
            await hub.reply(ws, "grid_test", ok=bool(direction.get("grilla")), provider=provider, text=text,
                            problema=direction.get("grilla_problema", ""),
                            ms=int((time.perf_counter() - t0) * 1000), direction=direction)
        elif kind == "get_settings":
            await hub.reply(ws, "settings", settings=settings.data, default_prompt=DEFAULT_AESTHETIC,
                            default_prompt_grilla=DEFAULT_GRID_AESTHETIC)

    hub.on_message = on_frontend
    tasks: list[Awaitable[Any]] = [director.run()]
    if audio is not None:
        tasks.append(audio.run())
    else:
        hub.status["mic"] = "disabled"
    if transcriber is not None:
        tasks.append(transcriber.run())
    else:
        hub.status["openai"] = "disabled"

    # 16 MB: el panel C puede subir logos del loop como data URL
    async with serve(hub.handler, cfg.ws_host, cfg.ws_port, max_size=16 * 2 ** 20,
                     ping_interval=20, ping_timeout=20, compression=None):
        log.info("WebSocket local en ws://%s:%d", cfg.ws_host, cfg.ws_port)
        await asyncio.gather(*tasks)
        await asyncio.Future()  # si todas las tareas terminan (p. ej. sin audio ni OpenAI), seguir sirviendo


async def run_check() -> None:
    """Diagnóstico: clave y API de OpenAI, micrófono. No guarda nada."""
    cfg = Config.from_env()
    ok = True
    print("\n== Poesía Tipográfica · diagnóstico ==\n")
    ensure_user_dir()
    flat = ensure_flat_logo()
    print(f"{'✗' if flat.startswith('falta') else '✓'} Logo de FLAT: {flat}")

    # ── OpenAI ──
    key = cfg.openai_api_key
    if not key:
        print("✗ OpenAI: falta OPENAI_API_KEY en .env")
        ok = False
    else:
        print(f"· Clave: {key[:7]}…{key[-4:]} ({len(key)} caracteres)")
        if not key.startswith("sk-"):
            print("  ⚠ no empieza con 'sk-': ¿se copió completa?")
        hub = FrontendHub(cfg)
        tr = RealtimeTranscriber(cfg, hub, asyncio.Queue(), lambda *a: None)
        accepted = None
        for proto in ("ga", "beta"):
            url, headers = tr._endpoint(proto)
            try:
                async with ws_connect(url, additional_headers=headers, open_timeout=15, max_size=None) as ws:
                    await ws.send(json.dumps(tr._session_update(proto)))
                    result = "sin respuesta"
                    deadline = time.monotonic() + 10
                    while time.monotonic() < deadline:
                        ev = json.loads(await asyncio.wait_for(ws.recv(), max(0.1, deadline - time.monotonic())))
                        if ev.get("type") in ("session.updated", "transcription_session.updated"):
                            result = "OK"
                            break
                        if ev.get("type") == "error":
                            e = ev.get("error", {})
                            result = f"rechazada: {e.get('code') or e.get('type')}: {e.get('message')}"
                            break
                print(f"{'✓' if result == 'OK' else '✗'} OpenAI API {proto}: {result}")
                if result == "OK" and accepted is None:
                    accepted = proto
            except InvalidStatus as exc:
                body = (exc.response.body or b"")[:300].decode("utf-8", "replace")
                print(f"✗ OpenAI API {proto}: HTTP {exc.response.status_code} {body}")
            except Exception as exc:
                print(f"✗ OpenAI API {proto}: {type(exc).__name__}: {exc}")
        if accepted:
            print(f"  → se usará la API {accepted} (OPENAI_REALTIME_API={cfg.realtime_api})")
        else:
            ok = False
            print("  → ninguna variante aceptó la sesión. Causas típicas:")
            print("    · 401: clave inválida o revocada → genera otra en platform.openai.com/api-keys")
            print("    · 429 / insufficient_quota: sin saldo → platform.openai.com/settings/organization/billing")
            print("    · model_not_found: cambia TRANSCRIPTION_MODEL (p. ej. gpt-4o-mini-transcribe)")

    # ── Director de arte (imágenes) ──
    print()
    try:
        ensure_user_dir()
        st = SettingsStore(os.path.join(USER_DIR, "ajustes.json"))
        director = ArtDirector(cfg, FrontendHub(cfg), st)
        director.http = httpx.AsyncClient(timeout=httpx.Timeout(cfg.llm_timeout, connect=4.0))
        t0 = time.perf_counter()
        d, prov = await director.direct("la casa respira bajo el agua / y el silencio sube por la escalera")
        await director.http.aclose()
        ms = int((time.perf_counter() - t0) * 1000)
        paths = len(d.get("svg_paths") or [])
        dibujo = f"dibujó {paths} trazo(s) SVG" if paths else "sin dibujo propio (usa la biblioteca)"
        if d.get("grilla"):
            dibujo = f"grilla de texto «{d.get('figura_libre') or d.get('figura')}»"
            print("\n".join("    " + r for r in d["grilla"]))
        elif d.get("grilla_problema"):
            print(f"  ⚠ la grilla del LLM no sirvió: {d['grilla_problema']}")
        mark = "✓" if prov != "heuristic" else "⚠"
        print(f"{mark} Director de arte: {prov} · {ms / 1000:.1f} s · {d['modo_visual']} · {dibujo}")
        if prov == "heuristic":
            print("  ningún LLM respondió: se usan figuras de la biblioteca. Revisa la clave de OpenAI o abre Ollama.")
        elif ms > 8000:
            print("  lento para dibujar en vivo: prueba el director OpenAI o «Curadas» en el panel C.")
    except Exception as exc:
        print(f"✗ Director de arte: {exc}")

    # ── Micrófono ──
    print()
    if sd is None:
        print(f"✗ Micrófono: sounddevice no disponible ({_SD_IMPORT_ERROR})")
        ok = False
    else:
        try:
            settings = SettingsStore(os.path.join(USER_DIR, "ajustes.json"))
            dev = settings.get("device") or cfg.audio_device or None
            dev = int(dev) if isinstance(dev, str) and dev.isdigit() else dev
            info = sd.query_devices(dev, "input")
            nch = max(1, min(int(info.get("max_input_channels", 1)), 32))
            want = int(settings.get("canal") or cfg.audio_channel or 1)
            print(f"· Micrófono: {info['name']} ({nch} entrada(s), se usa la {min(want, nch)}) — grabando 2 s, habla o aplaude…")
            rec = sd.rec(int(2 * info["default_samplerate"]), samplerate=info["default_samplerate"],
                         channels=nch, dtype="int16", device=dev)
            sd.wait()
            if nch > 1:  # placa multicanal: dónde hay señal
                peaks = np.abs(rec).max(axis=0)
                for c, pk in enumerate(peaks, 1):
                    dbc = 20 * math.log10(max(int(pk), 1) / 32768)
                    bar = "█" * max(0, int((dbc + 60) / 3))
                    print(f"    entrada {c:>2}: {dbc:6.1f} dBFS {bar}{'   ← elegida' if c == min(want, nch) else ''}")
                rec = rec[:, min(want, nch) - 1]
            peak = int(np.abs(rec).max())
            if peak == 0:
                ok = False
                print("✗ Silencio digital absoluto (todo ceros).")
                if sys.platform == "darwin":
                    print("  macOS bloqueó el micrófono: Ajustes del Sistema → Privacidad y seguridad → Micrófono →")
                    print("  activa «Terminal», cierra Terminal por completo (Cmd+Q) y vuelve a abrir el script.")
                    print("  Si Terminal no aparece en la lista:  tccutil reset Microphone com.apple.Terminal")
                else:
                    print("  Revisa que el micrófono no esté silenciado y el permiso de micrófono de Windows.")
            else:
                db = 20 * math.log10(peak / 32768)
                print(f"✓ Señal: pico {db:.1f} dBFS" + ("  (muy baja: acerca el micrófono o sube la ganancia)" if db < -40 else ""))
        except Exception as exc:
            ok = False
            print(f"✗ Micrófono: {exc}")
        print("\nDispositivos de entrada:")
        list_devices()
    print("\n" + ("Todo en orden." if ok else "Hay problemas: revisa las líneas con ✗.") + "\n")


def list_devices() -> None:
    if sd is None:
        print(f"sounddevice no disponible: {_SD_IMPORT_ERROR}")
        return
    default_in = sd.default.device[0] if sd.default.device else None
    for idx, info in enumerate(sd.query_devices()):
        if info.get("max_input_channels", 0) > 0:
            mark = "*" if idx == default_in else " "
            host = sd.query_hostapis(info["hostapi"])["name"]
            print(f"{mark} [{idx:>2}] {info['name']}  ({host}, {int(info['default_samplerate'])} Hz, "
                  f"{info['max_input_channels']} entrada(s))")


def main() -> None:
    parser = argparse.ArgumentParser(description="Poesía Tipográfica — backend de audio, transcripción y dirección de arte")
    parser.add_argument("--list-devices", action="store_true", help="listar dispositivos de entrada y salir")
    parser.add_argument("--check", action="store_true", help="diagnóstico: clave/API de OpenAI y micrófono")
    parser.add_argument("--no-audio", action="store_true", help="no abrir el micrófono")
    parser.add_argument("--no-openai", action="store_true", help="no conectar a OpenAI Realtime")
    parser.add_argument("--env", default=".env", help="ruta del archivo .env")
    parser.add_argument("--settings", default="",
                        help="ajustes del show (micrófono, artistas, loop, prompt) escritos desde el panel C")
    args = parser.parse_args()

    load_dotenv(args.env)
    logging.basicConfig(level=getattr(logging, _env("LOG_LEVEL", "INFO").upper(), logging.INFO),
                        format="%(asctime)s %(levelname)-7s %(name)s · %(message)s", datefmt="%H:%M:%S")
    if args.list_devices:
        list_devices()
        return
    if args.check:
        asyncio.run(run_check())
        return
    try:
        asyncio.run(main_async(args))
    except KeyboardInterrupt:
        log.info("Instalación detenida.")


if __name__ == "__main__":
    if sys.platform == "win32":
        try:  # consola de Windows en UTF-8 para los versos con tildes
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass
    main()
