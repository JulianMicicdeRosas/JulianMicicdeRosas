"""Generates the tv-collage HyperFrames project (index.html + compositions/*.html).

Authoring-time generator: the output is plain static HTML; every tile is written
into the markup with a stable id, and all motion is a function of timeline time.
"""
import os, random, sys

OUT = sys.argv[1]
W, H = 1080, 1920
FPS = 30
os.makedirs(f"{OUT}/compositions", exist_ok=True)

# Shot boundaries measured with `hyperframes measure cuts` (frame / 30, floored).
CUTS = [0, 62, 93, 123, 182, 213, 244, 273, 305, 330, 360, 391, 443, 452, 494]
def t(f):  # frame -> seconds, floored to 6 decimals
    return int(f / FPS * 1e6) / 1e6
TOTAL = t(CUTS[-1])

# Matrix palette: everything lives on one green ramp.
GREEN = {"black": "#010802", "deep": "#003b00", "mid": "#008f11", "neon": "#00ff41", "pale": "#96ffaf"}
FILLS = {
    "white": "linear-gradient(170deg, #5dff86 0%, #00c932 55%, #00701a 100%)",
    "blue": "linear-gradient(180deg, #003b00 0%, #00a828 45%, #3dff74 62%, #002a06 100%)",
    "red": "linear-gradient(170deg, #96ffaf 0%, #00ff41 60%, #00a82a 100%)",
    "dark": "linear-gradient(170deg, #0d3315 0%, #010802 100%)",
    "beige": "#0a4a18",
}
BG = {"#0c0907": "#010802", "#090706": "#010802", "#0a0605": "#010802", "#e6dcc8": "#062b0e",
      "#1a1410": "#010802", "#d23a1c": "#00ff41", "#120d0a": "#010802"}

# Every eye is drawn as ASCII by HyperFrames' "ascii" media treatment (green glyphs).
EYES = {"eye-apple", "eye-small", "eye1", "eye2", "eye3", "eye4", "eye5", "eye6", "eye7", "eye8",
        "eye9", "eye-green", "eye-green2", "eye-big", "eye-tear", "eye-pupil", "eye-cherry", "red-eye"}
import json as _json
def ascii_grading(size):
    return _json.dumps({"effects": {"ascii": 1, "asciiSize": size, "asciiInvert": 0, "asciiStyle": 0,
                                    "asciiColor": 0, "asciiRotation": 0},
                        "palette": ["#010802", "#00ff41"]}).replace('"', "&quot;")
ASCII_SIZE = 0.1

CSS = """
    #{s} {{ position: absolute; inset: 0; overflow: hidden; background: {bg}; }}
    #{s} .cam {{ position: absolute; inset: 0; transform-origin: {origin}; }}
    #{s} .tv {{ position: absolute; background: linear-gradient(160deg, #0f2a15, #020803);
      border-radius: 9% / 12%; padding: {pad}px; box-shadow: 0 8px 22px rgba(0,0,0,.65); }}
    #{s} .tv.flat {{ background: none; padding: 0; box-shadow: none; border-radius: 0; }}
    #{s} .scr {{ position: relative; width: 100%; height: 100%; overflow: hidden;
      border-radius: 14% / 18%; background: #021006; }}
    #{s} .flat .scr {{ border-radius: 0; }}
    #{s} .scr img, #{s} .scr .fill {{ position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: cover; }}
    #{s} .scr .alt {{ opacity: 0; }}
    #{s} .scr::after {{ content: ""; position: absolute; inset: 0; border-radius: inherit;
      background: repeating-linear-gradient(0deg, rgba(0,0,0,.13) 0 2px, transparent 2px 5px);
      box-shadow: inset 0 0 38px rgba(0,0,0,.55), inset 0 0 6px rgba(255,255,255,.25); }}
    #{s} .flat .scr::after {{ box-shadow: none; background: none; }}
    #{s} .knobs {{ position: absolute; right: -2px; top: 10%; width: 22%; height: 80%;
      background: linear-gradient(#1f6b2f, #06240d); border-radius: 6px; }}
    #{s} .bar {{ position: absolute; background: #010502; }}
    #{s} .redbar {{ position: absolute; background: #00ff41; }}
    #{s} .photo {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }}
    #{s} .slice {{ position: absolute; left: 0; width: 100%; overflow: hidden; }}
    #{s} .slice img {{ position: absolute; left: 0; width: 1080px; height: 1920px; object-fit: cover; }}
    #{s} .px {{ position: absolute; background: #00ff41; }}
    #{s} .patch {{ position: absolute; overflow: hidden; }}
    #{s} .patch img {{ position: absolute; width: 1080px; height: 1920px; object-fit: cover; }}
    #{s} .scan {{ position: absolute; inset: 0; pointer-events: none;
      background: repeating-linear-gradient(0deg, rgba(0,0,0,.10) 0 2px, transparent 2px 4px); }}
"""


