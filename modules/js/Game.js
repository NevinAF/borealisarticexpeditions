const SCI_COLOR = ["#ddb162", "#eca6b8", "#7dc7bc"];
class Game {
    constructor(bga) {
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.campSelected = false;
        this.selectedRegroupIds = new Set();
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
        this.renderAll();
    }
    setupNotifications() {
        this.bga.notifications.setupPromiseNotifications({
            prefix: "notif_",
            handlers: [this],
            onStart: (notifName, msg, args) => {
                console.log("Notification started:", notifName, msg, args);
            }
        });
    }
    syncGamedatas() {
        this.gamedatas = this.gamedatas;
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
    renderAll() {
        this.syncGamedatas();
        const d = this.gamedatas.boardState;
        const myId = this.bga.players.getCurrentPlayerId();
        const names = {};
        for (const pid of Object.keys(this.gamedatas.players)) {
            const p = this.gamedatas.players[Number(pid)];
            names[Number(pid)] = p.name;
        }
        const locLabels = [_("Left"), _("Middle"), _("Right")];
        const track = d.track ?? { vpPerSpace: [], vehiclesPerLocation: [[], [], []] };
        let html = `<div class="bae_table">`;
        html += `<div class="bae_toprow">`;
        html += `<section class="bae_center"><h3 class="bae_heading">${_("Table")}</h3>`;
        html += `<div class="bae_label">${_("Pool")}</div>`;
        html += `<div class="bae_pool">`;
        for (const slot of d.pool) {
            html += `<button type="button" class="bae_card bae_pool_slot" data-pool-slot="${slot.slot}" title="${_("Take this card")}">${this.cardFaceById(slot.id)}</button>`;
        }
        html += `</div>`;
        html += `<div class="bae_meta">${_("Deck")}: ${d.deck_count} · ${_("Discard")}: ${d.discard_count}</div>`;
        html += `<div class="bae_label">${_("Objectives")}</div>`;
        html += `<div class="bae_objectives">`;
        d.objectives.forEach((obj, idx) => {
            const st = obj.active ? _("active") : _("inactive");
            html += `<button type="button" class="bae_obj" data-obj-idx="${idx}" title="#${idx + 1} (${st})" ${obj.active ? "" : "disabled"}>${this.objectiveFaceById(obj.id)}</button>`;
        });
        html += `</div>`;
        html += `<div class="bae_label">${_("Scoring")}</div>`;
        html += `<div class="bae_scoring">${d.scoring_cards
            .map((id) => `<span class="bae_score_card">${this.scoringFaceById(id)}</span>`)
            .join("")}</div>`;
        html += `</section>`;
        html += `<section class="bae_handwrap"><h3 class="bae_heading">${_("Your hand")}</h3><div class="bae_hand" id="bae_hand"></div></section>`;
        html += `</div>`;
        // Order: current player first, then others in turn order
        const allPids = Object.keys(this.gamedatas.players).map(Number);
        const currentIdx = allPids.indexOf(myId);
        const orderedPids = currentIdx === -1
            ? allPids
            : [myId, ...allPids.slice(currentIdx + 1), ...allPids.slice(0, currentIdx)];
        for (const pid of orderedPids) {
            const isSelf = pid === myId;
            html += `<section class="bae_playerboard" data-player-id="${pid}"><h3 class="bae_heading">${names[pid] ?? pid}</h3>`;
            const campSel = isSelf && this.campSelected ? " bae_camp_selected" : "";
            const boardBg = this.imagePath("Playerboards", this.getPlayerBoardImageId(pid));
            html += `<div class="bae_board_canvas" style="background-image:url('${boardBg}')">`;
            html += `<div class="bae_camp_zone bae_camp_left${campSel}" data-player-id="${pid}" data-camp-wrap="1" role="button" tabindex="0" title="${_("Left camp")}">`;
            html += `<div class="bae_sci_shelf">${this.renderScientistDots(d.scientists[pid], 3)}</div>`;
            html += `</div>`;
            html += `<div class="bae_camp_zone bae_camp_right${campSel}" data-player-id="${pid}" data-camp-wrap="1" role="button" tabindex="0" title="${_("Right camp")}">`;
            html += `<div class="bae_sci_shelf">${this.renderScientistDots(d.scientists[pid], 4)}</div>`;
            html += `</div>`;
            for (let loc = 0; loc < 3; loc++) {
                const sel = isSelf && this.selectedLocation === loc && !this.campSelected ? " bae_loc_selected" : "";
                const posClass = loc === 0 ? " bae_slot_left" : loc === 1 ? " bae_slot_mid" : " bae_slot_right";
                html += `<div class="bae_location_zone${posClass}${sel}" data-player-id="${pid}" data-loc="${loc}">`;
                // Removed location label
                html += `<div class="bae_sci_shelf" data-sci-shelf="${loc}" title="${_("Scientists at this location")}">${this.renderScientistDots(d.scientists[pid], loc)}</div>`;
                html += `<div class="bae_anim_pile">`;
                const pile = d.boards[pid]?.[loc] ?? [];
                for (let i = 0; i < pile.length; i++) {
                    const c = pile[i];
                    html += this.imageTag("AnimalCards", c.id, "bae_card_img bae_onboard_card", `${_("Animal card")} #${c.id}`, `style="--stack:${i}"`);
                }
                html += `</div>`;
                html += `<div class="bae_track" data-track="${loc}" aria-label="${_("Exploration track")}">`;
                html += this.renderTrackColumn(track, loc, d.flags[pid]?.[loc] ?? 0);
                html += `</div>`;
                html += `</div>`;
            }
            html += `</div>`;
            html += `</section>`;
        }
        html += `</div>`;
        this.root.innerHTML = html;
        this.renderHand(myId);
        this.bindTableHandlers(myId);
    }
    renderTrackColumn(track, location, flagDepth) {
        const vp = track.vpPerSpace ?? [];
        const maxIx = Math.max(0, vp.length - 1);
        const safeDepth = Math.max(0, Math.min(maxIx, flagDepth));
        const ratio = maxIx > 0 ? safeDepth / maxIx : 0;
        return `<div class="bae_track_flag_only" style="top:${(ratio * 100).toFixed(2)}%"></div>`;
    }
    renderScientistDots(sci, location) {
        if (!sci)
            return "";
        let out = "";
        for (let col = 0; col < 3; col++) {
            const poses = sci[col] ?? [];
            const n = poses.filter((p) => p === location).length;
            for (let i = 0; i < n; i++) {
                out += `<span class="bae_meeple" style="background:${SCI_COLOR[col] ?? "#666"}"></span>`;
            }
        }
        return out || `<span class="bae_meeple_empty">—</span>`;
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
    getPlayerBoardImageId(playerId) {
        const player = this.gamedatas.players[playerId];
        const raw = player?.board_id ?? player?.player_board ?? player?.boardId;
        if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
            return raw;
        }
        return 0;
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
        const wrap = this.root.querySelector("#bae_hand");
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
            html = `<div class="bae_hidden_count">${h} ${_('cards')}</div>`;
        }
        else if (Array.isArray(h)) {
            for (const c of h) {
                const id = Number(c.id);
                const selObs = !this.campSelected && this.selectedCardId === id ? " bae_card_selected" : "";
                const selRg = this.campSelected && this.selectedRegroupIds.has(id) ? " bae_card_regroup" : "";
                html += `<button type="button" class="bae_card bae_handcard${selObs}${selRg}" data-hand-card="${id}">${this.cardFaceById(id)}</button>`;
            }
        }
        wrap.innerHTML = html;
        wrap.querySelectorAll("[data-hand-card]").forEach((el) => {
            el.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const id = Number(ev.currentTarget.dataset.handCard);
                if (!this.bga.players.isCurrentPlayerActive())
                    return;
                if (!this.isGameplayLike())
                    return;
                if (this.campSelected) {
                    if (this.selectedRegroupIds.has(id))
                        this.selectedRegroupIds.delete(id);
                    else
                        this.selectedRegroupIds.add(id);
                }
                else {
                    this.selectedCardId = this.selectedCardId === id ? null : id;
                }
                this.renderAll();
            }, true);
        });
    }
    bindTableHandlers(myId) {
        this.root.querySelectorAll("[data-loc]").forEach((el) => {
            el.addEventListener("click", (ev) => {
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
                if (this.isGameplayLike() && this.bga.players.isCurrentPlayerActive() && !this.campSelected) {
                    this.selectedLocation = this.selectedLocation === loc ? null : loc;
                    this.renderAll();
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
                this.campSelected = true;
                this.selectedLocation = null;
                this.selectedCardId = null;
                this.renderAll();
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
                void this.bga.actions.performAction("actClaimObjective", { objective_index: idx });
            });
        });
    }
    onEnteringState(stateName, _args) {
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.campSelected = false;
        this.selectedRegroupIds.clear();
        const n = stateName.toLowerCase();
        if (n.includes("gameplay") || n.includes("replenish") || n.includes("assign")) {
            this.renderAll();
        }
    }
    onLeavingState(_stateName) { }
    onUpdateActionButtons(stateName, args) {
        this.bga.statusBar.removeActionButtons();
        if (!this.bga.players.isCurrentPlayerActive())
            return;
        const sn = stateName.toLowerCase();
        if (sn.includes("gameplay")) {
            this.bga.statusBar.addActionButton(_("Observe (confirm)"), () => {
                if (this.selectedCardId == null || this.selectedLocation == null)
                    return;
                void this.bga.actions.performAction("actObserveAnimal", {
                    card_id: this.selectedCardId,
                    location: this.selectedLocation,
                });
            });
            this.bga.statusBar.addActionButton(_("Regroup (confirm)"), () => {
                const ids = Array.from(this.selectedRegroupIds);
                void this.bga.actions.performAction("actRegroup", {
                    card_ids_json: JSON.stringify(ids),
                });
            });
            this.bga.statusBar.addActionButton(_("Clear selection"), () => {
                this.selectedCardId = null;
                this.selectedLocation = null;
                this.campSelected = false;
                this.selectedRegroupIds.clear();
                this.renderAll();
            });
        }
        if (sn.includes("replenish")) {
            this.bga.statusBar.addActionButton(_("Draw from deck"), () => {
                void this.bga.actions.performAction("actTakeAnimal", { pool_slot: -1 });
            });
            const can = args && args.canMulligan;
            if (can) {
                this.bga.statusBar.addActionButton(_("Mulligan pool (1 VP)"), () => {
                    void this.bga.actions.performAction("actMulliganPool", {});
                });
            }
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
    }
    async notif_regroup(_args) {
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.renderAll();
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
}

export { Game };
