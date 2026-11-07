import { BUILDINGS, BUILDING_ORDER, DAM_WOOD_PER_LEVEL, GATE_WOOD, type BuildingId } from '../data/buildings';
import type { BuildingSnap, SimStats } from '../sim/protocol';
import { MAX_DAM, MAX_DIKE, WEATHER_INFO, type Tool, type Weather } from '../sim/world';

export type Mode = { kind: 'select' } | { kind: 'build'; id: BuildingId } | { kind: 'tool'; tool: Tool };

export interface HudCallbacks {
  onMode(mode: Mode): void;
  onSpeed(speed: number): void;
  onDemolish(buildingId: number): void;
}

type Tab = 'gebaeude' | 'wasserbau' | 'gelaende';

const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

const ICONS: Record<string, string> = {
  huette: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  pumpe: '<circle cx="9" cy="12" r="5"/><path d="M9 7v10M4 12h10"/><path d="M14 12h6v-4"/>',
  tank: '<rect x="5" y="4" width="14" height="16" rx="3"/><path d="M5 9h14M5 15h14"/>',
  sammler: '<path d="M4 10h16l-2 10H6z"/><path d="M8 10a4 4 0 0 1 8 0"/><circle cx="10" cy="15" r="1"/><circle cx="14" cy="15" r="1"/>',
  holzfaeller: '<path d="M13 3l8 8-4 4-8-8z"/><path d="M11 11l-8 8 2 2 8-8"/>',
  foerster: '<path d="M12 21v-9"/><path d="M12 12c-4 0-6-3-6-6 3 0 6 2 6 6z"/><path d="M12 12c4 0 6-3 6-6-3 0-6 2-6 6z"/>',
  lager: '<path d="M3 9l9-5 9 5v11H3z"/><path d="M3 9h18M9 20v-7h6v7"/>',
  damm: '<path d="M3 20h18M4 20V9h16v11M4 14h16M9 9v5M14 14v6"/>',
  deich: '<path d="M3 20h18M4 20c2-8 14-8 16 0"/>',
  schleuse: '<path d="M5 4v16M19 4v16M8 8h8v8H8z"/><path d="M12 8v8"/>',
  abreissen: '<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/>',
  anheben: '<path d="M3 20h18"/><path d="M12 16V5"/><path d="M7 10l5-5 5 5"/>',
  absenken: '<path d="M3 20h18"/><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/>',
  select: '<path d="M5 3l14 9-6 1-3 6z"/>',
  otter: '<circle cx="12" cy="12" r="7"/><circle cx="9.5" cy="11" r="1" fill="currentColor"/><circle cx="14.5" cy="11" r="1" fill="currentColor"/><path d="M10 15c1 1 3 1 4 0"/><path d="M6 7l2 2M18 7l-2 2"/>',
  holz: '<rect x="3" y="9" width="18" height="6" rx="3"/><circle cx="6" cy="12" r="1.5"/>',
  beeren: '<circle cx="9" cy="14" r="3"/><circle cx="15" cy="14" r="3"/><circle cx="12" cy="9" r="3"/><path d="M12 6V3"/>',
  wasser: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  normal: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  schmelze: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/>',
  duerre: '<circle cx="12" cy="8" r="4"/><path d="M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 4l12 8-12 8z"/>',
  schnell: '<path d="M4 4l8 8-8 8M12 4l8 8-8 8"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

function icon(name: string): string {
  return `${SVG_OPEN}${ICONS[name] ?? ''}</svg>`;
}

interface Item {
  key: string;
  label: string;
  icon: string;
  cost: string;
  desc: string;
  mode: Mode;
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
    desc: `Aufgeschütteter Erdwall bis ${MAX_DIKE} Stufen. Hohes Wasser läuft darüber.`,
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

function buildItems(): Item[] {
  return BUILDING_ORDER.map((id) => {
    const d = BUILDINGS[id];
    const extra: string[] = [];
    if (d.workers) extra.push(`${d.workers} Arbeiter`);
    if (d.housing) extra.push(`${d.housing} Betten`);
    if (d.waterCap) extra.push(`${d.waterCap} Wasser`);
    if (d.storage) extra.push(`${d.storage} je Ware`);
    if (d.range) extra.push(`Umkreis ${d.range}`);
    return {
      key: id,
      label: d.name,
      icon: id,
      cost: `${d.wood} Holz`,
      desc: `${d.desc} ${extra.join(', ')}.`,
      mode: { kind: 'build', id },
    };
  });
}

const WEATHER_ICON: Record<Weather, string> = { normal: 'normal', schmelze: 'schmelze', duerre: 'duerre' };

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
  private res: HTMLElement;
  private messages: HTMLElement;
  private panel: HTMLElement;
  private panelBody: HTMLElement;
  private panelTitle: HTMLElement;
  private panelBuilding: BuildingSnap | null = null;
  private wood = 0;
  private cards = new Map<string, HTMLElement>();

  constructor(parent: HTMLElement, cb: HudCallbacks) {
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <header class="topbar">
        <div class="brand">Waterwake</div>
        <div class="season"></div>
        <div class="res"></div>
        <div class="speed"></div>
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
      ['gebaeude', 'Gebäude'],
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
    this.showTab('gebaeude');
    this.setMode({ kind: 'select' }, false);
    this.updateOptions();
  }

  // --- Modus und Werkzeuge ---------------------------------------------------

  private showTab(tab: Tab): void {
    for (const b of this.tabs.children) (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.tab === tab);
    const list = tab === 'gebaeude' ? buildItems() : tab === 'wasserbau' ? WATER_ITEMS : LAND_ITEMS;
    this.items.innerHTML = '';
    this.cards.clear();
    for (const it of list) {
      const card = document.createElement('button');
      card.className = 'card';
      card.dataset.key = it.key;
      card.innerHTML = `<span class="card-icon">${icon(it.icon)}</span><span class="card-label">${it.label}</span><span class="card-cost">${it.cost}</span>`;
      card.title = it.desc;
      card.addEventListener('click', () => {
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
    for (const [k, card] of this.cards) {
      card.classList.toggle('active', k === key);
      const def = BUILDINGS[k as BuildingId];
      if (def) card.classList.toggle('poor', this.wood < def.wood);
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
    const info = s.season;
    const phase = WEATHER_INFO[s.weather].label;
    const nextLabel = WEATHER_INFO[info.next].label;
    const forecast =
      info.next === 'duerre'
        ? `Dürre in ${info.daysLeft} Tagen, ${info.nextMin} bis ${info.nextMax} Tage lang`
        : `Dann ${nextLabel}, ${info.nextMin} bis ${info.nextMax} Tage`;
    this.season.innerHTML = `<span class="season-icon ${s.weather}">${icon(WEATHER_ICON[s.weather])}</span>
      <div class="season-text"><b>Tag ${info.day} · Jahr ${info.year}</b><small>${phase}, noch ${info.daysLeft} ${info.daysLeft === 1 ? 'Tag' : 'Tage'}</small><small class="forecast">${forecast}</small></div>`;
    this.season.className = `season ${s.weather}`;

    const chip = (ic: string, title: string, value: string, warn: boolean) =>
      `<div class="chip${warn ? ' warn' : ''}" title="${title}">${icon(ic)}<b>${value}</b></div>`;
    this.res.innerHTML =
      chip('otter', 'Bewohner / Betten', `${s.population}<span>/${s.housing}</span>`, s.population > s.housing) +
      chip('holz', 'Holz im Lager / Platz', `${Math.floor(s.wood)}<span>/${s.storageCap}</span>`, s.wood < 5) +
      chip('beeren', 'Beeren im Lager / Platz', `${Math.floor(s.berries)}<span>/${s.storageCap}</span>`, s.berries < s.population) +
      chip('wasser', 'Wasser im Speicher / Speicherplatz', `${Math.floor(s.water)}<span>/${s.waterCap}</span>`, s.waterCap > 0 && s.water < s.population);
    this.setSpeed(s.speed);
    this.refreshCards();
  }

  pushMessages(list: string[]): void {
    for (const text of list) {
      const el = document.createElement('div');
      const bad = /verdurstet|verhungert|Dürre|Nicht genug|Kein |vertrocknet|aufgebraucht/.test(text);
      el.className = `msg${bad ? ' bad' : ''}`;
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
    if (!b.built) {
      rows.push(`<div class="row"><span>Baustelle</span><b>${Math.round(b.progress * 100)} %</b></div>`);
      rows.push(`<div class="row"><span>Holz geliefert</span><b>${b.woodDelivered} / ${def.wood}</b></div>`);
    } else {
      if (def.workers) rows.push(`<div class="row"><span>Arbeiter</span><b>${b.workers} / ${def.workers}</b></div>`);
      if (def.housing) rows.push(`<div class="row"><span>Bewohner</span><b>${b.residents} / ${def.housing}</b></div>`);
      if (def.storage) {
        rows.push(`<div class="row"><span>Holz</span><b>${Math.floor(b.wood)} / ${def.storage}</b></div>`);
        rows.push(`<div class="row"><span>Beeren</span><b>${Math.floor(b.berries)} / ${def.storage}</b></div>`);
      }
      if (def.waterCap) rows.push(`<div class="row"><span>Speicherplatz</span><b>${def.waterCap} Wasser</b></div>`);
      if (def.range) rows.push(`<div class="row"><span>Umkreis</span><b>${def.range} Felder</b></div>`);
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
