import type { Good, Stock } from './goods';

export type BuildingId =
  | 'lager'
  | 'huette'
  | 'pfahlhaus'
  | 'langhaus'
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
  | 'sandfilter'
  | 'bibliothek'
  | 'schule'
  | 'sternwarte'
  | 'saegewerk'
  | 'werkstatt'
  | 'kraeutergarten'
  | 'fischer'
  | 'fischteich'
  | 'beerengaertner'
  | 'feld'
  | 'baeckerei'
  | 'lagerfeuer'
  | 'beerenschenke'
  | 'statue'
  | 'spielplatz'
  | 'aussichtsturm'
  | 'lagerhaus'
  | 'flossanleger'
  | 'steg'
  // Molchvolk
  | 'molchlager'
  | 'molchhoehle'
  | 'grotte'
  | 'steinbruch'
  | 'kiesbecken'
  | 'algenfarm'
  | 'laichplatz';

/** Reiter im Baumenü */
export type BuildingCategory = 'siedlung' | 'freude' | 'versorgung' | 'nahrung' | 'strom';

/** Verarbeitung: Arbeiter holt die Zutat aus dem Lager und bringt das Erzeugnis zurück */
export interface Recipe {
  input: Good;
  inAmount: number;
  output: Good;
  outAmount: number;
  /** Arbeitszeit je Durchgang in Sekunden */
  time: number;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  desc: string;
  /** Grundfläche size x size Zellen */
  size: number;
  /** Baukosten je Ware */
  cost: Partial<Stock>;
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
  /** steht auf einer Wasserzelle (Steg) */
  onWater: boolean;
  /** darf auch im flachen Wasser stehen (Molchbauten), bis WET_DEPTH tief */
  wet: boolean;
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
  /** Wissen je Schicht eines Arbeiters */
  knowledge: number;
  recipe: Recipe | null;
  /** Ernte: Tage bis zur Reife, Ware und Menge je Ernte (Feld, Kräutergarten) */
  harvest: { days: number; good: Good; amount: number } | null;
}

type Partial_ = Partial<Omit<BuildingDef, 'id'>> & Pick<BuildingDef, 'name' | 'desc'>;

