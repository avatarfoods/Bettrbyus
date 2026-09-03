/**
 * Drag with a finger or a mouse, without a library.
 *
 * Call it from a pointerdown. With a mouse the drag starts as soon as the
 * pointer moves a few pixels. With a finger it starts after a short hold, so
 * a swipe still scrolls the grid - the hold is what separates "move this"
 * from "scroll". While dragging, a copy of the thing follows the pointer, the
 * page will not scroll or select text, and whatever is under the pointer that
 * matches `hit` is reported so the caller can light it up. Letting go drops
 * on the last thing reported, or nowhere. Escape cancels.
 *
 * The click that browsers fire after a drag is swallowed, so a dropped tile
 * does not also open its card.
 */
export function beginDrag(
  event: React.PointerEvent<HTMLElement>,
  options: {
    /** Selector for what can be dropped on. */
    hit: string;
    /** What to picture under the pointer. Defaults to the element pressed. */
    ghost?: HTMLElement | null;
    onStart?: () => void;
    onMove?: (target: HTMLElement | null) => void;
    onDrop: (target: HTMLElement | null) => void;
    /** Runs after a drop or a cancel, and also when the press never became a drag. */
    onEnd?: () => void;
  }
): void {
  if (event.button !== 0 || !event.isPrimary) return;
  const source = event.currentTarget;
  const touch = event.pointerType !== "mouse";
  const startX = event.clientX;
  const startY = event.clientY;
  const rect = (options.ghost ?? source).getBoundingClientRect();
  const offsetX = startX - rect.left;
  const offsetY = startY - rect.top;

  let active = false;
  let done = false;
  let target: HTMLElement | null = null;
  let ghost: HTMLElement | null = null;
  let hold: ReturnType<typeof setTimeout> | null = null;

  const stopTouchScroll = (e: TouchEvent) => e.preventDefault();
  const stopMenu = (e: Event) => e.preventDefault();

  function activate(x: number, y: number) {
    if (active || done) return;
    active = true;
    const original = options.ghost ?? source;
    ghost = original.cloneNode(true) as HTMLElement;
    ghost.style.position = "fixed";
    ghost.style.left = `${x - offsetX}px`;
    ghost.style.top = `${y - offsetY}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.margin = "0";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "1000";
    ghost.style.opacity = "0.92";
    ghost.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";
    ghost.style.transform = "rotate(1.5deg) scale(1.02)";
    ghost.style.borderRadius = "2px";
    ghost.setAttribute("aria-hidden", "true");
    document.body.appendChild(ghost);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    document.addEventListener("touchmove", stopTouchScroll, { passive: false });
    document.addEventListener("contextmenu", stopMenu);
    if (touch && "vibrate" in navigator) {
      try {
        navigator.vibrate(8);
      } catch {
        // Not every device hums.
      }
    }
    options.onStart?.();
    hover(x, y);
  }

  function hover(x: number, y: number) {
    const under = document.elementFromPoint(x, y);
    const next = (under?.closest(options.hit) as HTMLElement | null) ?? null;
    if (next !== target) {
      target = next;
      options.onMove?.(target);
    }
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== event.pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!active) {
      const moved = Math.hypot(dx, dy);
      if (touch) {
        // A finger that travels before the hold is a scroll, not a drag.
        if (moved > 10) cleanup();
      } else if (moved > 4) {
        activate(e.clientX, e.clientY);
      }
      return;
    }
    if (ghost) {
      ghost.style.left = `${e.clientX - offsetX}px`;
      ghost.style.top = `${e.clientY - offsetY}px`;
    }
    hover(e.clientX, e.clientY);
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== event.pointerId) return;
    if (active) {
      swallowNextClick();
      const dropOn = target;
      cleanup();
      options.onDrop(dropOn);
      return;
    }
    cleanup();
  }

  function onCancel(e: PointerEvent) {
    if (e.pointerId !== event.pointerId) return;
    cleanup();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (active) swallowNextClick();
      cleanup();
    }
  }

  function cleanup() {
    if (done) return;
    done = true;
    if (hold) clearTimeout(hold);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onCancel);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("touchmove", stopTouchScroll);
    document.removeEventListener("contextmenu", stopMenu);
    ghost?.remove();
    ghost = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    if (active && target) options.onMove?.(null);
    active = false;
    options.onEnd?.();
  }

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onCancel);
  document.addEventListener("keydown", onKey);

  if (touch) {
    hold = setTimeout(() => activate(startX, startY), 260);
  }
}

/** The click a browser fires after pointerup must not open anything. */
function swallowNextClick() {
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  document.addEventListener("click", swallow, { capture: true, once: true });
  window.setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 400);
}

/** Reads a data attribute off a drop target, or null when there is none. */
export function dataOf(target: HTMLElement | null, name: string): string | null {
  return target?.dataset[name] ?? null;
}

/** Moves the item at `from` to sit where `to` is. Everything else keeps its order. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
