#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Importar logos → Documentos/Umbral/logos/{organizadores,socio-cultural,patrocinadores}
#  Doble clic. Busca la carpeta «FLAT 2026 - Logos…» en Descargas (o arrastra otra carpeta
#  a esta ventana). Reconoce las subcarpetas por su nombre, convierte PDF a PNG y copia todo.
#  Los logos quedan en tu Mac (sin internet) y no se borran al actualizar el programa.
# ─────────────────────────────────────────────────────────────────────────────
set -u
DST="$HOME/Documents/Umbral/logos"
IMG_EXT="png jpg jpeg webp svg gif"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# 1) carpeta de origen: argumento, la más reciente «FLAT*Logos*» en Descargas, o la que arrastres
SRC="${1:-}"
if [ -z "$SRC" ]; then
  SRC="$(ls -dt "$HOME"/Downloads/*[Ll]ogo* 2>/dev/null | head -1)"
fi
if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
  echo "No encontré la carpeta de logos en Descargas."
  read -r -p "Arrastra aquí la carpeta de logos y aprieta Enter: " SRC
  SRC="${SRC%\"}"; SRC="${SRC#\"}"; SRC="${SRC%/}"; SRC="${SRC//\\ / }"
fi
[ -d "$SRC" ] || { echo "No existe: $SRC"; read -r -p "Enter para cerrar…" _; exit 1; }
say "Origen: $SRC"

norm() { # minúsculas, sin tildes, sin espacios/guiones
  echo "$1" | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null | tr 'A-Z' 'a-z' | tr -d ' _-'
}
group_of() {
  local n; n="$(norm "$1")"
  case "$n" in
    *organiz*) echo organizadores ;;
    *socio*|*cultural*) echo socio-cultural ;;
    *patrocin*|*sponsor*) echo patrocinadores ;;
    *) echo "" ;;
  esac
}

copy_group() { # $1 carpeta origen, $2 grupo
  local src="$1" g="$2" n=0
  mkdir -p "$DST/$g"
  # reemplazar lo anterior de ese grupo
  find "$DST/$g" -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.svg' -o -iname '*.gif' \) -delete
  while IFS= read -r -d '' f; do
    local base ext; base="$(basename "$f")"; ext="$(echo "${base##*.}" | tr 'A-Z' 'a-z')"
    if [[ " $IMG_EXT " == *" $ext "* ]]; then
      cp "$f" "$DST/$g/$base" && n=$((n + 1))
    elif [ "$ext" = "pdf" ] || [ "$ext" = "tif" ] || [ "$ext" = "tiff" ] || [ "$ext" = "heic" ]; then
      # PDF/TIFF/HEIC → PNG con la herramienta de macOS (primera página, 1600 px)
      if sips -s format png -Z 1600 "$f" --out "$DST/$g/${base%.*}.png" >/dev/null 2>&1; then
        n=$((n + 1)); echo "   convertido a PNG: $base"
      else
        echo "   ⚠ no pude convertir: $base"
      fi
    elif [ "$ext" = "ai" ] || [ "$ext" = "eps" ]; then
      echo "   ⚠ $base: exportalo como PNG o PDF desde Illustrator"
    fi
  done < <(find "$src" -type f ! -name '.*' -print0 | sort -z)
  echo "✓ $g: $n logo(s)"
}

found=0
# subcarpetas (hasta 2 niveles, por si el ZIP de Drive agrega una carpeta intermedia)
while IFS= read -r -d '' d; do
  g="$(group_of "$(basename "$d")")"
  if [ -n "$g" ]; then
    copy_group "$d" "$g"
    found=$((found + 1))
  fi
done < <(find "$SRC" -mindepth 1 -maxdepth 2 -type d -print0)

if [ "$found" -eq 0 ]; then
  echo "⚠ No reconocí subcarpetas «organizadores», «socio cultural» o «patrocinadores» en:"
  ls -1 "$SRC"
  echo "Renombrá las subcarpetas con esas palabras y volvé a abrir este script."
else
  say "Listo. Los logos quedaron en: $DST"
  echo "Para fijar el orden dentro de cada grupo, numerá los archivos (01-…, 02-…)."
  open "$DST" 2>/dev/null
fi
read -r -p "Enter para cerrar…" _
