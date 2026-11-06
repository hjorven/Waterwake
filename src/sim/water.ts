// Wassersimulation nach dem Verfahren der "virtuellen Rohre":
// Zwischen benachbarten Zellen fließt Wasser proportional zum
// Unterschied der Wasseroberfläche. Einheiten: Zellbreite = 1, Höhenstufe = 1.

// Richtungen: 0 = links, 1 = rechts, 2 = oben (y-1), 3 = unten (y+1)
const DX = [-1, 1, 0, 0];
const DY = [0, 0, -1, 1];
const OPPOSITE = [1, 0, 3, 2];

export interface Source {
  index: number;
  /** Zufluss in Volumeneinheiten pro Sekunde bei Normalwetter */
  rate: number;
}

export class WaterSim {
  readonly w: number;
  readonly h: number;
  /** Bodenhöhe inkl. Bauwerke wie Dämme */
  terrain: Float32Array;
  /** Wassertiefe */
  depth: Float32Array;
  /** 4 Ausflüsse pro Zelle */
  flux: Float32Array;
  /** 1 = Senke (Abfluss aus der Karte, z. B. Flussmündung am Rand) */
  sink: Uint8Array;
  sources: Source[] = [];
  /** Multiplikator für alle Quellen (Dürre 0, Schneeschmelze 3) */
  sourceFactor = 1;
  /** Verdunstung pro Sekunde */
  evaporation = 0;
  /** Volumen, das seit dem letzten Abholen über Senken abgeflossen ist */
  drained = 0;
  /** Volumen, das seit dem letzten Abholen aus Quellen kam */
  added = 0;
  /** Volumen, das seit dem letzten Abholen verdunstet ist */
  evaporated = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.terrain = new Float32Array(w * h);
    this.depth = new Float32Array(w * h);
    this.flux = new Float32Array(w * h * 4);
    this.sink = new Uint8Array(w * h);
  }

  step(dt: number): void {
    const { w, h, terrain, depth, flux, sink } = this;
    const gravity = 9.81;
    const damping = 0.995;

    // 1. Quellen
    if (this.sourceFactor > 0) {
      for (const s of this.sources) {
        const v = s.rate * this.sourceFactor * dt;
        depth[s.index] += v;
        this.added += v;
      }
    }

    // 2. Ausflüsse berechnen
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const di = depth[i];
        const base = i * 4;
        if (di <= 0) {
          flux[base] = flux[base + 1] = flux[base + 2] = flux[base + 3] = 0;
          continue;
        }
        const head = terrain[i] + di;
        let total = 0;

        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d];
          const ny = y + DY[d];
          const f = base + d;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
            flux[f] = 0; // Kartenrand ist geschlossen
            continue;
          }
          const j = ny * w + nx;
          const diff = head - (terrain[j] + depth[j]);
          const value = flux[f] * damping + dt * gravity * diff;
          const v = value > 0 ? value : 0;
          flux[f] = v;
          total += v;
        }

        // Nicht mehr Wasser abgeben, als vorhanden ist
        if (total > 0) {
          const maxOut = di / dt;
          if (total > maxOut) {
            const scale = maxOut / total;
            flux[base] *= scale;
            flux[base + 1] *= scale;
            flux[base + 2] *= scale;
            flux[base + 3] *= scale;
          }
        }
      }
    }

    // 3. Wassertiefen aktualisieren
    const evap = this.evaporation * dt;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const base = i * 4;
        const outflow = flux[base] + flux[base + 1] + flux[base + 2] + flux[base + 3];
        let inflow = 0;
        if (x > 0) inflow += flux[(i - 1) * 4 + 1];
        if (x < w - 1) inflow += flux[(i + 1) * 4 + 0];
        if (y > 0) inflow += flux[(i - w) * 4 + 3];
        if (y < h - 1) inflow += flux[(i + w) * 4 + 2];

        let next = depth[i] + dt * (inflow - outflow);
        if (evap > 0 && next > 0) {
          const e = next < evap ? next : evap;
          next -= e;
          this.evaporated += e;
        }
        if (sink[i] && next > 0) {
          this.drained += next;
          next = 0;
        }
        depth[i] = next > 1e-6 ? next : 0;
      }
    }
  }

  /** Fließgeschwindigkeit einer Zelle, z. B. für Wasserräder */
  flowAt(i: number): number {
    const f = i * 4;
    return Math.abs(this.flux[f + 1] - this.flux[f]) + Math.abs(this.flux[f + 3] - this.flux[f + 2]);
  }

  /** Netto-Fluss in x- und y-Richtung, inkl. Zufluss von Nachbarn */
  velocity(i: number, out: { x: number; y: number }): void {
    const { w, h, flux } = this;
    const x = i % w;
    const y = (i / w) | 0;
    const b = i * 4;
    const inL = x > 0 ? flux[(i - 1) * 4 + 1] : 0;
    const inR = x < w - 1 ? flux[(i + 1) * 4 + 0] : 0;
    const inU = y > 0 ? flux[(i - w) * 4 + 3] : 0;
    const inD = y < h - 1 ? flux[(i + w) * 4 + 2] : 0;
    out.x = (inL - flux[b] + flux[b + 1] - inR) * 0.5;
    out.y = (inU - flux[b + 2] + flux[b + 3] - inD) * 0.5;
  }

  totalVolume(): number {
    let s = 0;
    for (let i = 0; i < this.depth.length; i++) s += this.depth[i];
    return s;
  }
}

// Exportiert für Tests
export { DX, DY, OPPOSITE };
