@echo off
REM ─────────────────────────────────────────────────────────────
REM  Ciclo de charlas y talleres FLAT — instalación en 13480 x 1080
REM  El primer proyector (los primeros 1920 px, a la izquierda) está apagado:
REM  todo se compone y se ve en los 11560 x 1080 restantes.
REM  Si ese proyector se usa, cambiar la línea de abajo por:  set FLAT_FORMATO=13480x1080
REM
REM  Al abrir pregunta: P = pantalla completa (Windows tiene que ver UNA pantalla de
REM  13480 x 1080: NVIDIA Surround o un procesador de video wall) · V = ventana de
REM  13480 x 1080 desde la esquina 0,0, que cruza todas las pantallas (escritorio extendido).
REM ─────────────────────────────────────────────────────────────
set FLAT_FORMATO=13480x1080@1920
set FLAT_VENTANA=0,0,13480,1080
call "%~dp0start_instalacion.bat"
