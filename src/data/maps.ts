/** Spielbare Karten mit Ziel. Freies Spiel hat kein Ziel. */
export interface Goal {
  /** so viele Otter müssen gleichzeitig leben */
  population: number;
  /** und dieses Jahr muss erreicht sein */
  year: number;
}

export interface Scenario {
  id: string;
  name: string;
  seed: number;
  w: number;
  h: number;
  /** Einleitung, ein Absatz je Eintrag */
  intro: string[];
  goal: Goal | null;
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
  goal: { population: 16, year: 3 },
};

export const SCENARIOS: Record<string, Scenario> = { ottertal: OTTERTAL };

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

export function scenarioById(id: string, seed: number): Scenario {
  return SCENARIOS[id] ?? freeScenario(seed);
}

export function goalText(goal: Goal | null): string {
  if (!goal) return 'Kein Ziel, freies Spiel';
  return `${goal.population} Otter und das Jahr ${goal.year} erreichen`;
}
