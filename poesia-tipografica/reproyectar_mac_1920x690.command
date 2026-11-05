#!/bin/bash
# Re-proyección en 1920 x 690 (doble clic).
cd "$(dirname "$0")"
export FLAT_FORMATO=1920x690 FLAT_VENTANA=0,0,1920,690
exec ./reproyectar_mac.command "$@"
