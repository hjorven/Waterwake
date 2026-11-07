import { ACHIEVEMENTS, ACHIEVEMENT_COUNT, GROUP_NAMES, GROUP_ORDER, unlockedCount, type AchievementState } from '../data/achievements';
import { AUTHOR_MAX, MAP_NAME_MAX, isMapCode, newMapId, normalizeCode, validateGoal, type CustomMap, type MapCore, type SharedMapInfo } from '../data/custom';
import { DAILY_ID, dailyDateText, dailyKey } from '../data/daily';
import { CAMPAIGN, CAMPAIGNS, MOLCH_CAMPAIGN, SCENARIOS, goalText, isUnlocked, nextScenario, requiredWin, speciesOf, type Goal, type Scenario } from '../data/maps';
import { activeDownstreamOf, activeUpstreamOf, factorFrom, isFresh, type RiverInfo, type RiverLink } from '../data/river';
import { SPECIES, SPECIES_ORDER, type Species } from '../data/species';
import { CLOUD_SLOTS, type DailyBoard, type DailyResult } from '../online/cloud';
import { LOCAL_SLOTS, formatSavedAt, slotLabel, type SaveEntry, type Settings } from '../online/saves';
import type { SimStats } from '../sim/protocol';
import { icon } from './hud';

export interface MenuCallbacks {
  /** neues Spiel; ohne Volk gilt das der Karte (Kampagne) oder der Otterclan */
  onNewGame(scenario: string, seed: number, freeBuild: boolean, species?: Species): void;
  onResume(): void;
  onMainMenu(): void;
  /** läuft gerade ein Spiel, das man speichern kann? */
  canSave(): boolean;
  listLocal(): SaveEntry[];
  onSaveLocal(slot: string): void;
  onLoadLocal(slot: string): boolean;
  onDeleteLocal(slot: string): void;
  onCloudConnect(): Promise<string>;
  onCloudList(): Promise<SaveEntry[]>;
  onCloudUpload(slot: number): Promise<void>;
  onCloudDownload(slot: number): Promise<void>;
  onCloudDelete(slot: number): Promise<void>;
  getSettings(): Settings;
  onSettings(s: Settings): void;
  /** Ids der gewonnenen Kampagnenkarten */
  campaignWon(): string[];
  /** Spielername für die Bestenliste */
  getName(): string;
  setName(name: string): void;
  /** Bestenliste eines Tages */
  dailyBoard(key: string): Promise<DailyBoard>;
  /** Wertung des laufenden Spiels, wenn es auf der Tageskarte läuft */
  dailyScore(): DailyScore | null;
  /** Wertung des laufenden Spiels abgeben */
  onDailySubmit(name: string): Promise<DailyResult>;
  // Karteneditor
  listMaps(): CustomMap[];
  /** Editor mit einem Zufallstal (Seed) oder einer flachen Karte (null) öffnen */
  onEditorNew(seed: number | null): void;
  onEditorOpen(map: CustomMap): void;
  onPlayMap(map: CustomMap): void;
  onDeleteMap(id: string): void;
  /** Gelände, Quellen, Abfluss und Start aus dem laufenden Editor holen */
  onMapExport(): Promise<MapCore>;
  /** Karte im Browser ablegen; false, wenn kein Platz ist */
  onMapStore(map: CustomMap): boolean;
  /** Karte hochladen, gibt den Code zurück */
  onMapShare(map: CustomMap): Promise<string>;
  onMapDownload(code: string): Promise<CustomMap>;
  onMapList(): Promise<SharedMapInfo[]>;
  /** die Karte, die gerade im Editor liegt */
  editing(): CustomMap | null;
  // Flusskette
  riverLink(): RiverLink | null;
  onRiverCreate(name: string, player: string): Promise<void>;
  onRiverJoin(code: string, player: string): Promise<void>;
  onRiverLeave(): Promise<void>;
  onRiverRefresh(): Promise<void>;
  /** erreichte Errungenschaften und Zähler */
  achievements(): AchievementState;
}

/** Stand des laufenden Spiels auf der Tageskarte */
export interface DailyScore {
  key: string;
  score: number;
  days: number;
  population: number;
  /** diese Wertung (oder eine bessere) steht schon in der Bestenliste */
  submitted: boolean;
}

export type MenuView = 'start' | 'menu' | 'campaign' | 'daily' | 'river' | 'achievements' | 'maps' | 'mapsave' | 'saves' | 'settings' | 'intro' | 'end' | null;

function metaText(e: SaveEntry | undefined): string {
  if (!e) return 'leer';
  const m = e.meta;
  return `${m.scenarioName} · Tag ${m.day}, Jahr ${m.year} · ${m.population} Bewohner · ${formatSavedAt(m.savedAt)}`;
}

/** Fremde Texte (Spielernamen, Fehlermeldungen) sicher ins HTML setzen */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function nameInput(value: string): string {
  return `<label>Name <input class="player-name" type="text" maxlength="20" placeholder="Dein Name" value="${esc(value)}"></label>`;
}

/**
 * Startbildschirm, Spielmenü, Spielstände, Einstellungen, Einleitung und
 * Endbildschirm als Dialoge über der Karte.
 */
export class Menu {
  readonly root: HTMLElement;
  readonly toasts: HTMLElement;
  view: MenuView = null;
  /** Ansicht, zu der "Zurück" führt */
  private back: MenuView = 'menu';
  private readonly cb: MenuCallbacks;
  private cloudConnected = false;
  private cloudSaves: SaveEntry[] = [];
  private cloudBusy = false;
  private seed = Math.floor(Math.random() * 9000) + 100;
  /** Volk fürs freie Spiel, bleibt beim Neuaufbau des Startbilds erhalten */
  private volk: Species = 'otter';
  /** Stand beim letzten Ende-Dialog, für "Nochmal versuchen" */
  private lastStats: SimStats | null = null;
  /** Stand beim letzten Spielmenü, zum Neuaufbau nach dem Abgeben einer Wertung */
  private lastMenuStats: SimStats | null = null;
  private board: DailyBoard | null = null;
  private boardKey = '';
  private boardError = '';
  private boardBusy = false;
  private dailyBusy = false;
  private shared: SharedMapInfo[] | null = null;
  private sharedError = '';
  private sharedBusy = false;
  private mapBusy = false;
  private riverInfo: RiverInfo | null = null;
  private riverBusy = false;
  private riverError = '';

  constructor(parent: HTMLElement, cb: MenuCallbacks) {
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    parent.appendChild(this.root);
    this.toasts = document.createElement('div');
    this.toasts.className = 'toasts';
    parent.appendChild(this.toasts);
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
  }

  get open(): boolean {
    return this.view !== null;
  }

