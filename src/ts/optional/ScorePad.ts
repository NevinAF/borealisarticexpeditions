/** End-game scoring pad. Overlay only: it is not part of the table flow. */

export interface ScorePadContext {
  getRoot(): HTMLElement;
  escapeHtml(value: string): string;
  playerName(pid: number): string;
  playerColor(pid: number): string;
  scoringTitle(scoringId: number): string;
  addTooltip(id: string, text: string): void;
}

export type ScoreIcon = 'person' | 'paw' | 'flag' | 'card' | 'score1' | 'score2' | 'tokens' | 'total';

const SCORE_ICON: Record<ScoreIcon, string> = {
  person: `<svg class="bae_scorepad_svg" viewBox="0 0 74.000000 93.000000" aria-hidden="true"><g transform="translate(0.000000,93.000000) scale(0.100000,-0.100000)" fill="#7a4a2c" stroke="none"> <path d="M335 920 c-55 -8 -98 -33 -134 -77 -62 -75 -68 -169 -18 -253 44 -74 103 -105 202 -105 63 0 75 3 118 33 53 37 82 85 92 155 10 67 0 108 -41 161 -54 71 -127 99 -219 86z"/> <path d="M144 431 c-46 -28 -103 -100 -115 -145 -19 -68 -28 -175 -17 -212 18 -67 29 -69 348 -71 243 -2 290 0 322 13 51 23 62 55 54 159 -9 120 -36 183 -97 229 -27 20 -56 39 -63 42 -8 3 -38 -7 -67 -23 -47 -24 -65 -28 -139 -28 -74 0 -93 4 -139 28 -29 15 -54 27 -54 27 -1 0 -16 -8 -33 -19z"/> </g></svg>`,
  paw: `<svg class="bae_scorepad_svg" viewBox="0 0 81.000000 117.000000" aria-hidden="true"><g transform="translate(0.000000,117.000000) scale(0.100000,-0.100000)" fill="#7a4a2c" stroke="none"> <path d="M420 1167 c0 -2 7 -27 15 -55 16 -52 32 -63 63 -44 25 16 -15 79 -60 95 -10 4 -18 5 -18 4z"/> <path d="M282 1144 c-48 -33 -65 -114 -24 -114 31 0 39 14 44 73 3 31 4 57 4 57 -1 0 -12 -7 -24 -16z"/> <path d="M468 1004 c-20 -6 -23 -16 -38 -115 -10 -69 -9 -81 10 -132 25 -67 50 -87 107 -87 97 0 140 129 81 245 -14 28 -35 58 -46 68 -21 19 -82 30 -114 21z"/> <path d="M218 981 c-29 -23 -84 -125 -93 -173 -8 -40 18 -114 46 -128 10 -6 36 -10 59 -10 34 0 47 6 72 32 41 44 48 66 44 140 -6 138 -58 194 -128 139z"/> <path d="M740 816 c0 -13 -3 -37 -6 -53 -4 -23 -2 -32 11 -37 25 -9 45 12 45 48 -1 33 -20 66 -39 66 -6 0 -11 -11 -11 -24z"/> <path d="M28 769 c-31 -44 -36 -79 -12 -79 18 0 46 63 42 95 -3 21 -5 19 -30 -16z"/> <path d="M667 653 c-13 -21 -34 -57 -47 -80 -13 -24 -27 -43 -32 -43 -4 0 -8 -27 -8 -60 0 -56 2 -60 30 -75 80 -41 168 2 189 93 6 26 10 75 9 110 -1 73 -18 92 -80 92 -33 0 -41 -5 -61 -37z"/> <path d="M51 657 c-16 -20 -41 -96 -41 -126 0 -71 68 -192 124 -219 34 -17 82 -3 118 36 23 24 25 32 18 72 -26 143 -101 250 -174 250 -19 0 -39 -6 -45 -13z"/> <path d="M392 420 c-14 -6 -32 -31 -47 -62 -13 -30 -45 -74 -73 -101 -38 -36 -51 -56 -54 -85 -9 -65 17 -108 87 -145 33 -18 58 -22 146 -22 98 0 110 2 164 30 65 33 105 86 105 138 0 34 -53 102 -111 143 -22 15 -47 40 -54 55 -25 48 -43 59 -93 58 -26 0 -57 -4 -70 -9z"/> </g></svg>`,
  flag: `<svg class="bae_scorepad_svg" viewBox="0 0 125.000000 113.000000" aria-hidden="true"><g transform="translate(0.000000,113.000000) scale(0.100000,-0.100000)" fill="#7a4a2c" stroke="none"> <path d="M291 768 c-56 -200 -104 -369 -106 -375 -3 -8 -22 -13 -48 -13 l-44 0 -48 -174 c-26 -96 -45 -182 -42 -190 6 -14 59 -16 486 -16 333 0 482 3 487 11 3 6 -13 53 -36 105 l-43 94 -51 15 c-28 8 -139 33 -246 56 -107 23 -199 45 -204 50 -10 9 31 166 47 176 6 3 49 6 96 5 72 0 106 -7 200 -37 96 -32 122 -37 172 -32 79 7 148 33 206 77 54 40 121 132 125 170 3 24 1 25 -43 22 -59 -4 -163 15 -208 38 -20 10 -70 54 -111 97 -80 84 -131 115 -235 144 l-60 16 3 36 c3 35 1 36 -40 47 -24 6 -65 18 -92 26 -27 8 -53 14 -57 14 -3 0 -52 -163 -108 -362z m196 277 c18 -5 21 -10 14 -23 -4 -9 -11 -37 -15 -61 -4 -24 -10 -49 -13 -54 -3 -6 -7 -24 -9 -40 -1 -16 -6 -39 -12 -51 -6 -11 -20 -64 -32 -116 -12 -52 -30 -126 -40 -165 -10 -38 -26 -99 -36 -135 -19 -72 -25 -120 -16 -120 4 0 39 -7 77 -15 39 -9 112 -24 163 -35 98 -21 136 -35 127 -50 -10 -16 13 -20 26 -4 9 11 23 14 53 9 77 -12 85 -19 116 -100 l10 -25 -274 0 -274 0 -12 36 -12 37 -21 -37 -21 -36 -108 0 c-118 0 -116 -1 -97 60 5 19 12 46 15 59 3 14 8 29 12 35 4 6 7 13 8 16 9 52 18 81 25 86 5 3 24 1 43 -5 l35 -9 19 66 c10 37 29 105 41 152 13 47 26 94 31 105 8 20 92 316 112 393 8 31 16 41 27 38 9 -2 26 -7 38 -11z m80 -94 c12 -6 31 -11 42 -11 11 0 46 -10 78 -21 47 -18 74 -39 145 -111 48 -48 98 -93 110 -98 13 -6 30 -14 38 -19 31 -18 92 -33 136 -33 37 0 44 -3 40 -15 -9 -24 -49 -69 -71 -80 -109 -58 -109 -58 -195 -58 -66 0 -97 5 -136 22 -74 32 -134 43 -235 44 -80 0 -89 2 -85 17 9 28 48 185 52 212 5 24 12 52 36 144 5 22 13 35 16 29 4 -5 17 -15 29 -22z"/> </g></svg>`,
  card: `<svg class="bae_scorepad_svg" viewBox="0 0 115.000000 106.000000" aria-hidden="true"><g transform="translate(0.000000,106.000000) scale(0.100000,-0.100000)" fill="#7a4a2c" stroke="none"> <path d="M0 1025 c0 -33 2 -35 35 -35 33 0 35 2 35 35 0 33 -2 35 -35 35 -33 0 -35 -2 -35 -35z"/> <path d="M1070 1025 c0 -34 1 -35 40 -35 39 0 40 1 40 35 0 34 -1 35 -40 35 -39 0 -40 -1 -40 -35z"/> <path d="M0 850 l0 -70 35 0 35 0 0 70 0 70 -35 0 -35 0 0 -70z"/> <path d="M1070 850 l0 -70 40 0 40 0 0 70 0 70 -40 0 -40 0 0 -70z"/> <path d="M566 662 c-3 -24 -11 -65 -17 -93 l-11 -50 -46 27 -45 27 20 -29 c52 -74 54 -70 -57 -90 -55 -10 -94 -21 -87 -25 7 -3 47 -12 90 -19 43 -7 80 -17 83 -22 3 -4 -4 -21 -15 -37 -30 -41 -26 -46 15 -21 19 12 37 20 39 18 3 -3 13 -47 23 -99 l18 -94 18 95 c10 52 22 99 26 104 5 4 25 -4 46 -18 46 -31 53 -27 25 12 -12 17 -21 34 -21 39 0 6 33 16 73 23 106 18 110 26 19 40 -45 8 -87 17 -93 21 -8 4 -3 18 15 45 14 21 24 40 22 42 -2 2 -22 -8 -45 -22 -22 -14 -42 -26 -44 -26 -3 0 -10 35 -17 77 -17 110 -25 127 -34 75z"/> <path d="M0 620 l0 -70 35 0 35 0 0 70 0 70 -35 0 -35 0 0 -70z"/> <path d="M1070 620 l0 -70 40 0 40 0 0 70 0 70 -40 0 -40 0 0 -70z"/> <path d="M0 302 c0 -157 2 -172 23 -212 16 -30 37 -51 67 -67 43 -23 43 -23 482 -23 480 0 481 0 531 59 39 47 47 90 47 259 l0 152 -40 0 -40 0 0 -170 c0 -167 -1 -171 -24 -195 -13 -13 -39 -26 -57 -30 -19 -3 -220 -5 -446 -3 l-413 3 -27 28 -28 27 -3 170 -4 170 -34 0 -34 0 0 -168z"/> </g></svg>`,
  score1: `<svg class="bae_scorepad_svg" viewBox="0 0 131.000000 115.000000" aria-hidden="true"><g transform="translate(0.000000,115.000000) scale(0.100000,-0.100000)" fill="#7a4a2c" stroke="none"> <path d="M1243 1122 c-23 -15 -47 -38 -52 -52 -26 -70 -24 -67 -30 -37 l-6 28 -35 -26 c-48 -35 -185 -170 -230 -227 -31 -38 -38 -57 -44 -108 -7 -57 -37 -155 -54 -172 -4 -4 -6 41 -5 100 2 68 -1 98 -6 81 -13 -40 -31 -71 -68 -116 -19 -24 -40 -62 -47 -85 l-13 -43 -14 48 -14 48 -16 -48 c-10 -26 -18 -64 -19 -83 -1 -34 -1 -34 -16 -15 -15 19 -16 18 -10 -20 10 -60 16 -75 29 -75 20 1 183 137 283 238 53 53 132 142 176 197 98 122 105 129 83 85 -75 -148 -242 -332 -494 -545 -57 -48 -120 -106 -139 -128 -36 -44 -97 -156 -88 -164 16 -16 54 11 79 57 16 28 53 76 82 108 52 56 54 57 106 57 41 0 62 -6 88 -24 l33 -24 -7 32 c-6 30 -6 31 27 31 19 0 43 7 54 15 19 15 19 15 -1 13 -79 -5 -80 11 -1 32 93 25 195 111 245 208 11 21 9 21 -29 -7 -41 -29 -101 -53 -170 -66 -45 -9 -40 -5 45 40 154 82 211 133 256 230 24 53 24 75 -1 75 -30 0 -24 16 11 31 34 13 52 47 64 115 6 37 4 42 -17 47 l-22 6 27 29 c26 27 27 33 21 85 -4 32 -10 57 -13 56 -3 0 -25 -12 -48 -27z"/> <path d="M9 893 c-17 -20 -3 -43 30 -49 60 -12 63 -24 65 -231 0 -103 -2 -200 -7 -215 -5 -19 -19 -33 -42 -42 -37 -16 -46 -41 -17 -50 27 -7 216 -2 230 7 21 14 13 36 -16 39 -42 5 -56 58 -46 183 5 55 9 134 9 175 1 108 1 108 45 130 43 22 54 54 22 64 -37 12 -262 3 -273 -11z"/> </g></svg>`,
  score2: `<svg class="bae_scorepad_svg" viewBox="0 0 169.000000 116.000000" aria-hidden="true"><g transform="translate(0.000000,116.000000) scale(0.100000,-0.100000)" fill="#7a4a2c" stroke="none"> <path d="M1630 1128 c-32 -20 -51 -42 -67 -76 -20 -43 -22 -44 -22 -19 -1 16 -5 27 -10 25 -28 -9 -154 -124 -222 -203 -62 -70 -79 -96 -79 -120 0 -41 -26 -137 -48 -182 l-19 -36 4 109 4 109 -20 -47 c-10 -26 -35 -66 -55 -90 -20 -23 -43 -63 -50 -88 l-14 -45 -13 48 -14 48 -16 -48 c-10 -26 -18 -64 -19 -83 -1 -34 -1 -34 -16 -15 -15 19 -16 18 -10 -20 10 -56 16 -75 25 -75 43 0 371 315 489 468 40 52 72 90 72 85 0 -15 -88 -153 -139 -217 -64 -81 -250 -260 -377 -364 -55 -45 -114 -99 -131 -120 -35 -44 -78 -117 -88 -150 -6 -21 -4 -23 16 -20 15 2 35 20 53 48 62 96 112 154 143 167 49 20 96 16 137 -12 l38 -26 -7 29 c-6 28 -4 29 36 35 56 7 76 27 27 27 -50 0 -57 16 -11 25 60 11 145 60 194 112 42 44 79 95 79 107 0 3 -28 -10 -62 -28 -52 -29 -168 -63 -168 -50 0 2 28 18 63 35 146 74 221 138 262 226 31 64 31 79 3 87 -22 6 -21 8 14 26 38 20 44 33 63 127 5 26 3 32 -15 38 l-22 7 25 26 c23 25 24 32 18 88 l-6 60 -45 -28z"/> <path d="M100 830 c-86 -5 -95 -7 -95 -25 0 -14 14 -26 46 -42 l46 -21 6 -84 c10 -127 8 -274 -4 -323 -9 -37 -16 -46 -45 -55 -22 -8 -34 -18 -34 -30 0 -23 33 -27 160 -20 87 5 95 7 95 25 0 13 -6 19 -17 17 -10 -1 -25 9 -35 25 -20 29 -21 68 -10 303 6 146 1 133 72 183 57 40 -7 56 -185 47z"/> <path d="M485 831 c-82 -6 -90 -8 -93 -27 -2 -17 6 -25 36 -37 64 -26 64 -27 66 -239 1 -211 -2 -227 -54 -248 -42 -18 -41 -49 3 -52 17 0 39 0 47 1 8 1 49 1 91 1 62 -1 78 2 83 16 8 20 -1 35 -17 28 -7 -2 -22 5 -33 17 -20 22 -20 27 -15 317 2 123 3 126 72 173 34 24 19 49 -30 49 -22 0 -45 1 -53 3 -7 2 -53 1 -103 -2z"/> </g></svg>`,
  tokens: `<svg class="bae_scorepad_svg" viewBox="0 0 117.000000 115.000000" aria-hidden="true"><g transform="translate(0.000000,115.000000) scale(0.100000,-0.100000)" fill="#7a4a2c" stroke="none"> <path d="M100 1138 c-19 -5 -43 -17 -54 -26 -45 -40 -46 -57 -46 -534 0 -425 2 -456 20 -495 11 -25 33 -51 52 -63 32 -19 49 -20 498 -20 290 0 479 4 502 10 24 7 48 24 64 45 l26 35 -1 482 c-2 530 0 515 -65 554 -29 18 -59 19 -496 20 -268 1 -480 -3 -500 -8z m515 -258 c15 -85 31 -159 35 -163 4 -5 44 14 87 42 44 28 83 51 86 51 4 0 -18 -38 -48 -85 -53 -81 -54 -85 -32 -90 12 -2 84 -17 160 -31 77 -15 133 -30 125 -34 -7 -4 -71 -17 -143 -29 -160 -28 -160 -28 -147 -44 14 -17 82 -137 77 -137 -2 0 -39 22 -83 49 l-80 49 -11 -62 c-6 -33 -18 -90 -26 -126 -8 -36 -19 -87 -23 -115 -10 -58 -8 -66 -49 143 -15 78 -30 142 -33 142 -3 0 -34 -18 -69 -40 -36 -21 -67 -38 -68 -36 -2 2 15 33 38 70 23 37 40 68 38 70 -2 2 -69 16 -149 31 -80 15 -151 31 -158 34 -7 4 61 22 150 40 90 18 165 34 167 36 2 2 -17 37 -42 77 -25 40 -44 74 -42 76 2 3 20 -5 39 -17 20 -11 51 -30 70 -41 l34 -20 26 142 c28 148 36 182 41 176 1 -2 15 -73 30 -158z"/> </g></svg>`,
  total: `<svg class="bae_scorepad_svg" viewBox="0 0 78.000000 84.000000" aria-hidden="true"><g transform="translate(0.000000,84.000000) scale(0.100000,-0.100000)" fill="#7a4a2c" stroke="none"> <path d="M6 833 c-5 -6 5 -36 14 -43 15 -12 207 -231 263 -300 33 -41 74 -88 90 -104 l30 -30 -24 -15 c-12 -9 -62 -49 -109 -89 -47 -40 -104 -86 -127 -101 -55 -37 -143 -116 -143 -130 0 -6 17 -11 38 -11 20 0 187 -2 369 -4 l333 -3 6 36 c3 20 12 68 20 106 23 114 18 134 -29 116 -13 -5 -27 -20 -30 -33 -4 -13 -20 -37 -37 -53 l-31 -30 -207 -3 c-236 -3 -226 -15 -85 93 42 33 106 88 141 123 34 34 67 62 72 62 6 0 10 5 10 11 0 11 -128 166 -234 284 -25 28 -45 52 -46 55 0 3 70 5 155 5 151 0 155 0 179 -25 14 -14 34 -47 44 -75 15 -39 25 -51 44 -53 24 -3 25 0 31 55 3 32 4 69 2 83 -1 14 -3 36 -4 50 l-1 25 -365 1 c-200 1 -367 -1 -369 -3z"/> </g></svg>`,
};

