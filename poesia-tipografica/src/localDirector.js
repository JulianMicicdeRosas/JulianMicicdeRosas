// ─────────────────────────────────────────────────────────────────────────────
//  localDirector.js — Director de arte de respaldo en el navegador (sin backend)
//  y normalización del contrato "art_direction" recibido del servidor.
//  Es el espejo de heuristic_direction() / sanitize_direction() de server.py.
// ─────────────────────────────────────────────────────────────────────────────
import { SHAPE_NAMES } from './shapeLibrary.js';
import { PHYSICS_MODES } from './typeField.js';

const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const LEX_FIG = {
  luna: ['luna', 'lunar', 'noche', 'nocturno', 'eclipse'],
  corazon: ['corazon', 'amor', 'latido', 'pecho', 'amar', 'amada', 'amado', 'beso'],
  gota: ['lagrima', 'lagrimas', 'gota', 'llorar', 'llanto', 'rocio'],
  ojo: ['ojo', 'ojos', 'mirada', 'mirar', 'pupila', 'ver', 'veo'],
  sol: ['sol', 'luz', 'dia', 'amanecer', 'alba', 'mediodia', 'verano'],
  estrella: ['estrella', 'estrellas', 'astro', 'constelacion', 'cielo'],
  espiral: ['espiral', 'remolino', 'vertigo', 'laberinto', 'caracol'],
  ola: ['mar', 'ola', 'olas', 'oceano', 'agua', 'rio', 'marea', 'orilla'],
  arbol: ['arbol', 'arboles', 'bosque', 'raiz', 'raices', 'rama', 'ramas', 'tronco'],
  pajaro: ['pajaro', 'pajaros', 'ave', 'aves', 'vuelo', 'volar', 'alas', 'golondrina'],
  pez: ['pez', 'peces', 'escama', 'anzuelo'],
  hoja: ['hoja', 'hojas', 'otono'],
  flor: ['flor', 'flores', 'rosa', 'petalo', 'petalos', 'jardin', 'primavera'],
  montana: ['montana', 'montanas', 'piedra', 'cumbre', 'cerro', 'volcan'],
  llama: ['fuego', 'llama', 'llamas', 'arder', 'arde', 'quemar', 'hoguera', 'incendio', 'vela'],
  mariposa: ['mariposa', 'mariposas', 'crisalida', 'polilla'],
  reloj: ['reloj', 'hora', 'horas', 'minuto', 'espera', 'esperar'],
  casa: ['casa', 'hogar', 'puerta', 'ventana', 'techo', 'habitacion'],
  mano: ['mano', 'manos', 'dedos', 'tocar', 'caricia', 'palma'],
  nube: ['nube', 'nubes', 'niebla', 'bruma', 'tormenta'],
};
const LEX_PHYS = {
  lluvia_text_rain: ['lluvia', 'llueve', 'caer', 'cae', 'caen', 'caida', 'llanto', 'lagrimas', 'peso', 'descender'],
  enjambre_lozano: ['nosotros', 'multitud', 'voces', 'gente', 'ciudad', 'pajaros', 'abejas', 'todos', 'juntos'],
  vortice_sandison: ['tiempo', 'viento', 'remolino', 'girar', 'gira', 'vertigo', 'eterno', 'universo', 'cosmos', 'infinito'],
  dispersion_ceniza: ['ceniza', 'cenizas', 'polvo', 'olvido', 'olvidar', 'muerte', 'morir', 'humo', 'ruina', 'adios', 'nada'],
};
const ACCENTS = { ambar: '#E3A14B', carmin: '#B3122E', ninguno: '#C9C4BA' };
const LEX_ACCENT = {
  carmin: ['sangre', 'herida', 'corazon', 'rojo', 'beso', 'fuego', 'amor', 'rosa'],
  ambar: ['sol', 'luz', 'oro', 'dorado', 'fuego', 'vela', 'otono', 'miel', 'amanecer'],
};
const STOP = new Set(
  'el la los las un una unos unas de del al a en y o u que se su sus mi mis tu tus me te le lo nos es son fue como con por para sin sobre entre hasta desde cuando donde quien ya no si mas pero muy tan este esta eso ese esa hay ha he yo el ella ellos todo toda'.split(' '),
);

const recentModes = [];

function keywordsOf(text) {
  const words = (text.toLowerCase().match(/[a-záéíóúüñ]+/g) || []).filter((w) => w.length > 2 && !STOP.has(strip(w)));
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 6);
}

