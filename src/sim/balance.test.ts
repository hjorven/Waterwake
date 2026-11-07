import { describe, expect, it } from 'vitest';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { HOCHLAND, LAGUNE, SCHLAMMTAL, type Scenario } from '../data/maps';
import { costFor } from '../data/species';
import { DAY } from './seasons';
import { World } from './world';

/**
 * Balanceprobe der Molch-Kampagne: ein einfacher Baumeister spielt jede Karte
 * bis zum Ziel. Läuft nur mit BALANCE=1, weil ein Durchlauf Minuten dauert:
 *   BALANCE=1 npx vitest run src/sim/balance.test.ts
 */

declare const process: { env: Record<string, string | undefined>; stdout: { write(text: string): void } };

const STEPS_PER_DAY = Math.round(DAY / 0.05);

function runDay(world: World): void {
  for (let i = 0; i < STEPS_PER_DAY; i++) world.step(0.05);
}

interface Spot {
  x: number;
  y: number;
}

type Ok = (x: number, y: number) => boolean;

/** Ein Baumeister, der grob das tut, was der Kartentipp empfiehlt */
class Builder {
  readonly camp: Spot;
  private day = 0;
  private damRow = -1;
  private damCells: number[] = [];
  private damHeight = 0;
  readonly log: string[] = [];

  private world: World;

  constructor(world: World) {
    this.world = world;
    const camp = [...world.buildings.alive()].find((b) => b.def === world.species.camp)!;
    this.camp = { x: camp.x, y: camp.y };
  }

  private depth(x: number, y: number): number {
    return this.world.water.depth[y * this.world.w + x];
  }

  /** Spiralsuche um das Lager nach einem Platz, der passt */
  private find(id: BuildingId, ok: Ok | null, radius: number): Spot | null {
    const { w, h } = this.world;
    const size = BUILDINGS[id].size;
    for (let r = 2; r <= radius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = this.camp.x + dx;
          const y = this.camp.y + dy;
          if (x < 2 || y < 2 || x + size >= w - 2 || y + size >= h - 2) continue;
          if (this.world.placementError(id, x, y)) continue;
          if (ok && !ok(x, y)) continue;
          return { x, y };
        }
      }
    }
    return null;
  }

  private count(id: BuildingId): number {
    let n = 0;
    for (const b of this.world.buildings.alive()) if (b.def === id) n++;
    return n;
  }

  private pending(): number {
    let n = 0;
    for (const b of this.world.buildings.alive()) if (!b.built) n++;
    return n;
  }

  private tryPlace(id: BuildingId, ok: Ok | null, radius: number): boolean {
    const spot = this.find(id, ok, radius);
    if (!spot) {
      this.log.push(`Tag ${this.day}: kein Platz für ${id}`);
      return false;
    }
    const b = this.world.place(id, spot.x, spot.y);
    if (b) this.log.push(`Tag ${this.day}: ${id} bei ${spot.x},${spot.y}`);
    return !!b;
  }

  /** Fels im Umkreis des Steinbruchs: zwei Stufen höher und trocken */
  private rockNear(x: number, y: number): boolean {
    const { w, h, ground } = this.world;
    const base = ground[y * w + x];
    for (let yy = y - 9; yy <= y + 9; yy++) {
      for (let xx = x - 9; xx <= x + 9; xx++) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        if (Math.hypot(xx - x, yy - y) > 9) continue;
        const i = yy * w + xx;
        if (ground[i] >= base + 2 && this.world.water.depth[i] < 0.1) return true;
      }
    }
    return false;
  }

  /** Jeden Tag höchstens ein neues Gebäude, und nur wenn nicht schon zwei Baustellen warten */
  tick(): void {
    this.day++;
    const s = this.world.stats();
    const stone = s.goods.stein;
    const pop = s.population;
    const wet: Ok = (x, y) => this.depth(x, y) >= 0.15 && this.depth(x, y) <= 0.9;
    const anyLand: Ok = (x, y) => this.depth(x, y) <= 0.9;
    const pool: Ok = (x, y) => this.depth(x, y) >= 0.3;
    if (this.world.scenario.goal?.kind === 'stausee') this.dam(stone);
    if (this.pending() >= 2) return;
    // Betten nur bis knapp über das Ziel, sonst wächst das Volk schneller als Nahrung und Wasser
    const goalPop = this.world.scenario.goal?.population ?? 20;
    const beds = Math.min(Math.ceil((goalPop + 4) / 4), Math.ceil((pop + 3) / 4));
    const wants: [BuildingId, number, Ok | null, number][] = [
      ['steinbruch', 1, (x, y) => this.rockNear(x, y), 24],
      ['molchhoehle', Math.min(2, beds), wet, 16],
      ['pumpe', 1, null, 16],
      ['algenfarm', 2, pool, 18],
      ['molchhoehle', beds, wet, 16],
      ['laichplatz', 1, pool, 18],
      ['tank', this.day >= 4 ? 1 : 0, null, 16],
      ['kiesbecken', this.day >= 6 ? 1 : 0, null, 16],
      ['algenfarm', Math.max(2, Math.ceil(pop / 5)), pool, 20],
      ['tank', Math.max(1, Math.ceil(pop / 6)), null, 18],
      ['molchlager', pop >= 12 ? 2 : 1, null, 14],
      ['pumpe', pop >= 14 ? 2 : 1, null, 18],
    ];
    for (const [id, want, ok, radius] of wants) {
      if (this.count(id) >= want) continue;
      const cost = Object.values(costFor(BUILDINGS[id].cost, this.world.species.material)).reduce((a, b) => a + (b ?? 0), 0);
      if (stone < cost + 2 && id !== 'steinbruch') continue;
      if (this.tryPlace(id, ok, radius)) return;
      // Höhlen notfalls an Land
      if (id === 'molchhoehle' && this.tryPlace(id, anyLand, 20)) return;
    }
  }

  /** Stausee: ein Damm quer durch das Flussbett, ein gutes Stück unterhalb des Lagers */
  private dam(stone: number): void {
    const { w, h, ground } = this.world;
    if (this.day < 5) return;
    if (this.damRow < 0) {
      let bestY = -1;
      let bestWidth = Infinity;
      for (let y = this.camp.y + 12; y <= h - 8; y++) {
        let bed = Infinity;
        for (let x = 0; x < w; x++) bed = Math.min(bed, ground[y * w + x]);
        let width = 0;
        for (let x = 0; x < w; x++) if (ground[y * w + x] <= bed + 2) width++;
        if (width < bestWidth) {
          bestWidth = width;
          bestY = y;
        }
      }
      if (bestY < 0) return;
      let bed = Infinity;
      for (let x = 0; x < w; x++) bed = Math.min(bed, ground[bestY * w + x]);
      this.damRow = bestY;
      for (let x = 0; x < w; x++) if (ground[bestY * w + x] <= bed + 3) this.damCells.push(bestY * w + x);
      this.damHeight = 3;
      this.log.push(`Tag ${this.day}: Dammzeile ${bestY} mit ${this.damCells.length} Zellen`);
    }
    // See zu klein, obwohl der Damm steht: höher bauen
    const s = this.world.stats();
    const done = this.damCells.every((i) => this.world.struct[i] >= this.damHeight);
    if (done && this.damHeight < 5 && s.deepCells < 40 && this.day % 6 === 0) {
      this.damHeight++;
      this.log.push(`Tag ${this.day}: Damm auf ${this.damHeight}`);
    }
    let budget = Math.floor(stone - 4);
    for (const i of this.damCells) {
      if (budget <= 0) break;
      if (this.world.struct[i] >= this.damHeight) continue;
      if (this.world.apply('damm', i, this.damHeight)) budget--;
    }
  }
}

