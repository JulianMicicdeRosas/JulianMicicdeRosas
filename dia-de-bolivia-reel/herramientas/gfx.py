"""Gráficos de marca FLAT para el reel Día de Bolivia (1080x1920).

Paleta y tipografías tomadas de las placas de Adobe Express (Semana 4 · Día de Bolivia):
negro, grilla punteada, bloques F L A T (lima, gris, lavanda, coral), Geist Mono + Roboto.
"""
import math
import os
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, "assets")
F = os.path.join(ROOT, "fonts")

LIME = (168, 255, 0)
GRAY = (188, 188, 188)
LAV = (136, 137, 255)
CORAL = (255, 129, 133)
SALMON = (255, 152, 152)
CYAN = (121, 207, 222)
INK = (0, 0, 0)
TXT = (230, 230, 230)


def font(name, size):
    return _font(name, int(round(size)))


@lru_cache(maxsize=64)
def _font(name, size):
    path = {
        "mono800": "geist-mono-latin-800-normal.ttf",
        "mono700": "geist-mono-latin-700-normal.ttf",
        "mono500": "geist-mono-latin-500-normal.ttf",
        "mono400": "geist-mono-latin-400-normal.ttf",
        "mono300": "geist-mono-latin-300-normal.ttf",
        "rob700": "roboto-latin-700-normal.ttf",
        "rob500": "roboto-latin-500-normal.ttf",
        "rob400": "roboto-latin-400-normal.ttf",
    }[name]
    return ImageFont.truetype(os.path.join(F, path), size)


@lru_cache(maxsize=32)
def asset(name):
    return Image.open(os.path.join(A, name)).convert("RGBA")


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_back(x, s=1.9):
    x = clamp(x)
    x -= 1
    return x * x * ((s + 1) * x + s) + 1


def text_w(txt, fnt, tracking=0):
    if not txt:
        return 0
    return sum(fnt.getlength(c) for c in txt) + tracking * (len(txt) - 1)


def draw_tracked(d, xy, txt, fnt, fill, tracking=0):
    x, y = xy
    for c in txt:
        d.text((x, y), c, font=fnt, fill=fill)
        x += fnt.getlength(c) + tracking


def paste_scaled(canvas, im, cx, cy, scale, alpha=1.0):
    if scale <= 0.01 or alpha <= 0.01:
        return
    w, h = im.size
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    im2 = im.resize((nw, nh), Image.LANCZOS)
    if alpha < 1:
        a = im2.getchannel("A").point(lambda v: int(v * alpha))
        im2.putalpha(a)
    canvas.alpha_composite(im2, (int(cx - nw / 2), int(cy - nh / 2)))


def fit(im, maxw, maxh):
    s = min(maxw / im.width, maxh / im.height)
    return im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)


# ---------------------------------------------------------------- fondo
_rng = np.random.default_rng(7)
_PART = _rng.random((900, 3))  # x, y, brillo


def background(t, particles=True):
    """Negro + grilla punteada de las placas + partículas que derivan."""
    bg = asset("bg_grid_story.png").copy()
    if particles:
        d = ImageDraw.Draw(bg)
        for x, y, b in _PART:
            px = (x * W + 18 * t * (0.5 + b)) % W
            py = (y * H - 30 * t * b) % H
            # densidad mayor arriba a la derecha, como en la placa
            dens = 0.25 + 0.75 * math.exp(-(((px - 800) / 420) ** 2 + ((py - 250) / 500) ** 2))
            if b > dens:
                continue
            v = int(140 + 115 * b)
            r = 1 if b < 0.6 else 2
            d.rectangle([px, py, px + r, py + r], fill=(v, v, v, 255))
    return bg


# ---------------------------------------------------------------- logo FLAT
LETTERS = [("F", LIME), ("L", GRAY), ("A", LAV), ("T", CORAL)]


