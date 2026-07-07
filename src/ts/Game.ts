const SCI_COLOR = ["#ddb162", "#eca6b8", "#7dc7bc"];

export class Game {
  private static readonly BOARD_REFERENCE_WIDTH_PX = 3788;
  private static readonly BOARD_REFERENCE_HEIGHT_PX = 2600;
  private static readonly CARD_REFERENCE_WIDTH_PX = 528;
  private static readonly CARD_REFERENCE_HEIGHT_PX = 745;
  private static readonly TOP_ROW_REFERENCE_WIDTH_PX = 6124;
  private static readonly MIN_PLAYAREA_REFERENCE_WIDTH_PX = 3788 + 530 + 20;
  private static readonly MIN_PLAYAREA_REFERENCE_HEIGHT_PX = 2600 + 1200 + 750 + 120 * 8 + 400;
  private static readonly ANIMAL_SPRITE_COLUMNS = 11;
  private static readonly ANIMAL_SPRITE_ROWS = 10;
  private static readonly ANIMAL_SPRITE_LAST_INDEX = 100;
  private static readonly OBJECTIVE_SPRITE_COLUMNS = 4;
  private static readonly OBJECTIVE_SPRITE_ROWS = 4;
  private static readonly OBJECTIVE_SPRITE_LAST_INDEX = 12;
  private static readonly SCORING_SPRITE_COLUMNS = 4;
  private static readonly SCORING_SPRITE_ROWS = 3;
  private static readonly SCORING_SPRITE_LAST_INDEX = 10;

  bga!: Bga<BorealisArticExpeditionsPlayer, BorealisArticExpeditionsGamedatas>;
  gamedatas!: BorealisArticExpeditionsGamedatas;
  private root!: HTMLElement;
  private selectedCardId: number | null = null;
  private selectedLocation: number | null = null;
  private selectedPoolSlot: number | null = null;
  private campSelected = false;
  private selectedRegroupIds = new Set<number>();
  private boardScaleTimeoutId: number | null = null;
  private boardScaleTimeoutAccInterval: number | null = null;
  private static readonly ZOOM_FACTORS = [0.75, 0.9, 1, 1.1, 1.25];
  private zoomIndex = 2;

  constructor(bga: Bga<BorealisArticExpeditionsPlayer, BorealisArticExpeditionsGamedatas>) {
    this.bga = bga;
  }