def fill_html(f, cls=""):
    if f in FILLS:
        return f'<div class="fill {cls}" style="background:{FILLS[f]}"></div>'
    if f in EYES:
        return f'<img class="{cls}" src="assets/{f}.jpg" alt="" data-color-grading="{ascii_grading(ASCII_SIZE)}" />'
    return f'<img class="{cls}" src="assets/matrix/{f}.jpg" alt="" />'


class Scene:
    def __init__(self, sid, start_f, end_f, bg="#0c0907", pad=12, origin="50% 50%"):
        self.sid, self.bg, self.pad, self.origin = sid, BG.get(bg, bg), pad, origin
        self.start, self.dur = t(start_f), t(end_f) - t(start_f)
        self.items, self.js = [], []
        self.n = 0

    def nid(self, k):
        self.n += 1
        return f"{self.sid}-{k}{self.n}"

    def tv(self, x, y, w, h, fill, alts=(), flat=False, knobs=False, jit=False, pad=None):
        i = self.nid("tv")
        cls = "tv" + (" flat" if flat else "") + (" jit" if jit else "")
        st = f"left:{x}px;top:{y}px;width:{w}px;height:{h}px"
        if pad is not None:
            st += f";padding:{pad}px"
        inner = fill_html(fill) + "".join(
            fill_html(a, "alt").replace("<", f'<', 1).replace('class="', f'id="{i}-a{k}" class="', 1)
            for k, a in enumerate(alts))
        kn = '<div class="knobs"></div>' if knobs else ""
        self.items.append(f'<div id="{i}" class="{cls}" style="{st}"><div class="scr">{inner}</div>{kn}</div>')
        return i

    def eye_patch(self, photo, x, y, w, h, size=0.1):
        i = self.nid("eye")
        self.items.append(f'<div id="{i}" class="patch" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px">'
                          f'<img src="assets/{photo}.jpg" alt="" style="left:-{x}px;top:-{y}px" '
                          f'data-color-grading="{ascii_grading(size)}" /></div>')
        return i

    def raw(self, html):
        self.items.append(html)

    def swap(self, tvid, k, t_on, t_off=None):
        """Show alt image k of a tile from t_on (hard switch, like a channel flip)."""
        self.js.append(f'tl.set("#{tvid}-a{k}", {{ opacity: 1 }}, {t_on:.3f});')
        if t_off is not None:
            self.js.append(f'tl.set("#{tvid}-a{k}", {{ opacity: 0 }}, {t_off:.3f});')

    def cam(self, s0, s1, x0=0, x1=0, y0=0, y1=0, ease="none"):
        self.js.append(
            f'tl.fromTo("#{self.sid}-cam", {{ scale: {s0}, x: {x0}, y: {y0} }}, '
            f'{{ scale: {s1}, x: {x1}, y: {y1}, duration: {self.dur:.3f}, ease: "{ease}" }}, 0);')

    def write(self):
        s = self.sid
        jitter = f"""
      // stop-motion jitter: tiles twitch a few px on 12 fps steps (seeded, so every render matches)
      let seed = {sum(map(ord, s)) * 7919};
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
      document.querySelectorAll("#{s} .jit").forEach((el) => {{
        for (let k = 0; k * (1 / 12) < {self.dur:.3f}; k++) {{
          tl.set(el, {{ x: rnd() * 7, y: rnd() * 7 }}, k / 12);
        }}
      }});"""
        html = f"""<template>
  <style>{CSS.format(s=s, bg=self.bg, pad=self.pad, origin=self.origin)}  </style>
  <div id="{s}" data-composition-id="{s}" data-width="{W}" data-height="{H}" data-layout-allow-overflow data-layout-allow-overlap>
    <div id="{s}-cam" class="cam">
      {chr(10).join('      ' + x for x in self.items).strip()}
    </div>
    <div class="scan"></div>
  </div>
  <script>
    (() => {{
      const tl = gsap.timeline({{ paused: true }});
      {chr(10).join('      ' + x for x in self.js).strip()}
      {jitter.strip()}
      tl.set({{}}, {{}}, {self.dur - 0.001:.3f});
      window.__timelines["{s}"] = tl;
    }})();
  </script>
</template>
"""
        with open(f"{OUT}/compositions/{s}.html", "w") as fh:
            fh.write(html)


