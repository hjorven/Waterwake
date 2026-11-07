import * as THREE from 'three';
import './style.css';
import { BUILDINGS, type BuildingId } from './data/buildings';
import { freeScenario, OTTERTAL, scenarioById } from './data/maps';
import { cloudConnect, cloudDelete, cloudDownload, cloudList, cloudUpload } from './online/cloud';
import {
  deleteLocalSave,
  listLocalSaves,
  loadSettings,
  readLocalSave,
  saveSettings,
  writeLocalSave,
  type Settings,
} from './online/saves';
import { CameraRig } from './render/camera';
import { InstanceRenderer } from './render/instances';
import { buildingGeometry } from './render/models';
import { PostFX } from './render/postfx';
import { TerrainRenderer } from './render/terrain';
import { WaterRenderer } from './render/water';
import { canPlaceAt } from './sim/buildings';
import type { BuildingSnap, FromWorker, SimStats, ToWorker } from './sim/protocol';
import type { SaveGame, SaveMeta } from './sim/save';
import type { Outcome, Tool, Weather } from './sim/world';
import SimWorker from './sim/worker?worker';
import { Hud, type Mode } from './ui/hud';
import { Menu } from './ui/menu';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const settings: Settings = loadSettings();
if (params.has('flach')) settings.tiltShift = false;

// --- Szene -----------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = settings.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b7d4);
scene.fog = new THREE.Fog(0x87b7d4, 160, 420);

const rig = new CameraRig(renderer.domElement, window.innerWidth / window.innerHeight);

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
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x5a4a30, 1.1));

const postfx = new PostFX(renderer, scene, rig.camera);
postfx.enabled = settings.tiltShift;

// Kartenobjekte, werden je Kartengröße neu gebaut
let MAP_W = 96;
let MAP_H = 96;
let terrain!: TerrainRenderer;
let water!: WaterRenderer;
let instances!: InstanceRenderer;
let base!: THREE.Mesh;

function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  scene.remove(g);
}

function buildMap(w: number, h: number): void {
  if (terrain) {
    disposeGroup(terrain.group);
    disposeGroup(water.mesh);
    disposeGroup(instances.group);
    disposeGroup(base);
  }
  MAP_W = w;
  MAP_H = h;
  terrain = new TerrainRenderer(w, h);
  scene.add(terrain.group);
  water = new WaterRenderer(w, h);
  scene.add(water.mesh);
  instances = new InstanceRenderer(w, h);
  scene.add(instances.group);
  // Sockel unter der Karte, damit es wie ein Diorama auf dem Tisch wirkt
  base = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 2, h + 2), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
  base.position.set(w / 2, -1, h / 2);
  base.receiveShadow = true;
  scene.add(base);
  sun.target.position.set(w / 2, 0, h / 2);
  rig.setBounds(w, h);
  ground = new Uint8Array(w * h);
  struct = new Uint8Array(w * h);
  gate = new Uint8Array(w * h);
  sink = new Uint8Array(w * h);
  depth = new Float32Array(w * h);
  occ = new Int16Array(w * h).fill(-1);
  buildings = [];
}

// Cursor-Markierung für Werkzeuge
const cursor = new THREE.Mesh(
  new THREE.BoxGeometry(1.04, 0.2, 1.04),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
);
cursor.visible = false;
scene.add(cursor);

// Vorschau beim Bauen
const ghostMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.65 });
const ghosts = new Map<BuildingId, THREE.Mesh>();
for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
  const m = new THREE.Mesh(buildingGeometry(id), ghostMaterial);
  m.visible = false;
  scene.add(m);
  ghosts.set(id, m);
}
const footprint = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
);
footprint.rotation.x = -Math.PI / 2;
footprint.visible = false;
scene.add(footprint);

// --- Zustand vom Worker -----------------------------------------------------
let ground: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
let struct: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
let gate: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
let sink: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
let depth: Float32Array<ArrayBufferLike> = new Float32Array(0);
let buildings: BuildingSnap[] = [];
let occ = new Int16Array(0);
let stats: SimStats | null = null;
let running = false;
let shownOutcome: Outcome = null;
let pendingIntro: string | null = null;
let lastSaved: { slot: string; data: SaveGame; meta: SaveMeta } | null = null;
buildMap(MAP_W, MAP_H);

