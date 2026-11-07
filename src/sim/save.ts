import { freeScenario, scenarioById } from '../data/maps';
import type { TechId } from '../data/tech';
import type { SavedBuilding } from './buildings';
import type { CitizensSave } from './citizens';
import type { RaftsSave } from './rafts';
import type { SeasonsSave } from './seasons';
import type { Source } from './water';
import { World, type Outcome, type Weather } from './world';

export const SAVE_VERSION = 4;

/** Kompletter Spielstand, Raster als Base64 */
export interface SaveGame {
  v: number;
  scenario: string;
  seed: number;
  w: number;
  h: number;
  time: number;
  weather: Weather;
  autoSeasons: boolean;
  freeBuild: boolean;
  store: number;
  /** Verschmutzung des Speichers (ab Version 2) */
  storePollution?: number;
  /** Wissen und erforschte Technologien (ab Version 3) */
  knowledge?: number;
  techs?: TechId[];
  outcome: Outcome;
  lostToFlood: number;
  /** Stausee-Ziel: Sekunden, die der See schon gehalten wird (ab Version 4) */
  goalHeld?: number;
  ground: string;
  struct: string;
  gate: string;
  gateOpen: string;
  sink: string;
  sources: Source[];
  depth: string;
  /** Verschmutzung je Zelle (ab Version 2) */
  pollution?: string;
  veg: { trees: string; bushes: string; dry: string; growth: string; stress: string; drown: string; poison?: string };
  buildings: SavedBuilding[];
  citizens: CitizensSave;
  /** Flöße (ab Version 4) */
  rafts?: RaftsSave;
  seasons: SeasonsSave;
  rng: number;
}

/** Kurzinfo zu einem Spielstand für Listen */
export interface SaveMeta {
  name: string;
  scenario: string;
  scenarioName: string;
  day: number;
  year: number;
  population: number;
  /** Unix-Zeit in ms */
  savedAt: number;
}

export function encodeBytes(u8: Uint8Array): string {
  let s = '';
  const chunk = 0x2000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + chunk)));
  }
  return btoa(s);
}

export function decodeBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeFloats(f: Float32Array): string {
  return encodeBytes(new Uint8Array(f.buffer, f.byteOffset, f.byteLength));
}

export function decodeFloats(s: string): Float32Array {
  const u = decodeBytes(s);
  return new Float32Array(u.buffer, 0, u.byteLength >> 2);
}

export function serializeWorld(world: World, name = ''): { data: SaveGame; meta: SaveMeta } {
  const season = world.seasons.info();
  const data: SaveGame = {
    v: SAVE_VERSION,
    scenario: world.scenario.id,
    seed: world.seed,
    w: world.w,
    h: world.h,
    time: world.time,
    weather: world.weather,
    autoSeasons: world.autoSeasons,
    freeBuild: world.freeBuild,
    store: world.store.stored,
    storePollution: world.store.pollution,
    knowledge: world.knowledge,
    techs: [...world.techs],
    outcome: world.outcome,
    lostToFlood: world.lostToFlood,
    goalHeld: world.goalHeld,
    ground: encodeBytes(world.ground),
    struct: encodeBytes(world.struct),
    gate: encodeBytes(world.gate),
    gateOpen: encodeBytes(world.gateOpen),
    sink: encodeBytes(world.water.sink),
    sources: world.water.sources.map((s) => ({ ...s })),
    depth: encodeFloats(world.water.depth),
    pollution: encodeFloats(world.water.pollution),
    veg: {
      trees: encodeBytes(world.veg.trees),
      bushes: encodeBytes(world.veg.bushes),
      dry: encodeBytes(world.veg.dry),
      growth: encodeFloats(world.veg.growth),
      stress: encodeFloats(world.veg.stress),
      drown: encodeFloats(world.veg.drown),
      poison: encodeFloats(world.veg.poison),
    },
    buildings: world.buildings.list.map((b) => ({
      ...b,
      workers: [...b.workers],
      residents: [...b.residents],
      stock: { ...b.stock },
      delivered: { ...b.delivered },
      reserved: { ...b.reserved },
    })),
    citizens: world.citizens.save(),
    rafts: world.rafts.save(),
    seasons: world.seasons.save(),
    rng: world.rnd.state,
  };
  const meta: SaveMeta = {
    name,
    scenario: world.scenario.id,
    scenarioName: world.scenario.name,
    day: season.day,
    year: season.year,
    population: world.citizens.count(),
    savedAt: Date.now(),
  };
  return { data, meta };
}

export function restoreWorld(s: SaveGame): World {
  if (!(s.v >= 1 && s.v <= SAVE_VERSION)) throw new Error(`Spielstand-Version ${s.v} wird nicht unterstützt`);
  const n = s.w * s.h;
  const sink = decodeBytes(s.sink);
  const sinks: number[] = [];
  for (let i = 0; i < n; i++) if (sink[i]) sinks.push(i);
  const scenario = s.scenario === 'frei' ? freeScenario(s.seed, s.w, s.h) : scenarioById(s.scenario, s.seed);
  const world = new World({ w: s.w, h: s.h, ground: decodeBytes(s.ground), sources: s.sources.map((x) => ({ ...x })), sinks }, s.seed, scenario);
  world.struct.set(decodeBytes(s.struct));
  world.gate.set(decodeBytes(s.gate));
  world.gateOpen.set(decodeBytes(s.gateOpen));
  world.syncTerrain();
  world.water.depth.set(decodeFloats(s.depth));
  if (s.pollution) world.water.pollution.set(decodeFloats(s.pollution));
  world.veg.trees.set(decodeBytes(s.veg.trees));
  world.veg.bushes.set(decodeBytes(s.veg.bushes));
  world.veg.dry.set(decodeBytes(s.veg.dry));
  world.veg.growth.set(decodeFloats(s.veg.growth));
  world.veg.stress.set(decodeFloats(s.veg.stress));
  world.veg.drown.set(decodeFloats(s.veg.drown));
  if (s.veg.poison) world.veg.poison.set(decodeFloats(s.veg.poison));
  world.veg.version++;
  world.veg.soilVersion++;
  world.buildings.restore(s.buildings);
  world.citizens.restore(s.citizens);
  if (s.rafts) world.rafts.restore(s.rafts);
  world.seasons.restore(s.seasons);
  world.rnd.state = s.rng;
  world.time = s.time;
  world.autoSeasons = s.autoSeasons;
  world.freeBuild = s.freeBuild;
  world.store.stored = s.store;
  world.store.pollution = s.storePollution ?? 0;
  world.knowledge = s.knowledge ?? 0;
  for (const t of s.techs ?? []) world.techs.add(t);
  world.outcome = s.outcome;
  world.lostToFlood = s.lostToFlood;
  world.goalHeld = s.goalHeld ?? 0;
  world.setWeather(s.weather);
  world.veg.updateMoisture(world.water.depth);
  return world;
}
