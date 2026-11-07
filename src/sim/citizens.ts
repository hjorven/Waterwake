import { BUILDINGS } from '../data/buildings';
import type { Building, Buildings, Good } from './buildings';
import type { Pathfinder } from './pathfinding';
import { DAY } from './seasons';
import { TREE_GROWN, type Vegetation } from './vegetation';

export type CitizenState = 'idle' | 'walk' | 'work' | 'drink' | 'eat';
export const STATE_CODE: Record<CitizenState, number> = { idle: 0, walk: 1, work: 2, drink: 3, eat: 4 };
export const GOOD_CODE: Record<Good, number> = { holz: 1, beeren: 2 };

type TaskKind = 'pump' | 'gather' | 'chop' | 'plant' | 'haul' | 'build' | 'drink' | 'eat' | 'wander';

interface Task {
  kind: TaskKind;
  /** Gebäude, um das es geht (Arbeitsplatz, Lager, Baustelle, Trinkstelle) */
  building: number;
  /** Zielzelle (Strauch, Baum, Pflanzstelle) oder -1 */
  target: number;
  /** Abschnitt der Aufgabe */
  phase: number;
  timer: number;
  amount: number;
  /** zweites Gebäude (Lager beim Holen) */
  other: number;
}

export interface Citizen {
  id: number;
  name: string;
  x: number;
  y: number;
  heading: number;
  state: CitizenState;
  alive: boolean;
  path: number[] | null;
  pathIdx: number;
  /** 1 = satt, 0 = tot */
  water: number;
  food: number;
  workplace: number;
  home: number;
  carry: Good | null;
  carryAmount: number;
  task: Task | null;
  cooldown: number;
  /** Arbeit, die in dieser Aufgabe geleistet wurde (Baufortschritt usw.) */
  work: number;
  /** Alter in Tagen */
  age: number;
  /** Lebenserwartung in Tagen, steigt mit Zufriedenheit */
  lifespan: number;
  /** Junge arbeiten noch nicht */
  child: boolean;
  /** Zufriedenheit 0..1 */
  mood: number;
}

/** Gespeicherte Form eines Bewohners, ohne laufende Aufgabe */
export type CitizenSave = Pick<
  Citizen,
  'id' | 'name' | 'x' | 'y' | 'heading' | 'alive' | 'water' | 'food' | 'workplace' | 'home' | 'carry' | 'carryAmount' | 'age' | 'lifespan' | 'child' | 'mood'
>;

export interface CitizensSave {
  list: CitizenSave[];
  nameIdx: number;
  births: number;
  deaths: number;
  grief: number;
  birthProgress: number;
  now: number;
  dayTimer: number;
}

/** Was die Bewohner von der Welt brauchen */
export interface Env {
  w: number;
  h: number;
  ground: Uint8Array;
  struct: Uint8Array;
  depth: Float32Array;
  buildings: Buildings;
  veg: Vegetation;
  path: Pathfinder;
  walkable(i: number): boolean;
  store: { stored: number };
  waterCapacity(): number;
  /** Zahl der Freude-Gebäude verschiedener Art, die diesen Punkt erreichen */
  joyAt(x: number, y: number): number;
  /** Zellen, die gerade jemand als Ziel hat */
  reserved: Set<number>;
  log(msg: string): void;
  rnd(): number;
}

const NAMES = [
  'Fjella', 'Brisk', 'Nuss', 'Kiesel', 'Welle', 'Tang', 'Moos', 'Flint', 'Ried', 'Schilf',
  'Perle', 'Uferle', 'Bimmel', 'Tropf', 'Kalla', 'Sprudel', 'Lotte', 'Wurzel', 'Pfütze', 'Grau',
  'Nebel', 'Funke', 'Birke', 'Dotter', 'Fluse', 'Knirps', 'Mala', 'Rille', 'Sumpf', 'Tilda',
];

