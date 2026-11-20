# Traspaso · Umbral + OBS + Resolume en la sala (DESKTOP-5P2UPJJ)

Actualizado el 20 de noviembre de 2026. Reemplaza al traspaso del 18/11, que se escribió sin haber visto la máquina.
Lo que sigue **sí** se relevó en la PC de la sala, el 18/11 y el 20/11. Cada punto dice si está comprobado o no.

## 1. Estado en una línea

El puente OBS → Resolume pasó de **NDI a Spout** (emisor `FLAT`, 8400 × 690). Está instalado y emitió bien el 18/11;
**falta la prueba larga en la sala** con la composición `UMBRAL` para dar por cerrados los cortes.

## 2. La sala (comprobado)

| Dato | Valor |
|---|---|
| PC | `DESKTOP-5P2UPJJ`, Windows 11 Pro, i5-8500, RTX 3070 Ti (driver 32.0.16.1088) |
| Cadena | show (Chrome) → OBS → **Spout `FLAT`** → Resolume Arena 6 → splitter → 7 proyectores |
| Lienzo | 8400 × 690: oeste 3175 · norte 1775 (frente) · este 3450 |
| Splitter | una sola salida 4096 × 2160 a 30 Hz, monitor «MACROSILICON» |
| Monitor de operación | Samsung 1366 × 768 (primario) |
| OBS | 32.2.2 · perfil y colección «Mirador» · lienzo y salida 8400 × 690 a 30 fps · color NV12 parcial |
| Plugins de OBS | DistroAV 6.2.2 (NDI) · **Spout2 Plugin 1.13.0** (`C:\ProgramData\obs-studio\plugins\win-spout`) |
| Resolume | Arena 6.0.7 rev 60787 · composiciones en `Documentos\Resolume Arena 6\Compositions` |
| Mapeo a proyectores | Advanced Output «Screen 9», 9 slices. **Es global y lo usan otras obras: no tocarlo** |
| Red | Wi-Fi Realtek 8821CE (WIFI-MMAMM, 2,4 GHz) · Ethernet Intel I219-V sin cable, IP manual 192.168.137.1 |
| Cámara | BCC950 ConferenceCam, 1280 × 720 |

## 3. Los cortes: qué eran

**Causa del NDI «offline» (comprobado en los registros):** Resolume recibía «DESKTOP-5P2UPJJ (OBS PGM)» por la
dirección del Wi-Fi (`10.201.105.241:5961`) aunque OBS y Resolume están en la misma PC. Cada vez que el Wi-Fi se
desconecta (18/11: 08:58, 09:23, 09:34, 09:58 y 11:25) la fuente queda «offline». El registro de Resolume tenía 386
reconexiones. OBS nunca cortó su salida (111 726 cuadros, 20 atrasados, 2 salteados en una hora).

**Lo que se descartó:** reinicios del driver de video (ningún evento 4101 en 30 días) y saturación de OBS.

**Lo que también apaga las pantallas y Spout no arregla:**

- Apagados de golpe de la PC (Kernel-Power 41): 17/11 19:25, 18/11 08:42 y 09:37. Causa sin determinar
  (alimentación o cuelgue).
- Suspensiones pedidas por un programa o una persona: 17/11 19:44 y 18/11 16:46.
- Las dos placas de red se reinician juntas a la misma hora (11:25 el 17 y el 18). Sin determinar qué lo provoca.
- Si se apaga el splitter, Resolume pierde la ventana «Display»: Output → Advanced…, y cerrar sin tocar nada la
  vuelve a crear.

**Incidente del 18/11:** había un minero (`C:\wildrig.exe`) usando el 82–90 % de la placa, con una tarea programada
falsa de «Google». Se borró todo a las 18:31 y el 20/11 no había reaparecido. No se sabe cómo entró. Pendiente:
Microsoft Defender sin conexión, revisar accesos de Escritorio Remoto de Chrome y cambiar contraseñas, **incluida la
clave de OpenAI del show**.

## 4. El puente por Spout (hecho el 18/11)

- Plugin **1.13.0** porque OBS es 32.2.2; las 1.14 y siguientes exigen OBS 33.
- `%APPDATA%\obs-studio\user.ini`, sección `[win_spout]`: `auto_start=true`, `spout_output_name=FLAT`.
- Es la **salida Spout del programa** (lo mismo que salía por NDI «OBS PGM»), no un filtro por escena.
- **En cada inicio de OBS hay que abrir una vez Herramientas → «Ajustes de la salida Spout».** En la 1.13.0 el
  arranque automático recién corre al abrir ese cuadro. Señal de que anda: el registro de OBS dice
  `[win_spout] Creating capture with name: FLAT, width: 8400, height: 690`.
- El NDI «OBS PGM» **sigue encendido** en paralelo, para no romper las composiciones que todavía lo usan
  (Mirador sala, Ale Ceriani, sala nueva 2…). Cuando todas pasen a Spout, apagarlo en Herramientas → Ajustes de
  DistroAV NDI.
