// @vitest-environment jsdom
/**
 * Tests for audio/sfx.ts — the procedural Web Audio sound engine (class Sfx).
 *
 * Web Audio does not exist under jsdom, so the whole `AudioContext` graph is
 * mocked with typed vi.fn() spies and installed via `vi.stubGlobal`. The source
 * reads `window.AudioContext` / `window.webkitAudioContext` lazily (never in the
 * constructor), so `new Sfx()` must touch nothing; the fake is only exercised
 * once resume()/play()/handleEvents() trigger `ensureCtx`.
 *
 * These specs pin: lazy context creation, mute/volume storage + click-free
 * ramps, resume() reuse, per-event synthesis (oscillator/gain/filter/noise
 * graph wiring), the concurrency cap, throttling and total graceful
 * degradation when audio is blocked/unavailable.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Sfx } from '../src/audio/sfx';
import type { GameEvent, Side, Vec2 } from '../src/engine/types';

// ---------------------------------------------------------------------------
// A typed fake Web Audio graph. Only the surface the source actually uses is
// implemented (verified against src/audio/sfx.ts). Every node method is a spy
// so tests can assert on connect/start/stop/param scheduling.
// ---------------------------------------------------------------------------

/** `AudioParam.setValueAtTime` / `*RampToValueAtTime(value, time)`. */
type ParamFn = (value: number, time: number) => void;
/** `AudioParam.cancelScheduledValues(time)`. */
type TimeFn = (time: number) => void;
/** `AudioNode.connect(dest)` — returns the destination so the source can chain. */
type ConnectFn = (dest: unknown) => unknown;
/** `start(when)` / `stop(when)`. */
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
  /** Every context ever constructed this test (asserts laziness + reuse). */
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

/** The (single) context Sfx has lazily created so far, or undefined. */
function currentCtx(): FakeAudioContext {
  expect(FakeAudioContext.instances.length).toBeGreaterThan(0);
  return FakeAudioContext.instances[0];
}

/** Master bus is the first GainNode ensureCtx() creates. */
function masterGain(ctx: FakeAudioContext): FakeGain {
  return ctx.createdGains[0];
}

// ---------------------------------------------------------------------------
// Typed GameEvent factories (avoid inline casts; each returns a real union arm).
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

