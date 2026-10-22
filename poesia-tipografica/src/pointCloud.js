// ─────────────────────────────────────────────────────────────────────────────
//  pointCloud.js — Estética "pointcloud" (à la TouchDesigner) para las figuras.
//
//  Cada figura (caligrama, título, logo) se acompaña de ~80 000 puntos luminosos
//  muestreados de su máscara y extruidos en Z según la luz volumétrica: un relieve
//  de puntos que la cámara orbita lentamente. Los puntos viajan de una figura a la
//  siguiente por una curva Bézier en GPU (sin trabajo de CPU por frame), respiran
//  con ruido y la voz los empuja en profundidad.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const vertex = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aTarget;
  attribute vec4 aData;   // x semilla, y luminancia, z retardo, w borde
  uniform float uTime;
  uniform float uT0;
  uniform float uDur;
  uniform float uRms;
  uniform float uSize;
  uniform float uScale;
  uniform float uNoise;
  uniform float uCamDist;
  uniform float uDensity;
  varying float vAlpha;
  varying float vLum;

  vec3 drift(vec3 p, float s) {
    return vec3(
      sin(p.y * 0.011 + uTime * 0.55 + s * 6.28),
      cos(p.x * 0.009 + uTime * 0.47 + s * 4.1),
      sin((p.x + p.y) * 0.006 + uTime * 0.39 + s * 9.3));
  }

  void main() {
    float seed = aData.x, lum = aData.y, delay = aData.z, edge = aData.w;
    float k = clamp((uTime - uT0 - delay) / uDur, 0.0, 1.0);
    k = k * k * (3.0 - 2.0 * k);
    // Bézier cuadrática con un punto de control que abre el vuelo en profundidad
    vec3 mid = mix(aStart, aTarget, 0.5) + vec3((seed - 0.5) * 240.0, (fract(seed * 7.3) - 0.5) * 160.0, (fract(seed * 3.1) - 0.5) * 520.0);
    vec3 p = mix(mix(aStart, mid, k), mix(mid, aTarget, k), k);
    float travel = 4.0 * k * (1.0 - k);
    p += drift(p, seed) * (uNoise + 22.0 * travel);
    p.z += uRms * 150.0 * (seed - 0.25);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float sz = uSize * (0.6 + 0.6 * lum + 0.5 * edge) * (1.0 + uRms * 1.2);
    gl_PointSize = max(1.0, sz * uScale / -mv.z);
    // niebla de profundidad: lo que se aleja de la cámara se apaga
    float depth = -mv.z - uCamDist;
    float fog = 1.0 - smoothstep(-80.0, 420.0, depth) * 0.75;
    // brillo por punto bajo y normalizado por densidad: puntos finos, nunca una mancha saturada
    vAlpha = (0.07 + 0.2 * lum + 0.22 * edge) * fog * uDensity;
    vLum = lum;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uSecond;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vLum;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    float a = (1.0 - d) * (1.0 - d) * vAlpha * uOpacity;
    vec3 col = mix(uSecond, uBase, 0.35 + 0.65 * vLum);
    gl_FragColor = vec4(col * a, a);
  }
