#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Poesía Tipográfica — arranque en macOS (MacBook Air / Apple Silicon)
#  Doble clic en Finder (la primera vez: clic derecho → Abrir).
#
#  1. Prepara Python (.venv) y Node (node_modules, build) si falta algo.
#  2. Si no existe .env, pide la clave de OpenAI y lo crea (queda sólo en esta Mac).
#  3. Arranca Ollama si está instalado, el backend y el frontend.
#  4. Impide que la Mac se duerma mientras dura el show (caffeinate).
#  5. Abre Chrome en modo kiosk. Cerrar esta ventana de Terminal apaga todo.
# ─────────────────────────────────────────────────────────────────────────────
set -u
cd "$(dirname "$0")" || exit 1
mkdir -p logs

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m[!] %s\033[0m\n' "$*"; read -r -p "Enter para cerrar…" _; exit 1; }

# Homebrew en Apple Silicon no siempre está en el PATH de una ventana nueva
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"

# ── Python ≥ 3.10 (el python3 de Xcode suele ser 3.9) ───────────────────────
PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    PY="$c"; break
  fi
done
[ -z "$PY" ] && fail "Falta Python 3.10 o superior. Instálalo con:  brew install python@3.12"
command -v node >/dev/null 2>&1 || fail "Falta Node.js. Instálalo con:  brew install node"

if [ ! -x .venv/bin/python ]; then
  say "Preparando Python ($PY)…"
  "$PY" -m venv .venv || fail "No se pudo crear .venv"
  .venv/bin/python -m pip install --upgrade pip >/dev/null
  .venv/bin/pip install -r requirements.txt || fail "Falló pip install"
fi
if [ ! -d node_modules ]; then
  say "Instalando dependencias del frontend…"
  npm install || fail "Falló npm install"
fi
if [ ! -d dist ] || [ -n "$(find src index.html public -newer dist -print -quit 2>/dev/null)" ]; then
  say "Compilando el frontend…"
  npm run build || fail "Falló el build"
fi

# ── .env (la clave nunca va al repositorio) ──────────────────────────────────
if [ ! -f .env ]; then
  say "Primera vez: pega tu clave de OpenAI (no se mostrará) y Enter."
  read -r -s -p "OPENAI_API_KEY: " KEY; echo
  [ -z "$KEY" ] && fail "Sin clave no hay transcripción. Vuelve a abrir el script."
  sed "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$KEY|" .env.example > .env
  chmod 600 .env
  unset KEY
  say ".env creado (sólo en esta Mac)."
fi

# ── Ollama (opcional: director de arte local) ────────────────────────────────
if command -v ollama >/dev/null 2>&1; then
  if ! curl -s -m 2 http://localhost:11434/api/tags >/dev/null; then
    say "Arrancando Ollama…"
    (ollama serve > logs/ollama.log 2>&1 &)
    sleep 2
  fi
  MODEL="$(grep -E '^OLLAMA_MODEL=' .env | cut -d= -f2)"
  MODEL="${MODEL:-qwen2.5:7b}"
  if ! ollama list 2>/dev/null | grep -q "^${MODEL}"; then
    say "Descargando el modelo $MODEL (una sola vez)…"
    ollama pull "$MODEL" || echo "No se pudo descargar $MODEL: se usará el director heurístico."
  fi
else
  echo "Ollama no está instalado: se usará DeepSeek (si hay clave) o el director heurístico."
fi

# ── Arranque ─────────────────────────────────────────────────────────────────
PIDS=()
cleanup() {
  say "Apagando…"
  for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done
  exit 0
}
trap cleanup INT TERM HUP EXIT

say "Backend (micrófono + OpenAI + director de arte)…"
echo "Si macOS pregunta por el micrófono: Permitir. (Ajustes del Sistema → Privacidad y seguridad → Micrófono → Terminal)"
.venv/bin/python server.py > >(tee logs/server.log) 2>&1 &
PIDS+=($!)

npx vite preview --port 5173 --strictPort > logs/frontend.log 2>&1 &
PIDS+=($!)

# Sin suspensión de pantalla ni de sistema mientras esta ventana esté abierta
caffeinate -dimsu &
PIDS+=($!)

for _ in $(seq 1 40); do curl -s -m 1 http://127.0.0.1:5173/ >/dev/null && break; sleep 0.25; done

URL="http://127.0.0.1:5173/"
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --kiosk --no-first-run --disable-infobars \
    --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch \
    --autoplay-policy=no-user-gesture-required --disable-features=Translate \
    --user-data-dir="$PWD/.chrome-kiosk" "$URL"
else
  echo "Chrome no está instalado: abro el navegador por defecto (F = pantalla completa)."
  open "$URL"
fi

say "En marcha. Teclas en la ventana del show: C panel · 1-9 artistas · S grabar · T palabras · L loop."
echo "Para apagar: cierra esta ventana o Ctrl+C. Para salir del kiosk: Cmd+Q en Chrome."
wait
