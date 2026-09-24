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
  flyCloneToLocal,
  flyDiscardAway,
  freezeAndFadePreviews,
  coordsInParent,
  placeClone,
  placeCloneUnder,
  placeScientistClone,
  rectOf,
  stackByScreenPosition,
  startDiscardGhost,
  startScientistTrail,
  startScientistTrailToRect,
  retargetPreviewClones,
  wait,
} from './Motion';
import {
  animalBonusVp,
  flagTrackVp,
  locationSetVp,
  scoreScoringCard,
  speciesCounts,
} from './Progress';
import {
  animalCardVpOrigin,
  optimalTokens,
  scoringStepAmount,
  scoringStepKind,
  VpTokens,
  type VpValue,
} from './VpTokens';

/** OPTIONAL preference ids (gamepreferences.jsonc). */
export const PREF_ANIM_SPEED = 100;
export const PREF_PREVIEWS = 101;
export const PREF_CONFIRM = 102;
export const PREF_SOUND = 103;
export const MAX_LOCATION_CARDS = 7;

export interface OptionalUiHost {
  bga: Bga<BorealisArticExpeditionsPlayer, BorealisArticExpeditionsGamedatas>;
  gamedatas: BorealisArticExpeditionsGamedatas;
  root: HTMLElement;
  selectedCardId: number | null;
  selectedLocation: number | null;
  campSelected: boolean;
  selectedRegroupIds: Set<number>;
  selectedPoolSlot: number | null;
  selectedObjectiveIdx: number | null;
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
  refreshScientistTooltips(): void;
  onUpdateActionButtons(stateName: string, args: Record<string, unknown> | null): void;
  cachedActionArgs: Record<string, unknown> | null;
  renderAll(): void;
  sendAction(action: string, args?: Record<string, unknown>): Promise<unknown>;
  isActionBusy(): boolean;
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
  private pendingDiscard = new Map<number, number>();
  private discardLoopEpoch = 0;
  private static readonly DISCARD_LOOP_MS = 1850;
  private tooltipBound = false;
  private tooltipLeaveSelector: string | null = null;
  private tooltipQuietUntil = 0;
  private tooltipNeedMove = false;
  private tooltipClickX = 0;
  private tooltipClickY = 0;
  private tooltipWasBlocked = false;
  private tooltipRetrigger = false;
  private lastHoverEl: Element | null = null;
  private previewLocked = false;
  private static readonly TOOLTIP_CLICK_MS = 500;
  private vp: VpTokens;

  constructor(private host: OptionalUiHost) {
    this.vp = new VpTokens(host);
  }

  vpTokensFor(pid: number): VpValue[] {
    return this.vp.tokensFor(pid);
  }

