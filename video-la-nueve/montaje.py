#!/usr/bin/env python3
"""Montaje de 20 s "La Nueve - Lugares 3" (vertical 1080x1920).

Uso:
  python3 montaje.py --clips DIR --out salida.mp4 [--music musica.mp3] [--music-start 0]
                     [--logo logo.png]

- Inserts (clips del álbum) con su audio al 50 %.
- Música de fondo opcional (fade-out al final).
- Cierre con el logo de La Nueve (PNG con transparencia) sobre negro.
"""
import argparse, os, subprocess, json

W, H, FPS = 1080, 1920, 30
TOTAL = 20.0
END_CARD = 3.0
INSERT_VOL = 0.5

# Orden narrativo: pantalla/proyección -> público -> cierre.
# (clip, segundo de inicio dentro del clip)
EDL = [
    ("08", 4.0), ("07", 3.0), ("06", 2.0), ("05", 4.0), ("03", 3.0),
    ("09", 3.5), ("10", 3.5), ("11", 2.5), ("13", 3.5), ("15", 3.0),
    ("16", 2.0), ("19", 2.0), ("20", 3.0), ("14", 1.2), ("17", 2.0),
    ("01", 3.5), ("04", 8.0), ("21", 5.0),
]


def dur(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                   "-of", "json", path])
    return float(json.loads(out)["format"]["duration"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--music")
    ap.add_argument("--music-start", type=float, default=0.0)
    ap.add_argument("--logo")
    a = ap.parse_args()

    seg = (TOTAL - END_CARD + 0.5) / len(EDL)  # 0.5 s se solapa con el fundido al logo
    inputs, filt, vlabels, alabels = [], [], [], []
    for i, (name, start) in enumerate(EDL):
        p = os.path.join(a.clips, name + ".mp4")
        start = min(start, max(0.0, dur(p) - seg - 0.1))
        inputs += ["-ss", f"{start:.3f}", "-t", f"{seg:.3f}", "-i", p]
        filt.append(f"[{i}:v:0]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
                    f"setsar=1,fps={FPS},format=yuv420p,trim=duration={seg:.3f},setpts=PTS-STARTPTS[v{i}]")
        filt.append(f"[{i}:a:0]aresample=48000,aformat=channel_layouts=stereo,"
                    f"atrim=duration={seg:.3f},asetpts=PTS-STARTPTS,volume={INSERT_VOL}[a{i}]")
        vlabels.append(f"[v{i}]"); alabels.append(f"[a{i}]")
    n = len(EDL)
    filt.append("".join(v + a_ for v, a_ in zip(vlabels, alabels)) + f"concat=n={n}:v=1:a=1[vc][ac]")
    clips_len = seg * n

    # Tarjeta final: negro + logo con fade-in
    idx = n
    filt.append(f"color=black:s={W}x{H}:r={FPS}:d={END_CARD + 0.5}[bg]")
    if a.logo:
        inputs += ["-loop", "1", "-t", f"{END_CARD + 0.5}", "-i", a.logo]
        filt.append(f"[{idx}:v]format=rgba,scale={int(W*0.75)}:-1,"
                    f"fade=in:st=0.6:d=0.8:alpha=1[lg]")
        filt.append("[bg][lg]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p[end]")
        idx += 1
    else:
        filt.append("[bg]format=yuv420p[end]")
    filt.append("[vc]settb=1/30[vcs]");filt.append("[end]settb=1/30[ends]");filt.append(f"[vcs][ends]xfade=transition=fade:duration=0.5:offset={clips_len - 0.5:.3f},"
                f"trim=duration={TOTAL},fade=out:st={TOTAL - 0.4}:d=0.4[vout]")
    filt.append(f"[ac]apad,atrim=duration={TOTAL},afade=out:st={clips_len - 0.6:.3f}:d=0.6[ins]")

    if a.music:
        inputs += ["-ss", f"{a.music_start}", "-t", f"{TOTAL}", "-i", a.music]
        filt.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,"
                    f"afade=in:d=0.3,afade=out:st={TOTAL - 2}:d=2[mus]")
        filt.append("[mus][ins]amix=inputs=2:normalize=0:duration=first[aout]")
    else:
        filt.append("[ins]anull[aout]")

    cmd = ["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filt),
           "-map", "[vout]", "-map", "[aout]", "-t", f"{TOTAL}",
           "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", a.out]
    subprocess.run(cmd, check=True)
    print("OK ->", a.out)


if __name__ == "__main__":
    main()
