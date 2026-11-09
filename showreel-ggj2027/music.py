#!/usr/bin/env python3
"""Banda sonora original del showreel GGJ Mendoza 2027.

Síntesis 100 % procedural (numpy + scipy): 85,3 BPM, La menor, 32 compases = 90 s exactos.
La grilla (BPM, compases, secciones) es la misma que usa index.html, así cada golpe
visual cae sobre un golpe de audio.

Uso:  python3 music.py  [salida.wav]
"""
import sys
import wave

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
DUR = 90.0
BPM = 32 * 4 * 60 / DUR   # 85,3 BPM: 32 compases = 90 s
B = 60 / BPM            # negra
BAR = 4 * B             # compás
N = int(DUR * SR)
rng = np.random.default_rng(2027)

# ── secciones (en compases) ─────────────────────────────────────────────
INTRO = (0, 4)
BUILD = (4, 8)
DROP1 = (8, 16)
BREAK = (16, 20)
DROP2 = (20, 28)
OUTRO = (28, 32)


def inside(bar, sec):
    return sec[0] <= bar < sec[1]


def bt(bar, beat=0.0):
    """segundos de un compás + negra."""
    return bar * BAR + beat * B


# ── buses ───────────────────────────────────────────────────────────────
def bus():
    return np.zeros((N, 2))


drums, bass_bus, synth, pads, fx, rev_send = bus(), bus(), bus(), bus(), bus(), bus()


def add(buf, sig, t0, gain=1.0, pan=0.0, send=0.0):
    """mezcla una señal mono o estéreo en un bus, con paneo y envío a reverb."""
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if sig.ndim == 1:
        l = np.cos((pan + 1) * np.pi / 4)
        r = np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l * 1.414, sig * r * 1.414], axis=1)
    if i0 < 0:
        sig = sig[-i0:]
        i0 = 0
    n = min(len(sig), N - i0)
    buf[i0:i0 + n] += sig[:n] * gain
    if send:
        rev_send[i0:i0 + n] += sig[:n] * gain * send


def lp(x, fc, order=2):
    fc = min(max(fc, 20), SR / 2 * 0.95)
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x, axis=0)


def hp(x, fc, order=2):
    fc = min(max(fc, 20), SR / 2 * 0.95)
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x, axis=0)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x, axis=0)


def tvec(d):
    return np.arange(int(d * SR)) / SR


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1, length=None):
    length = n if length is None else length
    t = np.arange(n) / SR
    hold = length / SR
    e = np.where(t < a, t / max(a, 1e-6),
                 np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-6), s))
    rel = np.clip((t - hold) / max(r, 1e-6), 0, 1)
    return e * (1 - rel)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def saw(freq, d, phase0=None):
    t = tvec(d)
    ph = (phase0 if phase0 is not None else rng.random()) + np.cumsum(np.full_like(t, freq) / SR)
    return 2 * (ph % 1) - 1


def supersaw(freq, d, voices=7, detune=0.16):
    out = np.zeros((len(tvec(d)), 2))
    for v in range(voices):
        cents = (v - (voices - 1) / 2) / ((voices - 1) / 2) * detune * 100
        f = freq * 2 ** (cents / 1200)
        s = saw(f, d)
        pan = (v / (voices - 1)) * 2 - 1
        out[:, 0] += s * (1 - pan) * 0.5
        out[:, 1] += s * (1 + pan) * 0.5
    return out / voices * 1.6


# ── instrumentos ────────────────────────────────────────────────────────
def kick(gain=1.0):
    t = tvec(0.42)
    f = 46 + 120 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 300) * 0.35
    k = np.tanh((body + click) * 1.8) * 0.9
    return k * gain


def clap():
    t = tvec(0.35)
    n = rng.standard_normal(len(t))
    env = np.zeros_like(t)
    for off in (0, 0.009, 0.019, 0.028):
        env += np.where(t >= off, np.exp(-(t - off) * 120), 0) * 0.6
    env += np.where(t >= 0.028, np.exp(-(t - 0.028) * 14), 0) * 0.5
    return bp(n, 900, 6500) * env * 0.9


