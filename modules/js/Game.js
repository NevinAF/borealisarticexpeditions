const SCI_COLOR = ["#ddb162", "#eca6b8", "#7dc7bc"];
class Game {
    constructor(bga) {
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.campSelected = false;
        this.selectedRegroupIds = new Set();
        this.boardScaleTimeoutId = null;
        this.boardScaleTimeoutAccInterval = null;
        this.zoomIndex = 2;
        this.bga = bga;
    }
    setup(gamedatas) {
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
    renderPlayerPanelInfo() {
        const d = this.gamedatas.boardState;
        const firstPlayerId = Number((this.gamedatas.playerOrder ?? [])[0] ?? 0);
        // const leftLabel = this.gamedatas.materials.location_names?.[0] ?? _("Left");
        // const middleLabel = this.gamedatas.materials.location_names?.[1] ?? _("Middle");
        // const rightLabel = this.gamedatas.materials.location_names?.[2] ?? _("Right");
        for (const pidStr of Object.keys(this.gamedatas.players)) {
            const pid = Number(pidStr);
            const host = this.bga.playerPanels.getElement(pid);
            let infoEl = host.querySelector('.bae_panel_info');
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
                console.log("Notification started:", notifName, msg, args);
            }
        });
    }
    syncGamedatas() {
        this.gamedatas = this.gamedatas;
    }
    updateBoardScale() {
        if (!this.root)
            return;
        if (this.boardScaleTimeoutId !== null) {
            window.clearTimeout(this.boardScaleTimeoutId);
            this.boardScaleTimeoutId = null;
        }
        const scale = this.getScale();
        this.root.style.setProperty('--bae-scale', String(scale));
        this.boardScaleTimeoutAccInterval = 10;
        this.boardScaleTimeoutId = window.setTimeout(() => this.verifyBoardScaleTimeout(scale), 10);
    }
    getScale() {
        const area = this.bga.gameArea.getElement();
        const areaRect = area.getBoundingClientRect();
        const rootRect = this.root.getBoundingClientRect();
        const availableWidth = Math.max(1, areaRect.width);
        const availableHeight = Math.max(1, window.innerHeight - rootRect.top - 8);
        const scaleByBoardWidth = availableWidth / Game.MIN_PLAYAREA_REFERENCE_WIDTH_PX;
        const scaleByBoardHeight = availableHeight / Game.MIN_PLAYAREA_REFERENCE_HEIGHT_PX;
        const scaleByTopRowWidth = availableWidth / Game.TOP_ROW_REFERENCE_WIDTH_PX;
        const autoScale = Math.max(0.01, Math.min(scaleByBoardWidth, scaleByBoardHeight, scaleByTopRowWidth));
        const zoomFactor = Game.ZOOM_FACTORS[this.zoomIndex] ?? 1;
        const scale = Math.max(0.01, autoScale * zoomFactor);
        return scale;
    }
    ;
    verifyBoardScaleTimeout(expectedScale) {
        this.boardScaleTimeoutId = null;
        if (!this.root)
            return;
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
    bindZoomHandlers() {
        const outBtn = this.root.querySelector('[data-zoom="out"]');
        const inBtn = this.root.querySelector('[data-zoom="in"]');
        const resetBtn = this.root.querySelector('[data-zoom="reset"]');
        outBtn?.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (this.zoomIndex <= 0)
                return;
            this.zoomIndex -= 1;
            this.renderAll();
        });
        inBtn?.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (this.zoomIndex >= Game.ZOOM_FACTORS.length - 1)
                return;
            this.zoomIndex += 1;
            this.renderAll();
        });
        resetBtn?.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (this.zoomIndex === 2)
                return;
            this.zoomIndex = 2;
            this.renderAll();
        });
    }
    /** Main state name (handles nested private_state in some BGA builds). */
    currentStateName() {
        const gs = this.gamedatas.gamestate;
        if (gs.private_state?.name)
            return String(gs.private_state.name);
        return gs.name ? String(gs.name) : "";
    }
    isGameplayLike() {
        const n = this.currentStateName().toLowerCase();
        return n === "gameplay" || n.includes("gameplay");
    }
    isReplenishLike() {
        const n = this.currentStateName().toLowerCase();
        return n === "replenishanimal" || n.includes("replenish");
    }
    isAssignCampLike() {
        const n = this.currentStateName().toLowerCase();
        return n === "assigncamp" || n.includes("assigncamp") || n.includes("assign_camp");
    }
    isOpeningMulliganLike() {
        const n = this.currentStateName().toLowerCase();
        return n === "openingmulligan" || n.includes("openingmulligan") || n.includes("opening_mulligan");
    }
    enterRegroupMode() {
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.campSelected = true;
        this.selectedRegroupIds.clear();
        this.renderAll();
        this.onUpdateActionButtons(this.currentStateName(), null);
    }
    clearSelection() {
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.campSelected = false;
        this.selectedRegroupIds.clear();
        this.renderAll();
        this.onUpdateActionButtons(this.currentStateName(), null);
    }
    renderAll() {
        this.syncGamedatas();
        let html = "";
        const d = this.gamedatas.boardState;
        const myId = Number(this.bga.players.getCurrentPlayerId());
        const names = {};
        for (const pid of Object.keys(this.gamedatas.players)) {
            const p = this.gamedatas.players[Number(pid)];
            names[Number(pid)] = p.name;
        }
        const track = d.track ?? { vpPerSpace: [], vehiclesPerLocation: [[], [], []] };
        const canZoomOut = this.zoomIndex > 0;
        const canZoomIn = this.zoomIndex < Game.ZOOM_FACTORS.length - 1;
        const canResetZoom = this.zoomIndex !== 2;
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
            if (playerState === "meets")
                extraClass = " bae_obj_meets";
            else if (playerState === "claimed")
                extraClass = " bae_obj_claimed_by_you";
            // If any player has claimed this objective this round while it remains active,
            // show a distinct claimed-this-round highlight for other players.
            const anyClaimed = obj.active && Object.values(obj.players).some((s) => s === "claimed");
            if (anyClaimed && playerState !== "claimed")
                extraClass += " bae_obj_claimed_round";
            const disabledAttr = obj.active ? "" : "disabled";
            // give each objective an ID so we can attach the BGA tooltip API instead of title attributes
            html += `<button id="bae_obj_${idx}" type="button" class="bae_obj${extraClass}" data-obj-idx="${idx}" ${disabledAttr}>${this.objectiveFaceById(obj.id)}</button>`;
        });
        html += `</div></div>`;
        // Pool group (middle): deck slot first, then pool cards
        html += `<div class="bae_top_group bae_top_pool"><div class="bae_pool">`;
        html += `<button id="bae_pool_slot_deck" type="button" class="bae_card bae_pool_slot bae_pool_deck" data-pool-slot="-1">`;
        html += `${this.cardFaceById(9999)}`;
        html += `<span class="bae_deck_overlay">${_("Deck")}: ${d.deck_count}<br>${_("Discard")}: ${d.discard_count}</span>`;
        html += `</button>`;
        const sortedPool = [...d.pool].sort((a, b) => a.slot - b.slot);
        for (const slot of sortedPool) {
            html += `<button id="bae_pool_slot_${slot.slot}" type="button" class="bae_card bae_pool_slot" data-pool-slot="${slot.slot}">${this.cardFaceById(slot.id)}</button>`;
        }
        html += `</div></div>`;
        // Scoring group (right, 2 columns with centered final row)
        html += `<div class="bae_top_group bae_top_scoring"><div class="bae_scoring">${d.scoring_cards
            .map((id) => `<span class="bae_score_card">${this.scoringFaceById(id)}</span>`)
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
            const animal_card_slots = d.boards[pid]?.reduce((max, loc) => Math.max(max, loc.length + 1), 1) ?? 1;
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
                        html += `<div class="bae_card bae_handcard_hidden">${this.cardFaceById(9999)}</div>`;
                    }
                    else {
                        html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
                    }
                }
            }
            else if (Array.isArray(handInfo)) {
                if (pid === myId) {
                    // Current player's column will be rendered by renderHand() later
                    // leave empty so renderHand can populate interactive buttons
                }
                else {
                    const cnt = handInfo.length;
                    for (let hi = 0; hi < 4; hi++) {
                        if (hi < cnt)
                            html += `<div class="bae_card">${this.cardFaceById(9999)}</div>`;
                        else
                            html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
                    }
                }
            }
            else {
                // no info: show placeholders
                for (let hi = 0; hi < 4; hi++)
                    html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
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
                html += `<div id="bae_sci_shelf_loc_${pid}_${loc}" class="bae_sci_shelf" data-sci-shelf="${loc}">${this.renderScientistDots(pid, d.scientists[pid], loc)}</div>`;
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
        this.bindZoomHandlers();
        this.bindTableHandlers(myId);
    }
    handleLastTurnBanner(playersEndingGame) {
        this.bga.gameArea.removeLastTurnBanner();
        if (playersEndingGame && playersEndingGame.length > 0) {
            const names = playersEndingGame.map((pid) => this.bga.players.getFormattedPlayerName(pid, { replaceByYou: true })).join(", ");
            const message = _('${player_names} triggered the end of game by observing 7 animals at a location. This is the final round!');
            this.bga.gameArea.addLastTurnBanner(message, { player_names: names });
        }
    }
    registerTooltips() {
        // Ensure gameui tooltip API is available
        if (!this.bga || !this.bga.gameui || typeof (this.bga.gameui.addTooltip) !== 'function')
            return;
        const d = this.gamedatas.boardState;
        // Pool slots
        (d.pool || []).forEach((slot) => {
            const id = `bae_pool_slot_${slot.slot}`;
            try {
                this.bga.gameui.removeTooltip(id);
            }
            catch (_) { }
            this.bga.gameui.addTooltip(id, _('Pool card'), _('Click to take this card'));
        });
        try {
            this.bga.gameui.removeTooltip('bae_pool_slot_deck');
        }
        catch (_) { }
        this.bga.gameui.addTooltip('bae_pool_slot_deck', `${_('Deck')}: ${d.deck_count}<br>${_('Discard')}: ${d.discard_count}`, _('Click to draw from deck'));
        // Objectives
        (d.objectives || []).forEach((obj, idx) => {
            const id = `bae_obj_${idx}`;
            try {
                this.bga.gameui.removeTooltip(id);
            }
            catch (_) { }
            const objectiveMat = this.gamedatas.materials.objectives[obj.id];
            const help = `${_('Objective')}: ${objectiveMat?.title ?? obj.id}<br>${objectiveMat?.description ?? ''}`;
            const action = obj.active ? _('Click to claim this objective') : '';
            this.bga.gameui.addTooltip(id, help, action);
        });
        // Camps and scientist shelves: build per-location summaries using
        // gamedatas.boardState.scientists and the scientist name labels.
        const scientistNames = this.gamedatas.materials.scientist_names ?? [];
        const sciByPlayer = d.scientists || {};
        const buildSummary = (sciMap, atIndex) => {
            if (!sciMap)
                return _('No scientists');
            const parts = [];
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
            try {
                this.bga.gameui.removeTooltip(leftId);
            }
            catch (_) { }
            try {
                this.bga.gameui.removeTooltip(rightId);
            }
            catch (_) { }
            const campLeftSummary = buildSummary(sciByPlayer[pid], 3);
            const campRightSummary = buildSummary(sciByPlayer[pid], 4);
            this.bga.gameui.addTooltip(leftId, campLeftSummary, _('Select this camp to start/cancel regroup.'));
            this.bga.gameui.addTooltip(rightId, campRightSummary, _('Select this camp to start/cancel regroup.'));
            for (let loc = 0; loc < 3; loc++) {
                const shelfId = `bae_sci_shelf_loc_${pid}_${loc}`;
                try {
                    this.bga.gameui.removeTooltip(shelfId);
                }
                catch (_) { }
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
                    try {
                        this.bga.gameui.removeTooltip(id);
                    }
                    catch (_) { }
                    const vpEntry = trackVps[loc]?.[i] ?? 0;
                    const help = `${_('Exploration Track')} ${i} · ${vehiclesAtSpace.map(v => vehicleNames[v] ?? `#${v}`).join(', ')} · ${vpEntry} ${_('VP')}`;
                    this.bga.gameui.addTooltip(id, help, '');
                }
            }
        }
    }
    renderTrackColumn(player_id, track, location, flagDepth) {
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
    renderScientistDots(player_id, sci, location) {
        if (!sci)
            return "";
        const meepleFiles = ["YellowMeeple", "PinkMeeple", "TealMeeple"];
        const meepleClasses = ["bae_meeple_yellow", "bae_meeple_pink", "bae_meeple_teal"];
        const baseUrl = this.bga.images.getImgUrl();
        const meeples = [];
        for (let col = 0; col < 3; col++) {
            const poses = sci[col] ?? [];
            const n = poses.filter((p) => p === location).length;
            for (let i = 0; i < n; i++)
                meeples.push(col);
        }
        if (meeples.length === 0)
            return '';
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
        const out = [];
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
    formatScientists(sci) {
        if (!sci)
            return "";
        const parts = [];
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
    imagePath(folder, id) {
        const value = Number(id);
        const safeId = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 9999;
        return `${this.bga.images.getImgUrl()}${folder}/${String(safeId).padStart(4, "0")}.png`;
    }
    imageTag(folder, id, className, alt, extraAttrs = "") {
        const src = this.imagePath(folder, id);
        const safeAlt = alt.replace(/"/g, "&quot;");
        const attrs = extraAttrs ? ` ${extraAttrs}` : "";
        return `<img class="${className}" src="${src}" alt="${safeAlt}" draggable="false"${attrs}/>`;
    }
    cardFaceById(cardId) {
        return this.imageTag("AnimalCards", cardId, "bae_card_img", `${_("Animal card")} #${cardId}`);
    }
    objectiveFaceById(objectiveId) {
        return this.imageTag("ObjectiveCards", objectiveId, "bae_obj_img", `${_("Objective")} #${objectiveId}`);
    }
    scoringFaceById(scoringId) {
        return this.imageTag("ScoringCards", scoringId, "bae_score_img", `${_("Scoring card")} #${scoringId}`);
    }
    playerBoardFaceById(boardId) {
        return this.imageTag("Playerboards", boardId, "bae_board_img", `${_("Player board")} #${boardId}`);
    }
    renderHand(myId) {
        // Prefer the per-player hand column inside the player's board; fallback to the
        // legacy central hand element if it exists.
        let wrap = this.root.querySelector(`#bae_playerboard_${myId} .bae_player_handcol`);
        if (!wrap)
            wrap = this.root.querySelector("#bae_hand");
        if (!wrap)
            return;
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
                if (i < cnt)
                    html += `<div class="bae_card">${this.cardFaceById(9999)}</div>`;
                else
                    html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
            }
        }
        else if (Array.isArray(h)) {
            const HAND_RESERVE = 4;
            for (const c of h) {
                const id = Number(c.id);
                const selObs = !this.campSelected && this.selectedCardId === id ? " bae_card_selected" : "";
                const selRg = (this.campSelected || this.isOpeningMulliganLike()) && this.selectedRegroupIds.has(id) ? " bae_card_regroup" : "";
                html += `<button type="button" class="bae_card bae_handcard${selObs}${selRg}" data-hand-card="${id}">${this.cardFaceById(id)}</button>`;
            }
            for (let i = h.length; i < HAND_RESERVE; i++) {
                html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
            }
        }
        else {
            // No data: fill placeholders
            for (let i = 0; i < 4; i++)
                html += `<div class="bae_card bae_card_placeholder" aria-hidden="true"></div>`;
        }
        wrap.innerHTML = html;
        wrap.querySelectorAll("[data-hand-card]").forEach((el) => {
            el.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const id = Number(ev.currentTarget.dataset.handCard);
                if (!this.bga.players.isCurrentPlayerActive())
                    return;
                if (this.isOpeningMulliganLike()) {
                    if (this.selectedRegroupIds.has(id))
                        this.selectedRegroupIds.delete(id);
                    else
                        this.selectedRegroupIds.add(id);
                }
                else if (this.campSelected) {
                    if (this.selectedRegroupIds.has(id))
                        this.selectedRegroupIds.delete(id);
                    else
                        this.selectedRegroupIds.add(id);
                }
                else if (this.isGameplayLike()) {
                    this.selectedCardId = this.selectedCardId === id ? null : id;
                }
                else {
                    return;
                }
                this.renderAll();
                // Refresh action buttons so the Regroup label/count updates immediately
                this.onUpdateActionButtons(this.currentStateName(), null);
            }, true);
        });
    }
    bindTableHandlers(myId) {
        this.root.querySelectorAll("[data-loc]").forEach((el) => {
            el.addEventListener("click", (ev) => {
                // If the click originated inside a pile slot or pile card image, let
                // that handler handle it instead (we'll attach handlers to those
                // elements below). Avoid preventing default in that case so the
                // other listener runs.
                const target = ev.target;
                if (target && typeof target.closest === 'function' && target.closest('.bae_pile_slot, .bae_pile_card_img'))
                    return;
                ev.preventDefault();
                ev.stopPropagation();
                const pid = Number(el.dataset.playerId);
                if (pid !== myId)
                    return;
                const loc = Number(el.dataset.loc);
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
                    }
                    else {
                        this.selectedLocation = this.selectedLocation === loc ? null : loc;
                        this.renderAll();
                        // Update action row when selecting/deselecting a location
                        this.onUpdateActionButtons(this.currentStateName(), null);
                    }
                }
            }, true);
        });
        // Clicking a pile slot or the card image inside it should act like
        // selecting the containing location. Attach handlers to both slots and
        // images so clicks on either element work.
        this.root.querySelectorAll('.bae_pile_slot, .bae_pile_card_img').forEach((el) => {
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const cur = ev.currentTarget;
                const slotEl = cur.classList.contains('bae_pile_slot') ? cur : cur.closest('.bae_pile_slot');
                if (!slotEl)
                    return;
                const m = slotEl.id.match(/^bae_pile_(\d+)_(\d+)_\d+$/);
                if (!m)
                    return;
                const pid = Number(m[1]);
                const loc = Number(m[2]);
                if (pid !== myId)
                    return;
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
                    }
                    else {
                        this.selectedLocation = this.selectedLocation === loc ? null : loc;
                        this.renderAll();
                        this.onUpdateActionButtons(this.currentStateName(), null);
                    }
                }
            }, true);
        });
        this.root.querySelectorAll("[data-camp-wrap]").forEach((el) => {
            el.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const pid = Number(el.dataset.playerId);
                if (pid !== myId)
                    return;
                if (!this.isGameplayLike() || !this.bga.players.isCurrentPlayerActive())
                    return;
                // Toggle camp selection when clicking the camp again
                if (this.campSelected) {
                    this.clearSelection();
                }
                else {
                    this.enterRegroupMode();
                }
            }, true);
        });
        this.root.querySelectorAll("[data-pool-slot]").forEach((el) => {
            el.addEventListener("click", () => {
                if (!this.bga.players.isCurrentPlayerActive())
                    return;
                if (!this.isReplenishLike())
                    return;
                const slot = Number(el.dataset.poolSlot);
                void this.bga.actions.performAction("actTakeAnimal", { pool_slot: slot });
            });
        });
        this.root.querySelectorAll("[data-obj-idx]").forEach((el) => {
            el.addEventListener("click", () => {
                const idx = Number(el.dataset.objIdx);
                if (!this.bga.players.isCurrentPlayerActive())
                    return;
                // Only allow claiming when this player actually 'meets' the objective
                const obj = this.gamedatas.boardState.objectives?.[idx];
                if (!obj)
                    return;
                const playerState = obj.players?.[myId] ?? 'unmet';
                if (playerState !== 'meets')
                    return;
                // if inside the "promptclaimobjective" state, use that action instead:
                const inGameplay = this.currentStateName().toLowerCase() == 'gameplay';
                const actionName = inGameplay ? "actClaimObjective" : "actClaimPromptObjective";
                void this.bga.actions.performAction(actionName, { objective_index: idx });
            });
        });
    }
    onEnteringState(stateName, _args) {
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.campSelected = false;
        this.selectedRegroupIds.clear();
        const n = stateName.toLowerCase();
        if (n.includes("gameplay") || n.includes("replenish") || n.includes("assign") || n.includes("openingmulligan")) {
            this.renderAll();
        }
    }
    onLeavingState(_stateName) { }
    onUpdateActionButtons(stateName, args) {
        this.bga.statusBar.removeActionButtons();
        if (!this.bga.players.isCurrentPlayerActive())
            return;
        const sn = stateName.toLowerCase();
        if (sn.includes("promptclaimobjective") || sn.includes("prompt_claim_objective")) {
            const myId = Number(this.bga.players.getCurrentPlayerId());
            const promptArgs = args;
            const pending = promptArgs?.pendingByPlayer?.[myId] ?? [];
            if (pending.length === 0)
                return;
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
                if (observeDisabled)
                    return;
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
            const can = args && args.canMulligan;
            console.log("Can mulligan?", can, args);
            this.bga.statusBar.addActionButton(_("Mulligan pool (-1 VP)"), () => {
                void this.bga.actions.performAction("actMulliganPool", {});
            }, {
                disabled: !can,
                tooltip: can ? _("Pay 1 VP to discard all 4 available cards forming the pool and replace them with 4 new ones from the deck before choosing your card.") : _("You can only mulligan once per turn, only if you have at least 1 VP."),
            });
        }
    }
    async notif_observeAnimal(_args) {
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.renderAll();
    }
    async notif_takeAnimal(_args) {
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.renderAll();
    }
    async notif_mulliganPool(_args) {
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.renderAll();
        const pid = Number(_args.player_id ?? _args.playerId ?? 0);
        const ctr = this.bga.playerPanels.getScoreCounter(pid);
        ctr.incValue(-1);
    }
    async notif_mulliganHand(_args) {
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.renderAll();
    }
    async notif_regroup(_args) {
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
    async notif_assignScientists(_args) {
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.renderAll();
    }
    async notif_objectiveClaimed(_args) {
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.renderAll();
    }
    async notif_objectiveScored(_args) {
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.renderAll();
        const pid = Number(_args.player_id ?? _args.playerId ?? 0);
        const score = Number(_args.score ?? 0);
        const ctr = this.bga.playerPanels.getScoreCounter(pid);
        ctr.incValue(score);
    }
    async notif_endOfRound(_args) {
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.renderAll();
    }
    async notif_finalScoring(_args) {
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.renderAll();
    }
    async notif_scoringStep(_args) {
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        // Ensure DOM anchors exist
        this.renderAll();
        const pid = Number(_args.player_id ?? _args.playerId ?? 0);
        const anchorId = String(_args.anchor_id ?? `bae_playerboard_${pid}`);
        let color = String(_args.color ?? (this.gamedatas.players?.[pid]?.color ?? ""));
        if (color.startsWith && color.startsWith('#'))
            color = color.substring(1);
        const amount = Number(_args.amount ?? 0);
        const scoreStr = (amount >= 0 ? '+' : '') + String(amount);
        const duration = typeof _args.duration === 'number' ? _args.duration : 1200;
        const offset_x = typeof _args.offset_x === 'number' ? Number(_args.offset_x) : undefined;
        const offset_y = typeof _args.offset_y === 'number' ? Number(_args.offset_y) : undefined;
        try {
            if (this.bga && this.bga.gameui && typeof this.bga.gameui.displayScoring === 'function') {
                this.bga.gameui.displayScoring(anchorId, color, scoreStr, duration, offset_x ?? null, offset_y ?? null);
            }
        }
        catch (err) {
            console.error('scoringStep display failed', err, _args);
        }
        // Update view after animation starts so player panels and board reflect new totals
        this.renderAll();
        // Update the numeric score counter safely (use incValue for deltas to avoid NaN from strings)
        const ctr = this.bga.playerPanels.getScoreCounter(pid);
        ctr.incValue(amount);
    }
}
Game.BOARD_REFERENCE_WIDTH_PX = 3788;
Game.BOARD_REFERENCE_HEIGHT_PX = 2600;
Game.TOP_ROW_REFERENCE_WIDTH_PX = 6124;
Game.MIN_PLAYAREA_REFERENCE_WIDTH_PX = 3788 + 530 + 20;
Game.MIN_PLAYAREA_REFERENCE_HEIGHT_PX = 2600 + 1200 + 750 + 120 * 4;
Game.ZOOM_FACTORS = [0.75, 0.9, 1, 1.1, 1.25];

export { Game };