const worker = new SimWorker();
const send = (msg: ToWorker) => worker.postMessage(msg);

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'ready':
      if (msg.w !== MAP_W || msg.h !== MAP_H) buildMap(msg.w, msg.h);
      occ.fill(-1);
      buildings = [];
      stats = null;
      shownOutcome = null;
      instances.setCitizens(new Float32Array(0), 0, performance.now() / 1000);
      hud.reset();
      hud.setVisible(true);
      running = true;
      if (msg.loaded) {
        menu.hide();
        menu.toast('Spielstand geladen.');
        setSpeed(1);
      } else if (pendingIntro) {
        const sc = scenarioById(pendingIntro, 0);
        pendingIntro = null;
        if (sc.id !== 'frei') {
          setSpeed(0);
          menu.showIntro(sc);
        } else {
          menu.hide();
          setSpeed(1);
        }
      }
      break;
    case 'terrain':
      ground = msg.ground;
      struct = msg.struct;
      gate = msg.gate;
      sink = msg.sink;
      terrain.update(ground, struct);
      water.setTerrain(ground, struct);
      instances.setTerrain(ground, struct);
      break;
    case 'veg':
      instances.setVegetation(msg.trees, msg.bushes, msg.dry);
      terrain.setSoil(msg.dry);
      break;
    case 'buildings':
      buildings = msg.list;
      occ.fill(-1);
      for (const b of buildings) {
        for (let dy = 0; dy < b.size; dy++) for (let dx = 0; dx < b.size; dx++) occ[(b.y + dy) * MAP_W + b.x + dx] = b.id;
      }
      instances.setBuildings(buildings);
      hud.refreshBuilding(buildings);
      break;
    case 'water':
      depth = msg.depth;
      water.setWater(msg.depth, msg.vel);
      instances.setCitizens(msg.citizens, msg.citizenCount, performance.now() / 1000);
      stats = msg.stats;
      hud.setStats(stats);
      if (msg.messages.length) hud.pushMessages(msg.messages);
      applyWeatherLook(stats.weather);
      if (stats.outcome !== shownOutcome) {
        shownOutcome = stats.outcome;
        if (stats.outcome && !menu.open) {
          setSpeed(0);
          menu.showEnd(stats);
        }
      }
      break;
    case 'saved':
      onSaved(msg.slot, msg.data, msg.meta);
      break;
  }
};

// --- Spielsteuerung -----------------------------------------------------------
let speed = 1;
let speedBeforeMenu = 1;

function setSpeed(s: number): void {
  speed = s;
  send({ type: 'speed', speed: s });
  hud.setSpeed(s);
}

function startGame(scenario: string, seed: number, freeBuild: boolean): void {
  const sc = scenario === 'frei' ? freeScenario(seed) : scenarioById(scenario, seed);
  pendingIntro = sc.id;
  running = false;
  send({ type: 'init', scenario: sc.id, seed: sc.seed, w: sc.w, h: sc.h, freeBuild });
  speed = 1;
}

function openMenu(): void {
  if (menu.open) return;
  speedBeforeMenu = speed;
  setSpeed(0);
  menu.showMenu(stats);
}

function resume(): void {
  if (!running) return;
  setSpeed(speedBeforeMenu || 1);
}

function showStart(): void {
  speedBeforeMenu = 1;
  setSpeed(0);
  hud.showBuilding(null);
  menu.showStart();
}

function saveName(): string {
  return stats ? `${stats.scenarioName}, Tag ${stats.season.day}` : 'Spielstand';
}

