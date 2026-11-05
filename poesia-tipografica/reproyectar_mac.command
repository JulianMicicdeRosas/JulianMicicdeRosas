#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  UMBRAL — re-proyección de una sesión grabada (Mac)
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

# Pantalla completa o ventana (sin respuesta en 10 s: pantalla completa). FLAT_MODO=P o V no pregunta.
MODO="${FLAT_MODO:-}"
if [ -z "$MODO" ]; then
  read -r -t 10 -n 1 -p "¿Pantalla completa (P) o ventana (V)? [en 10 s: pantalla completa] " MODO || true
  echo
fi
# FLAT_FORMATO (p. ej. 1920x690) manda sobre el panel C; FLAT_VENTANA=x,y,ancho,alto es la ventana del modo V.
SHOW_URL="http://127.0.0.1:5173/"
[ -n "${FLAT_FORMATO:-}" ] && SHOW_URL="${SHOW_URL}?formato=${FLAT_FORMATO}"
VENTANA="--window-size=1600,900"
if [ -n "${FLAT_VENTANA:-}" ]; then
  IFS=, read -r VX VY VW VH <<< "$FLAT_VENTANA"
  VENTANA="--window-position=$VX,$VY --window-size=$VW,$VH"
fi
case "$MODO" in
  v|V) CHROME_MODO="--app=$SHOW_URL $VENTANA"; PERFIL=ventana; DESTINO="" ;;
  *) CHROME_MODO="--kiosk"; PERFIL=kiosk; DESTINO="$SHOW_URL" ;;
esac

npx vite preview --port 5173 --strictPort > logs/frontend.log 2>&1 &
PIDS+=($!)
caffeinate -dimsu &
PIDS+=($!)

(
  for _ in $(seq 1 40); do curl -s -m 1 http://127.0.0.1:5173/ >/dev/null && break; sleep 0.25; done
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args $CHROME_MODO --no-first-run --disable-infobars \
      --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch \
      --autoplay-policy=no-user-gesture-required --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding --disable-background-timer-throttling \
    --disable-features=Translate,CalculateNativeWinOcclusion,IntensiveWakeUpThrottling \
      --user-data-dir="$PWD/.chrome-$PERFIL" $DESTINO
  else
    open "$SHOW_URL"
  fi
) &

SESION="${1:-elegir}"
[ $# -gt 0 ] && shift
.venv/bin/python server.py --replay "$SESION" "$@"
