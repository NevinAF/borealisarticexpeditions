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
function motionLayer(root, under = false) {
    const sel = under ? '.bae_motion_layer_under' : '.bae_motion_layer:not(.bae_motion_layer_under)';
    let layer = root.querySelector(sel);
    if (!layer) {
        layer = document.createElement('div');
        layer.className = under ? 'bae_motion_layer bae_motion_layer_under' : 'bae_motion_layer';
        root.appendChild(layer);
    }
    return layer;
}
function scientistMotionLayer(root) {
    let layer = root.querySelector('.bae_sci_motion_layer');
    if (!layer) {
        layer = document.createElement('div');
        layer.className = 'bae_sci_motion_layer';
        root.appendChild(layer);
    }
    return layer;
}
/** Higher on screen (and righter) stays behind; lower (and lefter) paints in front. */
function stackByScreenPosition(items) {
    const sorted = [...items].sort((a, b) => a.top - b.top || b.left - a.left);
    sorted.forEach((item, i) => {
        item.el.style.zIndex = String(i + 1);
    });
}
function clearMotionLayer(root) {
    root.querySelectorAll('.bae_motion_clone, .bae_invalid_bubble').forEach((el) => el.remove());
    document.querySelectorAll('body > .bae_motion_clone, body > .bae_invalid_bubble').forEach((el) => el.remove());
}
function localOffset(parent, left, top) {
    const origin = parent.getBoundingClientRect();
    const cs = getComputedStyle(parent);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;
    return {
        left: left - origin.left - bl + parent.scrollLeft,
        top: top - origin.top - bt + parent.scrollTop,
    };
}
function localRect(parent, r) {
    const loc = localOffset(parent, r.left, r.top);
    return { left: loc.left, top: loc.top, width: r.width, height: r.height };
}
function coordsInParent(parent, r) {
    return localRect(parent, r);
}
function offsetRect(r, dx, dy) {
    return new DOMRect(r.left + dx, r.top + dy, r.width, r.height);
}
function containingBlock(clone, fallback) {
    const parent = clone.offsetParent;
    return parent instanceof HTMLElement ? parent : fallback;
}
const previewAnchors = new WeakMap();
function baeScale(root) {
    const n = Number.parseFloat(getComputedStyle(root).getPropertyValue('--bae-scale'));
    return Number.isFinite(n) && n > 0 ? n : 0.12;
}
/** Pixel travel authored at --bae-scale 0.12, expressed as a scaled CSS length. */
function animDx(pxAt012) {
    return `calc(${(pxAt012 / 0.12).toFixed(4)}px * var(--bae-scale, 0.12))`;
}
/** Move a clone into `parent` without changing its on-screen position. */
function adoptClone(clone, parent) {
    const r = clone.getBoundingClientRect();
    parent.appendChild(clone);
    const loc = localRect(parent, r);
    clone.style.position = 'absolute';
    clone.style.left = `${loc.left}px`;
    clone.style.top = `${loc.top}px`;
    clone.style.width = `${loc.width}px`;
    clone.style.height = `${loc.height}px`;
    clone.style.margin = '0';
    clone.style.transform = 'none';
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
    const layer = motionLayer(root);
    const loc = localRect(layer, r);
    const clone = source.cloneNode(true);
    const extras = extraClass.split(/\s+/).filter(Boolean);
    clone.classList.add('bae_motion_clone', ...extras);
    clone.removeAttribute('id');
    clone.setAttribute('aria-hidden', 'true');
    stripChrome(clone);
    copySpriteVars(root, clone);
    copySpriteVars(source, clone);
    clone.style.position = 'absolute';
    clone.style.left = `${loc.left}px`;
    clone.style.top = `${loc.top}px`;
    clone.style.width = `${loc.width}px`;
    clone.style.height = `${loc.height}px`;
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '80';
    clone.style.opacity = '1';
    clone.style.transform = 'none';
    clone.style.transformOrigin = 'center center';
    layer.appendChild(clone);
    return clone;
}
function placeScientistClone(source, extraClass, root) {
    const clone = placeClone(source, extraClass, root);
    const layer = scientistMotionLayer(root);
    const r = clone.getBoundingClientRect();
    const loc = localRect(layer, r);
    clone.style.zIndex = '1';
    clone.style.left = `${loc.left}px`;
    clone.style.top = `${loc.top}px`;
    layer.appendChild(clone);
    return clone;
}
function placeCloneUnder(source, extraClass, root) {
    const clone = placeClone(source, extraClass, root);
    const layer = motionLayer(root, true);
    const r = clone.getBoundingClientRect();
    const loc = localRect(layer, r);
    clone.style.zIndex = '1';
    clone.style.left = `${loc.left}px`;
    clone.style.top = `${loc.top}px`;
    layer.appendChild(clone);
    return clone;
}
/** Fly a clone and leave it parked at the destination until the board re-renders. */
function flyClone(clone, to, durationMs, root, matchSize = false, destScale = 1, host) {
    if (host)
        adoptClone(clone, host);
    const parent = containingBlock(clone, root);
    const destW = to.width * destScale;
    const destH = to.height * destScale;
    const destLeft = to.left + (to.width - destW) / 2;
    const destTop = to.top + (to.height - destH) / 2;
    const parked = localOffset(parent, destLeft, destTop);
    const ease = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
    clone.style.transform = 'none';
    void clone.offsetWidth;
    clone.style.transition = matchSize
        ? `left ${durationMs}ms ${ease}, top ${durationMs}ms ${ease}, width ${durationMs}ms ${ease}, height ${durationMs}ms ${ease}`
        : `left ${durationMs}ms ${ease}, top ${durationMs}ms ${ease}`;
    clone.style.left = `${parked.left}px`;
    clone.style.top = `${parked.top}px`;
    if (matchSize) {
        clone.style.width = `${destW}px`;
        clone.style.height = `${destH}px`;
    }
    return wait(durationMs).then(() => {
        clone.style.transition = 'none';
    });
}
/** Fly a clone that fades in as it leaves the source. */
function flyCloneFadingIn(clone, to, durationMs, root, matchSize = false, destScale = 1, host) {
    if (host)
        adoptClone(clone, host);
    const parent = containingBlock(clone, root);
    const destW = to.width * destScale;
    const destH = to.height * destScale;
    const destLeft = to.left + (to.width - destW) / 2;
    const destTop = to.top + (to.height - destH) / 2;
    const parked = localOffset(parent, destLeft, destTop);
    const ease = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
    const fadeMs = Math.max(1, Math.round(durationMs * 0.32));
    clone.style.transform = 'none';
    clone.style.opacity = '0';
    void clone.offsetWidth;
    clone.style.transition = matchSize
        ? `left ${durationMs}ms ${ease}, top ${durationMs}ms ${ease}, width ${durationMs}ms ${ease}, height ${durationMs}ms ${ease}, opacity ${fadeMs}ms ease-out`
        : `left ${durationMs}ms ${ease}, top ${durationMs}ms ${ease}, opacity ${fadeMs}ms ease-out`;
    clone.style.left = `${parked.left}px`;
    clone.style.top = `${parked.top}px`;
    clone.style.opacity = '1';
    if (matchSize) {
        clone.style.width = `${destW}px`;
        clone.style.height = `${destH}px`;
    }
    return wait(durationMs).then(() => {
        clone.style.transition = 'none';
    });
}
/** Fly toward dest and fade out before arriving. */
function flyCloneFading(clone, to, durationMs, root, matchSize = false) {
    const parent = containingBlock(clone, root);
    const destLeft = to.left + (matchSize ? 0 : (to.width - clone.getBoundingClientRect().width) / 2);
    const destTop = to.top + (matchSize ? 0 : (to.height - clone.getBoundingClientRect().height) / 2);
    const parked = localOffset(parent, destLeft, destTop);
    const ease = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
    const fadeMs = Math.max(1, Math.round(durationMs * 0.62));
    clone.style.transform = 'none';
    void clone.offsetWidth;
    clone.style.transition = matchSize
        ? `left ${durationMs}ms ${ease}, top ${durationMs}ms ${ease}, width ${durationMs}ms ${ease}, height ${durationMs}ms ${ease}, opacity ${fadeMs}ms ease-in`
        : `left ${durationMs}ms ${ease}, top ${durationMs}ms ${ease}, opacity ${fadeMs}ms ease-in`;
    clone.style.left = `${parked.left}px`;
    clone.style.top = `${parked.top}px`;
    clone.style.opacity = '0';
    if (matchSize) {
        clone.style.width = `${to.width}px`;
        clone.style.height = `${to.height}px`;
    }
    return wait(durationMs).then(() => {
        clone.style.transition = 'none';
    });
}
/** Fly using destination coordinates already expressed in `host`'s local space. */
function flyCloneToLocal(clone, dest, durationMs, host, matchSize = false) {
    adoptClone(clone, host);
    const ease = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
    clone.style.transform = 'none';
    void clone.offsetWidth;
    clone.style.transition = matchSize
        ? `left ${durationMs}ms ${ease}, top ${durationMs}ms ${ease}, width ${durationMs}ms ${ease}, height ${durationMs}ms ${ease}`
        : `left ${durationMs}ms ${ease}, top ${durationMs}ms ${ease}`;
    clone.style.left = `${dest.left}px`;
    clone.style.top = `${dest.top}px`;
    if (matchSize) {
        clone.style.width = `${dest.width}px`;
        clone.style.height = `${dest.height}px`;
    }
    return wait(durationMs).then(() => {
        clone.style.transition = 'none';
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
    return startTrailToRect(source, dest.getBoundingClientRect(), durationMs, root, extraClass, () => dest.isConnected ? dest.getBoundingClientRect() : null);
}
/** Leave a faded scientist in place and loop an opaque copy toward the destination. */
function startScientistTrail(source, dest, durationMs, root) {
    source.classList.add('bae_preview_fade_left');
    source.style.setProperty('--dur', `${Math.max(1, durationMs)}ms`);
    return startTrailToRect(source, dest.getBoundingClientRect(), durationMs, root, 'bae_sci_mover', () => dest.isConnected ? dest.getBoundingClientRect() : null);
}
function startScientistTrailToRect(source, to, durationMs, root, destFn) {
    source.classList.add('bae_preview_fade_left');
    source.style.setProperty('--dur', `${Math.max(1, durationMs)}ms`);
    return startTrailToRect(source, to, durationMs, root, 'bae_sci_mover', destFn);
}
function startTrailToRect(source, to, durationMs, root, extraClass = '', destFn) {
    const from = source.getBoundingClientRect();
    const layer = motionLayer(root);
    const loc = localRect(layer, from);
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
    clone.style.left = `${loc.left}px`;
    clone.style.top = `${loc.top}px`;
    clone.style.width = `${loc.width}px`;
    clone.style.height = `${loc.height}px`;
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '70';
    clone.style.transform = 'none';
    clone.style.setProperty('--from-l', `${loc.left}px`);
    clone.style.setProperty('--from-t', `${loc.top}px`);
    clone.style.setProperty('--to-l', `${loc.left + dx}px`);
    clone.style.setProperty('--to-t', `${loc.top + dy}px`);
    clone.style.setProperty('--dur', `${Math.max(1, durationMs)}ms`);
    layer.appendChild(clone);
    previewAnchors.set(clone, {
        source,
        dest: destFn ?? (() => to),
    });
    return clone;
}
function bindPreviewFollow(clone, follow) {
    const anchor = previewAnchors.get(clone);
    if (anchor)
        anchor.follow = follow;
}
/** Static clone parked at a destination (card placement preview). */
function placeCloneAt(source, extraClass, root, at) {
    const clone = placeClone(source, extraClass, root);
    const parked = localRect(containingBlock(clone, root), at);
    clone.style.left = `${parked.left}px`;
    clone.style.top = `${parked.top}px`;
    clone.style.width = `${parked.width}px`;
    clone.style.height = `${parked.height}px`;
    return clone;
}
/** Soft, slow discard preview: ghost only, real card stays put. */
function startDiscardGhost(source, root, cardId) {
    const clone = placeClone(source, 'bae_discard_ghost', root);
    clone.style.setProperty('--from-l', clone.style.left);
    clone.style.setProperty('--from-t', clone.style.top);
    clone.style.setProperty('--dur', '1.85s');
    clone.style.setProperty('--dx', animDx(-60));
    if (cardId != null)
        clone.dataset.previewCard = String(cardId);
    previewAnchors.set(clone, { source });
    return clone;
}
/** Recompute looping preview coords after layout/scale changes without restarting the loop. */
function retargetPreviewClones(root) {
    if (!root)
        return;
    root.querySelectorAll('.bae_discard_ghost, .bae_trail_ghost').forEach((node) => {
        const clone = node;
        const anchor = previewAnchors.get(clone);
        if (!anchor)
            return;
        const fromEl = (anchor.follow?.isConnected ? anchor.follow : anchor.source);
        if (!fromEl?.isConnected)
            return;
        copySpriteVars(root, clone);
        const fromBox = fromEl.getBoundingClientRect();
        const parent = containingBlock(clone, root);
        const sizeW = clone.offsetWidth || fromBox.width;
        const sizeH = clone.offsetHeight || fromBox.height;
        const from = anchor.follow
            ? new DOMRect(fromBox.left + fromBox.width / 2 - sizeW / 2, fromBox.top + fromBox.height / 2 - sizeH / 2, sizeW, sizeH)
            : fromBox;
        const loc = localRect(parent, from);
        clone.style.left = `${loc.left}px`;
        clone.style.top = `${loc.top}px`;
        clone.style.width = `${loc.width}px`;
        clone.style.height = `${loc.height}px`;
        clone.style.setProperty('--from-l', `${loc.left}px`);
        clone.style.setProperty('--from-t', `${loc.top}px`);
        const to = anchor.dest?.() ?? null;
        if (!to)
            return;
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        clone.style.setProperty('--to-l', `${loc.left + dx}px`);
        clone.style.setProperty('--to-t', `${loc.top + dy}px`);
    });
}
/** One-shot slide-off used when a hand card is actually discarded. */
function flyDiscardAway(source, root, durationMs) {
    const from = source.getBoundingClientRect();
    const clone = placeClone(source, 'bae_discard_resolve', root);
    clone.style.setProperty('--from-l', clone.style.left);
    clone.style.setProperty('--from-t', clone.style.top);
    clone.style.setProperty('--dur', `${Math.max(1, durationMs)}ms`);
    const minDx = (48 / 0.12) * baeScale(root);
    clone.style.setProperty('--dx', `${-Math.max(minDx, from.width * 0.4)}px`);
    source.style.visibility = 'hidden';
    return wait(durationMs).then(() => { clone.remove(); });
}
function freezeComputedMotion(el, root) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const parent = containingBlock(el, root);
    const { left, top } = localOffset(parent, r.left, r.top);
    el.classList.add('bae_preview_settling');
    el.style.animation = 'none';
    el.style.transition = 'none';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.transform = 'none';
    el.style.opacity = cs.opacity;
    void el.offsetWidth;
}
function freezeOpacityOnly(el) {
    const cs = getComputedStyle(el);
    el.classList.add('bae_preview_settling');
    el.style.animation = 'none';
    el.style.transition = 'none';
    el.style.opacity = cs.opacity;
    void el.offsetWidth;
}
/** Freeze looping previews at the current frame, then ease back toward rest. */
function freezeAndFadePreviews(root, durationMs = 320) {
    if (!root)
        return;
    const fadeMs = Math.max(1, durationMs);
    root.querySelectorAll('.bae_trail_ghost, .bae_discard_ghost').forEach((node) => {
        const el = node;
        freezeComputedMotion(el, root);
        el.style.transition = `opacity ${fadeMs}ms ease`;
        el.style.opacity = '0';
    });
    root.querySelectorAll('.bae_card_place_preview').forEach((node) => {
        const el = node;
        freezeOpacityOnly(el);
        el.style.transition = `opacity ${fadeMs}ms ease`;
        el.style.opacity = '0';
    });
    root.querySelectorAll('.bae_preview_fade_left').forEach((node) => {
        const el = node;
        freezeOpacityOnly(el);
        el.style.transition = `opacity ${fadeMs}ms ease`;
        el.style.opacity = '1';
        el.classList.remove('bae_preview_fade_left');
    });
}

/** OPTIONAL: VP token mix, shelf layout, and flights into the player VP zone. */
const TOKEN_REF_W = { 1: 233, 3: 257, 5: 292 };
const ZONE_REF_W = 528;
const CARD_REF_H = 745;
const CARD_SHIFT_Y = 170;
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
function playerVp(vps, pid) {
    const raw = vps?.[pid]
        ?? vps?.[String(pid)];
    return Math.max(0, Math.floor(Number(raw?.score ?? raw ?? 0)));
}
/** Fewest tokens, preferring 5s then 3s then 1s (6 → 5+1, not 3+3). */
function optimalTokens(vp) {
    const out = [];
    let rem = Math.max(0, Math.floor(vp));
    while (rem >= 5) {
        out.push(5);
        rem -= 5;
    }
    while (rem >= 3) {
        out.push(3);
        rem -= 3;
    }
    while (rem >= 1) {
        out.push(1);
        rem -= 1;
    }
    return out;
}
function tokensSum(tokens) {
    return tokens.reduce((sum, n) => sum + n, 0);
}
/** Break a 3 or 5 so the mix contains at least one 1VP token. */
function ensureHasOne(tokens) {
    if (tokens.includes(1))
        return tokens;
    const i3 = tokens.indexOf(3);
    if (i3 >= 0) {
        const next = [...tokens];
        next.splice(i3, 1, 1, 1, 1);
        return next;
    }
    const i5 = tokens.indexOf(5);
    if (i5 >= 0) {
        const next = [...tokens];
        next.splice(i5, 1, 3, 1, 1);
        return next;
    }
    return tokens;
}
function vpGrid(n) {
    const cols = n <= 3 ? 1 : n <= 7 ? 2 : 3;
    const rows = Math.max(4, Math.ceil(n / cols));
    const add_rows = rows - Math.max(1, Math.ceil(n / cols));
    return { cols, rows, add_rows };
}
function vpTokenLayout(n, playerId) {
    if (n <= 0)
        return [];
    const { cols, rows, add_rows } = vpGrid(n);
    const out = [];
    for (let i = 0; i < n; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols) + add_rows;
        const jitterX = ((i * 7 + 13 * playerId) % 5) - 2;
        const jitterY = ((i * 11 + 19 * playerId) % 5) - 2;
        const leftPct = clamp(((col + 1) / (cols + 1)) * 100 + jitterX * 0.35, 28, 72);
        const topPct = clamp(((row + 1) / (rows + 1)) * 100 + jitterY * 0.3, 10, 90);
        out.push({ leftPct, topPct, col, row, cols, rows });
    }
    return out;
}
function vpTokenZIndex(slot) {
    return slot.col * slot.rows + (slot.rows - 1 - slot.row) + 1;
}
function vpTokensInnerHtml(pid, tokens, baseUrl) {
    const slots = vpTokenLayout(tokens.length, pid);
    return tokens.map((value, i) => {
        const slot = slots[i];
        return `<img class="bae_vp_token bae_vp_token_${value}" data-vp="${value}" data-col="${slot.col}" data-row="${slot.row}" src="${baseUrl}Tokens/${value}VPToken.png" alt="" draggable="false" style="left:${slot.leftPct.toFixed(1)}%;top:${slot.topPct.toFixed(1)}%;z-index:${vpTokenZIndex(slot)}"/>`;
    }).join('');
}
function animalCardVpOrigin(card) {
    const r = card.getBoundingClientRect();
    const strip = r.height * (CARD_SHIFT_Y / CARD_REF_H);
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height - strip / 2;
    return new DOMRect(cx - 1, cy - 1, 2, 2);
}
function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}
function assignMatches(oldVals, next) {
    const used = new Set();
    const keep = [];
    const drop = [];
    for (let i = 0; i < oldVals.length; i++) {
        let found = -1;
        for (let j = 0; j < next.length; j++) {
            if (used.has(j) || next[j] !== oldVals[i])
                continue;
            found = j;
            break;
        }
        if (found >= 0) {
            used.add(found);
            keep.push({ oldI: i, nextI: found });
        }
        else {
            drop.push(i);
        }
    }
    const add = [];
    for (let j = 0; j < next.length; j++) {
        if (!used.has(j))
            add.push(j);
    }
    return { keep, drop, add };
}
class VpTokens {
    constructor(host) {
        this.host = host;
        this.mix = new Map();
    }
    tokensFor(pid) {
        const vp = playerVp(this.host.gamedatas.boardState.vps, pid);
        const current = this.mix.get(pid);
        if (current && tokensSum(current) === vp)
            return current;
        const next = optimalTokens(vp);
        this.mix.set(pid, next);
        return next;
    }
    zone(pid) {
        return this.host.root?.querySelector(`#bae_vp_tokens_${pid}`);
    }
    shelf(pid) {
        return this.host.root?.querySelector(`#bae_vp_tokens_${pid} .bae_vp_token_shelf`);
    }
    async addIncoming(pid, incoming, sources, ms, convertAfter) {
        if (incoming.length === 0)
            return;
        const current = this.liveMix(pid);
        const next = [...current, ...incoming];
        const slots = vpTokenLayout(next.length, pid);
        const oldEls = this.tokenEls(pid);
        const dests = incoming.map((value, i) => this.slotRect(pid, slots[current.length + i], value));
        const spawned = [];
        incoming.forEach((value, i) => {
            const from = sources[i] ?? sources.find((r) => r) ?? null;
            const to = dests[i];
            const slot = slots[current.length + i];
            if (!from || !to || !slot)
                return;
            spawned.push({ clone: this.spawnFlyingToken(value, from, to), from, to, slot });
        });
        spawned.forEach((it) => { it.clone.style.zIndex = String(80 + vpTokenZIndex(it.slot)); });
        await Promise.all([
            this.applyLayout(oldEls, slots.slice(0, oldEls.length), ms),
            ...spawned.map((it) => flyCloneFadingIn(it.clone, it.to, ms, this.host.root, true).then(() => { it.clone.remove(); })),
        ]);
        incoming.forEach((value, i) => this.mountToken(pid, value, slots[current.length + i]));
        this.mix.set(pid, next);
        if (convertAfter) {
            if (ms > 0)
                await wait(250);
            await this.convertTo(pid, optimalTokens(tokensSum(next)), ms);
        }
    }
    async spendOneTo(pid, dest, ms) {
        let mix = this.liveMix(pid);
        if (!mix.includes(1)) {
            await this.convertTo(pid, ensureHasOne(mix), ms);
            mix = this.liveMix(pid);
        }
        const els = this.tokenEls(pid);
        const idx = els.findIndex((el) => Number(el.dataset.vp) === 1);
        if (idx < 0 || !dest) {
            this.mix.set(pid, mix.slice(0, Math.max(0, mix.length - 1)));
            return;
        }
        const one = els[idx];
        const remainEls = els.filter((_, i) => i !== idx);
        const remaining = mix.filter((_, i) => i !== idx);
        const slots = vpTokenLayout(remaining.length, pid);
        const clone = placeClone(one, 'bae_resolve_clone bae_vp_token', this.host.root);
        one.remove();
        await Promise.all([
            flyCloneFading(clone, dest, ms, this.host.root, false),
            this.applyLayout(remainEls, slots, ms),
        ]);
        clone.remove();
        this.mix.set(pid, remaining);
    }
    async convertToOptimal(pid, ms) {
        if (ms > 0)
            await wait(250);
        await this.convertTo(pid, optimalTokens(tokensSum(this.liveMix(pid))), ms);
    }
    previewOnesFrom(pid, sources, ms) {
        this.previewTokensFrom(pid, sources, 1, ms);
    }
    previewTokensFrom(pid, sources, value, ms) {
        if (sources.length === 0 || ms <= 0)
            return;
        const current = this.tokensFor(pid);
        const next = [...current, ...sources.map(() => value)];
        const slots = vpTokenLayout(next.length, pid);
        const destSlots = slots.slice(current.length);
        const layer = motionLayer(this.host.root);
        sources.forEach((src, i) => {
            const destSlot = destSlots[i];
            if (!destSlot)
                return;
            const size = this.tokenPixelSize(pid, value);
            const srcR = src.getBoundingClientRect();
            const from = new DOMRect(srcR.left + srcR.width / 2 - size.w / 2, srcR.top + srcR.height / 2 - size.h / 2, size.w, size.h);
            const dummy = this.createTokenEl(value);
            dummy.style.position = 'absolute';
            dummy.style.transform = 'none';
            dummy.style.margin = '0';
            dummy.style.pointerEvents = 'none';
            const loc = coordsInParent(layer, from);
            dummy.style.left = `${loc.left}px`;
            dummy.style.top = `${loc.top}px`;
            dummy.style.width = `${size.w}px`;
            dummy.style.height = `${size.h}px`;
            layer.appendChild(dummy);
            const destFn = () => this.slotRect(pid, destSlot, value);
            const dest = destFn() ?? from;
            const clone = startTrailToRect(dummy, dest, ms, this.host.root, 'bae_vp_mover', destFn);
            bindPreviewFollow(clone, src);
            dummy.remove();
        });
    }
    liveMix(pid) {
        const live = this.tokenEls(pid)
            .map((el) => Number(el.dataset.vp))
            .filter((n) => n === 1 || n === 3 || n === 5);
        if (live.length > 0)
            return live;
        return this.mix.get(pid) ?? this.tokensFor(pid);
    }
    tokenEls(pid) {
        return Array.from(this.shelf(pid)?.querySelectorAll('.bae_vp_token') ?? []);
    }
    createTokenEl(value) {
        const img = document.createElement('img');
        img.className = `bae_vp_token bae_vp_token_${value}`;
        img.dataset.vp = String(value);
        img.src = `${this.host.bga.images.getImgUrl()}Tokens/${value}VPToken.png`;
        img.alt = '';
        img.draggable = false;
        return img;
    }
    mountToken(pid, value, slot) {
        const shelf = this.shelf(pid);
        if (!shelf)
            return;
        const el = this.createTokenEl(value);
        this.writeSlot(el, slot);
        shelf.appendChild(el);
        this.restack(pid);
    }
    restack(pid, count) {
        const n = count ?? this.tokenEls(pid).length;
        const { rows } = vpGrid(n);
        this.tokenEls(pid).forEach((el) => {
            if (el.style.opacity === '0')
                return;
            const col = Number(el.dataset.col ?? 0);
            const row = Number(el.dataset.row ?? 0);
            el.style.zIndex = String(vpTokenZIndex({ col, row, rows }));
        });
    }
    writeSlot(el, slot) {
        el.style.left = `${slot.leftPct}%`;
        el.style.top = `${slot.topPct}%`;
        el.dataset.col = String(slot.col);
        el.dataset.row = String(slot.row);
    }
    slotRect(pid, slot, value) {
        const shelf = this.shelf(pid);
        if (!shelf)
            return null;
        const probe = this.createTokenEl(value);
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        probe.style.left = `${slot.leftPct}%`;
        probe.style.top = `${slot.topPct}%`;
        shelf.appendChild(probe);
        const rect = probe.getBoundingClientRect();
        probe.remove();
        if (rect.width < 1 || rect.height < 1) {
            const box = shelf.getBoundingClientRect();
            const size = this.tokenPixelSize(pid, value);
            const cx = box.left + box.width * slot.leftPct / 100;
            const cy = box.top + box.height * slot.topPct / 100;
            return new DOMRect(cx - size.w / 2, cy - size.h / 2, size.w, size.h);
        }
        return rect;
    }
    tokenPixelSize(pid, value) {
        const box = this.shelf(pid)?.getBoundingClientRect();
        const w = (box?.width || ZONE_REF_W) * (TOKEN_REF_W[value] / ZONE_REF_W);
        return { w, h: w };
    }
    applyLayout(els, slots, ms) {
        els.forEach((el, i) => {
            const slot = slots[i];
            if (!slot)
                return;
            el.style.transition = ms > 0
                ? `left ${ms}ms ${EASE}, top ${ms}ms ${EASE}`
                : 'none';
            this.writeSlot(el, slot);
        });
        const pid = Number(els[0]?.closest('[data-player-id]')?.getAttribute('data-player-id') ?? 0);
        if (pid)
            this.restack(pid);
        return wait(ms);
    }
    async convertTo(pid, next, ms) {
        const shelf = this.shelf(pid);
        if (!shelf) {
            this.mix.set(pid, next);
            return;
        }
        const oldEls = this.tokenEls(pid);
        const oldVals = oldEls
            .map((el) => Number(el.dataset.vp))
            .filter((n) => n === 1 || n === 3 || n === 5);
        if (sameMix(oldVals, next)) {
            this.mix.set(pid, next);
            return;
        }
        const slots = vpTokenLayout(next.length, pid);
        const { keep, drop, add } = assignMatches(oldVals, next);
        const fade = Math.max(120, Math.round(ms * 0.7));
        keep.forEach(({ oldI, nextI }) => {
            const el = oldEls[oldI];
            const slot = slots[nextI];
            if (!el || !slot)
                return;
            el.style.transition = ms > 0
                ? `left ${ms}ms ${EASE}, top ${ms}ms ${EASE}`
                : 'none';
            this.writeSlot(el, slot);
        });
        drop.forEach((oldI) => {
            const el = oldEls[oldI];
            if (!el)
                return;
            el.style.transition = `opacity ${fade}ms ease`;
            el.style.opacity = '0';
        });
        const added = [];
        add.forEach((nextI) => {
            const slot = slots[nextI];
            const value = next[nextI];
            if (!slot || !value)
                return;
            const el = this.createTokenEl(value);
            this.writeSlot(el, slot);
            el.style.opacity = '0';
            el.style.transition = `opacity ${fade}ms ease`;
            shelf.appendChild(el);
            added.push(el);
        });
        void shelf.offsetWidth;
        added.forEach((el) => { el.style.opacity = '1'; });
        this.restack(pid, next.length);
        await wait(Math.max(ms, fade));
        drop.forEach((oldI) => oldEls[oldI]?.remove());
        this.restack(pid);
        this.mix.set(pid, next);
    }
    spawnFlyingToken(value, from, to) {
        const w = to.width > 1 ? to.width : this.tokenPixelSize(0, value).w;
        const h = to.height > 1 ? to.height : w;
        const start = new DOMRect(from.left + from.width / 2 - w / 2, from.top + from.height / 2 - h / 2, w, h);
        const img = this.createTokenEl(value);
        img.classList.add('bae_motion_clone', 'bae_resolve_clone');
        img.style.position = 'absolute';
        img.style.transform = 'none';
        img.style.margin = '0';
        img.style.pointerEvents = 'none';
        img.style.zIndex = '80';
        img.style.opacity = '0';
        const layer = motionLayer(this.host.root);
        const loc = coordsInParent(layer, start);
        img.style.left = `${loc.left}px`;
        img.style.top = `${loc.top}px`;
        img.style.width = `${w}px`;
        img.style.height = `${h}px`;
        layer.appendChild(img);
        return img;
    }
}
function sameMix(a, b) {
    if (a.length !== b.length)
        return false;
    const left = [...a].sort((x, y) => y - x);
    const right = [...b].sort((x, y) => y - x);
    return left.every((n, i) => n === right[i]);
}
function scoringStepAmount(args) {
    if (args.amount != null && args.amount !== '')
        return Number(args.amount);
    return Number(args.amount_left ?? 0) + Number(args.amount_mid ?? 0) + Number(args.amount_right ?? 0);
}
function scoringStepKind(args) {
    const direct = String(args.scoring_kind ?? args.kind ?? '');
    if (direct)
        return direct;
    const anchor = String(args.anchor_id ?? '');
    if (anchor.includes('animal_loc_vp'))
        return 'species_sets';
    if (anchor.includes('bae_track_'))
        return 'exploration_track';
    if (anchor.includes('bae_pile_'))
        return 'animal_card';
    if (anchor.includes('bae_score_'))
        return 'scoring_card';
    if (args.scoring_id != null || args.scoring_name != null || args.scoring_index != null)
        return 'scoring_card';
    if (args.card_id != null || args.slot != null)
        return 'animal_card';
    if (args.flag_space != null)
        return 'exploration_track';
    return '';
}

