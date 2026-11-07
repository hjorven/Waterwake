import { BUILDINGS, DAM_WOOD_PER_LEVEL, GATE_WOOD, type BuildingId } from '../data/buildings';
import { Buildings, type Building } from './buildings';
import { Citizens, type Env } from './citizens';
import { Pathfinder } from './pathfinding';
import { mulberry32 } from './rng';
import { DAY, Seasons, type SeasonInfo } from './seasons';
import { generateValley, MAX_HEIGHT, type MapData } from './terrain';
import { Vegetation } from './vegetation';
import { WaterSim } from './water';

export type Weather = 'normal' | 'schmelze' | 'duerre';
export type Tool = 'anheben' | 'absenken' | 'damm' | 'deich' | 'schleuse' | 'abreissen';

export const WEATHER_INFO: Record<Weather, { sourceFactor: number; evaporation: number; label: string }> = {
  normal: { sourceFactor: 1, evaporation: 0.0015, label: 'Normalzeit' },
  schmelze: { sourceFactor: 3, evaporation: 0.0008, label: 'Schneeschmelze' },
  duerre: { sourceFactor: 0, evaporation: 0.006, label: 'Dürre' },
};

/** Maximale Höhe eines Dammes über dem Boden */
export const MAX_DAM = 6;
/** Maximale Höhe eines Deichs (aus Erde, kostenlos) */
export const MAX_DIKE = 2;
/** Simulationsschritt in Sekunden; mehrere Schritte pro Bild */
export const SIM_DT = 0.05;

export const START_WOOD = 30;
export const START_BERRIES = 12;
export const START_OTTERS = 6;

export interface WorldStats {
  population: number;
  housing: number;
  wood: number;
  berries: number;
  storageCap: number;
  water: number;
  waterCap: number;
  season: SeasonInfo;
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
  readonly path: Pathfinder;
  readonly seasons: Seasons;
  readonly reserved = new Set<number>();
  /** Wasservorrat in Pumpen und Tanks */
  readonly store = { stored: 0 };
  weather: Weather = 'normal';
  /** Jahreszeiten laufen automatisch, false nach manuellem Eingriff */
  autoSeasons = true;
  /** Baukasten: Wasserbau kostet kein Holz */
  freeBuild = false;
  /** vergangene Simulationszeit in Sekunden */
  time = 0;
  /** Version des Geländes, steigt bei jeder Änderung */
  terrainVersion = 0;
  /** Meldungen für die Oberfläche, werden vom Worker abgeholt */
  messages: string[] = [];
  readonly rnd: () => number;
  private moistTimer = 0;
  private growTimer = 0;
  private lastDay = 1;
  private witheredToday = 0;
  private woodWarnAt = -Infinity;

  constructor(map: MapData, seed: number) {
    this.w = map.w;
    this.h = map.h;
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
    this.veg = new Vegetation(map.w, map.h);
    this.setWeather('normal');
    this.seasons = new Seasons(seed);
    this.path = new Pathfinder(
      map.w,
      map.h,
      (i) => this.cost(i),
      (a, b) => this.canStep(a, b),
    );
    this.citizens = new Citizens(this);
  }

  static generate(w: number, h: number, seed: number): World {
    return new World(generateValley(w, h, seed), seed);
  }

  /**
   * Fluss einlaufen lassen, Pflanzen setzen, Startlager und Otter.
   * Wird vom Worker nach dem Erzeugen aufgerufen.
   */
  settle(): void {
    for (let i = 0; i < 1600; i++) this.water.step(SIM_DT);
    this.veg.updateMoisture(this.water.depth);
    const start = this.findStart();
    const blocked = new Set<number>();
    if (start >= 0) {
      const sx = start % this.w;
      const sy = (start / this.w) | 0;
      for (let y = sy - 3; y <= sy + 4; y++) for (let x = sx - 3; x <= sx + 4; x++) blocked.add(y * this.w + x);
    }
    this.veg.seed(this.ground, this.seasons.year, this.rnd, (i) => blocked.has(i));
    if (start >= 0) {
      const sx = start % this.w;
      const sy = (start / this.w) | 0;
      const lager = this.buildings.place('lager', sx, sy, true);
      lager.stock.holz = START_WOOD;
      lager.stock.beeren = START_BERRIES;
      const ring = this.buildings.ring(lager).filter((i) => this.walkable(i));
      for (let k = 0; k < START_OTTERS; k++) {
        const c = ring[(k * 3) % ring.length];
        this.citizens.spawn(c % this.w, (c / this.w) | 0);
      }
    }
    this.time = 0;
    this.water.added = this.water.drained = this.water.evaporated = 0;
    this.messages.length = 0;
    this.log('Der Otterclan kommt am Fluss an. Baut eine Pumpe und Hütten, bevor die Dürre kommt.');
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
        if (this.buildings.canPlace('lager', x, y, ctx)) continue;
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

  waterCapacity(): number {
    return this.buildings.waterCapacity();
  }

  height(i: number): number {
    return this.ground[i] + this.struct[i];
  }

  walkable(i: number): boolean {
    return this.buildings.occ[i] < 0;
  }

  private cost(i: number): number {
    if (this.buildings.occ[i] >= 0) return 0;
    const d = this.water.depth[i];
    if (d > 0.25) return 2.5;
    if (this.veg.trees[i] > 0) return 1.5;
    return 1;
  }

  private canStep(a: number, b: number): boolean {
    const d = this.water.depth;
    if (d[a] > 0.25 && d[b] > 0.25) return true;
    return Math.abs(this.height(a) - this.height(b)) <= 1;
  }

  log(msg: string): void {
    this.messages.push(msg);
    if (this.messages.length > 50) this.messages.shift();
  }

  // --- Schritt ------------------------------------------------------------------

  setWeather(weather: Weather): void {
    this.weather = weather;
    const info = WEATHER_INFO[weather];
    this.water.sourceFactor = info.sourceFactor;
    this.water.evaporation = info.evaporation;
    // In der Dürre regnet es nicht: Feuchte nur noch nahe am Wasser
    this.veg.ambient = weather === 'duerre' ? 0 : 1;
  }

  /** Wetter von Hand setzen, schaltet den Jahreslauf ab */
  forceWeather(weather: Weather): void {
    this.autoSeasons = false;
    this.setWeather(weather);
  }

  step(dt = SIM_DT): void {
    this.water.step(dt);
    this.time += dt;
    const change = this.seasons.step(dt);
    if (change && this.autoSeasons) {
      this.setWeather(change);
      const info = this.seasons.info();
      this.log(
        change === 'duerre'
          ? `Die Dürre beginnt. Vorhersage: ${info.daysLeft} Tage.`
          : change === 'schmelze'
            ? 'Schneeschmelze! Der Fluss schwillt an.'
            : 'Die Normalzeit kehrt zurück.',
      );
    }
    this.moistTimer += dt;
    if (this.moistTimer >= 1) {
      this.moistTimer -= 1;
      this.veg.updateMoisture(this.water.depth);
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
        this.log(`${this.witheredToday} Pflanzen sind vertrocknet.`);
        this.witheredToday = 0;
      }
    }
    this.citizens.step(dt);
  }

