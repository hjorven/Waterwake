import type { SupabaseClient } from '@supabase/supabase-js';
import { makeCode, validateMap, type CustomMap, type SharedMapInfo } from '../data/custom';
import type { RiverInfo, RiverLink, RiverMember } from '../data/river';
import { isSpecies } from '../data/species';
import type { SaveGame, SaveMeta } from '../sim/save';
import type { SaveEntry } from './saves';

/**
 * Cloud-Spielstände in Supabase. Der Spieler wird anonym angemeldet, die
 * Spielstände liegen in `ww_saves` und sind nur für ihn lesbar (RLS).
 * Der Publishable Key darf öffentlich sein.
 */
const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://qkcvqzzaxmoktaqsiujv.supabase.co';
const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_GGtXWtbiTHxS2ussD2egxw_RvzhgPfO';
export const CLOUD_SLOTS = [1, 2, 3];

let clientPromise: Promise<SupabaseClient> | null = null;

/** Die Bibliothek wird erst geladen, wenn die Cloud wirklich benutzt wird */
function client(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then((m) =>
      m.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'waterwake.auth' },
      }),
    );
  }
  return clientPromise;
}

interface Row {
  slot: number;
  name: string;
  scenario: string;
  scenario_name: string;
  day: number;
  year: number;
  population: number;
  updated_at: string;
}

/** Anmelden (anonym) und die Nutzer-Id zurückgeben */
export async function cloudConnect(): Promise<string> {
  const c = await client();
  const { data } = await c.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await c.auth.signInAnonymously();
  if (error) throw new Error(error.message);
  if (!signed.user) throw new Error('Anmeldung ohne Nutzer');
  return signed.user.id;
}

export async function cloudList(): Promise<SaveEntry[]> {
  const c = await client();
  const { data, error } = await c.from('ww_saves').select('slot,name,scenario,scenario_name,day,year,population,updated_at').order('slot');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((r) => ({
    slot: `cloud:${r.slot}`,
    meta: {
      name: r.name,
      scenario: r.scenario,
      scenarioName: r.scenario_name,
      day: r.day,
      year: r.year,
      population: r.population,
      savedAt: Date.parse(r.updated_at),
    },
  }));
}

