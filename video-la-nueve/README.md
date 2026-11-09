# La Nueve – Lugares 3 · montaje de 20 s

Video vertical 1080×1920, 30 fps, 20 s.

- **0–17 s**: 18 inserts del álbum "La Nueve - Lugares 3" (~0,97 s c/u), audio de los inserts al **50 %**.
  Orden: proyección → público → cierre. Se descartan el clip 02 (casi negro) y la imagen del logo (no va en el montaje).
- **17–20 s**: fundido a tarjeta final en negro con el **logo de La Nueve** (fade-in) y fade-out.
- **Música**: pista de YouTube `tgwBXJE-9sM`, con fade-in corto y fade-out de 2 s.

## Render

```bash
python3 montaje.py --clips <carpeta_clips> --music musica.mp3 --logo logo_la_nueve.png --out la_nueve_20s.mp4
```

`--music-start N` permite empezar la canción en el segundo N (por ejemplo, en el estribillo).
Los clips se nombran por su posición en el álbum (01.mp4 … 21.mp4).
