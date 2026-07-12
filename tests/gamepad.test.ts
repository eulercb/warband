import { describe, it, expect, vi, afterEach } from 'vitest';
import { sampleGamepad, rumble, rawGamepadAim } from '../src/input/gamepad';

// ---------------------------------------------------------------------------
// Fakes. The module reads the browser Gamepad API off the global `navigator`
// (standard mapping): axes[0,1] = left stick -> movement, axes[2,3] = right
// stick -> aim, buttons[0..5] = ✕ ◯ ▢ △ L1 R1. DEAD_ZONE = 0.15 (radial),
// rescaled (mag - 0.15) / (1 - 0.15) so the response starts cleanly at the edge.
// We run in the default Node environment and stub `navigator.getGamepads`.
// ---------------------------------------------------------------------------

interface FakeButton {
  pressed: boolean;
  value: number;
  touched: boolean;
}

interface FakeGamepad {
  axes: number[];
  buttons: FakeButton[];
  connected: boolean;
  id: string;
  index: number;
  mapping: string;
  timestamp: number;
  vibrationActuator?: {
    playEffect?: (type: string, params: Record<string, number>) => Promise<unknown>;
  };
}

function button(pressed: boolean, value = pressed ? 1 : 0): FakeButton {
  return { pressed, value, touched: pressed };
}

/** A neutral, connected standard pad: sticks centred, no buttons pressed. */
function makePad(over: Partial<FakeGamepad> = {}): FakeGamepad {
  return {
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 6 }, () => button(false)),
    connected: true,
    id: 'Wireless Controller (STANDARD GAMEPAD)',
    index: 0,
    mapping: 'standard',
    timestamp: 0,
    ...over,
  };
}

/** A pad whose only pressed buttons are the given indices. */
function padWithButtons(indices: number[], length = 6): FakeGamepad {
  return makePad({
    buttons: Array.from({ length }, (_, i) => button(indices.includes(i))),
  });
}

function stubPads(pads: (FakeGamepad | null)[]): void {
  // vi.stubGlobal takes `unknown`, so no cast is needed for the fake navigator.
  vi.stubGlobal('navigator', { getGamepads: () => pads });
}

type Sample = NonNullable<ReturnType<typeof sampleGamepad>>;

/** Sample and assert a pad was found, narrowing away the `null` return. */
function expectSample(): Sample {
  const res = sampleGamepad();
  if (!res) throw new Error('expected a gamepad sample but got null');
  return res;
}

/** Sample with a single connected pad. */
function readPad(pad: FakeGamepad): Sample {
  stubPads([pad]);
  return expectSample();
}

