# Charlas y Talleres FLAT · OBS + Resolume · 8400 × 690

Configuración guardada para que el show se vea con toda su definición pasando por OBS y Resolume:

```
show (Chrome dentro de OBS, 8400 × 690, 60 cuadros)
  └─► OBS (lienzo 8400 × 690, sin escalar, RGBA)
        └─► Spout (textura de la placa de video, sin compresión)
              └─► Resolume Arena (composición 8400 × 690, 60 cuadros)
                    └─► Advanced Output: oeste 3175 · norte 1775 · este 3450
```

La regla de oro: **8400 × 690 en todos los eslabones, sin ningún escalado en el medio.** Cada vez que un eslabón
achica y otro agranda, se pierde definición.

## Por qué se veía pixelado

| Causa | Dónde | Arreglo |
| --- | --- | --- |
| La fuente de navegador de OBS viene en 800 × 600 y 30 cuadros: el show se dibujaba chico y OBS lo estiraba | OBS | Ancho 8400, alto 690, 60 cuadros personalizados (ya está en la escena guardada) |
| Con 30 cuadros, la «calidad adaptativa» del show creía que la placa no daba abasto y bajaba la resolución interna hasta el 60 % | programa | **Arreglado**: dentro de OBS (o con `obs=1` en la dirección) se dibuja píxel a píxel y la calidad no baja nunca |
| Lienzo o salida de OBS en 1920 × 1080: OBS achica 8400 a 1920 y Resolume lo vuelve a agrandar | OBS | Lienzo y salida 8400 × 690 (perfil guardado) |
| Formato de color NV12 (4:2:0): las letras finas y los bordes de color se empastan | OBS | RGBA (perfil guardado) |
| Composición de Resolume en 1920 × 1080: el clip de 8400 se achica para entrar | Resolume | Composición 8400 × 690 |
| NDI comprime el video | OBS → Resolume | Spout (sin compresión, misma máquina) |
| Las letras grandes (5×, 12×, títulos) se rasterizaban a 96 px y se agrandaban | programa | **Arreglado**: ahora a 192 px |
| El título sólido se dibujaba a 260 px y se estiraba | programa | **Arreglado**: ahora a 480 px |

## 1. Arrancar el show para OBS

Doble clic en **`start_obs_charlas.bat`** (o **`reproyectar_obs_charlas.bat`** para re-proyectar una sesión).

- Hace todo lo de `start_instalacion.bat` (backend, transcripción, grabación) pero **no abre Chrome**: el show lo
  abre OBS.
- Al terminar muestra la dirección y la deja copiada (Ctrl+V):

  ```
  http://127.0.0.1:5173/?formato=8400x690/3175,1775,3450&presentacion=charlas&obs=1
  ```

  - `formato=…`: las tres paredes.
  - `presentacion=charlas`: título «Ciclo de charlas y talleres FLAT», mande lo que mande el panel C.
  - `obs=1`: píxel a píxel y sin bajar la calidad. Dentro de OBS igual se detecta solo; lo dejamos explícito.

No abras además el show en un Chrome aparte: serían dos shows independientes y las teclas de uno no mueven al otro.

## 2. OBS Studio (30 o más nuevo)

### Una sola vez

1. **Plugin de Spout**: instalar «Spout2 Plugin for OBS Studio» (Off World Live). Reiniciar OBS.
   - **La versión depende de OBS**: con OBS 32 o anterior, la **1.13.0** (las 1.14 y siguientes exigen OBS 33 y no
     cargan: «The following OBS plugins failed to load: win-spout»). Con OBS 33 o más nuevo, la última.
   - Instalación manual: descomprimir el ZIP en `C:\ProgramData\obs-studio\plugins` (queda la carpeta `win-spout`).
   - En el registro de OBS (Ayuda → Archivos de registro) tiene que decir `[win_spout] win-spout loaded!`.
2. **Perfil** (resolución, cuadros y color): menú **Perfil → Importar** y elegir la carpeta
   `poesia-tipografica\obs\Perfil Charlas 8400x690`. Después **Perfil → Charlas 8400x690**.
