#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Mirador — baja el modelo MoveNet (TF.js) a vendor/movenet/ para funcionar sin internet.
#  Correr una vez con internet: ./descargar_modelo.sh   (Mac/Linux; en Windows: descargar_modelo.bat)
#  Baja MultiPose Lightning (hasta 6 cuerpos) y SinglePose Lightning (respaldo). ~9 MB + ~5 MB.
# ─────────────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"
bajar() {  # $1 = nombre de carpeta destino, $2 = URL base de tfhub (formato tfjs)
  local dest="vendor/movenet/$1" base="$2"
  mkdir -p "$dest"
  echo "→ $1"
  curl -fsSL "$base/model.json?tfjs-format=file" -o "$dest/model.json"
  # los pesos están listados dentro de model.json (weightsManifest[].paths)
  python3 -I - "$dest" "$base" <<'PY'
import json, sys, urllib.request, os
dest, base = sys.argv[1], sys.argv[2]
m = json.load(open(os.path.join(dest, 'model.json')))
for grp in m.get('weightsManifest', []):
    for p in grp.get('paths', []):
        url = f"{base}/{p}?tfjs-format=file"
        out = os.path.join(dest, p)
        print('   ', p)
        urllib.request.urlretrieve(url, out)
PY
}
bajar multipose-lightning "https://tfhub.dev/google/tfjs-model/movenet/multipose/lightning/1/default/1"
bajar singlepose-lightning "https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4/default/4"
echo "Listo: vendor/movenet/ ($(du -sh vendor/movenet | cut -f1)). Mirador lo usa solo si existe."