function magnitude(v: { x: number; y: number }): number {
  return Math.hypot(v.x, v.y);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe('gamepad: no pad connected → null (keyboard/mouse fallback)', () => {
  it('returns null when getGamepads() is empty', () => {
    stubPads([]);
    expect(sampleGamepad()).toBeNull();
  });

  it('returns null when getGamepads() yields a null slot', () => {
    stubPads([null]);
    expect(sampleGamepad()).toBeNull();
  });

  it('ignores a present-but-disconnected pad', () => {
    stubPads([makePad({ connected: false, axes: [1, 0, 0, 0] })]);
    expect(sampleGamepad()).toBeNull();
  });

  it('returns null when navigator has no getGamepads at all', () => {
    vi.stubGlobal('navigator', {});
    expect(sampleGamepad()).toBeNull();
  });
});

describe('gamepad: movement from left stick + radial dead-zone', () => {
  it('maps a left stick beyond the dead-zone to a movement vector', () => {
    // (0.6, 0.8) has magnitude 1 → passes through at full scale.
    const { state, connected } = readPad(makePad({ axes: [0.6, 0.8, 0, 0] }));
    expect(connected).toBe(true);
    expect(state.move.x).toBeCloseTo(0.6, 5);
    expect(state.move.y).toBeCloseTo(0.8, 5);
    expect(magnitude(state.move)).toBeCloseTo(1, 5);
  });

  it('rescales a partial push from the dead-zone edge, preserving direction', () => {
    // mag 0.3 → scaled = (0.3 - 0.15) / 0.85 = 0.17647, aimed at +x.
    const { state } = readPad(makePad({ axes: [0.3, 0, 0, 0] }));
    expect(state.move.x).toBeCloseTo(0.15 / 0.85, 5);
    expect(state.move.y).toBeCloseTo(0, 5);
  });

  it('carries the sign of the axis (down-left etc.)', () => {
    const { state } = readPad(makePad({ axes: [-1, 0, 0, 0] }));
    expect(state.move.x).toBeCloseTo(-1, 5);
    expect(state.move.y).toBeCloseTo(0, 5);
  });

  it('rejects a left stick inside the dead-zone (axis-aligned)', () => {
    const { state } = readPad(makePad({ axes: [0.1, 0, 0, 0] }));
    expect(state.move.x).toBeCloseTo(0, 6);
    expect(state.move.y).toBeCloseTo(0, 6);
  });

  it('rejects a left stick inside the dead-zone (diagonal drift)', () => {
    // hypot(0.1, 0.1) = 0.1414 < 0.15 → radial dead-zone rejects it.
    const { state } = readPad(makePad({ axes: [0.1, 0.1, 0, 0] }));
    expect(state.move.x).toBeCloseTo(0, 6);
    expect(state.move.y).toBeCloseTo(0, 6);
  });

  it('starts from ~0 exactly at the dead-zone edge (no discontinuity)', () => {
    const { state } = readPad(makePad({ axes: [0.15, 0, 0, 0] }));
    expect(state.move.x).toBeCloseTo(0, 5);
    expect(state.move.y).toBeCloseTo(0, 5);
  });

  it('clamps a full diagonal to unit magnitude (normalization)', () => {
    // (1, 1) has magnitude √2, but the rescale caps at 1 → unit-length move.
    const { state } = readPad(makePad({ axes: [1, 1, 0, 0] }));
    expect(magnitude(state.move)).toBeCloseTo(1, 5);
    expect(state.move.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(state.move.y).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('renormalizes a marginally over-unit stick back to magnitude 1 (fp guard)', () => {
    // A near-full diagonal: applyDeadzone rebuilds the unit direction, but the
    // component divisions leave hypot at 1.0000000000000002 (> 1) via IEEE-754
    // rounding — the exact case the `moveLen > 1` clamp in sampleGamepad handles.
    const { state } = readPad(makePad({ axes: [0.998, 0.998, 0, 0] }));
    // The guard re-divides by that length, so the emitted move never exceeds 1
    // (without it, magnitude would stay at 1.0000000000000002 > 1).
    expect(magnitude(state.move)).toBeLessThanOrEqual(1);
    expect(magnitude(state.move)).toBeCloseTo(1, 9);
    // Symmetric diagonal preserved (equal, positive components).
    expect(state.move.x).toBeCloseTo(state.move.y, 12);
    expect(state.move.x).toBeGreaterThan(0);
  });
});

describe('gamepad: aim from right stick (unit vector)', () => {
  it('normalizes the right stick to a unit aim vector', () => {
    // Right stick pushed to magnitude 0.5 in direction (0.6, 0.8): aim is the
    // UNIT direction regardless of how far the stick is pushed.
    const { state } = readPad(makePad({ axes: [0, 0, 0.3, 0.4] }));
    expect(state.aim.x).toBeCloseTo(0.6, 5);
    expect(state.aim.y).toBeCloseTo(0.8, 5);
    expect(magnitude(state.aim)).toBeCloseTo(1, 5);
  });

  it('maps an axis-aligned right stick to a cardinal unit vector', () => {
    const { state } = readPad(makePad({ axes: [0, 0, 1, 0] }));
    expect(state.aim.x).toBeCloseTo(1, 5);
    expect(state.aim.y).toBeCloseTo(0, 5);
  });

  it('carries the aim sign (straight up on screen = -y)', () => {
    const { state } = readPad(makePad({ axes: [0, 0, 0, -1] }));
    expect(state.aim.x).toBeCloseTo(0, 5);
    expect(state.aim.y).toBeCloseTo(-1, 5);
  });

  it('returns a neutral {0,0} aim inside the dead-zone (host keeps last reticle)', () => {
    // hypot(0.1, 0.05) < 0.15 → module emits {0,0}; the InputManager (not this
    // module) is what preserves the previous aim direction.
    const { state } = readPad(makePad({ axes: [0, 0, 0.1, 0.05] }));
    expect(state.aim.x).toBeCloseTo(0, 6);
    expect(state.aim.y).toBeCloseTo(0, 6);
  });

  it('keeps the two sticks independent (left=move only, right=aim only)', () => {
    const left = readPad(makePad({ axes: [0.6, 0.8, 0, 0] }));
    expect(magnitude(left.state.move)).toBeCloseTo(1, 5);
    expect(left.state.aim.x).toBeCloseTo(0, 6);
    expect(left.state.aim.y).toBeCloseTo(0, 6);

    const right = readPad(makePad({ axes: [0, 0, 0.6, 0.8] }));
    expect(magnitude(right.state.aim)).toBeCloseTo(1, 5);
    expect(right.state.move.x).toBeCloseTo(0, 6);
    expect(right.state.move.y).toBeCloseTo(0, 6);
  });
});

describe('gamepad: rawGamepadAim (class-radial direction)', () => {
  it('returns {0,0} when no pad is connected', () => {
    stubPads([]);
    expect(rawGamepadAim()).toEqual({ x: 0, y: 0 });
  });

  it('returns a dead-zoned right-stick vector whose magnitude means "distance from centre"', () => {
    // Unlike the sanitized aim, this is NOT unit length: it carries the rescaled
    // stick magnitude so "how far pushed" survives (a full push ≈ 1).
    stubPads([makePad({ axes: [0, 0, 1, 0] })]);
    const full = rawGamepadAim();
    expect(full.x).toBeCloseTo(1, 5);
    expect(full.y).toBeCloseTo(0, 5);
    expect(magnitude(full)).toBeGreaterThan(0);
  });

  it('returns {0,0} inside the dead-zone so "centred = no selection" is detectable', () => {
    // hypot(0.1, 0.05) < 0.15 → inside the radial dead-zone.
    stubPads([makePad({ axes: [0, 0, 0.1, 0.05] })]);
    expect(rawGamepadAim()).toEqual({ x: 0, y: 0 });
  });
});

describe('gamepad: action buttons (default standard mapping)', () => {
  it('button 0 (✕/A) → basic', () => {
    const { state } = readPad(padWithButtons([0]));
    expect(state.buttons).toEqual({
      basic: true,
      a1: false,
      a2: false,
      a3: false,
      revive: false,
      sub1: false,
      sub2: false,
      swap: false,
      item: false,
    });
  });

  it('button 1 (◯/B) → a1', () => {
    expect(readPad(padWithButtons([1])).state.buttons.a1).toBe(true);
    expect(readPad(padWithButtons([1])).state.buttons.basic).toBe(false);
  });

  it('button 2 (▢/X) → a2', () => {
    expect(readPad(padWithButtons([2])).state.buttons.a2).toBe(true);
  });

  it('button 3 (△/Y) → a3', () => {
    expect(readPad(padWithButtons([3])).state.buttons.a3).toBe(true);
  });

  it('either shoulder (L1 index 4, R1 index 5) → revive', () => {
    expect(readPad(padWithButtons([4])).state.buttons.revive).toBe(true);
    expect(readPad(padWithButtons([5])).state.buttons.revive).toBe(true);
  });

  it('reports several held buttons at once', () => {
    const { state } = readPad(padWithButtons([0, 4]));
    expect(state.buttons.basic).toBe(true);
    expect(state.buttons.revive).toBe(true);
    expect(state.buttons.a1).toBe(false);
  });

  it('requires pressed === true (a half-pulled analog trigger does not fire)', () => {
    const pad = makePad({
      buttons: [button(false, 0.9), button(false), button(false), button(false)],
    });
    expect(readPad(pad).state.buttons.basic).toBe(false);
  });

  it('treats out-of-range button indices as not pressed (short buttons array)', () => {
    // Only one button present, unpressed: revive (indices 4,5) must not crash.
    const { state } = readPad(makePad({ buttons: [button(false)] }));
    expect(state.buttons).toEqual({
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
  });
});

describe('gamepad: active flag (last-used-device-wins)', () => {
  it('a connected but idle pad is connected yet not active', () => {
    const { connected, active } = readPad(makePad());
    expect(connected).toBe(true);
    expect(active).toBe(false);
  });

  it('a left stick beyond the dead-zone marks the pad active', () => {
    expect(readPad(makePad({ axes: [0.5, 0, 0, 0] })).active).toBe(true);
  });

  it('a right stick beyond the dead-zone marks the pad active', () => {
    expect(readPad(makePad({ axes: [0, 0, 0.5, 0] })).active).toBe(true);
  });

  it('any mapped button marks the pad active', () => {
    expect(readPad(padWithButtons([2])).active).toBe(true);
  });

  it('a right stick inside the dead-zone alone does not mark active', () => {
    expect(readPad(makePad({ axes: [0, 0, 0.1, 0] })).active).toBe(false);
  });
});

describe('gamepad: malformed / defensive pad state', () => {
  it('treats missing axes as centred (nullish axis → 0)', () => {
    const { state, active } = readPad(makePad({ axes: [] }));
    expect(state.move.x).toBeCloseTo(0, 6);
    expect(state.move.y).toBeCloseTo(0, 6);
    expect(state.aim.x).toBeCloseTo(0, 6);
    expect(state.aim.y).toBeCloseTo(0, 6);
    expect(active).toBe(false);
  });

  it('rejects non-finite (NaN) axis values via the dead-zone guard', () => {
    const { state } = readPad(makePad({ axes: [NaN, NaN, NaN, NaN] }));
    expect(state.move.x).toBeCloseTo(0, 6);
    expect(state.move.y).toBeCloseTo(0, 6);
    expect(state.aim.x).toBeCloseTo(0, 6);
    expect(state.aim.y).toBeCloseTo(0, 6);
  });
});

describe('gamepad: pad selection', () => {
  it('uses the first CONNECTED pad, skipping null and disconnected slots', () => {
    const disconnected = makePad({ connected: false, axes: [1, 0, 0, 0] });
    const live = makePad({ connected: true, axes: [0, 0, 1, 0] });
    stubPads([null, disconnected, live]);
    const { state } = expectSample();
    // Read the live pad's right stick (aim +x), not the disconnected pad's
    // left stick (which would have produced move +x).
    expect(state.aim.x).toBeCloseTo(1, 5);
    expect(state.move.x).toBeCloseTo(0, 6);
  });
});

describe('rumble haptics', () => {
  it('plays a clamped dual-rumble effect on the first pad', () => {
    const playEffect = vi.fn(() => Promise.resolve());
    stubPads([makePad({ vibrationActuator: { playEffect } })]);

    rumble(0.7, 200);

    expect(playEffect).toHaveBeenCalledTimes(1);
    expect(playEffect).toHaveBeenCalledWith('dual-rumble', {
      duration: 200,
      strongMagnitude: 0.7,
      weakMagnitude: 0.7,
    });
  });

  it('clamps intensity above 1 down to 1', () => {
    const playEffect = vi.fn(() => Promise.resolve());
    stubPads([makePad({ vibrationActuator: { playEffect } })]);

    rumble(2, 50);

    expect(playEffect).toHaveBeenCalledWith('dual-rumble', {
      duration: 50,
      strongMagnitude: 1,
      weakMagnitude: 1,
    });
  });

  it('clamps negative intensity and negative duration to 0', () => {
    const playEffect = vi.fn(() => Promise.resolve());
    stubPads([makePad({ vibrationActuator: { playEffect } })]);

    rumble(-1, -10);

    expect(playEffect).toHaveBeenCalledWith('dual-rumble', {
      duration: 0,
      strongMagnitude: 0,
      weakMagnitude: 0,
    });
  });

  it('is a no-op (no throw) when no pad is connected', () => {
    stubPads([]);
    expect(() => rumble()).not.toThrow();
  });

  it('is a no-op (no throw) when the pad has no vibration actuator', () => {
    stubPads([makePad()]);
    expect(() => rumble(0.5, 100)).not.toThrow();
  });
});
