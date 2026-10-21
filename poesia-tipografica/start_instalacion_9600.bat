@echo off
REM ─────────────────────────────────────────────────────────────
REM  Umbral — instalación en 9600 x 1080 (cinco proyectores de 1920 x 1080)
REM  El primer proyector (los primeros 1920 px, a la izquierda) está apagado:
REM  todo se compone y se ve en los otros cuatro (7680 x 1080).
REM
REM  Windows tiene que ver UNA sola pantalla de 9600 x 1080 (NVIDIA Surround,
REM  splitter / procesador de video wall). Si en cambio ve cinco pantallas
REM  separadas (escritorio extendido), quitar el REM de la línea «set UMBRAL_VENTANA».
REM ─────────────────────────────────────────────────────────────
set UMBRAL_FORMATO=9600x1080@1920
REM set UMBRAL_VENTANA=0,0,9600,1080
call "%~dp0start_instalacion.bat"
