import * as THREE from 'three';
import type { BuildingId } from '../data/buildings';
import type { Species } from '../data/species';
import { CITIZEN_STRIDE, RAFT_STRIDE, type BuildingSnap } from '../sim/protocol';
import {
  BUILDING_IDS,
  berriesGeometry,
  buildingGeometry,
  bushGeometry,
  CARRY_CODES,
  carryGeometry,
  molchGeometry,
  otterGeometry,
  raftCargoGeometry,
  raftGeometry,
  siteGeometry,
  treeGeometry,
} from './models';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

/** InstancedMesh, das bei Bedarf wächst */
class Pool {
  mesh: THREE.InstancedMesh;
  private readonly geo: THREE.BufferGeometry;
  private readonly parent: THREE.Object3D;
  private readonly withColor: boolean;

  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry, capacity: number, withColor = false) {
    this.geo = geo;
    this.parent = parent;
    this.withColor = withColor;
    this.mesh = this.make(capacity);
  }

  private make(capacity: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo, MAT, capacity);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    if (this.withColor) {
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    }
    this.parent.add(m);
    return m;
  }

  ensure(n: number): void {
    if (n <= this.mesh.instanceMatrix.count) return;
    this.parent.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = this.make(Math.max(n, Math.ceil(this.mesh.instanceMatrix.count * 1.5)));
  }

  /** Mesh und Geometrie freigeben, etwa beim Wechsel des Bewohnermodells */
  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
    this.geo.dispose();
  }
}

const m4 = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);
const color = new THREE.Color();

/** Abstand des Flößers hinter der Floßmitte und der Ladung davor */
const RIDE_BACK = 0.26;
const CARGO_FRONT = 0.2;

function setInstance(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, ry: number, s: number, sy = s): void {
  pos.set(x, y, z);
  quat.setFromAxisAngle(yAxis, ry);
  scl.set(s, sy, s);
  m4.compose(pos, quat, scl);
  mesh.setMatrixAt(i, m4);
}

