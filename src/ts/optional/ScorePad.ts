/** End-game scoring pad. Overlay only: it is not part of the table flow. */

export interface ScorePadContext {
  getRoot(): HTMLElement;
  escapeHtml(value: string): string;
  playerName(pid: number): string;
  playerColor(pid: number): string;
  scoringTitle(scoringId: number): string;
  addTooltip(id: string, text: string): void;
}

const INK = '#6b3e22';

function iconPerson(): string {
  return `<svg class="bae_scorepad_svg" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="16" r="8" fill="${INK}"/><path d="M14 54c1.5-14 8-20 18-20s16.5 6 18 20" fill="${INK}"/></svg>`;
}

function iconPaw(): string {
  return `<svg class="bae_scorepad_svg" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="42" rx="13" ry="11" fill="${INK}"/><circle cx="16" cy="26" r="6" fill="${INK}"/><circle cx="27" cy="16" r="6.5" fill="${INK}"/><circle cx="41" cy="16" r="6.5" fill="${INK}"/><circle cx="51" cy="27" r="5.5" fill="${INK}"/></svg>`;
}

function iconFlag(): string {
  return `<svg class="bae_scorepad_svg" viewBox="0 0 64 64" aria-hidden="true"><path d="M18 8v48" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M20 12h30l-7 9 7 9H20z" fill="${INK}"/></svg>`;
}

function iconCard(): string {
  return `<svg class="bae_scorepad_svg" viewBox="0 0 64 64" aria-hidden="true"><rect x="16" y="8" width="32" height="48" rx="3" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="4 3"/><path d="M32 20l2.2 6.4H41l-5.4 4 2.1 6.6L32 33.4 26.3 37l2.1-6.6-5.4-4h6.8z" fill="${INK}"/></svg>`;
}

function iconFeather(mark: string): string {
  return `<span class="bae_scorepad_feather"><span class="bae_scorepad_roman">${mark}</span><svg class="bae_scorepad_svg bae_scorepad_quill" viewBox="0 0 40 64" aria-hidden="true"><path d="M8 54c8-6 14-20 22-40 2 16-2 30-10 42-4-8-8-6-12-2z" fill="${INK}"/><path d="M12 50c6-14 12-28 16-38" stroke="#f4efe6" stroke-width="1.6" fill="none"/></svg></span>`;
}

function iconToken(): string {
  return `<svg class="bae_scorepad_svg" viewBox="0 0 64 64" aria-hidden="true"><rect x="12" y="12" width="40" height="40" rx="6" fill="${INK}"/><path d="M32 18l2.4 7.2H42l-6 4.6 2.3 7.2L32 32.6 25.7 37l2.3-7.2-6-4.6h7.6z" fill="#f4efe6"/></svg>`;
}

