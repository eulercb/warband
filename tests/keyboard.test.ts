// @vitest-environment jsdom
/**
 * Tests for input/keyboard.ts — the KeyboardMouse state tracker.
 *
 * jsdom gives us real `window`/element event targets. The module listens for
 * keydown/keyup/mouseup on `window` and mousemove/mousedown/contextmenu on the
 * target element, reading `KeyboardEvent.code` (physical key) against the live
 * bindings from input/bindings.ts. jsdom's `getBoundingClientRect()` returns all
 * zeros, so `mouseScreen` ends up equal to the event's clientX/clientY.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KeyboardMouse } from '../src/input/keyboard';
import { useBindings } from '../src/input/bindings';
import type { Vec2 } from '../src/engine/core/types';

const ORIGIN: Vec2 = { x: 0, y: 0 };

let target: HTMLCanvasElement;
let kb: KeyboardMouse;

/** Dispatch a key event on `window` (where keyboard.ts listens) and return it. */
function key(type: 'keydown' | 'keyup', code: string, cancelable = true): KeyboardEvent {
  const e = new KeyboardEvent(type, { code, cancelable });
  window.dispatchEvent(e);
  return e;
}

/** Move the mouse over the target element (mousemove is bound to the target). */
function mouseMove(clientX: number, clientY: number): void {
  target.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY }));
}

