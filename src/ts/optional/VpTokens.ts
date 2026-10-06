/** OPTIONAL: VP token mix, shelf layout, and flights into the player VP zone. */

import {
  coordsInParent,
  flyCloneFading,
  flyCloneFadingIn,
  motionLayer,
  placeClone,
  scoringLayer,
  startTrailToRect,
  bindPreviewFollow,
  visualRect,
  wait,
} from './Motion';

interface VpTokensHost {
  root: HTMLElement;
  gamedatas: BorealisArcticExpeditionsGamedatas;
  bga: { images: { getImgUrl(filename?: string): string } };
}

export type VpValue = 1 | 3 | 5;

const TOKEN_REF_W: Record<VpValue, number> = { 1: 233, 3: 257, 5: 292 };
const ZONE_REF_W = 528;
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

export function playerVp(vps: BoardState['vps'] | undefined, pid: number): number {
  const raw = (vps as Record<string, { score?: number } | number> | undefined)?.[pid]
    ?? (vps as Record<string, { score?: number } | number> | undefined)?.[String(pid)];
  return Math.max(0, Math.floor(Number((raw as { score?: number })?.score ?? raw ?? 0)));
}

/** Fewest tokens, preferring 5s then 3s then 1s (6 → 5+1, not 3+3). */
export function optimalTokens(vp: number): VpValue[] {
  const out: VpValue[] = [];
  let rem = Math.max(0, Math.floor(vp));
  while (rem >= 5) { out.push(5); rem -= 5; }
  while (rem >= 3) { out.push(3); rem -= 3; }
  while (rem >= 1) { out.push(1); rem -= 1; }
  return out;
}

export function tokensSum(tokens: number[]): number {
  return tokens.reduce((sum, n) => sum + n, 0);
}

/** Break a 3 or 5 so the mix contains at least one 1VP token. */
export function ensureHasOne(tokens: VpValue[]): VpValue[] {
  if (tokens.includes(1)) return tokens;
  const i3 = tokens.indexOf(3);
  if (i3 >= 0) {
    const next = [...tokens];
    next.splice(i3, 1, 1, 1, 1);
    return next;
  }
  const i5 = tokens.indexOf(5);
  if (i5 >= 0) {
    const next = [...tokens];
    next.splice(i5, 1, 3, 1, 1);
    return next;
  }
  return tokens;
}

export type VpTokenSlot = {
  leftPct: number;
  topPct: number;
  col: number;
  row: number;
  cols: number;
  rows: number;
};

function vpGrid(n: number): { cols: number; rows: number, add_rows: number } {
  const cols = n <= 3 ? 1 : n <= 7 ? 2 : 3;
  const rows = Math.max(4, Math.ceil(n / cols));
  const add_rows = rows - Math.max(1, Math.ceil(n / cols));
  return { cols, rows, add_rows };
}

export function vpTokenLayout(
  n: number,
  playerId: number,
): VpTokenSlot[] {
  if (n <= 0) return [];
  const { cols, rows, add_rows } = vpGrid(n);

  const out: VpTokenSlot[] = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols) + add_rows;
    const jitterX = ((i * 7 + 13 * playerId) % 5) - 2;
    const jitterY = ((i * 11 + 19 * playerId) % 5) - 2;
    const leftPct = clamp(((col + 1) / (cols + 1)) * 100 + jitterX * 0.35, 28, 72);
    const topPct = clamp(((row + 1) / (rows + 1)) * 100 + jitterY * 0.3, 10, 90);
    out.push({ leftPct, topPct, col, row, cols, rows });
  }
  return out;
}

export function vpTokenZIndex(slot: { col: number; row: number; rows: number }): number {
  return slot.col * slot.rows + (slot.rows - 1 - slot.row) + 1;
}