  hide(): void {
    this.view = null;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  toast(text: string, bad = false): void {
    const el = document.createElement('div');
    el.className = `toast${bad ? ' bad' : ''}`;
    el.textContent = text;
    this.toasts.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  private dialog(title: string, body: string, cls = '', closable = true): void {
    this.root.classList.remove('hidden');
    this.root.innerHTML = `
      <div class="dialog ${cls}">
        ${title ? `<div class="dialog-head"><h2>${title}</h2>${closable ? `<button class="icon-btn" data-act="close" title="Schließen">${icon('close')}</button>` : ''}</div>` : ''}
        <div class="dialog-body">${body}</div>
      </div>`;
  }

  // --- Ansichten ------------------------------------------------------------

  showStart(): void {
    this.view = 'start';
    this.back = 'start';
    const auto = this.cb.listLocal().find((e) => e.slot === 'auto');
    const won = this.cb.campaignWon();
    const river = this.cb.riverLink();
    const ach = this.cb.achievements();
    const achDone = unlockedCount(ach);
    const latest = ACHIEVEMENTS.filter((a) => ach.unlocked[a.id]).sort((a, b) => ach.unlocked[b.id] - ach.unlocked[a.id])[0];
    const achText = `${achDone} von ${ACHIEVEMENT_COUNT} erreicht.${latest ? ` Zuletzt: ${latest.title}.` : ' Kleine Ziele über alle Spiele hinweg.'}`;
    const all = CAMPAIGNS.flat();
    const next = all.find((sc) => !won.includes(sc.id) && isUnlocked(sc.id, won));
    const wonCount = all.filter((sc) => won.includes(sc.id)).length;
    const campaignText = next
      ? `${wonCount} von ${all.length} Karten geschafft. Nächste Karte: ${next.name}, etwa ${next.minutes} Minuten.`
      : `Alle ${all.length} Karten geschafft. Jede Karte lässt sich nochmal spielen.`;
    this.dialog(
      '',
      `
      <div class="start-title"><span class="logo">Waterwake</span><span class="tagline">Otter und Molche am wilden Fluss</span></div>
      <div class="start-cards">
        <button class="start-card" data-act="campaign">${icon('trophy')}<b>Kampagnen</b><small>${campaignText}</small></button>
        <button class="start-card" data-act="daily">${icon('calendar')}<b>Tageskarte</b><small>Karte vom ${dailyDateText(dailyKey())}, für alle gleich. Wertung in der Bestenliste.</small></button>
        <button class="start-card" data-act="maps">${icon('editor')}<b>Karteneditor</b><small>Eigene Täler bauen, teilen und per Code spielen.</small></button>
        <button class="start-card" data-act="achievements">${icon('medal')}<b>Errungenschaften</b><small>${achText}</small></button>
        <button class="start-card" data-act="river">${icon('river')}<b>Flusskette</b><small>${river ? `Kette „${esc(river.name)}“, Code ${river.code}. Was oben abfließt, kommt bei dir als Quelle an.` : 'Mehrere Spieler bilden einen Fluss: Was oben abfließt, kommt unten als Quelle an.'}</small></button>
        ${auto ? `<button class="start-card" data-act="continue">${icon('play')}<b>Weiterspielen</b><small>${metaText(auto)}</small></button>` : ''}
        <button class="start-card" data-act="saves">${icon('save')}<b>Spielstände</b><small>Laden aus dem Browser oder der Cloud.</small></button>
        <button class="start-card" data-act="settings">${icon('settings')}<b>Einstellungen</b><small>Miniatur-Unschärfe, Schatten.</small></button>
        <div class="start-card wide free">
          ${icon('wasser')}<b>Freies Spiel</b><small>Zufallskarte ohne Ziel, mit Ottern oder Molchen. Dieselbe Kartennummer ergibt dieselbe Karte.</small>
          <div class="free-row">
            <label>Karte <input class="seed" type="number" min="1" max="999999" value="${this.seed}"></label>
            <label>Volk <select class="volk">${SPECIES_ORDER.map((id) => `<option value="${id}"${id === this.volk ? ' selected' : ''}>${SPECIES[id].name}</option>`).join('')}</select></label>
            <label><input class="freebuild" type="checkbox"> Baukasten: Wasserbau kostenlos</label>
            <button class="btn" data-act="free">Start</button>
          </div>
        </div>
      </div>
      <p class="start-help">Rechte Maustaste dreht die Kamera, Rad zoomt, Shift + Ziehen verschiebt. Auf dem Handy: zwei Finger.</p>`,
      'start',
      false,
    );
  }

  showMenu(stats: SimStats | null): void {
    this.view = 'menu';
    this.back = 'menu';
    this.lastMenuStats = stats;
    if (stats?.editor) {
      this.dialog(
        'Karteneditor',
        `<p class="note">${stats.scenarioName} · ${stats.sources} ${stats.sources === 1 ? 'Quelle' : 'Quellen'} · ${stats.sinks} ${stats.sinks === 1 ? 'Abfluss' : 'Abflüsse'} · Start ${stats.startSet ? 'gesetzt' : 'automatisch'}</p>
        <div class="menu-list">
          <button class="btn" data-act="resume">${icon('editor')}Weiter bearbeiten</button>
          <button class="btn secondary" data-act="mapsave">${icon('save')}Karte speichern und teilen</button>
          <button class="btn secondary" data-act="map-test">${icon('play')}Probespiel auf dieser Karte</button>
          <button class="btn secondary" data-act="settings">${icon('settings')}Einstellungen</button>
          <button class="btn secondary" data-act="main">${icon('menu')}Hauptmenü</button>
        </div>`,
      );
      return;
    }
    const daily = stats && stats.scenario === DAILY_ID ? this.cb.dailyScore() : null;
    const head = stats
      ? `<p class="note">${stats.scenarioName} · Tag ${stats.season.day}, Jahr ${stats.season.year} · ${stats.population} ${SPECIES[stats.species].many} · ${daily ? `Wertung: ${daily.score} Punkte` : `Ziel: ${goalText(stats.goal, stats.species)}`}</p>`
      : '';
    const dailyPart = daily ? (daily.submitted ? `<p class="note">Die Wertung von ${daily.score} Punkten steht in der Bestenliste.</p>` : this.dailyRow(daily)) : '';
    this.dialog(
      'Menü',
      `${head}${dailyPart}
      <div class="menu-list">
        <button class="btn" data-act="resume">${icon('play')}Weiterspielen</button>
        <button class="btn secondary" data-act="saves">${icon('save')}Spielstände speichern und laden</button>
        <button class="btn secondary" data-act="river">${icon('river')}Flusskette${this.cb.riverLink() ? `: ${esc(this.cb.riverLink()!.name)}` : ''}</button>
        <button class="btn secondary" data-act="achievements">${icon('medal')}Errungenschaften</button>
        <button class="btn secondary" data-act="settings">${icon('settings')}Einstellungen</button>
        <button class="btn secondary" data-act="main">${icon('menu')}Hauptmenü</button>
      </div>`,
    );
  }

  showCampaign(): void {
    this.view = 'campaign';
    this.back = 'start';
    const won = this.cb.campaignWon();
    const rows = (list: Scenario[]) =>
      list.map((sc, i) => {
        const done = won.includes(sc.id);
        const open = isUnlocked(sc.id, won);
        const req = requiredWin(sc.id);
        const state = done ? 'Geschafft' : open ? `Etwa ${sc.minutes} Minuten` : `Gesperrt: zuerst ${req ? req.name : 'die Karte davor'} gewinnen`;
        return `<div class="slot${open ? '' : ' locked'}">
        <div class="slot-info"><b>${i + 1}. ${sc.name}${done ? ` ${icon('trophy')}` : ''}</b><small>${goalText(sc.goal, speciesOf(sc))}. ${state}.</small></div>
        <button class="btn${done ? ' secondary' : ''}" data-act="play" data-id="${sc.id}" ${open ? '' : 'disabled'}>${done ? 'Nochmal' : 'Spielen'}</button>
      </div>`;
      });
    this.dialog(
      'Kampagnen',
      `<p class="note"><b>Der Otterclan:</b> fünf Karten, jede mit eigenem Tal und eigenem Ziel. Ein Sieg schaltet die nächste Karte frei.</p>
      ${rows(CAMPAIGN).join('')}
      <p class="note"><b>Das Molchvolk:</b> drei Karten mit einem Volk, das mit Stein baut, im Wasser wohnt und die Dürre fürchtet. Offen nach dem ersten Sieg im Ottertal.</p>
      ${rows(MOLCH_CAMPAIGN).join('')}
      <div class="btn-row"><button class="btn secondary" data-act="back">Zurück</button></div>`,
    );
  }

  // --- Flusskette ---------------------------------------------------------------

  showRiver(): void {
    const from: MenuView = this.view === 'start' || (this.view === 'river' && this.back === 'start') ? 'start' : 'menu';
    this.view = 'river';
    this.back = from;
    const link = this.cb.riverLink();
    const busy = this.riverBusy ? 'disabled' : '';
    const error = this.riverError ? `<p class="note bad">${esc(this.riverError)}</p>` : '';
    if (!link) {
      this.dialog(
        'Flusskette',
        `<p class="note">Mehrere Spieler bilden einen Fluss. Wer in der Kette oben steht, gibt sein Wasser nach unten weiter: Was bei ihm am Kartenrand abfließt, kommt beim Spieler darunter aus den Quellen. Staut er, wird es unten knapp; lässt er die Flutwelle durch, kommt sie unten an. Gemeldet wird jede Minute, solange gespielt wird; dafür reicht das anonyme Konto.</p>
        <div class="daily-row">${nameInput(this.cb.getName())}</div>
        <div class="daily-row">
          <label>Neue Kette <input class="river-name" type="text" maxlength="40" placeholder="Name der Kette"></label>
          <button class="btn" data-act="river-create" ${busy}>${icon('river')}Anlegen</button>
        </div>
        <div class="daily-row">
          <label>Code <input class="river-code" type="text" maxlength="6" placeholder="ABC123" autocapitalize="characters"></label>
          <button class="btn" data-act="river-join" ${busy}>${icon('cloud')}Beitreten</button>
        </div>
        ${error}
        <div class="btn-row"><button class="btn secondary" data-act="back">Zurück</button></div>`,
      );
      return;
    }
    const shareLink = `${location.origin}${location.pathname}?kette=${link.code}`;
    this.dialog(
      'Flusskette',
      `<p class="note">Kette <b>${esc(link.name)}</b>, Code <b class="code">${link.code}</b><br>${esc(shareLink)}</p>
      <div class="board">${this.riverHtml()}</div>
      ${error}
      <div class="btn-row">
        <button class="btn secondary" data-act="river-refresh" ${busy}>${icon('cloud')}Aktualisieren</button>
        <button class="btn secondary" data-act="river-leave" ${busy}>${icon('close')}Kette verlassen</button>
        <button class="btn secondary" data-act="back">Zurück</button>
      </div>`,
    );
  }

  /** Stand der Kette aus dem Hauptprogramm übernehmen und die Ansicht auffrischen */
  setRiverInfo(info: RiverInfo | null, error = ''): void {
    this.riverInfo = info;
    this.riverError = error;
    if (this.view === 'river') this.showRiver();
  }

  private riverHtml(): string {
    const info = this.riverInfo;
    if (!info) return this.riverBusy ? '<p class="note">Kette wird geladen …</p>' : '';
    if (!info.members.length) return '<p class="note">Noch niemand in der Kette.</p>';
    const now = Date.now();
    const up = activeUpstreamOf(info.members, now);
    const down = activeDownstreamOf(info.members, now);
    const rows = info.members.map((m) => {
      const role = m === up ? ' · gibt dir Wasser' : m === down ? ' · bekommt dein Wasser' : '';
      const fresh = isFresh(m.updatedAt, now);
      const stand = m.scenarioName ? `${esc(m.scenarioName)} · Tag ${m.day}, Jahr ${m.year} · ${m.population} ${SPECIES[m.species].many}` : 'noch keine Meldung';
      const age = m.updatedAt > 0 ? ` · ${fresh ? 'spielt gerade' : `zuletzt ${formatSavedAt(m.updatedAt)}`}` : '';
      return `<div class="board-row river${m.me ? ' me' : ''}"><span class="rank">${m.position + 1}.</span><span class="name">${m.player ? esc(m.player) : 'Ohne Namen'}${m.me ? ' (du)' : ''}</span><small>${stand}${age}${role}</small><span class="pts" title="gemeldeter Abfluss">${fresh ? `${Math.round(m.outflow * 100)} %` : '–'}</span></div>`;
    });
    const factor = Math.round(factorFrom(info.members, now) * 100);
    const me = info.members.find((m) => m.me);
    const above = me ? info.members.some((m) => m.position < me.position) : false;
    const note = me
      ? up
        ? `Rechts steht der gemeldete Abfluss, 100 % ist der normale Zufluss der jeweiligen Karte. Von ${up.player ? esc(up.player) : 'oben'} kommen bei dir gerade ${factor} % des normalen Zuflusses an.`
        : above
          ? 'Über dir spielt gerade niemand, deine Quellen laufen normal. Wer länger als 15 Minuten nichts meldet, wird übersprungen.'
          : 'Du stehst ganz oben: deine Quellen laufen normal, dein Abfluss geht an den nächsten Spieler unter dir, der gerade spielt.'
      : 'Du stehst nicht in dieser Kette. Verlasse sie und tritt mit dem Code neu bei.';
    return `${rows.join('')}<p class="note">${note}</p>`;
  }

  /** Aktion an der Kette mit Sperre der Knöpfe; Fehler erscheinen im Dialog */
  private riverAction(run: () => Promise<void>): void {
    if (this.riverBusy) return;
    this.riverBusy = true;
    this.riverError = '';
    this.showRiver();
    run()
      .catch((err: Error) => {
        this.riverError = err.message;
      })
      .finally(() => {
        this.riverBusy = false;
        if (this.view === 'river') this.showRiver();
      });
  }

  // --- Errungenschaften ---------------------------------------------------------

  showAchievements(): void {
    const from: MenuView = this.view === 'start' || (this.view === 'achievements' && this.back === 'start') ? 'start' : 'menu';
    this.view = 'achievements';
    this.back = from;
    const st = this.cb.achievements();
    const groups = GROUP_ORDER.map((g) => {
      const list = ACHIEVEMENTS.filter((a) => a.group === g);
      const done = list.filter((a) => st.unlocked[a.id]).length;
      const rows = list
        .map((a) => {
          const at = st.unlocked[a.id];
          return `<div class="ach${at ? ' done' : ''}">${icon(at ? 'medal' : 'lock')}<div><b>${a.title}</b><small>${a.text}${at ? ` Erreicht am ${new Date(at).toLocaleDateString('de-DE')}.` : ''}</small></div></div>`;
        })
        .join('');
      return `<h3 class="ach-group">${GROUP_NAMES[g]}<span>${done} / ${list.length}</span></h3><div class="ach-list">${rows}</div>`;
    }).join('');
    this.dialog(
      'Errungenschaften',
      `<p class="note">${unlockedCount(st)} von ${ACHIEVEMENT_COUNT} erreicht. Sie gelten für diesen Browser, über alle Spiele hinweg.</p>
      ${groups}
      <div class="btn-row"><button class="btn secondary" data-act="back">Zurück</button></div>`,
      'ach-dialog',
    );
  }

  /** Einblendung, wenn eine Errungenschaft erreicht ist */
  toastAchievement(title: string): void {
    const el = document.createElement('div');
    el.className = 'toast ach';
    el.innerHTML = `${icon('medal')}<span><small>Errungenschaft</small><b>${esc(title)}</b></span>`;
    this.toasts.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  showDaily(): void {
    this.view = 'daily';
    this.back = 'start';
    const key = dailyKey();
    const cur = this.cb.dailyScore();
    const running = cur !== null && cur.key === key;
    const scorePart = cur
      ? cur.submitted
        ? `<p class="note">Deine Wertung von ${cur.score} Punkten steht in der Bestenliste.</p>`
        : this.dailyRow(cur)
      : `<div class="daily-row">${nameInput(this.cb.getName())}</div>`;
    this.dialog(
      'Tageskarte',
      `<p class="note">Jeden Tag ein neues Tal, für alle Spieler dasselbe. Es zählt, wie lange der Clan durchhält und wie groß er wird: 10 Punkte je überstandenem Tag und 5 je lebendem Otter. Nur die beste Wertung des Tages zählt.</p>
      <div class="slot">
        <div class="slot-info"><b>Karte vom ${dailyDateText(key)}</b><small>${running && cur ? `${cur.population > 0 ? 'Läuft gerade' : 'Vorbei'}: ${cur.score} Punkte nach ${cur.days} ${cur.days === 1 ? 'Tag' : 'Tagen'}.` : 'Ein Tal mit zufälliger Form, der Jahreslauf wie im Ottertal.'}</small></div>
        <button class="btn" data-act="daily-play">${icon('play')}${running ? 'Neu starten' : 'Spielen'}</button>
      </div>
      ${scorePart}
      <div class="section-title">${icon('trophy')}Bestenliste</div>
      <div class="board"></div>
      <div class="btn-row"><button class="btn secondary" data-act="back">Zurück</button></div>`,
    );
    this.loadBoard(key);
    this.renderBoard();
  }

  /** Namensfeld und Knopf zum Abgeben der Wertung */
  private dailyRow(d: DailyScore): string {
    return `<div class="daily-row">
      ${nameInput(this.cb.getName())}
      <button class="btn" data-act="daily-submit" ${this.dailyBusy ? 'disabled' : ''}>${icon('trophy')}Wertung abgeben: ${d.score} Punkte</button>
    </div>`;
  }

  private loadBoard(key: string): void {
    if ((this.board && this.boardKey === key) || this.boardBusy) return;
    this.boardBusy = true;
    this.boardError = '';
    this.cb
      .dailyBoard(key)
      .then((b) => {
        this.board = b;
        this.boardKey = key;
      })
      .catch((err: Error) => {
        this.boardError = err.message;
      })
      .finally(() => {
        this.boardBusy = false;
        this.renderBoard();
      });
  }

  private renderBoard(): void {
    const el = this.root.querySelector('.board');
    if (el && this.view === 'daily') el.innerHTML = this.boardHtml();
  }

  private boardHtml(): string {
    if (this.boardBusy) return '<p class="note">Bestenliste wird geladen …</p>';
    if (this.boardError) return `<p class="note">Bestenliste nicht erreichbar: ${esc(this.boardError)}</p>`;
    const b = this.board;
    if (!b) return '';
    if (!b.rows.length) return '<p class="note">Heute hat noch niemand eine Wertung abgegeben.</p>';
    const rows = b.rows.map(
      (r, i) =>
        `<div class="board-row${r.me ? ' me' : ''}"><span class="rank">${i + 1}.</span><span class="name">${esc(r.name)}</span><small>${r.days} ${r.days === 1 ? 'Tag' : 'Tage'} · ${r.population} Otter</small><span class="pts">${r.score}</span></div>`,
    );
    const mine = b.me
      ? `<p class="note">Dein Platz: ${b.me.rank} von ${b.total} mit ${b.me.score} Punkten.</p>`
      : `<p class="note">${b.total} ${b.total === 1 ? 'Spieler hat' : 'Spieler haben'} heute eine Wertung abgegeben.</p>`;
    return rows.join('') + mine;
  }

  /** Namensfeld übernehmen, falls eins zu sehen ist */
  private saveNameInput(): void {
    const input = this.root.querySelector('.player-name') as HTMLInputElement | null;
    if (input) this.cb.setName(input.value);
  }

  private submitDaily(): void {
    if (this.dailyBusy) return;
    const input = this.root.querySelector('.player-name') as HTMLInputElement | null;
    const name = (input ? input.value : this.cb.getName()).trim().slice(0, 20);
    if (!name) {
      this.toast('Bitte zuerst einen Namen eingeben.', true);
      input?.focus();
      return;
    }
    this.cb.setName(name);
    this.dailyBusy = true;
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-act="daily-submit"]')) b.disabled = true;
    this.cb
      .onDailySubmit(name)
      .then((r) => {
        this.toast(
          r.improved
            ? `Wertung abgegeben: ${r.score} Punkte, Platz ${r.rank} von ${r.total}.`
            : `Deine beste Wertung heute bleibt ${r.score} Punkte, Platz ${r.rank} von ${r.total}.`,
        );
        this.board = null;
      })
      .catch((err: Error) => this.toast(`Bestenliste: ${err.message}`, true))
      .finally(() => {
        this.dailyBusy = false;
        this.refreshDaily();
      });
  }

  /** Die Ansicht mit der Wertung neu aufbauen */
  private refreshDaily(): void {
    if (this.view === 'daily') this.showDaily();
    else if (this.view === 'end' && this.lastStats) this.showEnd(this.lastStats);
    else if (this.view === 'menu') this.showMenu(this.lastMenuStats);
  }

  showMaps(): void {
    this.view = 'maps';
    this.back = 'start';
    const maps = this.cb.listMaps();
    const rows = maps.map(
      (m) => `<div class="slot">
        <div class="slot-info"><b>${esc(m.name)}</b><small>${m.author ? `von ${esc(m.author)} · ` : ''}${goalText(m.goal)}${m.code ? ` · Code ${m.code}` : ''}</small></div>
        <button class="btn" data-act="map-play" data-id="${esc(m.id)}">${icon('play')}Spielen</button>
        <button class="btn secondary" data-act="map-edit" data-id="${esc(m.id)}">${icon('editor')}Bearbeiten</button>
        <button class="btn secondary" data-act="map-delete" data-id="${esc(m.id)}" title="Löschen">${icon('close')}</button>
      </div>`,
    );
    this.dialog(
      'Karteneditor',
      `<p class="note">Baut eigene Täler mit Quellen, Abfluss und Startlager, spielt sie Probe und teilt sie mit einem Code aus sechs Zeichen.</p>
      <div class="section-title">${icon('editor')}Neue Karte</div>
      <div class="daily-row">
        <label>Zufallstal, Karte <input class="map-seed" type="number" min="1" max="999999" value="${this.seed}"></label>
        <button class="btn" data-act="map-new-random">${icon('editor')}Tal erzeugen</button>
        <button class="btn secondary" data-act="map-new-flat">Flache Karte</button>
      </div>
      <div class="section-title">${icon('save')}Meine Karten</div>
      ${rows.length ? rows.join('') : '<p class="note">Noch keine eigene Karte. Im Editor unter Menü speichern.</p>'}
      <div class="section-title">${icon('cloud')}Geteilte Karten</div>
      <div class="daily-row">
        <label>Code <input class="map-code" type="text" maxlength="6" placeholder="ABC123" autocapitalize="characters"></label>
        <button class="btn" data-act="map-code-load" ${this.mapBusy ? 'disabled' : ''}>${icon('cloud')}Laden und spielen</button>
      </div>
      <div class="board"></div>
      <div class="btn-row"><button class="btn secondary" data-act="back">Zurück</button></div>`,
    );
    this.loadShared();
    this.renderShared();
  }

  private loadShared(): void {
    if (this.shared || this.sharedBusy) return;
    this.sharedBusy = true;
    this.sharedError = '';
    this.cb
      .onMapList()
      .then((list) => {
        this.shared = list;
      })
      .catch((err: Error) => {
        this.sharedError = err.message;
      })
      .finally(() => {
        this.sharedBusy = false;
        this.renderShared();
      });
  }

  private renderShared(): void {
    const el = this.root.querySelector('.board');
    if (el && this.view === 'maps') el.innerHTML = this.sharedHtml();
  }

  private sharedHtml(): string {
    if (this.sharedBusy) return '<p class="note">Geteilte Karten werden geladen …</p>';
    if (this.sharedError) return `<p class="note">Geteilte Karten nicht erreichbar: ${esc(this.sharedError)}</p>`;
    const list = this.shared;
    if (!list) return '';
    if (!list.length) return '<p class="note">Noch keine geteilte Karte. Deine kann die erste sein.</p>';
    return list
      .map(
        (m) => `<div class="slot">
        <div class="slot-info"><b>${esc(m.name)}</b><small>Code ${m.code}${m.author ? ` · von ${esc(m.author)}` : ''} · ${m.plays} mal gespielt · ${formatSavedAt(m.createdAt)}</small></div>
        <button class="btn secondary" data-act="map-shared-play" data-code="${m.code}" ${this.mapBusy ? 'disabled' : ''}>${icon('play')}Spielen</button>
      </div>`,
      )
      .join('');
  }

  showMapSave(): void {
    this.view = 'mapsave';
    const m = this.cb.editing();
    const goal = m?.goal ?? null;
    const kind = goal?.kind ?? 'none';
    const clan = goal?.kind === 'clan' ? goal : { population: 16, year: 3 };
    const see = goal?.kind === 'stausee' ? goal : { cells: 60, depth: 2, days: 2, population: 12 };
    const link = m?.code ? `${location.origin}${location.pathname}?code=${m.code}` : '';
    this.dialog(
      'Karte speichern',
      `<div class="form">
        <label>Name <input class="map-name" type="text" maxlength="${MAP_NAME_MAX}" value="${esc(m?.name ?? '')}" placeholder="Mein Tal"></label>
        <label>Autor <input class="map-author" type="text" maxlength="${AUTHOR_MAX}" value="${esc(m?.author || this.cb.getName())}" placeholder="Dein Name"></label>
        <label>Ziel <select class="map-goal">
          <option value="none" ${kind === 'none' ? 'selected' : ''}>Kein Ziel, freies Spiel</option>
          <option value="clan" ${kind === 'clan' ? 'selected' : ''}>Clan: so viele Otter bis zu einem Jahr</option>
          <option value="stausee" ${kind === 'stausee' ? 'selected' : ''}>Stausee: einen See so viele Tage halten</option>
        </select></label>
        <div class="goal-fields clan${kind === 'clan' ? '' : ' hidden'}">
          <label>Otter <input class="g-pop" type="number" min="1" max="500" value="${clan.population}"></label>
          <label>Jahr <input class="g-year" type="number" min="1" max="20" value="${clan.year}"></label>
        </div>
        <div class="goal-fields stausee${kind === 'stausee' ? '' : ' hidden'}">
          <label>Zellen <input class="g-cells" type="number" min="1" max="5000" value="${see.cells}"></label>
          <label>Tiefe <input class="g-depth" type="number" min="0.5" max="8" step="0.5" value="${see.depth}"></label>
          <label>Tage <input class="g-days" type="number" min="1" max="30" value="${see.days}"></label>
          <label>Otter <input class="g-spop" type="number" min="0" max="500" value="${see.population}"></label>
        </div>
      </div>
      ${m?.code ? `<p class="note">Geteilt mit dem Code <b class="code">${m.code}</b><br>${esc(link)}</p>` : '<p class="note">Speichern legt die Karte in diesem Browser ab. Teilen lädt sie hoch und gibt einen Code, den andere eingeben können (anonymes Konto, ohne Anmeldung).</p>'}
      <div class="btn-row">
        <button class="btn" data-act="map-store" ${this.mapBusy ? 'disabled' : ''}>${icon('save')}Speichern</button>
        <button class="btn secondary" data-act="map-share" ${this.mapBusy ? 'disabled' : ''}>${icon('cloud')}${m?.code ? 'Nochmal teilen' : 'Teilen'}</button>
        <button class="btn secondary" data-act="map-test" ${this.mapBusy ? 'disabled' : ''}>${icon('play')}Probespiel</button>
        <button class="btn secondary" data-act="editor-back">Zurück zum Editor</button>
      </div>`,
    );
  }

  /** Name, Autor und Ziel aus dem Formular; null bei unmöglichem Ziel */
  private readMapForm(): { name: string; author: string; goal: Goal | null } | null {
    const val = (cls: string) => (this.root.querySelector(cls) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
    const num = (cls: string) => Number(val(cls));
    const name = val('.map-name').trim().slice(0, MAP_NAME_MAX) || 'Eigene Karte';
    const author = val('.map-author').trim().slice(0, AUTHOR_MAX);
    const kind = val('.map-goal');
    const raw =
      kind === 'clan'
        ? { kind: 'clan', population: num('.g-pop'), year: num('.g-year') }
        : kind === 'stausee'
          ? { kind: 'stausee', cells: num('.g-cells'), depth: num('.g-depth'), days: num('.g-days'), population: num('.g-spop') }
          : null;
    const goal = validateGoal(raw);
    if (goal === undefined) {
      this.toast('Das Ziel passt nicht: Otter 1 bis 500, Jahr 1 bis 20, Zellen 1 bis 5000, Tiefe 0,5 bis 8, Tage 1 bis 30.', true);
      return null;
    }
    return { name, author, goal };
  }

  /** Karte aus dem Editor holen und im Browser ablegen */
  private async storeMap(): Promise<CustomMap | null> {
    const form = this.readMapForm();
    if (!form) return null;
    const core = await this.cb.onMapExport();
    const prev = this.cb.editing();
    const map: CustomMap = { id: prev?.id ?? newMapId(), name: form.name, author: form.author, goal: form.goal, createdAt: Date.now(), ...core };
    if (prev?.code) map.code = prev.code;
    if (form.author && !this.cb.getName()) this.cb.setName(form.author);
    if (!this.cb.onMapStore(map)) {
      this.toast('Kein Platz mehr: höchstens 24 Karten im Browser. Bitte eine löschen.', true);
      return null;
    }
    return map;
  }

  /** Knöpfe sperren, solange eine Kartenaktion läuft; `run` sagt, ob die Ansicht danach neu gezeichnet werden soll */
  private mapAction(run: () => Promise<boolean>): void {
    if (this.mapBusy) return;
    this.mapBusy = true;
    this.setMapButtons(false);
    run()
      .then((changed) => {
        this.mapBusy = false;
        if (changed) this.refreshMaps();
        else this.setMapButtons(true);
      })
      .catch((err: Error) => {
        this.mapBusy = false;
        this.setMapButtons(true);
        this.toast(`Karte: ${err.message}`, true);
      });
  }

  private setMapButtons(on: boolean): void {
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('button[data-act^="map-"]')) b.disabled = !on;
  }

  private refreshMaps(): void {
    if (this.view === 'maps') this.showMaps();
    else if (this.view === 'mapsave') this.showMapSave();
  }

  private playCode(raw: string): void {
    const code = normalizeCode(raw);
    if (!isMapCode(code)) {
      this.toast('Ein Code hat sechs Zeichen, zum Beispiel ABC123.', true);
      return;
    }
    this.mapAction(async () => {
      const map = await this.cb.onMapDownload(code);
      this.cb.onPlayMap(map);
      return false;
    });
  }

  /** Regler in den Einstellungen */
  private onInput(e: Event): void {
    const input = (e.target as HTMLElement).closest('input[type="range"][data-setting]') as HTMLInputElement | null;
    if (!input) return;
    const s = this.cb.getSettings();
    (s as unknown as Record<string, number>)[input.dataset.setting!] = Number(input.value) / 100;
    this.cb.onSettings(s);
  }

  private onChange(e: Event): void {
    const sel = (e.target as HTMLElement).closest('.map-goal') as HTMLSelectElement | null;
    if (!sel) return;
    this.root.querySelector('.goal-fields.clan')?.classList.toggle('hidden', sel.value !== 'clan');
    this.root.querySelector('.goal-fields.stausee')?.classList.toggle('hidden', sel.value !== 'stausee');
  }

  showSaves(): void {
    this.view = 'saves';
    const local = this.cb.listLocal();
    const canSave = this.cb.canSave();
    const rows = LOCAL_SLOTS.map((slot) => {
      const e = local.find((x) => x.slot === slot);
      return `<div class="slot">
        <div class="slot-info"><b>${slotLabel(slot)}</b><small>${metaText(e)}</small></div>
        ${slot !== 'auto' ? `<button class="btn" data-act="save-local" data-slot="${slot}" ${canSave ? '' : 'disabled'}>Speichern</button>` : ''}
        <button class="btn secondary" data-act="load-local" data-slot="${slot}" ${e ? '' : 'disabled'}>Laden</button>
        <button class="btn secondary" data-act="delete-local" data-slot="${slot}" ${e ? '' : 'disabled'} title="Löschen">${icon('close')}</button>
      </div>`;
    });
    let cloud: string;
    if (!this.cloudConnected) {
      cloud = `<p class="note">Spielstände in der Cloud lassen sich auf einem anderen Gerät weiterspielen. Es wird ein anonymes Konto angelegt, ohne Anmeldung.</p>
        <button class="btn" data-act="cloud-connect" ${this.cloudBusy ? 'disabled' : ''}>${icon('cloud')}Mit der Cloud verbinden</button>`;
    } else {
      cloud = CLOUD_SLOTS.map((n) => {
        const e = this.cloudSaves.find((x) => x.slot === `cloud:${n}`);
        return `<div class="slot">
          <div class="slot-info"><b>Cloud ${n}</b><small>${metaText(e)}</small></div>
          <button class="btn" data-act="cloud-up" data-slot="${n}" ${canSave && !this.cloudBusy ? '' : 'disabled'}>Hochladen</button>
          <button class="btn secondary" data-act="cloud-down" data-slot="${n}" ${e && !this.cloudBusy ? '' : 'disabled'}>Laden</button>
          <button class="btn secondary" data-act="cloud-delete" data-slot="${n}" ${e && !this.cloudBusy ? '' : 'disabled'} title="Löschen">${icon('close')}</button>
        </div>`;
      }).join('');
    }
    this.dialog(
      'Spielstände',
      `<div class="section-title">${icon('save')}In diesem Browser</div>
      ${rows.join('')}
      <p class="note">Der Platz "Automatisch" wird jeden Spieltag überschrieben.</p>
      <div class="section-title">${icon('cloud')}Cloud</div>
      ${cloud}
      <div class="btn-row"><button class="btn secondary" data-act="back">Zurück</button></div>`,
    );
  }

  showSettings(): void {
    this.view = 'settings';
    const s = this.cb.getSettings();
    this.dialog(
      'Einstellungen',
      `<label class="setting"><span>Miniatur-Unschärfe und Farbstimmung (Tilt-Shift)<br><small class="note">Ausschalten, wenn das Bild ruckelt.</small></span><input type="checkbox" data-setting="tiltShift" ${s.tiltShift ? 'checked' : ''}></label>
      <label class="setting"><span>Schatten</span><input type="checkbox" data-setting="shadows" ${s.shadows ? 'checked' : ''}></label>
      <label class="setting"><span>Lautstärke<br><small class="note">Wasser, Regen, Bauen und Meldungen. Ganz links ist aus.</small></span><span class="range">${icon('sound')}<input type="range" min="0" max="100" step="5" data-setting="volume" value="${Math.round(s.volume * 100)}"></span></label>
      <div class="btn-row"><button class="btn secondary" data-act="back">Zurück</button></div>`,
    );
  }

  showIntro(s: Scenario): void {
    this.view = 'intro';
    this.dialog(
      s.name,
      `${s.intro.map((p) => `<p>${p}</p>`).join('')}
      <p><b>Ziel:</b> ${goalText(s.goal)}${s.minutes ? ` (etwa ${s.minutes} Minuten)` : ''}</p>
      ${s.hint ? `<p class="note"><b>Tipp:</b> ${s.hint}</p>` : ''}
      <div class="btn-row"><button class="btn" data-act="resume">${icon('play')}Los geht's</button></div>`,
      '',
      false,
    );
  }

  showEnd(stats: SimStats): void {
    this.view = 'end';
    this.lastStats = stats;
    const won = stats.outcome === 'won';
    const next = won ? nextScenario(stats.scenario) : null;
    const goal = stats.goal;
    const daily = stats.scenario === DAILY_ID ? this.cb.dailyScore() : null;
    const sp = SPECIES[stats.species];
    const lostText = daily
      ? `Der letzte ${sp.one} ist gestorben. ${daily.days} ${daily.days === 1 ? 'Tag' : 'Tage'} überstanden, das sind ${daily.score} Punkte.${daily.submitted ? ' Die Wertung steht in der Bestenliste.' : ' Gib die Wertung ab, dann zählt sie in der Bestenliste.'}`
      : `Der letzte ${sp.one} ist gestorben. ${sp.lostHint}`;
    const wonText =
      goal?.kind === 'stausee'
        ? `Der See in der Schlucht hält, ${stats.population} ${sp.many} leben an seinem Ufer. Ihr könnt weiterspielen oder zur nächsten Karte gehen.`
        : `${sp.title} hat sich im Tal behauptet: ${stats.population} ${sp.many} leben im Jahr ${stats.season.year}. Ihr könnt weiterspielen und die Siedlung noch größer machen.`;
    const rows = [
      ['Tage überstanden', String(stats.season.day - 1)],
      [sp.many, String(stats.population)],
      ['Geburten', String(stats.births)],
      ['Todesfälle', String(stats.deaths)],
      ['Vom Hochwasser verloren', `${stats.lostToFlood} Gebäude`],
      ['Zufriedenheit', `${Math.round(stats.mood * 100)} %`],
    ];
    if (daily) rows.unshift(['Wertung', `${daily.score} Punkte`]);
    this.dialog(
      won ? 'Ziel erreicht' : `${sp.title} ist ausgelöscht`,
      `<p>${won ? wonText : lostText}</p>
      <div class="end-stats">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      ${daily && !daily.submitted ? this.dailyRow(daily) : ''}
      <div class="btn-row">
        ${next ? `<button class="btn" data-act="play" data-id="${next.id}">${icon('trophy')}Nächste Karte: ${next.name}</button>` : ''}
        ${won ? `<button class="btn${next ? ' secondary' : ''}" data-act="resume">${icon('play')}Weiterspielen</button>` : `<button class="btn" data-act="retry">${icon('play')}Nochmal versuchen</button>`}
        ${daily ? `<button class="btn secondary" data-act="daily-board">${icon('trophy')}Bestenliste</button>` : ''}
        <button class="btn secondary" data-act="main">${icon('menu')}Hauptmenü</button>
      </div>`,
      '',
      won,
    );
  }

  /** Liste der Spielstände neu aufbauen, wenn sie gerade zu sehen ist */
  refreshSaves(): void {
    if (this.view === 'saves') this.showSaves();
  }

  // --- Eingaben -------------------------------------------------------------

  private onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const input = target.closest('input[data-setting]') as HTMLInputElement | null;
    if (input) {
      if (input.type === 'checkbox') {
        const s = this.cb.getSettings();
        (s as unknown as Record<string, boolean>)[input.dataset.setting!] = input.checked;
        this.cb.onSettings(s);
      }
      return;
    }
    const btn = target.closest('[data-act]') as HTMLElement | null;
    if (!btn) return;
    const act = btn.dataset.act!;
    const slot = btn.dataset.slot ?? '';
    switch (act) {
      case 'close':
      case 'resume':
        this.hide();
        this.cb.onResume();
        break;
      case 'back':
        this.saveNameInput();
        if (this.back === 'start') this.showStart();
        else this.showMenu(this.lastMenuStats);
        break;
      case 'maps':
        this.shared = null;
        this.showMaps();
        break;
      case 'map-new-random': {
        const seedEl = this.root.querySelector('.map-seed') as HTMLInputElement | null;
        const seed = Math.max(1, Math.floor(Number(seedEl?.value) || 1));
        this.seed = seed;
        this.cb.onEditorNew(seed);
        break;
      }
      case 'map-new-flat':
        this.cb.onEditorNew(null);
        break;
      case 'map-play':
      case 'map-edit':
      case 'map-delete': {
        const map = this.cb.listMaps().find((m) => m.id === btn.dataset.id);
        if (!map) break;
        if (act === 'map-play') this.cb.onPlayMap(map);
        else if (act === 'map-edit') this.cb.onEditorOpen(map);
        else {
          this.cb.onDeleteMap(map.id);
          this.showMaps();
        }
        break;
      }
      case 'map-code-load':
        this.playCode((this.root.querySelector('.map-code') as HTMLInputElement | null)?.value ?? '');
        break;
      case 'map-shared-play':
        this.playCode(btn.dataset.code ?? '');
        break;
      case 'mapsave':
        this.showMapSave();
        break;
      case 'editor-back':
        this.hide();
        this.cb.onResume();
        break;
      case 'map-store':
        this.mapAction(async () => {
          const map = await this.storeMap();
          if (map) this.toast(`Karte "${map.name}" gespeichert.`);
          return !!map;
        });
        break;
      case 'map-share':
        this.mapAction(async () => {
          const map = await this.storeMap();
          if (!map) return false;
          const code = await this.cb.onMapShare(map);
          this.toast(`Geteilt. Der Code ist ${code}.`);
          return true;
        });
        break;
      case 'map-test':
        // Probespiel: den Stand aus dem Editor holen und ablegen, damit die Änderungen den Test überdauern
        this.mapAction(async () => {
          let map: CustomMap | null = null;
          if (this.view === 'mapsave') map = await this.storeMap();
          else {
            const prev = this.cb.editing();
            if (prev) {
              map = { ...prev, ...(await this.cb.onMapExport()) };
              if (!this.cb.onMapStore(map)) this.toast('Die Karte konnte nicht abgelegt werden: höchstens 24 Karten im Browser.', true);
            }
          }
          if (map) this.cb.onPlayMap(map);
          return false;
        });
        break;
      case 'campaign':
        this.showCampaign();
        break;
      case 'daily':
        this.board = null;
        this.showDaily();
        break;
      case 'river':
        this.riverError = '';
        this.showRiver();
        if (this.cb.riverLink()) this.riverAction(() => this.cb.onRiverRefresh());
        break;
      case 'river-refresh':
        this.riverAction(() => this.cb.onRiverRefresh());
        break;
      case 'achievements':
        this.showAchievements();
        break;
      case 'river-create': {
        this.saveNameInput();
        const name = ((this.root.querySelector('.river-name') as HTMLInputElement | null)?.value ?? '').trim().slice(0, 40);
        if (!name) {
          this.riverError = 'Die Kette braucht einen Namen.';
          this.showRiver();
          break;
        }
        this.riverAction(() => this.cb.onRiverCreate(name, this.cb.getName()));
        break;
      }
      case 'river-join': {
        this.saveNameInput();
        const code = normalizeCode((this.root.querySelector('.river-code') as HTMLInputElement | null)?.value ?? '');
        if (!isMapCode(code)) {
          this.riverError = 'Ein Code hat sechs Zeichen, zum Beispiel ABC234.';
          this.showRiver();
          break;
        }
        this.riverAction(() => this.cb.onRiverJoin(code, this.cb.getName()));
        break;
      }
      case 'river-leave':
        this.riverAction(() => this.cb.onRiverLeave());
        break;
      case 'daily-board':
        this.saveNameInput();
        this.board = null;
        this.showDaily();
        break;
      case 'daily-play':
        this.saveNameInput();
        this.cb.onNewGame(DAILY_ID, Number(dailyKey()), false);
        break;
      case 'daily-submit':
        this.submitDaily();
        break;
      case 'play': {
        const sc = SCENARIOS[btn.dataset.id ?? ''];
        if (sc && isUnlocked(sc.id, this.cb.campaignWon())) this.cb.onNewGame(sc.id, sc.seed, false);
        break;
      }
      case 'retry': {
        const last = this.lastStats;
        if (last) this.cb.onNewGame(last.scenario, last.seed, false, last.species);
        else this.cb.onNewGame(CAMPAIGN[0].id, CAMPAIGN[0].seed, false);
        break;
      }
      case 'free': {
        const seedEl = this.root.querySelector('.seed') as HTMLInputElement;
        const freeEl = this.root.querySelector('.freebuild') as HTMLInputElement;
        const volkEl = this.root.querySelector('.volk') as HTMLSelectElement | null;
        const seed = Math.max(1, Math.floor(Number(seedEl.value) || 1));
        this.seed = seed;
        this.volk = volkEl && volkEl.value === 'molch' ? 'molch' : 'otter';
        this.cb.onNewGame('frei', seed, freeEl.checked, this.volk);
        break;
      }
      case 'continue':
        if (!this.cb.onLoadLocal('auto')) this.toast('Kein Spielstand gefunden.', true);
        break;
      case 'saves':
        this.showSaves();
        break;
      case 'settings':
        this.showSettings();
        break;
      case 'main':
        this.cb.onMainMenu();
        break;
      case 'save-local':
        this.cb.onSaveLocal(slot);
        break;
      case 'load-local':
        if (!this.cb.onLoadLocal(slot)) this.toast('Spielstand konnte nicht gelesen werden.', true);
        break;
      case 'delete-local':
        this.cb.onDeleteLocal(slot);
        this.showSaves();
        break;
      case 'cloud-connect':
        this.cloudAction(async () => {
          await this.cb.onCloudConnect();
          this.cloudConnected = true;
          this.cloudSaves = await this.cb.onCloudList();
        }, 'Mit der Cloud verbunden.');
        break;
      case 'cloud-up':
        this.cloudAction(async () => {
          await this.cb.onCloudUpload(Number(slot));
          this.cloudSaves = await this.cb.onCloudList();
        }, 'In die Cloud gespeichert.');
        break;
      case 'cloud-down':
        this.cloudAction(() => this.cb.onCloudDownload(Number(slot)), 'Spielstand aus der Cloud geladen.');
        break;
      case 'cloud-delete':
        this.cloudAction(async () => {
          await this.cb.onCloudDelete(Number(slot));
          this.cloudSaves = await this.cb.onCloudList();
        }, 'Gelöscht.');
        break;
    }
  }

  private cloudAction(run: () => Promise<void>, okText: string): void {
    if (this.cloudBusy) return;
    this.cloudBusy = true;
    this.refreshSaves();
    run()
      .then(() => this.toast(okText))
      .catch((err: Error) => this.toast(`Cloud: ${err.message}`, true))
      .finally(() => {
        this.cloudBusy = false;
        this.refreshSaves();
      });
  }
}
