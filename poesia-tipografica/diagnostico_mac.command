#!/bin/bash
# Diagnóstico: prueba la clave/API de OpenAI y graba 2 s del micrófono. No cambia nada.
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then
  echo "Primero abre start_mac.command una vez (prepara Python)."
else
  .venv/bin/python server.py --check
fi
read -r -p "Enter para cerrar…" _
