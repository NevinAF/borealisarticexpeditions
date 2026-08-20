import {
  AnimalDefLite,
  canObserveAnywhere,
  canObserveAtLocation,
  flagWouldAdvance,
  missingScientistColors,
  previewObserveMoves,
} from './Legality';

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
  buildCardTooltipSpriteHtml(type: 'animal' | 'objective' | 'scoring', id: number, title: string, details: string[]): string;
  onUpdateActionButtons(stateName: string, args: Record<string, unknown> | null): void;
  cachedActionArgs: Record<string, unknown> | null;
  renderAll(): void;
}

/**
 * OPTIONAL: Client-only UX layer (help, legality highlights, pattern match, DnD, previews, sound, stats).
 * Never mutates server state. Illegal actions are blocked client-side; server remains source of truth.
 */
export class OptionalUi {
  private helpOpen = false;
  private hoverLocation: number | null = null;
  private hoverCardId: number | null = null;
  private hoverMatch: { kind: string; value: number } | null = null;
  private dragCardId: number | null = null;
  private cleanupFns: Array<() => void> = [];
  private audioCtx: AudioContext | null = null;

  constructor(private host: OptionalUiHost) {}

  /** Call after DOM rebuild. Happy path: bind optional handlers. Failure: missing root → no-op. */
  afterRender(): void {
    this.teardown();
    if (!this.host.root) return;
    this.applyPreferenceCss();
    this.renderRoundBadge();
    this.renderHelpButton();
    if (this.helpOpen) this.renderHelpPanel();
    this.decorateMaterialAttributes();
    this.applyLegalityClasses();
    this.bindHoverPatternMatching();
    this.bindDragAndDrop();
    this.updateActionPreviews();
    this.bindPreferenceListener();
  }

  teardown(): void {
    for (const fn of this.cleanupFns) {
      try { fn(); } catch (_) { /* ignore */ }
    }
    this.cleanupFns = [];
    this.host.root?.querySelectorAll('.bae_preview_ghost,.bae_preview_flag').forEach((el) => el.remove());
  }

  onSelectionChanged(): void {
    this.applyLegalityClasses();
    this.updateActionPreviews();
    if (this.helpOpen) this.renderHelpPanel();
  }

  /** Soft UI sounds via WebAudio oscillators (no asset files). Respects pref + BGA mute when available. */
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
      // Failure mode: AudioContext blocked — silent.
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

  showEndGameStats(): void {
    const existing = document.getElementById('bae_stats_panel');
    if (existing) existing.remove();
    const d = this.host.gamedatas.boardState;
    const names = this.host.gamedatas.players;
    const rows: string[] = [];
    rows.push(`<div class="bae_stats_row"><strong>${_('Rounds played')}</strong>: ${d.round ?? '?'}</div>`);
    for (const pidStr of Object.keys(names)) {
      const pid = Number(pidStr);
      const claimed = (d.objectives ?? []).filter((o) => o.players[pid] === 'claimed').length;
      let maxFlag = 0;
      for (let loc = 0; loc < 3; loc++) {
        maxFlag = Math.max(maxFlag, Number(d.flags?.[pid]?.[loc] ?? 0));
      }
      let animals = 0;
      for (let loc = 0; loc < 3; loc++) animals += d.boards?.[pid]?.[loc]?.length ?? 0;
      rows.push(
        `<div class="bae_stats_row"><strong>${this.escape(names[pid]?.name ?? String(pid))}</strong>`
        + ` — ${_('Score')}: ${Number((d.vps as any)?.[pid]?.score ?? (d.vps as any)?.[pid] ?? names[pid]?.score ?? 0)}`
        + `; ${_('Objectives claimed')}: ${claimed}`
        + `; ${_('Deepest flag')}: ${maxFlag}`
        + `; ${_('Animals observed')}: ${animals}</div>`,
      );
    }
    const panel = document.createElement('div');
    panel.id = 'bae_stats_panel';
    panel.className = 'bae_stats_panel';
    panel.innerHTML = `<h3>${_('Game statistics')}</h3>${rows.join('')}`
      + `<button type="button" class="bae_help_close">${_('Close')}</button>`;
    panel.querySelector('.bae_help_close')?.addEventListener('click', () => panel.remove());
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
    const prev = this.host.bga.userPreferences.onChange;
    this.host.bga.userPreferences.onChange = (prefId: number, value: number) => {
      prev?.(prefId, value);
      this.applyPreferenceCss();
      this.updateActionPreviews();
    };
    this.cleanupFns.push(() => {
      this.host.bga.userPreferences.onChange = prev;
    });
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

  private renderHelpButton(): void {
    let btn = this.host.root.querySelector('.bae_help_toggle') as HTMLButtonElement | null;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bae_help_toggle';
      btn.textContent = _('Help');
      btn.title = _('Show player aid and current possible actions');
      this.host.root.appendChild(btn);
    }
    const onClick = () => {
      this.helpOpen = !this.helpOpen;
      if (this.helpOpen) this.renderHelpPanel();
      else this.host.root.querySelector('.bae_help_panel')?.remove();
    };
    btn.addEventListener('click', onClick);
    this.cleanupFns.push(() => btn?.removeEventListener('click', onClick));
  }