  setup(gamedatas: BorealisArticExpeditionsGamedatas) {
    this.gamedatas = gamedatas;
    this.setupNotifications();
    const area = this.bga.gameArea.getElement();
    this.root = document.createElement("div");
    this.root.id = "bae_playarea";
    this.root.className = "bae";
    area.appendChild(this.root);
    // Keep --board-scale up to date when the window resizes
    window.addEventListener('resize', () => this.updateBoardScale());
    this.renderAll();

    // Re-fit once custom fonts are fully ready to avoid first-interaction text jumps.
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      void document.fonts.ready.then(() => {
        if (!this.root) return;
        this.fitCardOverlayText();
      });
    }
  }

  private renderPlayerPanelInfo(): void {
    const d = this.gamedatas.boardState;
    const firstPlayerId = Number((this.gamedatas.playerOrder ?? [])[0] ?? 0);
    // const leftLabel = this.gamedatas.materials.location_names?.[0] ?? _("Left");
    // const middleLabel = this.gamedatas.materials.location_names?.[1] ?? _("Middle");
    // const rightLabel = this.gamedatas.materials.location_names?.[2] ?? _("Right");

    for (const pidStr of Object.keys(this.gamedatas.players)) {
      const pid = Number(pidStr);
      const host = this.bga.playerPanels.getElement(pid);

      let infoEl = host.querySelector('.bae_panel_info') as HTMLElement | null;
      if (!infoEl) {
        infoEl = document.createElement('div');
        infoEl.className = 'bae_panel_info';
        host.appendChild(infoEl);
      }

      const leftCount = d.boards[pid]?.[0]?.length ?? 0;
      const middleCount = d.boards[pid]?.[1]?.length ?? 0;
      const rightCount = d.boards[pid]?.[2]?.length ?? 0;
      const firstPlayerIcon = pid === firstPlayerId
        ? '  {first player}'
        : '';

      infoEl.innerHTML = `<span class="bae_panel_animals">${_('Observed')}: ${leftCount} · ${middleCount} · ${rightCount}</span>${firstPlayerIcon}`;
    }
  }

  setupNotifications() {
    this.bga.notifications.setupPromiseNotifications({
      prefix: "notif_",
      handlers: [this, this.bga],
      onStart: (notifName, msg, args) => {
        // console.log("Notification started:", notifName, msg, args);
      }});
  }

  private syncGamedatas() {
    this.gamedatas = this.gamedatas as BorealisArticExpeditionsGamedatas;
  }

  private updateBoardScale(): void {
    if (!this.root) return;

    if (this.boardScaleTimeoutId !== null) {
      window.clearTimeout(this.boardScaleTimeoutId);
      this.boardScaleTimeoutId = null;
    }

    const scale = this.getScale();
    this.root.style.setProperty('--bae-scale', String(scale));
    this.updateSpriteSheetUrls(scale);
    this.fitCardOverlayText();
    this.boardScaleTimeoutAccInterval = 10;
    this.boardScaleTimeoutId = window.setTimeout(() => this.verifyBoardScaleTimeout(scale), 10);
  }

  private updateSpriteSheetUrls(scale: number): void {
    if (!this.root) return;

    const tier = scale >= 0.55 ? 'full' : scale >= 0.25 ? 'half' : 'quarter';
    const base = this.bga.images.getImgUrl();
    this.root.style.setProperty('--animal-sprite-url', `url("${base}Sprites/AnimalCards_sheet_${tier}.webp")`);
    this.root.style.setProperty('--objective-sprite-url', `url("${base}Sprites/ObjectiveCards_sheet_${tier}.webp")`);
    this.root.style.setProperty('--scoring-sprite-url', `url("${base}Sprites/ScoringCards_sheet_${tier}.webp")`);
  }

    private getScale(): number {
      const area = this.bga.gameArea.getElement();
      const areaRect = area.getBoundingClientRect();
    //   const rootRect = this.root.getBoundingClientRect();

      const availableWidth = Math.max(1, areaRect.width);
      const availableHeight = Math.max(1, window.innerHeight);
      const scaleByBoardWidth = availableWidth / Game.MIN_PLAYAREA_REFERENCE_WIDTH_PX;
      const scaleByBoardHeight = availableHeight / Game.MIN_PLAYAREA_REFERENCE_HEIGHT_PX;
      const scaleByTopRowWidth = availableWidth / Game.TOP_ROW_REFERENCE_WIDTH_PX;
      const autoScale = Math.max(0.01, Math.min(scaleByBoardWidth, scaleByBoardHeight, scaleByTopRowWidth));
      const zoomFactor = Game.ZOOM_FACTORS[this.zoomIndex] ?? 1;
      const scale = Math.max(0.01, autoScale * zoomFactor);

      return scale;
    };

  private verifyBoardScaleTimeout(expectedScale: number): void {
      this.boardScaleTimeoutId = null;
      if (!this.root) return;

      const appliedScale = Number.parseFloat(getComputedStyle(this.root).getPropertyValue('--bae-scale'));
      const currentScale = Number.isFinite(appliedScale) ? appliedScale : 0;
      const nextScale = this.getScale();
      if (Math.abs(nextScale - currentScale) > 0.0001 || Math.abs(nextScale - expectedScale) > 0.0001) {
        this.updateBoardScale();
      }
      else {
        if (this.boardScaleTimeoutAccInterval === null) {
            this.boardScaleTimeoutAccInterval = 10;
        }

        this.boardScaleTimeoutAccInterval *= 2;
        if (this.boardScaleTimeoutAccInterval < 2000) {
            this.boardScaleTimeoutId = window.setTimeout(() => this.verifyBoardScaleTimeout(expectedScale), this.boardScaleTimeoutAccInterval);
        }
      }
    }

  private bindZoomHandlers(): void {
    const outBtn = this.root.querySelector('[data-zoom="out"]') as HTMLButtonElement | null;
    const inBtn = this.root.querySelector('[data-zoom="in"]') as HTMLButtonElement | null;
    const resetBtn = this.root.querySelector('[data-zoom="reset"]') as HTMLButtonElement | null;

    outBtn?.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (this.zoomIndex <= 0) return;
      this.zoomIndex -= 1;
      this.renderAll();
    });

    inBtn?.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (this.zoomIndex >= Game.ZOOM_FACTORS.length - 1) return;
      this.zoomIndex += 1;
      this.renderAll();
    });

    resetBtn?.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (this.zoomIndex === 2) return;
      this.zoomIndex = 2;
      this.renderAll();
    });
  }

  private ownHandCardActionText(): string {
    if (!this.bga.players.isCurrentPlayerActive()) {
      return _('You are not the active player.');
    }
    if (this.isOpeningMulliganLike() || this.campSelected) {
      return _('Click to select/deselect for discard');
    }
    if (this.isGameplayLike()) {
      return _('Click to observe animal');
    }
    return _('Click to select card');
  }

  private registerHandTooltips(myId: number): void {
    if (!this.bga || !this.bga.gameui || typeof (this.bga.gameui.addTooltip) !== 'function') return;
    const canHtmlTooltip = typeof this.bga.gameui.addTooltipHtml === 'function';

    // Hidden cards in other players' hands.
    for (const pidStr of Object.keys(this.gamedatas.players)) {
      const pid = Number(pidStr);
      if (pid === myId) continue;
      const hiddenCards = this.root.querySelectorAll(`.bae_player_handcol[data-player-id="${pid}"] .bae_handcard_hidden`);
      hiddenCards.forEach((el, idx) => {
        const host = el as HTMLElement;
        const id = host.id || `bae_hand_hidden_${pid}_${idx}`;
        if (!host.id) host.id = id;
        try { this.bga.gameui.removeTooltip(id); } catch (_) {}
        if (canHtmlTooltip) {
          const html = this.buildCardTooltipSpriteHtml(
            'animal',
            9999,
            _('Hidden hand card'),
            [_('You cannot see cards in other players hands')],
          );
          this.bga.gameui.addTooltipHtml(id, html);
        } else {
          this.bga.gameui.addTooltip(id, _('You cannot see cards in other players hands'), '');
        }
      });
    }

    // Visible cards in your own hand.
    const actionText = this.ownHandCardActionText();
    const myCards = this.root.querySelectorAll(`.bae_player_handcol[data-player-id="${myId}"] [data-hand-card]`);
    myCards.forEach((el) => {
      const host = el as HTMLElement;
      const cardId = host.dataset.handCard ?? '';
      const numericCardId = Number(cardId);
      const id = host.id || `bae_hand_${myId}_${cardId}`;
      if (!host.id) host.id = id;
      try { this.bga.gameui.removeTooltip(id); } catch (_) {}
      if (canHtmlTooltip) {
        const html = this.buildCardTooltipSpriteHtml(
          'animal',
          numericCardId,
          `${_('Animal card')} #${numericCardId}`,
          [actionText],
        );
        this.bga.gameui.addTooltipHtml(id, html);
      } else {
        this.bga.gameui.addTooltip(id, _('Your hand card'), actionText);
      }
    });
  }

  /** Main state name (handles nested private_state in some BGA builds). */
  private currentStateName(): string {
    const gs = this.gamedatas.gamestate as { name?: string; private_state?: { name?: string } };
    if (gs.private_state?.name) return String(gs.private_state.name);
    return gs.name ? String(gs.name) : "";
  }

  private isGameplayLike(): boolean {
    const n = this.currentStateName().toLowerCase();
    return n === "gameplay" || n.includes("gameplay");
  }

  private isReplenishLike(): boolean {
    const n = this.currentStateName().toLowerCase();
    return n === "replenishanimal" || n.includes("replenish");
  }

  private isAssignCampLike(): boolean {
    const n = this.currentStateName().toLowerCase();
    return n === "assigncamp" || n.includes("assigncamp") || n.includes("assign_camp");
  }

  private isOpeningMulliganLike(): boolean {
    const n = this.currentStateName().toLowerCase();
    return n === "openingmulligan" || n.includes("openingmulligan") || n.includes("opening_mulligan");
  }

  private enterRegroupMode(): void {
    this.selectedCardId = null;
    this.selectedLocation = null;
    this.selectedPoolSlot = null;
    this.campSelected = true;
    this.selectedRegroupIds.clear();
    this.renderAll();
    this.onUpdateActionButtons(this.currentStateName(), null);
  }

  private clearSelection(): void {
    this.selectedCardId = null;
    this.selectedLocation = null;
    this.selectedPoolSlot = null;
    this.campSelected = false;
    this.selectedRegroupIds.clear();
    this.renderAll();
    this.onUpdateActionButtons(this.currentStateName(), null);
  }

  private confirmObserveIfReady(cardId: number | null, location: number | null): boolean {
    if (!this.isGameplayLike() || !this.bga.players.isCurrentPlayerActive()) return false;
    if (cardId == null || location == null) return false;
    void this.bga.actions.performAction("actObserveAnimal", {
      card_id: cardId,
      location,
    });
    return true;
  }

  private renderAll() {
    this.syncGamedatas();

    let html = "";

    const d = this.gamedatas.boardState;
    const myId = Number(this.bga.players.getCurrentPlayerId());
    const names: Record<number, string> = {};
    for (const pid of Object.keys(this.gamedatas.players)) {
      const p = this.gamedatas.players[Number(pid)];
      names[Number(pid)] = p.name;
    }
    const track = d.track ?? { vpPerSpace: [], vehiclesPerLocation: [[], [], []] };
    const canZoomOut = this.zoomIndex > 0;
    const canZoomIn = this.zoomIndex < Game.ZOOM_FACTORS.length - 1;
    const canResetZoom = this.zoomIndex !== 2;
    const canConfirmObserve = this.isGameplayLike() && this.selectedCardId != null && this.selectedLocation != null;
    const canConfirmTake = this.isReplenishLike() && this.selectedPoolSlot != null;
    const canConfirmAssign = this.isAssignCampLike() && this.selectedLocation != null;
    const confirmObserveBlurb = _('Confirm?');

    this.handleLastTurnBanner(d.playersEndingGame);

    html += `<div class="bae_zoom_controls" role="group" aria-label="${_('Zoom controls')}">`;
    html += `<button type="button" class="bae_zoom_btn" data-zoom="out" ${canZoomOut ? '' : 'disabled'} aria-label="${_('Zoom out')}" title="${_('Zoom out')}">-</button>`;
    html += `<button type="button" class="bae_zoom_btn" data-zoom="in" ${canZoomIn ? '' : 'disabled'} aria-label="${_('Zoom in')}" title="${_('Zoom in')}">+</button>`;
    html += `<button type="button" class="bae_zoom_btn" data-zoom="reset" ${canResetZoom ? '' : 'disabled'} aria-label="${_('Reset zoom')}" title="${_('Reset zoom')}">⟳</button>`;
    html += `</div>`;

    html += `<div class="bae_table">`;
    html += `<div class="bae_toprow">`;

    // Objectives group (left, always 2 columns with centered final row)
    html += `<div class="bae_top_group bae_top_objectives"><div class="bae_objectives">`;
    d.objectives.forEach((obj, idx) => {
      const playerState = obj.players[myId] ?? "unmet";
      let extraClass = "";
      if (playerState === "meets") extraClass = " bae_obj_meets";
      else if (playerState === "claimed") extraClass = " bae_obj_claimed_by_you";
      // If any player has claimed this objective this round while it remains active,
      // show a distinct claimed-this-round highlight for other players.
      const anyClaimed = obj.active && Object.values(obj.players).some((s) => s === "claimed");
      if (anyClaimed && playerState !== "claimed") extraClass += " bae_obj_claimed_round";
      const disabledAttr = obj.active ? "" : "disabled";
      // give each objective an ID so we can attach the BGA tooltip API instead of title attributes
      html += `<button id="bae_obj_${idx}" type="button" class="bae_obj${extraClass}" data-obj-idx="${idx}" ${disabledAttr}>${this.objectiveFaceById(
        obj.id,
      )}</button>`;
    });
    html += `</div></div>`;

    // Pool group (middle): deck slot first, then pool cards
    html += `<div class="bae_top_group bae_top_pool"><div class="bae_pool">`;
    const deckConfirmClass = canConfirmTake && this.selectedPoolSlot === -1 ? ' bae_card_selected' : '';
    html += `<button id="bae_pool_slot_deck" type="button" class="bae_card bae_pool_slot bae_pool_deck${deckConfirmClass}" data-pool-slot="-1">`;
    html += `${this.cardFaceById(9999)}`;
    if (canConfirmTake && this.selectedPoolSlot === -1) {
      html += `<span class="bae_confirm_blurb">${confirmObserveBlurb}</span>`;
    }
    html += `<span class="bae_deck_overlay">${_("Deck")}: ${d.deck_count}<br>${_("Discard")}: ${d.discard_count}</span>`;
    html += `</button>`;

    const sortedPool = [...d.pool].sort((a, b) => a.slot - b.slot);
    for (const slot of sortedPool) {
      const slotConfirmClass = canConfirmTake && this.selectedPoolSlot === slot.slot ? ' bae_card_selected' : '';
      html += `<button id="bae_pool_slot_${slot.slot}" type="button" class="bae_card bae_pool_slot${slotConfirmClass}" data-pool-slot="${slot.slot}">${this.cardFaceById(slot.id)}${canConfirmTake && this.selectedPoolSlot === slot.slot ? `<span class="bae_confirm_blurb">${confirmObserveBlurb}</span>` : ''}</button>`;
    }
    html += `</div></div>`;

    // Scoring group (right, 2 columns with centered final row)
    html += `<div class="bae_top_group bae_top_scoring"><div class="bae_scoring">${d.scoring_cards
      .map((id, idx) => `<span id="bae_score_${idx}" class="bae_score_card" data-score-idx="${idx}">${this.scoringFaceById(id)}</span>`)
      .join("")}</div></div>`;
    html += `</div>`;

    // Order: current player first, then others in turn order
    const allPids = Object.keys(this.gamedatas.players).map(Number);
    const currentIdx = allPids.indexOf(myId);
    const orderedPids = currentIdx === -1
      ? allPids
      : [myId, ...allPids.slice(currentIdx + 1), ...allPids.slice(0, currentIdx)];

    html += `<div class="bae_playerboards">`;
    for (const pid of orderedPids) {
      const isSelf = pid === myId;
      const animal_card_slots = d.boards[pid]?.reduce((max, loc) => Math.max(max, loc.length), 1) ?? 1;
      const rawPlayerColor = String(this.gamedatas.players[pid]?.color ?? "");
      const playerColor = rawPlayerColor.length > 0
        ? (rawPlayerColor.startsWith("#") ? rawPlayerColor : `#${rawPlayerColor}`)
        : "#1a1a1a";
      // Anchor each player board so scoring animations can target it
      html += `<section id="bae_playerboard_${pid}" class="bae_playerboard" data-player-id="${pid}"><h3 class="bae_heading bae_player_name" style="color:${playerColor}">${names[pid] ?? pid}</h3>`;

      // Playerboard inner wrapper holds the left-hand column (hand slots)
      // and the board canvas to its right.
      html += `<div class="bae_playerboard_inner">`;

      // Render a 4-slot hand column for the player. For non-visible hands (number)
      // show card backs (id 9999) for existing cards; otherwise show placeholders.
      const handInfo = (d.hands || {})[pid];
      html += `<div class="bae_player_handcol" data-player-id="${pid}">`;
      if (typeof handInfo === 'number') {
        const cnt = Number(handInfo);
        for (let hi = 0; hi < 4; hi++) {
          if (hi < cnt) {
            html += `<div id="bae_hand_hidden_${pid}_${hi}" class="bae_card bae_handcard_hidden">${this.cardFaceById(9999)}</div>`;
          } else {
            html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
          }
        }
      } else if (Array.isArray(handInfo)) {
        if (pid === myId) {
          // Current player's column will be rendered by renderHand() later
          // leave empty so renderHand can populate interactive buttons
        } else {
          const cnt = handInfo.length;
          for (let hi = 0; hi < 4; hi++) {
            if (hi < cnt) html += `<div id="bae_hand_hidden_${pid}_${hi}" class="bae_card bae_handcard_hidden">${this.cardFaceById(9999)}</div>`;
            else html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
          }
        }
      } else {
        // no info: show placeholders
        for (let hi = 0; hi < 4; hi++) html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
      }
      html += `</div>`; // close handcol

      const campSel = isSelf && this.campSelected ? " bae_camp_selected" : "";
      const campDotsSel = isSelf && this.campSelected ? " bae_sci_shelf_camp_selected" : "";
      const boardBg = this.imagePath("Playerboards", d.board_for_players[pid] ?? 0);
      // Expose number of animal-card slots to CSS so margin spacing scales correctly
      html += `<div class="bae_board_canvas" style="background-image:url('${boardBg}'); --animal-card-slots: ${animal_card_slots}">`;

      html += `<div id="bae_camp_${pid}_left" class="bae_camp_zone bae_camp_left${campSel}" data-player-id="${pid}" data-camp-wrap="1" role="button" tabindex="0">`;
      html += `<div id="bae_sci_shelf_camp_${pid}_left" class="bae_sci_shelf${campDotsSel}">${this.renderScientistDots(pid, d.scientists[pid], 3)}</div>`;
      html += `</div>`;

      html += `<div id="bae_camp_${pid}_right" class="bae_camp_zone bae_camp_right${campSel}" data-player-id="${pid}" data-camp-wrap="1" role="button" tabindex="0">`;
      html += `<div id="bae_sci_shelf_camp_${pid}_right" class="bae_sci_shelf${campDotsSel}">${this.renderScientistDots(pid, d.scientists[pid], 4)}</div>`;
      html += `</div>`;

      for (let loc = 0; loc < 3; loc++) {
        const sel = isSelf && this.selectedLocation === loc && !this.campSelected ? " bae_loc_selected" : "";
        const posClass = loc === 0 ? " bae_slot_left" : loc === 1 ? " bae_slot_mid" : " bae_slot_right";
        html += `<div class="bae_location_zone${posClass}${sel}" data-player-id="${pid}" data-loc="${loc}">`;

        html += `<div class="bae_anim_pile">`;
        const pile = d.boards[pid]?.[loc] ?? [];
        for (let si = 0; si < animal_card_slots; si++) {
          const card = pile[si];
          if (!card) continue;
          const slotId = `bae_pile_${pid}_${loc}_${si}`;
          const inner = this.spriteFaceById('animal', card.id, 'bae_pile_card_img', `${_("Animal card")} #${card.id}`);
          html += `<div id="${slotId}" class="bae_pile_slot" style="z-index: 1;">${inner}</div>`;
        }
        html += `</div>`;

        html += this.renderTrackColumn(pid, track, loc, d.flags[pid]?.[loc] ?? 0);

        html += `<div id="bae_sci_shelf_loc_${pid}_${loc}" class="bae_sci_shelf" data-sci-shelf="${loc}">${this.renderScientistDots(
          pid,
          d.scientists[pid],
          loc,
        )}</div>`;

        if (isSelf && this.selectedLocation === loc && (canConfirmObserve || canConfirmAssign)) {
          html += `<span class="bae_confirm_blurb bae_location_confirm">${confirmObserveBlurb}</span>`;
        }

        html += `</div>`;
      }
      html += `</div>`;
      // close inner wrapper (hand column + board canvas)
      html += `</div>`;
      html += `</section>`;
    }
    html += `</div>`;

    html += `</div>`;
    this.root.innerHTML = html;
    // Update runtime scale variable so CSS `var(--board-scale)` resolves correctly
    this.updateBoardScale();
    // Register BGA tooltips for all elements that previously used `title` attributes
    this.registerTooltips();
    this.renderPlayerPanelInfo();
    this.renderHand(myId);
    this.registerHandTooltips(myId);
    this.bindZoomHandlers();
    this.bindTableHandlers(myId);
  }

  private handleLastTurnBanner(playersEndingGame: number[]) {
    this.bga.gameArea.removeLastTurnBanner();
    if (playersEndingGame && playersEndingGame.length > 0) {
        const names = playersEndingGame.map((pid) => this.bga.players.getFormattedPlayerName(pid, { replaceByYou: true })).join(", ");
        const message = _('${player_names} triggered the end of game by observing 7 animals at a location. This is the final round!');
        this.bga.gameArea.addLastTurnBanner(message, { player_names: names });
    }
  }

  private registerTooltips(): void {
    // Ensure gameui tooltip API is available
    if (!this.bga || !this.bga.gameui || typeof (this.bga.gameui.addTooltip) !== 'function') return;

    const d = this.gamedatas.boardState;

    // Pool slots
    (d.pool || []).forEach((slot) => {
      const id = `bae_pool_slot_${slot.slot}`;
      try { this.bga.gameui.removeTooltip(id); } catch (_) {}
        const html = this.buildCardTooltipSpriteHtml(
          'animal',
          slot.id,
          _('Pool card'),
          [_('Click to take this card')],
        );
        this.bga.gameui.addTooltipHtml(id, html);
    });
    try { this.bga.gameui.removeTooltip('bae_pool_slot_deck'); } catch (_) {}
    this.bga.gameui.addTooltip('bae_pool_slot_deck', `${_('Deck')}: ${d.deck_count}<br>${_('Discard')}: ${d.discard_count}`, _('Click to draw from deck'));

    // Objectives
    (d.objectives || []).forEach((obj, idx) => {
      const id = `bae_obj_${idx}`;
      try { this.bga.gameui.removeTooltip(id); } catch (_) {}
      const objectiveMat = this.gamedatas.materials.objectives[obj.id];
      const claimedPid = Object.entries(obj.players ?? {}).find(([, state]) => state === 'claimed')?.[0];
      const claimedByName = claimedPid
        ? (this.gamedatas.players[Number(claimedPid)]?.name ?? `${_('Player')} ${claimedPid}`)
        : '';
      const objectiveDetail = claimedPid
        ? `${_('Claimed by')}: ${claimedByName}`
        : _('Unclaimed');
      const action = obj.active ? _('Click to claim this objective') : '';
        const html = this.buildCardTooltipSpriteHtml(
          'objective',
          obj.id,
          objectiveMat?.title ?? `${_('Objective')} #${obj.id}`,
          [objectiveDetail, action],
        );
        this.bga.gameui.addTooltipHtml(id, html);
    });

    // Scoring cards
    (d.scoring_cards || []).forEach((scoringId, idx) => {
      const id = `bae_score_${idx}`;
      try { this.bga.gameui.removeTooltip(id); } catch (_) {}

      const scoringMat = this.gamedatas.materials.scoring_cards?.[scoringId];
      const title = scoringMat?.title ?? `${_('Scoring card')} #${scoringId}`;
      const explanation = scoringMat?.explanation ?? '';
        const html = this.buildCardTooltipSpriteHtml(
          'scoring',
          scoringId,
          title,
          [explanation ? `${_('Explanation')}: ${explanation}` : ''],
        );
        this.bga.gameui.addTooltipHtml(id, html);
    });

    // Camps and scientist shelves: build per-location summaries using
    // gamedatas.boardState.scientists and the scientist name labels.
    const scientistNames = this.gamedatas.materials.scientist_names ?? [];
    const sciByPlayer = d.scientists || {};

    const buildSummary = (sciMap: Record<number, number[]> | undefined, atIndex: number): string => {
      if (!sciMap) return _('No scientists');
      const parts: string[] = [];
      const maxCols = Math.max(scientistNames.length, 3);
      for (let col = 0; col < maxCols; col++) {
        const poses = (sciMap[col] ?? []);
        const cnt = poses.filter((p) => p === atIndex).length;
        if (cnt > 0) {
          const label = scientistNames[col] ?? `${_('Col')} ${col + 1}`;
          parts.push(`${cnt} ${label}`);
        }
      }
      return parts.length > 0 ? parts.join(', ') : _('No scientists');
    };

    for (const pidStr of Object.keys(this.gamedatas.players)) {
      const pid = Number(pidStr);
      const leftId = `bae_camp_${pid}_left`;
      const rightId = `bae_camp_${pid}_right`;
      try { this.bga.gameui.removeTooltip(leftId); } catch (_) {}
      try { this.bga.gameui.removeTooltip(rightId); } catch (_) {}

      const campLeftSummary = buildSummary(sciByPlayer[pid], 3);
      const campRightSummary = buildSummary(sciByPlayer[pid], 4);
      this.bga.gameui.addTooltip(leftId, campLeftSummary, _('Select this camp to start/cancel regroup.'));
      this.bga.gameui.addTooltip(rightId, campRightSummary, _('Select this camp to start/cancel regroup.'));

      for (let loc = 0; loc < 3; loc++) {
        const shelfId = `bae_sci_shelf_loc_${pid}_${loc}`;
        try { this.bga.gameui.removeTooltip(shelfId); } catch (_) {}
        const shelfSummary = buildSummary(sciByPlayer[pid], loc);
        this.bga.gameui.addTooltip(shelfId, shelfSummary, '');
      }
    }

    // console.log(d, this.gamedatas.materials);

    // Track positions (space tooltips)
    const trackVps = this.gamedatas.materials.track_space_vp;
    const vehicleNames = this.gamedatas.materials.vehicle_names;
    for (const pidStr of Object.keys(this.gamedatas.players)) {
      const pid = Number(pidStr);
      const tracksVehicles = this.gamedatas.materials.player_boards[d.board_for_players[pid] ?? 0] ?? {};
      for (let loc = 0; loc < 3; loc++) {
        const trackKey = loc == 0 ? 'left_location' : loc == 1 ? 'mid_location' : 'right_location';
        const trackVehicles = tracksVehicles[trackKey] ?? [];
        for (let i = 0; i < 8; i++) {
          const vehiclesAtSpace = trackVehicles[i - 1] ?? [];
          const id = `bae_track_${pid}_${loc}_${i}`;
          try { this.bga.gameui.removeTooltip(id); } catch (_) {}
          const vpEntry = trackVps[loc]?.[i] ?? 0;
          const help = `${_('Exploration Track')} ${i} · ${vehiclesAtSpace.map(v => vehicleNames[v] ?? `#${v}`).join(', ')} · ${vpEntry} ${_('VP')}`;
          this.bga.gameui.addTooltip(id, help, '');
        }
      }
    }
  }

  private renderTrackColumn(player_id: number, track: TrackUiClient, location: number, flagDepth: number): string {
    const safeDepth = Math.max(0, Math.min(7, flagDepth));
    const baseUrl = this.bga.images.getImgUrl();
    let html = `<div class="bae_track">`;
    for (let i = 0; i < 8; i++) {
      const jitterLeft = ((player_id * 3 + location * 5 + i * 7) % 9) - 4;
      const jitterTop = ((player_id * 7 + location * 3 + i * 11) % 9) - 4;
      const left = 50 + jitterLeft;
      const top = 50 + jitterTop;

      const flagImg = i === safeDepth
        ? `<img class="bae_track_flag_only" src="${baseUrl}Tokens/FlagToken.webp" alt="${_("Flag")}" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%" draggable="false"/>`
        : '';
      html += `<div id="bae_track_${player_id}_${location}_${i}" class="bae_track_position">${flagImg}</div>`;
    }
    html += `</div>`;
    return html;
  }

  private renderScientistDots(player_id: number, sci: Record<number, number[]> | undefined, location: number): string {
    if (!sci) return "";
    const meepleFiles = ["YellowMeeple", "PinkMeeple", "TealMeeple"];
    const meepleClasses = ["bae_meeple_yellow", "bae_meeple_pink", "bae_meeple_teal"];
    const baseUrl = this.bga.images.getImgUrl();
    const meeples: number[] = [];
    for (let col = 0; col < 3; col++) {
      const poses = sci[col] ?? [];
      const n = poses.filter((p) => p === location).length;
      for (let i = 0; i < n; i++) meeples.push(col);
    }
    if (meeples.length === 0) return '';
    const n = meeples.length;
    const [cols, rows] = (() => {
      switch (n) {
        case 1: return location < 3 ? [1, 1] : [1, 1];
        case 2: return location < 3 ? [2, 1] : [2, 1];
        case 3: return location < 3 ? [3, 1] : [2, 2];
        case 4: return location < 3 ? [2, 2] : [2, 2];
        case 5: return location < 3 ? [3, 2] : [2, 3];
        case 6: return location < 3 ? [3, 2] : [2, 3];
        case 7: return location < 3 ? [3, 3] : [2, 4];
        case 8: return location < 3 ? [3, 3] : [2, 4];
        case 9: return location < 3 ? [3, 3] : [3, 3];
        default: return location < 3 ? [4, Math.ceil(n / 4)] : [3, Math.ceil(n / 3)];
      }
    })();
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const col = meeples[i];
      const src = `${baseUrl}Tokens/${meepleFiles[col]}.webp`;
      const c = i % cols;
      const r = Math.floor(i / cols);
      const baseLeft = (c + 1) / (cols + 1) * 100;
      const baseTop = (r + 1) / (rows + 1) * 100;
      // small deterministic jitter so meeples look naturally scattered
      const jitterX = ((i * 7 + col * 3 + 13 * location + 11 * player_id) % 5) - 2;
      const jitterY = ((i * 11 + col * 5 + 17 * location + 19 * player_id) % 5) - 2;
      const left = baseLeft + jitterX;
      const top = baseTop + jitterY;
      out.push(`<img class="bae_meeple_img ${meepleClasses[col]}" src="${src}" alt="" draggable="false" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%"/>`);
    }

    // Deterministic shuffle using a seeded Fisher–Yates shuffle to randomize
    // layering without the unstable Array.sort(random) pattern.
    const seed = (n * 374761393 + location * 668265263 + player_id * 982451653) >>> 0;
    let s = seed;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const indices = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }
    return indices.map((ix) => out[ix]).join("");
  }

  private formatScientists(sci: Record<number, number[]> | undefined): string {
    if (!sci) return "";
    const parts: string[] = [];
    for (let col = 0; col < 3; col++) {
      const poses = sci[col] ?? [];
      const atCamp = poses.filter((p) => p === 3 || p === 4).length;
      const atL = poses.filter((p) => p === 0).length;
      const atM = poses.filter((p) => p === 1).length;
      const atR = poses.filter((p) => p === 2).length;
      parts.push(`${_("Col")}${col + 1}: L${atL} M${atM} R${atR} · ${_("camp")} ${atCamp}`);
    }
    return parts.join(" · ");
  }

  private imagePath(folder: string, id: number): string {
    const value = Number(id);
    const safeId = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 9999;
    return `${this.bga.images.getImgUrl()}${folder}/${String(safeId).padStart(4, "0")}.webp`;
  }

  private imageTag(folder: string, id: number, className: string, alt: string, extraAttrs = ""): string {
    const src = this.imagePath(folder, id);
    const safeAlt = alt.replace(/"/g, "&quot;");
    const attrs = extraAttrs ? ` ${extraAttrs}` : "";
    return `<img class="${className}" src="${src}" alt="${safeAlt}" draggable="false"${attrs}/>`;
  }

  private getSpriteIndex(id: number, lastIndex: number): number {
    const value = Number(id);
    const safeId = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 9999;
    if (safeId === 9999) return lastIndex;
    return Math.max(0, Math.min(lastIndex - 1, safeId));
  }

  private spriteStyleById(type: 'animal' | 'objective' | 'scoring', id: number): { spriteClass: string; x: string; y: string } {
    let columns = 1;
    let rows = 1;
    let lastIndex = 0;
    let spriteClass = '';

    if (type === 'animal') {
      columns = Game.ANIMAL_SPRITE_COLUMNS;
      rows = Game.ANIMAL_SPRITE_ROWS;
      lastIndex = Game.ANIMAL_SPRITE_LAST_INDEX;
      spriteClass = 'bae_sprite_animal';
    } else if (type === 'objective') {
      columns = Game.OBJECTIVE_SPRITE_COLUMNS;
      rows = Game.OBJECTIVE_SPRITE_ROWS;
      lastIndex = Game.OBJECTIVE_SPRITE_LAST_INDEX;
      spriteClass = 'bae_sprite_objective';
    } else {
      columns = Game.SCORING_SPRITE_COLUMNS;
      rows = Game.SCORING_SPRITE_ROWS;
      lastIndex = Game.SCORING_SPRITE_LAST_INDEX;
      spriteClass = 'bae_sprite_scoring';
    }

    const index = this.getSpriteIndex(id, lastIndex);
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = columns > 1 ? (col / (columns - 1)) * 100 : 0;
    const y = rows > 1 ? (row / (rows - 1)) * 100 : 0;

    return {
      spriteClass,
      x: `${x.toFixed(4)}%`,
      y: `${y.toFixed(4)}%`,
    };
  }

  private spriteFaceById(type: 'animal' | 'objective' | 'scoring', id: number, className: string, alt: string): string {
    const sprite = this.spriteStyleById(type, id);
    const safeAlt = alt.replace(/"/g, "&quot;");
    return `<div class="${className} ${sprite.spriteClass}" role="img" aria-label="${safeAlt}" style="--sprite-x:${sprite.x};--sprite-y:${sprite.y};"></div>`;
  }

  private spriteMeta(type: 'animal' | 'objective' | 'scoring'): { columns: number; rows: number; lastIndex: number; } {
    if (type === 'animal') {
      return {
        columns: Game.ANIMAL_SPRITE_COLUMNS,
        rows: Game.ANIMAL_SPRITE_ROWS,
        lastIndex: Game.ANIMAL_SPRITE_LAST_INDEX,
      };
    }
    if (type === 'objective') {
      return {
        columns: Game.OBJECTIVE_SPRITE_COLUMNS,
        rows: Game.OBJECTIVE_SPRITE_ROWS,
        lastIndex: Game.OBJECTIVE_SPRITE_LAST_INDEX,
      };
    }
    return {
      columns: Game.SCORING_SPRITE_COLUMNS,
      rows: Game.SCORING_SPRITE_ROWS,
      lastIndex: Game.SCORING_SPRITE_LAST_INDEX,
    };
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private buildCardTooltipSpriteHtml(type: 'animal' | 'objective' | 'scoring', id: number, title: string, details: string[]): string {
    const { columns, rows, lastIndex } = this.spriteMeta(type);
    const index = this.getSpriteIndex(id, lastIndex);
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = columns > 1 ? (col / (columns - 1)) * 100 : 0;
    const y = rows > 1 ? (row / (rows - 1)) * 100 : 0;

    const safeTitle = this.escapeHtml(title);

    const scaleRaw = this.root ? getComputedStyle(this.root).getPropertyValue('--bae-scale') : '';
    const currentScale = Number.parseFloat(scaleRaw);
    const baseScale = Number.isFinite(currentScale) ? currentScale : this.getScale();
    const tooltipScale = Math.max(0.01, baseScale * 2);
    const tier = tooltipScale >= 0.55 ? 'full' : tooltipScale >= 0.25 ? 'half' : 'quarter';
    const baseUrl = this.bga.images.getImgUrl();
    const animalSpriteUrl = `${baseUrl}Sprites/AnimalCards_sheet_${tier}.webp`;
    const objectiveSpriteUrl = `${baseUrl}Sprites/ObjectiveCards_sheet_${tier}.webp`;
    const scoringSpriteUrl = `${baseUrl}Sprites/ScoringCards_sheet_${tier}.webp`;
    const vpIcon = `${baseUrl}Tokens/VP.svg`;
    const vpInline = `<span class="bae_text_with_icon"><img class="bae_vp_inline" src="${vpIcon}" alt="" draggable="false"/></span>`;

    const detailHtml = details
      .filter((line) => line && line.trim().length > 0)
      .map((line) => {
        const escapedLine = this.escapeHtml(line);
        const withIcons = escapedLine.replace(/\{VP\}/g, vpInline);
        return `<div>${withIcons}</div>`;
      })
      .join('');

    const bgSizeX = (columns * 100).toFixed(4);
    const bgSizeY = (rows * 100).toFixed(4);
    const width = (type === 'objective' ? 745 : 528) * tooltipScale;
    const aspectRatio = type === 'objective' ? '745 / 528' : '528 / 745';
    const typeFontPx = (56 * tooltipScale).toFixed(2);
    const descFontPx = (44 * tooltipScale).toFixed(2);
    const detailFontPx = 13;

    let cardHtml;
    if (type === 'objective') {
      cardHtml = this.objectiveFaceById(id)
        .replace(
          '<div class="bae_obj_img bae_overlay_card"',
          `<div class="bae_obj_img bae_overlay_card" style="width:100%;height:100%;--animal-sprite-url:url('${animalSpriteUrl}');--objective-sprite-url:url('${objectiveSpriteUrl}');--scoring-sprite-url:url('${scoringSpriteUrl}');"`,
        )
        .replace('class="bae_fit_text bae_obj_type_bounds"', `class="bae_fit_text bae_obj_type_bounds" style="font-size:${typeFontPx}px;"`)
        .replace('class="bae_fit_text bae_obj_title_bounds"', `class="bae_fit_text bae_obj_title_bounds" style="font-size:${typeFontPx}px;"`)
        .replace('class="bae_fit_text bae_obj_desc_bounds"', `class="bae_fit_text bae_obj_desc_bounds" style="font-size:${descFontPx}px;"`);
    } else if (type === 'scoring') {
      cardHtml = this.scoringFaceById(id)
        .replace(
          '<div class="bae_score_img bae_overlay_card"',
          `<div class="bae_score_img bae_overlay_card" style="width:100%;height:100%;--animal-sprite-url:url('${animalSpriteUrl}');--objective-sprite-url:url('${objectiveSpriteUrl}');--scoring-sprite-url:url('${scoringSpriteUrl}');"`,
        )
        .replace('class="bae_fit_text bae_score_type_bounds"', `class="bae_fit_text bae_score_type_bounds" style="font-size:${typeFontPx}px;"`)
        .replace('class="bae_fit_text bae_score_title_bounds"', `class="bae_fit_text bae_score_title_bounds" style="font-size:${typeFontPx}px;"`)
        .replace('class="bae_fit_text bae_score_desc_bounds"', `class="bae_fit_text bae_score_desc_bounds" style="font-size:${descFontPx}px;"`);
    }
    else if (type === 'animal') {
      cardHtml = this.cardFaceById(id)
        .replace(
          '<div class="bae_card_img bae_overlay_card"',
          `<div class="bae_card_img bae_overlay_card" style="width:100%;height:100%;--animal-sprite-url:url('${animalSpriteUrl}');--objective-sprite-url:url('${objectiveSpriteUrl}');--scoring-sprite-url:url('${scoringSpriteUrl}');"`,
        );
    }

    const detailsBlock = detailHtml.length > 0
      ? `<div style="width:${width}px;font-size:${detailFontPx}px;line-height:1.35;">${detailHtml}</div>`
      : '';

    return `
      <div style="width:${width}px;max-width:${width}px;display:flex;flex-direction:column;align-items:stretch;gap:8px;font-family:'BaeCardSerif', serif;--bae-scale:${tooltipScale};--animal-sprite-url:url('${animalSpriteUrl}');--objective-sprite-url:url('${objectiveSpriteUrl}');--scoring-sprite-url:url('${scoringSpriteUrl}');">
        <div style="width:${width}px;aspect-ratio:${aspectRatio};display:block;border-radius:6px;overflow:hidden;">${cardHtml}</div>
        ${detailsBlock}
      </div>
    `;
  }

  private cardFaceById(cardId: number): string {
    return this.spriteFaceById('animal', cardId, 'bae_card_img', `${_("Animal card")} #${cardId}`);
  }

  private objectiveFaceById(objectiveId: number): string {
    const mat = this.gamedatas.materials.objectives?.[objectiveId];
    const title = this.escapeHtml(mat?.title ?? `${_("Objective")} #${objectiveId}`);
    const description = this.escapeHtml(mat?.description ?? '');
    const typeLabel = this.escapeHtml(_("Objective"));
    const sprite = this.spriteStyleById('objective', objectiveId);

    return `
      <div class="bae_obj_img bae_overlay_card" aria-label="${title}">
        <div class="bae_overlay_sprite ${sprite.spriteClass}" style="--sprite-x:${sprite.x};--sprite-y:${sprite.y};"></div>
        <div class="bae_card_text_layer bae_objective_text_layer" aria-hidden="true">
          <div class="bae_fit_text bae_obj_type_bounds" data-fit-max="56"><div class="bae_fit_text_inner">${typeLabel}</div></div>
          <div class="bae_fit_text bae_obj_title_bounds" data-fit-max="56"><div class="bae_fit_text_inner">${title}</div></div>
          <div class="bae_fit_text bae_obj_desc_bounds" data-fit-max="44"><div class="bae_fit_text_inner">${description}</div></div>
        </div>
      </div>
    `;
  }

  private scoringFaceById(scoringId: number): string {
    const mat = this.gamedatas.materials.scoring_cards?.[scoringId];
    const title = this.escapeHtml(mat?.title ?? `${_("Scoring card")} #${scoringId}`);
    const descriptionRaw = mat?.description && mat.description.trim().length > 0
      ? mat.description
      : (mat?.explanation ?? '');
    const description = this.escapeHtml(descriptionRaw);
    const typeLabel = this.escapeHtml(_("Scoring"));
    const sprite = this.spriteStyleById('scoring', scoringId);

    const vpIcon = `${this.bga.images.getImgUrl()}Tokens/VP.svg`;
    const vpInline = `<span class="bae_text_with_icon"><img class="bae_vp_inline" src="${vpIcon}" alt="" draggable="false"/></span>`;
    const descriptionWithVp = description.replace(/\{VP\}/g, vpInline);

    return `
      <div class="bae_score_img bae_overlay_card" aria-label="${title}">
        <div class="bae_overlay_sprite ${sprite.spriteClass}" style="--sprite-x:${sprite.x};--sprite-y:${sprite.y};"></div>
        <div class="bae_card_text_layer bae_scoring_text_layer" aria-hidden="true">
          <div class="bae_fit_text bae_score_type_bounds" data-fit-max="56"><div class="bae_fit_text_inner">${typeLabel}</div></div>
          <div class="bae_fit_text bae_score_title_bounds" data-fit-max="56"><div class="bae_fit_text_inner">${title}</div></div>
          <div class="bae_fit_text bae_score_desc_bounds" data-fit-max="44"><div class="bae_fit_text_inner">${descriptionWithVp}</div></div>
        </div>
      </div>
    `;
  }

  private fitCardOverlayText(): void {
    if (!this.root) return;

    const scaleRaw = getComputedStyle(this.root).getPropertyValue('--bae-scale');
    const boardScale = Math.max(0.01, Number.parseFloat(scaleRaw) || 1);
    const boxes = this.root.querySelectorAll<HTMLElement>('.bae_fit_text');
    boxes.forEach((box) => {
      const inner = box.querySelector('.bae_fit_text_inner') as HTMLElement | null;
      if (!inner) return;

      const text = inner.textContent?.trim() ?? '';
      if (text.length === 0) {
        inner.style.fontSize = '';
        return;
      }

      const maxAttr = Number.parseFloat(box.dataset.fitMax ?? '');
      const scaledCap = Number.isFinite(maxAttr) ? maxAttr * boardScale : Number.POSITIVE_INFINITY;
      const maxSize = Math.max(8, Math.min(box.clientHeight, box.clientWidth, scaledCap));
      let low = 6;
      let high = maxSize;
      let best = low;

      for (let i = 0; i < 10; i++) {
        const mid = (low + high) / 2;
        inner.style.fontSize = `${mid}px`;
        const fits = inner.scrollWidth <= box.clientWidth + 0.5 && inner.scrollHeight <= box.clientHeight + 0.5;
        if (fits) {
          best = mid;
          low = mid;
        } else {
          high = mid;
        }
      }

      inner.style.fontSize = `${best}px`;
    });
  }

  private playerBoardFaceById(boardId: number): string {
    return this.imageTag("Playerboards", boardId, "bae_board_img", `${_("Player board")} #${boardId}`);
  }

  private renderHand(myId: number) {
    // Prefer the per-player hand column inside the player's board; fallback to the
    // legacy central hand element if it exists.
    let wrap = this.root.querySelector(`#bae_playerboard_${myId} .bae_player_handcol`) as HTMLElement | null;
    if (!wrap) wrap = this.root.querySelector("#bae_hand") as HTMLElement | null;
    if (!wrap) return;

    if (this.bga.players.isCurrentPlayerSpectator()) {
      wrap.innerHTML = `<div class="bae_hidden_count">${_("Spectator view")}</div>`;
      return;
    }

    const d = this.gamedatas.boardState;
    const h = d.hands[myId];
    let html = "";
    if (typeof h === "number") {
      // Show card backs for hidden cards up to 4 slots
      const cnt = Number(h);
      for (let i = 0; i < 4; i++) {
        if (i < cnt) html += `<div id="bae_hand_hidden_${myId}_${i}" class="bae_card bae_handcard_hidden">${this.cardFaceById(9999)}</div>`;
        else html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
      }
    } else if (Array.isArray(h)) {
      const HAND_RESERVE = 4;
      for (const c of h) {
        const id = Number(c.id);
        const selObs = !this.campSelected && this.selectedCardId === id ? " bae_card_selected" : "";
        const selRg = (this.campSelected || this.isOpeningMulliganLike()) && this.selectedRegroupIds.has(id) ? " bae_card_regroup" : "";
        const confirmBlurb = this.isGameplayLike() && this.selectedCardId === id && this.selectedLocation != null
          ? `<span class="bae_confirm_blurb">${this.escapeHtml(_('Confirm?'))}</span>`
          : '';
        html += `<button id="bae_hand_${myId}_${id}" type="button" class="bae_card bae_handcard${selObs}${selRg}" data-hand-card="${id}">${this.cardFaceById(id)}${confirmBlurb}</button>`;
      }
      for (let i = h.length; i < HAND_RESERVE; i++) {
        html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
      }
    } else {
      // No data: fill placeholders
      for (let i = 0; i < 4; i++) html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
    }

    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-hand-card]").forEach((el) => {
      el.addEventListener(
        "click",
        (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const id = Number((ev.currentTarget as HTMLElement).dataset.handCard);
          if (!this.bga.players.isCurrentPlayerActive()) return;
          if (this.isOpeningMulliganLike()) {
            if (this.selectedRegroupIds.has(id)) this.selectedRegroupIds.delete(id);
            else this.selectedRegroupIds.add(id);
          } else if (this.campSelected) {
            if (this.selectedRegroupIds.has(id)) this.selectedRegroupIds.delete(id);
            else this.selectedRegroupIds.add(id);
          } else if (this.isGameplayLike()) {
            if (this.selectedCardId === id) {
              if (this.confirmObserveIfReady(id, this.selectedLocation)) return;
              return;
            }
            this.selectedCardId = id;
          } else {
            return;
          }
          this.renderAll();
          // Refresh action buttons so the Regroup label/count updates immediately
          this.onUpdateActionButtons(this.currentStateName(), null);
        },
        true,
      );
    });
  }

  private bindTableHandlers(myId: number) {
    this.root.querySelectorAll("[data-loc]").forEach((el) => {
      el.addEventListener(
        "click",
        (ev) => {
          // If the click originated inside a pile slot or pile card image, let
          // that handler handle it instead (we'll attach handlers to those
          // elements below). Avoid preventing default in that case so the
          // other listener runs.
          const target = ev.target as HTMLElement | null;
          if (target && typeof target.closest === 'function' && target.closest('.bae_pile_slot, .bae_pile_card_img')) return;
          ev.preventDefault();
          ev.stopPropagation();
          const pid = Number((el as HTMLElement).dataset.playerId);
          if (pid !== myId) return;
          const loc = Number((el as HTMLElement).dataset.loc);
          if (this.isAssignCampLike() && this.bga.players.isCurrentPlayerActive()) {
            if (this.selectedLocation === loc) {
              void this.bga.actions.performAction("actAssignScientists", { location: loc });
              return;
            }
            this.selectedLocation = loc;
            this.renderAll();
            return;
          }
          if (this.isGameplayLike() && this.bga.players.isCurrentPlayerActive()) {
            if (this.campSelected) {
              // Selecting a location while a camp is selected should clear camp selection
              // and select the location instead.
              this.campSelected = false;
              this.selectedRegroupIds.clear();
              this.selectedCardId = null;
              this.selectedLocation = loc;
              this.renderAll();
              this.onUpdateActionButtons(this.currentStateName(), null);
            } else {
              if (this.selectedLocation === loc) {
                if (this.confirmObserveIfReady(this.selectedCardId, loc)) return;
                return;
              }
              this.selectedLocation = loc;
              this.renderAll();
              // Update action row when selecting/deselecting a location
              this.onUpdateActionButtons(this.currentStateName(), null);
            }
          }
        },
        true,
      );
    });

    // Clicking a pile slot or the card image inside it should act like
    // selecting the containing location. Attach handlers to both slots and
    // images so clicks on either element work.
    this.root.querySelectorAll('.bae_pile_slot, .bae_pile_card_img').forEach((el) => {
      el.addEventListener(
        'click',
        (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const cur = ev.currentTarget as HTMLElement;
          const slotEl = cur.classList.contains('bae_pile_slot') ? cur : cur.closest('.bae_pile_slot') as HTMLElement | null;
          if (!slotEl) return;
          const m = slotEl.id.match(/^bae_pile_(\d+)_(\d+)_\d+$/);
          if (!m) return;
          const pid = Number(m[1]);
          const loc = Number(m[2]);
          if (pid !== myId) return;
          if (this.isAssignCampLike() && this.bga.players.isCurrentPlayerActive()) {
            if (this.selectedLocation === loc) {
              void this.bga.actions.performAction('actAssignScientists', { location: loc });
              return;
            }
            this.selectedLocation = loc;
            this.renderAll();
            return;
          }
          if (this.isGameplayLike() && this.bga.players.isCurrentPlayerActive()) {
            if (this.campSelected) {
              this.campSelected = false;
              this.selectedRegroupIds.clear();
              this.selectedCardId = null;
              this.selectedLocation = loc;
              this.renderAll();
              this.onUpdateActionButtons(this.currentStateName(), null);
            } else {
              if (this.selectedLocation === loc) {
                if (this.confirmObserveIfReady(this.selectedCardId, loc)) return;
                return;
              }
              this.selectedLocation = loc;
              this.renderAll();
              this.onUpdateActionButtons(this.currentStateName(), null);
            }
          }
        },
        true,
      );
    });
    this.root.querySelectorAll("[data-camp-wrap]").forEach((el) => {
      el.addEventListener(
        "click",
        (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const pid = Number((el as HTMLElement).dataset.playerId);
          if (pid !== myId) return;
          if (!this.isGameplayLike() || !this.bga.players.isCurrentPlayerActive()) return;
          // Camp selection is idempotent: clicking camp again does nothing.
          if (this.campSelected) return;
          this.enterRegroupMode();
        },
        true,
      );
    });
    this.root.querySelectorAll("[data-pool-slot]").forEach((el) => {
      el.addEventListener("click", () => {
        if (!this.bga.players.isCurrentPlayerActive()) return;
        if (!this.isReplenishLike()) return;
        const slot = Number((el as HTMLElement).dataset.poolSlot);
        if (this.selectedPoolSlot === slot) {
          void this.bga.actions.performAction("actTakeAnimal", { pool_slot: slot });
          return;
        }
        this.selectedPoolSlot = slot;
        this.renderAll();
      });
    });
    this.root.querySelectorAll("[data-obj-idx]").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number((el as HTMLElement).dataset.objIdx);
        if (!this.bga.players.isCurrentPlayerActive()) return;
        // Only allow claiming when this player actually 'meets' the objective
        const obj = this.gamedatas.boardState.objectives?.[idx];
        if (!obj) return;
        const playerState = obj.players?.[myId] ?? 'unmet';
        if (playerState !== 'meets') return;

        // if inside the "promptclaimobjective" state, use that action instead:
        const inClaim = this.isOpeningMulliganLike();
        const actionName = inClaim ? "actClaimPromptObjective" : "actClaimObjective";
        void this.bga.actions.performAction(actionName, { objective_index: idx });
      });
    });
  }

  onEnteringState(stateName: string, _args: { args: Record<string, unknown> | null }) {
    this.selectedCardId = null;
    this.selectedLocation = null;
    this.selectedPoolSlot = null;
    this.campSelected = false;
    this.selectedRegroupIds.clear();
    const n = stateName.toLowerCase();
    if (n.includes("gameplay") || n.includes("replenish") || n.includes("assign") || n.includes("openingmulligan")) {
      this.renderAll();
    }
  }

  onLeavingState(_stateName: string) {}

  onUpdateActionButtons(stateName: string, args: Record<string, unknown> | null) {
    this.bga.statusBar.removeActionButtons();
    if (!this.bga.players.isCurrentPlayerActive()) return;
    const sn = stateName.toLowerCase();
    if (sn.includes("promptclaimobjective") || sn.includes("prompt_claim_objective")) {
      const myId = Number(this.bga.players.getCurrentPlayerId());
      const promptArgs = args as unknown as PromptClaimArgs | null;
      const pending = promptArgs?.pendingByPlayer?.[myId] ?? [];
      if (pending.length === 0) return;

      const target = pending[0];
      const claimLabel = _("Claim objective");
      const skipLabel = _("Don't claim");
      this.bga.statusBar.addActionButton(`${claimLabel}: ${target.title}`, () => {
        void this.bga.actions.performAction("actClaimPromptObjective", {
          objective_index: target.index,
        });
      }, {
        disabled: false,
        tooltip: _("Claim this objective now and score 5 VP."),
      });

      this.bga.statusBar.addActionButton(skipLabel, () => {
        void this.bga.actions.performAction("actSkipPromptObjective", {
          objective_index: target.index,
        });
      }, {
        disabled: false,
        tooltip: _("Do not claim this objective. You will not be prompted to claim later and will not be able to claim if your turn has passed this round. This is added to mimic game rules where you can claim objectives at any time if you realized that you meet the objective requirements after it is claimed."),
      });
      return;
    }

    if (sn.includes("openingmulligan")) {
      const replaceCount = this.selectedRegroupIds.size;
      const replaceLabel = _("Replace ${count} Card(s)").replace("${count}", String(replaceCount));
      this.bga.statusBar.addActionButton(replaceLabel, () => {
        const ids = Array.from(this.selectedRegroupIds);
        void this.bga.actions.performAction("actMulliganHand", {
          card_ids_json: JSON.stringify(ids),
        });
      }, {
        disabled: false,
        tooltip: _("Select any cards to replace, or keep your hand as is and confirm to begin the game."),
      });

      const clearDisabled = this.selectedRegroupIds.size === 0;
      this.bga.statusBar.addActionButton(_('Clear selection'), () => {
        this.selectedRegroupIds.clear();
        this.renderAll();
        this.onUpdateActionButtons(this.currentStateName(), null);
      }, {
        disabled: clearDisabled,
        tooltip: clearDisabled ? _("No cards selected.") : _("Clear selected cards.")
      });
      return;
    }

    if (sn.includes("gameplay")) {
      if (this.campSelected) {
        const regroupCount = this.selectedRegroupIds.size;
        const replaceLabel = _("Replace ${count} Card(s)").replace("${count}", String(regroupCount));
        this.bga.statusBar.addActionButton(replaceLabel, () => {
          const ids = Array.from(this.selectedRegroupIds);
          void this.bga.actions.performAction("actRegroup", {
            card_ids_json: JSON.stringify(ids),
          });
        }, {
          disabled: false,
          tooltip: _("Discard as many animal cards as you want from your hand (this can be 0 cards), draw that many cards from the deck. After confirming, you will take all your scientists from both camps and put them all in a single location of your choice. You are awarded as many VP as scientists moved from the camps."),
        });

        this.bga.statusBar.addActionButton(_('Clear Selection (Undo Regroup)'), () => {
          this.clearSelection();
        }, {
          disabled: false,
          tooltip: _("Leave regroup mode and clear the discard selection."),
        });
        return;
      }

      const observeDisabled = this.selectedCardId == null || this.selectedLocation == null;
      this.bga.statusBar.addActionButton(_("Observe"), () => {
        if (observeDisabled) return;
        void this.bga.actions.performAction("actObserveAnimal", {
          card_id: this.selectedCardId,
          location: this.selectedLocation,
        });
      }, {
        disabled: observeDisabled,
        tooltip: (observeDisabled ? _("Select a card from your hand and a location to observe. ") : "") + _("Play an animal card from your hand, placing it in a location containing the scientists matching those printed on the card."),
    });

      this.bga.statusBar.addActionButton(_('Start Regroup'), () => {
        this.enterRegroupMode();
      }, {
        disabled: false,
        tooltip: _("Start choosing cards to discard and select a camp to regroup."),
      });

      const clearDisabled = this.selectedCardId == null && this.selectedLocation == null && !this.campSelected && this.selectedRegroupIds.size === 0;
      this.bga.statusBar.addActionButton(_('Clear selection'), () => {
         this.clearSelection();
      }, {
        disabled: clearDisabled,
        tooltip: clearDisabled ? _("No selection to clear.") : _("Clear all selections.")
      });
    }
    if (sn.includes("replenish")) {
      this.bga.statusBar.addActionButton(_("Draw from deck"), () => {
        void this.bga.actions.performAction("actTakeAnimal", { pool_slot: -1 });
      });
      const can = args && (args as unknown as ReplenishArgs).canMulligan;
    //   console.log("Can mulligan?", can, args);
        this.bga.statusBar.addActionButton(_("Mulligan pool (-1 VP)"), () => {
          void this.bga.actions.performAction("actMulliganPool", {});
        }, {
            disabled: !can,
            tooltip: can ? _("Pay 1 VP to discard all 4 available cards forming the pool and replace them with 4 new ones from the deck before choosing your card.") : _("You can only mulligan once per turn, only if you have at least 1 VP."),
        });
    }
  }

  async notif_observeAnimal(_args: any) {
    if (_args.boardState) {
        this.gamedatas.boardState = _args.boardState;
    }
    this.renderAll();
  }
  async notif_takeAnimal(_args: any) {
    if (_args.boardState) {
        this.gamedatas.boardState = _args.boardState;
    }
    this.renderAll();
  }
  async notif_mulliganPool(_args: any) {
    if (_args.boardState) {
        this.gamedatas.boardState = _args.boardState;
    }
    this.renderAll();

    const pid = Number(_args.player_id ?? _args.playerId ?? 0);
    const ctr = this.bga.playerPanels.getScoreCounter(pid);
    ctr.incValue(-1);
  }
  async notif_mulliganHand(_args: any) {
    if (_args.boardState) {
        this.gamedatas.boardState = _args.boardState;
    }
    this.renderAll();
  }
  async notif_regroup(_args: any) {
    // animate VP from camps (if any) for the acting player
    if (_args.boardState) {
        this.gamedatas.boardState = _args.boardState;
    }
    this.renderAll();

    const pid = Number(_args.player_id ?? _args.playerId ?? 0);
    const vpGained = Number(_args.vp_from_camps ?? 0);
    const ctr = this.bga.playerPanels.getScoreCounter(pid);
    ctr.incValue(vpGained);
  }
  async notif_assignScientists(_args: any) {
    if (_args.boardState) {
        this.gamedatas.boardState = _args.boardState;
    }
    this.renderAll();
  }
  async notif_objectiveClaimed(_args: any) {
    if (_args.boardState) {
        this.gamedatas.boardState = _args.boardState;
    }
    this.renderAll();
  }
  async notif_objectiveScored(_args: any) {
    if (_args.boardState) {
        this.gamedatas.boardState = _args.boardState;
    }
    this.renderAll();

    const pid = Number(_args.player_id ?? _args.playerId ?? 0);
    const score = Number(_args.score ?? 0);
    const ctr = this.bga.playerPanels.getScoreCounter(pid);
    ctr.incValue(score);
  }
  async notif_endOfRound(_args: any) {
    if (_args.boardState) {
        this.gamedatas.boardState = _args.boardState;
    }
    this.renderAll();
  }
  async notif_finalScoring(_args: any) {
    if (_args.boardState) {
        this.gamedatas.boardState = _args.boardState;
    }
    this.renderAll();
  }
  async notif_scoringStep(_args: any) {
    if (_args.boardState) {
      this.gamedatas.boardState = _args.boardState;
    }
    // Ensure DOM anchors exist
    this.renderAll();

    const pid = Number(_args.player_id ?? _args.playerId ?? 0);
    const anchorId = String(_args.anchor_id ?? `bae_playerboard_${pid}`);
    let color = String(_args.color ?? (this.gamedatas.players?.[pid]?.color ?? ""));
    if (color.startsWith && color.startsWith('#')) color = color.substring(1);
    const amount = Number(_args.amount ?? 0);
    const scoreStr = (amount >= 0 ? '+' : '') + String(amount);
    const duration = typeof _args.duration === 'number' ? _args.duration : 1200;
    const offset_x = typeof _args.offset_x === 'number' ? Number(_args.offset_x) : undefined;
    const offset_y = typeof _args.offset_y === 'number' ? Number(_args.offset_y) : undefined;

    try {
      if (this.bga && (this.bga as any).gameui && typeof (this.bga as any).gameui.displayScoring === 'function') {
        (this.bga as any).gameui.displayScoring(anchorId, color, scoreStr, duration, offset_x ?? null, offset_y ?? null);
      }
    } catch (err) {
      console.error('scoringStep display failed', err, _args);
    }

    // Update view after animation starts so player panels and board reflect new totals
    this.renderAll();

    // Update the numeric score counter safely (use incValue for deltas to avoid NaN from strings)
    const ctr = this.bga.playerPanels.getScoreCounter(pid);
    ctr.incValue(amount);
  }
}
