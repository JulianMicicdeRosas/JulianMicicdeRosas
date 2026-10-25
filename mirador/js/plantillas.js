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
  { id:'videoplace', nombre:'Videoplace', key:'1', origen:'Myron Krueger, 1974–', desc:'Silueta plana de color saturado sobre negro. El origen de todo esto.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, mask:{ source:'esqueleto', bodyWidth:1.05 }, silueta:{ enabled:true, hue:120, white:0, opacity:1, soft:.02, edge:0, fill:true },
        echo:{ mode:'directo', decay:0 }, fx:{ bloom:.2, threshold:.7, chroma:0, vignette:0 } } },
  { id:'sombra-aves', nombre:'Sombra que se deshace', key:'2', origen:'Chris Milk, The Treachery of Sanctuary, 2012', desc:'Sombra blanca; del borde se desprenden cenizas que suben como una bandada.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, silueta:{ enabled:true, hue:40, white:.9, opacity:.85, soft:.05, edge:.4, edgeHue:35 }, aves:{ enabled:true, rate:1.2, lift:1.1, size:3.2, hue:35, white:.7, life:1.2 },
        echo:{ mode:'screen', decay:.75, zoom:1.001 }, fx:{ bloom:.9, threshold:.5, chroma:.2, vignette:.4 } } },
  { id:'text-rain', nombre:'Lluvia de letras', key:'3', origen:'Camille Utterback & Romy Achituv, Text Rain, 1999', desc:'Letras que caen y se posan sobre los cuerpos; al moverse, caen.',
    P:{ cam:{ showVideo:true, videoOpacity:.28, saturate:0, contrast:1.3 }, track:{ showSkeleton:false }, lluvia:{ enabled:true, density:1.1, size:24, speed:.9, hue:48, white:.35, font:'serif' },
        echo:{ mode:'directo', decay:0 }, fx:{ bloom:.6, threshold:.55, chroma:0, vignette:.3 } } },
  { id:'body-paint', nombre:'Pintura con el cuerpo', key:'4', origen:'Memo Akten, Body Paint, 2009', desc:'Manos y pies pintan; el trazo vive y se desvanece. Más velocidad, más pintura.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, pintura:{ enabled:true, width:16, fade:.01, useBodyHue:true, parts:'manos y pies', glow:.9 },
        echo:{ mode:'screen', decay:.6 }, fx:{ bloom:1.4, threshold:.35, chroma:1.2, vignette:.4 } } },
  { id:'enjambre', nombre:'Enjambre', key:'5', origen:'particle-swarm-pose · Universal Everything, Transfiguration', desc:'Partículas que arman el cuerpo cuando está quieto y explotan con el movimiento.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, swarm:{ enabled:true, density:300, sensitivity:6, keepForm:.2, size:2.6, useBodyHue:true, glow:.9 },
        echo:{ mode:'screen', decay:.86, zoom:1.003 }, fx:{ bloom:1.2, threshold:.4, chroma:.9, vignette:.35 } } },
  { id:'mortal-engine', nombre:'Contorno eléctrico', key:'6', origen:'Chunky Move / Frieder Weiss, Mortal Engine, 2008', desc:'Contorno tembloroso, glitch y aberración; el cuerpo como señal interferida.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, scribble:{ enabled:true, iso:.5, jitter:.014, width:2.2, hue:180, glow:.9 }, silueta:{ enabled:true, hue:200, white:0, opacity:.18, soft:.1, edge:0 },
        echo:{ mode:'additive', decay:.82, zoom:1.006, rotate:0 }, fx:{ bloom:1.6, threshold:.3, chroma:2.2, glitch:.35, glitchBlocks:48, vignette:.5 } } },
  { id:'pixel', nombre:'Trama de píxeles', key:'7', origen:'Adrien M & Claire B, Pixel, 2014 · Daniel Rozin, Mirrors', desc:'La silueta encendida en una grilla de celdas que se apagan con inercia.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, grilla:{ enabled:true, cell:28, gap:.25, inertia:.9, hue:190, white:.35, square:true },
        echo:{ mode:'directo', decay:0 }, fx:{ bloom:.8, threshold:.5, chroma:.3, vignette:.2 } } },
  { id:'apparition', nombre:'Cortinas de líneas', key:'8', origen:'Klaus Obermaier & Ars Electronica Futurelab, Apparition, 2004', desc:'Un campo de líneas verticales que el cuerpo curva y aparta al pasar.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:false }, cortinas:{ enabled:true, spacing:20, force:1.1, radius:.24, segments:20, width:1.3, hue:200, white:.65, glow:.7 },
        echo:{ mode:'screen', decay:.5 }, fx:{ bloom:.9, threshold:.45, chroma:.4, vignette:.4 } } },
  { id:'messa', nombre:'Esqueleto y enlaces', key:'9', origen:'Golan Levin & Zach Lieberman, Messa di Voce, 2003 · Zach Lieberman, sketches', desc:'Líneas vivas entre cuerpos; esqueleto luminoso con ecos. Pensado para reaccionar al audio.',
    P:{ cam:{ showVideo:false }, track:{ showSkeleton:true, boneWidth:3.5, glow:1, showJoints:true, jointSize:7 }, link:{ enabled:true, range:.5, energy:1.3 }, vivas:{ enabled:true, selMin:.4, soft:.2, scatter:.7, keepForm:.5, size:2.6, hue:160 },
        echo:{ mode:'screen', decay:.9, zoom:1.004 }, fx:{ bloom:1.3, threshold:.4, chroma:.9, vignette:.35 } } },
  { id:'niebla', nombre:'Niebla de video', key:'0', origen:'Ryoichi Kurokawa · Rhizomatiks, border', desc:'El brillo del video como nube de puntos con profundidad. Necesita luz sobre los cuerpos (fuente brillo).',
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
