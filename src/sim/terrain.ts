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
  /** Zelle des Startlagers (links oben), fehlt oder -1 = das Spiel sucht selbst */
  start?: number;
}

/** Form eines Tals; die Vorgabe ergibt das Ottertal */
export interface ValleyParams {
  /** Mäander: Amplitude der beiden Schwingungen als Anteil der Kartenbreite */
  meander: [number, number];
  /** Stärke der Schlucht (1 = Ottertal, 0 = keine) und ihre Lage als Anteil der Kartenhöhe (null = zufällig) */
  gorge: number;
  gorgeAt: number | null;
  /** Flussbett: Höhe am Nordrand und Gefälle bis zum Südrand */
  bedTop: number;
  drop: number;
  /** halbe Breite des Flussbetts in Zellen */
  halfBed: number;
  /** Anstieg der Talhänge je Zelle */
  slope: number;
  /** Höhe der Hügel: Grundwert und Rauschanteil */
  hills: number;
  hillNoise: number;
  /** Tümpel im Flussbett, die in der Dürre Wasser halten */
  pools: boolean;
  /** Stärke der Quelle am Nordrand */
  sourceRate: number;
  /** Nebenfluss von der Seite: Zeile als Anteil der Kartenhöhe, Seite und Quellstärke */
  tributary: { side: 'west' | 'east'; at: number; rate: number } | null;
}

export const DEFAULT_VALLEY: ValleyParams = {
  meander: [0.14, 0.08],
  gorge: 1,
  gorgeAt: null,
  bedTop: 7.5,
  drop: 6,
  halfBed: 2.2,
  slope: 0.45,
  hills: 9,
  hillNoise: 7,
  pools: true,
  sourceRate: 2,
  tributary: null,
};

/**
 * Erzeugt ein Flusstal: Der Fluss kommt am Nordrand aus einer Quelle,
 * mäandert nach Süden und verlässt dort die Karte. Seitlich steigen
 * Hügel in Stufen an, an einer Stelle verengt sich das Tal zur Schlucht
 * (guter Platz für einen Damm). Mit `params` entstehen andere Täler,
 * etwa mit Nebenfluss oder ohne Schlucht.
 */
export function generateValley(w: number, h: number, seed: number, params: Partial<ValleyParams> = {}): MapData {
  const p: ValleyParams = { ...DEFAULT_VALLEY, ...params };
  const rnd = mulberry32(seed);
  const noise = makeValueNoise(seed ^ 0x9e3779b9);
  const ground = new Uint8Array(w * h);
  const phase1 = rnd() * Math.PI * 2;
  const phase2 = rnd() * Math.PI * 2;
  const gorgeRoll = rnd();
  const gorgeY = h * (p.gorgeAt ?? 0.45 + gorgeRoll * 0.15);

  const centerX = (y: number) =>
    w / 2 + Math.sin(y * 0.065 + phase1) * w * p.meander[0] + Math.sin(y * 0.021 + phase2) * w * p.meander[1];

  // Tümpel im Flussbett: alle paar Zeilen eine Stufe tiefer, damit in der
  // Dürre ein paar Tage lang Wasserlöcher bleiben
  const poolRows = new Set<number>();
  for (let y = 9 + Math.floor(rnd() * 4); y < h - 8; y += 9 + Math.floor(rnd() * 5)) {
    if (!p.pools) continue;
    poolRows.add(y);
    poolRows.add(y + 1);
  }

  const bedAt = (y: number) => p.bedTop - (y / (h - 1)) * p.drop;
  for (let y = 0; y < h; y++) {
    const cx = centerX(y);
    // Flussbett fällt von Nord nach Süd
    const bed = bedAt(y);
    // Talbreite: an der Schlucht eng
    const gorge = p.gorge * Math.exp(-((y - gorgeY) ** 2) / (2 * 6 ** 2));
    const halfBed = Math.max(0.6, p.halfBed - gorge * 0.8);
    const slope = p.slope + gorge * 1.2;
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x - cx);
      const n = fbm(noise, x / 14, y / 14, 4);
      const hills = p.hills + n * p.hillNoise + gorge * 3;
      let hgt: number;
      if (d < halfBed) {
        hgt = poolRows.has(y) ? bed - 1 : bed;
      } else {
        const rise = (d - halfBed) * slope;
        // Terrassen: flache Stücke durch weiches Treppenmuster
        const terr = rise + Math.sin(rise * 1.3) * 0.6;
        hgt = Math.min(hills, bed + Math.max(0.6, terr) + (n - 0.5) * 2);
      }
      ground[y * w + x] = Math.max(0, Math.min(MAX_HEIGHT, Math.round(hgt)));
    }
  }

  // Nebenfluss: ein zweites Bett von der Seite bis zur Mündung in den Fluss
  const sideSources: { index: number; rate: number }[] = [];
  if (p.tributary) {
    const west = p.tributary.side === 'west';
    const ty = Math.round(h * p.tributary.at);
    const jx = Math.round(centerX(ty));
    const len = Math.max(4, west ? jx : w - 1 - jx);
    const junctionBed = bedAt(ty);
    const wobble = rnd() * Math.PI * 2;
    for (let k = 0; k <= len; k++) {
      const x = west ? k : w - 1 - k;
      if (x < 0 || x >= w) continue;
      // f = 1 am Rand, 0 an der Mündung; dort verschwindet die Schlängelung
      const f = 1 - k / len;
      const yc = ty + Math.sin(k * 0.12 + wobble) * 3 * f;
      const bed = junctionBed + f * 2.5;
      for (let dy = -5; dy <= 5; dy++) {
        const y = Math.round(yc) + dy;
        if (y < 1 || y >= h - 1) continue;
        const d = Math.abs(y - yc);
        const hgt = d < 1.5 ? bed : bed + (d - 1.5) * 0.9;
        const i = y * w + x;
        ground[i] = Math.min(ground[i], Math.max(0, Math.round(hgt)));
      }
    }
    const ex = west ? 1 : w - 2;
    for (let dy = -1; dy <= 1; dy++) {
      const i = (ty + dy) * w + ex;
      ground[i] = Math.min(ground[i], Math.round(junctionBed + 2.5));
      sideSources.push({ index: i, rate: p.tributary.rate });
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
    ground[i] = Math.min(ground[i], Math.round(p.bedTop));
    sources.push({ index: i, rate: p.sourceRate });
  }
  sources.push(...sideSources);

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
