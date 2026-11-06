import { describe, expect, it } from 'vitest';
import { WaterSim } from './water';
import { World } from './world';

function basin(w: number, h: number, wall: number): WaterSim {
  const sim = new WaterSim(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      sim.terrain[y * w + x] = edge ? wall : 0;
    }
  }
  return sim;
}

describe('WaterSim', () => {
  it('erhält das Volumen in einem geschlossenen Becken', () => {
    const sim = basin(12, 12, 10);
    sim.depth[5 * 12 + 5] = 20;
    const before = sim.totalVolume();
    for (let i = 0; i < 2000; i++) sim.step(0.05);
    expect(sim.totalVolume()).toBeCloseTo(before, 3);
  });

  it('gleicht die Wasseroberfläche aus', () => {
    const sim = basin(12, 12, 10);
    sim.depth[5 * 12 + 5] = 20;
    for (let i = 0; i < 6000; i++) sim.step(0.05);
    const inner: number[] = [];
    for (let y = 1; y < 11; y++) for (let x = 1; x < 11; x++) inner.push(sim.depth[y * 12 + x]);
    const min = Math.min(...inner);
    const max = Math.max(...inner);
    expect(max - min).toBeLessThan(0.01);
    expect(min).toBeCloseTo(0.2, 2);
  });

  it('wird nie negativ und bleibt endlich', () => {
    const sim = basin(16, 16, 4);
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) sim.terrain[y * 16 + x] = (x * 7 + y * 3) % 5;
    sim.depth[8 * 16 + 8] = 50;
    for (let i = 0; i < 3000; i++) sim.step(0.05);
    for (const d of sim.depth) {
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });

  it('lässt Wasser über Senken abfließen', () => {
    const sim = basin(10, 10, 5);
    sim.sink[5 * 10 + 9] = 1;
    sim.terrain[5 * 10 + 9] = 0;
    sim.depth[5 * 10 + 2] = 10;
    for (let i = 0; i < 4000; i++) sim.step(0.05);
    expect(sim.totalVolume()).toBeLessThan(0.5);
    expect(sim.drained).toBeGreaterThan(9);
  });

  it('Verdunstung leert flaches Wasser', () => {
    const sim = basin(8, 8, 5);
    for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) sim.depth[y * 8 + x] = 0.05;
    sim.evaporation = 0.01;
    for (let i = 0; i < 200; i++) sim.step(0.05);
    expect(sim.totalVolume()).toBe(0);
  });
});

describe('World', () => {
  it('erzeugt dieselbe Karte für denselben Seed', () => {
    const a = World.generate(64, 64, 42);
    const b = World.generate(64, 64, 42);
    expect(Array.from(a.ground)).toEqual(Array.from(b.ground));
  });

  it('der Fluss erreicht den Südrand', () => {
    const world = World.generate(96, 96, 7);
    for (let i = 0; i < 4000; i++) world.step();
    expect(world.water.drained).toBeGreaterThan(0);
  });

  it('ein Damm quer durchs Tal staut Wasser auf', () => {
    const open = World.generate(96, 96, 7);
    const dammed = World.generate(96, 96, 7);
    dammed.freeBuild = true;
    // Damm über die ganze Breite in Zeile 50
    for (let x = 0; x < 96; x++) dammed.apply('damm', 50 * 96 + x, 6);
    for (let i = 0; i < 4000; i++) {
      open.step();
      dammed.step();
    }
    let upOpen = 0;
    let upDammed = 0;
    for (let i = 0; i < 50 * 96; i++) {
      upOpen += open.water.depth[i];
      upDammed += dammed.water.depth[i];
    }
    expect(upDammed).toBeGreaterThan(upOpen * 1.5);
  });

  it('Dürre stoppt die Quellen', () => {
    const world = World.generate(64, 64, 3);
    world.forceWeather('duerre');
    for (let i = 0; i < 100; i++) world.step();
    expect(world.water.added).toBe(0);
  });

  it('Werkzeuge ändern Gelände und Dämme', () => {
    const world = World.generate(32, 32, 1);
    world.freeBuild = true;
    const i = 10 * 32 + 10;
    const g = world.ground[i];
    world.apply('anheben', i);
    expect(world.ground[i]).toBe(Math.min(16, g + 1));
    world.apply('damm', i, 3);
    expect(world.struct[i]).toBe(Math.min(3, 16 - world.ground[i]));
    world.apply('abreissen', i);
    expect(world.struct[i]).toBe(0);
    expect(world.water.terrain[i]).toBe(world.ground[i]);
  });
});
