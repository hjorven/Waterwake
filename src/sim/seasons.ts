import { mulberry32 } from './rng';
import type { Weather } from './world';

/** Länge eines Spieltags in Simulationssekunden */
export const DAY = 60;

export interface SeasonInfo {
  phase: Weather;
  /** Jahr, beginnt bei 1 */
  year: number;
  /** Tag seit Spielbeginn, beginnt bei 1 */
  day: number;
  /** verbleibende Tage der aktuellen Phase (gerundet) */
  daysLeft: number;
  /** nächste Phase und angekündigte Dauer */
  next: Weather;
  nextMin: number;
  nextMax: number;
}

/**
 * Jahreslauf: Normalzeit, Schneeschmelze, Normalzeit, Dürre. Die Dürre
 * wird mit den Jahren länger. Die nächste Phase wird mit einer
 * ungefähren Dauer angekündigt.
 */
export class Seasons {
  phase: Weather = 'normal';
  year = 1;
  time = 0;
  /** Ende der aktuellen Phase in Sekunden */
  phaseEnd: number;
  /** tatsächliche Länge der nächsten Phase in Tagen */
  private nextLength: number;
  next: Weather = 'schmelze';
  nextMin: number;
  nextMax: number;
  private readonly rnd: () => number;
  private slot = 0;

  constructor(seed: number) {
    this.rnd = mulberry32(seed ^ 0x5eed);
    // Die erste Normalzeit ist fest, damit der Start planbar bleibt
    this.phaseEnd = 10 * DAY;
    this.nextLength = this.lengthFor('schmelze');
    [this.nextMin, this.nextMax] = this.announce(this.nextLength);
  }

  private lengthFor(w: Weather): number {
    const r = this.rnd();
    switch (w) {
      case 'normal':
        return 8 + Math.floor(r * 7);
      case 'schmelze':
        return 2 + Math.floor(r * 3);
      case 'duerre': {
        const min = Math.min(10, 3 + this.year);
        const max = Math.min(12, 6 + this.year * 2);
        return min + Math.floor(r * (max - min + 1));
      }
    }
  }

  private announce(len: number): [number, number] {
    const lo = Math.max(1, len - 1 - Math.floor(this.rnd() * 2));
    const hi = len + Math.floor(this.rnd() * 2);
    return [lo, hi];
  }

  private static ORDER: Weather[] = ['normal', 'schmelze', 'normal', 'duerre'];

  /** gibt die neue Phase zurück, wenn sie gerade gewechselt hat */
  step(dt: number): Weather | null {
    this.time += dt;
    if (this.time < this.phaseEnd) return null;
    this.slot = (this.slot + 1) % Seasons.ORDER.length;
    this.phase = this.next;
    if (this.phase === 'normal' && this.slot === 0) this.year++;
    this.phaseEnd = this.time + this.nextLength * DAY;
    this.next = Seasons.ORDER[(this.slot + 1) % Seasons.ORDER.length];
    this.nextLength = this.lengthFor(this.next);
    [this.nextMin, this.nextMax] = this.announce(this.nextLength);
    return this.phase;
  }

  info(): SeasonInfo {
    return {
      phase: this.phase,
      year: this.year,
      day: Math.floor(this.time / DAY) + 1,
      daysLeft: Math.max(0, Math.ceil((this.phaseEnd - this.time) / DAY)),
      next: this.next,
      nextMin: this.nextMin,
      nextMax: this.nextMax,
    };
  }
}