  private renderHelpPanel(): void {
    this.host.root.querySelector('.bae_help_panel')?.remove();
    const panel = document.createElement('aside');
    panel.className = 'bae_help_panel';
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', _('Player aid'));
    const state = this.host.currentStateName();
    const myId = Number(this.host.bga.players.getCurrentPlayerId());
    const active = this.host.bga.players.isCurrentPlayerActive();
    const lines: string[] = [];
    lines.push(`<p><strong>${_('State')}</strong>: ${this.escape(state)}</p>`);
    if ((this.host.gamedatas.boardState.playersEndingGame?.length ?? 0) > 0) {
      lines.push(`<p class="bae_help_warn">${_('This is the final round.')}</p>`);
    }
    if (!active) {
      lines.push(`<p>${_('Waiting for another player.')}</p>`);
    } else if (this.host.isGameplayLike()) {
      lines.push(`<p>${_('Possible actions')}: ${_('Observe an animal')} · ${_('Regroup')} · ${_('Claim objective (if met)')}</p>`);
      if (this.host.selectedCardId != null && this.host.selectedLocation != null) {
        const def = this.host.animalDef(this.host.selectedCardId);
        const missing = missingScientistColors(def, this.host.gamedatas.boardState.scientists, myId, this.host.selectedLocation);
        if (missing.length > 0) {
          const sciNames = this.host.gamedatas.materials.scientist_names ?? [];
          lines.push(`<p class="bae_help_warn">${_('Missing scientists')}: ${missing.map((c) => sciNames[c] ?? c).join(', ')}</p>`);
        } else {
          lines.push(`<p>${_('Selection is valid — confirm Observe.')}</p>`);
        }
      }
    } else if (this.host.isReplenishLike()) {
      lines.push(`<p>${_('Take a pool card or draw from the deck. Optional: mulligan the pool (-1 VP).')}</p>`);
    } else if (this.host.isAssignCampLike()) {
      lines.push(`<p>${_('Choose a location for all camp scientists.')}</p>`);
    } else if (this.host.isOpeningMulliganLike()) {
      lines.push(`<p>${_('Optionally replace starting hand cards, then confirm.')}</p>`);
    }
    panel.innerHTML = `<h3>${_('Help')}</h3>${lines.join('')}<button type="button" class="bae_help_close">${_('Close')}</button>`;
    panel.querySelector('.bae_help_close')?.addEventListener('click', () => {
      this.helpOpen = false;
      panel.remove();
    });
    this.host.root.appendChild(panel);
  }

