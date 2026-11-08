"""EDL del reel Día de Bolivia · FLAT (60 s, 1080x1920, 30 fps).

Cada plano: (inicio_timeline, fuente, in_fuente, velocidad, movimiento, nota)
El fin de cada plano es el inicio del siguiente. Los cortes caen en los beats detectados
de la música editada (music60.wav, ~92 BPM).
movimiento: 'push' = acercamiento lento 1.00→1.05 · 'punch' = golpe de zoom 1.10→1.00 al entrar
            'pull' = alejamiento 1.06→1.00 · 'still' = fijo
"""

FPS = 30
TITLE_END = 4.54
END_CARD = 55.65

SHOTS = [
    # ── I. RETRATOS (intro de la canción, ritmo pausado, cámara lenta) ──────────────
    (4.54, "v16", 5.55, 0.70, "push", "Morenada de perfil, nubes proyectadas"),
    (5.79, "v32", 107.40, 0.80, "push", "Inserto: aguayo / textil"),
    (7.02, "v02", 11.00, 0.80, "push", "Quena"),
    (8.23, "v06", 3.00, 0.75, "push", "Músico con guirnaldas, sonríe"),
    (9.49, "v25", 106.00, 1.00, "push", "Zampoña"),
    (10.79, "v03", 18.60, 1.00, "push", "Poesía en quechua"),
    (12.16, "v32", 658.90, 1.00, "push", "Letras proyectadas sobre la poeta"),
    # ── II. LA SALA SE ENCIENDE (build, corte cada 2 beats) ─────────────────────────
    (13.53, "v21", 2.00, 1.00, "still", "Inserto: pies, zapateo"),
    (14.69, "v18", 15.00, 1.00, "push", "Morenada frente a montaña proyectada"),
    (15.89, "v14", 20.00, 1.00, "push", "Tinku de espaldas, puño en alto"),
    (17.19, "v28", 2.00, 1.00, "push", "Girasoles"),
    (18.59, "v30", 2.00, 1.00, "push", "Chapaco con caja"),
    (19.91, "v13", 13.00, 1.00, "push", "Salay, sonrisa de perfil"),
    (21.21, "v29", 10.50, 1.00, "pull", "Tobas, plano abierto"),
    (22.48, "v07", 12.50, 1.00, "push", "Cholita sonríe"),
    (23.67, "v09", 56.00, 1.00, "push", "Sonrisa bajo el sombrero"),
    # aceleración: un beat, medio beat
    (24.93, "v15", 3.00, 1.00, "punch", "Tinku, chaqueta fucsia"),
    (25.58, "v15", 90.60, 1.00, "punch", "Patada"),
    (26.05, "v29", 8.50, 1.00, "punch", "Plumas Tobas"),
    (26.42, "v14", 66.00, 1.00, "punch", "Salto"),
    # ── III. DROP (banda completa, cortes a beat) ────────────────────────────────────
    (26.88, "v13", 242.50, 1.00, "punch", "Caporal: brazo en alto"),
    (27.97, "v18", 21.00, 1.00, "push", "Morenada sonríe a cámara"),
    (29.04, "v31", 61.60, 1.00, "punch", "Moreno, máscara"),
    (29.68, "v31", 18.30, 1.00, "punch", "Máscara multicolor"),
    (30.31, "v14", 64.00, 1.00, "pull", "Tinkus, plano abierto"),
    (31.61, "v15", 6.60, 1.00, "punch", "Tinku con sombrero"),
    (32.26, "v15", 58.60, 1.00, "punch", "Tinku, brazos abiertos"),
    (32.91, "v27", 53.00, 1.00, "push", "Pollera amarilla"),
    (34.23, "v27", 19.00, 1.00, "punch", "Polleras y banderas"),
    (34.85, "v12", 5.30, 1.00, "punch", "Caporal, chaleco amarillo"),
    (35.50, "v17", 40.00, 1.00, "push", "Sonrisa en luz rosa"),
    (36.80, "v29", 310.20, 1.00, "punch", "Tobas, brazos arriba"),
    (37.47, "v28", 118.00, 1.00, "punch", "Sombrero de girasoles"),
    (38.12, "v25", 16.60, 1.00, "push", "Charanguista se ríe"),
    (39.40, "v32", 270.00, 1.00, "punch", "Flauta"),
    (40.05, "v26", 2.40, 1.00, "punch", "Moreno con su máscara"),
    (40.69, "v20", 109.50, 1.00, "push", "Bailarín sonríe a cámara"),
    (41.99, "v09", 53.50, 1.00, "punch", "Pañuelo al aire"),
    (42.63, "v09", 20.90, 1.00, "punch", "Sonrisa bajo el sombrero"),
    (43.29, "v17", 115.00, 1.00, "push", "Morenada y paisaje"),
    (44.58, "v22", 14.00, 1.00, "punch", "Luz violeta"),
    (45.24, "v23", 2.00, 1.00, "punch", "Bailarín sonríe"),
    (45.87, "v18", 32.00, 1.00, "push", "Retrato, mirada"),
    (47.17, "v14", 33.00, 1.00, "punch", "Tinkus"),
    (47.82, "v13", 115.80, 1.00, "punch", "Salay sonríe"),
    (48.46, "v29", 101.00, 1.00, "punch", "Tobas"),
    (49.13, "v05", 13.50, 1.00, "punch", "Público baila"),
    (49.78, "v08", 3.50, 1.00, "punch", "Manos arriba"),
    (50.43, "v10", 1.50, 1.00, "push", "Aplausos"),
    # ── IV. BANDERA (cierre musical) ─────────────────────────────────────────────────
    (51.08, "v13", 245.00, 1.00, "push", "Bandera de Bolivia"),
    (52.38, "v15", 88.60, 1.00, "push", "Bandera y Tinku"),
    (53.67, "v16", 7.40, 0.70, "push", "Morenada de perfil (rima con el inicio)"),
    (54.98, "v13", 248.00, 1.00, "pull", "Bandera, plano abierto"),
]

# Momentos con transición especial (glitch / flash) en el compositor
GLITCH_AT = [4.54, 13.53, 51.08, 55.65]
FLASH_AT = [26.88]

CHIPS = [
    # (desde, hasta, [línea 1, línea 2], color)
    (10.95, 13.45, ["POESÍA GRÁFICA", "EN QUECHUA · SALA INMERSIVA"], "salmon"),
    (27.10, 30.25, ["FRATERNIDADES", "BOLIVIANAS · DANZA Y MÚSICA EN VIVO"], "lime"),
]


def fr(t):
    return int(round(t * FPS))


def shots_with_frames():
    out = []
    for i, s in enumerate(SHOTS):
        t0 = s[0]
        t1 = SHOTS[i + 1][0] if i + 1 < len(SHOTS) else END_CARD
        out.append(dict(idx=i + 1, t0=t0, t1=t1, f0=fr(t0), f1=fr(t1), n=fr(t1) - fr(t0),
                        src=s[1], tin=s[2], speed=s[3], move=s[4], note=s[5]))
    return out


if __name__ == "__main__":
    tot = 0
    for s in shots_with_frames():
        tot += s["n"]
        print(f'{s["idx"]:02d} {s["t0"]:6.2f}-{s["t1"]:6.2f} {s["n"]:3d}f {s["src"]} @{s["tin"]:7.2f} x{s["speed"]} {s["move"]:5s} {s["note"]}')
    print("frames montaje", tot, "=", fr(END_CARD) - fr(TITLE_END))
