@echo off
REM ─────────────────────────────────────────────────────────────
REM  Umbral — re-proyección de una sesión grabada en 13480 x 1080
REM  (los primeros 1920 px no se ven). Ver start_instalacion_13480.bat.
REM ─────────────────────────────────────────────────────────────
set UMBRAL_FORMATO=13480x1080@1920
set UMBRAL_VENTANA=0,0,13480,1080
call "%~dp0reproyectar.bat"
