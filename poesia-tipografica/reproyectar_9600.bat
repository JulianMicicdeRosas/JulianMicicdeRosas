@echo off
REM ─────────────────────────────────────────────────────────────
REM  Umbral — re-proyección de una sesión grabada en 9600 x 1080
REM  (los primeros 1920 px no se ven). Ver start_instalacion_9600.bat.
REM ─────────────────────────────────────────────────────────────
set UMBRAL_FORMATO=9600x1080@1920
REM set UMBRAL_VENTANA=0,0,9600,1080
call "%~dp0reproyectar.bat"
