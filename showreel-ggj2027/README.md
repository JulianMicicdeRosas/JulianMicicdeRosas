# Showreel · Global Game Jam Mendoza 2027

Pieza de motion graphics de **60 segundos** (1920×1080, 60 fps) para presentar la propuesta de la
**Global Game Jam Mendoza 2027** (29, 30 y 31 de enero de 2027) y la trayectoria de la **Asociación MEGA**.
Está hecha con fotos reales de las jams y talleres de MEGA y con datos de los informes GGJ 2025, GGJ 2026
y MEGAJam de Invierno 2025.

Todo es código: no hay After Effects ni plantillas. Las animaciones, la tipografía cinética, el
post-proceso (aberración cromática, glitch, grano, viñeta) y **la música** se generan por programa y
quedan sincronizados con la misma grilla rítmica: **128 BPM, 32 compases = 60 s**.

## Estructura del reel

| Tiempo | Compases | Capítulo | Qué pasa |
|---|---|---|---|
| 0:00 – 0:07 | 1–4 | **01 · 48 HORAS** | Cronómetro 00:00:00 → 48:00:00, "48 HORAS", "1 tema secreto · 1 equipo · 1 juego", se arma el globo GGJ |
| 0:07 – 0:15 | 5–8 | **02 · MENDOZA** | "MENDOZA" con fotos dentro de las letras, tríptico "Comunidad / Desde 2012", 15 ediciones consecutivas, cuenta 3·2·1 · PRESS START |
| 0:15 – 0:30 | 9–16 | **03 · COMUNIDAD** (drop) | Grilla de fotos + "Sede Nº1 de Argentina", 120 jammers, 20 juegos, ranking 172° → 45°, 175 capacitados, 41 juegos (marquesina con títulos reales), MEGAJam de Invierno, tormenta de fotos, "El primer paso hacia la industria" |
| 0:30 – 0:37 | 17–20 | **04 · MEGA** (breakdown) | Qué es MEGA, disciplinas con íconos animados, para quién es, túnel de herramientas → "¿Te sumás?" |
| 0:37 – 0:52 | 21–28 | **05 · GGJ 2027** (drop 2) | Reveal del logo + MENDOZA 2027, fechas 29·30·31, cronograma jugable de 48 h, objetivos, mosaico de rostros, "Somos comunidad", "Hacemos juegos / Hacemos amigos" |
| 0:52 – 1:00 | 29–32 | **06 · TE ESPERAMOS** | Lockup GGJ + MEGA + Gobierno de Mendoza, URLs, "¿JUGAMOS?" |

## Archivos

```
showreel-ggj2027/
├── showreel_ggj2027.mp4   El video final (H.264 + AAC, 60 fps)
├── index.html             Reproductor/preview en el navegador (con música)
├── reel.js                Motor de animación: todas las escenas, HUD y post-proceso WebGL
├── music.py               Banda sonora original sintetizada (numpy + scipy)
├── render.js              Render cuadro a cuadro con Playwright → ffmpeg
└── assets/
    ├── photos/            62 fotos seleccionadas de los álbumes de MEGA (1600 px)
    ├── logos/             GGJ (light) y MEGA (negativo)
    ├── fonts/             Anton, Archivo (variable, eje de ancho), JetBrains Mono, Space Grotesk
    └── soundtrack.m4a     Música para el preview
```

## Versión web (HTML animado, sin video)

`index.html` + `reel.js` es la versión que se publica: el reel se dibuja en vivo en el navegador,
con la música sincronizada, pantalla de carga, botón de inicio, barra para adelantar, pantalla
completa (tecla F) y pantalla final con links.

Para publicarla en `elzorroazul.studio/GGJ/`:

```bash
deploy/armar_web.sh
```

Genera `deploy/GGJ/` (≈15 MB) y `deploy/GGJ.zip`. Se sube por cPanel
(Administrador de archivos → `public_html` → Cargar el ZIP → Extraer) o por SFTP:

```bash
deploy/subir_sftp.sh        (desde la Mac con la llave flat-namecheap)
```

## Ver el preview en el navegador

Hace falta servir la carpeta (las fuentes no cargan desde `file://`):

```bash
cd showreel-ggj2027
```

```bash
python3 -m http.server 8000
```

Abrir `http://localhost:8000` → **▶ PLAY** (espacio = play/pausa, flechas = ±2 s).

## Volver a renderizar

Requisitos: Node 18+, Playwright con Chromium, ffmpeg, Python 3 con numpy y scipy.

```bash
python3 music.py build/soundtrack.wav
```

```bash
node render.js --workers 4
```

El resultado queda en `build/showreel_ggj2027.mp4`. Otras opciones:
`--fps 30`, `--stills 12.3,40.1` (cuadros de control en `build/stills/`).

Para cambiar textos, fotos o tiempos, editar las funciones `s*` de `reel.js`; la tabla `SCENES`
define en qué compás arranca cada escena.

## Fuentes de los datos

- *Propuesta Evento Global Game Jam 2027* (objetivos, público, cronograma, producción).
- *Informe GGJ 2025*: 120 jammers, 20 juegos (+43 %), 1ª sede de Argentina, ranking 45° global (desde 172°), 6° Sudamérica, 9° Hispanoamérica.
- *Informe GGJ 2026*: 21 juegos, 175 personas capacitadas en 7 talleres.
- *Informe MEGAJam de Invierno 2025*: 130 participantes, 14 juegos, 87 en talleres.
- Brief GGJ 2025: Mendoza fue sede por 14ª vez consecutiva en 2025 (de ahí "desde 2012" y "15 ediciones" hasta 2026).
