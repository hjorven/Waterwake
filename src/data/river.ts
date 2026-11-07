import type { Species } from './species';

/**
 * Flusskette: Mehrere Spieler bilden einen Fluss. Jeder meldet seinen Abfluss
 * als Anteil am normalen Zufluss der eigenen Karte; der Spieler darunter
 * bekommt daraus seinen Quellfaktor. Die Kette selbst liegt in Supabase
 * (ww_rivers, ww_river_members), hier steht nur die Rechnung dazu.
 */

/** Die Kette, der dieser Browser angehört (liegt unter waterwake.river) */
export interface RiverLink {
  id: string;
  code: string;
  name: string;
}

export interface RiverMember {
  userId: string;
  /** Platz in der Kette, 0 ganz oben */
  position: number;
  player: string;
  /** gemeldeter Abfluss, 1 = der normale Zufluss der eigenen Karte */
  outflow: number;
  scenarioName: string;
  day: number;
  year: number;
  population: number;
  species: Species;
  /** Zeitpunkt der letzten Meldung in ms, 0 wenn nie */
  updatedAt: number;
  me: boolean;
}

export interface RiverInfo extends RiverLink {
  members: RiverMember[];
}

/** So stark schlägt der Abfluss von oben auf die eigenen Quellen durch (Rest ist Grundwert) */
export const RIVER_MIX = 0.6;
/** Grenzen für den gemeldeten Abfluss, damit weder alles versiegt noch alles überschwemmt */
export const RIVER_MIN = 0.2;
export const RIVER_MAX = 3;
/** Eine Meldung, die älter ist, zählt nicht mehr (der Spieler oben spielt gerade nicht) */
export const RIVER_STALE_MS = 15 * 60 * 1000;
/** Abstand zwischen zwei Meldungen in Millisekunden */
export const RIVER_INTERVAL_MS = 60 * 1000;

/**
 * Quellfaktor aus dem Abfluss des Spielers oberhalb: 1 ohne Nachbarn oder
 * Meldung, sonst Grundwert und gemeldeter Anteil gemischt und begrenzt.
 */
export function riverFactor(upstream: number | null): number {
  if (upstream === null || !Number.isFinite(upstream)) return 1;
  const r = Math.max(RIVER_MIN, Math.min(RIVER_MAX, upstream));
  return 1 - RIVER_MIX + RIVER_MIX * r;
}

export function isFresh(updatedAt: number, now = Date.now()): boolean {
  return updatedAt > 0 && now - updatedAt <= RIVER_STALE_MS;
}

/** Der eigene Eintrag */
export function meOf(members: RiverMember[]): RiverMember | null {
  return members.find((m) => m.me) ?? null;
}

/** Nachbar oberhalb: der mit der nächstkleineren Position (Lücken sind erlaubt) */
export function upstreamOf(members: RiverMember[]): RiverMember | null {
  const me = meOf(members);
  if (!me) return null;
  let best: RiverMember | null = null;
  for (const m of members) if (m.position < me.position && (!best || m.position > best.position)) best = m;
  return best;
}

/** Nachbar unterhalb: der mit der nächstgrößeren Position */
export function downstreamOf(members: RiverMember[]): RiverMember | null {
  const me = meOf(members);
  if (!me) return null;
  let best: RiverMember | null = null;
  for (const m of members) if (m.position > me.position && (!best || m.position < best.position)) best = m;
  return best;
}

/** Nächster Spieler oberhalb, der gerade spielt; wer nicht meldet, wird übersprungen */
export function activeUpstreamOf(members: RiverMember[], now = Date.now()): RiverMember | null {
  return upstreamOf(members.filter((m) => m.me || isFresh(m.updatedAt, now)));
}

/** Nächster Spieler unterhalb, der gerade spielt: er bekommt das eigene Wasser */
export function activeDownstreamOf(members: RiverMember[], now = Date.now()): RiverMember | null {
  return downstreamOf(members.filter((m) => m.me || isFresh(m.updatedAt, now)));
}

/** Der Quellfaktor, der sich aus einer Kette für den eigenen Platz ergibt */
export function factorFrom(members: RiverMember[], now = Date.now()): number {
  const up = activeUpstreamOf(members, now);
  return riverFactor(up ? up.outflow : null);
}
