const SPECIES_SVG = ["🐻", "🦊", "🦉", "🦭", "🐧"];
const VEHICLE_SVG = ["🛷", "🎈", "🚤", "🛶", "⛷️"];
const VEHICLE_LABEL = ["S", "Z", "U", "K", "I"];
const SCI_COLOR = ["#d4527e", "#e6a429", "#1fa3a3"];

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
    this.renderAll();
  }

  setupNotifications() {
    this.bga.notifications.setupPromiseNotifications({ prefix: "notif_" });
  }

  private syncGamedatas() {
    this.gamedatas = this.bga.gameui.gamedatas as BorealisArticExpeditionsGamedatas;
  }

  /** Main state name (handles nested private_state in some BGA builds). */
  private currentStateName(): string {
    const gs = this.bga.gameui.gamedatas.gamestate as { name?: string; private_state?: { name?: string } };
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
    const d = this.gamedatas;
    const myId = this.bga.players.getCurrentPlayerId();
    const names: Record<number, string> = {};
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
      html += `<button type="button" class="bae_card bae_pool_slot" data-pool-slot="${slot.slot}" title="${_("Take this card")}">${this.cardFaceById(
        slot.id,
      )}</button>`;
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
        html += `<div class="bae_sci_shelf" data-sci-shelf="${loc}" title="${_("Scientists at this location")}">${this.renderScientistDots(
          d.scientists[pid],
          loc,
        )}</div>`;
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
      html += `<div class="bae_camps${campSel}" data-player-id="${pid}" data-camp-wrap="1" role="button" tabindex="0"><span class="bae_label">${_("Camps")}</span> ${this.formatScientists(
        d.scientists[pid],
      )}</div>`;
      html += `</section>`;
    }

    html += `<section class="bae_handwrap"><h3 class="bae_heading">${_("Your hand")}</h3><div class="bae_hand" id="bae_hand"></div></section>`;
    html += `</div>`;
    this.root.innerHTML = html;
    this.renderHand(myId);
    this.bindTableHandlers(myId);
  }

  private renderTrackColumn(track: TrackUiClient, location: number, flagDepth: number): string {
    const vp = track.vpPerSpace ?? [];
    const veh = track.vehiclesPerLocation?.[location] ?? [];
    const maxIx = Math.max(0, vp.length - 1);
    let h = "";
    for (let spaceIx = 0; spaceIx <= maxIx; spaceIx++) {
      const rowV = vp[spaceIx] ?? 0;
      const list = (veh[spaceIx] as number[] | undefined) ?? [];
      const vehHtml = list.map((v) => `<span class="bae_track_v">${VEHICLE_LABEL[v] ?? "?"}</span>`).join(" ");
      const here = spaceIx === flagDepth ? " bae_track_row_flag" : "";
      h += `<div class="bae_track_row${here}" data-space="${spaceIx}"><span class="bae_track_vp">${rowV}</span><span class="bae_track_veh">${vehHtml}</span></div>`;
    }
    return h;
  }

  private renderScientistDots(sci: Record<number, number[]> | undefined, location: number): string {
    if (!sci) return "";
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

  private getAnimalDef(cardId: number): AnimalCardDefinitionClient | null {
    const cards = this.gamedatas.materials?.animal_cards;
    const cid = Number(cardId);
    if (!cards || Number.isNaN(cid)) return null;
    const def = (cards as Record<number, AnimalCardDefinitionClient>)[cid];
    return def ?? null;
  }

  private cardFaceById(cardId: number, showBonus = false): string {
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

  private renderHand(myId: number) {
    const wrap = this.root.querySelector("#bae_hand");
    if (!wrap) return;
    if (this.bga.players.isCurrentPlayerSpectator()) {
      wrap.innerHTML = `<div class="bae_hidden_count">${_("Spectator view")}</div>`;
      return;
    }
    const d = this.gamedatas;
    const h = d.hands[myId];
    let html = "";
    if (typeof h === "number") {
      html = `<div class="bae_hidden_count">${h} ${_('cards')}</div>`;
    } else if (Array.isArray(h)) {
      for (const c of h) {
        const id = Number(c.id);
        const selObs = !this.campSelected && this.selectedCardId === id ? " bae_card_selected" : "";
        const selRg = this.campSelected && this.selectedRegroupIds.has(id) ? " bae_card_regroup" : "";
        html += `<button type="button" class="bae_card bae_handcard${selObs}${selRg}" data-hand-card="${id}">${this.cardFaceById(id, true)}</button>`;
      }
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
          ev.preventDefault();
          ev.stopPropagation();
          const pid = Number((el as HTMLElement).dataset.playerId);
          if (pid !== myId) return;
          const loc = Number((el as HTMLElement).dataset.loc);
          if (this.isAssignCampLike() && this.bga.players.isCurrentPlayerActive()) {
            void this.bga.actions.performAction("actAssignScientists", { location: loc });
            return;
          }
          if (this.isGameplayLike() && this.bga.players.isCurrentPlayerActive() && !this.campSelected) {
            this.selectedLocation = this.selectedLocation === loc ? null : loc;
            this.renderAll();
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
          this.campSelected = true;
          this.selectedLocation = null;
          this.selectedCardId = null;
          this.renderAll();
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
      this.bga.statusBar.addActionButton(_("Observe (confirm)"), () => {
        if (this.selectedCardId == null || this.selectedLocation == null) return;
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
      const can = args && (args as unknown as ReplenishArgs).canMulligan;
      if (can) {
        this.bga.statusBar.addActionButton(_("Mulligan pool (1 VP)"), () => {
          void this.bga.actions.performAction("actMulliganPool", {});
        });
      }
    }
  }

  notif_observeAnimal(_args: unknown) {
    this.renderAll();
  }
  notif_takeAnimal(_args: unknown) {
    this.renderAll();
  }
  notif_mulliganPool(_args: unknown) {
    this.renderAll();
  }
  notif_regroup(_args: unknown) {
    this.renderAll();
  }
  notif_assignScientists(_args: unknown) {
    this.renderAll();
  }
  notif_objectiveClaimed(_args: unknown) {
    this.renderAll();
  }
  notif_endOfRound(_args: unknown) {
    this.renderAll();
  }
  notif_finalScoring(_args: unknown) {
    this.renderAll();
  }
}
