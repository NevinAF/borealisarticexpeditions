const SCI_COLOR = ["#ddb162", "#eca6b8", "#7dc7bc"];

import { AnimalDefLite, canObserveAtLocation } from './optional/Legality';
import { OptionalUi, MAX_LOCATION_CARDS } from './optional/OptionalUi';
import { objectiveProgress, scoreScoringCard, SPECIES_SET_VP } from './optional/Progress';
import { optimalTokens, playerVp, scoringStepAmount, vpTokensInnerHtml } from './optional/VpTokens';

export class Game {
  private static readonly BOARD_REFERENCE_WIDTH_PX = 3788;
  private static readonly BOARD_REFERENCE_HEIGHT_PX = 2600;
  private static readonly CARD_REFERENCE_WIDTH_PX = 528;
  private static readonly CARD_REFERENCE_HEIGHT_PX = 745;
  private static readonly TOP_ROW_REFERENCE_WIDTH_PX = 6124;
  private static readonly MIN_PLAYAREA_REFERENCE_WIDTH_PX = 3788 + 530 + 20;
  private static readonly MIN_PLAYAREA_REFERENCE_HEIGHT_PX = 2600 + 1200 + 750 + 120 * 8 + 400;
  private static readonly TOOLTIP_MAX_WIDTH_PX = 640;
  private static readonly ANIMAL_SPRITE_COLUMNS = 11;
  private static readonly ANIMAL_SPRITE_ROWS = 10;
  private static readonly ANIMAL_SPRITE_LAST_INDEX = 100;
  private static readonly OBJECTIVE_SPRITE_COLUMNS = 4;
  private static readonly OBJECTIVE_SPRITE_ROWS = 4;
  private static readonly OBJECTIVE_SPRITE_LAST_INDEX = 12;
  private static readonly SCORING_SPRITE_COLUMNS = 4;
  private static readonly SCORING_SPRITE_ROWS = 3;
  private static readonly SCORING_SPRITE_LAST_INDEX = 10;

  bga!: Bga<BorealisArcticExpeditionsPlayer, BorealisArcticExpeditionsGamedatas>;
  gamedatas!: BorealisArcticExpeditionsGamedatas;
  root!: HTMLElement;
  selectedCardId: number | null = null;
  selectedLocation: number | null = null;
  selectedPoolSlot: number | null = null;
  selectedObjectiveIdx: number | null = null;
  campSelected = false;
  selectedRegroupIds = new Set<number>();
  cachedActionArgs: Record<string, unknown> | null = null;
  private cachedUndoCanUndo = false;
  private cachedUndoType: "observe" | "regroup" | null = null;
  private cachedCanMulligan: boolean | undefined = undefined;
  private boardScaleTimeoutId: number | null = null;
  private boardScaleTimeoutAccInterval: number | null = null;
  private static readonly ZOOM_STEP = 0.1;
  private static readonly ZOOM_MIN = 0.4;
  private zoomFactor = 1;
  private isShowingLastTurnBanner = false;
  private openingIntroPage: "objectives" | "scoring" | null = "objectives";
  private openingIntroEl: HTMLElement | null = null;
  private pendingAction: string | null = null;
  private static readonly NOTIF_RELEASE_ACTIONS: Record<string, string[]> = {
    observeAnimal: ['actObserveAnimal'],
    takeAnimal: ['actTakeAnimal'],
    mulliganPool: ['actMulliganPool'],
    mulliganHand: ['actMulliganHand'],
    regroup: ['actRegroup'],
    assignScientists: ['actAssignScientists'],
    objectiveClaimed: ['actClaimObjective', 'actClaimPromptObjective'],
    objectiveScored: ['actClaimObjective', 'actClaimPromptObjective'],
    actionUndone: ['actUndo'],
  };
  private static readonly RELEASE_ON_RESOLVE = new Set(['actSkipPromptObjective']);
  private optionalUi: OptionalUi | null = null;

  constructor(bga: Bga<BorealisArcticExpeditionsPlayer, BorealisArcticExpeditionsGamedatas>) {
    this.bga = bga;
    this.preloadGameImages();
  }

  setup(gamedatas: BorealisArcticExpeditionsGamedatas) {
    this.gamedatas = gamedatas;
    this.setupNotifications();
    this.preloadGameImages();
    const area = this.bga.gameArea.getElement();
    this.root = document.createElement("div");
    this.root.id = "bae_playarea";
    this.root.className = "bae";
    area.appendChild(this.root);
    // OPTIONAL: client-only UX helpers (previews, resolution motion, DnD, sound)
    this.optionalUi = new OptionalUi(this);
    this.openingIntroPage = this.isReplayOrSpectator() ? null : "objectives";
    // Keep --board-scale up to date when the window resizes
    window.addEventListener('resize', () => this.updateBoardScale());
    this.zoomFactor = this.firstZoomOutFromFit();
    this.renderAll();
  }

