import { mulberry32 } from '../sim/rng';
import type { ValleyParams } from '../sim/terrain';
import type { Scenario } from './maps';

/** Kennung der Tageskarte; ihr Seed ist der Tagesschlüssel, zum Beispiel 20261107 */
export const DAILY_ID = 'tageskarte';

/** Tagesschlüssel nach Weltzeit (UTC), damit alle Spieler dieselbe Karte bekommen */
export function dailyKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function isDayKey(key: string | number): boolean {
  return /^20\d{6}$/.test(String(key));
}

/** 20261107 wird zu 7.11.2026 */
export function dailyDateText(key: string): string {
  return `${Number(key.slice(6, 8))}.${Number(key.slice(4, 6))}.${key.slice(0, 4)}`;
}

/** Wertung: 10 Punkte je überstandenem Tag, 5 je lebendem Otter */
export function dailyScore(days: number, population: number): number {
  return Math.max(0, Math.floor(days)) * 10 + Math.max(0, Math.floor(population)) * 5;
}

/** Form des Tals, aus dem Datum gewürfelt; alle Werte liegen im Bereich der Kampagnenkarten */
export function dailyTerrain(key: string): Partial<ValleyParams> {
  const rnd = mulberry32(Number(key) ^ 0x5eed);
  const between = (lo: number, hi: number) => Math.round((lo + rnd() * (hi - lo)) * 100) / 100;
  const meander: [number, number] = [between(0.09, 0.16), between(0.05, 0.1)];
  const gorge = between(0.3, 1.6);
  const gorgeAt = between(0.3, 0.65);
  const bedTop = between(6, 9);
  const drop = between(3.5, 7.5);
  const halfBed = between(1.8, 3);
  const slope = between(0.3, 0.55);
  const hills = between(6, 10);
  const hillNoise = between(5, 7);
  const sourceRate = between(1.3, 2.2);
  const withTributary = rnd() < 0.4;
  const side: 'west' | 'east' = rnd() < 0.5 ? 'west' : 'east';
  const at = between(0.3, 0.6);
  const rate = between(1.2, 1.8);
  return {
    meander,
    gorge,
    gorgeAt,
    bedTop,
    drop,
    halfBed,
    slope,
    hills,
    hillNoise,
    pools: true,
    sourceRate,
    tributary: withTributary ? { side, at, rate } : null,
  };
}

/** Die Tageskarte: ohne Bauziel, es zählt die Wertung in der Bestenliste */
export function dailyScenario(key: string): Scenario {
  const text = dailyDateText(key);
  return {
    id: DAILY_ID,
    name: `Tageskarte ${text}`,
    seed: Number(key),
    w: 96,
    h: 96,
    intro: [
      `Jeden Tag ein neues Tal, für alle Spieler dasselbe. Heute ist es die Karte vom ${text}.`,
      'Es gibt kein Bauziel. Es zählt, wie lange der Clan durchhält und wie groß er wird: 10 Punkte je überstandenem Tag und 5 je lebendem Otter.',
      'Die Wertung lässt sich jederzeit im Menü abgeben, nur die beste des Tages zählt. Morgen gibt es eine neue Karte.',
    ],
    goal: null,
    terrain: dailyTerrain(key),
    hint: 'Erst Pumpe und Tank, dann Hütten. Dürre und Flutwelle werden jedes Jahr härter.',
  };
}
