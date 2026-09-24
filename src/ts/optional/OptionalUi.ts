import {
  AnimalDefLite,
  canObserveAtLocation,
  flagWouldAdvance,
  previewObserveMoves,
} from './Legality';
import {
  animMs,
  clearMotionLayer,
  flyClone,
  placeClone,
  startDiscardGhost,
  startScientistTrail,
  startScientistTrailToRect,
  wait,
} from './Motion';
import {
  animalBonusVp,
  flagTrackVp,
  locationSetVp,
  objectiveProgress,
  scoreScoringCard,
  speciesCounts,
} from './Progress';

/** OPTIONAL preference ids (gamepreferences.jsonc). */
export const PREF_ANIM_SPEED = 100;
export const PREF_PREVIEWS = 101;
export const PREF_CONFIRM = 102;
export const PREF_SOUND = 103;

export interface OptionalUiHost {
  bga: Bga<BorealisArticExpeditionsPlayer, BorealisArticExpeditionsGamedatas>;
  gamedatas: BorealisArticExpeditionsGamedatas;
  root: HTMLElement;
  selectedCardId: number | null;
  selectedLocation: number | null;
  campSelected: boolean;
  selectedRegroupIds: Set<number>;
  selectedPoolSlot: number | null;
  isGameplayLike(): boolean;
  isReplenishLike(): boolean;
  isAssignCampLike(): boolean;
  isOpeningMulliganLike(): boolean;
  isPromptClaimObjectiveLike(): boolean;
  clearSelection(): void;
  enterRegroupMode(): void;
  currentStateName(): string;
  animalDef(cardId: number): AnimalDefLite | undefined;
  animalCardHtml(cardId: number): string;
  onUpdateActionButtons(stateName: string, args: Record<string, unknown> | null): void;
  cachedActionArgs: Record<string, unknown> | null;
  renderAll(): void;
}

/**
 * OPTIONAL: Client-only UX (subtle previews, resolution motion, invalid-action hints, DnD, sound, stats).
 * Never mutates server state. Server remains source of truth.
 */
export class OptionalUi {
  private dragCardId: number | null = null;
  private cleanupFns: Array<() => void> = [];
  private audioCtx: AudioContext | null = null;
  private prefBound = false;
  private resolving = false;
  private holdingPid: number | null = null;
  private discardGhosts = new Map<number, HTMLElement>();

  constructor(private host: OptionalUiHost) {}

  afterRender(): void {
    this.teardown();
    if (!this.host.root) return;
    this.applyPreferenceCss();
    this.renderRoundBadge();
    this.bindDragAndDrop();
    this.renderRegroupHold();
    this.updateActionPreviews();
    this.bindPreferenceListener();
  }

  teardown(): void {
    for (const fn of this.cleanupFns) {
      try { fn(); } catch (_) { /* ignore */ }
    }
    this.cleanupFns = [];
    this.clearPreviews();
  }

  onSelectionChanged(): void {
    if (this.host.campSelected || this.host.isOpeningMulliganLike()) {
      const myId = Number(this.host.bga.players.getCurrentPlayerId());
      if (this.host.selectedRegroupIds.size === 0) this.clearDiscardGhosts();
      else this.syncDiscardGhosts(myId);
      return;
    }
    this.updateActionPreviews();
  }

  isObserveSelectionLegal(): boolean {
    const cardId = this.host.selectedCardId;
    const location = this.host.selectedLocation;
    if (cardId == null || location == null || this.host.campSelected) return false;
    const myId = Number(this.host.bga.players.getCurrentPlayerId());
    return canObserveAtLocation(
      this.host.animalDef(cardId),
      this.host.gamedatas.boardState.scientists,
      myId,
      location,
    );
  }

  /** Call when the client can tell Observe would be illegal. */
  showInvalidObserveHint(): void {
    this.renderInvalidBubble(_('This location does not have the scientists required.'));
  }

