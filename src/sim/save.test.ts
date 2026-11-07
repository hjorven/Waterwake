import { describe, expect, it } from 'vitest';
import { DAY } from './seasons';
import { restoreWorld, SAVE_VERSION, serializeWorld } from './save';
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

describe('Spielstand mit Schlamm', () => {
  it('behält Verschmutzung, Gesundheit und Speicherzustand', () => {
    const world = World.generate(96, 96, 7);
    world.settle();
    world.forceWeather('schlamm');
    runDays(world, 1);
    world.store.stored = 3;
    world.store.pollution = 0.4;
    const c = world.citizens.list[0];
    c.health = 0.2;
    c.sick = true;
    const { data } = serializeWorld(world);
    expect(data.v).toBe(SAVE_VERSION);
    const back = restoreWorld(JSON.parse(JSON.stringify(data)));
    expect(back.water.maxPollution()).toBeCloseTo(world.water.maxPollution(), 5);
    expect(back.store.pollution).toBeCloseTo(0.4, 5);
    expect(back.citizens.list[0].health).toBeCloseTo(0.2, 5);
    expect(back.citizens.sick()).toBe(1);
    expect(back.weather).toBe('schlamm');
  });

  it('lädt Spielstände der Version 3 ohne Flöße', () => {
    const world = World.generate(64, 64, 3);
    world.settle();
    const { data } = serializeWorld(world);
    const old = JSON.parse(JSON.stringify(data));
    old.v = 3;
    delete old.rafts;
    const back = restoreWorld(old);
    expect(back.rafts.list.length).toBe(0);
    runDays(back, 1);
    expect(back.citizens.count()).toBeGreaterThan(0);
  });

  it('lädt alte Spielstände der Version 1 ohne Schmutzfelder', () => {
    const world = World.generate(64, 64, 3);
    world.settle();
    const { data } = serializeWorld(world);
    const old = JSON.parse(JSON.stringify(data));
    old.v = 1;
    delete old.pollution;
    delete old.storePollution;
    delete old.veg.poison;
    for (const c of old.citizens.list) {
      delete c.health;
      delete c.sick;
    }
    const back = restoreWorld(old);
    expect(back.water.maxPollution()).toBe(0);
    expect(back.citizens.sick()).toBe(0);
    expect(back.citizens.list[0].health).toBe(1);
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

describe('Spielstand mit Forschung', () => {
  it('behält Wissen, Technologien und gelieferte Baustoffe', () => {
    const world = World.generate(96, 96, 7);
    world.settle();
    world.knowledge = 12.5;
    world.techs.add('zimmerei');
    world.techs.add('pfahlbau');
    const lager = [...world.buildings.alive()][0];
    const site = world.place('pfahlhaus', lager.x - 3, lager.y)!;
    site.delivered.holz = 4;
    site.delivered.bretter = 2;
    site.growth = 0.3;
    lager.stock.brot = 5;
    const { data } = serializeWorld(world);
    const back = restoreWorld(JSON.parse(JSON.stringify(data)));
    expect(back.knowledge).toBeCloseTo(12.5, 5);
    expect([...back.techs]).toEqual(['zimmerei', 'pfahlbau']);
    const s2 = back.buildings.get(site.id)!;
    expect(s2.delivered.holz).toBe(4);
    expect(s2.delivered.bretter).toBe(2);
    expect(s2.reserved.holz).toBe(0);
    expect(s2.growth).toBeCloseTo(0.3, 5);
    expect(back.buildings.get(lager.id)!.stock.brot).toBe(5);
    expect(back.isUnlocked('pfahlhaus')).toBe(true);
    expect(back.isUnlocked('wasserrad')).toBe(false);
  });

  it('lädt Spielstände der Version 2 mit geliefertem Holz und zwei Waren', () => {
    const world = World.generate(64, 64, 3);
    world.settle();
    const lager = [...world.buildings.alive()][0];
    const site = world.place('huette', lager.x - 3, lager.y)!;
    site.delivered.holz = 5;
    const { data } = serializeWorld(world);
    const old = JSON.parse(JSON.stringify(data));
    old.v = 2;
    delete old.knowledge;
    delete old.techs;
    for (const b of old.buildings) {
      b.woodDelivered = b.delivered.holz;
      delete b.delivered;
      delete b.reserved;
      delete b.growth;
      b.stock = { holz: b.stock.holz, beeren: b.stock.beeren };
    }
    const back = restoreWorld(old);
    expect(back.knowledge).toBe(0);
    expect(back.techs.size).toBe(0);
    const s2 = back.buildings.get(site.id)!;
    expect(s2.delivered.holz).toBe(5);
    expect(s2.delivered.bretter).toBe(0);
    expect(back.buildings.get(lager.id)!.stock.fisch).toBe(0);
    runDays(back, 1);
  });
});
