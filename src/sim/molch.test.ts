import { describe, expect, it } from 'vitest';
import { BUILDINGS, WET_DEPTH, type BuildingId } from '../data/buildings';
import { HOCHLAND, LAGUNE, MOLCH_CAMPAIGN, OTTERTAL, SCHLAMMTAL, goalText, isUnlocked, requiredWin } from '../data/maps';
import { costFor, SPECIES } from '../data/species';
import { canPlaceAt } from './buildings';
import { restoreWorld, serializeWorld } from './save';
import { DAY } from './seasons';
import { World } from './world';

function runDays(world: World, days: number): void {
  const steps = Math.round((days * DAY) / 0.05);
  for (let i = 0; i < steps; i++) world.step(0.05);
}

function lagerOf(world: World) {
  return [...world.buildings.alive()].find((b) => BUILDINGS[b.def].storage > 0)!;
}

/** Gebäude in Ringen um einen Punkt setzen, fertig oder als Baustelle */
function placeNear(world: World, id: BuildingId, cx: number, cy: number, prebuilt: boolean, radius = 18, ok?: (x: number, y: number) => boolean): { x: number; y: number } | null {
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= world.w - 2 || y >= world.h - 2) continue;
        if (world.placementError(id, x, y) !== null) continue;
        if (ok && !ok(x, y)) continue;
        if (world.place(id, x, y, prebuilt)) return { x, y };
      }
    }
  }
  return null;
}

function molchWorld(unlock = false): World {
  const world = World.fromScenario(LAGUNE);
  if (unlock) world.unlockAll();
  world.settle();
  return world;
}

