import type { BuildingId } from '../data/buildings';
import type { SeasonInfo } from './seasons';
import type { Tool, Weather } from './world';

/** Nachrichten vom Hauptthread an den Simulations-Worker */
export type ToWorker =
  | { type: 'init'; w: number; h: number; seed: number; freeBuild?: boolean }
  | { type: 'edit'; tool: Tool; cells: number[]; damHeight: number }
  | { type: 'weather'; weather: Weather }
  | { type: 'speed'; speed: number }
  | { type: 'place'; id: BuildingId; x: number; y: number }
  | { type: 'demolish'; cell: number };

export interface BuildingSnap {
  id: number;
  def: BuildingId;
  x: number;
  y: number;
  size: number;
  built: boolean;
  progress: number;
  workers: number;
  residents: number;
  wood: number;
  berries: number;
  woodDelivered: number;
}

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
  population: number;
  housing: number;
  wood: number;
  berries: number;
  storageCap: number;
  water: number;
  waterCap: number;
  season: SeasonInfo;
}

/** Werte je Bewohner im Float32Array: Id, x, y, z, Blickrichtung, Zustand, Ware */
export const CITIZEN_STRIDE = 7;

/** Nachrichten vom Worker an den Hauptthread */
export type FromWorker =
  | {
      type: 'terrain';
      w: number;
      h: number;
      ground: Uint8Array<ArrayBufferLike>;
      struct: Uint8Array<ArrayBufferLike>;
      gate: Uint8Array<ArrayBufferLike>;
      gateOpen: Uint8Array<ArrayBufferLike>;
      sink: Uint8Array<ArrayBufferLike>;
      version: number;
    }
  | {
      type: 'water';
      depth: Float32Array<ArrayBufferLike>;
      vel: Float32Array<ArrayBufferLike>;
      citizens: Float32Array<ArrayBufferLike>;
      citizenCount: number;
      stats: SimStats;
      messages: string[];
    }
  | {
      type: 'veg';
      trees: Uint8Array<ArrayBufferLike>;
      bushes: Uint8Array<ArrayBufferLike>;
      dry: Uint8Array<ArrayBufferLike>;
      version: number;
    }
  | { type: 'buildings'; list: BuildingSnap[]; version: number };
