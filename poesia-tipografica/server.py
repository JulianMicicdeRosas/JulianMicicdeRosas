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


@dataclass
class Config:
    openai_api_key: str
    realtime_url: str
    transcription_model: str
    transcription_language: str
    transcription_prompt: str
    vad_threshold: float
    vad_silence_ms: int
    vad_prefix_ms: int

    audio_device: str
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
    deepseek_base_url: str
    deepseek_model: str

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            openai_api_key=_env("OPENAI_API_KEY"),
            realtime_url=_env("OPENAI_REALTIME_URL",
                              "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview"),
            transcription_model=_env("TRANSCRIPTION_MODEL", "gpt-4o-transcribe"),
            transcription_language=_env("TRANSCRIPTION_LANGUAGE", "es"),
            transcription_prompt=_env("TRANSCRIPTION_PROMPT", ""),
            vad_threshold=_env_float("VAD_THRESHOLD", 0.5),
            vad_silence_ms=_env_int("VAD_SILENCE_MS", 350),
            vad_prefix_ms=_env_int("VAD_PREFIX_PADDING_MS", 300),
            audio_device=_env("AUDIO_DEVICE"),
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
            deepseek_base_url=_env("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").rstrip("/"),
            deepseek_model=_env("DEEPSEEK_MODEL", "deepseek-chat"),
        )


def _now_ms() -> int:
    return int(time.time() * 1000)


# ════════════════════════════════════════════════════════════════════════════
#  Hub WebSocket local (Three.js)
# ════════════════════════════════════════════════════════════════════════════

