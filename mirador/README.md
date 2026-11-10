# Mirador

Suite de proyección en vivo para cuerpos en movimiento. La cámara sigue hasta seis bailarines por zona (MoveNet en el navegador, sin nube) y la imagen se arma con módulos que se combinan: silueta, enjambre de partículas, garabato, lluvia de letras, pintura, grilla, cortinas, cenizas, niebla, ecos y bloom. Pensado para una **sala inmersiva de 7 proyectores Full HD (13440 × 1080)**, grabación con OBS y **reacción al audio** (micrófono o canción).

Corre en Chrome/Edge sobre WebGL, sin instalar nada más que Python para servir la carpeta. Probado en MacBook Air (Apple Silicon) y pensado para una PC con RTX 3070 Ti.

```
cámara(s) ──► MoveNet (TF.js WebGL) ──► cuerpos (esqueleto 2D por zona)
                                            │
   micrófono / canción ──► análisis ──► AM  │  módulos 2D (canvas) + módulos GL (puntos, silueta)
                                            ▼
                      escena ──► ecos ──► bloom ──► composición ──► homografía ──► salida 13440×1080
```

## Carpeta

```
mirador/
├── index.html                 Programa (puerta de entrada + panel + salida)
├── css/mirador.css
├── js/
│   ├── core.js                Parámetros (P), WebGL, shaders, formato de salida, resize
│   ├── tracking.js            Zonas de cámara, detector MoveNet (imagen por partes, ids propias), cuerpos, simulador
│   ├── modules.js             Módulos visuales y productores (máscara GPU / CPU)
│   ├── render.js              Capa 2D → GL → ecos → bloom → salida · escalador · perfiles · grabación
│   ├── audio.js               Micrófono / canción, bandas, golpe, multiplicadores AM · playlist
│   ├── plantillas.js          Estéticas (ver PLANTILLAS.md)
│   ├── sessions.js            Sesiones con nombre (parámetros + canciones + cámaras + formato)
│   ├── calib.js               Calibración de cámara por tramos (paredes que doblan)
│   ├── screens.js             Opción B: una ventana por pantalla (Window Management API)
│   ├── ui.js                  Panel lateral con pestañas
│   └── main.js                Arranque, bucle, teclado, integración con las diapositivas
├── vendor/                    TF.js + pose-detection copiados (funciona sin CDN)
│   └── movenet/               Modelo MoveNet incluido (multipose + singlepose), ~14 MB
├── canciones/                 Dejá acá los mp3/wav: se listan solos (no van al repositorio)
├── presentacion-scramble.html Diapositivas (logos / artistas / cuenta regresiva) → arranca una performance
├── secuencia.js               La secuencia de las diapositivas (antes presets.js)
├── start_mac.command · start_windows.bat · start_8k.bat · start_13440.bat   Lanzadores
├── descargar_modelo.sh / .bat Reemplaza el modelo por la copia oficial de tfhub (opcional)
├── REVISION.md                Qué podía fallar en el programa anterior y cómo quedó
├── PLANTILLAS.md              Obras de referencia de cada estética, con enlaces
└── legado/                    El HTML original (Cuerpo / Señal, entrega 1), solo de consulta
```

## Puesta en marcha

### Mac (MacBook Air, pruebas)

1. Doble clic en **`start_mac.command`** (la primera vez: clic derecho → Abrir). Abre Chrome en `http://127.0.0.1:8765`.
2. En la puerta: elegí **sesión** (o escribí un nombre nuevo), **formato** (para ensayar la sala: `13440 × 1080`, se ve a escala) y **audio**. **Encender**, o **Probar sin cámara** para ver las estéticas con cuerpos simulados.

Permisos: la primera vez Chrome pide cámara y micrófono. Si la cámara no aparece, revisá Ajustes del Sistema → Privacidad y seguridad → Cámara → Google Chrome.

### Windows (PC de la sala, RTX 3070 Ti)

1. Python 3 (`winget install Python.Python.3.12`) y Chrome o Edge.
2. Pruebas: **`start_windows.bat`**. Sala con salida 8K y splitter: **`start_8k.bat`** (ver abajo).

Sin internet en la sala el programa arranca igual: las librerías **y el modelo MoveNet** vienen en `vendor/` (ver `vendor/movenet/LEEME.md`; `descargar_modelo.*` lo reemplaza por la copia oficial de tfhub si querés). Si algo falla con TensorFlow, avisa y arranca en **simulación** para que al menos puedas probar imagen y proyección.

## El panel (tecla H)

