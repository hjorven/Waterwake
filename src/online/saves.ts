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

export function formatSavedAt(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
