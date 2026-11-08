# Reel «Día de Bolivia» · FLAT 2026

Reel vertical de **60 s (1080 × 1920, 30 fps)** para Instagram / Edits, montado sólo con los videos del álbum
del Día de Bolivia (sin fotos), sincronizado con *Simón de corazón* (Karumanta de Bolivia) y con la estética
de las placas de Adobe Express de FLAT (Semana 4 · Día de Bolivia).

## Archivos finales

- `video_final/DiaDeBolivia_FLAT_reel60s_instagram.mp4` — para subir (H.264, ≈13 Mb/s, 96 MB).
- `video_final/DiaDeBolivia_FLAT_reel60s_MASTER.mp4` — master de alta calidad (≈30 Mb/s, 222 MB).

> Los videos, el audio y los clips (`*.mp4`, `*.wav`, `*.m4a`) no se suben al repositorio por su peso
> (ver `.gitignore`): se entregan directamente.

## Estructura (como cine: cuatro actos)

| Tiempo | Acto | Qué pasa |
|---|---|---|
| 0:00 – 0:04.5 | **Cartel** | Bloques F·L·A·T entran uno por beat, *Día de Bolivia* se tipea en el bloque salmón, escudo + EMBAJADA DE BOLIVIA, chip lima con fecha y sala. Sale con glitch. |
| 0:04.5 – 0:13.5 | **I · Retratos** | Intro de la canción: cámara lenta (70–80 %), acercamientos lentos. Morenada de perfil, aguayo, quena, zampoña, poesía en quechua con letras proyectadas. |
| 0:13.5 – 0:26.9 | **II · La sala se enciende** | Corte cada 2 beats; en el último compás, cortes a beat y medio beat hacia el drop. |
| 0:26.9 – 0:51.1 | **III · Drop** | Entra la banda completa: flash blanco + golpes de zoom en cada beat; cortes a beat alternados con planos de 2 beats en los rostros. Fraternidades: Caporales, Morenada, Morenos, Tinkus, Tobas, Salay, Chicheños, Chapacos. |
| 0:51.1 – 0:55.6 | **IV · Bandera** | Bandera de Bolivia, y la Morenada de perfil del inicio cierra el círculo. |
| 0:55.6 – 1:00 | **Cierre** | FLAT + Día de Bolivia + logos (Organiza / Acompaña). Queda quieto hasta el final del último acorde. |

**Música:** edición de 60 s sin fundido: intro original (0:00.5–0:51.5) unida en compás con el final real del
tema (4:37.8–4:46.8), crossfade de 30 ms sobre el golpe. La canción termina de verdad, no se apaga.
Tempo ≈ 92 BPM; todos los cortes caen en beats detectados.

## Color

Los videos del iPhone son **HDR (HLG / BT.2020)**. Primero se convierten a Rec.709 SDR (tone-mapping Mobius,
blanco de referencia 203 nits) y sobre esa base se aplica el look. Propuestas en `colorimetria/`:

