@echo off
REM ─────────────────────────────────────────────────────────────
REM  Mirador — sala inmersiva: 7 proyectores Full HD en fila = 13440 x 1080
REM
REM  Dos maneras de que Windows muestre la imagen entera:
REM   A) Windows ve UNA pantalla de 13440x1080 (procesador de video wall / splitter
REM      tipo Datapath Fx4 o Matrox QuadHead2Go, o NVIDIA Surround/Mosaic).
REM      -> poner MIRADOR_KIOSK=1 (pantalla completa) y borrar MIRADOR_VENTANA.
REM   B) Escritorio extendido con los 7 proyectores en fila desde la esquina 0,0.
REM      -> una ventana sin bordes de 13440x1080 en 0,0 que cruza todas las pantallas
REM         (es lo que hace este archivo por defecto).
REM  Si el primer proyector tiene 40 px extra, usar 13480x1080 en las dos líneas.
REM  Recordatorio: una RTX 3070 Ti maneja 4 pantallas; para 7 hace falta un
REM  procesador de video wall o una segunda placa. Ver README.
REM ─────────────────────────────────────────────────────────────
set MIRADOR_SALIDA=13440x1080
set MIRADOR_VENTANA=0,0,13440,1080
REM set MIRADOR_KIOSK=1
set MIRADOR_AUDIO=mic
call "%~dp0start_windows.bat"
