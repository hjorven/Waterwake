export type BuildingId =
  | 'lager'
  | 'huette'
  | 'pumpe'
  | 'tank'
  | 'sammler'
  | 'holzfaeller'
  | 'foerster'
  | 'badesteg'
  | 'musikplatz'
  | 'heiler'
  | 'brunnen'
  | 'zisterne'
  | 'wasserrad'
  | 'laufrad'
  | 'pumpwerk'
  | 'sandfilter';

/** Reiter im Baumenü */
export type BuildingCategory = 'siedlung' | 'versorgung' | 'strom';

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
  /** Arbeitsradius in Zellen (bei Freude-Gebäuden: Wirkungskreis) */
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
  /** macht Bewohner im Umkreis zufriedener */
  joy: boolean;
  /** Wassertiefe, ab der das Hochwasser dem Gebäude schadet */
  floodDepth: number;
  /** Reiter im Baumenü */
  category: BuildingCategory;
  /** Stromerzeugung (Höchstwert), Wasserrad je nach Strömung */
  powerGen: number;
  /** Strombedarf im Betrieb */
  powerUse: number;
}

const BASE = { category: 'siedlung' as BuildingCategory, powerGen: 0, powerUse: 0 };

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  lager: {
    ...BASE,
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
    joy: false,
    floodDepth: 0.9,
  },
  huette: {
    ...BASE,
    id: 'huette',
    name: 'Wohnhütte',
    desc: 'Vier Otter schlafen hier. Ohne Hütte sind sie unglücklich und arbeiten langsamer.',
    size: 1,
    wood: 8,
    workers: 0,
    range: 0,
    housing: 4,
    waterCap: 0,
    storage: 0,
    needsWater: false,
    buildTime: 15,
    joy: false,
    floodDepth: 0.4,
  },
  pumpe: {
    ...BASE,
    category: 'versorgung',
    id: 'pumpe',
    name: 'Pumpe',
    desc: 'Pumpt Wasser aus dem Fluss nebenan in den Speicher. Trinkstelle. Steht auf Pfählen und übersteht Hochwasser.',
    size: 1,
    wood: 6,
    workers: 1,
    range: 0,
    housing: 0,
    waterCap: 8,
    storage: 0,
    needsWater: true,
    buildTime: 12,
    joy: false,
    floodDepth: 1.6,
  },
  tank: {
    ...BASE,
    category: 'versorgung',
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
    joy: false,
    floodDepth: 0.9,
  },
  sammler: {
    ...BASE,
    category: 'versorgung',
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
    joy: false,
    floodDepth: 0.4,
  },
  holzfaeller: {
    ...BASE,
    category: 'versorgung',
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
    joy: false,
    floodDepth: 0.4,
  },
  foerster: {
    ...BASE,
    category: 'versorgung',
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
    joy: false,
    floodDepth: 0.4,
  },
  badesteg: {
    ...BASE,
    id: 'badesteg',
    name: 'Badesteg',
    desc: 'Ein Steg zum Planschen am Wasser. Otter, die im Umkreis wohnen, sind zufriedener.',
    size: 1,
    wood: 4,
    workers: 0,
    range: 10,
    housing: 0,
    waterCap: 0,
    storage: 0,
    needsWater: true,
    buildTime: 8,
    joy: true,
    floodDepth: 2.5,
  },
  musikplatz: {
    ...BASE,
    id: 'musikplatz',
    name: 'Musikplatz',
    desc: 'Trommeln und Tanz am Abend. Otter, die im Umkreis wohnen, sind zufriedener.',
    size: 1,
    wood: 7,
    workers: 0,
    range: 12,
    housing: 0,
    waterCap: 0,
    storage: 0,
    needsWater: false,
    buildTime: 12,
    joy: true,
    floodDepth: 0.4,
  },
  heiler: {
    ...BASE,
    id: 'heiler',
    name: 'Heilerhütte',
    desc: 'Pflegt kranke Otter im Umkreis gesund. Schmutziges Wasser aus der Schlammflut macht krank.',
    size: 1,
    wood: 9,
    workers: 1,
    range: 12,
    housing: 0,
    waterCap: 0,
    storage: 0,
    needsWater: false,
    buildTime: 14,
    joy: false,
    floodDepth: 0.4,
  },
  brunnen: {
    ...BASE,
    category: 'versorgung',
    id: 'brunnen',
    name: 'Brunnen',
    desc: 'Holt langsam sauberes Grundwasser in den Speicher, auch in der Dürre. Trinkstelle.',
    size: 1,
    wood: 10,
    workers: 0,
    range: 0,
    housing: 0,
    waterCap: 6,
    storage: 0,
    needsWater: false,
    buildTime: 16,
    joy: false,
    floodDepth: 0.9,
  },
  zisterne: {
    ...BASE,
    category: 'versorgung',
    id: 'zisterne',
    name: 'Zisterne',
    desc: 'Großer Wasserspeicher aus Holz und Lehm für lange Dürren. Trinkstelle.',
    size: 2,
    wood: 18,
    workers: 0,
    range: 0,
    housing: 0,
    waterCap: 100,
    storage: 0,
    needsWater: false,
    buildTime: 24,
    joy: false,
    floodDepth: 0.9,
  },
  wasserrad: {
    ...BASE,
    category: 'strom',
    powerGen: 3,
    id: 'wasserrad',
    name: 'Wasserrad',
    desc: 'Erzeugt Strom aus der Strömung des Flusses nebenan. Je schneller das Wasser, desto mehr. Steht in der Dürre still.',
    size: 1,
    wood: 8,
    workers: 0,
    range: 0,
    housing: 0,
    waterCap: 0,
    storage: 0,
    needsWater: true,
    buildTime: 14,
    joy: false,
    floodDepth: 1.6,
  },
  laufrad: {
    ...BASE,
    category: 'strom',
    powerGen: 0.8,
    id: 'laufrad',
    name: 'Laufrad',
    desc: 'Ein Otter läuft im Rad und erzeugt etwas Strom. Notstrom, wenn der Fluss steht.',
    size: 1,
    wood: 6,
    workers: 1,
    range: 0,
    housing: 0,
    waterCap: 0,
    storage: 0,
    needsWater: false,
    buildTime: 10,
    joy: false,
    floodDepth: 0.4,
  },
  pumpwerk: {
    ...BASE,
    category: 'strom',
    powerUse: 1,
    id: 'pumpwerk',
    name: 'Pumpwerk',
    desc: 'Pumpt mit Strom Wasser aus dem Fluss nebenan in den Speicher, ganz ohne Arbeiter. Trinkstelle.',
    size: 1,
    wood: 12,
    workers: 0,
    range: 0,
    housing: 0,
    waterCap: 10,
    storage: 0,
    needsWater: true,
    buildTime: 16,
    joy: false,
    floodDepth: 1.6,
  },
  sandfilter: {
    ...BASE,
    category: 'strom',
    powerUse: 0.6,
    id: 'sandfilter',
    name: 'Sandfilter',
    desc: 'Reinigt mit Strom das gespeicherte Wasser von Schlamm.',
    size: 1,
    wood: 8,
    workers: 0,
    range: 0,
    housing: 0,
    waterCap: 0,
    storage: 0,
    needsWater: false,
    buildTime: 12,
    joy: false,
    floodDepth: 0.9,
  },
};

export const BUILDING_ORDER: BuildingId[] = [
  'huette', 'lager', 'heiler', 'badesteg', 'musikplatz',
  'pumpe', 'tank', 'zisterne', 'brunnen', 'sammler', 'holzfaeller', 'foerster',
  'wasserrad', 'laufrad', 'pumpwerk', 'sandfilter',
];

/** Gebäude mit Wasserspeicher, an denen Otter trinken */
export const DRINK_SPOTS: BuildingId[] = ['pumpe', 'tank', 'zisterne', 'brunnen', 'pumpwerk'];

export const CATEGORY_LABEL: Record<BuildingCategory, string> = { siedlung: 'Siedlung', versorgung: 'Versorgung', strom: 'Strom' };

/** Kosten der Wasserbau-Werkzeuge in Holz je Zelle und Höhenstufe */
export const DAM_WOOD_PER_LEVEL = 1;
export const GATE_WOOD = 4;

/** Nach so vielen Sekunden im Hochwasser ist ein Gebäude verloren */
export const FLOOD_DESTROY_TIME = 45;
/** So lange braucht ein Gebäude im Trockenen, bis Schäden verheilt sind */
export const FLOOD_REPAIR_TIME = 120;
