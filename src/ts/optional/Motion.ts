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

export function motionLayer(root: HTMLElement): HTMLElement {
  let layer = root.querySelector('.bae_motion_layer') as HTMLElement | null;
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'bae_motion_layer';
    root.appendChild(layer);
  }
  return layer;
}

export function clearMotionLayer(root: HTMLElement): void {
  root.querySelectorAll('.bae_motion_clone, .bae_invalid_bubble').forEach((el) => el.remove());
  document.querySelectorAll('body > .bae_motion_clone, body > .bae_invalid_bubble').forEach((el) => el.remove());
}

function localOffset(root: HTMLElement, r: DOMRect): { left: number; top: number } {
  const origin = root.getBoundingClientRect();
  return { left: r.left - origin.left, top: r.top - origin.top };
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
  const { left, top } = localOffset(root, r);
  const clone = source.cloneNode(true) as HTMLElement;
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
  clone.style.transform = 'none';
  clone.style.transformOrigin = 'center center';
  motionLayer(root).appendChild(clone);
  return clone;
}

/** Fly a clone and leave it parked at the destination until the board re-renders. */
export function flyClone(
  clone: HTMLElement,
  to: DOMRect,
  durationMs: number,
  root: HTMLElement,
  matchSize = false,
): Promise<void> {
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
    clone.style.transform = 'none';
    clone.style.left = `${parked.left}px`;
    clone.style.top = `${parked.top}px`;
    if (matchSize) {
      clone.style.width = `${to.width}px`;
      clone.style.height = `${to.height}px`;
    }
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
  const { left, top } = localOffset(root, from);
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
  clone.style.left = `${left}px`;
  clone.style.top = `${top}px`;
  clone.style.width = `${from.width}px`;
  clone.style.height = `${from.height}px`;
  clone.style.margin = '0';
  clone.style.pointerEvents = 'none';
  clone.style.zIndex = '70';
  clone.style.transform = 'none';
  clone.style.setProperty('--dx', `${dx}px`);
  clone.style.setProperty('--dy', `${dy}px`);
  clone.style.setProperty('--dur', `${Math.max(1, durationMs)}ms`);
  motionLayer(root).appendChild(clone);
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
  const parked = localOffset(root, at);
  clone.style.left = `${parked.left}px`;
  clone.style.top = `${parked.top}px`;
  clone.style.width = `${at.width}px`;
  clone.style.height = `${at.height}px`;
  return clone;
}

/** Soft, slow discard preview: ghost only, real card stays put. */
export function startDiscardGhost(source: HTMLElement, root: HTMLElement, cardId?: number): HTMLElement {
  const clone = placeClone(source, 'bae_discard_ghost', root);
  clone.style.setProperty('--dur', '1.85s');
  clone.style.setProperty('--dx', '-10px');
  if (cardId != null) clone.dataset.previewCard = String(cardId);
  return clone;
}
