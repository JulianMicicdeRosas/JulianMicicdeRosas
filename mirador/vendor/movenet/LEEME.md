# Modelo MoveNet (TF.js) para funcionar sin internet

- `multipose-lightning/` — MoveNet MultiPose Lightning (hasta 6 cuerpos). Entrada dinámica.
- `singlepose-lightning/` — MoveNet SinglePose Lightning (respaldo, 1 cuerpo, 192×192).

Origen: modelos de Google (Apache 2.0, https://tfhub.dev/google/tfjs-model/movenet/) en la conversión a TF.js
publicada en el paquete npm `@vladmandic/human-models` (MIT, ver LICENSE-human-models). Se cambió la firma de
entrada del multipose a alto/ancho dinámicos (igual que el model.json oficial) para que la librería
`@tensorflow-models/pose-detection` pueda redimensionar según la proporción de la cámara.

Para reemplazar por la copia oficial de tfhub: `./descargar_modelo.sh` (Mac/Linux) o `descargar_modelo.bat` (Windows).