function onSaved(slot: string, data: SaveGame, meta: SaveMeta): void {
  lastSaved = { slot, data, meta };
  if (slot.startsWith('cloud:')) {
    const n = Number(slot.slice(6));
    const waiter = cloudWaiters.get(n);
    cloudWaiters.delete(n);
    cloudUpload(n, data, meta).then(
      () => waiter?.resolve(),
      (err: Error) => waiter?.reject(err),
    );
    return;
  }
  const ok = writeLocalSave(slot, data, meta);
  if (slot !== 'auto') menu.toast(ok ? `Gespeichert: ${slotLabelFor(slot)}.` : 'Speichern fehlgeschlagen: kein Platz im Browser.', !ok);
  menu.refreshSaves();
}

function slotLabelFor(slot: string): string {
  return slot === 'auto' ? 'Automatisch' : `Platz ${slot}`;
}

function loadData(data: SaveGame): void {
  running = false;
  pendingIntro = null;
  send({ type: 'load', data });
}

const cloudWaiters = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();

const menu = new Menu(app, {
  onNewGame: (scenario, seed, freeBuild) => {
    menu.hide();
    startGame(scenario, seed, freeBuild);
  },
  onResume: () => resume(),
  onMainMenu: () => showStart(),
  canSave: () => running && !!stats && stats.population > 0,
  listLocal: () => listLocalSaves(),
  onSaveLocal: (slot) => send({ type: 'save', slot, name: saveName() }),
  onLoadLocal: (slot) => {
    const data = readLocalSave(slot);
    if (!data) return false;
    loadData(data);
    return true;
  },
  onDeleteLocal: (slot) => deleteLocalSave(slot),
  onCloudConnect: () => cloudConnect(),
  onCloudList: () => cloudList(),
  onCloudUpload: (slot) =>
    new Promise<void>((resolve, reject) => {
      cloudWaiters.set(slot, { resolve, reject });
      send({ type: 'save', slot: `cloud:${slot}`, name: saveName() });
    }),
  onCloudDownload: async (slot) => {
    const data = await cloudDownload(slot);
    loadData(data);
  },
  onCloudDelete: (slot) => cloudDelete(slot),
  getSettings: () => ({ ...settings }),
  onSettings: (s) => {
    Object.assign(settings, s);
    saveSettings(settings);
    postfx.enabled = settings.tiltShift;
    renderer.shadowMap.enabled = settings.shadows;
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material.needsUpdate = true;
    });
  },
});

const hud = new Hud(app, {
  onMode: (m) => {
    mode = m;
    updatePreview();
  },
  onSpeed: (s) => setSpeed(s),
  onDemolish: (id) => {
    const b = buildings.find((x) => x.id === id);
    if (b) send({ type: 'demolish', cell: b.y * MAP_W + b.x });
  },
  onMenu: () => openMenu(),
});
let mode: Mode = hud.mode;

const skyNormal = new THREE.Color(0x87b7d4);
const skyDry = new THREE.Color(0xd9b98a);
const skyMelt = new THREE.Color(0x9fb9c9);
let shownWeather: Weather | null = null;
function applyWeatherLook(weather: Weather): void {
  if (weather === shownWeather) return;
  shownWeather = weather;
  const c = weather === 'duerre' ? skyDry : weather === 'schmelze' ? skyMelt : skyNormal;
  (scene.background as THREE.Color).copy(c);
  scene.fog!.color.copy(c);
  sun.color.setHex(weather === 'duerre' ? 0xffd9a0 : weather === 'schmelze' ? 0xe8f0ff : 0xfff2d6);
  water.setLook(weather);
  postfx.setLook(weather);
}

// --- Zeigen und Klicken -----------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const painted = new Set<number>();
let painting = false;
let hoverCell = -1;
let hoverPoint = new THREE.Vector3();
const touchDown = new Set<number>();

function pickCell(clientX: number, clientY: number): number {
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, rig.camera);
  const hits = raycaster.intersectObjects(terrain.group.children, false);
  if (hits.length === 0) return -1;
  const p = hits[0].point;
  // Punkt minimal in Richtung des Strahls verschieben, damit Wandtreffer
  // der richtigen Zelle zugeordnet werden
  p.addScaledVector(raycaster.ray.direction, 0.01);
  hoverPoint = p;
  const x = Math.floor(p.x);
  const y = Math.floor(p.z);
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return -1;
  return y * MAP_W + x;
}

