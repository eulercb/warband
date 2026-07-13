// @vitest-environment jsdom
/**
 * Branch-coverage supplement for audio/sfx.ts (class Sfx).
 *
 * Companion to tests/sfx.test.ts. That suite pins the happy paths; this one
 * drives the *other* side of every reachable conditional so branch coverage
 * climbs: the false arm of every per-sound throttle guard, the whole
 * `corruption` dispatch case (good vs. hostile beat), the noise-voice
 * concurrency cap, the cached-noise-buffer fast path, dispose() with no context,
 * the missing-`window` degradation arm, plus the volume/mute/target/silent
 * ternaries and the voice-cleanup callbacks.
 *
 * The Web Audio graph is faked exactly as in tests/sfx.test.ts: typed vi.fn()
 * spies installed with vi.stubGlobal, so `new Sfx()` touches nothing until
 * resume()/play()/handleEvents() lazily build the context.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Sfx } from '../src/audio/sfx';
import type { GameEvent, Side, Vec2 } from '../src/engine/core/types';

// ---------------------------------------------------------------------------
// Typed fake Web Audio graph (mirrors tests/sfx.test.ts).
// ---------------------------------------------------------------------------

type ParamFn = (value: number, time: number) => void;
type TimeFn = (time: number) => void;
type ConnectFn = (dest: unknown) => unknown;
type WhenFn = (when: number) => void;

interface FakeAudioParam {
  value: number;
  setValueAtTime: Mock<ParamFn>;
  cancelScheduledValues: Mock<TimeFn>;
  linearRampToValueAtTime: Mock<ParamFn>;
  exponentialRampToValueAtTime: Mock<ParamFn>;
}

interface FakeGain {
  gain: FakeAudioParam;
  connect: Mock<ConnectFn>;
  disconnect: Mock<() => void>;
}

interface FakeOscillator {
  type: OscillatorType;
  frequency: FakeAudioParam;
  detune: FakeAudioParam;
  connect: Mock<ConnectFn>;
  disconnect: Mock<() => void>;
  start: Mock<WhenFn>;
  stop: Mock<WhenFn>;
  onended: (() => void) | null;
}

interface FakeBiquadFilter {
  type: BiquadFilterType;
  frequency: FakeAudioParam;
  connect: Mock<ConnectFn>;
  disconnect: Mock<() => void>;
}

interface FakeBufferSource {
  buffer: unknown;
  connect: Mock<ConnectFn>;
  disconnect: Mock<() => void>;
  start: Mock<WhenFn>;
  stop: Mock<WhenFn>;
  onended: (() => void) | null;
}

interface FakeAudioBuffer {
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  getChannelData: Mock<(channel: number) => Float32Array>;
}

function makeParam(value = 0): FakeAudioParam {
  return {
    value,
    setValueAtTime: vi.fn<ParamFn>(),
    cancelScheduledValues: vi.fn<TimeFn>(),
    linearRampToValueAtTime: vi.fn<ParamFn>(),
    exponentialRampToValueAtTime: vi.fn<ParamFn>(),
  };
}

function makeGain(): FakeGain {
  return {
    gain: makeParam(0),
    connect: vi.fn<ConnectFn>((dest) => dest),
    disconnect: vi.fn<() => void>(),
  };
}

function makeOscillator(): FakeOscillator {
  return {
    type: 'sine',
    frequency: makeParam(0),
    detune: makeParam(0),
    connect: vi.fn<ConnectFn>((dest) => dest),
    disconnect: vi.fn<() => void>(),
    start: vi.fn<WhenFn>(),
    stop: vi.fn<WhenFn>(),
    onended: null,
  };
}

function makeFilter(): FakeBiquadFilter {
  return {
    type: 'lowpass',
    frequency: makeParam(0),
    connect: vi.fn<ConnectFn>((dest) => dest),
    disconnect: vi.fn<() => void>(),
  };
}

function makeBufferSource(): FakeBufferSource {
  return {
    buffer: null,
    connect: vi.fn<ConnectFn>((dest) => dest),
    disconnect: vi.fn<() => void>(),
    start: vi.fn<WhenFn>(),
    stop: vi.fn<WhenFn>(),
    onended: null,
  };
}

function makeBuffer(length: number, sampleRate: number): FakeAudioBuffer {
  const data = new Float32Array(length);
  return {
    length,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: vi.fn<(channel: number) => Float32Array>(() => data),
  };
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 48000;
  destination = { kind: 'destination' as const };

  readonly createdGains: FakeGain[] = [];
  readonly createdOscillators: FakeOscillator[] = [];
  readonly createdFilters: FakeBiquadFilter[] = [];
  readonly createdBufferSources: FakeBufferSource[] = [];
  readonly createdBuffers: FakeAudioBuffer[] = [];

  resume = vi.fn<() => Promise<void>>(() => Promise.resolve());
  close = vi.fn<() => Promise<void>>(() => Promise.resolve());

  createGain = vi.fn<() => FakeGain>((): FakeGain => {
    const g = makeGain();
    this.createdGains.push(g);
    return g;
  });

  createOscillator = vi.fn<() => FakeOscillator>((): FakeOscillator => {
    const o = makeOscillator();
    this.createdOscillators.push(o);
    return o;
  });

  createBiquadFilter = vi.fn<() => FakeBiquadFilter>((): FakeBiquadFilter => {
    const f = makeFilter();
    this.createdFilters.push(f);
    return f;
  });

  createBufferSource = vi.fn<() => FakeBufferSource>((): FakeBufferSource => {
    const s = makeBufferSource();
    this.createdBufferSources.push(s);
    return s;
  });

  createBuffer = vi.fn<(channels: number, length: number, rate: number) => FakeAudioBuffer>(
    (_channels: number, length: number, rate: number): FakeAudioBuffer => {
      const b = makeBuffer(length, rate);
      this.createdBuffers.push(b);
      return b;
    },
  );

  constructor() {
    FakeAudioContext.instances.push(this);
  }
}

/** An AudioContext whose construction always throws (autoplay/privacy block). */
class ThrowingAudioContext {
  static attempts = 0;
  constructor() {
    ThrowingAudioContext.attempts += 1;
    throw new Error('AudioContext construction blocked');
  }
}

