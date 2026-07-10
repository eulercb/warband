/**
 * Warband — gamepad menu-navigation stack tests (src/input/gamepadNav.ts).
 *
 * The module exposes no dispatch entry point: handlers are invoked only by the
 * internal rAF `poll()` loop, which reads live gamepad state through
 * `navigator.getGamepads()` and times repeats with `performance.now()`. We
 * therefore drive it as a black box — stub `requestAnimationFrame` to capture
 * the frame callback, stub the gamepad source, pin the clock, then step frames
 * by hand and assert which handler on the stack received onNav/onConfirm/onBack.
 *
 * Node env (the module never references window/document). The module holds
 * persistent state (the handler stack plus edge/repeat trackers), so each test
 * re-imports a fresh copy via vi.resetModules().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavDir, NavHandler } from '../src/input/gamepadNav';

// Standard-mapping indices, mirrored from the source (it does not export them).
const BTN_CONFIRM = 0;
const BTN_BACK = 1;
const DPAD: Record<NavDir, number> = { up: 12, down: 13, left: 14, right: 15 };

interface FakeGamepad {
  connected: boolean;
  buttons: { pressed: boolean }[];
  axes: number[];
}

// Fresh handle to the module-under-test, re-imported per test.
let pushNavHandler: typeof import('../src/input/gamepadNav').pushNavHandler;

// Test-controlled stand-ins for the browser globals the module polls.
let pendingFrame: FrameRequestCallback | null;
let rafCounter: number;
let cancelled: number[];
let gamepads: (FakeGamepad | null)[];
let mockTime: number;
let getGamepadsThrows: boolean;

function neutralPad(): FakeGamepad {
  return {
    connected: true,
    buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
    axes: [0, 0],
  };
}

function addPad(): FakeGamepad {
  const pad = neutralPad();
  gamepads.push(pad);
  return pad;
}

function pressDpad(pad: FakeGamepad, dir: NavDir): void {
  pad.buttons[DPAD[dir]].pressed = true;
}

function releaseDpad(pad: FakeGamepad, dir: NavDir): void {
  pad.buttons[DPAD[dir]].pressed = false;
}

/** Run one animation frame: invoke the callback the module last scheduled. */
function frame(): void {
  pendingFrame?.(mockTime);
}

function makeHandler() {
  // Typed mocks so the returned object is assignable to NavHandler (an untyped
  // `vi.fn()` is `Mock<Procedure | Constructable>`, which is not).
  return {
    onNav: vi.fn<(dir: NavDir) => void>(),
    onConfirm: vi.fn<() => void>(),
    onBack: vi.fn<() => void>(),
  };
}

beforeEach(async () => {
  vi.resetModules();
  pendingFrame = null;
  rafCounter = 0;
  cancelled = [];
  gamepads = [];
  mockTime = 1000;
  getGamepadsThrows = false;

  // Capture (don't auto-run) the scheduled callback; poll() reschedules itself,
  // so a self-invoking stub would recurse forever. `frame()` steps it instead.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    pendingFrame = cb;
    return ++rafCounter;
  });
  // Record the id but leave pendingFrame intact, so a test can still hand-drive
  // poll() after the loop stops (used to prove the empty-stack no-op).
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    cancelled.push(id);
  });
  vi.stubGlobal('navigator', {
    getGamepads: (): (FakeGamepad | null)[] => {
      if (getGamepadsThrows) throw new Error('getGamepads unavailable');
      return gamepads;
    },
  });
  vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

  ({ pushNavHandler } = await import('../src/input/gamepadNav'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lifecycle (start/stop)', () => {
  it('returns an unsubscribe fn and schedules a single frame on first push', () => {
    const unsub = pushNavHandler(makeHandler());
    expect(typeof unsub).toBe('function');
    expect(rafCounter).toBe(1); // start() scheduled exactly one frame
    expect(pendingFrame).not.toBeNull();

    unsub();
    expect(cancelled).toContain(1); // stop() cancelled it once the stack emptied
  });

  it('does not start a second loop when a second handler is pushed', () => {
    const u1 = pushNavHandler(makeHandler());
    const u2 = pushNavHandler(makeHandler());
    expect(rafCounter).toBe(1); // still the single loop from the first push
    u2();
    u1();
  });

  it('keeps polling until the last handler leaves, then cancels the frame', () => {
    const u1 = pushNavHandler(makeHandler());
    const u2 = pushNavHandler(makeHandler());
    u1(); // remove the bottom first — one remains, so keep running
    expect(cancelled).toHaveLength(0);
    u2(); // last one out → stop
    expect(cancelled).toContain(1);
  });
});

