const SPECIES_SVG = ["🐻", "🦊", "🦉", "🦭", "🐧"];
const VEHICLE_SVG = ["🛷", "🎈", "🚤", "🛶", "⛷️"];
const VEHICLE_LABEL = ["S", "Z", "U", "K", "I"];
const SCI_COLOR = ["#d4527e", "#e6a429", "#1fa3a3"];
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
        this.bga.notifications.setupPromiseNotifications({ prefix: "notif_" });
    }
    syncGamedatas() {
        this.gamedatas = this.bga.gameui.gamedatas;
    }
    /** Main state name (handles nested private_state in some BGA builds). */
    currentStateName() {
        const gs = this.bga.gameui.gamedatas.gamestate;
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
        const d = this.gamedatas;
        const myId = this.bga.players.getCurrentPlayerId();
        const names = {};
        for (const pid of Object.keys(d.players)) {
            const p = d.players[Number(pid)];
            names[Number(pid)] = p.name;
        }
        const locLabels = [_("Left"), _("Middle"), _("Right")];
        const track = d.track ?? { vpPerSpace: [], vehiclesPerLocation: [[], [], []] };
        let html = `<div class="bae_table">`;
        html += `<section class="bae_center"><h3 class="bae_heading">${_("Table")}</h3>`;
        html += `<div class="bae_pool"><span class="bae_label">${_("Pool")}</span>`;
        for (const slot of d.pool) {
            html += `<button type="button" class="bae_card bae_pool_slot" data-pool-slot="${slot.slot}" title="${_("Take this card")}">${this.cardFaceById(slot.id)}</button>`;
        }
        html += `</div>`;
        html += `<div class="bae_meta">${_("Deck")}: ${d.deck_count} · ${_("Discard")}: ${d.discard_count}</div>`;
        html += `<div class="bae_objectives"><span class="bae_label">${_("Objectives")}</span>`;
        d.objectives.forEach((obj, idx) => {
            const st = obj.active ? _("active") : _("inactive");
            html += `<button type="button" class="bae_obj" data-obj-idx="${idx}" ${obj.active ? "" : "disabled"}>#${idx + 1} (${st})</button>`;
        });
        html += `</div>`;
        html += `<div class="bae_scoring"><span class="bae_label">${_("Scoring")}</span> ${d.scoring_cards.map((id) => `#${id}`).join(", ")}</div>`;
        html += `</section>`;
        for (const pidStr of Object.keys(d.players)) {
            const pid = Number(pidStr);
            const isSelf = pid === myId;
            html += `<section class="bae_playerboard" data-player-id="${pid}"><h3 class="bae_heading">${names[pid] ?? pid}</h3>`;
            html += `<div class="bae_columns">`;
            for (let loc = 0; loc < 3; loc++) {
                const sel = isSelf && this.selectedLocation === loc && !this.campSelected ? " bae_loc_selected" : "";
                html += `<div class="bae_col">`;
                html += `<div class="bae_sci_shelf" data-sci-shelf="${loc}" title="${_("Scientists at this location")}">${this.renderScientistDots(d.scientists[pid], loc)}</div>`;
                html += `<div class="bae_location${sel}" data-player-id="${pid}" data-loc="${loc}">`;
                html += `<div class="bae_loc_head"><span class="bae_loc_title">${locLabels[loc]}</span>`;
                html += `<span class="bae_flag_badge" title="${_("Flag depth")}">🚩 ${d.flags[pid]?.[loc] ?? 0}</span></div>`;
                html += `<div class="bae_anim_pile">`;
                const pile = d.boards[pid]?.[loc] ?? [];
                for (const c of pile) {
                    html += `<div class="bae_card bae_onboard">${this.cardFaceById(c.id, true)}</div>`;
                }
                html += `</div></div>`;
                html += `<div class="bae_track" data-track="${loc}" aria-label="${_("Exploration track")}">`;
                html += this.renderTrackColumn(track, loc, d.flags[pid]?.[loc] ?? 0);
                html += `</div>`;
                html += `</div>`;
            }
            html += `</div>`;
            const campSel = isSelf && this.campSelected ? " bae_camp_selected" : "";
            html += `<div class="bae_camps${campSel}" data-player-id="${pid}" data-camp-wrap="1" role="button" tabindex="0"><span class="bae_label">${_("Camps")}</span> ${this.formatScientists(d.scientists[pid])}</div>`;
            html += `</section>`;
        }
        html += `<section class="bae_handwrap"><h3 class="bae_heading">${_("Your hand")}</h3><div class="bae_hand" id="bae_hand"></div></section>`;
        html += `</div>`;
        this.root.innerHTML = html;
        this.renderHand(myId);
        this.bindTableHandlers(myId);
    }
    renderTrackColumn(track, location, flagDepth) {
        const vp = track.vpPerSpace ?? [];
        const veh = track.vehiclesPerLocation?.[location] ?? [];
        const maxIx = Math.max(0, vp.length - 1);
        let h = "";
        for (let spaceIx = 0; spaceIx <= maxIx; spaceIx++) {
            const rowV = vp[spaceIx] ?? 0;
            const list = veh[spaceIx] ?? [];
            const vehHtml = list.map((v) => `<span class="bae_track_v">${VEHICLE_LABEL[v] ?? "?"}</span>`).join(" ");
            const here = spaceIx === flagDepth ? " bae_track_row_flag" : "";
            h += `<div class="bae_track_row${here}" data-space="${spaceIx}"><span class="bae_track_vp">${rowV}</span><span class="bae_track_veh">${vehHtml}</span></div>`;
        }
        return h;
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
    getAnimalDef(cardId) {
        const cards = this.gamedatas.materials?.animal_cards;
        const cid = Number(cardId);
        if (!cards || Number.isNaN(cid))
            return null;
        const def = cards[cid];
        return def ?? null;
    }
    cardFaceById(cardId, showBonus = false) {
        const def = this.getAnimalDef(cardId);
        if (!def) {
            return `<span class="bae_sym">?</span><span class="bae_sym">?</span>`;
        }
        const si = Number(def.species);
        const vi = Number(def.vehicle);
        const s = SPECIES_SVG[si] ?? "?";
        const v = VEHICLE_SVG[vi] ?? "?";
        const bonus = showBonus ? Number(def.bonus_vp ?? 0) : 0;
        const b = bonus ? `<span class="bae_bonus">+${bonus}</span>` : "";
        return `<span class="bae_sym">${s}</span><span class="bae_sym">${v}</span>${b}`;
    }
    renderHand(myId) {
        const wrap = this.root.querySelector("#bae_hand");
        if (!wrap)
            return;
        if (this.bga.players.isCurrentPlayerSpectator()) {
            wrap.innerHTML = `<div class="bae_hidden_count">${_("Spectator view")}</div>`;
            return;
        }
        const d = this.gamedatas;
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
                html += `<button type="button" class="bae_card bae_handcard${selObs}${selRg}" data-hand-card="${id}">${this.cardFaceById(id, true)}</button>`;
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
    notif_observeAnimal(_args) {
        this.renderAll();
    }
    notif_takeAnimal(_args) {
        this.renderAll();
    }
    notif_mulliganPool(_args) {
        this.renderAll();
    }
    notif_regroup(_args) {
        this.renderAll();
    }
    notif_assignScientists(_args) {
        this.renderAll();
    }
    notif_objectiveClaimed(_args) {
        this.renderAll();
    }
    notif_endOfRound(_args) {
        this.renderAll();
    }
    notif_finalScoring(_args) {
        this.renderAll();
    }
}

export { Game };
