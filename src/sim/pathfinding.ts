/**
 * A* auf dem Raster mit vier Nachbarn. Die Welt liefert pro Zelle die
 * Kosten (0 = nicht begehbar). Pfade sind Listen von Zellindizes, ohne
 * die Startzelle.
 */

const DX = [-1, 1, 0, 0];
const DY = [0, 0, -1, 1];

class Heap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }

  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length > 0) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

export class Pathfinder {
  private readonly w: number;
  private readonly h: number;
  private readonly g: Float32Array;
  private readonly from: Int32Array;
  private readonly closed: Uint8Array;
  private readonly stamp: Uint32Array;
  private gen = 1;

  /**
   * @param cost Kosten, eine Zelle zu betreten (0 = gesperrt)
   * @param canStep darf man von a nach b (Höhenunterschied)
   */
  private readonly cost: (i: number) => number;
  private readonly canStep: (a: number, b: number) => boolean;

  constructor(w: number, h: number, cost: (i: number) => number, canStep: (a: number, b: number) => boolean) {
    this.w = w;
    this.h = h;
    this.cost = cost;
    this.canStep = canStep;
    const n = w * h;
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.stamp = new Uint32Array(n);
  }

  /** Pfad von start zu einem der Ziele, null wenn keins erreichbar */
  find(start: number, goals: number[], maxNodes = 6000): number[] | null {
    if (goals.length === 0) return null;
    const { w, h, g, from, closed, stamp } = this;
    const gen = ++this.gen;
    const goalSet = new Set(goals);
    if (goalSet.has(start)) return [];
    const gx: number[] = [];
    const gy: number[] = [];
    for (const t of goals) {
      gx.push(t % w);
      gy.push((t / w) | 0);
    }
    const heur = (i: number) => {
      const x = i % w;
      const y = (i / w) | 0;
      let best = Infinity;
      for (let k = 0; k < gx.length; k++) {
        const d = Math.abs(gx[k] - x) + Math.abs(gy[k] - y);
        if (d < best) best = d;
      }
      return best;
    };
    const open = new Heap();
    stamp[start] = gen;
    g[start] = 0;
    from[start] = -1;
    closed[start] = 0;
    open.push(heur(start), start);
    let expanded = 0;
    while (open.size > 0) {
      const cur = open.pop();
      if (closed[cur] && stamp[cur] === gen) continue;
      closed[cur] = 1;
      if (goalSet.has(cur)) {
        const path: number[] = [];
        let c = cur;
        while (c !== start) {
          path.push(c);
          c = from[c];
        }
        path.reverse();
        return path;
      }
      if (++expanded > maxNodes) return null;
      const x = cur % w;
      const y = (cur / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nb = ny * w + nx;
        const c = this.cost(nb);
        if (c <= 0 && !goalSet.has(nb)) continue;
        if (!this.canStep(cur, nb)) continue;
        const ng = g[cur] + (c > 0 ? c : 1);
        if (stamp[nb] === gen && (closed[nb] || ng >= g[nb])) continue;
        stamp[nb] = gen;
        closed[nb] = 0;
        g[nb] = ng;
        from[nb] = cur;
        open.push(ng + heur(nb), nb);
      }
    }
    return null;
  }
}
