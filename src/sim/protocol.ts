import type { Tool, Weather } from './world';

/** Nachrichten vom Hauptthread an den Simulations-Worker */
export type ToWorker =
  | { type: 'init'; w: number; h: number; seed: number }
  | { type: 'edit'; tool: Tool; cells: number[]; damHeight: number }
  | { type: 'weather'; weather: Weather }
  | { type: 'speed'; speed: number };

export interface SimStats {
  /** Spielzeit in Sekunden Simulation */
  time: number;
  weather: Weather;
  speed: number;
  /** gesamtes Wasservolumen auf der Karte */
  volume: number;
  /** Zufluss der Quellen pro Sekunde */
  inflow: number;
  /** Abfluss über den Kartenrand pro Sekunde */
  outflow: number;
  /** Verdunstung pro Sekunde */
  evaporation: number;
  /** Rechenzeit pro Simulationsschritt in ms */
  stepMs: number;
}

/** Nachrichten vom Worker an den Hauptthread */
export type FromWorker =
  | { type: 'terrain'; w: number; h: number; ground: Uint8Array<ArrayBufferLike>; struct: Uint8Array<ArrayBufferLike>; version: number }
  | { type: 'water'; depth: Float32Array<ArrayBufferLike>; vel: Float32Array<ArrayBufferLike>; stats: SimStats };