scenes = []

# ---------------------------------------------------------------- mosaic shots
def mosaic(sid, a, b, center, center_alt, seed, extra_imgs, accent):
    sc = Scene(sid, a, b, bg="#090706", pad=5)
    rng = random.Random(seed)
    hole = (130, 700, 950, 1180)  # x0,y0,x1,y1 kept clear for the big eye
    y = -30
    pool = ["white"] * 11 + ["blue"] * 3 + ["dark"] * 2 + extra_imgs + [accent]
    tiles = []
    while y < H + 10:
        rh = rng.randint(62, 104)
        x = -rng.randint(0, 40)
        while x < W + 10:
            w = int(rh * rng.uniform(1.15, 1.7))
            cx0, cx1 = x, x + w
            if not (y + rh > hole[1] and y < hole[3] and cx1 > hole[0] and cx0 < hole[2]):
                f = rng.choice(pool)
                alts = (rng.choice(pool),) if rng.random() < 0.18 else ()
                i = sc.tv(x, y + rng.randint(-6, 6), w, rh, f, alts=alts, pad=5, jit=rng.random() < 0.35)
                if alts:
                    on = round(rng.uniform(0.15, sc.dur - 0.2) * 12) / 12
                    sc.swap(i, 0, on)
            x += w + rng.randint(4, 14)
        y += rh + rng.randint(6, 14)
    big = sc.tv(hole[0] + 10, hole[1] + 20, hole[2] - hole[0] - 20, hole[3] - hole[1] - 40,
                center, alts=(center_alt,) if center_alt else (), pad=12)
    if center_alt:
        sc.swap(big, 0, round(sc.dur * 0.55 * 12) / 12)
    sc.cam(1.0, 1.07)
    return sc

scenes.append(mosaic("s0", CUTS[0], CUTS[1], "eye-apple", "eye3", 11,
                     ["eye-small", "tv-land", "eye1", "eye6"], "red"))

