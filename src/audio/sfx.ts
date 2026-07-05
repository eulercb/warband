/**
 * Warband — synthesized sound effects (Web Audio API, no audio files).
 *
 * Everything here is generated on the fly from OscillatorNodes / noise buffers
 * with short ADSR envelopes routed through a single master GainNode that can be
 * muted (gain 0) or unmuted. The whole surface is defensive: if the browser
 * blocks or lacks an AudioContext (autoplay policy, privacy mode, old engine,
 * server-side render), every method degrades silently and NEVER throws.
 *
 * The AudioContext is created lazily — NOT in the constructor — because most
 * browsers refuse to start audio until a user gesture. Call `resume()` from a
 * click handler to create/resume it.
 */

import type { GameEvent } from '../engine/types';

/** Constructor for the standard or webkit-prefixed AudioContext. */
type AudioCtxCtor = new () => AudioContext;

/** Baseline master volume when unmuted (leaves headroom so stacked voices
 * don't clip). */
const MASTER_VOLUME = 0.8;

/** Hard cap on simultaneously-scheduled voices to avoid clipping / CPU spikes. */
const MAX_VOICES = 12;

/** Tiny non-zero floor for exponential gain ramps (they cannot target 0). */
const EPS = 0.0001;

/** Default de-dupe window: identical sounds within this gap collapse to one. */
const DEFAULT_THROTTLE = 0.012;

/** Options describing a single oscillator "voice". */
interface VoiceOpts {
  type: OscillatorType;
  freq: number;
  /** If set, the frequency glides from `freq` to `freqEnd` over `dur`. */
  freqEnd?: number;
  /** Total duration in seconds (kept < 0.4s per the spec). */
  dur: number;
  /** Peak gain of the envelope. */
  peak: number;
  /** Attack time in seconds (default 5ms). */
  attack?: number;
  /** Constant detune in cents. */
  detune?: number;
  /** Start offset from "now", in seconds (used for arpeggios). */
  when?: number;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private _muted = false;
  /** User volume 0..1 (scaled by MASTER_VOLUME for headroom). 1 = full. */
  private _volume = 1;
  private disposed = false;

  /** Count of voices currently scheduled/playing (for the concurrency cap). */
  private activeVoices = 0;

  /** Last start time (ctx seconds) per throttle key, to collapse duplicates. */
  private lastPlayed = new Map<string, number>();

