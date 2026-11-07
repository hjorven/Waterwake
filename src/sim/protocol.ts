import type { BuildingId } from '../data/buildings';
import type { Stock } from '../data/goods';
import type { TechId } from '../data/tech';
import type { SaveGame, SaveMeta } from './save';
import type { Tool, Weather, WorldStats } from './world';

/** Nachrichten vom Hauptthread an den Simulations-Worker */
export type ToWorker =
  | { type: 'init'; scenario: string; seed: number; w: number; h: number; freeBuild?: boolean; unlockAll?: boolean }
  | { type: 'load'; data: SaveGame }
  | { type: 'save'; slot: string; name: string }
  | { type: 'edit'; tool: Tool; cells: number[]; damHeight: number }
  | { type: 'weather'; weather: Weather }
  | { type: 'speed'; speed: number }
  | { type: 'place'; id: BuildingId; x: number; y: number }
  | { type: 'demolish'; cell: number }
  | { type: 'research'; tech: TechId }
  /** alles freischalten (Baukasten) */
  | { type: 'unlock' };

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
  /** Vorrat (Lager) */
  stock: Stock;
  /** Anteil der gelieferten Baustoffe 0..1 */
  delivered: number;
  /** gelieferte Baustoffe je Ware */
  deliveredGoods: Stock;
  /** Reife der Ernte 0..1 */
  growth: number;
  flooded: boolean;
  damage: number;
  /** erzeugter Strom (Wasserrad, Laufrad) oder Anteil der Versorgung (Verbraucher) */
  power: number;
  /** Floßanleger: was das Floß gerade tut */
  raftText?: string;
  /** Floßanleger: Lager des Bezirks, leer wenn keins im Umkreis steht */
  district?: string;
}

export interface SimStats extends WorldStats {
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

/** Werte je Bewohner im Float32Array: Id, x, y, z, Blickrichtung, Zustand, Ware, Größe, krank */
export const CITIZEN_STRIDE = 9;
/** Werte je Floß im Float32Array: Id, x, y, z, Blickrichtung, Ware, Menge */
export const RAFT_STRIDE = 7;

/** Nachrichten vom Worker an den Hauptthread */
export type FromWorker =
  | { type: 'ready'; w: number; h: number; scenario: string; loaded: boolean }
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
      /** Verschmutzung je Zelle, null solange alles sauber ist */
      pollution: Float32Array<ArrayBufferLike> | null;
      citizens: Float32Array<ArrayBufferLike>;
      citizenCount: number;
      rafts: Float32Array<ArrayBufferLike>;
      raftCount: number;
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
  | { type: 'buildings'; list: BuildingSnap[]; version: number }
  | { type: 'saved'; slot: string; name: string; data: SaveGame; meta: SaveMeta };