function cellsAround(i: number, brush: number): number[] {
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

/** Linke obere Zelle der Grundfläche, so dass der Zeiger in der Mitte liegt */
function footprintOrigin(id: BuildingId): { x: number; y: number } {
  const size = BUILDINGS[id].size;
  return { x: Math.floor(hoverPoint.x - (size - 1) / 2), y: Math.floor(hoverPoint.z - (size - 1) / 2) };
}

/** Bis der nächste Gebäudestand kommt, gilt die Fläche schon als belegt */
function markOccupied(id: BuildingId, x: number, y: number): void {
  const size = BUILDINGS[id].size;
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) occ[(y + dy) * MAP_W + x + dx] = 32000;
  updatePreview();
}

function placementError(id: BuildingId, x: number, y: number): string | null {
  return canPlaceAt(id, x, y, MAP_W, MAP_H, occ, { ground, struct, depth, sink });
}

function updatePreview(): void {
  for (const g of ghosts.values()) g.visible = false;
  footprint.visible = false;
  cursor.visible = false;
  if (hoverCell < 0 || menu.open) return;
  if (mode.kind === 'build') {
    const id = mode.id;
    const size = BUILDINGS[id].size;
    const { x, y } = footprintOrigin(id);
    const err = placementError(id, x, y);
    const ghost = ghosts.get(id)!;
    const i = Math.min(MAP_W * MAP_H - 1, Math.max(0, y * MAP_W + x));
    const h = ground[i] + struct[i];
    ghost.position.set(x + size / 2, h, y + size / 2);
    ghost.visible = true;
    ghostMaterial.color.setHex(err ? 0xff7070 : 0xffffff);
    footprint.position.set(x + size / 2, h + 0.03, y + size / 2);
    footprint.scale.set(size, size, 1);
    (footprint.material as THREE.MeshBasicMaterial).color.setHex(err ? 0xff4040 : 0x66ff66);
    footprint.visible = true;
    hud.setHint(err ? `Hier nicht möglich: ${err}.` : `${BUILDINGS[id].name} setzen (${BUILDINGS[id].wood} Holz).`, !!err);
  } else if (mode.kind === 'tool') {
    const x = hoverCell % MAP_W;
    const y = (hoverCell / MAP_W) | 0;
    const brush = mode.tool === 'schleuse' ? 1 : hud.brush;
    cursor.visible = true;
    cursor.scale.set(brush * 2 - 1, 1, brush * 2 - 1);
    cursor.position.set(x + 0.5, ground[hoverCell] + struct[hoverCell] + 0.12, y + 0.5);
  }
}

function applyTool(i: number): void {
  if (mode.kind !== 'tool') return;
  const tool = mode.tool;
  if (tool === 'abreissen' && occ[i] >= 0) {
    send({ type: 'demolish', cell: i });
    return;
  }
  const brush = tool === 'schleuse' ? 1 : hud.brush;
  const cells = cellsAround(i, brush).filter((c) => !painted.has(c));
  if (cells.length === 0) return;
  for (const c of cells) painted.add(c);
  send({ type: 'edit', tool, cells, damHeight: hud.damHeight });
}

function clickAt(i: number): void {
  if (menu.open) return;
  if (mode.kind === 'build') {
    const { x, y } = footprintOrigin(mode.id);
    if (placementError(mode.id, x, y)) return;
    send({ type: 'place', id: mode.id, x, y });
    markOccupied(mode.id, x, y);
    return;
  }
  if (mode.kind === 'tool') {
    painting = true;
    painted.clear();
    applyTool(i);
    return;
  }
  // Auswählen
  if (gate[i]) {
    send({ type: 'edit', tool: 'schleuse', cells: [i], damHeight: 1 });
    return;
  }
  const id = occ[i];
  hud.showBuilding(id >= 0 ? (buildings.find((b) => b.id === id) ?? null) : null);
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.shiftKey || e.ctrlKey || rig.busy || menu.open) return;
  if (e.pointerType === 'touch') {
    // kurz warten, ob ein zweiter Finger dazukommt
    const id = e.pointerId;
    const x = e.clientX;
    const y = e.clientY;
    touchDown.add(id);
    setTimeout(() => {
      if (rig.busy || !touchDown.has(id)) return;
      const i = pickCell(x, y);
      hoverCell = i;
      if (i >= 0) clickAt(i);
    }, 90);
    return;
  }
  const i = pickCell(e.clientX, e.clientY);
  hoverCell = i;
  if (i >= 0) clickAt(i);
});