3. **Escena**: menú **Colección de escenas → Importar**, elegir
   `poesia-tipografica\obs\Escenas Charlas 8400x690.json`, tildarla y aceptar. Después **Colección de escenas →
   Charlas y Talleres FLAT 8400x690**.
4. **Salida a Resolume**: en la escena «Charlas y Talleres 8400x690», clic derecho → **Filtros** → **+** →
   **Spout Filter** → nombre del emisor: `FLAT`. (Manda la imagen de la escena directo desde la placa de video.)
   - En la sala el filtro está puesto en la **fuente** «Show Umbral (navegador)» (clic en la fuente → Filtros),
     no en la escena: así sale igual con el modo estudio y con OBS minimizado.
   - **No usar «Herramientas → Ajustes de la salida Spout» ni la salida NDI con el lienzo de 8400 px.** Las dos
     sacan cada cuadro de la placa de video y lo procesan en el procesador, en un solo hilo: a 8400 × 690 ese hilo
     no llega y OBS saltea más del 95 % de los cuadros (se ve a los saltos y como en cámara lenta). Se comprueba
     al cerrar OBS, en el registro: `skipped frames due to encoding lag`. El filtro comparte la textura directo
     en la placa y no tiene ese costo. Dejar destildados el arranque automático de la salida Spout y la «Salida
     de Programa» de DistroAV NDI.
   - Si la salida Spout estuvo andando con el nombre `FLAT`, el nombre queda tomado hasta cerrar OBS y el filtro
     pasa a llamarse `FLAT_1`: reiniciar OBS.
   - **No usar NDI entre OBS y Resolume en la misma PC**: el NDI viaja por la dirección de la placa de red (en la
     sala, la del Wi-Fi) y cada vez que la red se corta la fuente queda «offline» en Resolume. Spout no usa red.
5. **Aceleración por hardware**: Ajustes → Avanzado → Fuentes → tildar **«Habilitar aceleración de hardware de la
   fuente de navegador»**. Reiniciar OBS.

### Si preferís cargarlo a mano (o la importación no anduvo), estos son los valores

- **Ajustes → Video**: Resolución base (lienzo) **8400x690** (se escribe a mano) · Resolución de salida (escalada)
  **8400x690** · FPS **60**.
- **Ajustes → Avanzado → Video**: Formato de color **RGBA** · Espacio de color **709** · Rango de color **Completo**.
- **Fuente → Navegador** «Show FLAT (navegador)»:
  - URL: la de arriba.
  - Ancho **8400** · Alto **690**.
  - Tildar **«Usar velocidad de fotogramas personalizada»** → **60**.
  - CSS personalizado: `body { background-color: #000; margin: 0; overflow: hidden; }`
  - Destildar **«Apagar la fuente cuando no está visible»** y **«Actualizar el navegador cuando la escena se activa»**.
- **Transformar** la fuente (clic derecho → Transformar → Editar transformación): posición 0, 0 · escala 1 ·
  sin recorte · **Filtro de escalado: Deshabilitar**. Nada de «Ajustar a la pantalla» si el lienzo no es 8400 × 690.

### Durante el show

- **Operar** (teclas, panel C, flechas): abrir en Chrome, en el monitor del operador, la **ventana de control**:

  ```
  http://127.0.0.1:5173/?control=1&presentacion=charlas&formato=8400x690/3175,1775,3450
  ```

  Arranca con el panel C a la vista. Las teclas del show y los botones Grabar / Detener se mandan a la salida (la
  fuente de OBS), que es la que los ejecuta y los graba; los ajustes del panel se aplican en la pared al instante.
  La ventana de control repite las teclas para acompañar, pero **la pared es la que manda**: si se abre con el show
  empezado, su vista previa puede no coincidir. Para Umbral, `presentacion=umbral`.
- **Franjas negras** (panel C → «Franjas negras (sin palabras)»): tramos del ancho que quedan en negro y donde no
  se escribe nada (una puerta, una columna, un proyector que no se usa). Se marcan arrastrando sobre la barra o
  escribiendo los px («3175-4950, 8000-8400»); clic en una franja para sacarla. Las palabras, el verso, el título y
  los logos se acomodan en los tramos libres; si la pared de frente queda toda en negro, pasan al tramo más ancho.
