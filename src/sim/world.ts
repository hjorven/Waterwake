import { BUILDINGS, DAM_WOOD_PER_LEVEL, FLOOD_DESTROY_TIME, FLOOD_REPAIR_TIME, GATE_WOOD, type BuildingId } from '../data/buildings';
import { GOOD_LABEL, GOODS, type Stock } from '../data/goods';
import { freeScenario, speciesOf, type Goal, type Scenario } from '../data/maps';
import { SPECIES, type Species, type SpeciesDef } from '../data/species';
import { TECH_ORDER, TECHS, requiredFor, techTable, type TechId } from '../data/tech';
import { Buildings, type Building, type PlacementContext } from './buildings';
import { Citizens, type Env } from './citizens';
import { Pathfinder } from './pathfinding';
import { RAFT_DEPTH, Rafts } from './rafts';
import { mulberry32, type Rng } from './rng';
import { DAY, Seasons, type SeasonInfo } from './seasons';
import { generateValley, MAX_HEIGHT, type MapData } from './terrain';
import { EDITOR_SOURCE_RATE, mapToData } from '../data/custom';
import { Vegetation } from './vegetation';
import { WaterSim } from './water';

export type Weather = 'normal' | 'schmelze' | 'duerre' | 'schlamm';
export type Tool = 'anheben' | 'absenken' | 'damm' | 'deich' | 'schleuse' | 'abreissen' | 'quelle' | 'senke' | 'start';
export type Outcome = 'won' | 'lost' | null;

export const WEATHER_INFO: Record<Weather, { sourceFactor: number; evaporation: number; pollution: number; label: string }> = {
  normal: { sourceFactor: 1, evaporation: 0.0015, pollution: 0, label: 'Normalzeit' },
  schmelze: { sourceFactor: 5, evaporation: 0.0008, pollution: 0, label: 'Schneeschmelze' },
  duerre: { sourceFactor: 0, evaporation: 0.004, pollution: 0, label: 'Dürre' },
  schlamm: { sourceFactor: 2, evaporation: 0.0015, pollution: 1, label: 'Schlammflut' },
};

/** Maximale Höhe eines Dammes über dem Boden */
export const MAX_DAM = 6;
/** Maximale Höhe eines Deichs (aus Erde, kostenlos) */
export const MAX_DIKE = 2;
/** Simulationsschritt in Sekunden; mehrere Schritte pro Bild */
export const SIM_DT = 0.05;

/** Startvorrat des Otterclans (die Molche bringen Stein und Algen mit, siehe SPECIES) */
export const START_WOOD = SPECIES.otter.startStock.holz ?? 0;
export const START_BERRIES = SPECIES.otter.startStock.beeren ?? 0;
/** Bewohner zu Beginn, bei beiden Völkern gleich */
export const START_OTTERS = 6;
/** Glättung des Abfluss-Zählers in Sekunden (etwa ein Tag) */
const OUTFLOW_TAU = DAY;

/** Faktor von Strömungsstärke zu Strom am Wasserrad */
export const WHEEL_FACTOR = 0.8;
/** Pumpleistung des Pumpwerks je Sekunde bei voller Stromversorgung */
export const PUMPWERK_RATE = 0.3;
/** Reinigung des Sandfilters je Sekunde (Konzentration) */
export const FILTER_RATE = 0.015;
/** Grundwasser je Sekunde aus einem Brunnen */
export const WELL_RATE = 0.03;
/** Sägewerk ohne Strom: Anteil der vollen Geschwindigkeit */
export const SAW_IDLE_SPEED = 0.4;

export interface PowerStats {
  supply: number;
  demand: number;
  /** Anteil des Bedarfs, der gedeckt ist, 0..1 */
  ratio: number;
}

export interface WorldStats {
  population: number;
  children: number;
  /** kranke Otter */
  sick: number;
  housing: number;
  wood: number;
  /** Nahrung aller Art */
  food: number;
  /** das Volk dieser Siedlung */
  species: Species;
  /** Vorrat je Ware */
  goods: Stock;
  storageCap: number;
  knowledge: number;
  techs: TechId[];
  /** es gibt Wissensgebäude oder Wissen, dann wird der Wissens-Chip gezeigt */
  hasKnowledge: boolean;
  /** Werkzeug für alle Arbeiter da: alle arbeiten schneller */
  toolBonus: boolean;
  /** fertige Lager und Lagerhäuser (Bezirke) */
  districts: number;
  rafts: number;
  /** abgeschlossene Floßlieferungen */
  raftTrips: number;
  water: number;
  waterCap: number;
  /** Verschmutzung des gespeicherten Wassers 0..1 */
  waterPollution: number;
  /** höchste Verschmutzung auf der Karte 0..1 */
  riverPollution: number;
  /** Flusskette: Anteil des normalen Zuflusses, der von oben kommt (1 ohne Kette) */
  riverFactor: number;
  /** Abfluss im Verhältnis zum normalen Zufluss, 1 = alles fließt durch */
  outflowShare: number;
  power: PowerStats;
  /** es gibt Stromgebäude, dann wird der Stromhaushalt angezeigt */
  hasPower: boolean;
  season: SeasonInfo;
  /** mittlere Zufriedenheit 0..1 */
  mood: number;
  births: number;
  deaths: number;
  lostToFlood: number;
  outcome: Outcome;
  goal: Goal | null;
  /** Stausee-Ziel: Zellen mit der nötigen Tiefe und Tage, die der See schon gehalten wird */
  deepCells: number;
  goalDays: number;
  scenario: string;
  scenarioName: string;
  seed: number;
  /** Karteneditor läuft: keine Bewohner, Werkzeuge für Quellen, Abfluss und Start */
  editor: boolean;
  sources: number;
  sinks: number;
  startSet: boolean;
}

