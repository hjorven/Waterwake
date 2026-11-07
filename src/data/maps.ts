import type { SeasonProfile } from '../sim/seasons';
import type { ValleyParams } from '../sim/terrain';
import type { CustomMap } from './custom';
import { SPECIES, type Species } from './species';
import { DAILY_ID, dailyKey, dailyScenario, isDayKey } from './daily';

/** Spielziel einer Karte. Freies Spiel hat keins. */
export type Goal =
  | {
      kind: 'clan';
      /** so viele Otter müssen gleichzeitig leben */
      population: number;
      /** und dieses Jahr muss erreicht sein */
      year: number;
    }
  | {
      kind: 'stausee';
      /** so viele Zellen müssen mindestens `depth` tief unter Wasser stehen */
      cells: number;
      depth: number;
      /** und zwar ununterbrochen so viele Tage lang */
      days: number;
      population: number;
      /** und dieses Jahr muss erreicht sein (fehlt: ab dem ersten) */
      year?: number;
    };

export interface Scenario {
  id: string;
  name: string;
  seed: number;
  w: number;
  h: number;
  /** Einleitung, ein Absatz je Eintrag */
  intro: string[];
  goal: Goal | null;
  /** Form des Tals, Vorgabe = Ottertal */
  terrain?: Partial<ValleyParams>;
  /** Jahreslauf, Vorgabe = wie Ottertal */
  seasons?: SeasonProfile;
  /** ungefähre Spielzeit in Minuten */
  minutes?: number;
  /** Tipp für den Anfang, erscheint im Intro */
  hint?: string;
  /** eigene oder geteilte Karte: das Gelände kommt aus dieser Karte statt aus dem Generator */
  custom?: CustomMap;
  /** Volk, Vorgabe Otter */
  species?: Species;
}

export const OTTERTAL: Scenario = {
  id: 'ottertal',
  name: 'Das Ottertal',
  seed: 7,
  w: 96,
  h: 96,
  intro: [
    'Nach einem langen Winter erreicht der Otterclan ein Tal mit einem Fluss, der aus den Bergen kommt. Das Land ist fruchtbar, aber der Fluss ist launisch.',
    'In der Schneeschmelze schwillt er zur Flutwelle an und reißt Hütten am Ufer mit. In der Dürre versiegen die Quellen, und wer keinen Vorrat hat, verdurstet.',
    'Baut Deiche gegen das Hochwasser, Tanks und Stauseen gegen die Dürre, und gebt dem Clan Hütten und Freude, damit er wächst.',
  ],
  goal: { kind: 'clan', population: 16, year: 3 },
  minutes: 45,
  hint: 'Zuerst Pumpe und Tank, dann Hütten. Vor der Schmelze Deiche am Ufer.',
};

export const SCHLUCHT: Scenario = {
  id: 'schlucht',
  name: 'Die Schlucht',
  seed: 23,
  w: 96,
  h: 96,
  intro: [
    'Der Clan zieht flussaufwärts in ein enges Tal. In der Mitte zwängt sich der Fluss durch eine Schlucht aus Fels, die Hänge sind steil, Platz zum Bauen ist knapp.',
    'Die Alten erzählen von einem See, der hier einmal lag. Ein Damm in der Schlucht würde ihn zurückbringen: Wasser für jede Dürre, und Fische in Hülle und Fülle.',
    'Staut den Fluss in der Schlucht, bis ein See mit tiefem Wasser entsteht, und haltet ihn zwei Tage lang in der Normalzeit. Die Flutwelle der Schmelze zählt nicht, sie läuft wieder ab.',
  ],
  goal: { kind: 'stausee', cells: 60, depth: 2, days: 2, population: 12 },
  terrain: { gorge: 2, gorgeAt: 0.5, bedTop: 9, drop: 8, halfBed: 2, slope: 0.55, hills: 10, hillNoise: 6, meander: [0.1, 0.05] },
  minutes: 50,
  hint: 'Dämme (Reiter Wasserbau) quer durch die Schlucht, vier Stufen hoch. Der See braucht 60 Zellen mit 2 Tiefe, Holz dafür früh sammeln.',
};