# ---------------------------------------------------------------- beige/apple column (shots 1 + 2)
def column(sid, a, b, cam):
    sc = Scene(sid, a, b, bg="#0b0806", pad=14, origin="50% 48%")
    sc.tv(80, -70, 560, 260, "apple-red")
    sc.tv(-20, 330, 230, 380, "tv-land", knobs=False, jit=True)
    sc.tv(270, 350, 460, 350, "eye1")
    sc.tv(760, 360, 110, 160, "dark", knobs=True)
    sc.tv(880, 320, 230, 380, "white", jit=True)
    sc.tv(-60, 760, 180, 330, "white", jit=True)
    sc.raw(f'<div class="redbar" style="left:140px;top:780px;width:34px;height:34px"></div>')
    sc.tv(250, 750, 580, 340, "apple1", alts=("apple2",))
    sc.tv(270, 1150, 520, 390, "eye2", alts=("eye7",))
    sc.raw(f'<div class="redbar" style="left:800px;top:1200px;width:28px;height:250px"></div>')
    sc.tv(850, 1150, 260, 380, "white", jit=True)
    sc.tv(140, 1620, 620, 400, "apple2")
    sc.tv(810, 1650, 300, 300, "white", jit=True)
    sc.cam(*cam)
    return sc

c1 = column("s1", CUTS[1], CUTS[2], (1.0, 1.06))
c1.swap("s1-tv7", 0, 0.75); c1.swap("s1-tv8", 0, 0.5)
scenes.append(c1)
c2 = column("s2", CUTS[2], CUTS[3], (1.75, 1.9, 40, 40, 30, 10))
scenes.append(c2)

# ---------------------------------------------------------------- red grid (shot 3)
s3 = Scene("s3", CUTS[3], CUTS[4], bg="#0a0605", pad=12)
s3.tv(30, -40, 480, 270, "apple-red")
s3.tv(560, -40, 300, 270, "blue")
s3.tv(890, -40, 260, 270, "dark")
left = [("eye3", 250), ("eye4", 600), ("red-branch", 950), ("red", 1300), ("eye5", 1650)]
for f, y in left:
    s3.tv(30, y, 520, 330, f, jit=(f == "red"))
right = [
    (250, "dark", ("eye-small", "red")),
    (600, "red", ("dark", "red-eye")),
    (950, "red", ("red-branch", "white")),
    (1300, "dark", ("red", "red-eye")),
    (1650, "red-eye", ("red", "eye-green")),
]
for y, f, alts in right:
    i = s3.tv(580, y, 470, 330, f, alts=alts)
    s3.swap(i, 0, 0.5 + (y % 7) * 0.05, 1.25)
    s3.swap(i, 1, 1.25)
s3.tv(-120, 1300, 130, 330, "white")
for k, (yy, tt) in enumerate([(612, 0.33), (1260, 0.92), (980, 1.5)]):
    bid = f"s3-gl{k}"
    s3.raw(f'<div id="{bid}" class="bar" style="left:600px;top:{yy}px;width:200px;height:14px;opacity:0"></div>')
    s3.js.append(f'tl.set("#{bid}", {{ opacity: 1 }}, {tt}); tl.set("#{bid}", {{ opacity: 0 }}, {tt + 0.1:.2f});')
s3.cam(1.02, 1.09)
scenes.append(s3)

# ---------------------------------------------------------------- beige grid with kanji (shot 4)
s4 = Scene("s4", CUTS[4], CUTS[5], bg="#e6dcc8", pad=14)
s4.raw('<div class="bar" style="left:860px;top:0;width:240px;height:1920px;background:#1b1512"></div>')
s4.tv(-40, 0, 230, 360, "beige", flat=True)
s4.tv(240, -60, 450, 330, "eye6")
s4.tv(240, 380, 460, 360, "eye6", knobs=False)
s4.tv(720, 380, 130, 220, "dark", knobs=True)
s4.tv(-40, 400, 230, 330, "beige", flat=True)
s4.tv(230, 790, 520, 300, "apple2")
s4.tv(-40, 1180, 230, 330, "beige", flat=True)
s4.tv(240, 1160, 450, 360, "eye7")
s4.tv(720, 1140, 340, 380, "kanji", flat=True)
s4.tv(-20, 1600, 480, 360, "apple1")
s4.tv(500, 1600, 600, 360, "beige", flat=True)
s4.cam(1.0, 1.05)
scenes.append(s4)