const WALK_SPEED = 2.6;
const SWIM_SPEED = 1.3;
const PUMP_RATE = 0.2;
const DRINK_AT = 0.35;
const EAT_AT = 0.35;
const WATER_DAYS = 3;
const FOOD_DAYS = 5;
const CHOP_TIME = 5;
const PICK_TIME = 3;
const PLANT_TIME = 3;
const HAUL_MAX = 6;
const MAX_BUILDERS = 2;
/** Tage, bis ein Junges erwachsen ist */
export const CHILD_DAYS = 6;
/** Zeitkonstante, mit der sich die Stimmung an die Lage anpasst */
const MOOD_TIME = 0.5 * DAY;
/** Geburten je Tag bei zwei zufriedenen Erwachsenen mit Hütte */
const BIRTH_RATE = 0.12;
/** Trauer nach einem Todesfall in Sekunden */
const GRIEF_TIME = 2 * DAY;

export class Citizens {
  readonly list: Citizen[] = [];
  births = 0;
  deaths = 0;
  /** verbleibende Trauerzeit in Sekunden */
  grief = 0;
  /** Zellen, zu denen zuletzt kein Weg gefunden wurde, mit Ablaufzeit */
  private readonly unreachable = new Map<number, number>();
  private now = 0;
  private nameIdx = 0;
  private assignTimer = 0;
  private dayTimer = 0;
  private birthProgress = 0;
  private noWaterWarned = false;
  private noFoodWarned = false;

  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  *alive(): IterableIterator<Citizen> {
    for (const c of this.list) if (c.alive) yield c;
  }

  count(): number {
    let n = 0;
    for (const c of this.list) if (c.alive) n++;
    return n;
  }

  children(): number {
    let n = 0;
  for (const c of this.list) if (c.alive && c.child) n++;
    return n;
  }

  /** mittlere Zufriedenheit aller Lebenden, 0.5 wenn niemand lebt */
  mood(): number {
    let s = 0;
    let n = 0;
    for (const c of this.list) {
      if (!c.alive) continue;
      s += c.mood;
      n++;
    }
    return n ? s / n : 0.5;
  }

  spawn(x: number, y: number, opts: { child?: boolean } = {}): Citizen {
    const rnd = this.env.rnd;
    const child = !!opts.child;
    const c: Citizen = {
      id: this.list.length,
      name: NAMES[this.nameIdx++ % NAMES.length],
      x: x + 0.5,
      y: y + 0.5,
      heading: rnd() * Math.PI * 2,
      state: 'idle',
      alive: true,
      path: null,
      pathIdx: 0,
      water: 0.8 + rnd() * 0.2,
      food: 0.8 + rnd() * 0.2,
      workplace: -1,
      home: -1,
      carry: null,
      carryAmount: 0,
      task: null,
      cooldown: rnd() * 2,
      work: 0,
      age: child ? 0 : 8 + Math.floor(rnd() * 22),
      lifespan: 55 + Math.floor(rnd() * 25),
      child,
      mood: 0.6,
    };
    this.list.push(c);
    return c;
  }

  cell(c: Citizen): number {
    return Math.floor(c.y) * this.env.w + Math.floor(c.x);
  }

  step(dt: number): void {
    this.now += dt;
    if (this.grief > 0) this.grief -= dt;
    this.assignTimer -= dt;
    if (this.assignTimer <= 0) {
      this.assignTimer = 1;
      this.assignWork();
      this.assignHomes();
      this.updateMood(1);
    }
    this.dayTimer += dt;
    if (this.dayTimer >= DAY) {
      this.dayTimer -= DAY;
      this.daily();
    }
    for (const c of this.list) {
      if (!c.alive) continue;
      c.water -= dt / (WATER_DAYS * DAY);
      c.food -= dt / (FOOD_DAYS * DAY);
      if (c.water <= 0 || c.food <= 0) {
        this.die(c, c.water <= 0 ? 'verdurstet' : 'verhungert');
        continue;
      }
      c.cooldown -= dt;
      switch (c.state) {
        case 'idle':
          if (c.cooldown <= 0) this.decide(c);
          break;
        case 'walk':
          this.move(c, dt);
          break;
        case 'work':
        case 'drink':
        case 'eat':
          this.doWork(c, dt);
          break;
      }
    }
  }

  // --- Stimmung, Alter, Geburten ------------------------------------------------

