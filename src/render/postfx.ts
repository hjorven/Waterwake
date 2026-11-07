import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { Weather } from '../sim/world';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Richtungsunschärfe, die zum oberen und unteren Bildrand hin zunimmt (Tilt-Shift) */
const blurShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDir: { value: new THREE.Vector2(1, 0) },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 800) },
    uFocus: { value: 0.52 },
    uBand: { value: 0.12 },
    uStrength: { value: 1 },
  },
  vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir;
    uniform vec2 uTexel;
    uniform float uFocus;
    uniform float uBand;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - uFocus);
      float amount = smoothstep(uBand, uBand + 0.32, d) * uStrength;
      if (amount < 0.02) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      vec2 stp = uDir * uTexel * amount * 3.2;
      vec4 sum = texture2D(tDiffuse, vUv) * 0.227;
      sum += (texture2D(tDiffuse, vUv + stp) + texture2D(tDiffuse, vUv - stp)) * 0.1945;
      sum += (texture2D(tDiffuse, vUv + stp * 2.0) + texture2D(tDiffuse, vUv - stp * 2.0)) * 0.1216;
      sum += (texture2D(tDiffuse, vUv + stp * 3.0) + texture2D(tDiffuse, vUv - stp * 3.0)) * 0.054;
      sum += (texture2D(tDiffuse, vUv + stp * 4.0) + texture2D(tDiffuse, vUv - stp * 4.0)) * 0.0162;
      gl_FragColor = sum;
    }
  `,
};

/** Farbanpassung: Sättigung, Jahreszeiten-Tönung, Vignette, Hitzeflimmern */
const gradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.15 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uVignette: { value: 0.35 },
    uHeat: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform vec3 uTint;
    uniform float uVignette;
    uniform float uHeat;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      if (uHeat > 0.001) {
        float wob = sin(uv.y * 70.0 + uTime * 5.0) * sin(uv.x * 33.0 - uTime * 3.1);
        uv.x += wob * 0.0014 * uHeat * (1.0 - uv.y);
      }
      vec4 c = texture2D(tDiffuse, uv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSaturation) * uTint;
      float v = smoothstep(1.35, 0.45, length((vUv - 0.5) * vec2(1.25, 1.0)));
      c.rgb *= mix(1.0, v, uVignette);
      gl_FragColor = c;
    }
  `,
};

interface Look {
  tint: THREE.Vector3;
  saturation: number;
  heat: number;
}

const LOOKS: Record<Weather, Look> = {
  normal: { tint: new THREE.Vector3(1, 1, 1), saturation: 1.15, heat: 0 },
  schmelze: { tint: new THREE.Vector3(0.93, 0.97, 1.06), saturation: 1.02, heat: 0 },
  duerre: { tint: new THREE.Vector3(1.08, 0.99, 0.86), saturation: 1.1, heat: 1 },
  schlamm: { tint: new THREE.Vector3(1.0, 0.92, 0.98), saturation: 0.95, heat: 0 },
};

/**
 * Nachbearbeitung im Diorama-Stil: Tilt-Shift-Unschärfe oben und unten,
 * leicht übersättigte Farben, Jahreszeiten-Tönung und Hitzeflimmern in der
 * Dürre. Lässt sich abschalten, dann wird direkt gerendert.
 */
export class PostFX {
  enabled = true;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly blurH: ShaderPass;
  private readonly blurV: ShaderPass;
  private readonly grade: ShaderPass;
  private readonly current: Look = { tint: new THREE.Vector3(1, 1, 1), saturation: 1.15, heat: 0 };
  private target: Look = LOOKS.normal;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      samples: renderer.capabilities.isWebGL2 ? 4 : 0,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(pr);
    this.composer.addPass(new RenderPass(scene, camera));
    this.blurH = new ShaderPass(blurShader);
    this.blurH.uniforms.uDir.value.set(1, 0);
    this.blurV = new ShaderPass(blurShader);
    this.blurV.uniforms.uDir.value.set(0, 1);
    this.grade = new ShaderPass(gradeShader);
    this.composer.addPass(this.blurH);
    this.composer.addPass(this.blurV);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.setSize(size.x, size.y);
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    for (const p of [this.blurH, this.blurV]) p.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr));
  }

  setLook(weather: Weather): void {
    this.target = LOOKS[weather];
  }

  /** Jeden Frame: Tönung weich angleichen und rendern */
  render(scene: THREE.Scene, camera: THREE.Camera, time: number, dt: number): void {
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      return;
    }
    const k = Math.min(1, dt * 0.8);
    const c = this.current;
    c.tint.lerp(this.target.tint, k);
    c.saturation += (this.target.saturation - c.saturation) * k;
    c.heat += (this.target.heat - c.heat) * k;
    const u = this.grade.uniforms;
    u.uTint.value.copy(c.tint);
    u.uSaturation.value = c.saturation;
    u.uHeat.value = c.heat;
    u.uTime.value = time;
    this.composer.render();
  }
}
