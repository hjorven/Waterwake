import { describe, expect, it } from 'vitest';
import { OTTERTAL } from '../data/maps';
import { restoreWorld, serializeWorld } from './save';
import { DAY } from './seasons';
import { WEATHER_INFO, World } from './world';

function runSeconds(world: World, seconds: number): void {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) world.step(0.05);
}

describe('Flusskette in der Simulation', () => {
  it('der Zufluss von oben wirkt als Faktor auf die Quellen, auch bei Wetterwechsel', () => {
    const world = World.fromScenario(OTTERTAL);
    world.settle();
    const normal = world.water.sourceFactor;
    expect(world.riverFactor).toBe(1);
    world.setRiverFactor(0.5);
    expect(world.water.sourceFactor).toBeCloseTo(normal * 0.5);
    world.forceWeather('duerre');
    expect(world.water.sourceFactor).toBeCloseTo(WEATHER_INFO.duerre.sourceFactor * 0.5);
    world.setRiverFactor(1);
    expect(world.water.sourceFactor).toBeCloseTo(WEATHER_INFO.duerre.sourceFactor);
    world.setRiverFactor(Number.NaN);
    expect(world.riverFactor).toBe(1);
    world.setRiverFactor(99);
    expect(world.riverFactor).toBe(5);
  });

  it('der Abfluss-Zähler misst den Anteil am normalen Zufluss und folgt dem Zufluss von oben', () => {
    const world = World.fromScenario(OTTERTAL);
    world.settle();
    expect(world.sourceBase()).toBeGreaterThan(0);
    // schon beim Einzug gemessen, damit die erste Meldung nicht null ist
    expect(world.outflowShare()).toBeGreaterThan(0.2);
    runSeconds(world, 2 * DAY);
    const share = world.outflowShare();
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(1.3);
    expect(world.stats().outflowShare).toBeCloseTo(share);
    expect(world.stats().riverFactor).toBe(1);
    // weniger Wasser von oben, dann fließt unten auch weniger ab
    world.setRiverFactor(0.3);
    runSeconds(world, 3 * DAY);
    expect(world.outflowShare()).toBeLessThan(share * 0.7);
  });

  it('ein Spielstand bringt die Kette nicht mit: nach dem Laden gilt wieder der Grundwert', () => {
    const world = World.fromScenario(OTTERTAL);
    world.settle();
    world.setRiverFactor(0.4);
    runSeconds(world, 2);
    const back = restoreWorld(serializeWorld(world).data);
    expect(back.riverFactor).toBe(1);
    expect(back.outflowAvg).toBeCloseTo(world.outflowAvg);
    expect(back.water.sourceFactor).toBeCloseTo(WEATHER_INFO[back.weather].sourceFactor);
  });
});
