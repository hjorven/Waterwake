import { BUILDINGS, type BuildingCategory, type BuildingId } from './buildings';
import { CAMPAIGN, MOLCH_CAMPAIGN } from './maps';
import { SPECIES, type Species } from './species';
import type { TechId } from './tech';

/**
 * Errungenschaften: kleine Ziele über alle Spiele hinweg. Sie liegen nur im
 * Browser (waterwake.achievements) und werden aus dem laufenden Spiel, den
 * gewonnenen Kampagnenkarten und ein paar Zählern berechnet.
 */

export type AchievementGroup = 'siedlung' | 'jahreslauf' | 'bauten' | 'wasserbau' | 'kampagne' | 'welt';

export const GROUP_NAMES: Record<AchievementGroup, string> = {
  siedlung: 'Siedlung',
  jahreslauf: 'Jahreslauf',
  bauten: 'Bauten und Forschung',
  wasserbau: 'Wasserbau',
  kampagne: 'Kampagne',
  welt: 'Weite Welt',
};

export const GROUP_ORDER: AchievementGroup[] = ['siedlung', 'jahreslauf', 'bauten', 'wasserbau', 'kampagne', 'welt'];

/** Zähler über alle Spiele hinweg */
export interface AchievementCounters {
  /** begonnene Spiele (ohne geladene Spielstände und Editor) */
  games: number;
  /** überstandene Dürren */
  droughts: number;
  /** Schneeschmelzen ohne Verlust eines Gebäudes */
  floods: number;
  /** überstandene Schlammfluten */
  muds: number;
  /** Tage mit eingetragener Wertung auf der Tageskarte */
  dailyDays: number;
  /** der letzte Tag mit Wertung, damit ein Tag nur einmal zählt */
  lastDaily: string;
  mapsShared: number;
  customPlayed: number;
  riverJoined: number;
}

export interface AchievementState {
  /** Zeitpunkt (ms) je erreichter Errungenschaft */
  unlocked: Record<string, number>;
  counters: AchievementCounters;
}

export function emptyCounters(): AchievementCounters {
  return { games: 0, droughts: 0, floods: 0, muds: 0, dailyDays: 0, lastDaily: '', mapsShared: 0, customPlayed: 0, riverJoined: 0 };
}

export function emptyState(): AchievementState {
  return { unlocked: {}, counters: emptyCounters() };
}

/** Blick auf das laufende Spiel, so weit die Errungenschaften ihn brauchen */
export interface GameView {
  species: Species;
  population: number;
  births: number;
  deaths: number;
  lostToFlood: number;
  mood: number;
  year: number;
  techs: TechId[];
  toolBonus: boolean;
  raftTrips: number;
  powerSupply: number;
  waterCap: number;
  outcome: 'won' | 'lost' | null;
  goalKind: 'clan' | 'stausee' | null;
  /** fertige Gebäude je Art */
  built: Partial<Record<BuildingId, number>>;
  /** Zellen mit Damm oder Deich */
  damCells: number;
  /** Zellen mit Schleusentor */
  gateCells: number;
}

export interface AchievementCtx {
  /** null, wenn gerade kein Spiel läuft (oder der Editor) */
  game: GameView | null;
  /** gewonnene Kampagnenkarten */
  won: string[];
  counters: AchievementCounters;
}

export interface AchievementDef {
  id: string;
  group: AchievementGroup;
  title: string;
  text: string;
  check(ctx: AchievementCtx): boolean;
}

function builtCount(view: GameView, ids: BuildingId[]): number {
  let n = 0;
  for (const id of ids) n += view.built[id] ?? 0;
  return n;
}

function builtTotal(view: GameView): number {
  let n = 0;
  for (const v of Object.values(view.built)) n += v ?? 0;
  return n;
}

function builtInCategory(view: GameView, cat: BuildingCategory): boolean {
  for (const [id, n] of Object.entries(view.built)) if ((n ?? 0) > 0 && BUILDINGS[id as BuildingId].category === cat) return true;
  return false;
}

/** Prüfung, die ein laufendes Spiel braucht */
function inGame(f: (g: GameView) => boolean): (ctx: AchievementCtx) => boolean {
  return (ctx) => ctx.game !== null && f(ctx.game);
}

const HOMES: BuildingId[] = ['huette', 'pfahlhaus', 'langhaus', 'molchhoehle', 'grotte'];
const CATEGORIES: BuildingCategory[] = ['siedlung', 'freude', 'versorgung', 'nahrung', 'strom'];

