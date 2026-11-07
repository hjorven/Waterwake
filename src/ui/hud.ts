import { BUILDINGS, BUILDING_ORDER, CATEGORY_LABEL, DAM_WOOD_PER_LEVEL, DRINK_SPOTS, GATE_WOOD, type BuildingCategory, type BuildingId } from '../data/buildings';
import { costText, FOODS, GOOD_LABEL, GOODS } from '../data/goods';
import { DAILY_ID, dailyScore } from '../data/daily';
import { goalText } from '../data/maps';
import { TECH_FOR, TECH_ORDER, TECHS, type TechId } from '../data/tech';
import type { BuildingSnap, SimStats } from '../sim/protocol';
import { MAX_DAM, MAX_DIKE, WEATHER_INFO, type Tool, type Weather } from '../sim/world';

export type Mode = { kind: 'select' } | { kind: 'build'; id: BuildingId } | { kind: 'tool'; tool: Tool };

export interface HudCallbacks {
  onMode(mode: Mode): void;
  onSpeed(speed: number): void;
  onDemolish(buildingId: number): void;
  onResearch(tech: TechId): void;
  onMenu(): void;
}

type Tab = BuildingCategory | 'forschung' | 'wasserbau' | 'gelaende';

const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

export const ICONS: Record<string, string> = {
  huette: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  pumpe: '<circle cx="9" cy="12" r="5"/><path d="M9 7v10M4 12h10"/><path d="M14 12h6v-4"/>',
  tank: '<rect x="5" y="4" width="14" height="16" rx="3"/><path d="M5 9h14M5 15h14"/>',
  sammler: '<path d="M4 10h16l-2 10H6z"/><path d="M8 10a4 4 0 0 1 8 0"/><circle cx="10" cy="15" r="1"/><circle cx="14" cy="15" r="1"/>',
  holzfaeller: '<path d="M13 3l8 8-4 4-8-8z"/><path d="M11 11l-8 8 2 2 8-8"/>',
  foerster: '<path d="M12 21v-9"/><path d="M12 12c-4 0-6-3-6-6 3 0 6 2 6 6z"/><path d="M12 12c4 0 6-3 6-6-3 0-6 2-6 6z"/>',
  lager: '<path d="M3 9l9-5 9 5v11H3z"/><path d="M3 9h18M9 20v-7h6v7"/>',
  badesteg: '<path d="M3 10h13"/><path d="M5 10v9M9 10v9M13 10v9"/><path d="M16 10v6"/><path d="M3 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  musikplatz: '<ellipse cx="12" cy="8" rx="7" ry="3"/><path d="M5 8v8c0 1.7 3.1 3 7 3s7-1.3 7-3V8"/><path d="M8 3l2 4M16 3l-2 4"/>',
  heiler: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M12 12v6M9 15h6"/>',
  brunnen: '<path d="M4 20V9h16v11"/><path d="M2 9l10-6 10 6"/><path d="M8 20v-5a4 4 0 0 1 8 0v5"/>',
  zisterne: '<path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3v10c0 1.7-3.6 3-8 3s-8-1.3-8-3z"/><path d="M4 7c0 1.7 3.6 3 8 3s8-1.3 8-3M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  wasserrad: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7"/>',
  laufrad: '<circle cx="12" cy="11" r="8"/><path d="M4 21h16"/><circle cx="12" cy="11" r="2"/><path d="M10 13l-2 4M14 13l2 4"/>',
  pumpwerk: '<rect x="3" y="10" width="12" height="10" rx="1"/><path d="M6 10V6h3v4"/><circle cx="18" cy="8" r="3"/><path d="M15 15h6v-4"/>',
  sandfilter: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M4 14h16"/><path d="M8 17v2M12 17v2M16 17v2"/>',
  pfahlhaus: '<path d="M4 12l8-6 8 6"/><path d="M6 11v5h12v-5"/><path d="M8 16v5M16 16v5M12 16v5"/>',
  langhaus: '<path d="M3 10l9-5 9 5"/><path d="M4 10v10h16V10"/><path d="M8 20v-5h3v5M13 20v-5h3v5"/>',
  bibliothek: '<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/>',
  schule: '<path d="M3 11 12 6l9 5"/><path d="M5 10v9h14v-9"/><path d="M12 6V3"/><path d="M10 19v-4h4v4"/>',
  sternwarte: '<path d="M4 20h16"/><path d="M6 20V10a6 6 0 0 1 12 0v10"/><path d="M12 10l6-6"/><circle cx="18" cy="4" r="1" fill="currentColor"/>',
  saegewerk: '<circle cx="9" cy="13" r="6"/><circle cx="9" cy="13" r="1.5"/><path d="M15 13h6M18 10l3 3-3 3"/>',
  werkstatt: '<path d="M14 4l6 6-2 2-6-6z"/><path d="M12 6l-8 8 2 2 8-8"/><path d="M4 20h16"/>',
  kraeutergarten: '<path d="M12 21v-8"/><path d="M12 13c-3 0-5-2-5-5 3 0 5 2 5 5z"/><path d="M12 13c3 0 5-2 5-5-3 0-5 2-5 5z"/><path d="M4 21h16"/>',
  fischer: '<path d="M3 12c4-5 10-5 14 0-4 5-10 5-14 0z"/><path d="M17 12l4-3v6z"/><circle cx="7" cy="11" r="1" fill="currentColor"/>',
  fischteich: '<ellipse cx="12" cy="14" rx="9" ry="5"/><path d="M8 14c1.5-2 4-2 5.5 0"/><path d="M13.5 14l2-1.5v3z"/><path d="M5 9V6M8 10V5"/>',
  beerengaertner: '<circle cx="9" cy="15" r="2.5"/><circle cx="15" cy="15" r="2.5"/><circle cx="12" cy="10" r="2.5"/><path d="M12 7V3"/><path d="M4 21h16"/>',
  feld: '<path d="M12 21V8"/><path d="M12 12c-3 0-4-2-4-4 2 0 4 1 4 4zM12 12c3 0 4-2 4-4-2 0-4 1-4 4zM12 16c-3 0-4-2-4-4 2 0 4 1 4 4zM12 16c3 0 4-2 4-4-2 0-4 1-4 4z"/>',
  baeckerei: '<path d="M4 12c0-3 4-5 8-5s8 2 8 5v7H4z"/><path d="M8 11v2M12 10v2M16 11v2"/>',
  lagerfeuer: '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 1-5 1-8z"/><path d="M3 21h18"/>',
  beerenschenke: '<path d="M5 8h10v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M15 11h3a2 2 0 0 1 0 4h-3"/><path d="M5 8c0-2 2-3 5-3s5 1 5 3"/>',
  statue: '<circle cx="12" cy="6" r="2.5"/><path d="M9 10h6l1 6H8z"/><path d="M6 20h12v-4H6z"/>',
  spielplatz: '<path d="M3 20h18"/><path d="M6 20V8l10 8"/><path d="M6 12h4M6 16h6"/>',
  aussichtsturm: '<path d="M8 21l2-18h4l2 18"/><path d="M6 9h12M5 15h14"/><path d="M4 21h16"/>',
  wissen: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M8 13a5 5 0 1 1 8 0c-1 1-1.5 2-1.5 3h-5c0-1-.5-2-1.5-3z"/>',
  nahrung: '<path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M12 12V5"/><path d="M12 5c2 0 3 1 4 2"/>',
  bretter: '<path d="M3 8h18v4H3z"/><path d="M3 14h18v4H3z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  strom: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  krank: '<circle cx="12" cy="12" r="9"/><path d="M8 9l2 2M10 9l-2 2M14 9l2 2M16 9l-2 2"/><path d="M9 16c1.5-1.5 4.5-1.5 6 0"/>',
  damm: '<path d="M3 20h18M4 20V9h16v11M4 14h16M9 9v5M14 14v6"/>',
  deich: '<path d="M3 20h18M4 20c2-8 14-8 16 0"/>',
  schleuse: '<path d="M5 4v16M19 4v16M8 8h8v8H8z"/><path d="M12 8v8"/>',
  abreissen: '<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/>',
  anheben: '<path d="M3 20h18"/><path d="M12 16V5"/><path d="M7 10l5-5 5 5"/>',
  absenken: '<path d="M3 20h18"/><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/>',
  select: '<path d="M5 3l14 9-6 1-3 6z"/>',
  otter: '<circle cx="12" cy="12" r="7"/><circle cx="9.5" cy="11" r="1" fill="currentColor"/><circle cx="14.5" cy="11" r="1" fill="currentColor"/><path d="M10 15c1 1 3 1 4 0"/><path d="M6 7l2 2M18 7l-2 2"/>',
  mood: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M8 14c1.5 2 6.5 2 8 0"/>',
  moodBad: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M8 16c1.5-2 6.5-2 8 0"/>',
  holz: '<rect x="3" y="9" width="18" height="6" rx="3"/><circle cx="6" cy="12" r="1.5"/>',
  beeren: '<circle cx="9" cy="14" r="3"/><circle cx="15" cy="14" r="3"/><circle cx="12" cy="9" r="3"/><path d="M12 6V3"/>',
  wasser: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  normal: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  schmelze: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/>',
  duerre: '<circle cx="12" cy="8" r="4"/><path d="M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  schlamm: '<path d="M3 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><circle cx="7" cy="19" r="1" fill="currentColor"/><circle cx="12" cy="20" r="1" fill="currentColor"/><circle cx="17" cy="19" r="1" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 4l12 8-12 8z"/>',
  schnell: '<path d="M4 4l8 8-8 8M12 4l8 8-8 8"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  ziel: '<path d="M5 21V4"/><path d="M5 4h12l-3 4 3 4H5"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3"/><path d="M8 21v-7h8v7"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 17.5 18z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  flood: '<path d="M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3"/><path d="M12 13v4M8 21h8M10 17h4v4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h3M13 14h3M8 18h3"/>',
};