  private updateMood(dt: number): void {
    const env = this.env;
    for (const c of this.alive()) {
      let t = 0.55;
      const home = env.buildings.get(c.home);
      if (home) {
        t += 0.15;
        if (home.flooded) t -= 0.15;
      } else {
        t -= 0.25;
      }
      if (c.water < DRINK_AT || c.food < EAT_AT) t -= 0.2;
      else if (c.water > 0.6 && c.food > 0.6) t += 0.1;
      const at = home ? env.buildings.center(home) : c;
      t += 0.1 * Math.min(2, env.joyAt(at.x, at.y));
      if (this.grief > 0) t -= 0.15;
      t = Math.max(0, Math.min(1, t));
      c.mood += (t - c.mood) * Math.min(1, dt / MOOD_TIME);
    }
  }

  private daily(): void {
    for (const c of this.list) {
      if (!c.alive) continue;
      c.age += 1;
      c.lifespan += (c.mood - 0.5) * 0.3;
      if (c.child && c.age >= CHILD_DAYS) c.child = false;
      if (c.age >= c.lifespan) this.die(c, 'in hohem Alter gestorben');
    }
    this.tryBirth();
  }

  private tryBirth(): void {
    const env = this.env;
    const b = env.buildings;
    const housing = b.housing();
    if (this.count() >= housing) return;
    if (b.total('beeren') < 2) return;
    let adults = 0;
    let moodSum = 0;
    for (const c of this.alive()) {
      if (c.child || c.home < 0) continue;
      adults++;
      moodSum += c.mood;
    }
    if (adults < 2) return;
    const factor = Math.max(0, Math.min(1, (moodSum / adults - 0.45) / 0.4));
    this.birthProgress += BIRTH_RATE * (adults / 2) * factor;
    while (this.birthProgress >= 1 && this.count() < housing) {
      this.birthProgress -= 1;
      if (!this.birth()) break;
    }
  }

  private birth(): boolean {
    const env = this.env;
    const b = env.buildings;
    const huts = [...b.alive()].filter((h) => h.built && BUILDINGS[h.def].housing > h.residents.length);
    if (huts.length === 0) return false;
    const hut = huts[Math.floor(env.rnd() * huts.length)];
    const ring = b.ring(hut).filter((i) => env.walkable(i));
    const cell = ring.length ? ring[Math.floor(env.rnd() * ring.length)] : hut.y * env.w + hut.x;
    const c = this.spawn(cell % env.w, (cell / env.w) | 0, { child: true });
    c.home = hut.id;
    hut.residents.push(c.id);
    this.births++;
    env.log(`Ein Otterjunges ist geboren: ${c.name}.`);
    return true;
  }

  private die(c: Citizen, how: string): void {
    const env = this.env;
    c.alive = false;
    this.release(c);
    const wp = env.buildings.get(c.workplace);
    if (wp) wp.workers = wp.workers.filter((id) => id !== c.id);
    const home = env.buildings.get(c.home);
    if (home) home.residents = home.residents.filter((id) => id !== c.id);
    this.deaths++;
    this.grief = GRIEF_TIME;
    env.log(`${c.name} ist ${how}.`);
  }

  /** Ein Gebäude ist weg: Arbeitsplätze, Wohnplätze und Aufgaben dazu lösen */
  detachBuilding(id: number): void {
    for (const c of this.list) {
      if (c.workplace === id) c.workplace = -1;
      if (c.home === id) c.home = -1;
      if (c.task && (c.task.building === id || c.task.other === id)) this.fail(c);
    }
  }

  /** Reservierungen einer Aufgabe freigeben */
  private release(c: Citizen): void {
    const t = c.task;
    if (!t) return;
    if (t.target >= 0) this.env.reserved.delete(t.target);
    if (t.kind === 'haul') {
      const site = this.env.buildings.get(t.building);
      if (site && t.phase < 2) site.woodReserved = Math.max(0, site.woodReserved - t.amount);
    }
    c.task = null;
    c.path = null;
  }

  private assignWork(): void {
    const env = this.env;
    const free: Citizen[] = [];
    for (const c of this.alive()) if (c.workplace < 0 && !c.child) free.push(c);
    if (free.length === 0) return;
    for (const b of env.buildings.alive()) {
      if (!b.built) continue;
      const def = BUILDINGS[b.def];
      while (b.workers.length < def.workers && free.length > 0) {
        const ctr = env.buildings.center(b);
        free.sort((a, z) => Math.abs(z.x - ctr.x) + Math.abs(z.y - ctr.y) - (Math.abs(a.x - ctr.x) + Math.abs(a.y - ctr.y)));
        const c = free.pop()!;
        c.workplace = b.id;
        b.workers.push(c.id);
      }
    }
  }

