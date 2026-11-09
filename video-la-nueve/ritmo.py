#!/usr/bin/env python3
"""Análisis rítmico (tempo, grilla de pulsos y subdivisiones) con numpy + ffmpeg.

Uso: python3 ritmo.py musica.mp3 [--json salida.json]
"""
import argparse, json, subprocess
import numpy as np

SR, HOP, NFFT = 22050, 512, 2048


def load(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR),
                                   "-f", "f32le", "-"])
    return np.frombuffer(raw, dtype=np.float32)


def onset_env(y):
    n = 1 + (len(y) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    win = np.hanning(NFFT).astype(np.float32)
    env, rms = np.empty(n, np.float32), np.empty(n, np.float32)
    prev = None
    for s in range(0, n, 2000):  # por bloques para no usar mucha memoria
        fr = y[idx[s:s + 2000]] * win
        mag = np.log1p(100 * np.abs(np.fft.rfft(fr, axis=1)))
        rms[s:s + 2000] = np.sqrt((fr ** 2).mean(1))
        p = np.vstack([mag[:1] if prev is None else prev[None], mag[:-1]])
        env[s:s + 2000] = np.maximum(mag - p, 0).sum(1)
        prev = mag[-1]
    env -= np.convolve(env, np.ones(16) / 16, "same")
    return np.maximum(env, 0), rms


def tempo(env, fps, lo=60, hi=180):
    ac = np.correlate(env - env.mean(), env - env.mean(), "full")[len(env) - 1:]
    lags = np.arange(len(ac)); bpm = 60 * fps / np.maximum(lags, 1)
    m = (bpm >= lo) & (bpm <= hi)
    w = ac * np.exp(-0.5 * (np.log2(bpm / 110) / 0.9) ** 2)  # leve preferencia ~110 bpm
    lag = lags[m][np.argmax(w[m])]
    # refinamiento sub-frame
    a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
    lag = lag + 0.5 * (a - c) / (a - 2 * b + c)
    return 60 * fps / lag


def beat_grid(env, fps, bpm, dur):
    period = 60 / bpm
    phases = np.linspace(0, period, 200, endpoint=False)
    t = np.arange(len(env)) / fps
    score = [env[np.clip(np.round((np.arange(ph, dur, period)) * fps).astype(int), 0, len(env) - 1)].sum()
             for ph in phases]
    ph = phases[int(np.argmax(score))]
    return np.arange(ph, dur, period)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("audio"); ap.add_argument("--json")
    a = ap.parse_args()
    y = load(a.audio); dur = len(y) / SR; fps = SR / HOP
    env, rms = onset_env(y)
    bpm = tempo(env, fps)
    beats = beat_grid(env, fps, bpm, dur)
    print(f"duración {dur:.1f}s  tempo {bpm:.2f} bpm  pulso {60/bpm:.3f}s  "
          f"corchea {30/bpm:.3f}s  semicorchea {15/bpm:.3f}s  compás 4/4 {240/bpm:.3f}s")
    for s in range(0, int(dur), 10):
        m = slice(int(s * fps), int((s + 10) * fps))
        print(f"{s:4d}s  energía {rms[m].mean():.3f}  ataques {env[m].mean():.2f}")
    if a.json:
        json.dump({"bpm": bpm, "beats": beats.tolist(), "fps": fps,
                   "rms": rms.tolist(), "onset": env.tolist()}, open(a.json, "w"))


if __name__ == "__main__":
    main()