function plants(n: number, what: string): string {
  return n === 1 ? `Eine Pflanze ist ${what}.` : `${n} Pflanzen sind ${what}.`;
}

export class World implements Env {
  readonly w: number;
  readonly h: number;
  readonly ground: Uint8Array;
  /** Höhe von Bauwerken (Damm, Deich, geschlossenes Tor) über dem Boden */
  readonly struct: Uint8Array;
  /** Höhe eines Schleusentors je Zelle, 0 = keins */
  readonly gate: Uint8Array;
  /** 1 = Tor offen */
  readonly gateOpen: Uint8Array;
  readonly water: WaterSim;
  readonly buildings: Buildings;
  readonly veg: Vegetation;
  readonly citizens: Citizens;
  readonly rafts: Rafts;
  /** Wegsuche für Flöße auf dem Wasser */
  readonly waterPath: Pathfinder;
  readonly path: Pathfinder;
  readonly seasons: Seasons;
  readonly reserved = new Set<number>();
  /** Wasservorrat in Pumpen und Tanks, mit Verschmutzung als Konzentration */
  readonly store = { stored: 0, pollution: 0 };
  /** Stromhaushalt, jede Sekunde neu berechnet */
  readonly power: PowerStats & { wheels: number } = { supply: 0, demand: 0, ratio: 1, wheels: 0 };
  /** gesammeltes Wissen und erforschte Technologien */
  knowledge = 0;
  readonly techs = new Set<TechId>();
  readonly seed: number;
  scenario: Scenario;
  /** das Volk mit seinen Regeln; bestimmt Baustoff, Gebäude und Forschungstafel */
  species: SpeciesDef = SPECIES.otter;
  /** Technologie je Gebäude für das Volk */
  private techFor: Partial<Record<BuildingId, TechId>> = techTable(SPECIES.otter.techs);
  weather: Weather = 'normal';
  /** Flusskette: Faktor auf die Quellen aus dem Abfluss des Spielers oberhalb, 1 ohne Kette */
  riverFactor = 1;
  /** Abfluss über den Kartenrand je Sekunde, geglättet über etwa einen Tag */
  outflowAvg = 0;
  private lastDrainedTotal = 0;
  /** Jahreszeiten laufen automatisch, false nach manuellem Eingriff */
  autoSeasons = true;
  /** Baukasten: Wasserbau kostet kein Holz */
  freeBuild = false;
  /** Karteneditor: keine Bewohner, kein Untergang, Werkzeuge für Quellen, Abfluss und Start */
  editor = false;
  /** Zelle des Startlagers (links oben), -1 = beste Stelle am Fluss suchen */
  start = -1;
  /** vergangene Simulationszeit in Sekunden */
  time = 0;
  /** Version des Geländes, steigt bei jeder Änderung */
  terrainVersion = 0;
  /** Meldungen für die Oberfläche, werden vom Worker abgeholt */
  messages: string[] = [];
  /** Spielziel erreicht oder Clan ausgelöscht */
  outcome: Outcome = null;
  /** vom Hochwasser zerstörte Gebäude */
  lostToFlood = 0;
  /** Stausee-Ziel: Sekunden, die der See ununterbrochen groß genug war */
  goalHeld = 0;
  readonly rnd: Rng;
  private moistTimer = 0;
  private growTimer = 0;
  private lastDay = 1;
  private witheredToday = 0;
  private drownedToday = 0;
  private woodWarnAt = -Infinity;
  private floodWarnAt = -Infinity;
  private woodWarnDay = -Infinity;
  private plankWarnDay = -Infinity;
  private staffWarnDay = -Infinity;
  private dirtyWarned = false;
  private poisonedToday = 0;

  constructor(map: MapData, seed: number, scenario?: Scenario) {
    this.w = map.w;
    this.h = map.h;
    this.seed = seed;
    this.scenario = scenario ?? freeScenario(seed, map.w, map.h);
    this.start = map.start ?? -1;
    this.rnd = mulberry32(seed ^ 0x51ed);
    this.ground = map.ground.slice();
    this.struct = new Uint8Array(map.w * map.h);
    this.gate = new Uint8Array(map.w * map.h);
    this.gateOpen = new Uint8Array(map.w * map.h);
    this.water = new WaterSim(map.w, map.h);
    for (const s of map.sources) this.water.sources.push({ ...s });
    for (const i of map.sinks) this.water.sink[i] = 1;
    this.syncTerrain();
    this.buildings = new Buildings(map.w, map.h);
    this.setSpecies(speciesOf(this.scenario));
    this.veg = new Vegetation(map.w, map.h);
    this.setWeather('normal');
    this.seasons = new Seasons(seed, this.scenario.seasons);
    this.path = new Pathfinder(
      map.w,
      map.h,
      (i) => this.cost(i),
      (a, b) => this.canStep(a, b),
    );
    this.waterPath = new Pathfinder(
      map.w,
      map.h,
      (i) => this.waterCost(i),
      () => true,
    );
    this.citizens = new Citizens(this);
    this.rafts = new Rafts(this);
  }

  static generate(w: number, h: number, seed: number, scenario?: Scenario): World {
    return new World(generateValley(w, h, seed, scenario?.terrain), seed, scenario);
  }