def snare():
    t = tvec(0.25)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    noise = bp(rng.standard_normal(len(t)), 1500, 9000) * np.exp(-t * 22)
    return (tone + noise) * 0.7


def hat(open_=False):
    d = 0.32 if open_ else 0.06
    t = tvec(d)
    n = hp(rng.standard_normal(len(t)), 7500, order=4)
    return n * np.exp(-t * (11 if open_ else 75)) * (0.35 if open_ else 0.28)


def tick():
    """tic de reloj: el cronómetro de 48 h."""
    t = tvec(0.05)
    return (np.sin(2 * np.pi * 3200 * t) * 0.5 + hp(rng.standard_normal(len(t)), 5000) * 0.3) * np.exp(-t * 160)


def crash():
    t = tvec(2.6)
    n = hp(rng.standard_normal((len(t), 2)), 4000, order=2)
    return n * np.exp(-t * 1.6)[:, None] * 0.35


def impact():
    """golpe cinematográfico: sub + ruido + cola."""
    t = tvec(3.0)
    f = 30 + 70 * np.exp(-t * 6)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.4)
    noise = lp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 4) * 0.6
    boom = np.tanh((sub + noise) * 2.2) * 0.85
    return boom


def riser(d, f0=300, f1=9000, gain=0.5):
    t = tvec(d)
    n = rng.standard_normal(len(t))
    out = np.zeros_like(n)
    seg = 2048
    for i in range(0, len(n), seg):
        x = i / len(n)
        fc = f0 * (f1 / f0) ** (x ** 1.6)
        out[i:i + seg] = bp(n[max(0, i - 512):i + seg], fc * 0.6, min(fc * 1.6, SR / 2 * 0.9))[-len(n[i:i + seg]):]
    env = (t / d) ** 2.2
    # tono que sube, debajo del ruido
    pitch = 2 * np.pi * np.cumsum(110 * 2 ** (3 * t / d)) / SR
    tone = np.sign(np.sin(pitch)) * 0.12 * env
    return (out * env + lp(tone, 3000)) * gain


def downlifter(d=1.6, gain=0.45):
    return riser(d, 300, 9000, gain)[::-1].copy()


def whoosh(d=0.5, gain=0.4):
    t = tvec(d)
    n = rng.standard_normal(len(t))
    env = np.sin(np.pi * t / d) ** 2
    return bp(n, 600, 5000) * env * gain


def pluck(m, d=0.22, bright=4200):
    t = tvec(d)
    f = mtof(m)
    s = 0.6 * saw(f, d) + 0.4 * np.sign(np.sin(2 * np.pi * f * t))
    s = lp(s, bright)
    return s * np.exp(-t * 14) * 0.5


def pad(midis, d, cutoff=1400):
    out = np.zeros((int(d * SR), 2))
    for m in midis:
        out += supersaw(mtof(m), d, voices=5, detune=0.1)
    out = lp(out, cutoff)
    env = adsr(len(out), a=0.6, d=0.4, s=0.8, r=0.6, length=len(out) - int(0.6 * SR))
    return out * env[:, None] * 0.28


def stab_chord(midis, d, cutoff=5200):
    out = np.zeros((int(d * SR), 2))
    for m in midis:
        out += supersaw(mtof(m), d)
    out = lp(out, cutoff)
    env = adsr(len(out), a=0.004, d=0.25, s=0.75, r=0.05, length=len(out) - int(0.05 * SR))
    return out * env[:, None] * 0.24


def bass_note(m, d, cutoff=900):
    t = tvec(d)
    f = mtof(m)
    s = saw(f, d) * 0.7 + np.sin(2 * np.pi * f / 2 * t) * 0.6
    s = lp(s, cutoff)
    env = adsr(len(t), a=0.003, d=0.08, s=0.8, r=0.03, length=len(t) - int(0.03 * SR))
    return np.tanh(s * env * 1.5) * 0.55


