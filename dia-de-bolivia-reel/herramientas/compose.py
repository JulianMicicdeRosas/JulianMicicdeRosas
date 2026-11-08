"""Compositor final del reel: carteles + montaje graduado + movimientos + transiciones + gráficos.

uso: python compose.py MONTAJE_GRADUADO.mkv SALIDA.mp4 [--finish] [--clean SALIDA_LIMPIA.mkv]
  --finish  agrega acabado de cine (halación, viñeta, grano) — para looks LUT
"""
import argparse
import math
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edl  # noqa: E402
import gfx  # noqa: E402
import grade  # noqa: E402

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H, FPS = 1080, 1920, 30
TOTAL = 60 * FPS

ap = argparse.ArgumentParser()
ap.add_argument("lut", help="HaldCLUT .png o 'none'")
ap.add_argument("out")
ap.add_argument("--finish", action="store_true")
ap.add_argument("--clean")
ap.add_argument("--start", type=float, default=0)
ap.add_argument("--end", type=float, default=60)
args = ap.parse_args()

shots = edl.shots_with_frames()
F_TITLE, F_END = edl.fr(edl.TITLE_END), edl.fr(edl.END_CARD)


def shot_at(f):
    for s in shots:
        if s["f0"] <= f < s["f1"]:
            return s
    return shots[-1]


def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


def zoom_for(s, f):
    k = f - s["f0"]
    p = k / max(1, s["n"] - 1)
    m = s["move"]
    if m == "push":
        return 1.0 + 0.05 * p
    if m == "pull":
        return 1.06 - 0.06 * p
    if m == "punch":
        return 1.0 + 0.10 * (1 - ease_out(k / 7)) + 0.02 * p
    return 1.0


def apply_zoom(img, z):
    if abs(z - 1) < 1e-3:
        return img
    M = np.float32([[z, 0, (1 - z) * W / 2], [0, z, (1 - z) * H / 2]])
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


_rng = np.random.default_rng(11)


def glitch(img, amt):
    """Glitch de marca: corrimiento RGB + franjas desplazadas (amt 0..1)."""
    if amt <= 0:
        return img
    out = img.copy()
    dx = int(28 * amt)
    out[..., 0] = np.roll(img[..., 0], dx, axis=1)
    out[..., 2] = np.roll(img[..., 2], -dx, axis=1)
    for _ in range(int(14 * amt)):
        y = int(_rng.integers(0, H - 40))
        h = int(_rng.integers(8, 90))
        sh = int(_rng.integers(-120, 120) * amt)
        out[y:y + h] = np.roll(out[y:y + h], sh, axis=1)
    return out


def flash_amt(t):
    for ft in edl.FLASH_AT:
        k = round((t - ft) * FPS)
        if 0 <= k < 5:
            return [0.85, 0.55, 0.3, 0.14, 0.05][k]
    return 0.0


def glitch_amt(f):
    for gt in edl.GLITCH_AT:
        k = f - edl.fr(gt)
        if -3 <= k < 0:
            return 0.35 + 0.2 * (3 + k)
        if 0 <= k < 4:
            return [1.0, 0.7, 0.4, 0.15][k]
    return 0.0


# marca de agua FLAT (precalculada)
_wm = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gfx.watermark(_wm)
_wm = np.asarray(_wm).astype(np.float32) / 255
WM_RGB, WM_A = _wm[..., :3], _wm[..., 3:4]


def over(base_u8, rgba_img):
    a = np.asarray(rgba_img).astype(np.float32) / 255
    al = a[..., 3:4]
    if al.max() == 0:
        return base_u8
    b = base_u8.astype(np.float32) / 255
    return ((b * (1 - al) + a[..., :3] * al) * 255 + 0.5).astype(np.uint8)


COLORS = {"salmon": gfx.SALMON, "lime": gfx.LIME, "coral": gfx.CORAL, "cyan": gfx.CYAN}


