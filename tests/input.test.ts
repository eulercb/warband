// @vitest-environment jsdom
/**
 * Tests for input/input.ts — the InputManager that merges gamepad and
 * keyboard/mouse into a single sanitized InputState with "last-used device
 * wins" arbitration.
 *
 * NOTE ON THE PUBLIC API: InputManager exposes `sample(localScreenPos)` which
 * returns an `InputState` ({ move, aim, buttons }). It does NOT emit an
 * `InputCommand` and does NOT track a `seq` — the caller (see ui/GameView.tsx)
 * increments `seq` and wraps the sampled state into an InputCommand. These tests
 * therefore assert the real `sample()` output, not a seq counter.
 *
 * Gamepad input is driven by stubbing `navigator.getGamepads` (absent in jsdom)
 * with typed fakes. `performance.now` is spied in the timing tests so the
 * sticky-window / "fresher device" arbitration is deterministic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputManager } from '../src/input/input';
import { KeyboardMouse } from '../src/input/keyboard';
import { useBindings } from '../src/input/bindings';
import { setTouchMove, resetTouch } from '../src/input/touch';
import { DEAD_ZONE } from '../src/engine/core/constants';
import type { InputState, Vec2 } from '../src/engine/core/types';

const ORIGIN: Vec2 = { x: 0, y: 0 };

let target: HTMLCanvasElement;
let manager: InputManager;

/** Build a typed fake Gamepad (standard mapping) for navigator.getGamepads. */
function makeGamepad(
  opts: { axes?: number[]; pressed?: number[]; connected?: boolean } = {},
): Gamepad {
  const axes = opts.axes ?? [0, 0, 0, 0];
  const pressed = new Set(opts.pressed ?? []);
  const buttons = Array.from({ length: 16 }, (_, i) => ({
    pressed: pressed.has(i),
    touched: pressed.has(i),
    value: pressed.has(i) ? 1 : 0,
  }));
  return {
    id: 'Fake Standard Controller (STANDARD GAMEPAD)',
    index: 0,
    connected: opts.connected ?? true,
    mapping: 'standard',
    timestamp: 0,
    axes,
    buttons,
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

/** Point navigator.getGamepads at a fixed list of pads for the next sample. */
function setGamepads(pads: (Gamepad | null)[]): void {
  navigator.getGamepads = () => pads;
}

function keyDown(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
}

function mouseMove(clientX: number, clientY: number): void {
  target.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY }));
}

beforeEach(() => {
  useBindings.getState().reset();
  setGamepads([]); // default: no pad connected -> keyboard path
  target = document.createElement('canvas');
  document.body.appendChild(target);
  manager = new InputManager(target);
});

afterEach(() => {
  manager.dispose();
  target.remove();
  resetTouch();
  vi.restoreAllMocks();
});

describe('InputManager: construction & defaults', () => {
  it('constructs against an element and defaults to the keyboard source', () => {
    expect(manager.activeSource).toBe('keyboard');
  });

  it('exposes the keyboard mouse position via mouseScreen', () => {
    mouseMove(55, 66);
    expect(manager.mouseScreen).toEqual({ x: 55, y: 66 });
  });
});