function currentCtx(): FakeAudioContext {
  expect(FakeAudioContext.instances.length).toBeGreaterThan(0);
  return FakeAudioContext.instances[0];
}

function masterGain(ctx: FakeAudioContext): FakeGain {
  return ctx.createdGains[0];
}

// ---------------------------------------------------------------------------
// Typed GameEvent factories.
// ---------------------------------------------------------------------------

const P: Vec2 = { x: 0, y: 0 };
const cast = (side: Side): GameEvent => ({
  t: 'cast',
  ability: 'slash',
  sourceId: 1,
  pos: P,
  side,
});
const hit = (side: Side): GameEvent => ({ t: 'hit', pos: P, amount: 5, targetId: 2, side });
const heal = (): GameEvent => ({ t: 'heal', pos: P, amount: 3, targetId: 1 });
const dodge = (): GameEvent => ({ t: 'dodge', id: 1, pos: P });
const death = (kind: 'player' | 'add' | 'boss'): GameEvent => ({ t: 'death', id: 1, kind, pos: P });
const downed = (): GameEvent => ({ t: 'downed', id: 1, pos: P });
const revive = (): GameEvent => ({ t: 'revive', id: 1, pos: P });
const blink = (): GameEvent => ({ t: 'blink', id: 1, from: P, to: P });
const enrage = (): GameEvent => ({ t: 'enrage', id: 1, pos: P });
const telegraph = (): GameEvent => ({ t: 'telegraph', pos: P, shape: 'circle' });
const projectile = (): GameEvent => ({ t: 'projectile', kind: 'arrow', pos: P });
const spawn = (): GameEvent => ({ t: 'spawn', id: 1, kind: 'add', pos: P });
const corruption = (good?: boolean): GameEvent => ({
  t: 'corruption',
  kind: 'healingRift',
  name: 'Healing Rift',
  pos: P,
  good,
});