# ---------------------------------------------------------------- glitch face, apple grows (shot 5)
s5 = Scene("s5", CUTS[5], CUTS[6], bg="#1a1410")
s5.raw('<img id="s5-photo" class="photo" src="assets/matrix/face-glitch.jpg" alt="" />')
rng = random.Random(5)
for k in range(7):
    yy = rng.randint(500, 1500); hh = rng.randint(14, 60)
    sid = f"s5-sl{k}"
    s5.raw(f'<div id="{sid}" class="slice" style="top:{yy}px;height:{hh}px">'
           f'<img src="assets/matrix/face-glitch.jpg" alt="" style="top:-{yy}px" /></div>')
    for step in range(12):
        tt = step / 12
        s5.js.append(f'tl.set("#{sid}", {{ x: {rng.randint(-90, 90)} }}, {tt:.3f});')
for k in range(26):
    x = rng.randint(80, 760); y = rng.randint(760, 1500); s = rng.randint(10, 36)
    pid = f"s5-px{k}"
    s5.raw(f'<div id="{pid}" class="px" style="left:{x}px;top:{y}px;width:{s}px;height:{s}px;'
           f'background:{rng.choice(["#00ff41", "#003b00", "#96ffaf", "#008f11"])};opacity:0"></div>')
    on = rng.randint(0, 10) / 12
    s5.js.append(f'tl.set("#{pid}", {{ opacity: 1 }}, {on:.3f}); tl.set("#{pid}", {{ opacity: 0 }}, {on + 0.17:.3f});')
s5.eye_patch("face-glitch", 290, 470, 520, 300, 0.035)
s5.origin = "38% 52%"
s5.cam(1.0, 1.22)
scenes.append(s5)

# ---------------------------------------------------------------- mosaic, apple pupil (shot 6)
scenes.append(mosaic("s6", CUTS[6], CUTS[7], "eye-pupil", None, 66,
                     ["eye-small", "tv-land", "kanji", "eye3"], "red"))

# ---------------------------------------------------------------- red portrait (shot 7)
s7 = Scene("s7", CUTS[7], CUTS[8], bg="#d23a1c")
s7.raw('<img class="photo" src="assets/matrix/portrait-red.jpg" alt="" />')
for k, (x, y, w, h, f) in enumerate([(395, 55, 300, 190, "eye-green"), (530, 560, 120, 80, "eye-small"),
                                      (200, 590, 110, 80, "eye-small")]):
    i = s7.tv(x, y, w, h, f, alts=("eye-tear",), pad=8)
    s7.swap(i, 0, 0.25 + 0.25 * k, 0.4 + 0.25 * k)
s7.eye_patch("portrait-red", 290, 760, 560, 160, 0.03)
s7.cam(1.0, 1.05)
scenes.append(s7)

# ---------------------------------------------------------------- apple TV + two eyes (shot 8)
s8 = Scene("s8", CUTS[8], CUTS[9], bg="#0c0907", pad=16)
s8.tv(20, -40, 880, 610, "apple-tv")
s8.tv(930, -20, 160, 560, "white", knobs=True)
s8.tv(-30, 620, 1140, 640, "eye8", flat=True)
s8.raw('<div class="bar" style="left:0;top:1250px;width:1080px;height:150px"></div>')
s8.tv(-30, 1400, 1140, 560, "eye9", flat=True)
s8.cam(1.0, 1.04)
scenes.append(s8)

# ---------------------------------------------------------------- big eye with apple (shot 9)
s9 = Scene("s9", CUTS[9], CUTS[10], bg="#120d0a", pad=10)
s9.tv(90, 120, 340, 250, "eye-green")
s9.tv(610, 110, 440, 320, "apple-card")
s9.tv(-20, 140, 90, 260, "dark")
s9.tv(-60, 560, 1200, 600, "eye-big", flat=True)
for k, (x, y, w, h, f) in enumerate([(30, 1200, 200, 150, "tv-land"), (250, 1220, 160, 120, "blue"),
                                      (450, 1310, 260, 200, "tv-apple"), (760, 1180, 280, 230, "apple3"),
                                      (40, 1560, 330, 260, "white"), (430, 1580, 240, 200, "dark"),
                                      (720, 1500, 330, 300, "red")]):
    s9.tv(x, y, w, h, f, jit=True)