def lead_note(m, d):
    t = tvec(d)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t * 4, 0, 1)
    f = mtof(m) * vib
    ph = np.cumsum(f) / SR
    s = (2 * (ph % 1) - 1) * 0.6 + (2 * ((ph * 1.005) % 1) - 1) * 0.4
    s = lp(s, 5500)
    env = adsr(len(t), a=0.01, d=0.1, s=0.75, r=0.06, length=len(t) - int(0.06 * SR))
    return s * env * 0.22


# ── armonía ─────────────────────────────────────────────────────────────
# Am – F – C – G   (i – VI – III – VII)
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOTS = [33, 29, 36, 31]                     # La1 Fa1 Do2 Sol1
ARP = [[69, 72, 76, 81], [65, 69, 72, 77], [64, 67, 72, 76], [62, 67, 71, 74]]
LEAD = [  # (negra de inicio, duración en negras, midi) por compás
    [(0, .5, 76), (1, .5, 81), (2, .5, 79), (2.5, .5, 76), (3.5, .5, 72)],
    [(0, .5, 72), (1, .5, 77), (2, .5, 76), (2.5, .5, 72), (3, .5, 69)],
    [(0, .5, 67), (1, .5, 72), (2, .5, 76), (3, .5, 79)],
    [(0, .5, 71), (1, .5, 74), (2, .5, 79), (2.5, .5, 77), (3, .5, 76), (3.5, .5, 74)],
]

