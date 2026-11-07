import type { BuildingId } from './buildings';
import type { Good, Stock } from './goods';
import type { TechId } from './tech';

/** Die Völker: Otter bauen mit Holz am Ufer, Molche mit Stein im Wasser */
export type Species = 'otter' | 'molch';

export interface SpeciesDef {
  id: Species;
  /** Name des Volkes, z. B. "Otterclan" */
  name: string;
  /** Name mit Artikel für Satzanfänge, z. B. "Der Otterclan" */
  title: string;
  /** ein Bewohner / mehrere / ein Junges */
  one: string;
  many: string;
  young: string;
  /** Startgebäude mit Vorrat */
  camp: BuildingId;
  startStock: Partial<Stock>;
  /** Baustoff für Dämme, Deiche, Schleusen und alle geteilten Gebäude */
  material: Good;
  /** Gebäude, die dieses Volk bauen kann (Reihenfolge wie im Baumenü) */
  buildings: BuildingId[];
  /** Techniken, die dieses Volk erforschen kann */
  techs: TechId[];
  walkSpeed: number;
  swimSpeed: number;
  /** Durst in der Dürre: Faktor auf den Wasserverbrauch */
  droughtThirst: number;
  /** Schaden durch schmutziges Wasser: Faktor */
  dirtHarm: number;
  /** Stimmung, wenn Wasser am Zuhause steht (Höhlen im Fluss) */
  wetHomeMood: number;
  /** Stimmung, wenn das Zuhause im Trockenen liegt */
  dryHomeMood: number;
  /** Meldungen */
  arrival: string;
  wipedOut: string;
  /** Tipp im Ende-Dialog nach einer Niederlage */
  lostHint: string;
}

const OTTER_BUILDINGS: BuildingId[] = [
  'huette', 'pfahlhaus', 'langhaus', 'lager', 'lagerhaus', 'steg', 'heiler', 'bibliothek', 'schule', 'sternwarte',
  'badesteg', 'musikplatz', 'lagerfeuer', 'spielplatz', 'statue', 'beerenschenke', 'aussichtsturm',
  'pumpe', 'tank', 'zisterne', 'brunnen', 'flossanleger', 'holzfaeller', 'foerster', 'saegewerk', 'werkstatt', 'kraeutergarten',
  'sammler', 'beerengaertner', 'fischer', 'fischteich', 'feld', 'baeckerei',
  'wasserrad', 'laufrad', 'pumpwerk', 'sandfilter',
];

const MOLCH_BUILDINGS: BuildingId[] = [
  'molchhoehle', 'grotte', 'molchlager', 'heiler', 'bibliothek', 'schule', 'sternwarte',
  'laichplatz', 'badesteg', 'musikplatz', 'statue', 'aussichtsturm',
  'pumpe', 'tank', 'zisterne', 'brunnen', 'steinbruch', 'kiesbecken', 'kraeutergarten',
  'algenfarm', 'fischer', 'fischteich',
  'wasserrad', 'laufrad', 'pumpwerk', 'sandfilter',
];

export const SPECIES: Record<Species, SpeciesDef> = {
  otter: {
    id: 'otter',
    name: 'Otterclan',
    title: 'Der Otterclan',
    one: 'Otter',
    many: 'Otter',
    young: 'Ein Otterjunges ist geboren',
    camp: 'lager',
    startStock: { holz: 30, beeren: 12 },
    material: 'holz',
    buildings: OTTER_BUILDINGS,
    techs: ['schrift', 'geselligkeit', 'heilkunde', 'fischfang', 'ackerbau', 'brunnenbau', 'zimmerei', 'sternkunde', 'teichwirtschaft', 'backkunst', 'schnitzkunst', 'pfahlbau', 'flosserei', 'muehlenbau', 'maschinen'],
    walkSpeed: 2.6,
    swimSpeed: 1.3,
    droughtThirst: 1,
    dirtHarm: 1,
    wetHomeMood: 0,
    dryHomeMood: 0,
    arrival: 'Der Otterclan kommt am Fluss an. Baut eine Pumpe und Hütten, bevor die Dürre kommt.',
    wipedOut: 'Der Otterclan ist ausgelöscht.',
    lostHint: 'Beim nächsten Mal: früh eine Pumpe und einen Tank bauen, Deiche gegen die Flutwelle, und Hütten für die Stimmung.',
  },
  molch: {
    id: 'molch',
    name: 'Molchvolk',
    title: 'Das Molchvolk',
    one: 'Molch',
    many: 'Molche',
    young: 'Eine Molchlarve ist geschlüpft',
    camp: 'molchlager',
    startStock: { stein: 30, algen: 12 },
    material: 'stein',
    buildings: MOLCH_BUILDINGS,
    techs: ['schrift', 'heilkunde', 'fischfang', 'brunnenbau', 'steinkunst', 'sternkunde', 'teichwirtschaft', 'muehlenbau', 'maschinen'],
    walkSpeed: 2.0,
    swimSpeed: 2.4,
    droughtThirst: 2,
    dirtHarm: 2.5,
    wetHomeMood: 0.15,
    dryHomeMood: -0.12,
    arrival: 'Das Molchvolk zieht in den Fluss. Baut Höhlen ins flache Wasser und eine Algenfarm, und haltet das Wasser, bevor die Dürre kommt.',
    wipedOut: 'Das Molchvolk ist ausgelöscht.',
    lostHint: 'Beim nächsten Mal: Höhlen ins Wasser, Tank und Kiesbecken vor der Schlammflut, und Dämme, damit der Fluss in der Dürre nicht versiegt.',
  },
};

export const SPECIES_ORDER: Species[] = ['otter', 'molch'];

export function isSpecies(s: unknown): s is Species {
  return s === 'otter' || s === 'molch';
}

/** Baukosten für ein Volk: Molche zahlen Stein statt Holz und Bretter */
export function costFor(cost: Partial<Stock>, material: Good): Partial<Stock> {
  if (material === 'holz') return cost;
  const out: Partial<Stock> = {};
  let wood = 0;
  for (const [g, n] of Object.entries(cost) as [Good, number][]) {
    if (!n) continue;
    if (g === 'holz' || g === 'bretter') wood += n;
    else out[g] = (out[g] ?? 0) + n;
  }
  if (wood > 0) out[material] = (out[material] ?? 0) + wood;
  return out;
}