describe('Molchvolk', () => {
  it('zieht mit Steinlager, Stein und Algen ein', () => {
    const world = molchWorld();
    expect(world.species.id).toBe('molch');
    expect(world.buildings.material).toBe('stein');
    const lager = lagerOf(world);
    expect(lager.def).toBe('molchlager');
    expect(lager.stock.stein).toBe(SPECIES.molch.startStock.stein);
    expect(lager.stock.algen).toBe(SPECIES.molch.startStock.algen);
    expect(lager.stock.holz).toBe(0);
    expect(world.citizens.count()).toBe(6);
    expect(world.messages[0]).toBe(SPECIES.molch.arrival);
    expect(world.stats().species).toBe('molch');
    expect(world.stats().food).toBe(SPECIES.molch.startStock.algen);
  });

  it('der Otterclan bleibt wie gehabt', () => {
    const world = World.fromScenario(OTTERTAL);
    world.settle();
    expect(world.species.id).toBe('otter');
    expect(lagerOf(world).def).toBe('lager');
    expect(lagerOf(world).stock.holz).toBe(SPECIES.otter.startStock.holz);
    expect(world.messages[0]).toBe(SPECIES.otter.arrival);
  });

  it('rechnet Holz und Bretter der gemeinsamen Gebäude in Stein um', () => {
    expect(costFor({ holz: 8, bretter: 4 }, 'stein')).toEqual({ stein: 12 });
    expect(costFor({ holz: 8, bretter: 4 }, 'holz')).toEqual({ holz: 8, bretter: 4 });
    expect(costFor({ stein: 7 }, 'stein')).toEqual({ stein: 7 });
    const world = molchWorld(true);
    const lager = lagerOf(world);
    const at = placeNear(world, 'pumpe', lager.x, lager.y, false);
    expect(at).not.toBeNull();
    const pumpe = [...world.buildings.alive()].find((b) => b.def === 'pumpe')!;
    expect(pumpe.cost).toEqual({ stein: BUILDINGS.pumpe.cost.holz });
    expect(world.buildings.needed(pumpe, 'stein')).toBe(BUILDINGS.pumpe.cost.holz);
    expect(world.buildings.needed(pumpe, 'holz')).toBe(0);
  });

  it('baut nur die eigenen Gebäude und erforscht nur die eigenen Techniken', () => {
    const world = molchWorld();
    const lager = lagerOf(world);
    expect(world.placementError('huette', lager.x + 4, lager.y)).toMatch(/Molchvolk nicht/);
    expect(world.placementError('holzfaeller', lager.x + 4, lager.y)).toMatch(/Molchvolk nicht/);
    expect(world.isUnlocked('molchhoehle')).toBe(true);
    expect(world.isUnlocked('grotte')).toBe(false);
    world.knowledge = 100;
    expect(world.research('zimmerei')).toBe(false);
    expect(world.research('steinkunst')).toBe(true);
    expect(world.isUnlocked('grotte')).toBe(true);
    expect(world.isUnlocked('statue')).toBe(true);
    const otter = World.fromScenario(OTTERTAL);
    otter.settle();
    otter.knowledge = 100;
    expect(otter.research('steinkunst')).toBe(false);
    expect(otter.placementError('molchhoehle', 10, 10)).toMatch(/Otterclan nicht/);
  });

  it('nasse Höhlen stehen auf Land und im flachen Wasser, aber nicht im tiefen', () => {
    const w = 8;
    const ground = new Uint8Array(w * w).fill(5);
    const struct = new Uint8Array(w * w);
    const sink = new Uint8Array(w * w);
    const occ = new Int16Array(w * w).fill(-1);
    const depth = new Float32Array(w * w);
    const ctx = { ground, struct, depth, sink };
    expect(canPlaceAt('molchhoehle', 3, 3, w, w, occ, ctx)).toBeNull();
    expect(canPlaceAt('huette', 3, 3, w, w, occ, ctx)).toBeNull();
    depth.fill(0.8);
    expect(canPlaceAt('molchhoehle', 3, 3, w, w, occ, ctx)).toBeNull();
    expect(canPlaceAt('grotte', 3, 3, w, w, occ, ctx)).toBeNull();
    expect(canPlaceAt('huette', 3, 3, w, w, occ, ctx)).toBe('das Land ist überflutet');
    depth.fill(WET_DEPTH + 0.2);
    expect(canPlaceAt('molchhoehle', 3, 3, w, w, occ, ctx)).toBe('das Wasser ist hier zu tief');
    // Algenfarm und Laichplatz brauchen Wasser
    depth.fill(0);
    expect(canPlaceAt('algenfarm', 3, 3, w, w, occ, ctx)).toMatch(/im Wasser stehen/);
    depth.fill(0.4);
    expect(canPlaceAt('algenfarm', 3, 3, w, w, occ, ctx)).toBeNull();
    expect(canPlaceAt('laichplatz', 3, 3, w, w, occ, ctx)).toBeNull();
  });

  it('der Steinbruch bricht Stein aus dem Hang und bringt ihn ins Lager', () => {
    const world = molchWorld(true);
    const lager = lagerOf(world);
    const start = world.buildings.total('stein');
    // ein Platz, von dem aus im Umkreis Hänge mit zwei Stufen mehr Höhe liegen
    const range = BUILDINGS.steinbruch.range;
    const hasRock = (x: number, y: number): boolean => {
      const base = world.ground[y * world.w + x];
      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h || Math.hypot(dx, dy) > range) continue;
          const i = ny * world.w + nx;
          if (world.ground[i] >= base + 2 && world.water.depth[i] < 0.1) return true;
        }
      }
      return false;
    };
    const at = placeNear(world, 'steinbruch', lager.x, lager.y, true, 24, hasRock);
    expect(at).not.toBeNull();
    runDays(world, 4);
    const now = world.buildings.total('stein');
    expect(now).toBeGreaterThan(start);
    expect(now).toBeLessThanOrEqual(BUILDINGS.molchlager.storage);
  });

  it('das Kiesbecken reinigt den Wasserspeicher', () => {
    const world = molchWorld(true);
    const lager = lagerOf(world);
    expect(placeNear(world, 'tank', lager.x, lager.y, true)).not.toBeNull();
    expect(placeNear(world, 'kiesbecken', lager.x, lager.y, true)).not.toBeNull();
    world.store.stored = 20;
    world.store.pollution = 0.6;
    runDays(world, 1.5);
    expect(world.store.pollution).toBeLessThan(0.5);
  });

  it('die Algenfarm liefert Algen, solange sie im Wasser steht', () => {
    const world = molchWorld(true);
    const lager = lagerOf(world);
    const at = placeNear(world, 'algenfarm', lager.x, lager.y, true, 24);
    expect(at).not.toBeNull();
    const farm = [...world.buildings.alive()].find((b) => b.def === 'algenfarm')!;
    runDays(world, BUILDINGS.algenfarm.harvest!.days + 1.5);
    // Ernte oder zumindest Wachstum: Algen im Lager oder unterwegs
    const stock = world.buildings.total('algen');
    const carried = [...world.citizens.alive()].reduce((s, c) => s + (c.carry === 'algen' ? c.carryAmount : 0), 0);
    expect(stock + carried + farm.growth).toBeGreaterThan(0);
    expect(farm.growth > 0.5 || stock + carried > 0).toBe(true);
  });

  it('in der Dürre trinken Molche doppelt so schnell, Otter nicht', () => {
    const molch = molchWorld();
    const otter = World.fromScenario(OTTERTAL);
    otter.settle();
    const drop = (world: World, weather: 'normal' | 'duerre'): number => {
      world.forceWeather(weather);
      const c = world.citizens.list[0];
      const before = c.water;
      for (let i = 0; i < 20; i++) world.step(0.05);
      return before - c.water;
    };
    const molchNormal = drop(molch, 'normal');
    const molchDuerre = drop(molch, 'duerre');
    const otterNormal = drop(otter, 'normal');
    const otterDuerre = drop(otter, 'duerre');
    expect(molchDuerre).toBeCloseTo(molchNormal * SPECIES.molch.droughtThirst, 5);
    expect(otterDuerre).toBeCloseTo(otterNormal, 5);
  });

  it('ein Spielstand bewahrt das Volk und die Steinkosten', () => {
    const world = molchWorld(true);
    const lager = lagerOf(world);
    placeNear(world, 'pumpe', lager.x, lager.y, false);
    runDays(world, 0.1);
    const back = restoreWorld(serializeWorld(world).data);
    expect(back.species.id).toBe('molch');
    expect(back.buildings.material).toBe('stein');
    expect(lagerOf(back).def).toBe('molchlager');
    const pumpe = [...back.buildings.alive()].find((b) => b.def === 'pumpe')!;
    expect(pumpe.cost).toEqual({ stein: BUILDINGS.pumpe.cost.holz });
    // alte Spielstände ohne Volk sind Otter
    const otter = World.fromScenario(OTTERTAL);
    otter.settle();
    const s = serializeWorld(otter).data;
    delete (s as { species?: string }).species;
    expect(restoreWorld(s).species.id).toBe('otter');
  });

  it('die Molch-Kampagne öffnet sich nach dem Ottertal', () => {
    expect(MOLCH_CAMPAIGN).toEqual([LAGUNE, SCHLAMMTAL, HOCHLAND]);
    for (const sc of MOLCH_CAMPAIGN) expect(sc.species).toBe('molch');
    expect(requiredWin(LAGUNE.id)?.id).toBe(OTTERTAL.id);
    expect(isUnlocked(LAGUNE.id, [])).toBe(false);
    expect(isUnlocked(LAGUNE.id, [OTTERTAL.id])).toBe(true);
    expect(isUnlocked(SCHLAMMTAL.id, [OTTERTAL.id])).toBe(false);
    expect(isUnlocked(SCHLAMMTAL.id, [OTTERTAL.id, LAGUNE.id])).toBe(true);
    expect(goalText(LAGUNE.goal, 'molch')).toContain('Molche');
    expect(goalText(HOCHLAND.goal, 'molch')).toContain('Molche');
    expect(goalText(OTTERTAL.goal)).toContain('Otter');
    // die Kampagnenkarten geben den Molchen einen Start am Wasser
    for (const sc of MOLCH_CAMPAIGN) {
      const world = World.fromScenario(sc);
      world.settle();
      expect(world.citizens.count()).toBe(6);
      expect(lagerOf(world).def).toBe('molchlager');
    }
  });
});