/** Press a mouse button on the target; returns the event so callers can inspect it. */
function mouseDown(button = 0): MouseEvent {
  const e = new MouseEvent('mousedown', { button, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

/** Release a mouse button on `window` (mouseup is bound there, not the target). */
function mouseUp(button = 0): void {
  window.dispatchEvent(new MouseEvent('mouseup', { button }));
}

beforeEach(() => {
  // Deterministic default bindings regardless of any persisted state.
  useBindings.getState().reset();
  target = document.createElement('canvas');
  document.body.appendChild(target);
  kb = new KeyboardMouse(target);
});

afterEach(() => {
  kb.dispose();
  target.remove();
});

describe('KeyboardMouse: construction', () => {
  it('starts with a zeroed mouse position, no activity, and a neutral sample', () => {
    expect(kb.mouseScreen).toEqual({ x: 0, y: 0 });
    expect(kb.lastActivityMs).toBe(0);

    const s = kb.sample(ORIGIN);
    expect(s.move).toEqual({ x: 0, y: 0 });
    expect(s.buttons).toEqual({
      basic: false,
      a1: false,
      a2: false,
      a3: false,
      revive: false,
      sub1: false,
      sub2: false,
      swap: false,
      item: false,
    });
    // With cursor on the player (dist 0) aim defaults to the initial "up".
    expect(s.aim.x).toBeCloseTo(0);
    expect(s.aim.y).toBeCloseTo(-1);
  });
});

describe('KeyboardMouse: movement keys -> move vector', () => {
  it('maps each cardinal key to the correct axis (screen-space: up = -y)', () => {
    key('keydown', 'KeyW');
    expect(kb.sample(ORIGIN).move).toEqual({ x: 0, y: -1 });
    key('keyup', 'KeyW');

    key('keydown', 'KeyS');
    expect(kb.sample(ORIGIN).move).toEqual({ x: 0, y: 1 });
    key('keyup', 'KeyS');

    key('keydown', 'KeyA');
    expect(kb.sample(ORIGIN).move).toEqual({ x: -1, y: 0 });
    key('keyup', 'KeyA');

    key('keydown', 'KeyD');
    expect(kb.sample(ORIGIN).move).toEqual({ x: 1, y: 0 });
  });

  it('honours the alternate arrow-key bindings', () => {
    key('keydown', 'ArrowLeft');
    expect(kb.sample(ORIGIN).move.x).toBeCloseTo(-1);
    key('keyup', 'ArrowLeft');

    key('keydown', 'ArrowUp');
    expect(kb.sample(ORIGIN).move.y).toBeCloseTo(-1);
  });

  it('clamps diagonal movement magnitude to 1', () => {
    key('keydown', 'KeyW'); // up
    key('keydown', 'KeyD'); // right
    const move = kb.sample(ORIGIN).move;
    expect(move.x).toBeCloseTo(Math.SQRT1_2); // 0.7071…
    expect(move.y).toBeCloseTo(-Math.SQRT1_2);
    expect(Math.hypot(move.x, move.y)).toBeCloseTo(1);
  });

  it('cancels opposing keys to a zero axis', () => {
    key('keydown', 'KeyA'); // left  -> -1
    key('keydown', 'KeyD'); // right -> +1
    const move = kb.sample(ORIGIN).move;
    expect(move.x).toBeCloseTo(0);
    expect(move.y).toBeCloseTo(0);
  });

  it('keyup clears only the released key', () => {
    key('keydown', 'KeyW');
    key('keydown', 'KeyD');
    key('keyup', 'KeyW');
    const move = kb.sample(ORIGIN).move;
    expect(move.x).toBeCloseTo(1); // D still held
    expect(move.y).toBeCloseTo(0); // W released
  });
});

describe('KeyboardMouse: ability keys -> button flags', () => {
  it('maps bound ability keys to their button flags', () => {
    key('keydown', 'Space'); // basic
    key('keydown', 'KeyQ'); // a1
    key('keydown', 'KeyE'); // a2
    key('keydown', 'KeyR'); // a3
    key('keydown', 'KeyF'); // revive
    expect(kb.sample(ORIGIN).buttons).toEqual({
      basic: true,
      a1: true,
      a2: true,
      a3: true,
      revive: true,
      sub1: false,
      sub2: false,
      swap: false,
      item: false,
    });
  });

  it('honours the alternate digit binding for abilities', () => {
    key('keydown', 'Digit1'); // a1 alternate
    key('keydown', 'Digit2'); // a2 alternate
    const b = kb.sample(ORIGIN).buttons;
    expect(b.a1).toBe(true);
    expect(b.a2).toBe(true);
    expect(b.basic).toBe(false);
  });

  it('releasing an ability key clears its flag', () => {
    key('keydown', 'KeyQ');
    expect(kb.sample(ORIGIN).buttons.a1).toBe(true);
    key('keyup', 'KeyQ');
    expect(kb.sample(ORIGIN).buttons.a1).toBe(false);
  });
});

describe('KeyboardMouse: code vs key handling & edge cases', () => {
  it('reads event.code (physical key), not event.key', () => {
    // key='w' but code missing -> code '' is unbound -> ignored.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(kb.sample(ORIGIN).move).toEqual({ x: 0, y: 0 });

    // Same logical intent expressed via code -> recognised.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(kb.sample(ORIGIN).move.y).toBeCloseTo(-1);
  });

  it('ignores unbound keys and does not register activity for them', () => {
    key('keydown', 'KeyM'); // not bound by default
    expect(kb.sample(ORIGIN).move).toEqual({ x: 0, y: 0 });
    expect(kb.sample(ORIGIN).buttons.basic).toBe(false);
    expect(kb.lastActivityMs).toBe(0); // handler returned early, no activity
  });

  it('treats repeated keydown as idempotent (Set semantics)', () => {
    key('keydown', 'KeyW');
    key('keydown', 'KeyW');
    key('keydown', 'KeyW');
    expect(kb.sample(ORIGIN).move.y).toBeCloseTo(-1);
    // A single keyup fully clears it despite the repeats.
    key('keyup', 'KeyW');
    expect(kb.sample(ORIGIN).move.y).toBeCloseTo(0);
  });

  it('records activity timestamps for bound keydown and for clearing keyup', () => {
    expect(kb.lastActivityMs).toBe(0);
    key('keydown', 'KeyW');
    const afterDown = kb.lastActivityMs;
    expect(afterDown).toBeGreaterThan(0);
    key('keyup', 'KeyW');
    expect(kb.lastActivityMs).toBeGreaterThanOrEqual(afterDown);
  });

  it('does not bump activity for a keyup of a key that was never held', () => {
    key('keyup', 'KeyW'); // delete() returns false -> no activity update
    expect(kb.lastActivityMs).toBe(0);
  });

  it('calls preventDefault for bound keys but not for unbound keys', () => {
    const bound = key('keydown', 'Space');
    expect(bound.defaultPrevented).toBe(true);
    const unbound = key('keydown', 'KeyM');
    expect(unbound.defaultPrevented).toBe(false);
  });
});

describe('KeyboardMouse: aim from mouse position', () => {
  it('produces a unit vector from the local player to the cursor', () => {
    mouseMove(100, 0); // cursor to the right of the player at origin
    let aim = kb.sample(ORIGIN).aim;
    expect(aim.x).toBeCloseTo(1);
    expect(aim.y).toBeCloseTo(0);

    mouseMove(0, 100); // straight below
    aim = kb.sample(ORIGIN).aim;
    expect(aim.x).toBeCloseTo(0);
    expect(aim.y).toBeCloseTo(1);

    mouseMove(30, 40); // 3-4-5 triangle -> (0.6, 0.8)
    aim = kb.sample(ORIGIN).aim;
    expect(aim.x).toBeCloseTo(0.6);
    expect(aim.y).toBeCloseTo(0.8);
  });

  it('updates mouseScreen relative to the target rect (zeros in jsdom)', () => {
    mouseMove(55, 66);
    expect(kb.mouseScreen).toEqual({ x: 55, y: 66 });
    expect(kb.lastActivityMs).toBeGreaterThan(0);
  });

  it('keeps the previous aim when the cursor sits exactly on the player', () => {
    mouseMove(10, 0);
    expect(kb.sample(ORIGIN).aim.x).toBeCloseTo(1); // aim right, remembered
    // localScreenPos coincides with the cursor -> dist 0 -> reuse last aim.
    const aim = kb.sample({ x: 10, y: 0 }).aim;
    expect(aim.x).toBeCloseTo(1);
    expect(aim.y).toBeCloseTo(0);
  });
});

describe('KeyboardMouse: mouse buttons', () => {
  it('treats left mouse as the basic attack, cleared on release', () => {
    mouseDown(0);
    expect(kb.sample(ORIGIN).buttons.basic).toBe(true);
    mouseUp(0);
    expect(kb.sample(ORIGIN).buttons.basic).toBe(false);
  });

  it('ignores non-left mouse buttons for basic', () => {
    mouseDown(2); // right button
    expect(kb.sample(ORIGIN).buttons.basic).toBe(false);
  });

  it('a non-left mouse release does not clear a left-held basic', () => {
    mouseDown(0);
    expect(kb.sample(ORIGIN).buttons.basic).toBe(true);
    mouseUp(2); // right-button release must not release the left-held basic
    expect(kb.sample(ORIGIN).buttons.basic).toBe(true);
  });

  it('reports basic when either left mouse OR the bound basic key is down', () => {
    key('keydown', 'Space');
    mouseDown(0);
    expect(kb.sample(ORIGIN).buttons.basic).toBe(true);
    // Releasing the mouse still leaves the key holding basic.
    mouseUp(0);
    expect(kb.sample(ORIGIN).buttons.basic).toBe(true);
    key('keyup', 'Space');
    expect(kb.sample(ORIGIN).buttons.basic).toBe(false);
  });

  it('preventDefault on mousedown and contextmenu', () => {
    const md = mouseDown(0);
    expect(md.defaultPrevented).toBe(true);
    const cm = new MouseEvent('contextmenu', { cancelable: true });
    target.dispatchEvent(cm);
    expect(cm.defaultPrevented).toBe(true);
  });
});

describe('KeyboardMouse: dispose / teardown', () => {
  it('clears held state and mouse button on dispose', () => {
    key('keydown', 'KeyW');
    mouseDown(0);
    expect(kb.sample(ORIGIN).move.y).toBeCloseTo(-1);
    expect(kb.sample(ORIGIN).buttons.basic).toBe(true);

    kb.dispose();

    const s = kb.sample(ORIGIN);
    expect(s.move).toEqual({ x: 0, y: 0 });
    expect(s.buttons.basic).toBe(false);
  });

  it('removes listeners so later events no longer change state', () => {
    kb.dispose();
    key('keydown', 'KeyD'); // window listener gone -> ignored
    mouseMove(200, 200); // target listener gone -> mouseScreen frozen
    const s = kb.sample(ORIGIN);
    expect(s.move).toEqual({ x: 0, y: 0 });
    expect(kb.mouseScreen).toEqual({ x: 0, y: 0 });
  });

  it('is safe to dispose more than once', () => {
    expect(() => {
      kb.dispose();
      kb.dispose();
    }).not.toThrow();
  });
});
