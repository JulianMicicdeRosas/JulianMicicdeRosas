@echo off
REM ─────────────────────────────────────────────────────────────
REM  Abre el show en Chrome (o Edge). Lo usan start_instalacion.bat y reproyectar.bat.
REM  Variables opcionales (las fijan los lanzadores de 9600):
REM    UMBRAL_FORMATO  formato de salida que manda sobre el panel C, p. ej. 9600x1080@1920
REM                    (@1920 = los primeros 1920 px no se ven: ese proyector está apagado)
REM    UMBRAL_VENTANA  x,y,ancho,alto: en vez de pantalla completa (kiosk), una ventana de esa medida.
REM                    Sólo hace falta si Windows ve los proyectores como pantallas separadas.
REM ─────────────────────────────────────────────────────────────
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe
REM sin Chrome: Microsoft Edge (viene con Windows y también tiene modo kiosk)
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe

set "UMBRAL_URL=http://127.0.0.1:5173/"
if defined UMBRAL_FORMATO set "UMBRAL_URL=http://127.0.0.1:5173/?formato=%UMBRAL_FORMATO%"

REM GPU dedicada (p. ej. RTX 3070 Ti): forzar la placa de alto rendimiento y no caer en la integrada
set FLAGS=--no-first-run --disable-infobars --force_high_performance_gpu --ignore-gpu-blocklist --enable-gpu-rasterization --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch --autoplay-policy=no-user-gesture-required --disable-features=Translate

if defined UMBRAL_VENTANA goto :ventana
start "" "%CHROME%" --kiosk --start-fullscreen %FLAGS% --user-data-dir="%~dp0.chrome-kiosk" "%UMBRAL_URL%"
exit /b 0

:ventana
for /f "tokens=1-4 delims=," %%a in ("%UMBRAL_VENTANA%") do (
  set VX=%%a
  set VY=%%b
  set VW=%%c
  set VH=%%d
)
start "" "%CHROME%" --app="%UMBRAL_URL%" --window-position=%VX%,%VY% --window-size=%VW%,%VH% %FLAGS% --user-data-dir="%~dp0.chrome-ventana"
exit /b 0
