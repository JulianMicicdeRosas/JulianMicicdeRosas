#!/bin/bash
# Sube la landing + el video a https://elzorroazul.studio/GGJMendoza/ por SFTP.
#
#   ./subir_sftp.sh USUARIO@HOST [PUERTO] [CARPETA_WEB]
#
# CARPETA_WEB es la raíz pública del sitio en el servidor (por defecto public_html).
# La contraseña la pide sftp de forma interactiva: no queda escrita en ningún archivo.
set -euo pipefail
DEST=${1:?Uso: ./subir_sftp.sh USUARIO@HOST [PUERTO] [CARPETA_WEB]}
PORT=${2:-22}
WEBROOT=${3:-public_html}
HERE=$(cd "$(dirname "$0")" && pwd)
cp "$HERE/../showreel_ggj2027.mp4" "$HERE/GGJMendoza/showreel_ggj2027.mp4"
sftp -P "$PORT" -b - "$DEST" <<SFTP
-mkdir $WEBROOT/GGJMendoza
put $HERE/GGJMendoza/index.html $WEBROOT/GGJMendoza/index.html
put $HERE/GGJMendoza/poster.jpg $WEBROOT/GGJMendoza/poster.jpg
put $HERE/GGJMendoza/og.jpg $WEBROOT/GGJMendoza/og.jpg
put $HERE/GGJMendoza/showreel_ggj2027.mp4 $WEBROOT/GGJMendoza/showreel_ggj2027.mp4
chmod 644 $WEBROOT/GGJMendoza/index.html
chmod 644 $WEBROOT/GGJMendoza/poster.jpg
chmod 644 $WEBROOT/GGJMendoza/og.jpg
chmod 644 $WEBROOT/GGJMendoza/showreel_ggj2027.mp4
ls -l $WEBROOT/GGJMendoza
SFTP
rm -f "$HERE/GGJMendoza/showreel_ggj2027.mp4"
echo "Listo → https://elzorroazul.studio/GGJMendoza/"