- Looks propios A–D (`propuestas_color.jpg`, `frame_morenada_looks.jpg`).
- LUTs de emulación de película L1–L9 (`luts_morenada.jpg`, `luts_otros.jpg`), de la
  [RawTherapee Film Simulation Collection](http://rawpedia.rawtherapee.com/Film_Simulation) — CC BY-SA 4.0,
  Pat David, Pavlov Dmitry, Michael Ezra.
- `fragmentos_5s/`: el mismo fragmento de 5 s en HD en cada look.

Render actual: **L1 · Kodak Portra 400 + acabado cine** (halación, viñeta, grano). Cambiar de look es una
línea (ver «Re-render»).

## Paquete para Edits (`paquete_edits/`)

El MCP de Edits sólo existe dentro de la app de Mac (Ajustes → MCP); esta edición se hizo fuera de la app,
así que el paquete está pensado para rearmar o retocar el reel en Edits sin perder la sincronía:

| Carpeta | Contenido |
|---|---|
| `01_clips/` | Los 53 planos **ya graduados y cortados a su duración exacta** (sin textos), numerados en orden. Puestos uno detrás de otro desde 0:04.53 caen solos en los beats. |
| `02_carteles/` | `cartel_apertura.mp4` (0:00–0:04.53) y `cartel_cierre.mp4` (0:55.67–1:00), animados (sin audio), + PNG. |
| `03_logos_y_graficos/` | Logo FLAT en bloques y bajada, escudo y logo del Consulado de Bolivia, logos de organizadores, chips de texto y marca de esquina en PNG transparente 1080×1920. |
| `04_audio/` | `musica_60s.m4a` / `.wav`: la música ya editada a 60 s. |
| `05_lut/` | `Kodak_Portra_400.cube` y `Kodachrome_64.cube` (33³, entrada Rec.709) para usar en otras apps. Los clips ya vienen graduados: en Edits no hace falta. |

**Armado en Edits:**

1. Proyecto nuevo 9:16. Importá `04_audio/musica_60s.m4a` como pista de audio desde 0:00.
2. Poné `02_carteles/cartel_apertura.mp4` al inicio.
3. Importá `01_clips/` **en orden** (01 → 53), sin recortarlos: cada uno tiene la duración exacta.
4. Poné `02_carteles/cartel_cierre.mp4` al final (empieza en 0:55.67).
5. Superposiciones (opcional, en una pista arriba): `marca_flat_esquina` de 0:04.5 a 0:55.6;
   `chip_poesia` de 0:10.9 a 0:13.4; `chip_fraternidades` de 0:27.1 a 0:30.2.
6. Exportá en 1080p.

## Marca (tomada de los Adobe Express)

- Fondo negro con grilla punteada y partículas; bloques **F** lima `#A8FF00` · **L** gris `#BCBCBC` ·
  **A** lavanda `#8889FF` · **T** coral `#FF8185`; bloque de título salmón `#FF9898`; celeste `#79CFDE`.
- Tipografías: **Geist Mono** (logo, títulos, 800) y **Roboto** (datos, 500–700, con tracking).
- Logos: FLAT; Consulado del Estado Plurinacional de Bolivia en Mendoza; organizan El Zorro Azul, CEES,
  MMAMM, Mendoza Ciudad.

## Fuentes (videos del álbum)

`vNN` = posición del video en el álbum de Google Photos (v01 = primer video). Lista de cortes:

| # | Entra | Sale | Dur. | Archivo fuente | In fuente | Vel. | Mov. | Plano |
|---|---|---|---|---|---|---|---|---|
| 01 | 0:04.54 | 0:05.79 | 1.27 s | v16 | 5.55 s | 70% | push | Morenada de perfil, nubes proyectadas |
| 02 | 0:05.79 | 0:07.02 | 1.23 s | v32 | 107.40 s | 80% | push | Inserto: aguayo / textil |
| 03 | 0:07.02 | 0:08.23 | 1.20 s | v02 | 11.00 s | 80% | push | Quena |
| 04 | 0:08.23 | 0:09.49 | 1.27 s | v06 | 3.00 s | 75% | push | Músico con guirnaldas, sonríe |
| 05 | 0:09.49 | 0:10.79 | 1.30 s | v25 | 106.00 s | 100% | push | Zampoña |
| 06 | 0:10.79 | 0:12.16 | 1.37 s | v03 | 18.60 s | 100% | push | Poesía en quechua |
| 07 | 0:12.16 | 0:13.53 | 1.37 s | v32 | 658.90 s | 100% | push | Letras proyectadas sobre la poeta |
| 08 | 0:13.53 | 0:14.69 | 1.17 s | v21 | 2.00 s | 100% | still | Inserto: pies, zapateo |
| 09 | 0:14.69 | 0:15.89 | 1.20 s | v18 | 15.00 s | 100% | push | Morenada frente a montaña proyectada |
| 10 | 0:15.89 | 0:17.19 | 1.30 s | v14 | 20.00 s | 100% | push | Tinku de espaldas, puño en alto |
| 11 | 0:17.19 | 0:18.59 | 1.40 s | v28 | 2.00 s | 100% | push | Girasoles |
| 12 | 0:18.59 | 0:19.91 | 1.30 s | v30 | 2.00 s | 100% | push | Chapaco con caja |
| 13 | 0:19.91 | 0:21.21 | 1.30 s | v13 | 13.00 s | 100% | push | Salay, sonrisa de perfil |
| 14 | 0:21.21 | 0:22.48 | 1.27 s | v29 | 10.50 s | 100% | pull | Tobas, plano abierto |
| 15 | 0:22.48 | 0:23.67 | 1.20 s | v07 | 12.50 s | 100% | push | Cholita sonríe |
| 16 | 0:23.67 | 0:24.93 | 1.27 s | v09 | 56.00 s | 100% | push | Sonrisa bajo el sombrero |
| 17 | 0:24.93 | 0:25.58 | 0.63 s | v15 | 3.00 s | 100% | punch | Tinku, chaqueta fucsia |
| 18 | 0:25.58 | 0:26.05 | 0.50 s | v15 | 90.60 s | 100% | punch | Patada |
| 19 | 0:26.05 | 0:26.42 | 0.37 s | v29 | 8.50 s | 100% | punch | Plumas Tobas |
| 20 | 0:26.42 | 0:26.88 | 0.43 s | v14 | 66.00 s | 100% | punch | Salto |
| 21 | 0:26.88 | 0:27.97 | 1.10 s | v13 | 242.50 s | 100% | punch | Caporal: brazo en alto |
| 22 | 0:27.97 | 0:29.04 | 1.07 s | v18 | 21.00 s | 100% | push | Morenada sonríe a cámara |
| 23 | 0:29.04 | 0:29.68 | 0.63 s | v31 | 61.60 s | 100% | punch | Moreno, máscara |
| 24 | 0:29.68 | 0:30.31 | 0.63 s | v31 | 18.30 s | 100% | punch | Máscara multicolor |
| 25 | 0:30.31 | 0:31.61 | 1.30 s | v14 | 64.00 s | 100% | pull | Tinkus, plano abierto |
| 26 | 0:31.61 | 0:32.26 | 0.67 s | v15 | 6.60 s | 100% | punch | Tinku con sombrero |
| 27 | 0:32.26 | 0:32.91 | 0.63 s | v15 | 58.60 s | 100% | punch | Tinku, brazos abiertos |
| 28 | 0:32.91 | 0:34.23 | 1.33 s | v27 | 53.00 s | 100% | push | Pollera amarilla |
| 29 | 0:34.23 | 0:34.85 | 0.63 s | v27 | 19.00 s | 100% | punch | Polleras y banderas |
| 30 | 0:34.85 | 0:35.50 | 0.63 s | v12 | 5.30 s | 100% | punch | Caporal, chaleco amarillo |
| 31 | 0:35.50 | 0:36.80 | 1.30 s | v17 | 40.00 s | 100% | push | Sonrisa en luz rosa |
| 32 | 0:36.80 | 0:37.47 | 0.67 s | v29 | 310.20 s | 100% | punch | Tobas, brazos arriba |
| 33 | 0:37.47 | 0:38.12 | 0.67 s | v28 | 118.00 s | 100% | punch | Sombrero de girasoles |
| 34 | 0:38.12 | 0:39.40 | 1.27 s | v25 | 16.60 s | 100% | push | Charanguista se ríe |
| 35 | 0:39.40 | 0:40.05 | 0.67 s | v32 | 270.00 s | 100% | punch | Flauta |
| 36 | 0:40.05 | 0:40.69 | 0.63 s | v26 | 2.40 s | 100% | punch | Moreno con su máscara |
| 37 | 0:40.69 | 0:41.99 | 1.30 s | v20 | 109.50 s | 100% | push | Bailarín sonríe a cámara |
| 38 | 0:41.99 | 0:42.63 | 0.63 s | v09 | 53.50 s | 100% | punch | Pañuelo al aire |
| 39 | 0:42.63 | 0:43.29 | 0.67 s | v09 | 20.90 s | 100% | punch | Sonrisa bajo el sombrero |
| 40 | 0:43.29 | 0:44.58 | 1.27 s | v17 | 115.00 s | 100% | push | Morenada y paisaje |
| 41 | 0:44.58 | 0:45.24 | 0.67 s | v22 | 14.00 s | 100% | punch | Luz violeta |
| 42 | 0:45.24 | 0:45.87 | 0.63 s | v23 | 2.00 s | 100% | punch | Bailarín sonríe |
| 43 | 0:45.87 | 0:47.17 | 1.30 s | v18 | 32.00 s | 100% | push | Retrato, mirada |
| 44 | 0:47.17 | 0:47.82 | 0.67 s | v14 | 33.00 s | 100% | punch | Tinkus |
| 45 | 0:47.82 | 0:48.46 | 0.63 s | v13 | 115.80 s | 100% | punch | Salay sonríe |
| 46 | 0:48.46 | 0:49.13 | 0.67 s | v29 | 101.00 s | 100% | punch | Tobas |
| 47 | 0:49.13 | 0:49.78 | 0.63 s | v05 | 13.50 s | 100% | punch | Público baila |
| 48 | 0:49.78 | 0:50.43 | 0.67 s | v08 | 3.50 s | 100% | punch | Manos arriba |
| 49 | 0:50.43 | 0:51.08 | 0.63 s | v10 | 1.50 s | 100% | push | Aplausos |
| 50 | 0:51.08 | 0:52.38 | 1.30 s | v13 | 245.00 s | 100% | push | Bandera de Bolivia |
| 51 | 0:52.38 | 0:53.67 | 1.30 s | v15 | 88.60 s | 100% | push | Bandera y Tinku |
| 52 | 0:53.67 | 0:54.98 | 1.30 s | v16 | 7.40 s | 70% | push | Morenada de perfil (rima con el inicio) |
| 53 | 0:54.98 | 0:55.65 | 0.70 s | v13 | 248.00 s | 100% | pull | Bandera, plano abierto |
## Re-render

`herramientas/` tiene el pipeline completo (Python + ffmpeg):

```bash
python3 herramientas/extract.py          # HLG → Rec.709 de los 53 planos (cámara lenta con minterpolate)
python3 herramientas/compose.py "<HaldCLUT.png | none>" reel.mp4 --finish   # montaje + gráficos + audio
```

`edl.py` define cortes, velocidades, movimientos de cámara, transiciones y textos; `gfx.py` los carteles;
`grade.py` los looks A–D.