window.addEventListener('pointermove', (e) => {
  if (menu.open) return;
  hoverCell = pickCell(e.clientX, e.clientY);
  updatePreview();
  if (!painting || rig.busy || hoverCell < 0) return;
  applyTool(hoverCell);
});

const endPaint = (e: PointerEvent) => {
  touchDown.delete(e.pointerId);
  painting = false;
  painted.clear();
};
window.addEventListener('pointerup', endPaint);
window.addEventListener('pointercancel', endPaint);

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  switch (e.key) {
    case 'Escape':
      if (menu.open) {
        if (menu.view === 'menu' || menu.view === 'saves' || menu.view === 'settings') {
          menu.hide();
          resume();
        }
      } else if (mode.kind !== 'select' || hud.shownBuilding >= 0) {
        hud.setMode({ kind: 'select' });
        hud.showBuilding(null);
      } else {
        openMenu();
      }
      break;
    case ' ':
      if (menu.open) return;
      e.preventDefault();
      setSpeed(speed === 0 ? 1 : 0);
      break;
    case '1':
    case '2':
    case '3':
      if (menu.open) return;
      setSpeed(Number(e.key));
      break;
  }
});

// --- Schleife ---------------------------------------------------------------
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  rig.resize(window.innerWidth / window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
});

const timer = new THREE.Timer();
function frame(): void {
  timer.update();
  const dt = Math.min(0.1, timer.getDelta());
  const now = timer.getElapsed();
  water.update(now, dt);
  instances.update(performance.now() / 1000);
  postfx.render(scene, rig.camera, now, dt);
  requestAnimationFrame(frame);
}
frame();

// --- Start ------------------------------------------------------------------
// Mit ?karte=ottertal, ?seed=12 oder ?frei geht es direkt los (auch für Tests),
// sonst zeigt das Startmenü die Kampagnenkarte im Hintergrund.
if (params.has('karte') || params.has('seed') || params.has('frei')) {
  const karte = params.get('karte');
  const seed = Number(params.get('seed')) || OTTERTAL.seed;
  startGame(karte && karte !== 'frei' ? karte : 'frei', seed, params.has('frei'));
  if (!karte) pendingIntro = null;
} else {
  pendingIntro = null;
  send({ type: 'init', scenario: OTTERTAL.id, seed: OTTERTAL.seed, w: OTTERTAL.w, h: OTTERTAL.h });
  showStart();
}

// Für Browsertests
(window as unknown as { __waterwake: unknown }).__waterwake = {
  getStats: () => stats,
  getBuildings: () => buildings,
  setMode: (m: Mode) => hud.setMode(m),
  place: (id: BuildingId, x: number, y: number) => {
    send({ type: 'place', id, x, y });
    markOccupied(id, x, y);
  },
  placementError,
  edit: (tool: Tool, cells: number[], h = 3) => send({ type: 'edit', tool, cells, damHeight: h }),
  setWeather: (w: Weather) => send({ type: 'weather', weather: w }),
  setSpeed: (s: number) => setSpeed(s),
  newGame: (scenario: string, seed: number, free = false) => startGame(scenario, seed, free),
  save: (slot: string) => send({ type: 'save', slot, name: saveName() }),
  load: (slot: string) => {
    const data = readLocalSave(slot);
    if (data) loadData(data);
    return !!data;
  },
  lastSaved: () => lastSaved,
  rig,
  hud,
  menu,
  postfx,
  mapW: () => MAP_W,
  mapH: () => MAP_H,
  ground: () => ground,
  depth: () => depth,
};
