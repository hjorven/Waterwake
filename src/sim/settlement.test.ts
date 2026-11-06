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
});
