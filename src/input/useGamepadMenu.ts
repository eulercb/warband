/**
 * Warband — React hook that makes any menu screen controller-navigable.
 *
 * Point it at a container ref; it registers a gamepad nav handler (see
 * gamepadNav.ts) that moves DOM focus between the focusable controls inside the
 * container using 2-D geometry (so grids and rows both feel natural), activates
 * the focused control on confirm (A / ✕), and calls `onBack` on back (B / ◯).
 * Focus is mirrored with a `.wb-gp-focus` class for a clear, reliable ring even
 * when the browser wouldn't show `:focus-visible` for programmatic focus.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { pushNavHandler, type NavDir } from './gamepadNav';

const FOCUS_CLASS = 'wb-gp-focus';
const SELECTOR = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]';

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(SELECTOR)).filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      el.tabIndex !== -1 &&
      el.offsetParent !== null,
  );
}

function markFocus(el: HTMLElement, all: HTMLElement[]): void {
  for (const e of all) if (e !== el) e.classList.remove(FOCUS_CLASS);
  el.classList.add(FOCUS_CLASS);
  try {
    el.focus({ preventScroll: false });
  } catch {
    el.focus();
  }
}

function centerOf(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export interface GamepadMenuOpts {
  /** Called on the back button (B / ◯). */
  onBack?: () => void;
  /** Whether the hook is active (e.g. only when an overlay is open). Default true. */
  enabled?: boolean;
  /**
   * Temporarily swallow input while staying on the nav stack. Use this (not
   * `enabled: false`) for transient states like a pending key/pad rebind: the
   * handler must remain topmost so the capture press is consumed here and never
   * leaks down to the screen beneath this overlay.
   */
  suspended?: boolean;
}

export function useGamepadMenu(
  containerRef: RefObject<HTMLElement | null>,
  opts: GamepadMenuOpts = {},
): void {
  const { onBack, enabled = true, suspended = false } = opts;
  // Read `suspended` through a ref so toggling it doesn't unsubscribe/resubscribe
  // the handler (which would pop it off the stack and expose the parent screen).
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    // NB: focus is NOT seeded on mount — the highlight ring only appears once the
    // player actually drives the menu with a controller, so mouse/keyboard users
    // never see it. The first nav/confirm press selects the first control.

    const navigate = (dir: NavDir): void => {
      if (suspendedRef.current) return; // swallow while a rebind capture is pending
      const els = focusables(container);
      if (els.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const current = active && container.contains(active) ? active : null;
      if (!current) {
        markFocus(els[0], els);
        return;
      }
      const c = centerOf(current);
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const el of els) {
        if (el === current) continue;
        const p = centerOf(el);
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const inDir =
          dir === 'left' ? dx < -4 : dir === 'right' ? dx > 4 : dir === 'up' ? dy < -4 : dy > 4;
        if (!inDir) continue;
        const horiz = dir === 'left' || dir === 'right';
        const primary = horiz ? Math.abs(dx) : Math.abs(dy);
        const secondary = horiz ? Math.abs(dy) : Math.abs(dx);
        const score = primary + secondary * 2.5;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      if (best) {
        markFocus(best, els);
      } else {
        // No target in that direction — wrap through index order.
        const idx = els.indexOf(current);
        const fwd = dir === 'down' || dir === 'right';
        const next = els[(idx + (fwd ? 1 : -1) + els.length) % els.length];
        markFocus(next, els);
      }
    };

    const confirm = (): void => {
      if (suspendedRef.current) return; // swallow while a rebind capture is pending
      const active = document.activeElement as HTMLElement | null;
      if (active && container.contains(active)) active.click();
      else {
        const els = focusables(container);
        if (els.length > 0) els[0].click();
      }
    };

    const unsub = pushNavHandler({
      onNav: navigate,
      onConfirm: confirm,
      onBack: () => {
        if (suspendedRef.current) return; // swallow while a rebind capture is pending
        onBack?.();
      },
    });
    return () => {
      unsub();
      for (const el of focusables(container)) el.classList.remove(FOCUS_CLASS);
    };
    // Re-bind when the container or enabled flag changes.
  }, [containerRef, enabled, onBack]);
}