export function icon(name: string): string {
  return `${SVG_OPEN}${ICONS[name] ?? ''}</svg>`;
}

interface Item {
  key: string;
  label: string;
  icon: string;
  cost: string;
  desc: string;
  mode: Mode;
  /** Forschungskarte */
  tech?: TechId;
}

const WATER_ITEMS: Item[] = [
  {
    key: 'damm',
    label: 'Damm',
    icon: 'damm',
    cost: `${DAM_WOOD_PER_LEVEL} Holz je Stufe`,
    desc: `Hält Wasser komplett zurück, bis zu ${MAX_DAM} Stufen hoch. Ziehen malt eine Linie.`,
    mode: { kind: 'tool', tool: 'damm' },
  },
  {
    key: 'deich',
    label: 'Deich',
    icon: 'deich',
    cost: 'Erde, kostenlos',
    desc: `Aufgeschütteter Erdwall bis ${MAX_DIKE} Stufen. Schützt vor Hochwasser, sehr hohes Wasser läuft darüber.`,
    mode: { kind: 'tool', tool: 'deich' },
  },
  {
    key: 'schleuse',
    label: 'Schleusentor',
    icon: 'schleuse',
    cost: `${GATE_WOOD} Holz`,
    desc: 'Ein Tor im Damm. Nochmal anklicken öffnet oder schließt es.',
    mode: { kind: 'tool', tool: 'schleuse' },
  },
  {
    key: 'abreissen',
    label: 'Abreißen',
    icon: 'abreissen',
    cost: 'halbes Holz zurück',
    desc: 'Entfernt Dämme, Deiche, Tore und Gebäude.',
    mode: { kind: 'tool', tool: 'abreissen' },
  },
];

