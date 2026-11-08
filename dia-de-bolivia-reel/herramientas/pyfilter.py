"""Filtro de video en Python: lee rgb24 de un archivo, aplica un look y escribe rgb24 a stdout.

uso: python pyfilter.py entrada.mkv LOOK [W H]
LOOK: A_natural | B_cine | C_flat | D_altiplano | FINISH (solo acabado cine: halación, viñeta, grano)
"""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import grade  # noqa: E402

src, look = sys.argv[1], sys.argv[2]
W, H = 1080, 1920


def finish(x, seed):
    x = grade.halation(x, strength=0.14)
    x = grade.vignette(x, 0.25)
    x = grade.grain(x, 0.02, seed)
    return np.clip(x, 0, 1)


fn = finish if look == "FINISH" else grade.LOOKS[look]
p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                     stdout=subprocess.PIPE)
out = sys.stdout.buffer
i = 0
while True:
    buf = p.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    x = np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.float32) / 255
    y = fn(x, seed=i)
    out.write((np.clip(y, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes())
    i += 1