  private assignHomes(): void {
    const env = this.env;
    const homeless: Citizen[] = [];
    for (const c of this.alive()) if (c.home < 0) homeless.push(c);
    if (homeless.length === 0) return;
    for (const b of env.buildings.alive()) {
      if (!b.built) continue;
      const def = BUILDINGS[b.def];
      while (b.residents.length < def.housing && homeless.length > 0) {
        const c = homeless.pop()!;
        c.home = b.id;
        b.residents.push(c.id);
      }
    }
  }

  // --- Entscheidungen -------------------------------------------------------

  private decide(c: Citizen): void {
    const env = this.env;
    const b = env.buildings;
    // 1. Bedürfnisse
    if (c.water < DRINK_AT) {
      if (env.store.stored >= 1) {
        const src = b.nearest(['pumpe', 'tank'], c.x, c.y);
        if (src && this.startTask(c, { kind: 'drink', building: src.id, target: -1, phase: 0, timer: 0, amount: 1, other: -1 }, b.ring(src))) return;
      }
      // Otter trinken auch direkt aus dem Fluss, solange er Wasser führt
      const river = this.findInRange({ x: c.x, y: c.y }, 14, (i) => env.depth[i] > 0.1 && env.buildings.occ[i] < 0);
      if (river >= 0 && this.startTask(c, { kind: 'drink', building: -1, target: -1, phase: 0, timer: 0, amount: 0, other: river }, [river])) return;
      if (!this.noWaterWarned) {
        this.noWaterWarned = true;
        env.log('Kein Trinkwasser: Speicher leer und kein Fluss in der Nähe.');
      }
    } else if (env.store.stored >= 1) {
      this.noWaterWarned = false;
    }
    if (c.food < EAT_AT) {
      const l = b.storageWith('beeren', 1, c.x, c.y);
      if (l && this.startTask(c, { kind: 'eat', building: l.id, target: -1, phase: 0, timer: 0, amount: 1, other: -1 }, b.ring(l))) return;
      if (!l && !this.noFoodWarned) {
        this.noFoodWarned = true;
        env.log('Die Beeren sind aufgebraucht.');
      }
    } else if (b.total('beeren') > 0) {
      this.noFoodWarned = false;
    }
    // Noch Ware in der Hand (z. B. nach gescheiterter Lieferung): abliefern
    if (c.carry) {
      if (this.deliverCarried(c)) return;
      c.cooldown = 4;
      return;
    }
    // Junge spielen nur
    if (c.child) {
      this.wander(c);
      return;
    }
    // 2. Arbeitsplatz
    const wp = b.get(c.workplace);
    if (wp && wp.built) {
      if (this.workAt(c, wp)) return;
    } else if (c.workplace >= 0) {
      c.workplace = -1;
    }
    // 3. Baustellen
    if (!wp && this.construction(c)) return;
    // 4. Herumstreunen
    this.wander(c);
  }

