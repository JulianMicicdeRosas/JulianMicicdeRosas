# Herramientas

El video se arma con código. Para cambiarlo, editá estos scripts y regenerá:

```bash
python3 tools/greenify.py assets assets/matrix   # recolorea las imágenes a la paleta verde
python3 tools/generate.py .                      # reescribe index.html y compositions/*.html
```

- `generate.py`: colores (`GREEN`, `FILLS`, `BG`), qué imágenes son ojos (`EYES`),
  tamaño de los caracteres ASCII (`ASCII_SIZE`), la lluvia Matrix (`GLYPHS`, `COLW`, `FS`)
  y la composición de cada plano.
- `greenify.py`: la rampa de verdes (`stops`) y cuánto brillan los rojos (`red`).

Ojo: `generate.py` sobrescribe `index.html` y `compositions/`; los cambios hechos a mano ahí se pierden.