  private animalDefs(): Record<number, AnimalDefLite> {
    const raw = this.host.gamedatas.materials.animal_cards;
    if (Array.isArray(raw)) {
      const out: Record<number, AnimalDefLite> = {};
      raw.forEach((d, i) => { out[i] = d as AnimalDefLite; });
      return out;
    }
    return (raw ?? {}) as Record<number, AnimalDefLite>;
  }

  private decorateMaterialAttributes(): void {
    const defs = this.animalDefs();
    this.host.root.querySelectorAll('[data-hand-card], [data-pool-slot]').forEach((el) => {
      const htmlEl = el as HTMLElement;
      let cardId: number | null = null;
      if (htmlEl.dataset.handCard != null) cardId = Number(htmlEl.dataset.handCard);
      else if (htmlEl.dataset.poolSlot != null && htmlEl.dataset.poolSlot !== '-1') {
        const slot = Number(htmlEl.dataset.poolSlot);
        const poolCard = this.host.gamedatas.boardState.pool.find((p) => p.slot === slot);
        cardId = poolCard?.id ?? null;
      }
      if (cardId == null || !defs[cardId]) return;
      const def = defs[cardId];
      htmlEl.dataset.species = String(def.species);
      htmlEl.dataset.vehicle = String(def.vehicle);
      htmlEl.dataset.leftMove = String(def.left_move);
      htmlEl.dataset.rightMove = String(def.right_move);
      htmlEl.dataset.cardId = String(cardId);
    });
    // Observed pile cards
    for (const pidStr of Object.keys(this.host.gamedatas.boardState.boards ?? {})) {
      const pid = Number(pidStr);
      for (let loc = 0; loc < 3; loc++) {
        (this.host.gamedatas.boardState.boards[pid]?.[loc] ?? []).forEach((c, si) => {
          const el = this.host.root.querySelector(`#bae_pile_${pid}_${loc}_${si}`) as HTMLElement | null;
          const def = defs[c.id];
          if (!el || !def) return;
          el.dataset.species = String(def.species);
          el.dataset.vehicle = String(def.vehicle);
          el.dataset.cardId = String(c.id);
        });
      }
    }
    this.host.root.querySelectorAll('.bae_meeple_img').forEach((img) => {
      const el = img as HTMLElement;
      if (el.classList.contains('bae_meeple_yellow')) el.dataset.scientist = '0';
      if (el.classList.contains('bae_meeple_pink')) el.dataset.scientist = '1';
      if (el.classList.contains('bae_meeple_teal')) el.dataset.scientist = '2';
    });
    // Track vehicles for pattern matching
    for (const pidStr of Object.keys(this.host.gamedatas.players)) {
      const pid = Number(pidStr);
      const boardId = this.host.gamedatas.boardState.board_for_players?.[pid] ?? 0;
      const board = this.host.gamedatas.materials.player_boards?.[boardId];
      if (!board) continue;
      const locs = [board.left_location, board.mid_location, board.right_location];
      for (let loc = 0; loc < 3; loc++) {
        for (let space = 1; space <= 7; space++) {
          const el = this.host.root.querySelector(`#bae_track_${pid}_${loc}_${space}`) as HTMLElement | null;
          if (!el) continue;
          const vehicles = locs[loc]?.[space - 1] ?? [];
          el.dataset.vehicles = vehicles.join(',');
          el.dataset.trackSpace = String(space);
        }
      }
    }
  }

