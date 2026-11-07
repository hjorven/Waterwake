import { describe, expect, it } from 'vitest';
import { CUSTOM_ID, coreFromData, customScenario, flatMap, hashText, isMapCode, makeCode, mapToData, normalizeCode, validateGoal, validateMap, type CustomMap } from '../data/custom';
import { mulberry32 } from './rng';
import { restoreWorld, serializeWorld } from './save';
import { DAY } from './seasons';
import { generateValley } from './terrain';
import { World } from './world';

function runDays(world: World, days: number): void {
  const steps = Math.round((days * DAY) / 0.05);
  for (let i = 0; i < steps; i++) world.step(0.05);
}

function valleyMap(seed = 5): CustomMap {
  return { id: `k${seed}`, name: `Tal ${seed}`, author: 'Lotte', goal: null, createdAt: 1, ...coreFromData(generateValley(64, 64, seed)) };
}

describe('Eigene Karten', { timeout: 120000 }, () => {
  it('Codes haben sechs Zeichen ohne 0, O, 1 und I', () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 50; i++) {
      const c = makeCode(rnd);
      expect(c).toHaveLength(6);
      expect(isMapCode(c), c).toBe(true);
    }
    expect(isMapCode('ABC1O0')).toBe(false);
    expect(normalizeCode(' ab-c 23z ')).toBe('ABC23Z');
    expect(hashText('ABC234')).toBe(hashText('ABC234'));
    expect(hashText('ABC234')).not.toBe(hashText('ABC235'));
  });

  it('Gelände geht als Base64 hin und zurück', () => {
    const data = generateValley(64, 64, 5);
    const back = mapToData(coreFromData(data));
    expect(back.w).toBe(64);
    expect(Array.from(back.ground)).toEqual(Array.from(data.ground));
    expect(back.sources).toEqual(data.sources);
    expect(back.sinks).toEqual(data.sinks);
    expect(back.start).toBe(-1);
    const flat = mapToData(flatMap(32, 40, 5));
    expect(flat.ground.length).toBe(32 * 40);
    expect(flat.ground.every((g) => g === 5)).toBe(true);
  });

  it('prüft Karten und Ziele', () => {
    const m = valleyMap();
    const ok = validateMap(JSON.parse(JSON.stringify(m)));
    expect(ok).not.toBeNull();
    expect(ok!.name).toBe('Tal 5');
    expect(ok!.sources.length).toBe(m.sources.length);
    expect(validateMap({ ...m, w: 63 })).toBeNull();
    expect(validateMap({ ...m, sources: [{ index: -1, rate: 1 }] })).toBeNull();
    expect(validateMap({ ...m, goal: { kind: 'clan', population: 0, year: 1 } })).toBeNull();
    expect(validateMap({ ...m, name: 'x'.repeat(80) })!.name).toHaveLength(40);
    expect(validateMap({ ...m, code: 'ABC234' })!.code).toBe('ABC234');
    expect(validateMap({ ...m, code: 'abc' })!.code).toBeUndefined();
    expect(validateGoal(null)).toBeNull();
    expect(validateGoal({ kind: 'clan', population: 12.4, year: 3 })).toEqual({ kind: 'clan', population: 12, year: 3 });
    expect(validateGoal({ kind: 'stausee', cells: 60, depth: 2.3, days: 2, population: 12 })).toEqual({ kind: 'stausee', cells: 60, depth: 2.5, days: 2, population: 12 });
    expect(validateGoal({ kind: 'quatsch' })).toBeUndefined();
  });

  it('eine eigene Karte spielt sich mit ihrem Gelände und dem gesetzten Start', () => {
    const map = valleyMap(9);
    const sc = customScenario(map);
    expect(sc.id).toBe(CUSTOM_ID);
    expect(sc.custom).toBe(map);
    const auto = World.fromScenario(sc);
    expect(Array.from(auto.ground)).toEqual(Array.from(mapToData(map).ground));
    auto.settle();
    expect(auto.citizens.count()).toBe(6);
    const lager = [...auto.buildings.alive()].find((b) => b.def === 'lager')!;
    // eine andere Stelle suchen, an der ein Lager passt, und sie als Start setzen: das Lager steht dann genau dort
    const ctx = { ground: auto.ground, struct: auto.struct, depth: auto.water.depth, sink: auto.water.sink };
    let other = -1;
    for (let y = 4; y < auto.h - 6 && other < 0; y++) {
      for (let x = 4; x < auto.w - 6; x++) {
        if (Math.abs(x - lager.x) + Math.abs(y - lager.y) < 12) continue;
        if (auto.buildings.canPlace('lager', x, y, ctx) === null) {
          other = y * auto.w + x;
          break;
        }
      }
    }
    expect(other).toBeGreaterThanOrEqual(0);
    const fixed = World.fromScenario(customScenario({ ...map, start: other }));
    fixed.settle();
    const lager2 = [...fixed.buildings.alive()].find((b) => b.def === 'lager')!;
    expect(lager2.x).toBe(other % auto.w);
    expect(lager2.y).toBe((other / auto.w) | 0);
    expect(fixed.citizens.count()).toBe(6);
    // ein unmöglicher Start (im Wasser oder zu steil) fällt auf die Suche zurück
    const deep = auto.water.depth.findIndex((d) => d > 0.5);
    const fallback = World.fromScenario(customScenario({ ...map, start: deep }));
    fallback.settle();
    expect([...fallback.buildings.alive()].some((b) => b.def === 'lager')).toBe(true);
  });

  it('Editor: Quelle, Abfluss und Start lassen sich setzen, ohne Editor nicht', () => {
    const world = World.fromScenario(customScenario(valleyMap(5)));
    const cell = 10 * world.w + 10;
    expect(world.apply('quelle', cell)).toBe(false);
    world.editor = true;
    world.settle(false);
    expect(world.citizens.count()).toBe(0);
    const before = world.water.sources.length;
    expect(world.apply('quelle', cell)).toBe(true);
    expect(world.water.sources.length).toBe(before + 1);
    expect(world.apply('quelle', cell)).toBe(true);
    expect(world.water.sources.length).toBe(before);
    expect(world.apply('senke', cell)).toBe(true);
    expect(world.water.sink[cell]).toBe(1);
    expect(world.apply('senke', cell)).toBe(true);
    expect(world.water.sink[cell]).toBe(0);
    const deep = world.water.depth.findIndex((d) => d > 0.5);
    expect(world.apply('start', deep)).toBe(false);
    expect(world.start).toBe(-1);
    const lager = (() => {
      const w2 = World.fromScenario(customScenario(valleyMap(5)));
      w2.settle();
      const l = [...w2.buildings.alive()].find((b) => b.def === 'lager')!;
      return l.y * w2.w + l.x;
    })();
    expect(world.apply('start', lager)).toBe(true);
    expect(world.start).toBe(lager);
    expect(world.stats().startSet).toBe(true);
    expect(world.stats().editor).toBe(true);
    // ohne Bewohner kein Untergang
    runDays(world, 0.1);
    expect(world.outcome).toBeNull();
  });

  it('ein Spielstand bettet die eigene Karte ein (Version 5)', () => {
    const map = { ...valleyMap(7), code: 'ABC234', goal: { kind: 'clan', population: 10, year: 2 } as const };
    const world = World.fromScenario(customScenario(map));
    world.settle();
    runDays(world, 0.5);
    const { data, meta } = serializeWorld(world, 'Test');
    expect(data.v).toBe(5);
    expect(data.custom?.code).toBe('ABC234');
    expect(meta.scenarioName).toBe('Tal 7');
    const back = restoreWorld(JSON.parse(JSON.stringify(data)));
    expect(back.scenario.id).toBe(CUSTOM_ID);
    expect(back.scenario.custom?.name).toBe('Tal 7');
    expect(back.scenario.goal).toEqual({ kind: 'clan', population: 10, year: 2 });
    expect(Array.from(back.ground)).toEqual(Array.from(world.ground));
    expect(back.citizens.count()).toBe(world.citizens.count());
    expect(back.seed).toBe(world.seed);
  });
});