`;

export class PointCloud {
  constructor({ count = 80000, W = 1778, H = 1000 } = {}) {
    this.N = count;
    this.W = W;
    this.H = H;
    this.start = new Float32Array(count * 3);
    this.target = new Float32Array(count * 3);
    this.data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      this._ambient(this.target, i);
      this.start.set(this.target.subarray(i * 3, i * 3 + 3), i * 3);
      this.data[i * 4] = Math.random();
      this.data[i * 4 + 1] = Math.random() * 0.4;
    }
    const geo = new THREE.BufferGeometry();
    this.aStart = new THREE.BufferAttribute(this.start, 3).setUsage(THREE.DynamicDrawUsage);
    this.aTarget = new THREE.BufferAttribute(this.target, 3).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.BufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aTarget); // requerido por three; el shader usa aStart/aTarget
    geo.setAttribute('aStart', this.aStart);
    geo.setAttribute('aTarget', this.aTarget);
    geo.setAttribute('aData', this.aData);
    this.uniforms = {
      uTime: { value: 0 },
      uT0: { value: -100 },
      uDur: { value: 2.6 },
      uRms: { value: 0 },
      uSize: { value: 2.3 },
      uScale: { value: 1000 },
      uNoise: { value: 2.5 },
      uCamDist: { value: 1866 },
      uOpacity: { value: 0 },
      uDensity: { value: 1 },
      uBase: { value: new THREE.Color('#F4F1EA') },
      uSecond: { value: new THREE.Color('#8C8984') },
    };
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = -1; // detrás de las letras
    this.opacity = 0;
    this.opacityTarget = 0.12;
    this.noiseTarget = 2.5;
    this.time = 0;
  }

  _ambient(arr, i) {
    arr[i * 3] = (Math.random() - 0.5) * this.W * 1.1;
    arr[i * 3 + 1] = (Math.random() - 0.5) * this.H * 1.1;
    arr[i * 3 + 2] = (Math.random() - 0.5) * 700;
  }

  resize(W, H, pixelHeight, fovDeg, camDist) {
    this.W = W;
    this.H = H;
    this.uniforms.uScale.value = pixelHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)));
    this.uniforms.uCamDist.value = camDist;
  }

  /** Posición actual aproximada de cada punto (para encadenar morphs sin saltos). */
  _freezeCurrent() {
    const k = Math.min(1, Math.max(0, (this.time - this.uniforms.uT0.value) / this.uniforms.uDur.value));
    if (k >= 1) {
      this.start.set(this.target);
    } else {
      // morph a medio camino: interpolación lineal (suficiente, el ruido disimula)
      for (let j = 0; j < this.start.length; j++) this.start[j] += (this.target[j] - this.start[j]) * k;
    }
  }

  _commit(dur) {
    this.uniforms.uT0.value = this.time;
    this.uniforms.uDur.value = dur;
    this.aStart.needsUpdate = true;
    this.aTarget.needsUpdate = true;
    this.aData.needsUpdate = true;
  }

  /** Muestrea la figura (máscara + luz) en el mismo espacio mundo que las letras. */
  setFigure(fig, map, depth = 220) {
    if (!fig?.mask || !fig?.lum) return;
    this._freezeCurrent();
    const R = fig.res;
    const { mask, lum } = fig;
    const filled = [];
    for (let i = 0; i < mask.length; i++) if (mask[i] > 0.5) filled.push(i);
    if (!filled.length) return;
    const isEdge = (i) => {
      const x = i % R;
      return x === 0 || x === R - 1 || mask[i - 1] < 0.5 || mask[i + 1] < 0.5 || mask[i - R] < 0.5 || mask[i + R] < 0.5;
    };
    const { k, cx, cy, ox, oy } = map;
    let maxR = 1;
    for (let n = 0; n < this.N; n++) {
      let idx, e = 0, l = 0;
      for (let tries = 0; tries < 12; tries++) {
        idx = filled[(Math.random() * filled.length) | 0];
        e = isEdge(idx) ? 1 : 0;
        l = lum[idx];
        if (Math.random() < (e ? 1 : 0.25 + 0.75 * l)) break; // más puntos en luces y bordes
      }
      const x = (idx % R) + Math.random() - 0.5;
      const y = ((idx / R) | 0) + Math.random() - 0.5;
      const wx = (x - ox) * k + cx;
      const wy = (oy - y) * k + cy;
      const wz = (l - 0.5) * depth + (Math.random() - 0.5) * depth * 0.18;
      this.target[n * 3] = wx;
      this.target[n * 3 + 1] = wy;
      this.target[n * 3 + 2] = wz;
      const r = Math.hypot(wx - cx, wy - cy);
      if (r > maxR) maxR = r;
      this.data[n * 4 + 1] = l;
      this.data[n * 4 + 3] = e;
    }
    for (let n = 0; n < this.N; n++) {
      const r = Math.hypot(this.target[n * 3] - cx, this.target[n * 3 + 1] - cy) / maxR;
      this.data[n * 4 + 2] = r * 1.4 + Math.random() * 0.9; // florece desde el centro
    }
    // misma cantidad de puntos en una figura chica = más superposición → bajar el brillo
    this.uniforms.uDensity.value = Math.min(1.6, Math.max(0.35, (filled.length * 1.6) / this.N));
    this._commit(2.6);
    this.opacityTarget = 1;
    this.noiseTarget = 2.2;
  }

  /** La figura se deshace en polvo luminoso que queda flotando. */
  scatter() {
    this._freezeCurrent();
    for (let n = 0; n < this.N; n++) {
      const j = n * 3;
      const dx = this.start[j], dy = this.start[j + 1];
      const d = Math.hypot(dx, dy) + 1;
      const f = 120 + Math.random() * 420;
      this.target[j] = dx + (dx / d) * f + (Math.random() - 0.5) * 260;
      this.target[j + 1] = dy + (dy / d) * f + Math.random() * 220;
      this.target[j + 2] = this.start[j + 2] + (Math.random() - 0.5) * 600;
      this.data[n * 4 + 2] = Math.random() * 0.8;
      this.data[n * 4 + 3] = 0;
    }
    this._commit(4.5);
    this.opacityTarget = 0.16;
    this.noiseTarget = 9;
  }

  setPalette(base, second) {
    this.uniforms.uBase.value.copy(base);
    this.uniforms.uSecond.value.copy(second);
  }

  update(dt, t, rms, { visible = true, intensity = 1 } = {}) {
    this.time = t;
    const u = this.uniforms;
    u.uTime.value = t;
    u.uRms.value = rms;
    const goal = visible ? this.opacityTarget * intensity : 0;
    this.opacity += (goal - this.opacity) * (1 - Math.exp(-dt * 1.2));
    u.uOpacity.value = this.opacity;
    u.uNoise.value += (this.noiseTarget - u.uNoise.value) * (1 - Math.exp(-dt * 0.8));
    this.points.visible = this.opacity > 0.002;
  }
}
