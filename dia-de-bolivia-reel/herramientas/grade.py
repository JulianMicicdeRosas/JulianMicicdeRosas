"""Looks de colorimetría (sobre la base Rec.709 ya tonemapeada desde HLG).

Cada look recibe RGB float32 [0,1] (H, W, 3) y devuelve lo mismo.
"""
import cv2
import numpy as np

LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def luma(x):
    return x @ LUMA


def curve(x, pts):
    """Curva 1D por puntos de control (aplicada a los 3 canales o por canal)."""
    xs, ys = zip(*pts)
    lut = np.interp(np.linspace(0, 1, 1024), xs, ys).astype(np.float32)
    idx = np.clip(x * 1023, 0, 1023).astype(np.int32)
    return lut[idx]


def sat(x, s, protect_skin=0.0):
    L = luma(x)[..., None]
    if protect_skin:
        hsv = cv2.cvtColor(np.clip(x, 0, 1), cv2.COLOR_RGB2HSV)
        h = hsv[..., 0]  # 0..360
        skin = np.exp(-((h - 25) / 18) ** 2) * np.clip(hsv[..., 1] * 3, 0, 1)
        s = s + (1 - s) * protect_skin * skin[..., None]
    return L + (x - L) * s


def split_tone(x, shadow, highlight, amount=1.0):
    L = luma(x)[..., None]
    ws = (1 - L) ** 2
    wh = L ** 2
    return x + amount * (ws * np.array(shadow, np.float32) + wh * np.array(highlight, np.float32))


def hue_sat(x, centers):
    """Saturación/desplazamiento selectivo por tono: centers=[(hue_deg, width, sat_mult, hue_shift)]."""
    hsv = cv2.cvtColor(np.clip(x, 0, 1), cv2.COLOR_RGB2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    smul = np.ones_like(s)
    hsh = np.zeros_like(h)
    for c, w, m, sh in centers:
        d = np.minimum(np.abs(h - c), 360 - np.abs(h - c))
        wgt = np.exp(-(d / w) ** 2)
        smul *= 1 + (m - 1) * wgt
        hsh += sh * wgt
    hsv[..., 0] = (h + hsh) % 360
    hsv[..., 1] = np.clip(s * smul, 0, 1)
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)


def halation(x, thr=0.78, strength=0.22, tint=(1.0, 0.45, 0.25)):
    L = luma(x)
    m = np.clip((L - thr) / (1 - thr), 0, 1)
    small = cv2.resize(m, (x.shape[1] // 8, x.shape[0] // 8), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), 6)
    glow = cv2.resize(small, (x.shape[1], x.shape[0]), interpolation=cv2.INTER_LINEAR)
    return x + strength * glow[..., None] * np.array(tint, np.float32)


_VIG = {}


def vignette(x, amount=0.25):
    key = x.shape[:2]
    if key not in _VIG:
        h, w = key
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / 1.414
        _VIG[key] = np.clip(1 - r ** 2.2, 0, 1)[..., None]
    v = _VIG[key]
    return x * (1 - amount + amount * v)


def grain(x, amount=0.025, seed=None, size=1.6):
    rng = np.random.default_rng(seed)
    h, w = x.shape[:2]
    n = rng.standard_normal((int(h / size), int(w / size))).astype(np.float32)
    n = cv2.resize(n, (w, h), interpolation=cv2.INTER_LINEAR)
    L = luma(x)[..., None]
    mid = 4 * L * (1 - L)  # el grano vive en los medios tonos
    return x + amount * n[..., None] * (0.35 + 0.65 * mid)


# ------------------------------------------------------------------ looks
def look_natural(x, seed=None):
    """A · Documental limpio: contraste suave, blancos limpios."""
    x = curve(x, [(0, 0.0), (0.18, 0.15), (0.5, 0.5), (0.85, 0.88), (1, 1.0)])
    x = sat(x, 1.06)
    return np.clip(x, 0, 1)


def look_cine(x, seed=None):
    """B · Cine cálido 35 mm: piel dorada, sombras verde-azuladas, negros con cuerpo, halación y grano."""
    x = curve(x, [(0, 0.03), (0.12, 0.08), (0.45, 0.44), (0.8, 0.83), (1, 0.96)])
    x = split_tone(x, (-0.045, 0.015, 0.06), (0.06, 0.02, -0.05))
    x = sat(x, 0.9, protect_skin=0.6)
    x = hue_sat(x, [(210, 30, 0.85, -6), (120, 40, 0.8, -10)])
    x = halation(x, strength=0.16)
    x = vignette(x, 0.28)
    x = grain(x, 0.022, seed)
    return np.clip(x, 0, 1)


def look_flat(x, seed=None):
    """C · FLAT gráfico: negros profundos, contraste alto, rojos→coral, verdes→lima, sombras lavanda."""
    x = curve(x, [(0, 0.0), (0.12, 0.02), (0.3, 0.18), (0.6, 0.66), (0.88, 0.96), (1, 1.0)])
    x = split_tone(x, (0.02, 0.0, 0.08), (0.03, 0.02, -0.03))
    x = hue_sat(x, [(355, 20, 1.2, 6), (95, 35, 1.5, -14), (240, 30, 1.3, 10), (285, 25, 1.25, 0)])
    x = sat(x, 1.22, protect_skin=0.45)
    x = vignette(x, 0.18)
    x = grain(x, 0.014, seed, size=1.2)
    return np.clip(x, 0, 1)


def look_altiplano(x, seed=None):
    """D · Altiplano mate: bleach-bypass suave, ocres, negros levantados, los textiles rojos sostienen el color."""
    L = luma(x)[..., None]
    x = x * 0.6 + 0.4 * (x * 0.5 + curve(L, [(0, 0), (0.3, 0.2), (0.7, 0.8), (1, 1)]) * 0.5)
    x = curve(x, [(0, 0.06), (0.2, 0.17), (0.5, 0.49), (0.85, 0.84), (1, 0.94)])
    x = split_tone(x, (0.01, 0.01, 0.0), (0.045, 0.025, -0.03))
    x = sat(x, 0.68, protect_skin=0.3)
    x = hue_sat(x, [(355, 22, 1.45, 0), (45, 20, 1.15, 0)])
    x = vignette(x, 0.3)
    x = grain(x, 0.03, seed, size=2.0)
    return np.clip(x, 0, 1)


LOOKS = {
    "A_natural": look_natural,
    "B_cine": look_cine,
    "C_flat": look_flat,
    "D_altiplano": look_altiplano,
}

TONEMAP_VF = ("zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,"
              "tonemap=mobius:param=0.3:desat=0,zscale=t=bt709:m=bt709:r=pc,format=rgb24")
