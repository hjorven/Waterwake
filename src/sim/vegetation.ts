import { fbm, makeValueNoise } from './rng';
import { DAY } from './seasons';

/** Reichweite der Bodenfeuchte um Wasser in Zellen */
export const MOIST_RANGE = 5;
/** Baumstufen: 1 Setzling, 2 jung, 3 ausgewachsen */
export const TREE_GROWN = 3;
export const BERRIES_PER_BUSH = 3;
export const WOOD_PER_TREE = 3;
/** Ab dieser Wassertiefe ertrinken Pflanzen mit der Zeit */
export const DROWN_DEPTH = 0.8;
/** Ab dieser Verschmutzung des Wassers nebenan nehmen Pflanzen Schaden */
export const POISON_LEVEL = 0.35;

const DX = [-1, 1, 0, 0];
const DY = [0, 0, -1, 1];

export class Vegetation {
  readonly w: number;
  readonly h: number;
  /** 0 = kein Baum, 1..3 Wachstumsstufe */
  trees: Uint8Array;
  /** 0 = kein Strauch, 1 = Strauch, 2 = reife Beeren */
  bushes: Uint8Array;
  /** Bodenfeuchte 0..255 */
  moist: Uint8Array;
  /** Trockenheit des Bodens 0..255 (für die Färbung) */
  dry: Uint8Array;
  /** Trockenstress der Pflanze in Sekunden ohne Feuchte */
  stress: Float32Array;
  /** Sekunden unter tiefem Wasser (Hochwasser) */
  drown: Float32Array;
  /** Sekunden neben schmutzigem Wasser (Schlammflut) */
  poison: Float32Array;
  /** Fortschritt zur nächsten Stufe 0..1 */
  growth: Float32Array;
  /** steigt, wenn sich Bäume oder Sträucher ändern */
  version = 0;
  /** steigt, wenn sich Feuchte oder Trockenheit sichtbar ändern */
  soilVersion = 0;
  /** Grundfeuchte durch Regen 0..1, in der Dürre 0 */
  ambient = 1;
  private queue: Int32Array;
  private dist: Int16Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.trees = new Uint8Array(n);
    this.bushes = new Uint8Array(n);
    this.moist = new Uint8Array(n);
    this.dry = new Uint8Array(n);
    this.stress = new Float32Array(n);
    this.drown = new Float32Array(n);
    this.poison = new Float32Array(n);
    this.growth = new Float32Array(n);
    this.queue = new Int32Array(n);
    this.dist = new Int16Array(n);
  }

  /** Bäume und Sträucher auf die Karte setzen */
  seed(ground: Uint8Array, seed: number, rnd: () => number, blocked: (i: number) => boolean): void {
    const noise = makeValueNoise(seed ^ 0x7ee5);
    const { w, h } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (blocked(i)) continue;
        const g = ground[i];
        if (g < 2 || g > 11) continue;
        const wet = this.moist[i] > 0;
        const n = fbm(noise, x / 9, y / 9, 3);
        const forest = n > 0.56;
        const pTree = (forest ? 0.38 : 0.03) * (wet ? 1 : 0.5);
        const r = rnd();
        if (r < pTree) {
          this.trees[i] = rnd() < 0.6 ? 3 : rnd() < 0.5 ? 2 : 1;
          this.growth[i] = rnd();
          continue;
        }
        if (this.moist[i] > 120 && !forest && rnd() < 0.09) {
          this.bushes[i] = rnd() < 0.5 ? 2 : 1;
          this.growth[i] = rnd();
        }
      }
    }
    this.version++;
  }

  /** Feuchte per Breitensuche von allen Wasserzellen aus */
  updateMoisture(depth: Float32Array): void {
    const { w, h, moist, dist, queue } = this;
    dist.fill(-1);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < depth.length; i++) {
      if (depth[i] > 0.05) {
        dist[i] = 0;
        queue[tail++] = i;
      }
    }
    while (head < tail) {
      const i = queue[head++];
      const d = dist[i];
      if (d >= MOIST_RANGE) continue;
      const x = i % w;
      const y = (i / w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k];
        const ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (dist[j] >= 0) continue;
        dist[j] = d + 1;
        queue[tail++] = j;
      }
    }
    const base = Math.round(this.ambient * 110);
    for (let i = 0; i < moist.length; i++) {
      const d = dist[i];
      const near = d < 0 ? 0 : Math.round(255 * (1 - d / (MOIST_RANGE + 1)));
      moist[i] = near > base ? near : base;
    }
  }

  /**
   * Hochwasser: Pflanzen unter tiefem Wasser ertrinken nach einer Weile
   * (Sträucher nach einem Tag, Bäume nach zwei). Gibt die Zahl der
   * ertrunkenen Pflanzen zurück.
   */
  updateFlood(depth: Float32Array, dt: number): number {
    const { trees, bushes, drown, growth, stress } = this;
    let died = 0;
    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];
      const bush = bushes[i];
      if (tree === 0 && bush === 0) {
        drown[i] = 0;
        continue;
      }
      if (depth[i] > DROWN_DEPTH) {
        drown[i] += dt;
        const limit = tree > 0 ? 2 * DAY : DAY;
        if (drown[i] >= limit) {
          trees[i] = 0;
          bushes[i] = 0;
          drown[i] = 0;
          growth[i] = 0;
          stress[i] = 0;
          died++;
        }
      } else if (drown[i] > 0) {
        drown[i] = Math.max(0, drown[i] - dt * 2);
      }
    }
    if (died > 0) this.version++;
    return died;
  }

  /**
   * Schlammflut: Pflanzen, die an schmutzigem Wasser stehen, gehen nach
   * einer Weile ein (Sträucher nach anderthalb Tagen, Bäume nach vier, also
   * nur bei langen Schlammfluten). Gibt die Zahl der vergifteten Pflanzen zurück.
   */
  updatePollution(depth: Float32Array, pollution: Float32Array, dt: number): number {
    const { w, h, trees, bushes, poison, growth, stress } = this;
    let died = 0;
    const dirty = (i: number) => depth[i] > 0.05 && pollution[i] >= POISON_LEVEL;
    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];
      const bush = bushes[i];
      if (tree === 0 && bush === 0) {
        poison[i] = 0;
        continue;
      }
      const x = i % w;
      const y = (i / w) | 0;
      const near = dirty(i) || (x > 0 && dirty(i - 1)) || (x < w - 1 && dirty(i + 1)) || (y > 0 && dirty(i - w)) || (y < h - 1 && dirty(i + w));
      if (near) {
        poison[i] += dt;
        const limit = tree > 0 ? 4 * DAY : 1.5 * DAY;
        if (poison[i] >= limit) {
          trees[i] = 0;
          bushes[i] = 0;
          poison[i] = 0;
          growth[i] = 0;
          stress[i] = 0;
          died++;
        }
      } else if (poison[i] > 0) {
        poison[i] = Math.max(0, poison[i] - dt);
      }
    }
    if (died > 0) this.version++;
    return died;
  }

  /**
   * Wachstum und Trockenstress für eine Zeitspanne in Sekunden.
   * Gibt zurück, wie viele Pflanzen vertrocknet sind.
   */
  grow(dt: number): number {
    const { trees, bushes, moist, dry, stress, growth } = this;
    let died = 0;
    let changed = false;
    let soilChanged = false;
    const dryUp = (255 / (1.5 * DAY)) * dt;
    const dryDown = (255 / (0.5 * DAY)) * dt;
    for (let i = 0; i < trees.length; i++) {
      const wet = moist[i] > 0;
      const before = dry[i];
      if (wet) dry[i] = Math.max(0, dry[i] - dryDown);
      else dry[i] = Math.min(255, dry[i] + dryUp);
      if ((before >> 4) !== (dry[i] >> 4)) soilChanged = true;

      const tree = trees[i];
      const bush = bushes[i];
      if (tree === 0 && bush === 0) continue;
      if (wet) {
        stress[i] = Math.max(0, stress[i] - dt * 2);
        // nahe am Wasser wächst alles schneller
        const speed = moist[i] / 255;
        if (tree > 0 && tree < TREE_GROWN) {
          growth[i] += (dt * speed) / (1.5 * DAY);
          if (growth[i] >= 1) {
            growth[i] = 0;
            trees[i] = tree + 1;
            changed = true;
          }
        } else if (bush === 1) {
          growth[i] += (dt * speed) / (2 * DAY);
          if (growth[i] >= 1) {
            growth[i] = 0;
            bushes[i] = 2;
            changed = true;
          }
        }
      } else {
        stress[i] += dt;
        const limit = tree > 0 ? 5 * DAY : 3 * DAY;
        if (stress[i] >= limit) {
          trees[i] = 0;
          bushes[i] = 0;
          stress[i] = 0;
          growth[i] = 0;
          died++;
          changed = true;
        }
      }
    }
    if (changed) this.version++;
    if (soilChanged) this.soilVersion++;
    return died;
  }

  plantTree(i: number): boolean {
    if (this.trees[i] || this.bushes[i]) return false;
    this.trees[i] = 1;
    this.growth[i] = 0;
    this.stress[i] = 0;
    this.drown[i] = 0;
    this.poison[i] = 0;
    this.version++;
    return true;
  }

  /** Baum fällen, gibt Holz zurück (0 wenn kein ausgewachsener Baum) */
  cutTree(i: number): number {
    if (this.trees[i] < TREE_GROWN) return 0;
    this.trees[i] = 0;
    this.growth[i] = 0;
    this.version++;
    return WOOD_PER_TREE;
  }

  /** Beeren pflücken, gibt die Menge zurück */
  pickBerries(i: number): number {
    if (this.bushes[i] !== 2) return 0;
    this.bushes[i] = 1;
    this.growth[i] = 0;
    this.version++;
    return BERRIES_PER_BUSH;
  }

  /** Pflanze entfernen (z. B. beim Bauen) */
  clear(i: number): void {
    if (this.trees[i] || this.bushes[i]) {
      this.trees[i] = 0;
      this.bushes[i] = 0;
      this.growth[i] = 0;
      this.version++;
    }
  }
}
