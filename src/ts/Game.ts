const SCI_COLOR = ["#ddb162", "#eca6b8", "#7dc7bc"];

export class Game {
  bga!: Bga<BorealisArticExpeditionsPlayer, BorealisArticExpeditionsGamedatas>;
  gamedatas!: BorealisArticExpeditionsGamedatas;
  private root!: HTMLElement;
  private selectedCardId: number | null = null;
  private selectedLocation: number | null = null;
  private campSelected = false;
  private selectedRegroupIds = new Set<number>();

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
  }

  setupNotifications() {
    this.bga.notifications.setupPromiseNotifications({
      prefix: "notif_",
      handlers: [this, this.bga],
      onStart: (notifName, msg, args) => {
        console.log("Notification started:", notifName, msg, args);
      }});
  }

  private syncGamedatas() {
    this.gamedatas = this.gamedatas as BorealisArticExpeditionsGamedatas;
  }

  private updateBoardScale(): void {
    // if (!this.root) return;
    // const designWidth = 3788 + 528 + 12;
    // const boardEl = document.getElementById('bae_playarea') as HTMLElement | null;
    // let scale = 980 / designWidth; // fallback matches SCSS default
    // if (boardEl) {
    //   const rect = boardEl.getBoundingClientRect();
    //   if (rect && rect.width > 0) {
    //     scale = rect.width / designWidth;
    //   } else {
    //     const cssW = window.getComputedStyle(boardEl).getPropertyValue('width');
    //     const parsed = parseFloat(cssW || '0');
    //     if (parsed > 0) scale = parsed / designWidth;
    //     scale = Math.min(scale, 0.5); // don't upscale beyond 100%
    //   }
    //   boardEl.style.setProperty('--board-scale', String(scale));
    // }
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

  private renderAll() {
    this.syncGamedatas();

    
    const d = this.gamedatas.boardState;
    const myId = Number(this.bga.players.getCurrentPlayerId());
    const names: Record<number, string> = {};
    for (const pid of Object.keys(this.gamedatas.players)) {
      const p = this.gamedatas.players[Number(pid)];
      names[Number(pid)] = p.name;
    }
    const track = d.track ?? { vpPerSpace: [], vehiclesPerLocation: [[], [], []] };

    this.handleLastTurnBanner(d.playersEndingGame);

    let html = `<div class="bae_table">`;
    // Top row: centered table only (pool / objectives / scoring)
    html += `<div class="bae_toprow">`;
    html += `<section class="bae_center"><h3 class="bae_heading">${_("Table")}</h3>`;
    // Row container for table groups
    html += `<div class="bae_table_row">`;
    // Pool group
    html += `<div class="bae_table_group bae_pool_group"><div class="bae_label">${_("Pool")}</div><div class="bae_pool">`;
    for (const slot of d.pool) {
      // assign an ID so we can attach BGA tooltips after render
      html += `<button id="bae_pool_slot_${slot.slot}" type="button" class="bae_card bae_pool_slot" data-pool-slot="${slot.slot}">${this.cardFaceById(
        slot.id,
      )}</button>`;
    }
    html += `</div><div class="bae_meta">${_("Deck")}: ${d.deck_count} · ${_("Discard")}: ${d.discard_count}</div></div>`;
    // Objectives group
    html += `<div class="bae_table_group bae_objectives_group"><div class="bae_label">${_("Objectives")}</div><div class="bae_objectives">`;
    d.objectives.forEach((obj, idx) => {
      const st = obj.active ? _("active") : _("inactive");
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
    // Scoring group
    html += `<div class="bae_table_group bae_scoring_group"><div class="bae_label">${_("Scoring")}</div><div class="bae_scoring">${d.scoring_cards
      .map((id) => `<span class="bae_score_card">${this.scoringFaceById(id)}</span>`)
      .join("")}</div></div>`;
    html += `</div>`; // close bae_table_row
    html += `</section>`;
    html += `</div>`; // close bae_toprow

    // Order: current player first, then others in turn order
    const allPids = Object.keys(this.gamedatas.players).map(Number);
    const currentIdx = allPids.indexOf(myId);
    const orderedPids = currentIdx === -1
      ? allPids
      : [myId, ...allPids.slice(currentIdx + 1), ...allPids.slice(0, currentIdx)];

    for (const pid of orderedPids) {
      const isSelf = pid === myId;
      const animal_card_slots = d.boards[pid]?.reduce((max, loc) => Math.max(max, loc.length + 1), 1) ?? 1;
      // Anchor each player board so scoring animations can target it
      html += `<section id="bae_playerboard_${pid}" class="bae_playerboard" data-player-id="${pid}"><h3 class="bae_heading">${names[pid] ?? pid}</h3>`;

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
            html += `<div class="bae_card bae_handcard_hidden">${this.cardFaceById(9999)}</div>`;
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
            if (hi < cnt) html += `<div class="bae_card">${this.cardFaceById(9999)}</div>`;
            else html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
          }
        }
      } else {
        // no info: show placeholders
        for (let hi = 0; hi < 4; hi++) html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
      }
      html += `</div>`; // close handcol

      const campSel = isSelf && this.campSelected ? " bae_camp_selected" : "";
      const boardBg = this.imagePath("Playerboards", d.board_for_players[pid] ?? 0);
      // Expose number of animal-card slots to CSS so margin spacing scales correctly
      html += `<div class="bae_board_canvas" style="background-image:url('${boardBg}'); --animal-card-slots: ${animal_card_slots}">`;

      html += `<div id="bae_camp_${pid}_left" class="bae_camp_zone bae_camp_left${campSel}" data-player-id="${pid}" data-camp-wrap="1" role="button" tabindex="0">`;
      html += `<div id="bae_sci_shelf_camp_${pid}_left" class="bae_sci_shelf">${this.renderScientistDots(pid, d.scientists[pid], 3)}</div>`;
      html += `</div>`;

      html += `<div id="bae_camp_${pid}_right" class="bae_camp_zone bae_camp_right${campSel}" data-player-id="${pid}" data-camp-wrap="1" role="button" tabindex="0">`;
      html += `<div id="bae_sci_shelf_camp_${pid}_right" class="bae_sci_shelf">${this.renderScientistDots(pid, d.scientists[pid], 4)}</div>`;
      html += `</div>`;

      for (let loc = 0; loc < 3; loc++) {
        const sel = isSelf && this.selectedLocation === loc && !this.campSelected ? " bae_loc_selected" : "";
        const posClass = loc === 0 ? " bae_slot_left" : loc === 1 ? " bae_slot_mid" : " bae_slot_right";
        html += `<div class="bae_location_zone${posClass}${sel}" data-player-id="${pid}" data-loc="${loc}">`;

        html += `<div class="bae_anim_pile">`;
        const pile = d.boards[pid]?.[loc] ?? [];
        for (let si = 0; si < animal_card_slots; si++) {
          const slotId = `bae_pile_${pid}_${loc}_${si}`;
          const card = pile[si];
          let inner = "";
          let style = "";
          if (card) {
            inner = this.imageTag("AnimalCards", card.id, "bae_pile_card_img", `${_("Animal card")} #${card.id}`);
            style = 'z-index: 1;'; // ensure proper layering of cards in the pile
          }
          html += `<div id="${slotId}" class="bae_pile_slot" style="${style}">${inner}</div>`;
        }
        html += `</div>`;

        html += this.renderTrackColumn(pid, track, loc, d.flags[pid]?.[loc] ?? 0);

        html += `<div id="bae_sci_shelf_loc_${pid}_${loc}" class="bae_sci_shelf" data-sci-shelf="${loc}">${this.renderScientistDots(
          pid,
          d.scientists[pid],
          loc,
        )}</div>`;

        html += `</div>`;
      }
      html += `</div>`;
      // close inner wrapper (hand column + board canvas)
      html += `</div>`;
      html += `</section>`;
    }

    html += `</div>`;
    this.root.innerHTML = html;
    // Update runtime scale variable so CSS `var(--board-scale)` resolves correctly
    this.updateBoardScale();
    // Register BGA tooltips for all elements that previously used `title` attributes
    this.registerTooltips();
    this.renderHand(myId);
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
      this.bga.gameui.addTooltip(id, _('Pool card'), _('Click to take this card'));
    });

    // Objectives
    (d.objectives || []).forEach((obj, idx) => {
      const id = `bae_obj_${idx}`;
      try { this.bga.gameui.removeTooltip(id); } catch (_) {}
      const objectiveMat = this.gamedatas.materials.objectives[obj.id];
      const help = `${_('Objective')}: ${objectiveMat?.title ?? obj.id}<br>${objectiveMat?.description ?? ''}`;
      const action = obj.active ? _('Click to claim this objective') : '';
      this.bga.gameui.addTooltip(id, help, action);
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

    console.log(d, this.gamedatas.materials);

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
        ? `<img class="bae_track_flag_only" src="${baseUrl}Tokens/FlagToken.png" alt="${_("Flag")}" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%" draggable="false"/>`
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
      const src = `${baseUrl}Tokens/${meepleFiles[col]}.png`;
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
    return `${this.bga.images.getImgUrl()}${folder}/${String(safeId).padStart(4, "0")}.png`;
  }

  private imageTag(folder: string, id: number, className: string, alt: string, extraAttrs = ""): string {
    const src = this.imagePath(folder, id);
    const safeAlt = alt.replace(/"/g, "&quot;");
    const attrs = extraAttrs ? ` ${extraAttrs}` : "";
    return `<img class="${className}" src="${src}" alt="${safeAlt}" draggable="false"${attrs}/>`;
  }

  private cardFaceById(cardId: number): string {
    return this.imageTag("AnimalCards", cardId, "bae_card_img", `${_("Animal card")} #${cardId}`);
  }

  private objectiveFaceById(objectiveId: number): string {
    return this.imageTag("ObjectiveCards", objectiveId, "bae_obj_img", `${_("Objective")} #${objectiveId}`);
  }

  private scoringFaceById(scoringId: number): string {
    return this.imageTag("ScoringCards", scoringId, "bae_score_img", `${_("Scoring card")} #${scoringId}`);
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
        if (i < cnt) html += `<div class="bae_card">${this.cardFaceById(9999)}</div>`;
        else html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
      }
    } else if (Array.isArray(h)) {
      const HAND_RESERVE = 4;
      for (const c of h) {
        const id = Number(c.id);
        const selObs = !this.campSelected && this.selectedCardId === id ? " bae_card_selected" : "";
        const selRg = this.campSelected && this.selectedRegroupIds.has(id) ? " bae_card_regroup" : "";
        html += `<button type="button" class="bae_card bae_handcard${selObs}${selRg}" data-hand-card="${id}">${this.cardFaceById(id)}</button>`;
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
          if (!this.isGameplayLike()) return;
          if (this.campSelected) {
            if (this.selectedRegroupIds.has(id)) this.selectedRegroupIds.delete(id);
            else this.selectedRegroupIds.add(id);
          } else {
            this.selectedCardId = this.selectedCardId === id ? null : id;
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
            void this.bga.actions.performAction("actAssignScientists", { location: loc });
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
              this.selectedLocation = this.selectedLocation === loc ? null : loc;
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
            void this.bga.actions.performAction('actAssignScientists', { location: loc });
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
              this.selectedLocation = this.selectedLocation === loc ? null : loc;
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
          // Toggle camp selection when clicking the camp again
          if (this.campSelected) {
            this.campSelected = false;
            this.selectedRegroupIds.clear();
          } else {
            this.campSelected = true;
          }
          this.selectedLocation = null;
          this.selectedCardId = null;
          this.renderAll();
          this.onUpdateActionButtons(this.currentStateName(), null);
        },
        true,
      );
    });
    this.root.querySelectorAll("[data-pool-slot]").forEach((el) => {
      el.addEventListener("click", () => {
        if (!this.bga.players.isCurrentPlayerActive()) return;
        if (!this.isReplenishLike()) return;
        const slot = Number((el as HTMLElement).dataset.poolSlot);
        void this.bga.actions.performAction("actTakeAnimal", { pool_slot: slot });
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
        void this.bga.actions.performAction("actClaimObjective", { objective_index: idx });
      });
    });
  }

  onEnteringState(stateName: string, _args: { args: Record<string, unknown> | null }) {
    this.selectedCardId = null;
    this.selectedLocation = null;
    this.campSelected = false;
    this.selectedRegroupIds.clear();
    const n = stateName.toLowerCase();
    if (n.includes("gameplay") || n.includes("replenish") || n.includes("assign")) {
      this.renderAll();
    }
  }

  onLeavingState(_stateName: string) {}

  onUpdateActionButtons(stateName: string, args: Record<string, unknown> | null) {
    this.bga.statusBar.removeActionButtons();
    if (!this.bga.players.isCurrentPlayerActive()) return;
    const sn = stateName.toLowerCase();
    if (sn.includes("gameplay")) {
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

      const regroupCount = this.selectedRegroupIds.size;
      const regroupDisabled = !this.campSelected && regroupCount === 0;
      const regroupLabel = !regroupDisabled ? `${_('Regroup')} (${regroupCount})` : _('Regroup');
      this.bga.statusBar.addActionButton(regroupLabel, () => {
        if (regroupDisabled) return;
        const ids = Array.from(this.selectedRegroupIds);
        void this.bga.actions.performAction("actRegroup", {
          card_ids_json: JSON.stringify(ids),
        });
      }, {
        disabled: regroupDisabled,
        tooltip: (regroupDisabled ? _("Select a camp to start regrouping. ") : "") + _("Discard as many animal cards as you want from your hand (this can be 0 cards), draw that many cards from the deck. After confirming, you will take all your scientists from both camps and put them all in a single location of your choice. You are awarded as many VP as scientists moved from the camps."),
      });

      const clearDisabled = this.selectedCardId == null && this.selectedLocation == null && !this.campSelected && this.selectedRegroupIds.size === 0;
      this.bga.statusBar.addActionButton(_('Clear selection'), () => {
         this.selectedCardId = null;
         this.selectedLocation = null;
         this.campSelected = false;
         this.selectedRegroupIds.clear();
         this.renderAll();
         // Ensure action buttons refresh after clearing selection
         this.onUpdateActionButtons(this.currentStateName(), null);
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
      console.log("Can mulligan?", can, args);
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
