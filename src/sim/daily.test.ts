import { describe, expect, it } from 'vitest';
import { DAILY_ID, dailyDateText, dailyKey, dailyScenario, dailyScore, dailyTerrain, isDayKey } from '../data/daily';
import { scenarioById } from '../data/maps';
import { restoreWorld, serializeWorld } from './save';
import { DAY } from './seasons';
import { World } from './world';

function runDays(world: World, days: number): void {
  const steps = Math.round((days * DAY) / 0.05);
  for (let i = 0; i < steps; i++) world.step(0.05);
}

describe('Tageskarte', { timeout: 180000 }, () => {
  it('Schlüssel und Datum nach Weltzeit', () => {
    expect(dailyKey(new Date(Date.UTC(2026, 10, 7, 23, 59)))).toBe('20261107');
    expect(dailyKey(new Date(Date.UTC(2026, 0, 1)))).toBe('20260101');
    expect(isDayKey('20261107')).toBe(true);
    expect(isDayKey(20261107)).toBe(true);
    expect(isDayKey(7)).toBe(false);
    expect(isDayKey(dailyKey())).toBe(true);
    expect(dailyDateText('20261107')).toBe('7.11.2026');
  });

  it('Wertung: 10 je Tag, 5 je Otter', () => {
    expect(dailyScore(12, 7)).toBe(155);
    expect(dailyScore(0, 6)).toBe(30);
    expect(dailyScore(-1, 0)).toBe(0);
  });

  it('dasselbe Datum ergibt dieselbe Karte, ein anderes eine andere', () => {
    const a = dailyScenario('20261107');
    expect(a.id).toBe(DAILY_ID);
    expect(a.seed).toBe(20261107);
    expect(a.name).toBe('Tageskarte 7.11.2026');
    expect(a.goal).toBeNull();
    expect(dailyScenario('20261107').terrain).toEqual(a.terrain);
    expect(dailyTerrain('20261108')).not.toEqual(a.terrain);
    expect(scenarioById(DAILY_ID, 20261108).name).toBe('Tageskarte 8.11.2026');
    // ohne gültigen Schlüssel: die Karte von heute
    expect(scenarioById(DAILY_ID, 0).seed).toBe(Number(dailyKey()));
  });

  it('eine Woche Tageskarten ist begehbar, mit Startlager und Abfluss', () => {
    for (let d = 7; d <= 13; d++) {
      const key = `202611${String(d).padStart(2, '0')}`;
      const world = World.fromScenario(dailyScenario(key));
      world.settle();
      expect(world.citizens.count(), key).toBe(6);
      expect([...world.buildings.alive()].some((b) => b.def === 'lager'), key).toBe(true);
      const n = world.w * world.h;
      for (let i = 0; i < n; i++) {
        if (i % world.w + 1 < world.w) expect(Math.abs(world.ground[i] - world.ground[i + 1]), key).toBeLessThanOrEqual(1);
        if (i + world.w < n) expect(Math.abs(world.ground[i] - world.ground[i + world.w]), key).toBeLessThanOrEqual(1);
      }
      world.water.drained = 0;
      runDays(world, 1);
      expect(world.water.drained, key).toBeGreaterThan(50);
    }
  });

  it('ein Spielstand auf der Tageskarte kennt die Karte wieder', () => {
    const world = World.fromScenario(dailyScenario('20261107'));
    world.settle();
    runDays(world, 0.5);
    const back = restoreWorld(serializeWorld(world, 'Test').data);
    expect(back.scenario.id).toBe(DAILY_ID);
    expect(back.scenario.name).toBe('Tageskarte 7.11.2026');
    expect(back.seed).toBe(20261107);
    expect(back.citizens.count()).toBe(world.citizens.count());
  });
});
