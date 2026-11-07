import { describe, expect, it } from 'vitest';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { buildingGeometry, CARRY_CODES, carryGeometry, raftCargoGeometry, raftGeometry } from './models';

describe('Modelle', () => {
  it('jedes Gebäude und jede getragene Ware hat ein Modell', () => {
    for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
      const g = buildingGeometry(id);
      expect(g.getAttribute('position').count).toBeGreaterThan(0);
      expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
      g.dispose();
    }
    for (const code of CARRY_CODES) {
      const g = carryGeometry(code);
      expect(g.getAttribute('position').count).toBeGreaterThan(0);
      g.dispose();
      const r = raftCargoGeometry(code);
      expect(r.getAttribute('position').count).toBeGreaterThan(0);
      r.dispose();
    }
    const raft = raftGeometry();
    expect(raft.getAttribute('position').count).toBeGreaterThan(0);
    raft.dispose();
  });
});
