import { describe, expect, it } from 'vitest';
import { DAY, MUD_YEAR, Seasons } from './seasons';
import type { Weather } from './world';

describe('Seasons', () => {
  it('bringt die Schlammflut erst ab Jahr 3, dann nach jeder Schmelze', () => {
    const seasons = new Seasons(11);
    const phases = new Map<number, Weather[]>();
    let guard = 0;
    while (seasons.year <= MUD_YEAR + 1 && guard++ < 1_000_000) {
      const change = seasons.step(DAY / 4);
      if (change) {
        const list = phases.get(seasons.year) ?? [];
        list.push(change);
        phases.set(seasons.year, list);
      }
    }
    for (let y = 1; y < MUD_YEAR; y++) expect(phases.get(y) ?? []).not.toContain('schlamm');
    const third = phases.get(MUD_YEAR) ?? [];
    expect(third).toContain('schlamm');
    expect(third.indexOf('schlamm')).toBe(third.indexOf('schmelze') + 1);
  });

  it('kündigt die nächste Phase passend an und überlebt Speichern', () => {
    const seasons = new Seasons(5);
    for (let i = 0; i < 400; i++) seasons.step(DAY / 4);
    const info = seasons.info();
    expect(info.nextMin).toBeLessThanOrEqual(info.nextMax);
    const copy = new Seasons(5);
    copy.restore(seasons.save());
    expect(copy.info()).toEqual(info);
    for (let i = 0; i < 200; i++) {
      const a = seasons.step(DAY / 4);
      const b = copy.step(DAY / 4);
      expect(b).toBe(a);
    }
  });
});