beforeEach(() => {
  FakeAudioContext.instances = [];
  ThrowingAudioContext.attempts = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Per-sound throttle guards — the FALSE arm (identical event fired twice in the
// same instant collapses to a single voice set). Covers lines 221, 234, 249,
// 266, 279, 291, 306, 321, 328, 341, 356, 379, 386, 400.
// ---------------------------------------------------------------------------

describe('Sfx: throttle guards collapse a repeated event to one voice set', () => {
  interface ThrottleCase {
    name: string;
    ev: GameEvent;
    osc: number;
    noise: number;
  }

  const cases: ThrottleCase[] = [
    { name: 'cast (player)', ev: cast('player'), osc: 1, noise: 0 },
    { name: 'hit (boss)', ev: hit('boss'), osc: 1, noise: 1 },
    { name: 'hit (player)', ev: hit('player'), osc: 1, noise: 0 },
    { name: 'heal', ev: heal(), osc: 2, noise: 0 },
    { name: 'death (boss)', ev: death('boss'), osc: 1, noise: 1 },
    { name: 'death (add)', ev: death('add'), osc: 1, noise: 0 },
    { name: 'death (player)', ev: death('player'), osc: 1, noise: 0 },
    { name: 'downed', ev: downed(), osc: 2, noise: 0 },
    { name: 'revive', ev: revive(), osc: 3, noise: 0 },
    { name: 'dodge', ev: dodge(), osc: 0, noise: 1 },
    { name: 'blink', ev: blink(), osc: 1, noise: 0 },
    { name: 'enrage', ev: enrage(), osc: 2, noise: 0 },
    { name: 'telegraph', ev: telegraph(), osc: 1, noise: 0 },
    { name: 'projectile', ev: projectile(), osc: 1, noise: 0 },
    { name: 'spawn', ev: spawn(), osc: 1, noise: 0 },
    { name: 'corruption (good)', ev: corruption(true), osc: 3, noise: 0 },
  ];

  for (const c of cases) {
    it(`${c.name}: second copy at the same instant is throttled`, () => {
      const sfx = new Sfx();
      // Both events land at currentTime 0 -> the de-dupe window swallows the 2nd.
      sfx.handleEvents([c.ev, c.ev]);
      const ctx = currentCtx();
      expect(ctx.createdOscillators.length).toBe(c.osc);
      expect(ctx.createdBufferSources.length).toBe(c.noise);
    });

    it(`${c.name}: plays again once the throttle window elapses`, () => {
      const sfx = new Sfx();
      sfx.handleEvents([c.ev]);
      const ctx = currentCtx();
      expect(ctx.createdOscillators.length).toBe(c.osc);
      // Advance the clock well past every throttle window (max 0.1s) -> replays.
      ctx.currentTime = 1;
      sfx.handleEvents([c.ev]);
      expect(ctx.createdOscillators.length).toBe(c.osc * 2);
      expect(ctx.createdBufferSources.length).toBe(c.noise * 2);
    });
  }
});

// ---------------------------------------------------------------------------
// The `corruption` dispatch case (lines 412-418): benevolent vs. hostile beat.
// ---------------------------------------------------------------------------

describe('Sfx: corruption beat synthesis', () => {
  it('a good (rift) beat is a 3-note triangle arpeggio, no noise', () => {
    const sfx = new Sfx();
    sfx.handleEvents([corruption(true)]);
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(3);
    for (const osc of ctx.createdOscillators) expect(osc.type).toBe('triangle');
    // Rising major-ish figure: G4 D5 G5.
    const freqs = ctx.createdOscillators.map((o) => o.frequency.setValueAtTime.mock.calls[0][0]);
    expect(freqs[0]).toBeCloseTo(392);
    expect(freqs[2]).toBeCloseTo(784);
    expect(ctx.createdBufferSources.length).toBe(0);
  });

  it('a hostile beat swells two detuned saws plus a band-pass noise rumble', () => {
    const sfx = new Sfx();
    sfx.handleEvents([corruption(false)]);
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(2);
    for (const osc of ctx.createdOscillators) expect(osc.type).toBe('sawtooth');
    // Second saw beats against the first via a +24 cent detune.
    expect(ctx.createdOscillators[0].detune.setValueAtTime).not.toHaveBeenCalled();
    expect(ctx.createdOscillators[1].detune.setValueAtTime.mock.calls[0][0]).toBeCloseTo(24);
    // A bandpass noise rumble underneath (600->400? sweeping up to 1400Hz).
    expect(ctx.createdBufferSources.length).toBe(1);
    expect(ctx.createdFilters.length).toBe(1);
    const filter = ctx.createdFilters[0];
    expect(filter.type).toBe('bandpass');
    expect(filter.frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(400);
    expect(filter.frequency.linearRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(1400);
  });

  it('an undefined `good` flag is treated as a hostile beat', () => {
    const sfx = new Sfx();
    sfx.handleEvents([corruption(undefined)]);
    const ctx = currentCtx();
    // Falls into the else arm (saws + noise), not the arpeggio.
    expect(ctx.createdOscillators.length).toBe(2);
    expect(ctx.createdBufferSources.length).toBe(1);
  });

  it('a deadline warning is a low ominous saw swell plus a band-pass rumble (item 24)', () => {
    const sfx = new Sfx();
    sfx.handleEvents([{ t: 'deadlineWarn', pos: { x: 0, y: 0 }, text: '15s' }]);
    const ctx = currentCtx();
    // A single low saw voice (55->110Hz) with a bandpass noise rumble underneath.
    expect(ctx.createdOscillators.length).toBe(1);
    expect(ctx.createdOscillators[0].type).toBe('sawtooth');
    expect(ctx.createdOscillators[0].frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(55);
    expect(ctx.createdBufferSources.length).toBe(1);
    expect(ctx.createdFilters[0].type).toBe('bandpass');
  });
});

// ---------------------------------------------------------------------------
// handleEvents / play entry guards (lines 142, 153) — each disjunct arm.
// ---------------------------------------------------------------------------

describe('Sfx: entry guards short-circuit before building a context', () => {
  it('handleEvents ignores a null batch (the `!events` arm)', () => {
    const sfx = new Sfx();
    expect(() => sfx.handleEvents(null as unknown as GameEvent[])).not.toThrow();
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('handleEvents ignores an empty batch (the `length === 0` arm)', () => {
    const sfx = new Sfx();
    sfx.handleEvents([]);
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('handleEvents is a no-op while muted (the silent() arm)', () => {
    const sfx = new Sfx();
    sfx.setMuted(true);
    sfx.handleEvents([hit('boss'), cast('player')]);
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('handleEvents is a no-op at zero volume (the volume <= 0 arm)', () => {
    const sfx = new Sfx();
    sfx.setVolume(0);
    sfx.handleEvents([hit('boss')]);
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('handleEvents is a no-op after dispose (the disposed arm)', () => {
    const sfx = new Sfx();
    sfx.dispose();
    sfx.handleEvents([hit('boss')]);
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('an unmapped event kind falls through the dispatch default (no voice)', () => {
    const sfx = new Sfx();
    expect(() => sfx.handleEvents([{ t: 'stunResist', id: 1, pos: P }])).not.toThrow();
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(0);
    expect(ctx.createdBufferSources.length).toBe(0);
  });

  it('play is a no-op while muted', () => {
    const sfx = new Sfx();
    sfx.setMuted(true);
    sfx.play('victory');
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('play is a no-op at zero volume', () => {
    const sfx = new Sfx();
    sfx.setVolume(0);
    sfx.play('uiClick');
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('play is a no-op after dispose', () => {
    const sfx = new Sfx();
    sfx.dispose();
    sfx.play('uiClick');
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('play ignores an unknown sound name (switch default arm)', () => {
    const sfx = new Sfx();
    (sfx as unknown as { play(name: string): void }).play('nope');
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// play() stings — both arpeggios + both single/twin voices (voice opt arms).
// ---------------------------------------------------------------------------

describe('Sfx: play() stings exercise the voice option arms', () => {
  it('uiClick: one sine voice, default attack, no freq glide (freqEnd absent)', () => {
    const sfx = new Sfx();
    sfx.play('uiClick');
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(1);
    const osc = ctx.createdOscillators[0];
    expect(osc.type).toBe('sine');
    // No freqEnd -> the exponential frequency ramp is never scheduled.
    expect(osc.frequency.exponentialRampToValueAtTime).not.toHaveBeenCalled();
    // No detune option -> detune param untouched.
    expect(osc.detune.setValueAtTime).not.toHaveBeenCalled();
  });

  it('uiConfirm: second blip carries a `when` start offset', () => {
    const sfx = new Sfx();
    sfx.play('uiConfirm');
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(2);
    expect(ctx.createdOscillators[0].start.mock.calls[0][0]).toBeCloseTo(0);
    expect(ctx.createdOscillators[1].start.mock.calls[0][0]).toBeCloseTo(0.06);
  });

  it('victory: 4 rising triangle notes', () => {
    const sfx = new Sfx();
    sfx.play('victory');
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(4);
    for (const osc of ctx.createdOscillators) expect(osc.type).toBe('triangle');
  });

  it('defeat: 4 descending sine notes', () => {
    const sfx = new Sfx();
    sfx.play('defeat');
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(4);
    for (const osc of ctx.createdOscillators) expect(osc.type).toBe('sine');
  });
});

// ---------------------------------------------------------------------------
// Voice / noise concurrency caps (lines 462, 510).
// ---------------------------------------------------------------------------

describe('Sfx: concurrency caps', () => {
  it('caps oscillator voices at MAX_VOICES (12)', () => {
    const sfx = new Sfx();
    // 4 victory stings request 16 voices; onended never fires -> cap holds at 12.
    sfx.play('victory');
    sfx.play('victory');
    sfx.play('victory');
    sfx.play('victory');
    expect(currentCtx().createdOscillators.length).toBe(12);
  });

  it('a noise voice is dropped once the voice cap is already reached (line 510)', () => {
    const sfx = new Sfx();
    // Fill all 12 slots with oscillator voices first.
    sfx.play('victory');
    sfx.play('victory');
    sfx.play('victory');
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(12);
    // Now a dodge would want a noise voice, but the cap is full -> no source.
    sfx.handleEvents([dodge()]);
    expect(ctx.createdBufferSources.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Noise buffer: build-once then serve from cache (line 603), and failure arm.
// ---------------------------------------------------------------------------

describe('Sfx: noise buffer caching', () => {
  it('synthesizes the white-noise buffer once and reuses it (cache hit, line 603)', () => {
    const sfx = new Sfx();
    sfx.handleEvents([dodge()]);
    const ctx = currentCtx();
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    expect(ctx.createdBufferSources.length).toBe(1);

    // A later dodge (past the throttle window) reuses the cached buffer.
    ctx.currentTime = 1;
    sfx.handleEvents([dodge()]);
    expect(ctx.createdBufferSources.length).toBe(2);
    // Still built exactly once — the second voice hit the cached-return arm.
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    expect(ctx.createdBufferSources[1].buffer).toBe(ctx.createdBuffers[0]);
  });

  it('degrades a noise voice (no source, no throw) when buffer synthesis fails', () => {
    const sfx = new Sfx();
    sfx.resume();
    const ctx = currentCtx();
    ctx.createBuffer = vi.fn<(channels: number, length: number, rate: number) => FakeAudioBuffer>(
      () => {
        throw new Error('buffer allocation failed');
      },
    );
    expect(() => sfx.handleEvents([dodge()])).not.toThrow();
    expect(ctx.createdBufferSources.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Volume / mute / targetGain / silent ternaries.
// ---------------------------------------------------------------------------

describe('Sfx: volume + mute value arms', () => {
  it('clamps volume below 0, above 1, and stores in-range values', () => {
    const sfx = new Sfx();
    sfx.setVolume(-0.5);
    expect(sfx.volume).toBe(0);
    sfx.setVolume(2);
    expect(sfx.volume).toBe(1);
    sfx.setVolume(0.35);
    expect(sfx.volume).toBeCloseTo(0.35);
  });

  it('targetGain is 0 when muted (mute arm), even at full volume', () => {
    const sfx = new Sfx();
    sfx.setMuted(true);
    sfx.resume();
    // ensureCtx seeds the master gain from targetGain() -> 0 while muted.
    expect(masterGain(currentCtx()).gain.value).toBeCloseTo(0);
  });

  it('targetGain is 0 at zero volume (volume <= 0 arm)', () => {
    const sfx = new Sfx();
    sfx.setVolume(0);
    // silent() short-circuits play/handleEvents, so drive the master seed via
    // a fresh context created by an explicitly non-silent then re-zeroed path.
    // Directly assert the guard by seeding a context while volume is 0:
    // resume() still builds the context and seeds master gain from targetGain().
    sfx.resume();
    expect(masterGain(currentCtx()).gain.value).toBeCloseTo(0);
  });

  it('targetGain scales volume by the master headroom when audible (normal arm)', () => {
    const sfx = new Sfx();
    sfx.setVolume(0.5);
    sfx.resume();
    // 0.5 * MASTER_VOLUME(0.8) = 0.4
    expect(masterGain(currentCtx()).gain.value).toBeCloseTo(0.4);
  });

  it('setVolume before any context is pure storage (applyGain no-op arm)', () => {
    const sfx = new Sfx();
    expect(() => sfx.setVolume(0.3)).not.toThrow();
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('setVolume after resume ramps the live master gain (applyGain active arm)', () => {
    const sfx = new Sfx();
    sfx.resume();
    const master = masterGain(currentCtx());
    sfx.setVolume(0.25);
    expect(master.gain.cancelScheduledValues).toHaveBeenCalled();
    const ramps = master.gain.linearRampToValueAtTime.mock.calls;
    expect(ramps[ramps.length - 1][0]).toBeCloseTo(0.2); // 0.25 * 0.8
  });

  it('setMuted after resume ramps master gain to 0 then back up on unmute', () => {
    const sfx = new Sfx();
    sfx.resume();
    const master = masterGain(currentCtx());
    sfx.setMuted(true);
    expect(sfx.muted).toBe(true); // exercises the muted getter
    let ramps = master.gain.linearRampToValueAtTime.mock.calls;
    expect(ramps[ramps.length - 1][0]).toBeCloseTo(0);
    sfx.setMuted(false);
    expect(sfx.muted).toBe(false);
    ramps = master.gain.linearRampToValueAtTime.mock.calls;
    expect(ramps[ramps.length - 1][0]).toBeCloseTo(0.8);
  });

  it('setVolume/setMuted after dispose are safe no-ops (applyGain disposed guard, line 127)', () => {
    const sfx = new Sfx();
    sfx.resume();
    sfx.dispose();
    // applyGain() bails on `this.disposed` before touching the (now-null) master.
    expect(() => {
      sfx.setVolume(0.5);
      sfx.setMuted(true);
    }).not.toThrow();
    expect(sfx.volume).toBeCloseTo(0.5); // value still stored
    expect(sfx.muted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resume() + ensureCtx() branches (lines 84, 577, 583) and dispose (line 185).
// ---------------------------------------------------------------------------

describe('Sfx: context lifecycle branches', () => {
  it('resumes a suspended context but not a running one', () => {
    const sfx = new Sfx();
    sfx.resume();
    const ctx = currentCtx();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    ctx.state = 'running';
    sfx.resume();
    expect(ctx.resume).toHaveBeenCalledTimes(1); // running -> no second resume
  });

  it('reuses the single lazily-built context across resume() calls', () => {
    const sfx = new Sfx();
    sfx.resume();
    sfx.resume();
    expect(FakeAudioContext.instances.length).toBe(1);
  });

  it('falls back to webkitAudioContext when AudioContext is absent', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', FakeAudioContext);
    const sfx = new Sfx();
    sfx.resume();
    expect(FakeAudioContext.instances.length).toBe(1);
  });

  it('degrades silently when neither constructor exists (no-Ctor arm, line 583)', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const sfx = new Sfx();
    expect(() => {
      sfx.resume();
      sfx.play('uiClick');
      sfx.handleEvents([cast('player')]);
    }).not.toThrow();
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('degrades silently when `window` is undefined (no-window arm, line 577)', () => {
    vi.stubGlobal('window', undefined);
    const sfx = new Sfx();
    expect(() => {
      sfx.resume();
      sfx.play('uiClick');
      sfx.handleEvents([hit('boss')]);
    }).not.toThrow();
    // typeof window === 'undefined' short-circuits ensureCtx -> nothing built.
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('never throws when the AudioContext constructor blows up (ensureCtx catch, lines 595-597)', () => {
    vi.stubGlobal('AudioContext', ThrowingAudioContext);
    const sfx = new Sfx();
    expect(() => {
      sfx.resume();
      sfx.play('victory');
      sfx.handleEvents([hit('boss')]);
    }).not.toThrow();
    // The throwing ctor was attempted and swallowed; no usable context exists.
    expect(ThrowingAudioContext.attempts).toBeGreaterThan(0);
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('resume() is a safe no-op after dispose (disposed guard on resume)', () => {
    const sfx = new Sfx();
    sfx.dispose();
    expect(() => sfx.resume()).not.toThrow();
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('dispose() without a context skips close() (null-ctx arm, line 185) and is idempotent', () => {
    const sfx = new Sfx();
    // Never resumed -> this.ctx is null -> the `if (this.ctx)` arm is skipped.
    expect(() => {
      sfx.dispose();
      sfx.dispose();
    }).not.toThrow();
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('dispose() with a context closes it exactly once', () => {
    const sfx = new Sfx();
    sfx.resume();
    const ctx = currentCtx();
    sfx.dispose();
    sfx.dispose();
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Synthesis detail arms: freqEnd present, detune present, voice cleanup + catch.
// ---------------------------------------------------------------------------

describe('Sfx: synthesis + cleanup arms', () => {
  it('a cast glides frequency via an exponential ramp (freqEnd-present arm)', () => {
    const sfx = new Sfx();
    sfx.handleEvents([cast('player')]);
    const osc = currentCtx().createdOscillators[0];
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalled();
    // 660 * 1.12 = 739.2
    expect(osc.frequency.exponentialRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(739.2);
  });

  it('a boss cast uses the lower start frequency (side !== player arm)', () => {
    const sfx = new Sfx();
    sfx.handleEvents([cast('boss')]);
    const osc = currentCtx().createdOscillators[0];
    expect(osc.frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(220);
  });

  it('a heal detunes only its second partial (detune-present arm)', () => {
    const sfx = new Sfx();
    sfx.handleEvents([heal()]);
    const ctx = currentCtx();
    expect(ctx.createdOscillators[0].detune.setValueAtTime).not.toHaveBeenCalled();
    expect(ctx.createdOscillators[1].detune.setValueAtTime.mock.calls[0][0]).toBeCloseTo(6);
  });

  it('a dodge sweeps a bandpass filter (filterFreqEnd-present arm)', () => {
    const sfx = new Sfx();
    sfx.handleEvents([dodge()]);
    const filter = currentCtx().createdFilters[0];
    expect(filter.type).toBe('bandpass');
    expect(filter.frequency.linearRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(2200);
  });

  it('an oscillator voice disconnects its nodes when it ends', () => {
    const sfx = new Sfx();
    sfx.play('uiClick');
    const ctx = currentCtx();
    const osc = ctx.createdOscillators[0];
    const voiceGain = ctx.createdGains[1];
    expect(osc.onended).toBeTypeOf('function');
    osc.onended?.();
    expect(osc.disconnect).toHaveBeenCalledTimes(1);
    expect(voiceGain.disconnect).toHaveBeenCalledTimes(1);
  });

  it('an oscillator voice cleanup swallows a disconnect error (try/catch arm)', () => {
    const sfx = new Sfx();
    sfx.play('uiClick');
    const ctx = currentCtx();
    const osc = ctx.createdOscillators[0];
    const voiceGain = ctx.createdGains[1];
    voiceGain.disconnect = vi.fn<() => void>(() => {
      throw new Error('already disconnected');
    });
    expect(() => osc.onended?.()).not.toThrow();
  });

  it('a noise voice disconnects source, filter and gain when it ends', () => {
    const sfx = new Sfx();
    sfx.handleEvents([dodge()]);
    const ctx = currentCtx();
    const src = ctx.createdBufferSources[0];
    const filter = ctx.createdFilters[0];
    const noiseGain = ctx.createdGains[1];
    expect(src.onended).toBeTypeOf('function');
    src.onended?.();
    expect(src.disconnect).toHaveBeenCalledTimes(1);
    expect(filter.disconnect).toHaveBeenCalledTimes(1);
    expect(noiseGain.disconnect).toHaveBeenCalledTimes(1);
  });

  it('a noise voice cleanup swallows a disconnect error (try/catch arm)', () => {
    const sfx = new Sfx();
    sfx.handleEvents([dodge()]);
    const ctx = currentCtx();
    const src = ctx.createdBufferSources[0];
    const noiseGain = ctx.createdGains[1];
    noiseGain.disconnect = vi.fn<() => void>(() => {
      throw new Error('already disconnected');
    });
    expect(() => src.onended?.()).not.toThrow();
  });

  it('ending a voice frees a slot so a new voice fits past the cap', () => {
    const sfx = new Sfx();
    sfx.play('victory'); // 4
    sfx.play('victory'); // 8
    sfx.play('victory'); // 12 (cap)
    const ctx = currentCtx();
    sfx.play('uiClick'); // capped -> nothing new
    expect(ctx.createdOscillators.length).toBe(12);
    for (let i = 0; i < 4; i++) ctx.createdOscillators[i].onended?.();
    sfx.play('uiClick');
    expect(ctx.createdOscillators.length).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// deadlineWarn throttle guard — the FALSE arm (line 450). This event is NOT in
// the parametric throttle sweep above, so its de-dupe branch needs its own case.
// ---------------------------------------------------------------------------

describe('Sfx: deadlineWarn throttle', () => {
  const warn = (): GameEvent => ({ t: 'deadlineWarn', pos: P, text: '15s' });

  it('a repeated deadlineWarn at the same instant collapses to one voice set (line 450 false arm)', () => {
    const sfx = new Sfx();
    // Two warnings in the same batch land at currentTime 0 -> the 2nd is throttled.
    sfx.handleEvents([warn(), warn()]);
    const ctx = currentCtx();
    // One low saw voice + one bandpass noise rumble; the throttled copy adds nothing.
    expect(ctx.createdOscillators.length).toBe(1);
    expect(ctx.createdBufferSources.length).toBe(1);
  });

  it('plays again once the 0.1s throttle window elapses', () => {
    const sfx = new Sfx();
    sfx.handleEvents([warn()]);
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(1);
    ctx.currentTime = 1; // well past the 0.1s window
    sfx.handleEvents([warn()]);
    expect(ctx.createdOscillators.length).toBe(2);
    expect(ctx.createdBufferSources.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Defensive context guards inside the synthesis primitives. Through the public
// API these are only ever reached AFTER ensureCtx() has produced a live context,
// so the "no context" arms are unreachable that way. We prove them the same way
// the char-upgrade suite proves its `?? default` guards: by driving the private
// method directly against a context-less instance. (Lines 483, 531, 595, 627, 649.)
// ---------------------------------------------------------------------------

interface SfxInternals {
  voice(o: unknown): void;
  noiseVoice(o: unknown): void;
  ensureCtx(): unknown;
  ensureNoiseBuffer(): unknown;
  throttle(key: string, minGap: number): boolean;
}
const internals = (sfx: Sfx): SfxInternals => sfx as unknown as SfxInternals;

describe('Sfx: context-less primitive guards', () => {
  it('voice() bails when no context has been built yet (line 483)', () => {
    const sfx = new Sfx(); // never resumed -> this.ctx / this.master are null
    expect(() =>
      internals(sfx).voice({ type: 'sine', freq: 440, dur: 0.04, peak: 0.08 }),
    ).not.toThrow();
    expect(FakeAudioContext.instances.length).toBe(0); // nothing was scheduled
  });

  it('noiseVoice() bails when no context has been built yet (line 531)', () => {
    const sfx = new Sfx();
    expect(() =>
      internals(sfx).noiseVoice({ dur: 0.06, peak: 0.14, filterType: 'lowpass', filterFreq: 900 }),
    ).not.toThrow();
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('ensureCtx() returns null after dispose without building a context (line 595)', () => {
    const sfx = new Sfx();
    sfx.dispose();
    expect(internals(sfx).ensureCtx()).toBeNull();
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('ensureNoiseBuffer() returns null with no context (line 627)', () => {
    const sfx = new Sfx();
    expect(internals(sfx).ensureNoiseBuffer()).toBeNull();
  });

  it('throttle() returns false (no play) with no context yet (line 649)', () => {
    const sfx = new Sfx();
    expect(internals(sfx).throttle('anything', 0.1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Swallowed promise rejections: resume() and close() return promises whose
// rejections are caught and dropped so nothing bubbles into the game loop. The
// happy-path fakes always resolve, so the `.catch(() => undefined)` handlers
// (anonymous_3 @ line 86, anonymous_18 @ line 187) only run when the promise
// actually rejects.
// ---------------------------------------------------------------------------

const flushMicrotasks = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('Sfx: swallowed async rejections', () => {
  it('drops a rejected resume() promise (anonymous_3, line 86)', async () => {
    const sfx = new Sfx();
    sfx.resume(); // builds the (suspended) context and resolves the first resume()
    const ctx = currentCtx();
    ctx.state = 'suspended'; // re-arm the suspended branch
    ctx.resume = vi.fn<() => Promise<void>>(() => Promise.reject(new Error('autoplay blocked')));
    expect(() => sfx.resume()).not.toThrow(); // rejection is swallowed, not thrown
    expect(ctx.resume).toHaveBeenCalled();
    await flushMicrotasks(); // let the .catch handler run
  });

  it('drops a rejected close() promise on dispose (anonymous_18, line 187)', async () => {
    const sfx = new Sfx();
    sfx.resume();
    const ctx = currentCtx();
    ctx.close = vi.fn<() => Promise<void>>(() => Promise.reject(new Error('close failed')));
    expect(() => sfx.dispose()).not.toThrow();
    expect(ctx.close).toHaveBeenCalledTimes(1);
    await flushMicrotasks(); // let the .catch handler run
  });
});
