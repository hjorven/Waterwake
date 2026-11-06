import { fbm, makeValueNoise, mulberry32 } from './rng';

export const MAX_HEIGHT = 16;

export interface MapData {
  w: number;
  h: number;
  /** ganzzahlige Bodenhöhe 0..16 */
  ground: Uint8Array;
  /** Zellindizes der Quellen */
  sources: { index: number; rate: number }[];
  /** Zellindizes der Senken (Fluss verlässt die Karte) */
  sinks: number[];
}

/**
 * Erzeugt ein Flusstal: Der Fluss kommt am Nordrand aus einer Quelle,
 * mäandert nach Süden und verlässt dort die Karte. Seitlich steigen
 * Hügel in Stufen an, an einer Stelle verengt sich das Tal zur Schlucht
 * (guter Platz für einen Damm).
 */
export function generateValley(w: number, h: number, seed: number): MapData {
  const rnd = mulberry32(seed);
  const noise = makeValueNoise(seed ^ 0x9e3779b9);
  const ground = new Uint8Array(w * h);
  const phase1 = rnd() * Math.PI * 2;
  const phase2 = rnd() * Math.PI * 2;
  const gorgeY = h * (0.45 + rnd() * 0.15);

  const centerX = (y: number) =>
    w / 2 + Math.sin(y * 0.065 + phase1) * w * 0.14 + Math.sin(y * 0.021 + phase2) * w * 0.08;

  for (let y = 0; y < h; y++) {
    const cx = centerX(y);
    const t = y / (h - 1);
    // Flussbett fällt von Nord nach Süd
    const bed = 7.5 - t * 6;
    // Talbreite: an der Schlucht eng
    const gorge = Math.exp(-((y - gorgeY) ** 2) / (2 * 6 ** 2));
    const halfBed = 2.2 - gorge * 0.8;
    const slope = 0.45 + gorge * 1.2;
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x - cx);
      const n = fbm(noise, x / 14, y / 14, 4);
      const hills = 9 + n * 7 + gorge * 3;
      let hgt: number;
      if (d < halfBed) {
        hgt = bed;
      } else {
        const rise = (d - halfBed) * slope;
        // Terrassen: flache Stücke durch weiches Treppenmuster
        const terr = rise + Math.sin(rise * 1.3) * 0.6;
        hgt = Math.min(hills, bed + Math.max(0.6, terr) + (n - 0.5) * 2);
      }
      ground[y * w + x] = Math.max(0, Math.min(MAX_HEIGHT, Math.round(hgt)));
    }
  }

  // Hänge auf eine Stufe je Zelle begrenzen, damit Bewohner überall
  // hinkommen. Die höhere Seite wird abgetragen, das Flussbett bleibt.
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        for (const j of [x + 1 < w ? i + 1 : -1, y + 1 < h ? i + w : -1]) {
          if (j < 0) continue;
          if (ground[j] > ground[i] + 1) {
            ground[j] = ground[i] + 1;
            changed = true;
          } else if (ground[i] > ground[j] + 1) {
            ground[i] = ground[j] + 1;
            changed = true;
          }
        }
      }
    }
  }

  // Quelle: ein kleiner Teich am Nordrand
  const sources: { index: number; rate: number }[] = [];
  const sx = Math.round(centerX(1));
  for (let dx = -1; dx <= 1; dx++) {
    const i = 1 * w + sx + dx;
    ground[i] = Math.min(ground[i], Math.round(7.5));
    sources.push({ index: i, rate: 2 });
  }

  // Senke: tiefe Zellen am Südrand
  const sinks: number[] = [];
  const ex = Math.round(centerX(h - 1));
  for (let dx = -4; dx <= 4; dx++) {
    const x = ex + dx;
    if (x < 0 || x >= w) continue;
    sinks.push((h - 1) * w + x);
  }
  return { w, h, ground, sources, sinks };
}
