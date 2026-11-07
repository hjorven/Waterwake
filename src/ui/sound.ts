import type { Weather } from '../sim/world';

/**
 * Klang ohne Dateien: alles kommt aus Web Audio. Ein Rauschen fürs Wasser,
 * das mit dem Wetter lauter und leiser wird, Regen in der Schneeschmelze und
 * kurze Töne für Bauen, Meldungen, Forschung, Sieg und Niederlage.
 *
 * Der Browser erlaubt Ton erst nach einer Eingabe, deshalb entsteht der
 * AudioContext beim ersten Klick oder Tastendruck.
 */

export type MessageTone = 'bad' | 'good' | '';

interface Ambient {
  water: GainNode;
  waterFilter: BiquadFilterNode;
  rain: GainNode;
}

const WEATHER_SOUND: Record<Weather, { water: number; cutoff: number; rain: number }> = {
  normal: { water: 0.5, cutoff: 650, rain: 0 },
  schmelze: { water: 0.9, cutoff: 950, rain: 0.35 },
  duerre: { water: 0.12, cutoff: 420, rain: 0 },
  schlamm: { water: 0.7, cutoff: 480, rain: 0.15 },
};

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private duck: GainNode | null = null;
  private ambient: Ambient | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.6;
  private weather: Weather = 'normal';
  private running = false;
  private quiet = true;
  private dripTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTick = 0;
  private lastDig = 0;

  /** erst nach einer Eingabe darf der Browser Ton machen */
  private gesture = false;

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.gesture = true;
      this.start();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  /** Lautstärke 0..1, 0 schaltet alles ab */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (!this.ctx) {
      this.start();
      return;
    }
    if (this.master) this.master.gain.setTargetAtTime(this.volume * this.volume, this.ctx.currentTime, 0.05);
    if (this.volume > 0 && this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
  }

  /** Spiel läuft (Wasserrauschen an) und ob es gerade still sein soll (Menü oder Pause) */
  setScene(running: boolean, quiet: boolean): void {
    this.running = running;
    this.quiet = quiet;
    this.applyScene();
  }

  setWeather(w: Weather): void {
    this.weather = w;
    this.applyScene();
  }

  // --- kurze Töne -------------------------------------------------------------

  /** Bau abgesetzt: Holzklopfen */
  place(): void {
    if (!this.ready()) return;
    this.burst(0.06, 420, 'bandpass', 0.5);
    this.tone(150, 0.09, 'sine', 0.25);
  }

  /** Erde und Steine bewegt (Wasserbau, Gelände); beim Ziehen nicht öfter als alle 120 ms */
  dig(): void {
    if (!this.ready()) return;
    const now = performance.now();
    if (now - this.lastDig < 120) return;
    this.lastDig = now;
    this.burst(0.12, 240, 'lowpass', 0.45);
  }

  demolish(): void {
    if (!this.ready()) return;
    this.burst(0.18, 180, 'lowpass', 0.5);
    this.tone(90, 0.2, 'triangle', 0.2);
  }

  /** Gebäude fertig: zwei helle Töne */
  built(): void {
    if (!this.ready()) return;
    this.tone(660, 0.12, 'triangle', 0.18);
    this.tone(880, 0.18, 'triangle', 0.18, 0.1);
  }

  research(): void {
    if (!this.ready()) return;
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.16, i * 0.11));
  }

  /** Meldung in der Leiste, je nach Tonfall */
  message(tone: MessageTone): void {
    if (!this.ready()) return;
    // nicht mehr als ein Ton je Viertelsekunde, Meldungen kommen gern gebündelt
    const now = performance.now();
    if (now - this.lastTick < 250) return;
    this.lastTick = now;
    if (tone === 'bad') {
      this.tone(330, 0.14, 'triangle', 0.16);
      this.tone(262, 0.22, 'triangle', 0.16, 0.13);
    } else if (tone === 'good') {
      this.tone(784, 0.14, 'sine', 0.14);
    } else {
      this.tone(1200, 0.035, 'sine', 0.06);
    }
  }

  win(): void {
    if (!this.ready()) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      this.tone(f, i === 3 ? 0.6 : 0.16, 'triangle', 0.2, i * 0.15);
      this.tone(f / 2, i === 3 ? 0.6 : 0.16, 'sine', 0.12, i * 0.15);
    });
  }

  lose(): void {
    if (!this.ready()) return;
    [392, 349, 311, 262].forEach((f, i) => this.tone(f, i === 3 ? 0.7 : 0.26, 'sawtooth', 0.09, i * 0.24, 600));
  }

  achievement(): void {
    if (!this.ready()) return;
    [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.1, 'sine', 0.14, i * 0.07));
    this.tone(2093, 0.5, 'sine', 0.08, 0.3);
  }

  /** Für Browsertests: Zustand des AudioContext und Lautstärke */
  debug(): { state: string; volume: number; weather: Weather; running: boolean; quiet: boolean } {
    return { state: this.ctx ? this.ctx.state : 'none', volume: this.volume, weather: this.weather, running: this.running, quiet: this.quiet };
  }

  // --- Innereien --------------------------------------------------------------

  private ready(): boolean {
    return this.ctx !== null && this.volume > 0 && this.ctx.state === 'running';
  }

  /** AudioContext anlegen, geht nur nach einer Eingabe des Nutzers */
  private start(): void {
    if (this.volume <= 0 || !this.gesture) return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
      return;
    }
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume * this.volume;
    this.master.connect(ctx.destination);
    // nur das Rauschen wird im Menü und in der Pause leiser, kurze Töne gehen direkt hinaus
    this.duck = ctx.createGain();
    this.duck.gain.value = 0;
    this.duck.connect(this.master);
    this.noise = this.makeNoise(ctx);
    this.ambient = this.makeAmbient(ctx, this.duck);
    this.applyScene();
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  }

  /** Zwei Sekunden Rauschen, das sich ohne Knacken wiederholen lässt */
  private makeNoise(ctx: AudioContext): AudioBuffer {
    const n = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private makeAmbient(ctx: AudioContext, out: AudioNode): Ambient {
    // Wasser: Rauschen, tief gefiltert, mit langsamem Auf und Ab
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'lowpass';
    waterFilter.frequency.value = 650;
    waterFilter.Q.value = 0.7;
    const water = ctx.createGain();
    water.gain.value = 0;
    src.connect(waterFilter).connect(water).connect(out);
    src.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.17;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(waterFilter.frequency);
    lfo.start();
    // Regen: hoch gefiltertes Rauschen, dazu einzelne Tropfen
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = this.noise;
    rainSrc.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 2600;
    const rain = ctx.createGain();
    rain.gain.value = 0;
    rainSrc.connect(rainFilter).connect(rain).connect(out);
    rainSrc.start();
    return { water, waterFilter, rain };
  }

  private applyScene(): void {
    if (!this.ctx || !this.ambient || !this.duck) return;
    const t = this.ctx.currentTime;
    const w = WEATHER_SOUND[this.weather];
    const on = this.running ? 1 : 0;
    this.duck.gain.setTargetAtTime(this.quiet ? 0.25 : 1, t, 0.3);
    this.ambient.water.gain.setTargetAtTime(w.water * 0.35 * on, t, 1.5);
    this.ambient.waterFilter.frequency.setTargetAtTime(w.cutoff, t, 2);
    this.ambient.rain.gain.setTargetAtTime(w.rain * 0.3 * on, t, 2);
    const drips = this.running && w.rain > 0;
    if (drips && !this.dripTimer) this.scheduleDrip();
    if (!drips && this.dripTimer) {
      clearTimeout(this.dripTimer);
      this.dripTimer = null;
    }
  }

  private scheduleDrip(): void {
    this.dripTimer = setTimeout(() => {
      this.dripTimer = null;
      if (!this.running || WEATHER_SOUND[this.weather].rain <= 0) return;
      if (this.ready() && !this.quiet) this.tone(1500 + Math.random() * 1800, 0.05, 'sine', 0.05);
      this.scheduleDrip();
    }, 120 + Math.random() * 500);
  }

  /** Ein Ton mit kurzem Anschlag und Ausklang; cutoff filtert harte Wellenformen */
  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, cutoff = 0): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = osc;
    if (cutoff > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      node = osc.connect(f);
    }
    node.connect(env).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** Kurzes Rauschen durch einen Filter, für Klopfen und Poltern */
  private burst(dur: number, freq: number, type: BiquadFilterType, gain: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 1.2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(env).connect(this.master!);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.02);
  }
}
