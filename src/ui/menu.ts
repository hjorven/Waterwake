import { DAILY_ID, dailyDateText, dailyKey } from '../data/daily';
import { CAMPAIGN, SCENARIOS, goalText, isUnlocked, nextScenario, type Scenario } from '../data/maps';
import { CLOUD_SLOTS, type DailyBoard, type DailyResult } from '../online/cloud';
import { LOCAL_SLOTS, formatSavedAt, slotLabel, type SaveEntry, type Settings } from '../online/saves';
import type { SimStats } from '../sim/protocol';
import { icon } from './hud';

export interface MenuCallbacks {
  onNewGame(scenario: string, seed: number, freeBuild: boolean): void;
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

export type MenuView = 'start' | 'menu' | 'campaign' | 'daily' | 'saves' | 'settings' | 'intro' | 'end' | null;

function metaText(e: SaveEntry | undefined): string {
  if (!e) return 'leer';
  const m = e.meta;
  return `${m.scenarioName} · Tag ${m.day}, Jahr ${m.year} · ${m.population} Otter · ${formatSavedAt(m.savedAt)}`;
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
  /** Stand beim letzten Ende-Dialog, für "Nochmal versuchen" */
  private lastStats: SimStats | null = null;
  /** Stand beim letzten Spielmenü, zum Neuaufbau nach dem Abgeben einer Wertung */
  private lastMenuStats: SimStats | null = null;
  private board: DailyBoard | null = null;
  private boardKey = '';
  private boardError = '';
  private boardBusy = false;
  private dailyBusy = false;

  constructor(parent: HTMLElement, cb: MenuCallbacks) {
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    parent.appendChild(this.root);
    this.toasts = document.createElement('div');
    this.toasts.className = 'toasts';
    parent.appendChild(this.toasts);
    this.root.addEventListener('click', (e) => this.onClick(e));
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
    const next = CAMPAIGN.find((sc) => !won.includes(sc.id) && isUnlocked(sc.id, won));
    const wonCount = CAMPAIGN.filter((sc) => won.includes(sc.id)).length;
    const campaignText = next
      ? `${wonCount} von ${CAMPAIGN.length} Karten geschafft. Nächste Karte: ${next.name}, etwa ${next.minutes} Minuten.`
      : `Alle ${CAMPAIGN.length} Karten geschafft. Jede Karte lässt sich nochmal spielen.`;
    this.dialog(
      '',
      `
      <div class="start-title"><span class="logo">Waterwake</span><span class="tagline">Ein Otterclan am wilden Fluss</span></div>
      <div class="start-cards">
        <button class="start-card" data-act="campaign">${icon('trophy')}<b>Kampagne</b><small>${campaignText}</small></button>
        <button class="start-card" data-act="daily">${icon('calendar')}<b>Tageskarte</b><small>Karte vom ${dailyDateText(dailyKey())}, für alle gleich. Wertung in der Bestenliste.</small></button>
        ${auto ? `<button class="start-card" data-act="continue">${icon('play')}<b>Weiterspielen</b><small>${metaText(auto)}</small></button>` : ''}
        <button class="start-card" data-act="saves">${icon('save')}<b>Spielstände</b><small>Laden aus dem Browser oder der Cloud.</small></button>
        <button class="start-card" data-act="settings">${icon('settings')}<b>Einstellungen</b><small>Miniatur-Unschärfe, Schatten.</small></button>
        <div class="start-card wide free">
          ${icon('wasser')}<b>Freies Spiel</b><small>Zufallskarte ohne Ziel. Dieselbe Kartennummer ergibt dieselbe Karte.</small>
          <div class="free-row">
            <label>Karte <input class="seed" type="number" min="1" max="999999" value="${this.seed}"></label>
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
    const daily = stats && stats.scenario === DAILY_ID ? this.cb.dailyScore() : null;
    const head = stats
      ? `<p class="note">${stats.scenarioName} · Tag ${stats.season.day}, Jahr ${stats.season.year} · ${stats.population} Otter · ${daily ? `Wertung: ${daily.score} Punkte` : `Ziel: ${goalText(stats.goal)}`}</p>`
      : '';
    const dailyPart = daily ? (daily.submitted ? `<p class="note">Die Wertung von ${daily.score} Punkten steht in der Bestenliste.</p>` : this.dailyRow(daily)) : '';
    this.dialog(
      'Menü',
      `${head}${dailyPart}
      <div class="menu-list">
        <button class="btn" data-act="resume">${icon('play')}Weiterspielen</button>
        <button class="btn secondary" data-act="saves">${icon('save')}Spielstände speichern und laden</button>
        <button class="btn secondary" data-act="settings">${icon('settings')}Einstellungen</button>
        <button class="btn secondary" data-act="main">${icon('menu')}Hauptmenü</button>
      </div>`,
    );
  }

  showCampaign(): void {
    this.view = 'campaign';
    this.back = 'start';
    const won = this.cb.campaignWon();
    const rows = CAMPAIGN.map((sc, i) => {
      const done = won.includes(sc.id);
      const open = isUnlocked(sc.id, won);
      const state = done ? 'Geschafft' : open ? `Etwa ${sc.minutes} Minuten` : `Gesperrt: zuerst ${CAMPAIGN[i - 1].name} gewinnen`;
      return `<div class="slot${open ? '' : ' locked'}">
        <div class="slot-info"><b>${i + 1}. ${sc.name}${done ? ` ${icon('trophy')}` : ''}</b><small>${goalText(sc.goal)}. ${state}.</small></div>
        <button class="btn${done ? ' secondary' : ''}" data-act="play" data-id="${sc.id}" ${open ? '' : 'disabled'}>${done ? 'Nochmal' : 'Spielen'}</button>
      </div>`;
    });
    this.dialog(
      'Die Otter-Kampagne',
      `<p class="note">Fünf Karten, jede mit eigenem Tal und eigenem Ziel. Ein Sieg schaltet die nächste Karte frei.</p>
      ${rows.join('')}
      <div class="btn-row"><button class="btn secondary" data-act="back">Zurück</button></div>`,
    );
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
    const lostText = daily
      ? `Der letzte Otter ist gestorben. ${daily.days} ${daily.days === 1 ? 'Tag' : 'Tage'} überstanden, das sind ${daily.score} Punkte.${daily.submitted ? ' Die Wertung steht in der Bestenliste.' : ' Gib die Wertung ab, dann zählt sie in der Bestenliste.'}`
      : 'Der letzte Otter ist gestorben. Beim nächsten Mal: früh eine Pumpe und einen Tank bauen, Deiche gegen die Flutwelle, und Hütten für die Stimmung.';
    const wonText =
      goal?.kind === 'stausee'
        ? `Der See in der Schlucht hält, ${stats.population} Otter leben an seinem Ufer. Ihr könnt weiterspielen oder zur nächsten Karte gehen.`
        : `Der Otterclan hat sich im Tal behauptet: ${stats.population} Otter leben im Jahr ${stats.season.year}. Ihr könnt weiterspielen und den Clan noch größer machen.`;
    const rows = [
      ['Tage überstanden', String(stats.season.day - 1)],
      ['Otter', String(stats.population)],
      ['Geburten', String(stats.births)],
      ['Todesfälle', String(stats.deaths)],
      ['Vom Hochwasser verloren', `${stats.lostToFlood} Gebäude`],
      ['Zufriedenheit', `${Math.round(stats.mood * 100)} %`],
    ];
    if (daily) rows.unshift(['Wertung', `${daily.score} Punkte`]);
    this.dialog(
      won ? 'Ziel erreicht' : 'Der Clan ist ausgelöscht',
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
      const s = this.cb.getSettings();
      (s as unknown as Record<string, boolean>)[input.dataset.setting!] = input.checked;
      this.cb.onSettings(s);
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
        else this.showMenu(null);
        break;
      case 'campaign':
        this.showCampaign();
        break;
      case 'daily':
        this.board = null;
        this.showDaily();
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
        if (last) this.cb.onNewGame(last.scenario, last.seed, false);
        else this.cb.onNewGame(CAMPAIGN[0].id, CAMPAIGN[0].seed, false);
        break;
      }
      case 'free': {
        const seedEl = this.root.querySelector('.seed') as HTMLInputElement;
        const freeEl = this.root.querySelector('.freebuild') as HTMLInputElement;
        const seed = Math.max(1, Math.floor(Number(seedEl.value) || 1));
        this.seed = seed;
        this.cb.onNewGame('frei', seed, freeEl.checked);
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
