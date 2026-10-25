@echo off
REM ─────────────────────────────────────────────────────────────
REM  Mirador — baja el modelo MoveNet a vendor\movenet\ (una vez, con internet)
REM  Después el programa funciona sin conexión.
REM ─────────────────────────────────────────────────────────────
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "function Bajar($nombre,$base){" ^
  "  $dest=Join-Path 'vendor\movenet' $nombre; New-Item -ItemType Directory -Force -Path $dest | Out-Null;" ^
  "  Write-Host ('-> '+$nombre);" ^
  "  Invoke-WebRequest -Uri ($base+'/model.json?tfjs-format=file') -OutFile (Join-Path $dest 'model.json');" ^
  "  $m=Get-Content (Join-Path $dest 'model.json') -Raw | ConvertFrom-Json;" ^
  "  foreach($g in $m.weightsManifest){ foreach($p in $g.paths){ Write-Host ('   '+$p); Invoke-WebRequest -Uri ($base+'/'+$p+'?tfjs-format=file') -OutFile (Join-Path $dest $p) } }" ^
  "}" ^
  "Bajar 'multipose-lightning' 'https://tfhub.dev/google/tfjs-model/movenet/multipose/lightning/1/default/1';" ^
  "Bajar 'singlepose-lightning' 'https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4/default/4';" ^
  "Write-Host 'Listo: vendor\movenet'"
if errorlevel 1 (echo. & echo Fallo la descarga. Revisa la conexion e intenta de nuevo. & pause & exit /b 1)
pause