# ── secuencia ───────────────────────────────────────────────────────────
KICK = kick()
for bar in range(32):
    c = bar % 4
    drop = inside(bar, DROP1) or inside(bar, DROP2)

    # ---------- INTRO: reloj + pad + arpegio filtrado ----------
    if inside(bar, INTRO):
        add(pads, pad(CHORDS[c], BAR + 0.6, cutoff=700 + bar * 250), bt(bar), 0.9, send=0.4)
        for s in range(16):
            g = 0.55 if s % 4 == 0 else 0.18
            add(drums, tick(), bt(bar, s / 4), g, pan=0.25 if s % 2 else -0.25, send=0.15)
        if bar >= 2:
            for s in range(16):
                add(synth, pluck(ARP[c][s % 4], bright=900 + (bar - 2) * 900 + s * 60), bt(bar, s / 4),
                    0.5, pan=(-0.4, 0.4)[s % 2], send=0.35)

    # ---------- BUILD ----------
    if inside(bar, BUILD):
        kicks = [0, 2] if bar < 6 else [0, 1, 2, 3]
        if bar == 7:
            kicks = [0, 1, 2]
        for k in kicks:
            add(drums, KICK, bt(bar, k), 0.85)
        for e in range(8):
            if bar == 7 and e >= 6:
                break
            if e % 2:
                add(bass_bus, bass_note(ROOTS[c] + 12, B / 2 * 0.9, cutoff=300 + (bar - 4) * 300), bt(bar, e / 2), 0.9)
        for s in range(16):
            if bar == 7 and s >= 12:
                break
            add(synth, pluck(ARP[c][s % 4] + (12 if s % 8 == 7 else 0), bright=2200 + (bar - 4) * 900),
                bt(bar, s / 4), 0.5, pan=(-0.5, 0.5)[s % 2], send=0.3)
            add(drums, hat(), bt(bar, s / 4), 0.5 if s % 2 else 0.25, pan=0.2)
        add(pads, pad(CHORDS[c], BAR + 0.5, cutoff=1500), bt(bar), 0.7, send=0.4)
        if bar >= 6:
            # redoble que acelera hasta el corte
            steps = 8 if bar == 6 else 24
            span = 4 if bar == 6 else 3
            for i in range(steps):
                add(drums, snare(), bt(bar, i * span / steps), 0.25 + 0.5 * (i / steps) * (bar - 5) / 2, send=0.2)

    # ---------- DROPS ----------
    if drop:
        second = inside(bar, DROP2)
        last_of_drop = bar in (15, 27)
        for k in range(4):
            if last_of_drop and k == 3:
                continue
            add(drums, KICK, bt(bar, k), 1.0)
        for k in (1, 3):
            if not (last_of_drop and k == 3):
                add(drums, clap(), bt(bar, k), 0.75, send=0.25)
        for s in range(16):
            if last_of_drop and s >= 12:
                break
            add(drums, hat(), bt(bar, s / 4), 0.42 if s % 4 == 2 else 0.22, pan=0.3 * np.sin(s))
        for k in range(4):
            if not (last_of_drop and k == 3):
                add(drums, hat(True), bt(bar, k + 0.5), 0.5, pan=-0.2)
        # bajo en contratiempo (corcheas)
        for e in range(8):
            if last_of_drop and e >= 6:
                break
            if e % 2:
                add(bass_bus, bass_note(ROOTS[c] + 12, B / 2 * 0.85, 1100 if second else 900), bt(bar, e / 2), 1.0)
            else:
                add(bass_bus, bass_note(ROOTS[c], B / 2 * 0.5, 400), bt(bar, e / 2), 0.55)
        # acordes supersaw sostenidos (el sidechain los hace bombear)
        add(synth, stab_chord([m + 12 for m in CHORDS[c]] + [CHORDS[c][0]], BAR * (0.75 if last_of_drop else 1.0)),
            bt(bar), 0.95, send=0.25)
        # arpegio brillante
        for s in range(16):
            if last_of_drop and s >= 12:
                break
            add(synth, pluck(ARP[c][(s * 3) % 4] + 12, d=0.16, bright=6500), bt(bar, s / 4), 0.28,
                pan=(-0.6, 0.6)[s % 2], send=0.3)
        if second:
            for (st, ln, m) in LEAD[c]:
                add(synth, lead_note(m + 12, ln * B * 0.95), bt(bar, st), 1.0, send=0.35)
        if last_of_drop:
            for i in range(8):
                add(drums, snare(), bt(bar, 3 + i / 8), 0.3 + 0.06 * i, send=0.2)

    # ---------- BREAKDOWN ----------
    if inside(bar, BREAK):
        add(pads, pad(CHORDS[c], BAR + 0.8, cutoff=2200), bt(bar), 1.0, send=0.5)
        for s in range(8):
            add(synth, pluck(ARP[c][s % 4] + (12 if s >= 4 else 0), d=0.5, bright=3000), bt(bar, s / 2), 0.45,
                pan=(-0.5, 0.5)[s % 2], send=0.6)
        if bar >= 18:
            add(bass_bus, bass_note(ROOTS[c], BAR * 0.95, 250), bt(bar), 0.6)
        if bar == 19:
            for i in range(24):
                add(drums, snare(), bt(bar, i * 3 / 24), 0.2 + 0.55 * i / 24, send=0.2)
            for k in range(3):
                add(drums, KICK, bt(bar, k), 0.7)

    # ---------- OUTRO ----------
    if inside(bar, OUTRO):
        if bar < 30:
            for k in range(4):
                add(drums, KICK, bt(bar, k), 0.9)
            for k in (1, 3):
                add(drums, clap(), bt(bar, k), 0.6, send=0.3)
            for s in range(16):
                add(drums, hat(), bt(bar, s / 4), 0.2, pan=0.3)
            add(pads, pad(CHORDS[c], BAR + 0.5, cutoff=2600), bt(bar), 0.9, send=0.4)
            for s in range(16):
                add(synth, pluck(ARP[c][s % 4] + 12, d=0.18, bright=5000 - (bar - 28) * 1500), bt(bar, s / 4), 0.3,
                    pan=(-0.6, 0.6)[s % 2], send=0.35)
            for e in range(8):
                if e % 2:
                    add(bass_bus, bass_note(ROOTS[c] + 12, B / 2 * 0.85, 700), bt(bar, e / 2), 0.8)