const LAND_ITEMS: Item[] = [
  {
    key: 'anheben',
    label: 'Aufschütten',
    icon: 'anheben',
    cost: 'kostenlos',
    desc: 'Hebt den Boden um eine Stufe. Gut für Terrassen und Rampen.',
    mode: { kind: 'tool', tool: 'anheben' },
  },
  {
    key: 'absenken',
    label: 'Sprengen',
    icon: 'absenken',
    cost: 'kostenlos',
    desc: 'Senkt den Boden um eine Stufe. Gräbt Kanäle und Becken.',
    mode: { kind: 'tool', tool: 'absenken' },
  },
  {
    key: 'select',
    label: 'Auswählen',
    icon: 'select',
    cost: '',
    desc: 'Gebäude anklicken zeigt Einzelheiten. Rechte Maustaste dreht die Kamera.',
    mode: { kind: 'select' },
  },
];

function buildItems(category: BuildingCategory): Item[] {
  return BUILDING_ORDER.filter((id) => BUILDINGS[id].category === category).map((id) => {
    const d = BUILDINGS[id];
    const extra: string[] = [];
    if (d.workers) extra.push(`${d.workers} Arbeiter`);
    if (d.housing) extra.push(`${d.housing} Betten`);
    if (d.waterCap) extra.push(`${d.waterCap} Wasser`);
    if (d.storage) extra.push(`${d.storage} je Ware`);
    if (d.range) extra.push(`Umkreis ${d.range}`);
    if (d.powerGen) extra.push(`bis ${fmt(d.powerGen)} Strom`);
    if (d.powerUse) extra.push(`braucht ${fmt(d.powerUse)} Strom`);
    if (d.recipe) extra.push(`${d.recipe.inAmount} ${GOOD_LABEL[d.recipe.input]} zu ${d.recipe.outAmount} ${GOOD_LABEL[d.recipe.output]}`);
    if (d.harvest) extra.push(`${d.harvest.amount} ${GOOD_LABEL[d.harvest.good]} alle ${d.harvest.days} Tage`);
    if (d.knowledge) extra.push(`${fmt(d.knowledge)} Wissen je Schicht`);
    const tech = TECH_FOR[id];
    return {
      key: id,
      label: d.name,
      icon: id,
      cost: costText(d.cost),
      desc: `${d.desc} ${extra.join(', ')}.${tech ? ` Forschung: ${TECHS[tech].name}.` : ''}`,
      mode: { kind: 'build', id },
    };
  });
}

function researchItems(): Item[] {
  return TECH_ORDER.map((t) => {
    const d = TECHS[t];
    const req = d.requires ? ` Braucht ${TECHS[d.requires].name}.` : '';
    return {
      key: `tech:${t}`,
      label: d.name,
      icon: 'wissen',
      cost: `${d.cost} Wissen`,
      desc: `${d.desc} Schaltet frei: ${d.unlocks.map((b) => BUILDINGS[b].name).join(', ')}.${req}`,
      mode: { kind: 'select' },
      tech: t,
    };
  });
}

const WEATHER_ICON: Record<Weather, string> = { normal: 'normal', schmelze: 'schmelze', duerre: 'duerre', schlamm: 'schlamm' };

/** Zahl mit einer Nachkommastelle und Komma */
export function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

