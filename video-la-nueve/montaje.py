#!/usr/bin/env python3
"""Montaje de 10 s "La Nueve - Lugares 3" (vertical 1080x1920), cortado a la grilla rítmica.

Uso:
  python3 ritmo.py musica.mp3 --json ritmo.json
  python3 montaje.py --clips DIR --music musica.mp3 --ritmo ritmo.json --logo logo.png \
                     --out salida.mp4 [--music-at 137.5]

- La música entra en un primer tiempo de compás del medio del tema (cerca de --music-at),
  con fade-in y fade-out.
- Los cortes caen sobre la grilla: compases (2,047 s a 117 BPM), blancas y negras.
- Audio de los inserts al 50 %.
- En el primer tiempo del compás 5 aparece el logo; la última toma se funde al color puro.
"""
import argparse, json, os, subprocess

W, H, FPS = 1080, 1920, 30
TOTAL = 10.0
INSERT_VOL = 0.5
BARS = 4  # compases de inserts antes del logo
TINT = "0x15372D"  # verde de la imagen de referencia
GRADE = ("colorbalance=rs=-0.08:gs=0.03:bs=0.01:rm=-0.06:gm=0.03:rh=-0.03:bh=-0.01,"
         "eq=saturation=0.85")
TINT_OPACITY = 0.5
COVER_AT = 6.0  # segundo del video usado como portada (toma 15, pared clara)
COVER_LOGO = (40, 420, 0.41)  # x, y, ancho relativo del logo negro sobre la pared

# Cada compás = 8 corcheas. (clip, segundo de entrada, corcheas, punch-in)
# Ritmo lento: solo negras (2 corcheas) y blancas (4). Cada clip se usa UNA sola vez,
# y se evitan tomas que se parecen entre sí (08≈07, 18≈17, 20≈10).
EDL = [
    # 1 · apertura: el público mirando la pantalla (primer cuadro = portada en IG, con luz)
    ("06", 2.0, 4, 0), ("07", 3.0, 4, 0),
    # 2
    ("05", 4.0, 2, 0), ("13", 3.5, 2, 0), ("09", 3.5, 4, 0),
    # 3
    ("16", 2.0, 2, 0), ("19", 2.0, 2, 0), ("15", 3.0, 4, 0),
    # 4 · cierre hacia el logo
    ("17", 2.0, 2, 0), ("01", 3.5, 2, 0), ("21", 5.0, 4, 0),
]
# Clips oscuros / pixelados (luma media < 75): más contraste y reducción de ruido suave.
ENHANCE = {"07", "05", "13", "17", "21", "03", "04"}
ENHANCE_FX = "hqdn3d=3:3:4:4,eq=contrast=1.28:brightness=0.03:gamma=1.08"
assert sum(e[2] for e in EDL) == BARS * 8, "el EDL debe sumar BARS compases"
assert len({e[0] for e in EDL}) == len(EDL), "cada clip se usa una sola vez"


