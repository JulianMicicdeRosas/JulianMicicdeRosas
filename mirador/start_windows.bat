@echo off
REM ─────────────────────────────────────────────────────────────
REM  Mirador — arranque en Windows (un proyector o pruebas)
REM  Sirve la carpeta por http://localhost:8765 (necesario para la cámara)
REM  y abre Chrome (o Edge) en modo aplicación. Cerrar esta ventana apaga el servidor.
REM
REM  Variables opcionales (se pueden fijar antes de llamar, ver start_13440.bat):
REM    MIRADOR_SALIDA   = 13440x1080 | 1920x1080 | ventana   (formato de salida)
REM    MIRADOR_VENTANA  = x,y,ancho,alto   (posición y tamaño de la ventana de Chrome)
REM    MIRADOR_KIOSK    = 1  (pantalla completa kiosk en la pantalla principal)
REM    MIRADOR_AUDIO    = mic | cancion | off
REM ─────────────────────────────────────────────────────────────
setlocal
cd /d "%~dp0"
set PORT=8765
if "%MIRADOR_SALIDA%"=="" set MIRADOR_SALIDA=ventana
if "%MIRADOR_AUDIO%"=="" set MIRADOR_AUDIO=off

where python >nul 2>nul || (echo Falta Python. Instalalo con:  winget install Python.Python.3.12   y volve a abrir este archivo. & pause & exit /b 1)
if not exist vendor\movenet\multipose-lightning\model.json (
  echo Aviso: el modelo de pose no esta descargado. Con internet se baja solo al abrir; sin internet, corre descargar_modelo.bat antes.
)
REM cierra un servidor anterior en el mismo puerto
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>nul
start "Mirador servidor" /min python -m http.server %PORT% --bind 127.0.0.1
timeout /t 1 /nobreak >nul

set URL=http://127.0.0.1:%PORT%/index.html?salida=%MIRADOR_SALIDA%^&audio=%MIRADOR_AUDIO%
set CHROME=
for %%c in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if "%CHROME%"=="" if exist %%c set CHROME=%%c
)
if "%CHROME%"=="" (echo No encuentro Chrome ni Edge; abro el navegador predeterminado. & start "" "%URL%" & goto fin)

set FLAGS=--no-first-run --disable-infobars --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch ^
 --autoplay-policy=no-user-gesture-required --disable-backgrounding-occluded-windows --disable-renderer-backgrounding ^
 --disable-background-timer-throttling --disable-features=Translate,CalculateNativeWinOcclusion,IntensiveWakeUpThrottling ^
 --ignore-gpu-blocklist --enable-gpu-rasterization --user-data-dir="%CD%\.chrome-mirador"

if "%MIRADOR_KIOSK%"=="1" (
  start "" %CHROME% %FLAGS% --kiosk "%URL%"
) else if not "%MIRADOR_VENTANA%"=="" (
  for /f "tokens=1-4 delims=," %%a in ("%MIRADOR_VENTANA%") do (
    start "" %CHROME% %FLAGS% --app="%URL%" --window-position=%%a,%%b --window-size=%%c,%%d
  )
) else (
  start "" %CHROME% %FLAGS% --app="%URL%" --window-size=1600,900
)
:fin
echo.
echo Mirador en marcha en %URL%
echo Teclas: H panel - F pantalla completa - C esquinas - B negro - R grabar - M microfono - Espacio cancion - 1..9 plantillas
echo Cerra esta ventana para apagar el servidor.
pause >nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>nul
