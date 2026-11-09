#!/bin/bash
# Sube la versión HTML del showreel a https://elzorroazul.studio/GGJMendoza/ por SFTP.
#
#   ./subir_sftp.sh USUARIO@HOST [PUERTO] [CARPETA_WEB]
#
# CARPETA_WEB es la raíz pública del sitio (por defecto public_html). La contraseña la pide sftp.
set -euo pipefail
DEST=${1:?Uso: ./subir_sftp.sh USUARIO@HOST [PUERTO] [CARPETA_WEB]}
PORT=${2:-21098}
WEBROOT=${3:-public_html}
HERE=$(cd "$(dirname "$0")" && pwd)
"$HERE/armar_web.sh" >/dev/null
cd "$HERE"
sftp -P "$PORT" -b - "$DEST" <<SFTP
-mkdir $WEBROOT/GGJMendoza
put -r GGJMendoza/. $WEBROOT/GGJMendoza
ls -l $WEBROOT/GGJMendoza
SFTP
echo "Listo → https://elzorroazul.studio/GGJMendoza/"