function play(sc: Scenario, maxDays: number): { world: World; builder: Builder; lines: string[] } {
  const world = World.fromScenario(sc);
  world.setSpecies('molch');
  world.settle();
  const builder = new Builder(world);
  const lines: string[] = [];
  for (let d = 0; d < maxDays; d++) {
    builder.tick();
    runDay(world);
    const s = world.stats();
    if (d % 3 === 0 || s.outcome) {
      lines.push(
        `Tag ${s.season.day} J${s.season.year} ${world.weather.padEnd(8)} Molche ${String(s.population).padStart(2)} (K${s.children}) Betten ${s.housing} Nahrung ${s.food.toFixed(0).padStart(3)} Wasser ${s.water.toFixed(0).padStart(3)}/${s.waterCap} Stein ${s.goods.stein.toFixed(0).padStart(3)} Stimmung ${(s.mood * 100).toFixed(0)}% Tote ${s.deaths} Geb ${s.births} dreck ${(s.waterPollution * 100).toFixed(0)}% See ${s.deepCells}/${s.goalDays.toFixed(1)} ${s.outcome ?? ''}`,
      );
    }
    if (s.outcome) break;
  }
  return { world, builder, lines };
}

/** Verlauf direkt auf die Ausgabe, an vitest vorbei */
function report(name: string, builder: Builder, lines: string[]): void {
  process.stdout.write(`\n=== ${name}\n${[...builder.log, ...lines].join('\n')}\n`);
}

describe.skipIf(!process.env.BALANCE)('Balance der Molch-Kampagne', { timeout: 3_600_000 }, () => {
  it('Lagune: 14 Molche im zweiten Jahr', () => {
    const { world, builder, lines } = play(LAGUNE, 80);
    report('lagune', builder, lines);
    expect(world.outcome).toBe('won');
  });

  it('Schlammtal: 20 Molche im dritten Jahr', () => {
    const { world, builder, lines } = play(SCHLAMMTAL, 120);
    report('schlammtal', builder, lines);
    expect(world.outcome).toBe('won');
  });

  it('Hochland: Stausee und 16 Molche', () => {
    const { world, builder, lines } = play(HOCHLAND, 120);
    report('hochland', builder, lines);
    expect(world.outcome).toBe('won');
  });
});
