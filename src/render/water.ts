import * as THREE from 'three';

const vertexShader = /* glsl */ `
  attribute float depth;
  attribute vec2 vel;
  varying float vDepth;
  varying vec2 vVel;
  varying vec3 vWorld;
  void main() {
    vDepth = depth;
    vVel = vel;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  varying float vDepth;
  varying vec2 vVel;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    if (vDepth <= 0.01) discard;
    float speed = length(vVel);
    vec2 dir = speed > 0.001 ? vVel / speed : vec2(0.0, 1.0);
    // Wellen, die in Fließrichtung wandern
    vec2 uv = vWorld.xz;
    float flow = dot(uv, dir) * 2.0 - uTime * (0.6 + min(speed, 2.0) * 1.2);
    float ripple = noise(uv * 3.0 + vec2(uTime * 0.15, 0.0)) * 0.5 + noise(uv * 7.0 - dir * uTime) * 0.5;
    float wave = sin(flow * 3.0 + ripple * 4.0) * 0.5 + 0.5;
    float t = clamp(vDepth / 3.0, 0.0, 1.0);
    vec3 col = mix(uShallow, uDeep, t);
    col += wave * 0.08;
    // Schaum bei starker Strömung
    float foam = smoothstep(2.0, 3.5, speed) * step(0.6, noise(uv * 9.0 + dir * uTime * 3.0));
    col = mix(col, vec3(0.95), foam * 0.8);
    float alpha = mix(0.55, 0.9, t);
    gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * Wasseroberfläche: pro Zelle ein Quad auf Höhe Boden + Tiefe, Zellen ohne
 * Wasser werden im Shader verworfen. Höhen werden pro Bild aus den
 * Simulationsdaten geschrieben.
 */
export class WaterRenderer {
  readonly mesh: THREE.Mesh;
  private readonly w: number;
  private readonly h: number;
  private readonly pos: THREE.BufferAttribute;
  private readonly depthAttr: THREE.BufferAttribute;
  private readonly velAttr: THREE.BufferAttribute;
  private readonly uniforms = {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color(0x5fb8c9) },
    uDeep: { value: new THREE.Color(0x1f5f8a) },
  };
  private terrain = new Float32Array(0);
  private depth: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private shownDepth = new Float32Array(0);

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    const positions = new Float32Array(n * 4 * 3);
    const depths = new Float32Array(n * 4);
    const vels = new Float32Array(n * 4 * 2);
    const index: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const b = i * 4;
        const corners = [
          [x, y],
          [x + 1, y],
          [x + 1, y + 1],
          [x, y + 1],
        ];
        for (let k = 0; k < 4; k++) {
          positions[(b + k) * 3] = corners[k][0];
          positions[(b + k) * 3 + 1] = 0;
          positions[(b + k) * 3 + 2] = corners[k][1];
        }
        index.push(b, b + 3, b + 2, b, b + 2, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(positions, 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.depthAttr = new THREE.BufferAttribute(depths, 1);
    this.depthAttr.setUsage(THREE.DynamicDrawUsage);
    this.velAttr = new THREE.BufferAttribute(vels, 2);
    this.velAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('depth', this.depthAttr);
    geo.setAttribute('vel', this.velAttr);
    geo.setIndex(index);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(w / 2, 8, h / 2), Math.hypot(w, h, 16));
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.shownDepth = new Float32Array(n);
  }

  setTerrain(ground: Uint8Array<ArrayBufferLike>, struct: Uint8Array<ArrayBufferLike>): void {
    if (this.terrain.length !== ground.length) this.terrain = new Float32Array(ground.length);
    for (let i = 0; i < ground.length; i++) this.terrain[i] = ground[i] + struct[i];
  }

  setWater(depth: Float32Array<ArrayBufferLike>, vel: Float32Array<ArrayBufferLike>): void {
    this.depth = depth;
    const v = this.velAttr.array as Float32Array;
    for (let i = 0; i < depth.length; i++) {
      const vx = vel[i * 2];
      const vy = vel[i * 2 + 1];
      const b = i * 8;
      v[b] = vx; v[b + 1] = vy;
      v[b + 2] = vx; v[b + 3] = vy;
      v[b + 4] = vx; v[b + 5] = vy;
      v[b + 6] = vx; v[b + 7] = vy;
    }
    this.velAttr.needsUpdate = true;
  }

  /** Jeden Frame: Höhen weich an die Simulationswerte angleichen */
  update(time: number, dt: number): void {
    this.uniforms.uTime.value = time;
    if (this.depth.length === 0 || this.terrain.length === 0) return;
    const { w, h } = this;
    const p = this.pos.array as Float32Array;
    const d = this.depthAttr.array as Float32Array;
    const k = Math.min(1, dt * 8);
    const shown = this.shownDepth;
    for (let i = 0; i < shown.length; i++) shown[i] += (this.depth[i] - shown[i]) * k;

    // Oberfläche an den Ecken aus den Nachbarzellen mitteln, damit sie glatt ist
    const surfaceAt = (x: number, y: number, own: number): number => {
      if (x < 0 || y < 0 || x >= w || y >= h) return own;
      const j = y * w + x;
      return shown[j] > 0.01 ? this.terrain[j] + shown[j] : own;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const dep = shown[i];
        const b = i * 4;
        if (dep <= 0.01) {
          d[b] = d[b + 1] = d[b + 2] = d[b + 3] = 0;
          continue;
        }
        const own = this.terrain[i] + dep;
        const corner = (cx: number, cy: number) => {
          // Mittel aus den bis zu vier Zellen um die Ecke
          let s = 0;
          s += surfaceAt(cx - 1, cy - 1, own);
          s += surfaceAt(cx, cy - 1, own);
          s += surfaceAt(cx - 1, cy, own);
          s += surfaceAt(cx, cy, own);
          // nie tiefer als der eigene Boden, sonst schneidet die Fläche ins Gelände
          return Math.max(this.terrain[i] + 0.02, s / 4);
        };
        p[b * 3 + 1] = corner(x, y);
        p[(b + 1) * 3 + 1] = corner(x + 1, y);
        p[(b + 2) * 3 + 1] = corner(x + 1, y + 1);
        p[(b + 3) * 3 + 1] = corner(x, y + 1);
        d[b] = d[b + 1] = d[b + 2] = d[b + 3] = dep;
      }
    }
    this.pos.needsUpdate = true;
    this.depthAttr.needsUpdate = true;
  }
}
