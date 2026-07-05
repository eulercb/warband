/**
 * Warband — gamepad menu navigation poller.
 *
 * Menus are plain DOM, so a controller needs to drive focus + activation the way
 * a keyboard's Tab/Enter would. This module polls the standard-mapping gamepad
 * for directional intent (left stick or d-pad), a confirm button (A / ✕) and a
 * back button (B / ◯), and dispatches to the TOP handler on a stack — so a
 * stacked overlay (Controls over the pause menu) gets the input, not the screen
 * beneath it. Screens subscribe via `useGamepadMenu`.
 */
export type NavDir = 'up' | 'down' | 'left' | 'right';

export interface NavHandler {
  onNav: (dir: NavDir) => void;
  onConfirm: () => void;
  onBack: () => void;
}

const AXIS_THRESHOLD = 0.55;
const REPEAT_INITIAL_MS = 380;
const REPEAT_MS = 150;
/** Standard-mapping indices for confirm (A/✕) and back (B/◯). */
const BTN_CONFIRM = 0;
const BTN_BACK = 1;
const DPAD = { up: 12, down: 13, left: 14, right: 15 } as const;

const stack: NavHandler[] = [];
let rafId = 0;
let running = false;

// Edge/repeat state, ORed across all connected pads.
const dirHeldSince: Record<NavDir, number> = { up: 0, down: 0, left: 0, right: 0 };
const dirNextFire: Record<NavDir, number> = { up: 0, down: 0, left: 0, right: 0 };
let confirmPrev = false;
let backPrev = false;

function pads(): (Gamepad | null)[] {
  try {
    const nav = navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] };
    return nav.getGamepads?.() ?? [];
  } catch {
    return [];
  }
}

function anyPressed(index: number): boolean {
  for (const p of pads()) {
    if (p && p.connected && p.buttons[index]?.pressed) return true;
  }
  return false;
}

/** True if any pad expresses `dir` via d-pad button or the left stick. */
function dirActive(dir: NavDir): boolean {
  if (anyPressed(DPAD[dir])) return true;
  for (const p of pads()) {
    if (!p || !p.connected) continue;
    const ax = p.axes[0] ?? 0;
    const ay = p.axes[1] ?? 0;
    if (dir === 'left' && ax < -AXIS_THRESHOLD) return true;
    if (dir === 'right' && ax > AXIS_THRESHOLD) return true;
    if (dir === 'up' && ay < -AXIS_THRESHOLD) return true;
    if (dir === 'down' && ay > AXIS_THRESHOLD) return true;
  }
  return false;
}

function nowMs(): number {
  return performance.now();
}

function poll(): void {
  rafId = requestAnimationFrame(poll);
  const top = stack[stack.length - 1];
  const t = nowMs();

  // Directional with initial-delay + repeat.
  (['up', 'down', 'left', 'right'] as NavDir[]).forEach((dir) => {
    if (dirActive(dir)) {
      if (dirHeldSince[dir] === 0) {
        dirHeldSince[dir] = t;
        dirNextFire[dir] = t + REPEAT_INITIAL_MS;
        top?.onNav(dir);
      } else if (t >= dirNextFire[dir]) {
        dirNextFire[dir] = t + REPEAT_MS;
        top?.onNav(dir);
      }
    } else {
      dirHeldSince[dir] = 0;
    }
  });

  // Confirm / back are single-edge.
  const confirm = anyPressed(BTN_CONFIRM);
  if (confirm && !confirmPrev) top?.onConfirm();
  confirmPrev = confirm;

  const back = anyPressed(BTN_BACK);
  if (back && !backPrev) top?.onBack();
  backPrev = back;
}

function start(): void {
  if (running) return;
  running = true;
  // Reset edge state so a button held during a screen transition isn't re-fired.
  confirmPrev = anyPressed(BTN_CONFIRM);
  backPrev = anyPressed(BTN_BACK);
  rafId = requestAnimationFrame(poll);
}

function stop(): void {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

/** Push a handler as the active (topmost) menu; returns an unsubscribe fn. */
export function pushNavHandler(h: NavHandler): () => void {
  stack.push(h);
  start();
  return () => {
    const i = stack.lastIndexOf(h);
    if (i >= 0) stack.splice(i, 1);
    if (stack.length === 0) stop();
  };
}