  /** Per the spec: creating the AudioContext here is deferred. Nothing to do. */
  constructor() {
    /* Intentionally empty — the AudioContext is created lazily in ensureCtx(). */
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Create (if needed) and resume the AudioContext. Safe to call repeatedly;
   * intended to be wired to the first real user gesture (e.g. a click).
   */
  resume(): void {
    if (this.disposed) return;
    this.safe(() => {
      const ctx = this.ensureCtx();
      if (ctx && ctx.state === 'suspended') {
        // resume() returns a promise; swallow rejections so nothing bubbles up.
        void ctx.resume().catch(() => undefined);
      }
    });
  }

  /** Mute (gain 0) or unmute the master bus. Cheap; no context needed to store. */
  setMuted(m: boolean): void {
    this._muted = m;
    this.applyGain();
  }

  /**
   * Set the master volume (0..1). 0 is silence; 1 is full (within MASTER_VOLUME
   * headroom). Independent of the mute flag — a muted bus stays silent until
   * unmuted. Safe to call before the context exists (value is applied lazily).
   */
  setVolume(v: number): void {
    this._volume = v < 0 ? 0 : v > 1 ? 1 : v;
    this.applyGain();
  }

  get muted(): boolean {
    return this._muted;
  }

  get volume(): number {
    return this._volume;
  }

  /** Effective master gain target given mute + volume (0 when silent). */
  private targetGain(): number {
    return this._muted || this._volume <= 0 ? 0 : this._volume * MASTER_VOLUME;
  }

  /** True when nothing would be audible — used to skip scheduling work. */
  private silent(): boolean {
    return this._muted || this._volume <= 0;
  }

  /** Ramp the master bus toward the current mute/volume target (click-free). */
  private applyGain(): void {
    if (this.disposed) return;
    this.safe(() => {
      if (!this.ctx || !this.master) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(this.targetGain(), t + 0.02);
    });
  }

  /**
   * Map a batch of game events to short synthesized sounds. Unknown event
   * kinds are ignored. Never throws.
   */
  handleEvents(events: GameEvent[]): void {
    if (this.disposed || this.silent() || !events || events.length === 0) return;
    // Bail early if we cannot obtain a running context — cheaper than per-event.
    if (!this.ensureCtx()) return;

    for (const ev of events) {
      this.safe(() => this.dispatch(ev));
    }
  }

  /** UI-triggered stings (menus / result screen). Never throws. */
  play(name: 'victory' | 'defeat' | 'uiClick' | 'uiConfirm'): void {
    if (this.disposed || this.silent()) return;
    this.safe(() => {
      if (!this.ensureCtx()) return;
      switch (name) {
        case 'victory':
          // Triumphant major-triad arpeggio: C5 E5 G5 C6.
          this.arpeggio([523.25, 659.25, 783.99, 1046.5], 'triangle', 0.12, 0.18, 0.09);
          break;
        case 'defeat':
          // Somber minor descending: A4 F4 D4 A3.
          this.arpeggio([440, 349.23, 293.66, 220], 'sine', 0.2, 0.16, 0.14);
          break;
        case 'uiClick':
          this.voice({ type: 'sine', freq: 440, dur: 0.04, peak: 0.08 });
          break;
        case 'uiConfirm':
          // Two ascending blips.
          this.voice({ type: 'sine', freq: 660, dur: 0.05, peak: 0.09 });
          this.voice({ type: 'sine', freq: 880, dur: 0.06, peak: 0.09, when: 0.06 });
          break;
        default:
          // Exhaustiveness guard; nothing to play.
          break;
      }
    });
  }

  /** Tear down the AudioContext and release references. Idempotent, never throws. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.safe(() => {
      if (this.ctx) {
        // close() returns a promise; ignore any rejection.
        void this.ctx.close().catch(() => undefined);
      }
    });
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.lastPlayed.clear();
    this.activeVoices = 0;
  }

  // -------------------------------------------------------------------------
  // Event -> sound mapping
  // -------------------------------------------------------------------------

  private dispatch(ev: GameEvent): void {
    switch (ev.t) {
      case 'cast':
        // Soft blip; higher for players, lower for the boss.
        if (this.throttle(`cast:${ev.side}`, DEFAULT_THROTTLE)) {
          const f = ev.side === 'player' ? 660 : 220;
          this.voice({
            type: 'triangle',
            freq: f,
            freqEnd: f * 1.12,
            dur: 0.11,
            peak: 0.11,
            attack: 0.004,
          });
        }
        break;

      case 'hit':
        if (ev.side === 'boss') {
          // A player struck the boss — heftier thud (low square + noise crack).
          if (this.throttle('hit:boss', DEFAULT_THROTTLE)) {
            this.voice({
              type: 'square',
              freq: 120,
              freqEnd: 55,
              dur: 0.14,
              peak: 0.24,
              attack: 0.002,
            });
            this.noiseVoice({ dur: 0.06, peak: 0.14, filterType: 'lowpass', filterFreq: 900 });
          }
        } else {
          // A player took damage — a shorter, sharper "hurt" tone.
          if (this.throttle('hit:player', DEFAULT_THROTTLE)) {
            this.voice({
              type: 'sawtooth',
              freq: 320,
              freqEnd: 180,
              dur: 0.1,
              peak: 0.16,
              attack: 0.002,
            });
          }
        }
        break;

      case 'heal':
        // Gentle rising sine shimmer (two slightly detuned partials).
        if (this.throttle('heal', DEFAULT_THROTTLE)) {
          this.voice({ type: 'sine', freq: 520, freqEnd: 784, dur: 0.3, peak: 0.1, attack: 0.02 });
          this.voice({
            type: 'sine',
            freq: 523,
            freqEnd: 788,
            dur: 0.3,
            peak: 0.05,
            attack: 0.02,
            detune: 6,
          });
        }
        break;

      case 'death':
        if (ev.kind === 'boss') {
          // Big descending boom (< 400ms) with a low noise rumble.
          if (this.throttle('death:boss', DEFAULT_THROTTLE)) {
            this.voice({
              type: 'triangle',
              freq: 180,
              freqEnd: 40,
              dur: 0.38,
              peak: 0.3,
              attack: 0.005,
            });
            this.noiseVoice({ dur: 0.34, peak: 0.16, filterType: 'lowpass', filterFreq: 400 });
          }
        } else if (ev.kind === 'add') {
          // Short pop.
          if (this.throttle('death:add', DEFAULT_THROTTLE)) {
            this.voice({
              type: 'triangle',
              freq: 420,
              freqEnd: 180,
              dur: 0.08,
              peak: 0.14,
              attack: 0.002,
            });
          }
        } else {
          // Player death — low thud.
          if (this.throttle('death:player', DEFAULT_THROTTLE)) {
            this.voice({
              type: 'sine',
              freq: 170,
              freqEnd: 70,
              dur: 0.22,
              peak: 0.22,
              attack: 0.004,
            });
          }
        }
        break;

      case 'downed':
        // Ominous low tone with a slight downward slump.
        if (this.throttle('downed', DEFAULT_THROTTLE)) {
          this.voice({ type: 'sine', freq: 110, freqEnd: 80, dur: 0.35, peak: 0.2, attack: 0.01 });
          this.voice({
            type: 'sawtooth',
            freq: 55,
            freqEnd: 40,
            dur: 0.35,
            peak: 0.08,
            attack: 0.01,
          });
        }
        break;

      case 'revive':
        // Bright rising arpeggio: C5 E5 G5.
        if (this.throttle('revive', DEFAULT_THROTTLE)) {
          this.arpeggio([523.25, 659.25, 783.99], 'triangle', 0.1, 0.13, 0.07);
        }
        break;

      case 'dodge':
        // Quick filtered-noise whoosh (bandpass sweeping up).
        if (this.throttle('dodge', DEFAULT_THROTTLE)) {
          this.noiseVoice({
            dur: 0.18,
            peak: 0.14,
            filterType: 'bandpass',
            filterFreq: 600,
            filterFreqEnd: 2200,
          });
        }
        break;

      case 'blink':
        // Zap — fast descending square with heavy detune.
        if (this.throttle('blink', DEFAULT_THROTTLE)) {
          this.voice({
            type: 'square',
            freq: 1200,
            freqEnd: 200,
            dur: 0.1,
            peak: 0.12,
            attack: 0.001,
            detune: 12,
          });
        }
        break;

      case 'enrage':
        // Detuned-saw growl (two saws beating against each other).
        if (this.throttle('enrage', DEFAULT_THROTTLE)) {
          this.voice({
            type: 'sawtooth',
            freq: 84,
            freqEnd: 70,
            dur: 0.36,
            peak: 0.2,
            attack: 0.01,
          });
          this.voice({
            type: 'sawtooth',
            freq: 84,
            freqEnd: 70,
            dur: 0.36,
            peak: 0.18,
            attack: 0.01,
            detune: 22,
          });
        }
        break;

      case 'telegraph':
        // Subtle high tick.
        if (this.throttle('telegraph', 0.03)) {
          this.voice({ type: 'sine', freq: 2000, dur: 0.03, peak: 0.05, attack: 0.001 });
        }
        break;

      case 'projectile':
        // Tiny pew — throttled so rapid fire doesn't spam.
        if (this.throttle('projectile', 0.04)) {
          this.voice({
            type: 'square',
            freq: 900,
            freqEnd: 480,
            dur: 0.06,
            peak: 0.07,
            attack: 0.001,
          });
        }
        break;

      case 'spawn':
        // An add claws its way up — brief detuned rasp (Lich summon cue).
        if (this.throttle('spawn', 0.05)) {
          this.voice({
            type: 'sawtooth',
            freq: 150,
            freqEnd: 260,
            dur: 0.14,
            peak: 0.1,
            attack: 0.006,
          });
        }
        break;

      // 'hit' player/boss handled above; no default sound for the rest.
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Synthesis primitives
  // -------------------------------------------------------------------------

  /** Schedule a single oscillator voice with an ADSR-ish envelope. */
  private voice(opts: VoiceOpts): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (this.activeVoices >= MAX_VOICES) return;

    const t0 = ctx.currentTime + (opts.when ?? 0);
    const attack = opts.attack ?? 0.005;
    const dur = Math.max(0.02, Math.min(opts.dur, 0.4)); // hard cap: < 400ms

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(EPS, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(EPS, opts.peak), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(EPS, t0 + dur);

    const osc = ctx.createOscillator();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(Math.max(1, opts.freq), t0);
    if (opts.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + dur);
    }
    if (opts.detune) osc.detune.setValueAtTime(opts.detune, t0);

    osc.connect(gain).connect(master);

    this.activeVoices++;
    osc.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      try {
        gain.disconnect();
        osc.disconnect();
      } catch {
        /* already disconnected — ignore */
      }
    };

    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Schedule a filtered white-noise voice (impacts / whooshes). */
  private noiseVoice(opts: {
    dur: number;
    peak: number;
    filterType: BiquadFilterType;
    filterFreq: number;
    filterFreqEnd?: number;
    when?: number;
  }): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (this.activeVoices >= MAX_VOICES) return;