/** OPTIONAL preference ids (gamepreferences.jsonc). */
const PREF_ANIM_SPEED = 100;
const PREF_PREVIEWS = 101;
const PREF_CONFIRM = 102;
const PREF_SOUND = 103;
const MAX_LOCATION_CARDS = 7;
/**
 * OPTIONAL: Client-only UX (subtle previews, resolution motion, invalid-action hints, DnD, sound).
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
        this.pendingDiscard = new Map();
        this.discardLoopEpoch = 0;
        this.tooltipBound = false;
        this.tooltipLeaveSelector = null;
        this.tooltipQuietUntil = 0;
        this.tooltipNeedMove = false;
        this.tooltipClickX = 0;
        this.tooltipClickY = 0;
        this.tooltipWasBlocked = false;
        this.tooltipRetrigger = false;
        this.tooltipPointerHeld = false;
        this.tooltipDragging = false;
        this.tooltipPinnedId = null;
        this.lastPointerWasTouch = false;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.suppressClickUntil = 0;
        this.pointerDrag = null;
        this.lastHoverEl = null;
        this.previewLocked = false;
        this.lastClaimFlightKey = '';
        this.roundBadgeForced = null;
        this.roundBadgeCompact = false;
        this.touchHitEl = null;
        this.touchHitBox = null;
        this.layoutChromeRaf = 0;
        this.tooltipFitTimers = [];
        this.tooltipFitGen = 0;
        this.vp = new VpTokens(host);
    }
    vpTokensFor(pid) {
        return this.vp.tokensFor(pid);
    }
    afterRender() {
        this.previewLocked = false;
        this.teardown();
        if (!this.host.root)
            return;
        this.bindTooltipGate();
        this.applyPreferenceCss();
        this.renderRoundBadge();
        this.bindDragAndDrop();
        this.restoreHoldingFromState();
        this.renderRegroupHold();
        this.host.refreshScientistTooltips();
        if (this.isTooltipBlocked())
            this.cancelDojoTooltips();
        this.updateActionPreviews();
        this.bindPreferenceListener();
        this.scheduleLayoutChrome();
    }
    teardown() {
        this.cancelPointerDrag();
        this.clearTouchHit();
        this.clearTooltipFitTimers();
        document.body.classList.remove('bae_tooltip_placing');
        this.touchHitBox?.remove();
        this.touchHitBox = null;
        for (const fn of this.cleanupFns) {
            try {
                fn();
            }
            catch (_) { /* ignore */ }
        }
        this.cleanupFns = [];
        this.clearPreviews();
    }
    onActionSubmitted() {
        this.previewLocked = true;
        this.pendingDiscard.forEach((id) => window.clearTimeout(id));
        this.pendingDiscard.clear();
        this.discardLoopEpoch = 0;
        freezeAndFadePreviews(this.host.root);
    }
    onSelectionChanged() {
        if (this.previewLocked)
            return;
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
    onBoardScaleChanged() {
        this.scheduleLayoutChrome();
        if (this.previewLocked || this.resolving)
            return;
        retargetPreviewClones(this.host.root);
    }
    isObserveSelectionLegal() {
        const cardId = this.host.selectedCardId;
        const location = this.host.selectedLocation;
        if (cardId == null || location == null || this.host.campSelected)
            return false;
        const myId = Number(this.host.bga.players.getCurrentPlayerId());
        return canObserveAtLocation(this.host.animalDef(cardId), this.host.gamedatas.boardState.scientists, myId, location);
    }
    /** Invalid observe is shown as a red location outline and missing-scientist X previews. */
    showInvalidObserveHint() {
        this.updateActionPreviews();
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
    previewLoopMs() {
        return Math.max(1000, Math.round(this.duration() * 4));
    }
    prepareResolution(zones = ['all'], keepRegroupSelection = false) {
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
        }
        else {
            this.host.root.querySelectorAll('.bae_card_selected').forEach((el) => {
                el.classList.remove('bae_card_selected');
            });
        }
        this.host.root.querySelectorAll('.bae_loc_selected').forEach((el) => el.classList.remove('bae_loc_selected'));
        this.host.root.querySelectorAll('.bae_confirm_blurb').forEach((el) => el.remove());
    }
    endResolution() {
        this.resolving = false;
        this.endTooltipGuard();
    }
    async playObserveResolution(prev, args) {
        const ms = this.duration();
        if (ms === 0 || this.resolving)
            return;
        this.resolving = true;
        const pid = Number(args.player_id ?? args.playerId ?? 0);
        this.prepareResolution([`player:${pid}`]);
        try {
            const cardId = Number(args.card_id ?? NaN);
            const loc = Number(args.location ?? NaN);
            if (!Number.isFinite(pid) || !Number.isFinite(cardId) || loc < 0 || loc > 2)
                return;
            const root = this.host.root;
            const cardEl = this.cardEl(pid, cardId);
            const pileDest = this.nextPileDest(pid, loc);
            const slots = this.expandLocationOutline(pid, loc, ms);
            const remaining = this.handCards(pid).filter((el) => el !== cardEl);
            if (cardEl && pileDest) {
                const clone = placeClone(cardEl, 'bae_resolve_clone bae_resolve_card', root);
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
            }
            else {
                await this.compactHandToSlots(remaining, slots, ms);
            }
            const def = this.host.animalDef(cardId);
            const nextState = args.boardState;
            if (def) {
                await this.animateScientists(pid, nextState?.scientists ?? prev.scientists, ms);
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
                    if (destRect)
                        await flyClone(clone, destRect, Math.round(ms * 0.9), root, false, 1, destCell);
                }
                else {
                    this.placeDenyX(flagEl, Math.round(ms * 0.85), false);
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
        this.prepareResolution([`player:${pid}`]);
        try {
            const discarded = args.discarded ?? [];
            const leftHold = this.ensureRegroupHold(pid, 'left');
            const rightHold = this.ensureRegroupHold(pid, 'right');
            const leftCamp = this.host.root.querySelector(`#bae_camp_${pid}_left`);
            const rightCamp = this.host.root.querySelector(`#bae_camp_${pid}_right`);
            const leftMeeples = Array.from(this.shelfEl(pid, 3)?.querySelectorAll('.bae_meeple_img') ?? []);
            const rightMeeples = Array.from(this.shelfEl(pid, 4)?.querySelectorAll('.bae_meeple_img') ?? []);
            const allMeeples = [...leftMeeples, ...rightMeeples];
            const vpOnes = allMeeples.map(() => 1);
            const vpSources = allMeeples.map((el) => el.getBoundingClientRect());
            const stackItems = [];
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
            await this.animateHandReplace(pid, discarded, prev, args.boardState, ms);
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
        this.prepareResolution([`player:${pid}`]);
        try {
            if (loc < 0 || loc > 2)
                return;
            if (!this.shelfEl(pid, loc))
                return;
            const nextSci = args.boardState?.scientists ?? _prev.scientists;
            await this.animateScientists(pid, nextSci, ms);
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
        const pid = Number(args.player_id ?? args.playerId ?? 0);
        this.prepareResolution(['pool', `player:${pid}`]);
        try {
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
            const myId = Number(this.host.bga.players.getCurrentPlayerId());
            if (!fromDeck && pid !== myId) {
                await this.crossfadeToCardBack(clone, ms);
            }
            if (fromDeck)
                return;
            await wait(Math.round(ms * 0.2));
            if (deck) {
                const nextPool = args.boardState?.pool;
                const refillId = nextPool?.find((p) => Number(p.slot) === slot)?.id;
                const refill = this.cloneForHandDraw(deck, refillId);
                await flyClone(refill, hole, ms, root, true);
            }
        }
        finally {
            this.endResolution();
        }
    }
    async playMulliganPoolResolution(_prev, args) {
        const ms = this.duration();
        if (ms === 0 || this.resolving)
            return;
        this.resolving = true;
        const pid = Number(args.player_id ?? args.playerId ?? 0);
        this.prepareResolution(['pool', `player:${pid}`]);
        try {
            const root = this.host.root;
            const pool = root.querySelector('.bae_pool');
            const poolRect = pool?.getBoundingClientRect() ?? this.deckEl()?.getBoundingClientRect() ?? null;
            if (pid && poolRect)
                await this.vp.spendOneTo(pid, poolRect, ms);
            const deck = this.deckEl();
            const cards = this.poolCards();
            const dests = cards.map((el) => ({
                rect: el.getBoundingClientRect(),
                slot: Number(el.dataset.poolSlot),
            }));
            if (!deck)
                return;
            await Promise.all(cards.map((el) => {
                const clone = placeCloneUnder(el, 'bae_resolve_clone bae_resolve_card', root);
                el.style.visibility = 'hidden';
                return flyClone(clone, deck.getBoundingClientRect(), ms, root, true, 0.95);
            }));
            await wait(Math.round(ms * 0.15));
            const nextPool = args.boardState?.pool ?? [];
            await Promise.all(dests.map((dest, i) => {
                return wait(Math.round(ms * 0.33 * i)).then(() => {
                    const id = nextPool.find((p) => Number(p.slot) === dest.slot)?.id;
                    const refill = this.cloneForHandDraw(deck, id);
                    return flyClone(refill, dest.rect, ms, root, true);
                });
            }));
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
        const pid = Number(args.player_id ?? args.playerId ?? 0);
        const myId = Number(this.host.bga.players.getCurrentPlayerId());
        const keepRegroupSelection = this.host.isOpeningMulliganLike() && pid !== myId;
        this.prepareResolution([`player:${pid}`], keepRegroupSelection);
        try {
            const discarded = args.discarded ?? [];
            await this.animateHandReplace(pid, discarded, prev, args.boardState, ms);
        }
        finally {
            this.endResolution();
        }
    }
    async playObjectiveClaimResolution(_prev, args) {
        const ms = this.duration();
        const pid = Number(args.player_id ?? args.playerId ?? 0);
        const idx = Number(args.objective_index ?? args.objectiveIndex ?? NaN);
        const key = `${pid}:${Number.isFinite(idx) ? idx : 'x'}`;
        if (this.lastClaimFlightKey === key)
            return;
        if (ms === 0 || this.resolving || !pid)
            return;
        this.lastClaimFlightKey = key;
        this.resolving = true;
        this.prepareResolution([`player:${pid}`]);
        try {
            const obj = Number.isFinite(idx)
                ? this.host.root.querySelector(`#bae_obj_${idx}`)
                : this.host.root.querySelector('.bae_obj_selected, .bae_obj_prompt_target');
            const from = rectOf(obj)
                ?? rectOf(this.host.root.querySelector('.bae_top_objectives'));
            await this.vp.addIncoming(pid, [5], [from], ms, false);
        }
        finally {
            this.endResolution();
        }
    }
    async playScoringStepResolution(_prev, args) {
        const base = this.duration();
        const ms = base === 0 ? 0 : Math.round(base + 200);
        const pid = Number(args.player_id ?? args.playerId ?? 0);
        if (ms === 0 || this.resolving || !pid)
            return;
        const flights = this.scoringTokenFlights(pid, args);
        if (flights.length === 0)
            return;
        this.resolving = true;
        this.prepareResolution([`player:${pid}`]);
        try {
            await this.vp.addIncoming(pid, flights.map((f) => f.value), flights.map((f) => f.from), ms, true);
            await wait(500);
        }
        finally {
            this.endResolution();
        }
    }
    scoringTokenFlights(pid, args) {
        const kind = scoringStepKind(args);
        const out = [];
        const push = (amount, from) => {
            if (amount <= 0 || !from)
                return;
            for (const value of optimalTokens(amount))
                out.push({ value, from });
        };
        const locOf = () => Number(args.location ?? args.loc ?? 0);
        const amounts = () => [
            Number(args.amount_left ?? 0),
            Number(args.amount_mid ?? 0),
            Number(args.amount_right ?? 0),
        ];
        if (kind === 'species_sets') {
            const from = this.speciesSetOrigin(pid);
            if (args.amount_left != null || args.amount_mid != null || args.amount_right != null) {
                amounts().forEach((amount) => push(amount, from));
            }
            else {
                push(Number(args.amount ?? 0), from);
            }
            return out;
        }
        if (kind === 'exploration_track') {
            const flags = this.host.gamedatas.boardState.flags?.[pid] ?? {};
            const flagAt = (loc) => Number(args.flag_space
                ?? flags[loc]
                ?? flags[String(loc)]
                ?? 0);
            if (args.amount_left != null || args.amount_mid != null || args.amount_right != null) {
                amounts().forEach((amount, loc) => push(amount, this.trackVpOrigin(pid, loc, flagAt(loc))));
            }
            else {
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
    speciesSetOrigin(pid) {
        const track = this.host.root.querySelector(`#bae_animal_loc_vp_${pid}`);
        return rectOf(track) ?? this.locationZoneRect(pid, 2);
    }
    trackVpOrigin(pid, loc, space) {
        const flag = this.flagEl(pid, loc, space);
        const cell = this.trackEl(pid, loc, space);
        return rectOf(flag) ?? rectOf(cell) ?? this.locationZoneRect(pid, loc);
    }
    animalCardVpOriginRect(pid, loc, slot, args) {
        const card = this.host.root.querySelector(`#bae_pile_${pid}_${loc}_${slot}`)
            ?? (args.card_id != null
                ? this.host.root.querySelector(`#bae_pile_${pid}_${loc}_${Number(args.card_id)}`)
                : null);
        if (card)
            return animalCardVpOrigin(card);
        return this.locationZoneRect(pid, loc);
    }
    scoringCardOrigin(args) {
        const scoringId = Number(args.scoring_id ?? args.scoringId ?? NaN);
        const idx = Number.isFinite(Number(args.scoring_index))
            ? Number(args.scoring_index)
            : (this.host.gamedatas.boardState.scoring_cards ?? []).findIndex((id) => Number(id) === scoringId);
        const card = this.host.root.querySelector(`#bae_score_${idx}`);
        return rectOf(card);
    }
    originFromAnchor(anchorId, pid, args) {
        if (!anchorId || anchorId === `bae_playerboard_${pid}`)
            return null;
        const pile = /^bae_pile_(\d+)_(\d+)_(\d+)$/.exec(anchorId);
        if (pile)
            return this.animalCardVpOriginRect(Number(pile[1]), Number(pile[2]), Number(pile[3]), args);
        const track = /^bae_track_(\d+)_(\d+)_(\d+)$/.exec(anchorId);
        if (track)
            return this.trackVpOrigin(Number(track[1]), Number(track[2]), Number(track[3]));
        const el = (this.host.root.querySelector(`#${anchorId}`)
            ?? document.getElementById(anchorId));
        return rectOf(el);
    }
    locationZoneRect(pid, loc) {
        const zone = this.host.root.querySelector(`.bae_location_zone[data-player-id="${pid}"][data-loc="${loc}"]`);
        return rectOf(zone);
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
        let badge = this.host.root.querySelector('.bae_round_badge');
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
    scheduleLayoutChrome() {
        if (this.layoutChromeRaf)
            return;
        this.layoutChromeRaf = requestAnimationFrame(() => {
            this.layoutChromeRaf = 0;
            this.syncTopRowWrap();
            this.syncRoundBadge();
            if (this.tooltipPinnedId && !document.body.classList.contains('bae_tooltip_placing')) {
                this.fitPinnedTooltip();
            }
        });
    }
    syncTopRowWrap() {
        const row = this.host.root.querySelector('.bae_toprow');
        if (!row)
            return;
        const kids = Array.from(row.children);
        if (kids.length < 2) {
            row.classList.remove('bae_toprow_wrapped');
            return;
        }
        const gap = parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap) || 0;
        const total = kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0) + gap * (kids.length - 1);
        const wrapped = total > row.clientWidth + 2;
        if (row.classList.contains('bae_toprow_wrapped') === wrapped)
            return;
        row.classList.toggle('bae_toprow_wrapped', wrapped);
    }
    syncRoundBadge() {
        const badge = this.host.root.querySelector('.bae_round_badge');
        if (!badge)
            return;
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
    roundBadgeOverlapsTop() {
        const badge = this.host.root.querySelector('.bae_round_badge');
        const row = this.host.root.querySelector('.bae_toprow');
        if (!badge || !row)
            return false;
        const br = badge.getBoundingClientRect();
        if (br.width < 1 || br.height < 1)
            return false;
        for (const group of row.querySelectorAll('.bae_top_group')) {
            const gr = group.getBoundingClientRect();
            if (gr.width < 1 || gr.height < 1)
                continue;
            const overlap = br.left < gr.right && br.right > gr.left && br.top < gr.bottom && br.bottom > gr.top;
            if (overlap)
                return true;
        }
        return false;
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
        this.host.root.querySelectorAll('.bae_card_place_preview').forEach((el) => el.remove());
    }
    clearDiscardGhosts() {
        this.pendingDiscard.forEach((id) => window.clearTimeout(id));
        this.pendingDiscard.clear();
        this.discardLoopEpoch = 0;
        this.discardGhosts.forEach((el) => el.remove());
        this.discardGhosts.clear();
        this.host.root?.querySelectorAll('.bae_discard_ghost').forEach((el) => el.remove());
    }
    updateActionPreviews() {
        if (this.previewLocked || this.resolving)
            return;
        this.clearTransientPreviews();
        const myId = Number(this.host.bga.players.getCurrentPlayerId());
        const active = this.host.bga.players.isCurrentPlayerActive();
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
            this.previewObserve(myId, this.host.selectedCardId, this.host.selectedLocation);
        }
        if (this.host.isAssignCampLike() && this.host.selectedLocation != null) {
            this.previewAssign(myId, this.host.selectedLocation);
        }
        if (this.host.campSelected) {
            this.previewRegroupPickup(myId);
        }
        this.previewObjectiveClaim(myId);
        if (selectingDiscards)
            this.syncDiscardGhosts(myId);
    }
    previewObjectiveClaim(pid) {
        const source = this.host.root.querySelector('.bae_obj_selected, .bae_obj_prompt_target');
        if (!source)
            return;
        this.vp.previewTokensFrom(pid, [source], 5, this.previewLoopMs());
    }
    syncDiscardGhosts(pid) {
        if (!this.previewsEnabled())
            return;
        const wanted = this.host.selectedRegroupIds;
        this.pendingDiscard.forEach((timeoutId, cardId) => {
            if (wanted.has(cardId))
                return;
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
            if (this.discardGhosts.has(cardId) || this.pendingDiscard.has(cardId))
                return;
            const el = this.cardEl(pid, cardId);
            if (!el)
                return;
            const start = () => {
                this.pendingDiscard.delete(cardId);
                if (!this.host.selectedRegroupIds.has(cardId) || this.discardGhosts.has(cardId))
                    return;
                const card = this.cardEl(pid, cardId);
                if (!card)
                    return;
                if (this.discardGhosts.size === 0)
                    this.discardLoopEpoch = performance.now();
                this.discardGhosts.set(cardId, startDiscardGhost(card, this.host.root, cardId));
            };
            const waitMs = this.discardLoopWaitMs();
            if (waitMs <= 16)
                start();
            else
                this.pendingDiscard.set(cardId, window.setTimeout(start, waitMs));
        });
    }
    discardLoopWaitMs() {
        if (this.discardGhosts.size === 0 || this.discardLoopEpoch <= 0)
            return 0;
        const elapsed = (performance.now() - this.discardLoopEpoch) % OptionalUi.DISCARD_LOOP_MS;
        return Math.max(0, OptionalUi.DISCARD_LOOP_MS - elapsed);
    }
    previewObserve(pid, cardId, loc) {
        const def = this.host.animalDef(cardId);
        if (!def)
            return;
        const ms = this.previewLoopMs();
        const used = new Set();
        const byDest = new Map();
        for (const m of previewObserveMoves(this.host.gamedatas.boardState.scientists, pid, loc, def)) {
            const src = this.meepleAt(pid, m.from, m.color, used);
            if (!src)
                continue;
            const group = byDest.get(m.to) ?? [];
            group.push(src);
            byDest.set(m.to, group);
        }
        byDest.forEach((sources, to) => {
            const dest = this.shelfEl(pid, to);
            if (dest)
                this.trailScientistsToEmptyGroup(sources, () => dest.getBoundingClientRect(), to, pid, ms);
        });
        const missing = missingScientistColors(def, this.host.gamedatas.boardState.scientists, pid, loc);
        if (missing.length > 0)
            this.previewMissingScientists(pid, loc, missing, ms);
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
                startScientistTrail(flag, dest, ms, this.host.root);
        }
        else {
            this.placeDenyX(flag, Math.max(1, Math.round(ms / 2)), true);
        }
    }
    previewAssign(pid, loc) {
        const dest = this.shelfEl(pid, loc);
        if (!dest)
            return;
        const sources = this.holdMeeples(pid);
        const from = sources.length > 0 ? sources : this.campMeeples(pid);
        this.trailScientistsToEmptyGroup(from, () => dest.getBoundingClientRect(), loc, pid, this.previewLoopMs());
    }
    previewRegroupPickup(pid) {
        const ms = this.previewLoopMs();
        this.previewRegroupPickupSide(pid, 3, 'left', ms);
        this.previewRegroupPickupSide(pid, 4, 'right', ms);
        this.vp.previewOnesFrom(pid, this.campMeeples(pid), ms);
    }
    previewRegroupPickupSide(pid, campLoc, side, ms) {
        const sources = Array.from(this.shelfEl(pid, campLoc)?.querySelectorAll('.bae_meeple_img') ?? []);
        if (sources.length === 0)
            return;
        const hold = this.host.root.querySelector(`#bae_regroup_hold_${pid}_${side}`);
        const camp = this.host.root.querySelector(`#bae_camp_${pid}_${side}`);
        const getDestBox = () => {
            if (hold?.isConnected)
                return hold.getBoundingClientRect();
            if (!camp?.isConnected)
                return null;
            const r = camp.getBoundingClientRect();
            return new DOMRect(r.left, r.top - r.height * 1.2, r.width, r.height);
        };
        if (!getDestBox())
            return;
        this.trailScientistsToEmptyGroup(sources, getDestBox, campLoc, pid, ms);
    }
    trailScientistsToEmptyGroup(sources, getDestBox, layoutLoc, pid, ms) {
        const destBox = getDestBox();
        if (sources.length === 0 || !destBox || destBox.width < 1 || destBox.height < 1)
            return;
        const destShelf = this.shelfEl(pid, layoutLoc);
        const shelfBox = destShelf?.getBoundingClientRect();
        const shelfIsDest = !!(destShelf && shelfBox
            && Math.abs(shelfBox.left - destBox.left) < 12
            && Math.abs(shelfBox.top - destBox.top) < 12);
        const existing = shelfIsDest
            ? Array.from(destShelf.querySelectorAll('.bae_meeple_img')).filter((el) => !sources.includes(el))
            : [];
        const dests = this.incomingMeepleRects(shelfIsDest ? destShelf : null, destBox, existing, sources, pid, layoutLoc);
        const trails = [];
        sources.forEach((el, i) => {
            const dest = dests[i];
            if (!dest)
                return;
            const destFn = () => {
                const box = getDestBox();
                if (!box)
                    return null;
                const shelf = this.shelfEl(pid, layoutLoc);
                const nextBox = shelf?.getBoundingClientRect();
                const useShelf = !!(shelf && nextBox
                    && Math.abs(nextBox.left - box.left) < 12
                    && Math.abs(nextBox.top - box.top) < 12);
                const still = useShelf
                    ? Array.from(shelf.querySelectorAll('.bae_meeple_img')).filter((n) => !sources.includes(n))
                    : [];
                return this.incomingMeepleRects(useShelf ? shelf : null, box, still, sources, pid, layoutLoc)[i] ?? null;
            };
            const clone = startScientistTrailToRect(el, dest, ms, this.host.root, destFn);
            trails.push({ el: clone, top: dest.top, left: dest.left });
        });
        stackByScreenPosition(trails);
    }
    incomingMeepleRects(destShelf, destBox, existing, incoming, pid, loc) {
        if (incoming.length === 0)
            return [];
        const sample = incoming[0] ?? existing[0];
        if (!sample)
            return [];
        const sci = { 0: [], 1: [], 2: [] };
        for (const el of [...existing, ...incoming]) {
            const color = Number(el.dataset.scientist);
            if (color >= 0 && color < 3)
                sci[color].push(loc);
        }
        const slots = this.scientistLayout(pid, { [pid]: sci }, loc);
        const occupied = existing.map((el) => el.getBoundingClientRect());
        const candidates = slots.map((slot) => (destShelf
            ? this.meepleSlotRect(destShelf, slot, sample)
            : this.meepleSlotRectFromBox(destBox, slot, sample)));
        const free = candidates.filter((rect) => !occupied.some((occ) => this.meepleRectsOverlap(rect, occ)));
        const out = [];
        const taken = [...occupied];
        for (let i = 0; i < incoming.length; i++) {
            const pick = (free[i] && !taken.some((occ) => this.meepleRectsOverlap(free[i], occ)))
                ? free[i]
                : this.nudgeMeepleRect(free[i] ?? this.meepleSlotRectFromBox(destBox, { leftPct: 50, topPct: 50 }, incoming[i] ?? sample), taken, destBox);
            out.push(pick);
            taken.push(pick);
        }
        return out;
    }
    meepleRectsOverlap(a, b) {
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX <= 0 || overlapY <= 0)
            return false;
        return overlapX * overlapY > Math.min(a.width * a.height, b.width * b.height) * 0.32;
    }
    nudgeMeepleRect(rect, occupied, box) {
        const step = Math.max(8, rect.width * 0.42);
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
        for (let ring = 0; ring < 12; ring++) {
            const [dx, dy] = dirs[ring % dirs.length];
            const mag = 1 + Math.floor(ring / dirs.length);
            const left = Math.min(box.right - rect.width, Math.max(box.left, rect.left + dx * step * mag));
            const top = Math.min(box.bottom - rect.height, Math.max(box.top, rect.top + dy * step * mag));
            const cand = new DOMRect(left, top, rect.width, rect.height);
            if (!occupied.some((occ) => this.meepleRectsOverlap(cand, occ)))
                return cand;
        }
        return rect;
    }
    previewMissingScientists(pid, loc, colors, ms) {
        const shelf = this.shelfEl(pid, loc);
        if (!shelf || colors.length === 0)
            return;
        const dests = this.extraMeepleRects(shelf, colors.length, pid, loc);
        const pulse = Math.max(1, Math.round(ms / 2));
        colors.forEach((color, i) => {
            const dest = dests[i];
            if (!dest || dest.width < 2 || dest.height < 2)
                return;
            this.placeMissingScientist(color, dest, pulse);
        });
    }
    extraMeepleRects(shelf, extraCount, pid, loc) {
        if (extraCount <= 0)
            return [];
        const existing = Array.from(shelf.querySelectorAll('.bae_meeple_img'));
        const sizeSample = existing[0]
            ?? this.host.root.querySelector('.bae_meeple_img');
        if (!sizeSample)
            return [];
        const sci = { 0: [], 1: [], 2: [] };
        for (const el of existing) {
            const color = Number(el.dataset.scientist);
            if (color >= 0 && color < 3)
                sci[color].push(loc);
        }
        for (let i = 0; i < extraCount; i++)
            sci[0].push(loc);
        const slots = this.scientistLayout(pid, { [pid]: sci }, loc);
        const occupied = existing.map((el) => el.getBoundingClientRect());
        const candidates = slots.map((slot) => this.meepleSlotRect(shelf, slot, sizeSample));
        const free = candidates.filter((rect) => !occupied.some((occ) => this.meepleRectsOverlap(rect, occ)));
        const box = shelf.getBoundingClientRect();
        const size = sizeSample.getBoundingClientRect();
        const room = new DOMRect(box.left - size.width * 0.3, box.top - size.height * 0.3, box.width + size.width * 0.6, box.height + size.height * 0.6);
        const out = [];
        const taken = [...occupied];
        for (let i = 0; i < extraCount; i++) {
            const unused = free.find((rect) => !taken.some((occ) => this.meepleRectsOverlap(rect, occ)));
            const base = unused ?? new DOMRect(box.left + box.width * (0.35 + 0.18 * i) - size.width / 2, box.top + box.height * 0.55 - size.height / 2, size.width, size.height);
            const pick = this.nudgeMeepleRect(base, taken, room);
            out.push(pick);
            taken.push(pick);
        }
        return out;
    }
    ghostMeeple(color) {
        const exact = this.host.root.querySelector(`.bae_meeple_img[data-scientist="${color}"]`);
        const any = exact ?? this.host.root.querySelector('.bae_meeple_img');
        if (!any)
            return null;
        const clone = any.cloneNode(true);
        clone.removeAttribute('id');
        clone.dataset.scientist = String(color);
        clone.classList.remove('bae_preview_fade_left', 'bae_motion_clone', 'bae_missing_sci');
        if (!exact) {
            clone.classList.remove('bae_meeple_yellow', 'bae_meeple_pink', 'bae_meeple_teal');
            clone.classList.add(['bae_meeple_yellow', 'bae_meeple_pink', 'bae_meeple_teal'][color] ?? 'bae_meeple_yellow');
            const files = ['YellowMeeple', 'PinkMeeple', 'TealMeeple'];
            clone.src = `${this.host.bga.images.getImgUrl()}Tokens/${files[color] ?? files[0]}.webp`;
        }
        return clone;
    }
    placeMissingScientist(color, dest, ms) {
        const ghost = this.ghostMeeple(color);
        if (!ghost)
            return;
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
    placeDenyX(at, ms, loop) {
        const layer = motionLayer(this.host.root);
        const r = at.getBoundingClientRect();
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
    previewCardPlacement(pid, cardId, loc) {
        const zone = this.host.root.querySelector(`.bae_location_zone[data-player-id="${pid}"][data-loc="${loc}"]`);
        const pile = zone?.querySelector('.bae_anim_pile');
        if (!zone || !pile)
            return;
        const slot = document.createElement('div');
        slot.className = 'bae_pile_slot bae_card_place_preview';
        slot.style.zIndex = '2';
        slot.setAttribute('aria-hidden', 'true');
        slot.innerHTML = this.host.animalCardHtml(cardId);
        slot.querySelector('.bae_card_img')?.classList.add('bae_pile_card_img');
        pile.appendChild(slot);
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
            if (this.canPointerDragHand())
                htmlEl.style.touchAction = 'none';
            const onDragStart = (ev) => {
                if (this.host.isActionBusy()) {
                    ev.preventDefault();
                    return;
                }
                this.dragCardId = Number(htmlEl.dataset.handCard);
                ev.dataTransfer?.setData('text/bae-card', String(this.dragCardId));
                htmlEl.classList.add('bae_dragging');
                this.playSound('select');
            };
            const onDragEnd = () => {
                htmlEl.classList.remove('bae_dragging');
                this.dragCardId = null;
                this.clearDropHighlights();
            };
            const onPointerDown = (ev) => {
                if (ev.pointerType !== 'touch' || this.host.isActionBusy() || !this.canPointerDragHand())
                    return;
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
            const htmlEl = el;
            const onDragOver = (ev) => {
                if (this.dragCardId == null || !this.host.isGameplayLike())
                    return;
                ev.preventDefault();
                this.markLocationDropHover(htmlEl);
            };
            const onDragLeave = (ev) => {
                const next = ev.relatedTarget;
                if (next && htmlEl.contains(next))
                    return;
                if (htmlEl.classList.contains('bae_drop_hover'))
                    this.clearDropHighlights();
            };
            const onDrop = (ev) => {
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
            const htmlEl = el;
            const onDragOver = (ev) => {
                if (this.dragCardId == null || !this.host.isGameplayLike())
                    return;
                ev.preventDefault();
                this.markDropHover(htmlEl, true);
            };
            const onDragLeave = (ev) => {
                const next = ev.relatedTarget;
                if (next && htmlEl.contains(next))
                    return;
                if (htmlEl.classList.contains('bae_drop_hover'))
                    this.clearDropHighlights();
            };
            const onDrop = (ev) => {
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
            const onDragOver = (ev) => {
                if (!this.host.isReplenishLike())
                    return;
                ev.preventDefault();
                this.markDropHover(handCol, true);
            };
            const onDragLeave = (ev) => {
                const next = ev.relatedTarget;
                if (next && handCol.contains(next))
                    return;
                if (handCol.classList.contains('bae_drop_hover'))
                    this.clearDropHighlights();
            };
            const onDrop = (ev) => {
                if (!this.host.isReplenishLike() || this.host.isActionBusy() || !this.host.bga.players.isCurrentPlayerActive())
                    return;
                ev.preventDefault();
                this.clearDropHighlights();
                const slotRaw = ev.dataTransfer?.getData('text/bae-pool');
                if (slotRaw === '' || slotRaw == null)
                    return;
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
            const htmlEl = el;
            htmlEl.setAttribute('draggable', 'true');
            if (this.canPointerDragPool())
                htmlEl.style.touchAction = 'none';
            const onDragStart = (ev) => {
                if (this.host.isActionBusy() || !this.host.isReplenishLike()) {
                    ev.preventDefault();
                    return;
                }
                ev.dataTransfer?.setData('text/bae-pool', String(htmlEl.dataset.poolSlot));
            };
            const onDragEnd = () => this.clearDropHighlights();
            const onPointerDown = (ev) => {
                if (ev.pointerType !== 'touch' || this.host.isActionBusy() || !this.canPointerDragPool())
                    return;
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
    canPointerDragHand() {
        return this.host.isGameplayLike()
            && this.host.bga.players.isCurrentPlayerActive()
            && !this.host.isActionBusy();
    }
    canPointerDragPool() {
        return this.host.isReplenishLike()
            && this.host.bga.players.isCurrentPlayerActive()
            && !this.host.isActionBusy();
    }
    applyHandDropOnLocation(cardId, loc) {
        if (!Number.isFinite(cardId) || this.host.isActionBusy() || !this.host.isGameplayLike() || !this.host.bga.players.isCurrentPlayerActive())
            return;
        this.host.campSelected = false;
        this.host.selectedRegroupIds.clear();
        this.host.selectedPoolSlot = null;
        this.host.selectedObjectiveIdx = null;
        if (this.host.confirmObserveIfReady(cardId, loc))
            return;
        this.host.selectedCardId = cardId;
        this.host.selectedLocation = loc;
        this.host.renderAll();
        this.host.onUpdateActionButtons(this.host.currentStateName(), this.host.cachedActionArgs);
        this.onSelectionChanged();
    }
    applyHandDropOnCamp(cardId) {
        if (!Number.isFinite(cardId) || this.host.isActionBusy() || !this.host.isGameplayLike() || !this.host.bga.players.isCurrentPlayerActive())
            return;
        this.host.enterRegroupMode();
        this.host.selectedRegroupIds.add(cardId);
        this.host.onUpdateActionButtons(this.host.currentStateName(), this.host.cachedActionArgs);
        this.onSelectionChanged();
    }
    applyPoolDropOnHand(slot) {
        if (!Number.isFinite(slot) || this.host.isActionBusy() || !this.host.isReplenishLike() || !this.host.bga.players.isCurrentPlayerActive())
            return;
        void this.host.sendAction('actTakeAnimal', { pool_slot: slot });
    }
    beginPointerDragWatch(ev, info) {
        if (!ev.isPrimary)
            return;
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
    tickPointerDrag(ev) {
        const drag = this.pointerDrag;
        if (!drag || ev.pointerId !== drag.pointerId)
            return;
        const dx = ev.clientX - drag.startX;
        const dy = ev.clientY - drag.startY;
        if (!drag.active) {
            if (dx * dx + dy * dy < OptionalUi.POINTER_DRAG_PX * OptionalUi.POINTER_DRAG_PX)
                return;
            this.activatePointerDrag(ev, drag);
        }
        if (!drag.active || !drag.ghost)
            return;
        ev.preventDefault();
        this.placePointerGhost(drag.ghost, ev.clientX, ev.clientY);
        this.highlightPointerDropTarget(ev.clientX, ev.clientY, drag.kind);
    }
    activatePointerDrag(ev, drag) {
        drag.active = true;
        this.tooltipDragging = true;
        this.tooltipPointerHeld = true;
        this.dragCardId = drag.kind === 'hand' ? (drag.cardId ?? null) : null;
        drag.source.classList.add('bae_dragging');
        this.clearTouchHit();
        try {
            drag.source.setPointerCapture(ev.pointerId);
        }
        catch { /* ignore */ }
        const ghost = drag.source.cloneNode(true);
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
        this.playSound('select');
    }
    placePointerGhost(ghost, clientX, clientY) {
        const layer = motionLayer(this.host.root);
        const w = ghost.offsetWidth;
        const h = ghost.offsetHeight;
        const loc = coordsInParent(layer, new DOMRect(clientX - w / 2, clientY - h / 2, w, h));
        ghost.style.left = `${loc.left}px`;
        ghost.style.top = `${loc.top}px`;
    }
    highlightPointerDropTarget(clientX, clientY, kind) {
        const target = this.pointerDropTarget(clientX, clientY, kind);
        if (target?.classList.contains('bae_location_zone'))
            this.markLocationDropHover(target);
        else
            this.markDropHover(target, true);
    }
    pointerDropTarget(clientX, clientY, kind) {
        const myId = Number(this.host.bga.players.getCurrentPlayerId());
        for (const node of document.elementsFromPoint(clientX, clientY)) {
            const el = node;
            if (el.classList.contains('bae_pointer_ghost') || el.classList.contains('bae_motion_clone'))
                continue;
            if (kind === 'hand') {
                const loc = el.closest?.(`.bae_location_zone[data-player-id="${myId}"]`);
                if (loc && this.host.isGameplayLike())
                    return loc;
                const camp = el.closest?.(`.bae_camp_zone[data-player-id="${myId}"]`);
                if (camp && this.host.isGameplayLike())
                    return camp;
            }
            else {
                const hand = el.closest?.(`.bae_player_handcol[data-player-id="${myId}"]`);
                if (hand && this.host.isReplenishLike())
                    return hand;
            }
        }
        return null;
    }
    /** @returns true if a drag was in progress and consumed the pointer. */
    finishPointerDrag(ev) {
        const drag = this.pointerDrag;
        if (!drag || ev.pointerId !== drag.pointerId)
            return false;
        const wasActive = drag.active;
        const { kind, cardId, poolSlot } = drag;
        if (wasActive) {
            this.suppressClickUntil = Date.now() + 400;
            const target = this.pointerDropTarget(ev.clientX, ev.clientY, kind);
            if (kind === 'hand' && cardId != null && target) {
                if (target.classList.contains('bae_location_zone')) {
                    this.applyHandDropOnLocation(cardId, Number(target.dataset.loc));
                }
                else if (target.classList.contains('bae_camp_zone')) {
                    this.applyHandDropOnCamp(cardId);
                }
            }
            else if (kind === 'pool' && poolSlot != null && target) {
                this.applyPoolDropOnHand(poolSlot);
            }
        }
        this.cancelPointerDrag();
        return wasActive;
    }
    cancelPointerDrag() {
        const drag = this.pointerDrag;
        this.pointerDrag = null;
        this.tooltipDragging = false;
        if (!drag)
            return;
        drag.ghost?.remove();
        drag.source.classList.remove('bae_dragging');
        try {
            drag.source.releasePointerCapture(drag.pointerId);
        }
        catch { /* ignore */ }
        this.dragCardId = null;
        this.clearDropHighlights();
        this.clearTouchHit();
    }
    markDropHover(el, confirm) {
        const prev = this.host.root.querySelector('.bae_drop_hover');
        if (prev === el) {
            if (confirm && el && !el.querySelector('.bae_drop_confirm'))
                this.addDropConfirm(el);
            return;
        }
        this.clearDropHighlights();
        if (!el)
            return;
        el.classList.add('bae_drop_hover');
        if (confirm)
            this.addDropConfirm(el);
    }
    markLocationDropHover(locEl) {
        const cardId = this.dragCardId ?? this.pointerDrag?.cardId ?? null;
        const loc = Number(locEl.dataset.loc);
        const myId = Number(this.host.bga.players.getCurrentPlayerId());
        const legal = cardId != null && canObserveAtLocation(this.host.animalDef(cardId), this.host.gamedatas.boardState.scientists, myId, loc);
        const prev = this.host.root.querySelector('.bae_drop_hover');
        if (prev === locEl) {
            locEl.classList.toggle('bae_drop_hover_invalid', !legal);
            if (legal && !locEl.querySelector('.bae_drop_confirm'))
                this.addDropConfirm(locEl);
            if (!legal)
                locEl.querySelectorAll('.bae_drop_confirm').forEach((n) => n.remove());
            return;
        }
        this.clearDropHighlights();
        locEl.classList.add('bae_drop_hover');
        locEl.classList.toggle('bae_drop_hover_invalid', !legal);
        if (legal)
            this.addDropConfirm(locEl);
    }
    addDropConfirm(el) {
        if (el.querySelector('.bae_drop_confirm'))
            return;
        const span = document.createElement('span');
        span.className = 'bae_confirm_blurb bae_drop_confirm';
        if (el.classList.contains('bae_location_zone'))
            span.classList.add('bae_location_confirm');
        span.textContent = _('Confirm?');
        el.appendChild(span);
    }
    clearDropHighlights() {
        this.host.root.querySelectorAll('.bae_drop_hover, .bae_drop_hover_invalid, .bae_drop_target').forEach((t) => {
            t.classList.remove('bae_drop_hover', 'bae_drop_hover_invalid', 'bae_drop_target');
        });
        this.host.root.querySelectorAll('.bae_drop_confirm').forEach((el) => el.remove());
    }
    async animateHandReplace(pid, discarded, prev, next, ms) {
        const root = this.host.root;
        const deck = this.deckEl();
        const slots = this.handSlotRects(pid);
        if (slots.length === 0)
            return;
        const leaving = this.leavingHandCards(pid, discarded);
        const remaining = this.handCards(pid).filter((el) => !leaving.includes(el));
        await Promise.all([
            ...leaving.map((el) => flyDiscardAway(el, root, ms)),
            this.compactHandToSlots(remaining, slots, ms),
        ]);
        const drawCount = this.handDrawCount(pid, discarded, prev, next);
        if (!deck || drawCount <= 0)
            return;
        const dests = this.handFillRects(slots, remaining.length, drawCount);
        const faces = this.drawnHandCardIds(pid, discarded, prev, next);
        await Promise.all(dests.map((dest, i) => {
            const refill = this.cloneForHandDraw(deck, faces[i]);
            return wait(Math.round(ms * 0.5 * i)).then(() => flyClone(refill, dest, ms, root, true));
        }));
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
    async crossfadeToCardBack(clone, ms) {
        return this.crossfadeCard(clone, 9999, ms);
    }
    async crossfadeToFace(clone, cardId, ms) {
        return this.crossfadeCard(clone, cardId, ms);
    }
    async crossfadeCard(clone, cardId, ms) {
        const fade = Math.max(180, Math.round(ms * 0.7));
        clone.style.overflow = 'hidden';
        const overlay = document.createElement('div');
        overlay.className = 'bae_card_back_fade';
        overlay.style.position = 'absolute';
        overlay.style.inset = '0';
        overlay.style.opacity = '0';
        overlay.style.transition = `opacity ${fade}ms ease`;
        overlay.innerHTML = this.host.animalCardHtml(cardId);
        const current = clone.querySelector('.bae_card_img, .bae_pile_card_img');
        if (current)
            current.style.transition = `opacity ${fade}ms ease`;
        clone.appendChild(overlay);
        void overlay.offsetWidth;
        overlay.style.opacity = '1';
        if (current)
            current.style.opacity = '0';
        await wait(fade);
    }
    renderRegroupHold() {
        const pid = this.holdingPid;
        if (pid == null) {
            this.host.root.querySelectorAll('.bae_regroup_hold').forEach((el) => el.remove());
            return;
        }
        const leftHold = this.ensureRegroupHold(pid, 'left');
        const rightHold = this.ensureRegroupHold(pid, 'right');
        const left = this.shelfEl(pid, 3);
        const right = this.shelfEl(pid, 4);
        if (leftHold)
            leftHold.innerHTML = `<div class="bae_sci_shelf">${left?.innerHTML ?? ''}</div>`;
        if (rightHold)
            rightHold.innerHTML = `<div class="bae_sci_shelf">${right?.innerHTML ?? ''}</div>`;
        this.campMeeples(pid).forEach((el) => { el.style.visibility = 'hidden'; });
    }
    restoreHoldingFromState() {
        if (this.host.isAssignCampLike()) {
            if (this.holdingPid != null && this.playerHasCampScientists(this.holdingPid))
                return;
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
        if (!this.resolving)
            this.holdingPid = null;
    }
    playerHasCampScientists(pid) {
        if (this.campMeeples(pid).length > 0)
            return true;
        const sci = this.host.gamedatas.boardState.scientists?.[pid];
        if (!sci)
            return false;
        for (let color = 0; color < 3; color++) {
            if ((sci[color] ?? []).some((pos) => pos === 3 || pos === 4))
                return true;
        }
        return false;
    }
    ensureRegroupHold(pid, side) {
        const canvas = this.host.root.querySelector(`#bae_playerboard_${pid} .bae_board_canvas`);
        if (!canvas)
            return null;
        const id = `bae_regroup_hold_${pid}_${side}`;
        let hold = canvas.querySelector(`#${id}`);
        if (!hold) {
            hold = document.createElement('div');
            hold.id = id;
            hold.className = `bae_regroup_hold bae_regroup_hold_${side}`;
            canvas.appendChild(hold);
        }
        return hold;
    }
    flyMeepleToHold(el, camp, hold, ms, stackItems) {
        const destBox = hold?.getBoundingClientRect() ?? (camp ? this.offsetRect(camp.getBoundingClientRect(), 0, -camp.getBoundingClientRect().height * 1.2) : null);
        const campBox = camp?.getBoundingClientRect();
        if (!destBox || !campBox)
            return Promise.resolve();
        const from = el.getBoundingClientRect();
        const dest = new DOMRect(destBox.left + (from.left - campBox.left), destBox.top + (from.top - campBox.top), from.width, from.height);
        const clone = placeScientistClone(el, 'bae_resolve_clone', this.host.root);
        el.style.visibility = 'hidden';
        stackItems?.push({ clone, from, dest });
        return flyClone(clone, dest, ms, this.host.root, true);
    }
    offsetRect(r, dx, dy) {
        return new DOMRect(r.left + dx, r.top + dy, r.width, r.height);
    }
    holdMeeples(pid, side) {
        const sel = side
            ? `#bae_regroup_hold_${pid}_${side}`
            : `#bae_playerboard_${pid} .bae_regroup_hold`;
        const nodes = this.host.root.querySelectorAll(sel);
        return Array.from(nodes).flatMap((hold) => Array.from(hold.querySelectorAll('.bae_meeple_img')));
    }
    expandLocationOutline(pid, loc, ms) {
        const current = this.handSlotRects(pid);
        const canvas = this.host.root.querySelector(`#bae_playerboard_${pid} .bae_board_canvas`);
        const zone = this.host.root.querySelector(`.bae_location_zone[data-player-id="${pid}"][data-loc="${loc}"]`);
        if (!canvas || !zone)
            return current;
        const boards = this.host.gamedatas.boardState.boards?.[pid] ?? [];
        const maxPlayed = boards.reduce((max, pile) => Math.max(max, pile.length), 0);
        const afterPile = (boards[loc]?.length ?? 0) + 1;
        const oldSlots = Math.min(MAX_LOCATION_CARDS, maxPlayed + 1);
        const newSlots = Math.min(MAX_LOCATION_CARDS, Math.max(maxPlayed, afterPile) + 1);
        if (newSlots <= oldSlots)
            return current;
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
    nextPileDest(pid, loc) {
        const zone = this.host.root.querySelector(`.bae_location_zone[data-player-id="${pid}"][data-loc="${loc}"]`);
        const pile = zone?.querySelector('.bae_anim_pile');
        if (!zone || !pile)
            return null;
        const probe = document.createElement('div');
        probe.className = 'bae_pile_slot';
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        pile.appendChild(probe);
        const rect = probe.getBoundingClientRect();
        const local = coordsInParent(pile, rect);
        pile.removeChild(probe);
        if (rect.width < 1 || rect.height < 1)
            return null;
        return { pile, local };
    }
    flagRestRect(pid, loc, space, sample) {
        const cell = this.trackEl(pid, loc, space);
        if (!cell)
            return null;
        const jitterLeft = ((pid * 3 + loc * 5 + space * 7) % 9) - 4;
        const jitterTop = ((pid * 7 + loc * 3 + space * 11) % 9) - 4;
        const probe = sample.cloneNode(true);
        probe.style.visibility = 'hidden';
        probe.style.left = `${(50 + jitterLeft).toFixed(1)}%`;
        probe.style.top = `${(50 + jitterTop).toFixed(1)}%`;
        cell.appendChild(probe);
        const rect = probe.getBoundingClientRect();
        probe.remove();
        return rect.width < 1 || rect.height < 1 ? null : rect;
    }
    bindTooltipGate() {
        if (this.tooltipBound)
            return;
        this.tooltipBound = true;
        this.repairTooltipNodes();
        document.body.classList.remove('bae_block_tooltips');
        document.querySelectorAll('.bae_tooltip_keeper').forEach((el) => el.remove());
        const onHover = (ev) => {
            const target = ev.target;
            this.lastHoverEl = target;
            if (this.tooltipLeaveSelector && !this.isHoveringLeaveTarget(target)) {
                this.tooltipLeaveSelector = null;
            }
            if (this.tooltipRetrigger) {
                this.tooltipRetrigger = false;
                return;
            }
            if (this.tooltipPinnedId)
                return;
            if (this.isTooltipBlocked()) {
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                this.cancelDojoTooltips();
            }
        };
        const onClick = (ev) => {
            if (Date.now() < this.suppressClickUntil) {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                return;
            }
            if (this.lastPointerWasTouch && this.tooltipPinnedId)
                return;
            this.armTooltipQuiet(ev);
        };
        const onPointerDown = (ev) => {
            const pointer = ev;
            if (pointer.isPrimary === false) {
                this.cancelPointerDrag();
                return;
            }
            this.lastPointerWasTouch = pointer.pointerType === 'touch';
            this.tooltipPointerHeld = true;
            this.touchStartX = pointer.clientX ?? 0;
            this.touchStartY = pointer.clientY ?? 0;
            this.setTouchHit(ev.target);
            if (this.lastPointerWasTouch) {
                return;
            }
            this.closePinnedTooltip();
            this.armTooltipQuiet(ev);
        };
        const onPointerUp = (ev) => {
            const pointer = ev;
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
        const onPointerCancel = (ev) => {
            this.cancelPointerDrag();
            this.tooltipPointerHeld = false;
            this.clearTouchHit();
            this.armTooltipQuiet(ev);
        };
        const onDragStart = (ev) => {
            this.tooltipDragging = true;
            this.tooltipPointerHeld = true;
            this.closePinnedTooltip();
            this.armTooltipQuiet(ev);
        };
        const onDragEnd = (ev) => {
            this.tooltipDragging = false;
            this.tooltipPointerHeld = false;
            this.armTooltipQuiet(ev);
        };
        const onMove = (ev) => {
            if (ev instanceof PointerEvent)
                this.tickPointerDrag(ev);
            const mouse = ev;
            const target = ev.target;
            this.lastHoverEl = target;
            const buttons = mouse.buttons ?? 0;
            if (buttons !== 0) {
                if (!this.tooltipPointerHeld)
                    this.tooltipPointerHeld = true;
            }
            else if (this.tooltipPointerHeld && !this.tooltipDragging && this.dragCardId == null && !this.pointerDrag) {
                this.tooltipPointerHeld = false;
                if (!this.lastPointerWasTouch)
                    this.armTooltipQuiet(ev);
            }
            if (this.tooltipNeedMove && !this.tooltipPointerHeld && !this.tooltipDragging) {
                const dx = (mouse.clientX ?? 0) - this.tooltipClickX;
                const dy = (mouse.clientY ?? 0) - this.tooltipClickY;
                if (dx * dx + dy * dy >= 16)
                    this.tooltipNeedMove = false;
            }
            if (this.tooltipLeaveSelector && !this.isHoveringLeaveTarget(target)) {
                this.tooltipLeaveSelector = null;
            }
            const blocked = this.isTooltipBlocked();
            if (blocked)
                this.cancelDojoTooltips();
            if (this.tooltipWasBlocked && !blocked)
                this.retriggerTooltipHover();
            this.tooltipWasBlocked = blocked;
        };
        const onMouseOut = (ev) => {
            if (!this.tooltipPinnedId)
                return;
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
    armTooltipQuiet(ev) {
        this.tooltipPinnedId = null;
        const mouse = ev;
        this.tooltipQuietUntil = Date.now() + OptionalUi.TOOLTIP_CLICK_MS;
        this.tooltipNeedMove = true;
        this.tooltipClickX = mouse.clientX ?? 0;
        this.tooltipClickY = mouse.clientY ?? 0;
        this.tooltipWasBlocked = true;
        const target = ev.target ?? this.lastHoverEl;
        if (target && typeof target.closest === 'function') {
            const interacted = this.interactiveTooltipTarget(target) ?? target;
            this.tooltipLeaveSelector = this.selectorFor(interacted);
        }
        this.cancelDojoTooltips();
        this.dismissTooltipFrom(this.lastHoverEl);
    }
    handleTouchTap(ev) {
        const dx = (ev.clientX ?? 0) - this.touchStartX;
        const dy = (ev.clientY ?? 0) - this.touchStartY;
        if (dx * dx + dy * dy >= OptionalUi.TOUCH_TAP_PX * OptionalUi.TOUCH_TAP_PX) {
            this.closePinnedTooltip();
            this.armTooltipQuiet(ev);
            return;
        }
        const target = ev.target ?? this.lastHoverEl;
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
    isTapActionTarget(el) {
        if (!el || typeof el.closest !== 'function')
            return false;
        if (el.closest('.bae_zoom_btn, .bgabutton, .action-button, #pagemaintitle_wrap, .pref_pop, .debug_info'))
            return true;
        const myId = Number(this.host.bga.players.getCurrentPlayerId());
        const active = this.host.bga.players.isCurrentPlayerActive() && !this.host.isActionBusy();
        if (!active)
            return false;
        if (el.closest(`.bae_player_handcol[data-player-id="${myId}"] [data-hand-card]`)
            && (this.host.isGameplayLike() || this.host.isOpeningMulliganLike() || this.host.campSelected))
            return true;
        if (el.closest(`.bae_location_zone[data-player-id="${myId}"]`)
            && (this.host.isGameplayLike() || this.host.isAssignCampLike()))
            return true;
        if (el.closest(`.bae_camp_zone[data-player-id="${myId}"], [data-camp-wrap][data-player-id="${myId}"]`)
            && this.host.isGameplayLike())
            return true;
        if (el.closest('[data-pool-slot]') && this.host.isReplenishLike())
            return true;
        const objBtn = el.closest('[data-obj-idx]');
        if (!objBtn)
            return false;
        const idx = Number(objBtn.dataset.objIdx);
        const obj = this.host.gamedatas.boardState.objectives?.[idx];
        if (!obj?.active || (obj.players?.[myId] ?? 'unmet') !== 'meets')
            return false;
        if (this.host.isPromptClaimObjectiveLike())
            return objBtn.classList.contains('bae_obj_prompt_target');
        if (this.host.isOpeningMulliganLike())
            return false;
        return this.host.isGameplayLike() || this.host.isReplenishLike() || this.host.isAssignCampLike();
    }
    tooltipHostId(el) {
        const tooltips = this.host.bga.gameui.tooltips;
        if (!tooltips)
            return null;
        let node = el;
        while (node && node !== document.body) {
            const id = node.id;
            if (id && tooltips[id])
                return id;
            if (node === this.host.root)
                break;
            node = node.parentElement;
        }
        return null;
    }
    openPinnedTooltip(id) {
        this.tooltipPinnedId = id;
        this.tooltipQuietUntil = 0;
        this.tooltipNeedMove = false;
        this.tooltipWasBlocked = false;
        const gen = this.beginTooltipPlace();
        this.cancelDojoTooltips();
        const showAndFit = () => {
            if (this.tooltipPinnedId !== id || this.tooltipFitGen !== gen)
                return;
            try {
                this.host.bga.gameui.tooltips?.[id]?.open?.(id);
            }
            catch { /* ignore */ }
            this.fitPinnedTooltip(gen);
        };
        showAndFit();
        this.tooltipFitTimers.push(window.setTimeout(() => {
            showAndFit();
            requestAnimationFrame(() => {
                if (this.tooltipFitGen !== gen)
                    return;
                this.fitPinnedTooltip(gen);
                this.endTooltipPlace(gen);
            });
        }, 50));
    }
    beginTooltipPlace() {
        this.clearTooltipFitTimers();
        document.body.classList.add('bae_tooltip_placing');
        return ++this.tooltipFitGen;
    }
    endTooltipPlace(gen) {
        if (gen !== this.tooltipFitGen)
            return;
        document.body.classList.remove('bae_tooltip_placing');
    }
    fitPinnedTooltip(gen = this.tooltipFitGen) {
        if (gen !== this.tooltipFitGen)
            return;
        if (!this.tooltipPinnedId)
            return;
        if (!this.lastPointerWasTouch && !document.body.classList.contains('touch-device'))
            return;
        const anchor = document.getElementById(this.tooltipPinnedId);
        if (!anchor)
            return;
        const pad = 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const tip = this.activeTooltipNode();
        if (!tip)
            return;
        const connector = tip.querySelector('.dijitTooltipConnector');
        if (connector)
            connector.style.display = 'none';
        tip.style.maxWidth = `${vw - pad * 2}px`;
        tip.style.maxHeight = `${Math.max(80, vh - pad * 2)}px`;
        tip.style.width = 'auto';
        tip.style.height = 'auto';
        tip.style.overflow = 'auto';
        const container = tip.querySelector('.dijitTooltipContainer, .dijitTooltipContents');
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
        if (top < pad)
            top = pad;
        left = Math.max(pad, Math.min(vw - pad - tw, left));
        tip.style.position = 'fixed';
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
        tip.style.right = 'auto';
        tip.style.bottom = 'auto';
        tip.style.margin = '0';
        tip.style.transform = 'none';
    }
    activeTooltipNode() {
        const tips = this.tooltipNodes().filter((tip) => {
            if (tip.classList.contains('dijitTooltipHidden'))
                return false;
            return getComputedStyle(tip).display !== 'none';
        });
        return tips.length > 0 ? tips[tips.length - 1] : null;
    }
    clearTooltipFitTimers() {
        for (const id of this.tooltipFitTimers)
            window.clearTimeout(id);
        this.tooltipFitTimers = [];
        this.tooltipFitGen += 1;
    }
    closePinnedTooltip() {
        if (!this.tooltipPinnedId && !document.body.classList.contains('bae_tooltip_placing'))
            return;
        this.tooltipPinnedId = null;
        this.clearTooltipFitTimers();
        document.body.classList.remove('bae_tooltip_placing');
        this.cancelDojoTooltips();
    }
    beginTooltipGuard(zones) {
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
        if (affected)
            this.dismissTooltipFrom(hover);
        this.cancelDojoTooltips();
    }
    endTooltipGuard() {
        this.tooltipNeedMove = true;
        this.tooltipQuietUntil = Date.now() + OptionalUi.TOOLTIP_CLICK_MS;
        this.tooltipWasBlocked = true;
        const hover = this.lastHoverEl;
        if (hover && typeof hover.closest === 'function') {
            this.tooltipLeaveSelector = this.selectorFor(this.interactiveTooltipTarget(hover) ?? hover);
        }
        this.cancelDojoTooltips();
    }
    isTooltipBlocked() {
        if (this.resolving)
            return true;
        if (this.tooltipPinnedId)
            return false;
        if (this.tooltipPointerHeld || this.tooltipDragging || this.dragCardId != null)
            return true;
        if (Date.now() < this.tooltipQuietUntil)
            return true;
        if (this.tooltipNeedMove)
            return true;
        return this.isHoveringLeaveTarget(this.lastHoverEl);
    }
    isHoveringLeaveTarget(hover) {
        if (!hover || !this.tooltipLeaveSelector || typeof hover.closest !== 'function')
            return false;
        try {
            return !!hover.closest(this.tooltipLeaveSelector);
        }
        catch {
            return false;
        }
    }
    retriggerTooltipHover() {
        const hover = this.lastHoverEl;
        if (!hover || typeof hover.dispatchEvent !== 'function')
            return;
        this.tooltipRetrigger = true;
        hover.dispatchEvent(new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            view: window,
        }));
    }
    setTouchHit(el) {
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
    ensureTouchHitBox() {
        if (this.touchHitBox?.isConnected)
            return this.touchHitBox;
        const box = document.createElement('div');
        box.className = 'bae_touch_hit_box';
        box.setAttribute('aria-hidden', 'true');
        box.hidden = true;
        this.host.root.appendChild(box);
        this.touchHitBox = box;
        return box;
    }
    clearTouchHit() {
        this.touchHitEl = null;
        if (this.touchHitBox)
            this.touchHitBox.hidden = true;
        this.host.root?.querySelectorAll('.bae_touch_hit').forEach((n) => n.classList.remove('bae_touch_hit'));
    }
    touchHitRect(el) {
        if (el.classList.contains('bae_location_zone')) {
            const canvas = el.closest('.bae_board_canvas');
            const extend = canvas ? (parseFloat(getComputedStyle(canvas).marginTop) || 0) : 0;
            const r = el.getBoundingClientRect();
            const rects = [new DOMRect(r.left, r.top - extend, r.width, r.height + extend)];
            el.querySelectorAll('.bae_pile_slot').forEach((slot) => rects.push(slot.getBoundingClientRect()));
            return this.unionRects(rects);
        }
        if (el.classList.contains('bae_track')) {
            const rects = Array.from(el.querySelectorAll('.bae_track_position')).map((n) => n.getBoundingClientRect());
            return this.unionRects(rects.length > 0 ? rects : [el.getBoundingClientRect()]);
        }
        return el.getBoundingClientRect();
    }
    unionRects(rects) {
        const vis = rects.filter((r) => r.width > 0 && r.height > 0);
        if (vis.length === 0)
            return new DOMRect(0, 0, 0, 0);
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
    touchHitTarget(el) {
        if (!el || typeof el.closest !== 'function')
            return null;
        if (el.closest('.bae_zoom_btn, .bae_round_badge, .bgabutton, .action-button'))
            return null;
        const myId = Number(this.host.bga.players.getCurrentPlayerId());
        const loc = el.closest('.bae_location_zone');
        const selectingLoc = !!loc
            && Number(loc.dataset.playerId) === myId
            && this.host.bga.players.isCurrentPlayerActive()
            && !this.host.isActionBusy()
            && (this.host.isGameplayLike() || this.host.isAssignCampLike());
        if (selectingLoc)
            return loc;
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
        ].join(','));
    }
    interactiveTooltipTarget(el) {
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
    selectorFor(el) {
        const host = el;
        if (host.id)
            return `#${host.id}`;
        const loc = host.closest?.('.bae_location_zone');
        if (loc?.dataset.playerId != null && loc.dataset.loc != null) {
            return `.bae_location_zone[data-player-id="${loc.dataset.playerId}"][data-loc="${loc.dataset.loc}"]`;
        }
        const camp = host.closest?.('.bae_camp_zone');
        if (camp?.id)
            return `#${camp.id}`;
        const card = host.closest?.('.bae_card');
        if (card?.id)
            return `#${card.id}`;
        return null;
    }
    hoverTooltipZone() {
        const el = this.lastHoverEl;
        if (!el || typeof el.closest !== 'function')
            return null;
        if (el.closest('.bae_pool, .bae_top_pool'))
            return 'pool';
        const board = el.closest('.bae_playerboard');
        if (board?.dataset.playerId)
            return `player:${board.dataset.playerId}`;
        return null;
    }
    tooltipNodes() {
        return Array.from(document.querySelectorAll('.dijitTooltip, .dijitTooltipPopup, .bga-tooltip'));
    }
    repairTooltipNodes() {
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
    dismissTooltipFrom(from) {
        this.repairTooltipNodes();
        if (from && typeof from.dispatchEvent === 'function') {
            const related = document.body;
            const bubble = { bubbles: true, cancelable: true, view: window, relatedTarget: related };
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
    cancelDojoTooltips() {
        this.repairTooltipNodes();
        const hideWidget = (tip) => {
            if (!tip || typeof tip !== 'object')
                return;
            const t = tip;
            try {
                if (t._showTimer) {
                    window.clearTimeout(t._showTimer);
                    t._showTimer = null;
                }
                t.close?.();
                t._onUnHover?.();
            }
            catch { /* ignore */ }
        };
        const ui = this.host.bga?.gameui;
        if (ui) {
            for (const key of ['tooltips', '_tooltips']) {
                const map = ui[key];
                if (map && typeof map === 'object') {
                    for (const tip of Object.values(map))
                        hideWidget(tip);
                }
            }
        }
        const w = window;
        try {
            w.dijit?.hideTooltip?.();
        }
        catch { /* ignore */ }
        hideWidget(w.dijit?._masterTT);
        document.querySelectorAll('.dijitTooltip, .dijitTooltipPopup').forEach((node) => {
            node.classList.add('dijitTooltipHidden');
        });
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
    async animateScientists(pid, next, ms) {
        const root = this.host.root;
        const leftHold = this.holdMeeples(pid, 'left');
        const rightHold = this.holdMeeples(pid, 'right');
        const used = new Set();
        const flights = [];
        const assigned = [];
        const currentAt = (loc) => {
            if (leftHold.length + rightHold.length > 0 && loc === 3)
                return leftHold;
            if (leftHold.length + rightHold.length > 0 && loc === 4)
                return rightHold;
            const shelf = this.shelfEl(pid, loc);
            return Array.from(shelf?.querySelectorAll('.bae_meeple_img') ?? []);
        };
        const dist2 = (el, dest) => {
            const r = el.getBoundingClientRect();
            const dx = (r.left + r.width / 2) - (dest.left + dest.width / 2);
            const dy = (r.top + r.height / 2) - (dest.top + dest.height / 2);
            return dx * dx + dy * dy;
        };
        const takeNearest = (els, color, dest) => {
            const candidates = els.filter((node) => !used.has(node) && Number(node.dataset.scientist) === color);
            if (candidates.length === 0)
                return null;
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
        const filled = slotsByLoc.map((row) => row.slots.map(() => null));
        for (const row of slotsByLoc) {
            if (!row.shelf)
                continue;
            const staying = currentAt(row.loc);
            row.slots.forEach((slot, i) => {
                const sample = staying[0];
                if (!sample)
                    return;
                const dest = this.meepleSlotRect(row.shelf, slot, sample);
                const el = takeNearest(staying, slot.color, dest);
                if (el)
                    filled[row.loc][i] = el;
            });
        }
        for (const row of slotsByLoc) {
            row.slots.forEach((slot, i) => {
                if (filled[row.loc][i])
                    return;
                let el = null;
                const sample = row.shelf?.querySelector('.bae_meeple_img')
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
                if (el)
                    filled[row.loc][i] = el;
            });
        }
        for (const row of slotsByLoc) {
            if (!row.shelf)
                continue;
            row.slots.forEach((slot, i) => {
                const el = filled[row.loc][i];
                if (!el)
                    return;
                const dest = this.meepleSlotRect(row.shelf, slot, el);
                const r = el.getBoundingClientRect();
                if (Math.abs(r.left - dest.left) < 3 && Math.abs(r.top - dest.top) < 3)
                    return;
                assigned.push({ el, dest });
            });
        }
        const movers = new Set(assigned.map((row) => row.el));
        const destOf = new Map(assigned.map((row) => [row.el, row.dest]));
        const stackItems = [];
        const seen = new Set();
        const consider = (el) => {
            if (seen.has(el))
                return;
            seen.add(el);
            const from = el.getBoundingClientRect();
            const dest = destOf.get(el) ?? from;
            const clone = placeScientistClone(el, 'bae_resolve_clone', root);
            el.style.visibility = 'hidden';
            stackItems.push({ clone, from, dest });
            if (movers.has(el))
                flights.push(flyClone(clone, dest, ms, root, true));
        };
        for (const { el } of assigned)
            consider(el);
        for (let loc = 0; loc <= 4; loc++) {
            for (const el of currentAt(loc))
                consider(el);
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
        if (flights.length > 0)
            await Promise.all(flights);
    }
    scientistLayout(playerId, sci, location) {
        const poses = sci?.[playerId];
        if (!poses)
            return [];
        const meeples = [];
        for (let col = 0; col < 3; col++) {
            const n = (poses[col] ?? []).filter((p) => p === location).length;
            for (let i = 0; i < n; i++)
                meeples.push(col);
        }
        const n = meeples.length;
        if (n === 0)
            return [];
        const [cols, rows] = (() => {
            switch (n) {
                case 1: return [1, 1];
                case 2: return [2, 1];
                case 3: return location < 3 ? [3, 1] : [2, 2];
                case 4: return [2, 2];
                case 5: return location < 3 ? [3, 2] : [2, 3];
                case 6: return location < 3 ? [3, 2] : [2, 3];
                case 7: return location < 3 ? [3, 3] : [2, 4];
                case 8: return location < 3 ? [3, 3] : [2, 4];
                case 9: return [3, 3];
                default: return location < 3
                    ? [4, Math.ceil(n / 4)]
                    : [3, Math.ceil(n / 3)];
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
    meepleSlotRect(shelf, slot, sample) {
        const probe = sample.cloneNode(true);
        probe.removeAttribute('id');
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        probe.style.left = `${slot.leftPct}%`;
        probe.style.top = `${slot.topPct}%`;
        shelf.appendChild(probe);
        const rect = probe.getBoundingClientRect();
        probe.remove();
        if (rect.width < 1 || rect.height < 1) {
            return this.meepleSlotRectFromBox(shelf.getBoundingClientRect(), slot, sample);
        }
        return rect;
    }
    meepleSlotRectFromBox(box, slot, sample) {
        const size = sample.getBoundingClientRect();
        const cx = box.left + box.width * slot.leftPct / 100;
        const cy = box.top + box.height * slot.topPct / 100;
        return new DOMRect(cx - size.width / 2, cy - size.height / 2, size.width, size.height);
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
OptionalUi.DISCARD_LOOP_MS = 1850;
OptionalUi.POINTER_DRAG_PX = 16;
OptionalUi.TOUCH_TAP_PX = 24;
OptionalUi.TOOLTIP_CLICK_MS = 500;

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

const SCI_COLOR = ["#ddb162", "#eca6b8", "#7dc7bc"];
class Game {
    constructor(bga) {
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.selectedPoolSlot = null;
        this.selectedObjectiveIdx = null;
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
        this.actionPending = false;
        this.optionalUi = null;
        this.bga = bga;
        this.preloadGameImages();
    }
    setup(gamedatas) {
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
        this.optionalUi?.onBoardScaleChanged();
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
    getScale() {
        return this.getScaleForZoomFactor(this.zoomFactor);
    }
    firstZoomOutFromFit() {
        const fit = this.getScaleForZoomFactor(1);
        let nextZoom = 1;
        while (nextZoom > Game.ZOOM_MIN + 0.0001) {
            nextZoom = Math.max(Game.ZOOM_MIN, Number((nextZoom - Game.ZOOM_STEP).toFixed(3)));
            if (fit - this.getScaleForZoomFactor(nextZoom) > 0.0001)
                return nextZoom;
        }
        return 1;
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
            const resetZoom = this.firstZoomOutFromFit();
            if (Math.abs(this.zoomFactor - resetZoom) <= 0.0001)
                return;
            this.zoomFactor = resetZoom;
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
                    const html = this.buildCardTooltipSpriteHtml('animal', 9999, _('Hidden hand card'), [_('You cannot see cards in other players hands. Animations do not indicate cards positions.')]);
                    this.bga.gameui.addTooltipHtml(id, html);
                }
                else {
                    this.bga.gameui.addTooltip(id, _('You cannot see cards in other players hands. Animations do not indicate cards positions.'), '');
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
    refreshScientistTooltips() {
        this.registerScientistTooltips();
    }
    buildCardTooltipSpriteHtml(type, id, title, details, scoresHtml = '') {
        return this.buildCardTooltipSpriteHtmlInternal(type, id, title, details, scoresHtml);
    }
    wrapTooltipGrid(cells) {
        if (cells.length === 0)
            return '';
        if (cells.length === 1)
            return cells[0];
        return `<div class="bae_tooltip_grid">${cells.map((cell) => `<div>${cell}</div>`).join('')}</div>`;
    }
    canSelectObjectiveToClaim() {
        return this.bga.players.isCurrentPlayerActive()
            && !this.isPromptClaimObjectiveLike()
            && !this.isOpeningMulliganLike()
            && (this.isGameplayLike() || this.isReplenishLike() || this.isAssignCampLike());
    }
    addClaimObjectiveButton() {
        if (!this.canSelectObjectiveToClaim() || this.selectedObjectiveIdx == null)
            return;
        const idx = this.selectedObjectiveIdx;
        const myId = Number(this.bga.players.getCurrentPlayerId());
        const obj = this.gamedatas.boardState.objectives?.[idx];
        const can = (obj?.players?.[myId] ?? 'unmet') === 'meets';
        this.bga.statusBar.addActionButton(_("Claim Objective"), () => {
            if (!can)
                return;
            void this.sendAction("actClaimObjective", { objective_index: idx });
        }, {
            disabled: !can,
            tooltip: _("Claim this objective now and score 5 VP."),
        });
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
        await this.sendAction("actRegroup", {
            card_ids_json: JSON.stringify(cardIds),
        });
    }
    enterRegroupMode() {
        if (this.actionPending)
            return;
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.selectedPoolSlot = null;
        this.selectedObjectiveIdx = null;
        this.campSelected = true;
        this.selectedRegroupIds.clear();
        this.renderAll();
        this.onUpdateActionButtons(this.currentStateName(), null);
        this.optionalUi?.onSelectionChanged();
        this.optionalUi?.playSound('select');
    }
    isActionBusy() {
        return this.actionPending;
    }
    sendAction(action, args) {
        if (this.actionPending)
            return Promise.resolve();
        if (!this.bga.actions.checkAction(action, true)) {
            this.bga.actions.checkAction(action);
            return Promise.resolve();
        }
        this.beginActionSubmit();
        const result = this.bga.actions.performAction(action, args, { checkAction: false });
        if (result == null || typeof result.then !== 'function') {
            this.endActionSubmit();
            return Promise.resolve();
        }
        return result.catch((err) => {
            this.endActionSubmit();
            throw err;
        });
    }
    beginActionSubmit() {
        this.actionPending = true;
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
        this.root?.querySelectorAll('.bae_loc_selected, .bae_camp_selected, .bae_obj_selected').forEach((el) => {
            el.classList.remove('bae_loc_selected', 'bae_camp_selected', 'bae_obj_selected');
        });
        this.root?.querySelectorAll('.bae_confirm_blurb').forEach((el) => el.remove());
        this.bga.statusBar.removeActionButtons();
    }
    endActionSubmit() {
        this.actionPending = false;
        this.root?.classList.remove('bae_action_busy');
    }
    isReplayOrSpectator() {
        try {
            if (this.bga.players.isCurrentPlayerSpectator())
                return true;
        }
        catch (_) { /* gamedatas may not be ready */ }
        const ui = this.bga.gameui;
        if (ui?.isSpectator)
            return true;
        if (ui?.instantaneousMode)
            return true;
        if (typeof g_archive_mode !== 'undefined' && g_archive_mode)
            return true;
        if (typeof g_replayFrom !== 'undefined')
            return true;
        return false;
    }
    clearSelection() {
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
            void this.sendAction("actUndo", {});
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
        if (this.actionPending || !this.isGameplayLike() || !this.bga.players.isCurrentPlayerActive())
            return false;
        if (cardId == null || location == null)
            return false;
        if (!this.isObserveSelectionLegal(cardId, location))
            return false;
        void this.sendAction("actObserveAnimal", {
            card_id: cardId,
            location,
        });
        return true;
    }
    renderAll() {
        this.endActionSubmit();
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
            if (playerState === "claimed")
                extraClass = " bae_obj_claimed_by_you";
            const anyClaimed = obj.active && Object.values(obj.players).some((s) => s === "claimed");
            if (anyClaimed)
                extraClass += " bae_obj_claimed_round";
            if (promptedObjectiveIdx === idx)
                extraClass += " bae_obj_prompt_target";
            const disabledAttr = obj.active ? "" : "disabled";
            const canConfirmClaim = this.canSelectObjectiveToClaim()
                && this.selectedObjectiveIdx === idx
                && playerState === "meets";
            const promptConfirmBlurb = promptedObjectiveIdx === idx
                ? `<span class="bae_confirm_blurb">${this.escapeHtml(confirmObserveBlurb)}</span>`
                : (canConfirmClaim ? `<span class="bae_confirm_blurb">${this.escapeHtml(confirmObserveBlurb)}</span>` : "");
            const selectedClass = canConfirmClaim ? " bae_obj_selected" : "";
            // give each objective an ID so we can attach the BGA tooltip API instead of title attributes
            html += `<button id="bae_obj_${idx}" type="button" class="bae_obj${extraClass}${selectedClass}" data-obj-idx="${idx}" ${disabledAttr}>${this.objectiveFaceById(obj.id)}${promptConfirmBlurb}</button>`;
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
        const desired = Math.max(0.18, baseScale * 2);
        const viewport = Math.max(160, Math.min(window.innerWidth, document.documentElement.clientWidth) - 48);
        const box = Math.min(viewport * 0.92, Game.TOOLTIP_MAX_WIDTH_PX);
        const gap = 8;
        const columns = 2;
        const maxCardW = (box - gap * (columns - 1)) / columns;
        const cap = maxCardW / Game.CARD_REFERENCE_HEIGHT_PX;
        return Math.max(0.12, Math.min(desired, cap));
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
    registerScientistTooltips() {
        if (!this.bga || !this.bga.gameui || typeof (this.bga.gameui.addTooltip) !== 'function')
            return;
        const d = this.gamedatas.boardState;
        const scientistNames = this.gamedatas.materials.scientist_names ?? [];
        const sciByPlayer = d.scientists || {};
        const countParts = (sciMap, at) => {
            if (!sciMap)
                return [];
            const locs = Array.isArray(at) ? at : [at];
            const parts = [];
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
        const summaryAt = (sciMap, atIndex) => {
            const parts = countParts(sciMap, atIndex);
            return parts.length > 0 ? parts.join(', ') : _('No scientists');
        };
        for (const pidStr of Object.keys(this.gamedatas.players)) {
            const pid = Number(pidStr);
            const holding = !!this.root.querySelector(`#bae_regroup_hold_${pid}_left, #bae_regroup_hold_${pid}_right`);
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
            const campHelp = holding ? _('No scientists') : summaryAt(sciByPlayer[pid], 3);
            const campHelpR = holding ? _('No scientists') : summaryAt(sciByPlayer[pid], 4);
            this.bga.gameui.addTooltip(leftId, campHelp, _('Select this camp to start/cancel regroup.'));
            this.bga.gameui.addTooltip(rightId, campHelpR, _('Select this camp to start/cancel regroup.'));
            const reassignParts = countParts(sciByPlayer[pid], [3, 4]);
            const reassignHelp = reassignParts.length > 0
                ? `${_('Reassign')} ${reassignParts.join(', ')}`
                : `${_('Reassign')} ${_('No scientists')}`;
            for (const side of ['left', 'right']) {
                const holdId = `bae_regroup_hold_${pid}_${side}`;
                try {
                    this.bga.gameui.removeTooltip(holdId);
                }
                catch (_) { }
                if (this.root.querySelector(`#${holdId}`)) {
                    this.bga.gameui.addTooltip(holdId, reassignHelp, '');
                }
            }
            for (let loc = 0; loc < 3; loc++) {
                const shelfId = `bae_sci_shelf_loc_${pid}_${loc}`;
                try {
                    this.bga.gameui.removeTooltip(shelfId);
                }
                catch (_) { }
                this.bga.gameui.addTooltip(shelfId, summaryAt(sciByPlayer[pid], loc), '');
            }
        }
    }
    registerTooltips() {
        // Ensure gameui tooltip API is available
        if (!this.bga || !this.bga.gameui || typeof (this.bga.gameui.addTooltip) !== 'function')
            return;
        const d = this.gamedatas.boardState;
        // Pool slots: all face-up pool cards share one grouped tooltip
        const poolCells = (d.pool || []).slice().sort((a, b) => a.slot - b.slot).map((slot) => (this.buildCardTooltipSpriteHtml('animal', slot.id, _('Pool card'), [])));
        const poolGroupHtml = this.wrapTooltipGrid(poolCells);
        (d.pool || []).forEach((slot) => {
            const id = `bae_pool_slot_${slot.slot}`;
            try {
                this.bga.gameui.removeTooltip(id);
            }
            catch (_) { }
            this.bga.gameui.addTooltipHtml(id, poolGroupHtml);
        });
        try {
            this.bga.gameui.removeTooltip('bae_pool_slot_deck');
        }
        catch (_) { }
        this.bga.gameui.addTooltip('bae_pool_slot_deck', `${_('Deck')}: ${d.deck_count}<br>${_('Discard')}: ${d.discard_count}`, _('Click to draw from deck'));
        // Objectives: hovering any one shows all of them in the top-row layout
        const objectiveCells = (d.objectives || []).map((obj) => {
            const objectiveMat = this.gamedatas.materials.objectives[obj.id];
            return this.buildCardTooltipSpriteHtml('objective', obj.id, objectiveMat?.title ?? `${_('Objective')} #${obj.id}`, [this.objectiveActionText(obj)], this.objectiveScoresHtml(obj, d));
        });
        const objectiveGroupHtml = this.wrapTooltipGrid(objectiveCells);
        (d.objectives || []).forEach((_obj, idx) => {
            const id = `bae_obj_${idx}`;
            try {
                this.bga.gameui.removeTooltip(id);
            }
            catch (_) { }
            this.bga.gameui.addTooltipHtml(id, objectiveGroupHtml);
        });
        // Scoring cards: hovering any one shows all of them in the top-row layout
        const scoringCells = (d.scoring_cards || []).map((scoringId) => {
            const scoringMat = this.gamedatas.materials.scoring_cards?.[scoringId];
            const title = scoringMat?.title ?? `${_('Scoring card')} #${scoringId}`;
            const explanation = scoringMat?.explanation ?? '';
            return this.buildCardTooltipSpriteHtml('scoring', scoringId, title, [explanation], this.scoringScoresHtml(scoringId, d));
        });
        const scoringGroupHtml = this.wrapTooltipGrid(scoringCells);
        (d.scoring_cards || []).forEach((_scoringId, idx) => {
            const id = `bae_score_${idx}`;
            try {
                this.bga.gameui.removeTooltip(id);
            }
            catch (_) { }
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
                    try {
                        this.bga.gameui.removeTooltip(id);
                    }
                    catch (_) { }
                    const def = this.animalDef(card.id);
                    const species = this.gamedatas.materials.species_names?.[def?.species ?? 0] ?? '';
                    const vehicle = this.gamedatas.materials.vehicle_names?.[def?.vehicle ?? 0] ?? '';
                    const sci = this.gamedatas.materials.scientist_names ?? [];
                    const effect = def
                        ? `${_('Moves')} ${sci[def.left_move] ?? def.left_move} ${_('left')} · ${sci[def.right_move] ?? def.right_move} ${_('right')}. ${_('Vehicle')}: ${vehicle}. ${_('Bonus VP')}: ${def.bonus_vp}.`
                        : '';
                    const html = this.buildCardTooltipSpriteHtml('animal', card.id, `${species || _('Animal card')} #${card.id}`, [effect]);
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
                const html = this.explorationTrackTooltipHtml(d.flags?.[pid]?.[loc] ?? 0, tracksVehicles[trackKey] ?? [], trackVps[loc] ?? [], vehicleNames);
                const trackId = `bae_track_${pid}_${loc}`;
                try {
                    this.bga.gameui.removeTooltip(trackId);
                }
                catch (_) { }
                this.bga.gameui.addTooltipHtml(trackId, html);
                for (let i = 0; i < 8; i++) {
                    try {
                        this.bga.gameui.removeTooltip(`bae_track_${pid}_${loc}_${i}`);
                    }
                    catch (_) { }
                }
            }
        }
        const speciesSetHtml = this.speciesSetVpTooltipHtml();
        for (const pidStr of Object.keys(this.gamedatas.players)) {
            const id = `bae_animal_loc_vp_${Number(pidStr)}`;
            try {
                this.bga.gameui.removeTooltip(id);
            }
            catch (_) { }
            this.bga.gameui.addTooltipHtml(id, speciesSetHtml);
        }
        for (const pidStr of Object.keys(this.gamedatas.players)) {
            const pid = Number(pidStr);
            const id = `bae_vp_tokens_${pid}`;
            try {
                this.bga.gameui.removeTooltip(id);
            }
            catch (_) { }
            this.bga.gameui.addTooltipHtml(id, this.vpTokensTooltipHtml(pid));
        }
    }
    renderTrackColumn(player_id, track, location, flagDepth) {
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
    seatedPlayerIds() {
        const order = this.gamedatas.playerOrder;
        if (Array.isArray(order) && order.length > 0) {
            return order.map(Number).filter((pid) => pid > 0 && this.gamedatas.players[pid]);
        }
        return Object.keys(this.gamedatas.players).map(Number);
    }
    playerColorCss(pid) {
        const raw = String(this.gamedatas.players[pid]?.color ?? '').trim();
        if (!raw)
            return '#1a1a1a';
        return raw.startsWith('#') ? raw : `#${raw}`;
    }
    coloredPlayerName(pid) {
        const name = this.escapeHtml(this.gamedatas.players[pid]?.name ?? `${_('Player')} ${pid}`);
        return `<span class="bae_tooltip_player_name" style="color:${this.playerColorCss(pid)}">${name}</span>`;
    }
    vpInlineIcon() {
        const vpIcon = `${this.bga.images.getImgUrl()}Tokens/VP.svg`;
        return `<span class="bae_text_with_icon"><img class="bae_vp_inline" src="${vpIcon}" alt="${this.escapeHtml(_('VP'))}" draggable="false"/></span>`;
    }
    vpTokensTooltipHtml(pid) {
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
    speciesSetVpTooltipHtml() {
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
    explorationTrackTooltipHtml(flagDepth, trackVehicles, spaceVp, vehicleNames) {
        const baseUrl = this.bga.images.getImgUrl();
        const vehicleIcon = `${baseUrl}Tokens/track_obj.webp`;
        const flagIcon = `${baseUrl}Tokens/FlagToken.webp`;
        const vpIcon = this.vpInlineIcon();
        const vehicleHead = (n) => (`<span class="bae_track_tooltip_vehicle_head"><img class="bae_tooltip_token" src="${vehicleIcon}" alt="${this.escapeHtml(_('Vehicle'))}" draggable="false"/> ${n}</span>`);
        const nameOf = (id) => {
            if (id == null)
                return '';
            return this.escapeHtml(vehicleNames[id] ?? `#${id}`);
        };
        const flagCell = (space) => (space === flagDepth
            ? `<img class="bae_tooltip_flag" src="${flagIcon}" alt="${this.escapeHtml(_('Flag'))}" draggable="false"/>`
            : '');
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
    tooltipTextHtml(text) {
        return this.escapeHtml(text).replace(/\{VP\}/g, this.vpInlineIcon());
    }
    tooltipScoresHtml(rows) {
        return rows
            .map((row) => `<div>${this.coloredPlayerName(row.pid)}: ${this.tooltipTextHtml(row.value)}</div>`)
            .join('');
    }
    objectiveScoresHtml(obj, state) {
        const materials = this.gamedatas.materials;
        const progress = this.tooltipScoresHtml(this.seatedPlayerIds().map((pid) => {
            const { count, required } = objectiveProgress(obj.id, pid, state, materials);
            return { pid, value: `${count}/${required}` };
        }));
        const claimed = this.seatedPlayerIds().filter((pid) => obj.players?.[pid] === 'claimed');
        if (claimed.length === 0)
            return progress;
        const claimedLine = `<div class="bae_tooltip_claimed_by">${this.escapeHtml(_('Claimed by'))}: ${claimed.map((pid) => this.coloredPlayerName(pid)).join(', ')}</div>`;
        return `${progress}${claimedLine}`;
    }
    scoringScoresHtml(scoringId, state) {
        const materials = this.gamedatas.materials;
        return this.tooltipScoresHtml(this.seatedPlayerIds().map((pid) => {
            const vp = scoreScoringCard(scoringId, pid, state, materials);
            return { pid, value: String(vp) };
        }));
    }
    objectiveClaimedThisRound(obj) {
        return !!obj.active && Object.values(obj.players ?? {}).some((s) => s === 'claimed');
    }
    objectiveActionText(obj) {
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
        if (claimedThisRound)
            return endRoundPrompt;
        if (!obj.active)
            return _('The objective has been claimed on a previous round.');
        if (!seated)
            return '';
        if (playerState !== 'meets')
            return _('You do not meet the requirements for this objective.');
        if (this.isPromptClaimObjectiveLike() && this.bga.players.isCurrentPlayerActive()) {
            return _('Click to claim this objective now, or use the status bar if you would rather pass.');
        }
        if (this.bga.players.isCurrentPlayerActive() && !this.isOpeningMulliganLike()) {
            return _('Click to select this objective, then click again (or confirm) to claim it for 5 VP.');
        }
        return _('Click to claim this objective on your turn.');
    }
    buildCardTooltipSpriteHtmlInternal(type, id, _title, details, scoresHtml = '') {
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
        }
        else if (type === 'scoring') {
            cardHtml = this.applyTooltipScaleToCardFace('scoring', id, tooltipScale);
        }
        else if (type === 'animal') {
            cardHtml = this.cardFaceById(id)
                .replace('<div class="bae_card_img bae_overlay_card"', `<div class="bae_card_img bae_overlay_card" style="width:100%;height:100%;--animal-sprite-url:url('${animalSpriteUrl}');--objective-sprite-url:url('${objectiveSpriteUrl}');--scoring-sprite-url:url('${scoringSpriteUrl}');"`);
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
                if (this.actionPending || !this.bga.players.isCurrentPlayerActive())
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
                    this.selectedObjectiveIdx = null;
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
                if (this.actionPending)
                    return;
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
                    }
                    else {
                        if (this.selectedLocation === loc) {
                            if (this.confirmObserveIfReady(this.selectedCardId, loc))
                                return;
                            return;
                        }
                        this.selectedObjectiveIdx = null;
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
                if (this.actionPending)
                    return;
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
                    }
                    else {
                        if (this.selectedLocation === loc) {
                            if (this.confirmObserveIfReady(this.selectedCardId, loc))
                                return;
                            return;
                        }
                        this.selectedObjectiveIdx = null;
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
                if (this.actionPending || !this.isGameplayLike() || !this.bga.players.isCurrentPlayerActive())
                    return;
                // Camp selection is idempotent: clicking camp again does nothing.
                if (this.campSelected)
                    return;
                this.enterRegroupMode();
            }, true);
        });
        this.root.querySelectorAll("[data-pool-slot]").forEach((el) => {
            el.addEventListener("click", () => {
                if (this.actionPending || !this.bga.players.isCurrentPlayerActive())
                    return;
                if (!this.isReplenishLike())
                    return;
                const slot = Number(el.dataset.poolSlot);
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
                const idx = Number(el.dataset.objIdx);
                if (this.actionPending || !this.bga.players.isCurrentPlayerActive())
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
                    void this.sendAction("actClaimPromptObjective", { objective_index: idx });
                    return;
                }
                if (!this.canSelectObjectiveToClaim())
                    return;
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
                this.optionalUi?.playSound('select');
            });
        });
    }
    onEnteringState(stateName, entryArgs) {
        this.cacheStateActionArgs(entryArgs.args);
        this.selectedCardId = null;
        this.selectedLocation = null;
        this.selectedPoolSlot = null;
        this.selectedObjectiveIdx = null;
        this.campSelected = false;
        const n = stateName.toLowerCase();
        const keepOpeningDiscards = n.includes('openingmulligan') || n.includes('opening_mulligan');
        if (!keepOpeningDiscards)
            this.selectedRegroupIds.clear();
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
        if (this.actionPending || !this.bga.players.isCurrentPlayerActive())
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
                    if (!observeMissingSelection)
                        this.optionalUi?.showInvalidObserveHint();
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
            const replenishArgs = effectiveArgs;
            const poolCardSelected = this.selectedPoolSlot != null && this.selectedPoolSlot >= 0;
            this.bga.statusBar.addActionButton(_("Draw Card"), () => {
                if (!poolCardSelected || this.selectedPoolSlot == null)
                    return;
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
                tooltip: can ? _("Pay 1 VP to discard all 4 available cards forming the pool and replace them with 4 new ones from the deck before choosing your card.") : _("You can only mulligan once per turn, only if you have at least 1 VP."),
            });
            this.addUndoActionButton(replenishArgs?.canUndo ?? this.cachedUndoCanUndo, replenishArgs?.undoType ?? this.cachedUndoType);
        }
        if (sn.includes("assigncamp") || sn.includes("assign_camp")) {
            this.addClaimObjectiveButton();
            const assignArgs = effectiveArgs;
            const locationSelected = this.selectedLocation != null;
            this.bga.statusBar.addActionButton(_("Assign Scientists"), () => {
                if (!locationSelected || this.selectedLocation == null)
                    return;
                void this.sendAction("actAssignScientists", { location: this.selectedLocation });
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
        const pid = Number(args.player_id ?? args.playerId ?? 0);
        const myId = Number(this.bga.players.getCurrentPlayerId());
        if (pid === myId || !this.isOpeningMulliganLike()) {
            this.selectedRegroupIds.clear();
        }
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
        const prev = this.gamedatas.boardState;
        try {
            await this.optionalUi?.playObjectiveClaimResolution(prev, _args);
        }
        catch (_) { /* keep state apply */ }
        if (_args.boardState) {
            this.gamedatas.boardState = _args.boardState;
        }
        this.renderAll();
    }
    async notif_objectiveScored(_args) {
        const prev = this.gamedatas.boardState;
        try {
            await this.optionalUi?.playObjectiveClaimResolution(prev, _args);
        }
        catch (_) { /* keep state apply */ }
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
        const args = _args?.args ?? _args;
        const prev = this.gamedatas.boardState;
        try {
            await this.optionalUi?.playScoringStepResolution(prev, args);
        }
        catch (_) { /* keep state apply */ }
        if (args.boardState) {
            this.gamedatas.boardState = args.boardState;
        }
        this.renderAll();
        const pid = Number(args.player_id ?? args.playerId ?? 0);
        const anchorId = String(args.anchor_id ?? `bae_playerboard_${pid}`);
        let color = String(args.color ?? (this.gamedatas.players?.[pid]?.color ?? ""));
        if (color.startsWith && color.startsWith('#'))
            color = color.substring(1);
        const amount = scoringStepAmount(args);
        const scoreStr = (amount >= 0 ? '+' : '') + String(amount);
        const duration = typeof args.duration === 'number' ? args.duration : 1200;
        const offset_x = typeof args.offset_x === 'number' ? Number(args.offset_x) : undefined;
        const offset_y = typeof args.offset_y === 'number' ? Number(args.offset_y) : undefined;
        try {
            if (this.bga && this.bga.gameui && typeof this.bga.gameui.displayScoring === 'function') {
                this.bga.gameui.displayScoring(anchorId, color, scoreStr, duration, offset_x ?? null, offset_y ?? null);
            }
        }
        catch (err) {
            console.error('scoringStep display failed', err, args);
        }
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
Game.TOOLTIP_MAX_WIDTH_PX = 640;
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
