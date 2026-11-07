import { BUILDINGS, type BuildingDef, type BuildingId } from '../data/buildings';

export type Good = 'holz' | 'beeren';

export interface Building {
  id: number;
  def: BuildingId;
  /** linke obere Zelle */
  x: number;
  y: number;
  size: number;
  alive: boolean;
  built: boolean;
  /** Baufortschritt 0..1 */
  progress: number;
  /** geliefertes Holz */
  woodDelivered: number;
  /** Holz, das gerade unterwegs ist */
  woodReserved: number;
  /** Bewohner-Ids mit Arbeitsplatz hier */
  workers: number[];
  /** Bewohner-Ids, die hier wohnen */
  residents: number[];
  /** Vorrat (nur Lager) */
  stock: Record<Good, number>;
  /** Hochwasserschaden 0..1, bei 1 ist das Gebäude verloren */
  damage: number;
  /** steht gerade im Hochwasser */
  flooded: boolean;
}

export interface PlacementContext {
  ground: Uint8Array;
  struct: Uint8Array;
  depth: Float32Array;
  sink: Uint8Array;
}

/** Gibt den Grund zurück, warum nicht gebaut werden kann, sonst null (auch für die Vorschau im Hauptthread) */
export function canPlaceAt(id: BuildingId, x: number, y: number, w: number, h: number, occ: Int16Array, ctx: PlacementContext): string | null {
  const def = BUILDINGS[id];
  if (x < 0 || y < 0 || x + def.size > w || y + def.size > h) return 'außerhalb der Karte';
  let height = -1;
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      const i = (y + dy) * w + x + dx;
      if (occ[i] >= 0) return 'hier steht schon etwas';
      if (ctx.struct[i] > 0) return 'auf Dämmen kann man nicht bauen';
      if (ctx.sink[i]) return 'zu nah am Kartenrand';
      if (ctx.depth[i] > 0.15) return 'das Land ist überflutet';
      if (height < 0) height = ctx.ground[i];
      else if (ctx.ground[i] !== height) return 'der Boden muss eben sein';
    }
  }
  if (def.needsWater) {
    let wet = false;
    for (let dy = -1; dy <= def.size && !wet; dy++) {
      for (let dx = -1; dx <= def.size; dx++) {
        const inside = dx >= 0 && dy >= 0 && dx < def.size && dy < def.size;
        if (inside) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const i = ny * w + nx;
        if (ctx.depth[i] >= 0.2 && ctx.struct[i] === 0) {
          wet = true;
          break;
        }
      }
    }
    if (!wet) return `${def.name} muss am Wasser stehen`;
  }
  return null;
}

