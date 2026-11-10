@echo off
REM -------------------------------------------------------------
REM  Mirador ? arranque en Windows (un proyector o pruebas)
REM  Sirve la carpeta por http://127.0.0.1:8765 (necesario para la camara)
REM  y abre Chrome (o Edge) en modo aplicacion. Cerrar esta ventana apaga el servidor.
REM
REM  Variables opcionales (se fijan antes de llamar; ver start_8k.bat y start_13440.bat):
REM    MIRADOR_SALIDA   = 13440x1080 | 1920x1080 | ventana   (formato de salida)
REM    MIRADOR_VENTANA  = x,y,ancho,alto   (posicion y tamano de la ventana de Chrome)
REM    MIRADOR_KIOSK    = 1  (pantalla completa kiosk en la pantalla principal)
REM    MIRADOR_AUDIO    = mic | cancion | off
REM    MIRADOR_MOSAICO  = 7680x4320  (salida 8K a splitter)
REM    MIRADOR_AJUSTE   = estirar  (el lienzo llena la ventana; para capturarla con OBS y estirarla en Resolume)
REM    MIRADOR_CDP      = 9222  (puerto local de depuracion, para manejar Mirador desde afuera; acepta la camara sin preguntar)
REM -------------------------------------------------------------
setlocal EnableExtensions
cd /d "%~dp0"
set "PORT=8765"
if not defined MIRADOR_SALIDA set "MIRADOR_SALIDA=ventana"
if not defined MIRADOR_AUDIO set "MIRADOR_AUDIO=off"
title Mirador

REM -- Python ---------------------------------------------------
set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  echo Falta Python. Instalalo con:   winget install Python.Python.3.12
  echo y volve a abrir este archivo.
  pause
  exit /b 1
)

REM -- Servidor local (ventana aparte, minimizada) --------------
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>nul
start "Mirador servidor (no cerrar)" /min %PY% -m http.server %PORT% --bind 127.0.0.1
timeout /t 2 /nobreak >nul

REM -- Direccion ------------------------------------------------
set "URL=http://127.0.0.1:%PORT%/index.html?salida=%MIRADOR_SALIDA%&audio=%MIRADOR_AUDIO%"
if defined MIRADOR_MOSAICO set "URL=%URL%&mosaico=%MIRADOR_MOSAICO%"
if defined MIRADOR_AJUSTE set "URL=%URL%&ajuste=%MIRADOR_AJUSTE%"

REM -- Buscar Chrome o Edge -------------------------------------
set "NAV="
for %%c in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do (
  if not defined NAV if exist "%%~c" set "NAV=%%~c"
)
if not defined NAV for /f "tokens=2*" %%a in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" /ve 2^>nul') do if exist "%%~b" set "NAV=%%~b"
if not defined NAV for /f "tokens=2*" %%a in ('reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" /ve 2^>nul') do if exist "%%~b" set "NAV=%%~b"
if not defined NAV for %%c in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if not defined NAV if exist "%%~c" set "NAV=%%~c"
)

set "PERFIL=%CD%\.chrome-mirador"
set "FLAGS=--new-window --no-first-run --disable-infobars --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch --autoplay-policy=no-user-gesture-required --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --disable-features=Translate,CalculateNativeWinOcclusion,IntensiveWakeUpThrottling --ignore-gpu-blocklist --force_high_performance_gpu"
if defined MIRADOR_CDP set "FLAGS=%FLAGS% --remote-debugging-port=%MIRADOR_CDP% --remote-debugging-address=127.0.0.1 --use-fake-ui-for-media-stream"

echo.
echo  Mirador
echo  direccion : %URL%
if defined NAV (echo  navegador : %NAV%) else (echo  navegador : no encontre Chrome ni Edge; uso el predeterminado)
echo.

REM -- Abrir ----------------------------------------------------
if not defined NAV (
  start "" "%URL%"
  goto fin
)
if "%MIRADOR_KIOSK%"=="1" (
  start "" "%NAV%" %FLAGS% --user-data-dir="%PERFIL%" --kiosk "%URL%"
  goto fin
)
if defined MIRADOR_VENTANA (
  for /f "tokens=1-4 delims=," %%a in ("%MIRADOR_VENTANA%") do start "" "%NAV%" %FLAGS% --user-data-dir="%PERFIL%" --app="%URL%" --window-position=%%a,%%b --window-size=%%c,%%d
  goto fin
)
start "" "%NAV%" %FLAGS% --user-data-dir="%PERFIL%" --app="%URL%" --window-size=1600,900

:fin
echo  Si el navegador no se abrio solo, abri Chrome y entra a:  %URL%
echo  Teclas: H panel - F pantalla completa - C esquinas - B negro - R grabar - M microfono - Espacio cancion - 1..9 plantillas
echo.
echo  Cerra esta ventana para apagar el servidor.
pause >nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>nul
