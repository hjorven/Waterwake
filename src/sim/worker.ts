/// <reference lib="webworker" />
import { BUILDINGS } from '../data/buildings';
import { customScenario } from '../data/custom';
import { freeScenario, scenarioById } from '../data/maps';
import { encodeBytes } from './codec';
import { GOOD_CODE, STATE_CODE } from './citizens';
import { CITIZEN_STRIDE, RAFT_STRIDE, type BuildingSnap, type FromWorker, type ToWorker } from './protocol';
import { restoreWorld, serializeWorld } from './save';
import { SIM_DT, World } from './world';

declare const self: DedicatedWorkerGlobalScope;

let world: World | null = null;
let speed = 1;
let sentTerrain = -1;
let sentBuildings = -1;
let buildingsSentAt = 0;
let sentVeg = -1;
let sentSoil = -1;
let vegSentAt = 0;
let lastTick = performance.now();
let acc = 0;
let stepMs = 0;
let lastAutoDay = -1;
// Messwerte, über etwa eine Sekunde geglättet
let inflow = 0;
let outflow = 0;
let evap = 0;

/** Simulationssekunden pro Echtzeitsekunde bei Geschwindigkeit 1 */
const SIM_RATE = 2;
const TICK_MS = 50;
const vel = { x: 0, y: 0 };

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

function sendTerrain(): void {
  if (!world) return;
  sentTerrain = world.terrainVersion;
  post({
    type: 'terrain',
    w: world.w,
    h: world.h,
    ground: world.ground.slice(),
    struct: world.struct.slice(),
    gate: world.gate.slice(),
    gateOpen: world.gateOpen.slice(),
    sink: world.water.sink.slice(),
    sources: world.water.sources.map((s) => ({ index: s.index, rate: s.rate })),
    start: world.start,
    version: world.terrainVersion,
  });
}

function sendBuildings(): void {
  if (!world) return;
  sentBuildings = world.buildings.version;
  buildingsSentAt = performance.now();
  const list: BuildingSnap[] = [];
  for (const b of world.buildings.alive()) {
    let raftText: string | undefined;
    let district: string | undefined;
    if (b.def === 'flossanleger' && b.built) {
      const raft = world.rafts.raftOf(b.id);
      raftText = raft ? world.rafts.describe(raft) : 'kein Wasser am Anleger';
      const store = world.rafts.store(b);
      if (store) {
        const a = world.buildings.center(b);
        const c = world.buildings.center(store);
        district = `${BUILDINGS[store.def].name} (${Math.round(Math.hypot(a.x - c.x, a.y - c.y))} Felder)`;
      } else district = '';
    }
    list.push({
      id: b.id,
      def: b.def,
      x: b.x,
      y: b.y,
      size: b.size,
      built: b.built,
      progress: b.progress,
      workers: b.workers.length,
      residents: b.residents.length,
      stock: { ...b.stock },
      delivered: world.buildings.deliveredShare(b),
      deliveredGoods: { ...b.delivered },
      growth: b.growth,
      flooded: b.flooded,
      damage: b.damage,
      power: b.def === 'wasserrad' ? world.wheelPower(b) : b.def === 'laufrad' ? (world.citizens.workingAt(b.id, 'tread') ? BUILDINGS.laufrad.powerGen : 0) : world.power.ratio,
      raftText,
      district,
    });
  }
  post({ type: 'buildings', list, version: world.buildings.version });
}

function sendVeg(): void {
  if (!world) return;
  sentVeg = world.veg.version;
  sentSoil = world.veg.soilVersion;
  vegSentAt = performance.now();
  post({
    type: 'veg',
    trees: world.veg.trees.slice(),
    bushes: world.veg.bushes.slice(),
    dry: world.veg.dry.slice(),
    version: world.veg.version,
  });
}

function sendSave(slot: string, name: string): void {
  if (!world) return;
  const { data, meta } = serializeWorld(world, name);
  post({ type: 'saved', slot, name, data, meta });
}

function useWorld(w: World, loaded: boolean): void {
  world = w;
  sentTerrain = sentBuildings = sentVeg = sentSoil = -1;
  lastTick = performance.now();
  acc = 0;
  inflow = outflow = evap = 0;
  lastAutoDay = w.seasons.info().day;
  post({ type: 'ready', w: w.w, h: w.h, scenario: w.scenario.id, loaded, editor: w.editor });
}

