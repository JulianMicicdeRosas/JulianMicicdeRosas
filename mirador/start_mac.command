#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Mirador — arranque en macOS (MacBook Air). Doble clic en Finder
#  (la primera vez: clic derecho → Abrir). Sirve la carpeta en localhost:8765,
#  impide que la Mac se duerma y abre Chrome en modo aplicación.
#  Variables opcionales: MIRADOR_SALIDA=13440x1080  MIRADOR_AUDIO=mic  MIRADOR_KIOSK=1
# ─────────────────────────────────────────────────────────────────────────────
set -u
cd "$(dirname "$0")" || exit 1
PORT=8765
SALIDA="${MIRADOR_SALIDA:-ventana}"
AUDIO="${MIRADOR_AUDIO:-off}"
command -v python3 >/dev/null 2>&1 || { echo "Falta python3 (viene con Xcode Command Line Tools: xcode-select --install)"; read -r -p "Enter para cerrar…" _; exit 1; }
[ -f vendor/movenet/multipose-lightning/model.json ] || echo "Aviso: el modelo de pose no está descargado (./descargar_modelo.sh). Con internet se baja solo."
# cierra un servidor anterior
lsof -ti tcp:$PORT | xargs kill 2>/dev/null
python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
caffeinate -dimsu &
CAF=$!
trap 'kill $SRV $CAF 2>/dev/null; exit 0' INT TERM HUP EXIT
sleep 1
URL="http://127.0.0.1:$PORT/index.html?salida=$SALIDA&audio=$AUDIO"
FLAGS=(--no-first-run --disable-infobars --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch
  --autoplay-policy=no-user-gesture-required --disable-backgrounding-occluded-windows --disable-renderer-backgrounding
  --disable-background-timer-throttling --disable-features=Translate,IntensiveWakeUpThrottling --user-data-dir="$PWD/.chrome-mirador")
if [ -d "/Applications/Google Chrome.app" ]; then
  if [ "${MIRADOR_KIOSK:-}" = "1" ]; then open -na "Google Chrome" --args "${FLAGS[@]}" --kiosk "$URL"
  else open -na "Google Chrome" --args "${FLAGS[@]}" --app="$URL" --window-size=1600,900; fi
else
  echo "Chrome no está instalado: abro el navegador por defecto (Safari no soporta todo)."; open "$URL"
fi
printf '\nMirador en marcha: %s\nTeclas: H panel · F pantalla completa · C esquinas · B negro · R grabar · M micrófono · Espacio canción · 1‑9 plantillas\nCerrá esta ventana (o Ctrl+C) para apagar.\n' "$URL"
wait $SRV