export const DUERRELAND: Scenario = {
  id: 'duerreland',
  name: 'Das Dürreland',
  seed: 41,
  w: 96,
  h: 96,
  intro: [
    'Weiter im Süden wird das Land flach und trocken. Die Quelle ist schwach, der Fluss nur ein Rinnsal, und die Dürre dauert hier bis zu zwanzig Tage.',
    'Dafür bleibt die Schneeschmelze mild: Die Flutwelle ist klein, Deiche braucht es kaum. Alles hängt am Wasservorrat.',
    'Baut Tanks und Zisternen, einen Brunnen für die Dürre und einen Stausee, der die Trockenzeit überbrückt. Der Clan soll durch drei Jahre kommen.',
  ],
  goal: { kind: 'clan', population: 12, year: 3 },
  terrain: { gorge: 0.4, bedTop: 6, drop: 4, halfBed: 1.8, slope: 0.35, hills: 7, hillNoise: 5, pools: true, sourceRate: 1.2 },
  seasons: {
    normal: [10, 14],
    schmelze: [2, 3],
    schlamm: [2, 4],
    duerre: { min: 14, max: 20, growMin: 0, growMax: 0, capMin: 14, capMax: 20 },
    melt: { peak: 1, grow: 0.5, cap: 2 },
  },
  minutes: 55,
  hint: 'Zwanzig Tage Dürre: Ein Otter trinkt alle drei Tage. Tanks füllen, Brunnen bauen, in der Dürre nicht wachsen.',
};

export const DELTA: Scenario = {
  id: 'delta',
  name: 'Das Delta',
  seed: 58,
  w: 96,
  h: 96,
  intro: [
    'Wo ein Nebenfluss von Westen einmündet, weitet sich das Tal zu einer breiten Ebene. Fruchtbarer Boden, zwei Quellen, Fisch im Überfluss.',
    'Aber zwei Flüsse bringen in der Schneeschmelze doppeltes Wasser: Die Flutwelle rollt hier vom ersten Jahr an mit voller Wucht über die Ebene.',
    'Baut Deiche und Dämme, bevor die Schmelze kommt, und lasst den Clan auf dreißig Otter wachsen.',
  ],
  goal: { kind: 'clan', population: 30, year: 4 },
  terrain: { gorge: 0.3, gorgeAt: 0.3, bedTop: 6.5, drop: 3.5, halfBed: 3, slope: 0.3, hills: 6, hillNoise: 5, meander: [0.12, 0.1], tributary: { side: 'west', at: 0.55, rate: 1.6 } },
  seasons: {
    normal: [8, 13],
    schmelze: [3, 4],
    schlamm: [2, 5],
    duerre: { min: 4, max: 7, growMin: 1, growMax: 1, capMin: 8, capMax: 10 },
    melt: { peak: 3.5, grow: 1.5, cap: 6 },
  },
  minutes: 70,
  hint: 'Hütten auf die Terrassen, nicht ans Ufer. Deiche zwei Stufen hoch, Pfahlhäuser halten Hochwasser aus.',
};

export const GROSSER_CLAN: Scenario = {
  id: 'grosserclan',
  name: 'Der große Clan',
  seed: 77,
  w: 96,
  h: 96,
  intro: [
    'Ein weites Tal mit Terrassen, Tümpeln und einem Nebenfluss von Osten. Hier soll der Clan sesshaft werden, für immer.',
    'Alles, was ihr gelernt habt, kommt zusammen: Dürre und Flutwelle, Schlammflut ab dem dritten Jahr, Bezirke mit Flößen, Wissen und Strom.',
    'Lasst den Clan auf sechzig Otter wachsen und bringt ihn ins fünfte Jahr.',
  ],
  goal: { kind: 'clan', population: 60, year: 5 },
  terrain: { gorge: 0.8, gorgeAt: 0.62, bedTop: 8, drop: 6, halfBed: 2.4, slope: 0.4, hills: 9, hillNoise: 6, meander: [0.16, 0.08], tributary: { side: 'east', at: 0.35, rate: 1.4 } },
  minutes: 90,
  hint: 'Zweites Lager flussabwärts, Floßanleger an beiden Bezirken, Schule und Bibliothek früh.',
};

/** Die Otter-Kampagne in Spielreihenfolge; jede Karte wird nach dem Sieg auf der vorigen frei */
export const CAMPAIGN: Scenario[] = [OTTERTAL, SCHLUCHT, DUERRELAND, DELTA, GROSSER_CLAN];

