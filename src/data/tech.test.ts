import { describe, expect, it } from 'vitest';
import { BUILDING_ORDER, BUILDINGS, type BuildingId } from './buildings';
import { TECH_FOR, TECH_ORDER, TECHS } from './tech';

describe('Technologiebaum', () => {
  it('jede Technologie steht in der Reihenfolge und schaltet nur bekannte Gebäude frei', () => {
    expect(TECH_ORDER.length).toBe(Object.keys(TECHS).length);
    for (const t of TECH_ORDER) {
      const d = TECHS[t];
      expect(d.cost).toBeGreaterThan(0);
      if (d.requires) expect(TECH_ORDER.indexOf(d.requires)).toBeLessThan(TECH_ORDER.indexOf(t));
      for (const b of d.unlocks) expect(BUILDINGS[b]).toBeDefined();
    }
  });

  it('jedes Gebäude gehört zu höchstens einer Technologie, Grundgebäude zu keiner', () => {
    const seen = new Set<BuildingId>();
    for (const t of TECH_ORDER) {
      for (const b of TECHS[t].unlocks) {
        expect(seen.has(b)).toBe(false);
        seen.add(b);
        expect(TECH_FOR[b]).toBe(t);
      }
    }
    for (const b of ['lager', 'huette', 'pumpe', 'tank', 'sammler', 'holzfaeller', 'foerster', 'badesteg', 'musikplatz', 'bibliothek'] as BuildingId[]) {
      expect(TECH_FOR[b]).toBeUndefined();
    }
    for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
      if (id !== 'lager') expect(BUILDING_ORDER).toContain(id);
    }
  });
});