def flat_blocks(canvas, x, y, size, appear, t, glitch=True):
    """Dibuja los 4 bloques; appear = tiempos de entrada de cada letra."""
    src = asset("flat_blocks.png")  # 1620x405 recorte vectorial del Express
    bw = src.width // 4
    for i, ta in enumerate(appear):
        p = (t - ta) / 0.22
        if p <= 0:
            continue
        blk = src.crop((i * bw, 0, (i + 1) * bw, src.height)).resize((size, size), Image.LANCZOS)
        s = ease_back(p) if p < 1 else 1.0
        cx = x + i * size + size / 2
        cy = y + size / 2
        if glitch and 0 < p < 0.55:
            # corrimiento de franjas tipo glitch durante la entrada
            off = int((1 - p / 0.55) * 26 * (1 if i % 2 else -1))
            arr = np.array(blk)
            for k in range(0, size, max(6, size // 9)):
                if (k // 7 + i) % 3 == 0:
                    arr[k:k + size // 12] = np.roll(arr[k:k + size // 12], off, axis=1)
            blk = Image.fromarray(arr)
        paste_scaled(canvas, blk, cx, cy, s)


def tagline(canvas, x, y, width, t0, t, speed=40):
    """'FESTIVAL LATINOAMERICANO / DE ARTE & TECNOLOGÍA' tipeado."""
    if t < t0:
        return
    im = asset("flat_tagline.png")
    im = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
    frac = clamp((t - t0) * speed / 24)  # 24 caracteres por renglón aprox.
    w = int(width * frac)
    if w <= 0:
        return
    canvas.alpha_composite(im.crop((0, 0, w, im.height)), (x, y))


def chip(canvas, x, y, txt, fnt, fg, bg, pad=(22, 14), tracking=2, reveal=1.0, square=None):
    """Etiqueta de bloque sólido (estilo '18 H · SALA INMERSIVA')."""
    tw = text_w(txt, fnt, tracking)
    asc, desc = fnt.getmetrics()
    th = asc + desc
    sq = th + 2 * pad[1] if square else 0
    bw = int((tw + 2 * pad[0] + sq) * ease_out(reveal))
    if bw <= 2:
        return
    layer = Image.new("RGBA", (int(tw + 2 * pad[0] + sq), th + 2 * pad[1]), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rectangle([0, 0, layer.width, layer.height], fill=bg + (255,))
    if square:
        d.rectangle([0, 0, sq, layer.height], fill=square + (255,))
    nchar = int(len(txt) * clamp(reveal * 1.4 - 0.2))
    draw_tracked(d, (sq + pad[0], pad[1] - 1), txt[:nchar], fnt, fg + (255,), tracking)
    canvas.alpha_composite(layer.crop((0, 0, bw, layer.height)), (int(x), int(y)))


# ---------------------------------------------------------------- cartel de apertura
TITLE_BEATS = [0.08, 0.77, 1.49, 2.16, 2.77, 3.38, 3.99, 4.54]


def title_card(t):
    """Cartel 'Día de Bolivia' · FLAT · Embajada de Bolivia (0 → 4.54 s)."""
    b = TITLE_BEATS
    c = background(t)
    # entrada del fondo
    if t < 0.25:
        fade = Image.new("RGBA", (W, H), (0, 0, 0, int(255 * (1 - t / 0.25))))
        c.alpha_composite(fade)
    size = 190
    x0 = (W - 4 * size) // 2
    y0 = 500
    flat_blocks(c, x0, y0, size, b[:4], t)
    tagline(c, x0, y0 + size + 34, 4 * size, b[3], t, speed=46)

    # bloque salmón con el título, como en la placa
    d = ImageDraw.Draw(c)
    by = y0 + size + 34 + 92 + 70
    bh = 360
    p = (t - b[4]) / 0.2
    if p > 0:
        bw = int(4 * size * ease_out(p))
        d.rectangle([x0, by, x0 + bw, by + bh], fill=SALMON + (255,))
        f = font("mono800", 132)
        full = ["Día de", "Bolivia"]
        n = int(clamp((t - b[4] - 0.08) / 0.5) * 13)  # tipeo
        shown = []
        left = n
        for line in full:
            shown.append(line[:max(0, left)])
            left -= len(line)
        for i, line in enumerate(shown):
            d.text((x0 + 44, by + 38 + i * 150), line, font=f, fill=INK)
        if n < 13 and int(t * 8) % 2 == 0:  # cursor de bloque
            li = 0 if n <= 6 else 1
            cx = x0 + 44 + f.getlength(shown[li])
            d.rectangle([cx + 6, by + 60 + li * 150, cx + 70, by + 170 + li * 150], fill=INK)

    # Embajada de Bolivia
    ey = by + bh + 90
    p2 = (t - b[5]) / 0.3
    if p2 > 0:
        a = ease_out(p2)
        seal = fit(asset("bolivia_seal.png"), 150, 150)
        seal_l = Image.new("RGBA", seal.size, (0, 0, 0, 0))
        seal_l.alpha_composite(seal)
        if a < 1:
            seal_l.putalpha(seal_l.getchannel("A").point(lambda v: int(v * a)))
        c.alpha_composite(seal_l, (x0, int(ey + (1 - a) * 40)))
        fe = font("rob700", 50)
        txt = "EMBAJADA"
        txt2 = "DE BOLIVIA"
        tx = x0 + 150 + 36
        n = int(clamp(p2 * 1.3) * (len(txt) + len(txt2)))
        draw_tracked(d, (tx, ey + 14 + (1 - a) * 40), txt[:n], fe, TXT, 9)
        draw_tracked(d, (tx, ey + 78 + (1 - a) * 40), txt2[:max(0, n - len(txt))], fe, TXT, 9)
    # dato inferior
    p3 = (t - b[6]) / 0.35
    if p3 > 0:
        chip(c, x0, ey + 210, "SÁB 07/11 · 18 H · SALA INMERSIVA · MMAMM",
             font("rob700", 25), INK, LIME, pad=(18, 12), tracking=3, reveal=p3)
    return c


# ---------------------------------------------------------------- cartel de cierre
END_T0 = 55.62


def end_card(t):
    """Cierre: FLAT + Día de Bolivia + logos (organiza / acompaña)."""
    lt = t - END_T0
    c = background(t)
    size = 175
    x0 = (W - 4 * size) // 2
    y0 = 300
    flat_blocks(c, x0, y0, size, [0.0, 0.09, 0.18, 0.27], lt)
    tagline(c, x0, y0 + size + 30, 4 * size, 0.3, lt, speed=70)
    d = ImageDraw.Draw(c)
    by = y0 + size + 30 + 84 + 46
    p = (lt - 0.42) / 0.2
    if p > 0:
        bw = int(4 * size * ease_out(p))
        d.rectangle([x0, by, x0 + bw, by + 130], fill=SALMON + (255,))
        f = font("mono800", 66)
        n = int(clamp((lt - 0.45) / 0.35) * 14)
        d.text((x0 + 34, by + 26), "Día de Bolivia"[:n], font=f, fill=INK)
    if lt > 0.67:
        chip(c, x0, by + 160, "SÁB 07/11 · SALA INMERSIVA · MMAMM", font("rob700", 26),
             TXT, INK, pad=(0, 6), tracking=3, reveal=(lt - 0.67) / 0.4)

    # organiza
    ly = by + 300
    lab = font("rob500", 26)
    if lt > 0.67:
        a = ease_out((lt - 0.67) / 0.3)
        lw = text_w("ORGANIZA", lab, 6)
        draw_tracked(d, ((W - lw) / 2, ly), "ORGANIZA", lab, (150, 150, 150, int(255 * a)), 6)
    orgs = ["org_01.png", "org_02.png", "org_03.png", "org_04.png"]
    boxes = [(170, 150), (200, 110), (250, 80), (210, 90)]
    total = sum(bx for bx, _ in boxes) + 3 * 36
    x = (W - total) / 2
    for i, (o, (bx, bh)) in enumerate(zip(orgs, boxes)):
        pa = (lt - (0.67 + 0.1 * i)) / 0.25
        im = fit(asset(o), bx, bh)
        if pa > 0:
            paste_scaled(c, im, x + bx / 2, ly + 120, 0.85 + 0.15 * ease_back(pa), clamp(pa))
        x += bx + 36
    # acompaña
    ay = ly + 280
    if lt > 1.27:
        a = ease_out((lt - 1.27) / 0.3)
        lw = text_w("ACOMPAÑA", lab, 6)
        draw_tracked(d, ((W - lw) / 2, ay), "ACOMPAÑA", lab, (150, 150, 150, int(255 * a)), 6)
        im = fit(asset("bolivia_logo.png"), 600, 250)
        paste_scaled(c, im, W / 2, ay + 175, 0.9 + 0.1 * ease_back(a), a)
    return c


# ---------------------------------------------------------------- overlays del montaje
def watermark(canvas, alpha=1.0):
    """Bloques FLAT chicos arriba a la izquierda (como el header de las placas)."""
    src = asset("flat_blocks.png")
    s = 46
    im = src.resize((4 * s, s), Image.LANCZOS)
    if alpha < 1:
        im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
    canvas.alpha_composite(im, (64, 210))


def lower_chip(canvas, t, t0, t1, lines, color=SALMON, y=1290):
    """Etiqueta en dos niveles: bloque de color + bajada negra, entra y sale tipeando."""
    if t < t0 or t > t1:
        return
    rin = (t - t0) / 0.45
    rout = (t1 - t) / 0.25
    r = min(rin, rout, 1.0)
    chip(canvas, 64, y, lines[0], font("mono800", 50), INK, color, pad=(22, 12), tracking=0, reveal=r)
    if len(lines) > 1:
        chip(canvas, 64, y + 92, lines[1], font("rob700", 26), TXT, INK, pad=(22, 12), tracking=3,
             reveal=min((t - t0 - 0.15) / 0.45, rout, 1.0))