function tick(): void {
  if (!world) return;
  const now = performance.now();
  const realDt = Math.min(0.25, (now - lastTick) / 1000);
  lastTick = now;
  acc += realDt * speed * SIM_RATE;
  let steps = 0;
  const t0 = performance.now();
  // höchstens 3 Sekunden Rückstand aufholen
  acc = Math.min(acc, SIM_RATE * 3);
  while (acc >= SIM_DT) {
    world.step(SIM_DT);
    acc -= SIM_DT;
    steps++;
  }
  if (steps > 0) {
    stepMs = stepMs * 0.9 + ((performance.now() - t0) / steps) * 0.1;
    const simDt = steps * SIM_DT;
    const k = Math.min(1, simDt / 2);
    const water = world.water;
    inflow += (water.added / simDt - inflow) * k;
    outflow += (water.drained / simDt - outflow) * k;
    evap += (water.evaporated / simDt - evap) * k;
    water.added = water.drained = water.evaporated = 0;
  }

  if (world.terrainVersion !== sentTerrain) sendTerrain();
  // Strom, Reife und Vorräte ändern sich laufend: einmal je Sekunde frisch schicken
  if (world.buildings.version !== sentBuildings || now - buildingsSentAt > 1000) sendBuildings();
  if ((world.veg.version !== sentVeg || world.veg.soilVersion !== sentSoil) && now - vegSentAt > 400) sendVeg();

  const n = world.w * world.h;
  const depth = world.water.depth.slice();
  const pollution = world.water.maxPollution() > 0.001 ? world.water.pollution.slice() : null;
  const v = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    if (depth[i] <= 0) continue;
    world.water.velocity(i, vel);
    v[i * 2] = vel.x;
    v[i * 2 + 1] = vel.y;
  }

  const citizens = world.citizens;
  const count = citizens.count();
  const cz = new Float32Array(count * CITIZEN_STRIDE);
  let k = 0;
  for (const c of citizens.alive()) {
    const cell = citizens.cell(c);
    const d = depth[cell];
    // auf dem Floß und auf dem Steg stehen Otter über dem Wasser
    const z = c.state === 'ride' ? world.height(cell) + d + 0.12 : world.isJetty(cell) ? world.height(cell) + 0.62 : world.height(cell) + (d > 0.25 ? d * 0.6 : d);
    cz[k++] = c.id;
    cz[k++] = c.x;
    cz[k++] = c.y;
    cz[k++] = z;
    cz[k++] = c.heading;
    cz[k++] = STATE_CODE[c.state];
    cz[k++] = c.carry ? GOOD_CODE[c.carry] : 0;
    cz[k++] = c.child ? 0.6 : 1;
    cz[k++] = c.sick ? 1 : 0;
  }

  const rafts = world.rafts.list;
  const rz = new Float32Array(rafts.length * RAFT_STRIDE);
  let q = 0;
  for (const r of rafts) {
    const cell = world.rafts.cell(r);
    rz[q++] = r.id;
    rz[q++] = r.x;
    rz[q++] = r.y;
    rz[q++] = world.height(cell) + depth[cell];
    rz[q++] = r.heading;
    rz[q++] = r.good ? GOOD_CODE[r.good] : 0;
    rz[q++] = r.amount;
  }

  const messages = world.messages.splice(0, world.messages.length);
  const s = world.stats();
  post(
    {
      type: 'water',
      depth,
      vel: v,
      pollution,
      citizens: cz,
      citizenCount: count,
      rafts: rz,
      raftCount: rafts.length,
      stats: {
        time: world.time,
        weather: world.weather,
        speed,
        volume: world.water.totalVolume(),
        inflow,
        outflow,
        evaporation: evap,
        stepMs,
        ...s,
      },
      messages,
    },
    pollution ? [depth.buffer, v.buffer, cz.buffer, rz.buffer, pollution.buffer] : [depth.buffer, v.buffer, cz.buffer, rz.buffer],
  );

  // Einmal am Tag automatisch speichern
  if (s.season.day !== lastAutoDay) {
    lastAutoDay = s.season.day;
    if (s.population > 0) sendSave('auto', 'Automatisch');
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init': {
      const scenario = msg.custom ? customScenario(msg.custom) : msg.scenario === 'frei' ? freeScenario(msg.seed, msg.w, msg.h) : scenarioById(msg.scenario, msg.seed);
      const w = World.fromScenario(scenario);
      w.freeBuild = !!msg.freeBuild;
      w.editor = !!msg.editor;
      // im Editor bleibt das Wetter normal, damit der Fluss ruhig fließt
      if (w.editor) w.autoSeasons = false;
      if (msg.unlockAll) w.unlockAll();
      w.settle(!w.editor);
      useWorld(w, false);
      break;
    }
    case 'load':
      try {
        useWorld(restoreWorld(msg.data), true);
      } catch (err) {
        world?.log(`Spielstand konnte nicht geladen werden: ${(err as Error).message}`);
      }
      break;
    case 'save':
      sendSave(msg.slot, msg.name);
      break;
    case 'exportMap': {
      if (!world) return;
      const sinks: number[] = [];
      for (let i = 0; i < world.water.sink.length; i++) if (world.water.sink[i]) sinks.push(i);
      post({
        type: 'map',
        map: { w: world.w, h: world.h, ground: encodeBytes(world.ground), sources: world.water.sources.map((s) => ({ index: s.index, rate: s.rate })), sinks, start: world.start },
      });
      break;
    }
    case 'edit':
      if (!world) return;
      for (const i of msg.cells) world.apply(msg.tool, i, msg.damHeight);
      break;
    case 'weather':
      world?.forceWeather(msg.weather);
      break;
    case 'speed':
      speed = Math.max(0, Math.min(3, msg.speed));
      break;
    case 'place':
      world?.place(msg.id, msg.x, msg.y);
      break;
    case 'demolish':
      world?.demolish(msg.cell);
      break;
    case 'research':
      world?.research(msg.tech);
      break;
    case 'unlock':
      world?.unlockAll();
      break;
  }
};

setInterval(tick, TICK_MS);