- **No abrir el panel C dentro de la fuente** (clic derecho → Interactuar → tecla C): a 8400 px queda ilegible en el
  monitor y **se ve en la pared**. Interactuar sirve para una tecla suelta si la ventana de control no está.
- **Vista previa**: a 8400 px de ancho consume placa. Si hace falta, clic derecho en la vista previa → destildar
  «Habilitar vista previa» (Spout y Resolume siguen recibiendo igual).
- **Control**: Ver → Estadísticas: «Fotogramas perdidos por renderizado» tiene que quedar en 0.

## 3. Resolume Arena

### Una sola vez

1. **Composición**: menú **Composition → Settings** (o «New Composition»): **Width 8400 · Height 690 · Frame rate
   60**. Guardarla como `FLAT Charlas 8400x690`.
2. **Fuente**: panel **Sources → Spout → FLAT**, arrastrarla al primer clip de la capa 1.
   - En el clip: **Transform → Auto size: Fit** (al ser el mismo tamaño queda 1:1), escala 100 %, posición 0.
   - Capa al 100 % de opacidad. Sin efectos de escalado.
3. **Salida**: **Output → Advanced Output**. Un slice por pared, con estos recortes de entrada (Input Selection):

   | Slice | X | Y | Ancho | Alto |
   | --- | --- | --- | --- | --- |
   | Oeste (izquierda) | 0 | 0 | 3175 | 690 |
   | Norte (frente) | 3175 | 0 | 1775 | 690 |
   | Este (derecha) | 4950 | 0 | 3450 | 690 |

   Cada slice va a su proyector en Output Transformation (warping y bordes, como en el mapping de la sala). Guardar el
   preset como **`FLAT 3 paredes 8400x690`**.
4. Para la mejor definición, que cada proyector reciba sus píxeles sin escalar: si un proyector cubre una pared
   entera, su resolución nativa idealmente coincide con la de esa pared. Si no, Resolume escala sólo en la salida, una
   vez, que es lo mínimo posible.

### Windows y placa de video (NVIDIA)

- Escala de Windows **100 %** en las salidas de los proyectores.
- Panel de control de NVIDIA → Cambiar resolución: **Rango dinámico de salida: Completo**, **Profundidad de color 8
  bpc** o más. Ajustar tamaño y posición del escritorio: **Sin escalado**.
- Modo de energía de la placa: **Preferir rendimiento máximo** para `obs64.exe` y `Arena.exe`.

## 4. Chequeo antes de abrir sala

1. En OBS, Interactuar → tecla **D**: el panel técnico tiene que decir **calidad: alta** y unos 60 cuadros.
2. En Resolume, el clip tiene que mostrar 8400 × 690 (pasar el mouse sobre el clip o mirar el panel Clip).
3. Mirar de cerca una pared: las letras chicas del telón tienen que verse nítidas, sin escalones ni bordes rosados y
   celestes empastados.

## Variante 1920 × 690 (una sola pantalla)

Los mismos pasos, cambiando:

- Dirección: `http://127.0.0.1:5173/?formato=1920x690&presentacion=charlas&obs=1`.
- Fuente de navegador 1920 × 690 · lienzo y salida de OBS 1920 × 690 · composición de Resolume 1920 × 690.
- Sin slices: la composición va entera a la pantalla.

## Mac

OBS no saca Spout en Mac. Se usa **Syphon**: con el plugin de Syphon para OBS (o, si no, NDI con DistroAV a calidad
máxima). En Resolume: **Sources → Syphon** (o NDI). El resto de los valores es igual.

## Si la placa de video se queda corta

Si las estadísticas de OBS muestran cuadros perdidos:

- En la dirección agregar `&atlas=2048` (letras a la resolución de antes; ahorra memoria de la placa).
- Bajar la fuente de navegador a 30 cuadros (el show no baja su resolución por eso).
- **Nunca** achicar el lienzo de OBS ni la composición de Resolume: eso es justamente lo que pixela.
