import { describe, expect, it } from 'vitest';
import { DAY } from './seasons';
import { restoreWorld, serializeWorld } from './save';
import { World } from './world';

function runDays(world: World, days: number): void {
  const steps = Math.round((days * DAY) / 0.05);
  for (let i = 0; i < steps; i++) world.step(0.05);
}

describe('Spielstand', () => {
  it('speichert und lädt die Welt vollständig', () => {
    const world = World.generate(96, 96, 7);
    world.settle();
    const lager = [...world.buildings.alive()][0];
    world.freeBuild = true;
    world.apply('damm', (lager.y + 8) * 96 + lager.x, 3);
    world.place('huette', lager.x - 3, lager.y);
    runDays(world, 2);
    const { data, meta } = serializeWorld(world, 'Test');
    const json = JSON.stringify(data);
    expect(json.length).toBeLessThan(500000);
    expect(meta.day).toBe(world.seasons.info().day);
    expect(meta.population).toBe(world.citizens.count());

    const back = restoreWorld(JSON.parse(json));
    expect(Array.from(back.ground)).toEqual(Array.from(world.ground));
    expect(Array.from(back.struct)).toEqual(Array.from(world.struct));
    expect(back.water.totalVolume()).toBeCloseTo(world.water.totalVolume(), 2);
    expect(back.time).toBe(world.time);
    expect(back.seasons.info()).toEqual(world.seasons.info());
    expect(back.buildings.list.length).toBe(world.buildings.list.length);
    expect(back.citizens.list.map((c) => c.name)).toEqual(world.citizens.list.map((c) => c.name));
    expect(back.store.stored).toBe(world.store.stored);
    expect(back.freeBuild).toBe(true);
    expect(back.scenario.id).toBe(world.scenario.id);
    let trees = 0;
    for (let i = 0; i < back.veg.trees.length; i++) {
      expect(back.veg.trees[i]).toBe(world.veg.trees[i]);
      if (back.veg.trees[i]) trees++;
    }
    expect(trees).toBeGreaterThan(50);
    // Belegung der Zellen stimmt wieder
    for (let i = 0; i < back.buildings.occ.length; i++) expect(back.buildings.occ[i]).toBe(world.buildings.occ[i]);
    // und das Spiel läuft weiter
    runDays(back, 2);
    expect(back.citizens.count()).toBeGreaterThan(0);
    expect(back.seasons.info().day).toBeGreaterThanOrEqual(4);
  });
});

describe('Spielstand mit Jungen', () => {
  it('behält Junge, Alter und Stimmung', () => {
    const world = World.generate(96, 96, 7);
    world.settle();
    const lager = [...world.buildings.alive()][0];
    const hut = world.buildings.place('huette', lager.x - 3, lager.y, true);
    const kid = world.citizens.spawn(lager.x - 2, lager.y + 1, { child: true });
    kid.home = hut.id;
    hut.residents.push(kid.id);
    runDays(world, 1);
    expect(world.citizens.children()).toBe(1);
    const { data } = serializeWorld(world);
    const back = restoreWorld(JSON.parse(JSON.stringify(data)));
    expect(back.citizens.children()).toBe(1);
    expect(back.citizens.list.map((c) => c.age)).toEqual(world.citizens.list.map((c) => c.age));
    expect(back.citizens.list.map((c) => c.mood)).toEqual(world.citizens.list.map((c) => c.mood));
    runDays(back, 1);
    expect(back.citizens.children()).toBe(1);
  });
});