class FrontendHub:
    """Servidor WebSocket local. Difunde sin backpressure (los clientes son locales)."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.clients: set[ServerConnection] = set()
        self.on_message: Callable[[dict[str, Any]], Awaitable[None]] | None = None
        self.status: dict[str, Any] = {"mic": "init", "openai": "init", "llm": cfg.llm_provider}

    async def handler(self, ws: ServerConnection) -> None:
        self.clients.add(ws)
        peer = getattr(ws, "remote_address", None)
        log.info("Frontend conectado %s (%d clientes)", peer, len(self.clients))
        try:
            await ws.send(self._encode("hello", server="poesia-tipografica", version=1,
                                       sample_rate=self.cfg.sample_rate, status=self.status))
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
                        await self.on_message(msg)
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
        dev = self.cfg.audio_device
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
        try:
            stream = sd.RawInputStream(samplerate=self.sr, channels=1, dtype="int16",
                                       blocksize=self.block, device=device, latency="low",
                                       callback=self._callback)
            self.resampler = None
            log.info("Micrófono abierto a %d Hz, bloque %d muestras (%.1f ms)",
                     self.sr, self.block, 1000 * self.block / self.sr)
            return stream
        except Exception as exc:  # el dispositivo no soporta 24 kHz: abrir nativo y remuestrear
            info = sd.query_devices(device, "input")
            native = int(info["default_samplerate"])
            log.warning("No se pudo abrir a %d Hz (%s). Abro a %d Hz y remuestreo.", self.sr, exc, native)
            native_block = max(64, int(native * self.cfg.block_ms / 1000))
            stream = sd.RawInputStream(samplerate=native, channels=1, dtype="int16",
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
                stream = self._open_stream()
                stream.start()
                self.hub.set_status(mic="ok")
                backoff = 1.0
                while True:
                    # Watchdog: si el driver deja de entregar bloques (USB desconectado), reabrir.
                    data = await asyncio.wait_for(self.raw_q.get(), timeout=2.5)
                    self._process(data)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.error("Fallo de audio: %s — reintento en %.0fs", exc, backoff)
                self.hub.set_status(mic="error")
            finally:
                if stream is not None:
                    try:
                        stream.stop()
                        stream.close()
                    except Exception:
                        pass
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 15.0)

    # --- análisis --------------------------------------------------------
    def _process(self, data: bytes) -> None:
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

        if self.openai_queue is not None:
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

class RealtimeTranscriber:
    def __init__(self, cfg: Config, hub: FrontendHub, audio_q: asyncio.Queue[bytes],
                 on_completed: Callable[[str, str, str], None]) -> None:
        self.cfg = cfg
        self.hub = hub
        self.audio_q = audio_q
        self.on_completed = on_completed
        self.partials: dict[str, str] = {}

    def _session_update(self) -> dict[str, Any]:
        transcription: dict[str, Any] = {"model": self.cfg.transcription_model}
        if self.cfg.transcription_language:
            transcription["language"] = self.cfg.transcription_language
        if self.cfg.transcription_prompt:
            transcription["prompt"] = self.cfg.transcription_prompt
        return {
            "type": "session.update",
            "session": {
                "modalities": ["text"],  # nunca audio de respuesta
                "instructions": "Sólo transcribe. No respondas.",
                "input_audio_format": "pcm16",
                "input_audio_transcription": transcription,
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": self.cfg.vad_threshold,
                    "prefix_padding_ms": self.cfg.vad_prefix_ms,
                    "silence_duration_ms": self.cfg.vad_silence_ms,
                    "create_response": False,   # transcripción exclusiva
                    "interrupt_response": False,
                },
            },
        }

    async def run(self) -> None:
        if not self.cfg.openai_api_key:
            log.warning("OPENAI_API_KEY vacío: transcripción desactivada (usa el modo D del navegador).")
            self.hub.set_status(openai="disabled")
            return
        headers = {"Authorization": f"Bearer {self.cfg.openai_api_key}", "OpenAI-Beta": "realtime=v1"}
        backoff = 1.0
        while True:
            try:
                log.info("Conectando a OpenAI Realtime…")
                async with ws_connect(self.cfg.realtime_url, additional_headers=headers, max_size=None,
                                      open_timeout=15, ping_interval=20, ping_timeout=20,
                                      close_timeout=5) as ws:
                    backoff = 1.0
                    await ws.send(json.dumps(self._session_update()))
                    # audio acumulado mientras estábamos desconectados: conservar sólo ~0.5 s
                    keep = max(1, 500 // self.cfg.openai_chunk_ms)
                    while self.audio_q.qsize() > keep:
                        self.audio_q.get_nowait()
                    self.hub.set_status(openai="connected")
                    log.info("OpenAI Realtime conectado (%s)", self.cfg.transcription_model)
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
            except asyncio.CancelledError:
                raise
            except InvalidStatus as exc:
                code = exc.response.status_code
                log.error("OpenAI rechazó la conexión (HTTP %s).", code)
                if code in (401, 403):
                    backoff = 60.0  # clave inválida: no martillar la API
            except (OSError, ConnectionClosed, TimeoutError, InvalidURI) as exc:
                log.warning("Conexión OpenAI perdida: %s", exc)
            except Exception:
                log.exception("Error inesperado en OpenAI Realtime")
            self.hub.set_status(openai="reconnecting")
            delay = backoff + random.uniform(0, 0.5)
            log.info("Reconectando a OpenAI en %.1fs", delay)
            await asyncio.sleep(delay)
            backoff = min(backoff * 2, 30.0)

    async def _sender(self, ws) -> None:  # noqa: ANN001
        while True:
            chunk = await self.audio_q.get()
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
                delta = ev.get("delta", "")
                if delta:
                    self.partials[item_id] = self.partials.get(item_id, "") + delta
                    self.hub.emit("word_delta", item_id=item_id, delta=delta, t=_now_ms())
            elif et == "conversation.item.input_audio_transcription.completed":
                item_id = ev.get("item_id", "")
                text = (ev.get("transcript") or self.partials.get(item_id, "")).strip()
                self.partials.pop(item_id, None)
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
            elif et in ("session.created", "session.updated"):
                log.debug("OpenAI: %s", et)
            elif et == "error":
                err = ev.get("error", {})
                log.error("OpenAI error: %s", err)
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

SYSTEM_PROMPT = f"""Eres el director de arte de una instalación de poesía proyectada en un museo de arte contemporáneo
(herencia de Camille Utterback "Text Rain", Rafael Lozano-Hemmer "Subtitled Public", Charles Sandison, Jeffrey Shaw).
Recibes un verso recién leído en voz alta. Decides cómo sus propias letras deben moverse y qué figura formar.
Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional, con estas claves:

