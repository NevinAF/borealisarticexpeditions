// OPTIONAL: Client-side observe legality mirroring BoardModel / actObserveAnimal.
// Happy path: active player selecting a hand card + location that has required scientists.
// Failure modes: missing card def / inactive player / insufficient scientists → treat as illegal (no throw).
const POS_LEFT = 0;
const POS_MID = 1;
const POS_RIGHT = 2;
const POS_CAMP_L = 3;
const POS_CAMP_R = 4;
function colorCountAtLocation(scientists, playerId, location, color) {
    const poses = scientists?.[playerId]?.[color] ?? [];
    return poses.filter((p) => p === location).length;
}
/** True if the animal card's left_move and right_move scientists are present at the location. */
function canObserveAtLocation(def, scientists, playerId, location) {
    if (!def || location < 0 || location > 2)
        return false;
    // Each printed move requires one meeple of that color at the play location.
    const needLeft = def.left_move;
    const needRight = def.right_move;
    if (needLeft === needRight) {
        return colorCountAtLocation(scientists, playerId, location, needLeft) >= 2;
    }
    return (colorCountAtLocation(scientists, playerId, location, needLeft) >= 1
        && colorCountAtLocation(scientists, playerId, location, needRight) >= 1);
}
function missingScientistColors(def, scientists, playerId, location) {
    if (!def)
        return [];
    const missing = [];
    const need = {};
    need[def.left_move] = (need[def.left_move] ?? 0) + 1;
    need[def.right_move] = (need[def.right_move] ?? 0) + 1;
    for (const [colorStr, count] of Object.entries(need)) {
        const color = Number(colorStr);
        const have = colorCountAtLocation(scientists, playerId, location, color);
        for (let i = 0; i < Math.max(0, count - have); i++) {
            missing.push(color);
        }
    }
    return missing;
}
function canObserveAnywhere(def, scientists, playerId) {
    for (let loc = 0; loc < 3; loc++) {
        if (canObserveAtLocation(def, scientists, playerId, loc))
            return true;
    }
    return false;
}
function locationsForCard(def, scientists, playerId) {
    const out = [];
    for (let loc = 0; loc < 3; loc++) {
        if (canObserveAtLocation(def, scientists, playerId, loc))
            out.push(loc);
    }
    return out;
}
function stepFrom(from, dir) {
    if (dir === 'shift_right') {
        if (from === POS_LEFT)
            return POS_MID;
        if (from === POS_MID)
            return POS_RIGHT;
        if (from === POS_RIGHT)
            return POS_CAMP_R;
        return from;
    }
    if (from === POS_RIGHT)
        return POS_MID;
    if (from === POS_MID)
        return POS_LEFT;
    if (from === POS_LEFT)
        return POS_CAMP_L;
    return from;
}
/** Preview destinations for left/right printed moves (does not mutate). */
function previewObserveMoves(scientists, playerId, location, def) {
    const moves = [
        { color: def.left_move, dir: 'shift_left' },
        { color: def.right_move, dir: 'shift_right' },
    ];
    const result = [];
    const used = {};
    for (const m of moves) {
        const poses = scientists[playerId]?.[m.color] ?? [];
        let idx = -1;
        for (let i = 0; i < poses.length; i++) {
            const key = `${m.color}:${i}`;
            if (poses[i] === location && !used[key]) {
                idx = i;
                used[key] = true;
                break;
            }
        }
        if (idx < 0)
            continue;
        result.push({
            color: m.color,
            from: location,
            to: stepFrom(location, m.dir),
        });
    }
    return result;
}
function flagWouldAdvance(def, boardVehicles, currentFlag) {
    if (currentFlag >= 7)
        return false;
    const next = currentFlag + 1;
    const vehiclesOnSpace = boardVehicles[next - 1] ?? [];
    return vehiclesOnSpace.includes(def.vehicle);
}

/** OPTIONAL: lightweight FLIP-style clones for previews and resolutions. */
function animMs(speed) {
    if (speed === 0)
        return 0;
    if (speed === 1)
        return 720;
    if (speed === 3)
        return 360;
    return 560;
}
function rectOf(el) {
    if (!el)
        return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1)
        return null;
    return r;
}
function motionLayer(root) {
    let layer = root.querySelector('.bae_motion_layer');
    if (!layer) {
        layer = document.createElement('div');
        layer.className = 'bae_motion_layer';
        root.appendChild(layer);
    }
    return layer;
}
function clearMotionLayer(root) {
    root.querySelectorAll('.bae_motion_clone, .bae_invalid_bubble').forEach((el) => el.remove());
    document.querySelectorAll('body > .bae_motion_clone, body > .bae_invalid_bubble').forEach((el) => el.remove());
}
function localOffset(root, r) {
    const origin = root.getBoundingClientRect();
    return { left: r.left - origin.left, top: r.top - origin.top };
}
function copySpriteVars(from, to) {
    const cs = getComputedStyle(from);
    for (const name of ['--animal-sprite-url', '--objective-sprite-url', '--scoring-sprite-url', '--bae-scale']) {
        const value = cs.getPropertyValue(name).trim();
        if (value)
            to.style.setProperty(name, value);
    }
}
function stripChrome(el) {
    el.classList.remove('bae_card_selected', 'bae_card_regroup', 'bae_loc_selected', 'bae_dragging');
    el.querySelectorAll('.bae_confirm_blurb, .bae_deck_overlay').forEach((node) => node.remove());
}
function placeClone(source, extraClass, root) {
    const r = source.getBoundingClientRect();
    const { left, top } = localOffset(root, r);
    const clone = source.cloneNode(true);
    const extras = extraClass.split(/\s+/).filter(Boolean);
    clone.classList.add('bae_motion_clone', ...extras);
    clone.removeAttribute('id');
    clone.setAttribute('aria-hidden', 'true');
    stripChrome(clone);
    copySpriteVars(root, clone);
    copySpriteVars(source, clone);
    clone.style.position = 'absolute';
    clone.style.left = `${left}px`;
    clone.style.top = `${top}px`;
    clone.style.width = `${r.width}px`;
    clone.style.height = `${r.height}px`;
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '80';
    clone.style.opacity = '1';
    motionLayer(root).appendChild(clone);
    return clone;
}
/** Fly a clone and leave it parked at the destination until the board re-renders. */
function flyClone(clone, to, durationMs, root, matchSize = false) {
    const from = clone.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    let scale = '';
    if (matchSize && from.width > 1 && from.height > 1) {
        const sx = to.width / from.width;
        const sy = to.height / from.height;
        if (Number.isFinite(sx) && Number.isFinite(sy)) {
            scale = ` scale(${sx}, ${sy})`;
        }
    }
    void clone.offsetWidth;
    clone.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
    clone.style.transformOrigin = 'center center';
    clone.style.transform = `translate(${dx}px, ${dy}px)${scale}`;
    return wait(durationMs).then(() => {
        const parked = localOffset(root, to);
        clone.style.transition = 'none';
        clone.style.transform = '';
        if (matchSize) {
            clone.style.left = `${parked.left}px`;
            clone.style.top = `${parked.top}px`;
            clone.style.width = `${to.width}px`;
            clone.style.height = `${to.height}px`;
        }
        else {
            const now = clone.getBoundingClientRect();
            const baked = localOffset(root, now);
            clone.style.left = `${baked.left}px`;
            clone.style.top = `${baked.top}px`;
        }
    });
}
function wait(ms) {
    if (ms <= 0)
        return Promise.resolve();
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}
/** FLIP remaining siblings after a layout mutation (display:none, etc.). */
function flipElements(els, apply, durationMs) {
    const live = els.filter((el) => el.isConnected);
    if (live.length === 0) {
        apply();
        return Promise.resolve();
    }
    const first = live.map((el) => el.getBoundingClientRect());
    apply();
    const plays = live.map((el, i) => {
        const last = el.getBoundingClientRect();
        const dx = first[i].left - last.left;
        const dy = first[i].top - last.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1)
            return Promise.resolve();
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        void el.offsetWidth;
        el.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
        el.style.transform = 'translate(0, 0)';
        return wait(durationMs).then(() => {
            el.style.transition = '';
            el.style.transform = '';
        });
    });
    return Promise.all(plays).then(() => undefined);
}
/** Looping ghost that travels from source rect toward dest rect. */
function startTrail(source, dest, durationMs, root, extraClass = '') {
    return startTrailToRect(source, dest.getBoundingClientRect(), durationMs, root, extraClass);
}
/** Leave a faded scientist in place and loop an opaque copy toward the destination. */
function startScientistTrail(source, dest, durationMs, root) {
    return startScientistTrailToRect(source, dest.getBoundingClientRect(), durationMs, root);
}
function startScientistTrailToRect(source, to, durationMs, root) {
    source.classList.add('bae_preview_fade_left');
    return startTrailToRect(source, to, durationMs, root, 'bae_sci_mover');
}
function startTrailToRect(source, to, durationMs, root, extraClass = '') {
    const from = source.getBoundingClientRect();
    const { left, top } = localOffset(root, from);
    const clone = source.cloneNode(true);
    clone.classList.add('bae_motion_clone', 'bae_trail_ghost', ...extraClass.split(/\s+/).filter(Boolean));
    clone.removeAttribute('id');
    clone.setAttribute('aria-hidden', 'true');
    stripChrome(clone);
    copySpriteVars(root, clone);
    clone.classList.remove('bae_preview_fade_left');
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    clone.style.position = 'absolute';
    clone.style.left = `${left}px`;
    clone.style.top = `${top}px`;
    clone.style.width = `${from.width}px`;
    clone.style.height = `${from.height}px`;
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '70';
    clone.style.setProperty('--dx', `${dx}px`);
    clone.style.setProperty('--dy', `${dy}px`);
    clone.style.setProperty('--dur', `${Math.max(900, durationMs * 3)}ms`);
    motionLayer(root).appendChild(clone);
    return clone;
}
/** Static clone parked at a destination (card placement preview). */
function placeCloneAt(source, extraClass, root, at) {
    const clone = placeClone(source, extraClass, root);
    const parked = localOffset(root, at);
    clone.style.left = `${parked.left}px`;
    clone.style.top = `${parked.top}px`;
    clone.style.width = `${at.width}px`;
    clone.style.height = `${at.height}px`;
    return clone;
}
/** Soft, slow discard preview: ghost only, real card stays put. */
function startDiscardGhost(source, root, cardId) {
    const clone = placeClone(source, 'bae_discard_ghost', root);
    clone.style.setProperty('--dur', '1.85s');
    clone.style.setProperty('--dx', '-10px');
    if (cardId != null)
        clone.dataset.previewCard = String(cardId);
    return clone;
}

