import {
  AnimalDefLite,
  canObserveAtLocation,
  flagWouldAdvance,
  missingScientistColors,
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
  visualRect,
  stackByScreenPosition,
  startDiscardGhost,
  startScientistTrail,
  startScientistTrailToRect,
  retargetPreviewClones,
  motionLayer,
  wait,
} from './Motion';
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
  confirmObserveIfReady(cardId: number | null, location: number | null): boolean;
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
 * OPTIONAL: Client-only UX (subtle previews, resolution motion, invalid-action hints, DnD, sound).
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
  private tooltipPointerHeld = false;
  private tooltipDragging = false;
  private tooltipPinnedId: string | null = null;
  private lastPointerWasTouch = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private suppressClickUntil = 0;
  private pointerDrag: {
    pointerId: number;
    kind: 'hand' | 'pool';
    cardId?: number;
    poolSlot?: number;
    source: HTMLElement;
    startX: number;
    startY: number;
    ghost: HTMLElement | null;
    active: boolean;
  } | null = null;
  private dragClearedSelection = false;
  private lastHoverEl: Element | null = null;
  private static readonly POINTER_DRAG_PX = 16;
  private static readonly TOUCH_TAP_PX = 24;
  private previewLocked = false;
  private lastClaimFlightKey = '';
  private static readonly TOOLTIP_CLICK_MS = 500;
  private roundBadgeForced: boolean | null = null;
  private roundBadgeCompact = false;
  private touchHitEl: HTMLElement | null = null;
  private touchHitBox: HTMLElement | null = null;
  private layoutChromeRaf = 0;
  private tooltipFitTimers: number[] = [];
  private tooltipFitGen = 0;
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
    this.syncTopRowWrap();
    this.syncRoundBadge();
    this.updateActionPreviews();
    this.bindPreferenceListener();
    this.scheduleLayoutChrome();
  }

  teardown(): void {
    this.cancelPointerDrag();
    this.clearTouchHit();
    this.clearTooltipFitTimers();
    document.body.classList.remove('bae_tooltip_placing');
    this.touchHitBox?.remove();
    this.touchHitBox = null;
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
    this.host.root?.querySelectorAll('.bae_loc_selected, .bae_loc_invalid, .bae_camp_selected').forEach((el) => {
      el.classList.remove('bae_loc_selected', 'bae_loc_invalid', 'bae_camp_selected');
    });
    this.host.root?.querySelectorAll('.bae_confirm_blurb:not(.bae_drop_confirm)').forEach((el) => el.remove());
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
    this.scheduleLayoutChrome();
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

  /** Invalid observe is shown as a red location outline and missing-scientist X previews. */
  showInvalidObserveHint(): void {
    this.updateActionPreviews();
  }

  playSoundKind(kind: 'select' | 'success' | 'claim'): void {
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

  private prepareResolution(zones: string[] = ['all'], keepRegroupSelection = false): void {
    this.beginTooltipGuard(zones);
    this.clearPreviews();
    this.host.selectedCardId = null;
    this.host.selectedLocation = null;
    this.host.selectedPoolSlot = null;
    this.host.selectedObjectiveIdx = null;
    this.host.campSelected = false;
    if (!keepRegroupSelection) {
      this.host.selectedRegroupIds.clear();
      this.host.root.querySelectorAll('.bae_card_selected, .bae_card_regroup').forEach((el) => {
        el.classList.remove('bae_card_selected', 'bae_card_regroup');
      });
    } else {
      this.host.root.querySelectorAll('.bae_card_selected').forEach((el) => {
        el.classList.remove('bae_card_selected');
      });
    }
    this.host.root.querySelectorAll('.bae_loc_selected, .bae_loc_invalid').forEach((el) => {
      el.classList.remove('bae_loc_selected', 'bae_loc_invalid');
    });
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
        clone.querySelector('.bae_card_img')?.classList.add('bae_pile_card_img');
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
          this.placeDenyX(flagEl, Math.round(ms * 0.85), false);
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
      const vpSources = allMeeples.map((el) => visualRect(el));
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
      await Promise.all(dests.map((dest, i) => {
        return wait(Math.round(ms * 0.33 * i)).then(() => {
          const id = nextPool.find((p) => Number(p.slot) === dest.slot)?.id;
          const refill = this.cloneForHandDraw(deck, id);
          return flyClone(refill, dest.rect, ms, root, true);
        });
      }));
    } finally {
      this.endResolution();
    }
  }

  async playMulliganHandResolution(prev: BoardState, args: Record<string, unknown>): Promise<void> {
    const ms = this.duration();
    if (ms === 0 || this.resolving) return;
    this.resolving = true;
    const pid = Number(args.player_id ?? args.playerId ?? 0);
    const myId = Number(this.host.bga.players.getCurrentPlayerId());
    const keepRegroupSelection = this.host.isOpeningMulliganLike() && pid !== myId;
    this.prepareResolution([`player:${pid}`], keepRegroupSelection);
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
    const idx = Number(args.objective_index ?? args.objectiveIndex ?? NaN);
    const key = `${pid}:${Number.isFinite(idx) ? idx : 'x'}`;
    if (this.lastClaimFlightKey === key) return;
    if (ms === 0 || this.resolving || !pid) return;
    this.lastClaimFlightKey = key;
    this.resolving = true;
    this.prepareResolution([`player:${pid}`]);
    try {
      const obj = Number.isFinite(idx)
        ? this.host.root.querySelector(`#bae_obj_${idx}`) as HTMLElement | null
        : (this.host.root.querySelector('.bae_obj_selected, .bae_obj_prompt_target') as HTMLElement | null);
      const from = rectOf(obj)
        ?? rectOf(this.host.root.querySelector('.bae_top_objectives') as HTMLElement | null);
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
    let badge = this.host.root.querySelector('.bae_round_badge') as HTMLButtonElement | null;
    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'bae_round_badge';
      badge.setAttribute('aria-live', 'polite');
      badge.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.roundBadgeForced = !this.roundBadgeCompact;
        this.syncRoundBadge();
      });
      this.host.root.appendChild(badge);
    }
    this.syncRoundBadge();
  }

  private scheduleLayoutChrome(): void {
    if (this.layoutChromeRaf) return;
    this.layoutChromeRaf = requestAnimationFrame(() => {
      this.layoutChromeRaf = 0;
      const wrapChanged = this.syncTopRowWrap();
      this.syncRoundBadge();
      if (wrapChanged) this.updateActionPreviews();
      else retargetPreviewClones(this.host.root);
      if (this.tooltipPinnedId && !document.body.classList.contains('bae_tooltip_placing')) {
        this.fitPinnedTooltip();
      }
    });
  }

  private syncTopRowWrap(): boolean {
    const row = this.host.root.querySelector('.bae_toprow') as HTMLElement | null;
    if (!row) return false;
    const kids = Array.from(row.children) as HTMLElement[];
    if (kids.length < 2) {
      const had = row.classList.contains('bae_toprow_wrapped');
      row.classList.remove('bae_toprow_wrapped');
      return had;
    }
    const gap = parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap) || 0;
    const total = kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0) + gap * (kids.length - 1);
    const wrapped = total > row.clientWidth + 2;
    if (row.classList.contains('bae_toprow_wrapped') === wrapped) return false;
    row.classList.toggle('bae_toprow_wrapped', wrapped);
    return true;
  }

  private syncRoundBadge(): void {
    const badge = this.host.root.querySelector('.bae_round_badge') as HTMLElement | null;
    if (!badge) return;
    const round = this.host.gamedatas.boardState.round ?? 1;
    const final = (this.host.gamedatas.boardState.playersEndingGame?.length ?? 0) > 0;
    const full = final
      ? `${_('Round')} ${round} — ${_('Final round')}`
      : `${_('Round')} ${round}`;
    const short = `R${round}`;
    let compact = this.roundBadgeForced;
    if (compact == null) {
      badge.textContent = full;
      compact = this.roundBadgeOverlapsTop();
    }
    this.roundBadgeCompact = compact;
    badge.textContent = compact ? short : full;
    badge.setAttribute('aria-label', full);
    badge.title = full;
  }

  private roundBadgeOverlapsTop(): boolean {
    const badge = this.host.root.querySelector('.bae_round_badge') as HTMLElement | null;
    const row = this.host.root.querySelector('.bae_toprow');
    if (!badge || !row) return false;
    const br = badge.getBoundingClientRect();
    if (br.width < 1 || br.height < 1) return false;
    for (const group of row.querySelectorAll('.bae_top_group')) {
      const gr = group.getBoundingClientRect();
      if (gr.width < 1 || gr.height < 1) continue;
      const overlap = br.left < gr.right && br.right > gr.left && br.top < gr.bottom && br.bottom > gr.top;
      if (overlap) return true;
    }
    return false;
  }

  private clearPreviews(): void {
    this.clearDiscardGhosts();
    this.clearTransientPreviews();
    clearMotionLayer(this.host.root);
    document.querySelectorAll('.bae_motion_clone, .bae_invalid_bubble').forEach((el) => el.remove());
  }

  private clearTransientPreviews(): void {
    if (!this.host.root) return;
    this.host.root.querySelectorAll('.bae_motion_clone:not(.bae_discard_ghost):not(.bae_pointer_ghost), .bae_invalid_bubble').forEach((el) => el.remove());
    document.querySelectorAll('body > .bae_motion_clone:not(.bae_discard_ghost):not(.bae_pointer_ghost), body > .bae_invalid_bubble').forEach((el) => el.remove());
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

    this.previewObjectiveClaim(myId);

    if (selectingDiscards) this.syncDiscardGhosts(myId);
  }

  private previewObjectiveClaim(pid: number): void {
    const selected = this.host.root.querySelector(
      '.bae_obj_selected, .bae_obj_prompt_target',
    ) as HTMLElement | null;
    if (!selected) return;
    const source = (selected.querySelector('.bae_obj_img, .bae_overlay_card') as HTMLElement | null) ?? selected;
    this.vp.previewTokensFrom(pid, [source], 5, this.previewLoopMs());
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
    const missing = missingScientistColors(def, this.host.gamedatas.boardState.scientists, pid, loc);
    if (missing.length > 0) this.previewMissingScientists(pid, loc, missing, ms);
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
      this.placeDenyX(flag, Math.max(1, Math.round(ms / 2)), true);
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
    const destShelf = this.shelfEl(pid, layoutLoc);
    const shelfBox = destShelf?.getBoundingClientRect();
    const shelfIsDest = !!(destShelf && shelfBox
      && Math.abs(shelfBox.left - destBox.left) < 12
      && Math.abs(shelfBox.top - destBox.top) < 12);
    const existing = shelfIsDest
      ? (Array.from(destShelf!.querySelectorAll('.bae_meeple_img')) as HTMLElement[]).filter((el) => !sources.includes(el))
      : [];
    const dests = this.incomingMeepleRects(shelfIsDest ? destShelf : null, destBox, existing, sources, pid, layoutLoc);
    const trails: Array<{ el: HTMLElement; top: number; left: number }> = [];
    sources.forEach((el, i) => {
      const dest = dests[i];
      if (!dest) return;
      const destFn = (): DOMRect | null => {
        const box = getDestBox();
        if (!box) return null;
        const shelf = this.shelfEl(pid, layoutLoc);
        const nextBox = shelf?.getBoundingClientRect();
        const useShelf = !!(shelf && nextBox
          && Math.abs(nextBox.left - box.left) < 12
          && Math.abs(nextBox.top - box.top) < 12);
        const still = useShelf
          ? (Array.from(shelf!.querySelectorAll('.bae_meeple_img')) as HTMLElement[]).filter((n) => !sources.includes(n))
          : [];
        return this.incomingMeepleRects(useShelf ? shelf : null, box, still, sources, pid, layoutLoc)[i] ?? null;
      };
      const clone = startScientistTrailToRect(el, dest, ms, this.host.root, destFn);
      trails.push({ el: clone, top: dest.top, left: dest.left });
    });
    stackByScreenPosition(trails);
  }

  private incomingMeepleRects(
    destShelf: HTMLElement | null,
    destBox: DOMRect,
    existing: HTMLElement[],
    incoming: HTMLElement[],
    pid: number,
    loc: number,
  ): DOMRect[] {
    if (incoming.length === 0) return [];
    const sample = incoming[0] ?? existing[0];
    if (!sample) return [];
    const sci: Record<number, number[]> = { 0: [], 1: [], 2: [] };
    for (const el of [...existing, ...incoming]) {
      const color = Number(el.dataset.scientist);
      if (color >= 0 && color < 3) sci[color].push(loc);
    }
    const slots = this.scientistLayout(pid, { [pid]: sci }, loc);
    const occupied = existing.map((el) => visualRect(el));
    const candidates = slots.map((slot) => (
      destShelf
        ? this.meepleSlotRect(destShelf, slot, sample)
        : this.meepleSlotRectFromBox(destBox, slot, sample)
    ));
    const free = candidates.filter((rect) => !occupied.some((occ) => this.meepleRectsOverlap(rect, occ)));
    const out: DOMRect[] = [];
    const taken: DOMRect[] = [...occupied];
    for (let i = 0; i < incoming.length; i++) {
      const pick = (free[i] && !taken.some((occ) => this.meepleRectsOverlap(free[i], occ)))
        ? free[i]
        : this.nudgeMeepleRect(
          free[i] ?? this.meepleSlotRectFromBox(destBox, { leftPct: 50, topPct: 50 }, incoming[i] ?? sample),
          taken,
          destBox,
        );
      out.push(pick);
      taken.push(pick);
    }
    return out;
  }

  private meepleRectsOverlap(a: DOMRect, b: DOMRect): boolean {
    const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (overlapX <= 0 || overlapY <= 0) return false;
    return overlapX * overlapY > Math.min(a.width * a.height, b.width * b.height) * 0.32;
  }

  private nudgeMeepleRect(rect: DOMRect, occupied: DOMRect[], box: DOMRect): DOMRect {
    const step = Math.max(8, rect.width * 0.42);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (let ring = 0; ring < 12; ring++) {
      const [dx, dy] = dirs[ring % dirs.length];
      const mag = 1 + Math.floor(ring / dirs.length);
      const left = Math.min(box.right - rect.width, Math.max(box.left, rect.left + dx * step * mag));
      const top = Math.min(box.bottom - rect.height, Math.max(box.top, rect.top + dy * step * mag));
      const cand = new DOMRect(left, top, rect.width, rect.height);
      if (!occupied.some((occ) => this.meepleRectsOverlap(cand, occ))) return cand;
    }
    return rect;
  }

  private previewMissingScientists(pid: number, loc: number, colors: number[], ms: number): void {
    const shelf = this.shelfEl(pid, loc);
    if (!shelf || colors.length === 0) return;
    const dests = this.extraMeepleRects(shelf, colors.length, pid, loc);
    const pulse = Math.max(1, Math.round(ms / 2));
    colors.forEach((color, i) => {
      const dest = dests[i];
      if (!dest || dest.width < 2 || dest.height < 2) return;
      this.placeMissingScientist(color, dest, pulse);
    });
  }

  private extraMeepleRects(shelf: HTMLElement, extraCount: number, pid: number, loc: number): DOMRect[] {
    if (extraCount <= 0) return [];
    const existing = Array.from(shelf.querySelectorAll('.bae_meeple_img')) as HTMLElement[];
    const sizeSample = existing[0]
      ?? this.host.root.querySelector('.bae_meeple_img') as HTMLElement | null;
    if (!sizeSample) return [];
    const sci: Record<number, number[]> = { 0: [], 1: [], 2: [] };
    for (const el of existing) {
      const color = Number(el.dataset.scientist);
      if (color >= 0 && color < 3) sci[color].push(loc);
    }
    for (let i = 0; i < extraCount; i++) sci[0].push(loc);
    const slots = this.scientistLayout(pid, { [pid]: sci }, loc);
    const occupied = existing.map((el) => visualRect(el));
    const candidates = slots.map((slot) => this.meepleSlotRect(shelf, slot, sizeSample));
    const free = candidates.filter((rect) => !occupied.some((occ) => this.meepleRectsOverlap(rect, occ)));
    const box = shelf.getBoundingClientRect();
    const size = visualRect(sizeSample);
    const room = new DOMRect(
      box.left - size.width * 0.3,
      box.top - size.height * 0.3,
      box.width + size.width * 0.6,
      box.height + size.height * 0.6,
    );
    const out: DOMRect[] = [];
    const taken = [...occupied];
    for (let i = 0; i < extraCount; i++) {
      const unused = free.find((rect) => !taken.some((occ) => this.meepleRectsOverlap(rect, occ)));
      const base = unused ?? new DOMRect(
        box.left + box.width * (0.35 + 0.18 * i) - size.width / 2,
        box.top + box.height * 0.55 - size.height / 2,
        size.width,
        size.height,
      );
      const pick = this.nudgeMeepleRect(base, taken, room);
      out.push(pick);
      taken.push(pick);
    }
    return out;
  }

  private ghostMeeple(color: number): HTMLElement | null {
    const exact = this.host.root.querySelector(`.bae_meeple_img[data-scientist="${color}"]`) as HTMLElement | null;
    const any = exact ?? this.host.root.querySelector('.bae_meeple_img') as HTMLElement | null;
    if (!any) return null;
    const clone = any.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.dataset.scientist = String(color);
    clone.classList.remove('bae_preview_fade_left', 'bae_motion_clone', 'bae_missing_sci');
    if (!exact) {
      clone.classList.remove('bae_meeple_yellow', 'bae_meeple_pink', 'bae_meeple_teal');
      clone.classList.add(['bae_meeple_yellow', 'bae_meeple_pink', 'bae_meeple_teal'][color] ?? 'bae_meeple_yellow');
      const files = ['YellowMeeple', 'PinkMeeple', 'TealMeeple'];
      (clone as HTMLImageElement).src = `${this.host.bga.images.getImgUrl()}Tokens/${files[color] ?? files[0]}.webp`;
    }
    return clone;
  }

  private placeMissingScientist(color: number, dest: DOMRect, ms: number): void {
    const ghost = this.ghostMeeple(color);
    if (!ghost) return;
    const layer = motionLayer(this.host.root);
    const loc = coordsInParent(layer, dest);
    const wrap = document.createElement('div');
    wrap.className = 'bae_motion_clone bae_missing_sci';
    wrap.style.position = 'absolute';
    wrap.style.left = `${loc.left}px`;
    wrap.style.top = `${loc.top}px`;
    wrap.style.width = `${loc.width}px`;
    wrap.style.height = `${loc.height}px`;
    wrap.style.margin = '0';
    wrap.style.overflow = 'visible';
    wrap.style.pointerEvents = 'none';
    wrap.style.zIndex = '75';
    wrap.style.setProperty('--dur', `${ms}ms`);
    ghost.style.position = 'absolute';
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.width = '100%';
    ghost.style.height = '100%';
    ghost.style.margin = '0';
    ghost.style.transform = 'none';
    wrap.appendChild(ghost);
    const x = document.createElement('div');
    x.className = 'bae_deny_x';
    wrap.appendChild(x);
    layer.appendChild(wrap);
  }

  private placeDenyX(at: HTMLElement, ms: number, loop: boolean): HTMLElement {
    const layer = motionLayer(this.host.root);
    const r = visualRect(at);
    const loc = coordsInParent(layer, r);
    const size = Math.max(r.width, r.height, 12);
    const x = document.createElement('div');
    x.className = `bae_motion_clone bae_deny_x ${loop ? 'bae_deny_pulse' : 'bae_deny_once'}`;
    x.style.position = 'absolute';
    x.style.left = `${loc.left + (r.width - size) / 2}px`;
    x.style.top = `${loc.top + (r.height - size) / 2}px`;
    x.style.width = `${size}px`;
    x.style.height = `${size}px`;
    x.style.margin = '0';
    x.style.pointerEvents = 'none';
    x.style.zIndex = '85';
    x.style.setProperty('--dur', `${Math.max(1, ms)}ms`);
    layer.appendChild(x);
    return x;
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
      if (this.canPointerDragHand()) htmlEl.style.touchAction = 'none';
      const onDragStart = (ev: DragEvent) => {
        if (this.host.isActionBusy()) {
          ev.preventDefault();
          return;
        }
        this.dragCardId = Number(htmlEl.dataset.handCard);
        this.dragClearedSelection = false;
        ev.dataTransfer?.setData('text/bae-card', String(this.dragCardId));
        htmlEl.classList.add('bae_dragging');
        this.playSoundKind('select');
      };
      const onDragEnd = () => {
        htmlEl.classList.remove('bae_dragging');
        this.dragCardId = null;
        this.dragClearedSelection = false;
        this.clearDropHighlights();
      };
      const onPointerDown = (ev: PointerEvent) => {
        if (ev.pointerType !== 'touch' || this.host.isActionBusy() || !this.canPointerDragHand()) return;
        this.beginPointerDragWatch(ev, {
          kind: 'hand',
          cardId: Number(htmlEl.dataset.handCard),
          source: htmlEl,
        });
      };
      htmlEl.addEventListener('dragstart', onDragStart);
      htmlEl.addEventListener('dragend', onDragEnd);
      htmlEl.addEventListener('pointerdown', onPointerDown);
      this.cleanupFns.push(() => {
        htmlEl.removeEventListener('dragstart', onDragStart);
        htmlEl.removeEventListener('dragend', onDragEnd);
        htmlEl.removeEventListener('pointerdown', onPointerDown);
      });
    });

    this.host.root.querySelectorAll(`.bae_location_zone[data-player-id="${myId}"]`).forEach((el) => {
      const htmlEl = el as HTMLElement;
      const onDragOver = (ev: DragEvent) => {
        if (this.dragCardId == null || !this.host.isGameplayLike()) return;
        ev.preventDefault();
        this.markLocationDropHover(htmlEl);
      };
      const onDragLeave = (ev: DragEvent) => {
        const next = ev.relatedTarget as Node | null;
        if (next && htmlEl.contains(next)) return;
        if (htmlEl.classList.contains('bae_drop_hover')) this.clearDropHighlights();
      };
      const onDrop = (ev: DragEvent) => {
        ev.preventDefault();
        this.clearDropHighlights();
        const cardId = Number(ev.dataTransfer?.getData('text/bae-card') || this.dragCardId);
        this.applyHandDropOnLocation(cardId, Number(htmlEl.dataset.loc));
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
        this.markDropHover(htmlEl, true);
      };
      const onDragLeave = (ev: DragEvent) => {
        const next = ev.relatedTarget as Node | null;
        if (next && htmlEl.contains(next)) return;
        if (htmlEl.classList.contains('bae_drop_hover')) this.clearDropHighlights();
      };
      const onDrop = (ev: DragEvent) => {
        ev.preventDefault();
        this.clearDropHighlights();
        const cardId = Number(ev.dataTransfer?.getData('text/bae-card') || this.dragCardId);
        this.applyHandDropOnCamp(cardId);
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

    const handCol = this.host.root.querySelector(`.bae_player_handcol[data-player-id="${myId}"]`);
    if (handCol) {
      const onDragOver = (ev: DragEvent) => {
        if (!this.host.isReplenishLike()) return;
        ev.preventDefault();
        this.markDropHover(handCol as HTMLElement, true);
      };
      const onDragLeave = (ev: DragEvent) => {
        const next = ev.relatedTarget as Node | null;
        if (next && (handCol as HTMLElement).contains(next)) return;
        if ((handCol as HTMLElement).classList.contains('bae_drop_hover')) this.clearDropHighlights();
      };
      const onDrop = (ev: DragEvent) => {
        if (!this.host.isReplenishLike() || this.host.isActionBusy() || !this.host.bga.players.isCurrentPlayerActive()) return;
        ev.preventDefault();
        this.clearDropHighlights();
        const slotRaw = ev.dataTransfer?.getData('text/bae-pool');
        if (slotRaw === '' || slotRaw == null) return;
        this.applyPoolDropOnHand(Number(slotRaw));
      };
      handCol.addEventListener('dragover', onDragOver);
      handCol.addEventListener('dragleave', onDragLeave);
      handCol.addEventListener('drop', onDrop);
      this.cleanupFns.push(() => {
        handCol.removeEventListener('dragover', onDragOver);
        handCol.removeEventListener('dragleave', onDragLeave);
        handCol.removeEventListener('drop', onDrop);
      });
    }

    this.host.root.querySelectorAll('[data-pool-slot]').forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.setAttribute('draggable', 'true');
      if (this.canPointerDragPool()) htmlEl.style.touchAction = 'none';
      const onDragStart = (ev: DragEvent) => {
        if (this.host.isActionBusy() || !this.host.isReplenishLike()) {
          ev.preventDefault();
          return;
        }
        ev.dataTransfer?.setData('text/bae-pool', String(htmlEl.dataset.poolSlot));
        this.dragClearedSelection = false;
      };
      const onDragEnd = () => {
        this.dragClearedSelection = false;
        this.clearDropHighlights();
      };
      const onPointerDown = (ev: PointerEvent) => {
        if (ev.pointerType !== 'touch' || this.host.isActionBusy() || !this.canPointerDragPool()) return;
        this.beginPointerDragWatch(ev, {
          kind: 'pool',
          poolSlot: Number(htmlEl.dataset.poolSlot),
          source: htmlEl,
        });
      };
      htmlEl.addEventListener('dragstart', onDragStart);
      htmlEl.addEventListener('dragend', onDragEnd);
      htmlEl.addEventListener('pointerdown', onPointerDown);
      this.cleanupFns.push(() => {
        htmlEl.removeEventListener('dragstart', onDragStart);
        htmlEl.removeEventListener('dragend', onDragEnd);
        htmlEl.removeEventListener('pointerdown', onPointerDown);
      });
    });
  }

  private canPointerDragHand(): boolean {
    return this.host.isGameplayLike()
      && this.host.bga.players.isCurrentPlayerActive()
      && !this.host.isActionBusy();
  }

  private canPointerDragPool(): boolean {
    return this.host.isReplenishLike()
      && this.host.bga.players.isCurrentPlayerActive()
      && !this.host.isActionBusy();
  }

  private applyHandDropOnLocation(cardId: number, loc: number): void {
    if (!Number.isFinite(cardId) || this.host.isActionBusy() || !this.host.isGameplayLike() || !this.host.bga.players.isCurrentPlayerActive()) return;
    this.host.campSelected = false;
    this.host.selectedRegroupIds.clear();
    this.host.selectedPoolSlot = null;
    this.host.selectedObjectiveIdx = null;
    this.host.root.querySelectorAll('.bae_loc_selected, .bae_loc_invalid').forEach((el) => {
      el.classList.remove('bae_loc_selected', 'bae_loc_invalid');
    });
    if (this.host.confirmObserveIfReady(cardId, loc)) return;
    this.host.selectedCardId = cardId;
    this.host.selectedLocation = loc;
    this.host.renderAll();
    this.host.onUpdateActionButtons(this.host.currentStateName(), this.host.cachedActionArgs);
    this.onSelectionChanged();
  }

  private applyHandDropOnCamp(cardId: number): void {
    if (!Number.isFinite(cardId) || this.host.isActionBusy() || !this.host.isGameplayLike() || !this.host.bga.players.isCurrentPlayerActive()) return;
    this.host.enterRegroupMode();
    this.host.selectedRegroupIds.add(cardId);
    this.host.onUpdateActionButtons(this.host.currentStateName(), this.host.cachedActionArgs);
    this.onSelectionChanged();
  }

  private applyPoolDropOnHand(slot: number): void {
    if (!Number.isFinite(slot) || this.host.isActionBusy() || !this.host.isReplenishLike() || !this.host.bga.players.isCurrentPlayerActive()) return;
    void this.host.sendAction('actTakeAnimal', { pool_slot: slot });
  }

  private beginPointerDragWatch(
    ev: PointerEvent,
    info: { kind: 'hand' | 'pool'; cardId?: number; poolSlot?: number; source: HTMLElement },
  ): void {
    if (!ev.isPrimary) return;
    this.cancelPointerDrag();
    this.pointerDrag = {
      pointerId: ev.pointerId,
      kind: info.kind,
      cardId: info.cardId,
      poolSlot: info.poolSlot,
      source: info.source,
      startX: ev.clientX,
      startY: ev.clientY,
      ghost: null,
      active: false,
    };
  }

  private tickPointerDrag(ev: PointerEvent): void {
    const drag = this.pointerDrag;
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    if (!drag.active) {
      if (dx * dx + dy * dy < OptionalUi.POINTER_DRAG_PX * OptionalUi.POINTER_DRAG_PX) return;
      this.activatePointerDrag(ev, drag);
    }
    if (!drag.active || !drag.ghost) return;
    ev.preventDefault();
    this.placePointerGhost(drag.ghost, ev.clientX, ev.clientY);
    this.highlightPointerDropTarget(ev.clientX, ev.clientY, drag.kind);
  }

  private activatePointerDrag(ev: PointerEvent, drag: NonNullable<OptionalUi['pointerDrag']>): void {
    drag.active = true;
    this.tooltipDragging = true;
    this.tooltipPointerHeld = true;
    this.dragCardId = drag.kind === 'hand' ? (drag.cardId ?? null) : null;
    this.dragClearedSelection = false;
    drag.source.classList.add('bae_dragging');
    this.clearTouchHit();
    try { drag.source.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    const ghost = drag.source.cloneNode(true) as HTMLElement;
    ghost.classList.add('bae_pointer_ghost', 'bae_motion_clone');
    ghost.classList.remove('bae_dragging');
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    const r = drag.source.getBoundingClientRect();
    ghost.style.position = 'absolute';
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    ghost.style.margin = '0';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '90';
    ghost.style.opacity = '0.92';
    motionLayer(this.host.root).appendChild(ghost);
    drag.ghost = ghost;
    this.placePointerGhost(ghost, ev.clientX, ev.clientY);
    this.playSoundKind('select');
  }

  private placePointerGhost(ghost: HTMLElement, clientX: number, clientY: number): void {
    const layer = motionLayer(this.host.root);
    const w = ghost.offsetWidth;
    const h = ghost.offsetHeight;
    const loc = coordsInParent(layer, new DOMRect(clientX - w / 2, clientY - h / 2, w, h));
    ghost.style.left = `${loc.left}px`;
    ghost.style.top = `${loc.top}px`;
  }

  private highlightPointerDropTarget(clientX: number, clientY: number, kind: 'hand' | 'pool'): void {
    const target = this.pointerDropTarget(clientX, clientY, kind);
    if (target?.classList.contains('bae_location_zone')) this.markLocationDropHover(target);
    else this.markDropHover(target, true);
  }

  private pointerDropTarget(clientX: number, clientY: number, kind: 'hand' | 'pool'): HTMLElement | null {
    const myId = Number(this.host.bga.players.getCurrentPlayerId());
    for (const node of document.elementsFromPoint(clientX, clientY)) {
      const el = node as HTMLElement;
      if (el.classList.contains('bae_pointer_ghost') || el.classList.contains('bae_motion_clone')) continue;
      if (kind === 'hand') {
        const loc = el.closest?.(`.bae_location_zone[data-player-id="${myId}"]`) as HTMLElement | null;
        if (loc && this.host.isGameplayLike()) return loc;
        const camp = el.closest?.(`.bae_camp_zone[data-player-id="${myId}"]`) as HTMLElement | null;
        if (camp && this.host.isGameplayLike()) return camp;
      } else {
        const hand = el.closest?.(`.bae_player_handcol[data-player-id="${myId}"]`) as HTMLElement | null;
        if (hand && this.host.isReplenishLike()) return hand;
      }
    }
    return null;
  }

  /** @returns true if a drag was in progress and consumed the pointer. */
  private finishPointerDrag(ev: PointerEvent): boolean {
    const drag = this.pointerDrag;
    if (!drag || ev.pointerId !== drag.pointerId) return false;
    const wasActive = drag.active;
    const { kind, cardId, poolSlot } = drag;
    if (wasActive) {
      this.suppressClickUntil = Date.now() + 400;
      const target = this.pointerDropTarget(ev.clientX, ev.clientY, kind);
      if (kind === 'hand' && cardId != null && target) {
        if (target.classList.contains('bae_location_zone')) {
          this.applyHandDropOnLocation(cardId, Number(target.dataset.loc));
        } else if (target.classList.contains('bae_camp_zone')) {
          this.applyHandDropOnCamp(cardId);
        }
      } else if (kind === 'pool' && poolSlot != null && target) {
        this.applyPoolDropOnHand(poolSlot);
      }
    }
    this.cancelPointerDrag();
    return wasActive;
  }

  private cancelPointerDrag(): void {
    const drag = this.pointerDrag;
    this.pointerDrag = null;
    this.tooltipDragging = false;
    if (!drag) return;
    drag.ghost?.remove();
    drag.source.classList.remove('bae_dragging');
    try { drag.source.releasePointerCapture(drag.pointerId); } catch { /* ignore */ }
    this.dragCardId = null;
    this.dragClearedSelection = false;
    this.clearDropHighlights();
    this.clearTouchHit();
  }

  private markDropHover(el: HTMLElement | null, confirm: boolean): void {
    if (confirm && el) this.suppressSelectionGraphicsForDrag();
    const prev = this.host.root.querySelector('.bae_drop_hover') as HTMLElement | null;
    if (prev === el) {
      if (confirm && el && !el.querySelector('.bae_drop_confirm')) this.addDropConfirm(el);
      return;
    }
    this.clearDropHighlights();
    if (!el) return;
    el.classList.add('bae_drop_hover');
    if (confirm) this.addDropConfirm(el);
  }

  private markLocationDropHover(locEl: HTMLElement): void {
    const cardId = this.dragCardId ?? this.pointerDrag?.cardId ?? null;
    const loc = Number(locEl.dataset.loc);
    const myId = Number(this.host.bga.players.getCurrentPlayerId());
    const legal = cardId != null && canObserveAtLocation(
      this.host.animalDef(cardId),
      this.host.gamedatas.boardState.scientists,
      myId,
      loc,
    );
    if (legal) this.suppressSelectionGraphicsForDrag();
    const prev = this.host.root.querySelector('.bae_drop_hover') as HTMLElement | null;
    if (prev === locEl) {
      locEl.classList.toggle('bae_drop_hover_invalid', !legal);
      if (legal && !locEl.querySelector('.bae_drop_confirm')) this.addDropConfirm(locEl);
      if (!legal) locEl.querySelectorAll('.bae_drop_confirm').forEach((n) => n.remove());
      return;
    }
    this.clearDropHighlights();
    locEl.classList.add('bae_drop_hover');
    locEl.classList.toggle('bae_drop_hover_invalid', !legal);
    if (legal) this.addDropConfirm(locEl);
  }

  /** Once a legal drop target is hovered, drop-hover is the only selection chrome. */
  private suppressSelectionGraphicsForDrag(): void {
    if (this.dragClearedSelection) return;
    this.dragClearedSelection = true;
    this.host.selectedLocation = null;
    this.host.selectedObjectiveIdx = null;
    this.host.selectedPoolSlot = null;
    this.clearTransientPreviews();
    this.clearTouchHit();
    const root = this.host.root;
    if (!root) return;
    root.querySelectorAll('.bae_loc_selected, .bae_loc_invalid, .bae_camp_selected, .bae_obj_selected').forEach((el) => {
      el.classList.remove('bae_loc_selected', 'bae_loc_invalid', 'bae_camp_selected', 'bae_obj_selected');
    });
    root.querySelectorAll('.bae_card_selected, .bae_card_invalid').forEach((el) => {
      if (el.classList.contains('bae_dragging') || el.classList.contains('bae_pointer_ghost')) return;
      el.classList.remove('bae_card_selected', 'bae_card_invalid');
    });
    root.querySelectorAll('.bae_confirm_blurb:not(.bae_drop_confirm)').forEach((el) => el.remove());
    this.host.onUpdateActionButtons(this.host.currentStateName(), this.host.cachedActionArgs);
  }

  private addDropConfirm(el: HTMLElement): void {
    if (el.querySelector('.bae_drop_confirm')) return;
    const span = document.createElement('span');
    span.className = 'bae_confirm_blurb bae_drop_confirm';
    if (el.classList.contains('bae_location_zone')) span.classList.add('bae_location_confirm');
    span.textContent = _('Confirm?');
    el.appendChild(span);
  }

  private clearDropHighlights(): void {
    this.host.root.querySelectorAll('.bae_drop_hover, .bae_drop_hover_invalid, .bae_drop_target').forEach((t) => {
      t.classList.remove('bae_drop_hover', 'bae_drop_hover_invalid', 'bae_drop_target');
    });
    this.host.root.querySelectorAll('.bae_drop_confirm').forEach((el) => el.remove());
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
    await Promise.all(dests.map((dest, i) => {
      const refill = this.cloneForHandDraw(deck, faces[i]);
      return wait(Math.round(ms * 0.5 * i)).then(() => flyClone(refill, dest, ms, root, true));
    }));
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
    overlay.querySelector('.bae_card_img')?.classList.add('bae_pile_card_img');
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
    const from = visualRect(el);
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
    const rect = visualRect(probe);
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
    const rect = visualRect(probe);
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
      if (this.tooltipPinnedId) return;
      if (this.isTooltipBlocked()) {
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        this.cancelDojoTooltips();
      }
    };
    const onClick = (ev: Event) => {
      if (Date.now() < this.suppressClickUntil) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        return;
      }
      if (this.lastPointerWasTouch && this.tooltipPinnedId) return;
      this.armTooltipQuiet(ev);
    };
    const onPointerDown = (ev: Event) => {
      const pointer = ev as PointerEvent;
      if (pointer.isPrimary === false) {
        this.cancelPointerDrag();
        return;
      }
      this.lastPointerWasTouch = pointer.pointerType === 'touch';
      this.tooltipPointerHeld = true;
      this.touchStartX = pointer.clientX ?? 0;
      this.touchStartY = pointer.clientY ?? 0;
      this.setTouchHit(ev.target as Element | null);
      if (this.lastPointerWasTouch) {
        return;
      }
      this.closePinnedTooltip();
      this.armTooltipQuiet(ev);
    };
    const onPointerUp = (ev: Event) => {
      const pointer = ev as PointerEvent;
      const dragged = this.finishPointerDrag(pointer);
      this.tooltipPointerHeld = false;
      this.clearTouchHit();
      if (dragged) {
        this.armTooltipQuiet(ev);
        return;
      }
      if (this.lastPointerWasTouch) {
        this.handleTouchTap(pointer);
        return;
      }
      this.armTooltipQuiet(ev);
    };
    const onPointerCancel = (ev: Event) => {
      this.cancelPointerDrag();
      this.tooltipPointerHeld = false;
      this.clearTouchHit();
      this.armTooltipQuiet(ev);
    };
    const onDragStart = (ev: Event) => {
      this.tooltipDragging = true;
      this.tooltipPointerHeld = true;
      this.closePinnedTooltip();
      this.armTooltipQuiet(ev);
    };
    const onDragEnd = (ev: Event) => {
      this.tooltipDragging = false;
      this.tooltipPointerHeld = false;
      this.armTooltipQuiet(ev);
    };
    const onMove = (ev: Event) => {
      if (ev instanceof PointerEvent) this.tickPointerDrag(ev);
      const mouse = ev as MouseEvent;
      const target = ev.target as Element | null;
      this.lastHoverEl = target;
      const buttons = mouse.buttons ?? 0;
      if (buttons !== 0) {
        if (!this.tooltipPointerHeld) this.tooltipPointerHeld = true;
      } else if (this.tooltipPointerHeld && !this.tooltipDragging && this.dragCardId == null && !this.pointerDrag) {
        this.tooltipPointerHeld = false;
        if (!this.lastPointerWasTouch) this.armTooltipQuiet(ev);
      }
      if (this.tooltipNeedMove && !this.tooltipPointerHeld && !this.tooltipDragging) {
        const dx = (mouse.clientX ?? 0) - this.tooltipClickX;
        const dy = (mouse.clientY ?? 0) - this.tooltipClickY;
        if (dx * dx + dy * dy >= 16) this.tooltipNeedMove = false;
      }
      if (this.tooltipLeaveSelector && !this.isHoveringLeaveTarget(target)) {
        this.tooltipLeaveSelector = null;
      }
      const blocked = this.isTooltipBlocked();
      if (blocked) this.cancelDojoTooltips();
      if (this.tooltipWasBlocked && !blocked) this.retriggerTooltipHover();
      this.tooltipWasBlocked = blocked;
    };
    const onMouseOut = (ev: Event) => {
      if (!this.tooltipPinnedId) return;
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    };
    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('mouseenter', onHover, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('pointermove', onMove, { capture: true, passive: false });
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragend', onDragEnd, true);
    document.addEventListener('drag', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousemove', onMove, true);
  }

  private armTooltipQuiet(ev: Event): void {
    this.tooltipPinnedId = null;
    const mouse = ev as MouseEvent;
    this.tooltipQuietUntil = Date.now() + OptionalUi.TOOLTIP_CLICK_MS;
    this.tooltipNeedMove = true;
    this.tooltipClickX = mouse.clientX ?? 0;
    this.tooltipClickY = mouse.clientY ?? 0;
    this.tooltipWasBlocked = true;
    const target = (ev.target as Element | null) ?? this.lastHoverEl;
    if (target && typeof target.closest === 'function') {
      const interacted = this.interactiveTooltipTarget(target) ?? target;
      this.tooltipLeaveSelector = this.selectorFor(interacted);
    }
    this.cancelDojoTooltips();
    this.dismissTooltipFrom(this.lastHoverEl);
  }

  private handleTouchTap(ev: PointerEvent): void {
    const dx = (ev.clientX ?? 0) - this.touchStartX;
    const dy = (ev.clientY ?? 0) - this.touchStartY;
    if (dx * dx + dy * dy >= OptionalUi.TOUCH_TAP_PX * OptionalUi.TOUCH_TAP_PX) {
      this.closePinnedTooltip();
      this.armTooltipQuiet(ev);
      return;
    }
    const target = (ev.target as Element | null) ?? this.lastHoverEl;
    if (this.isTapActionTarget(target)) {
      this.closePinnedTooltip();
      this.armTooltipQuiet(ev);
      return;
    }
    const id = this.tooltipHostId(target);
    if (!id) {
      this.closePinnedTooltip();
      this.armTooltipQuiet(ev);
      return;
    }
    if (this.tooltipPinnedId === id) {
      this.closePinnedTooltip();
      return;
    }
    this.openPinnedTooltip(id);
  }

  private isTapActionTarget(el: Element | null): boolean {
    if (!el || typeof el.closest !== 'function') return false;
    if (el.closest('.bae_zoom_btn, .bgabutton, .action-button, #pagemaintitle_wrap, .pref_pop, .debug_info')) return true;
    const myId = Number(this.host.bga.players.getCurrentPlayerId());
    const active = this.host.bga.players.isCurrentPlayerActive() && !this.host.isActionBusy();
    if (!active) return false;

    if (
      el.closest(`.bae_player_handcol[data-player-id="${myId}"] [data-hand-card]`)
      && (this.host.isGameplayLike() || this.host.isOpeningMulliganLike() || this.host.campSelected)
    ) return true;
    if (
      el.closest(`.bae_location_zone[data-player-id="${myId}"]`)
      && (this.host.isGameplayLike() || this.host.isAssignCampLike())
    ) return true;
    if (
      el.closest(`.bae_camp_zone[data-player-id="${myId}"], [data-camp-wrap][data-player-id="${myId}"]`)
      && this.host.isGameplayLike()
    ) return true;
    if (el.closest('[data-pool-slot]') && this.host.isReplenishLike()) return true;

    const objBtn = el.closest('[data-obj-idx]') as HTMLElement | null;
    if (!objBtn) return false;
    const idx = Number(objBtn.dataset.objIdx);
    const obj = this.host.gamedatas.boardState.objectives?.[idx];
    if (!obj?.active || (obj.players?.[myId] ?? 'unmet') !== 'meets') return false;
    if (this.host.isPromptClaimObjectiveLike()) return objBtn.classList.contains('bae_obj_prompt_target');
    if (this.host.isOpeningMulliganLike()) return false;
    return this.host.isGameplayLike() || this.host.isReplenishLike() || this.host.isAssignCampLike();
  }

  private tooltipHostId(el: Element | null): string | null {
    const tooltips = (this.host.bga.gameui as unknown as { tooltips?: Record<string, { open?: (id: string) => void }> }).tooltips;
    if (!tooltips) return null;
    let node: Element | null = el;
    while (node && node !== document.body) {
      const id = (node as HTMLElement).id;
      if (id && tooltips[id]) return id;
      if (node === this.host.root) break;
      node = node.parentElement;
    }
    return null;
  }

  private openPinnedTooltip(id: string): void {
    this.tooltipPinnedId = id;
    this.tooltipQuietUntil = 0;
    this.tooltipNeedMove = false;
    this.tooltipWasBlocked = false;
    const gen = this.beginTooltipPlace();
    this.cancelDojoTooltips();
    const showAndFit = (): void => {
      if (this.tooltipPinnedId !== id || this.tooltipFitGen !== gen) return;
      try {
        (this.host.bga.gameui as unknown as { tooltips?: Record<string, { open?: (id: string) => void }> }).tooltips?.[id]?.open?.(id);
      } catch { /* ignore */ }
      this.fitPinnedTooltip(gen);
    };
    showAndFit();
    this.tooltipFitTimers.push(window.setTimeout(() => {
      showAndFit();
      requestAnimationFrame(() => {
        if (this.tooltipFitGen !== gen) return;
        this.fitPinnedTooltip(gen);
        this.endTooltipPlace(gen);
      });
    }, 50));
  }

  private beginTooltipPlace(): number {
    this.clearTooltipFitTimers();
    document.body.classList.add('bae_tooltip_placing');
    return ++this.tooltipFitGen;
  }

  private endTooltipPlace(gen: number): void {
    if (gen !== this.tooltipFitGen) return;
    document.body.classList.remove('bae_tooltip_placing');
  }

  private fitPinnedTooltip(gen = this.tooltipFitGen): void {
    if (gen !== this.tooltipFitGen) return;
    if (!this.tooltipPinnedId) return;
    if (!this.lastPointerWasTouch && !document.body.classList.contains('touch-device')) return;
    const anchor = document.getElementById(this.tooltipPinnedId);
    if (!anchor) return;
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tip = this.activeTooltipNode();
    if (!tip) return;
    const connector = tip.querySelector('.dijitTooltipConnector') as HTMLElement | null;
    if (connector) connector.style.display = 'none';
    tip.style.maxWidth = `${vw - pad * 2}px`;
    tip.style.maxHeight = `${Math.max(80, vh - pad * 2)}px`;
    tip.style.width = 'auto';
    tip.style.height = 'auto';
    tip.style.overflow = 'auto';
    const container = tip.querySelector('.dijitTooltipContainer, .dijitTooltipContents') as HTMLElement | null;
    if (container) {
      container.style.maxWidth = `${vw - pad * 2}px`;
      container.style.width = 'auto';
    }
    const rect = tip.getBoundingClientRect();
    const tw = Math.min(Math.max(rect.width, tip.offsetWidth), vw - pad * 2);
    const th = Math.min(Math.max(rect.height, tip.offsetHeight), vh - pad * 2);
    const ar = anchor.getBoundingClientRect();
    let left = ar.left + ar.width / 2 - tw / 2;
    let top = ar.bottom + 6;
    if (top + th > vh - pad) {
      top = Math.max(pad, Math.min(vh - pad - th, ar.top + ar.height / 2 - th / 2));
    }
    if (top < pad) top = pad;
    left = Math.max(pad, Math.min(vw - pad - tw, left));
    tip.style.position = 'fixed';
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.right = 'auto';
    tip.style.bottom = 'auto';
    tip.style.margin = '0';
    tip.style.transform = 'none';
  }

  private activeTooltipNode(): HTMLElement | null {
    const tips = this.tooltipNodes().filter((tip) => {
      if (tip.classList.contains('dijitTooltipHidden')) return false;
      return getComputedStyle(tip).display !== 'none';
    });
    return tips.length > 0 ? tips[tips.length - 1] : null;
  }

  private clearTooltipFitTimers(): void {
    for (const id of this.tooltipFitTimers) window.clearTimeout(id);
    this.tooltipFitTimers = [];
    this.tooltipFitGen += 1;
  }

  private closePinnedTooltip(): void {
    if (!this.tooltipPinnedId && !document.body.classList.contains('bae_tooltip_placing')) return;
    this.tooltipPinnedId = null;
    this.clearTooltipFitTimers();
    document.body.classList.remove('bae_tooltip_placing');
    this.cancelDojoTooltips();
  }

  private beginTooltipGuard(zones: string[]): void {
    const hoverZone = this.hoverTooltipZone();
    const affected = zones.includes('all') || (hoverZone != null && zones.includes(hoverZone));
    const hover = this.lastHoverEl;
    this.tooltipPinnedId = null;
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
    if (this.tooltipPinnedId) return false;
    if (this.tooltipPointerHeld || this.tooltipDragging || this.dragCardId != null) return true;
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

  private setTouchHit(el: Element | null): void {
    const next = this.touchHitTarget(el);
    if (!next) {
      this.clearTouchHit();
      return;
    }
    const rect = this.touchHitRect(next);
    if (rect.width < 2 || rect.height < 2) {
      this.clearTouchHit();
      return;
    }
    const box = this.ensureTouchHitBox();
    const loc = coordsInParent(this.host.root, rect);
    box.style.left = `${loc.left}px`;
    box.style.top = `${loc.top}px`;
    box.style.width = `${loc.width}px`;
    box.style.height = `${loc.height}px`;
    box.hidden = false;
    this.touchHitEl = next;
  }

  private ensureTouchHitBox(): HTMLElement {
    if (this.touchHitBox?.isConnected) return this.touchHitBox;
    const box = document.createElement('div');
    box.className = 'bae_touch_hit_box';
    box.setAttribute('aria-hidden', 'true');
    box.hidden = true;
    this.host.root.appendChild(box);
    this.touchHitBox = box;
    return box;
  }

  private clearTouchHit(): void {
    this.touchHitEl = null;
    if (this.touchHitBox) this.touchHitBox.hidden = true;
    this.host.root?.querySelectorAll('.bae_touch_hit').forEach((n) => n.classList.remove('bae_touch_hit'));
  }

  private touchHitRect(el: HTMLElement): DOMRect {
    if (el.classList.contains('bae_location_zone')) {
      const canvas = el.closest('.bae_board_canvas') as HTMLElement | null;
      const extend = canvas ? (parseFloat(getComputedStyle(canvas).marginTop) || 0) : 0;
      const r = el.getBoundingClientRect();
      const rects: DOMRect[] = [new DOMRect(r.left, r.top - extend, r.width, r.height + extend)];
      el.querySelectorAll('.bae_pile_slot').forEach((slot) => rects.push((slot as HTMLElement).getBoundingClientRect()));
      return this.unionRects(rects);
    }
    if (el.classList.contains('bae_track')) {
      const rects = Array.from(el.querySelectorAll('.bae_track_position')).map((n) => (n as HTMLElement).getBoundingClientRect());
      return this.unionRects(rects.length > 0 ? rects : [el.getBoundingClientRect()]);
    }
    return el.getBoundingClientRect();
  }

  private unionRects(rects: DOMRect[]): DOMRect {
    const vis = rects.filter((r) => r.width > 0 && r.height > 0);
    if (vis.length === 0) return new DOMRect(0, 0, 0, 0);
    let left = vis[0].left;
    let top = vis[0].top;
    let right = vis[0].right;
    let bottom = vis[0].bottom;
    for (let i = 1; i < vis.length; i++) {
      left = Math.min(left, vis[i].left);
      top = Math.min(top, vis[i].top);
      right = Math.max(right, vis[i].right);
      bottom = Math.max(bottom, vis[i].bottom);
    }
    return new DOMRect(left, top, right - left, bottom - top);
  }

  private touchHitTarget(el: Element | null): HTMLElement | null {
    if (!el || typeof el.closest !== 'function') return null;
    if (el.closest('.bae_zoom_btn, .bae_round_badge, .bgabutton, .action-button')) return null;
    const myId = Number(this.host.bga.players.getCurrentPlayerId());
    const loc = el.closest('.bae_location_zone') as HTMLElement | null;
    const selectingLoc = !!loc
      && Number(loc.dataset.playerId) === myId
      && this.host.bga.players.isCurrentPlayerActive()
      && !this.host.isActionBusy()
      && (this.host.isGameplayLike() || this.host.isAssignCampLike());
    if (selectingLoc) return loc;
    return el.closest([
      '.bae_pile_slot',
      '.bae_track',
      '.bae_sci_shelf',
      '.bae_vp_tokens_zone',
      '.bae_animal_loc_vp_track',
      '.bae_camp_zone',
      '.bae_card',
      '.bae_obj',
      '.bae_score_card',
    ].join(',')) as HTMLElement | null;
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
      const r = visualRect(el);
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
        const r = visualRect(el);
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
      const from = visualRect(el);
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
    const rect = visualRect(probe);
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
    const size = visualRect(sample);
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

