import { BUILDINGS } from '../data/buildings';
import { FOODS, GOOD_LABEL, GOODS, type Good } from '../data/goods';
import type { Building, Buildings } from './buildings';
import type { Pathfinder } from './pathfinding';

/** Ladung je Fahrt */
export const RAFT_CAPACITY = 8;
/** Zellen je Sekunde */
export const RAFT_SPEED = 2.2;
/** so tief muss das Wasser sein, damit ein Floß fährt */
export const RAFT_DEPTH = 0.06;
/** so tief muss das Wasser am Anleger sein, damit ein Floß dort liegt */
export const MOORING_DEPTH = 0.2;
/** Be- und Entladen in Sekunden */
export const LOAD_TIME = 4;
/** ab diesem Unterschied der Füllstände (Anteil der Kapazität) lohnt eine Fahrt */
export const SHARE_GAP = 0.25;
const RETRY_TIME = 5;
/** so lange wartet ein Floß nach einer vergeblichen Fahrt, bevor es neu belädt */
const BLOCKED_WAIT = 30;
/** so lange wartet der Flößer auf einem festsitzenden Floß, dann geht er an Land */
const ABANDON_TIME = 10;

export type RaftState = 'wartet' | 'laden' | 'faehrt' | 'entladen' | 'fest';

export interface Raft {
  id: number;
  /** Heimatanleger */
  dock: number;
  /** Anleger, an dem das Floß liegt (-1 unterwegs) */
  at: number;
  /** Zielanleger der laufenden Fahrt */
  target: number;
  x: number;
  y: number;
  heading: number;
  state: RaftState;
  /** Bewohner an Bord, -1 ohne */
  crew: number;
  good: Good | null;
  amount: number;
  timer: number;
  path: number[] | null;
  pathIdx: number;
  /** Sekunden festgesessen */
  stuckFor: number;
  warned: boolean;
}

export type SavedRaft = Omit<Raft, 'path' | 'pathIdx'>;

export interface RaftsSave {
  list: SavedRaft[];
  next: number;
  trips: number;
}

/** Was die Flöße von der Welt brauchen */
export interface RaftEnv {
  w: number;
  h: number;
  depth: Float32Array;
  buildings: Buildings;
  waterPath: Pathfinder;
  log(msg: string): void;
}

export interface Cargo {
  target: number;
  good: Good;
  amount: number;
}

/**
 * Flöße fahren von Anleger zu Anleger und gleichen die Vorräte der Bezirke
 * aus. Jeder fertige Anleger hat ein Floß; sein Bezirk ist das nächste Lager
 * im Umkreis. Der Flößer (Arbeiter des Anlegers) fährt mit.
 */
export class Rafts {
  readonly list: Raft[] = [];
  /** abgeschlossene Lieferungen */
  trips = 0;
  private readonly env: RaftEnv;
  private nextId = 0;
  private syncTimer = 0;

  constructor(env: RaftEnv) {
    this.env = env;
  }

  raftOf(dock: number): Raft | null {
    for (const r of this.list) if (r.dock === dock) return r;
    return null;
  }

  cell(r: Raft): number {
    return Math.floor(r.y) * this.env.w + Math.floor(r.x);
  }

  /** Wasserzellen um einen Anleger, an denen ein Floß liegen kann */
  moorings(dock: Building): number[] {
    const env = this.env;
    return env.buildings.ring(dock).filter((i) => env.depth[i] >= MOORING_DEPTH && env.buildings.occ[i] < 0);
  }