- Copia de seguridad previa a los cambios: `D:\Umbral\respaldo-2026-11-18_1843` (OBS y Resolume).

## 5. Resolume: composición `UMBRAL`

- Archivo `UMBRAL.avc`: copia de «lo que vendra» (8400 × 690, 30 fps, 3 capas, 16 columnas), sin sus clips. Un
  solo clip, capa 1 · columna 1: fuente **Spout `FLAT`**, 8400 × 690, sin efectos ni escala.
- Sale repartida igual que «lo que vendra» porque el Advanced Output es global.
- **Se armó editando el archivo y todavía no se abrió en Resolume.** Si no abre o el clip queda vacío: abrir «lo que
  vendra», Guardar como, y arrastrar `FLAT` desde Sources → Spout al primer clip.
- Para pasar otra composición a Spout: mismo arrastre sobre el clip que hoy dice «DESKTOP-5P2UPJJ (OBS PGM)».

## 6. OBS: la escena de Umbral

Hoy la escena `umbral` de la colección «Mirador» son 7 copias de la fuente «Captura de ventana 2» (una ventana de
Chrome) repartidas a lo ancho. Esa fuente es compartida con otras escenas: no tocarla.

Para que Umbral salga como show en 8400 × 690, armar una escena nueva con una **fuente de navegador**:

1. Arrancar el programa con `start_obs_umbral.bat` (no abre Chrome).
2. En OBS: fuente → Navegador, 8400 × 690, con esta dirección:

   ```
   http://127.0.0.1:5173/?formato=8400x690/3175,1775,3450&presentacion=umbral&obs=1
   ```

3. Operar con clic derecho en la fuente → **Interactuar**. No abrir además el show en un Chrome aparte.

Valores exactos de la fuente y del perfil: `docs/OBS-RESOLUME-CHARLAS.md`.

## 7. El programa

- Repositorio `JulianMicicdeRosas/JulianMicicdeRosas`, rama **`charlas-flat`**, carpeta `poesia-tipografica/`.
- **En la PC hay 16 copias descomprimidas en Descargas.** El acceso directo «Umbral» del escritorio apunta a una del
  14/10 (rama vieja, sin los ajustes de la tecla 0). La más nueva es `Descargas\Umbral 18-11`. Copia de trabajo con
  historial: `D:\Umbral\repo`.
- Servidor en Python (`server.py`, puerto 8765) y página compilada con Vite (puerto 5173).
- Clave de OpenAI: fuera del repositorio (`%USERPROFILE%\.poesia-tipografica\openai_key` o panel C).
- Teclas: `1`…`9` placa del artista · `0` sólo transcripción · `Z` cierre · `S` transcribir / dejar · `P` detener ·
  `T` palabras · `L` loop · `C` panel de operación · `D` panel técnico · `F` pantalla completa.

### Tecla 0: regulador de palabras (panel C → «Tecla 0 · palabras»)

| Control | Qué regula | Rango · de fábrica |
|---|---|---|
| **Palabras que aparecen (%)** | De cada 100 palabras dichas, cuántas llegan a la pared | 5 a 100 · 100 |
| **Palabras que quedan a la vez** | Tope en pantalla; al pasarlo se rompen las más viejas | 2 a 60 · 12 |
| **Segundos en pantalla** | Cuánto vive cada palabra (±23 %) | 3 a 90 · 13 |

«Palabras que aparecen» es nuevo (20/11). Al bajar salen primero las palabras de enlace (de, la, y…): al 50 % no
queda ninguna y entran todas las demás; por debajo de 50 % también se saltean palabras con peso, de forma pareja.
Las palabras clave entran siempre. Los cambios se ven al instante. **Probado sólo con las pruebas automáticas, no en
la sala.**

## 8. Pendiente, en orden

1. Abrir `UMBRAL` en Resolume con OBS emitiendo por Spout y dejarla **30 minutos** mirando con la cámara. Recién
   ahí se da por cerrado lo del «offline».
2. Instalar esta versión del programa y apuntar el acceso directo «Umbral» a ella.
3. Armar en OBS la escena de Umbral con fuente de navegador (§6).
4. Pasar a Spout las otras composiciones y apagar el NDI.
5. Averiguar los apagados de golpe de la PC y el reinicio diario de las placas de red.
6. Revisión de seguridad después del minero.
7. Sin empezar: «Sacar nombres de docentes de las tarjetas» (preguntar a qué tarjetas se refiere).

## 9. Reglas de trabajo

- Responder en español rioplatense. Decir con claridad qué se comprobó y qué no.
- Trabajar en la rama `charlas-flat`; sin pull requests salvo que los pida.
- Antes de cada commit: borrar `poesia-tipografica/dist` y comprobar que la clave de OpenAI no esté en ningún archivo.
- En la pared nunca se escribe el estado del show: los avisos van al panel C y al título de la ventana.
- No tocar el Advanced Output de Resolume ni la fuente «Captura de ventana 2» de OBS.