const SPECIES_COUNT = 5;
const VEHICLE_COUNT = 5;
const SPECIES_SET_VP = [0, 0, 1, 3, 6, 10, 15, 21];
function animalDef(materials, cardId) {
    const raw = materials.animal_cards;
    if (Array.isArray(raw))
        return raw[cardId];
    return raw?.[cardId];
}
function cardIdOf(c) {
    return typeof c === 'number' ? c : Number(c.id);
}
function pilesFor(boards, playerId) {
    return boards[playerId] ?? [[], [], []];
}
function sciCountAt(sci, location) {
    if (!sci)
        return 0;
    let n = 0;
    for (let c = 0; c < 3; c++) {
        n += (sci[c] ?? []).filter((p) => p === location).length;
    }
    return n;
}
function campCount(sci) {
    return sciCountAt(sci, POS_CAMP_L) + sciCountAt(sci, POS_CAMP_R);
}
function speciesCounts(piles, materials) {
    const counts = Array(SPECIES_COUNT).fill(0);
    for (const pile of piles) {
        for (const c of pile) {
            const def = animalDef(materials, cardIdOf(c));
            if (def)
                counts[def.species]++;
        }
    }
    return counts;
}
function vehicleCounts(piles, materials) {
    const counts = Array(VEHICLE_COUNT).fill(0);
    for (const pile of piles) {
        for (const c of pile) {
            const def = animalDef(materials, cardIdOf(c));
            if (def)
                counts[def.vehicle]++;
        }
    }
    return counts;
}
/** { count, required } progress toward an objective. */
function objectiveProgress(objectiveId, playerId, state, materials) {
    const piles = pilesFor(state.boards, playerId);
    const sci = state.scientists?.[playerId];
    const flags = state.flags?.[playerId] ?? [0, 0, 0];
    switch (objectiveId) {
        case 0: { // Specialists' Retreat: all 3 of one color in camps
            let best = 0;
            for (let c = 0; c < 3; c++) {
                const poses = sci?.[c] ?? [];
                const inCamp = poses.filter((p) => p === POS_CAMP_L || p === POS_CAMP_R).length;
                best = Math.max(best, inCamp);
            }
            return { count: best, required: 3 };
        }
        case 1: { // Comparing Notes: 3 in a single camp
            return { count: Math.max(sciCountAt(sci, POS_CAMP_L), sciCountAt(sci, POS_CAMP_R)), required: 3 };
        }
        case 2: { // Morning Shift: 5 returned last regroup, else current camp count
            const last = Number((state.last_returned_counts ?? {})[playerId] ?? 0);
            const current = campCount(sci);
            return { count: last >= 5 ? last : current, required: 5 };
        }
        case 3: { // Splitting Up: max 2 per location (3 locations ok)
            let ok = 0;
            for (let loc = 0; loc < 3; loc++) {
                if (sciCountAt(sci, loc) <= 2)
                    ok++;
            }
            return { count: ok, required: 3 };
        }
        case 4: { // Balanced Ecosystem: 3 animals each location
            const min = Math.min(...[0, 1, 2].map((l) => piles[l]?.length ?? 0));
            return { count: min, required: 3 };
        }
        case 5: { // Richness of Nature: 6 in one location
            const max = Math.max(0, ...[0, 1, 2].map((l) => piles[l]?.length ?? 0));
            return { count: max, required: 6 };
        }
        case 6: { // Spotting List: 5 species
            const n = speciesCounts(piles, materials).filter((n) => n > 0).length;
            return { count: n, required: 5 };
        }
        case 7: { // Favorite Research: 6 of one species
            return { count: Math.max(0, ...speciesCounts(piles, materials)), required: 6 };
        }
        case 8: { // Organized Expedition: 4 identical vehicles
            return { count: Math.max(0, ...vehicleCounts(piles, materials)), required: 4 };
        }
        case 9: { // Climbing the Area: all flags >= 2
            const n = [0, 1, 2].filter((l) => Number(flags[l] ?? 0) >= 2).length;
            return { count: n, required: 3 };
        }
        case 10: { // Bold Explorers: a flag at 5
            return { count: Math.max(0, Number(flags[0] ?? 0), Number(flags[1] ?? 0), Number(flags[2] ?? 0)), required: 5 };
        }
        case 11: { // Promising Direction: 4 ahead of another
            const vals = [0, 1, 2].map((l) => Number(flags[l] ?? 0));
            let best = 0;
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    if (i !== j)
                        best = Math.max(best, vals[i] - vals[j]);
                }
            }
            return { count: best, required: 4 };
        }
        default:
            return { count: 0, required: 1 };
    }
}
function scoreScoringCard(scoringId, playerId, state, materials) {
    const piles = pilesFor(state.boards, playerId);
    const sci = state.scientists?.[playerId];
    const flags = state.flags?.[playerId] ?? [0, 0, 0];
    switch (scoringId) {
        case 0: { // Common Destination
            const a = Number(flags[0] ?? 0);
            const b = Number(flags[1] ?? 0);
            const c = Number(flags[2] ?? 0);
            if (a === b && b === c)
                return 12;
            if (a === b || a === c || b === c)
                return 5;
            return 0;
        }
        case 1: { // Expansive Species
            const maxDepth = Math.min(piles[0]?.length ?? 0, piles[1]?.length ?? 0, piles[2]?.length ?? 0);
            let vp = 0;
            for (let d = 0; d < maxDepth; d++) {
                const ls = animalDef(materials, cardIdOf(piles[0][d]))?.species;
                const ms = animalDef(materials, cardIdOf(piles[1][d]))?.species;
                const rs = animalDef(materials, cardIdOf(piles[2][d]))?.species;
                if (ls != null && ls === ms && ms === rs)
                    vp += 5;
            }
            return vp;
        }
        case 2: { // Farewell Party
            const counts = [sciCountAt(sci, 0), sciCountAt(sci, 1), sciCountAt(sci, 2)];
            return Math.max(...counts) * 2;
        }
        case 3: { // Interspecies
            let vp = 0;
            for (const pile of piles) {
                const sp = new Set();
                for (const c of pile) {
                    const def = animalDef(materials, cardIdOf(c));
                    if (def)
                        sp.add(def.species);
                }
                if (sp.size === 2)
                    vp += 3;
            }
            return vp;
        }
        case 4: { // Mating Season
            let vp = 0;
            for (const pile of piles) {
                const seq = pile.map((c) => animalDef(materials, cardIdOf(c))?.species ?? -1);
                let i = 0;
                while (i < seq.length) {
                    let j = i + 1;
                    while (j < seq.length && seq[j] === seq[i])
                        j++;
                    if (j - i === 2)
                        vp += 2;
                    i = j;
                }
            }
            return vp;
        }
        case 5: { // Outer Lands
            const counts = [piles[0]?.length ?? 0, piles[1]?.length ?? 0, piles[2]?.length ?? 0];
            let vp = 0;
            if (counts[0] > counts[1])
                vp += 7;
            if (counts[2] > counts[1])
                vp += 7;
            return vp;
        }
        case 6: { // Popular Vehicle
            return Math.max(0, ...vehicleCounts(piles, materials)) * 2;
        }
        case 7: { // Safe Return
            return campCount(sci) * 3;
        }
        case 8: { // Untrodden Path
            const vpTrack = materials.track_space_vp ?? [];
            const values = [0, 1, 2].map((loc) => (vpTrack[loc] ?? [])[Number(flags[loc] ?? 0)] ?? 0);
            return Math.min(...values) * 2;
        }
        case 9: { // Territorial Animals
            let vp = 0;
            for (const pile of piles) {
                let ok = true;
                let prev = null;
                for (const c of pile) {
                    const sp = animalDef(materials, cardIdOf(c))?.species;
                    if (sp == null)
                        continue;
                    if (prev !== null && prev === sp) {
                        ok = false;
                        break;
                    }
                    prev = sp;
                }
                if (ok)
                    vp += 6;
            }
            return vp;
        }
        default:
            return 0;
    }
}
function locationSetVp(pile, materials) {
    const by = Array(SPECIES_COUNT).fill(0);
    for (const c of pile) {
        const def = animalDef(materials, cardIdOf(c));
        if (def)
            by[def.species]++;
    }
    let vp = 0;
    for (const cnt of by) {
        if (cnt > 0)
            vp += SPECIES_SET_VP[Math.min(cnt, SPECIES_SET_VP.length - 1)] ?? 0;
    }
    return vp;
}
function flagTrackVp(playerId, state, materials) {
    const flags = state.flags?.[playerId] ?? [0, 0, 0];
    const vpTrack = materials.track_space_vp ?? [];
    let vp = 0;
    for (let loc = 0; loc < 3; loc++) {
        vp += (vpTrack[loc] ?? [])[Number(flags[loc] ?? 0)] ?? 0;
    }
    return vp;
}
function animalBonusVp(playerId, state, materials) {
    let vp = 0;
    for (const pile of pilesFor(state.boards, playerId)) {
        for (const c of pile) {
            vp += animalDef(materials, cardIdOf(c))?.bonus_vp ?? 0;
        }
    }
    return vp;
}

/** OPTIONAL preference ids (gamepreferences.jsonc). */
const PREF_ANIM_SPEED = 100;
const PREF_PREVIEWS = 101;
const PREF_CONFIRM = 102;
const PREF_SOUND = 103;
/**
 * OPTIONAL: Client-only UX (subtle previews, resolution motion, invalid-action hints, DnD, sound, stats).
 * Never mutates server state. Server remains source of truth.
 */
