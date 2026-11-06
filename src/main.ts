import * as THREE from 'three';
import './style.css';
import { CameraRig } from './render/camera';
import { TerrainRenderer } from './render/terrain';
import { WaterRenderer } from './render/water';
import type { FromWorker, SimStats, ToWorker } from './sim/protocol';
import { WEATHER_INFO, type Tool, type Weather } from './sim/world';
import SimWorker from './sim/worker?worker';

const MAP_W = 96;
const MAP_H = 96;
const SEED = Number(new URLSearchParams(location.search).get('seed')) || 7;

const app = document.getElementById('app')!;

// --- Szene -----------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b7d4);
scene.fog = new THREE.Fog(0x87b7d4, 160, 420);

const rig = new CameraRig(renderer.domElement, window.innerWidth / window.innerHeight);
rig.setBounds(MAP_W, MAP_H);

const sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
sun.position.set(60, 120, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0008;
sun.target.position.set(MAP_W / 2, 0, MAP_H / 2);
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x5a4a30, 1.1));

const terrain = new TerrainRenderer(MAP_W, MAP_H);
scene.add(terrain.group);
const water = new WaterRenderer(MAP_W, MAP_H);
scene.add(water.mesh);

// Sockel unter der Karte, damit es wie ein Diorama auf dem Tisch wirkt
const base = new THREE.Mesh(
  new THREE.BoxGeometry(MAP_W + 2, 2, MAP_H + 2),
  new THREE.MeshLambertMaterial({ color: 0x4a3a2a }),
);
base.position.set(MAP_W / 2, -1, MAP_H / 2);
base.receiveShadow = true;
scene.add(base);

// Cursor-Markierung
const cursor = new THREE.Mesh(
  new THREE.BoxGeometry(1.04, 0.2, 1.04),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
);
cursor.visible = false;
scene.add(cursor);

// --- Simulation im Worker ---------------------------------------------------
const worker = new SimWorker();
let ground: Uint8Array<ArrayBufferLike> = new Uint8Array(MAP_W * MAP_H);
let struct: Uint8Array<ArrayBufferLike> = new Uint8Array(MAP_W * MAP_H);
let stats: SimStats | null = null;

const send = (msg: ToWorker) => worker.postMessage(msg);

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const msg = e.data;
  if (msg.type === 'terrain') {
    ground = msg.ground;
    struct = msg.struct;
    terrain.update(ground, struct);
    water.setTerrain(ground, struct);
  } else {
    water.setWater(msg.depth, msg.vel);
    stats = msg.stats;
    updateHud();
  }
};
send({ type: 'init', w: MAP_W, h: MAP_H, seed: SEED });

// --- Werkzeuge --------------------------------------------------------------
let tool: Tool = 'damm';
let brush = 1;
let damHeight = 3;
let speed = 1;
let weather: Weather = 'normal';

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const painted = new Set<number>();
let painting = false;

function pickCell(clientX: number, clientY: number): number {
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, rig.camera);
  const hits = raycaster.intersectObjects(terrain.group.children, false);
  if (hits.length === 0) return -1;
  const p = hits[0].point;
  // Punkt minimal in Richtung des Strahls verschieben, damit Wandtreffer
  // der richtigen Zelle zugeordnet werden
  p.addScaledVector(raycaster.ray.direction, 0.01);
  const x = Math.floor(p.x);
  const y = Math.floor(p.z);
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return -1;
  return y * MAP_W + x;
}

function cellsAround(i: number): number[] {
  const x = i % MAP_W;
  const y = (i / MAP_W) | 0;
  const r = brush - 1;
  const out: number[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      out.push(ny * MAP_W + nx);
    }
  }
  return out;
}

function applyAt(i: number): void {
  const cells = cellsAround(i).filter((c) => !painted.has(c));
  if (cells.length === 0) return;
  for (const c of cells) painted.add(c);
  send({ type: 'edit', tool, cells, damHeight });
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.shiftKey || e.ctrlKey || rig.busy) return;
  if (e.pointerType === 'touch') {
    // kurz warten, ob ein zweiter Finger dazukommt
    const id = e.pointerId;
    const x = e.clientX;
    const y = e.clientY;
    setTimeout(() => {
      if (rig.busy || !touchDown.has(id)) return;
      painting = true;
      painted.clear();
      const i = pickCell(x, y);
      if (i >= 0) applyAt(i);
    }, 90);
    touchDown.add(id);
    return;
  }
  painting = true;
  painted.clear();
  const i = pickCell(e.clientX, e.clientY);
  if (i >= 0) applyAt(i);
});
const touchDown = new Set<number>();

window.addEventListener('pointermove', (e) => {
  const i = pickCell(e.clientX, e.clientY);
  if (i >= 0) {
    const x = i % MAP_W;
    const y = (i / MAP_W) | 0;
    cursor.visible = true;
    cursor.scale.set(brush * 2 - 1, 1, brush * 2 - 1);
    cursor.position.set(x + 0.5, ground[i] + struct[i] + 0.12, y + 0.5);
  } else {
    cursor.visible = false;
  }
  if (!painting || rig.busy) return;
  if (i >= 0) applyAt(i);
});
const endPaint = (e: PointerEvent) => {
  touchDown.delete(e.pointerId);
  painting = false;
  painted.clear();
};
window.addEventListener('pointerup', endPaint);
window.addEventListener('pointercancel', endPaint);

