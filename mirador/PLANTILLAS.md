# Plantillas: estéticas y las obras de referencia

Cada plantilla de Mirador parte de una obra conocida de cuerpo en movimiento + proyección. No son copias (ninguna de esas obras está publicada como código que se pueda cargar tal cual): son **recreaciones livianas** de la idea visual, hechas con los módulos del programa. Las referencias sirven para mirar video de la obra original y ajustar hacia ahí.

Se eligen en la pestaña **Plantillas** o con las teclas **1‑9 y 0**. Después se combinan y ajustan en **Módulos** y quedan guardadas en la sesión.

## Plantillas nuevas (efectos de GPU)

Hechas con cinco efectos que corren enteros en la placa de video (`js/efectos.js`). Tienen miniatura en la pestaña **Plantillas** y ocupan las teclas **1‑9 y 0**. Las clásicas siguen disponibles en la misma pestaña, sin tecla.

| Tecla | Plantilla | Referencia | Qué hace |
|---|---|---|---|
| 1 | **Cascada de píxeles** | Adrien M & Claire B, *Pixel* (2014): cicloramas verticales y partículas proyectadas que reaccionan al cuerpo. <https://www.am-cb.net/projets/pixel> | *Partículas*, modo cascada: una cortina vertical que cae y se abre alrededor de cada cuerpo. |
| 2 | **Corrientes de luz** | Adrien M & Claire B, *Pixel*; Optical Flow de TouchDesigner (velocidad del movimiento inyectada en partículas): <https://docs.derivative.ca/Palette:opticalFlow> | *Partículas*, modo corrientes: un río de luz que los cuerpos desvían; el movimiento deja remolinos. |
| 3 | **Humo de luz** | Fluidos en GPU (Navier‑Stokes), Memo Akten, Universal Everything | *Fluido*: el borde del cuerpo arde y suelta humo que sube; manos y pies lo revuelven. |
| 4 | **Tinta en el agua** | Fluidos en GPU, sumi‑e | *Fluido* lento: tinta azul que queda flotando y girando. |
| 5 | **Membrana** | Klaus Obermaier, *Apparition* (2004): una trama que el cuerpo deforma. <https://www.exile.at/apparition/> | *Membrana*: hilos verticales como una tela tensa que el cuerpo empuja y deja vibrando. |
| 6 | **Red elástica** | *Apparition*; Chunky Move, *Mortal Engine* | *Membrana* en grilla de neón que se curva como un trampolín. |
| 7 | **Topografía** | Golan Levin, *Augmented Hand Series* (2014): deformación y seguimiento en tiempo real del contorno. <http://www.flong.com/archive/projects/augmented-hand-series/index.html> | *Ondas de contorno*: curvas de nivel alrededor de cada cuerpo que laten hacia afuera. |
| 8 | **Cuerpo líquido** | Golan Levin, *Augmented Hand Series* | *Silueta líquida* + *Ondas*: el cuerpo como mercurio que tiembla, se estira y se abre en colores. |
| 9 | **Polvo de estrellas** | Universal Everything, *Transfiguration* | *Partículas*, modo atraer: polvo dorado que se junta en el cuerpo quieto y estalla al moverse. |
| 0 | **Aurora** | *Pixel* + fluidos | *Fluido* verde agua desde el borde + corriente de partículas finas. |
| — | **Eclipse** | Blanco y negro | *Partículas* en órbita + *Ondas*, sobrio. |
| — | **Lluvia dorada** | *Pixel*; Random International, *Rain Room* | Cascada de oro sobre hilos verticales: el cuerpo abre un hueco en la lluvia. |

## Plantillas tomadas de técnicas de TouchDesigner para danza

Sin tecla; se eligen en la pestaña **Plantillas**. Cada una recrea una técnica muy usada en TouchDesigner con bailarines.

| Plantilla | Técnica en TouchDesigner | Qué hace en Mirador |
|---|---|---|
| **Contorno en llamas** | Edge + Feedback + Displace, típico de visuales de concierto: <https://derivative.ca/community-post/tutorial/create-edge-feedback-concert-visuals/75058> | Contorno del cuerpo con un eco que sube y se retuerce (eco con *campo de flujo*). |
| **Flujo fantasma** | Feedback con campo de flujo, "falso sistema de partículas": <https://derivative.ca/community-post/tutorial/touchdesigner-beginner-tutorial-feedback-flowfield-fake-particle-look/71665> | La silueta se deshace en hebras que el flujo arrastra. |
| **Coral** / **Laberinto** | Reacción-difusión en un lazo de feedback: <https://alltd.org/?p=62911> | *Reacción-difusión* (Gray-Scott): un tejido que crece desde el borde del cuerpo y muere lejos de él. |
| **Cintas** | Emisores y Trail CHOP en manos, pies y cabeza (instalación GO ROBOTS): <https://derivative.ca/community-post/making-go-robots-interactive-motion-tracked-dance-installation/60688> | *Cintas* de luz que siguen las extremidades. |
| **Cronofotografía** | Cache TOP: copias retrasadas de la figura | *Cuerpo en el tiempo*, modo copias. |
| **Cuerpo de goma** | Slit-scan y Time Machine TOP: <https://derivative.ca/community-post/tutorial/slitscan> | *Cuerpo en el tiempo*, modo slit-scan: los pies llegan más tarde que la cabeza. |