  private applyLegalityClasses(): void {
    const myId = Number(this.host.bga.players.getCurrentPlayerId());
    const active = this.host.bga.players.isCurrentPlayerActive() && this.host.isGameplayLike() && !this.host.campSelected;
    const scientists = this.host.gamedatas.boardState.scientists;
    const defs = this.animalDefs();

    this.host.root.querySelectorAll('.bae_handcard[data-hand-card]').forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.classList.remove('bae_can_play', 'bae_cannot_play', 'bae_hover_match');
      if (!active) return;
      const id = Number(htmlEl.dataset.handCard);
      const ok = canObserveAnywhere(defs[id], scientists, myId);
      htmlEl.classList.add(ok ? 'bae_can_play' : 'bae_cannot_play');
      if (this.hoverLocation != null && canObserveAtLocation(defs[id], scientists, myId, this.hoverLocation)) {
        htmlEl.classList.add('bae_hover_match');
      }
    });

    this.host.root.querySelectorAll(`.bae_location_zone[data-player-id="${myId}"]`).forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.classList.remove('bae_can_play', 'bae_cannot_play', 'bae_hover_match', 'bae_missing_scientist');
      if (!active) return;
      const loc = Number(htmlEl.dataset.loc);
      const hand = this.host.gamedatas.boardState.hands[myId];
      const cards = Array.isArray(hand) ? hand.map((c) => Number(c.id)) : [];
      const any = cards.some((cid) => canObserveAtLocation(defs[cid], scientists, myId, loc));
      htmlEl.classList.add(any ? 'bae_can_play' : 'bae_cannot_play');
      if (this.hoverCardId != null && canObserveAtLocation(defs[this.hoverCardId], scientists, myId, loc)) {
        htmlEl.classList.add('bae_hover_match');
      }
      if (this.host.selectedCardId != null && this.host.selectedLocation === loc) {
        const missing = missingScientistColors(defs[this.host.selectedCardId], scientists, myId, loc);
        if (missing.length > 0) htmlEl.classList.add('bae_missing_scientist');
      }
    });

    const hand = this.host.gamedatas.boardState.hands[myId];
    const cards = Array.isArray(hand) ? hand.map((c) => Number(c.id)) : [];
    const nonePlayable = active && cards.length > 0 && cards.every((cid) => !canObserveAnywhere(defs[cid], scientists, myId));
    this.host.root.querySelectorAll(`.bae_camp_zone[data-player-id="${myId}"]`).forEach((el) => {
      el.classList.toggle('bae_encourage_regroup', nonePlayable);
    });

    // Missing scientists outline on shelves
    this.host.root.querySelectorAll('.bae_meeple_img').forEach((el) => el.classList.remove('bae_missing_outline'));
    if (active && this.host.selectedCardId != null && this.host.selectedLocation != null) {
      const missing = missingScientistColors(defs[this.host.selectedCardId], scientists, myId, this.host.selectedLocation);
      const shelf = this.host.root.querySelector(`#bae_sci_shelf_loc_${myId}_${this.host.selectedLocation}`);
      missing.forEach((color) => {
        // Mark shelf when missing that color entirely for feedback
        shelf?.classList.add('bae_missing_scientist');
        void color;
      });
    }
  }

  private bindHoverPatternMatching(): void {
    const root = this.host.root;
    const onCardEnter = (ev: Event) => {
      const t = (ev.currentTarget as HTMLElement);
      const cardId = Number(t.dataset.handCard ?? t.dataset.cardId ?? NaN);
      this.hoverCardId = Number.isFinite(cardId) ? cardId : null;
      const vehicle = Number(t.dataset.vehicle ?? NaN);
      const species = Number(t.dataset.species ?? NaN);
      const left = Number(t.dataset.leftMove ?? NaN);
      const right = Number(t.dataset.rightMove ?? NaN);
      this.clearPatternClasses();
      if (Number.isFinite(vehicle)) this.highlightPattern('vehicle', vehicle);
      if (Number.isFinite(species)) this.highlightPattern('species', species);
      if (Number.isFinite(left)) this.highlightPattern('scientist', left);
      if (Number.isFinite(right)) this.highlightPattern('scientist', right);
      this.applyLegalityClasses();
    };
    const onCardLeave = () => {
      this.hoverCardId = null;
      this.clearPatternClasses();
      this.applyLegalityClasses();
    };
    root.querySelectorAll('[data-hand-card], [data-card-id], [data-species]').forEach((el) => {
      el.addEventListener('mouseenter', onCardEnter);
      el.addEventListener('mouseleave', onCardLeave);
      this.cleanupFns.push(() => {
        el.removeEventListener('mouseenter', onCardEnter);
        el.removeEventListener('mouseleave', onCardLeave);
      });
    });

    const onLocEnter = (ev: Event) => {
      const loc = Number((ev.currentTarget as HTMLElement).dataset.loc);
      this.hoverLocation = Number.isFinite(loc) ? loc : null;
      this.applyLegalityClasses();
    };
    const onLocLeave = () => {
      this.hoverLocation = null;
      this.applyLegalityClasses();
    };
    root.querySelectorAll('.bae_location_zone').forEach((el) => {
      el.addEventListener('mouseenter', onLocEnter);
      el.addEventListener('mouseleave', onLocLeave);
      this.cleanupFns.push(() => {
        el.removeEventListener('mouseenter', onLocEnter);
        el.removeEventListener('mouseleave', onLocLeave);
      });
    });

    const onCampEnter = (ev: Event) => {
      const pid = Number((ev.currentTarget as HTMLElement).dataset.playerId);
      root.querySelectorAll(`.bae_camp_zone[data-player-id="${pid}"] .bae_meeple_img, #bae_sci_shelf_camp_${pid}_left .bae_meeple_img, #bae_sci_shelf_camp_${pid}_right .bae_meeple_img`)
        .forEach((m) => m.classList.add('bae_pattern_match'));
    };
    const onCampLeave = () => {
      root.querySelectorAll('.bae_meeple_img.bae_pattern_match').forEach((m) => m.classList.remove('bae_pattern_match'));
    };
    root.querySelectorAll('[data-camp-wrap]').forEach((el) => {
      el.addEventListener('mouseenter', onCampEnter);
      el.addEventListener('mouseleave', onCampLeave);
      this.cleanupFns.push(() => {
        el.removeEventListener('mouseenter', onCampEnter);
        el.removeEventListener('mouseleave', onCampLeave);
      });
    });

    root.querySelectorAll('[data-vehicles]').forEach((el) => {
      const enter = () => {
        const vehicles = ((el as HTMLElement).dataset.vehicles ?? '').split(',').filter(Boolean).map(Number);
        this.clearPatternClasses();
        vehicles.forEach((v) => this.highlightPattern('vehicle', v));
      };
      const leave = () => this.clearPatternClasses();
      el.addEventListener('mouseenter', enter);
      el.addEventListener('mouseleave', leave);
      this.cleanupFns.push(() => {
        el.removeEventListener('mouseenter', enter);
        el.removeEventListener('mouseleave', leave);
      });
    });
  }

  private clearPatternClasses(): void {
    this.host.root.querySelectorAll('.bae_pattern_match').forEach((el) => el.classList.remove('bae_pattern_match'));
  }

  private highlightPattern(kind: string, value: number): void {
    if (kind === 'vehicle') {
      this.host.root.querySelectorAll(`[data-vehicle="${value}"]`).forEach((el) => el.classList.add('bae_pattern_match'));
      this.host.root.querySelectorAll('[data-vehicles]').forEach((el) => {
        const list = ((el as HTMLElement).dataset.vehicles ?? '').split(',').map(Number);
        if (list.includes(value)) el.classList.add('bae_pattern_match');
      });
    } else if (kind === 'species') {
      this.host.root.querySelectorAll(`[data-species="${value}"]`).forEach((el) => el.classList.add('bae_pattern_match'));
    } else if (kind === 'scientist') {
      this.host.root.querySelectorAll(`[data-scientist="${value}"]`).forEach((el) => el.classList.add('bae_pattern_match'));
      this.host.root.querySelectorAll(`[data-left-move="${value}"], [data-right-move="${value}"]`).forEach((el) => el.classList.add('bae_pattern_match'));
    }
  }

  private bindDragAndDrop(): void {
    // OPTIONAL: DnD for observe / regroup / replenish selection.
    // Failure modes: illegal mid-drag → cancel; spectator → no-op.
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
        const def = this.animalDefs()[cardId];
        if (!canObserveAtLocation(def, this.host.gamedatas.boardState.scientists, myId, loc)) return;
        // Select card+location then re-render (clearSelection alone would wipe after render).
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

    // Pool → hand (replenish): drop on hand column selects/confirms
    const handCol = this.host.root.querySelector(`.bae_player_handcol[data-player-id="${myId}"]`);
    if (handCol) {
      const onDragOver = (ev: DragEvent) => {
        if (!this.host.isReplenishLike()) return;
        ev.preventDefault();
      };
      const onDrop = (ev: DragEvent) => {
        if (!this.host.isReplenishLike() || !this.host.bga.players.isCurrentPlayerActive()) return;
        ev.preventDefault();
        // Prefer selected pool slot if set via click; otherwise ignore (pool drag attrs set below)
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

  private updateActionPreviews(): void {
    this.host.root.querySelectorAll('.bae_preview_ghost,.bae_preview_flag').forEach((el) => el.remove());
    if (!this.previewsEnabled()) return;
    const myId = Number(this.host.bga.players.getCurrentPlayerId());
    if (!this.host.bga.players.isCurrentPlayerActive()) return;

    if (this.host.isGameplayLike() && this.host.selectedCardId != null && this.host.selectedLocation != null && !this.host.campSelected) {
      const def = this.animalDefs()[this.host.selectedCardId];
      if (!def || !canObserveAtLocation(def, this.host.gamedatas.boardState.scientists, myId, this.host.selectedLocation)) return;
      const moves = previewObserveMoves(this.host.gamedatas.boardState.scientists, myId, this.host.selectedLocation, def);
      for (const m of moves) {
        const destShelf = m.to <= 2
          ? this.host.root.querySelector(`#bae_sci_shelf_loc_${myId}_${m.to}`)
          : this.host.root.querySelector(m.to === 3 ? `#bae_sci_shelf_camp_${myId}_left` : `#bae_sci_shelf_camp_${myId}_right`);
        if (!destShelf) continue;
        const ghost = document.createElement('span');
        ghost.className = `bae_preview_ghost bae_meeple_preview bae_meeple_${['yellow', 'pink', 'teal'][m.color]}`;
        ghost.title = _('Preview scientist move');
        destShelf.appendChild(ghost);
      }
      const flagDepth = Number(this.host.gamedatas.boardState.flags?.[myId]?.[this.host.selectedLocation] ?? 0);
      const boardId = this.host.gamedatas.boardState.board_for_players?.[myId] ?? 0;
      const board = this.host.gamedatas.materials.player_boards?.[boardId];
      const locKey = (['left_location', 'mid_location', 'right_location'] as const)[this.host.selectedLocation];
      const vehicles = board?.[locKey] ?? [];
      const advances = flagWouldAdvance(def, vehicles, flagDepth);
      const nextSpace = Math.min(7, flagDepth + 1);
      const trackEl = this.host.root.querySelector(`#bae_track_${myId}_${this.host.selectedLocation}_${nextSpace}`);
      if (trackEl) {
        const mark = document.createElement('span');
        mark.className = `bae_preview_flag ${advances ? 'bae_preview_flag_ok' : 'bae_preview_flag_no'}`;
        trackEl.appendChild(mark);
      }
    }

    if (this.host.isAssignCampLike() && this.host.selectedLocation != null) {
      const shelf = this.host.root.querySelector(`#bae_sci_shelf_loc_${myId}_${this.host.selectedLocation}`);
      shelf?.classList.add('bae_preview_assign');
      this.cleanupFns.push(() => shelf?.classList.remove('bae_preview_assign'));
    }

    if (this.host.campSelected) {
      this.host.root.querySelectorAll(`.bae_camp_zone[data-player-id="${myId}"]`).forEach((el) => {
        el.classList.add('bae_preview_awaiting');
      });
    }
  }
}