  private workAt(c: Citizen, wp: Building): boolean {
    const env = this.env;
    const b = env.buildings;
    const def = BUILDINGS[wp.def];
    const ctr = b.center(wp);
    switch (wp.def) {
      case 'pumpe': {
        if (env.store.stored >= env.waterCapacity() - 0.01) {
          c.cooldown = 3;
          return true;
        }
        const wet = this.wetCellsAround(wp);
        if (wet.length === 0) {
          c.cooldown = 4;
          return true;
        }
        return this.startTask(c, { kind: 'pump', building: wp.id, target: -1, phase: 0, timer: 0, amount: 0, other: -1 }, b.ring(wp));
      }
      case 'sammler': {
        const t = this.findInRange(ctr, def.range, (i) => env.veg.bushes[i] === 2);
        if (t < 0) {
          c.cooldown = 5;
          return true;
        }
        return this.startTask(c, { kind: 'gather', building: wp.id, target: t, phase: 0, timer: 0, amount: 0, other: -1 }, [t]);
      }
      case 'holzfaeller': {
        const t = this.findInRange(ctr, def.range, (i) => env.veg.trees[i] >= TREE_GROWN);
        if (t < 0) {
          c.cooldown = 5;
          return true;
        }
        return this.startTask(c, { kind: 'chop', building: wp.id, target: t, phase: 0, timer: 0, amount: 0, other: -1 }, [t]);
      }
      case 'foerster': {
        const t = this.findInRange(ctr, def.range, (i) =>
          env.veg.trees[i] === 0 && env.veg.bushes[i] === 0 && env.buildings.occ[i] < 0 && env.struct[i] === 0 &&
          env.depth[i] < 0.1 && env.veg.moist[i] > 0 && env.ground[i] >= 2 && env.ground[i] <= 11 && this.hasNeighborSpace(i));
        if (t < 0) {
          c.cooldown = 6;
          return true;
        }
        return this.startTask(c, { kind: 'plant', building: wp.id, target: t, phase: 0, timer: 0, amount: 0, other: -1 }, [t]);
      }
      default:
        return false;
    }
  }

  /** Förster lässt Lücken, damit der Wald begehbar bleibt */
  private hasNeighborSpace(i: number): boolean {
    const { w, veg } = this.env;
    const x = i % w;
    let trees = 0;
    if (x > 0 && veg.trees[i - 1]) trees++;
    if (x < w - 1 && veg.trees[i + 1]) trees++;
    if (i >= w && veg.trees[i - w]) trees++;
    if (i + w < veg.trees.length && veg.trees[i + w]) trees++;
    return trees < 3;
  }

  private wetCellsAround(b: Building): number[] {
    const env = this.env;
    return env.buildings.ring(b).filter((i) => env.depth[i] > 0.05 && env.struct[i] === 0);
  }

  private findInRange(ctr: { x: number; y: number }, range: number, ok: (i: number) => boolean): number {
    const env = this.env;
    const x0 = Math.max(0, Math.floor(ctr.x - range));
    const x1 = Math.min(env.w - 1, Math.floor(ctr.x + range));
    const y0 = Math.max(0, Math.floor(ctr.y - range));
    const y1 = Math.min(env.h - 1, Math.floor(ctr.y + range));
    let best = -1;
    let bestD = Infinity;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - ctr.x, y + 0.5 - ctr.y);
        if (d > range || d >= bestD) continue;
        const i = y * env.w + x;
        if (env.reserved.has(i) || this.isUnreachable(i) || !ok(i)) continue;
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  private isUnreachable(i: number): boolean {
    const until = this.unreachable.get(i);
    if (until === undefined) return false;
    if (until < this.now) {
      this.unreachable.delete(i);
      return false;
    }
    return true;
  }

  private construction(c: Citizen): boolean {
    const env = this.env;
    const b = env.buildings;
    // Holz liefern: Holzfäller zuerst (sonst geht das Holz aus), dann
    // angefangene Baustellen fertig beliefern, dann in Reihenfolge der
    // Platzierung. So verteilt sich knappes Holz nicht auf viele Baustellen.
    const sites: { s: Building; key: number }[] = [];
    for (const s of b.alive()) {
      if (s.built || b.woodNeeded(s) <= 0) continue;
      const started = s.woodDelivered + s.woodReserved > 0 ? 0 : 1;
      const key = (s.def === 'holzfaeller' ? 0 : 1) * 1e6 + started * 1e5 + s.id;
      sites.push({ s, key });
    }
    sites.sort((a, b2) => a.key - b2.key);
    for (const { s: site } of sites) {
      const need = b.woodNeeded(site);
      const lager = b.storageWith('holz', 1, c.x, c.y);
      if (!lager) break;
      const amount = Math.min(need, HAUL_MAX, lager.stock.holz);
      const task: Task = { kind: 'haul', building: site.id, target: -1, phase: 0, timer: 0, amount, other: lager.id };
      if (this.startTask(c, task, b.ring(lager))) {
        site.woodReserved += amount;
        return true;
      }
    }
    // Bauen
    for (const s of b.alive()) {
      if (s.built || s.woodDelivered < BUILDINGS[s.def].wood) continue;
      let builders = 0;
      for (const o of this.alive()) if (o.task && o.task.kind === 'build' && o.task.building === s.id) builders++;
      if (builders >= MAX_BUILDERS) continue;
      if (this.startTask(c, { kind: 'build', building: s.id, target: -1, phase: 0, timer: 0, amount: 0, other: -1 }, b.ring(s))) return true;
    }
    return false;
  }