beforeEach(() => {
  FakeAudioContext.instances = [];
  ThrowingAudioContext.attempts = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe('Sfx: construction is lazy', () => {
  it('does NOT create an AudioContext in the constructor', () => {
    const sfx = new Sfx();
    expect(sfx).toBeInstanceOf(Sfx);
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('starts unmuted at full volume', () => {
    const sfx = new Sfx();
    expect(sfx.muted).toBe(false);
    expect(sfx.volume).toBe(1);
    // Still nothing constructed just by reading the getters.
    expect(FakeAudioContext.instances.length).toBe(0);
  });
});

describe('Sfx: volume + mute storage', () => {
  it('clamps volume into [0, 1] and stores it (before a context exists)', () => {
    const sfx = new Sfx();
    sfx.setVolume(-0.5);
    expect(sfx.volume).toBe(0);
    sfx.setVolume(2);
    expect(sfx.volume).toBe(1);
    sfx.setVolume(0.35);
    expect(sfx.volume).toBeCloseTo(0.35);
    // Pure storage — no audio graph was touched.
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('stores the mute flag without needing a context', () => {
    const sfx = new Sfx();
    sfx.setMuted(true);
    expect(sfx.muted).toBe(true);
    sfx.setMuted(false);
    expect(sfx.muted).toBe(false);
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('applies a pre-context volume lazily to the master gain when the context is created', () => {
    const sfx = new Sfx();
    sfx.setVolume(0.5); // set BEFORE any context
    sfx.resume(); // now the context (and master bus) come into being
    const master = masterGain(currentCtx());
    // targetGain = volume(0.5) * MASTER_VOLUME(0.8) = 0.4
    expect(master.gain.value).toBeCloseTo(0.4);
  });

  it('applies a pre-context mute lazily (master gain starts at 0)', () => {
    const sfx = new Sfx();
    sfx.setMuted(true);
    sfx.resume();
    expect(masterGain(currentCtx()).gain.value).toBeCloseTo(0);
  });

  it('ramps the master gain toward the new volume target once the context exists', () => {
    const sfx = new Sfx();
    sfx.resume();
    const master = masterGain(currentCtx());
    sfx.setVolume(0.25);
    // Click-free application: cancel, anchor, then linear ramp to the target.
    expect(master.gain.cancelScheduledValues).toHaveBeenCalled();
    expect(master.gain.setValueAtTime).toHaveBeenCalled();
    const ramps = master.gain.linearRampToValueAtTime.mock.calls;
    // 0.25 * 0.8 = 0.2
    expect(ramps[ramps.length - 1][0]).toBeCloseTo(0.2);
  });

  it('ramps the master gain to 0 on mute and back up on unmute', () => {
    const sfx = new Sfx();
    sfx.resume();
    const master = masterGain(currentCtx());

    sfx.setMuted(true);
    let ramps = master.gain.linearRampToValueAtTime.mock.calls;
    expect(ramps[ramps.length - 1][0]).toBeCloseTo(0);

    sfx.setMuted(false);
    ramps = master.gain.linearRampToValueAtTime.mock.calls;
    // Back to volume(1) * 0.8 = 0.8
    expect(ramps[ramps.length - 1][0]).toBeCloseTo(0.8);
  });

  it('does not throw when volume/mute are set before any context', () => {
    const sfx = new Sfx();
    expect(() => {
      sfx.setVolume(0.3);
      sfx.setMuted(true);
    }).not.toThrow();
  });
});

describe('Sfx: resume + lazy context lifecycle', () => {
  it('creates the context, wires the master bus and resumes a suspended context', () => {
    const sfx = new Sfx();
    sfx.resume();
    const ctx = currentCtx();
    const master = masterGain(ctx);

    expect(ctx.createGain).toHaveBeenCalledTimes(1); // just the master bus
    expect(master.connect).toHaveBeenCalledTimes(1); // master -> destination
    expect(master.gain.value).toBeCloseTo(0.8); // full volume * headroom
    expect(ctx.resume).toHaveBeenCalledTimes(1); // suspended -> resume()
  });

  it('reuses the same context across repeated resume() calls (constructed once)', () => {
    const sfx = new Sfx();
    sfx.resume();
    sfx.resume();
    sfx.resume();
    expect(FakeAudioContext.instances.length).toBe(1);
  });

  it('does not call resume() again once the context is running', () => {
    const sfx = new Sfx();
    sfx.resume();
    const ctx = currentCtx();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    ctx.state = 'running';
    sfx.resume();
    // Already running — no second resume(), and no new context.
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.instances.length).toBe(1);
  });

  it('falls back to webkitAudioContext when AudioContext is absent', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', FakeAudioContext);
    const sfx = new Sfx();
    sfx.resume();
    expect(FakeAudioContext.instances.length).toBe(1);
  });
});

describe('Sfx: play() UI stings', () => {
  it('uiClick schedules a single sine voice wired into the master bus', () => {
    const sfx = new Sfx();
    sfx.play('uiClick');
    const ctx = currentCtx();

    expect(ctx.createdOscillators.length).toBe(1);
    const osc = ctx.createdOscillators[0];
    expect(osc.type).toBe('sine');
    expect(osc.frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(440);
    expect(osc.connect).toHaveBeenCalled();
    expect(osc.start).toHaveBeenCalledTimes(1);
    expect(osc.stop).toHaveBeenCalledTimes(1);

    // The voice gain (created after the master) applies an ADSR envelope and
    // connects onward to the master bus.
    const voiceGain = ctx.createdGains[1];
    expect(voiceGain.gain.exponentialRampToValueAtTime).toHaveBeenCalled();
    expect(voiceGain.connect).toHaveBeenCalled();
  });

  it('uiConfirm schedules two ascending blips (second delayed)', () => {
    const sfx = new Sfx();
    sfx.play('uiConfirm');
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(2);
    const [a, b] = ctx.createdOscillators;
    expect(a.frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(660);
    expect(b.frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(880);
    // Second blip starts 0.06s after the first (when offset).
    expect(a.start.mock.calls[0][0]).toBeCloseTo(0);
    expect(b.start.mock.calls[0][0]).toBeCloseTo(0.06);
  });

  it('victory plays a 4-note triangle arpeggio at rising start times', () => {
    const sfx = new Sfx();
    sfx.play('victory');
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(4);
    for (const osc of ctx.createdOscillators) expect(osc.type).toBe('triangle');

    const freqs = ctx.createdOscillators.map((o) => o.frequency.setValueAtTime.mock.calls[0][0]);
    expect(freqs[0]).toBeCloseTo(523.25);
    expect(freqs[3]).toBeCloseTo(1046.5);

    const starts = ctx.createdOscillators.map((o) => o.start.mock.calls[0][0]);
    expect(starts[0]).toBeCloseTo(0);
    expect(starts[1]).toBeCloseTo(0.09);
    expect(starts[2]).toBeCloseTo(0.18);
    expect(starts[3]).toBeCloseTo(0.27);
  });

  it('defeat plays a 4-note sine arpeggio', () => {
    const sfx = new Sfx();
    sfx.play('defeat');
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(4);
    for (const osc of ctx.createdOscillators) expect(osc.type).toBe('sine');
  });

  it('is a silent no-op (and never throws) while muted', () => {
    const sfx = new Sfx();
    sfx.setMuted(true);
    expect(() => sfx.play('victory')).not.toThrow();
    // Muted short-circuits before any context is even created.
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('is a silent no-op at zero volume', () => {
    const sfx = new Sfx();
    sfx.setVolume(0);
    sfx.play('uiClick');
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('handles an unknown sound name gracefully (no throw, no voice)', () => {
    const sfx = new Sfx();
    // Force an out-of-union name to exercise the switch's default arm.
    (sfx as unknown as { play(name: string): void }).play('does-not-exist');
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(0);
  });

  it('caps concurrent voices at MAX_VOICES (12)', () => {
    const sfx = new Sfx();
    // Each victory sting is 4 voices; onended never fires under the fake, so
    // activeVoices only grows. Four stings request 16 voices but the cap holds.
    sfx.play('victory');
    sfx.play('victory');
    sfx.play('victory');
    sfx.play('victory');
    expect(currentCtx().createdOscillators.length).toBe(12);
  });
});

describe('Sfx: handleEvents() — event → sound dispatch', () => {
  interface DispatchCase {
    name: string;
    ev: GameEvent;
    osc: number;
    noise: number;
  }

  const cases: DispatchCase[] = [
    { name: 'cast (player)', ev: cast('player'), osc: 1, noise: 0 },
    { name: 'cast (boss)', ev: cast('boss'), osc: 1, noise: 0 },
    { name: 'hit (boss)', ev: hit('boss'), osc: 1, noise: 1 },
    { name: 'hit (player)', ev: hit('player'), osc: 1, noise: 0 },
    { name: 'heal', ev: heal(), osc: 2, noise: 0 },
    { name: 'death (boss)', ev: death('boss'), osc: 1, noise: 1 },
    { name: 'death (add)', ev: death('add'), osc: 1, noise: 0 },
    { name: 'death (player)', ev: death('player'), osc: 1, noise: 0 },
    { name: 'downed', ev: { t: 'downed', id: 1, pos: P }, osc: 2, noise: 0 },
    { name: 'revive', ev: { t: 'revive', id: 1, pos: P }, osc: 3, noise: 0 },
    { name: 'dodge', ev: dodge(), osc: 0, noise: 1 },
    { name: 'blink', ev: { t: 'blink', id: 1, from: P, to: P }, osc: 1, noise: 0 },
    { name: 'enrage', ev: { t: 'enrage', id: 1, pos: P }, osc: 2, noise: 0 },
    { name: 'telegraph', ev: { t: 'telegraph', pos: P, shape: 'circle' }, osc: 1, noise: 0 },
    { name: 'projectile', ev: { t: 'projectile', kind: 'arrow', pos: P }, osc: 1, noise: 0 },
    { name: 'spawn', ev: { t: 'spawn', id: 1, kind: 'add', pos: P }, osc: 1, noise: 0 },
  ];

  for (const c of cases) {
    it(`${c.name} -> ${c.osc} oscillator(s) + ${c.noise} noise voice(s)`, () => {
      const sfx = new Sfx();
      expect(() => sfx.handleEvents([c.ev])).not.toThrow();
      const ctx = currentCtx();
      expect(ctx.createdOscillators.length).toBe(c.osc);
      expect(ctx.createdBufferSources.length).toBe(c.noise);
    });
  }

  it('ignores unmapped events (no voices, no throw)', () => {
    const sfx = new Sfx();
    // stunResist has no case in the dispatch switch -> default arm.
    expect(() => sfx.handleEvents([{ t: 'stunResist', id: 1, pos: P }])).not.toThrow();
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(0);
    expect(ctx.createdBufferSources.length).toBe(0);
  });

  it('does nothing (no context) for an empty event batch', () => {
    const sfx = new Sfx();
    sfx.handleEvents([]);
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('does nothing (no context) while muted', () => {
    const sfx = new Sfx();
    sfx.setMuted(true);
    sfx.handleEvents([hit('boss'), cast('player')]);
    expect(FakeAudioContext.instances.length).toBe(0);
  });
});

describe('Sfx: synthesis details', () => {
  it('a player cast glides its frequency upward (exponential ramp)', () => {
    const sfx = new Sfx();
    sfx.handleEvents([cast('player')]);
    const osc = currentCtx().createdOscillators[0];
    expect(osc.type).toBe('triangle');
    expect(osc.frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(660);
    // freqEnd = 660 * 1.12 = 739.2
    const ramp = osc.frequency.exponentialRampToValueAtTime.mock.calls[0];
    expect(ramp[0]).toBeCloseTo(739.2);
  });

  it('a boss hit adds a low-pass filtered noise crack built from a noise buffer', () => {
    const sfx = new Sfx();
    sfx.handleEvents([hit('boss')]);
    const ctx = currentCtx();
    expect(ctx.createdBufferSources.length).toBe(1);
    expect(ctx.createdFilters.length).toBe(1);
    expect(ctx.createdFilters[0].type).toBe('lowpass');
    // A 1s white-noise buffer is synthesized on demand and cached.
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    expect(ctx.createdBuffers[0].getChannelData).toHaveBeenCalled();
    const src = ctx.createdBufferSources[0];
    expect(src.buffer).toBe(ctx.createdBuffers[0]);
    expect(src.start).toHaveBeenCalledTimes(1);
    expect(src.stop).toHaveBeenCalledTimes(1);
  });

  it('a dodge sweeps a band-pass filter from 600Hz up to 2200Hz', () => {
    const sfx = new Sfx();
    sfx.handleEvents([dodge()]);
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(0);
    const filter = ctx.createdFilters[0];
    expect(filter.type).toBe('bandpass');
    expect(filter.frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(600);
    expect(filter.frequency.linearRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(2200);
  });

  it('a heal detunes its second partial', () => {
    const sfx = new Sfx();
    sfx.handleEvents([heal()]);
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(2);
    // First partial has no detune; second is detuned +6 cents.
    expect(ctx.createdOscillators[0].detune.setValueAtTime).not.toHaveBeenCalled();
    expect(ctx.createdOscillators[1].detune.setValueAtTime.mock.calls[0][0]).toBeCloseTo(6);
  });

  it('throttles identical rapid events, then plays again once the gap elapses', () => {
    const sfx = new Sfx();
    sfx.handleEvents([cast('player')]);
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(1);

    // Same key, same instant -> collapsed by the de-dupe window.
    sfx.handleEvents([cast('player')]);
    expect(ctx.createdOscillators.length).toBe(1);

    // Advance the clock well past the throttle window -> it plays again.
    ctx.currentTime = 1;
    sfx.handleEvents([cast('player')]);
    expect(ctx.createdOscillators.length).toBe(2);
  });
});

describe('Sfx: voice lifecycle + cleanup', () => {
  it('an oscillator voice disconnects its nodes when it ends', () => {
    const sfx = new Sfx();
    sfx.play('uiClick');
    const ctx = currentCtx();
    const osc = ctx.createdOscillators[0];
    const voiceGain = ctx.createdGains[1]; // [0] is the master bus

    expect(osc.onended).toBeTypeOf('function');
    osc.onended?.(); // simulate the scheduled voice finishing
    expect(osc.disconnect).toHaveBeenCalledTimes(1);
    expect(voiceGain.disconnect).toHaveBeenCalledTimes(1);
  });

  it('a noise voice disconnects its buffer source, filter and gain when it ends', () => {
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

  it('frees a slot when a voice ends, letting a new voice schedule past the cap', () => {
    const sfx = new Sfx();
    sfx.play('victory'); // 4 voices
    sfx.play('victory'); // 8
    sfx.play('victory'); // 12 -> cap reached
    const ctx = currentCtx();
    expect(ctx.createdOscillators.length).toBe(12);

    sfx.play('uiClick'); // capped -> nothing new
    expect(ctx.createdOscillators.length).toBe(12);

    // End four voices to release their slots, then a new voice fits again.
    for (let i = 0; i < 4; i++) ctx.createdOscillators[i].onended?.();
    sfx.play('uiClick');
    expect(ctx.createdOscillators.length).toBe(13);
  });

  it('degrades a noise voice (no throw, no source) when noise-buffer synthesis fails', () => {
    const sfx = new Sfx();
    sfx.resume();
    const ctx = currentCtx();
    ctx.createBuffer = vi.fn<(channels: number, length: number, rate: number) => FakeAudioBuffer>(
      () => {
        throw new Error('buffer allocation failed');
      },
    );
    expect(() => sfx.handleEvents([dodge()])).not.toThrow();
    // ensureNoiseBuffer() swallowed the failure and returned null.
    expect(ctx.createdBufferSources.length).toBe(0);
  });
});

describe('Sfx: graceful degradation', () => {
  it('never throws (and creates nothing) when no AudioContext exists at all', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const sfx = new Sfx();
    expect(() => {
      sfx.resume();
      sfx.play('uiClick');
      sfx.handleEvents([cast('player'), hit('boss')]);
      sfx.setVolume(0.5);
      sfx.setMuted(true);
    }).not.toThrow();
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('never throws when constructing the AudioContext fails', () => {
    vi.stubGlobal('AudioContext', ThrowingAudioContext);
    const sfx = new Sfx();
    expect(() => {
      sfx.resume();
      sfx.play('victory');
      sfx.handleEvents([hit('boss')]);
    }).not.toThrow();
    expect(ThrowingAudioContext.attempts).toBeGreaterThan(0);
    // Construction blew up -> no usable context was ever established.
    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('dispose() closes the context, is idempotent, and no-ops afterward', () => {
    const sfx = new Sfx();
    sfx.resume();
    const ctx = currentCtx();

    sfx.dispose();
    sfx.dispose(); // idempotent
    expect(ctx.close).toHaveBeenCalledTimes(1);

    expect(() => {
      sfx.resume();
      sfx.play('uiClick');
      sfx.handleEvents([cast('player')]);
      sfx.setVolume(0.5);
      sfx.setMuted(true);
    }).not.toThrow();

    // No new context and no new voices after disposal.
    expect(FakeAudioContext.instances.length).toBe(1);
    expect(ctx.createdOscillators.length).toBe(0);
  });
});
