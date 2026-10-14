// ─────────────────────────────────────────────────────────────────────────────
//  shaders.js — GLSL de los glifos instanciados y del pase final de "película".
//
//  Cada instancia = un glifo del atlas. Atributos por instancia:
//    iPosRot : xyz posición mundo, w rotación (rad)          [dinámico, cada frame]
//    iData   : x tamaño (lado del quad, unidades mundo),
//              y alfa, z slot del atlas, w tinte (0 hueso → 1 ceniza) [dinámico]
//    iMeta   : x nacimiento (s), y semilla, z acento (0/1),
//              w nivel de voz al nacer (0..1)                [eventual]
//
//  La reactividad acústica vive aquí (uniforms uRms/uFreq): se aplica en el
//  siguiente frame tras llegar el paquete WebSocket, sin pasar por la CPU.
// ─────────────────────────────────────────────────────────────────────────────

export const glyphVertex = /* glsl */ `
  attribute vec4 iPosRot;
  attribute vec4 iData;
  attribute vec4 iMeta;

  uniform float uTime;
  uniform float uRms;
  uniform float uFreq;
  uniform float uCols;
  uniform float uRows;
  uniform float uFreshness;
  uniform vec3  uBase;
  uniform vec3  uSecond;
  uniform vec3  uAccent;

  varying vec2  vUv;
  varying vec3  vColor;
  varying float vAlpha;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    vAlpha = iData.y;
    if (vAlpha < 0.002) {               // glifo dormido: fuera del clip, coste ~0
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    float age   = max(uTime - iMeta.x, 0.0);
    float seed  = iMeta.y;
    float born  = iMeta.w;                       // intensidad de la voz al nacer
    float fresh = exp(-age * uFreshness);        // "recién nacida" (~2-3 s)
    float pop   = exp(-age * 7.0);               // destello de nacimiento

    // Escala: pop de nacimiento + amplitud en vivo sobre las recientes + respiración global mínima
    float size = iData.x * (1.0 + pop * (0.25 + 1.1 * born) + uRms * fresh * 0.95 + uRms * 0.035);

    vec3 pos = iPosRot.xyz;

    // Temblor (jitter): ruido escalonado cuya cadencia sigue el tono de la voz
    float steps = floor(uTime * (18.0 + clamp(uFreq, 0.0, 900.0) * 0.03));
    vec2 jit = vec2(hash(seed * 91.7 + steps), hash(seed * 37.3 + steps * 1.37 + 11.0)) - 0.5;
    pos.xy += jit * uRms * (fresh * 16.0 + 1.0);

    // Eje Z: la voz empuja las letras recién nacidas hacia el público
    pos.z += uRms * fresh * 190.0 * (0.35 + seed) + pop * born * 70.0;

    float r = iPosRot.w;
    vec2 q = position.xy * size;
    q = mat2(cos(r), sin(r), -sin(r), cos(r)) * q;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos + vec3(q, 0.0), 1.0);

    float slot = iData.z;
    float col = mod(slot, uCols);
    float row = floor(slot / uCols);
    vUv = vec2((col + uv.x) / uCols, 1.0 - (row + 1.0 - uv.y) / uRows);

    vec3 c = mix(uBase, uSecond, clamp(iData.w, 0.0, 1.0));
    c = mix(c, uAccent, iMeta.z);
    // Las letras recién nacidas arden un instante (sólo ellas superan el umbral del bloom)
    vColor = c * (1.0 + pop * (0.6 + 1.6 * born) + uRms * fresh * 0.7);
  }
`;

export const glyphFragment = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uGlobalAlpha;
  varying vec2  vUv;
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    float a = texture2D(uAtlas, vUv).a * vAlpha * uGlobalAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * a, a);   // premultiplicado → mezcla aditiva ONE/ONE
  }
`;

// Pase final: aberración cromática radial mínima + grano fino.
// Ambos están "anclados a la luz": un píxel negro sale negro absoluto (0,0,0),
// para que el rectángulo del proyector desaparezca en la pared.
export const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.055 },
    uAberration: { value: 0.0022 },
    uResolution: { value: null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uAberration;
    varying vec2 vUv;

    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * uAberration * 4.0;            // sólo crece hacia los bordes
      vec4 g = texture2D(tDiffuse, vUv);
      float rC = texture2D(tDiffuse, vUv + off).r;
      float bC = texture2D(tDiffuse, vUv - off).b;
      vec3 col = vec3(rC, g.g, bC);

      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float n = rand(vUv * 1371.0 + fract(uTime * 7.31)) - 0.5;
      col += n * uGrain * smoothstep(0.0, 0.35, lum) * (0.35 + lum);
      col = max(col, 0.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
