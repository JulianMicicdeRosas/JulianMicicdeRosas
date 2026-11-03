@echo off
REM -------------------------------------------------------------
REM  Mirador - sala con UNA salida 8K (7680 x 4320) a un splitter
REM
REM  Lienzo de la sala: 8400 x 690 = Oeste 3175 + Norte 1775 + Este 3450
REM  (Oeste = pared izquierda, Este = pared derecha).
REM  En el cuadro 8K se entrega en MOSAICO, una baldosa por pared:
REM     Oeste 3175x690 en (0,0)   Norte 1775x690 en (3175,0)
REM     Este  3450x690 en (0,690)
REM  El splitter (o el software de mapeo) tiene que tomar cada pared de ahi.
REM  Si usa otra disposicion: Proyeccion -> "Salida 8K a splitter" -> mapa a mano
REM  (queda guardado en la sesion).
REM
REM  Windows: pantalla 8K a 7680 x 4320, escala 100 %, 60 Hz (DSC) o 30 Hz.
REM  La RTX 3070 Ti saca 8K por HDMI 2.1 o DisplayPort 1.4a con DSC.
REM -------------------------------------------------------------
set MIRADOR_SALIDA=8400x690
set MIRADOR_MOSAICO=7680x4320
set MIRADOR_KIOSK=1
set MIRADOR_AUDIO=mic
call "%~dp0start_windows.bat"
