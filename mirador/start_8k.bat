@echo off
REM ─────────────────────────────────────────────────────────────
REM  Mirador — sala inmersiva con UNA salida 8K (7680 x 4320) a un splitter
REM  que reparte 7 ventanas Full HD a los proyectores.
REM
REM  El programa compone el panorama de 13440 x 1080 (7 franjas de 1920) y lo
REM  entrega como MOSAICO dentro del cuadro 8K: por defecto 4 franjas en la fila
REM  de arriba (y=0) y 3 en la segunda (y=1080), de izquierda a derecha.
REM  El splitter tiene que recortar sus 7 salidas en esas coordenadas; si usa
REM  otras, se escriben en Proyección → "Salida 8K a splitter" → mapa a mano,
REM  y quedan guardadas en la sesión.
REM
REM  Windows: la pantalla 8K a 7680 x 4320, escala 100 %, 60 Hz (DSC) o 30 Hz.
REM  La RTX 3070 Ti saca 8K por HDMI 2.1 o DisplayPort 1.4a con DSC.
REM ─────────────────────────────────────────────────────────────
set MIRADOR_SALIDA=13440x1080
set MIRADOR_MOSAICO=7680x4320
set MIRADOR_KIOSK=1
set MIRADOR_AUDIO=mic
call "%~dp0start_windows.bat"
