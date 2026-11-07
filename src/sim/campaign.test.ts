import { describe, expect, it } from 'vitest';
import { CAMPAIGN, DELTA, DUERRELAND, SCHLUCHT, isUnlocked, nextScenario, scenarioById } from '../data/maps';
import { restoreWorld, serializeWorld } from './save';
import { DAY, Seasons } from './seasons';
import { World } from './world';

function runDays(world: World, days: number): void {
  const steps = Math.round((days * DAY) / 0.05);
  for (let i = 0; i < steps; i++) world.step(0.05);
}

/** Dammzeile in der Schlucht: die schmalste Stelle des Flussbetts in der Kartenmitte */
function damCells(world: World): number[] {
  const w = world.w;
  let bestY = -1;
  let bestWidth = Infinity;
  for (let y = Math.round(world.h * 0.38); y <= Math.round(world.h * 0.62); y++) {
    let bed = Infinity;
    for (let x = 0; x < w; x++) bed = Math.min(bed, world.ground[y * w + x]);
    let width = 0;
    for (let x = 0; x < w; x++) if (world.ground[y * w + x] <= bed + 2) width++;
    if (width < bestWidth) {
      bestWidth = width;
      bestY = y;
    }
  }
  let bed = Infinity;
  for (let x = 0; x < w; x++) bed = Math.min(bed, world.ground[bestY * w + x]);
  const cells: number[] = [];
  for (let x = 0; x < w; x++) if (world.ground[bestY * w + x] <= bed + 3) cells.push(bestY * w + x);
  return cells;
}

describe('Kampagne', { timeout: 120000 }, () => {
  it('jede Karte ist begehbar, hat ein Startlager und der Fluss erreicht den Südrand', () => {
    for (const sc of CAMPAIGN) {
      const world = World.fromScenario(sc);
      world.settle();
      expect(world.citizens.count(), sc.id).toBe(6);
      expect([...world.buildings.alive()].some((b) => b.def === 'lager'), sc.id).toBe(true);
      for (let y = 0; y < world.h; y++) {
        for (let x = 0; x < world.w; x++) {
          const i = y * world.w + x;
          if (x + 1 < world.w) expect(Math.abs(world.ground[i] - world.ground[i + 1]), `${sc.id} ${x},${y}`).toBeLessThanOrEqual(1);
          if (y + 1 < world.h) expect(Math.abs(world.ground[i] - world.ground[i + world.w]), `${sc.id} ${x},${y}`).toBeLessThanOrEqual(1);
        }
      }
      world.water.drained = 0;
      runDays(world, 1);
      expect(world.water.drained, sc.id).toBeGreaterThan(50);
      expect(scenarioById(sc.id, 0)).toBe(sc);
    }
  });

  it('der Nebenfluss im Delta führt Wasser bis zur Mündung', () => {
    const world = World.fromScenario(DELTA);
    expect(world.water.sources.length).toBe(6);
    runDays(world, 1);
    const edge = world.water.sources[3].index;
    expect(world.water.depth[edge]).toBeGreaterThan(0.05);
    // auf dem Weg zur Mitte steht in jeder Spalte Wasser
    const ty = Math.floor(edge / world.w);
    for (let x = 2; x < world.w / 2 - 6; x += 6) {
      let wet = 0;
      for (let dy = -5; dy <= 5; dy++) if (world.water.depth[(ty + dy) * world.w + x] > 0.05) wet++;
      expect(wet, `Spalte ${x}`).toBeGreaterThan(0);
    }
  });

  it('im Dürreland dauert die Dürre 14 bis 20 Tage', () => {
    const seasons = new Seasons(DUERRELAND.seed, DUERRELAND.seasons);
    let droughts = 0;
    let guard = 0;
    while (droughts < 3 && guard++ < 100000) {
      const change = seasons.step(DAY / 4);
      if (change === 'duerre') {
        droughts++;
        const len = Math.round((seasons.phaseEnd - seasons.phaseStart) / DAY);
        expect(len).toBeGreaterThanOrEqual(14);
        expect(len).toBeLessThanOrEqual(20);
      }
    }
    expect(droughts).toBe(3);
  });

  it('ein Damm in der Schlucht füllt den Stausee und gewinnt die Karte', () => {
    const world = World.fromScenario(SCHLUCHT);
    world.settle();
    world.freeBuild = true;
    const goal = SCHLUCHT.goal!;
    expect(goal.kind).toBe('stausee');
    if (goal.kind !== 'stausee') return;
    // ohne Damm: der Fluss allein bildet keinen See, auch die Flutwelle zählt nicht
    world.forceWeather('schmelze');
    runDays(world, 2);
    expect(world.goalHeld).toBe(0);
    world.forceWeather('normal');
    runDays(world, 1);
    expect(world.water.deepCells(goal.depth)).toBeLessThan(goal.cells);
    expect(world.goalHeld).toBe(0);
    // Damm vier Stufen hoch quer durch die Schlucht
    world.scenario = { ...SCHLUCHT, goal: { ...goal, population: 1 } };
    const cells = damCells(world);
    expect(cells.length).toBeLessThan(12);
    for (const i of cells) world.apply('damm', i, 4);
    runDays(world, 2);
    expect(world.water.deepCells(goal.depth)).toBeGreaterThanOrEqual(goal.cells);
    expect(world.goalHeld).toBeGreaterThan(0);
    // der Zähler überlebt das Speichern
    const copy = restoreWorld(serializeWorld(world).data);
    expect(copy.goalHeld).toBe(world.goalHeld);
    runDays(world, goal.days + 0.5);
    expect(world.outcome).toBe('won');
  });

  it('die Kampagne schaltet Karten der Reihe nach frei', () => {
    expect(isUnlocked(CAMPAIGN[0].id, [])).toBe(true);
    expect(isUnlocked(CAMPAIGN[1].id, [])).toBe(false);
    expect(isUnlocked(CAMPAIGN[1].id, [CAMPAIGN[0].id])).toBe(true);
    expect(isUnlocked(CAMPAIGN[2].id, [CAMPAIGN[0].id])).toBe(false);
    expect(isUnlocked('frei', [])).toBe(false);
    expect(nextScenario(CAMPAIGN[0].id)).toBe(CAMPAIGN[1]);
    expect(nextScenario(CAMPAIGN[CAMPAIGN.length - 1].id)).toBeNull();
    expect(nextScenario('frei')).toBeNull();
  });
});