  private wander(c: Citizen): void {
    const env = this.env;
    // Junge bleiben in der Nähe ihrer Hütte
    const home = c.child ? env.buildings.get(c.home) : null;
    const ctr = home ? env.buildings.center(home) : { x: c.x, y: c.y };
    const cx = Math.floor(ctr.x);
    const cy = Math.floor(ctr.y);
    const tx = cx + Math.floor(env.rnd() * 7) - 3;
    const ty = cy + Math.floor(env.rnd() * 7) - 3;
    c.cooldown = 3 + env.rnd() * 4;
    if (tx < 0 || ty < 0 || tx >= env.w || ty >= env.h) return;
    const t = ty * env.w + tx;
    if (!env.walkable(t)) return;
    this.startTask(c, { kind: 'wander', building: -1, target: -1, phase: 0, timer: 0, amount: 0, other: -1 }, [t]);
  }

  /** Aufgabe mit Weg zu einem der Ziele beginnen */
  private startTask(c: Citizen, task: Task, goals: number[]): boolean {
    const env = this.env;
    const walkableGoals = goals.filter((g) => env.walkable(g) || g === task.target);
    if (walkableGoals.length === 0) return false;
    const path = env.path.find(this.cell(c), walkableGoals);
    if (!path) {
      if (task.target >= 0) this.unreachable.set(task.target, this.now + 90);
      return false;
    }
    if (task.target >= 0) env.reserved.add(task.target);
    c.task = task;
    c.path = path;
    c.pathIdx = 0;
    c.state = path.length === 0 ? 'work' : 'walk';
    c.work = 0;
    if (path.length === 0) this.arrive(c);
    return true;
  }

  private fail(c: Citizen): void {
    this.release(c);
    c.state = 'idle';
    c.cooldown = 3;
  }

  // --- Bewegung --------------------------------------------------------------

