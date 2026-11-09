# La Nueve – Lugares 3 · montaje de 20 s

Video vertical 1080×1920, 30 fps, 20 s. Música: Nils Frahm – *Familiar*.

## Ritmo (`ritmo.py`)
- Tempo: **117,2 BPM** → negra 0,512 s · corchea 0,256 s · semicorchea 0,128 s · compás 4/4 2,047 s.
- La música entra en el **primer tiempo de compás a los 2:17,3** (zona media del tema, la de más energía),
  con fade-in de 1 s y fade-out durante la placa del logo.

## Edición (`montaje.py`)
41 cortes sobre la grilla de corcheas, en 8 compases:

| Compás | Figuras | Idea |
|---|---|---|
| 1 | 2 blancas | apertura: la proyección |
| 2 | 4 negras | el público |
| 3 | negras + 2 corcheas | primera aceleración |
| 4 | 4 corcheas + 2 negras | |
| 5 | blanca + 2 negras | respiro |
| 6 | 6 corcheas + negra | |
| 7 | 8 corcheas, punch-in alternado | ráfaga |
| 8 | 2 negras + 4 corcheas | cierre |
| 9 (16,37 s) | — | corte seco a negro + logo de La Nueve |

- Audio de los inserts al **50 %**.
- El logo (PNG con transparencia) no se usa en el montaje, solo en la placa final.

## Render
```bash
python3 ritmo.py musica.mp3 --json ritmo.json
python3 montaje.py --clips <carpeta_clips> --music musica.mp3 --ritmo ritmo.json --logo logo_la_nueve.png --out la_nueve_20s.mp4
```
`--music-at N` elige otro punto del tema (se ajusta al downbeat más cercano).
