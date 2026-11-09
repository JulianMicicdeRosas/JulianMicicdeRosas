#!/bin/bash
# Arma deploy/GGJ/ (versión HTML animada, sin video) y GGJ.zip para subir al hosting.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); SRC=$(cd "$HERE/.." && pwd); OUT="$HERE/GGJ"
rm -rf "$OUT" "$HERE/GGJ.zip"; mkdir -p "$OUT/assets"
cp "$SRC/index.html" "$SRC/reel.js" "$OUT/"
cp -r "$SRC/assets/photos" "$SRC/assets/fonts" "$SRC/assets/logos" "$OUT/assets/"
cp "$SRC/assets/soundtrack.m4a" "$SRC/assets/og.jpg" "$OUT/assets/"
cat > "$OUT/.htaccess" <<'HT'
AddType font/woff2 .woff2
AddType audio/mp4 .m4a
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpeg "access plus 30 days"
  ExpiresByType image/png "access plus 30 days"
  ExpiresByType font/woff2 "access plus 1 year"
  ExpiresByType audio/mp4 "access plus 30 days"
</IfModule>
HT
(cd "$HERE" && zip -q -r GGJ.zip GGJ)
echo "Listo: $OUT  ($(du -sh "$OUT" | cut -f1))  y  $HERE/GGJ.zip"