  /** Volk wechseln, vor dem Absetzen oder Laden: Baustoff und Forschungstafel folgen */
  setSpecies(id: Species): void {
    this.species = SPECIES[id];
    this.buildings.material = this.species.material;
    this.techFor = techTable(this.species.techs);
  }

  static fromScenario(s: Scenario): World {
    return s.custom ? new World(mapToData(s.custom), s.seed, s) : World.generate(s.w, s.h, s.seed, s);
  }

  /**
   * Fluss einlaufen lassen, Pflanzen setzen, Startlager und Otter.
   * Wird vom Worker nach dem Erzeugen aufgerufen.
   */
  /** Wasser einschwingen lassen, Pflanzen setzen und, wenn gewünscht, den Clan mit Lager absetzen */
  settle(withClan = true): void {
    for (let i = 0; i < 1200; i++) this.water.step(SIM_DT);
    // die letzten 20 Sekunden messen den Abfluss, damit der Zähler der Flusskette nicht bei null beginnt
    const before = this.water.drainedTotal;
    for (let i = 0; i < 400; i++) this.water.step(SIM_DT);
    this.outflowAvg = (this.water.drainedTotal - before) / (400 * SIM_DT);
    this.lastDrainedTotal = this.water.drainedTotal;
    this.veg.updateMoisture(this.water.depth);
    const start = withClan ? this.chooseStart() : -1;
    const blocked = new Set<number>();
    if (start >= 0) {
      const sx = start % this.w;
      const sy = (start / this.w) | 0;
      for (let y = sy - 3; y <= sy + 4; y++) for (let x = sx - 3; x <= sx + 4; x++) blocked.add(y * this.w + x);
    }
    this.veg.seed(this.ground, this.seasons.year, this.rnd, (i) => blocked.has(i) || this.water.depth[i] > 0.2);
    if (start >= 0) {
      const sx = start % this.w;
      const sy = (start / this.w) | 0;
      const lager = this.buildings.place(this.species.camp, sx, sy, true);
      for (const g of GOODS) lager.stock[g] = this.species.startStock[g] ?? 0;
      const ring = this.buildings.ring(lager).filter((i) => this.walkable(i));
      for (let k = 0; k < START_OTTERS && ring.length > 0; k++) {
        const c = ring[(k * 3) % ring.length];
        this.citizens.spawn(c % this.w, (c / this.w) | 0);
      }
    }
    this.time = 0;
    this.water.added = this.water.drained = this.water.evaporated = 0;
    this.messages.length = 0;
    if (withClan) this.log(this.species.arrival);
  }

  /** Gesetzter Start der Karte, wenn dort ein Lager passt, sonst die beste Stelle am Fluss */
  private chooseStart(): number {
    if (this.start >= 0 && !this.buildings.canPlace(this.species.camp, this.start % this.w, (this.start / this.w) | 0, this.placementContext())) return this.start;
    return this.findStart();
  }

  private placementContext(): PlacementContext {
    return { ground: this.ground, struct: this.struct, depth: this.water.depth, sink: this.water.sink };
  }

