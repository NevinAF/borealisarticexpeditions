import {
  AnimalDefLite,
  canObserveAtLocation,
  flagWouldAdvance,
  previewObserveMoves,
} from './Legality';
import {
  animMs,
  clearMotionLayer,
  flipElements,
  flyClone,
  placeClone,
  startDiscardGhost,
  startTrail,
  startTrailToRect,
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
      const remaining = this.handCards(pid).filter((el) => el !== cardEl);
      if (cardEl && pileRect) {
        const clone = placeClone(cardEl, 'bae_resolve_clone bae_resolve_card', root);
        await Promise.all([
          flyClone(clone, pileRect, ms, root, true),
          flipElements(remaining, () => { cardEl.style.display = 'none'; }, ms),
        ]);
      }

      const def = this.host.animalDef(cardId);
      if (def) {
        const moves = previewObserveMoves(prev.scientists, pid, loc, def);
        const used = new Set<HTMLElement>();
        await Promise.all(moves.map((m) => {
          const src = this.meepleAt(pid, m.from, m.color, used);
          const destShelf = this.shelfEl(pid, m.to);
          if (!src || !destShelf) return Promise.resolve();
          const clone = placeClone(src, 'bae_resolve_clone', root);
          src.style.visibility = 'hidden';
          return flyClone(clone, destShelf.getBoundingClientRect(), ms, root);
        }));
      }

      const nextState = args.boardState as BoardState | undefined;
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
      const dest = this.shelfEl(pid, loc);
      if (!dest) return;
      const destRect = dest.getBoundingClientRect();
      const sources = this.holdMeeples(pid);
      const from = sources.length > 0 ? sources : this.campMeeples(pid);
      await Promise.all(from.map((el) => {
        const clone = placeClone(el, 'bae_resolve_clone', this.host.root);
        el.style.visibility = 'hidden';
        return flyClone(clone, destRect, ms, this.host.root);
      }));
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
      const dest = this.handDestEl(pid);
      const deck = this.deckEl();
      if (!src || !dest || !pid) return;
      const root = this.host.root;
      const hole = src.getBoundingClientRect();
      const clone = placeClone(src, 'bae_resolve_clone bae_resolve_card', root);
      if (!fromDeck) src.style.visibility = 'hidden';
      await flyClone(clone, dest.getBoundingClientRect(), ms, root, true);
      if (fromDeck) return;
      await wait(Math.round(ms * 0.2));
      if (deck) {
        const refill = placeClone(deck, 'bae_resolve_clone bae_resolve_card', root);
        await flyClone(refill, hole, ms, root, true);
      }
    } finally {
      this.endResolution();
    }
  }

  async playMulliganPoolResolution(_prev: BoardState, _args: Record<string, unknown>): Promise<void> {
    const ms = this.duration();
    if (ms === 0 || this.resolving) return;
    this.resolving = true;
    this.prepareResolution();
    try {
      const root = this.host.root;
      const deck = this.deckEl();
      const cards = this.poolCards();
      const dests = cards.map((el) => el.getBoundingClientRect());
      if (!deck) return;
      await Promise.all(cards.map((el) => {
        const clone = placeClone(el, 'bae_resolve_clone bae_resolve_card', root);
        el.style.visibility = 'hidden';
        return flyClone(clone, deck.getBoundingClientRect(), ms, root, true);
      }));
      await wait(Math.round(ms * 0.15));
      for (let i = 0; i < dests.length; i++) {
        const refill = placeClone(deck, 'bae_resolve_clone bae_resolve_card', root);
        await flyClone(refill, dests[i], ms, root, true);
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
    clearMotionLayer(this.host.root);
    document.querySelectorAll('.bae_motion_clone, .bae_invalid_bubble').forEach((el) => el.remove());
    this.host.root.querySelectorAll('.bae_preview_fade_left').forEach((el) => el.classList.remove('bae_preview_fade_left'));
  }

  private updateActionPreviews(): void {
    this.clearPreviews();
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

    if (!this.previewsEnabled() || !active) return;

    if (
      this.host.isGameplayLike()
      && this.host.selectedCardId != null
      && this.host.selectedLocation != null
      && !this.host.campSelected
      && this.isObserveSelectionLegal()
    ) {
      this.previewObserve(myId, this.host.selectedCardId, this.host.selectedLocation);
    }

    if (this.host.isAssignCampLike() && this.host.selectedLocation != null) {
      this.previewAssign(myId, this.host.selectedLocation);
    }

    if (this.host.campSelected && this.previewsEnabled()) {
      this.previewRegroupPickup(myId);
    }

    if (this.host.campSelected || this.host.isOpeningMulliganLike()) {
      this.host.selectedRegroupIds.forEach((cardId) => {
        const el = this.cardEl(myId, cardId);
        if (el) startDiscardGhost(el, this.host.root);
      });
    }
  }

  private previewObserve(pid: number, cardId: number, loc: number): void {
    const def = this.host.animalDef(cardId);
    if (!def) return;
    const ms = Math.max(700, this.duration() * 3);
    const used = new Set<HTMLElement>();
    for (const m of previewObserveMoves(this.host.gamedatas.boardState.scientists, pid, loc, def)) {
      const src = this.meepleAt(pid, m.from, m.color, used);
      const dest = this.shelfEl(pid, m.to);
      if (src && dest) startTrail(src, dest, ms, this.host.root);
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
      if (dest) startTrail(flag, dest, ms, this.host.root);
    } else {
      const clone = placeClone(flag, 'bae_trail_ghost bae_trail_stuck', this.host.root);
      clone.style.setProperty('--dur', `${ms}ms`);
    }
  }

  private previewAssign(pid: number, loc: number): void {
    const dest = this.shelfEl(pid, loc);
    if (!dest) return;
    const ms = Math.max(700, this.duration() * 3);
    const sources = this.holdMeeples(pid);
    const from = sources.length > 0 ? sources : this.campMeeples(pid);
    for (const src of from) {
      startTrail(src, dest, ms, this.host.root);
    }
  }

  private previewRegroupPickup(pid: number): void {
    const hold = this.ensureRegroupHold(pid);
    const dest = hold?.getBoundingClientRect() ?? this.lingerRect(pid);
    if (!dest) return;
    const ms = Math.max(800, this.duration() * 3);
    for (const src of this.campMeeples(pid)) {
      startTrailToRect(src, dest, ms, this.host.root);
    }
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
    const col = this.handCol(pid);
    if (!col) return;
    const leaving: HTMLElement[] = [];
    for (const cardId of discarded) {
      const el = this.cardEl(pid, cardId);
      if (el && !leaving.includes(el)) leaving.push(el);
    }
    if (leaving.length === 0 && discarded.length > 0) {
      const hidden = this.handCards(pid);
      for (let i = 0; i < discarded.length && i < hidden.length; i++) leaving.push(hidden[i]);
    }
    const remaining = this.handCards(pid).filter((el) => !leaving.includes(el));
    leaving.forEach((el) => { el.style.visibility = 'hidden'; });
    if (deck) {
      await Promise.all(leaving.map((el) => {
        const clone = placeClone(el, 'bae_resolve_clone bae_resolve_card', root);
        return flyClone(clone, deck.getBoundingClientRect(), ms, root, true);
      }));
    }
    await flipElements(remaining, () => {
      leaving.forEach((el) => { el.style.display = 'none'; });
    }, ms);

    const drawCount = this.handDrawCount(pid, discarded, prev, next);
    if (!deck || drawCount <= 0) return;
    const dests = this.afterHandRects(col, remaining, drawCount);
    for (const dest of dests) {
      const refill = placeClone(deck, 'bae_resolve_clone bae_resolve_card', root);
      await flyClone(refill, dest, ms, root, true);
    }
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

  private afterHandRects(col: HTMLElement, remaining: HTMLElement[], count: number): DOMRect[] {
    const sample = remaining[remaining.length - 1]
      ?? (col.querySelector('.bae_card') as HTMLElement | null);
    if (!sample || count <= 0) return [];
    const r = sample.getBoundingClientRect();
    const gap = 8;
    const startTop = remaining.length > 0 ? r.bottom + gap : r.top;
    const rects: DOMRect[] = [];
    for (let i = 0; i < count; i++) {
      rects.push(new DOMRect(r.left, startTop + i * (r.height + gap), r.width, r.height));
    }
    return rects;
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
