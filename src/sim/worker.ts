/// <reference lib="webworker" />
import type { FromWorker, ToWorker } from './protocol';
import { SIM_DT, World } from './world';

declare const self: DedicatedWorkerGlobalScope;

let world: World | null = null;
let speed = 1;
let sentVersion = -1;
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
  sentVersion = world.terrainVersion;
  post({
    type: 'terrain',
    w: world.w,
    h: world.h,
    ground: world.ground.slice(),
    struct: world.struct.slice(),
    version: world.terrainVersion,
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
  // höchstens 1 Sekunde Rückstand aufholen
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

  if (world.terrainVersion !== sentVersion) sendTerrain();

  const n = world.w * world.h;
  const depth = world.water.depth.slice();
  const v = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    if (depth[i] <= 0) continue;
    world.water.velocity(i, vel);
    v[i * 2] = vel.x;
    v[i * 2 + 1] = vel.y;
  }
  post(
    {
      type: 'water',
      depth,
      vel: v,
      stats: {
        time: world.time,
        weather: world.weather,
        speed,
        volume: world.water.totalVolume(),
        inflow,
        outflow,
        evaporation: evap,
        stepMs,
      },
    },
    [depth.buffer, v.buffer],
  );
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      world = World.generate(msg.w, msg.h, msg.seed);
      // Fluss schon einmal laufen lassen, damit das Tal beim Start Wasser führt
      for (let i = 0; i < 1600; i++) world.step(SIM_DT);
      world.time = 0;
      world.water.added = world.water.drained = world.water.evaporated = 0;
      sendTerrain();
      lastTick = performance.now();
      break;
    case 'edit':
      if (!world) return;
      for (const i of msg.cells) world.apply(msg.tool, i, msg.damHeight);
      break;
    case 'weather':
      world?.setWeather(msg.weather);
      break;
    case 'speed':
      speed = Math.max(0, Math.min(3, msg.speed));
      break;
  }
};

setInterval(tick, TICK_MS);
