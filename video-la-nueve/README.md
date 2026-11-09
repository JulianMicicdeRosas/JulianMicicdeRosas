# La Nueve – Lugares 3 · montaje de 10 s

Video vertical 1080×1920, 30 fps, **10 s**. Tono general: verde #15372D (imagen de referencia). Música: Nils Frahm – *Familiar*.

## Ritmo (`ritmo.py`)
- Tempo: **117,2 BPM** → negra 0,512 s · corchea 0,256 s · semicorchea 0,128 s · compás 4/4 2,047 s.
- La música entra en el **primer tiempo de compás a los 2:17,3** (zona media del tema, la de más energía),
  con fade-in de 0,5 s y fade-out durante la placa del logo.

## Edición (`montaje.py`)
19 cortes sobre la grilla de corcheas, en 4 compases. **Cada clip se usa una sola vez**: no se repite ningún cuadro.

| Compás | Figuras | Idea |
|---|---|---|
| 1 | 2 blancas | apertura: la proyección |
| 2 | 3 negras + 2 corcheas | el público |
| 3 | 2 negras + 2 corcheas + negra | aceleración |
| 4 | 6 corcheas con punch-in alternado + negra | ráfaga |
| 5 (8,20 s) | — | corte seco al verde + logo de La Nueve |

- Color: corrección hacia verde/cian + capa #15372D en modo *screen* al 50 % y saturación al 85 %.
  La placa final usa ese mismo verde de fondo.
- Audio de los inserts al **50 %**.
- El logo (PNG con transparencia) no se usa en el montaje, solo en la placa final.

## Render
```bash
python3 ritmo.py musica.mp3 --json ritmo.json
python3 montaje.py --clips <carpeta_clips> --music musica.mp3 --ritmo ritmo.json --logo logo_la_nueve.png --out la_nueve_10s.mp4
```
`--music-at N` elige otro punto del tema (se ajusta al downbeat más cercano).