s9.cam(1.0, 1.08)
scenes.append(s9)

# ---------------------------------------------------------------- red TV tunnel (shot 10)
s10 = Scene("s10", CUTS[10], CUTS[11], bg="linear-gradient(180deg, #001a05, #00330b 50%, #000a02)", pad=9)
s10.tv(160, 160, 760, 500, "eye-green2", flat=True)
rng = random.Random(10)
for k in range(30):
    ang = rng.uniform(0, 6.283)
    import math
    r = rng.uniform(260, 820)
    w = rng.randint(120, 260); h = int(w * 0.72)
    x = int(540 + math.cos(ang) * r * 0.75 - w / 2); y = int(1080 + math.sin(ang) * r - h / 2)
    f = rng.choice(["red", "tv-apple90", "apple-red", "red-eye", "red", "dark"])
    i = s10.tv(x, y, w, h, f)
    dx = (x + w / 2 - 540) * 0.35; dy = (y + h / 2 - 1080) * 0.35
    s10.js.append(f'tl.fromTo("#{i}", {{ x: 0, y: 0, rotation: {rng.uniform(-6, 6):.1f} }}, '
                  f'{{ x: {dx:.0f}, y: {dy:.0f}, rotation: {rng.uniform(-14, 14):.1f}, duration: {s10.dur:.3f}, ease: "none" }}, 0);')
s10.tv(370, 1040, 340, 230, "tv-apple90")
s10.cam(1.0, 1.12)
scenes.append(s10)

# ---------------------------------------------------------------- eye/apple grid (shots 11 + 12)
def grid11(sid, a, b, variant):
    sc = Scene(sid, a, b, bg="#0c0907", pad=12)
    sc.tv(150, -90, 760, 280, "apple3" if not variant else "red")
    sc.tv(940, -40, 180, 260, "blue")
    sc.tv(-90, 200, 200, 330, "white")
    i1 = sc.tv(120, 190, 840, 410, "eye-tear" if not variant else "eye-pupil")
    sc.tv(970, 290, 160, 210, "dark", knobs=True)
    i2 = sc.tv(70, 640, 920, 420, "eye-pupil" if not variant else "eye-tear")
    sc.tv(-90, 1080, 170, 330, "tv-land")
    i3 = sc.tv(150, 1090, 780, 380, "eye-cherry", alts=("eye1",))
    sc.tv(960, 1080, 160, 360, "white")
    sc.tv(-80, 1500, 240, 330, "blue")
    sc.tv(190, 1500, 560, 420, "apple3")
    sc.tv(780, 1500, 330, 420, "face-tile")
    if not variant:
        sc.swap(i3, 0, 1.25)
    sc.cam(1.0, 1.06 if not variant else 1.0)
    return sc

scenes.append(grid11("s11", CUTS[11], CUTS[12], False))
scenes.append(grid11("s12", CUTS[12], CUTS[13], True))

# ---------------------------------------------------------------- final portrait (shot 13)
s13 = Scene("s13", CUTS[13], CUTS[14], bg="#d23a1c")
s13.raw('<img class="photo" src="assets/matrix/portrait-final.jpg" alt="" />')
for (x, y, w, h) in [(150, 745, 260, 190), (625, 745, 325, 190), (420, 240, 215, 185), (450, 0, 185, 135)]:
    s13.eye_patch("portrait-final", x, y, w, h, 0.03)
s13.origin = "50% 30%"
s13.cam(1.0, 1.06)
scenes.append(s13)

for sc in scenes:
    sc.write()

