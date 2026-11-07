import * as THREE from 'three';

const CHUNK = 16;

/** Farbe nach Höhe: Flussbett, Wiese, Hang, Fels */
function groundColor(h: number, out: THREE.Color): void {
  if (h <= 2) out.setHex(0x8c7a52);
  else if (h <= 5) out.setHex(0x6fa64c);
  else if (h <= 8) out.setHex(0x5f944a);
  else if (h <= 11) out.setHex(0x8e9a6a);
  else if (h <= 13) out.setHex(0x9b9385);
  else out.setHex(0xd9d6cc);
  // leichte Stufung, damit Terrassen sichtbar bleiben
  out.offsetHSL(0, 0, (h % 2) * 0.02);
}

const DAM_COLOR = new THREE.Color(0x6b5a45);
const DAM_TOP = new THREE.Color(0x857257);
/** Farbe von ausgedörrtem Gras */
const DRY_COLOR = new THREE.Color(0xbfa257);

/**
 * Gelände als Blockstufen pro Zelle: Deckfläche plus senkrechte Wände zu
 * tieferen Nachbarn. In Chunks von 16 x 16, damit bei Änderungen nur
 * ein Chunk neu gebaut werden muss.
 */
export class TerrainRenderer {
  readonly group = new THREE.Group();
  private readonly w: number;
  private readonly h: number;
  private readonly chunks: (THREE.Mesh | null)[] = [];
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private ground: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private struct: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private readonly cx: number;
  private readonly cy: number;
  /** je Chunk: Vertex-Index der Deckfläche jeder Zelle (-1 = keine) */
  private readonly topOffset: (Int32Array | null)[] = [];
  /** je Chunk: ursprüngliche Farben vor der Trockenheitstönung */
  private readonly baseColors: (Float32Array | null)[] = [];
  private dry: Uint8Array<ArrayBufferLike> | null = null;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cx = Math.ceil(w / CHUNK);
    this.cy = Math.ceil(h / CHUNK);
    for (let i = 0; i < this.cx * this.cy; i++) {
      this.chunks.push(null);
      this.topOffset.push(null);
      this.baseColors.push(null);
    }
  }

  /** Trockenheit je Zelle (0..255) färbt Gras gelb-braun */
  setSoil(dry: Uint8Array<ArrayBufferLike>): void {
    this.dry = dry;
    for (let c = 0; c < this.chunks.length; c++) if (this.chunks[c]) this.tintChunk(c);
  }

  private tintChunk(c: number): void {
    const mesh = this.chunks[c];
    const offsets = this.topOffset[c];
    const base = this.baseColors[c];
    const dry = this.dry;
    if (!mesh || !offsets || !base || !dry) return;
    const attr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const chx = c % this.cx;
    const chy = (c / this.cx) | 0;
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const v = offsets[ly * CHUNK + lx];
        if (v < 0) continue;
        const x = chx * CHUNK + lx;
        const y = chy * CHUNK + ly;
        const i = y * this.w + x;
        const g = this.ground[i];
        const grass = this.struct[i] === 0 && g >= 3 && g <= 11;
        const f = grass ? dry[i] / 255 : 0;
        for (let k = 0; k < 6; k++) {
          const o = (v + k) * 3;
          arr[o] = base[o] + (DRY_COLOR.r - base[o]) * f;
          arr[o + 1] = base[o + 1] + (DRY_COLOR.g - base[o + 1]) * f;
          arr[o + 2] = base[o + 2] + (DRY_COLOR.b - base[o + 2]) * f;
        }
      }
    }
    attr.needsUpdate = true;
  }

  /** Höhe inkl. Bauwerk einer Zelle, Rand = sehr tief (offene Wand) */
  private heightAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    const i = y * this.w + x;
    return this.ground[i] + this.struct[i];
  }

  update(ground: Uint8Array<ArrayBufferLike>, struct: Uint8Array<ArrayBufferLike>): void {
    const first = this.ground.length === 0;
    const changed = new Set<number>();
    if (first) {
      for (let i = 0; i < this.chunks.length; i++) changed.add(i);
    } else {
      for (let i = 0; i < ground.length; i++) {
        if (ground[i] !== this.ground[i] || struct[i] !== this.struct[i]) {
          const x = i % this.w;
          const y = (i / this.w) | 0;
          // Nachbarchunks ebenfalls, weil Wände an den Rändern hängen
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
              changed.add(((ny / CHUNK) | 0) * this.cx + ((nx / CHUNK) | 0));
            }
          }
        }
      }
    }
    this.ground = ground;
    this.struct = struct;
    for (const c of changed) this.buildChunk(c);
  }

  private buildChunk(c: number): void {
    const chx = c % this.cx;
    const chy = (c / this.cx) | 0;
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();

    const quad = (
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number,
      cx2: number, cy2: number, cz: number,
      dx: number, dy: number, dz: number,
      nx: number, ny: number, nz: number,
      col: THREE.Color,
    ) => {
      positions.push(ax, ay, az, bx, by, bz, cx2, cy2, cz, ax, ay, az, cx2, cy2, cz, dx, dy, dz);
      for (let k = 0; k < 6; k++) {
        normals.push(nx, ny, nz);
        colors.push(col.r, col.g, col.b);
      }
    };

    const x0 = chx * CHUNK;
    const y0 = chy * CHUNK;
    const x1 = Math.min(this.w, x0 + CHUNK);
    const y1 = Math.min(this.h, y0 + CHUNK);
    const offsets = new Int32Array(CHUNK * CHUNK).fill(-1);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * this.w + x;
        const g = this.ground[i];
        const s = this.struct[i];
        const top = g + s;
        if (s > 0) color.copy(DAM_TOP);
        else groundColor(g, color);
        // Deckfläche (y ist Höhe, z ist Kartenzeile)
        offsets[(y - y0) * CHUNK + (x - x0)] = positions.length / 3;
        quad(x, top, y, x, top, y + 1, x + 1, top, y + 1, x + 1, top, y, 0, 1, 0, color);

        // Wände zu tieferen Nachbarn
        const wallColor = (fromH: number, toH: number) => {
          if (s > 0 && toH < g + s) {
            color.copy(DAM_COLOR);
          } else {
            groundColor(Math.max(0, Math.min(fromH, toH + 1)), color);
            color.multiplyScalar(0.72);
          }
          return color;
        };
        const n = this.heightAt(x, y - 1);
        if (n < top) quad(x, top, y, x + 1, top, y, x + 1, Math.max(0, n), y, x, Math.max(0, n), y, 0, 0, -1, wallColor(top, n));
        const sN = this.heightAt(x, y + 1);
        if (sN < top) quad(x + 1, top, y + 1, x, top, y + 1, x, Math.max(0, sN), y + 1, x + 1, Math.max(0, sN), y + 1, 0, 0, 1, wallColor(top, sN));
        const wN = this.heightAt(x - 1, y);
        if (wN < top) quad(x, top, y + 1, x, top, y, x, Math.max(0, wN), y, x, Math.max(0, wN), y + 1, -1, 0, 0, wallColor(top, wN));
        const eN = this.heightAt(x + 1, y);
        if (eN < top) quad(x + 1, top, y, x + 1, top, y + 1, x + 1, Math.max(0, eN), y + 1, x + 1, Math.max(0, eN), y, 1, 0, 0, wallColor(top, eN));
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const old = this.chunks[c];
    if (old) {
      old.geometry.dispose();
      old.geometry = geo;
    } else {
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.chunks[c] = mesh;
      this.group.add(mesh);
    }
    this.topOffset[c] = offsets;
    this.baseColors[c] = new Float32Array(colors);
    if (this.dry) this.tintChunk(c);
  }
}
