import { describe, expect, it } from 'vitest';
import { BUILDING_ORDER, BUILDINGS, type BuildingId } from './buildings';
import { SPECIES, SPECIES_ORDER } from './species';
import { TECH_FOR, TECH_ORDER, TECHS, techTable } from './tech';

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

  it('je Volk gehört jedes Gebäude zu höchstens einer Technologie, Grundgebäude zu keiner', () => {
    for (const sp of SPECIES_ORDER) {
      const def = SPECIES[sp];
      const table = techTable(def.techs);
      const seen = new Set<BuildingId>();
      for (const t of def.techs) {
        for (const b of TECHS[t].unlocks) {
          expect(seen.has(b)).toBe(false);
          seen.add(b);
          expect(table[b]).toBe(t);
          // eine Technik schaltet nur Gebäude frei, die das Volk auch bauen kann
          expect(def.buildings).toContain(b);
        }
      }
    }
    // die Vorgabe TECH_FOR ist die Tafel der Otter
    expect(TECH_FOR).toEqual(techTable(SPECIES.otter.techs));
    for (const b of ['lager', 'huette', 'pumpe', 'tank', 'sammler', 'holzfaeller', 'foerster', 'badesteg', 'musikplatz', 'bibliothek'] as BuildingId[]) {
      expect(TECH_FOR[b]).toBeUndefined();
    }
    for (const b of ['molchlager', 'molchhoehle', 'steinbruch', 'kiesbecken', 'algenfarm', 'laichplatz'] as BuildingId[]) {
      expect(techTable(SPECIES.molch.techs)[b]).toBeUndefined();
    }
    // Statue und Aussichtsturm hängen bei Ottern am Holz, bei Molchen am Stein
    expect(TECH_FOR.statue).toBe('schnitzkunst');
    expect(techTable(SPECIES.molch.techs).statue).toBe('steinkunst');
    for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
      if (id !== 'lager') expect(BUILDING_ORDER).toContain(id);
    }
  });
});