function hash(i: number): number {
  let t = (i + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

interface CitizenTrack {
  id: number;
  px: number;
  py: number;
  pz: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  state: number;
  carry: number;
  /** 1 erwachsen, kleiner für Junge */
  scale: number;
  sick: boolean;
}

interface RaftTrack {
  id: number;
  px: number;
  py: number;
  pz: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  cargo: number;
  amount: number;
}

/**
 * Alle Bäume, Sträucher, Gebäude und Bewohner als InstancedMesh.
 * Höhen kommen vom Gelände (Boden plus Bauwerk).
 */
export class InstanceRenderer {
  readonly group = new THREE.Group();
  private readonly w: number;
  private readonly trees: Pool;
  private readonly bushes: Pool;
  private readonly berries: Pool;
  private readonly buildings = new Map<BuildingId, Pool>();
  private readonly sites = new Map<number, Pool>();
  /** Bewohner, je nach Volk Otter oder Molche */
  private otters: Pool;
  private species: Species = 'otter';
  /** getragene Waren je Kennziffer */
  private readonly carried = new Map<number, Pool>();
  private readonly rafts: Pool;
  /** Ladung auf Flößen je Kennziffer */
  private readonly raftCargo = new Map<number, Pool>();
  private height = new Float32Array(0);
  private tracks = new Map<number, CitizenTrack>();
  private raftTracks = new Map<number, RaftTrack>();
  private snapTime = 0;
  private snapInterval = 0.05;
  private buildingList: BuildingSnap[] = [];

  constructor(w: number, h: number) {
    this.w = w;
    this.height = new Float32Array(w * h);
    this.trees = new Pool(this.group, treeGeometry(), 1024, true);
    this.bushes = new Pool(this.group, bushGeometry(), 256);
    this.berries = new Pool(this.group, berriesGeometry(), 256);
    for (const id of BUILDING_IDS) this.buildings.set(id, new Pool(this.group, buildingGeometry(id), 32));
    for (const size of [1, 2]) this.sites.set(size, new Pool(this.group, siteGeometry(size), 16));
    this.otters = new Pool(this.group, otterGeometry(), 64, true);
    for (const code of CARRY_CODES) this.carried.set(code, new Pool(this.group, carryGeometry(code), 16));
    this.rafts = new Pool(this.group, raftGeometry(), 8);
    for (const code of CARRY_CODES) this.raftCargo.set(code, new Pool(this.group, raftCargoGeometry(code), 8));
  }

  /** Bewohnermodell wechseln: Otter oder Molch */
  setSpecies(id: Species): void {
    if (id === this.species) return;
    this.species = id;
    this.otters.dispose();
    this.otters = new Pool(this.group, id === 'molch' ? molchGeometry() : otterGeometry(), 64, true);
  }

  setTerrain(ground: Uint8Array<ArrayBufferLike>, struct: Uint8Array<ArrayBufferLike>): void {
    for (let i = 0; i < ground.length; i++) this.height[i] = ground[i] + struct[i];
    this.placeBuildings();
  }

  setVegetation(trees: Uint8Array<ArrayBufferLike>, bushes: Uint8Array<ArrayBufferLike>, dry: Uint8Array<ArrayBufferLike>): void {
    const w = this.w;
    let nt = 0;
    let nb = 0;
    let nr = 0;
    for (let i = 0; i < trees.length; i++) {
      if (trees[i]) nt++;
      if (bushes[i]) {
        nb++;
        if (bushes[i] === 2) nr++;
      }
    }
    this.trees.ensure(nt);
    this.bushes.ensure(nb);
    this.berries.ensure(nr);
    let t = 0;
    let b = 0;
    let r = 0;
    for (let i = 0; i < trees.length; i++) {
      const stage = trees[i];
      const bush = bushes[i];
      if (!stage && !bush) continue;
      const x = (i % w) + 0.5 + (hash(i) - 0.5) * 0.3;
      const z = Math.floor(i / w) + 0.5 + (hash(i * 7 + 1) - 0.5) * 0.3;
      const y = this.height[i];
      const ry = hash(i * 3 + 2) * Math.PI * 2;
      if (stage) {
        const s = stage === 3 ? 0.9 + hash(i * 5) * 0.3 : stage === 2 ? 0.6 : 0.3;
        setInstance(this.trees.mesh, t, x, y, z, ry, s);
        // Trockenheit färbt das Laub braun
        const d = dry[i] / 255;
        color.setRGB(1 + d * 0.5, 1 - d * 0.25, 1 - d * 0.6);
        this.trees.mesh.setColorAt(t, color);
        t++;
      } else {
        setInstance(this.bushes.mesh, b++, x, y, z, ry, 0.9 + hash(i * 11) * 0.3);
        if (bush === 2) setInstance(this.berries.mesh, r++, x, y, z, ry, 0.9 + hash(i * 11) * 0.3);
      }
    }
    this.trees.mesh.count = t;
    this.trees.mesh.instanceMatrix.needsUpdate = true;
    if (this.trees.mesh.instanceColor) this.trees.mesh.instanceColor.needsUpdate = true;
    this.bushes.mesh.count = b;
    this.bushes.mesh.instanceMatrix.needsUpdate = true;
    this.berries.mesh.count = r;
    this.berries.mesh.instanceMatrix.needsUpdate = true;
  }

  setBuildings(list: BuildingSnap[]): void {
    this.buildingList = list;
    this.placeBuildings();
  }

  private placeBuildings(): void {
    const counts = new Map<BuildingId, number>();
    const siteCounts = new Map<number, number>();
    for (const b of this.buildingList) {
      if (b.built) counts.set(b.def, (counts.get(b.def) ?? 0) + 1);
      else siteCounts.set(b.size, (siteCounts.get(b.size) ?? 0) + 1);
    }
    for (const [id, pool] of this.buildings) {
      pool.ensure(counts.get(id) ?? 0);
      pool.mesh.count = 0;
    }
    for (const [size, pool] of this.sites) {
      pool.ensure(siteCounts.get(size) ?? 0);
      pool.mesh.count = 0;
    }
    for (const b of this.buildingList) {
      const i = b.y * this.w + b.x;
      const x = b.x + b.size / 2;
      const z = b.y + b.size / 2;
      const y = this.height[i];
      if (b.built) {
        const pool = this.buildings.get(b.def)!;
        setInstance(pool.mesh, pool.mesh.count++, x, y, z, 0, 1);
      } else {
        const pool = this.sites.get(b.size)!;
        setInstance(pool.mesh, pool.mesh.count++, x, y, z, 0, 1, 0.25 + 0.75 * Math.max(b.delivered * 0.4, b.progress));
      }
    }
    for (const pool of this.buildings.values()) pool.mesh.instanceMatrix.needsUpdate = true;
    for (const pool of this.sites.values()) pool.mesh.instanceMatrix.needsUpdate = true;
  }

  setCitizens(data: Float32Array<ArrayBufferLike>, count: number, now: number): void {
    const seen = new Set<number>();
    for (let k = 0; k < count; k++) {
      const o = k * CITIZEN_STRIDE;
      const id = data[o];
      seen.add(id);
      let t = this.tracks.get(id);
      if (!t) {
        t = { id, px: data[o + 1], py: data[o + 2], pz: data[o + 3], x: 0, y: 0, z: 0, heading: 0, state: 0, carry: 0, scale: 1, sick: false };
        this.tracks.set(id, t);
      } else {
        t.px = t.x;
        t.py = t.y;
        t.pz = t.z;
      }
      t.x = data[o + 1];
      t.y = data[o + 2];
      t.z = data[o + 3];
      t.heading = data[o + 4];
      t.state = data[o + 5];
      t.carry = data[o + 6];
      t.scale = data[o + 7] || 1;
      t.sick = data[o + 8] > 0.5;
    }
    for (const id of [...this.tracks.keys()]) if (!seen.has(id)) this.tracks.delete(id);
    this.snapInterval = Math.max(0.02, Math.min(0.3, now - this.snapTime));
    this.snapTime = now;
  }

  setRafts(data: Float32Array<ArrayBufferLike>, count: number): void {
    const seen = new Set<number>();
    for (let k = 0; k < count; k++) {
      const o = k * RAFT_STRIDE;
      const id = data[o];
      seen.add(id);
      let t = this.raftTracks.get(id);
      if (!t) {
        t = { id, px: data[o + 1], py: data[o + 2], pz: data[o + 3], x: 0, y: 0, z: 0, heading: 0, cargo: 0, amount: 0 };
        this.raftTracks.set(id, t);
      } else {
        t.px = t.x;
        t.py = t.y;
        t.pz = t.z;
      }
      t.x = data[o + 1];
      t.y = data[o + 2];
      t.z = data[o + 3];
      t.heading = data[o + 4];
      t.cargo = data[o + 5];
      t.amount = data[o + 6];
    }
    for (const id of [...this.raftTracks.keys()]) if (!seen.has(id)) this.raftTracks.delete(id);
  }

  /** Jeden Frame: Bewohner zwischen den Simulationsständen interpolieren */
  update(now: number): void {
    const n = this.tracks.size;
    this.otters.ensure(n);
    for (const pool of this.carried.values()) {
      pool.ensure(n);
      pool.mesh.count = 0;
    }
    const a = Math.min(1, (now - this.snapTime) / this.snapInterval);
    let i = 0;
    for (const t of this.tracks.values()) {
      // auf dem Floß steht der Otter hinten, die Ladung liegt vorn
      const riding = t.state === 5;
      const x = t.px + (t.x - t.px) * a - (riding ? Math.sin(t.heading) * RIDE_BACK : 0);
      const y = t.py + (t.y - t.py) * a - (riding ? Math.cos(t.heading) * RIDE_BACK : 0);
      const z = t.pz + (t.z - t.pz) * a;
      const walking = t.state === 1;
      const bob = walking ? Math.abs(Math.sin(now * 12 + t.id)) * 0.06 : 0;
      const working = t.state === 2 ? Math.sin(now * 8 + t.id) * 0.08 : 0;
      const hop = t.scale < 1 && walking ? Math.abs(Math.sin(now * 14 + t.id)) * 0.1 : 0;
      setInstance(this.otters.mesh, i, x, z + bob + hop, y, t.heading + working, t.scale);
      // kranke Otter sind blass und grünlich
      color.setRGB(t.sick ? 0.8 : 1, t.sick ? 1 : 1, t.sick ? 0.75 : 1);
      this.otters.mesh.setColorAt(i, color);
      const carry = this.carried.get(t.carry);
      if (carry) setInstance(carry.mesh, carry.mesh.count++, x, z + bob, y, t.heading, t.scale);
      i++;
    }
    this.otters.mesh.count = i;
    this.otters.mesh.instanceMatrix.needsUpdate = true;
    if (this.otters.mesh.instanceColor) this.otters.mesh.instanceColor.needsUpdate = true;
    for (const pool of this.carried.values()) pool.mesh.instanceMatrix.needsUpdate = true;

    // Flöße schaukeln leicht auf dem Wasser
    const nr = this.raftTracks.size;
    this.rafts.ensure(nr);
    for (const pool of this.raftCargo.values()) {
      pool.ensure(nr);
      pool.mesh.count = 0;
    }
    let r = 0;
    for (const t of this.raftTracks.values()) {
      const x = t.px + (t.x - t.px) * a;
      const y = t.py + (t.y - t.py) * a;
      const z = t.pz + (t.z - t.pz) * a + Math.sin(now * 2 + t.id) * 0.02;
      setInstance(this.rafts.mesh, r++, x, z, y, t.heading, 1);
      const cargo = this.raftCargo.get(t.cargo);
      if (cargo && t.amount > 0) {
        setInstance(cargo.mesh, cargo.mesh.count++, x + Math.sin(t.heading) * CARGO_FRONT, z + 0.12, y + Math.cos(t.heading) * CARGO_FRONT, t.heading, 1);
      }
    }
    this.rafts.mesh.count = r;
    this.rafts.mesh.instanceMatrix.needsUpdate = true;
    for (const pool of this.raftCargo.values()) pool.mesh.instanceMatrix.needsUpdate = true;
  }
}
