# Plantillas: estéticas y las obras de referencia

Cada plantilla de Mirador parte de una obra conocida de cuerpo en movimiento + proyección. No son copias (ninguna de esas obras está publicada como código que se pueda cargar tal cual): son **recreaciones livianas** de la idea visual, hechas con los módulos del programa. Las referencias sirven para mirar video de la obra original y ajustar hacia ahí.

Se eligen en la pestaña **Plantillas** o con las teclas **1‑9 y 0**. Después se combinan y ajustan en **Módulos** y quedan guardadas en la sesión.

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