  afterRender(): void {
    this.previewLocked = false;
    this.teardown();
    if (!this.host.root) return;
    this.bindTooltipGate();
    this.applyPreferenceCss();
    this.renderRoundBadge();
    this.bindDragAndDrop();
    this.restoreHoldingFromState();
    this.renderRegroupHold();
    this.host.refreshScientistTooltips();
    if (this.isTooltipBlocked()) this.cancelDojoTooltips();
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

  onActionSubmitted(): void {
    this.previewLocked = true;
    this.pendingDiscard.forEach((id) => window.clearTimeout(id));
    this.pendingDiscard.clear();
    this.discardLoopEpoch = 0;
    freezeAndFadePreviews(this.host.root);
  }

  onSelectionChanged(): void {
    if (this.previewLocked) return;
    if (this.host.campSelected || this.host.isOpeningMulliganLike()) {
      const myId = Number(this.host.bga.players.getCurrentPlayerId());
      if (this.host.selectedRegroupIds.size === 0) this.clearDiscardGhosts();
      else this.syncDiscardGhosts(myId);
      return;
    }
    this.updateActionPreviews();
  }

  onBoardScaleChanged(): void {
    if (this.previewLocked || this.resolving) return;
    retargetPreviewClones(this.host.root);
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

  private prepareResolution(zones: string[] = ['all']): void {
    this.beginTooltipGuard(zones);
    this.clearPreviews();
    this.host.selectedCardId = null;
    this.host.selectedLocation = null;
    this.host.selectedPoolSlot = null;
    this.host.selectedObjectiveIdx = null;
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
    this.endTooltipGuard();
  }

  async playObserveResolution(prev: BoardState, args: Record<string, unknown>): Promise<void> {
    const ms = this.duration();
    if (ms === 0 || this.resolving) return;
    this.resolving = true;
    const pid = Number(args.player_id ?? args.playerId ?? 0);
    this.prepareResolution([`player:${pid}`]);
    try {
      const cardId = Number(args.card_id ?? NaN);
      const loc = Number(args.location ?? NaN);
      if (!Number.isFinite(pid) || !Number.isFinite(cardId) || loc < 0 || loc > 2) return;
      const root = this.host.root;

      const cardEl = this.cardEl(pid, cardId);
      const pileDest = this.nextPileDest(pid, loc);
      const slots = this.expandLocationOutline(pid, loc, ms);
      const remaining = this.handCards(pid).filter((el) => el !== cardEl);
      if (cardEl && pileDest) {
        const clone = placeClone(cardEl, 'bae_resolve_clone bae_resolve_card', root);
        cardEl.style.visibility = 'hidden';
        const myId = Number(this.host.bga.players.getCurrentPlayerId());
        const reveal = pid !== myId
          ? this.crossfadeToFace(clone, cardId, ms)
          : Promise.resolve();
        await Promise.all([
          flyCloneToLocal(clone, pileDest.local, ms, pileDest.pile, true),
          this.compactHandToSlots(remaining, slots, ms),
          reveal,
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
          const destCell = this.trackEl(pid, loc, newFlag);
          const destRect = destCell ? this.flagRestRect(pid, loc, newFlag, flagEl) : null;
          const clone = placeClone(flagEl, 'bae_resolve_clone', root);
          flagEl.style.visibility = 'hidden';
          if (destRect) await flyClone(clone, destRect, Math.round(ms * 0.9), root, false, 1, destCell);
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
    this.prepareResolution([`player:${pid}`]);
    try {
      const discarded = (args.discarded as number[] | undefined) ?? [];
      const leftHold = this.ensureRegroupHold(pid, 'left');
      const rightHold = this.ensureRegroupHold(pid, 'right');
      const leftCamp = this.host.root.querySelector(`#bae_camp_${pid}_left`) as HTMLElement | null;
      const rightCamp = this.host.root.querySelector(`#bae_camp_${pid}_right`) as HTMLElement | null;
      const leftMeeples = Array.from(this.shelfEl(pid, 3)?.querySelectorAll('.bae_meeple_img') ?? []) as HTMLElement[];
      const rightMeeples = Array.from(this.shelfEl(pid, 4)?.querySelectorAll('.bae_meeple_img') ?? []) as HTMLElement[];
      const allMeeples = [...leftMeeples, ...rightMeeples];
      const vpOnes = allMeeples.map(() => 1 as VpValue);
      const vpSources = allMeeples.map((el) => el.getBoundingClientRect());
      const stackItems: Array<{ clone: HTMLElement; from: DOMRect; dest: DOMRect }> = [];
      const flights = [
        ...leftMeeples.map((el) => this.flyMeepleToHold(el, leftCamp, leftHold, ms, stackItems)),
        ...rightMeeples.map((el) => this.flyMeepleToHold(el, rightCamp, rightHold, ms, stackItems)),
        this.vp.addIncoming(pid, vpOnes, vpSources, ms, false),
      ];
      stackByScreenPosition(stackItems.map((it) => ({ el: it.clone, top: it.from.top, left: it.from.left })));
      if (ms > 0) {
        void wait(ms / 2).then(() => {
          stackByScreenPosition(stackItems.map((it) => ({ el: it.clone, top: it.dest.top, left: it.dest.left })));
        });
      }
      await Promise.all(flights);
      await this.vp.convertToOptimal(pid, ms);
      await this.animateHandReplace(pid, discarded, prev, args.boardState as BoardState | undefined, ms);
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
    this.prepareResolution([`player:${pid}`]);
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
    const pid = Number(args.player_id ?? args.playerId ?? 0);
    this.prepareResolution(['pool', `player:${pid}`]);
    try {
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
      const myId = Number(this.host.bga.players.getCurrentPlayerId());
      if (!fromDeck && pid !== myId) {
        await this.crossfadeToCardBack(clone, ms);
      }
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
    const pid = Number(args.player_id ?? args.playerId ?? 0);
    this.prepareResolution(['pool', `player:${pid}`]);
    try {
      const root = this.host.root;
      const pool = root.querySelector('.bae_pool') as HTMLElement | null;
      const poolRect = pool?.getBoundingClientRect() ?? this.deckEl()?.getBoundingClientRect() ?? null;
      if (pid && poolRect) await this.vp.spendOneTo(pid, poolRect, ms);
      const deck = this.deckEl();
      const cards = this.poolCards();
      const dests = cards.map((el) => ({
        rect: el.getBoundingClientRect(),
        slot: Number((el as HTMLElement).dataset.poolSlot),
      }));
      if (!deck) return;
      await Promise.all(cards.map((el) => {
        const clone = placeCloneUnder(el, 'bae_resolve_clone bae_resolve_card', root);
        el.style.visibility = 'hidden';
        return flyClone(clone, deck.getBoundingClientRect(), ms, root, true, 0.95);
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
    const pid = Number(args.player_id ?? args.playerId ?? 0);
    this.prepareResolution([`player:${pid}`]);
    try {
      const discarded = (args.discarded as number[] | undefined) ?? [];
      await this.animateHandReplace(pid, discarded, prev, args.boardState as BoardState | undefined, ms);
    } finally {
      this.endResolution();
    }
  }

  async playObjectiveClaimResolution(_prev: BoardState, args: Record<string, unknown>): Promise<void> {
    const ms = this.duration();
    const pid = Number(args.player_id ?? args.playerId ?? 0);
    if (ms === 0 || this.resolving || !pid) return;
    this.resolving = true;
    this.prepareResolution([`player:${pid}`]);
    try {
      const idx = Number(args.objective_index ?? args.objectiveIndex ?? NaN);
      const obj = Number.isFinite(idx)
        ? this.host.root.querySelector(`#bae_obj_${idx}`) as HTMLElement | null
        : null;
      const from = rectOf(obj);
      await this.vp.addIncoming(pid, [5], [from], ms, false);
    } finally {
      this.endResolution();
    }
  }

  async playScoringStepResolution(_prev: BoardState, args: Record<string, unknown>): Promise<void> {
    const base = this.duration();
    const ms = base === 0 ? 0 : Math.round(base + 200);
    const pid = Number(args.player_id ?? args.playerId ?? 0);
    if (ms === 0 || this.resolving || !pid) return;
    const flights = this.scoringTokenFlights(pid, args);
    if (flights.length === 0) return;
    this.resolving = true;
    this.prepareResolution([`player:${pid}`]);
    try {
      await this.vp.addIncoming(
        pid,
        flights.map((f) => f.value),
        flights.map((f) => f.from),
        ms,
        true,
      );
      await wait(500);
    } finally {
      this.endResolution();
    }
  }

  private scoringTokenFlights(
    pid: number,
    args: Record<string, unknown>,
  ): Array<{ value: VpValue; from: DOMRect | null }> {
    const kind = scoringStepKind(args);
    const out: Array<{ value: VpValue; from: DOMRect | null }> = [];
    const push = (amount: number, from: DOMRect | null): void => {
      if (amount <= 0 || !from) return;
      for (const value of optimalTokens(amount)) out.push({ value, from });
    };
    const locOf = (): number => Number(args.location ?? args.loc ?? 0);
    const amounts = (): number[] => [
      Number(args.amount_left ?? 0),
      Number(args.amount_mid ?? 0),
      Number(args.amount_right ?? 0),
    ];
    if (kind === 'species_sets') {
      const from = this.speciesSetOrigin(pid);
      if (args.amount_left != null || args.amount_mid != null || args.amount_right != null) {
        amounts().forEach((amount) => push(amount, from));
      } else {
        push(Number(args.amount ?? 0), from);
      }
      return out;
    }
    if (kind === 'exploration_track') {
      const flags = this.host.gamedatas.boardState.flags?.[pid] ?? {};
      const flagAt = (loc: number): number => Number(
        args.flag_space
        ?? (flags as Record<number, number>)[loc]
        ?? (flags as Record<string, number>)[String(loc)]
        ?? 0,
      );
      if (args.amount_left != null || args.amount_mid != null || args.amount_right != null) {
        amounts().forEach((amount, loc) => push(amount, this.trackVpOrigin(pid, loc, flagAt(loc))));
      } else {
        const loc = locOf();
        push(Number(args.amount ?? 0), this.trackVpOrigin(pid, loc, flagAt(loc)));
      }
      return out;
    }
    if (kind === 'animal_card') {
      const loc = locOf();
      const slot = Number(args.slot ?? 0);
      push(Number(args.amount ?? 0), this.animalCardVpOriginRect(pid, loc, slot, args));
      return out;
    }
    if (kind === 'scoring_card') {
      push(Number(args.amount ?? 0), this.scoringCardOrigin(args));
      return out;
    }
    const fromAnchor = this.originFromAnchor(String(args.anchor_id ?? ''), pid, args);
    push(scoringStepAmount(args), fromAnchor);
    return out;
  }

  private speciesSetOrigin(pid: number): DOMRect | null {
    const track = this.host.root.querySelector(`#bae_animal_loc_vp_${pid}`) as HTMLElement | null;
    return rectOf(track) ?? this.locationZoneRect(pid, 2);
  }

  private trackVpOrigin(pid: number, loc: number, space: number): DOMRect | null {
    const flag = this.flagEl(pid, loc, space);
    const cell = this.trackEl(pid, loc, space);
    return rectOf(flag) ?? rectOf(cell) ?? this.locationZoneRect(pid, loc);
  }

  private animalCardVpOriginRect(
    pid: number,
    loc: number,
    slot: number,
    args: Record<string, unknown>,
  ): DOMRect | null {
    const card = this.host.root.querySelector(`#bae_pile_${pid}_${loc}_${slot}`) as HTMLElement | null
      ?? (args.card_id != null
        ? this.host.root.querySelector(`#bae_pile_${pid}_${loc}_${Number(args.card_id)}`) as HTMLElement | null
        : null);
    if (card) return animalCardVpOrigin(card);
    return this.locationZoneRect(pid, loc);
  }

  private scoringCardOrigin(args: Record<string, unknown>): DOMRect | null {
    const scoringId = Number(args.scoring_id ?? args.scoringId ?? NaN);
    const idx = Number.isFinite(Number(args.scoring_index))
      ? Number(args.scoring_index)
      : (this.host.gamedatas.boardState.scoring_cards ?? []).findIndex((id) => Number(id) === scoringId);
    const card = this.host.root.querySelector(`#bae_score_${idx}`) as HTMLElement | null;
    return rectOf(card);
  }

  private originFromAnchor(anchorId: string, pid: number, args: Record<string, unknown>): DOMRect | null {
    if (!anchorId || anchorId === `bae_playerboard_${pid}`) return null;
    const pile = /^bae_pile_(\d+)_(\d+)_(\d+)$/.exec(anchorId);
    if (pile) return this.animalCardVpOriginRect(Number(pile[1]), Number(pile[2]), Number(pile[3]), args);
    const track = /^bae_track_(\d+)_(\d+)_(\d+)$/.exec(anchorId);
    if (track) return this.trackVpOrigin(Number(track[1]), Number(track[2]), Number(track[3]));
    const el = (this.host.root.querySelector(`#${anchorId}`)
      ?? document.getElementById(anchorId)) as HTMLElement | null;
    return rectOf(el);
  }

  private locationZoneRect(pid: number, loc: number): DOMRect | null {
    const zone = this.host.root.querySelector(
      `.bae_location_zone[data-player-id="${pid}"][data-loc="${loc}"]`,
    ) as HTMLElement | null;
    return rectOf(zone);
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
    this.pendingDiscard.forEach((id) => window.clearTimeout(id));
    this.pendingDiscard.clear();
    this.discardLoopEpoch = 0;
    this.discardGhosts.forEach((el) => el.remove());
    this.discardGhosts.clear();
    this.host.root?.querySelectorAll('.bae_discard_ghost').forEach((el) => el.remove());
  }

  private updateActionPreviews(): void {
    if (this.previewLocked || this.resolving) return;
    this.clearTransientPreviews();

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
    this.pendingDiscard.forEach((timeoutId, cardId) => {
      if (wanted.has(cardId)) return;
      window.clearTimeout(timeoutId);
      this.pendingDiscard.delete(cardId);
    });
    this.discardGhosts.forEach((el, cardId) => {
      if (!el.isConnected || !wanted.has(cardId)) {
        el.remove();
        this.discardGhosts.delete(cardId);
      }
    });
    if (wanted.size === 0) {
      this.discardLoopEpoch = 0;
      return;
    }
    wanted.forEach((cardId) => {
      if (this.discardGhosts.has(cardId) || this.pendingDiscard.has(cardId)) return;
      const el = this.cardEl(pid, cardId);
      if (!el) return;
      const start = () => {
        this.pendingDiscard.delete(cardId);
        if (!this.host.selectedRegroupIds.has(cardId) || this.discardGhosts.has(cardId)) return;
        const card = this.cardEl(pid, cardId);
        if (!card) return;
        if (this.discardGhosts.size === 0) this.discardLoopEpoch = performance.now();
        this.discardGhosts.set(cardId, startDiscardGhost(card, this.host.root, cardId));
      };
      const waitMs = this.discardLoopWaitMs();
      if (waitMs <= 16) start();
      else this.pendingDiscard.set(cardId, window.setTimeout(start, waitMs));
    });
  }

  private discardLoopWaitMs(): number {
    if (this.discardGhosts.size === 0 || this.discardLoopEpoch <= 0) return 0;
    const elapsed = (performance.now() - this.discardLoopEpoch) % OptionalUi.DISCARD_LOOP_MS;
    return Math.max(0, OptionalUi.DISCARD_LOOP_MS - elapsed);
  }

  private previewObserve(pid: number, cardId: number, loc: number): void {
    const def = this.host.animalDef(cardId);
    if (!def) return;
    const ms = this.previewLoopMs();
    const used = new Set<HTMLElement>();
    const byDest = new Map<number, HTMLElement[]>();
    for (const m of previewObserveMoves(this.host.gamedatas.boardState.scientists, pid, loc, def)) {
      const src = this.meepleAt(pid, m.from, m.color, used);
      if (!src) continue;
      const group = byDest.get(m.to) ?? [];
      group.push(src);
      byDest.set(m.to, group);
    }
    byDest.forEach((sources, to) => {
      const dest = this.shelfEl(pid, to);
      if (dest) this.trailScientistsToEmptyGroup(sources, () => dest.getBoundingClientRect(), to, pid, ms);
    });
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
      const stuckDest = (): DOMRect => {
        const r = flag.getBoundingClientRect();
        return new DOMRect(r.left, r.top - 7, r.width, r.height);
      };
      startScientistTrailToRect(flag, stuckDest(), ms, this.host.root, stuckDest);
    }
  }

  private previewAssign(pid: number, loc: number): void {
    const dest = this.shelfEl(pid, loc);
    if (!dest) return;
    const sources = this.holdMeeples(pid);
    const from = sources.length > 0 ? sources : this.campMeeples(pid);
    this.trailScientistsToEmptyGroup(from, () => dest.getBoundingClientRect(), loc, pid, this.previewLoopMs());
  }

  private previewRegroupPickup(pid: number): void {
    const ms = this.previewLoopMs();
    this.previewRegroupPickupSide(pid, 3, 'left', ms);
    this.previewRegroupPickupSide(pid, 4, 'right', ms);
    this.vp.previewOnesFrom(pid, this.campMeeples(pid), ms);
  }

  private previewRegroupPickupSide(pid: number, campLoc: number, side: 'left' | 'right', ms: number): void {
    const sources = Array.from(
      this.shelfEl(pid, campLoc)?.querySelectorAll('.bae_meeple_img') ?? [],
    ) as HTMLElement[];
    if (sources.length === 0) return;
    const hold = this.host.root.querySelector(`#bae_regroup_hold_${pid}_${side}`) as HTMLElement | null;
    const camp = this.host.root.querySelector(`#bae_camp_${pid}_${side}`) as HTMLElement | null;
    const getDestBox = (): DOMRect | null => {
      if (hold?.isConnected) return hold.getBoundingClientRect();
      if (!camp?.isConnected) return null;
      const r = camp.getBoundingClientRect();
      return new DOMRect(r.left, r.top - r.height * 1.2, r.width, r.height);
    };
    if (!getDestBox()) return;
    this.trailScientistsToEmptyGroup(sources, getDestBox, campLoc, pid, ms);
  }

  private trailScientistsToEmptyGroup(
    sources: HTMLElement[],
    getDestBox: () => DOMRect | null,
    layoutLoc: number,
    pid: number,
    ms: number,
  ): void {
    const destBox = getDestBox();
    if (sources.length === 0 || !destBox || destBox.width < 1 || destBox.height < 1) return;
    const sci: Record<number, number[]> = { 0: [], 1: [], 2: [] };
    for (const el of sources) {
      const color = Number(el.dataset.scientist);
      if (color >= 0 && color < 3) sci[color].push(layoutLoc);
    }
    const slots = this.scientistLayout(pid, { [pid]: sci }, layoutLoc);
    const unused = [...sources];
    const trails: Array<{ el: HTMLElement; top: number; left: number }> = [];
    for (const slot of slots) {
      const idx = unused.findIndex((el) => Number(el.dataset.scientist) === slot.color);
      if (idx < 0) continue;
      const el = unused.splice(idx, 1)[0];
      const dest = this.meepleSlotRectFromBox(destBox, slot, el);
      const destFn = (): DOMRect | null => {
        const box = getDestBox();
        return box ? this.meepleSlotRectFromBox(box, slot, el) : null;
      };
      const clone = startScientistTrailToRect(el, dest, ms, this.host.root, destFn);
      trails.push({ el: clone, top: dest.top, left: dest.left });
    }
    stackByScreenPosition(trails);
  }

  private previewCardPlacement(pid: number, cardId: number, loc: number): void {
    const zone = this.host.root.querySelector(
      `.bae_location_zone[data-player-id="${pid}"][data-loc="${loc}"]`,
    ) as HTMLElement | null;
    const pile = zone?.querySelector('.bae_anim_pile');
    if (!zone || !pile) return;
    const slot = document.createElement('div');
    slot.className = 'bae_pile_slot bae_card_place_preview';
    slot.style.zIndex = '2';
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
        if (this.host.isActionBusy()) {
          ev.preventDefault();
          return;
        }
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
        if (this.host.isActionBusy() || !this.host.isGameplayLike() || !this.host.bga.players.isCurrentPlayerActive()) return;
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
        if (this.host.isActionBusy() || !this.host.isGameplayLike() || !this.host.bga.players.isCurrentPlayerActive()) return;
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
        if (!this.host.isReplenishLike() || this.host.isActionBusy() || !this.host.bga.players.isCurrentPlayerActive()) return;
        ev.preventDefault();
        const slotRaw = ev.dataTransfer?.getData('text/bae-pool');
        if (slotRaw === '' || slotRaw == null) return;
        void this.host.sendAction('actTakeAnimal', { pool_slot: Number(slotRaw) });
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
        if (this.host.isActionBusy() || !this.host.isReplenishLike()) {
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
    await Promise.all([
      ...leaving.map((el) => flyDiscardAway(el, root, ms)),
      this.compactHandToSlots(remaining, slots, ms),
    ]);

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

  private async crossfadeToCardBack(clone: HTMLElement, ms: number): Promise<void> {
    return this.crossfadeCard(clone, 9999, ms);
  }

  private async crossfadeToFace(clone: HTMLElement, cardId: number, ms: number): Promise<void> {
    return this.crossfadeCard(clone, cardId, ms);
  }

  private async crossfadeCard(clone: HTMLElement, cardId: number, ms: number): Promise<void> {
    const fade = Math.max(180, Math.round(ms * 0.7));
    clone.style.overflow = 'hidden';
    const overlay = document.createElement('div');
    overlay.className = 'bae_card_back_fade';
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.opacity = '0';
    overlay.style.transition = `opacity ${fade}ms ease`;
    overlay.innerHTML = this.host.animalCardHtml(cardId);
    const current = clone.querySelector('.bae_card_img, .bae_pile_card_img') as HTMLElement | null;
    if (current) current.style.transition = `opacity ${fade}ms ease`;
    clone.appendChild(overlay);
    void overlay.offsetWidth;
    overlay.style.opacity = '1';
    if (current) current.style.opacity = '0';
    await wait(fade);
  }

  private renderRegroupHold(): void {
    const pid = this.holdingPid;
    if (pid == null) {
      this.host.root.querySelectorAll('.bae_regroup_hold').forEach((el) => el.remove());
      return;
    }
    const leftHold = this.ensureRegroupHold(pid, 'left');
    const rightHold = this.ensureRegroupHold(pid, 'right');
    const left = this.shelfEl(pid, 3);
    const right = this.shelfEl(pid, 4);
    if (leftHold) leftHold.innerHTML = `<div class="bae_sci_shelf">${left?.innerHTML ?? ''}</div>`;
    if (rightHold) rightHold.innerHTML = `<div class="bae_sci_shelf">${right?.innerHTML ?? ''}</div>`;
    this.campMeeples(pid).forEach((el) => { el.style.visibility = 'hidden'; });
  }

  private restoreHoldingFromState(): void {
    if (this.host.isAssignCampLike()) {
      if (this.holdingPid != null && this.playerHasCampScientists(this.holdingPid)) return;
      const active = Number(this.host.bga.players.getActivePlayerId() ?? 0);
      const pids = [active, ...Object.keys(this.host.gamedatas.players).map(Number)];
      for (const pid of pids) {
        if (pid && this.playerHasCampScientists(pid)) {
          this.holdingPid = pid;
          return;
        }
      }
      return;
    }
    if (!this.resolving) this.holdingPid = null;
  }

  private playerHasCampScientists(pid: number): boolean {
    if (this.campMeeples(pid).length > 0) return true;
    const sci = this.host.gamedatas.boardState.scientists?.[pid];
    if (!sci) return false;
    for (let color = 0; color < 3; color++) {
      if ((sci[color] ?? []).some((pos) => pos === 3 || pos === 4)) return true;
    }
    return false;
  }

  private ensureRegroupHold(pid: number, side: 'left' | 'right'): HTMLElement | null {
    const canvas = this.host.root.querySelector(`#bae_playerboard_${pid} .bae_board_canvas`) as HTMLElement | null;
    if (!canvas) return null;
    const id = `bae_regroup_hold_${pid}_${side}`;
    let hold = canvas.querySelector(`#${id}`) as HTMLElement | null;
    if (!hold) {
      hold = document.createElement('div');
      hold.id = id;
      hold.className = `bae_regroup_hold bae_regroup_hold_${side}`;
      canvas.appendChild(hold);
    }
    return hold;
  }

  private flyMeepleToHold(
    el: HTMLElement,
    camp: HTMLElement | null,
    hold: HTMLElement | null,
    ms: number,
    stackItems?: Array<{ clone: HTMLElement; from: DOMRect; dest: DOMRect }>,
  ): Promise<void> {
    const destBox = hold?.getBoundingClientRect() ?? (camp ? this.offsetRect(camp.getBoundingClientRect(), 0, -camp.getBoundingClientRect().height * 1.2) : null);
    const campBox = camp?.getBoundingClientRect();
    if (!destBox || !campBox) return Promise.resolve();
    const from = el.getBoundingClientRect();
    const dest = new DOMRect(
      destBox.left + (from.left - campBox.left),
      destBox.top + (from.top - campBox.top),
      from.width,
      from.height,
    );
    const clone = placeScientistClone(el, 'bae_resolve_clone', this.host.root);
    el.style.visibility = 'hidden';
    stackItems?.push({ clone, from, dest });
    return flyClone(clone, dest, ms, this.host.root, true);
  }

  private offsetRect(r: DOMRect, dx: number, dy: number): DOMRect {
    return new DOMRect(r.left + dx, r.top + dy, r.width, r.height);
  }

  private holdMeeples(pid: number, side?: 'left' | 'right'): HTMLElement[] {
    const sel = side
      ? `#bae_regroup_hold_${pid}_${side}`
      : `#bae_playerboard_${pid} .bae_regroup_hold`;
    const nodes = this.host.root.querySelectorAll(sel);
    return Array.from(nodes).flatMap((hold) => Array.from(hold.querySelectorAll('.bae_meeple_img'))) as HTMLElement[];
  }

  private expandLocationOutline(pid: number, loc: number, ms: number): DOMRect[] {
    const current = this.handSlotRects(pid);
    const canvas = this.host.root.querySelector(`#bae_playerboard_${pid} .bae_board_canvas`) as HTMLElement | null;
    const zone = this.host.root.querySelector(
      `.bae_location_zone[data-player-id="${pid}"][data-loc="${loc}"]`,
    ) as HTMLElement | null;
    if (!canvas || !zone) return current;
    const boards = this.host.gamedatas.boardState.boards?.[pid] ?? [];
    const maxPlayed = boards.reduce((max, pile) => Math.max(max, pile.length), 0);
    const afterPile = (boards[loc]?.length ?? 0) + 1;
    const oldSlots = Math.min(MAX_LOCATION_CARDS, maxPlayed + 1);
    const newSlots = Math.min(MAX_LOCATION_CARDS, Math.max(maxPlayed, afterPile) + 1);
    if (newSlots <= oldSlots) return current;
    canvas.style.transition = 'none';
    canvas.style.setProperty('--bae-outline-dur', '0s');
    canvas.style.setProperty('--animal-card-slots', String(newSlots));
    void canvas.offsetWidth;
    const dests = this.handSlotRects(pid);
    canvas.style.setProperty('--animal-card-slots', String(oldSlots));
    void canvas.offsetWidth;
    const ease = `${ms}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
    canvas.style.setProperty('--bae-outline-dur', `${ms}ms`);
    canvas.style.transition = `margin ${ease}`;
    void canvas.offsetWidth;
    canvas.style.setProperty('--animal-card-slots', String(newSlots));
    return dests;
  }

  private nextPileDest(pid: number, loc: number): { pile: HTMLElement; local: { left: number; top: number; width: number; height: number } } | null {
    const zone = this.host.root.querySelector(
      `.bae_location_zone[data-player-id="${pid}"][data-loc="${loc}"]`,
    ) as HTMLElement | null;
    const pile = zone?.querySelector('.bae_anim_pile') as HTMLElement | null;
    if (!zone || !pile) return null;
    const probe = document.createElement('div');
    probe.className = 'bae_pile_slot';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    pile.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    const local = coordsInParent(pile, rect);
    pile.removeChild(probe);
    if (rect.width < 1 || rect.height < 1) return null;
    return { pile, local };
  }

  private flagRestRect(pid: number, loc: number, space: number, sample: HTMLElement): DOMRect | null {
    const cell = this.trackEl(pid, loc, space);
    if (!cell) return null;
    const jitterLeft = ((pid * 3 + loc * 5 + space * 7) % 9) - 4;
    const jitterTop = ((pid * 7 + loc * 3 + space * 11) % 9) - 4;
    const probe = sample.cloneNode(true) as HTMLElement;
    probe.style.visibility = 'hidden';
    probe.style.left = `${(50 + jitterLeft).toFixed(1)}%`;
    probe.style.top = `${(50 + jitterTop).toFixed(1)}%`;
    cell.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    return rect.width < 1 || rect.height < 1 ? null : rect;
  }

  private bindTooltipGate(): void {
    if (this.tooltipBound) return;
    this.tooltipBound = true;
    this.repairTooltipNodes();
    document.body.classList.remove('bae_block_tooltips');
    document.querySelectorAll('.bae_tooltip_keeper').forEach((el) => el.remove());

    const onHover = (ev: Event) => {
      const target = ev.target as Element | null;
      this.lastHoverEl = target;
      if (this.tooltipLeaveSelector && !this.isHoveringLeaveTarget(target)) {
        this.tooltipLeaveSelector = null;
      }
      if (this.tooltipRetrigger) {
        this.tooltipRetrigger = false;
        return;
      }
      if (this.isTooltipBlocked()) {
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        this.cancelDojoTooltips();
      }
    };
    const onClick = (ev: Event) => {
      const mouse = ev as MouseEvent;
      this.tooltipQuietUntil = Date.now() + OptionalUi.TOOLTIP_CLICK_MS;
      this.tooltipNeedMove = true;
      this.tooltipClickX = mouse.clientX ?? 0;
      this.tooltipClickY = mouse.clientY ?? 0;
      this.tooltipWasBlocked = true;
      const target = ev.target as Element | null;
      if (target && typeof target.closest === 'function') {
        const interacted = this.interactiveTooltipTarget(target) ?? target;
        this.tooltipLeaveSelector = this.selectorFor(interacted);
      }
      this.cancelDojoTooltips();
      this.dismissTooltipFrom(this.lastHoverEl);
    };
    const onMove = (ev: Event) => {
      const mouse = ev as MouseEvent;
      const target = ev.target as Element | null;
      this.lastHoverEl = target;
      if (this.tooltipNeedMove) {
        const dx = (mouse.clientX ?? 0) - this.tooltipClickX;
        const dy = (mouse.clientY ?? 0) - this.tooltipClickY;
        if (dx * dx + dy * dy >= 16) this.tooltipNeedMove = false;
      }
      if (this.tooltipLeaveSelector && !this.isHoveringLeaveTarget(target)) {
        this.tooltipLeaveSelector = null;
      }
      const blocked = this.isTooltipBlocked();
      if (this.tooltipWasBlocked && !blocked) this.retriggerTooltipHover();
      this.tooltipWasBlocked = blocked;
    };
    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('mouseenter', onHover, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousemove', onMove, true);
  }

  private beginTooltipGuard(zones: string[]): void {
    const hoverZone = this.hoverTooltipZone();
    const affected = zones.includes('all') || (hoverZone != null && zones.includes(hoverZone));
    const hover = this.lastHoverEl;
    this.tooltipNeedMove = true;
    this.tooltipQuietUntil = Date.now() + OptionalUi.TOOLTIP_CLICK_MS;
    this.tooltipWasBlocked = true;
    if (hover && typeof hover.closest === 'function') {
      this.tooltipLeaveSelector = this.selectorFor(this.interactiveTooltipTarget(hover) ?? hover);
    }
    if (affected) this.dismissTooltipFrom(hover);
    this.cancelDojoTooltips();
  }

  private endTooltipGuard(): void {
    this.tooltipNeedMove = true;
    this.tooltipQuietUntil = Date.now() + OptionalUi.TOOLTIP_CLICK_MS;
    this.tooltipWasBlocked = true;
    const hover = this.lastHoverEl;
    if (hover && typeof hover.closest === 'function') {
      this.tooltipLeaveSelector = this.selectorFor(this.interactiveTooltipTarget(hover) ?? hover);
    }
    this.cancelDojoTooltips();
  }

  private isTooltipBlocked(): boolean {
    if (this.resolving) return true;
    if (Date.now() < this.tooltipQuietUntil) return true;
    if (this.tooltipNeedMove) return true;
    return this.isHoveringLeaveTarget(this.lastHoverEl);
  }

  private isHoveringLeaveTarget(hover: Element | null): boolean {
    if (!hover || !this.tooltipLeaveSelector || typeof hover.closest !== 'function') return false;
    try {
      return !!hover.closest(this.tooltipLeaveSelector);
    } catch {
      return false;
    }
  }

  private retriggerTooltipHover(): void {
    const hover = this.lastHoverEl;
    if (!hover || typeof hover.dispatchEvent !== 'function') return;
    this.tooltipRetrigger = true;
    hover.dispatchEvent(new MouseEvent('mouseover', {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
  }

  private interactiveTooltipTarget(el: Element): Element | null {
    return el.closest([
      '.bae_card',
      '.bae_pile_slot',
      '.bae_pool_slot',
      '.bae_obj',
      '.bae_score_card',
      '.bae_camp_zone',
      '.bae_animal_loc_vp_track',
      '.bae_vp_tokens_zone',
      '.bae_regroup_hold',
      '.bae_location_zone',
    ].join(','));
  }

  private selectorFor(el: Element): string | null {
    const host = el as HTMLElement;
    if (host.id) return `#${host.id}`;
    const loc = host.closest?.('.bae_location_zone') as HTMLElement | null;
    if (loc?.dataset.playerId != null && loc.dataset.loc != null) {
      return `.bae_location_zone[data-player-id="${loc.dataset.playerId}"][data-loc="${loc.dataset.loc}"]`;
    }
    const camp = host.closest?.('.bae_camp_zone') as HTMLElement | null;
    if (camp?.id) return `#${camp.id}`;
    const card = host.closest?.('.bae_card') as HTMLElement | null;
    if (card?.id) return `#${card.id}`;
    return null;
  }

  private hoverTooltipZone(): string | null {
    const el = this.lastHoverEl;
    if (!el || typeof (el as Element).closest !== 'function') return null;
    if ((el as Element).closest('.bae_pool, .bae_top_pool')) return 'pool';
    const board = (el as Element).closest('.bae_playerboard') as HTMLElement | null;
    if (board?.dataset.playerId) return `player:${board.dataset.playerId}`;
    return null;
  }

  private tooltipNodes(): HTMLElement[] {
    return Array.from(document.querySelectorAll(
      '.dijitTooltip, .dijitTooltipPopup, .bga-tooltip',
    )) as HTMLElement[];
  }

  private repairTooltipNodes(): void {
    this.tooltipNodes().forEach((node) => {
      node.style.removeProperty('display');
      node.style.removeProperty('visibility');
      node.style.removeProperty('width');
      node.style.removeProperty('height');
      node.style.removeProperty('overflow');
    });
    document.querySelectorAll('.bae_tooltip_keeper').forEach((el) => el.remove());
    document.body.classList.remove('bae_block_tooltips');
  }

  private dismissTooltipFrom(from: Element | null): void {
    this.repairTooltipNodes();
    if (from && typeof from.dispatchEvent === 'function') {
      const related = document.body;
      const bubble = { bubbles: true, cancelable: true, view: window, relatedTarget: related } as MouseEventInit;
      from.dispatchEvent(new MouseEvent('pointerout', bubble));
      from.dispatchEvent(new MouseEvent('mouseout', bubble));
      from.dispatchEvent(new MouseEvent('mouseleave', {
        bubbles: false,
        cancelable: true,
        view: window,
        relatedTarget: related,
      }));
    }
    this.cancelDojoTooltips();
  }

  private cancelDojoTooltips(): void {
    this.repairTooltipNodes();
    const hideWidget = (tip: unknown): void => {
      if (!tip || typeof tip !== 'object') return;
      const t = tip as {
        _showTimer?: number | null;
        close?: () => void;
        _onUnHover?: () => void;
      };
      try {
        if (t._showTimer) {
          window.clearTimeout(t._showTimer);
          t._showTimer = null;
        }
        t.close?.();
        t._onUnHover?.();
      } catch { /* ignore */ }
    };
    const ui = this.host.bga?.gameui as unknown as Record<string, unknown> | undefined;
    if (ui) {
      for (const key of ['tooltips', '_tooltips']) {
        const map = ui[key];
        if (map && typeof map === 'object') {
          for (const tip of Object.values(map as Record<string, unknown>)) hideWidget(tip);
        }
      }
    }
    const w = window as unknown as {
      dijit?: { hideTooltip?: () => void; _masterTT?: unknown };
    };
    try { w.dijit?.hideTooltip?.(); } catch { /* ignore */ }
    hideWidget(w.dijit?._masterTT);
    document.querySelectorAll('.dijitTooltip, .dijitTooltipPopup').forEach((node) => {
      node.classList.add('dijitTooltipHidden');
    });
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
    const leftHold = this.holdMeeples(pid, 'left');
    const rightHold = this.holdMeeples(pid, 'right');
    const used = new Set<HTMLElement>();
    const flights: Promise<void>[] = [];
    const assigned: { el: HTMLElement; dest: DOMRect }[] = [];

    const currentAt = (loc: number): HTMLElement[] => {
      if (leftHold.length + rightHold.length > 0 && loc === 3) return leftHold;
      if (leftHold.length + rightHold.length > 0 && loc === 4) return rightHold;
      const shelf = this.shelfEl(pid, loc);
      return Array.from(shelf?.querySelectorAll('.bae_meeple_img') ?? []) as HTMLElement[];
    };

    const dist2 = (el: HTMLElement, dest: DOMRect): number => {
      const r = el.getBoundingClientRect();
      const dx = (r.left + r.width / 2) - (dest.left + dest.width / 2);
      const dy = (r.top + r.height / 2) - (dest.top + dest.height / 2);
      return dx * dx + dy * dy;
    };

    const takeNearest = (els: HTMLElement[], color: number, dest: DOMRect): HTMLElement | null => {
      const candidates = els.filter((node) => !used.has(node) && Number(node.dataset.scientist) === color);
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => dist2(a, dest) - dist2(b, dest));
      const el = candidates[0];
      used.add(el);
      return el;
    };

    const slotsByLoc = [0, 1, 2, 3, 4].map((loc) => ({
      loc,
      shelf: this.shelfEl(pid, loc),
      slots: this.scientistLayout(pid, next, loc),
    }));
    const filled: Array<Array<HTMLElement | null>> = slotsByLoc.map((row) => row.slots.map(() => null));

    for (const row of slotsByLoc) {
      if (!row.shelf) continue;
      const staying = currentAt(row.loc);
      row.slots.forEach((slot, i) => {
        const sample = staying[0];
        if (!sample) return;
        const dest = this.meepleSlotRect(row.shelf!, slot, sample);
        const el = takeNearest(staying, slot.color, dest);
        if (el) filled[row.loc][i] = el;
      });
    }

    for (const row of slotsByLoc) {
      row.slots.forEach((slot, i) => {
        if (filled[row.loc][i]) return;
        let el: HTMLElement | null = null;
        const sample = row.shelf?.querySelector('.bae_meeple_img') as HTMLElement | null
          ?? currentAt(0)[0]
          ?? currentAt(1)[0]
          ?? currentAt(2)[0]
          ?? currentAt(3)[0]
          ?? currentAt(4)[0];
        const dest = row.shelf && sample
          ? this.meepleSlotRect(row.shelf, slot, sample)
          : new DOMRect(0, 0, 1, 1);
        for (let from = 0; from <= 4 && !el; from++) {
          el = takeNearest(currentAt(from), slot.color, dest);
        }
        if (el) filled[row.loc][i] = el;
      });
    }

    for (const row of slotsByLoc) {
      if (!row.shelf) continue;
      row.slots.forEach((slot, i) => {
        const el = filled[row.loc][i];
        if (!el) return;
        const dest = this.meepleSlotRect(row.shelf!, slot, el);
        const r = el.getBoundingClientRect();
        if (Math.abs(r.left - dest.left) < 3 && Math.abs(r.top - dest.top) < 3) return;
        assigned.push({ el, dest });
      });
    }

    const movers = new Set(assigned.map((row) => row.el));
    const destOf = new Map(assigned.map((row) => [row.el, row.dest] as const));
    const stackItems: Array<{ clone: HTMLElement; from: DOMRect; dest: DOMRect }> = [];
    const seen = new Set<HTMLElement>();
    const consider = (el: HTMLElement) => {
      if (seen.has(el)) return;
      seen.add(el);
      const from = el.getBoundingClientRect();
      const dest = destOf.get(el) ?? from;
      const clone = placeScientistClone(el, 'bae_resolve_clone', root);
      el.style.visibility = 'hidden';
      stackItems.push({ clone, from, dest });
      if (movers.has(el)) flights.push(flyClone(clone, dest, ms, root, true));
    };
    for (const { el } of assigned) consider(el);
    for (let loc = 0; loc <= 4; loc++) {
      for (const el of currentAt(loc)) consider(el);
    }

    stackByScreenPosition(stackItems.map((it) => ({
      el: it.clone,
      top: it.from.top,
      left: it.from.left,
    })));
    if (ms > 0) {
      void wait(ms / 2).then(() => {
        stackByScreenPosition(stackItems.map((it) => ({
          el: it.clone,
          top: it.dest.top,
          left: it.dest.left,
        })));
      });
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
    const probe = sample.cloneNode(true) as HTMLElement;
    probe.removeAttribute('id');
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.left = `${slot.leftPct}%`;
    probe.style.top = `${slot.topPct}%`;
    shelf.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    if (rect.width < 1 || rect.height < 1) {
      return this.meepleSlotRectFromBox(shelf.getBoundingClientRect(), slot, sample);
    }
    return rect;
  }

  private meepleSlotRectFromBox(
    box: DOMRect,
    slot: { leftPct: number; topPct: number },
    sample: HTMLElement,
  ): DOMRect {
    const size = sample.getBoundingClientRect();
    const cx = box.left + box.width * slot.leftPct / 100;
    const cy = box.top + box.height * slot.topPct / 100;
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

