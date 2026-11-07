import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, emptyCounters, emptyState, evaluate, parseState, unlockedCount, type GameView } from './achievements';
import { CAMPAIGN, MOLCH_CAMPAIGN } from './maps';

function view(over: Partial<GameView> = {}): GameView {
  return {
    species: 'otter',
    population: 6,
    births: 0,
    deaths: 0,
    lostToFlood: 0,
    mood: 0.6,
    year: 1,
    techs: [],
    toolBonus: false,
    raftTrips: 0,
    powerSupply: 0,
    waterCap: 0,
    outcome: null,
    goalKind: 'clan',
    built: { lager: 1 },
    damCells: 0,
    gateCells: 0,
    ...over,
  };
}

describe('Errungenschaften', () => {
  it('hat vierzig verschiedene Einträge', () => {
    expect(ACHIEVEMENTS.length).toBe(40);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(40);
  });

  it('bleibt ohne Spiel und ohne Siege leer', () => {
    const st = emptyState();
    expect(evaluate(st, { game: null, won: [], counters: emptyCounters() })).toEqual([]);
    expect(evaluate(st, { game: view(), won: [], counters: emptyCounters() })).toEqual([]);
    expect(unlockedCount(st)).toBe(0);
  });

  it('erkennt Siedlung, Bauten und Wasserbau aus dem laufenden Spiel', () => {
    const st = emptyState();
    const g = view({ population: 21, births: 3, built: { lager: 1, huette: 4, lagerfeuer: 1, pumpe: 1, sammler: 2, wasserrad: 1, zisterne: 1 }, powerSupply: 2, waterCap: 100, damCells: 3, techs: ['schrift'] });
    const ids = evaluate(st, { game: g, won: [], counters: emptyCounters() }, 5000).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['erstes-dach', 'kleiner-clan', 'grosser-clan', 'nachwuchs', 'baumeister', 'von-allem-etwas', 'unter-strom', 'gelehrt', 'dammbauer', 'vorratshaltung']));
    expect(ids).not.toContain('flussstadt');
    expect(ids).not.toContain('stadtplaner');
    expect(st.unlocked['kleiner-clan']).toBe(5000);
    // schon erreichte kommen nicht noch einmal
    expect(evaluate(st, { game: g, won: [], counters: emptyCounters() })).toEqual([]);
  });

  it('kennt Kampagne, Zähler und Molche', () => {
    const st = emptyState();
    const counters = { ...emptyCounters(), droughts: 1, dailyDays: 5, riverJoined: 1 };
    const won = [...CAMPAIGN, ...MOLCH_CAMPAIGN].map((s) => s.id);
    const ids = evaluate(st, { game: view({ species: 'molch', population: 10, techs: ['steinkunst'] }), won, counters }).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['durch-die-duerre', 'tagesgast', 'stammgast', 'flussnachbar', 'erste-heimat', 'otterkampagne', 'molchkampagne', 'herr-der-fluesse', 'molchvolk', 'kleiner-clan']));
    expect(ids).not.toContain('flutsicher');
    expect(ids).not.toContain('allwissend');
  });

  it('liest gespeicherte Zustände nachsichtig', () => {
    const st = parseState({ unlocked: { 'kleiner-clan': 123, unbekannt: 5, nachwuchs: 'x' }, counters: { droughts: 2.7, lastDaily: '20261107', games: -1, kaputt: 9 } });
    expect(st.unlocked).toEqual({ 'kleiner-clan': 123 });
    expect(st.counters.droughts).toBe(2);
    expect(st.counters.lastDaily).toBe('20261107');
    expect(st.counters.games).toBe(0);
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState('quatsch')).toEqual(emptyState());
  });
});
