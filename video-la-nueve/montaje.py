#!/usr/bin/env python3
"""Montaje de 10 s "La Nueve - Lugares 3" (vertical 1080x1920), cortado a la grilla rítmica.

Uso:
  python3 ritmo.py musica.mp3 --json ritmo.json
  python3 montaje.py --clips DIR --music musica.mp3 --ritmo ritmo.json --logo logo.png \
                     --out salida.mp4 [--music-at 137.5]

- La música entra en un primer tiempo de compás del medio del tema (cerca de --music-at),
  con fade-in y fade-out.
- Los cortes caen sobre la grilla: compases (2,047 s a 117 BPM), negras y corcheas.
- Audio de los inserts al 50 %.
- El logo entra con corte seco en el primer tiempo del compás 5.
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

# Cada compás = 8 corcheas. (clip, segundo de entrada, corcheas, punch-in)
# Cada clip se usa UNA sola vez: ningún cuadro se repite.
EDL = [
    # 1 · apertura: la proyección, dos medias notas
    ("08", 4.0, 4, 0), ("07", 3.0, 4, 0),
    # 2 · negras + doble corchea
    ("06", 2.0, 2, 0), ("05", 4.0, 2, 0), ("03", 3.0, 2, 0), ("13", 3.5, 1, 1), ("09", 3.5, 1, 0),
    # 3 · negras + doble corchea
    ("10", 3.5, 2, 0), ("11", 2.5, 2, 0), ("16", 2.0, 1, 1), ("19", 2.0, 1, 0), ("15", 3.0, 2, 0),
    # 4 · ráfaga de corcheas con punch-in alternado, cierre en negra
    ("20", 3.0, 1, 1), ("17", 2.0, 1, 0), ("14", 1.2, 1, 1), ("01", 3.5, 1, 0),
    ("04", 8.0, 1, 1), ("18", 2.0, 1, 0), ("21", 5.0, 2, 0),
]
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
    for i, ((name, start, _, punch), f0, f1) in enumerate(zip(EDL, cuts, cuts[1:])):
        nf = f1 - f0; d = nf / FPS
        inputs += ["-ss", f"{start:.3f}", "-t", f"{d + 0.2:.3f}", "-i", os.path.join(a.clips, name + ".mp4")]
        z = 1.18 if punch else 1.0
        sw, sh = int(W * z) // 2 * 2, int(H * z) // 2 * 2
        filt.append(f"[{i}:v:0]scale={sw}:{sh}:force_original_aspect_ratio=increase,crop={W}:{H},"
                    f"setsar=1,fps={FPS},trim=end_frame={nf},setpts=PTS-STARTPTS,{GRADE},format=gbrp[g{i}]")
        filt.append(f"color={TINT}:s={W}x{H}:r={FPS},format=gbrp[c{i}]")
        filt.append(f"[g{i}][c{i}]blend=all_mode=screen:all_opacity={TINT_OPACITY}:shortest=1,"
                    f"format=yuv420p[v{i}]")
        filt.append(f"[{i}:a:0]aresample=48000,aformat=channel_layouts=stereo,atrim=duration={d:.4f},"
                    f"asetpts=PTS-STARTPTS,afade=in:d=0.008,afade=out:st={d - 0.008:.4f}:d=0.008,"
                    f"volume={INSERT_VOL}[a{i}]")
        labels.append(f"[v{i}][a{i}]")
    n = len(EDL)
    filt.append("".join(labels) + f"concat=n={n}:v=1:a=1[vc][ac]")

    # tarjeta final: corte seco al verde en el downbeat, logo aparece en una corchea
    end_d = TOTAL - logo_t
    filt.append(f"color={TINT}:s={W}x{H}:r={FPS}:d={end_d:.4f},format=yuv420p[bg]")
    idx = n
    if a.logo:
        inputs += ["-loop", "1", "-t", f"{end_d:.4f}", "-i", a.logo]
        filt.append(f"[{idx}:v]format=rgba,scale={int(W * 0.75)}:-1,fade=in:st=0:d={eighth:.3f}:alpha=1[lg]")
        filt.append("[bg][lg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[end]")
        idx += 1
    else:
        filt.append("[bg]null[end]")
    filt.append(f"[vc][end]concat=n=2:v=1:a=0,trim=duration={TOTAL},"
                f"fade=out:st={TOTAL - 0.4}:d=0.4[vout]")
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
    print(f"BPM {r['bpm']:.2f} · corchea {eighth:.3f}s · música desde {m0:.2f}s · "
          f"{n} cortes · logo en {logo_t:.2f}s -> {a.out}")


if __name__ == "__main__":
    main()