| Pestaña | Qué tiene |
|---|---|
| **Sesión** | Nombre, guardar/duplicar/exportar/importar, notas; lista de sesiones; **canciones de la sesión** (agregar archivos, carpeta `canciones/`, orden, reproducir). |
| **Plantillas** | 12 estéticas con tecla rápida (1‑9, 0). Se aplican encima y después se ajustan. |
| **Módulos** | Cada módulo con su interruptor, descripción y controles; esqueleto y enlaces; **fuente de la silueta** (esqueleto / brillo / fondo); ecos; posproceso. |
| **Cámaras** | Zonas (hasta 4 cámaras), disposición (columnas / filas / a mano), espejo por zona, video en la imagen, **detección** (cuerpos máximos —1 de fábrica—, sensibilidad, partes de la imagen, resolución, confianza, vista previa con lo que ve el modelo), **exposición dinámica / blancos / negros** de la imagen que analiza el modelo, **ajustes de la cámara física**. |
| **Audio** | Fuente (apagado / micrófono / canción), micrófono, ganancia, suavizado, medidores en vivo, tempo estimado, y **qué mueve la música** (tamaño ← graves, bloom y destello ← golpe, color ← agudos, ecos ← nivel…). |
| **Proyección** | Formato de salida, **zoom de la imagen proyectada**, **colorimetría de todo lo proyectado** (y por pared/proyector, con patrón de color), cantidad de proyectores y fundido de bordes, patrón de ajuste con franjas numeradas, negro, esquinas (keystone), pantalla completa, opción B por ventanas, **grabación**. |
| **Sistema** | Perfil de rendimiento, fps mínimo, adaptación automática, resolución interna y de la capa 2D, densidad de puntos, inferencia, diagnóstico y teclas. |

Todo lo que tocás se autoguarda en la sesión actual. **Exportá la sesión** (.json) para llevarla de la Mac a la PC; las canciones no viajan dentro del .json: copiá los archivos a `canciones/` en la otra máquina y se vuelven a enlazar por nombre.

### Teclas

`H` panel · `F` pantalla completa · `C` mover esquinas · `K` calibrar cámara · `E` ver esqueletos encima de todo · `+`/`−` zoom de salida · `Z` zoom 1× · `B` negro · `Shift+B` aprender fondo · `X` limpiar ecos · `V` rotar cámaras · `R` grabar/parar · `M` micrófono sí/no · `Espacio` canción play/pausa · `↑/↓` canción anterior/siguiente · `1‑9, 0` plantillas · `G/L` exportar/importar sesión · `Esc`/`⌫` diapositivas.

## Las dos versiones de audio

Es el mismo programa con la fuente de audio elegida en la puerta (o `?audio=mic` / `?audio=cancion` en la URL; `start_13440.bat` arranca con micrófono):

- **Micrófono**: reacciona a la música de la sala. El programa **no** reproduce ese audio (para no acoplar). Para que tome bien la música, usá una entrada de línea desde la consola o un micrófono cerca del parlante; en la pestaña Audio podés elegir el dispositivo y la ganancia.
- **Canción**: reproduce las canciones de la sesión y reacciona a eso. Los medidores de la pestaña Audio muestran lo que "escucha".

Con la tecla `M` alternás el micrófono en cualquier momento. Si una plantilla queda demasiado nerviosa, bajá "Qué mueve la música" o usá el botón *Reacción suave*.

## 7 proyectores Full HD con una salida 8K y un splitter

El montaje previsto: **una sola salida de video 8K (7680 × 4320) de la RTX 3070 Ti a un splitter** que recorta 7 ventanas Full HD, una por proyector. Para eso Mirador tiene el modo **mosaico** (Proyección → *Salida 8K a splitter*, o `start_8k.bat`):

1. El programa compone el lienzo de la sala, **8400 × 690**.
2. En la salida, cada pared es una **baldosa** del cuadro 8K: Oeste (3175 × 690) en (0, 0), Norte (1775 × 690) en (3175, 0) y Este (3450 × 690) en (0, 690). El resto del cuadro queda negro.
3. El splitter, o el software de mapeo que reparte a los 7 proyectores, toma cada pared de esas coordenadas. Si necesita otra disposición, se escribe en *mapa a mano*, una línea por baldosa: `x,y` para mover una pared, o `sx,sy,sw,sh > x,y` para mandar cualquier recorte del lienzo a cualquier lugar del cuadro (por ejemplo, un recorte por proyector con solape). Queda guardado en la sesión.
4. Con el modo *franjas iguales* se vuelve al reparto anterior en 7 franjas de 1920 × 1080.

