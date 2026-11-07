import { BUILDINGS, DRINK_SPOTS, type BuildingId } from '../data/buildings';
import type { SpeciesDef } from '../data/species';
import type { Weather } from './world';
import { type Good } from '../data/goods';
import type { Building, Buildings } from './buildings';
import type { Pathfinder } from './pathfinding';
import type { Rafts } from './rafts';
import { DAY } from './seasons';
import { TREE_GROWN, type Vegetation } from './vegetation';

export { GOOD_CODE } from '../data/goods';

export type CitizenState = 'idle' | 'walk' | 'work' | 'drink' | 'eat' | 'ride';
export const STATE_CODE: Record<CitizenState, number> = { idle: 0, walk: 1, work: 2, drink: 3, eat: 4, ride: 5 };

type TaskKind =
  | 'pump'
  | 'gather'
  | 'chop'
  | 'plant'
  | 'plantbush'
  | 'haul'
  | 'build'
  | 'drink'
  | 'eat'
  | 'wander'
  | 'tread'
  | 'heal'
  | 'serve'
  | 'study'
  | 'craft'
  | 'fish'
  /** mit dem Floß fahren (Flößer) */
  | 'ferry'
  | 'tend'
  | 'harvest'
  | 'deliver'
  /** Stein brechen (Steinbruch) */
  | 'mine'
  /** Wasser im Kiesbecken reinigen */
  | 'filter';

/** Schichtarbeit am Gebäude selbst: Aufgaben, bei denen der Otter eine Weile am Arbeitsplatz bleibt */
export type ShiftKind = 'tread' | 'heal' | 'serve' | 'study';

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
  /** Ware, um die es geht (Lieferung, Verarbeitung) */
  good: Good | null;
}

function task(kind: TaskKind, building: number, extra: Partial<Task> = {}): Task {
  return { kind, building, target: -1, phase: 0, timer: 0, amount: 0, other: -1, good: null, ...extra };
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
  /** Gesundheit 0..1, schmutziges Wasser senkt sie */
  health: number;
  /** krank: arbeitet langsam, ist unglücklich */
  sick: boolean;
}

/** Gespeicherte Form eines Bewohners, ohne laufende Aufgabe */
export type CitizenSave = Pick<
  Citizen,
  'id' | 'name' | 'x' | 'y' | 'heading' | 'alive' | 'water' | 'food' | 'workplace' | 'home' | 'carry' | 'carryAmount' | 'age' | 'lifespan' | 'child' | 'mood' | 'health' | 'sick'
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
  toolBonus?: boolean;
}