{{
  "modo_visual": "concreto" | "simbolico" | "hibrido",
  "figura": uno de {FIGURES},
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

Reglas:
- "concreto": el verso nombra algo visible (luna, ojo, pájaro…). La figura se dibuja con las letras (caligrama).
- "simbolico": el verso es abstracto (tiempo, olvido, deseo…). Sólo física, sin figura.
- "hibrido": figura tenue mientras la física sigue alrededor.
- Alterna: evita repetir el mismo modo_visual más de dos veces seguidas.
- svg_paths es opcional: déjalo [] si no estás seguro; la figura de la biblioteca se usará. Si lo das: máximo 3 paths,
  sólo comandos M L C Q A Z con coordenadas absolutas dentro de 0..512, formas cerradas y simples.
- lluvia_text_rain: caída, llanto, peso. enjambre_lozano: multitud, voces, nosotros. vortice_sandison: tiempo, vértigo,
  cosmos. dispersion_ceniza: olvido, muerte, memoria que se borra.
- Estética de museo: base hueso, grises ceniza; el acento ámbar o carmín es muy puntual (uso_acento bajo)."""


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
    return len(numbers) >= 6


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
    fig = strip_accents(str(raw.get("figura", "")).lower().strip())
    if fig in FIGURES:
        out["figura"] = fig
    paths = raw.get("svg_paths", [])
    if isinstance(paths, str):
        paths = [paths]
    if isinstance(paths, list):
        out["svg_paths"] = [p.strip() for p in paths if valid_svg_path(p)][:3]
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


class ArtDirector:
    def __init__(self, cfg: Config, hub: FrontendHub) -> None:
        self.cfg = cfg
        self.hub = hub
        self.queue: asyncio.Queue[tuple[str, str, str]] = asyncio.Queue(maxsize=16)
        self.history: deque[str] = deque(maxlen=4)
        self.modes: deque[str] = deque(maxlen=4)
        self.http: httpx.AsyncClient | None = None

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
                log.info("Dirección [%s %dms] %s / %s / %s", provider, direction["latencia_ms"],
                         direction["modo_visual"], direction["figura"], direction["fisica"]["modo"])
                self.hub.emit("art_direction", data=direction)
        finally:
            await self.http.aclose()

    def _messages(self, text: str) -> list[dict[str, str]]:
        context = " / ".join(self.history) if self.history else "(inicio del poema)"
        recent = ", ".join(self.modes) if self.modes else "ninguno"
        user = (f"Versos anteriores: {context}\nModos visuales recientes: {recent}\n"
                f"Verso actual: «{text}»\nDevuelve sólo el JSON.")
        return [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]

    async def _ollama(self, text: str) -> Any:
        assert self.http is not None
        r = await self.http.post(self.cfg.ollama_url, json={
            "model": self.cfg.ollama_model, "messages": self._messages(text), "format": "json",
            "stream": False, "keep_alive": self.cfg.ollama_keep_alive,
            "options": {"temperature": self.cfg.llm_temperature, "num_predict": 900},
        })
        r.raise_for_status()
        return extract_json(r.json()["message"]["content"])

    async def _deepseek(self, text: str) -> Any:
        assert self.http is not None
        if not self.cfg.deepseek_key:
            raise RuntimeError("DEEPSEEK_API_KEY vacío")
        r = await self.http.post(f"{self.cfg.deepseek_base_url}/chat/completions", headers={
            "Authorization": f"Bearer {self.cfg.deepseek_key}"}, json={
            "model": self.cfg.deepseek_model, "messages": self._messages(text),
            "response_format": {"type": "json_object"}, "temperature": self.cfg.llm_temperature,
            "max_tokens": 900, "stream": False,
        })
        r.raise_for_status()
        return extract_json(r.json()["choices"][0]["message"]["content"])

    async def direct(self, text: str) -> tuple[dict[str, Any], str]:
        chain: list[tuple[str, Callable[[str], Awaitable[Any]]]] = []
        if self.cfg.llm_provider == "deepseek":
            chain.append(("deepseek", self._deepseek))
        else:
            chain.append(("ollama", self._ollama))
            if self.cfg.llm_fallback_deepseek and self.cfg.deepseek_key:
                chain.append(("deepseek", self._deepseek))
        for name, fn in chain:
            try:
                raw = await fn(text)
                if self.hub.status.get("llm") != name:
                    self.hub.set_status(llm=name)
                return sanitize_direction(raw, text, list(self.modes)), name
            except Exception as exc:
                log.warning("LLM %s falló: %s", name, exc)
        if self.hub.status.get("llm") != "heuristic":
            self.hub.set_status(llm="heuristic")
        return heuristic_direction(text, list(self.modes)), "heuristic"


# ════════════════════════════════════════════════════════════════════════════
#  Main
# ════════════════════════════════════════════════════════════════════════════

async def main_async(args: argparse.Namespace) -> None:
    cfg = Config.from_env()
    loop = asyncio.get_running_loop()
    hub = FrontendHub(cfg)
    director = ArtDirector(cfg, hub)
    use_openai = not args.no_openai and bool(cfg.openai_api_key)
    oa_queue: asyncio.Queue[bytes] | None = asyncio.Queue(maxsize=300) if use_openai else None

    async def on_frontend(msg: dict[str, Any]) -> None:
        if msg.get("type") == "inject_verse":  # modo debug del navegador
            director.submit(str(msg.get("text", ""))[:600], str(msg.get("item_id", "")), "debug")

    hub.on_message = on_frontend
    tasks: list[Awaitable[Any]] = [director.run()]
    if not args.no_audio:
        tasks.append(AudioEngine(cfg, hub, oa_queue, loop).run())
    else:
        hub.status["mic"] = "disabled"
    if oa_queue is not None:
        tasks.append(RealtimeTranscriber(cfg, hub, oa_queue, director.submit).run())
    else:
        hub.status["openai"] = "disabled"
        if not args.no_openai:
            log.warning("OPENAI_API_KEY vacío: sin transcripción. Usa la tecla D en el navegador.")

    async with serve(hub.handler, cfg.ws_host, cfg.ws_port, max_size=2 ** 20,
                     ping_interval=20, ping_timeout=20, compression=None):
        log.info("WebSocket local en ws://%s:%d", cfg.ws_host, cfg.ws_port)
        await asyncio.gather(*tasks)
        await asyncio.Future()  # si todas las tareas terminan (p. ej. sin audio ni OpenAI), seguir sirviendo


def list_devices() -> None:
    if sd is None:
        print(f"sounddevice no disponible: {_SD_IMPORT_ERROR}")
        return
    default_in = sd.default.device[0] if sd.default.device else None
    for idx, info in enumerate(sd.query_devices()):
        if info.get("max_input_channels", 0) > 0:
            mark = "*" if idx == default_in else " "
            host = sd.query_hostapis(info["hostapi"])["name"]
            print(f"{mark} [{idx:>2}] {info['name']}  ({host}, {int(info['default_samplerate'])} Hz)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Poesía Tipográfica — backend de audio, transcripción y dirección de arte")
    parser.add_argument("--list-devices", action="store_true", help="listar dispositivos de entrada y salir")
    parser.add_argument("--no-audio", action="store_true", help="no abrir el micrófono")
    parser.add_argument("--no-openai", action="store_true", help="no conectar a OpenAI Realtime")
    parser.add_argument("--env", default=".env", help="ruta del archivo .env")
    args = parser.parse_args()

    load_dotenv(args.env)
    logging.basicConfig(level=getattr(logging, _env("LOG_LEVEL", "INFO").upper(), logging.INFO),
                        format="%(asctime)s %(levelname)-7s %(name)s · %(message)s", datefmt="%H:%M:%S")
    if args.list_devices:
        list_devices()
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