export function scorePadIcon(kind: ScoreIcon): string {
  return SCORE_ICON[kind];
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
    if (token !== this.token || this.dismissed) return;
    await this.holdOpen(3000, token);
  }

  /** Keep the pad up after the last row so players can read it before the results screen. */
  private holdOpen(ms: number, token: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        window.clearInterval(watch);
        resolve();
      };
      const timer = window.setTimeout(finish, ms);
      const watch = window.setInterval(() => {
        if (token !== this.token || this.dismissed) finish();
      }, 80);
    });
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

  private icon(kind: ScoreIcon): string {
    return scorePadIcon(kind);
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
      this.row('bae_scorepad_species', this.icon('paw'), _('Species sets'), players.map((row) => row.species), 'species'),
      this.row('bae_scorepad_track', this.icon('flag'), _('Exploration track'), players.map((row) => row.track), 'track'),
      this.row('bae_scorepad_animals', this.icon('card'), _('Animal cards'), players.map((row) => row.animals), 'animals'),
      ...cards.map((id, index) => this.row(
        `bae_scorepad_score_${index}`,
        this.icon(index === 0 ? 'score1' : 'score2'),
        this.cardTip(id, index === 0 ? 'I' : 'II'),
        players.map((row) => row.scoring[index] ?? 0),
        `score_${index}`,
      )),
      this.row('bae_scorepad_tokens', this.icon('tokens'), _('VP tokens'), players.map((row) => row.tokens), 'tokens'),
    ].join('');
    const total = this.row('bae_scorepad_total', this.icon('total'), _('Total'), players.map((row) => row.total), 'total', true);
    return `<div class="bae_scorepad_slot" role="region" aria-label="${this.ctx.escapeHtml(_('Final scoring'))}">
      <button type="button" class="bae_scorepad_close" aria-label="${this.ctx.escapeHtml(_('Close'))}">&times;</button>
      <div class="bae_scorepad">
        <table class="bae_scorepad_table">
          <thead><tr><th scope="col">${this.icon('person')}<span class="bae_scorepad_sr">${this.ctx.escapeHtml(_('Player'))}</span></th>${names}</tr></thead>
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