def overlays(t):
    act = [c for c in edl.CHIPS if c[0] <= t <= c[1]]
    if not act:
        return None
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for t0, t1, lines, col in act:
        gfx.lower_chip(im, t, t0, t1, lines, color=COLORS[col], y=1240)
    return im


def card_rgb(im):
    return np.asarray(im.convert("RGB"))


# ---------------------------------------------------------------- tuberías
def montage_frames():
    """Lee plano por plano (exactamente n cuadros cada uno) aplicando el LUT."""
    for s in shots:
        src = os.path.join(S, "shots", f'{s["idx"]:02d}.mkv')
        if args.lut.lower() == "none":
            cmd = ["ffmpeg", "-v", "error", "-i", src, "-vf", "format=rgb24"]
        else:
            cmd = ["ffmpeg", "-v", "error", "-i", src, "-i", args.lut, "-filter_complex",
                   "[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]haldclut,format=rgb24"]
        p = subprocess.Popen(cmd + ["-frames:v", str(s["n"]), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                             stdout=subprocess.PIPE)
        last = None
        for _ in range(s["n"]):
            buf = p.stdout.read(W * H * 3)
            if len(buf) == W * H * 3:
                last = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
            yield last
        p.stdout.close()
        p.wait()


mgen = montage_frames()
f_start, f_end = int(args.start * FPS), int(args.end * FPS)
a_start = f_start / FPS
enc = subprocess.Popen([
    "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
    "-ss", f"{a_start:.3f}", "-t", f"{(f_end - f_start) / FPS:.3f}", "-i", os.path.join(S, "music60.wav"),
    "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", args.out], stdin=subprocess.PIPE)
clean = None
if args.clean:
    clean = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                              "-r", str(FPS), "-i", "-", "-c:v", "libx264rgb", "-crf", "10", "-preset", "fast",
                              args.clean], stdin=subprocess.PIPE)

last_foot = None
for f in range(0, TOTAL):
    t = f / FPS
    need_montage = F_TITLE <= f < F_END
    frame_m = None
    if need_montage:
        frame_m = next(mgen)
    if f < f_start or f >= f_end:
        continue

    if f < F_TITLE:
        out = card_rgb(gfx.title_card(t))
        out = glitch(out, glitch_amt(f))
    elif f < F_END:
        s = shot_at(f)
        img = apply_zoom(frame_m, zoom_for(s, f))
        x = img.astype(np.float32) / 255
        if args.finish:
            x = grade.halation(x, strength=0.14)
            x = grade.vignette(x, 0.25)
            x = grade.grain(x, 0.02, seed=f)
        fl = flash_amt(t)
        if fl:
            x = x + fl * (1 - x)
        img = (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)
        if clean is not None:
            clean.stdin.write(img.tobytes())
        img = glitch(img, glitch_amt(f))
        # marca FLAT (entra después del cartel)
        wa = min(1.0, (t - edl.TITLE_END) / 0.4) * min(1.0, (edl.END_CARD - t) / 0.2)
        b = img.astype(np.float32) / 255
        b = b * (1 - WM_A * wa) + WM_RGB * WM_A * wa
        img = (b * 255 + 0.5).astype(np.uint8)
        ov = overlays(t)
        if ov is not None:
            img = over(img, ov)
        out = img
        last_foot = out
    else:
        out = card_rgb(gfx.end_card(t))
        g = glitch_amt(f)
        if g and last_foot is not None and f - F_END < 2:
            out = (0.5 * out + 0.5 * last_foot).astype(np.uint8)
        out = glitch(out, g)
    enc.stdin.write(np.ascontiguousarray(out).tobytes())
    if f % 150 == 0:
        print(f"frame {f}/{TOTAL}", flush=True)

enc.stdin.close()
enc.wait()
if clean is not None:
    clean.stdin.close()
    clean.wait()
print("listo", args.out)