export function parseEndScoreSheet(raw: unknown): EndScoreSheet | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { scoring_cards?: unknown; players?: unknown };
  if (!Array.isArray(obj.players) || obj.players.length === 0) return null;
  const players = obj.players.map((row) => {
    const r = row as Record<string, unknown>;
    const scoring = Array.isArray(r.scoring) ? r.scoring.map(num) : [];
    return {
      player_id: num(r.player_id),
      species: num(r.species),
      track: num(r.track),
      animals: num(r.animals),
      scoring,
      tokens: num(r.tokens),
      total: num(r.total),
    };
  }).filter((row) => row.player_id > 0);
  if (players.length === 0) return null;
  const cards = Array.isArray(obj.scoring_cards) ? obj.scoring_cards.map(num) : [];
  return { scoring_cards: cards, players };
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export class ScorePad {
  private hostEl: HTMLElement | null = null;
  private token = 0;
  private dismissed = false;

  constructor(private ctx: ScorePadContext) {}

  reattach(): void {
    const root = this.ctx.getRoot();
    if (this.hostEl && this.hostEl.parentElement !== root) root.appendChild(this.hostEl);
  }

  /** Fills the pad. When animate is set, rows appear one at a time and the promise waits for that reveal. */
  async show(sheet: EndScoreSheet, animate: boolean): Promise<void> {
    const token = ++this.token;
    this.dismissed = false;
    const host = this.ensureHost();
    host.innerHTML = this.markup(sheet);
    this.bind(host);
    this.registerTips(sheet);
    const steps = [...host.querySelectorAll<HTMLElement>('[data-step]')];
    const order = [...new Set(steps.map((cell) => cell.dataset.step ?? ''))];
    const reveal = (step: string): void => {
      steps.filter((cell) => cell.dataset.step === step).forEach((cell) => {
        cell.textContent = cell.dataset.value ?? '';
        cell.classList.add('bae_scorepad_shown');
      });
    };
    if (!animate) {
      order.forEach(reveal);
      return;
    }
    for (let i = 0; i < order.length; i++) {
      if (token !== this.token) return;
      if (this.dismissed) {
        order.forEach(reveal);
        return;
      }
      reveal(order[i]);
      if (i < order.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 280));
    }
  }

  private ensureHost(): HTMLElement {
    if (!this.hostEl) {
      this.hostEl = document.createElement('div');
      this.hostEl.id = 'bae_scorepad_host';
    }
    this.reattach();
    return this.hostEl;
  }

  private bind(host: HTMLElement): void {
    host.querySelector('.bae_scorepad_close')?.addEventListener('click', () => this.setOpen(false));
    host.querySelector('.bae_scorepad_reopen')?.addEventListener('click', () => this.setOpen(true));
  }

  private setOpen(open: boolean): void {
    this.dismissed = !open;
    const slot = this.hostEl?.querySelector('.bae_scorepad_slot');
    const reopen = this.hostEl?.querySelector('.bae_scorepad_reopen');
    slot?.classList.toggle('bae_scorepad_hidden', !open);
    reopen?.classList.toggle('bae_scorepad_hidden', open);
  }

  private registerTips(sheet: EndScoreSheet): void {
    const cards = this.cardIds(sheet);
    const tips: Array<[string, string]> = [
      ['bae_scorepad_species', _('Species sets')],
      ['bae_scorepad_track', _('Exploration track')],
      ['bae_scorepad_animals', _('Animal cards')],
      ['bae_scorepad_score_0', this.cardTip(cards[0], 'I')],
      ['bae_scorepad_score_1', this.cardTip(cards[1], 'II')],
      ['bae_scorepad_tokens', _('VP tokens')],
      ['bae_scorepad_total', _('Total')],
    ];
    for (const [id, text] of tips) this.ctx.addTooltip(id, text);
  }

  private cardTip(id: number | undefined, mark: string): string {
    const title = id != null && id >= 0 ? this.ctx.scoringTitle(id) : '';
    if (title) return title;
    return `${_('Scoring card')} ${mark}`;
  }

  private cardIds(sheet: EndScoreSheet): number[] {
    const ids = sheet.scoring_cards.map(num);
    const widest = sheet.players.reduce((n, row) => Math.max(n, row.scoring.length), 0);
    while (ids.length < Math.max(2, widest)) ids.push(-1);
    return ids.slice(0, Math.max(2, widest));
  }

  private markup(sheet: EndScoreSheet): string {
    const players = sheet.players;
    const cards = this.cardIds(sheet);
    const names = players.map((row) => {
      const name = this.ctx.escapeHtml(this.ctx.playerName(row.player_id));
      const color = this.ctx.escapeHtml(this.ctx.playerColor(row.player_id));
      return `<th scope="col" class="bae_scorepad_name" style="color:${color}" title="${name}">${name}</th>`;
    }).join('');
    const scoreRows = [
      this.row('bae_scorepad_species', iconPaw(), _('Species sets'), players.map((row) => row.species), 'species'),
      this.row('bae_scorepad_track', iconFlag(), _('Exploration track'), players.map((row) => row.track), 'track'),
      this.row('bae_scorepad_animals', iconCard(), _('Animal cards'), players.map((row) => row.animals), 'animals'),
      ...cards.map((id, index) => this.row(
        `bae_scorepad_score_${index}`,
        iconFeather(index === 0 ? 'I' : 'II'),
        this.cardTip(id, index === 0 ? 'I' : 'II'),
        players.map((row) => row.scoring[index] ?? 0),
        `score_${index}`,
      )),
      this.row('bae_scorepad_tokens', iconToken(), _('VP tokens'), players.map((row) => row.tokens), 'tokens'),
    ].join('');
    const total = this.row('bae_scorepad_total', `<span class="bae_scorepad_sigma" aria-hidden="true">&Sigma;</span>`, _('Total'), players.map((row) => row.total), 'total', true);
    return `<div class="bae_scorepad_slot" role="region" aria-label="${this.ctx.escapeHtml(_('Final scoring'))}">
      <button type="button" class="bae_scorepad_close" aria-label="${this.ctx.escapeHtml(_('Close'))}">&times;</button>
      <div class="bae_scorepad">
        <table class="bae_scorepad_table">
          <thead><tr><th scope="col">${iconPerson()}<span class="bae_scorepad_sr">${this.ctx.escapeHtml(_('Player'))}</span></th>${names}</tr></thead>
          <tbody>${scoreRows}${total}</tbody>
        </table>
      </div>
    </div>
    <button type="button" class="bae_scorepad_reopen bae_scorepad_hidden">${this.ctx.escapeHtml(_('Scoring pad'))}</button>`;
  }

  private row(id: string, icon: string, label: string, values: number[], step: string, total = false): string {
    const cells = values.map((value) => `<td data-step="${step}" data-value="${value}"></td>`).join('');
    const cls = total ? ' class="bae_scorepad_total"' : '';
    return `<tr${cls}><th scope="row" id="${id}">${icon}<span class="bae_scorepad_sr">${this.ctx.escapeHtml(label)}</span></th>${cells}</tr>`;
  }
}
