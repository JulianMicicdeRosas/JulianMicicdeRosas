#!/bin/bash
# Show en 1920 x 690 (doble clic). Pregunta pantalla completa o ventana de 1920 x 690.
cd "$(dirname "$0")"
export FLAT_FORMATO=1920x690 FLAT_VENTANA=0,0,1920,690
exec ./start_mac.command "$@"
