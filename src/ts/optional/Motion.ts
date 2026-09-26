/** OPTIONAL: lightweight FLIP-style clones for previews and resolutions. */

export function animMs(speed: number): number {
  if (speed === 0) return 0;
  if (speed === 1) return 720;
  if (speed === 3) return 360;
  return 560;
}

/**
 * Viewport box for cloning. Centering transforms (meeples/flags) can report the
 * untransformed layout box once a parent starts scrolling at high zoom; rebuild
 * the visual box from offsetParent + the computed translate when that happens.
 */
export function visualRect(el: Element): DOMRect {
  const reported = el.getBoundingClientRect();
  if (!(el instanceof HTMLElement)) return reported;
  const css = getComputedStyle(el);
  if (!css.transform || css.transform === 'none') return reported;
  const parent = el.offsetParent;
  if (!(parent instanceof HTMLElement)) return reported;
  let matrix: DOMMatrixReadOnly;
  try {
    matrix = new DOMMatrixReadOnly(css.transform);
  } catch {
    return reported;
  }
  if (Math.abs(matrix.e) < 0.5 && Math.abs(matrix.f) < 0.5) return reported;
  const parentBox = parent.getBoundingClientRect();
  const parentCss = getComputedStyle(parent);
  const scaleX = parent.offsetWidth > 0 ? parentBox.width / parent.offsetWidth : 1;
  const scaleY = parent.offsetHeight > 0 ? parentBox.height / parent.offsetHeight : 1;
  const layoutLeft = parentBox.left
    + (parseFloat(parentCss.borderLeftWidth) || 0)
    + (el.offsetLeft - parent.scrollLeft) * scaleX;
  const layoutTop = parentBox.top
    + (parseFloat(parentCss.borderTopWidth) || 0)
    + (el.offsetTop - parent.scrollTop) * scaleY;
  const visualLeft = layoutLeft + matrix.e * scaleX;
  const visualTop = layoutTop + matrix.f * scaleY;
  const distLayout = Math.abs(reported.left - layoutLeft) + Math.abs(reported.top - layoutTop);
  const distVisual = Math.abs(reported.left - visualLeft) + Math.abs(reported.top - visualTop);
  if (distLayout + 1 < distVisual) {
    return new DOMRect(visualLeft, visualTop, reported.width, reported.height);
  }
  return reported;
}