// --- Molchvolk -------------------------------------------------------------------

export const LAGUNE: Scenario = {
  id: 'lagune',
  name: 'Die Lagune',
  species: 'molch',
  seed: 101,
  w: 96,
  h: 96,
  intro: [
    'Flussabwärts der Otter weitet sich das Wasser zu einer Lagune mit Tümpeln und flachen Ufern. Hier zieht das Molchvolk ein, dem das Wasser lieber ist als das Land.',
    'Molche bauen mit Stein statt Holz. Ihre Höhlen stehen im Fluss, das Hochwasser kann ihnen nichts anhaben, und Algenfarmen wachsen nur unter Wasser.',
    'Dafür ist die Dürre ihr Feind: Trocknet der Fluss aus, verdursten sie doppelt so schnell und ihre Höhlen liegen auf dem Trockenen. Bringt das Volk auf vierzehn Molche und ins zweite Jahr.',
  ],
  goal: { kind: 'clan', population: 14, year: 2 },
  terrain: { gorge: 0.3, gorgeAt: 0.4, bedTop: 6, drop: 3, halfBed: 3.2, slope: 0.3, hills: 8, hillNoise: 5, pools: true, meander: [0.14, 0.08] },
  seasons: {
    normal: [9, 13],
    schmelze: [2, 3],
    schlamm: [2, 3],
    duerre: { min: 3, max: 5, growMin: 1, growMax: 1, capMin: 6, capMax: 8 },
    melt: { peak: 2.5, grow: 1, cap: 5 },
  },
  minutes: 40,
  hint: 'Höhlen ins flache Wasser, die Algenfarm in den Fluss, den Steinbruch an einen Hang. Pumpe und Tank für die Dürre.',
};

export const SCHLAMMTAL: Scenario = {
  id: 'schlammtal',
  name: 'Das Schlammtal',
  species: 'molch',
  seed: 113,
  w: 96,
  h: 96,
  intro: [
    'Ein enges Tal mit lehmigen Hängen. Jede Schneeschmelze reißt hier Erde mit, und schon im ersten Jahr folgt ihr eine Schlammflut.',
    'Für Molche ist schmutziges Wasser fast tödlich: Wer es trinkt, wird schwer krank. Sauberes Wasser aus Tank und Kiesbecken ist alles, was zählt.',
    'Sammelt vor der Flut sauberes Wasser, reinigt es im Kiesbecken, und bringt das Volk auf zwanzig Molche im dritten Jahr.',
  ],
  goal: { kind: 'clan', population: 20, year: 3 },
  terrain: { gorge: 0.8, gorgeAt: 0.55, bedTop: 7, drop: 5, halfBed: 2.2, slope: 0.5, hills: 9, hillNoise: 6, meander: [0.12, 0.06] },
  seasons: {
    normal: [8, 12],
    schmelze: [2, 3],
    schlamm: [3, 5],
    duerre: { min: 4, max: 6, growMin: 1, growMax: 1, capMin: 8, capMax: 10 },
    melt: { peak: 2.5, grow: 1, cap: 5 },
    mudYear: 1,
  },
  minutes: 55,
  hint: 'Tank und Kiesbecken vor der ersten Schlammflut, Heiler mit Kräutergarten dazu. In der Flut nur aus dem Speicher trinken.',
};

export const HOCHLAND: Scenario = {
  id: 'hochland',
  name: 'Das trockene Hochland',
  species: 'molch',
  seed: 127,
  w: 96,
  h: 96,
  intro: [
    'Hoch oben versiegt der Fluss jeden Sommer für Wochen. Die Alten der Molche erzählen von einem See, der hier einmal das ganze Tal füllte.',
    'Wasser halten ist alles: Dämme aus Stein stauen den Fluss, und wo das Wasser steht, bleiben Höhlen nass und Algen wachsen.',
    'Staut einen See von vierzig Zellen mit anderthalb Tiefe und haltet ihn drei Tage lang durch Normalzeit oder Dürre, mit sechzehn Molchen an seinem Ufer. Das zählt erst im zweiten Jahr, die erste lange Dürre müsst ihr überstehen.',
  ],
  goal: { kind: 'stausee', cells: 40, depth: 1.5, days: 3, population: 16, year: 2 },
  terrain: { gorge: 1.4, gorgeAt: 0.5, bedTop: 8, drop: 6, halfBed: 1.8, slope: 0.5, hills: 10, hillNoise: 6, sourceRate: 1.1, meander: [0.1, 0.05] },
  seasons: {
    normal: [8, 12],
    schmelze: [2, 3],
    schlamm: [2, 4],
    duerre: { min: 10, max: 14, growMin: 1, growMax: 2, capMin: 16, capMax: 20 },
    melt: { peak: 2, grow: 1, cap: 4 },
  },
  minutes: 60,
  hint: 'Dämme (Reiter Wasserbau) kosten Stein: früh einen Steinbruch bauen. Der See zählt nur in Normalzeit und Dürre.',
};

