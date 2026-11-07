import { decodeBytes, encodeBytes } from '../sim/codec';
import type { MapData } from '../sim/terrain';
import type { Goal, Scenario } from './maps';

/** Kennung eigener und geteilter Karten; die Karte selbst reist als `custom` im Szenario mit */
export const CUSTOM_ID = 'eigene';
/** Quellstärke je Zelle, die der Editor setzt */
export const EDITOR_SOURCE_RATE = 1.5;
export const MAP_NAME_MAX = 40;
export const AUTHOR_MAX = 20;
/** so viele eigene Karten passen in den Browser */
export const MAX_MAPS = 24;
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Gelände einer Karte, wie der Editor es liefert */
export interface MapCore {
  w: number;
  h: number;
  /** Bodenhöhen 0 bis 16 als Base64 */
  ground: string;
  sources: { index: number; rate: number }[];
  sinks: number[];
  /** Zelle des Startlagers (links oben), -1 = das Spiel sucht selbst */
  start: number;
}

export interface CustomMap extends MapCore {
  /** lokale Kennung */
  id: string;
  /** Code aus sechs Zeichen, wenn geteilt oder heruntergeladen */
  code?: string;
  name: string;
  author: string;
  goal: Goal | null;
  /** Unix-Zeit in ms */
  createdAt: number;
}

/** Kurzinfo einer geteilten Karte für Listen */
export interface SharedMapInfo {
  code: string;
  name: string;
  author: string;
  plays: number;
  createdAt: number;
}

export function mapToData(m: MapCore): MapData {
  return { w: m.w, h: m.h, ground: decodeBytes(m.ground), sources: m.sources.map((s) => ({ ...s })), sinks: [...m.sinks], start: m.start };
}

export function coreFromData(d: MapData): MapCore {
  return { w: d.w, h: d.h, ground: encodeBytes(d.ground), sources: d.sources.map((s) => ({ ...s })), sinks: [...d.sinks], start: d.start ?? -1 };
}

/** Leere, ebene Karte zum Selberbauen */
export function flatMap(w: number, h: number, height = 5): MapCore {
  return { w, h, ground: encodeBytes(new Uint8Array(w * h).fill(height)), sources: [], sinks: [], start: -1 };
}

export function newMapId(): string {
  return `k${Date.now().toString(36)}${Math.floor(Math.random() * 46656)
    .toString(36)
    .padStart(3, '0')}`;
}

/** Zahl aus einem Text (FNV-1a), als Seed für Jahreslauf und Zufall einer Karte */
export function hashText(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function customScenario(m: CustomMap): Scenario {
  const who = m.author ? `von ${m.author}` : 'von einem unbekannten Otter';
  return {
    id: CUSTOM_ID,
    name: m.name || 'Eigene Karte',
    seed: hashText(m.code ?? m.id),
    w: m.w,
    h: m.h,
    intro: [
      `Eine Karte ${who}${m.code ? ` (Code ${m.code})` : ''}.`,
      m.goal ? 'Erreicht das Ziel, das die Karte vorgibt.' : 'Die Karte hat kein Ziel: Überlebt so lange ihr könnt und baut den Clan aus.',
    ],
    goal: m.goal,
    custom: m,
  };
}

export function makeCode(rnd: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS.charAt(Math.floor(rnd() * CODE_CHARS.length) % CODE_CHARS.length);
  return s;
}

export function normalizeCode(s: string): string {
  return s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isMapCode(s: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(s);
}

/** undefined = ungültig, null = kein Ziel */
export function validateGoal(g: unknown): Goal | null | undefined {
  if (g === null || g === undefined) return null;
  if (typeof g !== 'object') return undefined;
  const o = g as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : undefined);
  if (o.kind === 'clan') {
    const population = int(o.population, 1, 500);
    const year = int(o.year, 1, 20);
    if (population === undefined || year === undefined) return undefined;
    return { kind: 'clan', population, year };
  }
  if (o.kind === 'stausee') {
    const cells = int(o.cells, 1, 5000);
    const days = int(o.days, 1, 30);
    const population = int(o.population, 0, 500);
    const depth = typeof o.depth === 'number' && o.depth >= 0.5 && o.depth <= 8 ? Math.round(o.depth * 2) / 2 : undefined;
    if (cells === undefined || days === undefined || population === undefined || depth === undefined) return undefined;
    return { kind: 'stausee', cells, depth, days, population };
  }
  return undefined;
}

/** Prüft eine Karte aus dem Browser oder der Cloud und gibt sie bereinigt zurück, sonst null */
export function validateMap(raw: unknown): CustomMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const w = m.w;
  const h = m.h;
  if (typeof w !== 'number' || typeof h !== 'number' || !Number.isInteger(w) || !Number.isInteger(h)) return null;
  if (w < 32 || h < 32 || w > 128 || h > 128) return null;
  if (typeof m.ground !== 'string') return null;
  let ground: Uint8Array;
  try {
    ground = decodeBytes(m.ground);
  } catch {
    return null;
  }
  const n = w * h;
  if (ground.length !== n) return null;
  for (let i = 0; i < n; i++) if (ground[i] > 16) return null;
  const inRange = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n;
  if (!Array.isArray(m.sources) || m.sources.length > 64) return null;
  const sources: { index: number; rate: number }[] = [];
  for (const s of m.sources as unknown[]) {
    if (!s || typeof s !== 'object') return null;
    const { index, rate } = s as Record<string, unknown>;
    if (!inRange(index) || typeof rate !== 'number' || !(rate > 0 && rate <= 10)) return null;
    sources.push({ index, rate });
  }
  if (!Array.isArray(m.sinks) || m.sinks.length > 512) return null;
  const sinks: number[] = [];
  for (const s of m.sinks as unknown[]) {
    if (!inRange(s)) return null;
    sinks.push(s);
  }
  const start = inRange(m.start) ? m.start : -1;
  const goal = validateGoal(m.goal);
  if (goal === undefined) return null;
  const name = typeof m.name === 'string' ? m.name.trim().slice(0, MAP_NAME_MAX) : '';
  const author = typeof m.author === 'string' ? m.author.trim().slice(0, AUTHOR_MAX) : '';
  const id = typeof m.id === 'string' && m.id ? m.id.slice(0, 40) : newMapId();
  const code = typeof m.code === 'string' && isMapCode(m.code) ? m.code : undefined;
  const createdAt = typeof m.createdAt === 'number' && Number.isFinite(m.createdAt) ? m.createdAt : Date.now();
  const out: CustomMap = { id, name: name || 'Eigene Karte', author, w, h, ground: m.ground, sources, sinks, start, goal, createdAt };
  if (code) out.code = code;
  return out;
}
