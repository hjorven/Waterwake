import type { BuildingId } from './buildings';

export type TechId =
  | 'schrift'
  | 'sternkunde'
  | 'heilkunde'
  | 'brunnenbau'
  | 'fischfang'
  | 'teichwirtschaft'
  | 'ackerbau'
  | 'backkunst'
  | 'zimmerei'
  | 'pfahlbau'
  | 'schnitzkunst'
  | 'geselligkeit'
  | 'muehlenbau'
  | 'maschinen'
  | 'flosserei'
  | 'steinkunst';

export interface TechDef {
  id: TechId;
  name: string;
  desc: string;
  /** Kosten in Wissen */
  cost: number;
  /** muss vorher erforscht sein */
  requires: TechId | null;
  unlocks: BuildingId[];
}

/** Technologien in der Reihenfolge der Forschungstafel */
export const TECHS: Record<TechId, TechDef> = {
  schrift: {
    id: 'schrift',
    name: 'Schrift',
    desc: 'Die Schule bringt den Jungen Lesen und Zählen bei. Sie werden schneller erwachsen, und die Lehrer sammeln Wissen.',
    cost: 8,
    requires: null,
    unlocks: ['schule'],
  },
  geselligkeit: {
    id: 'geselligkeit',
    name: 'Geselligkeit',
    desc: 'Abende am Lagerfeuer und eine Schenke mit Beerensaft machen den Clan zufriedener.',
    cost: 8,
    requires: null,
    unlocks: ['lagerfeuer', 'beerenschenke'],
  },
  heilkunde: {
    id: 'heilkunde',
    name: 'Heilkunde',
    desc: 'Heilerhütte und Kräutergarten pflegen kranke Otter gesund. Wichtig vor der ersten Schlammflut.',
    cost: 10,
    requires: null,
    unlocks: ['heiler', 'kraeutergarten'],
  },
  fischfang: {
    id: 'fischfang',
    name: 'Fischfang',
    desc: 'Die Fischerhütte holt Fisch aus dem Fluss, solange er tief genug und sauber ist.',
    cost: 10,
    requires: null,
    unlocks: ['fischer'],
  },
  ackerbau: {
    id: 'ackerbau',
    name: 'Ackerbau',
    desc: 'Felder auf feuchtem Boden tragen Korn, der Beerengärtner pflanzt neue Sträucher.',
    cost: 12,
    requires: null,
    unlocks: ['feld', 'beerengaertner'],
  },
  brunnenbau: {
    id: 'brunnenbau',
    name: 'Brunnenbau',
    desc: 'Brunnen holen Grundwasser auch in der Dürre, die Zisterne speichert große Vorräte.',
    cost: 12,
    requires: null,
    unlocks: ['brunnen', 'zisterne'],
  },
  zimmerei: {
    id: 'zimmerei',
    name: 'Zimmerei',
    desc: 'Das Sägewerk macht aus Holz Bretter für größere Bauten, die Werkstatt fertigt Werkzeug, mit dem alle schneller arbeiten.',
    cost: 12,
    requires: null,
    unlocks: ['saegewerk', 'werkstatt'],
  },
  sternkunde: {
    id: 'sternkunde',
    name: 'Sternkunde',
    desc: 'Die Sternwarte liest am Himmel ab, wie lange die nächste Jahreszeit genau dauert.',
    cost: 16,
    requires: 'schrift',
    unlocks: ['sternwarte'],
  },
  teichwirtschaft: {
    id: 'teichwirtschaft',
    name: 'Teichwirtschaft',
    desc: 'Ein Fischteich wird aus dem Wasserspeicher gespeist und liefert Fisch auch in der Dürre.',
    cost: 16,
    requires: 'fischfang',
    unlocks: ['fischteich'],
  },
  backkunst: {
    id: 'backkunst',
    name: 'Backkunst',
    desc: 'Die Bäckerei backt aus Korn Brot, die beste Nahrung des Clans.',
    cost: 16,
    requires: 'ackerbau',
    unlocks: ['baeckerei'],
  },
  schnitzkunst: {
    id: 'schnitzkunst',
    name: 'Schnitzkunst',
    desc: 'Statue und Spielplatz aus geschnitztem Holz erfreuen Alt und Jung.',
    cost: 14,
    requires: 'zimmerei',
    unlocks: ['statue', 'spielplatz'],
  },
  pfahlbau: {
    id: 'pfahlbau',
    name: 'Pfahlbau',
    desc: 'Mit Brettern entstehen das Langhaus für zehn Otter, das hochwassersichere Pfahlhaus und der Aussichtsturm.',
    cost: 18,
    requires: 'zimmerei',
    unlocks: ['pfahlhaus', 'langhaus', 'aussichtsturm', 'steg'],
  },
  muehlenbau: {
    id: 'muehlenbau',
    name: 'Mühlenbau',
    desc: 'Wasserräder machen aus der Strömung Strom, Laufräder liefern Notstrom.',
    cost: 16,
    requires: 'zimmerei',
    unlocks: ['wasserrad', 'laufrad'],
  },
  maschinen: {
    id: 'maschinen',
    name: 'Maschinen',
    desc: 'Pumpwerk und Sandfilter laufen mit Strom ganz ohne Arbeiter.',
    cost: 24,
    requires: 'muehlenbau',
    unlocks: ['pumpwerk', 'sandfilter'],
  },
  steinkunst: {
    id: 'steinkunst',
    name: 'Steinkunst',
    desc: 'Behauener Stein für die Grotte mit zehn Betten, Statuen und einen Aussichtsturm.',
    cost: 14,
    requires: null,
    unlocks: ['grotte', 'statue', 'aussichtsturm'],
  },
  flosserei: {
    id: 'flosserei',
    name: 'Flößerei',
    desc: 'Ein zweites Lager weit weg bildet einen eigenen Bezirk. Flößer bringen Waren auf dem Fluss von Anleger zu Anleger, das Lagerhaus fasst hundert Stück je Ware.',
    cost: 18,
    requires: 'pfahlbau',
    unlocks: ['flossanleger', 'lagerhaus'],
  },
};

export const TECH_ORDER: TechId[] = [
  'schrift', 'geselligkeit', 'heilkunde', 'fischfang', 'ackerbau', 'brunnenbau', 'zimmerei', 'steinkunst',
  'sternkunde', 'teichwirtschaft', 'backkunst', 'schnitzkunst', 'pfahlbau', 'flosserei', 'muehlenbau', 'maschinen',
];

/**
 * Technologie, die ein Gebäude freischaltet, je Volk (fehlt bei Gebäuden, die von
 * Anfang an gehen). Statue und Aussichtsturm hängen bei Ottern an Schnitzkunst
 * und Pfahlbau, bei Molchen an der Steinkunst.
 */
export function techTable(techs: TechId[]): Partial<Record<BuildingId, TechId>> {
  const out: Partial<Record<BuildingId, TechId>> = {};
  for (const t of TECH_ORDER) if (techs.includes(t)) for (const b of TECHS[t].unlocks) out[b] = t;
  return out;
}

/**
 * Voraussetzung einer Technik für ein Volk: nur eine Technik, die das Volk selbst
 * erforschen kann, zählt (Mühlenbau braucht bei Ottern Zimmerei, Molche kennen keine).
 */
export function requiredFor(id: TechId, techs: TechId[]): TechId | null {
  const req = TECHS[id].requires;
  return req && techs.includes(req) ? req : null;
}

/** Freischaltung für den Otterclan (Vorgabe) */
export const TECH_FOR: Partial<Record<BuildingId, TechId>> = techTable(TECH_ORDER.filter((t) => t !== 'steinkunst'));