export function localArtDirection(text) {
  const toks = new Set(strip(text).match(/[a-zñü]+/g) || []);
  const best = (lex) => {
    let name = null, score = 0;
    for (const [k, words] of Object.entries(lex)) {
      const sc = words.filter((w) => toks.has(w)).length;
      if (sc > score) [name, score] = [k, sc];
    }
    return [name, score];
  };
  let [figure] = best(LEX_FIG);
  let [physics, ps] = best(LEX_PHYS);
  if (!physics) physics = PHYSICS_MODES[(Math.random() * 4) | 0];
  let mode = figure && ps > 0 ? 'hibrido' : figure ? 'concreto' : 'simbolico';
  const n = recentModes.length;
  if (n >= 2 && recentModes[n - 1] === mode && recentModes[n - 2] === mode) {
    if (mode === 'simbolico') {
      mode = 'hibrido';
      figure = figure || SHAPE_NAMES[(Math.random() * SHAPE_NAMES.length) | 0];
    } else mode = 'simbolico';
  }
  recentModes.push(mode);
  if (recentModes.length > 4) recentModes.shift();
  let accent = 'ninguno';
  for (const [k, words] of Object.entries(LEX_ACCENT)) if (words.some((w) => toks.has(w))) { accent = k; break; }
  return normalizeDirection({
    modo_visual: mode,
    figura: figure || SHAPE_NAMES[(Math.random() * SHAPE_NAMES.length) | 0],
    svg_paths: [],
    relleno: 'ambos',
    fisica: { modo: physics, intensidad: Math.min(1, 0.35 + 0.08 * toks.size), velocidad: 0.45, turbulencia: physics === 'dispersion_ceniza' ? 0.7 : 0.4, densidad: 0.6 },
    paleta: { base: '#F4F1EA', secundario: '#8C8984', acento: ACCENTS[accent], uso_acento: accent === 'ninguno' ? 0 : 0.12 },
    tipografia: 'mixta',
    palabras_clave: keywordsOf(text),
    emocion: 'contemplacion',
    duracion_s: 14,
    verso: text,
    provider: 'local',
  });
}

/** Garantiza el contrato aunque el servidor (o un LLM) mande algo incompleto. */
export function normalizeDirection(d = {}) {
  const pick = (v, list, def) => (list.includes(v) ? v : def);
  const num = (v, def) => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : def);
  const fis = typeof d.fisica === 'object' && d.fisica ? d.fisica : {};
  const pal = typeof d.paleta === 'object' && d.paleta ? d.paleta : {};
  return {
    ...d,
    modo_visual: pick(d.modo_visual, ['concreto', 'simbolico', 'hibrido'], 'simbolico'),
    figura: pick(d.figura, SHAPE_NAMES, SHAPE_NAMES[0]),
    svg_paths: Array.isArray(d.svg_paths) ? d.svg_paths.filter((p) => typeof p === 'string').slice(0, 3) : [],
    relleno: pick(d.relleno, ['contorno', 'volumen', 'ambos'], 'ambos'),
    fisica: {
      modo: pick(fis.modo, PHYSICS_MODES, 'lluvia_text_rain'),
      intensidad: num(fis.intensidad, 0.5),
      velocidad: num(fis.velocidad, 0.45),
      turbulencia: num(fis.turbulencia, 0.4),
      densidad: num(fis.densidad, 0.6),
    },
    paleta: {
      base: /^#[0-9a-f]{6}$/i.test(pal.base) ? pal.base : '#F4F1EA',
      secundario: /^#[0-9a-f]{6}$/i.test(pal.secundario) ? pal.secundario : '#8C8984',
      acento: /^#[0-9a-f]{6}$/i.test(pal.acento) ? pal.acento : ACCENTS[pal.acento] || '#C9C4BA',
      uso_acento: Math.min(0.25, num(pal.uso_acento, 0.06)),
    },
    tipografia: pick(d.tipografia, ['serif', 'mono', 'mixta'], 'mixta'),
    palabras_clave: Array.isArray(d.palabras_clave) ? d.palabras_clave.map(String).slice(0, 6) : [],
    duracion_s: Math.min(40, Math.max(6, +d.duracion_s || 14)),
    verso: typeof d.verso === 'string' ? d.verso : '',
  };
}
