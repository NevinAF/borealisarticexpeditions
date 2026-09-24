/** OPTIONAL: lightweight FLIP-style clones for previews and resolutions. */

export function animMs(speed: number): number {
  if (speed === 0) return 0;
  if (speed === 1) return 720;
  if (speed === 3) return 360;
  return 560;
}

export function rectOf(el: Element | null): DOMRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 && r.height < 1) return null;
  return r;
}

export function motionLayer(root: HTMLElement, under = false): HTMLElement {
  const sel = under ? '.bae_motion_layer_under' : '.bae_motion_layer:not(.bae_motion_layer_under)';
  let layer = root.querySelector(sel) as HTMLElement | null;
  if (!layer) {
    layer = document.createElement('div');
    layer.className = under ? 'bae_motion_layer bae_motion_layer_under' : 'bae_motion_layer';
    root.appendChild(layer);
  }
  return layer;
}

export function scientistMotionLayer(root: HTMLElement): HTMLElement {
  let layer = root.querySelector('.bae_sci_motion_layer') as HTMLElement | null;
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'bae_sci_motion_layer';
    root.appendChild(layer);
  }
  return layer;
}

/** Higher on screen (and righter) stays behind; lower (and lefter) paints in front. */
export function stackByScreenPosition(
  items: Array<{ el: HTMLElement; top: number; left: number }>,
): void {
  const sorted = [...items].sort((a, b) => a.top - b.top || b.left - a.left);
  sorted.forEach((item, i) => {
    item.el.style.zIndex = String(i + 1);
  });
}

export function clearMotionLayer(root: HTMLElement): void {
  root.querySelectorAll('.bae_motion_clone, .bae_invalid_bubble').forEach((el) => el.remove());
  document.querySelectorAll('body > .bae_motion_clone, body > .bae_invalid_bubble').forEach((el) => el.remove());
}

function localOffset(parent: HTMLElement, left: number, top: number): { left: number; top: number } {
  const origin = parent.getBoundingClientRect();
  const cs = getComputedStyle(parent);
  const bl = parseFloat(cs.borderLeftWidth) || 0;
  const bt = parseFloat(cs.borderTopWidth) || 0;
  return {
    left: left - origin.left - bl + parent.scrollLeft,
    top: top - origin.top - bt + parent.scrollTop,
  };
}

function localRect(parent: HTMLElement, r: DOMRect): { left: number; top: number; width: number; height: number } {
  const loc = localOffset(parent, r.left, r.top);
  return { left: loc.left, top: loc.top, width: r.width, height: r.height };
}

export function offsetRect(r: DOMRect, dx: number, dy: number): DOMRect {
  return new DOMRect(r.left + dx, r.top + dy, r.width, r.height);
}

function containingBlock(clone: HTMLElement, fallback: HTMLElement): HTMLElement {
  const parent = clone.offsetParent;
  return parent instanceof HTMLElement ? parent : fallback;
}