export function pollutionLabel(p: number): string {
  if (p < 0.1) return 'sauber';
  if (p < 0.3) return 'leicht trüb';
  if (p < 0.6) return 'verschmutzt';
  return 'schlammig';
}

export function moodLabel(mood: number): string {
  if (mood >= 0.75) return 'glücklich';
  if (mood >= 0.55) return 'zufrieden';
  if (mood >= 0.4) return 'mäßig';
  return 'unglücklich';
}

export class Hud {
  readonly root: HTMLElement;
  mode: Mode = { kind: 'select' };
  damHeight = 3;
  brush = 1;
  private readonly cb: HudCallbacks;
  private items: HTMLElement;
  private tabs: HTMLElement;
  private hint: HTMLElement;
  private options: HTMLElement;
  private heightValue: HTMLElement;
  private brushButtons: HTMLButtonElement[] = [];
  private speedButtons: HTMLButtonElement[] = [];
  private season: HTMLElement;
  private goal: HTMLElement;
  private res: HTMLElement;
  private messages: HTMLElement;
  private panel: HTMLElement;
  private panelBody: HTMLElement;
  private panelTitle: HTMLElement;
  private panelBuilding: BuildingSnap | null = null;
  private wood = 0;
  private stats: SimStats | null = null;
  private cards = new Map<string, HTMLElement>();
  private lastStatsKey = '';
  private lastCardsKey = '';