function def(id: BuildingId, p: Partial_): BuildingDef {
  return {
    id,
    size: 1,
    cost: {},
    workers: 0,
    range: 0,
    housing: 0,
    waterCap: 0,
    storage: 0,
    needsWater: false,
    onWater: false,
    wet: false,
    buildTime: 12,
    joy: false,
    floodDepth: 0.4,
    category: 'siedlung',
    powerGen: 0,
    powerUse: 0,
    knowledge: 0,
    recipe: null,
    harvest: null,
    ...p,
  };
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  // --- Siedlung -----------------------------------------------------------------
  lager: def('lager', {
    name: 'Lager',
    desc: 'Nimmt alle Waren auf. Bewohner essen hier.',
    size: 2,
    cost: { holz: 12 },
    storage: 40,
    buildTime: 20,
    floodDepth: 0.9,
  }),
  lagerhaus: def('lagerhaus', {
    name: 'Lagerhaus',
    desc: 'Großes Lager für hundert Stück je Ware. Weit weg vom ersten Lager bildet es einen eigenen Bezirk, den Flöße beliefern.',
    size: 2,
    cost: { holz: 10, bretter: 10 },
    storage: 100,
    buildTime: 30,
    floodDepth: 0.9,
  }),
  steg: def('steg', {
    name: 'Holzsteg',
    desc: 'Steg über eine Wasserzelle. Otter gehen darüber statt zu schwimmen und bleiben trocken, auch im Schlamm.',
    cost: { holz: 2, bretter: 1 },
    buildTime: 6,
    floodDepth: 2.5,
    onWater: true,
  }),
  huette: def('huette', {
    name: 'Wohnhütte',
    desc: 'Vier Otter schlafen hier. Ohne Hütte sind sie unglücklich und arbeiten langsamer.',
    cost: { holz: 8 },
    housing: 4,
    buildTime: 15,
  }),
  pfahlhaus: def('pfahlhaus', {
    name: 'Pfahlhaus',
    desc: 'Wohnhaus auf hohen Pfählen für vier Otter. Das Hochwasser läuft darunter durch.',
    cost: { holz: 6, bretter: 4 },
    housing: 4,
    buildTime: 18,
    floodDepth: 1.6,
  }),
  langhaus: def('langhaus', {
    name: 'Langhaus',
    desc: 'Großes Haus aus Brettern, in dem zehn Otter wohnen.',
    size: 2,
    cost: { holz: 10, bretter: 8 },
    housing: 10,
    buildTime: 26,
  }),
  heiler: def('heiler', {
    name: 'Heilerhütte',
    desc: 'Pflegt kranke Otter im Umkreis gesund. Mit Kräutern aus dem Lager doppelt so schnell.',
    cost: { holz: 9 },
    workers: 1,
    range: 12,
    buildTime: 14,
  }),
  bibliothek: def('bibliothek', {
    name: 'Bibliothek',
    desc: 'Ein Gelehrter sammelt hier Wissen, mit dem der Clan neue Techniken erforscht.',
    cost: { holz: 10 },
    workers: 1,
    knowledge: 1,
    buildTime: 16,
  }),
  schule: def('schule', {
    name: 'Schule',
    desc: 'Zwei Lehrer unterrichten die Jungen: Sie werden schneller erwachsen, und es entsteht Wissen.',
    cost: { holz: 8, bretter: 6 },
    workers: 2,
    knowledge: 0.7,
    buildTime: 18,
  }),
  sternwarte: def('sternwarte', {
    name: 'Sternwarte',
    desc: 'Liest am Himmel ab, wie lange die nächste Jahreszeit genau dauert, und sammelt etwas Wissen.',
    cost: { holz: 6, bretter: 6 },
    workers: 1,
    knowledge: 0.5,
    buildTime: 18,
  }),
  // --- Freude ---------------------------------------------------------------------
  badesteg: def('badesteg', {
    category: 'freude',
    name: 'Badesteg',
    desc: 'Ein Steg zum Planschen am Wasser. Otter, die im Umkreis wohnen, sind zufriedener.',
    cost: { holz: 4 },
    range: 10,
    needsWater: true,
    buildTime: 8,
    joy: true,
    floodDepth: 2.5,
  }),
  musikplatz: def('musikplatz', {
    category: 'freude',
    name: 'Musikplatz',
    desc: 'Trommeln und Tanz am Abend. Otter, die im Umkreis wohnen, sind zufriedener.',
    cost: { holz: 7 },
    range: 12,
    joy: true,
  }),
  lagerfeuer: def('lagerfeuer', {
    category: 'freude',
    name: 'Lagerfeuer',
    desc: 'Geschichten am Feuer. Kleiner Wirkungskreis, aber billig.',
    cost: { holz: 3 },
    range: 8,
    buildTime: 6,
    joy: true,
  }),
  beerenschenke: def('beerenschenke', {
    category: 'freude',
    name: 'Beerenschenke',
    desc: 'Der Wirt schenkt Beerensaft aus. Macht zufrieden, solange Beeren im Lager sind und jemand ausschenkt.',
    cost: { holz: 8, bretter: 4 },
    workers: 1,
    range: 12,
    buildTime: 16,
    joy: true,
  }),
  statue: def('statue', {
    category: 'freude',
    name: 'Statue',
    desc: 'Geschnitzter Otterheld. Alle im Umkreis sind stolz und zufriedener.',
    cost: { holz: 2, bretter: 6 },
    range: 10,
    buildTime: 16,
    joy: true,
    floodDepth: 0.9,
  }),
  spielplatz: def('spielplatz', {
    category: 'freude',
    name: 'Spielplatz',
    desc: 'Rutsche und Wippe. Familien im Umkreis sind zufriedener.',
    cost: { holz: 6 },
    range: 10,
    buildTime: 12,
    joy: true,
  }),
  aussichtsturm: def('aussichtsturm', {
    category: 'freude',
    name: 'Aussichtsturm',
    desc: 'Hoher Turm mit Blick über das Tal. Großer Wirkungskreis.',
    cost: { holz: 6, bretter: 6 },
    range: 16,
    buildTime: 20,
    joy: true,
    floodDepth: 0.9,
  }),
  // --- Versorgung --------------------------------------------------------------
  pumpe: def('pumpe', {
    category: 'versorgung',
    name: 'Pumpe',
    desc: 'Pumpt Wasser aus dem Fluss nebenan in den Speicher. Trinkstelle. Steht auf Pfählen und übersteht Hochwasser.',
    cost: { holz: 6 },
    workers: 1,
    waterCap: 8,
    needsWater: true,
    floodDepth: 1.6,
  }),
  tank: def('tank', {
    category: 'versorgung',
    name: 'Wassertank',
    desc: 'Speichert Wasser für die Dürre. Trinkstelle.',
    cost: { holz: 10 },
    waterCap: 40,
    buildTime: 15,
    floodDepth: 0.9,
  }),
  zisterne: def('zisterne', {
    category: 'versorgung',
    name: 'Zisterne',
    desc: 'Großer Wasserspeicher aus Holz und Lehm für lange Dürren. Trinkstelle.',
    size: 2,
    cost: { holz: 18 },
    waterCap: 100,
    buildTime: 24,
    floodDepth: 0.9,
  }),
  brunnen: def('brunnen', {
    category: 'versorgung',
    name: 'Brunnen',
    desc: 'Holt langsam sauberes Grundwasser in den Speicher, auch in der Dürre. Trinkstelle.',
    cost: { holz: 10 },
    waterCap: 6,
    buildTime: 16,
    floodDepth: 0.9,
  }),
  flossanleger: def('flossanleger', {
    category: 'versorgung',
    name: 'Floßanleger',
    desc: 'Ein Flößer bringt Waren per Floß zu anderen Anlegern, wo sie knapp sind. Der Anleger versorgt das nächste Lager im Umkreis, der Fluss muss durchgehend Wasser führen.',
    cost: { holz: 6, bretter: 4 },
    workers: 1,
    range: 18,
    needsWater: true,
    buildTime: 15,
    floodDepth: 1.6,
  }),
  holzfaeller: def('holzfaeller', {
    category: 'versorgung',
    name: 'Holzfäller',
    desc: 'Fällt ausgewachsene Bäume im Umkreis.',
    cost: { holz: 5 },
    workers: 2,
    range: 9,
    buildTime: 10,
  }),
  foerster: def('foerster', {
    category: 'versorgung',
    name: 'Förster',
    desc: 'Pflanzt Bäume auf feuchtem Boden im Umkreis.',
    cost: { holz: 6 },
    workers: 1,
    range: 7,
    buildTime: 10,
  }),
  saegewerk: def('saegewerk', {
    category: 'versorgung',
    name: 'Sägewerk',
    desc: 'Sägt Holz aus dem Lager zu Brettern. Mit Strom läuft die Säge mehr als doppelt so schnell.',
    cost: { holz: 10 },
    workers: 1,
    powerUse: 0.5,
    recipe: { input: 'holz', inAmount: 2, output: 'bretter', outAmount: 3, time: 10 },
    buildTime: 16,
  }),
  werkstatt: def('werkstatt', {
    category: 'versorgung',
    name: 'Werkstatt',
    desc: 'Fertigt aus Holz Werkzeug. Solange jeder Arbeiter Werkzeug hat, arbeitet der Clan ein Viertel schneller.',
    cost: { holz: 8, bretter: 4 },
    workers: 1,
    recipe: { input: 'holz', inAmount: 1, output: 'werkzeug', outAmount: 1, time: 12 },
    buildTime: 16,
  }),
  kraeutergarten: def('kraeutergarten', {
    category: 'versorgung',
    name: 'Kräutergarten',
    desc: 'Heilkräuter wachsen auf feuchtem Boden. Die Heilerhütte pflegt damit doppelt so schnell.',
    cost: { holz: 5 },
    workers: 1,
    harvest: { days: 2, good: 'kraeuter', amount: 3 },
    buildTime: 8,
  }),
  // --- Nahrung ----------------------------------------------------------------
  sammler: def('sammler', {
    category: 'nahrung',
    name: 'Beerensammler',
    desc: 'Sammelt reife Beeren von Sträuchern im Umkreis.',
    cost: { holz: 5 },
    workers: 2,
    range: 9,
    buildTime: 10,
  }),
  beerengaertner: def('beerengaertner', {
    category: 'nahrung',
    name: 'Beerengärtner',
    desc: 'Pflanzt Beerensträucher auf feuchtem Boden im Umkreis. Ein Sammler daneben erntet sie.',
    cost: { holz: 6 },
    workers: 1,
    range: 7,
    buildTime: 10,
  }),
  fischer: def('fischer', {
    category: 'nahrung',
    name: 'Fischerhütte',
    desc: 'Fischt im tiefen Wasser nebenan. In der Dürre und im Schlamm gibt es keinen Fisch.',
    cost: { holz: 7 },
    workers: 1,
    range: 8,
    needsWater: true,
    buildTime: 12,
    floodDepth: 1.6,
  }),
  fischteich: def('fischteich', {
    category: 'nahrung',
    name: 'Fischteich',
    desc: 'Teich mit Zucht. Wird aus dem Wasserspeicher gespeist und liefert Fisch auch in der Dürre.',
    size: 2,
    cost: { holz: 8, bretter: 4 },
    workers: 1,
    buildTime: 20,
    floodDepth: 0.9,
  }),
  feld: def('feld', {
    category: 'nahrung',
    name: 'Feld',
    desc: 'Korn reift auf feuchtem Boden in drei Tagen. In der Dürre wächst nichts.',
    size: 2,
    cost: { holz: 6 },
    workers: 1,
    harvest: { days: 3, good: 'korn', amount: 4 },
    buildTime: 10,
  }),
  baeckerei: def('baeckerei', {
    category: 'nahrung',
    name: 'Bäckerei',
    desc: 'Backt aus Korn Brot. Brot und Fisch machen den Speiseplan abwechslungsreich und den Clan zufriedener.',
    cost: { holz: 8, bretter: 4 },
    workers: 1,
    recipe: { input: 'korn', inAmount: 2, output: 'brot', outAmount: 3, time: 10 },
    buildTime: 16,
  }),
  // --- Strom -------------------------------------------------------------------
  wasserrad: def('wasserrad', {
    category: 'strom',
    name: 'Wasserrad',
    desc: 'Erzeugt Strom aus der Strömung des Flusses nebenan. Je schneller das Wasser, desto mehr. Steht in der Dürre still.',
    cost: { holz: 8 },
    powerGen: 3,
    needsWater: true,
    buildTime: 14,
    floodDepth: 1.6,
  }),
  laufrad: def('laufrad', {
    category: 'strom',
    name: 'Laufrad',
    desc: 'Ein Otter läuft im Rad und erzeugt etwas Strom. Notstrom, wenn der Fluss steht.',
    cost: { holz: 6 },
    workers: 1,
    powerGen: 0.8,
    buildTime: 10,
  }),
  pumpwerk: def('pumpwerk', {
    category: 'strom',
    name: 'Pumpwerk',
    desc: 'Pumpt mit Strom Wasser aus dem Fluss nebenan in den Speicher, ganz ohne Arbeiter. Trinkstelle.',
    cost: { holz: 12 },
    powerUse: 1,
    waterCap: 10,
    needsWater: true,
    buildTime: 16,
    floodDepth: 1.6,
  }),
  sandfilter: def('sandfilter', {
    category: 'strom',
    name: 'Sandfilter',
    desc: 'Reinigt mit Strom das gespeicherte Wasser von Schlamm.',
    cost: { holz: 8 },
    powerUse: 0.6,
    floodDepth: 0.9,
  }),
  // --- Molchvolk ------------------------------------------------------------------
  molchlager: def('molchlager', {
    name: 'Steinlager',
    desc: 'Vorratslager des Molchvolks aus Steinplatten. Darf im flachen Wasser stehen, das Hochwasser schadet ihm nicht. Ein zweites Lager weit weg bildet einen eigenen Bezirk.',
    size: 2,
    cost: { stein: 12 },
    storage: 40,
    buildTime: 20,
    wet: true,
    floodDepth: 9,
  }),
  molchhoehle: def('molchhoehle', {
    name: 'Molchhöhle',
    desc: 'Höhle aus Stein für vier Molche. Steht sie im Wasser, sind die Bewohner zufrieden, und das Hochwasser schadet ihr nicht. Liegt sie trocken, leiden die Molche.',
    cost: { stein: 7 },
    housing: 4,
    wet: true,
    floodDepth: 9,
  }),
  grotte: def('grotte', {
    name: 'Grotte',
    desc: 'Große Höhle aus behauenem Stein, in der zehn Molche wohnen. Darf im Wasser stehen und hält jedes Hochwasser aus.',
    size: 2,
    cost: { stein: 16 },
    housing: 10,
    buildTime: 24,
    wet: true,
    floodDepth: 9,
  }),
  steinbruch: def('steinbruch', {
    name: 'Steinbruch',
    desc: 'Arbeiter brechen Stein aus Hängen im Umkreis, die mindestens zwei Stufen höher liegen als der Steinbruch. Der Fels geht nie aus.',
    category: 'versorgung',
    cost: { stein: 5 },
    workers: 2,
    range: 9,
  }),
  kiesbecken: def('kiesbecken', {
    name: 'Kiesbecken',
    desc: 'Ein Arbeiter spült das gespeicherte Wasser durch Kies und reinigt es, ganz ohne Strom. Wichtig vor der Schlammflut, denn schmutziges Wasser macht Molche schwer krank.',
    category: 'versorgung',
    cost: { stein: 10 },
    workers: 1,
    floodDepth: 1.6,
  }),
  algenfarm: def('algenfarm', {
    name: 'Algenfarm',
    desc: 'Steingitter im Fluss, an denen Algen wachsen. Reift nur, solange Wasser darüber steht; in der Dürre fällt die Ernte aus.',
    category: 'nahrung',
    size: 2,
    cost: { stein: 6 },
    workers: 1,
    onWater: true,
    floodDepth: 9,
    harvest: { days: 3, good: 'algen', amount: 6 },
  }),
  laichplatz: def('laichplatz', {
    name: 'Laichplatz',
    desc: 'Geschützte Mulde im Wasser zum Laichen. Molche im Umkreis sind zufriedener, und es schlüpfen mehr Larven.',
    category: 'freude',
    cost: { stein: 4 },
    range: 10,
    joy: true,
    onWater: true,
    floodDepth: 9,
  }),
};

