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

function setup(seed = 7): { world: World; lx: number; ly: number } {
  const world = World.generate(96, 96, seed);
  world.settle();
  const lager = [...world.buildings.alive()][0];
  return { world, lx: lager.x, ly: lager.y };
}

describe('Siedlung', () => {
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
});
