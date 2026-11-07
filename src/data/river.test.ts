import { describe, expect, it } from 'vitest';
import { RIVER_MAX, RIVER_MIN, RIVER_MIX, RIVER_STALE_MS, activeDownstreamOf, activeUpstreamOf, downstreamOf, factorFrom, isFresh, riverFactor, upstreamOf, type RiverMember } from './river';

function member(position: number, me = false, outflow = 1, updatedAt = 1000): RiverMember {
  return { userId: `u${position}`, position, player: `Spieler ${position}`, outflow, scenarioName: 'Ottertal', day: 3, year: 1, population: 8, species: 'otter', updatedAt, me };
}

describe('Flusskette', () => {
  it('mischt den Abfluss von oben mit dem Grundwert und begrenzt ihn', () => {
    expect(riverFactor(null)).toBe(1);
    expect(riverFactor(1)).toBeCloseTo(1);
    expect(riverFactor(0)).toBeCloseTo(1 - RIVER_MIX + RIVER_MIX * RIVER_MIN);
    expect(riverFactor(0.5)).toBeCloseTo(1 - RIVER_MIX + RIVER_MIX * 0.5);
    expect(riverFactor(2)).toBeCloseTo(1 + RIVER_MIX);
    expect(riverFactor(100)).toBeCloseTo(1 - RIVER_MIX + RIVER_MIX * RIVER_MAX);
    expect(riverFactor(Number.NaN)).toBe(1);
  });

  it('findet die Nachbarn auch mit Lücken in den Positionen', () => {
    const list = [member(0), member(2, true), member(5), member(7)];
    expect(upstreamOf(list)?.position).toBe(0);
    expect(downstreamOf(list)?.position).toBe(5);
    expect(upstreamOf([member(0, true), member(1)])).toBeNull();
    expect(downstreamOf([member(0), member(3, true)])).toBeNull();
    expect(upstreamOf([member(0), member(1)])).toBeNull();
  });

  it('alte Meldungen zählen nicht', () => {
    const now = 10_000_000;
    expect(isFresh(now - 1000, now)).toBe(true);
    expect(isFresh(now - RIVER_STALE_MS - 1, now)).toBe(false);
    expect(isFresh(0, now)).toBe(false);
    const fresh = [member(0, false, 0.3, now - 5000), member(1, true)];
    expect(factorFrom(fresh, now)).toBeCloseTo(riverFactor(0.3));
    const stale = [member(0, false, 0.3, now - RIVER_STALE_MS * 2), member(1, true)];
    expect(factorFrom(stale, now)).toBe(1);
    expect(factorFrom([member(0, true), member(1, false, 0.3, now)], now)).toBe(1);
  });

  it('überspringt Spieler, die gerade nicht spielen', () => {
    const now = 10_000_000;
    const old = now - RIVER_STALE_MS * 2;
    const list = [member(0, false, 0.5, now), member(1, false, 2, old), member(2, true), member(3, false, 1, old), member(4, false, 1, now)];
    expect(upstreamOf(list)?.position).toBe(1);
    expect(activeUpstreamOf(list, now)?.position).toBe(0);
    expect(factorFrom(list, now)).toBeCloseTo(riverFactor(0.5));
    expect(downstreamOf(list)?.position).toBe(3);
    expect(activeDownstreamOf(list, now)?.position).toBe(4);
    // ganz oben niemand aktiv: normale Quellen
    expect(activeUpstreamOf([member(0, false, 0.5, old), member(1, true)], now)).toBeNull();
    expect(factorFrom([member(0, false, 0.5, old), member(1, true)], now)).toBe(1);
  });
});