def downbeat_near(r, t):
    """Primer tiempo de compás más cercano a t (fase de compás con más ataques)."""
    beats, env, fps = r["beats"], r["onset"], r["fps"]
    at = lambda x: env[min(int(round(x * fps)), len(env) - 1)]
    phase = max(range(4), key=lambda k: sum(at(b) for b in beats[k::4]))
    downs = beats[phase::4]
    return min(downs, key=lambda d: abs(d - t))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--music", required=True)
    ap.add_argument("--ritmo", required=True)
    ap.add_argument("--music-at", type=float, default=137.5)
    ap.add_argument("--logo")
    a = ap.parse_args()

    r = json.load(open(a.ritmo))
    eighth = 30.0 / r["bpm"]
    m0 = downbeat_near(r, a.music_at)

    # tiempos de corte sobre la grilla -> frames (el redondeo no se acumula)
    cuts, acc = [0], 0
    for _, _, n, _ in EDL:
        acc += n
        cuts.append(round(acc * eighth * FPS))
    logo_f = cuts[-1]
    logo_t = logo_f / FPS

    inputs, filt, labels = [], [], []

    def graded(i, name, nf, punch=0):
        z = 1.18 if punch else 1.0
        sw, sh = int(W * z) // 2 * 2, int(H * z) // 2 * 2
        filt.append(f"[{i}:v:0]scale={sw}:{sh}:force_original_aspect_ratio=increase,crop={W}:{H},"
                    f"setsar=1,fps={FPS},trim=end_frame={nf},setpts=PTS-STARTPTS,"
                    f"{ENHANCE_FX + ',' if name in ENHANCE else ''}{GRADE},format=gbrp[g{i}]")
        filt.append(f"color={TINT}:s={W}x{H}:r={FPS},format=gbrp[c{i}]")
        filt.append(f"[g{i}][c{i}]blend=all_mode=screen:all_opacity={TINT_OPACITY}:shortest=1[t{i}]")

    def insert_audio(i, d, fade_out=0.008):
        filt.append(f"[{i}:a:0]aresample=48000,aformat=channel_layouts=stereo,atrim=duration={d:.4f},"
                    f"asetpts=PTS-STARTPTS,afade=in:d=0.008,afade=out:st={d - fade_out:.4f}:d={fade_out},"
                    f"volume={INSERT_VOL}[a{i}]")

    for i, ((name, start, _, punch), f0, f1) in enumerate(zip(EDL, cuts, cuts[1:])):
        nf = f1 - f0; d = nf / FPS
        inputs += ["-ss", f"{start:.3f}", "-t", f"{d + 0.2:.3f}", "-i", os.path.join(a.clips, name + ".mp4")]
        graded(i, name, nf, punch)
        filt.append(f"[t{i}]format=yuv420p[v{i}]")
        insert_audio(i, d)
        labels.append(f"[v{i}][a{i}]")
    n = len(EDL)

    # placa final: la última toma sigue (cuadros nuevos, sin repetir) y se funde
    # progresivamente al color puro de referencia; el logo aparece encima.
    end_d = TOTAL - logo_t
    end_nf = round(end_d * FPS)
    last, lstart, ln, _ = EDL[-1]
    idx = n
    inputs += ["-ss", f"{lstart + ln * eighth:.3f}", "-t", f"{end_d + 0.2:.3f}",
               "-i", os.path.join(a.clips, last + ".mp4")]
    graded(idx, last, end_nf)
    ramp = end_d - 0.35  # al final quedan ~0,35 s de color puro
    filt.append(f"color={TINT}:s={W}x{H}:r={FPS},format=gbrp[pure]")
    filt.append(f"[t{idx}][pure]blend=all_expr='A*(1-min(T/{ramp:.3f},1))+B*min(T/{ramp:.3f},1)'"
                f":shortest=1[bg]")
    insert_audio(idx, end_d, fade_out=min(1.0, end_d))
    labels.append(f"[end][a{idx}]")
    idx += 1
    if a.logo:
        inputs += ["-loop", "1", "-t", f"{end_d:.4f}", "-i", a.logo]
        filt.append(f"[{idx}:v]format=rgba,scale={int(W * 0.75)}:-1,fade=in:st=0:d={2 * eighth:.3f}:alpha=1[lg]")
        filt.append("[bg][lg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[end]")
        idx += 1
    else:
        filt.append("[bg]format=yuv420p[end]")
    filt.append("".join(labels) + f"concat=n={n + 1}:v=1:a=1[vc][ac]")
    filt.append(f"[vc]trim=duration={TOTAL}[vout]")
    filt.append(f"[ac]apad,atrim=duration={TOTAL}[ins]")

    # música: desde un downbeat del medio del tema, fade-in 1 s y fade-out durante el logo
    inputs += ["-ss", f"{m0:.4f}", "-t", f"{TOTAL}", "-i", a.music]
    filt.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,"
                f"afade=in:d=0.5,afade=out:st={logo_t + 0.2:.3f}:d={TOTAL - logo_t - 0.2:.3f}[mus]")
    filt.append("[mus][ins]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[aout]")

    cmd = ["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filt),
           "-map", "[vout]", "-map", "[aout]", "-t", f"{TOTAL}",
           "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", a.out]
    subprocess.run(cmd, check=True)
    # portada para Instagram (subir como "Portada" del Reel)
    cover = os.path.splitext(a.out)[0] + "_portada.jpg"
    # con el logo en negro sobre la pared clara, dentro del recorte 3:4 de la grilla de IG
    cv = ["ffmpeg", "-y", "-v", "error", "-ss", f"{COVER_AT}", "-i", a.out]
    if a.logo:
        cv += ["-i", a.logo, "-filter_complex",
               f"[1:v]format=rgba,colorchannelmixer=rr=0:gg=0:bb=0,scale={int(W * COVER_LOGO[2])}:-1[lk];"
               f"[0:v][lk]overlay={COVER_LOGO[0]}:{COVER_LOGO[1]}"]
    subprocess.run(cv + ["-frames:v", "1", "-q:v", "2", cover], check=True)
    print(f"BPM {r['bpm']:.2f} · corchea {eighth:.3f}s · música desde {m0:.2f}s · "
          f"{n} cortes · logo en {logo_t:.2f}s -> {a.out}")


if __name__ == "__main__":
    main()