describe('dispatch to the top handler', () => {
  it('dispatches each d-pad direction as the matching NavDir', () => {
    const dirs: NavDir[] = ['up', 'down', 'left', 'right'];
    for (const dir of dirs) {
      gamepads = [];
      const h = makeHandler();
      const unsub = pushNavHandler(h);
      const pad = addPad();
      pressDpad(pad, dir);
      frame();
      expect(h.onNav).toHaveBeenCalledTimes(1);
      expect(h.onNav).toHaveBeenCalledWith(dir);
      expect(h.onConfirm).not.toHaveBeenCalled();
      expect(h.onBack).not.toHaveBeenCalled();
      unsub();
    }
  });

  it('dispatches confirm (button 0) as a single edge, re-firing only after release', () => {
    const h = makeHandler();
    const unsub = pushNavHandler(h);
    const pad = addPad();

    pad.buttons[BTN_CONFIRM].pressed = true;
    frame();
    expect(h.onConfirm).toHaveBeenCalledTimes(1);
    expect(h.onNav).not.toHaveBeenCalled();
    expect(h.onBack).not.toHaveBeenCalled();

    frame(); // still held → no re-fire
    expect(h.onConfirm).toHaveBeenCalledTimes(1);

    pad.buttons[BTN_CONFIRM].pressed = false;
    frame();
    pad.buttons[BTN_CONFIRM].pressed = true;
    frame(); // fresh edge
    expect(h.onConfirm).toHaveBeenCalledTimes(2);

    unsub();
  });

  it('dispatches back (button 1) as a single edge', () => {
    const h = makeHandler();
    const unsub = pushNavHandler(h);
    const pad = addPad();

    pad.buttons[BTN_BACK].pressed = true;
    frame();
    expect(h.onBack).toHaveBeenCalledTimes(1);
    expect(h.onConfirm).not.toHaveBeenCalled();
    expect(h.onNav).not.toHaveBeenCalled();

    unsub();
  });

  it('does not re-fire a button already held when the handler is pushed', () => {
    const pad = addPad();
    pad.buttons[BTN_CONFIRM].pressed = true; // held BEFORE the push
    const h = makeHandler();
    const unsub = pushNavHandler(h); // start() seeds the edge as already-down
    frame();
    expect(h.onConfirm).not.toHaveBeenCalled();
    unsub();
  });

  it('reads the left stick: each axis direction past threshold fires its NavDir', () => {
    const cases: { dir: NavDir; axis: 0 | 1; value: number }[] = [
      { dir: 'left', axis: 0, value: -0.9 },
      { dir: 'right', axis: 0, value: 0.9 },
      { dir: 'up', axis: 1, value: -0.9 },
      { dir: 'down', axis: 1, value: 0.9 },
    ];
    for (const { dir, axis, value } of cases) {
      gamepads = [];
      const h = makeHandler();
      const unsub = pushNavHandler(h);
      const pad = addPad();
      pad.axes[axis] = value;
      frame();
      expect(h.onNav).toHaveBeenCalledTimes(1);
      expect(h.onNav).toHaveBeenCalledWith(dir);
      unsub();
    }
  });

  it('ignores stick deflection below the axis threshold', () => {
    const h = makeHandler();
    const unsub = pushNavHandler(h);
    const pad = addPad();
    pad.axes[1] = 0.4; // below 0.55 → not 'down'
    frame();
    expect(h.onNav).not.toHaveBeenCalled();
    unsub();
  });

  it('treats a pad reporting no axes as centered (nullish-safe, no dispatch)', () => {
    const h = makeHandler();
    const unsub = pushNavHandler(h);
    const pad = addPad();
    pad.axes = []; // axes not yet populated → axis reads fall back to 0
    frame();
    expect(h.onNav).not.toHaveBeenCalled();
    unsub();
  });

  it('handles a navigator without getGamepads (older/absent API)', () => {
    vi.stubGlobal('navigator', {}); // no getGamepads at all
    const h = makeHandler();
    const unsub = pushNavHandler(h); // start()/poll() must cope
    expect(() => frame()).not.toThrow();
    expect(h.onNav).not.toHaveBeenCalled();
    unsub();
  });

  it('ignores input from a disconnected pad', () => {
    const h = makeHandler();
    const unsub = pushNavHandler(h);
    const pad = addPad();
    pad.connected = false;
    pressDpad(pad, 'up');
    pad.buttons[BTN_CONFIRM].pressed = true;
    frame();
    expect(h.onNav).not.toHaveBeenCalled();
    expect(h.onConfirm).not.toHaveBeenCalled();
    unsub();
  });

  it('swallows a throwing navigator.getGamepads (no dispatch, no crash)', () => {
    getGamepadsThrows = true;
    const h = makeHandler();
    const unsub = pushNavHandler(h); // start() also polls → must not throw
    expect(() => frame()).not.toThrow();
    expect(h.onNav).not.toHaveBeenCalled();
    expect(h.onConfirm).not.toHaveBeenCalled();
    expect(h.onBack).not.toHaveBeenCalled();
    unsub();
  });
});

