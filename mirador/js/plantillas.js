"use strict";
/* =====================================================================
   MIRADOR — plantillas (estéticas)
   Cada plantilla es una combinación de módulos + parámetros, inspirada
   en una obra de referencia de cuerpo en movimiento y proyección.
   Las referencias y enlaces están en PLANTILLAS.md.
   Aplicar una plantilla reemplaza la parte visual de P (módulos, eco,
   posproceso, esqueleto) y deja intactos cámara, tracking, mapeo,
   rendimiento y audio.
   ===================================================================== */
const VISUAL_KEYS = ['link', 'echo', 'fx', ...MODULE_IDS];
const PLANTILLAS = [
  /* ---------- nuevas (efectos de GPU) ---------- */
  { id:'cascada', nueva:true, nombre:'Cascada de píxeles', key:'1', origen:'Adrien M & Claire B, Pixel, 2014 · Hakanaï', desc:'Una cortina vertical de luz que cae sin parar y se abre alrededor de cada cuerpo; al moverse, la salpica.',
    P:{ track:{ showSkeleton:false }, link:{ enabled:false }, particulas:{ enabled:true, modo:'lluvia', paleta:'hielo', cantidad:1.3, tamano:1.3, brillo:1.7, corriente:.6, escala:1.2, apartar:1.8, atraer:0, agitar:1.4, caida:.9, friccion:.25, cuerpoBrilla:.2 },
        echo:{ mode:'screen', decay:.55, zoom:1 }, fx:{ bloom:1.1, threshold:.32, radius:1.8, chroma:.25, vignette:.25 } } },
  { id:'corrientes', nueva:true, nombre:'Corrientes de luz', key:'2', origen:'Adrien M & Claire B, Pixel · Le mouvement de l’air', desc:'Un río de partículas que fluye por las paredes; los cuerpos lo desvían y el movimiento deja remolinos.',
    P:{ track:{ showSkeleton:false }, link:{ enabled:false }, particulas:{ enabled:true, modo:'flujo', paleta:'aurora', cantidad:1.2, tamano:1.1, brillo:.85, corriente:1.3, escala:.8, apartar:1.3, atraer:0, agitar:1.6, friccion:.2, cuerpoBrilla:.5 },
        echo:{ mode:'screen', decay:.62, zoom:1 }, fx:{ bloom:1.1, threshold:.38, radius:2, chroma:.4, vignette:.3 } } },
  { id:'humo', nueva:true, nombre:'Humo de luz', key:'3', origen:'fluidos en GPU · Memo Akten, Body Paint · Universal Everything', desc:'El cuerpo arde por el borde y suelta humo de colores que sube; las manos lo revuelven.',
    P:{ track:{ showSkeleton:false }, link:{ enabled:false }, fluido:{ enabled:true, paleta:'fuego', emision:1.1, soloBorde:true, agitar:1.2, empuje:.5, ascenso:.9, remolino:.7, corriente:.08, duracion:3.5, memoria:.35, brillo:1.1, saturacion:1.15 },
        echo:{ mode:'directo', decay:0 }, fx:{ bloom:1.2, threshold:.3, radius:2.2, chroma:.3, vignette:.3 } } },
  { id:'tinta', nueva:true, nombre:'Tinta en el agua', key:'4', origen:'Navier-Stokes · Ryoji Ikeda (paleta) · sumi-e', desc:'Tinta azul que el cuerpo deja al pasar y que se queda flotando, girando lenta, mucho tiempo.',
    P:{ track:{ showSkeleton:false }, link:{ enabled:false }, fluido:{ enabled:true, paleta:'tinta', emision:.8, soloBorde:false, agitar:1.6, todoElCuerpo:true, empuje:.8, ascenso:0, remolino:1.1, corriente:.15, duracion:9, memoria:.75, brillo:.9, saturacion:1 },
        echo:{ mode:'directo', decay:0 }, fx:{ bloom:.8, threshold:.4, radius:2, chroma:.2, vignette:.35 } } },
  { id:'membrana', nueva:true, nombre:'Membrana', key:'5', origen:'Klaus Obermaier, Apparition, 2004', desc:'Hilos de luz verticales, como una tela tensa: el cuerpo los empuja y quedan vibrando detrás.',
    P:{ track:{ showSkeleton:false }, link:{ enabled:false }, membrana:{ enabled:true, trama:'vertical', separacion:14, grosor:.9, empuje:1.5, estela:1.6, ondular:.4, brillo:1.1, paleta:'oro' },
        echo:{ mode:'screen', decay:.6, zoom:1 }, fx:{ bloom:1.2, threshold:.35, radius:1.6, chroma:0, vignette:.3 } } },
  { id:'red', nueva:true, nombre:'Red elástica', key:'6', origen:'Klaus Obermaier, Apparition · Chunky Move, Mortal Engine', desc:'Una grilla de neón que se curva como un trampolín alrededor de los cuerpos.',
    P:{ track:{ showSkeleton:false }, link:{ enabled:false }, membrana:{ enabled:true, trama:'grilla', separacion:26, grosor:1.1, empuje:1.8, estela:2, ondular:.2, brillo:1.2, paleta:'neon' },
        echo:{ mode:'additive', decay:.45, zoom:1 }, fx:{ bloom:1.4, threshold:.3, radius:2, chroma:0, vignette:.35 } } },
  { id:'topografia', nueva:true, nombre:'Topografía', key:'7', origen:'Golan Levin, Augmented Hand Series · curvas de nivel', desc:'Cada cuerpo es una montaña en un mapa: las curvas de nivel laten hacia afuera y se funden entre cuerpos cercanos.',
    P:{ track:{ showSkeleton:false }, link:{ enabled:false }, ondas:{ enabled:true, cantidad:16, velocidad:.3, grosor:1, temblor:.6, relleno:.12, brillo:1.1, paleta:'neon' },
        echo:{ mode:'screen', decay:.45, zoom:1 }, fx:{ bloom:1, threshold:.35, radius:1.5, chroma:.5, vignette:.3 } } },
  { id:'liquido', nueva:true, nombre:'Cuerpo líquido', key:'8', origen:'Golan Levin, Augmented Hand Series, 2014', desc:'La silueta como mercurio de colores: tiembla, se estira con el movimiento y se abre en rojo, verde y azul en los bordes.',
    P:{ track:{ showSkeleton:false }, link:{ enabled:false }, liquida:{ enabled:true, deformar:1.4, escala:1, estirar:1.6, separarColor:1.6, borde:1.2, relleno:.75, brillo:1, paleta:'coral' }, ondas:{ enabled:true, cantidad:9, velocidad:.18, grosor:.8, temblor:1, relleno:0, brillo:.45, paleta:'coral' },
        echo:{ mode:'screen', decay:.55, zoom:1.002 }, fx:{ bloom:1.1, threshold:.4, radius:1.8, chroma:.8, vignette:.35 } } },
  { id:'polvo', nueva:true, nombre:'Polvo de estrellas', key:'9', origen:'Universal Everything, Transfiguration · particle-swarm-pose', desc:'Polvo dorado que se junta sobre el cuerpo quieto y estalla en una nube cuando se mueve.',
    P:{ track:{ showSkeleton:false }, link:{ enabled:false }, particulas:{ enabled:true, modo:'atraer', paleta:'oro', cantidad:1.1, tamano:1.2, brillo:1.9, corriente:.6, escala:1.4, apartar:0, atraer:1.6, agitar:2.4, friccion:.45, cuerpoBrilla:1 },
        echo:{ mode:'screen', decay:.8, zoom:1.001 }, fx:{ bloom:1.5, threshold:.3, radius:2, chroma:.5, vignette:.35 } } },
  { id:'aurora', nueva:true, nombre:'Aurora', key:'0', origen:'Pixel · fluidos · cielo polar', desc:'Velos de luz verde y violeta que nacen del borde de los cuerpos, con una corriente de partículas finas por delante.',
    P:{ track:{ showSkeleton:false }, link:{ enabled:false }, fluido:{ enabled:true, paleta:'aurora', emision:.9, soloBorde:true, agitar:1, empuje:.4, ascenso:.6, remolino:.5, corriente:.15, duracion:5, memoria:.5, brillo:1, saturacion:1.2 },
        particulas:{ enabled:true, modo:'flujo', paleta:'lavanda', cantidad:.7, tamano:.8, brillo:.55, corriente:1, escala:.9, apartar:1.2, agitar:1.2, friccion:.3, cuerpoBrilla:.4 },
        echo:{ mode:'directo', decay:0 }, fx:{ bloom:1.4, threshold:.28, radius:2.4, chroma:.3, vignette:.3 } } },
  { id:'orbitas', nueva:true, nombre:'Eclipse', key:'', origen:'Ryoji Ikeda (blanco y negro) · órbitas', desc:'Blanco sobre negro: partículas en órbita alrededor de cada cuerpo y anillos de contorno, muy sobrio.',
    P:{ track:{ showSkeleton:false }, link:{ enabled:false }, particulas:{ enabled:true, modo:'orbita', paleta:'mono', cantidad:1, tamano:.8, brillo:.9, corriente:.5, escala:1, apartar:.4, atraer:1.4, agitar:1.2, friccion:.35, cuerpoBrilla:.6 }, ondas:{ enabled:true, cantidad:7, velocidad:.15, grosor:.6, temblor:0, relleno:.05, brillo:.5, paleta:'mono' },
        echo:{ mode:'screen', decay:.75, zoom:1 }, fx:{ bloom:.9, threshold:.4, radius:1.6, chroma:0, vignette:.4 } } },
  { id:'cortina-oro', nueva:true, nombre:'Lluvia dorada', key:'', origen:'Adrien M & Claire B, Pixel · Random International, Rain Room', desc:'Lluvia de oro fina sobre hilos verticales: los cuerpos abren un hueco seco en la lluvia.',
    P:{ track:{ showSkeleton:false }, link:{ enabled:false }, particulas:{ enabled:true, modo:'lluvia', paleta:'oro', cantidad:1, tamano:.8, brillo:1, corriente:.3, escala:1, apartar:2.2, agitar:.8, caida:1.3, friccion:.15, cuerpoBrilla:0 }, membrana:{ enabled:true, trama:'vertical', separacion:40, grosor:.6, empuje:1, estela:.6, ondular:.2, brillo:.35, paleta:'oro' },
        echo:{ mode:'screen', decay:.5, zoom:1 }, fx:{ bloom:1.2, threshold:.33, radius:1.8, chroma:.2, vignette:.3 } } },
  /* ---------- clásicas ---------- */
  { id:'videoplace', nombre:'Videoplace', key:'', origen:'Myron Krueger, 1974–', desc:'Silueta plana de color saturado sobre negro. El origen de todo esto.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, mask:{ source:'esqueleto', bodyWidth:1.05 }, silueta:{ enabled:true, hue:120, white:0, opacity:1, soft:.02, edge:0, fill:true },
        echo:{ mode:'directo', decay:0 }, fx:{ bloom:.2, threshold:.7, chroma:0, vignette:0 } } },
  { id:'sombra-aves', nombre:'Sombra que se deshace', key:'', origen:'Chris Milk, The Treachery of Sanctuary, 2012', desc:'Sombra blanca; del borde se desprenden cenizas que suben como una bandada.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, silueta:{ enabled:true, hue:40, white:.9, opacity:.85, soft:.05, edge:.4, edgeHue:35 }, aves:{ enabled:true, rate:1.2, lift:1.1, size:3.2, hue:35, white:.7, life:1.2 },
        echo:{ mode:'screen', decay:.75, zoom:1.001 }, fx:{ bloom:.9, threshold:.5, chroma:.2, vignette:.4 } } },
  { id:'text-rain', nombre:'Lluvia de letras', key:'', origen:'Camille Utterback & Romy Achituv, Text Rain, 1999', desc:'Letras que caen y se posan sobre los cuerpos; al moverse, caen.',
    P:{ cam:{ showVideo:true, videoOpacity:.28, saturate:0, contrast:1.3 }, track:{ showSkeleton:false }, lluvia:{ enabled:true, density:1.1, size:24, speed:.9, hue:48, white:.35, font:'serif' },
        echo:{ mode:'directo', decay:0 }, fx:{ bloom:.6, threshold:.55, chroma:0, vignette:.3 } } },
  { id:'body-paint', nombre:'Pintura con el cuerpo', key:'', origen:'Memo Akten, Body Paint, 2009', desc:'Manos y pies pintan; el trazo vive y se desvanece. Más velocidad, más pintura.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, pintura:{ enabled:true, width:16, fade:.01, useBodyHue:true, parts:'manos y pies', glow:.9 },
        echo:{ mode:'screen', decay:.6 }, fx:{ bloom:1.4, threshold:.35, chroma:1.2, vignette:.4 } } },
  { id:'enjambre', nombre:'Enjambre', key:'', origen:'particle-swarm-pose · Universal Everything, Transfiguration', desc:'Partículas que arman el cuerpo cuando está quieto y explotan con el movimiento.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, swarm:{ enabled:true, density:300, sensitivity:6, keepForm:.2, size:2.6, useBodyHue:true, glow:.9 },
        echo:{ mode:'screen', decay:.86, zoom:1.003 }, fx:{ bloom:1.2, threshold:.4, chroma:.9, vignette:.35 } } },
  { id:'mortal-engine', nombre:'Contorno eléctrico', key:'', origen:'Chunky Move / Frieder Weiss, Mortal Engine, 2008', desc:'Contorno tembloroso, glitch y aberración; el cuerpo como señal interferida.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, scribble:{ enabled:true, iso:.5, jitter:.014, width:2.2, hue:180, glow:.9 }, silueta:{ enabled:true, hue:200, white:0, opacity:.18, soft:.1, edge:0 },
        echo:{ mode:'additive', decay:.82, zoom:1.006, rotate:0 }, fx:{ bloom:1.6, threshold:.3, chroma:2.2, glitch:.35, glitchBlocks:48, vignette:.5 } } },
  { id:'pixel', nombre:'Trama de píxeles', key:'', origen:'Adrien M & Claire B, Pixel, 2014 · Daniel Rozin, Mirrors', desc:'La silueta encendida en una grilla de celdas que se apagan con inercia.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, grilla:{ enabled:true, cell:28, gap:.25, inertia:.9, hue:190, white:.35, square:true },
        echo:{ mode:'directo', decay:0 }, fx:{ bloom:.8, threshold:.5, chroma:.3, vignette:.2 } } },
  { id:'apparition', nombre:'Cortinas de líneas', key:'', origen:'Klaus Obermaier & Ars Electronica Futurelab, Apparition, 2004', desc:'Un campo de líneas verticales que el cuerpo curva y aparta al pasar.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, cortinas:{ enabled:true, spacing:20, force:1.1, radius:.24, segments:20, width:1.3, hue:200, white:.65, glow:.7 },
        echo:{ mode:'screen', decay:.5 }, fx:{ bloom:.9, threshold:.45, chroma:.4, vignette:.4 } } },
  { id:'messa', nombre:'Esqueleto y enlaces', key:'', origen:'Golan Levin & Zach Lieberman, Messa di Voce, 2003 · Zach Lieberman, sketches', desc:'Líneas vivas entre cuerpos; esqueleto luminoso con ecos. Pensado para reaccionar al audio.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:true, boneWidth:3.5, glow:1, showJoints:true, jointSize:7 }, link:{ enabled:true, range:.5, energy:1.3 }, vivas:{ enabled:true, selMin:.4, soft:.2, scatter:.7, keepForm:.5, size:2.6, hue:160 },
        echo:{ mode:'screen', decay:.9, zoom:1.004 }, fx:{ bloom:1.3, threshold:.4, chroma:.9, vignette:.35 } } },
  { id:'niebla', nombre:'Niebla de video', key:'', origen:'Ryoichi Kurokawa · Rhizomatiks, border', desc:'El brillo del video como nube de puntos con profundidad. Necesita luz sobre los cuerpos (fuente brillo).',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, mask:{ source:'ambos' }, fog:{ enabled:true, zDepth:.3, drift:.5, size:2.8, hue:200, hueSpread:70 },
        echo:{ mode:'screen', decay:.85, zoom:1.002 }, fx:{ bloom:1.1, threshold:.4, chroma:1, vignette:.4 } } },
  { id:'empuje', nombre:'Campo empujado', key:'', origen:'Scott Snibbe, Boundary Functions · Rafael Lozano-Hemmer, Body Movies', desc:'Una trama de puntos que el cuerpo desplaza desde su borde.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, push:{ enabled:true, force:1.6, size:2.4, hue:330 }, silueta:{ enabled:true, hue:330, white:0, opacity:.12, soft:.1 },
        echo:{ mode:'screen', decay:.7 }, fx:{ bloom:1, threshold:.45, chroma:.6, vignette:.35 } } },
  { id:'limpio', nombre:'Esqueleto limpio', key:'', origen:'Mirador', desc:'Solo el esqueleto por cuerpo, sin ecos. Para calibrar y probar.',
    P:{ cam:{ showVideo:true, videoOpacity:.5 }, track:{ showSkeleton:true, boneWidth:3, glow:.85 }, echo:{ mode:'directo', decay:0 }, fx:{ bloom:.5, threshold:.5, chroma:0, glitch:0, vignette:.2 } } },
];
let plantillaActual = '';
function applyPlantilla(id, opts = {}){
  const t = PLANTILLAS.find(p => p.id === id); if (!t) return false;
  // base limpia de la parte visual
  for (const k of VISUAL_KEYS) Object.assign(P[k], deepClone(P_DEFAULT[k]));
  P.track.showSkeleton = P_DEFAULT.track.showSkeleton; P.track.showJoints = false; P.track.showId = false;
  // overrides
  for (const k in t.P) { if (!P[k]) continue; Object.assign(P[k], deepClone(t.P[k])); }
  plantillaActual = id;
  syncModulesFromP(); if (fbFeed[0]) clearFeedback();
  if (!opts.silent) toast('plantilla: ' + t.nombre + ' · ' + t.origen, 3000);
  if (typeof Sessions !== 'undefined') Sessions.touch();
  if (typeof UI !== 'undefined') UI.refresh();
  return true;
}
/* alias de los nombres de escena del programa anterior (?escena=…) */
const ESCENA_ALIAS = { enjambre:'enjambre', niebla:'niebla', lineas:'messa', garabato:'mortal-engine', empuje:'empuje' };
