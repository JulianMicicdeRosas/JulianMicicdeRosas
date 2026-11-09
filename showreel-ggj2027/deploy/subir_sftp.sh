#!/bin/bash
# Publica la versión HTML del showreel en https://elzorroazul.studio/GGJ/ por SFTP.
# Sigue la guía «Subir a Namecheap»: entra con la llave del alias `flat-namecheap`
# (~/.ssh/config en la Mac de Julián), sin contraseña.
#
#   ./subir_sftp.sh            (usa el alias flat-namecheap)
#   ./subir_sftp.sh OTRO_ALIAS
set -euo pipefail
HOST=${1:-flat-namecheap}
HERE=$(cd "$(dirname "$0")" && pwd)
"$HERE/armar_web.sh" >/dev/null
cd "$HERE"
STAMP=$(date +%Y%m%d-%H%M)
sftp -b - -o BatchMode=yes "$HOST" <<SFTP
-rename public_html/GGJ/index.html flat_backups/GGJ-index-$STAMP.html
-mkdir public_html/GGJ
put -r GGJ/. public_html/GGJ
chmod 755 public_html/GGJ
chmod 644 public_html/GGJ/index.html
chmod 644 public_html/GGJ/reel.js
chmod 644 public_html/GGJ/.htaccess
ls -l public_html/GGJ
SFTP
code=$(curl -s -o /dev/null -w '%{http_code}' https://elzorroazul.studio/GGJ/)
[ "$code" = 200 ] && echo "✓ Publicado → https://elzorroazul.studio/GGJ/" || echo "⚠ Revisar: la página respondió $code"
