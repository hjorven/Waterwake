import { describe, expect, it } from 'vitest';
import type { BuildingId } from '../data/buildings';
import { DAY } from './seasons';
import { START_OTTERS, START_WOOD, World } from './world';

function placeNear(world: World, id: BuildingId, cx: number, cy: number, radius = 16): boolean {
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= world.w - 2 || y >= world.h - 2) continue;
        if (world.placementError(id, x, y) === null) {
          world.place(id, x, y);
          return true;
        }
      }
    }
  }
  return false;
}

function runDays(world: World, days: number): void {
  const steps = Math.round((days * DAY) / 0.05);
  for (let i = 0; i < steps; i++) world.step(0.05);
}

function setup(seed = 7, unlock = true): { world: World; lx: number; ly: number } {
  const world = World.generate(96, 96, seed);
  if (unlock) world.unlockAll();
  world.settle();
  const lager = [...world.buildings.alive()][0];
  return { world, lx: lager.x, ly: lager.y };
}

/** Gebäude fertig hinstellen, ohne Bauzeit und Baustoffe */
function placeBuilt(world: World, id: BuildingId, cx: number, cy: number, radius = 16): boolean {
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= world.w - 2 || y >= world.h - 2) continue;
        if (world.place(id, x, y, true)) return true;
      }
    }
  }
  return false;
}

function lagerOf(world: World) {
  return [...world.buildings.alive()].find((b) => b.def === 'lager')!;
}