  private move(c: Citizen, dt: number): void {
    const env = this.env;
    if (!c.path || c.pathIdx >= c.path.length) {
      this.arrive(c);
      return;
    }
    const target = c.path[c.pathIdx];
    const tx = (target % env.w) + 0.5;
    const ty = Math.floor(target / env.w) + 0.5;
    const here = this.cell(c);
    const swimming = env.depth[here] > 0.25;
    const slow = c.child ? 0.8 : 1;
    let budget = (swimming ? SWIM_SPEED : WALK_SPEED) * slow * dt;
    while (budget > 0) {
      const dx = tx - c.x;
      const dy = ty - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        c.x = tx;
        c.y = ty;
        budget -= dist;
        c.pathIdx++;
        if (c.pathIdx >= c.path.length) {
          this.arrive(c);
          return;
        }
        const n = c.path[c.pathIdx];
        if (!env.walkable(n) && n !== c.task?.target) {
          // Weg wurde verbaut: neu planen
          const goal = c.path[c.path.length - 1];
          const p = env.path.find(this.cell(c), [goal]);
          if (!p) {
            this.fail(c);
            return;
          }
          c.path = p;
          c.pathIdx = 0;
          return;
        }
        continue;
      }
      c.x += (dx / dist) * budget;
      c.y += (dy / dist) * budget;
      c.heading = Math.atan2(dx, dy);
      budget = 0;
    }
  }

  private arrive(c: Citizen): void {
    const t = c.task;
    if (!t) {
      c.state = 'idle';
      return;
    }
    switch (t.kind) {
      case 'wander':
        c.task = null;
        c.state = 'idle';
        break;
      case 'drink':
        c.state = 'drink';
        t.timer = 1.5;
        break;
      case 'eat':
        c.state = 'eat';
        t.timer = 2;
        break;
      case 'pump':
        c.state = 'work';
        break;
      case 'gather':
        c.state = 'work';
        t.timer = t.phase === 0 ? PICK_TIME : 0.5;
        break;
      case 'chop':
        c.state = 'work';
        t.timer = t.phase === 0 ? CHOP_TIME : 0.5;
        break;
      case 'plant':
        c.state = 'work';
        t.timer = PLANT_TIME;
        break;
      case 'haul':
        c.state = 'work';
        t.timer = 0.8;
        break;
      case 'build':
        c.state = 'work';
        break;
    }
  }

  // --- Arbeit ---------------------------------------------------------------

  private doWork(c: Citizen, dt: number): void {
    const env = this.env;
    const b = env.buildings;
    const t = c.task;
    if (!t) {
      c.state = 'idle';
      return;
    }
    // Zufriedene Otter arbeiten schneller
    const pace = 0.7 + 0.5 * c.mood;
    t.timer -= dt * pace;
    switch (t.kind) {
      case 'drink': {
        if (t.timer > 0) return;
        if (t.building < 0) {
          // aus dem Fluss
          if (env.depth[t.other] > 0.02) c.water = 1;
        } else if (env.store.stored >= 1) {
          env.store.stored -= 1;
          c.water = 1;
        }
        this.finish(c, 0.5);
        return;
      }
      case 'eat': {
        if (t.timer > 0) return;
        const l = b.get(t.building);
        if (l && l.stock.beeren >= 1) {
          l.stock.beeren -= 1;
          c.food = 1;
        }
        this.finish(c, 0.5);
        return;
      }
      case 'pump': {
        const wp = b.get(t.building);
        if (!wp || !wp.built) {
          this.fail(c);
          return;
        }
        if (c.water < DRINK_AT || c.food < EAT_AT) {
          this.finish(c, 0);
          return;
        }
        const cap = env.waterCapacity();
        const wet = this.wetCellsAround(wp);
        if (wet.length === 0 || env.store.stored >= cap - 0.001) {
          this.finish(c, 2);
          return;
        }
        let want = Math.min(PUMP_RATE * pace * dt, cap - env.store.stored);
        for (const i of wet) {
          const take = Math.min(want, env.depth[i] * 0.5);
          env.depth[i] -= take;
          env.store.stored += take;
          want -= take;
          if (want <= 0) break;
        }
        return;
      }
      case 'gather':
      case 'chop': {
        if (t.timer > 0) return;
        if (t.phase === 0) {
          const got = t.kind === 'gather' ? env.veg.pickBerries(t.target) : env.veg.cutTree(t.target);
          env.reserved.delete(t.target);
          t.target = -1;
          if (got <= 0) {
            this.fail(c);
            return;
          }
          c.carry = t.kind === 'gather' ? 'beeren' : 'holz';
          c.carryAmount = got;
          t.phase = 1;
          if (!this.deliverCarried(c)) this.finish(c, 3);
          return;
        }
        this.dropCarried(c, t.building);
        this.finish(c, 0.5);
        return;
      }
      case 'plant': {
        if (t.timer > 0) return;
        env.veg.plantTree(t.target);
        env.reserved.delete(t.target);
        t.target = -1;
        this.finish(c, 1);
        return;
      }
      case 'haul': {
        if (t.timer > 0) return;
        const site = b.get(t.building);
        if (t.phase === 0) {
          // am Lager: Holz nehmen
          const lager = b.get(t.other);
          const got = lager ? Math.min(t.amount, lager.stock.holz) : 0;
          if (!site || site.built || got <= 0) {
            if (site) site.woodReserved = Math.max(0, site.woodReserved - t.amount);
            this.fail(c);
            return;
          }
          lager!.stock.holz -= got;
          site.woodReserved = Math.max(0, site.woodReserved - (t.amount - got));
          t.amount = got;
          c.carry = 'holz';
          c.carryAmount = got;
          t.phase = 1;
          c.task = t;
          const p = env.path.find(this.cell(c), b.ring(site).filter((i) => env.walkable(i)));
          if (!p) {
            site.woodReserved = Math.max(0, site.woodReserved - got);
            // Holz zurücklegen
            this.deliverCarried(c) || this.finish(c, 3);
            return;
          }
          c.path = p;
          c.pathIdx = 0;
          c.state = p.length === 0 ? 'work' : 'walk';
          if (p.length === 0) this.arrive(c);
          return;
        }
        // an der Baustelle: abliefern
        if (site && !site.built) {
          site.woodDelivered += c.carryAmount;
          site.woodReserved = Math.max(0, site.woodReserved - t.amount);
          c.carry = null;
          c.carryAmount = 0;
          t.phase = 2;
          this.finish(c, 0.3);
          return;
        }
        // Baustelle weg: Holz zurück ins Lager
        t.phase = 2;
        if (!this.deliverCarried(c)) this.finish(c, 3);
        return;
      }
      case 'build': {
        const site = b.get(t.building);
        if (!site || site.built) {
          this.finish(c, 0.3);
          return;
        }
        if (c.water < DRINK_AT || c.food < EAT_AT) {
          this.finish(c, 0);
          return;
        }
        const def = BUILDINGS[site.def];
        site.progress = Math.min(1, site.progress + (dt * pace) / def.buildTime);
        if (site.progress >= 1) {
          site.built = true;
          b.version++;
          env.log(`${def.name} fertig.`);
          this.finish(c, 0.5);
        }
        return;
      }
      default:
        this.finish(c, 1);
    }
  }

  /** Getragene Ware zum nächsten Lager mit Platz bringen (neue Teilaufgabe) */
  private deliverCarried(c: Citizen): boolean {
    const env = this.env;
    const b = env.buildings;
    if (!c.carry) return false;
    const l = b.storageSpace(c.carry, c.carryAmount, c.x, c.y);
    if (!l) return false;
    const path = env.path.find(this.cell(c), b.ring(l).filter((i) => env.walkable(i)));
    if (!path) return false;
    const kind: TaskKind = c.carry === 'holz' ? 'chop' : 'gather';
    c.task = { kind, building: l.id, target: -1, phase: 1, timer: 0, amount: 0, other: -1 };
    c.path = path;
    c.pathIdx = 0;
    c.state = path.length === 0 ? 'work' : 'walk';
    if (path.length === 0) this.arrive(c);
    return true;
  }

  private dropCarried(c: Citizen, lagerId: number): void {
    const b = this.env.buildings;
    if (!c.carry) return;
    const l = b.get(lagerId);
    const def = l ? BUILDINGS[l.def] : null;
    let left = c.carryAmount;
    if (l && def && l.def === 'lager' && l.built) {
      const space = def.storage - l.stock[c.carry];
      const put = Math.min(space, left);
      l.stock[c.carry] += put;
      left -= put;
    }
    if (left > 0) left = b.putGood(c.carry, left, c.x, c.y);
    c.carryAmount = left;
    if (left <= 0) c.carry = null;
  }

  private finish(c: Citizen, cooldown: number): void {
    this.release(c);
    c.state = 'idle';
    c.cooldown = cooldown;
  }

  // --- Speichern ----------------------------------------------------------------

  save(): CitizensSave {
    return {
      list: this.list.map((c) => ({
        id: c.id,
        name: c.name,
        x: c.x,
        y: c.y,
        heading: c.heading,
        alive: c.alive,
        water: c.water,
        food: c.food,
        workplace: c.workplace,
        home: c.home,
        carry: c.carry,
        carryAmount: c.carryAmount,
        age: c.age,
        lifespan: c.lifespan,
        child: c.child,
        mood: c.mood,
      })),
      nameIdx: this.nameIdx,
      births: this.births,
      deaths: this.deaths,
      grief: this.grief,
      birthProgress: this.birthProgress,
      now: this.now,
      dayTimer: this.dayTimer,
    };
  }

  restore(s: CitizensSave): void {
    this.list.length = 0;
    for (const c of s.list) {
      this.list.push({
        ...c,
        state: 'idle',
        path: null,
        pathIdx: 0,
        task: null,
        cooldown: this.env.rnd() * 2,
        work: 0,
      });
    }
    this.nameIdx = s.nameIdx;
    this.births = s.births;
    this.deaths = s.deaths;
    this.grief = s.grief;
    this.birthProgress = s.birthProgress;
    this.now = s.now;
    this.dayTimer = s.dayTimer;
    this.unreachable.clear();
    this.assignTimer = 0;
  }
}
