#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Umbral — re-proyección de una sesión grabada (Mac)
#  Elige la sesión en esta ventana: el audio sale por la salida de sonido de la Mac
#  y el show se repite igual (mismas palabras, imágenes, teclas y tiempos).
#  Uso avanzado:  ./reproyectar_mac.command        → elegir de la lista
#                 bash reproyectar_mac.command ultima --desde 12:30
# ─────────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1
mkdir -p logs
if [ ! -x .venv/bin/python ]; then
  echo "Primero abre start_mac.command una vez: prepara el programa."
  read -r -n1 -p "Pulsa una tecla para cerrar…"
  exit 1
fi
if [ ! -d dist ] || [ -n "$(find src index.html public -newer dist -print -quit 2>/dev/null)" ]; then
  echo "Compilando el frontend…"
  npm run build || exit 1
fi

PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT INT TERM HUP

npx vite preview --port 5173 --strictPort > logs/frontend.log 2>&1 &
PIDS+=($!)
caffeinate -dimsu &
PIDS+=($!)

(
  for _ in $(seq 1 40); do curl -s -m 1 http://127.0.0.1:5173/ >/dev/null && break; sleep 0.25; done
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --kiosk --no-first-run --disable-infobars \
      --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch \
      --autoplay-policy=no-user-gesture-required --disable-features=Translate \
      --user-data-dir="$PWD/.chrome-kiosk" "http://127.0.0.1:5173/"
  else
    open "http://127.0.0.1:5173/"
  fi
) &

SESION="${1:-elegir}"
[ $# -gt 0 ] && shift
.venv/bin/python server.py --replay "$SESION" "$@"