Windows: la pantalla 8K a **7680 × 4320, escala 100 %**, 60 Hz con DSC (HDMI 2.1 o DisplayPort 1.4a de la 3070 Ti) o 30 Hz si el splitter no acepta DSC. Chrome se abre en kiosk sobre esa pantalla y el canvas del programa es exactamente 7680 × 4320. Alternativas que también resuelve el mismo modo: cuadro 7680 × 2160 (si el splitter trabaja en "8K ancho"), o 3840 × 2160 con 2×2 baldosas para un splitter 4K → 4 Full HD.

A tener en cuenta con el splitter:

- Verificá si acepta 8K a 60 Hz o solo a 30 Hz, y si fuerza submuestreo de color 4:2:0 (los bordes de las letras y las líneas finas se ven más blandos; en ese caso subí *grosor* en los módulos de línea).
- Los splitters agregan latencia (1 cuadro o más); con la música por micrófono no se nota, con la cámara sí un poco. No afecta al programa.
- Para ver qué llega, *ver panorama* en el mismo grupo muestra la imagen seguida (lo que ve el público) en lugar del mosaico (lo que recibe el splitter).

Si en algún momento no hay splitter: `start_13440.bat` abre una ventana de 13440 × 1080 que cruza un escritorio extendido (recordá que la 3070 Ti sola saca 4 pantallas), y la opción B de Proyección reparte por ventanas.

**Alineación.** Las esquinas (tecla C) corrigen un keystone global del panorama antes de cortarlo; para keystone por proyector usá el ajuste del propio proyector o del splitter. *Fundido de bordes* suaviza solapes entre franjas.

## La sala: tres paredes, una cámara fija

El lienzo es **8400 × 690**: las tres paredes una al lado de la otra, de izquierda a derecha como las ve la cámara.

| Pared | Lado | Resolución | Lugar en el lienzo |
|---|---|---|---|
| Oeste | izquierda | 3175 × 690 | 0 – 3175 |
| Norte | fondo | 1775 × 690 | 3175 – 4950 |
| Este | derecha | 3450 × 690 | 4950 – 8400 |

Es el formato predeterminado de la puerta ("Sala: 8400 × 690") y se edita en Proyección → *Paredes de la sala*. El patrón de ajuste muestra cada pared con su nombre y su tamaño.

**Calibración de la cámara (tecla K).** La cámara está fija en lo alto, del lado abierto de la sala, como en `referencia/camara-sala.jpg`. La calibración ya viene con las líneas celestes de esa foto: **arriba** el borde superior de las paredes, **abajo** la base, con un vértice en cada esquina. Si la cámara se mueve aunque sea un poco, abrí la vista con K y arrastrá los puntos verdes hasta que las líneas vuelvan a coincidir con las paredes; queda guardado en la sesión.

**Cómo llega un bailarín a la pared (modo piso).** La cámara ve a los bailarines parados en el piso, debajo de la línea de abajo. Mirador toma sus pies y traza una recta desde el punto de la cámara en el piso (el punto amarillo, fuera de cuadro abajo), pasando por los pies, hasta la base de las paredes. En ese punto se para la figura, de pie, sobre la pared que el bailarín tiene detrás visto desde la cámara. Si camina hacia la izquierda pasa a la pared Oeste; si va al fondo, a la Norte. La vista de calibración dibuja esa recta para cada bailarín.

- *altura de la figura*: alto de la figura respecto de la pared (0,82 = 566 px de 690).
- *altura del piso*: dónde apoya los pies en la pared.
- *más chica lejos de la pared*: con 0 todas las figuras tienen el mismo alto; con más, los que están lejos de la pared se ven más chicos.
- *modo vista*: reproyecta lo que la cámara ve encima de cada pared, como una sombra. Solo sirve para cuerpos pegados a la pared.

**Zona ignorada.** El rectángulo rojo de abajo a la izquierda saca de la imagen al operador sentado en la computadora, que la cámara también ve. Se pueden agregar más (público, técnicos) desde el panel.

Con calibración, el video de la cámara no se dibuja sobre las paredes y la silueta se arma desde el esqueleto, porque la imagen en perspectiva no coincide con el lienzo.

**Cámaras y zonas.** Con una cámara, la zona es toda la pared (la cámara se ve "contenida": a 13440 × 1080 una cámara 16:9 ocupa el centro con bandas a los lados; para cubrir todo el ancho con una sola cámara, en Cámaras → disposición *a mano* podés estirar la zona, o aceptar las bandas y usar módulos que no dependan del video). Cuando sumes cámaras, cada una toma una columna: dos cámaras = dos mitades, tres = tres tercios, o rectángulos a mano. MoveNet pierde cuerpos chicos: conviene **una cámara cada 2–3 proyectores**.

