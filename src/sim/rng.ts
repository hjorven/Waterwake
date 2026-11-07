export interface Rng {
  (): number;
  /** innerer Zustand, zum Speichern und Wiederherstellen */
  state: number;
}

/** Kleiner, schneller Zufallsgenerator mit festem Startwert (mulberry32) */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const f = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  Object.defineProperty(f, 'state', {
    get: () => a,
    set: (v: number) => {
      a = v >>> 0;
    },
  });
  return f;
}

/** Wertrauschen auf einem Gitter, weich interpoliert, Werte 0..1 */
export function makeValueNoise(seed: number, size = 256): (x: number, y: number) => number {
  const rnd = mulberry32(seed);
  const table = new Float32Array(size * size);
  for (let i = 0; i < table.length; i++) table[i] = rnd();
  const at = (x: number, y: number) => table[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
}

/** Mehrere Oktaven Rauschen übereinander, Werte ungefähr 0..1 */
export function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
