import { mulberry32, type Rng } from './rng';
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

/** Gespeicherter Zustand des Jahreslaufs */
export interface SeasonsSave {
  phase: Weather;
  year: number;
  time: number;
  phaseStart: number;
  phaseEnd: number;
  nextLength: number;
  next: Weather;
  nextMin: number;
  nextMax: number;
  slot: number;
  rng: number;
}

/** Ab diesem Jahr folgt auf die Schneeschmelze eine Schlammflut */
export const MUD_YEAR = 3;

/**
 * Jahreslauf: Normalzeit, Schneeschmelze, (ab Jahr 3 Schlammflut),
 * Normalzeit, Dürre. Die Dürre wird mit den Jahren länger, die Flutwelle
 * der Schmelze höher. Die nächste Phase wird mit einer ungefähren Dauer
 * angekündigt.
 */
export class Seasons {
  phase: Weather = 'normal';
  year = 1;
  time = 0;
  /** Beginn und Ende der aktuellen Phase in Sekunden */
  phaseStart = 0;
  phaseEnd: number;
  /** tatsächliche Länge der nächsten Phase in Tagen */
  private nextLength: number;
  next: Weather = 'schmelze';
  nextMin: number;
  nextMax: number;
  private readonly rnd: Rng;
  private slot = 0;
  private nextSlot = 1;

  constructor(seed: number) {
    this.rnd = mulberry32(seed ^ 0x5eed);
    // Die erste Normalzeit ist fest, damit der Start planbar bleibt
    this.phaseEnd = 10 * DAY;
    this.nextLength = this.lengthFor('schmelze');
    [this.nextMin, this.nextMax] = this.announce(this.nextLength);
  }

  /** Nächste Phase bestimmen; die Schlammflut wird vor Jahr 3 übersprungen */
  private pickNext(): void {
    let slot = (this.slot + 1) % Seasons.ORDER.length;
    if (Seasons.ORDER[slot] === 'schlamm' && this.year < MUD_YEAR) slot = (slot + 1) % Seasons.ORDER.length;
    this.nextSlot = slot;
    this.next = Seasons.ORDER[slot];
    this.nextLength = this.lengthFor(this.next);
    [this.nextMin, this.nextMax] = this.announce(this.nextLength);
  }

  private lengthFor(w: Weather): number {
    const r = this.rnd();
    switch (w) {
      case 'normal':
        return 8 + Math.floor(r * 7);
      case 'schmelze':
        return 2 + Math.floor(r * 3);
      case 'schlamm':
        return 2 + Math.floor(r * 4);
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

  private static ORDER: Weather[] = ['normal', 'schmelze', 'schlamm', 'normal', 'duerre'];

  /** gibt die neue Phase zurück, wenn sie gerade gewechselt hat */
  step(dt: number): Weather | null {
    this.time += dt;
    if (this.time < this.phaseEnd) return null;
    this.slot = this.nextSlot;
    this.phase = this.next;
    if (this.phase === 'normal' && this.slot === 0) this.year++;
    this.phaseStart = this.time;
    this.phaseEnd = this.time + this.nextLength * DAY;
    this.pickNext();
    return this.phase;
  }

  /**
   * Quellenfaktor in der Schneeschmelze: beginnt beim Dreifachen und
   * schwillt in der Mitte der Phase zur Flutwelle an, mit den Jahren
   * stärker.
   */
  meltFactor(): number {
    if (this.phase !== 'schmelze') return 1;
    const len = Math.max(1, this.phaseEnd - this.phaseStart);
    const p = Math.max(0, Math.min(1, (this.time - this.phaseStart) / len));
    const peak = Math.min(5, 2 + 1.5 * (this.year - 1));
    return 3 + peak * Math.sin(Math.PI * p);
  }

  /** Stand des Jahreslaufs; mit `exact` (Sternwarte) ist die Dauer der nächsten Phase genau bekannt */
  info(exact = false): SeasonInfo {
    return {
      phase: this.phase,
      year: this.year,
      day: Math.floor(this.time / DAY) + 1,
      daysLeft: Math.max(0, Math.ceil((this.phaseEnd - this.time) / DAY)),
      next: this.next,
      nextMin: exact ? this.nextLength : this.nextMin,
      nextMax: exact ? this.nextLength : this.nextMax,
    };
  }

  save(): SeasonsSave {
    return {
      phase: this.phase,
      year: this.year,
      time: this.time,
      phaseStart: this.phaseStart,
      phaseEnd: this.phaseEnd,
      nextLength: this.nextLength,
      next: this.next,
      nextMin: this.nextMin,
      nextMax: this.nextMax,
      slot: this.slot,
      rng: this.rnd.state,
    };
  }

  restore(s: SeasonsSave): void {
    this.phase = s.phase;
    this.year = s.year;
    this.time = s.time;
    this.phaseStart = s.phaseStart;
    this.phaseEnd = s.phaseEnd;
    this.nextLength = s.nextLength;
    this.next = s.next;
    this.nextMin = s.nextMin;
    this.nextMax = s.nextMax;
    this.slot = s.slot;
    // Platz der angekündigten Phase im Jahreslauf (ältere Spielstände kennen die Schlammflut nicht)
    let slot = (s.slot + 1) % Seasons.ORDER.length;
    while (Seasons.ORDER[slot] !== s.next) slot = (slot + 1) % Seasons.ORDER.length;
    this.nextSlot = slot;
    this.rnd.state = s.rng;
  }
}