**Si no aparecen los esqueletos.** Cámaras → *Detección de cuerpos* muestra la imagen de la cámara con lo que encuentra el modelo: verde = cuerpo en uso, rojo = zona ignorada, gris = visto con poca confianza y descartado. La imagen es la que recibe el modelo, ya corregida. Las líneas punteadas azules son las partes en que se corta la imagen.
- *Sensibilidad* **sala** (la de fábrica): resolución 384 y la imagen en **2 mitades** con solapamiento, porque desde una cámara fija lejana los bailarines del fondo quedan chicos y MoveNet no los ve en la imagen entera. **Máxima**: 3 partes y umbrales más bajos (fondo de la sala, poca luz). **Rápida/normal**: imagen entera, para cuerpos grandes cerca de la cámara o una máquina lenta.
- Si hay cuerpos en gris, bajá la *confianza del cuerpo*. Si no hay nada, subí la sensibilidad o revisá la exposición (abajo).
- **Imagen para la detección: exposición, blancos y negros.** Corrige solo la imagen que analiza el modelo, no lo que se proyecta (en la GPU, con tensores). *Dinámica* (de fábrica): cada ~200 ms mide el histograma donde están los cuerpos (si no hay nadie, el piso de la sala según la calibración; las zonas ignoradas no cuentan) y ajusta **negros**, **blancos** y **medios tonos** para que el cuerpo quede en un gris medio aunque cambie la luz de la proyección. *Manual*: exposición (ganancia), punto negro, punto blanco y medios tonos fijos; "Fijar estos valores" pasa lo que encontró la dinámica a manual. *Quitar color* sirve cuando la proyección tiñe la sala. Con la foto de la sala muy oscurecida: neutra → 3 de 4 bailarines; dinámica → 4 de 4.
- **Cámara física.** Si la cámara expone ajustes al navegador (Windows/Linux con webcams UVC, por lo general), aparecen exposición manual/automática, tiempo de exposición, balance de blancos, temperatura de color, brillo, contraste, nitidez y foco; se guardan en la sesión. En sala con proyección conviene **exposición manual fija** en la cámara (la automática "respira" con cada cambio de imagen) y dejar que la exposición dinámica de Mirador corrija el resto. Si no aparece nada (habitual en Mac), fijarlos con el programa del fabricante o desde OBS → Propiedades del dispositivo → Configurar video.
- En una prueba con la foto de la sala oscurecida y cuatro personas a distintas distancias: imagen entera → 1 bailarín; 2 mitades → 3; 3 partes → 4 (y el operador en la zona ignorada).

**Luz.** La cámara tiene que ver a los bailarines, no a la proyección. En sala oscura la solución estándar es **luz infrarroja**: focos IR (850 nm) y una cámara sin filtro IR (o una cámara de seguridad USB "IR"); el público no la ve y el proyector no la contamina. La silueta por defecto se arma desde el esqueleto justamente para no depender del brillo de la imagen.

## Un cuerpo, zoom y colorimetría

**Cuerpos máximos.** De fábrica Mirador sigue **un cuerpo** por cámara (Cámaras → Detección → *cuerpos máx. por cámara*, de 1 a 10). Con 1, se queda con el bailarín que viene siguiendo y no salta a otro aunque otro tenga más puntaje en un cuadro; si lo pierde casi un segundo, toma al más claro. Las zonas ignoradas (el operador) nunca ocupan el lugar. En la vista previa, los detectados que quedan afuera se ven en amarillo punteado. Las sesiones guardadas antes de este cambio se abren con 1.

**Zoom de la imagen proyectada.** Proyección → *Zoom*: agranda o achica todo lo que se proyecta alrededor del centro, y lo corre en horizontal y vertical. Va antes de las esquinas (keystone) y del mosaico 8K, así que el reparto a los proyectores no cambia. Teclas `+` / `−` y `Z` (vuelve a 1×). Se guarda en la sesión.