describe('directional repeat + edge timing', () => {
  it('repeats onNav after the initial delay, then at the repeat interval, while held', () => {
    const h = makeHandler();
    const unsub = pushNavHandler(h);
    const pad = addPad();
    pressDpad(pad, 'down');

    frame(); // t=1000: initial edge fire
    expect(h.onNav).toHaveBeenCalledTimes(1);

    mockTime = 1100; // +100ms, within the 380ms initial delay → no repeat
    frame();
    expect(h.onNav).toHaveBeenCalledTimes(1);

    mockTime = 1400; // past 1000+380 → first repeat
    frame();
    expect(h.onNav).toHaveBeenCalledTimes(2);

    mockTime = 1550; // past prev+150 → second repeat
    frame();
    expect(h.onNav).toHaveBeenCalledTimes(3);
    expect(h.onNav).toHaveBeenLastCalledWith('down');

    unsub();
  });

  it('clears the edge on release, so re-pressing fires a fresh onNav', () => {
    const h = makeHandler();
    const unsub = pushNavHandler(h);
    const pad = addPad();

    pressDpad(pad, 'up');
    frame(); // edge fire
    expect(h.onNav).toHaveBeenCalledTimes(1);

    releaseDpad(pad, 'up');
    frame(); // released: no fire, edge cleared
    expect(h.onNav).toHaveBeenCalledTimes(1);

    pressDpad(pad, 'up');
    frame(); // fresh edge (no repeat wait)
    expect(h.onNav).toHaveBeenCalledTimes(2);

    unsub();
  });
});

