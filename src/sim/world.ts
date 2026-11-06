import { generateValley, MAX_HEIGHT, type MapData } from './terrain';
import { WaterSim } from './water';

export type Weather = 'normal' | 'schmelze' | 'duerre';
export type Tool = 'anheben' | 'absenken' | 'damm' | 'abreissen';

export const WEATHER_INFO: Record<Weather, { sourceFactor: number; evaporation: number; label: string }> = {
  normal: { sourceFactor: 1, evaporation: 0.0015, label: 'Normalzeit' },
  schmelze: { sourceFactor: 3, evaporation: 0.0008, label: 'Schneeschmelze' },
  duerre: { sourceFactor: 0, evaporation: 0.012, label: 'Dürre' },
};

/** Maximale Höhe eines Dammes über dem Boden */
export const MAX_DAM = 6;

/** Simulationsschritt in Sekunden; mehrere Schritte pro Bild */
export const SIM_DT = 0.05;

export class World {
  readonly w: number;
  readonly h: number;
  readonly ground: Uint8Array;
  /** Höhe von Bauwerken (Damm) über dem Boden */
  readonly struct: Uint8Array;
  readonly water: WaterSim;
  weather: Weather = 'normal';
  /** vergangene Simulationszeit in Sekunden */
  time = 0;
  /** Version des Geländes, steigt bei jeder Änderung */
  terrainVersion = 0;

  constructor(map: MapData) {
    this.w = map.w;
    this.h = map.h;
    this.ground = map.ground.slice();
    this.struct = new Uint8Array(map.w * map.h);
    this.water = new WaterSim(map.w, map.h);
    for (const s of map.sources) this.water.sources.push({ ...s });
    for (const i of map.sinks) this.water.sink[i] = 1;
    this.syncTerrain();
    this.setWeather('normal');
  }

  static generate(w: number, h: number, seed: number): World {
    return new World(generateValley(w, h, seed));
  }

  setWeather(weather: Weather): void {
    this.weather = weather;
    const info = WEATHER_INFO[weather];
    this.water.sourceFactor = info.sourceFactor;
    this.water.evaporation = info.evaporation;
  }

  step(dt = SIM_DT): void {
    this.water.step(dt);
    this.time += dt;
  }

  height(i: number): number {
    return this.ground[i] + this.struct[i];
  }

  private syncTerrain(): void {
    const t = this.water.terrain;
    for (let i = 0; i < t.length; i++) t[i] = this.ground[i] + this.struct[i];
    this.terrainVersion++;
  }

  /**
   * Wendet ein Werkzeug auf eine Zelle an. Gibt true zurück, wenn sich
   * etwas geändert hat.
   */
  apply(tool: Tool, i: number, damHeight = 2): boolean {
    if (i < 0 || i >= this.ground.length) return false;
    const g = this.ground[i];
    const s = this.struct[i];
    let changed = false;
    switch (tool) {
      case 'anheben':
        if (s === 0 && g < MAX_HEIGHT) {
          this.ground[i] = g + 1;
          changed = true;
        }
        break;
      case 'absenken':
        if (s > 0) {
          this.struct[i] = 0;
          changed = true;
        } else if (g > 0) {
          this.ground[i] = g - 1;
          changed = true;
        }
        break;
      case 'damm': {
        const target = Math.max(1, Math.min(MAX_DAM, damHeight, MAX_HEIGHT - g));
        if (s !== target && g + target <= MAX_HEIGHT) {
          this.struct[i] = target;
          changed = true;
        }
        break;
      }
      case 'abreissen':
        if (s > 0) {
          this.struct[i] = 0;
          changed = true;
        }
        break;
    }
    if (changed) {
      this.water.terrain[i] = this.ground[i] + this.struct[i];
      // Wasser, das jetzt im Bauwerk "steckt", wird verdrängt: Es bleibt
      // als Tiefe auf der Zelle und fließt im nächsten Schritt ab.
      this.terrainVersion++;
    }
    return changed;
  }
}