    const buffer = this.ensureNoiseBuffer();
    if (!buffer) return;

    const t0 = ctx.currentTime + (opts.when ?? 0);
    const dur = Math.max(0.02, Math.min(opts.dur, 0.4));

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType;
    filter.frequency.setValueAtTime(Math.max(1, opts.filterFreq), t0);
    if (opts.filterFreqEnd !== undefined) {
      filter.frequency.linearRampToValueAtTime(Math.max(1, opts.filterFreqEnd), t0 + dur);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(EPS, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(EPS, opts.peak), t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(EPS, t0 + dur);

    src.connect(filter).connect(gain).connect(master);

    this.activeVoices++;
    src.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      try {
        gain.disconnect();
        filter.disconnect();
        src.disconnect();
      } catch {
        /* already disconnected — ignore */
      }
    };

    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Play a sequence of notes as an arpeggio (used for stings/revive). */
  private arpeggio(
    freqs: number[],
    type: OscillatorType,
    noteDur: number,
    peak: number,
    step: number,
  ): void {
    for (let i = 0; i < freqs.length; i++) {
      this.voice({ type, freq: freqs[i], dur: noteDur, peak, attack: 0.005, when: i * step });
    }
  }

  // -------------------------------------------------------------------------
  // Context lifecycle & helpers
  // -------------------------------------------------------------------------

  /**
   * Lazily create the AudioContext and master bus. Returns the context, or
   * null if audio is unavailable/blocked. Never throws.
   */
  private ensureCtx(): AudioContext | null {
    if (this.disposed) return null;
    if (this.ctx) return this.ctx;

    try {
      if (typeof window === 'undefined') return null;
      const w = window as unknown as {
        AudioContext?: AudioCtxCtor;
        webkitAudioContext?: AudioCtxCtor;
      };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return null;

      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.targetGain();
      master.connect(ctx.destination);

      this.ctx = ctx;
      this.master = master;
      return ctx;
    } catch {
      // Construction can throw (blocked, unsupported) — degrade silently.
      this.ctx = null;
      this.master = null;
      return null;
    }
  }

  /** Build (and cache) a 1s white-noise buffer for percussive/whoosh sounds. */
  private ensureNoiseBuffer(): AudioBuffer | null {
    if (this.noiseBuffer) return this.noiseBuffer;
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const length = Math.floor(ctx.sampleRate * 1);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
      return buffer;
    } catch {
      return null;
    }
  }

  /**
   * Returns true (and records the time) if `key` hasn't played within `minGap`
   * seconds — used to collapse identical overlapping sounds. If there's no
   * context yet, allow it (ensureCtx handles real availability).
   */
  private throttle(key: string, minGap: number): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(key);
    if (last !== undefined && now - last < minGap) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  /** Run `fn`, swallowing any error — audio must never break the game loop. */
  private safe(fn: () => void): void {
    try {
      fn();
    } catch {
      /* audio is best-effort; never propagate failures */
    }
  }
}