/** Was die Bewohner von der Welt brauchen */
export interface Env {
  w: number;
  h: number;
  ground: Uint8Array;
  struct: Uint8Array;
  depth: Float32Array;
  /** Verschmutzung des Wassers je Zelle 0..1 */
  pollution: Float32Array;
  buildings: Buildings;
  veg: Vegetation;
  path: Pathfinder;
  rafts: Rafts;
  /** das Volk mit seinen Regeln */
  species: SpeciesDef;
  weather: Weather;
  walkable(i: number): boolean;
  /** darf man von Zelle a nach b treten (Höhenunterschied) */
  canStep(a: number, b: number): boolean;
  store: { stored: number; pollution: number };
  waterCapacity(): number;
  /** Wasser in den Speicher mischen, gibt die aufgenommene Menge zurück */
  addWater(amount: number, pollution: number): number;
  /** Laufräder sollen laufen */
  needsTread(): boolean;
  /** Heilwirkung an diesem Punkt: 0 keine, 1 Heilerhütte mit Pfleger, 2 mit Kräutern */
  healAt(x: number, y: number): number;
  addKnowledge(amount: number): void;
  /** Geschwindigkeit einer Verarbeitung (Sägewerk braucht Strom) */
  craftSpeed(b: Building): number;
  /** Schule mit Lehrern: Junge werden schneller erwachsen */
  hasSchool(): boolean;
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

const PUMP_RATE = 0.2;
const DRINK_AT = 0.35;
const EAT_AT = 0.35;
const WATER_DAYS = 3;
/** So weit laufen durstige Otter zum Fluss (Zellen) */
const RIVER_RANGE = 24;
const FOOD_DAYS = 5;
const CHOP_TIME = 5;
const PICK_TIME = 3;
const PLANT_TIME = 3;
const HAUL_MAX = 6;
/** Höchstens so viele bauen an einer Baustelle, so viele liefern insgesamt */
const MAX_BUILDERS = 2;
const MAX_HAULERS = 2;
const MAX_BUILDERS_TOTAL = 3;
/** Tage, bis ein Junges erwachsen ist */
export const CHILD_DAYS = 6;
/** Zeitkonstante, mit der sich die Stimmung an die Lage anpasst */
const MOOD_TIME = 0.5 * DAY;
/** Geburten je Tag bei zwei zufriedenen Erwachsenen mit Hütte */
const BIRTH_RATE = 0.12;
/** Trauer nach einem Todesfall in Sekunden */
const GRIEF_TIME = 2 * DAY;
/** Unter dieser Gesundheit ist ein Otter krank, ab WELL_AT wieder gesund */
export const SICK_AT = 0.4;
const WELL_AT = 0.65;
/** Gesundheitsverlust je Schluck bei voller Verschmutzung */
const DIRT_HARM = 0.5;
/** Erholung je Tag, mit Heiler deutlich schneller */
const HEALTH_REGEN = 0.08;
const HEAL_REGEN = 0.6;
/** Dauer einer Runde im Laufrad, einer Behandlung oder Lehrstunde in Sekunden */
const SHIFT_TIME = 12;
/** Schicht in der Schenke in Sekunden, verbraucht eine Beere */
const SERVE_TIME = 20;
/** Fischen: Dauer je Fang, Fische je Fang, nötige Wassertiefe */
const FISH_TIME = 6;
const FISH_PER_CATCH = 2;
export const FISH_DEPTH = 0.35;
/** Fischteich: Dauer je Runde, Fische je Runde, Wasser aus dem Speicher je Runde */
const POND_TIME = 15;
const POND_FISH = 2;
const POND_WATER = 1;
const HARVEST_TIME = 6;
/** Steinbruch: Zeit je Brocken und Stein je Gang */
const MINE_TIME = 5;
const STONE_PER_TRIP = 2;
/** Hänge ab so vielen Stufen über dem Steinbruch geben Stein */
const ROCK_STEP = 2;
/** Kiesbecken: so viel Verschmutzung nimmt eine Schicht aus dem Speicher */
const KIES_CLEAN = 0.1;
/** Werkzeugverbrauch je Arbeiter und Tag; mit Werkzeug für alle arbeitet der Clan schneller */
const TOOLS_PER_WORKER = 0.25;
export const TOOL_PACE = 1.25;
/** Ein Junges mit Schule altert so viel schneller */
const SCHOOL_GROWTH = 0.5;
/** Reihenfolge bei der Arbeitsvergabe: Wasser und Nahrung vor allem anderen */
const JOB_PRIORITY: Partial<Record<BuildingId, number>> = {
  pumpe: 0,
  sammler: 1,
  fischer: 1,
  feld: 1,
  fischteich: 1,
  baeckerei: 2,
  holzfaeller: 2,
  heiler: 2,
  saegewerk: 2,
};
const DEFAULT_PRIORITY = 3;

function jobPriority(id: BuildingId): number {
  return JOB_PRIORITY[id] ?? DEFAULT_PRIORITY;
}

const DX = [-1, 1, 0, 0];
const DY = [0, 0, -1, 1];

export class Citizens {
  readonly list: Citizen[] = [];
  births = 0;
  deaths = 0;
  /** verbleibende Trauerzeit in Sekunden */
  grief = 0;
  /** Werkzeug für alle Arbeiter da (täglich neu bestimmt) */
  toolBonus = false;
  /** Zellen, zu denen zuletzt kein Weg gefunden wurde, mit Ablaufzeit */
  private readonly unreachable = new Map<number, number>();
  private now = 0;
  private nameIdx = 0;
  private assignTimer = 0;
  private dayTimer = 0;
  private birthProgress = 0;
  private noWaterWarned = false;
  private waterWarnAt = -Infinity;
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
      health: 1,
      sick: false,
    };
    this.list.push(c);
    return c;
  }

  sick(): number {
    let n = 0;
    for (const c of this.list) if (c.alive && c.sick) n++;
    return n;
  }

  /** Arbeitet gerade jemand mit dieser Aufgabe an dem Gebäude? */
  workingAt(buildingId: number, kind: ShiftKind): boolean {
    return this.shiftAt(buildingId, kind) > 0;
  }

  /** Stärke der laufenden Schicht: 0 niemand, 1 Arbeit, 2 Behandlung mit Kräutern */
  shiftAt(buildingId: number, kind: ShiftKind): number {
    let best = 0;
    for (const c of this.list) {
      if (!c.alive || c.state !== 'work' || !c.task || c.task.kind !== kind || c.task.building !== buildingId) continue;
      const v = kind === 'heal' && c.task.amount > 0 ? 2 : 1;
      if (v > best) best = v;
    }
    return best;
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
    // Molche brauchen feuchte Haut: in der Dürre trinken sie doppelt so viel
    const thirst = this.env.weather === 'duerre' ? this.env.species.droughtThirst : 1;
    for (const c of this.list) {
      if (!c.alive) continue;
      c.water -= (dt * thirst) / (WATER_DAYS * DAY);
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
        case 'ride':
          this.ride(c);
          break;
      }
    }
  }

  // --- Stimmung, Alter, Geburten ------------------------------------------------

  private updateMood(dt: number): void {
    const env = this.env;
    // Abwechslung auf dem Speiseplan macht zufrieden
    const variety = 0.05 * Math.max(0, env.buildings.foodKinds() - 1);
    for (const c of this.alive()) {
      let t = 0.55 + variety;
      const home = env.buildings.get(c.home);
      if (home) {
        t += 0.15;
        if (home.flooded) t -= 0.15;
        // Molche wollen Wasser am Haus, im Trockenen leiden sie
        const sp = env.species;
        if (sp.wetHomeMood || sp.dryHomeMood) t += env.buildings.maxDepthOn(home, env.depth) > 0.1 ? sp.wetHomeMood : sp.dryHomeMood;
      } else {
        t -= 0.25;
      }
      if (c.water < DRINK_AT || c.food < EAT_AT) t -= 0.2;
      else if (c.water > 0.6 && c.food > 0.6) t += 0.1;
      const at = home ? env.buildings.center(home) : c;
      t += 0.08 * Math.min(3, env.joyAt(at.x, at.y));
      if (this.grief > 0) t -= 0.15;
      if (c.sick) t -= 0.2;
      t = Math.max(0, Math.min(1, t));
      c.mood += (t - c.mood) * Math.min(1, dt / MOOD_TIME);
      // Gesundheit erholt sich langsam, mit Heiler schnell
      if (c.health < 1) {
        const heal = env.healAt(c.x, c.y);
        const regen = (heal > 0 ? HEAL_REGEN * heal : HEALTH_REGEN) * (dt / DAY);
        c.health = Math.min(1, c.health + regen);
      }
      if (!c.sick && c.health < SICK_AT) {
        c.sick = true;
        env.log(`${c.name} ist krank geworden. Sauberes Wasser und eine Heilerhütte helfen.`);
      } else if (c.sick && c.health >= WELL_AT) {
        c.sick = false;
        env.log(`${c.name} ist wieder gesund.`);
      }
    }
  }

  /** Schmutziges Wasser getrunken */
  private harm(c: Citizen, pollution: number): void {
    c.health = Math.max(0, c.health - pollution * DIRT_HARM * this.env.species.dirtHarm);
    if (c.health <= 0) this.die(c, 'an der Schlammkrankheit gestorben');
  }

  private daily(): void {
    const school = this.env.hasSchool();
    let workers = 0;
    for (const c of this.list) {
      if (!c.alive) continue;
      c.age += c.child && school ? 1 + SCHOOL_GROWTH : 1;
      c.lifespan += (c.mood - 0.5) * 0.3;
      if (c.child && c.age >= CHILD_DAYS) c.child = false;
      if (c.age >= c.lifespan) this.die(c, 'in hohem Alter gestorben');
      else if (!c.child && c.workplace >= 0) workers++;
    }
    // Werkzeug nutzt sich ab; reicht es für alle, arbeitet der Clan schneller
    const need = workers * TOOLS_PER_WORKER;
    const got = need > 0 ? this.env.buildings.takeGood('werkzeug', need, 0, 0) : 0;
    this.toolBonus = need > 0 && got >= need - 1e-6;
    this.tryBirth();
  }

  private tryBirth(): void {
    const env = this.env;
    const b = env.buildings;
    const housing = b.housing();
    if (this.count() >= housing) return;
    if (b.foodTotal() < 2) return;
    let adults = 0;
    let moodSum = 0;
    for (const c of this.alive()) {
      if (c.child || c.home < 0) continue;
      adults++;
      moodSum += c.mood;
    }
    if (adults < 2) return;
    const factor = Math.max(0, Math.min(1, (moodSum / adults - 0.45) / 0.4));
    // ein Laichplatz im Wasser bringt den Molchen mehr Nachwuchs
    const spawn = [...b.alive()].some((h) => h.built && h.def === 'laichplatz') ? 1.3 : 1;
    this.birthProgress += BIRTH_RATE * spawn * (adults / 2) * factor;
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
    // vor der Hütte, auf einer Zelle, von der man auch wegkommt
    const ring = b.ring(hut).filter((i) => this.canLeave(i));
    const cell = ring.length ? ring[Math.floor(env.rnd() * ring.length)] : this.freeCellNear(b.cells(hut));
    if (cell < 0) return false;
    const c = this.spawn(cell % env.w, (cell / env.w) | 0, { child: true });
    c.home = hut.id;
    hut.residents.push(c.id);
    this.births++;
    env.log(`${env.species.young}: ${c.name}.`);
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

  /**
   * Bewohner, die auf diesen Zellen stehen und dort nicht mehr wegkommen
   * (neues Gebäude, Damm), auf die nächste freie Zelle daneben setzen.
   */
  evict(cells: number[]): void {
    const env = this.env;
    const inside = new Set(cells);
    for (const c of this.list) {
      if (!c.alive || c.state === 'ride' || !inside.has(this.cell(c)) || this.canLeave(this.cell(c))) continue;
      const spot = this.freeCellNear(cells);
      if (spot < 0) continue;
      this.fail(c);
      c.cooldown = 0.5;
      c.x = (spot % env.w) + 0.5;
      c.y = Math.floor(spot / env.w) + 0.5;
    }
  }

  /** Kann man von dieser Zelle auf eine begehbare Nachbarzelle treten? */
  private canLeave(i: number): boolean {
    const env = this.env;
    if (!env.walkable(i)) return false;
    const x = i % env.w;
    const y = (i / env.w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= env.w || ny >= env.h) continue;
      const n = ny * env.w + nx;
      if (env.walkable(n) && env.canStep(i, n)) return true;
    }
    return false;
  }

  /** Nächste freie Zelle um die gegebenen Zellen, trockene bevorzugt (-1 wenn keine) */
  private freeCellNear(cells: number[]): number {
    const env = this.env;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const i of cells) {
      const x = i % env.w;
      const y = (i / env.w) | 0;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    for (let r = 1; r <= 8; r++) {
      let wet = -1;
      for (let y = y0 - r; y <= y1 + r; y++) {
        for (let x = x0 - r; x <= x1 + r; x++) {
          if (x < 0 || y < 0 || x >= env.w || y >= env.h) continue;
          if (x > x0 - r && x < x1 + r && y > y0 - r && y < y1 + r) continue;
          const i = y * env.w + x;
          if (!this.canLeave(i)) continue;
          if (env.depth[i] <= 0.25) return i;
          if (wet < 0) wet = i;
        }
      }
      if (wet >= 0) return wet;
    }
    return -1;
  }

  /** Reservierungen einer Aufgabe freigeben */
  private release(c: Citizen): void {
    const t = c.task;
    if (!t) return;
    if (t.target >= 0) this.env.reserved.delete(t.target);
    if (t.kind === 'haul' && t.good) {
      const site = this.env.buildings.get(t.building);
      if (site && t.phase < 2) site.reserved[t.good] = Math.max(0, site.reserved[t.good] - t.amount);
    }
    c.task = null;
    c.path = null;
  }

  /** Freie Erwachsene an Arbeitsplätze verteilen, Wasser und Nahrung zuerst */
  private assignWork(): void {
    const env = this.env;
    const free: Citizen[] = [];
    for (const c of this.alive()) if (c.workplace < 0 && !c.child) free.push(c);
    const jobs = [...env.buildings.alive()].filter((b) => b.built && BUILDINGS[b.def].workers > 0);
    jobs.sort((a, z) => jobPriority(a.def) - jobPriority(z.def) || a.id - z.id);
    for (const b of jobs) {
      if (free.length === 0) break;
      const def = BUILDINGS[b.def];
      while (b.workers.length < def.workers && free.length > 0) {
        const ctr = env.buildings.center(b);
        free.sort((a, z) => Math.abs(z.x - ctr.x) + Math.abs(z.y - ctr.y) - (Math.abs(a.x - ctr.x) + Math.abs(a.y - ctr.y)));
        const c = free.pop()!;
        c.workplace = b.id;
        b.workers.push(c.id);
      }
    }
    // Niemand frei, aber ein wichtiges Gebäude steht leer: einen Arbeiter aus
    // einem unwichtigeren holen (höchstens einen je Sekunde)
    if (free.length > 0) return;
    for (const b of jobs) {
      if (b.workers.length > 0) continue;
      const prio = jobPriority(b.def);
      const donor = jobs.find((o) => o.workers.length > 0 && jobPriority(o.def) > prio);
      if (!donor) continue;
      const id = donor.workers.pop()!;
      const c = this.list[id];
      c.workplace = b.id;
      b.workers.push(id);
      return;
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
        const src = b.nearest(DRINK_SPOTS, c.x, c.y);
        if (src && this.startTask(c, task('drink', src.id, { amount: 1 }), b.ring(src))) return;
      }
      // Otter trinken auch direkt aus dem Fluss, solange er Wasser führt: vom Ufer aus
      if (this.goToShore(c, task('drink', -1), { x: c.x, y: c.y }, RIVER_RANGE, (i) => env.depth[i] > 0.1 && env.buildings.occ[i] < 0, false)) return;
      if (!this.noWaterWarned && this.now - this.waterWarnAt > DAY / 2) {
        this.noWaterWarned = true;
        this.waterWarnAt = this.now;
        env.log('Kein Trinkwasser: Speicher leer und kein Fluss in der Nähe.');
      }
    } else if (env.store.stored >= 1) {
      this.noWaterWarned = false;
    }
    if (c.food < EAT_AT) {
      const l = b.storageWithFood(c.x, c.y);
      if (l && this.startTask(c, task('eat', l.id, { amount: 1 }), b.ring(l))) return;
      if (!l && !this.noFoodWarned) {
        this.noFoodWarned = true;
        env.log('Die Nahrung ist aufgebraucht. Sammler, Fischer und Felder schaffen Nachschub.');
      }
    } else if (b.foodTotal() > 0) {
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
    // 2. Baustellen gehen vor, aber nur ein paar Otter gleichzeitig, damit
    //    Pumpe und Sammler weiterlaufen
    if (this.construction(c)) return;
    // 3. Arbeitsplatz
    const wp = b.get(c.workplace);
    if (wp && wp.built) {
      if (this.workAt(c, wp)) return;
    } else if (c.workplace >= 0) {
      c.workplace = -1;
    }
    // 4. Herumstreunen
    this.wander(c);
  }

  private workAt(c: Citizen, wp: Building): boolean {
    const env = this.env;
    const b = env.buildings;
    const def = BUILDINGS[wp.def];
    const ctr = b.center(wp);
    // Verarbeitung: Zutat im Lager holen, am Arbeitsplatz verarbeiten, Erzeugnis zurückbringen
    if (def.recipe) {
      const r = def.recipe;
      const lager = b.storageWith(r.input, r.inAmount, c.x, c.y);
      if (!lager || !b.storageSpace(r.output, r.outAmount, ctr.x, ctr.y)) {
        c.cooldown = 5;
        return true;
      }
      return this.startTask(c, task('craft', wp.id, { other: lager.id, good: r.input, amount: r.inAmount }), b.ring(lager));
    }
    // Ernte: Feld oder Kräutergarten, wenn reif
    if (def.harvest) {
      if (wp.growth < 1) {
        c.cooldown = 6;
        return true;
      }
      return this.startTask(c, task('harvest', wp.id), b.ring(wp));
    }
    if (def.knowledge > 0) return this.startTask(c, task('study', wp.id), b.ring(wp));
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
        return this.startTask(c, task('pump', wp.id), b.ring(wp));
      }
      case 'sammler': {
        const t = this.findInRange(ctr, def.range, (i) => env.veg.bushes[i] === 2);
        if (t < 0) {
          c.cooldown = 5;
          return true;
        }
        return this.startTask(c, task('gather', wp.id, { target: t }), [t]);
      }
      case 'holzfaeller': {
        const t = this.findInRange(ctr, def.range, (i) => env.veg.trees[i] >= TREE_GROWN);
        if (t < 0) {
          c.cooldown = 5;
          return true;
        }
        return this.startTask(c, task('chop', wp.id, { target: t }), [t]);
      }
      case 'flossanleger': {
        const raft = env.rafts.raftOf(wp.id);
        if (!raft || !env.rafts.hasJob(raft)) {
          c.cooldown = 5;
          return true;
        }
        return this.startTask(c, task('ferry', wp.id), b.ring(wp).filter((i) => env.walkable(i)));
      }
      case 'fischer': {
        if (this.goToShore(c, task('fish', wp.id), ctr, def.range, (i) => env.depth[i] >= FISH_DEPTH && env.pollution[i] < 0.3 && env.buildings.occ[i] < 0 && env.struct[i] === 0, true)) return true;
        c.cooldown = 6;
        return true;
      }
      case 'steinbruch': {
        // Stein kommt aus Hängen im Umkreis, die deutlich höher liegen; gebrochen wird vom Fuß des Hangs aus
        const base = env.ground[wp.y * env.w + wp.x];
        if (this.goToShore(c, task('mine', wp.id), ctr, def.range, (i) => env.ground[i] >= base + ROCK_STEP && env.depth[i] < 0.1 && env.buildings.occ[i] < 0 && env.struct[i] === 0, true)) return true;
        c.cooldown = 6;
        return true;
      }
      case 'kiesbecken': {
        // ohne Wasser oder Schmutz im Speicher gibt es nichts zu reinigen
        if (env.store.stored < 1 || env.store.pollution < 0.02) {
          c.cooldown = 6;
          return true;
        }
        return this.startTask(c, task('filter', wp.id), b.ring(wp));
      }
      case 'fischteich': {
        if (env.store.stored < POND_WATER || !b.storageSpace('fisch', POND_FISH, ctr.x, ctr.y)) {
          c.cooldown = 6;
          return true;
        }
        return this.startTask(c, task('tend', wp.id), b.ring(wp));
      }
      case 'laufrad': {
        if (!env.needsTread()) {
          c.cooldown = 4;
          return true;
        }
        return this.startTask(c, task('tread', wp.id), b.ring(wp));
      }
      case 'heiler': {
        let sickNear = false;
        for (const o of this.alive()) {
          if (o.sick && Math.hypot(o.x - ctr.x, o.y - ctr.y) <= def.range) {
            sickNear = true;
            break;
          }
        }
        if (!sickNear) {
          c.cooldown = 6;
          return true;
        }
        // Kräuter aus dem Lager verdoppeln die Wirkung einer Behandlung
        const herbs = b.takeGood('kraeuter', 1, ctr.x, ctr.y);
        return this.startTask(c, task('heal', wp.id, { amount: herbs }), b.ring(wp));
      }
      case 'beerenschenke': {
        if (b.takeGood('beeren', 1, ctr.x, ctr.y) < 1) {
          c.cooldown = 6;
          return true;
        }
        return this.startTask(c, task('serve', wp.id), b.ring(wp));
      }
      case 'foerster':
      case 'beerengaertner': {
        const bush = wp.def === 'beerengaertner';
        const t = this.findInRange(ctr, def.range, (i) =>
          env.veg.trees[i] === 0 && env.veg.bushes[i] === 0 && env.buildings.occ[i] < 0 && env.struct[i] === 0 &&
          env.depth[i] < 0.1 && env.veg.moist[i] > 0 && env.ground[i] >= 2 && env.ground[i] <= 11 && (bush || this.hasNeighborSpace(i)));
        if (t < 0) {
          c.cooldown = 6;
          return true;
        }
        return this.startTask(c, task(bush ? 'plantbush' : 'plant', wp.id, { target: t }), [t]);
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

  /**
   * Uferzellen im Umkreis, die begehbar sind und eine Wasserzelle als Nachbarn
   * haben, auf die `wet` zutrifft, die nächsten zuerst (höchstens `max`).
   * So kommen Otter auch an steile Ufer heran.
   */
  private findShores(ctr: { x: number; y: number }, range: number, wet: (i: number) => boolean, max: number): number[] {
    const env = this.env;
    const x0 = Math.max(0, Math.floor(ctr.x - range));
    const x1 = Math.min(env.w - 1, Math.floor(ctr.x + range));
    const y0 = Math.max(0, Math.floor(ctr.y - range));
    const y1 = Math.min(env.h - 1, Math.floor(ctr.y + range));
    const found: { i: number; d: number }[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - ctr.x, y + 0.5 - ctr.y);
        if (d > range) continue;
        const i = y * env.w + x;
        if (!env.walkable(i) || env.depth[i] > 0.25 || env.reserved.has(i) || this.isUnreachable(i)) continue;
        if (this.wetNeighbour(i, wet) >= 0) found.push({ i, d });
      }
    }
    found.sort((a, z) => a.d - z.d);
    return found.slice(0, max).map((f) => f.i);
  }

  /** Wasserzelle neben einer Zelle, auf die `wet` zutrifft (-1 wenn keine) */
  private wetNeighbour(i: number, wet: (i: number) => boolean): number {
    const env = this.env;
    const x = i % env.w;
    const y = (i / env.w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= env.w || ny >= env.h) continue;
      const j = ny * env.w + nx;
      if (wet(j)) return j;
    }
    return -1;
  }

  /**
   * Weg ans Ufer beginnen: Der Wegsucher nimmt die nächste erreichbare
   * Uferzelle; die Wasserzelle daneben landet in `other`, die Standzelle
   * in `target` (und wird bei `reserve` für andere gesperrt).
   */
  private goToShore(c: Citizen, t: Task, ctr: { x: number; y: number }, range: number, wet: (i: number) => boolean, reserve: boolean): boolean {
    const stands = this.findShores(ctr, range, wet, 24);
    if (stands.length === 0 || !this.startTask(c, t, stands)) return false;
    const stand = c.path && c.path.length > 0 ? c.path[c.path.length - 1] : this.cell(c);
    t.target = stand;
    t.other = this.wetNeighbour(stand, wet);
    if (reserve) this.env.reserved.add(stand);
    return true;
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
    let haulers = 0;
    let builders = 0;
    for (const o of this.alive()) {
      if (!o.task) continue;
      if (o.task.kind === 'haul') haulers++;
      else if (o.task.kind === 'build') builders++;
    }
    // Holz liefern: Holzfäller zuerst (sonst geht das Holz aus), dann
    // angefangene Baustellen fertig beliefern, dann in Reihenfolge der
    // Platzierung. So verteilt sich knappes Holz nicht auf viele Baustellen.
    const sites: { s: Building; key: number }[] = [];
    for (const s of b.alive()) {
      if (haulers >= MAX_HAULERS) break;
      if (s.built || b.missing(s).length === 0) continue;
      // eingebaute oder gerade unerreichbare Baustellen überspringen
      if (this.isUnreachable(s.y * env.w + s.x) || !b.ring(s).some((i) => env.walkable(i))) continue;
      const started = b.deliveredShare(s) > 0 || b.missing(s).length < Object.keys(BUILDINGS[s.def].cost).length ? 0 : 1;
      const key = (s.def === 'holzfaeller' ? 0 : 1) * 1e6 + started * 1e5 + s.id;
      sites.push({ s, key });
    }
    sites.sort((a, b2) => a.key - b2.key);
    for (const { s: site } of sites) {
      for (const good of b.missing(site)) {
        const need = b.needed(site, good);
        const lager = b.storageWith(good, 1, c.x, c.y);
        if (!lager) continue;
        const amount = Math.min(need, HAUL_MAX, lager.stock[good]);
        if (this.startTask(c, task('haul', site.id, { amount, other: lager.id, good }), b.ring(lager))) {
          site.reserved[good] += amount;
          return true;
        }
      }
    }
    // Bauen
    if (builders >= MAX_BUILDERS_TOTAL) return false;
    for (const s of b.alive()) {
      if (s.built || !b.fullyDelivered(s)) continue;
      if (this.isUnreachable(s.y * env.w + s.x)) continue;
      let here = 0;
      for (const o of this.alive()) if (o.task && o.task.kind === 'build' && o.task.building === s.id) here++;
      if (here >= MAX_BUILDERS) continue;
      if (this.startTask(c, task('build', s.id), b.ring(s))) return true;
      this.unreachable.set(s.y * env.w + s.x, this.now + 60);
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
    this.startTask(c, task('wander', -1), [t]);
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
    let budget = (swimming ? env.species.swimSpeed : env.species.walkSpeed) * slow * dt;
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

  /** Der Flößer fährt auf dem Floß mit, bis es wieder am Heimatanleger liegt */
  private ride(c: Citizen): void {
    const env = this.env;
    const t = c.task;
    const raft = t ? env.rafts.raftOf(t.building) : null;
    if (raft && raft.crew === c.id) {
      c.x = raft.x;
      c.y = raft.y;
      c.heading = raft.heading;
      return;
    }
    // Fahrt zu Ende: an Land gehen; Floß weg oder festgefahren: ins Wasser
    const dock = t ? env.buildings.get(t.building) : null;
    if (raft && raft.state === 'wartet' && dock) {
      const spot = this.freeCellNear(env.buildings.cells(dock));
      if (spot >= 0) {
        c.x = (spot % env.w) + 0.5;
        c.y = Math.floor(spot / env.w) + 0.5;
      }
    }
    this.finish(c, 1);
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
      case 'plantbush':
        c.state = 'work';
        t.timer = PLANT_TIME;
        break;
      case 'haul':
        c.state = 'work';
        t.timer = 0.8;
        break;
      case 'deliver':
        c.state = 'work';
        t.timer = 0.5;
        break;
      case 'build':
        c.state = 'work';
        break;
      case 'tread':
      case 'heal':
      case 'study':
      case 'filter':
        c.state = 'work';
        t.timer = SHIFT_TIME;
        break;
      case 'mine':
        c.state = 'work';
        t.timer = MINE_TIME;
        break;
      case 'serve':
        c.state = 'work';
        t.timer = SERVE_TIME;
        break;
      case 'craft': {
        c.state = 'work';
        // am Lager kurz, am Arbeitsplatz die Arbeitszeit des Rezepts
        const wp = this.env.buildings.get(t.building);
        const r = wp ? BUILDINGS[wp.def].recipe : null;
        t.timer = t.phase === 0 || !r || !wp ? 0.8 : r.time / this.env.craftSpeed(wp);
        break;
      }
      case 'fish':
        c.state = 'work';
        t.timer = FISH_TIME;
        break;
      case 'ferry': {
        const raft = this.env.rafts.raftOf(t.building);
        if (!raft || !this.env.rafts.board(raft, c.id)) {
          this.fail(c);
          return;
        }
        c.state = 'ride';
        c.x = raft.x;
        c.y = raft.y;
        break;
      }
      case 'tend':
        c.state = 'work';
        t.timer = POND_TIME;
        break;
      case 'harvest':
        c.state = 'work';
        t.timer = HARVEST_TIME;
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
    // Zufriedene Otter arbeiten schneller, kranke langsam, mit Werkzeug alle flotter
    const pace = (0.7 + 0.5 * c.mood) * (c.sick ? 0.5 : 1) * (this.toolBonus ? TOOL_PACE : 1);
    t.timer -= dt * pace;
    switch (t.kind) {
      case 'drink': {
        if (t.timer > 0) return;
        let dirt = -1;
        if (t.building < 0) {
          // aus dem Fluss
          if (env.depth[t.other] > 0.02) {
            c.water = 1;
            dirt = env.pollution[t.other];
          }
        } else if (env.store.stored >= 1) {
          env.store.stored -= 1;
          c.water = 1;
          dirt = env.store.pollution;
        }
        this.finish(c, 0.5);
        if (dirt > 0.05) this.harm(c, dirt);
        return;
      }
      case 'eat': {
        if (t.timer > 0) return;
        const l = b.get(t.building);
        const food = l ? b.bestFood(l) : null;
        if (l && food) {
          l.stock[food] -= 1;
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
          const dirt = env.pollution[i];
          env.depth[i] -= take;
          env.addWater(take, dirt);
          want -= take;
          if (want <= 0) break;
        }
        return;
      }
      case 'tread':
      case 'heal':
      case 'serve':
      case 'study':
      case 'filter': {
        if (c.water < DRINK_AT || c.food < EAT_AT) {
          this.finish(c, 0);
          return;
        }
        if (t.timer > 0) return;
        if (t.kind === 'filter') env.store.pollution = Math.max(0, env.store.pollution - KIES_CLEAN);
        if (t.kind === 'study') {
          const wp = b.get(t.building);
          if (wp) env.addKnowledge(BUILDINGS[wp.def].knowledge);
        }
        this.finish(c, 0.5);
        return;
      }
      case 'fish': {
        if (t.timer > 0) return;
        env.reserved.delete(t.target);
        const ok = env.depth[t.other] >= FISH_DEPTH * 0.5;
        t.target = -1;
        if (!ok) {
          this.fail(c);
          return;
        }
        c.carry = 'fisch';
        c.carryAmount = FISH_PER_CATCH;
        if (!this.deliverCarried(c)) this.finish(c, 3);
        return;
      }
      case 'mine': {
        if (t.timer > 0) return;
        env.reserved.delete(t.target);
        t.target = -1;
        c.carry = 'stein';
        c.carryAmount = STONE_PER_TRIP;
        if (!this.deliverCarried(c)) this.finish(c, 3);
        return;
      }
      case 'tend': {
        if (t.timer > 0) return;
        if (env.store.stored < POND_WATER) {
          this.finish(c, 3);
          return;
        }
        env.store.stored -= POND_WATER;
        c.carry = 'fisch';
        c.carryAmount = POND_FISH;
        if (!this.deliverCarried(c)) this.finish(c, 3);
        return;
      }
      case 'harvest': {
        if (t.timer > 0) return;
        const wp = b.get(t.building);
        const h = wp ? BUILDINGS[wp.def].harvest : null;
        if (!wp || !h || wp.growth < 1) {
          this.finish(c, 2);
          return;
        }
        wp.growth = 0;
        b.version++;
        c.carry = h.good;
        c.carryAmount = h.amount;
        if (!this.deliverCarried(c)) this.finish(c, 3);
        return;
      }
      case 'craft': {
        if (t.timer > 0) return;
        const wp = b.get(t.building);
        const r = wp && wp.built ? BUILDINGS[wp.def].recipe : null;
        if (!wp || !r || !t.good) {
          this.fail(c);
          return;
        }
        if (t.phase === 0) {
          // am Lager: Zutat nehmen und zum Arbeitsplatz gehen
          const lager = b.get(t.other);
          if (!lager || lager.stock[t.good] < t.amount) {
            this.fail(c);
            return;
          }
          lager.stock[t.good] -= t.amount;
          c.carry = t.good;
          c.carryAmount = t.amount;
          t.phase = 1;
          const p = env.path.find(this.cell(c), b.ring(wp).filter((i) => env.walkable(i)));
          if (!p) {
            this.deliverCarried(c) || this.finish(c, 3);
            return;
          }
          c.path = p;
          c.pathIdx = 0;
          c.state = p.length === 0 ? 'work' : 'walk';
          if (p.length === 0) this.arrive(c);
          return;
        }
        // am Arbeitsplatz fertig: Erzeugnis ins Lager bringen
        c.carry = r.output;
        c.carryAmount = r.outAmount;
        if (!this.deliverCarried(c)) this.finish(c, 3);
        return;
      }
      case 'deliver': {
        if (t.timer > 0) return;
        this.dropCarried(c, t.building);
        this.finish(c, 0.5);
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
      case 'plant':
      case 'plantbush': {
        if (t.timer > 0) return;
        if (t.kind === 'plant') env.veg.plantTree(t.target);
        else env.veg.plantBush(t.target);
        env.reserved.delete(t.target);
        t.target = -1;
        this.finish(c, 1);
        return;
      }
      case 'haul': {
        if (t.timer > 0) return;
        const site = b.get(t.building);
        const good = t.good!;
        if (t.phase === 0) {
          // am Lager: Baustoff nehmen
          const lager = b.get(t.other);
          const got = lager ? Math.min(t.amount, lager.stock[good]) : 0;
          if (!site || site.built || got <= 0) {
            if (site) site.reserved[good] = Math.max(0, site.reserved[good] - t.amount);
            this.fail(c);
            return;
          }
          lager!.stock[good] -= got;
          site.reserved[good] = Math.max(0, site.reserved[good] - (t.amount - got));
          t.amount = got;
          c.carry = good;
          c.carryAmount = got;
          t.phase = 1;
          c.task = t;
          const p = env.path.find(this.cell(c), b.ring(site).filter((i) => env.walkable(i)));
          if (!p) {
            site.reserved[good] = Math.max(0, site.reserved[good] - got);
            // Baustelle eine Weile meiden und die Ware zurücklegen
            this.unreachable.set(site.y * env.w + site.x, this.now + 60);
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
          site.delivered[good] += c.carryAmount;
          site.reserved[good] = Math.max(0, site.reserved[good] - t.amount);
          b.version++;
          c.carry = null;
          c.carryAmount = 0;
          t.phase = 2;
          this.finish(c, 0.3);
          return;
        }
        // Baustelle weg: Ware zurück ins Lager
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
    c.task = task('deliver', l.id, { phase: 1 });
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
    if (l && def && b.isStore(l)) {
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
        health: c.health,
        sick: c.sick,
      })),
      nameIdx: this.nameIdx,
      births: this.births,
      deaths: this.deaths,
      grief: this.grief,
      birthProgress: this.birthProgress,
      now: this.now,
      dayTimer: this.dayTimer,
      toolBonus: this.toolBonus,
    };
  }

  restore(s: CitizensSave): void {
    this.list.length = 0;
    for (const c of s.list) {
      const health = c.health ?? 1;
      this.list.push({
        ...c,
        health,
        sick: c.sick ?? health < SICK_AT,
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
    this.toolBonus = s.toolBonus ?? false;
    this.unreachable.clear();
    this.assignTimer = 0;
  }
}