describe('Siedlung', { timeout: 30000 }, () => {
  it('startet mit Lager, Ottern und Pflanzen', () => {
    const { world } = setup();
    const list = [...world.buildings.alive()];
    expect(list.length).toBe(1);
    expect(list[0].def).toBe('lager');
    expect(list[0].built).toBe(true);
    expect(list[0].stock.holz).toBe(START_WOOD);
    expect(world.citizens.count()).toBe(START_OTTERS);
    let trees = 0;
    let bushes = 0;
    for (let i = 0; i < world.veg.trees.length; i++) {
      if (world.veg.trees[i]) trees++;
      if (world.veg.bushes[i]) bushes++;
    }
    expect(trees).toBeGreaterThan(80);
    expect(bushes).toBeGreaterThan(8);
  });

  it('Bewohner unter einem neuen Gebäude oder Damm treten beiseite', () => {
    const { world } = setup();
    const w = world.w;
    // Hütte genau auf einen Otter setzen
    let placed = 0;
    for (const c of world.citizens.list) {
      const x = Math.floor(c.x);
      const y = Math.floor(c.y);
      if (!world.place('huette', x, y)) continue;
      placed++;
      const cell = Math.floor(c.y) * w + Math.floor(c.x);
      expect(world.walkable(cell)).toBe(true);
      expect(Math.floor(c.x) === x && Math.floor(c.y) === y).toBe(false);
      expect(c.state).toBe('idle');
      break;
    }
    expect(placed).toBe(1);
    // Damm unter einem Otter: er steht danach daneben
    const other = world.citizens.list.find((c) => world.walkable(Math.floor(c.y) * w + Math.floor(c.x)))!;
    const i = Math.floor(other.y) * w + Math.floor(other.x);
    expect(world.apply('damm', i, 3)).toBe(true);
    expect(Math.floor(other.y) * w + Math.floor(other.x)).not.toBe(i);
    // nach ein paar Tagen ist niemand verdurstet
    runDays(world, 2);
    expect(world.citizens.count()).toBe(START_OTTERS);
  });

  it('liefert Holz an eine Baustelle und baut sie fertig', () => {
    const { world, lx, ly } = setup();
    expect(placeNear(world, 'huette', lx, ly)).toBe(true);
    runDays(world, 3);
    const hut = [...world.buildings.alive()].find((b) => b.def === 'huette')!;
    expect(hut.built).toBe(true);
    expect(world.buildings.total('holz')).toBe(START_WOOD - 8);
    // Otter ziehen ein
    expect(hut.residents.length).toBeGreaterThan(0);
  });

  it('Pumpe, Sammler und Holzfäller arbeiten, niemand stirbt', () => {
    const { world, lx, ly } = setup();
    expect(placeNear(world, 'pumpe', lx, ly, 24)).toBe(true);
    expect(placeNear(world, 'tank', lx, ly)).toBe(true);
    expect(placeNear(world, 'sammler', lx, ly)).toBe(true);
    expect(placeNear(world, 'holzfaeller', lx, ly)).toBe(true);
    runDays(world, 10);
    const built = [...world.buildings.alive()].filter((b) => b.built).map((b) => b.def);
    expect(built).toContain('pumpe');
    expect(built).toContain('sammler');
    expect(built).toContain('holzfaeller');
    expect(built).toContain('tank');
    expect(world.citizens.count()).toBe(START_OTTERS);
    expect(world.store.stored).toBeGreaterThan(20);
    // Holz: 30 - 6 - 10 - 5 - 5 = 4, der Holzfäller muss nachgelegt haben
    expect(world.buildings.total('holz')).toBeGreaterThan(10);
    expect(world.buildings.total('beeren')).toBeGreaterThan(0);
  });

  it('bei knappem Holz wird der Holzfäller zuerst gebaut und alles wird fertig', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    placeNear(world, 'pumpe', lx, ly, 24);
    placeNear(world, 'huette', lx, ly);
    placeNear(world, 'huette', lx, ly);
    placeNear(world, 'sammler', lx, ly);
    placeNear(world, 'holzfaeller', lx, ly);
    placeNear(world, 'tank', lx, ly);
    placeNear(world, 'musikplatz', lx, ly);
    runDays(world, 2);
    const cutter = [...world.buildings.alive()].find((b) => b.def === 'holzfaeller')!;
    expect(cutter.built).toBe(true);
    runDays(world, 14);
    expect([...world.buildings.alive()].filter((b) => !b.built).map((b) => b.def)).toEqual([]);
  });

  it('auch wenn alle Otter Arbeit haben, werden neue Baustellen fertig', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    placeNear(world, 'holzfaeller', lx, ly);
    placeNear(world, 'foerster', lx, ly);
    placeNear(world, 'pumpe', lx, ly, 24);
    placeNear(world, 'sammler', lx, ly);
    runDays(world, 6);
    expect([...world.buildings.alive()].every((b) => b.built)).toBe(true);
    expect([...world.citizens.alive()].every((c) => c.workplace >= 0)).toBe(true);
    expect(placeNear(world, 'huette', lx, ly)).toBe(true);
    expect(placeNear(world, 'wasserrad', lx, ly, 24)).toBe(true);
    runDays(world, 6);
    expect([...world.buildings.alive()].filter((b) => !b.built).map((b) => b.def)).toEqual([]);
  });

  it('warnt, wenn das Holz ausgeht und kein Holzfäller steht', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    placeNear(world, 'tank', lx, ly);
    placeNear(world, 'huette', lx, ly);
    placeNear(world, 'huette', lx, ly);
    placeNear(world, 'sammler', lx, ly);
    runDays(world, 4);
    expect(world.messages.join(' ')).toContain('Holz ist alle');
  });

  it('mit Tank überleben die Otter eine lange Dürre', () => {
    const { world, lx, ly } = setup();
    placeNear(world, 'pumpe', lx, ly, 24);
    placeNear(world, 'tank', lx, ly);
    placeNear(world, 'sammler', lx, ly);
    runDays(world, 6);
    expect(world.store.stored).toBeGreaterThan(20);
    world.forceWeather('duerre');
    runDays(world, 10);
    expect(world.citizens.count()).toBe(START_OTTERS);
  });

  it('ohne Wasserspeicher verdursten Otter in der Dürre', () => {
    const { world } = setup();
    world.forceWeather('duerre');
    runDays(world, 12);
    expect(world.citizens.count()).toBeLessThan(START_OTTERS);
    expect(world.messages.join(' ')).toContain('verdurstet');
  });

  it('Schneeschmelze lässt den Fluss über die Ufer treten', () => {
    const world = World.generate(96, 96, 7);
    world.settle();
    const deep = () => {
      let n = 0;
      for (const d of world.water.depth) if (d > 0.6) n++;
      return n;
    };
    const before = deep();
    world.forceWeather('schmelze');
    world.water.sourceFactor = 5;
    runDays(world, 2);
    expect(deep()).toBeGreaterThan(before * 3);
  });

  it('Hochwasser reißt eine überflutete Hütte weg, die Pumpe hält', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    expect(placeNear(world, 'huette', lx, ly)).toBe(true);
    expect(placeNear(world, 'pumpe', lx, ly, 24)).toBe(true);
    runDays(world, 4);
    const hut = [...world.buildings.alive()].find((b) => b.def === 'huette')!;
    const pump = [...world.buildings.alive()].find((b) => b.def === 'pumpe')!;
    expect(hut.built).toBe(true);
    expect(pump.built).toBe(true);
    // ein See um beide Gebäude, der jeden Schritt nachgefüllt wird
    const cells: number[] = [];
    for (const b of [hut, pump]) {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) cells.push((b.y + dy) * world.w + b.x + dx);
    }
    for (let s = 0; s < 1400; s++) {
      for (const i of cells) world.water.depth[i] = 1.2;
      world.step(0.05);
    }
    expect(world.buildings.get(hut.id)).toBeNull();
    expect(world.buildings.get(pump.id)).not.toBeNull();
    expect(world.lostToFlood).toBeGreaterThanOrEqual(1);
    expect(world.messages.join(' ')).toContain('weggerissen');
    // niemand wohnt mehr in der Hütte
    for (const c of world.citizens.alive()) expect(c.home).not.toBe(hut.id);
  });

  it('Otter ohne Hütte sind unzufrieden, mit Hütte und Badesteg zufrieden', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    runDays(world, 3);
    expect(world.citizens.mood()).toBeLessThan(0.45);
    expect(placeNear(world, 'huette', lx, ly)).toBe(true);
    expect(placeNear(world, 'huette', lx, ly)).toBe(true);
    expect(placeNear(world, 'badesteg', lx, ly, 24)).toBe(true);
    runDays(world, 6);
    for (const c of world.citizens.alive()) expect(c.home).toBeGreaterThanOrEqual(0);
    expect(world.citizens.mood()).toBeGreaterThan(0.65);
  });

  it('zufriedene Otter mit freien Betten bekommen Junge', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    placeNear(world, 'pumpe', lx, ly, 24);
    placeNear(world, 'sammler', lx, ly);
    placeNear(world, 'huette', lx, ly);
    placeNear(world, 'huette', lx, ly);
    placeNear(world, 'huette', lx, ly);
    runDays(world, 24);
    expect(world.citizens.births).toBeGreaterThan(0);
    expect(world.citizens.count()).toBeGreaterThan(START_OTTERS);
    expect(world.messages.join(' ')).toContain('geboren');
  });

  it('alte Otter sterben, der Clan trauert', () => {
    const { world } = setup();
    world.forceWeather('normal');
    const c = world.citizens.list[0];
    c.age = 70;
    c.lifespan = 71;
    runDays(world, 3);
    expect(c.alive).toBe(false);
    expect(world.citizens.deaths).toBe(1);
    expect(world.messages.join(' ')).toContain('hohem Alter');
  });

  it('Schlammflut: Fluss wird schmutzig, Pflanzen am Ufer gehen ein, Otter werden krank', () => {
    const { world } = setup();
    world.forceWeather('schlamm');
    runDays(world, 5);
    expect(world.water.maxPollution()).toBeGreaterThan(0.5);
    expect(world.messages.join(' ')).toContain('eingegangen');
    expect(world.citizens.sick()).toBeGreaterThan(0);
    expect(world.messages.join(' ')).toContain('krank geworden');
  });

  it('die Heilerhütte macht kranke Otter schnell gesund', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    expect(placeNear(world, 'heiler', lx, ly)).toBe(true);
    runDays(world, 4);
    const heiler = [...world.buildings.alive()].find((b) => b.def === 'heiler')!;
    expect(heiler.built).toBe(true);
    for (const c of world.citizens.alive()) {
      c.health = 0.3;
      c.sick = true;
    }
    runDays(world, 2);
    expect(world.citizens.sick()).toBe(0);
    expect(world.messages.join(' ')).toContain('wieder gesund');
  });

  it('ohne Heiler dauert die Erholung länger', () => {
    const { world } = setup();
    world.forceWeather('normal');
    for (const c of world.citizens.alive()) {
      c.health = 0.3;
      c.sick = true;
    }
    runDays(world, 2);
    expect(world.citizens.sick()).toBe(START_OTTERS);
    runDays(world, 3);
    expect(world.citizens.sick()).toBe(0);
  });

  it('Wasserrad, Pumpwerk und Sandfilter: Strom pumpt und reinigt ohne Arbeiter', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    expect(placeNear(world, 'holzfaeller', lx, ly)).toBe(true);
    expect(placeNear(world, 'wasserrad', lx, ly, 24)).toBe(true);
    expect(placeNear(world, 'pumpwerk', lx, ly, 24)).toBe(true);
    expect(placeNear(world, 'sandfilter', lx, ly)).toBe(true);
    expect(placeNear(world, 'tank', lx, ly)).toBe(true);
    runDays(world, 12);
    const unbuilt = [...world.buildings.alive()].filter((b) => !b.built).map((b) => b.def);
    expect(unbuilt).toEqual([]);
    expect(world.power.supply).toBeGreaterThan(0.5);
    expect(world.power.demand).toBeCloseTo(1.6, 5);
    // niemand pumpt von Hand, trotzdem ist Wasser im Speicher
    expect(world.store.stored).toBeGreaterThan(5);
    world.store.pollution = 0.8;
    runDays(world, 1);
    expect(world.store.pollution).toBeLessThan(0.2);
  });

  it('das Laufrad springt ein, wenn Wasserräder fehlen', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    expect(placeNear(world, 'laufrad', lx, ly)).toBe(true);
    expect(placeNear(world, 'pumpwerk', lx, ly, 24)).toBe(true);
    runDays(world, 8);
    expect([...world.buildings.alive()].every((b) => b.built)).toBe(true);
    let running = 0;
    for (let s = 0; s < DAY / 0.05; s++) {
      world.step(0.05);
      if (world.power.supply > 0.5) running++;
    }
    expect(running).toBeGreaterThan(DAY / 0.05 / 4);
    expect(world.store.stored).toBeGreaterThan(2);
  });

  it('der Brunnen liefert auch in der Dürre sauberes Wasser', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('duerre');
    world.buildings.place('brunnen', lx - 3, ly, true);
    for (const c of world.citizens.alive()) c.water = 1;
    world.store.pollution = 0.5;
    world.store.stored = 1;
    runDays(world, 1 / 6);
    expect(world.store.stored).toBeGreaterThan(1.2);
    expect(world.store.pollution).toBeLessThan(0.5);
  });

  it('Ziel erreicht und Clan ausgelöscht werden gemeldet', () => {
    const { world } = setup();
    expect(world.scenario.goal).toBeNull();
    world.scenario = { ...world.scenario, goal: { population: 6, year: 1 } };
    runDays(world, 0.1);
    expect(world.outcome).toBe('won');
    for (const c of world.citizens.list) c.water = 0.001;
    runDays(world, 0.1);
    expect(world.outcome).toBe('lost');
    expect(world.messages.join(' ')).toContain('ausgelöscht');
  });

  it('Bibliothek sammelt Wissen, Forschung schaltet Gebäude frei', () => {
    const { world, lx, ly } = setup(7, false);
    world.forceWeather('normal');
    expect(world.placementError('lagerfeuer', lx + 4, ly)).toContain('erforschen');
    expect(world.research('geselligkeit')).toBe(false);
    expect(placeNear(world, 'bibliothek', lx, ly)).toBe(true);
    runDays(world, 6);
    expect(world.knowledge).toBeGreaterThanOrEqual(8);
    expect(world.research('geselligkeit')).toBe(true);
    expect(world.techs.has('geselligkeit')).toBe(true);
    expect(world.research('sternkunde')).toBe(false); // braucht Schrift
    expect(placeNear(world, 'lagerfeuer', lx, ly)).toBe(true);
    expect(world.placementError('pfahlhaus', lx + 6, ly)).toContain('Pfahlbau');
  });

  it('Sägewerk macht Bretter, damit wird ein Pfahlhaus gebaut', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    placeNear(world, 'holzfaeller', lx, ly);
    placeNear(world, 'saegewerk', lx, ly);
    placeNear(world, 'pfahlhaus', lx, ly);
    runDays(world, 9);
    const house = [...world.buildings.alive()].find((b) => b.def === 'pfahlhaus')!;
    expect(house.delivered.bretter + world.buildings.total('bretter')).toBeGreaterThan(0);
    expect(house.built).toBe(true);
  });

  it('der Fischer fängt Fisch, in der Dürre nicht mehr', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    expect(placeNear(world, 'fischer', lx, ly, 24)).toBe(true);
    runDays(world, 4);
    expect(world.buildings.total('fisch')).toBeGreaterThan(0);
    world.forceWeather('duerre');
    runDays(world, 6);
    lagerOf(world).stock.fisch = 0;
    runDays(world, 2);
    expect(world.buildings.total('fisch')).toBe(0);
  });

  it('Feld und Bäckerei: aus Korn wird Brot', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    placeNear(world, 'feld', lx, ly);
    expect(placeBuilt(world, 'baeckerei', lx, ly)).toBe(true);
    runDays(world, 9);
    const field = [...world.buildings.alive()].find((b) => b.def === 'feld')!;
    expect(field.built).toBe(true);
    const goods = world.buildings.totals();
    expect(goods.brot + goods.korn).toBeGreaterThan(0);
    expect(goods.brot).toBeGreaterThan(0);
  });

  it('Werkstatt liefert Werkzeug, mit Werkzeug für alle gibt es den Bonus', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    expect(placeBuilt(world, 'werkstatt', lx, ly)).toBe(true);
    placeNear(world, 'holzfaeller', lx, ly);
    runDays(world, 7);
    expect(world.buildings.total('werkzeug') + (world.citizens.toolBonus ? 1 : 0)).toBeGreaterThan(0);
    expect(world.citizens.toolBonus).toBe(true);
  });

  it('der Beerengärtner pflanzt neue Sträucher', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    const count = () => {
      let n = 0;
      for (let i = 0; i < world.veg.bushes.length; i++) if (world.veg.bushes[i]) n++;
      return n;
    };
    const before = count();
    placeNear(world, 'beerengaertner', lx, ly);
    runDays(world, 5);
    expect(count()).toBeGreaterThan(before + 3);
  });

  it('Schule und Sternwarte: Junge wachsen schneller, Vorhersage wird genau', () => {
    const { world, lx, ly } = setup();
    world.forceWeather('normal');
    world.buildings.place('schule', lx - 4, ly, true);
    world.buildings.place('sternwarte', lx - 6, ly, true);
    const kid = world.citizens.spawn(lx - 2, ly + 2, { child: true });
    const info = world.stats().season;
    expect(info.nextMin).toBe(info.nextMax);
    runDays(world, 2.1);
    expect(kid.age).toBeGreaterThanOrEqual(2.9);
  });
});