export const ACHIEVEMENTS: AchievementDef[] = [
  // --- Siedlung ---------------------------------------------------------------
  { id: 'erstes-dach', group: 'siedlung', title: 'Erstes Dach', text: 'Eine Wohnhütte oder Molchhöhle fertig gebaut.', check: inGame((g) => builtCount(g, HOMES) >= 1) },
  { id: 'kleiner-clan', group: 'siedlung', title: 'Kleiner Clan', text: 'Zehn Bewohner auf einmal.', check: inGame((g) => g.population >= 10) },
  { id: 'grosser-clan', group: 'siedlung', title: 'Großer Clan', text: 'Zwanzig Bewohner auf einmal.', check: inGame((g) => g.population >= 20) },
  { id: 'flussstadt', group: 'siedlung', title: 'Flussstadt', text: 'Vierzig Bewohner auf einmal.', check: inGame((g) => g.population >= 40) },
  { id: 'nachwuchs', group: 'siedlung', title: 'Nachwuchs', text: 'Das erste Junge ist da.', check: inGame((g) => g.births >= 1) },
  { id: 'kinderstube', group: 'siedlung', title: 'Kinderstube', text: 'Zehn Junge in einem Spiel.', check: inGame((g) => g.births >= 10) },
  { id: 'zufrieden', group: 'siedlung', title: 'Rundum zufrieden', text: 'Stimmung über 90 % bei mindestens zwölf Bewohnern.', check: inGame((g) => g.mood > 0.9 && g.population >= 12) },
  { id: 'behuetet', group: 'siedlung', title: 'Behütet', text: 'Jahr 2 erreicht, ohne dass jemand gestorben ist.', check: inGame((g) => g.year >= 2 && g.deaths === 0) },
  // --- Jahreslauf -------------------------------------------------------------
  { id: 'erstes-jahr', group: 'jahreslauf', title: 'Ein Jahr am Fluss', text: 'Jahr 2 erreicht.', check: inGame((g) => g.year >= 2) },
  { id: 'alteingesessen', group: 'jahreslauf', title: 'Alteingesessen', text: 'Jahr 4 erreicht.', check: inGame((g) => g.year >= 4) },
  { id: 'durch-die-duerre', group: 'jahreslauf', title: 'Durch die Dürre', text: 'Eine Dürre überstanden.', check: (ctx) => ctx.counters.droughts >= 1 },
  { id: 'flutsicher', group: 'jahreslauf', title: 'Flutsicher', text: 'Eine Schneeschmelze, ohne dass das Hochwasser ein Gebäude wegreißt.', check: (ctx) => ctx.counters.floods >= 1 },
  { id: 'schlammfest', group: 'jahreslauf', title: 'Schlammfest', text: 'Eine Schlammflut überstanden.', check: (ctx) => ctx.counters.muds >= 1 },
  // --- Bauten und Forschung -----------------------------------------------------
  { id: 'baumeister', group: 'bauten', title: 'Baumeister', text: 'Zehn fertige Gebäude auf einmal.', check: inGame((g) => builtTotal(g) >= 10) },
  { id: 'stadtplaner', group: 'bauten', title: 'Stadtplaner', text: 'Dreißig fertige Gebäude auf einmal.', check: inGame((g) => builtTotal(g) >= 30) },
  { id: 'von-allem-etwas', group: 'bauten', title: 'Von allem etwas', text: 'Fertige Gebäude aus Siedlung, Freude, Versorgung, Nahrung und Strom.', check: inGame((g) => CATEGORIES.every((c) => builtInCategory(g, c))) },
  { id: 'unter-strom', group: 'bauten', title: 'Unter Strom', text: 'Das erste Kraftwerk liefert Strom.', check: inGame((g) => g.powerSupply > 0) },
  { id: 'gut-geruestet', group: 'bauten', title: 'Gut gerüstet', text: 'Werkzeug für alle Arbeiter.', check: inGame((g) => g.toolBonus) },
  { id: 'floesser', group: 'bauten', title: 'Flößer', text: 'Die erste Floßlieferung ist angekommen.', check: inGame((g) => g.raftTrips >= 1) },
  { id: 'gelehrt', group: 'bauten', title: 'Gelehrt', text: 'Die erste Technik erforscht.', check: inGame((g) => g.techs.length >= 1) },
  { id: 'allwissend', group: 'bauten', title: 'Allwissend', text: 'Alle Techniken des Volkes erforscht.', check: inGame((g) => SPECIES[g.species].techs.every((t) => g.techs.includes(t))) },
  { id: 'sterngucker', group: 'bauten', title: 'Sterngucker', text: 'Eine Sternwarte gebaut.', check: inGame((g) => builtCount(g, ['sternwarte']) >= 1) },
  { id: 'weitblick', group: 'bauten', title: 'Weitblick', text: 'Einen Aussichtsturm gebaut.', check: inGame((g) => builtCount(g, ['aussichtsturm']) >= 1) },
  { id: 'steinkunst', group: 'bauten', title: 'Steinkunst', text: 'Eine Grotte gebaut.', check: inGame((g) => builtCount(g, ['grotte']) >= 1) },
  // --- Wasserbau --------------------------------------------------------------
  { id: 'dammbauer', group: 'wasserbau', title: 'Dammbauer', text: 'Das erste Stück Damm oder Deich steht.', check: inGame((g) => g.damCells >= 1) },
  { id: 'deichgraf', group: 'wasserbau', title: 'Deichgraf', text: 'Vierzig Zellen Wasserbau auf einer Karte.', check: inGame((g) => g.damCells >= 40) },
  { id: 'schleusenwaerter', group: 'wasserbau', title: 'Schleusenwärter', text: 'Eine Schleuse gebaut.', check: inGame((g) => g.gateCells >= 1) },
  { id: 'klares-wasser', group: 'wasserbau', title: 'Klares Wasser', text: 'Sandfilter oder Kiesbecken gebaut.', check: inGame((g) => builtCount(g, ['sandfilter', 'kiesbecken']) >= 1) },
  { id: 'vorratshaltung', group: 'wasserbau', title: 'Vorratshaltung', text: 'Wasserspeicher für 100 Einheiten.', check: inGame((g) => g.waterCap >= 100) },
  { id: 'seebauer', group: 'wasserbau', title: 'Seebauer', text: 'Ein Stausee-Ziel erfüllt.', check: inGame((g) => g.outcome === 'won' && g.goalKind === 'stausee') },
  // --- Kampagne ---------------------------------------------------------------
  { id: 'erste-heimat', group: 'kampagne', title: 'Erste Heimat', text: 'Das Ottertal gewonnen.', check: (ctx) => ctx.won.includes('ottertal') },
  { id: 'otterkampagne', group: 'kampagne', title: 'Otterkampagne', text: 'Alle fünf Karten der Otter gewonnen.', check: (ctx) => CAMPAIGN.every((s) => ctx.won.includes(s.id)) },
  { id: 'molchkampagne', group: 'kampagne', title: 'Molchkampagne', text: 'Alle drei Karten der Molche gewonnen.', check: (ctx) => MOLCH_CAMPAIGN.every((s) => ctx.won.includes(s.id)) },
  { id: 'herr-der-fluesse', group: 'kampagne', title: 'Herr der Flüsse', text: 'Alle Kampagnenkarten gewonnen.', check: (ctx) => [...CAMPAIGN, ...MOLCH_CAMPAIGN].every((s) => ctx.won.includes(s.id)) },
  // --- Weite Welt -------------------------------------------------------------
  { id: 'tagesgast', group: 'welt', title: 'Tagesgast', text: 'Eine Wertung auf der Tageskarte eingetragen.', check: (ctx) => ctx.counters.dailyDays >= 1 },
  { id: 'stammgast', group: 'welt', title: 'Stammgast', text: 'Wertungen an fünf verschiedenen Tagen.', check: (ctx) => ctx.counters.dailyDays >= 5 },
  { id: 'landschaftsgaertner', group: 'welt', title: 'Landschaftsgärtner', text: 'Eine eigene Karte gespielt.', check: (ctx) => ctx.counters.customPlayed >= 1 },
  { id: 'kartenzeichner', group: 'welt', title: 'Kartenzeichner', text: 'Eine Karte geteilt.', check: (ctx) => ctx.counters.mapsShared >= 1 },
  { id: 'flussnachbar', group: 'welt', title: 'Flussnachbar', text: 'Eine Flusskette angelegt oder einer beigetreten.', check: (ctx) => ctx.counters.riverJoined >= 1 },
  { id: 'molchvolk', group: 'welt', title: 'Molchvolk', text: 'Zehn Molche in einer Siedlung.', check: inGame((g) => g.species === 'molch' && g.population >= 10) },
];