export class Buildings {
  readonly w: number;
  readonly h: number;
  readonly list: Building[] = [];
  /** Gebäude-Id je Zelle, -1 = frei */
  readonly occ: Int16Array;
  /** steigt bei jeder Änderung an Gebäuden */
  version = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.occ = new Int16Array(w * h).fill(-1);
  }

  def(b: Building): BuildingDef {
    return BUILDINGS[b.def];
  }

  get(id: number): Building | null {
    const b = this.list[id];
    return b && b.alive ? b : null;
  }

  *alive(): IterableIterator<Building> {
    for (const b of this.list) if (b.alive) yield b;
  }

  cells(b: Building): number[] {
    const out: number[] = [];
    for (let dy = 0; dy < b.size; dy++) {
      for (let dx = 0; dx < b.size; dx++) out.push((b.y + dy) * this.w + b.x + dx);
    }
    return out;
  }

  /** Zellen rund um die Grundfläche (Eingänge) */
  ring(b: Building): number[] {
    const out: number[] = [];
    for (let dy = -1; dy <= b.size; dy++) {
      for (let dx = -1; dx <= b.size; dx++) {
        const inside = dx >= 0 && dy >= 0 && dx < b.size && dy < b.size;
        if (inside) continue;
        const x = b.x + dx;
        const y = b.y + dy;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
        out.push(y * this.w + x);
      }
    }
    return out;
  }

  /** Mittelpunkt in Zellkoordinaten */
  center(b: Building): { x: number; y: number } {
    return { x: b.x + b.size / 2, y: b.y + b.size / 2 };
  }

  /** Gibt den Grund zurück, warum nicht gebaut werden kann, sonst null */
  canPlace(id: BuildingId, x: number, y: number, ctx: PlacementContext): string | null {
    return canPlaceAt(id, x, y, this.w, this.h, this.occ, ctx);
  }

  place(id: BuildingId, x: number, y: number, prebuilt = false): Building {
    const def = BUILDINGS[id];
    const b: Building = {
      id: this.list.length,
      def: id,
      x,
      y,
      size: def.size,
      alive: true,
      built: prebuilt,
      progress: prebuilt ? 1 : 0,
      woodDelivered: prebuilt ? def.wood : 0,
      woodReserved: 0,
      workers: [],
      residents: [],
      stock: { holz: 0, beeren: 0 },
      damage: 0,
      flooded: false,
    };
    this.list.push(b);
    for (const i of this.cells(b)) this.occ[i] = b.id;
    this.version++;
    return b;
  }

  /** Gespeicherte Gebäudeliste übernehmen (Spielstand laden) */
  restore(list: Building[]): void {
    this.list.length = 0;
    this.occ.fill(-1);
    for (const src of list) {
      const b: Building = {
        ...src,
        workers: [...src.workers],
        residents: [...src.residents],
        stock: { holz: src.stock.holz ?? 0, beeren: src.stock.beeren ?? 0 },
        // Lieferungen unterwegs gehen beim Laden verloren
        woodReserved: 0,
        damage: src.damage ?? 0,
        flooded: src.flooded ?? false,
      };
      this.list.push(b);
      if (b.alive) for (const i of this.cells(b)) this.occ[i] = b.id;
    }
    this.version++;
  }

  /** Tiefste Wasserstelle auf der Grundfläche */
  maxDepthOn(b: Building, depth: Float32Array): number {
    let d = 0;
    for (const i of this.cells(b)) if (depth[i] > d) d = depth[i];
    return d;
  }

  /** Freie Betten insgesamt */
  freeBeds(): number {
    let s = 0;
    for (const b of this.alive()) if (b.built) s += Math.max(0, this.def(b).housing - b.residents.length);
    return s;
  }

  remove(id: number): Building | null {
    const b = this.get(id);
    if (!b) return null;
    b.alive = false;
    for (const i of this.cells(b)) this.occ[i] = -1;
    this.version++;
    return b;
  }

  /** Holz, das eine Baustelle noch braucht (abzüglich Lieferungen unterwegs) */
  woodNeeded(b: Building): number {
    return Math.max(0, this.def(b).wood - b.woodDelivered - b.woodReserved);
  }

  /** Lager mit mindestens `min` einer Ware, nächstgelegen zu (x, y) */
  storageWith(good: Good, min: number, x: number, y: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.alive()) {
      if (b.def !== 'lager' || !b.built || b.stock[good] < min) continue;
      const c = this.center(b);
      const d = Math.abs(c.x - x) + Math.abs(c.y - y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Lager mit freiem Platz für eine Ware, nächstgelegen zu (x, y) */
  storageSpace(good: Good, amount: number, x: number, y: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.alive()) {
      if (b.def !== 'lager' || !b.built) continue;
      if (b.stock[good] + amount > this.def(b).storage) continue;
      const c = this.center(b);
      const d = Math.abs(c.x - x) + Math.abs(c.y - y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Nächste gebaute Trinkstelle (Pumpe oder Tank) */
  nearest(ids: BuildingId[], x: number, y: number, builtOnly = true): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.alive()) {
      if (!ids.includes(b.def) || (builtOnly && !b.built)) continue;
      const c = this.center(b);
      const d = Math.abs(c.x - x) + Math.abs(c.y - y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  total(good: Good): number {
    let s = 0;
    for (const b of this.alive()) s += b.stock[good];
    return s;
  }

  storageCapacity(): number {
    let s = 0;
    for (const b of this.alive()) if (b.def === 'lager' && b.built) s += this.def(b).storage;
    return s;
  }

  waterCapacity(): number {
    let s = 0;
    for (const b of this.alive()) if (b.built) s += this.def(b).waterCap;
    return s;
  }

  housing(): number {
    let s = 0;
    for (const b of this.alive()) if (b.built) s += this.def(b).housing;
    return s;
  }

  /** Nimmt Holz aus Lagern (nächste zuerst), gibt die tatsächlich entnommene Menge zurück */
  takeWood(amount: number, x: number, y: number): number {
    let left = amount;
    while (left > 0) {
      const l = this.storageWith('holz', 1, x, y);
      if (!l) break;
      const t = Math.min(left, l.stock.holz);
      l.stock.holz -= t;
      left -= t;
    }
    return amount - left;
  }

  /** Legt eine Ware in Lager mit Platz, gibt den Rest zurück, der nicht unterkam */
  putGood(good: Good, amount: number, x: number, y: number): number {
    let left = amount;
    while (left > 0) {
      const l = this.storageSpace(good, 1, x, y);
      if (!l) break;
      const space = this.def(l).storage - l.stock[good];
      const t = Math.min(left, space);
      l.stock[good] += t;
      left -= t;
    }
    return left;
  }
}