/** Die Molch-Kampagne; die erste Karte wird nach dem Sieg im Ottertal frei */
export const MOLCH_CAMPAIGN: Scenario[] = [LAGUNE, SCHLAMMTAL, HOCHLAND];

export const CAMPAIGNS: Scenario[][] = [CAMPAIGN, MOLCH_CAMPAIGN];

export const SCENARIOS: Record<string, Scenario> = Object.fromEntries([...CAMPAIGN, ...MOLCH_CAMPAIGN].map((s) => [s.id, s]));

/** Volk einer Karte */
export function speciesOf(s: Scenario): Species {
  return s.species ?? 'otter';
}

/** Freies Spiel auf einer Zufallskarte mit Seed */
export function freeScenario(seed: number, w = 96, h = 96): Scenario {
  return {
    id: 'frei',
    name: `Freies Spiel (Karte ${seed})`,
    seed,
    w,
    h,
    intro: ['Eine zufällige Karte ohne Ziel. Überlebt so lange ihr könnt und baut den Clan aus.'],
    goal: null,
  };
}

/** Karte zu einer Kennung; die Tageskarte kommt aus dem Datum, das als Seed mitreist */
export function scenarioById(id: string, seed: number): Scenario {
  if (id === DAILY_ID) return dailyScenario(isDayKey(seed) ? String(seed) : dailyKey());
  return SCENARIOS[id] ?? freeScenario(seed);
}

/** Kampagne, zu der eine Karte gehört, null für andere Karten */
export function campaignOf(id: string): Scenario[] | null {
  return CAMPAIGNS.find((c) => c.some((s) => s.id === id)) ?? null;
}

/** Nummer der Karte in ihrer Kampagne (ab 0), -1 für andere Karten */
export function campaignIndex(id: string): number {
  const c = campaignOf(id);
  return c ? c.findIndex((s) => s.id === id) : -1;
}

/** Die Karte nach einer Kampagnenkarte, null nach der letzten oder außerhalb der Kampagne */
export function nextScenario(id: string): Scenario | null {
  const c = campaignOf(id);
  const i = campaignIndex(id);
  return c && i >= 0 && i + 1 < c.length ? c[i + 1] : null;
}

/** Was vor einer Kampagnenkarte gewonnen sein muss, null wenn nichts */
export function requiredWin(id: string): Scenario | null {
  const c = campaignOf(id);
  const i = campaignIndex(id);
  if (!c || i < 0) return null;
  if (i > 0) return c[i - 1];
  // die Molch-Kampagne öffnet sich nach dem ersten Sieg der Otter
  return c === MOLCH_CAMPAIGN ? OTTERTAL : null;
}

/** Eine Kampagnenkarte ist spielbar, wenn die Karte davor gewonnen wurde */
export function isUnlocked(id: string, won: string[]): boolean {
  if (campaignIndex(id) < 0) return false;
  const req = requiredWin(id);
  return !req || won.includes(req.id);
}

export function goalText(goal: Goal | null, species: Species = 'otter'): string {
  const many = SPECIES[species].many;
  if (!goal) return 'Kein Ziel, freies Spiel';
  if (goal.kind === 'clan') return `${goal.population} ${many} und das Jahr ${goal.year} erreichen`;
  return `einen See mit ${goal.cells} Zellen von ${goal.depth.toLocaleString('de-DE')} Tiefe ${goal.days} Tage halten, mit ${goal.population} ${species === 'otter' ? 'Ottern' : many}${goal.year && goal.year > 1 ? ` im Jahr ${goal.year}` : ''}`;
}
