@echo off
REM ─────────────────────────────────────────────────────────────
REM  Abre el show en Chrome (o Edge). Lo usan start_instalacion*.bat y reproyectar*.bat.
REM  Pregunta si va en PANTALLA COMPLETA o en VENTANA (sin respuesta en 10 s: pantalla completa).
REM  Variables opcionales (las fijan los lanzadores de 13480):
REM    FLAT_FORMATO  formato de salida que manda sobre el panel C, p. ej. 13480x1080@1920
REM                    (@1920 = los primeros 1920 px no se ven: ese proyector está apagado)
REM    FLAT_VENTANA  x,y,ancho,alto de la ventana (modo ventana). Sin ella: una ventana común de 1600 x 900.
REM    FLAT_MODO     P (pantalla completa) o V (ventana): no pregunta.
REM ─────────────────────────────────────────────────────────────
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe
REM sin Chrome: Microsoft Edge (viene con Windows y también tiene modo kiosk)
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe

set "FLAT_URL=http://127.0.0.1:5173/"
if defined FLAT_FORMATO set "FLAT_URL=http://127.0.0.1:5173/?formato=%FLAT_FORMATO%"

REM GPU dedicada (p. ej. RTX 3070 Ti): forzar la placa de alto rendimiento y no caer en la integrada.
REM Que siga animando y tomando aunque otra ventana quede encima (Alt+Tab): sin ahorro de energía para ventanas
REM tapadas ni en segundo plano, y sin frenar sus temporizadores.
set FLAGS=--no-first-run --disable-infobars --force_high_performance_gpu --ignore-gpu-blocklist --enable-gpu-rasterization --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch --autoplay-policy=no-user-gesture-required --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --disable-features=Translate,CalculateNativeWinOcclusion,IntensiveWakeUpThrottling

if /i "%FLAT_MODO%"=="P" goto :completa
if /i "%FLAT_MODO%"=="V" goto :ventana
echo.
echo   ¿Cómo se abre el show?
echo     P = pantalla completa (sin bordes; tecla F no hace falta)
if defined FLAT_VENTANA (
  echo     V = ventana de %FLAT_VENTANA% ^(x,y,ancho,alto^) que cruza las pantallas
) else (
  echo     V = ventana común ^(se puede mover y agrandar; F = pantalla completa^)
)
choice /c PV /n /t 10 /d P /m "  Elegí P o V (en 10 s: pantalla completa): "
if errorlevel 2 goto :ventana

:completa
start "" "%CHROME%" --kiosk --start-fullscreen %FLAGS% --user-data-dir="%~dp0.chrome-kiosk" "%FLAT_URL%"
exit /b 0

:ventana
if not defined FLAT_VENTANA (
  start "" "%CHROME%" --app="%FLAT_URL%" --window-position=40,40 --window-size=1600,900 %FLAGS% --user-data-dir="%~dp0.chrome-ventana"
  exit /b 0
)
for /f "tokens=1-4 delims=," %%a in ("%FLAT_VENTANA%") do (
  set VX=%%a
  set VY=%%b
  set VW=%%c
  set VH=%%d
)
start "" "%CHROME%" --app="%FLAT_URL%" --window-position=%VX%,%VY% --window-size=%VW%,%VH% %FLAGS% --user-data-dir="%~dp0.chrome-ventana"
exit /b 0