export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;

/** Alle noch offenen Errungenschaften prüfen; gibt die neu erreichten zurück und trägt sie ein */
export function evaluate(state: AchievementState, ctx: AchievementCtx, now = Date.now()): AchievementDef[] {
  const fresh: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (state.unlocked[a.id]) continue;
    if (a.check(ctx)) {
      state.unlocked[a.id] = now;
      fresh.push(a);
    }
  }
  return fresh;
}

export function unlockedCount(state: AchievementState): number {
  return ACHIEVEMENTS.filter((a) => state.unlocked[a.id]).length;
}

/** Zustand aus dem Speicher lesen, unbekannte oder kaputte Teile werden verworfen */
export function parseState(raw: unknown): AchievementState {
  const st = emptyState();
  if (!raw || typeof raw !== 'object') return st;
  const r = raw as { unlocked?: unknown; counters?: unknown };
  if (r.unlocked && typeof r.unlocked === 'object') {
    for (const [k, v] of Object.entries(r.unlocked as Record<string, unknown>)) {
      if (typeof v === 'number' && v > 0 && ACHIEVEMENTS.some((a) => a.id === k)) st.unlocked[k] = v;
    }
  }
  if (r.counters && typeof r.counters === 'object') {
    const c = r.counters as Record<string, unknown>;
    for (const k of Object.keys(st.counters) as (keyof AchievementCounters)[]) {
      const v = c[k];
      if (k === 'lastDaily') {
        if (typeof v === 'string') st.counters.lastDaily = v;
      } else if (typeof v === 'number' && Number.isFinite(v) && v >= 0) st.counters[k] = Math.floor(v);
    }
  }
  return st;
}