  constructor(parent: HTMLElement, cb: HudCallbacks) {
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <header class="topbar">
        <div class="brand">Waterwake</div>
        <div class="season"></div>
        <div class="goal"></div>
        <div class="res"></div>
        <div class="speed"></div>
        <button class="icon-btn menu-btn" title="Menü, Speichern, Einstellungen (Esc)">${icon('menu')}</button>
      </header>
      <div class="messages"></div>
      <aside class="panel hidden">
        <div class="panel-head"><h3></h3><button class="icon-btn close" title="Schließen">${icon('close')}</button></div>
        <div class="panel-body"></div>
      </aside>
      <nav class="buildbar">
        <div class="tabs"></div>
        <div class="items"></div>
        <div class="options">
          <div class="opt opt-height"><span>Höhe</span><button class="small minus">−</button><b class="height-value">3</b><button class="small plus">+</button></div>
          <div class="opt opt-brush"><span>Pinsel</span></div>
          <div class="hint"></div>
        </div>
      </nav>`;
    parent.appendChild(this.root);
    this.season = this.root.querySelector('.season')!;
    this.goal = this.root.querySelector('.goal')!;
    this.res = this.root.querySelector('.res')!;
    this.messages = this.root.querySelector('.messages')!;
    this.panel = this.root.querySelector('.panel')!;
    this.panelBody = this.root.querySelector('.panel-body')!;
    this.panelTitle = this.root.querySelector('.panel-head h3')!;
    this.items = this.root.querySelector('.items')!;
    this.tabs = this.root.querySelector('.tabs')!;
    this.hint = this.root.querySelector('.hint')!;
    this.options = this.root.querySelector('.options')!;
    this.heightValue = this.root.querySelector('.height-value')!;

    this.root.querySelector('.panel .close')!.addEventListener('click', () => this.showBuilding(null));
    this.root.querySelector('.menu-btn')!.addEventListener('click', () => cb.onMenu());
    this.root.querySelector('.opt-height .minus')!.addEventListener('click', () => this.setDamHeight(this.damHeight - 1));
    this.root.querySelector('.opt-height .plus')!.addEventListener('click', () => this.setDamHeight(this.damHeight + 1));
    const brushBox = this.root.querySelector('.opt-brush')!;
    for (const b of [1, 2, 3]) {
      const btn = document.createElement('button');
      btn.className = 'small';
      btn.textContent = String(b);
      btn.addEventListener('click', () => this.setBrush(b));
      brushBox.appendChild(btn);
      this.brushButtons.push(btn);
    }
    this.setBrush(1);

    const speedBox = this.root.querySelector('.speed')!;
    const speeds: [number, string, string][] = [
      [0, 'pause', 'Pause (Leertaste)'],
      [1, 'play', 'Normal (1)'],
      [2, 'schnell', 'Doppelt (2)'],
      [3, 'schnell', 'Dreifach (3)'],
    ];
    for (const [s, ic, title] of speeds) {
      const btn = document.createElement('button');
      btn.className = 'icon-btn';
      btn.title = title;
      btn.innerHTML = icon(ic) + (s > 1 ? `<small>${s}×</small>` : '');
      btn.addEventListener('click', () => cb.onSpeed(s));
      speedBox.appendChild(btn);
      this.speedButtons.push(btn);
    }
    this.setSpeed(1);

    const tabs: [Tab, string][] = [
      ['siedlung', CATEGORY_LABEL.siedlung],
      ['freude', CATEGORY_LABEL.freude],
      ['versorgung', CATEGORY_LABEL.versorgung],
      ['nahrung', CATEGORY_LABEL.nahrung],
      ['strom', CATEGORY_LABEL.strom],
      ['forschung', 'Forschung'],
      ['wasserbau', 'Wasserbau'],
      ['gelaende', 'Gelände'],
    ];
    for (const [t, label] of tabs) {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.dataset.tab = t;
      btn.textContent = label;
      btn.addEventListener('click', () => this.showTab(t));
      this.tabs.appendChild(btn);
    }
    this.showTab('siedlung');
    this.setMode({ kind: 'select' }, false);
    this.updateOptions();
  }

  /** Alles ausblenden oder zeigen (Startmenü) */
  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  /** Neues Spiel: Meldungen und Tafel leeren */
  reset(): void {
    this.messages.innerHTML = '';
    this.showBuilding(null);
    this.setMode({ kind: 'select' });
    this.lastStatsKey = '';
  }

  // --- Modus und Werkzeuge ---------------------------------------------------

  private showTab(tab: Tab): void {
    for (const b of this.tabs.children) (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.tab === tab);
    const list = tab === 'wasserbau' ? WATER_ITEMS : tab === 'gelaende' ? LAND_ITEMS : tab === 'forschung' ? researchItems() : buildItems(tab);
    this.items.innerHTML = '';
    this.cards.clear();
    for (const it of list) {
      const card = document.createElement('button');
      card.className = 'card';
      card.dataset.key = it.key;
      card.innerHTML = `<span class="card-icon">${icon(it.icon)}</span><span class="card-label">${it.label}</span><span class="card-cost">${it.cost}</span><span class="card-lock">${icon('lock')}</span>`;
      card.title = it.desc;
      card.addEventListener('click', () => {
        if (it.tech) {
          this.clickTech(it.tech);
          return;
        }
        const tech = it.mode.kind === 'build' ? TECH_FOR[it.mode.id] : undefined;
        if (tech && !this.researched(tech)) {
          this.setHint(`${it.label} braucht die Forschung ${TECHS[tech].name}. Siehe Reiter Forschung.`, true);
          return;
        }
        const same = this.modeKey(this.mode) === it.key;
        this.setMode(same ? { kind: 'select' } : it.mode);
      });
      card.addEventListener('mouseenter', () => this.setHint(it.desc));
      card.addEventListener('mouseleave', () => this.updateHint());
      this.items.appendChild(card);
      this.cards.set(it.key, card);
    }
    this.refreshCards();
  }

  private researched(t: TechId): boolean {
    return !!this.stats?.techs.includes(t);
  }

  private clickTech(t: TechId): void {
    const d = TECHS[t];
    if (this.researched(t)) {
      this.setHint(`${d.name} ist erforscht.`);
      return;
    }
    if (d.requires && !this.researched(d.requires)) {
      this.setHint(`${d.name} braucht zuerst ${TECHS[d.requires].name}.`, true);
      return;
    }
    const have = this.stats?.knowledge ?? 0;
    if (have < d.cost) {
      this.setHint(`${d.name} kostet ${d.cost} Wissen, vorhanden sind ${Math.floor(have)}. Bibliothek, Schule und Sternwarte sammeln Wissen.`, true);
      return;
    }
    this.cb.onResearch(t);
    this.setHint(`${d.name} wird erforscht.`);
  }

  private modeKey(m: Mode): string {
    return m.kind === 'select' ? 'select' : m.kind === 'build' ? m.id : m.tool;
  }

  setMode(mode: Mode, notify = true): void {
    this.mode = mode;
    this.refreshCards();
    this.updateOptions();
    this.updateHint();
    if (notify) this.cb.onMode(mode);
  }

  private refreshCards(): void {
    const key = this.modeKey(this.mode);
    const s = this.stats;
    for (const [k, card] of this.cards) {
      card.classList.toggle('active', k === key);
      if (k.startsWith('tech:')) {
        const d = TECHS[k.slice(5) as TechId];
        const done = this.researched(d.id);
        const blocked = !!d.requires && !this.researched(d.requires);
        card.classList.toggle('done', done);
        card.classList.toggle('locked', !done && blocked);
        card.classList.toggle('poor', !done && !blocked && (s?.knowledge ?? 0) < d.cost);
        card.querySelector('.card-cost')!.textContent = done ? 'erforscht' : blocked ? `braucht ${TECHS[d.requires!].name}` : `${d.cost} Wissen`;
        continue;
      }
      const def = BUILDINGS[k as BuildingId];
      if (!def) continue;
      const tech = TECH_FOR[def.id];
      const locked = !!tech && !this.researched(tech);
      card.classList.toggle('locked', locked);
      let poor = false;
      for (const g of GOODS) if ((def.cost[g] ?? 0) > (s?.goods[g] ?? (g === 'holz' ? this.wood : 0))) poor = true;
      card.classList.toggle('poor', !locked && poor);
      card.querySelector('.card-cost')!.textContent = locked ? `Forschung: ${TECHS[tech].name}` : costText(def.cost);
    }
  }

  private updateOptions(): void {
    const m = this.mode;
    const isHeight = m.kind === 'tool' && (m.tool === 'damm' || m.tool === 'deich' || m.tool === 'schleuse');
    const isBrush = m.kind === 'tool' && m.tool !== 'schleuse';
    this.options.querySelector('.opt-height')!.classList.toggle('hidden', !isHeight);
    this.options.querySelector('.opt-brush')!.classList.toggle('hidden', !isBrush);
    if (m.kind === 'tool' && m.tool === 'deich' && this.damHeight > MAX_DIKE) this.setDamHeight(MAX_DIKE);
  }

  private updateHint(): void {
    const m = this.mode;
    if (m.kind === 'select') this.setHint('Gebäude anklicken für Einzelheiten. Rechte Maustaste oder zwei Finger drehen die Kamera, Rad oder Kneifen zoomt.');
    else if (m.kind === 'build') this.setHint(`${BUILDINGS[m.id].name} setzen: auf freies, ebenes Land klicken. Esc bricht ab.`);
    else {
      const it = [...WATER_ITEMS, ...LAND_ITEMS].find((i) => i.mode.kind === 'tool' && i.mode.tool === m.tool);
      this.setHint(it?.desc ?? '');
    }
  }

  setHint(text: string, bad = false): void {
    this.hint.textContent = text;
    this.hint.classList.toggle('bad', bad);
  }

  setDamHeight(h: number): void {
    const max = this.mode.kind === 'tool' && this.mode.tool === 'deich' ? MAX_DIKE : MAX_DAM;
    this.damHeight = Math.max(1, Math.min(max, h));
    this.heightValue.textContent = String(this.damHeight);
  }

  setBrush(b: number): void {
    this.brush = b;
    this.brushButtons.forEach((btn, i) => btn.classList.toggle('active', i + 1 === b));
  }

  setSpeed(speed: number): void {
    this.speedButtons.forEach((btn, i) => btn.classList.toggle('active', i === speed));
  }

  // --- Anzeige -----------------------------------------------------------------

  setStats(s: SimStats): void {
    this.wood = s.wood;
    this.stats = s;
    this.setSpeed(s.speed);
    // Karten nur neu bewerten, wenn sich Vorräte, Wissen oder Forschung geändert haben
    const cardsKey = `${GOODS.map((g) => Math.floor(s.goods[g])).join(',')}|${Math.floor(s.knowledge)}|${s.techs.join(',')}`;
    if (cardsKey !== this.lastCardsKey) {
      this.lastCardsKey = cardsKey;
      this.refreshCards();
    }
    const info = s.season;
    // Die Leiste nur neu bauen, wenn sich sichtbare Werte geändert haben
    const key = [
      info.day, info.year, s.weather, info.daysLeft, info.next, info.nextMin, info.nextMax,
      s.population, s.children, s.sick, s.housing, Math.floor(s.wood), s.storageCap, Math.floor(s.food), Math.floor(s.water), s.waterCap,
      Math.round(s.mood * 20), s.outcome, s.scenario, pollutionLabel(s.waterPollution), s.hasPower, fmt(s.power.supply), fmt(s.power.demand),
      Math.floor(s.goods.bretter), Math.floor(s.knowledge), s.hasKnowledge, s.toolBonus, s.techs.length, s.deepCells, Math.floor(s.goalDays),
    ].join('|');
    if (key === this.lastStatsKey) return;
    this.lastStatsKey = key;

    const phase = WEATHER_INFO[s.weather].label;
    const nextLabel = WEATHER_INFO[info.next].label;
    const forecast =
      info.nextMin === info.nextMax
        ? `Dann ${nextLabel}, genau ${info.nextMin} ${info.nextMin === 1 ? 'Tag' : 'Tage'}`
        : `Dann ${nextLabel}, ${info.nextMin} bis ${info.nextMax} Tage`;
    this.season.innerHTML = `<span class="season-icon ${s.weather}">${icon(WEATHER_ICON[s.weather])}</span>
      <div class="season-text"><b>Tag ${info.day} · Jahr ${info.year}</b><small>${phase}, noch ${info.daysLeft} ${info.daysLeft === 1 ? 'Tag' : 'Tage'}</small><small class="forecast">${forecast}</small></div>`;
    this.season.className = `season ${s.weather}`;

    if (s.goal) {
      const done = s.outcome === 'won';
      const popOk = s.population >= s.goal.population;
      const parts = [`<span class="${popOk ? 'ok' : ''}">${s.population}/${s.goal.population} Otter</span>`];
      if (s.goal.kind === 'clan') {
        parts.push(`<span class="${info.year >= s.goal.year ? 'ok' : ''}">Jahr ${info.year}/${s.goal.year}</span>`);
      } else {
        parts.unshift(`<span class="${s.deepCells >= s.goal.cells ? 'ok' : ''}">See ${s.deepCells}/${s.goal.cells}</span>`, `<span class="${s.goalDays >= s.goal.days ? 'ok' : ''}">${Math.floor(s.goalDays)}/${s.goal.days} Tage</span>`);
      }
      this.goal.innerHTML = `${icon(done ? 'trophy' : 'ziel')}<div class="goal-text"><b>${done ? 'Ziel erreicht' : 'Ziel'}</b><small>${parts.join(' · ')}</small></div>`;
      this.goal.title = `${s.scenarioName}: ${goalText(s.goal)}`;
    } else if (s.scenario === DAILY_ID) {
      this.goal.innerHTML = `${icon('trophy')}<div class="goal-text"><b>Tageskarte</b><small>${dailyScore(info.day - 1, s.population)} Punkte · Tag ${info.day}</small></div>`;
      this.goal.title = `${s.scenarioName}: 10 Punkte je überstandenem Tag, 5 je Otter`;
    } else {
      this.goal.innerHTML = `${icon('ziel')}<div class="goal-text"><b>Freies Spiel</b><small>kein Ziel</small></div>`;
      this.goal.title = s.scenarioName;
    }
    this.goal.classList.toggle('done', s.outcome === 'won');

    const chip = (ic: string, title: string, value: string, cls: string) =>
      `<div class="chip ${cls}" title="${title}">${icon(ic)}<b>${value}</b></div>`;
    const moodCls = s.mood < 0.4 ? 'warn' : s.mood >= 0.75 ? 'good' : '';
    const dirty = s.waterPollution >= 0.3;
    const foodKinds = FOODS.filter((g) => s.goods[g] >= 1).map((g) => `${Math.floor(s.goods[g])} ${GOOD_LABEL[g]}`);
    const showPlanks = s.goods.bretter >= 1 || s.techs.includes('zimmerei');
    this.res.innerHTML =
      chip('otter', `Bewohner / Betten${s.children ? `, davon ${s.children} Junge` : ''}${s.sick ? `, ${s.sick} krank` : ''}`, `${s.population}<span>/${s.housing}</span>`, s.population > s.housing ? 'warn' : '') +
      (s.sick ? chip('krank', 'Kranke Otter: schmutziges Wasser getrunken. Sauberes Wasser und eine Heilerhütte helfen.', `${s.sick}`, 'warn') : '') +
      chip(s.mood < 0.4 ? 'moodBad' : 'mood', `Zufriedenheit: ${moodLabel(s.mood)}. Hütten, Essen, Wasser, Abwechslung beim Essen und Freude-Gebäude machen zufrieden.`, `${Math.round(s.mood * 100)}<span>%</span>`, moodCls) +
      chip('holz', `Holz im Lager / Platz${s.toolBonus ? '. Werkzeug für alle: der Clan arbeitet schneller' : ''}`, `${Math.floor(s.wood)}<span>/${s.storageCap}</span>`, s.wood < 5 ? 'warn' : '') +
      (showPlanks ? chip('bretter', 'Bretter im Lager / Platz. Das Sägewerk macht sie aus Holz.', `${Math.floor(s.goods.bretter)}<span>/${s.storageCap}</span>`, '') : '') +
      chip('nahrung', `Nahrung im Lager: ${foodKinds.length ? foodKinds.join(', ') : 'nichts'}. Mehrere Sorten machen zufrieden.`, `${Math.floor(s.food)}<span>/${s.storageCap}</span>`, s.food < s.population ? 'warn' : '') +
      chip('wasser', `Wasser im Speicher / Speicherplatz, ${pollutionLabel(s.waterPollution)}${dirty ? '. Ein Sandfilter reinigt es' : ''}`, `${Math.floor(s.water)}<span>/${s.waterCap}</span>`, dirty || (s.waterCap > 0 && s.water < s.population) ? 'warn' : '') +
      (s.hasPower ? chip('strom', `Strom: Erzeugung / Bedarf. ${s.power.ratio < 1 ? 'Es fehlt Strom, Maschinen laufen langsamer.' : 'Alle Maschinen laufen.'}`, `${fmt(s.power.supply)}<span>/${fmt(s.power.demand)}</span>`, s.power.ratio < 1 ? 'warn' : '') : '') +
      (s.hasKnowledge ? chip('wissen', `Wissen für die Forschung, ${s.techs.length} von ${TECH_ORDER.length} Techniken erforscht. Reiter Forschung.`, `${Math.floor(s.knowledge)}`, '') : '');
  }

  pushMessages(list: string[]): void {
    for (const text of list) {
      const el = document.createElement('div');
      const bad = /verdurstet|verhungert|Dürre|Nicht genug|Kein |vertrocknet|aufgebraucht|Hochwasser|weggerissen|ertrunken|gestorben|ausgelöscht|krank|verschmutzt|Schlammflut|eingegangen|Holz ist alle|warten auf|Ohne Arbeiter|nicht genug Wissen|zuerst|sitzt fest/.test(text);
      const good = /geboren|Ziel erreicht|fertig\.|wieder gesund|erforscht\./.test(text);
      el.className = `msg${bad ? ' bad' : good ? ' good' : ''}`;
      el.textContent = text;
      this.messages.appendChild(el);
      while (this.messages.children.length > 5) this.messages.firstElementChild!.remove();
      setTimeout(() => {
        el.classList.add('fade');
        setTimeout(() => el.remove(), 1000);
      }, 18000);
    }
  }

  showBuilding(b: BuildingSnap | null): void {
    this.panelBuilding = b;
    this.panel.classList.toggle('hidden', !b);
    if (!b) return;
    const def = BUILDINGS[b.def];
    this.panelTitle.textContent = def.name;
    const rows: string[] = [];
    if (b.flooded) rows.push(`<div class="row bad"><span>Hochwasser</span><b>Schaden ${Math.round(b.damage * 100)} %</b></div>`);
    else if (b.damage > 0.02) rows.push(`<div class="row"><span>Schaden heilt</span><b>${Math.round(b.damage * 100)} %</b></div>`);
    if (!b.built) {
      rows.push(`<div class="row"><span>Baustelle</span><b>${Math.round(b.progress * 100)} %</b></div>`);
      for (const g of GOODS) {
        const need = def.cost[g] ?? 0;
        if (need) rows.push(`<div class="row${b.deliveredGoods[g] < need ? ' open' : ''}"><span>${GOOD_LABEL[g]} geliefert</span><b>${Math.floor(b.deliveredGoods[g])} / ${need}</b></div>`);
      }
    } else {
      if (def.workers) rows.push(`<div class="row"><span>Arbeiter</span><b>${b.workers} / ${def.workers}</b></div>`);
      if (def.housing) rows.push(`<div class="row"><span>Bewohner</span><b>${b.residents} / ${def.housing}</b></div>`);
      if (def.storage) {
        for (const g of GOODS) {
          if (b.stock[g] >= 1 || g === 'holz' || g === 'beeren') rows.push(`<div class="row"><span>${GOOD_LABEL[g]}</span><b>${Math.floor(b.stock[g])} / ${def.storage}</b></div>`);
        }
      }
      if (def.recipe) rows.push(`<div class="row"><span>Verarbeitet</span><b>${def.recipe.inAmount} ${GOOD_LABEL[def.recipe.input]} zu ${def.recipe.outAmount} ${GOOD_LABEL[def.recipe.output]}</b></div>`);
      if (def.harvest) rows.push(`<div class="row"><span>Reife</span><b>${b.growth >= 1 ? 'erntereif' : `${Math.round(b.growth * 100)} %`}</b></div>`);
      if (def.knowledge) rows.push(`<div class="row"><span>Wissen</span><b>${fmt(def.knowledge)} je Schicht und Arbeiter</b></div>`);
      if (def.waterCap) rows.push(`<div class="row"><span>Speicherplatz</span><b>${def.waterCap} Wasser</b></div>`);
      if (DRINK_SPOTS.includes(b.def) && this.stats) rows.push(`<div class="row${this.stats.waterPollution >= 0.3 ? ' bad' : ''}"><span>Wasser im Speicher</span><b>${pollutionLabel(this.stats.waterPollution)}</b></div>`);
      if (def.powerGen) rows.push(`<div class="row"><span>Strom</span><b>${fmt(b.power)} von ${fmt(def.powerGen)}</b></div>`);
      if (def.powerUse) rows.push(`<div class="row${b.power < 1 ? ' bad' : ''}"><span>Strom</span><b>${b.power >= 1 ? 'versorgt' : `${Math.round(b.power * 100)} % versorgt`}</b></div>`);
      if (b.def === 'flossanleger') {
        rows.push(`<div class="row${b.district ? '' : ' bad'}"><span>Bezirk</span><b>${b.district || `kein Lager im Umkreis von ${def.range} Feldern`}</b></div>`);
        rows.push(`<div class="row${b.raftText?.startsWith('sitzt') || b.raftText?.startsWith('kein') ? ' bad' : ''}"><span>Floß</span><b>${b.raftText ?? ''}</b></div>`);
      } else if (def.range) rows.push(`<div class="row"><span>${def.joy ? 'Wirkungskreis' : 'Umkreis'}</span><b>${def.range} Felder</b></div>`);
      if (def.floodDepth >= 1.5) rows.push(`<div class="row"><span>Hochwasser</span><b>hält stand</b></div>`);
      else if (def.floodDepth >= 0.9) rows.push(`<div class="row"><span>Hochwasser</span><b>steht auf Pfählen</b></div>`);
    }
    this.panelBody.innerHTML = `<p class="desc">${def.desc}</p>${rows.join('')}<button class="danger demolish">Abreißen</button>`;
    this.panelBody.querySelector('.demolish')!.addEventListener('click', () => {
      this.cb.onDemolish(b.id);
      this.showBuilding(null);
    });
  }

  /** Nach einem neuen Gebäudestand die Tafel aktualisieren */
  refreshBuilding(list: BuildingSnap[]): void {
    if (!this.panelBuilding) return;
    const b = list.find((x) => x.id === this.panelBuilding!.id);
    this.showBuilding(b ?? null);
  }

  get shownBuilding(): number {
    return this.panelBuilding?.id ?? -1;
  }
}