// --- HUD --------------------------------------------------------------------
const hudTop = el('div', 'hud hud-top');
const hudBottom = el('div', 'hud hud-bottom');
const info = el('div', 'zettel');
const weatherBox = el('div', 'schild');
const toolBox = el('div', 'schild');
const hint = el('div', 'hinweis');
hint.textContent =
  'Linke Maustaste: Werkzeug. Rechte Maustaste: drehen. Shift + ziehen: verschieben. Rad: zoomen. Touch: ein Finger Werkzeug, zwei Finger Kamera.';
hudTop.append(info, weatherBox);
hudBottom.append(toolBox);
app.append(hudTop, hudBottom, hint);

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

const toolButtons = new Map<Tool, HTMLButtonElement>();
const TOOLS: [Tool, string][] = [
  ['damm', 'Damm'],
  ['abreissen', 'Abreißen'],
  ['anheben', 'Aufschütten'],
  ['absenken', 'Sprengen'],
];
for (const [t, label] of TOOLS) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => {
    tool = t;
    for (const [k, btn] of toolButtons) btn.classList.toggle('aktiv', k === t);
  };
  toolButtons.set(t, b);
  toolBox.append(b);
}
toolButtons.get('damm')!.classList.add('aktiv');

const damBtn = document.createElement('button');
const brushBtn = document.createElement('button');
const refreshSize = () => {
  damBtn.textContent = `Dammhöhe ${damHeight}`;
  brushBtn.textContent = `Pinsel ${brush}`;
};
damBtn.onclick = () => {
  damHeight = (damHeight % 6) + 1;
  refreshSize();
};
brushBtn.onclick = () => {
  brush = (brush % 3) + 1;
  refreshSize();
};
refreshSize();
toolBox.append(damBtn, brushBtn);

const weatherButtons = new Map<Weather, HTMLButtonElement>();
for (const w of ['normal', 'schmelze', 'duerre'] as Weather[]) {
  const b = document.createElement('button');
  b.textContent = WEATHER_INFO[w].label;
  b.onclick = () => {
    weather = w;
    send({ type: 'weather', weather: w });
    for (const [k, btn] of weatherButtons) btn.classList.toggle('aktiv', k === w);
    applyWeatherLook();
  };
  weatherButtons.set(w, b);
  weatherBox.append(b);
}
weatherButtons.get('normal')!.classList.add('aktiv');

const speedBtn = document.createElement('button');
const refreshSpeed = () => {
  speedBtn.textContent = speed === 0 ? 'Pause' : `${speed}x`;
};
speedBtn.onclick = () => {
  speed = (speed + 1) % 4;
  send({ type: 'speed', speed });
  refreshSpeed();
};
refreshSpeed();
weatherBox.append(speedBtn);

const skyNormal = new THREE.Color(0x87b7d4);
const skyDry = new THREE.Color(0xd9b98a);
const skyMelt = new THREE.Color(0x9fb9c9);
function applyWeatherLook(): void {
  const c = weather === 'duerre' ? skyDry : weather === 'schmelze' ? skyMelt : skyNormal;
  (scene.background as THREE.Color).copy(c);
  scene.fog!.color.copy(c);
  sun.color.setHex(weather === 'duerre' ? 0xffd9a0 : 0xfff2d6);
}

function fmt(n: number, d = 1): string {
  return n.toFixed(d);
}

function updateHud(): void {
  if (!stats) return;
  const day = Math.floor(stats.time / 60) + 1;
  info.innerHTML =
    `<b>Tag</b> ${day} (${WEATHER_INFO[stats.weather].label})<br>` +
    `<b>Wasser</b> ${fmt(stats.volume, 0)}<br>` +
    `<b>Zufluss</b> ${fmt(stats.inflow)} /s<br>` +
    `<b>Abfluss</b> ${fmt(stats.outflow)} /s<br>` +
    `<b>Verdunstung</b> ${fmt(stats.evaporation, 2)} /s<br>` +
    `<b>Rechenzeit</b> ${fmt(stats.stepMs, 2)} ms/Schritt`;
}

// --- Schleife ---------------------------------------------------------------
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  rig.resize(window.innerWidth / window.innerHeight);
});

const timer = new THREE.Timer();
function frame(): void {
  timer.update();
  const dt = Math.min(0.1, timer.getDelta());
  water.update(timer.getElapsed(), dt);
  renderer.render(scene, rig.camera);
  requestAnimationFrame(frame);
}
frame();

// Für Browsertests
(window as unknown as { __waterwake: unknown }).__waterwake = {
  getStats: () => stats,
  setTool: (t: Tool) => toolButtons.get(t)?.click(),
  setWeather: (w: Weather) => weatherButtons.get(w)?.click(),
  edit: (t: Tool, cells: number[], h = 3) => send({ type: 'edit', tool: t, cells, damHeight: h }),
  rig,
  mapW: MAP_W,
  mapH: MAP_H,
};
