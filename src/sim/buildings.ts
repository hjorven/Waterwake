import { BUILDINGS, type BuildingDef, type BuildingId, WET_DEPTH } from '../data/buildings';
import { costTotal, emptyStock, fillStock, FOODS, GOODS, type Good, type Stock } from '../data/goods';
import { costFor } from '../data/species';

export type { Good } from '../data/goods';

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
  /** Baukosten dieses Baus: Molche zahlen Stein statt Holz */
  cost: Partial<Stock>;
  /** gelieferte Baustoffe je Ware */
  delivered: Stock;
  /** Baustoffe, die gerade unterwegs sind */
  reserved: Stock;
  /** Reife einer Ernte 0..1 (Feld, Kräutergarten) */
  growth: number;
  /** Bewohner-Ids mit Arbeitsplatz hier */
  workers: number[];
  /** Bewohner-Ids, die hier wohnen */
  residents: number[];
  /** Vorrat (nur Lager) */
  stock: Stock;
  /** Hochwasserschaden 0..1, bei 1 ist das Gebäude verloren */
  damage: number;
  /** steht gerade im Hochwasser */
  flooded: boolean;
}

/** Gebäude im Spielstand: ältere Versionen haben nur geliefertes Holz und weniger Waren */
export type SavedBuilding = Omit<Building, 'delivered' | 'reserved' | 'growth' | 'stock' | 'damage' | 'flooded' | 'cost'> & {
  delivered?: Partial<Stock>;
  reserved?: Partial<Stock>;
  woodDelivered?: number;
  growth?: number;
  stock: Partial<Stock>;
  damage?: number;
  flooded?: boolean;
};

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
      if (def.onWater) {
        if (ctx.depth[i] < 0.15) return `${def.name} muss im Wasser stehen`;
      } else if (def.wet) {
        if (ctx.depth[i] > WET_DEPTH) return 'das Wasser ist hier zu tief';
      } else if (ctx.depth[i] > 0.05) return 'das Land ist überflutet';
      if (height < 0) height = ctx.ground[i];
      else if (ctx.ground[i] !== height) return 'der Boden muss eben sein';
    }
  }
  // Zugang: Jedes Gebäude braucht eine freie Nachbarzelle, auch die Nachbarn danach noch
  const mine: number[] = [];
  for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) mine.push((y + dy) * w + x + dx);
  const mineSet = new Set(mine);
  const ringOf = (cells: number[]): number[] => {
    const set = new Set(cells);
    const out: number[] = [];
    for (const c of cells) {
      const cx = c % w;
      const cy = (c / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!set.has(j)) out.push(j);
        }
      }
    }
    return out;
  };
  const hasAccess = (cells: number[]): boolean => ringOf(cells).some((i) => !mineSet.has(i) && occ[i] < 0 && !ctx.sink[i]);
  if (!hasAccess(mine)) return 'kein Zugang zum Gebäude';
  const seen = new Set<number>();
  for (const i of ringOf(mine)) {
    const other = occ[i];
    if (other < 0 || seen.has(other)) continue;
    seen.add(other);
    const cells: number[] = [];
    const ox = i % w;
    const oy = (i / w) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = ox + dx;
        const ny = oy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (occ[j] === other) cells.push(j);
      }
    }
    if (!hasAccess(cells)) return 'würde ein Nachbargebäude einbauen';
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
  /** Baustoff des Volkes: Holz bei Ottern, Stein bei Molchen; bestimmt die Kosten neuer Bauten */
  material: Good = 'holz';
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
    const cost = costFor(def.cost, this.material);
    const b: Building = {
      id: this.list.length,
      def: id,
      x,
      y,
      size: def.size,
      alive: true,
      built: prebuilt,
      progress: prebuilt ? 1 : 0,
      cost,
      delivered: prebuilt ? fillStock(cost) : emptyStock(),
      reserved: emptyStock(),
      growth: 0,
      workers: [],
      residents: [],
      stock: emptyStock(),
      damage: 0,
      flooded: false,
    };
    this.list.push(b);
    for (const i of this.cells(b)) this.occ[i] = b.id;
    this.version++;
    return b;
  }

  /** Gespeicherte Gebäudeliste übernehmen (Spielstand laden) */
  restore(list: SavedBuilding[]): void {
    this.list.length = 0;
    this.occ.fill(-1);
    for (const src of list) {
      // Spielstände vor Version 3 kennen nur geliefertes Holz
      const delivered = src.delivered ? fillStock(src.delivered) : emptyStock();
      if (!src.delivered && src.woodDelivered) delivered.holz = src.woodDelivered;
      const b: Building = {
        ...src,
        cost: costFor(BUILDINGS[src.def].cost, this.material),
        workers: [...src.workers],
        residents: [...src.residents],
        stock: fillStock(src.stock),
        delivered,
        // Lieferungen unterwegs gehen beim Laden verloren
        reserved: emptyStock(),
        growth: src.growth ?? 0,
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

  /** Menge einer Ware, die eine Baustelle noch braucht (abzüglich Lieferungen unterwegs) */
  needed(b: Building, good: Good): number {
    return Math.max(0, (b.cost[good] ?? 0) - b.delivered[good] - b.reserved[good]);
  }

  /** Waren, die eine Baustelle noch braucht */
  missing(b: Building): Good[] {
    return GOODS.filter((g) => this.needed(b, g) > 0);
  }

  /** Alle Baustoffe sind da, es kann gebaut werden */
  fullyDelivered(b: Building): boolean {
    const cost = b.cost;
    for (const g of GOODS) if (b.delivered[g] < (cost[g] ?? 0)) return false;
    return true;
  }

  /** Anteil der gelieferten Baustoffe 0..1 (für Baustellen-Darstellung) */
  deliveredShare(b: Building): number {
    const total = costTotal(b.cost);
    if (total <= 0) return 1;
    let sum = 0;
    for (const g of GOODS) sum += Math.min(b.delivered[g], b.cost[g] ?? 0);
    return sum / total;
  }

  /** Lager mit mindestens `min` einer Ware, nächstgelegen zu (x, y) */
  storageWith(good: Good, min: number, x: number, y: number): Building | null {
    return this.storageWhere((b) => b.stock[good] >= min, x, y);
  }

  /** Lager mit irgendeiner Nahrung, nächstgelegen zu (x, y) */
  storageWithFood(x: number, y: number): Building | null {
    return this.storageWhere((b) => FOODS.some((g) => b.stock[g] >= 1), x, y);
  }

  /** Beste vorhandene Nahrung in einem Lager (Brot vor Fisch vor Beeren) */
  bestFood(b: Building): Good | null {
    for (const g of FOODS) if (b.stock[g] >= 1) return g;
    return null;
  }

  /** Fertiges Lager oder Lagerhaus */
  isStore(b: Building): boolean {
    return b.built && BUILDINGS[b.def].storage > 0;
  }

  /** Alle fertigen Lager und Lagerhäuser */
  stores(): Building[] {
    return [...this.alive()].filter((b) => this.isStore(b));
  }

  private storageWhere(ok: (b: Building) => boolean, x: number, y: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.alive()) {
      if (!this.isStore(b) || !ok(b)) continue;
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
      if (!this.isStore(b)) continue;
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

  /** Nahrung aller Art in den Lagern */
  foodTotal(): number {
    let s = 0;
    for (const g of FOODS) s += this.total(g);
    return s;
  }

  /** Wie viele verschiedene Nahrungsarten vorrätig sind */
  foodKinds(): number {
    let n = 0;
    for (const g of FOODS) if (this.total(g) >= 1) n++;
    return n;
  }

  /** Vorrat aller Waren zusammen */
  totals(): Stock {
    const s = emptyStock();
    for (const b of this.alive()) for (const g of GOODS) s[g] += b.stock[g];
    return s;
  }

  storageCapacity(): number {
    let s = 0;
    for (const b of this.alive()) if (this.isStore(b)) s += this.def(b).storage;
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

  /** Nimmt eine Ware aus Lagern (nächste zuerst), gibt die tatsächlich entnommene Menge zurück */
  takeGood(good: Good, amount: number, x: number, y: number): number {
    let left = amount;
    while (left > 1e-9) {
      const l = this.storageWhere((b) => b.stock[good] > 1e-9, x, y);
      if (!l) break;
      const t = Math.min(left, l.stock[good]);
      l.stock[good] -= t;
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
