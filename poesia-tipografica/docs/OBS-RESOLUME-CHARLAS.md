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
2. **Perfil** (resolución, cuadros y color): menú **Perfil → Importar** y elegir la carpeta
   `poesia-tipografica\obs\Perfil Charlas 8400x690`. Después **Perfil → Charlas 8400x690**.
3. **Escena**: menú **Colección de escenas → Importar**, elegir
   `poesia-tipografica\obs\Escenas Charlas 8400x690.json`, tildarla y aceptar. Después **Colección de escenas →
   Charlas y Talleres FLAT 8400x690**.
4. **Salida a Resolume**: en la escena «Charlas y Talleres 8400x690», clic derecho → **Filtros** → **+** →
   **Spout Filter** → nombre del emisor: `FLAT`. (Manda la imagen de la escena directo desde la placa de video.)
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

- **Operar** (teclas, panel C, flechas): clic derecho en la fuente → **Interactuar**. Ahí funcionan todas las teclas
  del show. El panel C se abre en la parte visible.
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