hosts = "\n".join(
    f'      <div id="{sc.sid}" data-composition-id="{sc.sid}" data-composition-src="compositions/{sc.sid}.html"\n'
    f'        class="clip" data-start="{sc.start}" data-duration="{sc.dur:.6f}" data-track-index="1"\n'
        f'        data-track-kind="graphics" data-width="{W}" data-height="{H}" style="z-index:{k + 1}"></div>'
    for k, sc in enumerate(scenes))

# ---------------------------------------------------------------- Matrix digital rain overlay
GLYPHS = "ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789Z:.=*+-<>"
rng = random.Random(1999)
cols, col_js = [], []
COLW, FS, NCH = 36, 30, 34
for c in range(W // COLW):
    chars = "".join(f"<span>{rng.choice(GLYPHS)}</span>" for _ in range(NCH))
    cid = f"rain-c{c}"
    cols.append(f'<div id="{cid}" class="col" style="left:{c * COLW}px">{chars}</div>')
    speed = rng.uniform(900, 1700)          # px per second
    span = NCH * FS * 1.05 + H              # distance for one full pass
    d = round(span / speed, 3)
    phase = rng.uniform(0, 1)               # where the column starts in its fall
    y0 = -NCH * FS * 1.05 + phase * span
    first = round((H - y0) / speed, 3)
    col_js.append(f'tl.fromTo("#{cid}", {{ y: {y0:.0f} }}, {{ y: {H}, duration: {first:.3f}, ease: "none" }}, 0);')
    tt = round(first + 0.001, 3)
    while tt < TOTAL:
        col_js.append(f'tl.fromTo("#{cid}", {{ y: {-NCH * FS * 1.05:.0f} }}, {{ y: {H}, duration: {d:.3f}, ease: "none", immediateRender: false }}, {tt:.3f});')
        tt = round(tt + d + 0.001, 3)
rain = f"""<template>
  <style>
    #rain {{ position: absolute; inset: 0; overflow: hidden; pointer-events: none; opacity: 0.42; }}
    #rain .col {{ position: absolute; top: 0; width: {COLW}px; display: flex; flex-direction: column;
      align-items: center; font-family: "Noto Sans JP", "Space Mono", monospace; font-size: {FS}px;
      line-height: 1.05; color: #00ff41; text-shadow: 0 0 6px #00ff41;
      -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 85%);
      mask-image: linear-gradient(180deg, transparent 0%, #000 85%); }}
    #rain .col span:last-child {{ color: #e6ffe9; text-shadow: 0 0 12px #9dffb4; }}
  </style>
  <div id="rain" data-composition-id="rain" data-width="{W}" data-height="{H}" data-layout-allow-overflow data-layout-ignore>
    {chr(10).join('    ' + x for x in cols).strip()}
  </div>
  <script>
    (() => {{
      const tl = gsap.timeline({{ paused: true }});
      {chr(10).join('      ' + x for x in col_js).strip()}
      window.__timelines["rain"] = tl;
    }})();
  </script>
</template>
"""
with open(f"{OUT}/compositions/rain.html", "w") as fh:
    fh.write(rain)
hosts += (f'\n      <div id="rain" data-composition-id="rain" data-composition-src="compositions/rain.html"\n'
          f'        class="clip" data-start="0" data-duration="{TOTAL}" data-track-index="3"\n'
          f'        data-track-kind="graphics" data-width="{W}" data-height="{H}" style="z-index:50"></div>')

index = f"""<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: {W}px; height: {H}px; overflow: hidden; background: #000; }}
    </style>
  </head>
  <body>
    <!-- TV collage: 14 hard cuts on the original's beat. Each shot is one scene in compositions/. -->
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}"
      data-width="{W}" data-height="{H}">
{hosts}
      <audio id="soundtrack" class="clip" src="assets/pinterest_ref.mp4" data-start="0"
        data-duration="{TOTAL}" data-track-index="2" data-volume="1"></audio>
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""
with open(f"{OUT}/index.html", "w") as fh:
    fh.write(index)
print("scenes:", len(scenes), "total:", TOTAL)