export async function cloudUpload(slot: number, data: SaveGame, meta: SaveMeta): Promise<void> {
  const c = await client();
  const userId = await cloudConnect();
  const { error } = await c.from('ww_saves').upsert(
    {
      user_id: userId,
      slot,
      name: meta.name,
      scenario: meta.scenario,
      scenario_name: meta.scenarioName,
      day: meta.day,
      year: meta.year,
      population: meta.population,
      data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,slot' },
  );
  if (error) throw new Error(error.message);
}

export async function cloudDownload(slot: number): Promise<SaveGame> {
  const c = await client();
  const { data, error } = await c.from('ww_saves').select('data').eq('slot', slot).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Kein Spielstand auf diesem Platz');
  return (data as { data: SaveGame }).data;
}

export async function cloudDelete(slot: number): Promise<void> {
  const c = await client();
  const { error } = await c.from('ww_saves').delete().eq('slot', slot);
  if (error) throw new Error(error.message);
}

// --- Tageskarte: Bestenliste in ww_daily --------------------------------------

export interface DailyRow {
  name: string;
  score: number;
  days: number;
  population: number;
  /** die eigene Zeile */
  me: boolean;
}

export interface DailyBoard {
  /** die besten zehn des Tages */
  rows: DailyRow[];
  /** eigener Platz, wenn schon eine Wertung abgegeben wurde */
  me: { rank: number; score: number; days: number; population: number } | null;
  /** Spieler mit Wertung an diesem Tag */
  total: number;
}

export interface DailyResult {
  /** beste Wertung des Tages, die jetzt zählt */
  score: number;
  rank: number;
  total: number;
  /** die abgegebene Wertung war besser als die bisherige */
  improved: boolean;
}

interface DailyRaw {
  user_id: string;
  name: string;
  score: number;
  days: number;
  population: number;
}

/** Nutzer-Id, falls in diesem Browser schon ein Konto besteht; legt keins an */
export async function cloudUserId(): Promise<string | null> {
  const c = await client();
  const { data } = await c.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Besteht in diesem Browser schon ein Konto? Lädt die Bibliothek nicht */
export function cloudHasAccount(): boolean {
  try {
    return !!window.localStorage.getItem('waterwake.auth');
  } catch {
    return false;
  }
}

async function dailyRank(c: SupabaseClient, key: string, score: number): Promise<number> {
  const { count, error } = await c.from('ww_daily').select('*', { count: 'exact', head: true }).eq('day_key', key).gt('score', score);
  if (error) throw new Error(error.message);
  return (count ?? 0) + 1;
}

async function dailyTotal(c: SupabaseClient, key: string): Promise<number> {
  const { count, error } = await c.from('ww_daily').select('*', { count: 'exact', head: true }).eq('day_key', key);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Die besten zehn des Tages und der eigene Platz; lesen geht ohne Konto */
export async function dailyBoard(key: string): Promise<DailyBoard> {
  const c = await client();
  const me = await cloudUserId();
  const { data, error } = await c
    .from('ww_daily')
    .select('user_id,name,score,days,population')
    .eq('day_key', key)
    .order('score', { ascending: false })
    .order('updated_at', { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as DailyRaw[]).map((r) => ({ name: r.name, score: r.score, days: r.days, population: r.population, me: r.user_id === me }));
  const total = await dailyTotal(c, key);
  let mine: DailyBoard['me'] = null;
  if (me) {
    const { data: own, error: e2 } = await c.from('ww_daily').select('score,days,population').eq('day_key', key).eq('user_id', me).maybeSingle();
    if (e2) throw new Error(e2.message);
    if (own) {
      const o = own as { score: number; days: number; population: number };
      mine = { rank: await dailyRank(c, key, o.score), score: o.score, days: o.days, population: o.population };
    }
  }
  return { rows, me: mine, total };
}

/** Wertung abgeben; nur die beste des Tages bleibt stehen. Legt bei Bedarf ein anonymes Konto an */
export async function dailySubmit(key: string, name: string, score: number, days: number, population: number): Promise<DailyResult> {
  const c = await client();
  const userId = await cloudConnect();
  const { data: own, error: e1 } = await c.from('ww_daily').select('score').eq('day_key', key).eq('user_id', userId).maybeSingle();
  if (e1) throw new Error(e1.message);
  const old = own ? (own as { score: number }).score : -1;
  const improved = score > old;
  if (improved) {
    const { error } = await c
      .from('ww_daily')
      .upsert({ user_id: userId, day_key: key, name, score, days, population, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day_key' });
    if (error) throw new Error(error.message);
  }
  const best = improved ? score : old;
  return { score: best, rank: await dailyRank(c, key, best), total: await dailyTotal(c, key), improved };
}

// --- Geteilte Karten in ww_maps -----------------------------------------------

interface MapRow {
  code: string;
  name: string;
  author: string;
  w: number;
  h: number;
  ground: string;
  sources: unknown;
  sinks: unknown;
  start: number;
  goal: unknown;
  plays: number;
  created_at: string;
}

/** Karte hochladen; gibt den Code aus sechs Zeichen zurück. Legt bei Bedarf ein anonymes Konto an */
export async function mapUpload(map: CustomMap): Promise<string> {
  const c = await client();
  const userId = await cloudConnect();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    const { error } = await c.from('ww_maps').insert({
      code,
      user_id: userId,
      name: map.name,
      author: map.author,
      w: map.w,
      h: map.h,
      ground: map.ground,
      sources: map.sources,
      sinks: map.sinks,
      start: map.start,
      goal: map.goal,
    });
    if (!error) return code;
    // 23505 = Code schon vergeben, dann einen neuen würfeln
    if (error.code !== '23505') throw new Error(error.message);
  }
  throw new Error('Kein freier Code gefunden, bitte nochmal versuchen');
}

export async function mapDownload(code: string): Promise<CustomMap> {
  const c = await client();
  const { data, error } = await c.from('ww_maps').select('code,name,author,w,h,ground,sources,sinks,start,goal,plays,created_at').eq('code', code).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Keine Karte mit dem Code ${code}`);
  const r = data as MapRow;
  const map = validateMap({
    id: `geteilt:${r.code}`,
    code: r.code,
    name: r.name,
    author: r.author,
    w: r.w,
    h: r.h,
    ground: r.ground,
    sources: r.sources,
    sinks: r.sinks,
    start: r.start,
    goal: r.goal,
    createdAt: Date.parse(r.created_at),
  });
  if (!map) throw new Error('Die Karte ist beschädigt');
  return map;
}

/** Die neuesten geteilten Karten; lesen geht ohne Konto */
export async function mapList(limit = 10): Promise<SharedMapInfo[]> {
  const c = await client();
  const { data, error } = await c.from('ww_maps').select('code,name,author,plays,created_at').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Pick<MapRow, 'code' | 'name' | 'author' | 'plays' | 'created_at'>[]).map((r) => ({
    code: r.code,
    name: r.name,
    author: r.author,
    plays: r.plays,
    createdAt: Date.parse(r.created_at),
  }));
}

/** Zähler der Spiele einer geteilten Karte erhöhen */
export async function mapPlayed(code: string): Promise<void> {
  const c = await client();
  const { error } = await c.rpc('ww_map_played', { p_code: code });
  if (error) throw new Error(error.message);
}

// --- Flusskette ----------------------------------------------------------------

interface RiverRow {
  id: string;
  code: string;
  name: string;
}

interface MemberRow {
  user_id: string;
  position: number;
  player: string;
  outflow: number;
  scenario_name: string;
  day: number;
  year: number;
  population: number;
  species: string;
  updated_at: string;
}

/** Neue Kette anlegen; der Urheber steht ganz oben */
export async function riverCreate(name: string, player: string): Promise<RiverLink> {
  const c = await client();
  await cloudConnect();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    const { data, error } = await c.rpc('ww_river_create', { p_name: name, p_player: player, p_code: code });
    if (!error) return { id: String(data), code, name };
    // 23505 = Code schon vergeben, dann einen neuen würfeln
    if (error.code !== '23505') throw new Error(error.message);
  }
  throw new Error('Kein freier Code gefunden, bitte nochmal versuchen');
}

/** Per Code beitreten, ans untere Ende der Kette */
export async function riverJoin(code: string, player: string): Promise<RiverLink> {
  const c = await client();
  await cloudConnect();
  const { data, error } = await c.rpc('ww_river_join', { p_code: code, p_player: player });
  if (error) throw new Error(error.message);
  const { data: row, error: e2 } = await c.from('ww_rivers').select('id,code,name').eq('id', String(data)).maybeSingle();
  if (e2) throw new Error(e2.message);
  if (!row) throw new Error(`Keine Kette mit dem Code ${code}`);
  const r = row as RiverRow;
  return { id: r.id, code: r.code, name: r.name };
}

/** Kette mit allen Mitgliedern lesen (geht ohne Konto) */
export async function riverInfo(id: string): Promise<RiverInfo> {
  const c = await client();
  const me = await cloudUserId();
  const { data: river, error } = await c.from('ww_rivers').select('id,code,name').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!river) throw new Error('Die Kette gibt es nicht mehr');
  const { data: rows, error: e2 } = await c
    .from('ww_river_members')
    .select('user_id,position,player,outflow,scenario_name,day,year,population,species,updated_at')
    .eq('river_id', id)
    .order('position');
  if (e2) throw new Error(e2.message);
  const members: RiverMember[] = ((rows ?? []) as MemberRow[]).map((r) => ({
    userId: r.user_id,
    position: r.position,
    player: r.player ?? '',
    outflow: Number(r.outflow) || 0,
    scenarioName: r.scenario_name ?? '',
    day: r.day ?? 0,
    year: r.year ?? 0,
    population: r.population ?? 0,
    species: isSpecies(r.species) ? r.species : 'otter',
    updatedAt: Date.parse(r.updated_at) || 0,
    me: r.user_id === me,
  }));
  const rv = river as RiverRow;
  return { id: rv.id, code: rv.code, name: rv.name, members };
}

/** Eigenen Abfluss und Spielstand melden */
export async function riverReport(id: string, share: number, scenarioName: string, day: number, year: number, population: number, species: string): Promise<void> {
  const c = await client();
  await cloudConnect();
  const { error } = await c.rpc('ww_river_report', {
    p_river: id,
    p_outflow: Math.max(0, Math.min(10, share)),
    p_scenario: scenarioName,
    p_day: day,
    p_year: year,
    p_population: population,
    p_species: species,
  });
  if (error) throw new Error(error.message);
}

/** Die Kette verlassen; der eigene Eintrag verschwindet, die anderen rücken nicht nach */
export async function riverLeave(id: string): Promise<void> {
  const c = await client();
  const me = await cloudConnect();
  const { error } = await c.from('ww_river_members').delete().eq('river_id', id).eq('user_id', me);
  if (error) throw new Error(error.message);
}