  /** Lager des Bezirks: das nächste fertige Lager im Umkreis des Anlegers */
  store(dock: Building): Building | null {
    const b = this.env.buildings;
    const c = b.center(dock);
    let best: Building | null = null;
    let bestD = BUILDINGS.flossanleger.range;
    for (const s of b.stores()) {
      const sc = b.center(s);
      const d = Math.hypot(sc.x - c.x, sc.y - c.y);
      if (d <= bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /**
   * Lohnende Ladung von einem Anleger zu einem anderen Bezirk: die Ware mit
   * dem größten Unterschied der Füllstände, Nahrung zuerst. `to` schränkt
   * auf einen Zielanleger ein (Rückfracht).
   */
  plan(from: Building, to: Building | null): Cargo | null {
    const b = this.env.buildings;
    const src = this.store(from);
    if (!src) return null;
    const srcCap = BUILDINGS[src.def].storage;
    let best: Cargo | null = null;
    let bestGap = SHARE_GAP;
    for (const dock of b.alive()) {
      if (dock.id === from.id || dock.def !== 'flossanleger' || !dock.built) continue;
      if (to && dock.id !== to.id) continue;
      const dst = this.store(dock);
      if (!dst || dst.id === src.id) continue;
      const dstCap = BUILDINGS[dst.def].storage;
      for (const g of GOODS) {
        const have = src.stock[g];
        if (have < 2) continue;
        const gap = have / srcCap - dst.stock[g] / dstCap + (FOODS.includes(g) ? 0.05 : 0);
        if (gap < bestGap) continue;
        const amount = Math.min(RAFT_CAPACITY, Math.floor(have / 2), Math.floor(dstCap - dst.stock[g]));
        if (amount < 1) continue;
        bestGap = gap;
        best = { target: dock.id, good: g, amount };
      }
    }
    return best;
  }

  /** Liegt das Floß bereit und gibt es etwas zu bringen? */
  hasJob(r: Raft): boolean {
    if (r.state !== 'wartet' || r.at !== r.dock || r.timer > 0) return false;
    const dock = this.env.buildings.get(r.dock);
    return !!dock && this.moorings(dock).length > 0 && this.plan(dock, null) !== null;
  }

  /** Der Flößer geht an Bord, das Floß wird beladen */
  board(r: Raft, citizen: number): boolean {
    const dock = this.env.buildings.get(r.dock);
    if (!dock || r.state !== 'wartet' || r.at !== r.dock) return false;
    const cargo = this.plan(dock, null);
    if (!cargo) return false;
    r.crew = citizen;
    this.startLoading(r, cargo);
    return true;
  }

  /** Lesbarer Zustand für die Tafel */
  describe(r: Raft): string {
    const b = this.env.buildings;
    const other = b.get(r.target === r.dock || r.target < 0 ? r.at : r.target);
    const where = other && other.id !== r.dock ? ` (Anleger ${other.id})` : '';
    switch (r.state) {
      case 'wartet':
        return 'liegt am Anleger';
      case 'laden':
        return `lädt ${r.amount} ${r.good ? GOOD_LABEL[r.good] : ''}${where}`;
      case 'faehrt':
        return r.good ? `unterwegs mit ${r.amount} ${GOOD_LABEL[r.good]}` : 'fährt leer zurück';
      case 'entladen':
        return `entlädt ${r.amount} ${r.good ? GOOD_LABEL[r.good] : ''}${where}`;
      case 'fest':
        return 'sitzt fest, zu wenig Wasser';
    }
  }

  step(dt: number): void {
    this.syncTimer -= dt;
    if (this.syncTimer <= 0) {
      this.syncTimer = 1;
      this.sync();
    }
    for (const r of this.list) this.stepRaft(r, dt);
  }

  /** Fertige Anleger bekommen ein Floß, verschwundene verlieren es samt Ladung ans nächste Lager */
  sync(): void {
    const env = this.env;
    const b = env.buildings;
    for (let k = this.list.length - 1; k >= 0; k--) {
      const r = this.list[k];
      const dock = b.get(r.dock);
      if (dock && dock.alive && dock.built) continue;
      if (r.good && r.amount > 0) b.putGood(r.good, r.amount, Math.floor(r.x), Math.floor(r.y));
      this.list.splice(k, 1);
    }
    for (const dock of b.alive()) {
      if (dock.def !== 'flossanleger' || !dock.built || this.raftOf(dock.id)) continue;
      const cells = this.moorings(dock);
      if (cells.length === 0) continue;
      let cell = cells[0];
      for (const i of cells) if (env.depth[i] > env.depth[cell]) cell = i;
      this.list.push({
        id: this.nextId++,
        dock: dock.id,
        at: dock.id,
        target: -1,
        x: (cell % env.w) + 0.5,
        y: Math.floor(cell / env.w) + 0.5,
        heading: 0,
        state: 'wartet',
        crew: -1,
        good: null,
        amount: 0,
        timer: 0,
        path: null,
        pathIdx: 0,
        stuckFor: 0,
        warned: false,
      });
    }
  }

  private startLoading(r: Raft, cargo: Cargo): void {
    r.target = cargo.target;
    r.good = cargo.good;
    r.amount = cargo.amount;
    r.state = 'laden';
    r.timer = LOAD_TIME;
  }

  private endTrip(r: Raft): void {
    r.state = 'wartet';
    r.target = -1;
    r.good = null;
    r.amount = 0;
    r.path = null;
    r.crew = -1;
    r.stuckFor = 0;
  }

  private stepRaft(r: Raft, dt: number): void {
    const b = this.env.buildings;
    switch (r.state) {
      case 'wartet':
        // nach einer vergeblichen Fahrt eine Weile warten
        if (r.timer > 0) r.timer -= dt;
        return;
      case 'laden': {
        r.timer -= dt;
        if (r.timer > 0) return;
        const here = b.get(r.at);
        const store = here ? this.store(here) : null;
        const got = store && r.good ? takeFrom(store, r.good, r.amount) : 0;
        r.amount = got;
        if (got <= 0) {
          r.good = null;
          if (r.at === r.dock) this.endTrip(r);
          else {
            r.target = r.dock;
            this.sail(r);
          }
          return;
        }
        this.sail(r);
        return;
      }
      case 'faehrt':
        this.move(r, dt);
        return;
      case 'entladen': {
        r.timer -= dt;
        if (r.timer > 0) return;
        const here = b.get(r.at);
        if (here && r.good && r.amount > 0) {
          const left = b.putGood(r.good, r.amount, here.x, here.y);
          if (left < r.amount) this.trips++;
          r.amount = left;
          if (left <= 0) r.good = null;
        }
        if (r.at === r.dock || !here) {
          this.endTrip(r);
          return;
        }
        // am Ziel: Rückfracht mitnehmen, sonst leer heim
        const home = b.get(r.dock);
        const cargo = home && !r.good ? this.plan(here, home) : null;
        if (cargo) this.startLoading(r, cargo);
        else {
          r.target = r.dock;
          this.sail(r);
        }
        return;
      }
      case 'fest': {
        r.stuckFor += dt;
        r.timer -= dt;
        // der Flößer wartet nicht ewig, das Floß fährt später allein weiter
        if (r.crew >= 0 && r.stuckFor > ABANDON_TIME) r.crew = -1;
        if (r.timer > 0) return;
        r.timer = RETRY_TIME;
        this.sail(r);
        return;
      }
    }
  }

  /** Weg zum Zielanleger suchen und losfahren */
  private sail(r: Raft): void {
    const env = this.env;
    const b = env.buildings;
    let target = b.get(r.target);
    if (!target || !target.alive) {
      r.target = r.dock;
      target = b.get(r.dock);
    }
    const goals = target ? this.moorings(target).filter((i) => env.depth[i] >= RAFT_DEPTH) : [];
    const path = goals.length > 0 ? env.waterPath.find(this.cell(r), goals) : null;
    if (!path) {
      if (r.at === r.dock && r.at >= 0) {
        // zu Hause ohne Weg: Ladung zurück ins Lager, warten
        const dock = b.get(r.dock);
        if (dock && r.good && r.amount > 0) b.putGood(r.good, r.amount, dock.x, dock.y);
        this.warn(r);
        this.endTrip(r);
        r.timer = BLOCKED_WAIT;
        return;
      }
      this.stuck(r);
      return;
    }
    r.path = path;
    r.pathIdx = 0;
    r.at = -1;
    r.state = 'faehrt';
    r.stuckFor = 0;
    if (path.length === 0) this.arrive(r);
  }

  private stuck(r: Raft): void {
    if (r.state !== 'fest') {
      r.state = 'fest';
      r.timer = RETRY_TIME;
      r.stuckFor = 0;
    }
    this.warn(r);
  }

  private warn(r: Raft): void {
    if (r.warned) return;
    r.warned = true;
    this.env.log('Ein Floß sitzt fest: Der Fluss führt zu wenig Wasser.');
  }

  private move(r: Raft, dt: number): void {
    const env = this.env;
    if (!r.path) {
      // nach dem Laden eines Spielstands: Weg neu suchen
      this.sail(r);
      return;
    }
    let budget = RAFT_SPEED * dt;
    while (budget > 0) {
      if (r.pathIdx >= r.path.length) {
        this.arrive(r);
        return;
      }
      const next = r.path[r.pathIdx];
      if (env.depth[next] < RAFT_DEPTH) {
        this.stuck(r);
        return;
      }
      const tx = (next % env.w) + 0.5;
      const ty = Math.floor(next / env.w) + 0.5;
      const dx = tx - r.x;
      const dy = ty - r.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        r.x = tx;
        r.y = ty;
        budget -= dist;
        r.pathIdx++;
        continue;
      }
      r.x += (dx / dist) * budget;
      r.y += (dy / dist) * budget;
      r.heading = Math.atan2(dx, dy);
      budget = 0;
    }
  }

  private arrive(r: Raft): void {
    r.at = r.target;
    r.path = null;
    r.warned = false;
    r.state = 'entladen';
    r.timer = r.good ? LOAD_TIME : 0;
  }

  // --- Speichern ----------------------------------------------------------------

  save(): RaftsSave {
    return {
      list: this.list.map((r) => {
        const { path: _p, pathIdx: _i, ...rest } = r;
        return rest;
      }),
      next: this.nextId,
      trips: this.trips,
    };
  }

  restore(s: RaftsSave): void {
    this.list.length = 0;
    // Bewohner laden ohne Aufgabe, darum fährt niemand mehr mit
    for (const r of s.list) this.list.push({ ...r, crew: -1, path: null, pathIdx: 0 });
    this.nextId = s.next;
    this.trips = s.trips;
    this.syncTimer = 0;
  }
}

function takeFrom(store: Building, good: Good, amount: number): number {
  const t = Math.min(amount, Math.floor(store.stock[good]));
  store.stock[good] -= t;
  return t;
}