  playSound(kind: 'select' | 'success' | 'claim'): void {
    if (this.host.bga.userPreferences?.get(PREF_SOUND) === 0) return;
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (kind === 'select') {
        osc.frequency.value = 420;
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (kind === 'success') {
        osc.frequency.value = 660;
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.2);
      } else {
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.28);
      }
    } catch (_) {
      // AudioContext blocked — silent.
    }
  }

  animSpeedClass(): string {
    const v = this.host.bga.userPreferences?.get(PREF_ANIM_SPEED) ?? 2;
    return ['bae_anim_off', 'bae_anim_slow', 'bae_anim_normal', 'bae_anim_fast'][v] ?? 'bae_anim_normal';
  }

  previewsEnabled(): boolean {
    return (this.host.bga.userPreferences?.get(PREF_PREVIEWS) ?? 1) === 1
      && (this.host.bga.userPreferences?.get(PREF_ANIM_SPEED) ?? 2) !== 0;
  }

  shouldSkipSafeConfirm(): boolean {
    return (this.host.bga.userPreferences?.get(PREF_CONFIRM) ?? 1) === 0;
  }

  clearHolding(): void {
    this.holdingPid = null;
  }

  private duration(): number {
    return animMs(this.host.bga.userPreferences?.get(PREF_ANIM_SPEED) ?? 2);
  }

  private previewLoopMs(): number {
    return Math.max(1000, Math.round(this.duration() * 4));
  }

  private prepareResolution(): void {
    this.clearPreviews();
    this.host.selectedCardId = null;
    this.host.selectedLocation = null;
    this.host.selectedPoolSlot = null;
    this.host.campSelected = false;
    this.host.selectedRegroupIds.clear();
    this.host.root.querySelectorAll('.bae_card_selected, .bae_card_regroup').forEach((el) => {
      el.classList.remove('bae_card_selected', 'bae_card_regroup');
    });
    this.host.root.querySelectorAll('.bae_loc_selected').forEach((el) => el.classList.remove('bae_loc_selected'));
    this.host.root.querySelectorAll('.bae_confirm_blurb').forEach((el) => el.remove());
  }

  private endResolution(): void {
    this.resolving = false;
  }

  async playObserveResolution(prev: BoardState, args: Record<string, unknown>): Promise<void> {
    const ms = this.duration();
    if (ms === 0 || this.resolving) return;
    this.resolving = true;
    this.prepareResolution();
    try {
      const pid = Number(args.player_id ?? args.playerId ?? 0);
      const cardId = Number(args.card_id ?? NaN);
      const loc = Number(args.location ?? NaN);
      if (!Number.isFinite(pid) || !Number.isFinite(cardId) || loc < 0 || loc > 2) return;
      const root = this.host.root;

      const cardEl = this.cardEl(pid, cardId);
      const pileRect = this.nextPileRect(pid, loc);
      const slots = this.handSlotRects(pid);
      const remaining = this.handCards(pid).filter((el) => el !== cardEl);
      if (cardEl && pileRect) {
        const clone = placeClone(cardEl, 'bae_resolve_clone bae_resolve_card', root);
        cardEl.style.visibility = 'hidden';
        await Promise.all([
          flyClone(clone, pileRect, ms, root, true),
          this.compactHandToSlots(remaining, slots, ms),
        ]);
      } else {
        await this.compactHandToSlots(remaining, slots, ms);
      }

      const def = this.host.animalDef(cardId);
      const nextState = args.boardState as BoardState | undefined;
      if (def) {
        await this.animateScientists(
          pid,
          nextState?.scientists ?? prev.scientists,
          ms,
        );
      }

      const oldFlag = Number(prev.flags?.[pid]?.[loc] ?? 0);
      const newFlag = Number(nextState?.flags?.[pid]?.[loc] ?? oldFlag);
      const flagEl = this.flagEl(pid, loc, oldFlag);
      if (flagEl) {
        if (newFlag > oldFlag) {
          const dest = this.trackEl(pid, loc, newFlag);
          const clone = placeClone(flagEl, 'bae_resolve_clone', root);
          flagEl.style.visibility = 'hidden';
          if (dest) await flyClone(clone, dest.getBoundingClientRect(), Math.round(ms * 0.9), root);
        } else {
          placeClone(flagEl, 'bae_resolve_clone bae_stuck_once', root);
          await wait(Math.round(ms * 0.85));
        }
      }
    } finally {
      this.endResolution();
    }
  }

  async playRegroupResolution(prev: BoardState, args: Record<string, unknown>): Promise<void> {
    const ms = this.duration();
    const pid = Number(args.player_id ?? args.playerId ?? 0);
    const campMeeples = this.campMeeples(pid);
    if (campMeeples.length > 0) this.holdingPid = pid;
    if (ms === 0 || this.resolving) return;
    this.resolving = true;
    this.prepareResolution();
    try {
      const discarded = (args.discarded as number[] | undefined) ?? [];
      await this.animateHandReplace(pid, discarded, prev, args.boardState as BoardState | undefined, ms);

      const linger = this.ensureRegroupHold(pid);
      const lingerRect = linger?.getBoundingClientRect() ?? this.lingerRect(pid);
      if (lingerRect) {
        await Promise.all(campMeeples.map((el) => {
          const clone = placeClone(el, 'bae_resolve_clone', this.host.root);
          el.style.visibility = 'hidden';
          return flyClone(clone, lingerRect, ms, this.host.root);
        }));
      }
    } finally {
      this.endResolution();
    }
  }

  async playAssignResolution(_prev: BoardState, args: Record<string, unknown>): Promise<void> {
    const ms = this.duration();
    const pid = Number(args.player_id ?? args.playerId ?? 0);
    const loc = Number(args.location ?? NaN);
    if (ms === 0 || this.resolving) {
      this.holdingPid = null;
      return;
    }
    this.resolving = true;
    this.prepareResolution();
    try {
      if (loc < 0 || loc > 2) return;
      if (!this.shelfEl(pid, loc)) return;
      const nextSci = (args.boardState as BoardState | undefined)?.scientists ?? _prev.scientists;
      await this.animateScientists(pid, nextSci, ms);
    } finally {
      this.holdingPid = null;
      this.endResolution();
    }
  }

  async playTakeResolution(_prev: BoardState, args: Record<string, unknown>): Promise<void> {
    const ms = this.duration();
    if (ms === 0 || this.resolving) return;
    this.resolving = true;
    this.prepareResolution();
    try {
      const pid = Number(args.player_id ?? args.playerId ?? 0);
      const fromDeck = Boolean(args.from_deck);
      const slot = Number(args.pool_slot ?? args.slot ?? NaN);
      const src = (!fromDeck && Number.isFinite(slot) && slot >= 0)
        ? this.host.root.querySelector(`#bae_pool_slot_${slot}`) as HTMLElement | null
        : this.deckEl();
      const destRect = this.handSlotRects(pid)[this.handCards(pid).length]
        ?? this.handDestEl(pid)?.getBoundingClientRect()
        ?? null;
      const deck = this.deckEl();
      if (!src || !destRect || !pid) return;
      const root = this.host.root;
      const hole = src.getBoundingClientRect();
      const faceId = fromDeck
        ? this.drawnHandCardIds(pid, [], _prev, args.boardState as BoardState | undefined)[0]
        : undefined;
      const clone = this.cloneForHandDraw(src, faceId);
      if (!fromDeck) src.style.visibility = 'hidden';
      await flyClone(clone, destRect, ms, root, true);
      if (fromDeck) return;
      await wait(Math.round(ms * 0.2));
      if (deck) {
        const nextPool = (args.boardState as BoardState | undefined)?.pool;
        const refillId = nextPool?.find((p) => Number(p.slot) === slot)?.id;
        const refill = this.cloneForHandDraw(deck, refillId);
        await flyClone(refill, hole, ms, root, true);
      }
    } finally {
      this.endResolution();
    }
  }

  async playMulliganPoolResolution(_prev: BoardState, args: Record<string, unknown>): Promise<void> {
    const ms = this.duration();
    if (ms === 0 || this.resolving) return;
    this.resolving = true;
    this.prepareResolution();
    try {
      const root = this.host.root;
      const deck = this.deckEl();
      const cards = this.poolCards();
      const dests = cards.map((el) => ({
        rect: el.getBoundingClientRect(),
        slot: Number((el as HTMLElement).dataset.poolSlot),
      }));
      if (!deck) return;
      await Promise.all(cards.map((el) => {
        const clone = placeClone(el, 'bae_resolve_clone bae_resolve_card', root);
        el.style.visibility = 'hidden';
        return flyClone(clone, deck.getBoundingClientRect(), ms, root, true);
      }));
      await wait(Math.round(ms * 0.15));
      const nextPool = (args.boardState as BoardState | undefined)?.pool ?? [];
      for (const dest of dests) {
        const id = nextPool.find((p) => Number(p.slot) === dest.slot)?.id;
        const refill = this.cloneForHandDraw(deck, id);
        await flyClone(refill, dest.rect, ms, root, true);
      }
    } finally {
      this.endResolution();
    }
  }

  async playMulliganHandResolution(prev: BoardState, args: Record<string, unknown>): Promise<void> {
    const ms = this.duration();
    if (ms === 0 || this.resolving) return;
    this.resolving = true;
    this.prepareResolution();
    try {
      const pid = Number(args.player_id ?? args.playerId ?? 0);
      const discarded = (args.discarded as number[] | undefined) ?? [];
      await this.animateHandReplace(pid, discarded, prev, args.boardState as BoardState | undefined, ms);
    } finally {
      this.endResolution();
    }
  }

  showEndGameStats(): void {
    const existing = document.getElementById('bae_stats_panel');
    if (existing) existing.remove();
    const d = this.host.gamedatas.boardState;
    const materials = this.host.gamedatas.materials;
    const names = this.host.gamedatas.players;
    const locNames = materials.location_names ?? [_('Left'), _('Middle'), _('Right')];
    const speciesNames = materials.species_names ?? [];
    const blocks: string[] = [];
    blocks.push(`<p class="bae_stats_meta">${_('Rounds played')}: ${d.round ?? '?'}</p>`);
    for (const pidStr of Object.keys(names)) {
      const pid = Number(pidStr);
      const claimed = (d.objectives ?? []).filter((o) => o.players[pid] === 'claimed').length;
      const flags = d.flags?.[pid] ?? [0, 0, 0];
      const deepest = Math.max(0, Number(flags[0] ?? 0), Number(flags[1] ?? 0), Number(flags[2] ?? 0));
      const movement = [0, 1, 2].reduce((sum, loc) => sum + Number(flags[loc] ?? 0), 0);
      const piles = d.boards?.[pid] ?? [[], [], []];
      const setVp = [0, 1, 2].reduce((sum, loc) => sum + locationSetVp(piles[loc] ?? [], materials), 0);
      const scoringVp = (d.scoring_cards ?? []).reduce(
        (sum, sid) => sum + scoreScoringCard(sid, pid, d, materials),
        0,
      );
      const animals = [0, 1, 2].map((loc) => `${locNames[loc] ?? loc} ${piles[loc]?.length ?? 0}`).join(' · ');
      const bySpecies = speciesCounts(piles, materials)
        .map((n, i) => n > 0 ? `${speciesNames[i] ?? i} ${n}` : '')
        .filter(Boolean)
        .join(', ');
      const rawVp = (d.vps as Record<string, { score?: number } | number> | undefined)?.[pid]
        ?? (d.vps as Record<string, { score?: number } | number> | undefined)?.[pidStr];
      const score = Number((rawVp as { score?: number })?.score ?? rawVp ?? names[pid]?.score ?? 0);
      blocks.push(
        `<section class="bae_stats_player">`
        + `<h4>${this.escape(names[pid]?.name ?? String(pid))}</h4>`
        + `<ul>`
        + `<li>${_('Score')}: ${score}</li>`
        + `<li>${_('Species sets')}: ${setVp} ${_('VP')}</li>`
        + `<li>${_('Exploration flags')}: ${flagTrackVp(pid, d, materials)} ${_('VP')}</li>`
        + `<li>${_('Animal cards')}: ${animalBonusVp(pid, d, materials)} ${_('VP')}</li>`
        + `<li>${_('Objectives')}: ${claimed * 5} ${_('VP')} (${claimed})</li>`
        + `<li>${_('Scoring cards')}: ${scoringVp} ${_('VP')}</li>`
        + `<li>${_('Deepest flag')}: ${deepest}</li>`
        + `<li>${_('Flag movement')}: ${movement}</li>`
        + `<li>${_('Animals')}: ${animals}</li>`
        + (bySpecies ? `<li>${_('Species')}: ${bySpecies}</li>` : '')
        + `</ul></section>`,
      );
    }
    const panel = document.createElement('div');
    panel.id = 'bae_stats_panel';
    panel.className = 'bae_stats_panel';
    panel.innerHTML = `<h3>${_('Game statistics')}</h3>${blocks.join('')}`
      + `<button type="button" class="bae_stats_close">${_('Close')}</button>`;
    panel.querySelector('.bae_stats_close')?.addEventListener('click', () => panel.remove());
    this.host.root.appendChild(panel);
  }

  private escape(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private applyPreferenceCss(): void {
    const root = this.host.root;
    root.classList.remove('bae_anim_off', 'bae_anim_slow', 'bae_anim_normal', 'bae_anim_fast', 'bae_previews_off', 'bae_previews_on', 'bae_sound_off', 'bae_sound_on');
    root.classList.add(this.animSpeedClass());
    root.classList.add(this.previewsEnabled() ? 'bae_previews_on' : 'bae_previews_off');
    root.classList.add((this.host.bga.userPreferences?.get(PREF_SOUND) ?? 1) === 1 ? 'bae_sound_on' : 'bae_sound_off');
  }

  private bindPreferenceListener(): void {
    if (this.prefBound) return;
    this.prefBound = true;
    const prev = this.host.bga.userPreferences.onChange;
    this.host.bga.userPreferences.onChange = (prefId: number, value: number) => {
      prev?.(prefId, value);
      this.applyPreferenceCss();
      this.updateActionPreviews();
    };
  }

  private renderRoundBadge(): void {
    const round = this.host.gamedatas.boardState.round ?? 1;
    let badge = this.host.root.querySelector('.bae_round_badge') as HTMLElement | null;
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'bae_round_badge';
      badge.setAttribute('aria-live', 'polite');
      this.host.root.appendChild(badge);
    }
    const final = (this.host.gamedatas.boardState.playersEndingGame?.length ?? 0) > 0;
    badge.textContent = final
      ? `${_('Round')} ${round} — ${_('Final round')}`
      : `${_('Round')} ${round}`;
  }

  private clearPreviews(): void {
    this.clearDiscardGhosts();
    this.clearTransientPreviews();
    clearMotionLayer(this.host.root);
    document.querySelectorAll('.bae_motion_clone, .bae_invalid_bubble').forEach((el) => el.remove());
  }

  private clearTransientPreviews(): void {
    if (!this.host.root) return;
    this.host.root.querySelectorAll('.bae_motion_clone:not(.bae_discard_ghost), .bae_invalid_bubble').forEach((el) => el.remove());
    document.querySelectorAll('body > .bae_motion_clone:not(.bae_discard_ghost), body > .bae_invalid_bubble').forEach((el) => el.remove());
    this.host.root.querySelectorAll('.bae_preview_fade_left').forEach((el) => el.classList.remove('bae_preview_fade_left'));
    this.host.root.querySelectorAll('.bae_card_place_preview').forEach((el) => el.remove());
  }

  private clearDiscardGhosts(): void {
    this.discardGhosts.forEach((el) => el.remove());
    this.discardGhosts.clear();
    this.host.root?.querySelectorAll('.bae_discard_ghost').forEach((el) => el.remove());
  }

  private updateActionPreviews(): void {
    this.clearTransientPreviews();
    if (this.resolving) return;

    const myId = Number(this.host.bga.players.getCurrentPlayerId());
    const active = this.host.bga.players.isCurrentPlayerActive();

    if (
      active
      && this.host.isGameplayLike()
      && this.host.selectedCardId != null
      && this.host.selectedLocation != null
      && !this.host.campSelected
      && !this.isObserveSelectionLegal()
    ) {
      this.showInvalidObserveHint();
    }

    const selectingDiscards = this.host.campSelected || this.host.isOpeningMulliganLike();
    if (!selectingDiscards || this.host.selectedRegroupIds.size === 0) {
      this.clearDiscardGhosts();
    }

    if (!this.previewsEnabled() || !active) {
      if (selectingDiscards) this.syncDiscardGhosts(myId);
      return;
    }

    if (
      this.host.isGameplayLike()
      && this.host.selectedCardId != null
      && this.host.selectedLocation != null
      && !this.host.campSelected
      && this.isObserveSelectionLegal()
    ) {
      this.previewCardPlacement(myId, this.host.selectedCardId, this.host.selectedLocation);
      this.previewObserve(myId, this.host.selectedCardId, this.host.selectedLocation);
    }

    if (this.host.isAssignCampLike() && this.host.selectedLocation != null) {
      this.previewAssign(myId, this.host.selectedLocation);
    }

    if (this.host.campSelected) {
      this.previewRegroupPickup(myId);
    }

    if (selectingDiscards) this.syncDiscardGhosts(myId);
  }

  private syncDiscardGhosts(pid: number): void {
    if (!this.previewsEnabled()) return;
    const wanted = this.host.selectedRegroupIds;
    this.discardGhosts.forEach((el, cardId) => {
      if (!el.isConnected || !wanted.has(cardId)) {
        el.remove();
        this.discardGhosts.delete(cardId);
      }
    });
    if (wanted.size === 0) return;
    wanted.forEach((cardId) => {
      if (this.discardGhosts.has(cardId)) return;
      const el = this.cardEl(pid, cardId);
      if (el) this.discardGhosts.set(cardId, startDiscardGhost(el, this.host.root, cardId));
    });
  }

  private previewObserve(pid: number, cardId: number, loc: number): void {
    const def = this.host.animalDef(cardId);
    if (!def) return;
    const ms = this.previewLoopMs();
    const used = new Set<HTMLElement>();
    for (const m of previewObserveMoves(this.host.gamedatas.boardState.scientists, pid, loc, def)) {
      const src = this.meepleAt(pid, m.from, m.color, used);
      const dest = this.shelfEl(pid, m.to);
      if (src && dest) startScientistTrail(src, dest, ms, this.host.root);
    }
    const flagDepth = Number(this.host.gamedatas.boardState.flags?.[pid]?.[loc] ?? 0);
    const boardId = this.host.gamedatas.boardState.board_for_players?.[pid] ?? 0;
    const board = this.host.gamedatas.materials.player_boards?.[boardId];
    const locKey = (['left_location', 'mid_location', 'right_location'] as const)[loc];
    const vehicles = board?.[locKey] ?? [];
    const flag = this.flagEl(pid, loc, flagDepth);
    if (!flag) return;
    if (flagWouldAdvance(def, vehicles, flagDepth)) {
      const dest = this.trackEl(pid, loc, Math.min(7, flagDepth + 1));
      if (dest) startScientistTrail(flag, dest, ms, this.host.root);
    } else {
      const r = flag.getBoundingClientRect();
      startScientistTrailToRect(flag, new DOMRect(r.left, r.top - 7, r.width, r.height), ms, this.host.root);
    }
  }

  private previewAssign(pid: number, loc: number): void {
    const dest = this.shelfEl(pid, loc);
    if (!dest) return;
    const ms = this.previewLoopMs();
    const sources = this.holdMeeples(pid);
    const from = sources.length > 0 ? sources : this.campMeeples(pid);
    for (const src of from) {
      startScientistTrail(src, dest, ms, this.host.root);
    }
  }

  private previewRegroupPickup(pid: number): void {
    const hold = this.ensureRegroupHold(pid);
    const dest = hold?.getBoundingClientRect() ?? this.lingerRect(pid);
    if (!dest) return;
    const ms = this.previewLoopMs();
    for (const src of this.campMeeples(pid)) {
      startScientistTrailToRect(src, dest, ms, this.host.root);
    }
  }

  private previewCardPlacement(pid: number, cardId: number, loc: number): void {
    const zone = this.host.root.querySelector(
      `.bae_location_zone[data-player-id="${pid}"][data-loc="${loc}"]`,
    ) as HTMLElement | null;
    const pile = zone?.querySelector('.bae_anim_pile');
    if (!zone || !pile) return;
    const slot = document.createElement('div');
    slot.className = 'bae_pile_slot bae_card_place_preview';
    slot.setAttribute('aria-hidden', 'true');
    slot.innerHTML = this.host.animalCardHtml(cardId);
    slot.querySelector('.bae_card_img')?.classList.add('bae_pile_card_img');
    pile.appendChild(slot);
  }

  private renderInvalidBubble(text: string): void {
    this.host.root.querySelectorAll('.bae_invalid_bubble').forEach((el) => el.remove());
    document.querySelectorAll('body > .bae_invalid_bubble').forEach((el) => el.remove());
    const myId = Number(this.host.bga.players.getCurrentPlayerId());
    const loc = this.host.selectedLocation;
    const board = this.host.root.querySelector(`#bae_playerboard_${myId}`) as HTMLElement | null;
    const anchor = loc != null
      ? this.host.root.querySelector(`.bae_location_zone[data-player-id="${myId}"][data-loc="${loc}"]`) as HTMLElement | null
      : board;
    if (!anchor) return;
    const bubble = document.createElement('div');
    bubble.className = 'bae_invalid_bubble';
    bubble.setAttribute('role', 'status');
    bubble.textContent = text;
    anchor.appendChild(bubble);
  }

  private bindDragAndDrop(): void {
    if (this.host.bga.players.isCurrentPlayerSpectator()) return;
    const myId = Number(this.host.bga.players.getCurrentPlayerId());

    this.host.root.querySelectorAll('.bae_handcard[data-hand-card]').forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.setAttribute('draggable', 'true');
      const onDragStart = (ev: DragEvent) => {
        this.dragCardId = Number(htmlEl.dataset.handCard);
        ev.dataTransfer?.setData('text/bae-card', String(this.dragCardId));
        htmlEl.classList.add('bae_dragging');
        this.playSound('select');
      };
      const onDragEnd = () => {
        htmlEl.classList.remove('bae_dragging');
        this.dragCardId = null;
        this.host.root.querySelectorAll('.bae_drop_target').forEach((t) => t.classList.remove('bae_drop_target'));
      };
      htmlEl.addEventListener('dragstart', onDragStart);
      htmlEl.addEventListener('dragend', onDragEnd);
      this.cleanupFns.push(() => {
        htmlEl.removeEventListener('dragstart', onDragStart);
        htmlEl.removeEventListener('dragend', onDragEnd);
      });
    });

    this.host.root.querySelectorAll(`.bae_location_zone[data-player-id="${myId}"]`).forEach((el) => {
      const htmlEl = el as HTMLElement;
      const onDragOver = (ev: DragEvent) => {
        if (this.dragCardId == null || !this.host.isGameplayLike()) return;
        ev.preventDefault();
        htmlEl.classList.add('bae_drop_target');
      };
      const onDragLeave = () => htmlEl.classList.remove('bae_drop_target');
      const onDrop = (ev: DragEvent) => {
        ev.preventDefault();
        htmlEl.classList.remove('bae_drop_target');
        const cardId = Number(ev.dataTransfer?.getData('text/bae-card') || this.dragCardId);
        const loc = Number(htmlEl.dataset.loc);
        if (!this.host.isGameplayLike() || !this.host.bga.players.isCurrentPlayerActive()) return;
        this.host.campSelected = false;
        this.host.selectedRegroupIds.clear();
        this.host.selectedCardId = cardId;
        this.host.selectedLocation = loc;
        this.host.selectedPoolSlot = null;
        this.host.renderAll();
        this.host.onUpdateActionButtons(this.host.currentStateName(), this.host.cachedActionArgs);
        this.onSelectionChanged();
      };
      htmlEl.addEventListener('dragover', onDragOver);
      htmlEl.addEventListener('dragleave', onDragLeave);
      htmlEl.addEventListener('drop', onDrop);
      this.cleanupFns.push(() => {
        htmlEl.removeEventListener('dragover', onDragOver);
        htmlEl.removeEventListener('dragleave', onDragLeave);
        htmlEl.removeEventListener('drop', onDrop);
      });
    });

    this.host.root.querySelectorAll(`.bae_camp_zone[data-player-id="${myId}"]`).forEach((el) => {
      const htmlEl = el as HTMLElement;
      const onDragOver = (ev: DragEvent) => {
        if (this.dragCardId == null || !this.host.isGameplayLike()) return;
        ev.preventDefault();
        htmlEl.classList.add('bae_drop_target');
      };
      const onDrop = (ev: DragEvent) => {
        ev.preventDefault();
        htmlEl.classList.remove('bae_drop_target');
        const cardId = Number(ev.dataTransfer?.getData('text/bae-card') || this.dragCardId);
        if (!this.host.isGameplayLike() || !this.host.bga.players.isCurrentPlayerActive()) return;
        this.host.enterRegroupMode();
        this.host.selectedRegroupIds.add(cardId);
        this.host.onUpdateActionButtons(this.host.currentStateName(), this.host.cachedActionArgs);
        this.onSelectionChanged();
      };
      htmlEl.addEventListener('dragover', onDragOver);
      htmlEl.addEventListener('drop', onDrop);
      this.cleanupFns.push(() => {
        htmlEl.removeEventListener('dragover', onDragOver);
        htmlEl.removeEventListener('drop', onDrop);
      });
    });

    const handCol = this.host.root.querySelector(`.bae_player_handcol[data-player-id="${myId}"]`);
    if (handCol) {
      const onDragOver = (ev: DragEvent) => {
        if (!this.host.isReplenishLike()) return;
        ev.preventDefault();
      };
      const onDrop = (ev: DragEvent) => {
        if (!this.host.isReplenishLike() || !this.host.bga.players.isCurrentPlayerActive()) return;
        ev.preventDefault();
        const slotRaw = ev.dataTransfer?.getData('text/bae-pool');
        if (slotRaw === '' || slotRaw == null) return;
        void this.host.bga.actions.performAction('actTakeAnimal', { pool_slot: Number(slotRaw) });
      };
      handCol.addEventListener('dragover', onDragOver);
      handCol.addEventListener('drop', onDrop);
      this.cleanupFns.push(() => {
        handCol.removeEventListener('dragover', onDragOver);
        handCol.removeEventListener('drop', onDrop);
      });
    }

    this.host.root.querySelectorAll('[data-pool-slot]').forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.setAttribute('draggable', 'true');
      const onDragStart = (ev: DragEvent) => {
        if (!this.host.isReplenishLike()) {
          ev.preventDefault();
          return;
        }
        ev.dataTransfer?.setData('text/bae-pool', String(htmlEl.dataset.poolSlot));
      };
      htmlEl.addEventListener('dragstart', onDragStart);
      this.cleanupFns.push(() => htmlEl.removeEventListener('dragstart', onDragStart));
    });
  }

  private async animateHandReplace(
    pid: number,
    discarded: number[],
    prev: BoardState,
    next: BoardState | undefined,
    ms: number,
  ): Promise<void> {
    const root = this.host.root;
    const deck = this.deckEl();
    const slots = this.handSlotRects(pid);
    if (slots.length === 0) return;
    const leaving = this.leavingHandCards(pid, discarded);
    const remaining = this.handCards(pid).filter((el) => !leaving.includes(el));
    leaving.forEach((el) => { el.style.visibility = 'hidden'; });
    if (deck && leaving.length > 0) {
      await Promise.all(leaving.map((el) => {
        const clone = placeClone(el, 'bae_resolve_clone bae_resolve_card', root);
        return flyClone(clone, deck.getBoundingClientRect(), ms, root, true);
      }));
    }
    await this.compactHandToSlots(remaining, slots, ms);

    const drawCount = this.handDrawCount(pid, discarded, prev, next);
    if (!deck || drawCount <= 0) return;
    const dests = this.handFillRects(slots, remaining.length, drawCount);
    const faces = this.drawnHandCardIds(pid, discarded, prev, next);
    for (let i = 0; i < dests.length; i++) {
      const refill = this.cloneForHandDraw(deck, faces[i]);
      await flyClone(refill, dests[i], ms, root, true);
    }
  }

  /** Facedown hands always drop the first N cards; own hand uses the discarded ids. */
  private leavingHandCards(pid: number, discarded: number[]): HTMLElement[] {
    const cards = this.handCards(pid);
    if (discarded.length <= 0 || cards.length === 0) return [];
    const byId: HTMLElement[] = [];
    for (const cardId of discarded) {
      const el = this.host.root.querySelector(`#bae_hand_${pid}_${cardId}`) as HTMLElement | null;
      if (!el || byId.includes(el)) {
        return cards.slice(0, Math.min(discarded.length, cards.length));
      }
      byId.push(el);
    }
    return byId;
  }

  /** Slide leftover cards into the top slots without shrinking the 4-slot column. */
  private async compactHandToSlots(
    remaining: HTMLElement[],
    slots: DOMRect[],
    ms: number,
  ): Promise<void> {
    if (remaining.length === 0 || slots.length === 0) return;
    const moved = remaining.some((el, i) => {
      const dest = slots[i];
      if (!dest) return false;
      const r = el.getBoundingClientRect();
      return Math.abs(r.top - dest.top) > 1 || Math.abs(r.left - dest.left) > 1;
    });
    if (!moved) return;
    const root = this.host.root;
    await Promise.all(remaining.map((el, i) => {
      const dest = slots[i];
      if (!dest) return Promise.resolve();
      const clone = placeClone(el, 'bae_resolve_clone bae_resolve_card', root);
      el.style.visibility = 'hidden';
      return flyClone(clone, dest, ms, root, true);
    }));
  }

  private handSlotRects(pid: number): DOMRect[] {
    const col = this.handCol(pid);
    if (!col) return [];
    return Array.from(col.children)
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('bae_card'))
      .map((el) => el.getBoundingClientRect());
  }

  private handFillRects(slots: DOMRect[], startIndex: number, count: number): DOMRect[] {
    if (count <= 0) return [];
    const needed = startIndex + count;
    const filled = slots.length >= needed ? slots : this.extendSlotRects(slots, needed);
    return filled.slice(startIndex, startIndex + count);
  }

  private extendSlotRects(slots: DOMRect[], count: number): DOMRect[] {
    if (slots.length === 0 || slots.length >= count) return slots;
    const out = [...slots];
    const sample = slots[0];
    const gap = slots.length >= 2 ? slots[1].top - slots[0].bottom : 8;
    while (out.length < count) {
      const last = out[out.length - 1];
      out.push(new DOMRect(last.left, last.bottom + gap, sample.width, sample.height));
    }
    return out;
  }

  private handDrawCount(
    pid: number,
    discarded: number[],
    prev: BoardState,
    next: BoardState | undefined,
  ): number {
    if (discarded.length > 0) return discarded.length;
    const prevHand = prev.hands?.[pid];
    const nextHand = next?.hands?.[pid];
    const prevN = typeof prevHand === 'number' ? prevHand : Array.isArray(prevHand) ? prevHand.length : 0;
    const nextN = typeof nextHand === 'number' ? nextHand : Array.isArray(nextHand) ? nextHand.length : 0;
    return Math.max(0, nextN - (prevN - discarded.length));
  }

  private drawnHandCardIds(
    pid: number,
    discarded: number[],
    prev: BoardState,
    next: BoardState | undefined,
  ): number[] {
    const nextHand = next?.hands?.[pid];
    if (!Array.isArray(nextHand)) return [];
    const prevHand = prev.hands?.[pid];
    const prevIds = Array.isArray(prevHand) ? prevHand.map((c) => Number(c.id)) : [];
    const discardedSet = new Set(discarded.map(Number));
    const keepCount = prevIds.filter((id) => !discardedSet.has(id)).length;
    return nextHand.slice(keepCount).map((c) => Number(c.id));
  }

  private cloneForHandDraw(source: HTMLElement, cardId?: number): HTMLElement {
    const clone = placeClone(source, 'bae_resolve_clone bae_resolve_card', this.host.root);
    clone.querySelectorAll('.bae_deck_overlay, .bae_confirm_blurb').forEach((node) => node.remove());
    if (cardId != null && Number.isFinite(cardId)) {
      clone.innerHTML = this.host.animalCardHtml(cardId);
    }
    return clone;
  }

  private renderRegroupHold(): void {
    const pid = this.holdingPid;
    if (pid == null && !this.host.campSelected) {
      this.host.root.querySelectorAll('.bae_regroup_hold').forEach((el) => el.remove());
      return;
    }
    const targetPid = pid ?? Number(this.host.bga.players.getCurrentPlayerId());
    const hold = this.ensureRegroupHold(targetPid);
    if (!hold) return;
    hold.replaceChildren();
    if (this.holdingPid == null) return;
    const left = this.shelfEl(targetPid, 3);
    const right = this.shelfEl(targetPid, 4);
    hold.innerHTML = `<div class="bae_sci_shelf">${left?.innerHTML ?? ''}${right?.innerHTML ?? ''}</div>`;
    this.campMeeples(targetPid).forEach((el) => { el.style.visibility = 'hidden'; });
  }

  private ensureRegroupHold(pid: number): HTMLElement | null {
    const canvas = this.host.root.querySelector(`#bae_playerboard_${pid} .bae_board_canvas`) as HTMLElement | null;
    if (!canvas) return null;
    let hold = canvas.querySelector('.bae_regroup_hold') as HTMLElement | null;
    if (!hold) {
      hold = document.createElement('div');
      hold.className = 'bae_regroup_hold';
      hold.setAttribute('aria-hidden', 'true');
      canvas.appendChild(hold);
    }
    return hold;
  }

  private lingerRect(pid: number): DOMRect | null {
    const camp = this.host.root.querySelector(`#bae_camp_${pid}_left`) as HTMLElement | null;
    if (!camp) return null;
    const r = camp.getBoundingClientRect();
    return new DOMRect(r.left, r.top - r.height * 1.2, r.width, r.height);
  }

  private holdMeeples(pid: number): HTMLElement[] {
    const hold = this.host.root.querySelector(`#bae_playerboard_${pid} .bae_regroup_hold`);
    return Array.from(hold?.querySelectorAll('.bae_meeple_img') ?? []) as HTMLElement[];
  }

  private deckEl(): HTMLElement | null {
    return this.host.root.querySelector('#bae_pool_slot_deck');
  }

  private poolCards(): HTMLElement[] {
    return Array.from(this.host.root.querySelectorAll('.bae_pool_slot:not(.bae_pool_deck)')) as HTMLElement[];
  }

  private handCol(pid: number): HTMLElement | null {
    return this.host.root.querySelector(`.bae_player_handcol[data-player-id="${pid}"]`);
  }

  private handCards(pid: number): HTMLElement[] {
    const col = this.handCol(pid);
    if (!col) return [];
    return Array.from(col.querySelectorAll('.bae_handcard, .bae_handcard_hidden')) as HTMLElement[];
  }

  private nextPileRect(pid: number, loc: number): DOMRect | null {
    const zone = this.host.root.querySelector(
      `.bae_location_zone[data-player-id="${pid}"][data-loc="${loc}"]`,
    ) as HTMLElement | null;
    if (!zone) return null;
    const zr = zone.getBoundingClientRect();
    if (zr.width < 1 || zr.height < 1) return null;
    const pile = zone.querySelector('.bae_anim_pile');
    const index = pile ? pile.querySelectorAll('.bae_pile_slot').length : 0;
    const cardW = zr.width * (528 / 800);
    const cardH = zr.height * (745 / 2494);
    const shift = zr.height * (170 / 2494);
    const left = zr.left + zr.width / 2 - cardW / 2;
    const top = zr.top - index * shift - cardH;
    return new DOMRect(left, top, cardW, cardH);
  }

  private handDestEl(pid: number): HTMLElement | null {
    const col = this.host.root.querySelector(`.bae_player_handcol[data-player-id="${pid}"]`) as HTMLElement | null;
    if (!col) return null;
    const placeholder = col.querySelector('.bae_card_placeholder') as HTMLElement | null;
    if (placeholder) return placeholder;
    const cards = col.querySelectorAll('.bae_handcard, .bae_handcard_hidden, .bae_card:not(.bae_card_placeholder)');
    return (cards[cards.length - 1] as HTMLElement | undefined) ?? col;
  }

  private async animateScientists(
    pid: number,
    next: Record<number, Record<number, number[]>>,
    ms: number,
  ): Promise<void> {
    const root = this.host.root;
    const hold = this.holdMeeples(pid);
    const used = new Set<HTMLElement>();
    const flights: Promise<void>[] = [];
    const assigned: { el: HTMLElement; dest: DOMRect }[] = [];

    const currentAt = (loc: number): HTMLElement[] => {
      if (hold.length > 0 && (loc === 3 || loc === 4)) {
        return loc === 3 ? hold : [];
      }
      const shelf = this.shelfEl(pid, loc);
      return Array.from(shelf?.querySelectorAll('.bae_meeple_img') ?? []) as HTMLElement[];
    };

    const takeColor = (els: HTMLElement[], color: number): HTMLElement | null => {
      const el = els.find((node) => !used.has(node) && Number(node.dataset.scientist) === color) ?? null;
      if (el) used.add(el);
      return el;
    };

    const slotsByLoc = [0, 1, 2, 3, 4].map((loc) => ({
      loc,
      shelf: this.shelfEl(pid, loc),
      slots: this.scientistLayout(pid, next, loc),
    }));
    const filled: Array<Array<HTMLElement | null>> = slotsByLoc.map((row) => row.slots.map(() => null));

    for (const row of slotsByLoc) {
      const staying = currentAt(row.loc);
      row.slots.forEach((slot, i) => {
        const el = takeColor(staying, slot.color);
        if (el) filled[row.loc][i] = el;
      });
    }

    for (const row of slotsByLoc) {
      row.slots.forEach((slot, i) => {
        if (filled[row.loc][i]) return;
        let el: HTMLElement | null = null;
        for (let from = 0; from <= 4 && !el; from++) {
          el = takeColor(currentAt(from), slot.color);
        }
        if (el) filled[row.loc][i] = el;
      });
    }

    for (const row of slotsByLoc) {
      if (!row.shelf) continue;
      row.slots.forEach((slot, i) => {
        const el = filled[row.loc][i];
        if (!el) return;
        assigned.push({ el, dest: this.meepleSlotRect(row.shelf!, slot, el) });
      });
    }

    for (const { el, dest } of assigned) {
      const clone = placeClone(el, 'bae_resolve_clone', root);
      el.style.visibility = 'hidden';
      flights.push(flyClone(clone, dest, ms, root, true));
    }

    for (let loc = 0; loc <= 4; loc++) {
      for (const el of currentAt(loc)) {
        if (used.has(el)) continue;
        el.style.visibility = 'hidden';
        placeClone(el, 'bae_resolve_clone', root);
      }
    }

    if (flights.length > 0) await Promise.all(flights);
  }

  private scientistLayout(
    playerId: number,
    sci: Record<number, Record<number, number[]>> | undefined,
    location: number,
  ): { color: number; leftPct: number; topPct: number }[] {
    const poses = sci?.[playerId];
    if (!poses) return [];
    const meeples: number[] = [];
    for (let col = 0; col < 3; col++) {
      const n = (poses[col] ?? []).filter((p) => p === location).length;
      for (let i = 0; i < n; i++) meeples.push(col);
    }
    const n = meeples.length;
    if (n === 0) return [];
    const [cols, rows] = (() => {
      switch (n) {
        case 1: return [1, 1] as const;
        case 2: return [2, 1] as const;
        case 3: return location < 3 ? [3, 1] as const : [2, 2] as const;
        case 4: return [2, 2] as const;
        case 5: return location < 3 ? [3, 2] as const : [2, 3] as const;
        case 6: return location < 3 ? [3, 2] as const : [2, 3] as const;
        case 7: return location < 3 ? [3, 3] as const : [2, 4] as const;
        case 8: return location < 3 ? [3, 3] as const : [2, 4] as const;
        case 9: return [3, 3] as const;
        default: return location < 3
          ? [4, Math.ceil(n / 4)] as const
          : [3, Math.ceil(n / 3)] as const;
      }
    })();
    return meeples.map((col, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const jitterX = ((i * 7 + col * 3 + 13 * location + 11 * playerId) % 5) - 2;
      const jitterY = ((i * 11 + col * 5 + 17 * location + 19 * playerId) % 5) - 2;
      return {
        color: col,
        leftPct: (c + 1) / (cols + 1) * 100 + jitterX,
        topPct: (r + 1) / (rows + 1) * 100 + jitterY,
      };
    });
  }

  private meepleSlotRect(
    shelf: HTMLElement,
    slot: { leftPct: number; topPct: number },
    sample: HTMLElement,
  ): DOMRect {
    const shelfR = shelf.getBoundingClientRect();
    const size = sample.getBoundingClientRect();
    const cx = shelfR.left + shelfR.width * slot.leftPct / 100;
    const cy = shelfR.top + shelfR.height * slot.topPct / 100;
    return new DOMRect(cx - size.width / 2, cy - size.height / 2, size.width, size.height);
  }

  private cardEl(pid: number, cardId: number): HTMLElement | null {
    return this.host.root.querySelector(`#bae_hand_${pid}_${cardId}`) as HTMLElement | null
      ?? this.host.root.querySelector(`.bae_player_handcol[data-player-id="${pid}"] .bae_handcard, .bae_player_handcol[data-player-id="${pid}"] .bae_handcard_hidden`) as HTMLElement | null;
  }

  private shelfEl(pid: number, pos: number): HTMLElement | null {
    if (pos <= 2) return this.host.root.querySelector(`#bae_sci_shelf_loc_${pid}_${pos}`);
    if (pos === 3) return this.host.root.querySelector(`#bae_sci_shelf_camp_${pid}_left`);
    return this.host.root.querySelector(`#bae_sci_shelf_camp_${pid}_right`);
  }

  private meepleAt(pid: number, loc: number, color: number, used: Set<HTMLElement>): HTMLElement | null {
    const shelf = this.shelfEl(pid, loc);
    if (!shelf) return null;
    const nodes = Array.from(shelf.querySelectorAll(`.bae_meeple_img[data-scientist="${color}"]`)) as HTMLElement[];
    const el = nodes.find((n) => !used.has(n)) ?? null;
    if (el) used.add(el);
    return el;
  }

  private campMeeples(pid: number): HTMLElement[] {
    const left = this.shelfEl(pid, 3);
    const right = this.shelfEl(pid, 4);
    return [
      ...Array.from(left?.querySelectorAll('.bae_meeple_img') ?? []),
      ...Array.from(right?.querySelectorAll('.bae_meeple_img') ?? []),
    ] as HTMLElement[];
  }

  private trackEl(pid: number, loc: number, space: number): HTMLElement | null {
    return this.host.root.querySelector(`#bae_track_${pid}_${loc}_${space}`);
  }

  private flagEl(pid: number, loc: number, space: number): HTMLElement | null {
    return this.trackEl(pid, loc, space)?.querySelector('.bae_track_flag_only') as HTMLElement | null;
  }
}

export function objectiveProgressLines(
  obj: ObjectiveClient,
  state: BoardState,
  materials: MaterialsClient,
  players: BorealisArticExpeditionsGamedatas['players'],
): string[] {
  return Object.keys(players).map((pidStr) => {
    const pid = Number(pidStr);
    const { count, required } = objectiveProgress(obj.id, pid, state, materials);
    const name = players[pid]?.name ?? `${_('Player')} ${pid}`;
    return `${name}: ${count}/${required}`;
  });
}

export function scoringVpLines(
  scoringId: number,
  state: BoardState,
  materials: MaterialsClient,
  players: BorealisArticExpeditionsGamedatas['players'],
): string[] {
  return Object.keys(players).map((pidStr) => {
    const pid = Number(pidStr);
    const vp = scoreScoringCard(scoringId, pid, state, materials);
    const name = players[pid]?.name ?? `${_('Player')} ${pid}`;
    return `${name}: ${vp}`;
  });
}