describe('InputManager: keyboard path', () => {
  it('samples move + buttons from the keyboard when no pad is present', () => {
    keyDown('KeyD'); // right
    keyDown('KeyW'); // up
    keyDown('Space'); // basic
    keyDown('KeyQ'); // a1
    const s = manager.sample(ORIGIN);

    expect(manager.activeSource).toBe('keyboard');
    expect(s.move.x).toBeCloseTo(Math.SQRT1_2);
    expect(s.move.y).toBeCloseTo(-Math.SQRT1_2);
    expect(s.buttons.basic).toBe(true);
    expect(s.buttons.a1).toBe(true);
    expect(s.buttons.a2).toBe(false);
  });

  it('derives aim from the pointer position relative to the local player', () => {
    mouseMove(0, 100); // cursor straight below the player at origin
    const s = manager.sample(ORIGIN);
    expect(s.aim.x).toBeCloseTo(0);
    expect(s.aim.y).toBeCloseTo(1);
    expect(Math.hypot(s.aim.x, s.aim.y)).toBeCloseTo(1);
  });

  it('always returns a unit-length aim (default up when cursor on player)', () => {
    const s = manager.sample(ORIGIN);
    expect(s.aim.x).toBeCloseTo(0);
    expect(s.aim.y).toBeCloseTo(-1);
    expect(Math.hypot(s.aim.x, s.aim.y)).toBeCloseTo(1);
  });

  it('keeps move magnitude within [0, 1]', () => {
    keyDown('KeyW');
    keyDown('KeyD');
    const s = manager.sample(ORIGIN);
    expect(Math.hypot(s.move.x, s.move.y)).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('InputManager: gamepad path & arbitration', () => {
  it('an active gamepad wins immediately and supplies move + button flags', () => {
    setGamepads([makeGamepad({ axes: [0.8, 0, 0, 0], pressed: [0, 1] })]);
    const s = manager.sample(ORIGIN);

    expect(manager.activeSource).toBe('gamepad');
    const expected = (0.8 - DEAD_ZONE) / (1 - DEAD_ZONE);
    expect(s.move.x).toBeCloseTo(expected, 5);
    expect(s.move.y).toBeCloseTo(0);
    expect(s.buttons.basic).toBe(true); // button 0
    expect(s.buttons.a1).toBe(true); // button 1
    expect(s.buttons.a2).toBe(false);
  });

  it('reads aim from the right stick and revive from a shoulder button', () => {
    setGamepads([makeGamepad({ axes: [0, 0, 0.9, 0], pressed: [4] })]);
    const s = manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('gamepad');
    expect(s.aim.x).toBeCloseTo(1);
    expect(s.aim.y).toBeCloseTo(0);
    expect(s.buttons.revive).toBe(true); // button 4 (L1)
  });

  it('substitutes the persisted last aim when the pad reports zero aim', () => {
    // Left stick moving, right stick centered (aim {0,0}) -> keep last aim (up).
    setGamepads([makeGamepad({ axes: [0.8, 0, 0, 0] })]);
    const s = manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('gamepad');
    expect(s.aim.x).toBeCloseTo(0);
    expect(s.aim.y).toBeCloseTo(-1); // default persisted "up"
    expect(Math.hypot(s.aim.x, s.aim.y)).toBeCloseTo(1);
  });

  it('a connected-but-idle pad that was never active never wins', () => {
    setGamepads([makeGamepad()]); // all zero axes, no buttons -> not active
    keyDown('KeyD');
    const s = manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('keyboard');
    expect(s.move.x).toBeCloseTo(1);
  });

  it('ignores a disconnected pad and falls back to the keyboard', () => {
    setGamepads([makeGamepad({ axes: [0.9, 0, 0, 0], connected: false })]);
    const s = manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('keyboard');
    expect(s.move).toEqual({ x: 0, y: 0 });
  });
});

describe('InputManager: last-used-device timing', () => {
  it('keeps an idle pad active within the sticky window, then hands back to keyboard', () => {
    const now = vi.spyOn(performance, 'now');

    now.mockReturnValue(1000);
    setGamepads([makeGamepad({ axes: [0.8, 0, 0, 0] })]); // active
    expect(manager.sample(ORIGIN).move.x).toBeGreaterThan(0);
    expect(manager.activeSource).toBe('gamepad');

    // Pad goes idle; still inside the 2000ms sticky window (t = 2500).
    setGamepads([makeGamepad()]);
    now.mockReturnValue(2500);
    manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('gamepad');

    // Past the sticky window (t = 3500, 2500ms since last active) -> keyboard.
    now.mockReturnValue(3500);
    manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('keyboard');
  });

  it('lets fresher keyboard activity reclaim control from an idle pad', () => {
    const now = vi.spyOn(performance, 'now');

    now.mockReturnValue(1000);
    setGamepads([makeGamepad({ axes: [0.8, 0, 0, 0] })]); // active
    manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('gamepad');

    // Keyboard used at t = 1500 (its handler stamps lastActivityMs = 1500).
    now.mockReturnValue(1500);
    keyDown('KeyW');

    // Pad idle at t = 1600: still within sticky window, but keyboard is fresher.
    setGamepads([makeGamepad()]);
    now.mockReturnValue(1600);
    const s = manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('keyboard');
    expect(s.move.y).toBeCloseTo(-1); // W still held
  });
});

describe('InputManager: sanitize guarantees', () => {
  it('never emits NaN and always yields a finite unit aim', () => {
    keyDown('KeyW');
    mouseMove(3, 4);
    const s = manager.sample(ORIGIN);
    for (const v of [s.move.x, s.move.y, s.aim.x, s.aim.y]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(Math.hypot(s.aim.x, s.aim.y)).toBeCloseTo(1);
  });
});

describe('InputManager: sanitize move-magnitude clamp', () => {
  it('renormalizes an over-unit move vector (touch emits |v| > 1)', () => {
    // Touch passes its stick vector straight through with no internal clamp, so it
    // is the one source that can hand `sanitize` a move whose magnitude exceeds 1.
    // (0.8, 0.8) has |v| ≈ 1.131 > 1, driving the moveLen>1 normalization branch.
    // performance.now is pinned to 0 so touch's activity stamp can't leak into
    // later tests' last-used-device arbitration.
    vi.spyOn(performance, 'now').mockReturnValue(0);
    setTouchMove(0.8, 0.8);
    const s = manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('touch');
    expect(Math.hypot(s.move.x, s.move.y)).toBeCloseTo(1, 5);
    // Direction preserved through renormalization (equal components -> 45°).
    expect(s.move.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(s.move.y).toBeCloseTo(Math.SQRT1_2, 5);
  });
});

describe('InputManager: dispose', () => {
  it('tears down keyboard listeners so later events do not change state', () => {
    keyDown('KeyD');
    expect(manager.sample(ORIGIN).move.x).toBeCloseTo(1);

    manager.dispose();

    keyDown('KeyW'); // listeners removed -> ignored
    const s = manager.sample(ORIGIN);
    expect(s.move).toEqual({ x: 0, y: 0 });
  });
});

describe('InputManager: touch sticky window (touch-was-recently-used arbitration)', () => {
  // Mirrors the gamepad sticky logic but for the touch overlay: once touch was the
  // most-recently-used source, a subsequently-DISENGAGED touch keeps control while
  // it is still the freshest device AND within the 2000ms window. These drive the
  // second operand of `useTouch` (the parenthesized touchMs>0 && … && … chain),
  // which the "touchEngaged() is true" cases never reach.

  it('keeps a disengaged touch active while inside its sticky window', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000);
    setTouchMove(0.5, 0); // touch engaged -> activity stamp = 1000
    expect(manager.sample(ORIGIN).move.x).toBeGreaterThan(0);
    expect(manager.activeSource).toBe('touch');

    // Disengage: zero the stick. touchEngaged() is now false, but the activity
    // stamp (1000) is unchanged, so the sticky branch must keep touch selected.
    setTouchMove(0, 0);
    now.mockReturnValue(2500); // 1500ms later, still within the 2000ms window
    manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('touch');
  });

  it('lets fresher keyboard activity reclaim control from a disengaged touch', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000);
    setTouchMove(0.5, 0); // touch stamp = 1000
    manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('touch');

    setTouchMove(0, 0); // disengage; touch stamp stays 1000
    now.mockReturnValue(1500);
    keyDown('KeyD'); // keyboard activity at 1500 (fresher than touch's 1000)
    now.mockReturnValue(1600); // still inside touch's sticky window
    const s = manager.sample(ORIGIN);
    // touchMs (1000) < otherMs (kb 1500) -> the `touchMs >= otherMs` term is false.
    expect(manager.activeSource).toBe('keyboard');
    expect(s.move.x).toBeCloseTo(1); // D still held
  });

  it('hands a disengaged touch back to the keyboard once its sticky window lapses', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000);
    setTouchMove(0.5, 0); // touch stamp = 1000
    manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('touch');

    setTouchMove(0, 0); // disengage; stamp stays 1000
    now.mockReturnValue(3500); // 2500ms later -> past the 2000ms window
    manager.sample(ORIGIN);
    // `now - touchMs (2500) <= GAMEPAD_STICKY_MS (2000)` is false -> keyboard wins.
    expect(manager.activeSource).toBe('keyboard');
  });
});