**Colorimetría de todo lo proyectado.** Proyección → *Colorimetría*: es la última etapa, después de módulos, ecos y bloom, y **no la tocan las plantillas**: lo que se fija ahí vale igual para todas.
- *Modo*: **libre** (los colores de cada plantilla), **absoluto** (toda la imagen en un solo color; solo cambia el brillo) o **gradiente** (de un color de sombra a uno de luz).
- Exposición, contraste, saturación, gamma de salida, nivel de negro, blanco máximo y balance rojo/verde/azul.
- *Mismo color para todos los cuerpos* (en vez de un color por bailarín) y *el audio no cambia el color*.
- **Por pared / proyector**: brillo, nivel de negro y rojo/verde/azul de cada pared (o de cada franja si no se usan paredes), para igualar proyectores. Con el **patrón de color** encendido se ven en cada pared grises en 11 pasos, primarios y secundarios, y negros al 0, 2, 5, 10 y 20 %: subí o bajá hasta que las paredes se vean iguales. El patrón pasa por la calibración de salida (balance, negro, blanco, gamma, ajustes por pared) pero no por la parte creativa.

Para que el color sea de verdad el mismo de una función a otra, además de Mirador:
- Los proyectores, todos en el mismo modo de imagen (sRGB / Rec.709, 6500 K, gamma 2.2), sin contraste dinámico, iris automático ni "modo eco" variable; misma lámpara/láser en uso parecido. Conviene igualarlos primero desde su propio menú y dejar Mirador para el ajuste fino.
- Windows: en esa salida, HDR apagado, "Color automático" apagado, sin perfil ICC raro (sRGB), y en el panel de NVIDIA *Rango dinámico de salida: completo* y *profundidad de color* 8 bpc. El splitter, sin escalado ni procesamiento de color.
- Chrome dibuja en sRGB. OBS: *Formato de color NV12, espacio 709, rango Parcial* para video común (o Completo si el destino lo espera); lo importante es que el reproductor use el mismo.

## OBS

- **Capturar**: en OBS, *Captura de ventana* de Chrome con método *Windows 10 (1903 y posterior)*, o *Captura de pantalla* del monitor. Chrome se abre con banderas para que siga pintando aunque esté tapado.
- **Resolución**: con el modo mosaico la pantalla es 7680 × 4320, que NVENC HEVC/AV1 sí codifica (8192 máx.; H.264 solo hasta 4096). Grabar el mosaico tal cual documenta lo que recibe el splitter, no lo que ve el público. Para una grabación "de público" conviene la grabación interna (tecla R) con *ver panorama* activado, o capturar en OBS una segunda instancia/ventana con el panorama. 13440 px de ancho no se codifican por hardware en ningún caso.
- **Alternativa sin OBS**: tecla `R` graba desde el navegador a `.webm` (VP9) con el audio activo, reescalado a 1920 o 3840 de ancho (Proyección → Grabación). Es liviano y no pierde cuadros por foco de ventana.
- **Volver a proyectar**: lo más fiel no es el video sino la **sesión**: guardá la sesión y la canción y volvé a correr el programa.

## Liviano, en la Mac y en la PC

- El perfil se mide al arrancar (4 s) y se adapta solo: si los fps bajan del mínimo, primero baja la **capa 2D**, después la resolución interna, los puntos, el bloom… y los recupera cuando sobra margen. Todo se ve y se cambia en Sistema.
- Lo más pesado en 13440 px es la capa 2D (enjambre, garabato, lluvia, pintura, grilla, cortinas) porque se sube a la GPU cada cuadro; la silueta, los puntos, los ecos y el bloom son GL puro. Para la 3070 Ti, perfil *Completo* con capa 2D en 0.8 anda a 60 fps con 2–3 módulos; para la Mac, *Equilibrado* y formato 1920 × 1080 para ensayar.
- Inferencia: MultiPose Lightning ~12–20 ms por cámara en la 3070 Ti, ~25–40 ms en la Mac. Con 3 cámaras bajá *inferencia* a 20 Hz y *cuerpos máx.* a 3.

## Diapositivas (presentación)

`presentacion-scramble.html` sigue siendo la pantalla entre performances (logos, artistas, cuenta regresiva). Al llegar a un paso `performance`, manda a Mirador `start-performance` con `audio`, `escena` (acepta los nombres viejos: `enjambre`, `niebla`, `lineas`, `garabato`, `empuje`) y opcionalmente `sesion` (nombre de una sesión guardada). `Esc`/`⌫` vuelve a las diapositivas. La secuencia se edita en `secuencia.js`.

## Créditos

Motor y módulos originales: *Cuerpo / Señal* (entrega 1). Enjambre basado en *particle-swarm-pose*. Referencias de cada estética en `PLANTILLAS.md`. TensorFlow.js y MoveNet: Apache 2.0 (ver `vendor/LICENSE-*`).
