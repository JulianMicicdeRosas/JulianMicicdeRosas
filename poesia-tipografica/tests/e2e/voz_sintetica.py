"""Genera un WAV que hace de micrófono en las pruebas: tramos de «voz» (ruido con forma de habla) separados por pausas.
No dice nada: el OpenAI simulado detecta cuándo hay sonido y devuelve frases de prueba.

Uso: python voz_sintetica.py <salida.wav> [segundos]"""
import sys
import wave

import numpy as np

SR = 24000


def main(path: str, seconds: float = 150.0) -> None:
    rng = np.random.default_rng(7)
    out = []
    t = 0.0
    while t < seconds:
        habla = rng.uniform(2.2, 3.6)   # una frase
        pausa = rng.uniform(0.7, 1.6)   # silencio entre frases (cada tanto, uno largo: párrafo nuevo)
        if rng.random() < 0.2:
            pausa += 1.5
        n = int(habla * SR)
        x = np.arange(n) / SR
        sil = 0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(3, 5) * x)          # sílabas
        voz = (np.sin(2 * np.pi * 140 * x) + 0.5 * np.sin(2 * np.pi * 280 * x) + 0.4 * rng.standard_normal(n)) * sil
        env = np.minimum(1, np.minimum(x, habla - x) / 0.08)                  # sin clics al empezar y terminar
        out.append((voz * env * 0.22).astype(np.float32))
        out.append(np.zeros(int(pausa * SR), dtype=np.float32))
        t += habla + pausa
    pcm = (np.clip(np.concatenate(out), -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 150.0)
