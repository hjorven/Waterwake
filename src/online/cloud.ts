import type { SupabaseClient } from '@supabase/supabase-js';
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
