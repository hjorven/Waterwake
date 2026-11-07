export type BuildingId = 'lager' | 'huette' | 'pumpe' | 'tank' | 'sammler' | 'holzfaeller' | 'foerster';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  desc: string;
  /** Grundfläche size x size Zellen */
  size: number;
  /** Baukosten in Holz */
  wood: number;
  /** Arbeitsplätze */
  workers: number;
  /** Arbeitsradius in Zellen */
  range: number;
  /** Wohnplätze */
  housing: number;
  /** Wasserspeicher */
  waterCap: number;
  /** Lagerkapazität je Ware */
  storage: number;
  /** muss mit einer Seite an Wasser stehen */
  needsWater: boolean;
  /** Bauzeit in Sekunden Spielzeit */
  buildTime: number;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  lager: {
    id: 'lager',
    name: 'Lager',
    desc: 'Nimmt Holz und Beeren auf. Bewohner essen hier.',
    size: 2,
    wood: 12,
    workers: 0,
    range: 0,
    housing: 0,
    waterCap: 0,
    storage: 40,
    needsWater: false,
    buildTime: 20,
  },
  huette: {
    id: 'huette',
    name: 'Wohnhütte',
    desc: 'Vier Otter schlafen hier. Ohne Hütte arbeiten sie langsamer.',
    size: 1,
    wood: 8,
    workers: 0,
    range: 0,
    housing: 4,
    waterCap: 0,
    storage: 0,
    needsWater: false,
    buildTime: 15,
  },
  pumpe: {
    id: 'pumpe',
    name: 'Pumpe',
    desc: 'Pumpt Wasser aus dem Fluss nebenan in den Speicher. Trinkstelle.',
    size: 1,
    wood: 6,
    workers: 1,
    range: 0,
    housing: 0,
    waterCap: 8,
    storage: 0,
    needsWater: true,
    buildTime: 12,
  },
  tank: {
    id: 'tank',
    name: 'Wassertank',
    desc: 'Speichert Wasser für die Dürre. Trinkstelle.',
    size: 1,
    wood: 10,
    workers: 0,
    range: 0,
    housing: 0,
    waterCap: 40,
    storage: 0,
    needsWater: false,
    buildTime: 15,
  },
  sammler: {
    id: 'sammler',
    name: 'Beerensammler',
    desc: 'Sammelt reife Beeren von Sträuchern im Umkreis.',
    size: 1,
    wood: 5,
    workers: 2,
    range: 9,
    housing: 0,
    waterCap: 0,
    storage: 0,
    needsWater: false,
    buildTime: 10,
  },
  holzfaeller: {
    id: 'holzfaeller',
    name: 'Holzfäller',
    desc: 'Fällt ausgewachsene Bäume im Umkreis.',
    size: 1,
    wood: 5,
    workers: 2,
    range: 9,
    housing: 0,
    waterCap: 0,
    storage: 0,
    needsWater: false,
    buildTime: 10,
  },
  foerster: {
    id: 'foerster',
    name: 'Förster',
    desc: 'Pflanzt Bäume auf feuchtem Boden im Umkreis.',
    size: 1,
    wood: 6,
    workers: 1,
    range: 7,
    housing: 0,
    waterCap: 0,
    storage: 0,
    needsWater: false,
    buildTime: 10,
  },
};

export const BUILDING_ORDER: BuildingId[] = ['huette', 'pumpe', 'tank', 'sammler', 'holzfaeller', 'foerster', 'lager'];

/** Kosten der Wasserbau-Werkzeuge in Holz je Zelle und Höhenstufe */
export const DAM_WOOD_PER_LEVEL = 1;
export const GATE_WOOD = 4;
