// postfx.js — Bloom muy contenido + aberración cromática mínima + grano fino.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FilmShader } from './shaders.js';

export function createPostFX(renderer, scene, camera, opts = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // Umbral alto: sólo las letras recién nacidas (sobre-expuestas en el shader) y los acentos florecen.
  const bloom = new UnrealBloomPass(size, opts.bloomStrength ?? 0.55, opts.bloomRadius ?? 0.32, opts.bloomThreshold ?? 0.9);
  composer.addPass(bloom);

  const film = new ShaderPass(FilmShader);
  film.uniforms.uGrain.value = opts.grain ?? 0.055;
  film.uniforms.uAberration.value = opts.aberration ?? 0.0022;
  composer.addPass(film);

  composer.addPass(new OutputPass());

  return {
    composer,
    bloom,
    film,
    setSize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w, h);
    },
    render(t) {
      film.uniforms.uTime.value = t;
      composer.render();
    },
  };
}