/** So tief darf das Wasser stehen, wo ein Molchbau (`wet`) gesetzt wird */
export const WET_DEPTH = 1.0;

export const BUILDING_ORDER: BuildingId[] = [
  'huette', 'pfahlhaus', 'langhaus', 'lager', 'lagerhaus', 'steg', 'heiler', 'bibliothek', 'schule', 'sternwarte',
  'badesteg', 'musikplatz', 'lagerfeuer', 'spielplatz', 'statue', 'beerenschenke', 'aussichtsturm',
  'pumpe', 'tank', 'zisterne', 'brunnen', 'flossanleger', 'holzfaeller', 'foerster', 'saegewerk', 'werkstatt', 'kraeutergarten',
  'sammler', 'beerengaertner', 'fischer', 'fischteich', 'feld', 'baeckerei',
  'wasserrad', 'laufrad', 'pumpwerk', 'sandfilter',
  'molchlager', 'molchhoehle', 'grotte', 'steinbruch', 'kiesbecken', 'algenfarm', 'laichplatz',
];

/** Gebäude mit Wasserspeicher, an denen Otter trinken */
export const DRINK_SPOTS: BuildingId[] = ['pumpe', 'tank', 'zisterne', 'brunnen', 'pumpwerk'];

export const CATEGORY_LABEL: Record<BuildingCategory, string> = {
  siedlung: 'Siedlung',
  freude: 'Freude',
  versorgung: 'Versorgung',
  nahrung: 'Nahrung',
  strom: 'Strom',
};

/** Kosten der Wasserbau-Werkzeuge in Holz je Zelle und Höhenstufe */
export const DAM_WOOD_PER_LEVEL = 1;
export const GATE_WOOD = 4;

/** Nach so vielen Sekunden im Hochwasser ist ein Gebäude verloren */
export const FLOOD_DESTROY_TIME = 45;
/** So lange braucht ein Gebäude im Trockenen, bis Schäden verheilt sind */
export const FLOOD_REPAIR_TIME = 120;