export function vpTokensInnerHtml(pid: number, tokens: VpValue[], baseUrl: string): string {
  const slots = vpTokenLayout(tokens.length, pid);
  return tokens.map((value, i) => {
    const slot = slots[i];
    return `<img class="bae_vp_token bae_vp_token_${value}" data-vp="${value}" data-col="${slot.col}" data-row="${slot.row}" src="${baseUrl}Tokens/${value}VPToken.png" alt="" draggable="false" style="left:${slot.leftPct.toFixed(1)}%;top:${slot.topPct.toFixed(1)}%;z-index:${vpTokenZIndex(slot)}"/>`;
  }).join('');
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function assignMatches(
  oldVals: VpValue[],
  next: VpValue[],
): { keep: Array<{ oldI: number; nextI: number }>; drop: number[]; add: number[] } {
  const used = new Set<number>();
  const keep: Array<{ oldI: number; nextI: number }> = [];
  const drop: number[] = [];
  for (let i = 0; i < oldVals.length; i++) {
    let found = -1;
    for (let j = 0; j < next.length; j++) {
      if (used.has(j) || next[j] !== oldVals[i]) continue;
      found = j;
      break;
    }
    if (found >= 0) {
      used.add(found);
      keep.push({ oldI: i, nextI: found });
    } else {
      drop.push(i);
    }
  }
  const add: number[] = [];
  for (let j = 0; j < next.length; j++) {
    if (!used.has(j)) add.push(j);
  }
  return { keep, drop, add };
}

export class VpTokens {
  private mix = new Map<number, VpValue[]>();

  constructor(private host: VpTokensHost) {}

  tokensFor(pid: number): VpValue[] {
    const vp = playerVp(this.host.gamedatas.boardState.vps, pid);
    const current = this.mix.get(pid);
    if (current && tokensSum(current) === vp) return current;
    const next = optimalTokens(vp);
    this.mix.set(pid, next);
    return next;
  }

  zone(pid: number): HTMLElement | null {
    return this.host.root?.querySelector(`#bae_vp_tokens_${pid}`) as HTMLElement | null;
  }

  shelf(pid: number): HTMLElement | null {
    return this.host.root?.querySelector(`#bae_vp_tokens_${pid} .bae_vp_token_shelf`) as HTMLElement | null;
  }

  async addIncoming(
    pid: number,
    incoming: VpValue[],
    sources: Array<DOMRect | null>,
    ms: number,
    convertAfter: boolean,
  ): Promise<void> {
    if (incoming.length === 0) return;
    const current = this.liveMix(pid);
    const next = [...current, ...incoming];
    const slots = vpTokenLayout(next.length, pid);
    const oldEls = this.tokenEls(pid);
    const dests = incoming.map((value, i) => this.slotRect(pid, slots[current.length + i], value));
    const spawned: Array<{ clone: HTMLElement; from: DOMRect; to: DOMRect; slot: VpTokenSlot }> = [];
    incoming.forEach((value, i) => {
      const from = sources[i] ?? sources.find((r) => r) ?? null;
      const to = dests[i];
      const slot = slots[current.length + i];
      if (!from || !to || !slot) return;
      spawned.push({ clone: this.spawnFlyingToken(value, from, to), from, to, slot });
    });
    spawned.forEach((it) => { it.clone.classList.add('bae_vp_flight'); });
    await Promise.all([
      this.applyLayout(oldEls, slots.slice(0, oldEls.length), ms),
      ...spawned.map((it) => flyCloneFadingIn(it.clone, it.to, ms, this.host.root, true).then(() => { it.clone.remove(); })),
    ]);
    incoming.forEach((value, i) => this.mountToken(pid, value, slots[current.length + i]));
    this.mix.set(pid, next);
    if (convertAfter) {
      if (ms > 0) await wait(250);
      await this.convertTo(pid, optimalTokens(tokensSum(next)), ms);
    }
  }

  async spendOneTo(pid: number, dest: DOMRect | null, ms: number): Promise<void> {
    let mix = this.liveMix(pid);
    if (!mix.includes(1)) {
      await this.convertTo(pid, ensureHasOne(mix), ms);
      mix = this.liveMix(pid);
    }
    const els = this.tokenEls(pid);
    const idx = els.findIndex((el) => Number(el.dataset.vp) === 1);
    if (idx < 0 || !dest) {
      this.mix.set(pid, mix.slice(0, Math.max(0, mix.length - 1)));
      return;
    }
    const one = els[idx];
    const remainEls = els.filter((_, i) => i !== idx);
    const remaining = mix.filter((_, i) => i !== idx);
    const slots = vpTokenLayout(remaining.length, pid);
    const clone = placeClone(one, 'bae_resolve_clone bae_vp_token', this.host.root);
    one.remove();
    await Promise.all([
      flyCloneFading(clone, dest, ms, this.host.root, false),
      this.applyLayout(remainEls, slots, ms),
    ]);
    clone.remove();
    this.mix.set(pid, remaining);
  }

  async convertToOptimal(pid: number, ms: number): Promise<void> {
    if (ms > 0) await wait(250);
    await this.convertTo(pid, optimalTokens(tokensSum(this.liveMix(pid))), ms);
  }

  previewOnesFrom(pid: number, sources: HTMLElement[], ms: number): void {
    this.previewTokensFrom(pid, sources, 1, ms);
  }

  previewTokensFrom(pid: number, sources: HTMLElement[], value: VpValue, ms: number): void {
    if (sources.length === 0 || ms <= 0) return;
    const current = this.tokensFor(pid);
    const next = [...current, ...sources.map(() => value)];
    const slots = vpTokenLayout(next.length, pid);
    const destSlots = slots.slice(current.length);
    const layer = motionLayer(this.host.root);
    sources.forEach((src, i) => {
      const destSlot = destSlots[i];
      if (!destSlot) return;
      const size = this.tokenPixelSize(pid, value);
      const srcR = visualRect(src);
      const from = new DOMRect(
        srcR.left + srcR.width / 2 - size.w / 2,
        srcR.top + srcR.height / 2 - size.h / 2,
        size.w,
        size.h,
      );
      const dummy = this.createTokenEl(value);
      dummy.classList.remove('bae_vp_token_1', 'bae_vp_token_3', 'bae_vp_token_5');
      dummy.style.position = 'absolute';
      dummy.style.transform = 'none';
      dummy.style.margin = '0';
      dummy.style.pointerEvents = 'none';
      const loc = coordsInParent(layer, from);
      dummy.style.left = `${loc.left}px`;
      dummy.style.top = `${loc.top}px`;
      dummy.style.width = `${size.w}px`;
      dummy.style.height = `${size.h}px`;
      layer.appendChild(dummy);
      const destFn = (): DOMRect | null => this.slotRect(pid, destSlot, value);
      const dest = destFn() ?? from;
      const clone = startTrailToRect(dummy, dest, ms, this.host.root, 'bae_vp_mover', destFn);
      bindPreviewFollow(clone, src);
      dummy.remove();
    });
  }

  private liveMix(pid: number): VpValue[] {
    const live = this.tokenEls(pid)
      .map((el) => Number(el.dataset.vp))
      .filter((n): n is VpValue => n === 1 || n === 3 || n === 5);
    if (live.length > 0) return live;
    return this.mix.get(pid) ?? this.tokensFor(pid);
  }

  private tokenEls(pid: number): HTMLElement[] {
    return Array.from(this.shelf(pid)?.querySelectorAll('.bae_vp_token') ?? []) as HTMLElement[];
  }

  private createTokenEl(value: VpValue): HTMLImageElement {
    const img = document.createElement('img');
    img.className = `bae_vp_token bae_vp_token_${value}`;
    img.dataset.vp = String(value);
    img.src = `${this.host.bga.images.getImgUrl()}Tokens/${value}VPToken.png`;
    img.alt = '';
    img.draggable = false;
    return img;
  }

  private mountToken(pid: number, value: VpValue, slot: VpTokenSlot): void {
    const shelf = this.shelf(pid);
    if (!shelf) return;
    const el = this.createTokenEl(value);
    this.writeSlot(el, slot);
    shelf.appendChild(el);
    this.restack(pid);
  }

  private restack(pid: number, count?: number): void {
    const n = count ?? this.tokenEls(pid).length;
    const { rows } = vpGrid(n);
    this.tokenEls(pid).forEach((el) => {
      if (el.style.opacity === '0') return;
      const col = Number(el.dataset.col ?? 0);
      const row = Number(el.dataset.row ?? 0);
      el.style.zIndex = String(vpTokenZIndex({ col, row, rows }));
    });
  }

  private writeSlot(el: HTMLElement, slot: VpTokenSlot): void {
    el.style.left = `${slot.leftPct}%`;
    el.style.top = `${slot.topPct}%`;
    el.dataset.col = String(slot.col);
    el.dataset.row = String(slot.row);
  }

  private slotRect(
    pid: number,
    slot: VpTokenSlot,
    value: VpValue,
  ): DOMRect | null {
    const shelf = this.shelf(pid);
    if (!shelf) return null;
    const probe = this.createTokenEl(value);
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.left = `${slot.leftPct}%`;
    probe.style.top = `${slot.topPct}%`;
    shelf.appendChild(probe);
    const rect = visualRect(probe);
    probe.remove();
    if (rect.width < 1 || rect.height < 1) {
      const box = shelf.getBoundingClientRect();
      const size = this.tokenPixelSize(pid, value);
      const cx = box.left + box.width * slot.leftPct / 100;
      const cy = box.top + box.height * slot.topPct / 100;
      return new DOMRect(cx - size.w / 2, cy - size.h / 2, size.w, size.h);
    }
    return rect;
  }

  private tokenPixelSize(pid: number, value: VpValue): { w: number; h: number } {
    const box = this.shelf(pid)?.getBoundingClientRect();
    const w = (box?.width || ZONE_REF_W) * (TOKEN_REF_W[value] / ZONE_REF_W);
    return { w, h: w };
  }

  private applyLayout(
    els: HTMLElement[],
    slots: VpTokenSlot[],
    ms: number,
  ): Promise<void> {
    els.forEach((el) => { el.style.transition = 'none'; });
    if (els[0]) void els[0].offsetWidth;
    els.forEach((el, i) => {
      const slot = slots[i];
      if (!slot) return;
      el.style.transition = ms > 0
        ? `left ${ms}ms ${EASE}, top ${ms}ms ${EASE}`
        : 'none';
      this.writeSlot(el, slot);
    });
    const pid = Number(els[0]?.closest('[data-player-id]')?.getAttribute('data-player-id') ?? 0);
    if (pid) this.restack(pid);
    return wait(ms);
  }

  private async convertTo(pid: number, next: VpValue[], ms: number): Promise<void> {
    const shelf = this.shelf(pid);
    if (!shelf) {
      this.mix.set(pid, next);
      return;
    }
    const oldEls = this.tokenEls(pid);
    const oldVals = oldEls
      .map((el) => Number(el.dataset.vp))
      .filter((n): n is VpValue => n === 1 || n === 3 || n === 5);
    if (sameMix(oldVals, next)) {
      this.mix.set(pid, next);
      return;
    }
    const slots = vpTokenLayout(next.length, pid);
    const { keep, drop, add } = assignMatches(oldVals, next);
    const fade = Math.max(120, Math.round(ms * 0.7));
    keep.forEach(({ oldI, nextI }) => {
      const el = oldEls[oldI];
      const slot = slots[nextI];
      if (!el || !slot) return;
      el.style.transition = 'none';
    });
    if (oldEls[0]) void oldEls[0].offsetWidth;
    keep.forEach(({ oldI, nextI }) => {
      const el = oldEls[oldI];
      const slot = slots[nextI];
      if (!el || !slot) return;
      el.style.transition = ms > 0
        ? `left ${ms}ms ${EASE}, top ${ms}ms ${EASE}`
        : 'none';
      this.writeSlot(el, slot);
    });
    drop.forEach((oldI) => {
      const el = oldEls[oldI];
      if (!el) return;
      el.style.transition = `opacity ${fade}ms ease`;
      el.style.opacity = '0';
    });
    const added: HTMLElement[] = [];
    add.forEach((nextI) => {
      const slot = slots[nextI];
      const value = next[nextI];
      if (!slot || !value) return;
      const el = this.createTokenEl(value);
      this.writeSlot(el, slot);
      el.style.opacity = '0';
      el.style.transition = `opacity ${fade}ms ease`;
      shelf.appendChild(el);
      added.push(el);
    });
    void shelf.offsetWidth;
    added.forEach((el) => { el.style.opacity = '1'; });
    this.restack(pid, next.length);
    await wait(Math.max(ms, fade));
    drop.forEach((oldI) => oldEls[oldI]?.remove());
    this.restack(pid);
    this.mix.set(pid, next);
  }

  private spawnFlyingToken(value: VpValue, from: DOMRect, to: DOMRect): HTMLElement {
    const w = to.width > 1 ? to.width : this.tokenPixelSize(0, value).w;
    const h = to.height > 1 ? to.height : w;
    const start = new DOMRect(
      from.left + from.width / 2 - w / 2,
      from.top + from.height / 2 - h / 2,
      w,
      h,
    );
    const img = this.createTokenEl(value);
    img.classList.add('bae_motion_clone', 'bae_resolve_clone', 'bae_vp_flight');
    img.style.position = 'absolute';
    img.style.transform = 'none';
    img.style.margin = '0';
    img.style.pointerEvents = 'none';
    img.style.zIndex = '1';
    img.style.opacity = '0';
    const layer = scoringLayer(this.host.root);
    const loc = coordsInParent(layer, start);
    img.style.left = `${loc.left}px`;
    img.style.top = `${loc.top}px`;
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    layer.appendChild(img);
    return img;
  }
}

function sameMix(a: VpValue[], b: VpValue[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => y - x);
  const right = [...b].sort((x, y) => y - x);
  return left.every((n, i) => n === right[i]);
}

export function scoringStepAmount(args: Record<string, unknown>): number {
  if (args.amount != null && args.amount !== '') return Number(args.amount);
  return Number(args.amount_left ?? 0) + Number(args.amount_mid ?? 0) + Number(args.amount_right ?? 0);
}

export function scoringStepKind(args: Record<string, unknown>): string {
  const direct = String(args.scoring_kind ?? args.kind ?? '');
  if (direct) return direct;
  const anchor = String(args.anchor_id ?? '');
  if (anchor.includes('animal_loc_vp')) return 'species_sets';
  if (anchor.includes('bae_track_')) return 'exploration_track';
  if (anchor.includes('bae_pile_')) return 'animal_card';
  if (anchor.includes('bae_score_')) return 'scoring_card';
  if (args.scoring_id != null || args.scoring_name != null || args.scoring_index != null) return 'scoring_card';
  if (args.card_id != null || args.slot != null) return 'animal_card';
  if (args.flag_space != null) return 'exploration_track';
  return '';
}