export function rectOf(el: Element | null): DOMRect | null {
  if (!el) return null;
  const r = visualRect(el);
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

/** Above cards/board (and the regular motion layer) for scoring popups and in-flight VP. */
export function scoringLayer(root: HTMLElement): HTMLElement {
  let layer = root.querySelector('.bae_scoring_layer') as HTMLElement | null;
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'bae_scoring_layer';
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

export function coordsInParent(parent: HTMLElement, r: DOMRect): { left: number; top: number; width: number; height: number } {
  return localRect(parent, r);
}

export function offsetRect(r: DOMRect, dx: number, dy: number): DOMRect {
  return new DOMRect(r.left + dx, r.top + dy, r.width, r.height);
}

function containingBlock(clone: HTMLElement, fallback: HTMLElement): HTMLElement {
  const parent = clone.offsetParent;
  return parent instanceof HTMLElement ? parent : fallback;
}

type PreviewDestFn = () => DOMRect | null;

type PreviewAnchor = {
  source: HTMLElement;
  dest?: PreviewDestFn;
  follow?: HTMLElement;
};

const previewAnchors = new WeakMap<HTMLElement, PreviewAnchor>();

function baeScale(root: HTMLElement): number {
  const n = Number.parseFloat(getComputedStyle(root).getPropertyValue('--bae-scale'));
  return Number.isFinite(n) && n > 0 ? n : 0.12;
}

/** Pixel travel authored at --bae-scale 0.12, expressed as a scaled CSS length. */
function animDx(pxAt012: number): string {
  return `calc(${(pxAt012 / 0.12).toFixed(4)}px * var(--bae-scale, 0.12))`;
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
  const r = visualRect(source);
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

/** Fly a clone that fades in as it leaves the source. */
export function flyCloneFadingIn(
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
export function flyCloneFading(
  clone: HTMLElement,
  to: DOMRect,
  durationMs: number,
  root: HTMLElement,
  matchSize = false,
): Promise<void> {
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
export function flyCloneToLocal(
  clone: HTMLElement,
  dest: { left: number; top: number; width: number; height: number },
  durationMs: number,
  host: HTMLElement,
  matchSize = false,
): Promise<void> {
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
  return startTrailToRect(
    source,
    visualRect(dest),
    durationMs,
    root,
    extraClass,
    () => dest.isConnected ? visualRect(dest) : null,
  );
}

/** Leave a faded scientist in place and loop an opaque copy toward the destination. */
export function startScientistTrail(
  source: HTMLElement,
  dest: HTMLElement,
  durationMs: number,
  root: HTMLElement,
): HTMLElement {
  source.classList.add('bae_preview_fade_left');
  source.style.setProperty('--dur', `${Math.max(1, durationMs)}ms`);
  return startTrailToRect(
    source,
    visualRect(dest),
    durationMs,
    root,
    'bae_sci_mover',
    () => dest.isConnected ? visualRect(dest) : null,
  );
}

export function startScientistTrailToRect(
  source: HTMLElement,
  to: DOMRect,
  durationMs: number,
  root: HTMLElement,
  destFn?: PreviewDestFn,
): HTMLElement {
  source.classList.add('bae_preview_fade_left');
  source.style.setProperty('--dur', `${Math.max(1, durationMs)}ms`);
  return startTrailToRect(source, to, durationMs, root, 'bae_sci_mover', destFn);
}

export function startTrailToRect(
  source: HTMLElement,
  to: DOMRect,
  durationMs: number,
  root: HTMLElement,
  extraClass = '',
  destFn?: PreviewDestFn,
): HTMLElement {
  const from = visualRect(source);
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
  previewAnchors.set(clone, {
    source,
    dest: destFn ?? (() => to),
  });
  return clone;
}

export function bindPreviewFollow(clone: HTMLElement, follow: HTMLElement): void {
  const anchor = previewAnchors.get(clone);
  if (anchor) anchor.follow = follow;
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
export function startDiscardGhost(
  source: HTMLElement,
  root: HTMLElement,
  cardId?: number,
  delayMs = 0,
): HTMLElement {
  const clone = placeClone(source, 'bae_discard_ghost', root);
  clone.style.setProperty('--from-l', clone.style.left);
  clone.style.setProperty('--from-t', clone.style.top);
  clone.style.setProperty('--dur', '1.85s');
  clone.style.setProperty('--dx', animDx(-60));
  if (delayMs > 0) clone.style.animationDelay = `-${Math.round(delayMs)}ms`;
  if (cardId != null) clone.dataset.previewCard = String(cardId);
  previewAnchors.set(clone, { source });
  return clone;
}

/** Recompute looping preview coords after layout/scale changes without restarting the loop. */
export function retargetPreviewClones(root: HTMLElement): void {
  if (!root) return;
  root.querySelectorAll('.bae_discard_ghost, .bae_trail_ghost').forEach((node) => {
    const clone = node as HTMLElement;
    const anchor = previewAnchors.get(clone);
    if (!anchor) return;
    const fromEl = (anchor.follow?.isConnected ? anchor.follow : anchor.source);
    if (!fromEl?.isConnected) return;
    copySpriteVars(root, clone);
    const fromBox = visualRect(fromEl);
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
    if (!to) return;
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    clone.style.setProperty('--to-l', `${loc.left + dx}px`);
    clone.style.setProperty('--to-t', `${loc.top + dy}px`);
  });
}

/** One-shot slide-off used when a hand card is actually discarded. */
export function flyDiscardAway(
  source: HTMLElement,
  root: HTMLElement,
  durationMs: number,
): Promise<void> {
  const from = visualRect(source);
  const clone = placeClone(source, 'bae_discard_resolve', root);
  clone.style.setProperty('--from-l', clone.style.left);
  clone.style.setProperty('--from-t', clone.style.top);
  clone.style.setProperty('--dur', `${Math.max(1, durationMs)}ms`);
  const minDx = (48 / 0.12) * baeScale(root);
  clone.style.setProperty('--dx', `${-Math.max(minDx, from.width * 0.4)}px`);
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