describe('stack semantics', () => {
  it('routes events to the topmost handler when a second is pushed', () => {
    const bottom = makeHandler();
    const top = makeHandler();
    const unsubBottom = pushNavHandler(bottom);
    const unsubTop = pushNavHandler(top);
    const pad = addPad();

    pressDpad(pad, 'left');
    pad.buttons[BTN_CONFIRM].pressed = true;
    pad.buttons[BTN_BACK].pressed = true;
    frame();

    expect(top.onNav).toHaveBeenCalledWith('left');
    expect(top.onConfirm).toHaveBeenCalledTimes(1);
    expect(top.onBack).toHaveBeenCalledTimes(1);
    expect(bottom.onNav).not.toHaveBeenCalled();
    expect(bottom.onConfirm).not.toHaveBeenCalled();
    expect(bottom.onBack).not.toHaveBeenCalled();

    unsubTop();
    unsubBottom();
  });

  it('restores the previous handler when the top is unsubscribed', () => {
    const bottom = makeHandler();
    const top = makeHandler();
    const unsubBottom = pushNavHandler(bottom);
    const unsubTop = pushNavHandler(top);
    const pad = addPad();

    unsubTop();
    pressDpad(pad, 'down');
    pad.buttons[BTN_CONFIRM].pressed = true;
    frame();

    expect(bottom.onNav).toHaveBeenCalledWith('down');
    expect(bottom.onConfirm).toHaveBeenCalledTimes(1);
    expect(top.onNav).not.toHaveBeenCalled();
    expect(top.onConfirm).not.toHaveBeenCalled();

    unsubBottom();
  });

  it('removes a middle handler without disturbing the top', () => {
    const h1 = makeHandler();
    const h2 = makeHandler();
    const h3 = makeHandler();
    const u1 = pushNavHandler(h1);
    const u2 = pushNavHandler(h2);
    const u3 = pushNavHandler(h3);
    const pad = addPad();

    u2(); // remove the middle; h3 is still the top

    pad.buttons[BTN_CONFIRM].pressed = true;
    frame();
    expect(h3.onConfirm).toHaveBeenCalledTimes(1);
    expect(h1.onConfirm).not.toHaveBeenCalled();
    expect(h2.onConfirm).not.toHaveBeenCalled();

    u3(); // now h1 becomes the top
    pad.buttons[BTN_BACK].pressed = true;
    frame();
    expect(h1.onBack).toHaveBeenCalledTimes(1);
    expect(h3.onBack).not.toHaveBeenCalled();
    expect(h2.onBack).not.toHaveBeenCalled();

    u1();
  });

  it('is a no-op (no throw, no calls) when the stack is empty', () => {
    const h = makeHandler();
    const unsub = pushNavHandler(h);
    const pad = addPad();
    unsub(); // stack now empty; drive poll() by hand anyway

    pressDpad(pad, 'up');
    pad.buttons[BTN_CONFIRM].pressed = true;
    pad.buttons[BTN_BACK].pressed = true;

    expect(() => frame()).not.toThrow();
    expect(h.onNav).not.toHaveBeenCalled();
    expect(h.onConfirm).not.toHaveBeenCalled();
    expect(h.onBack).not.toHaveBeenCalled();
  });
});

describe('unsubscribe', () => {
  it('is idempotent — a second call is safe and pops nothing else', () => {
    const bottom = makeHandler();
    const top = makeHandler();
    const unsubBottom = pushNavHandler(bottom);
    const unsubTop = pushNavHandler(top);
    const pad = addPad();

    unsubTop();
    expect(() => unsubTop()).not.toThrow(); // must NOT pop `bottom`

    pressDpad(pad, 'up');
    frame();
    expect(bottom.onNav).toHaveBeenCalledWith('up');
    expect(top.onNav).not.toHaveBeenCalled();

    unsubBottom();
  });

  it('tolerates unsubscribing the last handler twice', () => {
    const unsub = pushNavHandler(makeHandler());
    unsub();
    expect(() => unsub()).not.toThrow();
  });
});

describe('handler contract', () => {
  it('throws when the top handler lacks the callback for a fired event', () => {
    // NavHandler requires onNav/onConfirm/onBack. poll() guards only the empty
    // stack (`top?.onX()`), not a missing method — so a partial handler, which
    // is reachable only via an unsafe cast, throws when that input fires. This
    // pins current behaviour (see the report note on hardening with `?.()`).
    const partial = { onNav: vi.fn() } as unknown as NavHandler;
    const unsub = pushNavHandler(partial);
    const pad = addPad();

    pad.buttons[BTN_CONFIRM].pressed = true;
    expect(() => frame()).toThrow(TypeError);

    unsub();
  });

  it('never throws for a fully-populated handler across every event', () => {
    const h = makeHandler();
    const unsub = pushNavHandler(h);
    const pad = addPad();

    pressDpad(pad, 'right');
    pad.buttons[BTN_CONFIRM].pressed = true;
    pad.buttons[BTN_BACK].pressed = true;
    expect(() => frame()).not.toThrow();

    expect(h.onNav).toHaveBeenCalledWith('right');
    expect(h.onConfirm).toHaveBeenCalledTimes(1);
    expect(h.onBack).toHaveBeenCalledTimes(1);

    unsub();
  });
});