  /** Flache, trockene, feuchte 2x2-Stelle möglichst nah an der Kartenmitte */
  private findStart(): number {
    const { w, h } = this;
    const ctx = { ground: this.ground, struct: this.struct, depth: this.water.depth, sink: this.water.sink };
    let best = -1;
    let bestScore = Infinity;
    for (let y = 4; y < h - 6; y++) {
      for (let x = 4; x < w - 6; x++) {
        const i = y * w + x;
        if (this.ground[i] < 3 || this.ground[i] > 9) continue;
        if (this.veg.moist[i] === 0) continue;
        if (this.buildings.canPlace(this.species.camp, x, y, ctx)) continue;
        // Umgebung soll möglichst eben sein
        let rough = 0;
        for (let dy = -2; dy <= 3; dy++) {
          for (let dx = -2; dx <= 3; dx++) {
            const j = (y + dy) * w + x + dx;
            rough += Math.abs(this.ground[j] - this.ground[i]) + (this.water.depth[j] > 0.1 ? 2 : 0);
          }
        }
        const d = Math.hypot(x - w / 2, y - h * 0.45);
        // Nähe zum Fluss zählt viel: Feuchte über der Grundfeuchte kommt nur vom Wasser
        const near = Math.max(0, this.veg.moist[i] - 110) / 145;
        const score = rough * 1.5 + d * 0.5 + (1 - near) * 25;
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
    }
    return best;
  }

  // --- Env für Bewohner --------------------------------------------------------

  get depth(): Float32Array {
    return this.water.depth;
  }

  get pollution(): Float32Array {
    return this.water.pollution;
  }

  waterCapacity(): number {
    return this.buildings.waterCapacity();
  }

  /** Wasser in den Speicher mischen, gibt die aufgenommene Menge zurück */
  addWater(amount: number, pollution: number): number {
    const cap = this.buildings.waterCapacity();
    const add = Math.max(0, Math.min(amount, cap - this.store.stored));
    if (add <= 0) return 0;
    const total = this.store.stored + add;
    this.store.pollution = (this.store.pollution * this.store.stored + pollution * add) / total;
    this.store.stored = total;
    return add;
  }

  /** Laufräder sollen laufen, wenn die Wasserräder den Bedarf nicht decken */
  needsTread(): boolean {
    return this.power.demand > this.power.wheels + 0.01;
  }

  /** Heilwirkung an diesem Punkt: 0 keine, 1 Heilerhütte mit Pfleger, 2 mit Kräutern */
  healAt(x: number, y: number): number {
    let best = 0;
    for (const b of this.buildings.alive()) {
      if (b.def !== 'heiler' || !b.built) continue;
      const c = this.buildings.center(b);
      if (Math.hypot(c.x - x, c.y - y) > BUILDINGS.heiler.range) continue;
      const shift = this.citizens.shiftAt(b.id, 'heal');
      if (shift > best) best = shift;
    }
    return best;
  }

  addKnowledge(amount: number): void {
    this.knowledge += amount;
  }

  /** Arbeitsgeschwindigkeit einer Verarbeitung: das Sägewerk braucht Strom */
  craftSpeed(b: Building): number {
    const def = BUILDINGS[b.def];
    if (def.powerUse <= 0) return 1;
    return SAW_IDLE_SPEED + (1 - SAW_IDLE_SPEED) * this.power.ratio;
  }

  /** Eine Schule mit Lehrern lässt die Jungen schneller erwachsen werden */
  hasSchool(): boolean {
    for (const b of this.buildings.alive()) if (b.def === 'schule' && b.built && b.workers.length > 0) return true;
    return false;
  }

  /** Mit Sternwarte ist die Vorhersage genau */
  hasObservatory(): boolean {
    for (const b of this.buildings.alive()) if (b.def === 'sternwarte' && b.built) return true;
    return false;
  }

  // --- Forschung ---------------------------------------------------------------

  isUnlocked(id: BuildingId): boolean {
    const tech = this.techFor[id];
    return tech === undefined || this.techs.has(tech);
  }

  /** Technologie erforschen, false wenn Wissen oder Voraussetzung fehlen */
  research(id: TechId): boolean {
    const t = TECHS[id];
    if (!t || this.techs.has(id) || !this.species.techs.includes(id)) return false;
    const req = requiredFor(id, this.species.techs);
    if (req && !this.techs.has(req)) {
      this.log(`${t.name}: zuerst ${TECHS[req].name} erforschen.`);
      return false;
    }
    if (this.knowledge < t.cost) {
      this.log(`${t.name}: nicht genug Wissen (${t.cost} nötig).`);
      return false;
    }
    this.knowledge -= t.cost;
    this.techs.add(id);
    this.log(`${t.name} erforscht. Neu: ${t.unlocks.map((b) => BUILDINGS[b].name).join(', ')}.`);
    return true;
  }

  /** Alles freischalten (Baukasten und Tests) */
  unlockAll(): void {
    for (const t of TECH_ORDER) this.techs.add(t);
  }

  height(i: number): number {
    return this.ground[i] + this.struct[i];
  }

  walkable(i: number): boolean {
    return this.buildings.occ[i] < 0 || this.isJetty(i);
  }

  /** Steht hier ein Steg, über den man gehen kann? */
  isJetty(i: number): boolean {
    const id = this.buildings.occ[i];
    if (id < 0) return false;
    const b = this.buildings.get(id);
    return !!b && b.def === 'steg' && b.built;
  }

  /** Wie viele verschiedene Freude-Gebäude diesen Punkt erreichen; die Schenke zählt nur mit Wirt */
  joyAt(x: number, y: number): number {
    const seen = new Set<BuildingId>();
    for (const b of this.buildings.alive()) {
      if (!b.built) continue;
      const def = BUILDINGS[b.def];
      if (!def.joy || seen.has(b.def)) continue;
      const c = this.buildings.center(b);
      if (Math.hypot(c.x - x, c.y - y) > def.range) continue;
      if (def.workers > 0 && !this.citizens.shiftAt(b.id, 'serve')) continue;
      seen.add(b.def);
    }
    return seen.size;
  }

  private cost(i: number): number {
    if (this.buildings.occ[i] >= 0) return this.isJetty(i) ? 1 : 0;
    const d = this.water.depth[i];
    if (d > 0.25) return 2.5;
    if (this.veg.trees[i] > 0) return 1.5;
    return 1;
  }

  canStep(a: number, b: number): boolean {
    const d = this.water.depth;
    if (d[a] > 0.25 && d[b] > 0.25) return true;
    if (this.isJetty(a) || this.isJetty(b)) return true;
    return Math.abs(this.height(a) - this.height(b)) <= 1;
  }

  /** Kosten für Flöße: nur Wasser, tiefes lieber als flaches, nichts durch Gebäude */
  private waterCost(i: number): number {
    if (this.buildings.occ[i] >= 0) return 0;
    const d = this.water.depth[i];
    if (d < RAFT_DEPTH) return 0;
    return d >= 0.3 ? 1 : 1.6;
  }

  log(msg: string): void {
    this.messages.push(msg);
    if (this.messages.length > 50) this.messages.shift();
  }

  // --- Schritt ------------------------------------------------------------------

  setWeather(weather: Weather): void {
    this.weather = weather;
    const info = WEATHER_INFO[weather];
    // mit Flutwelle und Kette zusammen höchstens das Zehnfache, sonst wird es absurd
    this.water.sourceFactor = Math.min(10, info.sourceFactor * this.riverFactor);
    this.water.sourcePollution = info.pollution;
    this.water.evaporation = info.evaporation;
    // In der Dürre regnet es nicht: Feuchte nur noch nahe am Wasser
    this.veg.ambient = weather === 'duerre' ? 0 : 1;
  }

  /** Flusskette: Zufluss von oben setzen, 1 = normal */
  setRiverFactor(factor: number): void {
    this.riverFactor = Number.isFinite(factor) ? Math.max(0, Math.min(5, factor)) : 1;
    this.setWeather(this.weather);
  }

  /** Zufluss aller Quellen bei Normalwetter je Sekunde */
  sourceBase(): number {
    let s = 0;
    for (const q of this.water.sources) s += q.rate;
    return s;
  }

  /** Abfluss im Verhältnis zum normalen Zufluss: 1 = alles fließt durch, 0 = nichts kommt unten an */
  outflowShare(): number {
    const base = this.sourceBase();
    // ohne Quellen gibt es keinen Fluss, dann soll unten normales Wasser ankommen
    return base > 0 ? this.outflowAvg / base : 1;
  }

  /** Wetter von Hand setzen, schaltet den Jahreslauf ab */
  forceWeather(weather: Weather): void {
    this.autoSeasons = false;
    this.setWeather(weather);
  }

  step(dt = SIM_DT): void {
    this.water.step(dt);
    this.time += dt;
    const drained = this.water.drainedTotal - this.lastDrainedTotal;
    this.lastDrainedTotal = this.water.drainedTotal;
    this.outflowAvg += (drained / dt - this.outflowAvg) * Math.min(1, dt / OUTFLOW_TAU);
    const change = this.seasons.step(dt);
    if (change && this.autoSeasons) {
      this.setWeather(change);
      const info = this.seasons.info();
      this.log(
        change === 'duerre'
          ? `Die Dürre beginnt. Vorhersage: ${info.daysLeft} Tage.`
          : change === 'schmelze'
            ? 'Schneeschmelze! Der Fluss schwillt an, eine Flutwelle kommt.'
            : change === 'schlamm'
              ? 'Schlammflut! Die Quellen bringen schmutziges Wasser. Nicht aus dem Fluss trinken, Pflanzen am Ufer leiden.'
              : 'Die Normalzeit kehrt zurück.',
      );
    }
    if (this.autoSeasons && this.weather === 'schmelze') this.water.sourceFactor = this.seasons.meltFactor();
    this.moistTimer += dt;
    if (this.moistTimer >= 1) {
      this.moistTimer -= 1;
      this.veg.updateMoisture(this.water.depth);
      this.drownedToday += this.veg.updateFlood(this.water.depth, 1);
      this.poisonedToday += this.veg.updatePollution(this.water.depth, this.water.pollution, 1);
      this.floodCheck(1);
      this.updatePower();
      this.runMachines(1);
      this.growFields(1);
      this.checkOutcome();
    }
    this.growTimer += dt;
    if (this.growTimer >= 1) {
      this.witheredToday += this.veg.grow(this.growTimer);
      this.growTimer = 0;
    }
    const day = Math.floor(this.time / DAY) + 1;
    if (day !== this.lastDay) {
      this.lastDay = day;
      if (this.witheredToday > 0) {
        this.log(plants(this.witheredToday, 'vertrocknet'));
        this.witheredToday = 0;
      }
      if (this.drownedToday > 0) {
        this.log(plants(this.drownedToday, 'im Hochwasser ertrunken'));
        this.drownedToday = 0;
      }
      if (this.poisonedToday > 0) {
        this.log(plants(this.poisonedToday, 'am schmutzigen Wasser eingegangen'));
        this.poisonedToday = 0;
      }
      this.materialWarning();
      this.staffWarning();
    }
    this.citizens.step(dt);
    this.rafts.step(dt);
  }

  /** Stromhaushalt: Wasserräder nach Strömung, Laufräder mit Läufer, Bedarf der Verbraucher */
  private updatePower(): void {
    const p = this.power;
    let wheels = 0;
    let tread = 0;
    let demand = 0;
    for (const b of this.buildings.alive()) {
      if (!b.built) continue;
      const def = BUILDINGS[b.def];
      if (b.def === 'wasserrad') wheels += this.wheelPower(b);
      else if (b.def === 'laufrad') tread += this.citizens.workingAt(b.id, 'tread') ? def.powerGen : 0;
      demand += def.powerUse;
    }
    p.wheels = wheels;
    p.supply = wheels + tread;
    p.demand = demand;
    p.ratio = demand > 0 ? Math.min(1, p.supply / demand) : 1;
  }

  /** Leistung eines Wasserrads aus der stärksten Strömung nebenan */
  wheelPower(b: Building): number {
    let best = 0;
    const v = { x: 0, y: 0 };
    for (const i of this.buildings.ring(b)) {
      if (this.water.depth[i] < 0.05 || this.struct[i] > 0) continue;
      this.water.velocity(i, v);
      const speed = Math.hypot(v.x, v.y);
      if (speed > best) best = speed;
    }
    return Math.min(BUILDINGS.wasserrad.powerGen, best * WHEEL_FACTOR);
  }

  /** Maschinen, die ohne Arbeiter laufen: Pumpwerk, Sandfilter, Brunnen */
  private runMachines(dt: number): void {
    const ratio = this.power.ratio;
    for (const b of this.buildings.alive()) {
      if (!b.built) continue;
      switch (b.def) {
        case 'pumpwerk': {
          let want = PUMPWERK_RATE * ratio * dt;
          for (const i of this.buildings.ring(b)) {
            if (want <= 0) break;
            if (this.water.depth[i] < 0.05 || this.struct[i] > 0) continue;
            const take = Math.min(want, this.water.depth[i] * 0.5);
            const conc = this.water.take(i, take);
            want -= this.addWater(take, conc);
          }
          break;
        }
        case 'sandfilter':
          this.store.pollution = Math.max(0, this.store.pollution - FILTER_RATE * ratio * dt);
          break;
        case 'brunnen':
          this.addWater(WELL_RATE * dt, 0);
          break;
      }
    }
    if (this.store.stored < 0.5) this.store.pollution = 0;
    if (this.store.pollution > 0.3 && !this.dirtyWarned) {
      this.dirtyWarned = true;
      this.log('Das gespeicherte Wasser ist verschmutzt und macht krank. Ein Sandfilter reinigt es.');
    } else if (this.store.pollution < 0.1) {
      this.dirtyWarned = false;
    }
  }

  /** Felder und Kräutergärten reifen auf feuchtem Boden */
  private growFields(dt: number): void {
    for (const b of this.buildings.alive()) {
      const h = BUILDINGS[b.def].harvest;
      if (!h || !b.built || b.growth >= 1) continue;
      let moist = 0;
      const cells = this.buildings.cells(b);
      if (BUILDINGS[b.def].onWater) {
        // Algen wachsen nur, solange die Farm ganz im Wasser steht
        if (cells.some((i) => this.water.depth[i] < 0.1)) continue;
        moist = 1;
      } else {
        for (const i of cells) moist += this.veg.moist[i];
        moist /= cells.length * 255;
        if (moist <= 0) continue;
      }
      b.growth = Math.min(1, b.growth + (dt * (0.4 + 0.6 * moist)) / (h.days * DAY));
    }
  }

  /** Alle Erwachsenen haben Arbeit, aber Gebäude stehen ohne Arbeiter da */
  private staffWarning(): void {
    if (this.lastDay - this.staffWarnDay < 3) return;
    let free = 0;
    for (const c of this.citizens.alive()) if (!c.child && c.workplace < 0) free++;
    if (free > 0) return;
    const empty: string[] = [];
    for (const b of this.buildings.alive()) {
      if (b.built && b.workers.length === 0 && BUILDINGS[b.def].workers > 0) empty.push(BUILDINGS[b.def].name);
    }
    if (empty.length === 0) return;
    this.staffWarnDay = this.lastDay;
    const list = empty.length <= 3 ? empty.join(', ') : `${empty.slice(0, 3).join(', ')} und ${empty.length - 3} weitere`;
    this.log(`Ohne Arbeiter: ${list}. Mehr Hütten bringen Nachwuchs, Abreißen gibt Arbeiter frei.`);
  }

  /** Baustellen warten auf Baustoff (Holz oder Stein) oder Bretter, aber es gibt keine und niemand macht Nachschub */
  private materialWarning(): void {
    const material = this.species.material;
    const producer: BuildingId = material === 'stein' ? 'steinbruch' : 'holzfaeller';
    let waitMaterial = false;
    let waitPlanks = false;
    let hasProducer = false;
    let sawmill = false;
    for (const b of this.buildings.alive()) {
      if (b.built) {
        if (b.def === producer) hasProducer = true;
        if (b.def === 'saegewerk') sawmill = true;
      } else {
        if (b.delivered[material] < (b.cost[material] ?? 0)) waitMaterial = true;
        if (b.delivered.bretter < (b.cost.bretter ?? 0)) waitPlanks = true;
      }
    }
    // Warnungen höchstens alle drei Tage wiederholen
    if (waitMaterial && !hasProducer && this.buildings.total(material) < 1 && this.lastDay - this.woodWarnDay >= 3) {
      this.woodWarnDay = this.lastDay;
      this.log(
        material === 'stein'
          ? 'Der Stein ist alle, Baustellen warten. Ein Steinbruch am Hang bricht Nachschub, Abreißen gibt Stein zurück.'
          : 'Das Holz ist alle, Baustellen warten. Ein Holzfäller schafft Nachschub, Abreißen gibt Holz zurück.',
      );
    }
    if (waitPlanks && !sawmill && this.buildings.total('bretter') < 1 && this.lastDay - this.plankWarnDay >= 3) {
      this.plankWarnDay = this.lastDay;
      this.log('Baustellen warten auf Bretter. Ein Sägewerk macht aus Holz Bretter.');
    }
  }

  /** Gebäude im tiefen Wasser nehmen Schaden und werden irgendwann weggerissen */
  private floodCheck(dt: number): void {
    const depth = this.water.depth;
    let newly = 0;
    let anyFlooded = false;
    for (const b of this.buildings.alive()) {
      const def = BUILDINGS[b.def];
      const flooded = this.buildings.maxDepthOn(b, depth) > def.floodDepth;
      if (flooded !== b.flooded) {
        b.flooded = flooded;
        if (flooded) newly++;
      }
      if (flooded) {
        anyFlooded = true;
        b.damage = Math.min(1, b.damage + dt / FLOOD_DESTROY_TIME);
        if (b.damage >= 1) this.destroyByFlood(b);
      } else if (b.damage > 0) {
        b.damage = Math.max(0, b.damage - dt / FLOOD_REPAIR_TIME);
        anyFlooded = true;
      }
    }
    // Schäden ändern sich jede Sekunde, die Oberfläche soll sie sehen
    if (anyFlooded || newly) this.buildings.version++;
    if (newly > 0 && this.time - this.floodWarnAt > 20) {
      this.floodWarnAt = this.time;
      this.log(newly === 1 ? 'Hochwasser! Ein Gebäude steht im Wasser. Deiche bauen!' : `Hochwasser! ${newly} Gebäude stehen im Wasser. Deiche bauen!`);
    }
  }

  private destroyByFlood(b: Building): void {
    const def = BUILDINGS[b.def];
    this.buildings.remove(b.id);
    this.citizens.detachBuilding(b.id);
    for (const i of this.buildings.cells(b)) this.reserved.delete(i);
    const cap = this.buildings.waterCapacity();
    if (this.store.stored > cap) this.store.stored = cap;
    this.lostToFlood++;
    const lost: string[] = [];
    for (const g of GOODS) if (b.stock[g] >= 1) lost.push(`${Math.floor(b.stock[g])} ${GOOD_LABEL[g]}`);
    this.log(`${def.name} wurde vom Hochwasser weggerissen${lost.length ? `, samt ${lost.join(', ')}` : ''}.`);
  }

  /** Spielziel und Untergang prüfen */
  private checkOutcome(): void {
    if (this.editor) return;
    const pop = this.citizens.count();
    if (pop === 0) {
      if (this.outcome !== 'lost') {
        this.outcome = 'lost';
        this.log(this.species.wipedOut);
      }
      return;
    }
    const goal = this.scenario.goal;
    if (!goal) return;
    if (goal.kind === 'stausee' && (this.weather === 'normal' || this.weather === 'duerre')) {
      // jede Sekunde geprüft: der See muss ununterbrochen groß genug bleiben;
      // in Schmelze und Schlammflut steht das Wasser ohnehin hoch, da zählt nichts
      if (this.water.deepCells(goal.depth) >= goal.cells) {
        if (this.goalHeld === 0) this.log('Der Stausee ist groß genug. Haltet ihn, bis das Ziel erreicht ist.');
        this.goalHeld += 1;
      } else {
        if (this.goalHeld > 0 && this.outcome === null) this.log('Der Stausee ist geschrumpft, die Zählung beginnt von vorn.');
        this.goalHeld = 0;
      }
    }
    if (this.outcome !== null) return;
    if (goal.kind === 'clan' && pop >= goal.population && this.seasons.year >= goal.year) {
      this.outcome = 'won';
      this.log(`Ziel erreicht: ${pop} ${this.species.many} im Jahr ${this.seasons.year}. ${this.species.title} ist im Tal zuhause.`);
    } else if (goal.kind === 'stausee' && this.goalHeld >= goal.days * DAY && pop >= goal.population) {
      this.outcome = 'won';
      this.log(`Ziel erreicht: Der See in der Schlucht hält, ${pop} ${this.species.many} leben an seinem Ufer.`);
    }
  }

  /** Stand des Stausee-Ziels in Tagen */
  goalDays(): number {
    return this.goalHeld / DAY;
  }

  stats(): WorldStats {
    const goods = this.buildings.totals();
    return {
      population: this.citizens.count(),
      children: this.citizens.children(),
      sick: this.citizens.sick(),
      housing: this.buildings.housing(),
      wood: goods.holz,
      food: goods.beeren + goods.fisch + goods.brot + goods.algen,
      species: this.species.id,
      goods,
      storageCap: this.buildings.storageCapacity(),
      knowledge: this.knowledge,
      techs: TECH_ORDER.filter((t) => this.techs.has(t)),
      hasKnowledge: this.knowledge > 0 || this.techs.size > 0 || [...this.buildings.alive()].some((b) => BUILDINGS[b.def].knowledge > 0),
      toolBonus: this.citizens.toolBonus,
      districts: this.buildings.stores().length,
      rafts: this.rafts.list.length,
      raftTrips: this.rafts.trips,
      water: this.store.stored,
      waterCap: this.buildings.waterCapacity(),
      waterPollution: this.store.pollution,
      riverPollution: this.water.maxPollution(),
      riverFactor: this.riverFactor,
      outflowShare: this.outflowShare(),
      power: { supply: this.power.supply, demand: this.power.demand, ratio: this.power.ratio },
      hasPower: [...this.buildings.alive()].some((b) => BUILDINGS[b.def].category === 'strom'),
      season: this.seasons.info(this.hasObservatory()),
      mood: this.citizens.mood(),
      births: this.citizens.births,
      deaths: this.citizens.deaths,
      lostToFlood: this.lostToFlood,
      outcome: this.outcome,
      goal: this.scenario.goal,
      deepCells: this.scenario.goal?.kind === 'stausee' ? this.water.deepCells(this.scenario.goal.depth) : 0,
      goalDays: this.goalDays(),
      seed: this.seed,
      scenario: this.scenario.id,
      scenarioName: this.scenario.name,
      editor: this.editor,
      sources: this.water.sources.length,
      sinks: this.sinkCount(),
      startSet: this.start >= 0,
    };
  }

  // --- Gelände und Wasserbau ------------------------------------------------------

  /** Wasser-Gelände aus Boden und Bauwerken neu berechnen */
  syncTerrain(): void {
    const t = this.water.terrain;
    for (let i = 0; i < t.length; i++) t[i] = this.ground[i] + this.struct[i];
    this.terrainVersion++;
  }

  private setStruct(i: number, value: number): void {
    this.struct[i] = value;
    this.water.terrain[i] = this.ground[i] + value;
    this.terrainVersion++;
  }

  /** Baustoff des Volkes (Holz oder Stein) aus den Lagern nehmen, false wenn nicht genug da ist */
  private payMaterial(amount: number, i: number): boolean {
    if (amount <= 0 || this.freeBuild) return true;
    const material = this.species.material;
    if (this.buildings.total(material) < amount) {
      if (this.time - this.woodWarnAt > 5) {
        this.woodWarnAt = this.time;
        this.log(`Nicht genug ${GOOD_LABEL[material]} (${amount} nötig).`);
      }
      return false;
    }
    this.buildings.takeGood(material, amount, i % this.w, (i / this.w) | 0);
    return true;
  }

  /**
   * Wendet ein Werkzeug auf eine Zelle an. Gibt true zurück, wenn sich
   * etwas geändert hat.
   */
  apply(tool: Tool, i: number, damHeight = 2): boolean {
    const changed = this.applyTool(tool, i, damHeight);
    // wer auf der Zelle steht und nicht mehr herunterkommt, tritt beiseite
    if (changed) this.citizens.evict([i]);
    return changed;
  }

  private applyTool(tool: Tool, i: number, damHeight: number): boolean {
    if (i < 0 || i >= this.ground.length) return false;
    if (this.buildings.occ[i] >= 0) return false;
    const g = this.ground[i];
    const s = this.struct[i];
    switch (tool) {
      case 'anheben':
        if (s === 0 && this.gate[i] === 0 && g < MAX_HEIGHT) {
          this.ground[i] = g + 1;
          this.water.terrain[i] = g + 1;
          this.terrainVersion++;
          return true;
        }
        return false;
      case 'absenken':
        if (s > 0 || this.gate[i]) return this.applyTool('abreissen', i, damHeight);
        if (g > 0) {
          this.ground[i] = g - 1;
          this.water.terrain[i] = g - 1;
          this.terrainVersion++;
          return true;
        }
        return false;
      case 'damm': {
        const target = Math.max(1, Math.min(MAX_DAM, damHeight, MAX_HEIGHT - g));
        if (this.gate[i] || s >= target) return false;
        if (!this.payMaterial((target - s) * DAM_WOOD_PER_LEVEL, i)) return false;
        this.setStruct(i, target);
        return true;
      }
      case 'deich': {
        const target = Math.max(1, Math.min(MAX_DIKE, damHeight, MAX_HEIGHT - g));
        if (this.gate[i] || s >= target) return false;
        this.setStruct(i, target);
        return true;
      }
      case 'schleuse': {
        if (this.gate[i]) return this.toggleGate(i);
        const target = Math.max(1, Math.min(MAX_DAM, damHeight, MAX_HEIGHT - g));
        if (!this.payMaterial(GATE_WOOD, i)) return false;
        this.gate[i] = target;
        this.gateOpen[i] = 0;
        this.setStruct(i, target);
        return true;
      }
      case 'quelle': {
        if (!this.editor) return false;
        const k = this.water.sources.findIndex((src) => src.index === i);
        if (k >= 0) this.water.sources.splice(k, 1);
        else this.water.sources.push({ index: i, rate: EDITOR_SOURCE_RATE });
        this.terrainVersion++;
        return true;
      }
      case 'senke':
        if (!this.editor) return false;
        this.water.sink[i] = this.water.sink[i] ? 0 : 1;
        this.terrainVersion++;
        return true;
      case 'start': {
        if (!this.editor) return false;
        const why = this.buildings.canPlace(this.species.camp, i % this.w, (i / this.w) | 0, this.placementContext());
        if (why) {
          this.log(`Hier passt kein Lager hin: ${why}.`);
          return false;
        }
        this.start = i;
        this.terrainVersion++;
        return true;
      }
      case 'abreissen':
        if (s === 0 && this.gate[i] === 0) return false;
        this.gate[i] = 0;
        this.gateOpen[i] = 0;
        this.setStruct(i, 0);
        return true;
    }
  }

  private sinkCount(): number {
    let n = 0;
    const s = this.water.sink;
    for (let i = 0; i < s.length; i++) n += s[i];
    return n;
  }

  /** Schleusentor öffnen oder schließen */
  toggleGate(i: number): boolean {
    if (!this.gate[i]) return false;
    this.gateOpen[i] ^= 1;
    this.setStruct(i, this.gateOpen[i] ? 0 : this.gate[i]);
    return true;
  }

  // --- Gebäude ------------------------------------------------------------------

  placementError(id: BuildingId, x: number, y: number): string | null {
    if (!this.species.buildings.includes(id)) return `${BUILDINGS[id].name} baut das ${this.species.name} nicht`;
    if (!this.isUnlocked(id)) return `zuerst ${TECHS[this.techFor[id]!].name} erforschen`;
    return this.buildings.canPlace(id, x, y, {
      ground: this.ground,
      struct: this.struct,
      depth: this.water.depth,
      sink: this.water.sink,
    });
  }

  /** Gebäude setzen (prebuilt: sofort fertig, etwa auf Kampagnenkarten) */
  place(id: BuildingId, x: number, y: number, prebuilt = false): Building | null {
    const err = this.placementError(id, x, y);
    if (err) {
      this.log(`${BUILDINGS[id].name}: ${err}.`);
      return null;
    }
    const b = this.buildings.place(id, x, y, prebuilt);
    const cells = this.buildings.cells(b);
    for (const i of cells) {
      this.veg.clear(i);
      this.reserved.delete(i);
    }
    // wer darunter stand, tritt beiseite
    this.citizens.evict(cells);
    return b;
  }

  /** Gebäude auf einer Zelle abreißen, halbes Holz kommt zurück */
  demolish(i: number): boolean {
    const id = this.buildings.occ[i];
    if (id < 0) return false;
    const b = this.buildings.remove(id);
    if (!b) return false;
    this.citizens.detachBuilding(id);
    this.rafts.sync();
    const def = BUILDINGS[b.def];
    for (const g of GOODS) {
      const refund = Math.floor(b.delivered[g] / 2) + b.stock[g];
      if (refund > 0) this.buildings.putGood(g, refund, b.x, b.y);
    }
    const cap = this.buildings.waterCapacity();
    if (this.store.stored > cap) this.store.stored = cap;
    this.log(`${def.name} abgerissen.`);
    return true;
  }
}