describe('InputManager: optional-button backfill', () => {
  it('fills sub1/sub2/swap/item with false when a source omits them (?? false)', () => {
    // Pin the clock far ahead so any residual touch activity stamp from earlier
    // tests sits well outside the sticky window and the keyboard path is chosen.
    vi.spyOn(performance, 'now').mockReturnValue(10_000_000);
    // The expansion buttons are optional on ButtonState ("producers set them and
    // consumers read `?? false`"). Stub the keyboard producer to emit only the
    // base buttons; sanitize must backfill the four optional ones as false.
    vi.spyOn(KeyboardMouse.prototype, 'sample').mockReturnValue({
      move: { x: 0, y: 0 },
      aim: { x: 1, y: 0 },
      buttons: { basic: true, a1: false, a2: false, a3: false, revive: false },
    } satisfies InputState);

    const s = manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('keyboard');
    expect(s.buttons.basic).toBe(true);
    expect(s.buttons.sub1).toBe(false);
    expect(s.buttons.sub2).toBe(false);
    expect(s.buttons.swap).toBe(false);
    expect(s.buttons.item).toBe(false);
  });
});

describe('InputManager: NaN coercion (safe fallback)', () => {
  it('coerces NaN move components to 0 while keeping a finite unit aim', () => {
    // Touch is the one source that passes its stick vector straight through, so it
    // can hand sanitize a NaN move. `safe()` must map both NaN components to 0.
    vi.spyOn(performance, 'now').mockReturnValue(0);
    setTouchMove(NaN, NaN);
    const s = manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('touch');
    expect(s.move).toEqual({ x: 0, y: 0 });
    // Touch aim is {0,0} -> zero-length -> falls back to the persisted "up" aim.
    expect(Number.isFinite(s.aim.x)).toBe(true);
    expect(Number.isFinite(s.aim.y)).toBe(true);
    expect(Math.hypot(s.aim.x, s.aim.y)).toBeCloseTo(1);
  });
});
