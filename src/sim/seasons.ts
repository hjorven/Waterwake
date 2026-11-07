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

/** Jahreslauf einer Karte: Dauer der Phasen in Tagen und Stärke der Flutwelle */
export interface SeasonProfile {
  normal: [number, number];
  schmelze: [number, number];
  schlamm: [number, number];
  /** Dürre: Dauer in Jahr 1, Zuwachs je Jahr und Obergrenzen */
  duerre: { min: number; max: number; growMin: number; growMax: number; capMin: number; capMax: number };
  /** Flutwelle der Schmelze: Spitze über dem Grundwert 3 in Jahr 1, Zuwachs je Jahr, Obergrenze */
  melt: { peak: number; grow: number; cap: number };
  /** ab diesem Jahr kommt die Schlammflut, Vorgabe MUD_YEAR */
  mudYear?: number;
}

export const DEFAULT_SEASONS: SeasonProfile = {
  normal: [8, 14],
  schmelze: [2, 4],
  schlamm: [2, 5],
  duerre: { min: 4, max: 8, growMin: 1, growMax: 2, capMin: 10, capMax: 12 },
  melt: { peak: 2, grow: 1.5, cap: 5 },
};

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
  private readonly profile: SeasonProfile;
  private slot = 0;
  private nextSlot = 1;

  constructor(seed: number, profile: SeasonProfile = DEFAULT_SEASONS) {
    this.rnd = mulberry32(seed ^ 0x5eed);
    this.profile = profile;
    // Die erste Normalzeit ist fest, damit der Start planbar bleibt
    this.phaseEnd = 10 * DAY;
    this.nextLength = this.lengthFor('schmelze');
    [this.nextMin, this.nextMax] = this.announce(this.nextLength);
  }

  /** Nächste Phase bestimmen; die Schlammflut wird vor Jahr 3 übersprungen */
  private pickNext(): void {
    let slot = (this.slot + 1) % Seasons.ORDER.length;
    if (Seasons.ORDER[slot] === 'schlamm' && this.year < (this.profile.mudYear ?? MUD_YEAR)) slot = (slot + 1) % Seasons.ORDER.length;
    this.nextSlot = slot;
    this.next = Seasons.ORDER[slot];
    this.nextLength = this.lengthFor(this.next);
    [this.nextMin, this.nextMax] = this.announce(this.nextLength);
  }

  private lengthFor(w: Weather): number {
    const r = this.rnd();
    const p = this.profile;
    const span = (lo: number, hi: number) => lo + Math.floor(r * (Math.max(lo, hi) - lo + 1));
    switch (w) {
      case 'normal':
        return span(p.normal[0], p.normal[1]);
      case 'schmelze':
        return span(p.schmelze[0], p.schmelze[1]);
      case 'schlamm':
        return span(p.schlamm[0], p.schlamm[1]);
      case 'duerre': {
        const d = p.duerre;
        const min = Math.min(d.capMin, d.min + (this.year - 1) * d.growMin);
        const max = Math.min(d.capMax, d.max + (this.year - 1) * d.growMax);
        return span(min, max);
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
    const m = this.profile.melt;
    const peak = Math.min(m.cap, m.peak + m.grow * (this.year - 1));
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
