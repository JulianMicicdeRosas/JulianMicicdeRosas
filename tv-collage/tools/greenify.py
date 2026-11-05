"""Map every asset onto a Matrix green ramp. Reds are lifted so apples glow."""
import sys, os
import numpy as np
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
stops = np.array([[0, 6, 2], [0, 59, 0], [0, 143, 17], [0, 255, 65], [150, 255, 175]], float)
pos = np.array([0, .3, .55, .82, 1])
for f in sorted(os.listdir(src)):
    if not f.endswith(".jpg"):
        continue
    a = np.asarray(Image.open(os.path.join(src, f)).convert("RGB")).astype(float) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    y = .2126 * r + .7152 * g + .0722 * b
    red = np.clip(r - np.maximum(g, b), 0, 1)
    v = np.clip(.55 * y + 1.35 * red, 0, 1) ** 1.1
    out = np.stack([np.interp(v, pos, stops[:, c]) for c in range(3)], -1)
    Image.fromarray(out.astype(np.uint8)).save(os.path.join(dst, f), quality=88)
