# La Nueve – Lugares 3 · montaje de 10 s

Video vertical 1080×1920, 30 fps, **10 s**. Tono general: verde #15372D (imagen de referencia). Música: Nils Frahm – *Familiar*.

## Ritmo (`ritmo.py`)
- Tempo: **117,2 BPM** → negra 0,512 s · corchea 0,256 s · semicorchea 0,128 s · compás 4/4 2,047 s.
- La música entra en el **primer tiempo de compás a los 2:17,3** (zona media del tema, la de más energía),
  con fade-in de 0,5 s y fade-out durante la placa del logo.

## Edición (`montaje.py`)
11 cortes sobre la grilla, en 4 compases, con ritmo **lento: solo negras (0,51 s) y blancas (1,02 s)**.
Cada clip se usa una sola vez y se quitaron tomas que se parecían entre sí (08≈07, 18≈17, 20≈10).

| Compás | Figuras | Clips |
|---|---|---|
| 1 | 2 blancas | 06 · 07 (mirando la pantalla) |
| 2 | negra, negra, blanca | 05 · 13 · 09 |
| 3 | negra, negra, blanca | 16 · 19 · 15 |
| 4 | negra, negra, blanca | 17 · 01 · 21 |
| 5 (8,20 s) | — | aparece el logo; la toma 21 sigue y se funde progresivamente al #15372D puro (último ~0,35 s, color puro) |

- Clips oscuros o pixelados (luma < 75): reducción de ruido suave y contraste +28 %.
- Color: corrección hacia verde/cian + capa #15372D en modo *screen* al 50 % y saturación al 85 %.
  La placa final termina en ese verde puro, sin fundido a negro.
- Audio de los inserts al **50 %**.
- El logo (PNG con transparencia) no se usa en el montaje, solo en la placa final.

## Render
```bash
python3 ritmo.py musica.mp3 --json ritmo.json
python3 montaje.py --clips <carpeta_clips> --music musica.mp3 --ritmo ritmo.json --logo logo_la_nueve.png --out la_nueve_10s.mp4
```
`--music-at N` elige otro punto del tema (se ajusta al downbeat más cercano).

## Portada para Instagram
El primer cuadro es la toma 06 (público mirando la pantalla), así la vista previa no queda negra.
`montaje.py` además exporta `<salida>_portada.jpg` para subir como **Portada** del Reel
(Editar portada → Agregar desde el carrete).
