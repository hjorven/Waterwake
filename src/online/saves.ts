import { MAX_MAPS, validateMap, type CustomMap } from '../data/custom';
import type { SaveGame, SaveMeta } from '../sim/save';

/** Lokale Spielstände im Browser (localStorage) */
export const LOCAL_SLOTS = ['auto', '1', '2', '3'];
const PREFIX = 'waterwake.save.';
const SETTINGS_KEY = 'waterwake.settings';

export interface SaveEntry {
  slot: string;
  meta: SaveMeta;
}

export interface Settings {
  /** Miniatur-Unschärfe (Tilt-Shift) und Farbanpassung */
  tiltShift: boolean;
  shadows: boolean;
}

export function slotLabel(slot: string): string {
  return slot === 'auto' ? 'Automatisch' : `Platz ${slot}`;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLocalMeta(slot: string): SaveMeta | null {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(`${PREFIX}${slot}.meta`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveMeta;
  } catch {
    return null;
  }
}

export function listLocalSaves(): SaveEntry[] {
  const out: SaveEntry[] = [];
  for (const slot of LOCAL_SLOTS) {
    const meta = readLocalMeta(slot);
    if (meta) out.push({ slot, meta });
  }
  return out;
}

export function readLocalSave(slot: string): SaveGame | null {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(`${PREFIX}${slot}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveGame;
  } catch {
    return null;
  }
}

/** Gibt false zurück, wenn der Speicher voll oder gesperrt ist */
export function writeLocalSave(slot: string, data: SaveGame, meta: SaveMeta): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(`${PREFIX}${slot}`, JSON.stringify(data));
    s.setItem(`${PREFIX}${slot}.meta`, JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}

export function deleteLocalSave(slot: string): void {
  const s = storage();
  if (!s) return;
  s.removeItem(`${PREFIX}${slot}`);
  s.removeItem(`${PREFIX}${slot}.meta`);
}

export function loadSettings(): Settings {
  const def: Settings = { tiltShift: true, shadows: true };
  const s = storage();
  if (!s) return def;
  try {
    const raw = s.getItem(SETTINGS_KEY);
    return raw ? { ...def, ...(JSON.parse(raw) as Partial<Settings>) } : def;
  } catch {
    return def;
  }
}

export function saveSettings(settings: Settings): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // voll oder gesperrt: dann eben nicht
  }
}

const CAMPAIGN_KEY = 'waterwake.campaign';

/** Gewonnene Kampagnenkarten (Ids) */
export function loadCampaign(): string[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(CAMPAIGN_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Sieg auf einer Karte merken; gibt die neue Liste zurück */
export function markCampaignWon(id: string): string[] {
  const won = loadCampaign();
  if (!won.includes(id)) won.push(id);
  const s = storage();
  if (s) {
    try {
      s.setItem(CAMPAIGN_KEY, JSON.stringify(won));
    } catch {
      // kein Platz: der Fortschritt gilt nur für diese Sitzung
    }
  }
  return won;
}

export function formatSavedAt(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const NAME_KEY = 'waterwake.name';

/** Spielername für die Bestenliste, höchstens 20 Zeichen */
export function loadName(): string {
  const s = storage();
  if (!s) return '';
  try {
    return (s.getItem(NAME_KEY) ?? '').slice(0, 20);
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(NAME_KEY, name.trim().slice(0, 20));
  } catch {
    // voll oder gesperrt: dann eben nicht
  }
}

const MAPS_KEY = 'waterwake.maps';

/** Eigene und heruntergeladene Karten im Browser, neueste zuerst */
export function loadMaps(): CustomMap[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(MAPS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    const out: CustomMap[] = [];
    for (const m of list) {
      const v = validateMap(m);
      if (v) out.push(v);
    }
    return out;
  } catch {
    return [];
  }
}

function writeMaps(list: CustomMap[]): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(MAPS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Karte anlegen oder die mit derselben Kennung ersetzen; false, wenn kein Platz ist */
export function upsertMap(map: CustomMap): boolean {
  const list = loadMaps();
  const k = list.findIndex((m) => m.id === map.id);
  if (k >= 0) list[k] = map;
  else {
    if (list.length >= MAX_MAPS) return false;
    list.unshift(map);
  }
  return writeMaps(list);
}

export function deleteMap(id: string): void {
  writeMaps(loadMaps().filter((m) => m.id !== id));
}