  stats(): WorldStats {
    return {
      population: this.citizens.count(),
      housing: this.buildings.housing(),
      wood: this.buildings.total('holz'),
      berries: this.buildings.total('beeren'),
      storageCap: this.buildings.storageCapacity(),
      water: this.store.stored,
      waterCap: this.buildings.waterCapacity(),
      season: this.seasons.info(),
    };
  }

  // --- Gelände und Wasserbau ------------------------------------------------------

  private syncTerrain(): void {
    const t = this.water.terrain;
    for (let i = 0; i < t.length; i++) t[i] = this.ground[i] + this.struct[i];
    this.terrainVersion++;
  }

  private setStruct(i: number, value: number): void {
    this.struct[i] = value;
    this.water.terrain[i] = this.ground[i] + value;
    this.terrainVersion++;
  }

  /** Holz aus den Lagern nehmen, false wenn nicht genug da ist */
  private payWood(amount: number, i: number): boolean {
    if (amount <= 0 || this.freeBuild) return true;
    if (this.buildings.total('holz') < amount) {
      if (this.time - this.woodWarnAt > 5) {
        this.woodWarnAt = this.time;
        this.log(`Nicht genug Holz (${amount} nötig).`);
      }
      return false;
    }
    this.buildings.takeWood(amount, i % this.w, (i / this.w) | 0);
    return true;
  }

  /**
   * Wendet ein Werkzeug auf eine Zelle an. Gibt true zurück, wenn sich
   * etwas geändert hat.
   */
  apply(tool: Tool, i: number, damHeight = 2): boolean {
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
        if (s > 0 || this.gate[i]) return this.apply('abreissen', i);
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
        if (!this.payWood((target - s) * DAM_WOOD_PER_LEVEL, i)) return false;
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
        if (!this.payWood(GATE_WOOD, i)) return false;
        this.gate[i] = target;
        this.gateOpen[i] = 0;
        this.setStruct(i, target);
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

  /** Schleusentor öffnen oder schließen */
  toggleGate(i: number): boolean {
    if (!this.gate[i]) return false;
    this.gateOpen[i] ^= 1;
    this.setStruct(i, this.gateOpen[i] ? 0 : this.gate[i]);
    return true;
  }

  // --- Gebäude ------------------------------------------------------------------

  placementError(id: BuildingId, x: number, y: number): string | null {
    return this.buildings.canPlace(id, x, y, {
      ground: this.ground,
      struct: this.struct,
      depth: this.water.depth,
      sink: this.water.sink,
    });
  }

  place(id: BuildingId, x: number, y: number): Building | null {
    const err = this.placementError(id, x, y);
    if (err) {
      this.log(`${BUILDINGS[id].name}: ${err}.`);
      return null;
    }
    const b = this.buildings.place(id, x, y);
    for (const i of this.buildings.cells(b)) {
      this.veg.clear(i);
      this.reserved.delete(i);
    }
    return b;
  }

  /** Gebäude auf einer Zelle abreißen, halbes Holz kommt zurück */
  demolish(i: number): boolean {
    const id = this.buildings.occ[i];
    if (id < 0) return false;
    const b = this.buildings.remove(id);
    if (!b) return false;
    for (const c of this.citizens.list) {
      if (c.workplace === id) c.workplace = -1;
      if (c.home === id) c.home = -1;
    }
    const def = BUILDINGS[b.def];
    const refund = Math.floor(b.woodDelivered / 2) + b.stock.holz;
    if (refund > 0) this.buildings.putGood('holz', refund, b.x, b.y);
    if (b.stock.beeren > 0) this.buildings.putGood('beeren', b.stock.beeren, b.x, b.y);
    const cap = this.buildings.waterCapacity();
    if (this.store.stored > cap) this.store.stored = cap;
    this.log(`${def.name} abgerissen.`);
    return true;
  }
}