class OptionalUi {
    constructor(host) {
        this.host = host;
        this.dragCardId = null;
        this.cleanupFns = [];
        this.audioCtx = null;
        this.prefBound = false;
        this.resolving = false;
        this.holdingPid = null;
        this.discardGhosts = new Map();
    }
    afterRender() {
        this.teardown();
        if (!this.host.root)
            return;
        this.applyPreferenceCss();
        this.renderRoundBadge();
        this.bindDragAndDrop();
        this.renderRegroupHold();
        this.updateActionPreviews();
        this.bindPreferenceListener();
    }
    teardown() {
        for (const fn of this.cleanupFns) {
            try {
                fn();
            }
            catch (_) { /* ignore */ }
        }
        this.cleanupFns = [];
        this.clearPreviews();
    }
    onSelectionChanged() {
        if (this.host.campSelected || this.host.isOpeningMulliganLike()) {
            const myId = Number(this.host.bga.players.getCurrentPlayerId());
            if (this.host.selectedRegroupIds.size === 0)
                this.clearDiscardGhosts();
            else
                this.syncDiscardGhosts(myId);
            return;
        }
        this.updateActionPreviews();
    }
    isObserveSelectionLegal() {
        const cardId = this.host.selectedCardId;
        const location = this.host.selectedLocation;
        if (cardId == null || location == null || this.host.campSelected)
            return false;
        const myId = Number(this.host.bga.players.getCurrentPlayerId());
        return canObserveAtLocation(this.host.animalDef(cardId), this.host.gamedatas.boardState.scientists, myId, location);
    }
    /** Call when the client can tell Observe would be illegal. */
    showInvalidObserveHint() {
        this.renderInvalidBubble(_('This location does not have the scientists required.'));
    }
    playSound(kind) {
        if (this.host.bga.userPreferences?.get(PREF_SOUND) === 0)
            return;
        try {
            if (!this.audioCtx)
                this.audioCtx = new AudioContext();
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
            }
            else if (kind === 'success') {
                osc.frequency.value = 660;
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
                osc.start(now);
                osc.stop(now + 0.2);
            }
            else {
                osc.frequency.value = 880;
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.start(now);
                osc.stop(now + 0.28);
            }
        }
        catch (_) {
            // AudioContext blocked — silent.
        }
    }
    animSpeedClass() {
        const v = this.host.bga.userPreferences?.get(PREF_ANIM_SPEED) ?? 2;
        return ['bae_anim_off', 'bae_anim_slow', 'bae_anim_normal', 'bae_anim_fast'][v] ?? 'bae_anim_normal';
    }
    previewsEnabled() {
        return (this.host.bga.userPreferences?.get(PREF_PREVIEWS) ?? 1) === 1
            && (this.host.bga.userPreferences?.get(PREF_ANIM_SPEED) ?? 2) !== 0;
    }
    shouldSkipSafeConfirm() {
        return (this.host.bga.userPreferences?.get(PREF_CONFIRM) ?? 1) === 0;
    }
    clearHolding() {
        this.holdingPid = null;
    }
    duration() {
        return animMs(this.host.bga.userPreferences?.get(PREF_ANIM_SPEED) ?? 2);
    }
    prepareResolution() {
        this.clearPreviews();
        this.host.selectedCardId = null;
        this.host.selectedLocation = null;
        this.host.selectedPoolSlot = null;
        this.host.campSelected = false;
        this.host.selectedRegroupIds.clear();
        this.host.root.querySelectorAll('.bae_card_selected, .bae_card_regroup').forEach((el) => {
            el.classList.remove('bae_card_selected', 'bae_card_regroup');
        });
        this.host.root.querySelectorAll('.bae_loc_selected').forEach((el) => el.classList.remove('bae_loc_selected'));
        this.host.root.querySelectorAll('.bae_confirm_blurb').forEach((el) => el.remove());
    }
    endResolution() {
        this.resolving = false;
    }
    async playObserveResolution(prev, args) {
        const ms = this.duration();
        if (ms === 0 || this.resolving)
            return;
        this.resolving = true;
        this.prepareResolution();
        try {
            const pid = Number(args.player_id ?? args.playerId ?? 0);
            const cardId = Number(args.card_id ?? NaN);
            const loc = Number(args.location ?? NaN);
            if (!Number.isFinite(pid) || !Number.isFinite(cardId) || loc < 0 || loc > 2)
                return;
            const root = this.host.root;
            const cardEl = this.cardEl(pid, cardId);
            const pileRect = this.nextPileRect(pid, loc);
            const slots = this.handSlotRects(pid);
            const remaining = this.handCards(pid).filter((el) => el !== cardEl);
            if (cardEl && pileRect) {
                const clone = placeClone(cardEl, 'bae_resolve_clone bae_resolve_card', root);
                cardEl.style.visibility = 'hidden';
                await Promise.all([
                    flyClone(clone, pileRect, ms, root, true),
                    this.compactHandToSlots(remaining, slots, ms),
                ]);
            }
            else {
                await this.compactHandToSlots(remaining, slots, ms);
            }
            const def = this.host.animalDef(cardId);
            if (def) {
                const moves = previewObserveMoves(prev.scientists, pid, loc, def);
                const used = new Set();
                await Promise.all(moves.map((m) => {
                    const src = this.meepleAt(pid, m.from, m.color, used);
                    const destShelf = this.shelfEl(pid, m.to);
                    if (!src || !destShelf)
                        return Promise.resolve();
                    const clone = placeClone(src, 'bae_resolve_clone', root);
                    src.style.visibility = 'hidden';
                    return flyClone(clone, destShelf.getBoundingClientRect(), ms, root);
                }));
            }
            const nextState = args.boardState;
            const oldFlag = Number(prev.flags?.[pid]?.[loc] ?? 0);
            const newFlag = Number(nextState?.flags?.[pid]?.[loc] ?? oldFlag);
            const flagEl = this.flagEl(pid, loc, oldFlag);
            if (flagEl) {
                if (newFlag > oldFlag) {
                    const dest = this.trackEl(pid, loc, newFlag);
                    const clone = placeClone(flagEl, 'bae_resolve_clone', root);
                    flagEl.style.visibility = 'hidden';
                    if (dest)
                        await flyClone(clone, dest.getBoundingClientRect(), Math.round(ms * 0.9), root);
                }
                else {
                    placeClone(flagEl, 'bae_resolve_clone bae_stuck_once', root);
                    await wait(Math.round(ms * 0.85));
                }
            }
        }
        finally {
            this.endResolution();
        }
    }
    async playRegroupResolution(prev, args) {
        const ms = this.duration();
        const pid = Number(args.player_id ?? args.playerId ?? 0);
        const campMeeples = this.campMeeples(pid);
        if (campMeeples.length > 0)
            this.holdingPid = pid;
        if (ms === 0 || this.resolving)
            return;
        this.resolving = true;
        this.prepareResolution();
        try {
            const discarded = args.discarded ?? [];
            await this.animateHandReplace(pid, discarded, prev, args.boardState, ms);
            const linger = this.ensureRegroupHold(pid);
            const lingerRect = linger?.getBoundingClientRect() ?? this.lingerRect(pid);
            if (lingerRect) {
                await Promise.all(campMeeples.map((el) => {
                    const clone = placeClone(el, 'bae_resolve_clone', this.host.root);
                    el.style.visibility = 'hidden';
                    return flyClone(clone, lingerRect, ms, this.host.root);
                }));
            }
        }
        finally {
            this.endResolution();
        }
    }
    async playAssignResolution(_prev, args) {
        const ms = this.duration();
        const pid = Number(args.player_id ?? args.playerId ?? 0);
        const loc = Number(args.location ?? NaN);
        if (ms === 0 || this.resolving) {
            this.holdingPid = null;
            return;
        }
        this.resolving = true;
        this.prepareResolution();
        try {
            if (loc < 0 || loc > 2)
                return;
            const dest = this.shelfEl(pid, loc);
            if (!dest)
                return;
            const destRect = dest.getBoundingClientRect();
            const sources = this.holdMeeples(pid);
            const from = sources.length > 0 ? sources : this.campMeeples(pid);
            await Promise.all(from.map((el) => {
                const clone = placeClone(el, 'bae_resolve_clone', this.host.root);
                el.style.visibility = 'hidden';
                return flyClone(clone, destRect, ms, this.host.root);
            }));
        }
        finally {
            this.holdingPid = null;
            this.endResolution();
        }
    }
    async playTakeResolution(_prev, args) {
        const ms = this.duration();
        if (ms === 0 || this.resolving)
            return;
        this.resolving = true;
        this.prepareResolution();
        try {
            const pid = Number(args.player_id ?? args.playerId ?? 0);
            const fromDeck = Boolean(args.from_deck);
            const slot = Number(args.pool_slot ?? args.slot ?? NaN);
            const src = (!fromDeck && Number.isFinite(slot) && slot >= 0)
                ? this.host.root.querySelector(`#bae_pool_slot_${slot}`)
                : this.deckEl();
            const destRect = this.handSlotRects(pid)[this.handCards(pid).length]
                ?? this.handDestEl(pid)?.getBoundingClientRect()
                ?? null;
            const deck = this.deckEl();
            if (!src || !destRect || !pid)
                return;
            const root = this.host.root;
            const hole = src.getBoundingClientRect();
            const faceId = fromDeck
                ? this.drawnHandCardIds(pid, [], _prev, args.boardState)[0]
                : undefined;
            const clone = this.cloneForHandDraw(src, faceId);
            if (!fromDeck)
                src.style.visibility = 'hidden';
            await flyClone(clone, destRect, ms, root, true);
            if (fromDeck)
                return;
            await wait(Math.round(ms * 0.2));
            if (deck) {
                const refill = placeClone(deck, 'bae_resolve_clone bae_resolve_card', root);
                await flyClone(refill, hole, ms, root, true);
            }
        }
        finally {
            this.endResolution();
        }
    }
    async playMulliganPoolResolution(_prev, _args) {
        const ms = this.duration();
        if (ms === 0 || this.resolving)
            return;
        this.resolving = true;
        this.prepareResolution();
        try {
            const root = this.host.root;
            const deck = this.deckEl();
            const cards = this.poolCards();
            const dests = cards.map((el) => el.getBoundingClientRect());
            if (!deck)
                return;
            await Promise.all(cards.map((el) => {
                const clone = placeClone(el, 'bae_resolve_clone bae_resolve_card', root);
                el.style.visibility = 'hidden';
                return flyClone(clone, deck.getBoundingClientRect(), ms, root, true);
            }));
            await wait(Math.round(ms * 0.15));
            for (let i = 0; i < dests.length; i++) {
                const refill = placeClone(deck, 'bae_resolve_clone bae_resolve_card', root);
                await flyClone(refill, dests[i], ms, root, true);
            }
        }
        finally {
            this.endResolution();
        }
    }
    async playMulliganHandResolution(prev, args) {
        const ms = this.duration();
        if (ms === 0 || this.resolving)
            return;
        this.resolving = true;
        this.prepareResolution();
        try {
            const pid = Number(args.player_id ?? args.playerId ?? 0);
            const discarded = args.discarded ?? [];
            await this.animateHandReplace(pid, discarded, prev, args.boardState, ms);
        }
        finally {
            this.endResolution();
        }
    }
    showEndGameStats() {
        const existing = document.getElementById('bae_stats_panel');
        if (existing)
            existing.remove();
        const d = this.host.gamedatas.boardState;
        const materials = this.host.gamedatas.materials;
        const names = this.host.gamedatas.players;
        const locNames = materials.location_names ?? [_('Left'), _('Middle'), _('Right')];
        const speciesNames = materials.species_names ?? [];
        const blocks = [];
        blocks.push(`<p class="bae_stats_meta">${_('Rounds played')}: ${d.round ?? '?'}</p>`);
        for (const pidStr of Object.keys(names)) {
            const pid = Number(pidStr);
            const claimed = (d.objectives ?? []).filter((o) => o.players[pid] === 'claimed').length;
            const flags = d.flags?.[pid] ?? [0, 0, 0];
            const deepest = Math.max(0, Number(flags[0] ?? 0), Number(flags[1] ?? 0), Number(flags[2] ?? 0));
            const movement = [0, 1, 2].reduce((sum, loc) => sum + Number(flags[loc] ?? 0), 0);
            const piles = d.boards?.[pid] ?? [[], [], []];
            const setVp = [0, 1, 2].reduce((sum, loc) => sum + locationSetVp(piles[loc] ?? [], materials), 0);
            const scoringVp = (d.scoring_cards ?? []).reduce((sum, sid) => sum + scoreScoringCard(sid, pid, d, materials), 0);
            const animals = [0, 1, 2].map((loc) => `${locNames[loc] ?? loc} ${piles[loc]?.length ?? 0}`).join(' · ');
            const bySpecies = speciesCounts(piles, materials)
                .map((n, i) => n > 0 ? `${speciesNames[i] ?? i} ${n}` : '')
                .filter(Boolean)
                .join(', ');
            const rawVp = d.vps?.[pid]
                ?? d.vps?.[pidStr];
            const score = Number(rawVp?.score ?? rawVp ?? names[pid]?.score ?? 0);
            blocks.push(`<section class="bae_stats_player">`
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
                + `</ul></section>`);
        }
        const panel = document.createElement('div');
        panel.id = 'bae_stats_panel';
        panel.className = 'bae_stats_panel';
        panel.innerHTML = `<h3>${_('Game statistics')}</h3>${blocks.join('')}`
            + `<button type="button" class="bae_stats_close">${_('Close')}</button>`;
        panel.querySelector('.bae_stats_close')?.addEventListener('click', () => panel.remove());
        this.host.root.appendChild(panel);
    }
    escape(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    applyPreferenceCss() {
        const root = this.host.root;
        root.classList.remove('bae_anim_off', 'bae_anim_slow', 'bae_anim_normal', 'bae_anim_fast', 'bae_previews_off', 'bae_previews_on', 'bae_sound_off', 'bae_sound_on');
        root.classList.add(this.animSpeedClass());
        root.classList.add(this.previewsEnabled() ? 'bae_previews_on' : 'bae_previews_off');
        root.classList.add((this.host.bga.userPreferences?.get(PREF_SOUND) ?? 1) === 1 ? 'bae_sound_on' : 'bae_sound_off');
    }
    bindPreferenceListener() {
        if (this.prefBound)
            return;
        this.prefBound = true;
        const prev = this.host.bga.userPreferences.onChange;
        this.host.bga.userPreferences.onChange = (prefId, value) => {
            prev?.(prefId, value);
            this.applyPreferenceCss();
            this.updateActionPreviews();
        };
    }
    renderRoundBadge() {
        const round = this.host.gamedatas.boardState.round ?? 1;
        let badge = this.host.root.querySelector('.bae_round_badge');
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
    clearPreviews() {
        this.clearDiscardGhosts();
        this.clearTransientPreviews();
        clearMotionLayer(this.host.root);
        document.querySelectorAll('.bae_motion_clone, .bae_invalid_bubble').forEach((el) => el.remove());
    }
    clearTransientPreviews() {
        if (!this.host.root)
            return;
        this.host.root.querySelectorAll('.bae_motion_clone:not(.bae_discard_ghost), .bae_invalid_bubble').forEach((el) => el.remove());
        document.querySelectorAll('body > .bae_motion_clone:not(.bae_discard_ghost), body > .bae_invalid_bubble').forEach((el) => el.remove());
        this.host.root.querySelectorAll('.bae_preview_fade_left').forEach((el) => el.classList.remove('bae_preview_fade_left'));
    }
    clearDiscardGhosts() {
        this.discardGhosts.forEach((el) => el.remove());
        this.discardGhosts.clear();
        this.host.root?.querySelectorAll('.bae_discard_ghost').forEach((el) => el.remove());
    }
    updateActionPreviews() {
        this.clearTransientPreviews();
        if (this.resolving)
            return;
        const myId = Number(this.host.bga.players.getCurrentPlayerId());
        const active = this.host.bga.players.isCurrentPlayerActive();
        if (active
            && this.host.isGameplayLike()
            && this.host.selectedCardId != null
            && this.host.selectedLocation != null
            && !this.host.campSelected
            && !this.isObserveSelectionLegal()) {
            this.showInvalidObserveHint();
        }
        const selectingDiscards = this.host.campSelected || this.host.isOpeningMulliganLike();
        if (!selectingDiscards || this.host.selectedRegroupIds.size === 0) {
            this.clearDiscardGhosts();
        }
        if (!this.previewsEnabled() || !active) {
            if (selectingDiscards)
                this.syncDiscardGhosts(myId);
            return;
        }
        if (this.host.isGameplayLike()
            && this.host.selectedCardId != null
            && this.host.selectedLocation != null
            && !this.host.campSelected) {
            this.previewCardPlacement(myId, this.host.selectedCardId, this.host.selectedLocation);
            if (this.isObserveSelectionLegal()) {
                this.previewObserve(myId, this.host.selectedCardId, this.host.selectedLocation);
            }
        }
        if (this.host.isAssignCampLike() && this.host.selectedLocation != null) {
            this.previewAssign(myId, this.host.selectedLocation);
        }
        if (this.host.campSelected) {
            this.previewRegroupPickup(myId);
        }
        if (selectingDiscards)
            this.syncDiscardGhosts(myId);
    }
    syncDiscardGhosts(pid) {
        if (!this.previewsEnabled())
            return;
        const wanted = this.host.selectedRegroupIds;
        this.discardGhosts.forEach((el, cardId) => {
            if (!el.isConnected || !wanted.has(cardId)) {
                el.remove();
                this.discardGhosts.delete(cardId);
            }
        });
        if (wanted.size === 0)
            return;
        wanted.forEach((cardId) => {
            if (this.discardGhosts.has(cardId))
                return;
            const el = this.cardEl(pid, cardId);
            if (el)
                this.discardGhosts.set(cardId, startDiscardGhost(el, this.host.root, cardId));
        });
    }
    previewObserve(pid, cardId, loc) {
        const def = this.host.animalDef(cardId);
        if (!def)
            return;
        const ms = Math.max(700, this.duration() * 3);
        const used = new Set();
        for (const m of previewObserveMoves(this.host.gamedatas.boardState.scientists, pid, loc, def)) {
            const src = this.meepleAt(pid, m.from, m.color, used);
            const dest = this.shelfEl(pid, m.to);
            if (src && dest)
                startScientistTrail(src, dest, ms, this.host.root);
        }
        const flagDepth = Number(this.host.gamedatas.boardState.flags?.[pid]?.[loc] ?? 0);
        const boardId = this.host.gamedatas.boardState.board_for_players?.[pid] ?? 0;
        const board = this.host.gamedatas.materials.player_boards?.[boardId];
        const locKey = ['left_location', 'mid_location', 'right_location'][loc];
        const vehicles = board?.[locKey] ?? [];
        const flag = this.flagEl(pid, loc, flagDepth);
        if (!flag)
            return;
        if (flagWouldAdvance(def, vehicles, flagDepth)) {
            const dest = this.trackEl(pid, loc, Math.min(7, flagDepth + 1));
            if (dest)
                startTrail(flag, dest, ms, this.host.root);
        }
        else {
            const clone = placeClone(flag, 'bae_trail_ghost bae_trail_stuck', this.host.root);
            clone.style.setProperty('--dur', `${ms}ms`);
        }
    }
    previewAssign(pid, loc) {
        const dest = this.shelfEl(pid, loc);
        if (!dest)
            return;
        const ms = Math.max(700, this.duration() * 3);
        const sources = this.holdMeeples(pid);
        const from = sources.length > 0 ? sources : this.campMeeples(pid);
        for (const src of from) {
            startScientistTrail(src, dest, ms, this.host.root);
        }
    }
    previewRegroupPickup(pid) {
        const hold = this.ensureRegroupHold(pid);
        const dest = hold?.getBoundingClientRect() ?? this.lingerRect(pid);
        if (!dest)
            return;
        const ms = Math.max(800, this.duration() * 3);
        for (const src of this.campMeeples(pid)) {
            startScientistTrailToRect(src, dest, ms, this.host.root);
        }
    }
    previewCardPlacement(pid, cardId, loc) {
        const src = this.cardEl(pid, cardId);
        const dest = this.nextPileRect(pid, loc);
        if (!src || !dest)
            return;
        placeCloneAt(src, 'bae_card_place_preview', this.host.root, dest);
    }
    renderInvalidBubble(text) {
        this.host.root.querySelectorAll('.bae_invalid_bubble').forEach((el) => el.remove());
        document.querySelectorAll('body > .bae_invalid_bubble').forEach((el) => el.remove());
        const myId = Number(this.host.bga.players.getCurrentPlayerId());
        const loc = this.host.selectedLocation;
        const board = this.host.root.querySelector(`#bae_playerboard_${myId}`);
        const anchor = loc != null
            ? this.host.root.querySelector(`.bae_location_zone[data-player-id="${myId}"][data-loc="${loc}"]`)
            : board;
        if (!anchor)
            return;
        const bubble = document.createElement('div');
        bubble.className = 'bae_invalid_bubble';
        bubble.setAttribute('role', 'status');
        bubble.textContent = text;
        anchor.appendChild(bubble);
    }
    bindDragAndDrop() {
        if (this.host.bga.players.isCurrentPlayerSpectator())
            return;
        const myId = Number(this.host.bga.players.getCurrentPlayerId());
        this.host.root.querySelectorAll('.bae_handcard[data-hand-card]').forEach((el) => {
            const htmlEl = el;
            htmlEl.setAttribute('draggable', 'true');
            const onDragStart = (ev) => {
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
            const htmlEl = el;
            const onDragOver = (ev) => {
                if (this.dragCardId == null || !this.host.isGameplayLike())
                    return;
                ev.preventDefault();
                htmlEl.classList.add('bae_drop_target');
            };
            const onDragLeave = () => htmlEl.classList.remove('bae_drop_target');
            const onDrop = (ev) => {
                ev.preventDefault();
                htmlEl.classList.remove('bae_drop_target');
                const cardId = Number(ev.dataTransfer?.getData('text/bae-card') || this.dragCardId);
                const loc = Number(htmlEl.dataset.loc);
                if (!this.host.isGameplayLike() || !this.host.bga.players.isCurrentPlayerActive())
                    return;
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
            const htmlEl = el;
            const onDragOver = (ev) => {
                if (this.dragCardId == null || !this.host.isGameplayLike())
                    return;
                ev.preventDefault();
                htmlEl.classList.add('bae_drop_target');
            };
            const onDrop = (ev) => {
                ev.preventDefault();
                htmlEl.classList.remove('bae_drop_target');
                const cardId = Number(ev.dataTransfer?.getData('text/bae-card') || this.dragCardId);
                if (!this.host.isGameplayLike() || !this.host.bga.players.isCurrentPlayerActive())
                    return;
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
            const onDragOver = (ev) => {
                if (!this.host.isReplenishLike())
                    return;
                ev.preventDefault();
            };
            const onDrop = (ev) => {
                if (!this.host.isReplenishLike() || !this.host.bga.players.isCurrentPlayerActive())
                    return;
                ev.preventDefault();
                const slotRaw = ev.dataTransfer?.getData('text/bae-pool');
                if (slotRaw === '' || slotRaw == null)
                    return;
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
            const htmlEl = el;
            htmlEl.setAttribute('draggable', 'true');
            const onDragStart = (ev) => {
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
    async animateHandReplace(pid, discarded, prev, next, ms) {
        const root = this.host.root;
        const deck = this.deckEl();
        const slots = this.handSlotRects(pid);
        if (slots.length === 0)
            return;
        const leaving = this.leavingHandCards(pid, discarded);
        const remaining = this.handCards(pid).filter((el) => !leaving.includes(el));
        leaving.forEach((el) => { el.style.visibility = 'hidden'; });
        if (deck && leaving.length > 0) {
            await Promise.all(leaving.map((el) => {
                const clone = placeClone(el, 'bae_resolve_clone bae_resolve_card', root);
                return flyClone(clone, deck.getBoundingClientRect(), ms, root, true);
            }));
        }
        await this.compactHandToSlots(remaining, slots, ms);
        const drawCount = this.handDrawCount(pid, discarded, prev, next);
        if (!deck || drawCount <= 0)
            return;
        const dests = this.handFillRects(slots, remaining.length, drawCount);
        const faces = this.drawnHandCardIds(pid, discarded, prev, next);
        for (let i = 0; i < dests.length; i++) {
            const refill = this.cloneForHandDraw(deck, faces[i]);
            await flyClone(refill, dests[i], ms, root, true);
        }
    }
    /** Facedown hands always drop the first N cards; own hand uses the discarded ids. */
    leavingHandCards(pid, discarded) {
        const cards = this.handCards(pid);
        if (discarded.length <= 0 || cards.length === 0)
            return [];
        const byId = [];
        for (const cardId of discarded) {
            const el = this.host.root.querySelector(`#bae_hand_${pid}_${cardId}`);
            if (!el || byId.includes(el)) {
                return cards.slice(0, Math.min(discarded.length, cards.length));
            }
            byId.push(el);
        }
        return byId;
    }
    /** Slide leftover cards into the top slots without shrinking the 4-slot column. */
    async compactHandToSlots(remaining, slots, ms) {
        if (remaining.length === 0 || slots.length === 0)
            return;
        const moved = remaining.some((el, i) => {
            const dest = slots[i];
            if (!dest)
                return false;
            const r = el.getBoundingClientRect();
            return Math.abs(r.top - dest.top) > 1 || Math.abs(r.left - dest.left) > 1;
        });
        if (!moved)
            return;
        const root = this.host.root;
        await Promise.all(remaining.map((el, i) => {
            const dest = slots[i];
            if (!dest)
                return Promise.resolve();
            const clone = placeClone(el, 'bae_resolve_clone bae_resolve_card', root);
            el.style.visibility = 'hidden';
            return flyClone(clone, dest, ms, root, true);
        }));
    }
    handSlotRects(pid) {
        const col = this.handCol(pid);
        if (!col)
            return [];
        return Array.from(col.children)
            .filter((el) => el instanceof HTMLElement && el.classList.contains('bae_card'))
            .map((el) => el.getBoundingClientRect());
    }
    handFillRects(slots, startIndex, count) {
        if (count <= 0)
            return [];
        const needed = startIndex + count;
        const filled = slots.length >= needed ? slots : this.extendSlotRects(slots, needed);
        return filled.slice(startIndex, startIndex + count);
    }
    extendSlotRects(slots, count) {
        if (slots.length === 0 || slots.length >= count)
            return slots;
        const out = [...slots];
        const sample = slots[0];
        const gap = slots.length >= 2 ? slots[1].top - slots[0].bottom : 8;
        while (out.length < count) {
            const last = out[out.length - 1];
            out.push(new DOMRect(last.left, last.bottom + gap, sample.width, sample.height));
        }
        return out;
    }
    handDrawCount(pid, discarded, prev, next) {
        if (discarded.length > 0)
            return discarded.length;
        const prevHand = prev.hands?.[pid];
        const nextHand = next?.hands?.[pid];
        const prevN = typeof prevHand === 'number' ? prevHand : Array.isArray(prevHand) ? prevHand.length : 0;
        const nextN = typeof nextHand === 'number' ? nextHand : Array.isArray(nextHand) ? nextHand.length : 0;
        return Math.max(0, nextN - (prevN - discarded.length));
    }
    drawnHandCardIds(pid, discarded, prev, next) {
        const nextHand = next?.hands?.[pid];
        if (!Array.isArray(nextHand))
            return [];
        const prevHand = prev.hands?.[pid];
        const prevIds = Array.isArray(prevHand) ? prevHand.map((c) => Number(c.id)) : [];
        const discardedSet = new Set(discarded.map(Number));
        const keepCount = prevIds.filter((id) => !discardedSet.has(id)).length;
        return nextHand.slice(keepCount).map((c) => Number(c.id));
    }
    cloneForHandDraw(source, cardId) {
        const clone = placeClone(source, 'bae_resolve_clone bae_resolve_card', this.host.root);
        clone.querySelectorAll('.bae_deck_overlay, .bae_confirm_blurb').forEach((node) => node.remove());
        if (cardId != null && Number.isFinite(cardId)) {
            clone.innerHTML = this.host.animalCardHtml(cardId);
        }
        return clone;
    }
    renderRegroupHold() {
        const pid = this.holdingPid;
        if (pid == null && !this.host.campSelected) {
            this.host.root.querySelectorAll('.bae_regroup_hold').forEach((el) => el.remove());
            return;
        }
        const targetPid = pid ?? Number(this.host.bga.players.getCurrentPlayerId());
        const hold = this.ensureRegroupHold(targetPid);
        if (!hold)
            return;
        hold.replaceChildren();
        if (this.holdingPid == null)
            return;
        const left = this.shelfEl(targetPid, 3);
        const right = this.shelfEl(targetPid, 4);
        hold.innerHTML = `<div class="bae_sci_shelf">${left?.innerHTML ?? ''}${right?.innerHTML ?? ''}</div>`;
        this.campMeeples(targetPid).forEach((el) => { el.style.visibility = 'hidden'; });
    }
    ensureRegroupHold(pid) {
        const canvas = this.host.root.querySelector(`#bae_playerboard_${pid} .bae_board_canvas`);
        if (!canvas)
            return null;
        let hold = canvas.querySelector('.bae_regroup_hold');
        if (!hold) {
            hold = document.createElement('div');
            hold.className = 'bae_regroup_hold';
            hold.setAttribute('aria-hidden', 'true');
            canvas.appendChild(hold);
        }
        return hold;
    }
    lingerRect(pid) {
        const camp = this.host.root.querySelector(`#bae_camp_${pid}_left`);
        if (!camp)
            return null;
        const r = camp.getBoundingClientRect();
        return new DOMRect(r.left, r.top - r.height * 1.2, r.width, r.height);
    }
    holdMeeples(pid) {
        const hold = this.host.root.querySelector(`#bae_playerboard_${pid} .bae_regroup_hold`);
        return Array.from(hold?.querySelectorAll('.bae_meeple_img') ?? []);
    }
    deckEl() {
        return this.host.root.querySelector('#bae_pool_slot_deck');
    }
    poolCards() {
        return Array.from(this.host.root.querySelectorAll('.bae_pool_slot:not(.bae_pool_deck)'));
    }
    handCol(pid) {
        return this.host.root.querySelector(`.bae_player_handcol[data-player-id="${pid}"]`);
    }
    handCards(pid) {
        const col = this.handCol(pid);
        if (!col)
            return [];
        return Array.from(col.querySelectorAll('.bae_handcard, .bae_handcard_hidden'));
    }
    nextPileRect(pid, loc) {
        const zone = this.host.root.querySelector(`.bae_location_zone[data-player-id="${pid}"][data-loc="${loc}"]`);
        if (!zone)
            return null;
        const zr = zone.getBoundingClientRect();
        if (zr.width < 1 || zr.height < 1)
            return null;
        const pile = zone.querySelector('.bae_anim_pile');
        const index = pile ? pile.querySelectorAll('.bae_pile_slot').length : 0;
        const cardW = zr.width * (528 / 800);
        const cardH = zr.height * (745 / 2494);
        const shift = zr.height * (170 / 2494);
        const left = zr.left + zr.width / 2 - cardW / 2;
        const top = zr.top - index * shift - cardH;
        return new DOMRect(left, top, cardW, cardH);
    }
    handDestEl(pid) {
        const col = this.host.root.querySelector(`.bae_player_handcol[data-player-id="${pid}"]`);
        if (!col)
            return null;
        const placeholder = col.querySelector('.bae_card_placeholder');
        if (placeholder)
            return placeholder;
        const cards = col.querySelectorAll('.bae_handcard, .bae_handcard_hidden, .bae_card:not(.bae_card_placeholder)');
        return cards[cards.length - 1] ?? col;
    }
    cardEl(pid, cardId) {
        return this.host.root.querySelector(`#bae_hand_${pid}_${cardId}`)
            ?? this.host.root.querySelector(`.bae_player_handcol[data-player-id="${pid}"] .bae_handcard, .bae_player_handcol[data-player-id="${pid}"] .bae_handcard_hidden`);
    }
    shelfEl(pid, pos) {
        if (pos <= 2)
            return this.host.root.querySelector(`#bae_sci_shelf_loc_${pid}_${pos}`);
        if (pos === 3)
            return this.host.root.querySelector(`#bae_sci_shelf_camp_${pid}_left`);
        return this.host.root.querySelector(`#bae_sci_shelf_camp_${pid}_right`);
    }
    meepleAt(pid, loc, color, used) {
        const shelf = this.shelfEl(pid, loc);
        if (!shelf)
            return null;
        const nodes = Array.from(shelf.querySelectorAll(`.bae_meeple_img[data-scientist="${color}"]`));
        const el = nodes.find((n) => !used.has(n)) ?? null;
        if (el)
            used.add(el);
        return el;
    }
    campMeeples(pid) {
        const left = this.shelfEl(pid, 3);
        const right = this.shelfEl(pid, 4);
        return [
            ...Array.from(left?.querySelectorAll('.bae_meeple_img') ?? []),
            ...Array.from(right?.querySelectorAll('.bae_meeple_img') ?? []),
        ];
    }
    trackEl(pid, loc, space) {
        return this.host.root.querySelector(`#bae_track_${pid}_${loc}_${space}`);
    }
    flagEl(pid, loc, space) {
        return this.trackEl(pid, loc, space)?.querySelector('.bae_track_flag_only');
    }
}
function objectiveProgressLines(obj, state, materials, players) {
    return Object.keys(players).map((pidStr) => {
        const pid = Number(pidStr);
        const { count, required } = objectiveProgress(obj.id, pid, state, materials);
        const name = players[pid]?.name ?? `${_('Player')} ${pid}`;
        return `${name}: ${count}/${required}`;
    });
}
function scoringVpLines(scoringId, state, materials, players) {
    return Object.keys(players).map((pidStr) => {
        const pid = Number(pidStr);
        const vp = scoreScoringCard(scoringId, pid, state, materials);
        const name = players[pid]?.name ?? `${_('Player')} ${pid}`;
        return `${name}: ${vp}`;
    });
}

const SCI_COLOR = ["#ddb162", "#eca6b8", "#7dc7bc"];
class Game {
    constructor(bga) {
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.selectedPoolSlot = null;
        this.campSelected = false;
        this.selectedRegroupIds = new Set();
        this.cachedActionArgs = null;
        this.cachedUndoCanUndo = false;
        this.cachedUndoType = null;
        this.cachedCanMulligan = undefined;
        this.boardScaleTimeoutId = null;
        this.boardScaleTimeoutAccInterval = null;
        this.zoomFactor = 1;
        this.isShowingLastTurnBanner = false;
        this.openingIntroPage = "objectives";
        this.openingIntroEl = null;
        this.optionalUi = null;
        this.bga = bga;
        this.preloadGameImages();
    }
    setup(gamedatas) {
        this.gamedatas = gamedatas;
        this.setupNotifications();
        const area = this.bga.gameArea.getElement();
        this.root = document.createElement("div");
        this.root.id = "bae_playarea";
        this.root.className = "bae";
        area.appendChild(this.root);
        // OPTIONAL: client-only UX helpers (previews, resolution motion, DnD, sound)
        this.optionalUi = new OptionalUi(this);
        // Keep --board-scale up to date when the window resizes
        window.addEventListener('resize', () => this.updateBoardScale());
        this.renderAll();
    }
    /** Warm sprite sheets, boards, and tokens so zoom/tooltips/new cards do not hitch on first use. */
    preloadGameImages() {
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
        ];
        this.bga.images.preloadImages(files);
        for (const file of files) {
            const img = new Image();
            img.decoding = 'async';
            img.src = this.bga.images.getImgUrl(file);
            void img.decode().catch(() => { });
        }
    }
    renderPlayerPanelInfo() {
        const d = this.gamedatas.boardState;
        const firstPlayerId = Number((this.gamedatas.playerOrder ?? [])[0] ?? 0);
        const baseUrl = this.bga.images.getImgUrl();
        const animalIcon = `${baseUrl}Tokens/animal_obj.webp`;
        const scientistIcon = `${baseUrl}Tokens/meeple_obj.webp`;
        const trackIcon = `${baseUrl}Tokens/track_obj.webp`;
        const firstPlayerToken = `${baseUrl}Tokens/FirstPlayerToken.webp`;
        const scientistCountAt = (pid, location) => {
            const sci = d.scientists?.[pid];
            if (!sci)
                return 0;
            let count = 0;
            for (let col = 0; col < 3; col++) {
                const poses = sci[col] ?? [];
                count += poses.filter((p) => p === location).length;
            }
            return count;
        };
        const locationPanelHtml = (animals, scientists, flagDepth) => {
            return [
                `<span class="bae_panel_item"><img class="bae_panel_icon" src="${animalIcon}" alt="" draggable="false"/><span class="bae_panel_value">${animals}</span></span>`,
                `<span class="bae_panel_item"><img class="bae_panel_icon" src="${scientistIcon}" alt="" draggable="false"/><span class="bae_panel_value">${scientists}</span></span>`,
                `<span class="bae_panel_item"><img class="bae_panel_icon" src="${trackIcon}" alt="" draggable="false"/><span class="bae_panel_value">${flagDepth}</span></span>`,
            ].join('');
        };
        const campPanelHtml = (scientists) => {
            return [
                `<span class="bae_panel_item bae_panel_item_empty"></span>`,
                `<span class="bae_panel_item"><img class="bae_panel_icon" src="${scientistIcon}" alt="" draggable="false"/><span class="bae_panel_value">${scientists}</span></span>`,
                `<span class="bae_panel_item bae_panel_item_empty"></span>`,
            ].join('');
        };
        for (const pidStr of Object.keys(this.gamedatas.players)) {
            const pid = Number(pidStr);
            const host = this.bga.playerPanels.getElement(pid);
            let infoEl = host.querySelector('.bae_panel_info');
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
        this.updateSpriteSheetUrls(scale);
        this.updateOpeningIntroOverlay();
        this.boardScaleTimeoutAccInterval = 10;
        this.boardScaleTimeoutId = window.setTimeout(() => this.verifyBoardScaleTimeout(scale), 10);
    }
    updateSpriteSheetUrls(scale) {
        if (!this.root)
            return;
        const tier = scale >= 0.55 ? 'full' : scale >= 0.25 ? 'half' : 'quarter';
        const base = this.bga.images.getImgUrl();
        this.root.style.setProperty('--animal-sprite-url', `url("${base}Sprites/AnimalCards_sheet_${tier}.webp")`);
        this.root.style.setProperty('--objective-sprite-url', `url("${base}Sprites/ObjectiveCards_sheet_${tier}.webp")`);
        this.root.style.setProperty('--scoring-sprite-url', `url("${base}Sprites/ScoringCards_sheet_${tier}.webp")`);
    }
    getScaleForZoomFactor(zoomFactor) {
        const area = this.bga.gameArea.getElement();
        const areaRect = area.getBoundingClientRect();
        //   const rootRect = this.root.getBoundingClientRect();
        const availableWidth = Math.max(1, areaRect.width);
        const availableHeight = Math.max(1, window.innerHeight);
        const scaleByBoardWidth = availableWidth / Game.MIN_PLAYAREA_REFERENCE_WIDTH_PX;
        const scaleByBoardHeight = availableHeight / Game.MIN_PLAYAREA_REFERENCE_HEIGHT_PX;
        const scaleByTopRowWidth = availableWidth / Game.TOP_ROW_REFERENCE_WIDTH_PX;
        const autoScale = Math.max(0.01, Math.min(scaleByBoardWidth, scaleByBoardHeight, scaleByTopRowWidth));
        const boundedZoom = Math.max(Game.ZOOM_MIN, zoomFactor);
        const zoomedScale = Math.max(0.01, autoScale * boundedZoom);
        // Clamp zoom by width-based limits so top row and board width never overflow.
        const widthClampScale = Math.max(0.01, Math.min(scaleByBoardWidth, scaleByTopRowWidth));
        const scale = Math.min(zoomedScale, widthClampScale);
        return scale;
    }
    ;
    getScale() {
        return this.getScaleForZoomFactor(this.zoomFactor);
    }
    canZoomInAtCurrentViewport() {
        const current = this.getScaleForZoomFactor(this.zoomFactor);
        const nextZoom = this.zoomFactor + Game.ZOOM_STEP;
        const next = this.getScaleForZoomFactor(nextZoom);
        return next - current > 0.0001;
    }
    nextZoomFactorDownWithVisibleChange() {
        const currentScale = this.getScaleForZoomFactor(this.zoomFactor);
        let nextZoom = this.zoomFactor;
        while (nextZoom > Game.ZOOM_MIN + 0.0001) {
            nextZoom = Math.max(Game.ZOOM_MIN, Number((nextZoom - Game.ZOOM_STEP).toFixed(3)));
            const nextScale = this.getScaleForZoomFactor(nextZoom);
            if (currentScale - nextScale > 0.0001)
                return nextZoom;
        }
        return null;
    }
    canZoomOutAtCurrentViewport() {
        return this.nextZoomFactorDownWithVisibleChange() != null;
    }
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
            const nextZoom = this.nextZoomFactorDownWithVisibleChange();
            if (nextZoom == null)
                return;
            this.zoomFactor = nextZoom;
            this.renderAll();
        });
        inBtn?.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (!this.canZoomInAtCurrentViewport())
                return;
            this.zoomFactor = Number((this.zoomFactor + Game.ZOOM_STEP).toFixed(3));
            this.renderAll();
        });
        resetBtn?.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (Math.abs(this.zoomFactor - 1) <= 0.0001)
                return;
            this.zoomFactor = 1;
            this.renderAll();
        });
    }
    ownHandCardActionText() {
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
    registerHandTooltips(myId) {
        if (!this.bga || !this.bga.gameui || typeof (this.bga.gameui.addTooltip) !== 'function')
            return;
        const canHtmlTooltip = typeof this.bga.gameui.addTooltipHtml === 'function';
        // Hidden cards in other players' hands.
        for (const pidStr of Object.keys(this.gamedatas.players)) {
            const pid = Number(pidStr);
            if (pid === myId)
                continue;
            const hiddenCards = this.root.querySelectorAll(`.bae_player_handcol[data-player-id="${pid}"] .bae_handcard_hidden`);
            hiddenCards.forEach((el, idx) => {
                const host = el;
                const id = host.id || `bae_hand_hidden_${pid}_${idx}`;
                if (!host.id)
                    host.id = id;
                try {
                    this.bga.gameui.removeTooltip(id);
                }
                catch (_) { }
                if (canHtmlTooltip) {
                    const html = this.buildCardTooltipSpriteHtml('animal', 9999, _('Hidden hand card'), [_('You cannot see cards in other players hands')]);
                    this.bga.gameui.addTooltipHtml(id, html);
                }
                else {
                    this.bga.gameui.addTooltip(id, _('You cannot see cards in other players hands'), '');
                }
            });
        }
        // Visible cards in your own hand.
        const actionText = this.ownHandCardActionText();
        const myCards = this.root.querySelectorAll(`.bae_player_handcol[data-player-id="${myId}"] [data-hand-card]`);
        myCards.forEach((el) => {
            const host = el;
            const cardId = host.dataset.handCard ?? '';
            const numericCardId = Number(cardId);
            const id = host.id || `bae_hand_${myId}_${cardId}`;
            if (!host.id)
                host.id = id;
            try {
                this.bga.gameui.removeTooltip(id);
            }
            catch (_) { }
            const def = this.animalDef(numericCardId);
            const species = this.gamedatas.materials.species_names?.[def?.species ?? 0] ?? '';
            const vehicle = this.gamedatas.materials.vehicle_names?.[def?.vehicle ?? 0] ?? '';
            const sci = this.gamedatas.materials.scientist_names ?? [];
            const effect = def
                ? `${_('Moves')} ${sci[def.left_move] ?? def.left_move} ${_('left')} · ${sci[def.right_move] ?? def.right_move} ${_('right')}. ${_('Vehicle')}: ${vehicle}. ${_('Bonus VP')}: ${def.bonus_vp}.`
                : '';
            if (canHtmlTooltip) {
                const html = this.buildCardTooltipSpriteHtml('animal', numericCardId, `${species || _('Animal card')} #${numericCardId}`, [effect, actionText]);
                this.bga.gameui.addTooltipHtml(id, html);
            }
            else {
                this.bga.gameui.addTooltip(id, _('Your hand card'), actionText);
            }
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
    isPromptClaimObjectiveLike() {
        const n = this.currentStateName().toLowerCase();
        return n.includes("promptclaimobjective") || n.includes("prompt_claim_objective");
    }
    getPromptedObjectiveIndex() {
        if (!this.isPromptClaimObjectiveLike() || !this.bga.players.isCurrentPlayerActive())
            return null;
        const myId = Number(this.bga.players.getCurrentPlayerId());
        const promptArgs = this.cachedActionArgs;
        const pending = promptArgs?.pendingByPlayer?.[myId] ?? [];
        if (pending.length === 0)
            return null;
        return pending[0].index;
    }
    countScientistsInCamps(playerId) {
        const sci = this.gamedatas.boardState.scientists?.[playerId];
        if (!sci)
            return 0;
        let count = 0;
        for (let col = 0; col < 3; col++) {
            for (const pos of sci[col] ?? []) {
                if (pos === 3 || pos === 4)
                    count++;
            }
        }
        return count;
    }
    animalDef(cardId) {
        const raw = this.gamedatas.materials.animal_cards;
        if (Array.isArray(raw))
            return raw[cardId];
        return raw?.[cardId];
    }
    animalCardHtml(cardId) {
        return this.cardFaceById(cardId);
    }
    buildCardTooltipSpriteHtml(type, id, title, details) {
        return this.buildCardTooltipSpriteHtmlInternal(type, id, title, details);
    }
    async confirmRegroupDiscard(cardIds) {
        const myId = Number(this.bga.players.getCurrentPlayerId());
        if (this.countScientistsInCamps(myId) === 0) {
            // OPTIONAL: preference can skip this confirm when player opts out
            if (!this.optionalUi?.shouldSkipSafeConfirm()) {
                const confirmed = await this.bga.dialogs.confirmation(_("You have no scientists in your camps. Regrouping will end your turn without assigning scientists or gaining VP from camps. Continue?"));
                if (!confirmed)
                    return;
            }
        }
        await this.bga.actions.performAction("actRegroup", {
            card_ids_json: JSON.stringify(cardIds),
        });
    }
    enterRegroupMode() {
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.selectedPoolSlot = null;
        this.campSelected = true;
        this.selectedRegroupIds.clear();
        this.renderAll();
        this.onUpdateActionButtons(this.currentStateName(), null);
        this.optionalUi?.onSelectionChanged();
        this.optionalUi?.playSound('select');
    }
    clearSelection() {
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.selectedPoolSlot = null;
        this.campSelected = false;
        this.selectedRegroupIds.clear();
        this.renderAll();
        this.onUpdateActionButtons(this.currentStateName(), null);
        this.optionalUi?.onSelectionChanged();
    }
    /** BGA calls onUpdateActionButtons before onEnteringState; cache args from either source for client-side refreshes. */
    cacheStateActionArgs(args) {
        if (args == null)
            return;
        this.cachedActionArgs = args;
        if ("canUndo" in args) {
            this.cachedUndoCanUndo = Boolean(args.canUndo);
            this.cachedUndoType = args.undoType ?? null;
        }
        if ("canMulligan" in args) {
            this.cachedCanMulligan = Boolean(args.canMulligan);
        }
    }
    addUndoActionButton(canUndo, undoType) {
        if (!canUndo || !undoType)
            return;
        const label = undoType === "observe" ? _("Undo: Observe") : _("Undo: Regroup");
        const tooltip = undoType === "observe"
            ? _("Undo observing an animal and return to choosing your main action. Only available before drawing a replacement card.")
            : _("Undo regrouping and return to choosing your main action. Only available when no cards were discarded.");
        this.bga.statusBar.addActionButton(label, () => {
            void this.bga.actions.performAction("actUndo", {});
        }, {
            disabled: false,
            tooltip,
        });
    }
    syncScoresFromBoardState(boardState) {
        const vps = boardState.vps ?? {};
        for (const [pid, score] of Object.entries(vps)) {
            const ctr = this.bga.playerPanels.getScoreCounter(Number(pid));
            ctr.setValue(Number(score.score ?? score));
        }
    }
    isObserveSelectionLegal(cardId = this.selectedCardId, location = this.selectedLocation) {
        if (cardId == null || location == null || this.campSelected)
            return false;
        const myId = Number(this.bga.players.getCurrentPlayerId());
        return canObserveAtLocation(this.animalDef(cardId), this.gamedatas.boardState.scientists, myId, location);
    }
    confirmObserveIfReady(cardId, location) {
        if (!this.isGameplayLike() || !this.bga.players.isCurrentPlayerActive())
            return false;
        if (cardId == null || location == null)
            return false;
        if (!this.isObserveSelectionLegal(cardId, location)) {
            this.optionalUi?.showInvalidObserveHint();
            return false;
        }
        void this.bga.actions.performAction("actObserveAnimal", {
            card_id: cardId,
            location,
        });
        return true;
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
        const canZoomOut = this.canZoomOutAtCurrentViewport();
        const canZoomIn = this.canZoomInAtCurrentViewport();
        const canResetZoom = Math.abs(this.zoomFactor - 1) > 0.0001;
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
            if (playerState === "meets")
                extraClass = " bae_obj_meets";
            else if (playerState === "claimed")
                extraClass = " bae_obj_claimed_by_you";
            // If any player has claimed this objective this round while it remains active,
            // show a distinct claimed-this-round highlight for other players.
            const anyClaimed = obj.active && Object.values(obj.players).some((s) => s === "claimed");
            if (anyClaimed && playerState !== "claimed")
                extraClass += " bae_obj_claimed_round";
            if (promptedObjectiveIdx === idx)
                extraClass += " bae_obj_prompt_target";
            const disabledAttr = obj.active ? "" : "disabled";
            const promptConfirmBlurb = promptedObjectiveIdx === idx
                ? `<span class="bae_confirm_blurb">${this.escapeHtml(confirmObserveBlurb)}</span>`
                : "";
            // give each objective an ID so we can attach the BGA tooltip API instead of title attributes
            html += `<button id="bae_obj_${idx}" type="button" class="bae_obj${extraClass}" data-obj-idx="${idx}" ${disabledAttr}>${this.objectiveFaceById(obj.id)}${promptConfirmBlurb}</button>`;
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
                            html += `<div id="bae_hand_hidden_${pid}_${hi}" class="bae_card bae_handcard_hidden">${this.cardFaceById(9999)}</div>`;
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
                    const card = pile[si];
                    if (!card)
                        continue;
                    const slotId = `bae_pile_${pid}_${loc}_${si}`;
                    const inner = this.spriteFaceById('animal', card.id, 'bae_pile_card_img', `${_("Animal card")} #${card.id}`);
                    html += `<div id="${slotId}" class="bae_pile_slot" style="z-index: 1;">${inner}</div>`;
                }
                html += `</div>`;
                html += this.renderTrackColumn(pid, track, loc, d.flags[pid]?.[loc] ?? 0);
                html += `<div id="bae_sci_shelf_loc_${pid}_${loc}" class="bae_sci_shelf" data-sci-shelf="${loc}">${this.renderScientistDots(pid, d.scientists[pid], loc)}</div>`;
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
    getTooltipScale() {
        const scaleRaw = this.root ? getComputedStyle(this.root).getPropertyValue('--bae-scale') : '';
        const currentScale = Number.parseFloat(scaleRaw);
        const baseScale = Number.isFinite(currentScale) ? currentScale : this.getScale();
        return Math.max(0.3, baseScale * 2);
    }
    applySlideshowScaleStyles(el) {
        const slideshowScale = this.getTooltipScale();
        const tier = slideshowScale >= 0.55 ? 'full' : slideshowScale >= 0.25 ? 'half' : 'quarter';
        const base = this.bga.images.getImgUrl();
        el.style.setProperty('--bae-scale', String(slideshowScale));
        el.style.setProperty('--animal-sprite-url', `url("${base}Sprites/AnimalCards_sheet_${tier}.webp")`);
        el.style.setProperty('--objective-sprite-url', `url("${base}Sprites/ObjectiveCards_sheet_${tier}.webp")`);
        el.style.setProperty('--scoring-sprite-url', `url("${base}Sprites/ScoringCards_sheet_${tier}.webp")`);
    }
    applyTooltipScaleToCardFace(type, id, tooltipScale) {
        const tier = tooltipScale >= 0.55 ? 'full' : tooltipScale >= 0.25 ? 'half' : 'quarter';
        const baseUrl = this.bga.images.getImgUrl();
        const animalSpriteUrl = `${baseUrl}Sprites/AnimalCards_sheet_${tier}.webp`;
        const objectiveSpriteUrl = `${baseUrl}Sprites/ObjectiveCards_sheet_${tier}.webp`;
        const scoringSpriteUrl = `${baseUrl}Sprites/ScoringCards_sheet_${tier}.webp`;
        const spriteStyle = `width:100%;height:100%;--animal-sprite-url:url('${animalSpriteUrl}');--objective-sprite-url:url('${objectiveSpriteUrl}');--scoring-sprite-url:url('${scoringSpriteUrl}');`;
        if (type === 'objective') {
            return this.objectiveFaceById(id)
                .replace('<div class="bae_obj_img bae_overlay_card"', `<div class="bae_obj_img bae_overlay_card" style="${spriteStyle}"`);
        }
        return this.scoringFaceById(id)
            .replace('<div class="bae_score_img bae_overlay_card"', `<div class="bae_score_img bae_overlay_card" style="${spriteStyle}"`);
    }
    updateOpeningIntroOverlay() {
        this.root?.querySelector('.bae_top_objectives')?.classList.remove('bae_opening_intro_highlight');
        this.root?.querySelector('.bae_top_scoring')?.classList.remove('bae_opening_intro_highlight');
        this.openingIntroEl?.remove();
        this.openingIntroEl = null;
        if (!this.root || this.bga.players.isCurrentPlayerSpectator() || !this.isOpeningMulliganLike() || this.openingIntroPage === null) {
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
        this.applySlideshowScaleStyles(overlay.querySelector('.bae_opening_intro_panel'));
        overlay.querySelector('.bgabutton')?.addEventListener('click', () => {
            if (this.openingIntroPage === 'objectives') {
                this.openingIntroPage = 'scoring';
            }
            else {
                this.openingIntroPage = null;
            }
            this.updateOpeningIntroOverlay();
            this.onUpdateActionButtons(this.currentStateName(), this.cachedActionArgs);
        });
        this.root.appendChild(overlay);
        this.openingIntroEl = overlay;
    }
    handleLastTurnBanner(playersEndingGame) {
        const shouldShow = playersEndingGame && playersEndingGame.length > 0;
        if (shouldShow && !this.isShowingLastTurnBanner) {
            const names = playersEndingGame.map((pid) => this.bga.players.getFormattedPlayerName(pid)).join(", ");
            const message = _('${player_names} triggered the end of game by observing 7 animals at a location. This is the final round!');
            this.isShowingLastTurnBanner = true;
            this.bga.gameArea.addLastTurnBanner(message, { player_names: names });
        }
        else if (!shouldShow && this.isShowingLastTurnBanner) {
            this.isShowingLastTurnBanner = false;
            this.bga.gameArea.removeLastTurnBanner();
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
            const html = this.buildCardTooltipSpriteHtml('animal', slot.id, _('Pool card'), [_('Click to take this card')]);
            this.bga.gameui.addTooltipHtml(id, html);
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
            const progressLines = objectiveProgressLines(obj, d, this.gamedatas.materials, this.gamedatas.players);
            const action = obj.active ? _('Click to claim this objective') : _('Inactive this round');
            const html = this.buildCardTooltipSpriteHtml('objective', obj.id, objectiveMat?.title ?? `${_('Objective')} #${obj.id}`, [objectiveMat?.description ?? '', ...progressLines, action]);
            this.bga.gameui.addTooltipHtml(id, html);
        });
        // Scoring cards
        (d.scoring_cards || []).forEach((scoringId, idx) => {
            const id = `bae_score_${idx}`;
            try {
                this.bga.gameui.removeTooltip(id);
            }
            catch (_) { }
            const scoringMat = this.gamedatas.materials.scoring_cards?.[scoringId];
            const title = scoringMat?.title ?? `${_('Scoring card')} #${scoringId}`;
            const description = scoringMat?.description ?? '';
            const explanation = scoringMat?.explanation ?? '';
            const vpLines = scoringVpLines(scoringId, d, this.gamedatas.materials, this.gamedatas.players);
            const html = this.buildCardTooltipSpriteHtml('scoring', scoringId, title, [description, explanation ? `${_('Explanation')}: ${explanation}` : '', ...vpLines]);
            this.bga.gameui.addTooltipHtml(id, html);
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
                    try {
                        this.bga.gameui.removeTooltip(id);
                    }
                    catch (_) { }
                    const vpEntry = trackVps[loc]?.[i] ?? 0;
                    const help = `${_('Exploration Track')} ${i} · ${vehiclesAtSpace.map(v => vehicleNames[v] ?? `#${v}`).join(', ') || _('Start')} · ${vpEntry} ${_('VP')}`;
                    const how = _('Advance the flag one space when the observed animal\'s vehicle matches a vehicle printed on the next space.');
                    this.bga.gameui.addTooltip(id, help, how);
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
                ? `<img class="bae_track_flag_only" src="${baseUrl}Tokens/FlagToken.webp" alt="${_("Flag")}" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%" draggable="false"/>`
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
            out.push(`<img class="bae_meeple_img ${meepleClasses[col]}" data-scientist="${col}" src="${src}" alt="" draggable="false" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%"/>`);
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
        return `${this.bga.images.getImgUrl()}${folder}/${String(safeId).padStart(4, "0")}.webp`;
    }
    imageTag(folder, id, className, alt, extraAttrs = "") {
        const src = this.imagePath(folder, id);
        const safeAlt = alt.replace(/"/g, "&quot;");
        const attrs = extraAttrs ? ` ${extraAttrs}` : "";
        return `<img class="${className}" src="${src}" alt="${safeAlt}" draggable="false"${attrs}/>`;
    }
    getSpriteIndex(id, lastIndex) {
        const value = Number(id);
        const safeId = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 9999;
        if (safeId === 9999)
            return lastIndex;
        return Math.max(0, Math.min(lastIndex - 1, safeId));
    }
    spriteStyleById(type, id) {
        let columns = 1;
        let rows = 1;
        let lastIndex = 0;
        let spriteClass = '';
        if (type === 'animal') {
            columns = Game.ANIMAL_SPRITE_COLUMNS;
            rows = Game.ANIMAL_SPRITE_ROWS;
            lastIndex = Game.ANIMAL_SPRITE_LAST_INDEX;
            spriteClass = 'bae_sprite_animal';
        }
        else if (type === 'objective') {
            columns = Game.OBJECTIVE_SPRITE_COLUMNS;
            rows = Game.OBJECTIVE_SPRITE_ROWS;
            lastIndex = Game.OBJECTIVE_SPRITE_LAST_INDEX;
            spriteClass = 'bae_sprite_objective';
        }
        else {
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
    spriteFaceById(type, id, className, alt) {
        const sprite = this.spriteStyleById(type, id);
        const safeAlt = alt.replace(/"/g, "&quot;");
        return `<div class="${className} ${sprite.spriteClass}" role="img" aria-label="${safeAlt}" style="--sprite-x:${sprite.x};--sprite-y:${sprite.y};"></div>`;
    }
    spriteMeta(type) {
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
    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    buildCardTooltipSpriteHtmlInternal(type, id, title, details) {
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
        const tooltipScale = Math.max(0.3, baseScale * 2);
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
        const detailFontPx = 13;
        let cardHtml;
        if (type === 'objective') {
            cardHtml = this.applyTooltipScaleToCardFace('objective', id, tooltipScale);
        }
        else if (type === 'scoring') {
            cardHtml = this.applyTooltipScaleToCardFace('scoring', id, tooltipScale);
        }
        else if (type === 'animal') {
            cardHtml = this.cardFaceById(id)
                .replace('<div class="bae_card_img bae_overlay_card"', `<div class="bae_card_img bae_overlay_card" style="width:100%;height:100%;--animal-sprite-url:url('${animalSpriteUrl}');--objective-sprite-url:url('${objectiveSpriteUrl}');--scoring-sprite-url:url('${scoringSpriteUrl}');"`);
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
    cardFaceById(cardId) {
        return this.spriteFaceById('animal', cardId, 'bae_card_img', `${_("Animal card")} #${cardId}`);
    }
    objectiveFaceById(objectiveId) {
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
    scoringFaceById(scoringId) {
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
    fitCardOverlayText(container) {
        const scope = container ?? this.root;
        if (!scope)
            return;
        const scaleRaw = getComputedStyle(scope).getPropertyValue('--bae-scale');
        const boardScale = Math.max(0.01, Number.parseFloat(scaleRaw) || 1);
        const boxes = scope.querySelectorAll('.bae_fit_text');
        boxes.forEach((box) => {
            const inner = box.querySelector('.bae_fit_text_inner');
            if (!inner)
                return;
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
                }
                else {
                    high = mid;
                }
            }
            inner.style.fontSize = `${best}px`;
        });
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
                    html += `<div id="bae_hand_hidden_${myId}_${i}" class="bae_card bae_handcard_hidden">${this.cardFaceById(9999)}</div>`;
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
                const confirmBlurb = this.isGameplayLike() && this.selectedCardId === id && this.isObserveSelectionLegal()
                    ? `<span class="bae_confirm_blurb">${this.escapeHtml(_('Confirm?'))}</span>`
                    : '';
                html += `<button id="bae_hand_${myId}_${id}" type="button" class="bae_card bae_handcard${selObs}${selRg}" data-hand-card="${id}">${this.cardFaceById(id)}${confirmBlurb}</button>`;
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
                if (this.isOpeningMulliganLike() || this.campSelected) {
                    if (this.selectedRegroupIds.has(id))
                        this.selectedRegroupIds.delete(id);
                    else
                        this.selectedRegroupIds.add(id);
                    ev.currentTarget.classList.toggle('bae_card_regroup', this.selectedRegroupIds.has(id));
                    this.optionalUi?.onSelectionChanged();
                    this.onUpdateActionButtons(this.currentStateName(), null);
                    return;
                }
                else if (this.isGameplayLike()) {
                    if (this.selectedCardId === id) {
                        if (this.confirmObserveIfReady(id, this.selectedLocation))
                            return;
                        return;
                    }
                    this.selectedCardId = id;
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
                    if (this.selectedLocation === loc) {
                        void this.bga.actions.performAction("actAssignScientists", { location: loc });
                        return;
                    }
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
                        this.selectedLocation = loc;
                        this.renderAll();
                        this.onUpdateActionButtons(this.currentStateName(), null);
                    }
                    else {
                        if (this.selectedLocation === loc) {
                            if (this.confirmObserveIfReady(this.selectedCardId, loc))
                                return;
                            return;
                        }
                        this.selectedLocation = loc;
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
                    if (this.selectedLocation === loc) {
                        void this.bga.actions.performAction('actAssignScientists', { location: loc });
                        return;
                    }
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
                        this.selectedLocation = loc;
                        this.renderAll();
                        this.onUpdateActionButtons(this.currentStateName(), null);
                    }
                    else {
                        if (this.selectedLocation === loc) {
                            if (this.confirmObserveIfReady(this.selectedCardId, loc))
                                return;
                            return;
                        }
                        this.selectedLocation = loc;
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
                // Camp selection is idempotent: clicking camp again does nothing.
                if (this.campSelected)
                    return;
                this.enterRegroupMode();
            }, true);
        });
        this.root.querySelectorAll("[data-pool-slot]").forEach((el) => {
            el.addEventListener("click", () => {
                if (!this.bga.players.isCurrentPlayerActive())
                    return;
                if (!this.isReplenishLike())
                    return;
                const slot = Number(el.dataset.poolSlot);
                if (this.selectedPoolSlot === slot) {
                    void this.bga.actions.performAction("actTakeAnimal", { pool_slot: slot });
                    return;
                }
                this.selectedPoolSlot = slot;
                this.renderAll();
                this.onUpdateActionButtons(this.currentStateName(), null);
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
                if (this.isPromptClaimObjectiveLike()) {
                    const promptedIdx = this.getPromptedObjectiveIndex();
                    if (promptedIdx == null || idx !== promptedIdx)
                        return;
                    void this.bga.actions.performAction("actClaimPromptObjective", { objective_index: idx });
                    return;
                }
                void this.bga.actions.performAction("actClaimObjective", { objective_index: idx });
            });
        });
    }
    onEnteringState(stateName, entryArgs) {
        this.cacheStateActionArgs(entryArgs.args);
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.selectedPoolSlot = null;
        this.campSelected = false;
        this.selectedRegroupIds.clear();
        const n = stateName.toLowerCase();
        if (n.includes("gameplay") || n.includes("replenish") || n.includes("assign") || n.includes("openingmulligan") || n.includes("promptclaim") || n.includes("prompt_claim")) {
            this.renderAll();
        }
    }
    onLeavingState(stateName) {
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
    onUpdateActionButtons(stateName, args) {
        this.cacheStateActionArgs(args);
        const effectiveArgs = args ?? this.cachedActionArgs;
        this.bga.statusBar.removeActionButtons();
        if (!this.bga.players.isCurrentPlayerActive())
            return;
        const sn = stateName.toLowerCase();
        if (sn.includes("promptclaimobjective") || sn.includes("prompt_claim_objective")) {
            const myId = Number(this.bga.players.getCurrentPlayerId());
            const promptArgs = effectiveArgs;
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
                    if (!observeMissingSelection)
                        this.optionalUi?.showInvalidObserveHint();
                    return;
                }
                void this.bga.actions.performAction("actObserveAnimal", {
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
            const clearDisabled = this.selectedCardId == null && this.selectedLocation == null && !this.campSelected && this.selectedRegroupIds.size === 0;
            this.bga.statusBar.addActionButton(_('Clear selection'), () => {
                this.clearSelection();
            }, {
                disabled: clearDisabled,
                tooltip: clearDisabled ? _("No selection to clear.") : _("Clear all selections.")
            });
        }
        if (sn.includes("replenish")) {
            const replenishArgs = effectiveArgs;
            const poolCardSelected = this.selectedPoolSlot != null && this.selectedPoolSlot >= 0;
            this.bga.statusBar.addActionButton(_("Draw Card"), () => {
                if (!poolCardSelected || this.selectedPoolSlot == null)
                    return;
                void this.bga.actions.performAction("actTakeAnimal", { pool_slot: this.selectedPoolSlot });
            }, {
                disabled: !poolCardSelected,
                tooltip: poolCardSelected
                    ? _("Take the selected card from the pool.")
                    : _("Select a card from the pool to draw."),
            });
            this.bga.statusBar.addActionButton(_("Draw from deck"), () => {
                void this.bga.actions.performAction("actTakeAnimal", { pool_slot: -1 });
            });
            const can = replenishArgs?.canMulligan ?? this.cachedCanMulligan;
            //   console.log("Can mulligan?", can, args);
            this.bga.statusBar.addActionButton(_("Mulligan pool (-1 VP)"), () => {
                void this.bga.actions.performAction("actMulliganPool", {});
            }, {
                disabled: !can,
                tooltip: can ? _("Pay 1 VP to discard all 4 available cards forming the pool and replace them with 4 new ones from the deck before choosing your card.") : _("You can only mulligan once per turn, only if you have at least 1 VP."),
            });
            this.addUndoActionButton(replenishArgs?.canUndo ?? this.cachedUndoCanUndo, replenishArgs?.undoType ?? this.cachedUndoType);
        }
        if (sn.includes("assigncamp") || sn.includes("assign_camp")) {
            const assignArgs = effectiveArgs;
            const locationSelected = this.selectedLocation != null;
            this.bga.statusBar.addActionButton(_("Assign Scientists"), () => {
                if (!locationSelected || this.selectedLocation == null)
                    return;
                void this.bga.actions.performAction("actAssignScientists", { location: this.selectedLocation });
            }, {
                disabled: !locationSelected,
                tooltip: locationSelected
                    ? _("Assign all your scientists to the selected location.")
                    : _("Select a location to assign your scientists."),
            });
            this.addUndoActionButton(assignArgs?.canUndo ?? this.cachedUndoCanUndo, assignArgs?.undoType ?? this.cachedUndoType);
        }
    }
    async notif_observeAnimal(_args) {
        const prev = this.gamedatas.boardState;
        try {
            await this.optionalUi?.playObserveResolution(prev, _args);
        }
        catch (_) { /* keep state apply */ }
        this.optionalUi?.playSound('success');
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.renderAll();
    }
    async notif_takeAnimal(_args) {
        const prev = this.gamedatas.boardState;
        const args = _args?.args ?? _args;
        try {
            await this.optionalUi?.playTakeResolution(prev, args);
        }
        catch (_) { /* keep state apply */ }
        if (args.boardState) {
            this.gamedatas.boardState = args.boardState;
        }
        this.selectedPoolSlot = null;
        this.renderAll();
    }
    async notif_mulliganPool(_args) {
        const prev = this.gamedatas.boardState;
        const args = _args?.args ?? _args;
        try {
            await this.optionalUi?.playMulliganPoolResolution(prev, args);
        }
        catch (_) { /* keep state apply */ }
        if (args.boardState) {
            this.gamedatas.boardState = args.boardState;
        }
        this.renderAll();
        const pid = Number(args.player_id ?? args.playerId ?? 0);
        const ctr = this.bga.playerPanels.getScoreCounter(pid);
        ctr.incValue(-1);
    }
    async notif_mulliganHand(_args) {
        const prev = this.gamedatas.boardState;
        const args = _args?.args ?? _args;
        try {
            await this.optionalUi?.playMulliganHandResolution(prev, args);
        }
        catch (_) { /* keep state apply */ }
        if (args.boardState) {
            this.gamedatas.boardState = args.boardState;
        }
        this.selectedRegroupIds.clear();
        this.renderAll();
    }
    async notif_actionUndone(_args) {
        this.optionalUi?.clearHolding();
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.renderAll();
        this.syncScoresFromBoardState(this.gamedatas.boardState);
    }
    async notif_regroup(_args) {
        const prev = this.gamedatas.boardState;
        try {
            await this.optionalUi?.playRegroupResolution(prev, _args);
        }
        catch (_) { /* keep state apply */ }
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.campSelected = false;
        this.selectedRegroupIds.clear();
        this.renderAll();
        const pid = Number(_args.player_id ?? _args.playerId ?? 0);
        const vpGained = Number(_args.vp_from_camps ?? 0);
        const ctr = this.bga.playerPanels.getScoreCounter(pid);
        ctr.incValue(vpGained);
    }
    async notif_assignScientists(_args) {
        const prev = this.gamedatas.boardState;
        try {
            await this.optionalUi?.playAssignResolution(prev, _args);
        }
        catch (_) { /* keep state apply */ }
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.selectedLocation = null;
        this.campSelected = false;
        this.renderAll();
    }
    async notif_objectiveClaimed(_args) {
        this.optionalUi?.playSound('claim');
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
        // OPTIONAL: end-of-game statistics panel (client-side from public data)
        this.optionalUi?.showEndGameStats();
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
Game.CARD_REFERENCE_WIDTH_PX = 528;
Game.CARD_REFERENCE_HEIGHT_PX = 745;
Game.TOP_ROW_REFERENCE_WIDTH_PX = 6124;
Game.MIN_PLAYAREA_REFERENCE_WIDTH_PX = 3788 + 530 + 20;
Game.MIN_PLAYAREA_REFERENCE_HEIGHT_PX = 2600 + 1200 + 750 + 120 * 8 + 400;
Game.ANIMAL_SPRITE_COLUMNS = 11;
Game.ANIMAL_SPRITE_ROWS = 10;
Game.ANIMAL_SPRITE_LAST_INDEX = 100;
Game.OBJECTIVE_SPRITE_COLUMNS = 4;
Game.OBJECTIVE_SPRITE_ROWS = 4;
Game.OBJECTIVE_SPRITE_LAST_INDEX = 12;
Game.SCORING_SPRITE_COLUMNS = 4;
Game.SCORING_SPRITE_ROWS = 3;
Game.SCORING_SPRITE_LAST_INDEX = 10;
Game.ZOOM_STEP = 0.1;
Game.ZOOM_MIN = 0.4;

export { Game };