/** Move a clone into `parent` without changing its on-screen position. */
export function adoptClone(clone: HTMLElement, parent: HTMLElement): void {
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

function copySpriteVars(from: HTMLElement, to: HTMLElement): void {
  const cs = getComputedStyle(from);
  for (const name of ['--animal-sprite-url', '--objective-sprite-url', '--scoring-sprite-url', '--bae-scale']) {
    const value = cs.getPropertyValue(name).trim();
    if (value) to.style.setProperty(name, value);
  }
}

function stripChrome(el: HTMLElement): void {
  el.classList.remove('bae_card_selected', 'bae_card_regroup', 'bae_loc_selected', 'bae_dragging');
  el.querySelectorAll('.bae_confirm_blurb, .bae_deck_overlay').forEach((node) => node.remove());
}

export function placeClone(
  source: HTMLElement,
  extraClass: string,
  root: HTMLElement,
): HTMLElement {
  const r = source.getBoundingClientRect();
  const layer = motionLayer(root);
  const loc = localRect(layer, r);
  const clone = source.cloneNode(true) as HTMLElement;
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

export function placeScientistClone(
  source: HTMLElement,
  extraClass: string,
  root: HTMLElement,
): HTMLElement {
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

export function placeCloneUnder(
  source: HTMLElement,
  extraClass: string,
  root: HTMLElement,
): HTMLElement {
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
export function flyClone(
  clone: HTMLElement,
  to: DOMRect,
  durationMs: number,
  root: HTMLElement,
  matchSize = false,
  destScale = 1,
  host?: HTMLElement | null,
): Promise<void> {
  if (host) adoptClone(clone, host);
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

export function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** FLIP remaining siblings after a layout mutation (display:none, etc.). */
export function flipElements(
  els: HTMLElement[],
  apply: () => void,
  durationMs: number,
): Promise<void> {
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
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return Promise.resolve();
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
export function startTrail(
  source: HTMLElement,
  dest: HTMLElement,
  durationMs: number,
  root: HTMLElement,
  extraClass = '',
): HTMLElement {
  return startTrailToRect(source, dest.getBoundingClientRect(), durationMs, root, extraClass);
}

/** Leave a faded scientist in place and loop an opaque copy toward the destination. */
export function startScientistTrail(
  source: HTMLElement,
  dest: HTMLElement,
  durationMs: number,
  root: HTMLElement,
): HTMLElement {
  return startScientistTrailToRect(source, dest.getBoundingClientRect(), durationMs, root);
}

export function startScientistTrailToRect(
  source: HTMLElement,
  to: DOMRect,
  durationMs: number,
  root: HTMLElement,
): HTMLElement {
  source.classList.add('bae_preview_fade_left');
  source.style.setProperty('--dur', `${Math.max(1, durationMs)}ms`);
  return startTrailToRect(source, to, durationMs, root, 'bae_sci_mover');
}

export function startTrailToRect(
  source: HTMLElement,
  to: DOMRect,
  durationMs: number,
  root: HTMLElement,
  extraClass = '',
): HTMLElement {
  const from = source.getBoundingClientRect();
  const layer = motionLayer(root);
  const loc = localRect(layer, from);
  const clone = source.cloneNode(true) as HTMLElement;
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
  return clone;
}

/** Static clone parked at a destination (card placement preview). */
export function placeCloneAt(
  source: HTMLElement,
  extraClass: string,
  root: HTMLElement,
  at: DOMRect,
): HTMLElement {
  const clone = placeClone(source, extraClass, root);
  const parked = localRect(containingBlock(clone, root), at);
  clone.style.left = `${parked.left}px`;
  clone.style.top = `${parked.top}px`;
  clone.style.width = `${parked.width}px`;
  clone.style.height = `${parked.height}px`;
  return clone;
}

/** Soft, slow discard preview: ghost only, real card stays put. */
export function startDiscardGhost(source: HTMLElement, root: HTMLElement, cardId?: number): HTMLElement {
  const clone = placeClone(source, 'bae_discard_ghost', root);
  clone.style.setProperty('--from-l', clone.style.left);
  clone.style.setProperty('--from-t', clone.style.top);
  clone.style.setProperty('--dur', '1.85s');
  clone.style.setProperty('--dx', '-10px');
  if (cardId != null) clone.dataset.previewCard = String(cardId);
  return clone;
}

/** One-shot slide-off used when a hand card is actually discarded. */
export function flyDiscardAway(
  source: HTMLElement,
  root: HTMLElement,
  durationMs: number,
): Promise<void> {
  const from = source.getBoundingClientRect();
  const clone = placeClone(source, 'bae_discard_resolve', root);
  clone.style.setProperty('--from-l', clone.style.left);
  clone.style.setProperty('--from-t', clone.style.top);
  clone.style.setProperty('--dur', `${Math.max(1, durationMs)}ms`);
  clone.style.setProperty('--dx', `${-Math.max(48, from.width * 0.4)}px`);
  source.style.visibility = 'hidden';
  return wait(durationMs).then(() => { clone.remove(); });
}

function freezeComputedMotion(el: HTMLElement, root: HTMLElement): void {
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

function freezeOpacityOnly(el: HTMLElement): void {
  const cs = getComputedStyle(el);
  el.classList.add('bae_preview_settling');
  el.style.animation = 'none';
  el.style.transition = 'none';
  el.style.opacity = cs.opacity;
  void el.offsetWidth;
}

/** Freeze looping previews at the current frame, then ease back toward rest. */
export function freezeAndFadePreviews(root: HTMLElement, durationMs = 320): void {
  if (!root) return;
  const fadeMs = Math.max(1, durationMs);
  root.querySelectorAll('.bae_trail_ghost, .bae_discard_ghost').forEach((node) => {
    const el = node as HTMLElement;
    freezeComputedMotion(el, root);
    el.style.transition = `opacity ${fadeMs}ms ease`;
    el.style.opacity = '0';
  });
  root.querySelectorAll('.bae_card_place_preview').forEach((node) => {
    const el = node as HTMLElement;
    freezeOpacityOnly(el);
    el.style.transition = `opacity ${fadeMs}ms ease`;
    el.style.opacity = '0';
  });
  root.querySelectorAll('.bae_preview_fade_left').forEach((node) => {
    const el = node as HTMLElement;
    freezeOpacityOnly(el);
    el.style.transition = `opacity ${fadeMs}ms ease`;
    el.style.opacity = '1';
    el.classList.remove('bae_preview_fade_left');
  });
}
