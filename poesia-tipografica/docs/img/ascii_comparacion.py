import numpy as np
from PIL import Image, ImageDraw, ImageFont
GW, GH = 120, 40           # la grilla de tonos del programa (celdas 1 x 2)
CW, CH = 11, 22
F  = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 18)
FB = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', 18)
FRASE = 'LA CASA RESPIRA BAJO EL AGUA Y LA LUNA GUARDA LA MEMORIA DEL PATIO EN SUS RAICES '
# imagen de prueba con volumen: luna sombreada, montañas y reflejo
y, x = np.mgrid[0:GH, 0:GW].astype(float)
X, Y = x / GW * 3.0, y / GH             # proporción 3:1
t = np.zeros((GH, GW))
cx, cy, r = 1.05, 0.36, 0.27
d = np.hypot(X - cx, Y - cy)
nz = np.sqrt(np.clip(1 - (d / r) ** 2, 0, 1))
lam = np.clip(0.25 + 0.75 * (((X - cx) / r) * -0.55 + ((Y - cy) / r) * -0.45 + nz * 0.7), 0, 1)
t = np.where(d < r, lam, t)
for (a, b, rr) in [(0.95, 0.30, 0.05), (1.14, 0.44, 0.07), (1.02, 0.50, 0.035)]:
    t = np.where((np.hypot(X - a, Y - b) < rr) & (d < r), t * 0.55, t)
m1 = 0.70 - 0.20 * np.abs(np.sin(X * 2.3 + 0.4)) - 0.06 * np.sin(X * 9)
m2 = 0.76 - 0.12 * np.abs(np.sin(X * 3.7 + 1.9))
t = np.where((Y > m2) & (Y < 0.80), 0.42, t)
t = np.where((Y > m1) & (Y < 0.80), 0.68 - (Y - m1) * 1.2, t)
ref = (np.abs(X - cx) < 0.20 * (1 - (Y - 0.8) * 2)) & (Y > 0.82) & (np.sin(Y * 150) > -0.2)
t = np.where(ref, 0.75 - (Y - 0.82) * 2.2, t)
t = np.clip(t, 0, 1)
def ink(ch, font):
    im = Image.new('L', (CW, CH), 0); ImageDraw.Draw(im).text((0, 0), ch, 255, font=font); return np.asarray(im).mean() / 255
def panel(title, fn):
    im = Image.new('RGB', (GW * CW, GH * CH + 34), (0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.text((6, 6), title, (255, 152, 152), font=FB)
    k = 0
    for r_ in range(GH):
        for c in range(GW):
            ch, font, a = fn(r_, c, t[r_, c], k); k += 1
            if ch and a > 0.02: dr.text((c * CW, 34 + r_ * CH), ch, (int(244 * a), int(241 * a), int(234 * a)), font=font)
    return im
# 1) hoy: el texto corre en orden y cada letra se enciende según el tono
hoy = lambda r_, c, v, k: (FRASE[k % len(FRASE)], F, 0.22 + 0.78 * v if v > 0.1 else 0.0)
# 2) rampa de densidad con las letras de la frase + signos (ASCII clásico)
chars = sorted(set(FRASE.replace(' ', '') + '.,:;!*+=%$&08#@'), key=lambda ch: ink(ch, F))
rampa = lambda r_, c, v, k: (chars[min(len(chars) - 1, int(v * len(chars)))] if v > 0.06 else '', F, 1.0)
# 3) híbrido legible: el texto sigue en orden (se leen las palabras); el tono elige minúscula / mayúscula / negrita y el brillo
def hibrido(r_, c, v, k):
    ch = FRASE[k % len(FRASE)]
    if v < 0.08 or ch == ' ': return ('', F, 0)
    if v < 0.35: return (ch.lower() if v > 0.2 else '·', F, 0.45 + v)
    if v < 0.65: return (ch, F, 0.55 + 0.5 * v)
    return (ch, FB, 1.0)
# 4) estructura: en los bordes, el signo sigue la dirección del contorno; adentro, rampa
gy, gx = np.gradient(t); gx = gx * 2  # celdas 1 x 2
def estructura(r_, c, v, k):
    g = np.hypot(gx[r_, c], gy[r_, c])
    if g > 0.16:
        ang = (np.degrees(np.arctan2(gy[r_, c], gx[r_, c])) + 180) % 180   # dirección del gradiente; el borde es perpendicular
        return ('|' if ang < 22 or ang > 158 else '/' if ang < 68 else '_' if ang < 112 else '\\', FB, 1.0)
    return rampa(r_, c, v, k)[0], F, 0.75
ps = [panel('1 · HOY: el texto corre y cada letra se enciende segun el tono', hoy),
      panel('2 · RAMPA: la letra se elige por su tinta (letras de la frase + signos)', rampa),
      panel('3 · HIBRIDO LEGIBLE: el texto sigue en orden; el tono elige punto / minuscula / mayuscula / negrita', hibrido),
      panel('4 · ESTRUCTURA: los bordes con / \\ | _ segun su direccion; adentro, rampa', estructura)]
W, H = ps[0].size
out = Image.new('RGB', (W * 2 + 12, H * 2 + 12), (20, 20, 20))
for i, p in enumerate(ps): out.paste(p, ((i % 2) * (W + 12), (i // 2) * (H + 12)))
out.save('ascii_comparacion.png'); print(out.size)