En TouchDesigner el slit-scan y las copias se hacen guardando cuadros de video. Acá se hacen guardando las últimas poses del esqueleto (120 como máximo por cuerpo), que pesa muchísimo menos y no depende de la imagen de la cámara.

### Los cinco efectos

- **Partículas de luz:** cientos de miles de partículas con posición y velocidad en texturas de GPU. Cuatro modos: corrientes (ruido *curl*), cascada vertical, atraer (se juntan en la silueta) y órbitas. El cuerpo las aparta o atrae por el gradiente de la silueta, y el movimiento las agita.
- **Fluido de luz:** Navier‑Stokes incompresible, con advección, vorticidad y presión de Jacobi. El borde del cuerpo emite color, el cuerpo empuja, el humo sube y manos y pies agitan.
- **Membrana:** hilos de luz como triángulos con grosor real. El cuerpo los empuja y el movimiento los deja vibrando.
- **Ondas de contorno:** curvas de nivel de la silueta difuminada, animadas hacia afuera.
- **Silueta líquida:** la silueta muestreada con el espacio deformado por ruido y movimiento, con separación de color en los bordes.

### Paleta

Cada efecto tiene paleta propia: aurora, fuego, hielo, oro, neón, tinta, coral, bosque, lavanda, sangre, blanco y negro, o el color de cada cuerpo.

### El movimiento sale del esqueleto, no de la imagen

En TouchDesigner, el *optical flow* se calcula sobre la imagen de la cámara. En una sala con proyección esa imagen está contaminada por la luz del proyector, así que Mirador arma el campo de movimiento con la velocidad de las articulaciones (productor `motion`). Por la misma razón, la silueta sale del esqueleto y no de un recorte por brillo.

### Qué se tomó de las otras referencias

