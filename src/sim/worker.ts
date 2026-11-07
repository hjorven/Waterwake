/// <reference lib="webworker" />
import { GOOD_CODE, STATE_CODE } from './citizens';
import { CITIZEN_STRIDE, type BuildingSnap, type FromWorker, type ToWorker } from './protocol';
import { SIM_DT, World } from './world';

declare const self: DedicatedWorkerGlobalScope;

let world: World | null = null;
let speed = 1;
let sentTerrain = -1;
let sentBuildings = -1;
let sentVeg = -1;
let sentSoil = -1;
let vegSentAt = 0;
let lastTick = performance.now();
let acc = 0;
let stepMs = 0;
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
    version: world.terrainVersion,
  });
}

function sendBuildings(): void {
  if (!world) return;
  sentBuildings = world.buildings.version;
  const list: BuildingSnap[] = [];
  for (const b of world.buildings.alive()) {
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
      wood: b.stock.holz,
      berries: b.stock.beeren,
      woodDelivered: b.woodDelivered,
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
  if (world.buildings.version !== sentBuildings) sendBuildings();
  if ((world.veg.version !== sentVeg || world.veg.soilVersion !== sentSoil) && now - vegSentAt > 400) sendVeg();

  const n = world.w * world.h;
  const depth = world.water.depth.slice();
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
    const z = world.height(cell) + (d > 0.25 ? d * 0.6 : d);
    cz[k++] = c.id;
    cz[k++] = c.x;
    cz[k++] = c.y;
    cz[k++] = z;
    cz[k++] = c.heading;
    cz[k++] = STATE_CODE[c.state];
    cz[k++] = c.carry ? GOOD_CODE[c.carry] : 0;
  }

  const messages = world.messages.splice(0, world.messages.length);
  const s = world.stats();
  post(
    {
      type: 'water',
      depth,
      vel: v,
      citizens: cz,
      citizenCount: count,
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
    [depth.buffer, v.buffer, cz.buffer],
  );
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      world = World.generate(msg.w, msg.h, msg.seed);
      world.freeBuild = !!msg.freeBuild;
      world.settle();
      sentTerrain = sentBuildings = sentVeg = sentSoil = -1;
      lastTick = performance.now();
      break;
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
  }
};

setInterval(tick, TICK_MS);