# acorde final largo (compás 30) y cola
add(synth, stab_chord([57, 64, 69, 72, 76], BAR * 2, cutoff=4000), bt(30), 0.9, send=0.8)
add(pads, pad([45, 57, 64, 69], BAR * 2, cutoff=1800), bt(30), 1.0, send=0.8)
add(bass_bus, bass_note(33, BAR * 1.5, 300), bt(30), 0.9)

# ── FX: impactos, risers, crashes, whooshes ─────────────────────────────
for b_ in (0, 8, 20, 28, 30):
    add(fx, impact(), bt(b_), 0.9 if b_ else 0.55, send=0.5)
for b_ in (8, 12, 20, 24, 28, 30):
    add(fx, crash(), bt(b_), 0.8)
add(fx, riser(BAR - B * 0.5, 200, 6000, 0.35), bt(3), 1.0, send=0.3)
add(fx, riser(BAR * 2 - B, 200, 11000, 0.5), bt(6), 1.0, send=0.3)
add(fx, riser(BAR * 2 - B, 200, 11000, 0.5), bt(18), 1.0, send=0.3)
add(fx, downlifter(BAR), bt(16), 0.8, send=0.4)
# whooshes alineados con transiciones visuales (ver CUES en index.html)
for t0 in [bt(b, beat) for (b, beat) in [(1, 0), (2, 0), (3, 0), (5, 0), (6, 0), (10, 0), (11, 0), (13, 0),
                                          (14, 0), (17, 0), (21, 0), (22, 0), (24, 0), (26, 0), (27, 0), (29, 0)]]:
    add(fx, whoosh(0.45), t0 - 0.3, 0.45, pan=float(rng.uniform(-0.6, 0.6)))

# ── sidechain ───────────────────────────────────────────────────────────
# bombeo suave: con más profundidad (antes 0.78) los acordes se oían cortados, como un trémolo
SC_DEPTH = 0.35
SC_RELEASE = 0.14
t_all = np.arange(N) / SR
sc = np.ones(N)
for bar in range(32):
    if inside(bar, DROP1) or inside(bar, DROP2) or (inside(bar, BUILD) and bar >= 6) or (28 <= bar < 30):
        for k in range(4):
            t0 = bt(bar, k)
            i0 = int(t0 * SR)
            i1 = min(N, i0 + int(B * SR))
            tt = t_all[i0:i1] - t0
            sc[i0:i1] = np.minimum(sc[i0:i1], 1 - SC_DEPTH * np.exp(-tt / SC_RELEASE) * np.clip(tt / 0.012, 0, 1))
sc2 = sc[:, None]

# ── reverb (convolución con IR sintética) ───────────────────────────────
ir_t = tvec(2.8)
ir = rng.standard_normal((len(ir_t), 2)) * np.exp(-ir_t * 2.4)[:, None]
ir = lp(hp(ir, 250), 7000)
ir /= np.sqrt((ir ** 2).sum(axis=0))
wet = np.stack([fftconvolve(rev_send[:, ch], ir[:, ch])[:N] for ch in range(2)], axis=1)

sc_soft = np.sqrt(sc2)      # los colchones bombean todavía menos
mix = (drums * 0.95
       + bass_bus * sc2 * 0.9
       + synth * sc2 * 0.8
       + pads * sc_soft * 0.75
       + fx * 0.8
       + wet * 0.35 * sc_soft)
mix = hp(mix, 28)

# master: compresión suave + saturación + limitador simple
mix = np.tanh(mix * 1.35) / np.tanh(1.35)
peak = np.max(np.abs(mix))
mix = mix / peak * 0.93
fade = np.clip((DUR - t_all) / 1.2, 0, 1)[:, None]
mix *= fade

out = sys.argv[1] if len(sys.argv) > 1 else 'build/soundtrack.wav'
pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('ok', out, f'{DUR:.1f}s')