- **MediaPipe para TouchDesigner** (<https://github.com/torinmb/mediapipe-touchdesigner>): Mirador ya hace lo mismo en el navegador, sin sensores, con MoveNet: esqueleto y silueta por esqueleto. La segmentación de MediaPipe recorta por la imagen, y con proyección encima se confunde.
- **Kinect** (<https://docs.derivative.ca/Kinect_In_CHOP>): la profundidad evita que el proyector interfiera, pero el navegador no lee Kinect. La alternativa equivalente es una cámara con infrarrojo y focos IR (ver README).
- **Corner Pin y KantanMapper** (<https://docs.derivative.ca/Corner_Pin_TOP> · <https://docs.derivative.ca/Palette:kantanMapper>): en *Proyección → Esquinas por proyector* cada baldosa del mosaico 8K (lo que recibe un proyector) tiene sus 4 esquinas, para tiro oblicuo o en esquina. Se suma al keystone general (tecla C). En la sala con Resolume, la deformación por proyector se hace en Resolume (*Advanced Output*) y esto queda para el mosaico directo al splitter.

## Plantillas clásicas

| Tecla | Plantilla | Obra de referencia | Qué hace en Mirador |
|---|---|---|---|
| 1 | **Videoplace** | Myron Krueger, *Videoplace* (1974–1990), el primer entorno interactivo con siluetas de video: <https://en.wikipedia.org/wiki/Videoplace> · video: <https://www.youtube.com/watch?v=d4DUIeXSEpk> | Silueta plana de color saturado sobre negro (módulo *Silueta*, sin ecos). |
| 2 | **Sombra que se deshace** | Chris Milk, *The Treachery of Sanctuary* (2012): la sombra del visitante se desintegra en pájaros. Hecho con Kinect + openFrameworks + Unity. <https://milk.co/treachery> · <https://creators.vice.com/en/topic/the-treachery-of-sanctuary> | *Silueta* blanca + *Cenizas que vuelan* que se desprenden del borde y suben. |
| 3 | **Lluvia de letras** | Camille Utterback & Romy Achituv, *Text Rain* (1999): letras que caen y se apoyan en lo oscuro del cuerpo. <https://camilleutterback.com/projects/text-rain/> · <https://old.rhizome.org/editorial/2009/nov/09/text-rain-1999-cammille-utterback-and-romy-achituv> | *Lluvia de letras* con texto editable; se posan en la silueta y caen cuando el cuerpo se mueve. |
| 4 | **Pintura con el cuerpo** | Memo Akten, *Body Paint* (2009), openFrameworks: el movimiento pinta, la pintura se desvanece. <https://www.memo.tv/works/body-paint/> | *Pintura*: manos y pies dejan trazo; grosor según velocidad; se desvanece. |
| 5 | **Enjambre** | *particle-swarm-pose* (base del módulo original) y Universal Everything, *Transfiguration* / *Walking City* (figuras de partículas). <https://universaleverything.com> | *Enjambre* por cuerpo: partículas que arman la figura quieta y explotan al moverse. |
| 6 | **Contorno eléctrico** | Chunky Move / Gideon Obarzanek y Frieder Weiss (software Kalypso/EyeCon), *Mortal Engine* (2008). <https://chunkymove.com/works/mortal-engine/> · <https://www.shift.jp.org/en/archives/2010/11/mortal_engine.html> · Frieder Weiss: <http://www.frieder-weiss.de/> | *Garabato* (contorno tembloroso) + *Silueta* tenue + glitch y aberración cromática. |
| 7 | **Trama de píxeles** | Adrien M & Claire B, *Pixel* (2014): bailarines dentro de una materia de puntos proyectada. <https://www.am-cb.net/projets/pixel> · Daniel Rozin, *Mechanical Mirrors* (siluetas en tramas físicas): <http://www.smoothware.com/danny/> | *Grilla de píxeles*: celdas que se encienden con la silueta y se apagan con inercia. |
| 8 | **Cortinas de líneas** | Klaus Obermaier & Ars Electronica Futurelab, *Apparition* (2004): campos de líneas y tramas que el cuerpo deforma. <https://www.exile.at/apparition/> | *Cortinas de líneas*: líneas verticales que las articulaciones curvan y apartan. |
| 9 | **Esqueleto y enlaces** | Golan Levin & Zach Lieberman, *Messa di Voce* (2003); bocetos de Zach Lieberman con esqueletos y líneas. <http://www.tmema.org/messa/messa.html> · <https://zach.li/> | Esqueleto luminoso, *Líneas vivas* y enlaces entre cuerpos con ecos. Pensada para el audio. |
| 0 | **Niebla de video** | Ryoichi Kurokawa (*rheo*, *unfold*) y Rhizomatiks × ELEVENPLAY, *border* (2015): nubes de puntos con profundidad. <https://www.ryoichikurokawa.com/> · <https://rhizomatiks.com/en/work/border/> | *Niebla de puntos*: el brillo del video como nube con profundidad. Necesita que la cámara vea luz sobre los cuerpos. |
| — | **Campo empujado** | Scott Snibbe, *Boundary Functions* (1998) y Rafael Lozano‑Hemmer, *Body Movies* (2001): el cuerpo reorganiza un campo. <https://www.snibbe.com/art/boundaryfunctions> · <https://www.lozano-hemmer.com/body_movies.php> | *Empuje*: trama de puntos desplazada por el borde de la silueta. |
| — | **Esqueleto limpio** | — | Solo esqueleto con video al 50 %. Para calibrar cámaras y zonas. |

## Otras referencias que vale la pena mirar (y de dónde salen ideas de módulos futuros)

- **Google Creative Lab, *Body, Movement, Language: AI Sketches with Bill T. Jones*** (2019) y el repositorio **PoseNet Sketchbook**: bocetos web con PoseNet, directamente comparables con lo que hace Mirador. <https://experiments.withgoogle.com/billtjonesai> · <https://github.com/googlecreativelab/posenet-sketchbook>
- **Move Mirror** (Google, 2018): pose en el navegador con TensorFlow.js. <https://blog.tensorflow.org/2018/07/move-mirror-ai-experiment-with-pose-estimation-tensorflow-js.html>
- **TensorFlow.js pose-detection** (MoveNet), la librería que usa Mirador: <https://github.com/tensorflow/tfjs-models/tree/master/pose-detection>
- **JS AI Body Tracker** (MoveNet / PoseNet / BlazePose en el navegador, con video de archivo): <https://github.com/szczyglis-dev/js-ai-body-tracker>
- **Isadora** (TroikaTronix) y **EyeCon / Kalypso** (Frieder Weiss): el software con el que se hacen muchas de estas obras en danza; útil para saber qué esperan los coreógrafos. <https://troikatronix.com/>
- **Rafael Lozano‑Hemmer, *Pulse Room* / *Body Movies***: sombras a escala urbana con proyección múltiple. <https://www.lozano-hemmer.com/>
- **teamLab**: siluetas y partículas en salas inmersivas de muchos proyectores (referencia de montaje, no de código). <https://www.teamlab.art/>
- **Kimchi and Chips, *Light Barrier***; **Nonotak**: luz volumétrica con cuerpos. Para pensar la relación cuerpo/haz en la sala.

## Cómo agregar una plantilla

En `js/plantillas.js`, sumar una entrada a `PLANTILLAS` con `id`, `nombre`, `key` (tecla o `''`), `origen`, `desc` y un objeto `P` con las secciones que cambia. Todo lo que no esté en `P` toma el valor por defecto de `P_DEFAULT` (`js/core.js`) para la parte visual; cámara, tracking, proyección, rendimiento y audio no se tocan.

```js
{ id:'mi-estetica', nombre:'Mi estética', key:'', origen:'quién / obra / año', desc:'qué se ve',
  P:{ silueta:{ enabled:true, hue:300, white:.2 }, aves:{ enabled:true, rate:.6 },
      echo:{ mode:'screen', decay:.8 }, fx:{ bloom:1.2, chroma:.5 } } },
```
