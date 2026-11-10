@echo off
REM -------------------------------------------------------------
REM  Mirador - sala con OBS + Resolume (la forma en que esta armada la sala)
REM
REM  Cadena:  Mirador (Chrome, pantalla principal 1920x1080)
REM           -> OBS (captura de ventana, lienzo 1920x1080, salida NDI)
REM           -> Resolume (clip NDI ESTIRADO a la composicion 8400x690)
REM           -> Advanced Output (slices) -> salida 4096x2160 -> splitter -> proyectores
REM
REM  Mirador NO hace mosaico: entrega el lienzo 8400x690 entero, estirado a toda
REM  la ventana. Resolume lo vuelve a estirar a 8400x690 y lo reparte.
REM  Lienzo: Oeste 3175 + Norte 1775 + Este 3450 = 8400 x 690.
REM -------------------------------------------------------------
set MIRADOR_SALIDA=8400x690
set MIRADOR_MOSAICO=
set MIRADOR_AJUSTE=estirar
set MIRADOR_KIOSK=1
set MIRADOR_AUDIO=mic
call "%~dp0start_windows.bat"
