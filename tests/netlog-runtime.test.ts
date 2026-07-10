// @vitest-environment jsdom
/**
 * Runtime-plumbing tests for net/log.ts — the gated emitters, the on/off
 * toggle, the live diagnostics poller, and the `window.warband` console API.
 * (The pure summarizers are covered in netlog.test.ts.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  netLog,
  netWarn,
  netError,
  netLogOnce,
  setNetDebug,
  isNetDebugEnabled,
  setDiagnoser,
  startNetDiagnostics,
} from '../src/net/log';

let logSpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.clear();
});

afterEach(() => {
  setNetDebug(false);
  setDiagnoser(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('net debug toggle + gated emitters', () => {
  it('setNetDebug flips the enabled flag, persists it, and confirms via console', () => {
    expect(setNetDebug(true)).toBe(true);
    expect(isNetDebugEnabled()).toBe(true);
    expect(localStorage.getItem('warband:netDebug')).toBe('1');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('ENABLED'));

    expect(setNetDebug(false)).toBe(false);
    expect(isNetDebugEnabled()).toBe(false);
    expect(localStorage.getItem('warband:netDebug')).toBe('0');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('disabled'));
  });

  it('netLog prints only when enabled', () => {
    setNetDebug(false);
    netLog('room', 'quiet');
    expect(logSpy).not.toHaveBeenCalled();

    setNetDebug(true);
    netLog('room', 'loud');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[room]'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('loud'));

    // A detail argument is forwarded as a second console arg.
    netLog('room', 'with detail', { a: 1 });
    expect(logSpy).toHaveBeenLastCalledWith(expect.stringContaining('with detail'), { a: 1 });
  });

  it('netWarn and netError always print, even with logging off', () => {
    setNetDebug(false);
    netWarn('peer', 'careful');
    netError('peer', 'broken', { code: 5 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('careful'));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenLastCalledWith(expect.stringContaining('broken'), { code: 5 });
  });

  it('netLogOnce fires a given key only once', () => {
    setNetDebug(true);
    const seen = new Set<string>();
    netLogOnce(seen, 'k1', 'snap', 'first');
    netLogOnce(seen, 'k1', 'snap', 'again');
    netLogOnce(seen, 'k2', 'snap', 'other');
    expect(logSpy).toHaveBeenCalledTimes(2);
  });
});

describe('window.warband console API', () => {
  it('exposes netDebug / diagnose / isNetDebugEnabled', () => {
    const w = window as unknown as {
      warband?: {
        netDebug: (on?: boolean) => boolean;
        diagnose: () => void;
        isNetDebugEnabled: () => boolean;
      };
    };
    expect(w.warband).toBeDefined();
    expect(w.warband?.netDebug(true)).toBe(true);
    expect(w.warband?.isNetDebugEnabled()).toBe(true);
    w.warband?.netDebug(false);
    expect(w.warband?.isNetDebugEnabled()).toBe(false);
  });

  it('diagnose() reports "no active session" when none is registered', () => {
    setDiagnoser(null);
    const w = window as unknown as { warband?: { diagnose: () => void } };
    w.warband?.diagnose();
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('no active session'));
  });
});

describe('startNetDiagnostics', () => {
  interface FakeSocket {
    readyState: number;
    addEventListener: (type: string, cb: (ev: { data: unknown }) => void) => void;
  }

  function fakeSocket(readyState: number): { sock: FakeSocket; emit: (data: unknown) => void } {
    let handler: ((ev: { data: unknown }) => void) | null = null;
    return {
      sock: {
        readyState,
        addEventListener: (type, cb) => {
          if (type === 'message') handler = cb;
        },
      },
      emit: (data) => handler?.({ data }),
    };
  }

  it('registers a diagnoser, counts inbound frames, and stops cleanly', () => {
    vi.useFakeTimers();
    const a = fakeSocket(1);
    const sockets: Record<string, FakeSocket> = { 'wss://a': a.sock };
    const peers: Record<string, RTCPeerConnection> = {};

    const stop = startNetDiagnostics({
      scope: 'host',
      roomLabel: 'app/CODE',
      getSockets: () => sockets,
      getPeers: () => peers,
      intervalMs: 2000,
    });

    // A relayed offer frame arrives on the instrumented socket.
    a.emit('{"action":"announce","offer":{"type":"offer"}}');
    a.emit('{"interval":120}'); // non-signaling

    // diagnose() prints a snapshot naming the room and a verdict. The snapshot
    // is the one console.info call carrying a second (detail) argument.
    const w = window as unknown as { warband?: { diagnose: () => void } };
    w.warband?.diagnose();
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('snapshot'), expect.anything());
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('room app/CODE'),
      expect.anything(),
    );
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('1 signaling'), expect.anything());

    // Stop clears the interval and the diagnoser.
    stop();
    w.warband?.diagnose();
    expect(infoSpy).toHaveBeenLastCalledWith(expect.stringContaining('no active session'));
  });

  it('logs a connectivity line on change when verbose logging is on', () => {
    vi.useFakeTimers();
    setNetDebug(true);
    const sockets: Record<string, { readyState: number }> = { 'wss://a': { readyState: 1 } };
    const stop = startNetDiagnostics({
      scope: 'client',
      getSockets: () => sockets,
      getPeers: () => ({}),
      intervalMs: 1000,
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('connectivity'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[client]'));
    stop();
  });

  it('survives sources that throw (safe fallback to empty state)', () => {
    vi.useFakeTimers();
    const stop = startNetDiagnostics({
      scope: 'host',
      getSockets: () => {
        throw new Error('sockets unavailable');
      },
      getPeers: () => {
        throw new Error('peers unavailable');
      },
    });
    const w = window as unknown as { warband?: { diagnose: () => void } };
    expect(() => w.warband?.diagnose()).not.toThrow();
    stop();
  });
});