  /** Warm sprite sheets, boards, and tokens so zoom/tooltips/new cards do not hitch on first use. */
  private preloadGameImages(): void {
    const files = [
      'Sprites/AnimalCards_sheet_full.webp',
      'Sprites/AnimalCards_sheet_half.webp',
      'Sprites/AnimalCards_sheet_quarter.webp',
      'Sprites/ObjectiveCards_sheet_full.webp',
      'Sprites/ObjectiveCards_sheet_half.webp',
      'Sprites/ObjectiveCards_sheet_quarter.webp',
      'Sprites/ScoringCards_sheet_full.webp',
      'Sprites/ScoringCards_sheet_half.webp',
      'Sprites/ScoringCards_sheet_quarter.webp',
      'Playerboards/0000.webp',
      'Playerboards/0001.webp',
      'Playerboards/0002.webp',
      'Playerboards/0003.webp',
      'Playerboards/0004.webp',
      'Tokens/YellowMeeple.webp',
      'Tokens/PinkMeeple.webp',
      'Tokens/TealMeeple.webp',
      'Tokens/FlagToken.webp',
      'Tokens/FirstPlayerToken.webp',
      'Tokens/animal_obj.webp',
      'Tokens/meeple_obj.webp',
      'Tokens/track_obj.webp',
      'Tokens/VP.svg',
      'Tokens/1VPToken.png',
      'Tokens/3VPToken.png',
      'Tokens/5VPToken.png',
    ];
    this.bga.images.preloadImages(files);
    for (const file of ['Tokens/1VPToken.png', 'Tokens/3VPToken.png', 'Tokens/5VPToken.png']) {
      this.bga.images.preloadImage(file);
    }
    for (const file of files) {
      const href = this.bga.images.getImgUrl(file);
      if (file.endsWith('VPToken.png') && !document.head.querySelector(`link[rel="preload"][href="${href}"]`)) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = href;
        document.head.appendChild(link);
      }
      const img = new Image();
      img.decoding = 'async';
      img.src = href;
      void img.decode().catch(() => {});
    }
  }

  private renderPlayerPanelInfo(): void {
    const d = this.gamedatas.boardState;
    const firstPlayerId = Number((this.gamedatas.playerOrder ?? [])[0] ?? 0);
    const baseUrl = this.bga.images.getImgUrl();
    const animalIcon = `${baseUrl}Tokens/animal_obj.webp`;
    const scientistIcon = `${baseUrl}Tokens/meeple_obj.webp`;
    const trackIcon = `${baseUrl}Tokens/track_obj.webp`;
    const firstPlayerToken = `${baseUrl}Tokens/FirstPlayerToken.webp`;

    const scientistCountAt = (pid: number, location: number): number => {
      const sci = d.scientists?.[pid];
      if (!sci) return 0;
      let count = 0;
      for (let col = 0; col < 3; col++) {
        const poses = sci[col] ?? [];
        count += poses.filter((p) => p === location).length;
      }
      return count;
    };

    const locationPanelHtml = (animals: number, scientists: number, flagDepth: number): string => {
      return [
        `<span class="bae_panel_item"><img class="bae_panel_icon" src="${animalIcon}" alt="" draggable="false"/><span class="bae_panel_value">${animals}</span></span>`,
        `<span class="bae_panel_item"><img class="bae_panel_icon" src="${scientistIcon}" alt="" draggable="false"/><span class="bae_panel_value">${scientists}</span></span>`,
        `<span class="bae_panel_item"><img class="bae_panel_icon" src="${trackIcon}" alt="" draggable="false"/><span class="bae_panel_value">${flagDepth}</span></span>`,
      ].join('');
    };

    const campPanelHtml = (scientists: number): string => {
      return [
        `<span class="bae_panel_item bae_panel_item_empty"></span>`,
        `<span class="bae_panel_item"><img class="bae_panel_icon" src="${scientistIcon}" alt="" draggable="false"/><span class="bae_panel_value">${scientists}</span></span>`,
        `<span class="bae_panel_item bae_panel_item_empty"></span>`,
      ].join('');
    };

    for (const pidStr of Object.keys(this.gamedatas.players)) {
      const pid = Number(pidStr);
      const host = this.bga.playerPanels.getElement(pid);

      let infoEl = host.querySelector('.bae_panel_info') as HTMLElement | null;
      if (!infoEl) {
        infoEl = document.createElement('div');
        infoEl.className = 'bae_panel_info';
        host.appendChild(infoEl);
      }

      const loc0Animals = d.boards[pid]?.[0]?.length ?? 0;
      const loc1Animals = d.boards[pid]?.[1]?.length ?? 0;
      const loc2Animals = d.boards[pid]?.[2]?.length ?? 0;
      const loc0Scientists = scientistCountAt(pid, 0);
      const loc1Scientists = scientistCountAt(pid, 1);
      const loc2Scientists = scientistCountAt(pid, 2);
      const campLeftScientists = scientistCountAt(pid, 3);
      const campRightScientists = scientistCountAt(pid, 4);
      const loc0Flag = d.flags?.[pid]?.[0] ?? 0;
      const loc1Flag = d.flags?.[pid]?.[1] ?? 0;
      const loc2Flag = d.flags?.[pid]?.[2] ?? 0;

      const sections = [
        campPanelHtml(campLeftScientists),
        locationPanelHtml(loc0Animals, loc0Scientists, loc0Flag),
        locationPanelHtml(loc1Animals, loc1Scientists, loc1Flag),
        locationPanelHtml(loc2Animals, loc2Scientists, loc2Flag),
        campPanelHtml(campRightScientists),
      ];

      const body = sections
        .map((section, idx) => {
          const sep = idx < sections.length - 1 ? `<span class="bae_panel_sep">&middot;</span>` : '';
          return `<span class="bae_panel_section">${section}</span>${sep}`;
        })
        .join('');

      const firstPlayerHtml = pid === firstPlayerId
        ? `<img class="bae_panel_first_player" src="${firstPlayerToken}" alt="${this.escapeHtml(_('First player'))}" draggable="false" title="${this.escapeHtml(_('First player'))}"/>`
        : '';

      infoEl.innerHTML = `<span class="bae_panel_grid">${body}</span>${firstPlayerHtml}`;
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
    this.gamedatas = this.gamedatas as BorealisArcticExpeditionsGamedatas;
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
    this.updateOpeningIntroOverlay();
    this.optionalUi?.onBoardScaleChanged();
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

    private getScaleForZoomFactor(zoomFactor: number): number {
      const area = this.bga.gameArea.getElement();
      const areaRect = area.getBoundingClientRect();
      const availableWidth = Math.max(1, areaRect.width);
      const availableHeight = Math.max(1, window.innerHeight);
      const scaleByBoardWidth = availableWidth / Game.MIN_PLAYAREA_REFERENCE_WIDTH_PX;
      const scaleByBoardHeight = availableHeight / Game.MIN_PLAYAREA_REFERENCE_HEIGHT_PX;
      const scaleByTopRowWidth = availableWidth / Game.TOP_ROW_REFERENCE_WIDTH_PX;
      // Default fit keeps the top row on one line. Max zoom is the board + hand width so
      // small devices can enlarge the player area and let the top row wrap.
      const fitScale = Math.max(0.01, Math.min(scaleByBoardWidth, scaleByBoardHeight, scaleByTopRowWidth));
      const maxScale = Math.max(0.01, scaleByBoardWidth);
      const boundedZoom = Math.max(Game.ZOOM_MIN, zoomFactor);
      return Math.min(Math.max(0.01, fitScale * boundedZoom), maxScale);
    }

    private getScale(): number {
      return this.getScaleForZoomFactor(this.zoomFactor);
    }

    private firstZoomOutFromFit(): number {
      const fit = this.getScaleForZoomFactor(1);
      let nextZoom = 1;
      while (nextZoom > Game.ZOOM_MIN + 0.0001) {
        nextZoom = Math.max(Game.ZOOM_MIN, Number((nextZoom - Game.ZOOM_STEP).toFixed(3)));
        if (fit - this.getScaleForZoomFactor(nextZoom) > 0.0001) return nextZoom;
      }
      return 1;
    }

    private canZoomInAtCurrentViewport(): boolean {
      const current = this.getScaleForZoomFactor(this.zoomFactor);
      const nextZoom = this.zoomFactor + Game.ZOOM_STEP;
      const next = this.getScaleForZoomFactor(nextZoom);
      return next - current > 0.0001;
    }

    private nextZoomFactorDownWithVisibleChange(): number | null {
      const currentScale = this.getScaleForZoomFactor(this.zoomFactor);
      let nextZoom = this.zoomFactor;
      while (nextZoom > Game.ZOOM_MIN + 0.0001) {
        nextZoom = Math.max(Game.ZOOM_MIN, Number((nextZoom - Game.ZOOM_STEP).toFixed(3)));
        const nextScale = this.getScaleForZoomFactor(nextZoom);
        if (currentScale - nextScale > 0.0001) return nextZoom;
      }
      return null;
    }

    private canZoomOutAtCurrentViewport(): boolean {
      return this.nextZoomFactorDownWithVisibleChange() != null;
    }

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
      const nextZoom = this.nextZoomFactorDownWithVisibleChange();
      if (nextZoom == null) return;
      this.zoomFactor = nextZoom;
      this.renderAll();
    });

    inBtn?.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (!this.canZoomInAtCurrentViewport()) return;
      this.zoomFactor = Number((this.zoomFactor + Game.ZOOM_STEP).toFixed(3));
      this.renderAll();
    });

    resetBtn?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const resetZoom = this.firstZoomOutFromFit();
      if (Math.abs(this.zoomFactor - resetZoom) <= 0.0001) return;
      this.zoomFactor = resetZoom;
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
            [_('You cannot see cards in other players hands. Animations do not indicate cards positions.')],
          );
          this.bga.gameui.addTooltipHtml(id, html);
        } else {
          this.bga.gameui.addTooltip(id, _('You cannot see cards in other players hands. Animations do not indicate cards positions.'), '');
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
      const def = this.animalDef(numericCardId);
      const species = this.gamedatas.materials.species_names?.[def?.species ?? 0] ?? '';
      const vehicle = this.gamedatas.materials.vehicle_names?.[def?.vehicle ?? 0] ?? '';
      const sci = this.gamedatas.materials.scientist_names ?? [];
      const effect = def
        ? `${_('Moves')} ${sci[def.left_move] ?? def.left_move} ${_('left')} · ${sci[def.right_move] ?? def.right_move} ${_('right')}. ${_('Vehicle')}: ${vehicle}. ${_('Bonus VP')}: ${def.bonus_vp}.`
        : '';
      if (canHtmlTooltip) {
        const html = this.buildCardTooltipSpriteHtml(
          'animal',
          numericCardId,
          `${species || _('Animal card')} #${numericCardId}`,
          [effect, actionText],
        );
        this.bga.gameui.addTooltipHtml(id, html);
      } else {
        this.bga.gameui.addTooltip(id, _('Your hand card'), actionText);
      }
    });
  }

  /** Main state name (handles nested private_state in some BGA builds). */
  currentStateName(): string {
    const gs = this.gamedatas.gamestate as { name?: string; private_state?: { name?: string } };
    if (gs.private_state?.name) return String(gs.private_state.name);
    return gs.name ? String(gs.name) : "";
  }

  isGameplayLike(): boolean {
    const n = this.currentStateName().toLowerCase();
    return n === "gameplay" || n.includes("gameplay");
  }

  isReplenishLike(): boolean {
    const n = this.currentStateName().toLowerCase();
    return n === "replenishanimal" || n.includes("replenish");
  }

  isAssignCampLike(): boolean {
    const n = this.currentStateName().toLowerCase();
    return n === "assigncamp" || n.includes("assigncamp") || n.includes("assign_camp");
  }

  isOpeningMulliganLike(): boolean {
    const n = this.currentStateName().toLowerCase();
    return n === "openingmulligan" || n.includes("openingmulligan") || n.includes("opening_mulligan");
  }

  isPromptClaimObjectiveLike(): boolean {
    const n = this.currentStateName().toLowerCase();
    return n.includes("promptclaimobjective") || n.includes("prompt_claim_objective");
  }

  private getPromptedObjectiveIndex(): number | null {
    if (!this.isPromptClaimObjectiveLike() || !this.bga.players.isCurrentPlayerActive()) return null;
    const myId = Number(this.bga.players.getCurrentPlayerId());
    const promptArgs = this.cachedActionArgs as unknown as PromptClaimArgs | null;
    const pending = promptArgs?.pendingByPlayer?.[myId] ?? [];
    if (pending.length === 0) return null;
    return pending[0].index;
  }

  private countScientistsInCamps(playerId: number): number {
    const sci = this.gamedatas.boardState.scientists?.[playerId];
    if (!sci) return 0;
    let count = 0;
    for (let col = 0; col < 3; col++) {
      for (const pos of sci[col] ?? []) {
        if (pos === 3 || pos === 4) count++;
      }
    }
    return count;
  }

  animalDef(cardId: number): AnimalDefLite | undefined {
    const raw = this.gamedatas.materials.animal_cards;
    if (Array.isArray(raw)) return raw[cardId] as AnimalDefLite | undefined;
    return (raw as Record<number, AnimalDefLite> | undefined)?.[cardId];
  }

  animalCardHtml(cardId: number): string {
    return this.cardFaceById(cardId);
  }

  refreshScientistTooltips(): void {
    this.registerScientistTooltips();
  }

  buildCardTooltipSpriteHtml(
    type: 'animal' | 'objective' | 'scoring',
    id: number,
    title: string,
    details: string[],
    scoresHtml = '',
  ): string {
    return this.buildCardTooltipSpriteHtmlInternal(type, id, title, details, scoresHtml);
  }

  private wrapTooltipGrid(cells: string[]): string {
    if (cells.length === 0) return '';
    if (cells.length === 1) return cells[0];
    return `<div class="bae_tooltip_grid">${cells.map((cell) => `<div>${cell}</div>`).join('')}</div>`;
  }

  private canSelectObjectiveToClaim(): boolean {
    return this.bga.players.isCurrentPlayerActive()
      && !this.isPromptClaimObjectiveLike()
      && !this.isOpeningMulliganLike()
      && (this.isGameplayLike() || this.isReplenishLike() || this.isAssignCampLike());
  }

  private addClaimObjectiveButton(): void {
    if (!this.canSelectObjectiveToClaim() || this.selectedObjectiveIdx == null) return;
    const idx = this.selectedObjectiveIdx;
    const myId = Number(this.bga.players.getCurrentPlayerId());
    const obj = this.gamedatas.boardState.objectives?.[idx];
    const can = (obj?.players?.[myId] ?? 'unmet') === 'meets';
    this.bga.statusBar.addActionButton(_("Claim Objective"), () => {
      if (!can) return;
      void this.sendAction("actClaimObjective", { objective_index: idx });
    }, {
      disabled: !can,
      tooltip: _("Claim this objective now and score 5 VP."),
    });
  }

  private async confirmRegroupDiscard(cardIds: number[]): Promise<void> {
    const myId = Number(this.bga.players.getCurrentPlayerId());
    if (this.countScientistsInCamps(myId) === 0) {
      // OPTIONAL: preference can skip this confirm when player opts out
      if (!this.optionalUi?.shouldSkipSafeConfirm()) {
        const confirmed = await this.bga.dialogs.confirmation(
          _("You have no scientists in your camps. Regrouping will end your turn without assigning scientists or gaining VP from camps. Continue?"),
        );
        if (!confirmed) return;
      }
    }
    await this.sendAction("actRegroup", {
      card_ids_json: JSON.stringify(cardIds),
    });
  }

  enterRegroupMode(initialCardId?: number | null): void {
    if (this.isActionBusy()) return;
    this.selectedCardId = null;
    this.selectedLocation = null;
    this.selectedPoolSlot = null;
    this.selectedObjectiveIdx = null;
    this.campSelected = true;
    this.selectedRegroupIds.clear();
    if (initialCardId != null && Number.isFinite(initialCardId)) this.selectedRegroupIds.add(initialCardId);
    this.renderAll();
    this.onUpdateActionButtons(this.currentStateName(), null);
    this.optionalUi?.onSelectionChanged();
    this.optionalUi?.playSoundKind('select');
  }

  isActionBusy(): boolean {
    return this.pendingAction != null;
  }

  sendAction(action: string, args?: Record<string, unknown>): Promise<unknown> {
    if (this.pendingAction) return Promise.resolve();
    if (!this.bga.actions.checkAction(action, true)) {
      this.bga.actions.checkAction(action);
      return Promise.resolve();
    }
    this.beginActionSubmit(action);
    const result = this.bga.actions.performAction(action, args, { checkAction: false });
    if (result == null || typeof (result as Promise<unknown>).then !== 'function') {
      this.endActionSubmit(action);
      return Promise.resolve();
    }
    return (result as Promise<unknown>).then((value) => {
      if (Game.RELEASE_ON_RESOLVE.has(action)) this.endActionSubmit(action);
      return value;
    }).catch((err) => {
      this.endActionSubmit();
      this.optionalUi?.onActionFailed();
      this.renderAll();
      this.onUpdateActionButtons(this.currentStateName(), this.cachedActionArgs);
      throw err;
    });
  }

  private beginActionSubmit(action: string): void {
    this.pendingAction = action;
    this.root?.classList.add('bae_action_busy');
    this.optionalUi?.onActionSubmitted();
    this.selectedCardId = null;
    this.selectedLocation = null;
    this.selectedPoolSlot = null;
    this.selectedObjectiveIdx = null;
    this.campSelected = false;
    this.selectedRegroupIds.clear();
    this.root?.querySelectorAll('.bae_card_selected, .bae_card_regroup').forEach((el) => {
      el.classList.remove('bae_card_selected', 'bae_card_regroup');
    });
    this.root?.querySelectorAll('.bae_loc_selected, .bae_loc_invalid, .bae_camp_selected, .bae_obj_selected').forEach((el) => {
      el.classList.remove('bae_loc_selected', 'bae_loc_invalid', 'bae_camp_selected', 'bae_obj_selected');
    });
    this.root?.querySelectorAll('.bae_card_invalid').forEach((el) => el.classList.remove('bae_card_invalid'));
    this.root?.querySelectorAll('.bae_confirm_blurb').forEach((el) => el.remove());
    this.bga.statusBar.removeActionButtons();
  }

  private endActionSubmit(action?: string): void {
    if (action != null && this.pendingAction !== action) return;
    const wasBusy = this.pendingAction != null;
    this.pendingAction = null;
    this.root?.classList.remove('bae_action_busy');
    if (wasBusy) this.onUpdateActionButtons(this.currentStateName(), this.cachedActionArgs);
  }

  private unwrapNotif(raw: any): Record<string, unknown> {
    const nested = raw?.args;
    const a = (nested && typeof nested === 'object' && raw?.boardState == null && raw?.player_id == null)
      ? nested as Record<string, unknown>
      : ((raw ?? {}) as Record<string, unknown>);
    const priv = a._private;
    if (priv && typeof priv === 'object' && !Array.isArray(priv)) {
      return { ...a, ...(priv as Record<string, unknown>) };
    }
    return a;
  }

  private notifPlayerId(args: Record<string, unknown> | null | undefined): number {
    return Number(args?.player_id ?? args?.playerId ?? NaN);
  }

  private releasePendingActionForNotif(notifName: string, args?: Record<string, unknown>): void {
    const actions = Game.NOTIF_RELEASE_ACTIONS[notifName];
    if (!actions || this.pendingAction == null || !actions.includes(this.pendingAction)) return;
    const pid = this.notifPlayerId(args);
    if (Number.isFinite(pid) && pid !== Number(this.bga.players.getCurrentPlayerId())) return;
    this.endActionSubmit(this.pendingAction);
  }

  private isReplayOrSpectator(): boolean {
    try {
      if (this.bga.players.isCurrentPlayerSpectator()) return true;
    } catch (_) { /* gamedatas may not be ready */ }
    const ui = this.bga.gameui;
    if (ui?.isSpectator) return true;
    if (ui?.instantaneousMode) return true;
    if (typeof g_archive_mode !== 'undefined' && g_archive_mode) return true;
    if (typeof g_replayFrom !== 'undefined') return true;
    return false;
  }

  clearSelection(): void {
    this.selectedCardId = null;
    this.selectedLocation = null;
    this.selectedPoolSlot = null;
    this.selectedObjectiveIdx = null;
    this.campSelected = false;
    this.selectedRegroupIds.clear();
    this.renderAll();
    this.onUpdateActionButtons(this.currentStateName(), null);
    this.optionalUi?.onSelectionChanged();
  }

  /** BGA calls onUpdateActionButtons before onEnteringState; cache args from either source for client-side refreshes. */
  private cacheStateActionArgs(args: Record<string, unknown> | null | undefined): void {
    if (args == null) return;
    this.cachedActionArgs = args;
    if ("canUndo" in args) {
      this.cachedUndoCanUndo = Boolean(args.canUndo);
      this.cachedUndoType = (args.undoType as "observe" | "regroup" | null) ?? null;
    }
    if ("canMulligan" in args) {
      this.cachedCanMulligan = Boolean(args.canMulligan);
    }
  }

  private addUndoActionButton(canUndo: boolean | undefined, undoType: "observe" | "regroup" | null | undefined): void {
    if (!canUndo || !undoType) return;
    const label = undoType === "observe" ? _("Undo: Observe") : _("Undo: Regroup");
    const tooltip = undoType === "observe"
      ? _("Undo observing an animal and return to choosing your main action. Only available before drawing a replacement card.")
      : _("Undo regrouping and return to choosing your main action. Only available when no cards were discarded.");
    this.bga.statusBar.addActionButton(label, () => {
      void this.sendAction("actUndo", {});
    }, {
      disabled: false,
      tooltip,
    });
  }

  private syncScoresFromBoardState(boardState: BoardState): void {
    const vps = boardState.vps ?? {};
    for (const [pid, score] of Object.entries(vps)) {
      const ctr = this.bga.playerPanels.getScoreCounter(Number(pid));
      ctr.setValue(Number((score as { score?: number }).score ?? score));
    }
  }

  isObserveSelectionLegal(cardId: number | null = this.selectedCardId, location: number | null = this.selectedLocation): boolean {
    if (cardId == null || location == null || this.campSelected) return false;
    const myId = Number(this.bga.players.getCurrentPlayerId());
    return canObserveAtLocation(
      this.animalDef(cardId),
      this.gamedatas.boardState.scientists,
      myId,
      location,
    );
  }

  confirmObserveIfReady(cardId: number | null, location: number | null): boolean {
    if (this.isActionBusy() || !this.isGameplayLike() || !this.bga.players.isCurrentPlayerActive()) return false;
    if (cardId == null || location == null) return false;
    if (!this.isObserveSelectionLegal(cardId, location)) return false;
    void this.sendAction("actObserveAnimal", {
      card_id: cardId,
      location,
    });
    return true;
  }

  confirmReadySelectionFromKeyboard(): boolean {
    if (this.isActionBusy() || !this.bga.players.isCurrentPlayerActive()) return false;
    if (this.isGameplayLike() && !this.campSelected) {
      if (this.selectedCardId != null && this.selectedLocation != null) {
        if (this.isObserveSelectionLegal()) return this.confirmObserveIfReady(this.selectedCardId, this.selectedLocation);
        this.optionalUi?.showInvalidObserveHint();
        return false;
      }
    }
    if (this.isReplenishLike() && this.selectedPoolSlot != null) {
      void this.sendAction('actTakeAnimal', { pool_slot: this.selectedPoolSlot });
      return true;
    }
    if (this.isAssignCampLike() && this.selectedLocation != null) {
      void this.sendAction('actAssignScientists', { location: this.selectedLocation });
      return true;
    }
    if (this.isPromptClaimObjectiveLike()) {
      const idx = this.getPromptedObjectiveIndex();
      if (idx != null) {
        void this.sendAction('actClaimPromptObjective', { objective_index: idx });
        return true;
      }
    }
    if (this.selectedObjectiveIdx != null && this.canSelectObjectiveToClaim()) {
      void this.sendAction('actClaimObjective', { objective_index: this.selectedObjectiveIdx });
      return true;
    }
    return false;
  }

  renderAll() {
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
    const canZoomOut = this.canZoomOutAtCurrentViewport();
    const canZoomIn = this.canZoomInAtCurrentViewport();
    const canResetZoom = Math.abs(this.zoomFactor - this.firstZoomOutFromFit()) > 0.0001;
    const canConfirmObserve = this.isGameplayLike() && this.isObserveSelectionLegal();
    const canConfirmTake = this.isReplenishLike() && this.selectedPoolSlot != null;
    const canConfirmAssign = this.isAssignCampLike() && this.selectedLocation != null;
    const promptedObjectiveIdx = this.getPromptedObjectiveIndex();
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
      if (playerState === "claimed") extraClass = " bae_obj_claimed_by_you";
      const anyClaimed = obj.active && Object.values(obj.players).some((s) => s === "claimed");
      if (anyClaimed) extraClass += " bae_obj_claimed_round";
      if (promptedObjectiveIdx === idx) extraClass += " bae_obj_prompt_target";
      const disabledAttr = obj.active ? "" : "disabled";
      const canConfirmClaim = this.canSelectObjectiveToClaim()
        && this.selectedObjectiveIdx === idx
        && playerState === "meets";
      const promptConfirmBlurb = promptedObjectiveIdx === idx
        ? `<span class="bae_confirm_blurb">${this.escapeHtml(confirmObserveBlurb)}</span>`
        : (canConfirmClaim ? `<span class="bae_confirm_blurb">${this.escapeHtml(confirmObserveBlurb)}</span>` : "");
      const selectedClass = canConfirmClaim ? " bae_obj_selected" : "";
      // give each objective an ID so we can attach the BGA tooltip API instead of title attributes
      html += `<button id="bae_obj_${idx}" type="button" class="bae_obj${extraClass}${selectedClass}" data-obj-idx="${idx}" ${disabledAttr}>${this.objectiveFaceById(
        obj.id,
      )}${promptConfirmBlurb}</button>`;
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
      const maxPlayed = d.boards[pid]?.reduce((max, loc) => Math.max(max, loc.length), 0) ?? 0;
      const animal_card_slots = Math.max(1, maxPlayed);
      const outlineSlots = Math.min(MAX_LOCATION_CARDS, maxPlayed + 1);
      const rawPlayerColor = String(this.gamedatas.players[pid]?.color ?? "");
      const playerColor = rawPlayerColor.length > 0
        ? (rawPlayerColor.startsWith("#") ? rawPlayerColor : `#${rawPlayerColor}`)
        : "#1a1a1a";
      // Anchor each player board so scoring animations can target it
      html += `<section id="bae_playerboard_${pid}" class="bae_playerboard" data-player-id="${pid}"><h3 class="bae_heading bae_player_name" style="color:${playerColor}">${names[pid] ?? pid}</h3>`;

      // Playerboard inner wrapper holds the left-hand column (hand slots)
      // and the board canvas to its right.
      html += `<div class="bae_playerboard_inner">`;

      const handInfo = (d.hands || {})[pid];
      const vpTokens = this.optionalUi?.vpTokensFor(pid) ?? optimalTokens(playerVp(d.vps, pid));
      const tokenBase = this.bga.images.getImgUrl();
      html += `<div class="bae_player_sidecol">`;
      html += `<div id="bae_vp_tokens_${pid}" class="bae_vp_tokens_zone" data-player-id="${pid}" aria-label="${this.escapeHtml(_('VP Tokens'))}">`;
      html += `<div class="bae_vp_token_shelf">${vpTokensInnerHtml(pid, vpTokens, tokenBase)}</div>`;
      html += `</div>`;
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
      html += `</div>`; // close sidecol

      const campSel = isSelf && this.campSelected ? " bae_camp_selected" : "";
      const campDotsSel = isSelf && this.campSelected ? " bae_sci_shelf_camp_selected" : "";
      const boardBg = this.imagePath("Playerboards", d.board_for_players[pid] ?? 0);
      // Expose number of animal-card slots to CSS so margin spacing scales correctly
      html += `<div class="bae_board_canvas" style="background-image:url('${boardBg}'); --animal-card-slots: ${outlineSlots}">`;

      html += `<div id="bae_camp_${pid}_left" class="bae_camp_zone bae_camp_left${campSel}" data-player-id="${pid}" data-camp-wrap="1" role="button" tabindex="0">`;
      html += `<div id="bae_sci_shelf_camp_${pid}_left" class="bae_sci_shelf${campDotsSel}">${this.renderScientistDots(pid, d.scientists[pid], 3)}</div>`;
      html += `</div>`;

      html += `<div id="bae_camp_${pid}_right" class="bae_camp_zone bae_camp_right${campSel}" data-player-id="${pid}" data-camp-wrap="1" role="button" tabindex="0">`;
      html += `<div id="bae_sci_shelf_camp_${pid}_right" class="bae_sci_shelf${campDotsSel}">${this.renderScientistDots(pid, d.scientists[pid], 4)}</div>`;
      html += `</div>`;
      html += `<div id="bae_animal_loc_vp_${pid}" class="bae_animal_loc_vp_track" data-player-id="${pid}" aria-label="${this.escapeHtml(_('Animal location VP'))}"></div>`;

      for (let loc = 0; loc < 3; loc++) {
        const locSelected = isSelf && this.selectedLocation === loc && !this.campSelected;
        const locInvalid = locSelected && this.isGameplayLike() && this.selectedCardId != null && !canConfirmObserve;
        const sel = locSelected ? (locInvalid ? " bae_loc_invalid" : " bae_loc_selected") : "";
        const posClass = loc === 0 ? " bae_slot_left" : loc === 1 ? " bae_slot_mid" : " bae_slot_right";
        html += `<div class="bae_location_zone${posClass}${sel}" data-player-id="${pid}" data-loc="${loc}" role="button" tabindex="${isSelf ? 0 : -1}">`;

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
    this.updateOpeningIntroOverlay();
    // OPTIONAL: previews, invalid-action hints, DnD
    this.optionalUi?.afterRender();
  }

  private getTooltipScale(): number {
    const scaleRaw = this.root ? getComputedStyle(this.root).getPropertyValue('--bae-scale') : '';
    const currentScale = Number.parseFloat(scaleRaw);
    const baseScale = Number.isFinite(currentScale) ? currentScale : this.getScale();
    const desired = Math.max(0.18, baseScale * 2);
    const viewport = Math.max(160, Math.min(window.innerWidth, document.documentElement.clientWidth) - 48);
    const box = Math.min(viewport * 0.92, Game.TOOLTIP_MAX_WIDTH_PX);
    const gap = 8;
    const columns = 2;
    const maxCardW = (box - gap * (columns - 1)) / columns;
    const cap = maxCardW / Game.CARD_REFERENCE_HEIGHT_PX;
    return Math.max(0.12, Math.min(desired, cap));
  }

  private applySlideshowScaleStyles(el: HTMLElement): void {
    const slideshowScale = this.getTooltipScale();
    const tier = slideshowScale >= 0.55 ? 'full' : slideshowScale >= 0.25 ? 'half' : 'quarter';
    const base = this.bga.images.getImgUrl();
    el.style.setProperty('--bae-scale', String(slideshowScale));
    el.style.setProperty('--animal-sprite-url', `url("${base}Sprites/AnimalCards_sheet_${tier}.webp")`);
    el.style.setProperty('--objective-sprite-url', `url("${base}Sprites/ObjectiveCards_sheet_${tier}.webp")`);
    el.style.setProperty('--scoring-sprite-url', `url("${base}Sprites/ScoringCards_sheet_${tier}.webp")`);
  }

  private applyTooltipScaleToCardFace(
    type: 'objective' | 'scoring',
    id: number,
    tooltipScale: number,
  ): string {
    const tier = tooltipScale >= 0.55 ? 'full' : tooltipScale >= 0.25 ? 'half' : 'quarter';
    const baseUrl = this.bga.images.getImgUrl();
    const animalSpriteUrl = `${baseUrl}Sprites/AnimalCards_sheet_${tier}.webp`;
    const objectiveSpriteUrl = `${baseUrl}Sprites/ObjectiveCards_sheet_${tier}.webp`;
    const scoringSpriteUrl = `${baseUrl}Sprites/ScoringCards_sheet_${tier}.webp`;
    const spriteStyle = `width:100%;height:100%;--animal-sprite-url:url('${animalSpriteUrl}');--objective-sprite-url:url('${objectiveSpriteUrl}');--scoring-sprite-url:url('${scoringSpriteUrl}');`;

    if (type === 'objective') {
      return this.objectiveFaceById(id)
        .replace(
          '<div class="bae_obj_img bae_overlay_card"',
          `<div class="bae_obj_img bae_overlay_card" style="${spriteStyle}"`,
        );
    }

    return this.scoringFaceById(id)
      .replace(
        '<div class="bae_score_img bae_overlay_card"',
        `<div class="bae_score_img bae_overlay_card" style="${spriteStyle}"`,
      );
  }

  private updateOpeningIntroOverlay(): void {
    this.root?.querySelector('.bae_top_objectives')?.classList.remove('bae_opening_intro_highlight');
    this.root?.querySelector('.bae_top_scoring')?.classList.remove('bae_opening_intro_highlight');
    this.openingIntroEl?.remove();
    this.openingIntroEl = null;

    if (!this.root || this.isReplayOrSpectator() || !this.isOpeningMulliganLike() || this.openingIntroPage === null) {
      return;
    }

    const d = this.gamedatas.boardState;
    const isObjectives = this.openingIntroPage === 'objectives';
    const cardsClass = isObjectives ? 'bae_objectives' : 'bae_scoring';
    const cardsHtml = isObjectives
      ? d.objectives.map((obj) => `<div class="bae_opening_intro_obj">${this.objectiveFaceById(obj.id)}</div>`).join('')
      : d.scoring_cards.map((id) => `<span class="bae_score_card">${this.scoringFaceById(id)}</span>`).join('');
    const caption = isObjectives
      ? _('Objective cards can be claimed at any time during your turns by clicking on the corresponding objective. You will not be prompted to claim an objective unless someone else has already claimed it.')
      : _('Scoring cards will automatically be scored for all players at the end of the game.');

    const highlightTarget = this.root.querySelector(isObjectives ? '.bae_top_objectives' : '.bae_top_scoring');
    highlightTarget?.classList.add('bae_opening_intro_highlight');

    this.openingIntroEl?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'bae_opening_intro';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', isObjectives ? _('Objectives') : _('Scoring cards'));
    overlay.innerHTML = `
      <div class="bae_opening_intro_panel">
        <div class="bae_opening_intro_cards ${cardsClass}">${cardsHtml}</div>
        <p class="bae_opening_intro_caption">${this.escapeHtml(caption)}</p>
        <button type="button" class="action-button bgabutton bgabutton_blue">${this.escapeHtml(_('Confirm'))}</button>
      </div>
    `;
    this.applySlideshowScaleStyles(overlay.querySelector('.bae_opening_intro_panel') as HTMLElement);
    overlay.querySelector('.bgabutton')?.addEventListener('click', () => {
      if (this.openingIntroPage === 'objectives') {
        this.openingIntroPage = 'scoring';
      } else {
        this.openingIntroPage = null;
      }
      this.updateOpeningIntroOverlay();
      this.onUpdateActionButtons(this.currentStateName(), this.cachedActionArgs);
    });
    this.root.appendChild(overlay);
    this.openingIntroEl = overlay;
  }

  private handleLastTurnBanner(playersEndingGame: number[]) {
    const shouldShow = playersEndingGame && playersEndingGame.length > 0;
    if (shouldShow && !this.isShowingLastTurnBanner) {
        const names = playersEndingGame.map((pid) => this.bga.players.getFormattedPlayerName(pid)).join(", ");
        const message = _('${player_names} triggered the end of game by observing 7 animals at a location. This is the final round!');
        this.isShowingLastTurnBanner = true;
        this.bga.gameArea.addLastTurnBanner(message, { player_names: names });
    }
    else if (!shouldShow && this.isShowingLastTurnBanner)
    {
        this.isShowingLastTurnBanner = false;
        this.bga.gameArea.removeLastTurnBanner();
    }
  }

  private registerScientistTooltips(): void {
    if (!this.bga || !this.bga.gameui || typeof (this.bga.gameui.addTooltip) !== 'function') return;
    const d = this.gamedatas.boardState;
    const scientistNames = this.gamedatas.materials.scientist_names ?? [];
    const sciByPlayer = d.scientists || {};

    const countParts = (sciMap: Record<number, number[]> | undefined, at: number | number[]): string[] => {
      if (!sciMap) return [];
      const locs = Array.isArray(at) ? at : [at];
      const parts: string[] = [];
      const maxCols = Math.max(scientistNames.length, 3);
      for (let col = 0; col < maxCols; col++) {
        const poses = sciMap[col] ?? [];
        const cnt = poses.filter((p) => locs.includes(p)).length;
        if (cnt > 0) {
          const label = scientistNames[col] ?? `${_('Col')} ${col + 1}`;
          parts.push(`${cnt} ${label}`);
        }
      }
      return parts;
    };

    const summaryAt = (sciMap: Record<number, number[]> | undefined, atIndex: number): string => {
      const parts = countParts(sciMap, atIndex);
      return parts.length > 0 ? parts.join(', ') : _('No scientists');
    };

    for (const pidStr of Object.keys(this.gamedatas.players)) {
      const pid = Number(pidStr);
      const holding = !!this.root.querySelector(`#bae_regroup_hold_${pid}_left, #bae_regroup_hold_${pid}_right`);
      const leftId = `bae_camp_${pid}_left`;
      const rightId = `bae_camp_${pid}_right`;
      try { this.bga.gameui.removeTooltip(leftId); } catch (_) {}
      try { this.bga.gameui.removeTooltip(rightId); } catch (_) {}
      const campHelp = holding ? _('No scientists') : summaryAt(sciByPlayer[pid], 3);
      const campHelpR = holding ? _('No scientists') : summaryAt(sciByPlayer[pid], 4);
      this.bga.gameui.addTooltip(leftId, campHelp, _('Select this camp to start/cancel regroup.'));
      this.bga.gameui.addTooltip(rightId, campHelpR, _('Select this camp to start/cancel regroup.'));

      const reassignParts = countParts(sciByPlayer[pid], [3, 4]);
      const reassignHelp = reassignParts.length > 0
        ? `${_('Reassign')} ${reassignParts.join(', ')}`
        : `${_('Reassign')} ${_('No scientists')}`;
      for (const side of ['left', 'right'] as const) {
        const holdId = `bae_regroup_hold_${pid}_${side}`;
        try { this.bga.gameui.removeTooltip(holdId); } catch (_) {}
        if (this.root.querySelector(`#${holdId}`)) {
          this.bga.gameui.addTooltip(holdId, reassignHelp, '');
        }
      }

      for (let loc = 0; loc < 3; loc++) {
        const shelfId = `bae_sci_shelf_loc_${pid}_${loc}`;
        try { this.bga.gameui.removeTooltip(shelfId); } catch (_) {}
        this.bga.gameui.addTooltip(shelfId, summaryAt(sciByPlayer[pid], loc), '');
      }
    }
  }

  private registerTooltips(): void {
    // Ensure gameui tooltip API is available
    if (!this.bga || !this.bga.gameui || typeof (this.bga.gameui.addTooltip) !== 'function') return;

    const d = this.gamedatas.boardState;

    // Pool slots: all face-up pool cards share one grouped tooltip
    const poolCells = (d.pool || []).slice().sort((a, b) => a.slot - b.slot).map((slot) => (
      this.buildCardTooltipSpriteHtml(
        'animal',
        slot.id,
        _('Pool card'),
        [],
      )
    ));
    const poolGroupHtml = this.wrapTooltipGrid(poolCells);
    (d.pool || []).forEach((slot) => {
      const id = `bae_pool_slot_${slot.slot}`;
      try { this.bga.gameui.removeTooltip(id); } catch (_) {}
      this.bga.gameui.addTooltipHtml(id, poolGroupHtml);
    });
    try { this.bga.gameui.removeTooltip('bae_pool_slot_deck'); } catch (_) {}
    this.bga.gameui.addTooltip('bae_pool_slot_deck', `${_('Deck')}: ${d.deck_count}<br>${_('Discard')}: ${d.discard_count}`, _('Click to draw from deck'));

    // Objectives: hovering any one shows all of them in the top-row layout
    const objectiveCells = (d.objectives || []).map((obj) => {
      const objectiveMat = this.gamedatas.materials.objectives[obj.id];
      return this.buildCardTooltipSpriteHtml(
        'objective',
        obj.id,
        objectiveMat?.title ?? `${_('Objective')} #${obj.id}`,
        [this.objectiveActionText(obj)],
        this.objectiveScoresHtml(obj, d),
      );
    });
    const objectiveGroupHtml = this.wrapTooltipGrid(objectiveCells);
    (d.objectives || []).forEach((_obj, idx) => {
      const id = `bae_obj_${idx}`;
      try { this.bga.gameui.removeTooltip(id); } catch (_) {}
      this.bga.gameui.addTooltipHtml(id, objectiveGroupHtml);
    });

    // Scoring cards: hovering any one shows all of them in the top-row layout
    const scoringCells = (d.scoring_cards || []).map((scoringId) => {
      const scoringMat = this.gamedatas.materials.scoring_cards?.[scoringId];
      const title = scoringMat?.title ?? `${_('Scoring card')} #${scoringId}`;
      const explanation = scoringMat?.explanation ?? '';
      return this.buildCardTooltipSpriteHtml(
        'scoring',
        scoringId,
        title,
        [explanation],
        this.scoringScoresHtml(scoringId, d),
      );
    });
    const scoringGroupHtml = this.wrapTooltipGrid(scoringCells);
    (d.scoring_cards || []).forEach((_scoringId, idx) => {
      const id = `bae_score_${idx}`;
      try { this.bga.gameui.removeTooltip(id); } catch (_) {}
      this.bga.gameui.addTooltipHtml(id, scoringGroupHtml);
    });

    // Camps, holds, and scientist shelves
    this.registerScientistTooltips();

    // Played animal cards on locations
    for (const pidStr of Object.keys(this.gamedatas.players)) {
      const pid = Number(pidStr);
      (d.boards[pid] ?? []).forEach((pile, loc) => {
        pile.forEach((card, si) => {
          const id = `bae_pile_${pid}_${loc}_${si}`;
          try { this.bga.gameui.removeTooltip(id); } catch (_) {}
          const def = this.animalDef(card.id);
          const species = this.gamedatas.materials.species_names?.[def?.species ?? 0] ?? '';
          const vehicle = this.gamedatas.materials.vehicle_names?.[def?.vehicle ?? 0] ?? '';
          const sci = this.gamedatas.materials.scientist_names ?? [];
          const effect = def
            ? `${_('Moves')} ${sci[def.left_move] ?? def.left_move} ${_('left')} · ${sci[def.right_move] ?? def.right_move} ${_('right')}. ${_('Vehicle')}: ${vehicle}. ${_('Bonus VP')}: ${def.bonus_vp}.`
            : '';
          const html = this.buildCardTooltipSpriteHtml(
            'animal',
            card.id,
            `${species || _('Animal card')} #${card.id}`,
            [effect],
          );
          this.bga.gameui.addTooltipHtml(id, html);
        });
      });
    }

    // console.log(d, this.gamedatas.materials);

    // Track: hovering any space on a location shows the full exploration table
    const trackVps = this.gamedatas.materials.track_space_vp;
    const vehicleNames = this.gamedatas.materials.vehicle_names;
    for (const pidStr of Object.keys(this.gamedatas.players)) {
      const pid = Number(pidStr);
      const tracksVehicles = this.gamedatas.materials.player_boards[d.board_for_players[pid] ?? 0] ?? {};
      for (let loc = 0; loc < 3; loc++) {
        const trackKey = loc == 0 ? 'left_location' : loc == 1 ? 'mid_location' : 'right_location';
        const html = this.explorationTrackTooltipHtml(
          d.flags?.[pid]?.[loc] ?? 0,
          tracksVehicles[trackKey] ?? [],
          trackVps[loc] ?? [],
          vehicleNames,
        );
        const trackId = `bae_track_${pid}_${loc}`;
        try { this.bga.gameui.removeTooltip(trackId); } catch (_) {}
        this.bga.gameui.addTooltipHtml(trackId, html);
        for (let i = 0; i < 8; i++) {
          try { this.bga.gameui.removeTooltip(`bae_track_${pid}_${loc}_${i}`); } catch (_) {}
        }
      }
    }

    const speciesSetHtml = this.speciesSetVpTooltipHtml();
    for (const pidStr of Object.keys(this.gamedatas.players)) {
      const id = `bae_animal_loc_vp_${Number(pidStr)}`;
      try { this.bga.gameui.removeTooltip(id); } catch (_) {}
      this.bga.gameui.addTooltipHtml(id, speciesSetHtml);
    }

    for (const pidStr of Object.keys(this.gamedatas.players)) {
      const pid = Number(pidStr);
      const id = `bae_vp_tokens_${pid}`;
      try { this.bga.gameui.removeTooltip(id); } catch (_) {}
      this.bga.gameui.addTooltipHtml(id, this.vpTokensTooltipHtml(pid));
    }
  }

  private renderTrackColumn(player_id: number, track: TrackUiClient, location: number, flagDepth: number): string {
    const safeDepth = Math.max(0, Math.min(7, flagDepth));
    const baseUrl = this.bga.images.getImgUrl();
    let html = `<div id="bae_track_${player_id}_${location}" class="bae_track">`;
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
    const out: Array<{ html: string; top: number; left: number }> = [];
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
      out.push({
        top,
        left,
        html: `<img class="bae_meeple_img ${meepleClasses[col]}" data-scientist="${col}" src="${src}" alt="" draggable="false" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%;z-index:`,
      });
    }

    // Topmost (then rightmost) behind; bottommost (then leftmost) in front.
    out.sort((a, b) => a.top - b.top || b.left - a.left);
    return out.map((it, i) => `${it.html}${i + 1}"/>`).join("");
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

  private seatedPlayerIds(): number[] {
    const order = this.gamedatas.playerOrder;
    if (Array.isArray(order) && order.length > 0) {
      return order.map(Number).filter((pid) => pid > 0 && this.gamedatas.players[pid]);
    }
    return Object.keys(this.gamedatas.players).map(Number);
  }

  private playerColorCss(pid: number): string {
    const raw = String(this.gamedatas.players[pid]?.color ?? '').trim();
    if (!raw) return '#1a1a1a';
    return raw.startsWith('#') ? raw : `#${raw}`;
  }

  private coloredPlayerName(pid: number): string {
    const name = this.escapeHtml(this.gamedatas.players[pid]?.name ?? `${_('Player')} ${pid}`);
    return `<span class="bae_tooltip_player_name" style="color:${this.playerColorCss(pid)}">${name}</span>`;
  }

  private vpInlineIcon(): string {
    const vpIcon = `${this.bga.images.getImgUrl()}Tokens/VP.svg`;
    return `<span class="bae_text_with_icon"><img class="bae_vp_inline" src="${vpIcon}" alt="${this.escapeHtml(_('VP'))}" draggable="false"/></span>`;
  }

  private vpTokensTooltipHtml(pid: number): string {
    const d = this.gamedatas.boardState;
    const vp = playerVp(d.vps, pid);
    const claimed = (d.objectives ?? []).filter((o) => o.players[pid] === 'claimed');
    const total = `<div class="bae_vp_tokens_tooltip_total">${vp} ${this.vpInlineIcon()}</div>`;
    if (claimed.length === 0) {
      return `<div class="bae_vp_tokens_tooltip">${total}<div>${this.escapeHtml(_('No claimed objectives.'))}</div></div>`;
    }
    const names = claimed.map((obj) => {
      const mat = this.gamedatas.materials.objectives[obj.id];
      const title = mat?.title ?? `${_('Objective')} #${obj.id}`;
      return `<div class="bae_vp_tokens_tooltip_obj">${this.escapeHtml(title)}</div>`;
    }).join('');
    return `<div class="bae_vp_tokens_tooltip">${total}<div class="bae_vp_tokens_tooltip_objs">${names}</div></div>`;
  }

  private speciesSetVpTooltipHtml(): string {
    const animalIcon = `${this.bga.images.getImgUrl()}Tokens/animal_obj.webp`;
    const vpIcon = this.vpInlineIcon();
    const rows = [1, 2, 3, 4, 5, 6, 7].map((count) => {
      const vp = SPECIES_SET_VP[count] ?? 0;
      return `<tr><td>${count}</td><td>${vp}</td></tr>`;
    }).join('');
    const blurb = `${vpIcon} ${this.escapeHtml(_('awarded for the set of animals of the same species you have in a single location. Each species in each location is scored independently according to the table above.'))}`;
    return `
      <div class="bae_species_set_tooltip">
        <table>
          <thead>
            <tr>
              <th><img class="bae_tooltip_token" src="${animalIcon}" alt="${this.escapeHtml(_('Animals'))}" draggable="false"/></th>
              <th>${vpIcon}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p>${blurb}</p>
      </div>
    `;
  }

  private explorationTrackTooltipHtml(
    flagDepth: number,
    trackVehicles: number[][],
    spaceVp: number[],
    vehicleNames: string[],
  ): string {
    const baseUrl = this.bga.images.getImgUrl();
    const vehicleIcon = `${baseUrl}Tokens/track_obj.webp`;
    const flagIcon = `${baseUrl}Tokens/FlagToken.webp`;
    const vpIcon = this.vpInlineIcon();
    const vehicleHead = (n: number) => (
      `<span class="bae_track_tooltip_vehicle_head"><img class="bae_tooltip_token" src="${vehicleIcon}" alt="${this.escapeHtml(_('Vehicle'))}" draggable="false"/> ${n}</span>`
    );
    const nameOf = (id: number | undefined): string => {
      if (id == null) return '';
      return this.escapeHtml(vehicleNames[id] ?? `#${id}`);
    };
    const flagCell = (space: number): string => (
      space === flagDepth
        ? `<img class="bae_tooltip_flag" src="${flagIcon}" alt="${this.escapeHtml(_('Flag'))}" draggable="false"/>`
        : ''
    );
    const rows = Array.from({ length: 8 }, (_, space) => {
      const vehicles = trackVehicles[space - 1] ?? [];
      const vp = spaceVp[space] ?? 0;
      return `<tr><td>${flagCell(space)}</td><td>${nameOf(vehicles[0])}</td><td>${nameOf(vehicles[1])}</td><td>${vp}</td></tr>`;
    }).join('');
    const blurb = this.escapeHtml(_('Advance the flag one space when the observed animal\'s vehicle matches a vehicle printed on the next space.'));
    return `
      <div class="bae_track_tooltip">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>${vehicleHead(1)}</th>
              <th>${vehicleHead(2)}</th>
              <th>${vpIcon}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p>${blurb}</p>
      </div>
    `;
  }

  private tooltipTextHtml(text: string): string {
    return this.escapeHtml(text).replace(/\{VP\}/g, this.vpInlineIcon());
  }

  private tooltipScoresHtml(rows: Array<{ pid: number; value: string }>): string {
    return rows
      .map((row) => `<div>${this.coloredPlayerName(row.pid)}: ${this.tooltipTextHtml(row.value)}</div>`)
      .join('');
  }

  private objectiveScoresHtml(obj: ObjectiveClient, state: BoardState): string {
    const materials = this.gamedatas.materials;
    const progress = this.tooltipScoresHtml(this.seatedPlayerIds().map((pid) => {
      const { count, required } = objectiveProgress(obj.id, pid, state, materials);
      return { pid, value: `${count}/${required}` };
    }));
    const claimed = this.seatedPlayerIds().filter((pid) => obj.players?.[pid] === 'claimed');
    if (claimed.length === 0) return progress;
    const claimedLine = `<div class="bae_tooltip_claimed_by">${this.escapeHtml(_('Claimed by'))}: ${claimed.map((pid) => this.coloredPlayerName(pid)).join(', ')}</div>`;
    return `${progress}${claimedLine}`;
  }

  private scoringScoresHtml(scoringId: number, state: BoardState): string {
    const materials = this.gamedatas.materials;
    return this.tooltipScoresHtml(this.seatedPlayerIds().map((pid) => {
      const vp = scoreScoringCard(scoringId, pid, state, materials);
      return { pid, value: String(vp) };
    }));
  }

  private objectiveClaimedThisRound(obj: ObjectiveClient): boolean {
    return !!obj.active && Object.values(obj.players ?? {}).some((s) => s === 'claimed');
  }

  private objectiveActionText(obj: ObjectiveClient): string {
    const myId = Number(this.bga.players.getCurrentPlayerId());
    const seated = Number.isFinite(myId) && !!this.gamedatas.players[myId];
    const playerState = seated ? (obj.players?.[myId] ?? 'unmet') : null;
    const claimedThisRound = this.objectiveClaimedThisRound(obj);
    const endRoundPrompt = _('Players that meet the objective will be prompted to claim it at the end of the round.');
    if (playerState === 'claimed') {
      return claimedThisRound
        ? `${_('You have already claimed this objective.')} ${endRoundPrompt}`
        : _('You have already claimed this objective.');
    }
    if (claimedThisRound) return endRoundPrompt;
    if (!obj.active) return _('The objective has been claimed on a previous round.');
    if (!seated) return '';
    if (playerState !== 'meets') return _('You do not meet the requirements for this objective.');
    if (this.isPromptClaimObjectiveLike() && this.bga.players.isCurrentPlayerActive()) {
      return _('Click to claim this objective now, or use the status bar if you would rather pass.');
    }
    if (this.bga.players.isCurrentPlayerActive() && !this.isOpeningMulliganLike()) {
      return _('Click to select this objective, then click again (or confirm) to claim it for 5 VP.');
    }
    return _('Click to claim this objective on your turn.');
  }

  private buildCardTooltipSpriteHtmlInternal(
    type: 'animal' | 'objective' | 'scoring',
    id: number,
    _title: string,
    details: string[],
    scoresHtml = '',
  ): string {
    const tooltipScale = this.getTooltipScale();
    const tier = tooltipScale >= 0.55 ? 'full' : tooltipScale >= 0.25 ? 'half' : 'quarter';
    const baseUrl = this.bga.images.getImgUrl();
    const animalSpriteUrl = `${baseUrl}Sprites/AnimalCards_sheet_${tier}.webp`;
    const objectiveSpriteUrl = `${baseUrl}Sprites/ObjectiveCards_sheet_${tier}.webp`;
    const scoringSpriteUrl = `${baseUrl}Sprites/ScoringCards_sheet_${tier}.webp`;
    const vpInline = this.vpInlineIcon();

    const extraHtml = details
      .filter((line) => line && line.trim().length > 0)
      .map((line) => `<div>${this.escapeHtml(line).replace(/\{VP\}/g, vpInline)}</div>`)
      .join('');

    const width = (type === 'objective' ? 745 : 528) * tooltipScale;
    const aspectRatio = type === 'objective' ? '745 / 528' : '528 / 745';

    let cardHtml;
    if (type === 'objective') {
      cardHtml = this.applyTooltipScaleToCardFace('objective', id, tooltipScale);
    } else if (type === 'scoring') {
      cardHtml = this.applyTooltipScaleToCardFace('scoring', id, tooltipScale);
    }
    else if (type === 'animal') {
      cardHtml = this.cardFaceById(id)
        .replace(
          '<div class="bae_card_img bae_overlay_card"',
          `<div class="bae_card_img bae_overlay_card" style="width:100%;height:100%;--animal-sprite-url:url('${animalSpriteUrl}');--objective-sprite-url:url('${objectiveSpriteUrl}');--scoring-sprite-url:url('${scoringSpriteUrl}');"`,
        );
    }

    const scoresBlock = scoresHtml
      ? `<div class="bae_tooltip_scores">${scoresHtml}</div>`
      : '';
    const extraBlock = extraHtml
      ? `<div class="bae_tooltip_extra">${extraHtml}</div>`
      : '';

    return `
      <div class="bae_tooltip_card" style="width:${width}px;max-width:100%;--bae-scale:${tooltipScale};--animal-sprite-url:url('${animalSpriteUrl}');--objective-sprite-url:url('${objectiveSpriteUrl}');--scoring-sprite-url:url('${scoringSpriteUrl}');">
        <div class="bae_tooltip_card_face" style="width:100%;aspect-ratio:${aspectRatio};">${cardHtml}</div>
        ${scoresBlock}
        ${extraBlock}
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
          <div class="bae_fit_text bae_obj_type_bounds"><div class="bae_fit_text_inner">${typeLabel}</div></div>
          <div class="bae_fit_text bae_obj_title_bounds"><div class="bae_fit_text_inner">${title}</div></div>
          <div class="bae_fit_text bae_obj_desc_bounds"><div class="bae_fit_text_inner">${description}</div></div>
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
          <div class="bae_fit_text bae_score_type_bounds"><div class="bae_fit_text_inner">${typeLabel}</div></div>
          <div class="bae_fit_text bae_score_title_bounds"><div class="bae_fit_text_inner">${title}</div></div>
          <div class="bae_fit_text bae_score_desc_bounds"><div class="bae_fit_text_inner">${descriptionWithVp}</div></div>
        </div>
      </div>
    `;
  }

  private fitCardOverlayText(container?: HTMLElement): void {
    const scope = container ?? this.root;
    if (!scope) return;

    const scaleRaw = getComputedStyle(scope).getPropertyValue('--bae-scale');
    const boardScale = Math.max(0.01, Number.parseFloat(scaleRaw) || 1);
    const boxes = scope.querySelectorAll<HTMLElement>('.bae_fit_text');
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
        const selInvalid = selObs && this.isGameplayLike() && this.selectedLocation != null && !this.isObserveSelectionLegal()
          ? " bae_card_invalid"
          : "";
        const selRg = (this.campSelected || this.isOpeningMulliganLike()) && this.selectedRegroupIds.has(id) ? " bae_card_regroup" : "";
        const confirmBlurb = this.isGameplayLike() && this.selectedCardId === id && this.isObserveSelectionLegal()
          ? `<span class="bae_confirm_blurb">${this.escapeHtml(_('Confirm?'))}</span>`
          : '';
        html += `<button id="bae_hand_${myId}_${id}" type="button" class="bae_card bae_handcard${selObs}${selInvalid}${selRg}" data-hand-card="${id}">${this.cardFaceById(id)}${confirmBlurb}</button>`;
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
          if (this.isActionBusy() || !this.bga.players.isCurrentPlayerActive()) return;
          if (this.isOpeningMulliganLike() || this.campSelected) {
            if (this.selectedRegroupIds.has(id)) this.selectedRegroupIds.delete(id);
            else this.selectedRegroupIds.add(id);
            (ev.currentTarget as HTMLElement).classList.toggle('bae_card_regroup', this.selectedRegroupIds.has(id));
            this.optionalUi?.onSelectionChanged();
            this.onUpdateActionButtons(this.currentStateName(), null);
            return;
          } else if (this.isGameplayLike()) {
            if (this.selectedCardId === id) {
              if (this.confirmObserveIfReady(id, this.selectedLocation)) return;
              return;
            }
            this.selectedCardId = id;
            this.selectedObjectiveIdx = null;
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
          if (this.isActionBusy()) return;
          if (this.isAssignCampLike() && this.bga.players.isCurrentPlayerActive()) {
            if (this.selectedLocation === loc) {
              void this.sendAction("actAssignScientists", { location: loc });
              return;
            }
            this.selectedObjectiveIdx = null;
            this.selectedLocation = loc;
            this.renderAll();
            this.onUpdateActionButtons(this.currentStateName(), null);
            return;
          }
          if (this.isGameplayLike() && this.bga.players.isCurrentPlayerActive()) {
            if (this.campSelected) {
              // Selecting a location while a camp is selected should clear camp selection
              // and select the location instead.
              this.campSelected = false;
              this.selectedRegroupIds.clear();
              this.selectedCardId = null;
              this.selectedObjectiveIdx = null;
            this.selectedLocation = loc;
              this.renderAll();
              this.onUpdateActionButtons(this.currentStateName(), null);
            } else {
              if (this.selectedLocation === loc) {
                if (this.confirmObserveIfReady(this.selectedCardId, loc)) return;
                return;
              }
              this.selectedObjectiveIdx = null;
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
          if (!slotEl?.id.startsWith('bae_pile_')) return;
          const nums = slotEl.id.slice('bae_pile_'.length).split('_').map(Number);
          if (nums.length < 2 || !Number.isFinite(nums[0]) || !Number.isFinite(nums[1])) return;
          const pid = nums[0];
          const loc = nums[1];
          if (pid !== myId) return;
          if (this.isActionBusy()) return;
          if (this.isAssignCampLike() && this.bga.players.isCurrentPlayerActive()) {
            if (this.selectedLocation === loc) {
              void this.sendAction('actAssignScientists', { location: loc });
              return;
            }
            this.selectedObjectiveIdx = null;
            this.selectedLocation = loc;
            this.renderAll();
            this.onUpdateActionButtons(this.currentStateName(), null);
            return;
          }
          if (this.isGameplayLike() && this.bga.players.isCurrentPlayerActive()) {
            if (this.campSelected) {
              this.campSelected = false;
              this.selectedRegroupIds.clear();
              this.selectedCardId = null;
              this.selectedObjectiveIdx = null;
            this.selectedLocation = loc;
              this.renderAll();
              this.onUpdateActionButtons(this.currentStateName(), null);
            } else {
              if (this.selectedLocation === loc) {
                if (this.confirmObserveIfReady(this.selectedCardId, loc)) return;
                return;
              }
              this.selectedObjectiveIdx = null;
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
          if (this.isActionBusy() || !this.isGameplayLike() || !this.bga.players.isCurrentPlayerActive()) return;
          // Camp selection is idempotent: clicking camp again does nothing.
          if (this.campSelected) return;
          this.enterRegroupMode();
        },
        true,
      );
    });
    this.root.querySelectorAll("[data-pool-slot]").forEach((el) => {
      el.addEventListener("click", () => {
        if (this.isActionBusy() || !this.bga.players.isCurrentPlayerActive()) return;
        if (!this.isReplenishLike()) return;
        const slot = Number((el as HTMLElement).dataset.poolSlot);
        if (this.selectedPoolSlot === slot) {
          void this.sendAction("actTakeAnimal", { pool_slot: slot });
          return;
        }
        this.selectedObjectiveIdx = null;
        this.selectedPoolSlot = slot;
        this.renderAll();
        this.onUpdateActionButtons(this.currentStateName(), null);
      });
    });
    this.root.querySelectorAll("[data-obj-idx]").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number((el as HTMLElement).dataset.objIdx);
        if (this.isActionBusy() || !this.bga.players.isCurrentPlayerActive()) return;
        // Only allow claiming when this player actually 'meets' the objective
        const obj = this.gamedatas.boardState.objectives?.[idx];
        if (!obj) return;
        const playerState = obj.players?.[myId] ?? 'unmet';
        if (playerState !== 'meets') return;

        if (this.isPromptClaimObjectiveLike()) {
          const promptedIdx = this.getPromptedObjectiveIndex();
          if (promptedIdx == null || idx !== promptedIdx) return;
          void this.sendAction("actClaimPromptObjective", { objective_index: idx });
          return;
        }

        if (!this.canSelectObjectiveToClaim()) return;
        if (this.selectedObjectiveIdx === idx) {
          void this.sendAction("actClaimObjective", { objective_index: idx });
          return;
        }
        this.selectedObjectiveIdx = idx;
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.selectedPoolSlot = null;
        this.campSelected = false;
        this.selectedRegroupIds.clear();
        this.renderAll();
        this.onUpdateActionButtons(this.currentStateName(), null);
        this.optionalUi?.playSoundKind('select');
      });
    });
  }

  onEnteringState(stateName: string, entryArgs: { args: Record<string, unknown> | null }) {
    this.cacheStateActionArgs(entryArgs.args);
    this.selectedCardId = null;
    this.selectedLocation = null;
    this.selectedPoolSlot = null;
    this.selectedObjectiveIdx = null;
    this.campSelected = false;
    const n = stateName.toLowerCase();
    const keepOpeningDiscards = n.includes('openingmulligan') || n.includes('opening_mulligan');
    if (!keepOpeningDiscards) this.selectedRegroupIds.clear();
    if (n.includes("gameplay") || n.includes("replenish") || n.includes("assign") || n.includes("openingmulligan") || n.includes("promptclaim") || n.includes("prompt_claim")) {
      this.renderAll();
    }
  }

  onLeavingState(stateName: string) {
    this.cachedActionArgs = null;
    this.cachedUndoCanUndo = false;
    this.cachedUndoType = null;
    this.cachedCanMulligan = undefined;
    if (stateName.toLowerCase().includes('openingmulligan')) {
      this.openingIntroPage = null;
      this.openingIntroEl?.remove();
      this.openingIntroEl = null;
    }
  }

  onUpdateActionButtons(stateName: string, args: Record<string, unknown> | null) {
    this.cacheStateActionArgs(args);
    const effectiveArgs = args ?? this.cachedActionArgs;

    this.bga.statusBar.removeActionButtons();
    if (this.isActionBusy() || !this.bga.players.isCurrentPlayerActive()) return;
    const sn = stateName.toLowerCase();
    if (sn.includes("promptclaimobjective") || sn.includes("prompt_claim_objective")) {
      const myId = Number(this.bga.players.getCurrentPlayerId());
      const promptArgs = effectiveArgs as unknown as PromptClaimArgs | null;
      const pending = promptArgs?.pendingByPlayer?.[myId] ?? [];
      if (pending.length === 0) return;

      const target = pending[0];
      const claimLabel = _("Claim objective");
      const skipLabel = _("Don't claim");
      this.bga.statusBar.addActionButton(`${claimLabel}: ${target.title}`, () => {
        void this.sendAction("actClaimPromptObjective", {
          objective_index: target.index,
        });
      }, {
        disabled: false,
        tooltip: _("Claim this objective now and score 5 VP."),
      });

      this.bga.statusBar.addActionButton(skipLabel, () => {
        void this.sendAction("actSkipPromptObjective", {
          objective_index: target.index,
        });
      }, {
        disabled: false,
        tooltip: _("Do not claim this objective. You will not be prompted to claim later and will not be able to claim if your turn has passed this round. This is added to mimic game rules where you can claim objectives at any time if you realized that you meet the objective requirements after it is claimed."),
      });

      const undoInfo = promptArgs?.undoByPlayer?.[myId];
      this.addUndoActionButton(undoInfo?.canUndo, undoInfo?.undoType ?? null);
      this.renderAll();
      return;
    }

    if (sn.includes("openingmulligan")) {
      if (this.openingIntroPage != null) {
        return; // Don't show action buttons while the intro is being displayed
      }

      const replaceCount = this.selectedRegroupIds.size;
      const replaceLabel = _("Replace ${count} Card(s)").replace("${count}", String(replaceCount));
      this.bga.statusBar.addActionButton(replaceLabel, () => {
        const ids = Array.from(this.selectedRegroupIds);
        void this.sendAction("actMulliganHand", {
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
      this.addClaimObjectiveButton();
      if (this.campSelected) {
        const regroupCount = this.selectedRegroupIds.size;
        const replaceLabel = _("Replace ${count} Card(s)").replace("${count}", String(regroupCount));
        this.bga.statusBar.addActionButton(replaceLabel, () => {
          const ids = Array.from(this.selectedRegroupIds);
          void this.confirmRegroupDiscard(ids);
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

      const observeDisabled = !this.isObserveSelectionLegal();
      const observeMissingSelection = this.selectedCardId == null || this.selectedLocation == null;
      this.bga.statusBar.addActionButton(_("Observe"), () => {
        if (observeDisabled) {
          if (!observeMissingSelection) this.optionalUi?.showInvalidObserveHint();
          return;
        }
        void this.sendAction("actObserveAnimal", {
          card_id: this.selectedCardId,
          location: this.selectedLocation,
        });
      }, {
        disabled: observeDisabled,
        tooltip: observeMissingSelection
          ? _("Select a card from your hand and a location to observe. ") + _("Play an animal card from your hand, placing it in a location containing the scientists matching those printed on the card.")
          : (observeDisabled
            ? _("This location does not have the scientists required.")
            : _("Play an animal card from your hand, placing it in a location containing the scientists matching those printed on the card.")),
    });

      this.bga.statusBar.addActionButton(_('Start Regroup'), () => {
        this.enterRegroupMode();
      }, {
        disabled: false,
        tooltip: _("Start choosing cards to discard and select a camp to regroup."),
      });

      const clearDisabled = this.selectedCardId == null && this.selectedLocation == null && !this.campSelected && this.selectedRegroupIds.size === 0 && this.selectedObjectiveIdx == null;
      this.bga.statusBar.addActionButton(_('Clear selection'), () => {
         this.clearSelection();
      }, {
        disabled: clearDisabled,
        tooltip: clearDisabled ? _("No selection to clear.") : _("Clear all selections.")
      });
    }
    if (sn.includes("replenish")) {
      this.addClaimObjectiveButton();
      const replenishArgs = effectiveArgs as unknown as ReplenishArgs | null;
      const poolCardSelected = this.selectedPoolSlot != null && this.selectedPoolSlot >= 0;
      this.bga.statusBar.addActionButton(_("Draw Card"), () => {
        if (!poolCardSelected || this.selectedPoolSlot == null) return;
        void this.sendAction("actTakeAnimal", { pool_slot: this.selectedPoolSlot });
      }, {
        disabled: !poolCardSelected,
        tooltip: poolCardSelected
          ? _("Take the selected card from the pool.")
          : _("Select a card from the pool to draw."),
      });
      this.bga.statusBar.addActionButton(_("Draw from deck"), () => {
        void this.sendAction("actTakeAnimal", { pool_slot: -1 });
      });
      const can = replenishArgs?.canMulligan ?? this.cachedCanMulligan;
    //   console.log("Can mulligan?", can, args);
        this.bga.statusBar.addActionButton(_("Mulligan pool (-1 VP)"), () => {
          void this.sendAction("actMulliganPool", {});
        }, {
            disabled: !can,
            tooltip: can ? _("Pay 1 VP to discard all 4 available cards forming the pool and replace them with 4 new ones from the deck before choosing your card.") : _("You can only mulligan the pool once per round, and only if you have at least 1 VP."),
        });
      this.addUndoActionButton(
        replenishArgs?.canUndo ?? this.cachedUndoCanUndo,
        replenishArgs?.undoType ?? this.cachedUndoType,
      );
    }
    if (sn.includes("assigncamp") || sn.includes("assign_camp")) {
      this.addClaimObjectiveButton();
      const assignArgs = effectiveArgs as unknown as AssignCampArgs | null;
      const locationSelected = this.selectedLocation != null;
      this.bga.statusBar.addActionButton(_("Assign Scientists"), () => {
        if (!locationSelected || this.selectedLocation == null) return;
        void this.sendAction("actAssignScientists", { location: this.selectedLocation });
      }, {
        disabled: !locationSelected,
        tooltip: locationSelected
          ? _("Assign all your scientists to the selected location.")
          : _("Select a location to assign your scientists."),
      });

      this.addUndoActionButton(
        assignArgs?.canUndo ?? this.cachedUndoCanUndo,
        assignArgs?.undoType ?? this.cachedUndoType,
      );
    }
  }

  async notif_observeAnimal(_args: any) {
    const args = this.unwrapNotif(_args);
    const prev = this.gamedatas.boardState;
    try { await this.optionalUi?.playObserveResolution(prev, args); } catch (_) { /* keep state apply */ }
    this.optionalUi?.playSoundKind('success');
    if (args.boardState) this.gamedatas.boardState = args.boardState as BoardState;
    this.selectedCardId = null;
    this.selectedLocation = null;
    this.releasePendingActionForNotif('observeAnimal', args);
    this.renderAll();
  }
  async notif_takeAnimal(_args: any) {
    const args = this.unwrapNotif(_args);
    const prev = this.gamedatas.boardState;
    try { await this.optionalUi?.playTakeResolution(prev, args); } catch (_) { /* keep state apply */ }
    if (args.boardState) this.gamedatas.boardState = args.boardState as BoardState;
    this.selectedPoolSlot = null;
    this.releasePendingActionForNotif('takeAnimal', args);
    this.renderAll();
  }
  async notif_mulliganPool(_args: any) {
    const args = this.unwrapNotif(_args);
    const prev = this.gamedatas.boardState;
    try { await this.optionalUi?.playMulliganPoolResolution(prev, args); } catch (_) { /* keep state apply */ }
    if (args.boardState) this.gamedatas.boardState = args.boardState as BoardState;
    this.releasePendingActionForNotif('mulliganPool', args);
    this.renderAll();

    const pid = Number(args.player_id ?? args.playerId ?? 0);
    const ctr = this.bga.playerPanels.getScoreCounter(pid);
    ctr.incValue(-1);
  }
  async notif_mulliganHand(_args: any) {
    const args = this.unwrapNotif(_args);
    const prev = this.gamedatas.boardState;
    try { await this.optionalUi?.playMulliganHandResolution(prev, args); } catch (_) { /* keep state apply */ }
    if (args.boardState) this.gamedatas.boardState = args.boardState as BoardState;
    const pid = Number(args.player_id ?? args.playerId ?? 0);
    const myId = Number(this.bga.players.getCurrentPlayerId());
    if (pid === myId || !this.isOpeningMulliganLike()) {
      this.selectedRegroupIds.clear();
    }
    this.releasePendingActionForNotif('mulliganHand', args);
    this.renderAll();
  }
  async notif_actionUndone(_args: any) {
    const args = this.unwrapNotif(_args);
    this.optionalUi?.clearHolding();
    if (args.boardState) this.gamedatas.boardState = args.boardState as BoardState;
    this.releasePendingActionForNotif('actionUndone', args);
    this.renderAll();
    this.syncScoresFromBoardState(this.gamedatas.boardState);
  }
  async notif_regroup(_args: any) {
    const args = this.unwrapNotif(_args);
    const prev = this.gamedatas.boardState;
    try { await this.optionalUi?.playRegroupResolution(prev, args); } catch (_) { /* keep state apply */ }
    if (args.boardState) this.gamedatas.boardState = args.boardState as BoardState;
    this.selectedCardId = null;
    this.selectedLocation = null;
    this.campSelected = false;
    this.selectedRegroupIds.clear();
    this.releasePendingActionForNotif('regroup', args);
    this.renderAll();

    const pid = Number(args.player_id ?? args.playerId ?? 0);
    const vpGained = Number(args.vp_from_camps ?? 0);
    const ctr = this.bga.playerPanels.getScoreCounter(pid);
    ctr.incValue(vpGained);
  }
  async notif_assignScientists(_args: any) {
    const args = this.unwrapNotif(_args);
    const prev = this.gamedatas.boardState;
    try { await this.optionalUi?.playAssignResolution(prev, args); } catch (_) { /* keep state apply */ }
    if (args.boardState) this.gamedatas.boardState = args.boardState as BoardState;
    this.selectedLocation = null;
    this.campSelected = false;
    this.releasePendingActionForNotif('assignScientists', args);
    this.renderAll();
  }
  async notif_objectiveClaimed(_args: any) {
    const args = this.unwrapNotif(_args);
    this.optionalUi?.playSoundKind('claim');
    const prev = this.gamedatas.boardState;
    try { await this.optionalUi?.playObjectiveClaimResolution(prev, args); } catch (_) { /* keep state apply */ }
    if (args.boardState) this.gamedatas.boardState = args.boardState as BoardState;
    this.releasePendingActionForNotif('objectiveClaimed', args);
    this.renderAll();
  }
  async notif_objectiveScored(_args: any) {
    const args = this.unwrapNotif(_args);
    const prev = this.gamedatas.boardState;
    try { await this.optionalUi?.playObjectiveClaimResolution(prev, args); } catch (_) { /* keep state apply */ }
    if (args.boardState) this.gamedatas.boardState = args.boardState as BoardState;
    this.releasePendingActionForNotif('objectiveScored', args);
    this.renderAll();

    const pid = Number(args.player_id ?? args.playerId ?? 0);
    const score = Number(args.score ?? 0);
    const ctr = this.bga.playerPanels.getScoreCounter(pid);
    ctr.incValue(score);
  }
  async notif_endOfRound(_args: any) {
    const args = this.unwrapNotif(_args);
    if (args.boardState) this.gamedatas.boardState = args.boardState as BoardState;
    this.renderAll();
  }
  async notif_finalScoring(_args: any) {
    const args = this.unwrapNotif(_args);
    if (args.boardState) this.gamedatas.boardState = args.boardState as BoardState;
    this.renderAll();
  }
  async notif_scoringStep(_args: any) {
    const args = this.unwrapNotif(_args);
    const prev = this.gamedatas.boardState;
    try { await this.optionalUi?.playScoringStepResolution(prev, args); } catch (_) { /* keep state apply */ }
    if (args.boardState) this.gamedatas.boardState = args.boardState as BoardState;
    this.renderAll();

    const pid = Number(args.player_id ?? args.playerId ?? 0);
    const anchorId = String(args.anchor_id ?? `bae_playerboard_${pid}`);
    let color = String(args.color ?? (this.gamedatas.players?.[pid]?.color ?? ""));
    if (color.startsWith && color.startsWith('#')) color = color.substring(1);
    const amount = scoringStepAmount(args);
    const scoreStr = (amount >= 0 ? '+' : '') + String(amount);
    const duration = typeof args.duration === 'number' ? args.duration : 1200;
    const offset_x = typeof args.offset_x === 'number' ? Number(args.offset_x) : undefined;
    const offset_y = typeof args.offset_y === 'number' ? Number(args.offset_y) : undefined;

    try {
      if (this.bga && (this.bga as any).gameui && typeof (this.bga as any).gameui.displayScoring === 'function') {
        (this.bga as any).gameui.displayScoring(anchorId, color, scoreStr, duration, offset_x ?? null, offset_y ?? null);
      }
    } catch (err) {
      console.error('scoringStep display failed', err, args);
    }

    const ctr = this.bga.playerPanels.getScoreCounter(pid);
    ctr.incValue(amount);
  }
}
