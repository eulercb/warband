/**
 * Branch-coverage tests for net/log.ts — the specific untaken sides left open by
 * netlog.test.ts (pure summarizers) and netlog-runtime.test.ts (jsdom runtime).
 *
 * This file deliberately runs in the default NODE environment (no jsdom
 * docblock): there `localStorage` is undefined, so `setNetDebug` exercises the
 * no-persistence guard that the jsdom suite can't reach. The rest of the cases
 * feed the summarizers and the diagnostics poller inputs the existing suites
 * never used (out-of-range socket states, plural peers, a singular frame count,
 * an already-watched peer, and an unchanged connectivity signature).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  netWarn,
  netError,
  setNetDebug,
  isNetDebugEnabled,
  summarizeSockets,
  summarizePeers,
  summarizeTrackerDetail,
  startNetDiagnostics,
  setDiagnoser,
} from '../src/net/log';

let infoSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  setNetDebug(false);
  setDiagnoser(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('setNetDebug without localStorage', () => {
  it('toggles the flag and confirms via console even when persistence is unavailable', () => {
    // The node test environment has no `localStorage`, so the persist guard in
    // setNetDebug takes its false branch. The toggle must still work and the
    // confirmation must still print — without throwing.
    expect(typeof localStorage).toBe('undefined');

    expect(setNetDebug(true)).toBe(true);
    expect(isNetDebugEnabled()).toBe(true);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('ENABLED'));

    expect(setNetDebug(false)).toBe(false);
    expect(isNetDebugEnabled()).toBe(false);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('disabled'));
  });
});

describe('netWarn / netError detail-argument branches', () => {
  it('netWarn forwards a detail argument as a second console.warn argument', () => {
    netWarn('peer', 'careful', { code: 7 });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('careful'), { code: 7 });
  });

  it('netError prints with no detail argument (single-argument branch)', () => {
    netError('peer', 'broken');
    // toHaveBeenCalledWith matches the FULL argument list, so this passes only
    // when console.error was called with exactly one (formatted-line) argument.
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('broken'));
  });
});

describe('summarizer fallback / plural branches', () => {
  it('summarizeSockets names an out-of-range readyState as "stateN"', () => {
    expect(summarizeSockets({ 'wss://x': { readyState: 9 } })).toBe('1 tracker socket (1 state9)');
  });

  it('summarizePeers pluralizes the noun for more than one peer', () => {
    const out = summarizePeers({
      aaaaaa1: { connectionState: 'connected', iceConnectionState: 'completed' },
      bbbbbb2: { connectionState: 'connecting', iceConnectionState: 'checking' },
    });
    expect(out.startsWith('2 active peers (')).toBe(true);
    expect(out).toContain('aaaaaa=connected/completed');
    expect(out).toContain('bbbbbb=connecting/checking');
  });

  it('summarizeTrackerDetail names an out-of-range readyState as "stateN"', () => {
    const out = summarizeTrackerDetail({
      'wss://x': { readyState: 8, frames: 3, signaling: 1 },
    });
    expect(out).toContain('wss://x — state8');
  });

  it('summarizeTrackerDetail uses the singular "frame" for exactly one inbound frame', () => {
    const out = summarizeTrackerDetail({
      'wss://x': { readyState: 1, frames: 1, signaling: 0 },
    });
    expect(out).toBe('  wss://x — open, 1 frame in, 0 signaling');
  });
});

describe('startNetDiagnostics — already-watched peer + unchanged signature', () => {
  interface FakePeer {
    connectionState: string;
    iceConnectionState: string;
    addEventListener: (type: string, cb: () => void) => void;
  }

  function fakePeer(
    state: string,
    ice: string,
  ): { peer: RTCPeerConnection; added: () => number; fire: (type: string) => void } {
    const handlers: Record<string, () => void> = {};
    let added = 0;
    const peer: FakePeer = {
      connectionState: state,
      iceConnectionState: ice,
      addEventListener: (type, cb) => {
        added += 1;
        handlers[type] = cb;
      },
    };
    return {
      peer: peer as unknown as RTCPeerConnection,
      added: () => added,
      fire: (type) => handlers[type]?.(),
    };
  }

  it('watches a new peer once and skips re-watching / re-logging on an unchanged tick', () => {
    vi.useFakeTimers();
    setNetDebug(true);

    // Capture verbose log lines directly (a locally-typed spy, so `.mock` /
    // `.mockImplementation` stay type-safe) to count connectivity lines.
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logged.push(msg as string);
    });
    const connectivityCount = () => logged.filter((l) => l.includes('connectivity')).length;

    const p = fakePeer('connecting', 'checking');
    const sockets: Record<string, { readyState: number }> = { 'wss://a': { readyState: 1 } };
    const peers: Record<string, RTCPeerConnection> = { abcdef123456: p.peer };

    const stop = startNetDiagnostics({
      scope: 'host',
      getSockets: () => sockets,
      getPeers: () => peers,
      intervalMs: 1000,
    });

    // First tick (run synchronously by startNetDiagnostics): the peer is new, so
    // both state listeners get attached and one connectivity line is logged.
    expect(p.added()).toBe(2);
    expect(connectivityCount()).toBe(1);

    // A state-change event drives the attached logger (peer transition line).
    p.fire('connectionstatechange');
    expect(logged.some((l) => l.includes('peer abcdef'))).toBe(true);

    // Second tick with the SAME sockets + peer: the peer is already watched (no
    // new listeners) and the connectivity signature is unchanged (no new line).
    vi.advanceTimersByTime(1000);
    expect(p.added()).toBe(2);
    expect(connectivityCount()).toBe(1);

    stop();
  });
});

describe('readInputs — localStorage.getItem throwing at module load', () => {
  it('swallows a throwing getItem (private mode / sandboxed iframe) without crashing the import', async () => {
    // The node env has no localStorage, so `setNetDebug`'s persist guard is the
    // reachable case there — but the module-init read of localStorage.getItem can
    // only THROW when localStorage EXISTS and is blocked. Stub such a localStorage
    // and re-run module init: readInputs must catch it (stored = null) so the
    // import never throws and the flag still resolves.
    const throwing = {
      getItem: () => {
        throw new Error('access denied');
      },
      setItem: () => {},
    };
    try {
      vi.stubGlobal('localStorage', throwing);
      vi.resetModules();
      const mod = await import('../src/net/log');
      // Import succeeded (the throw was caught); with no usable stored override the
      // flag resolves to a plain boolean rather than propagating the error.
      expect(typeof mod.isNetDebugEnabled()).toBe('boolean');
      // …and the module is still fully functional afterwards.
      expect(mod.setNetDebug(true)).toBe(true);
      expect(mod.isNetDebugEnabled()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('startNetDiagnostics snapshot — connected-peer tally', () => {
  it('counts the connected peers when a snapshot is taken (drives the peersConnected filter)', async () => {
    // `snapshot()` (the backing of warband.diagnose()) filters the peer list for
    // connectionState === 'connected'. That filter predicate only runs with a
    // NON-EMPTY peer map AND a reachable diagnose(). The node env has no window,
    // so re-import the module with a stubbed window to wire up warband.diagnose().
    try {
      vi.stubGlobal('window', {});
      vi.useFakeTimers();
      vi.resetModules();
      const mod = await import('../src/net/log');
      // Keep verbose logging OFF so the poller's per-peer listener attach (which a
      // plain fake peer lacks) is skipped; snapshot() itself is ungated and still
      // runs the peersConnected filter.
      mod.setNetDebug(false);

      const peers: Record<string, RTCPeerConnection> = {
        aaaaaa1: {
          connectionState: 'connected',
          iceConnectionState: 'completed',
        } as unknown as RTCPeerConnection,
        bbbbbb2: {
          connectionState: 'connecting',
          iceConnectionState: 'checking',
        } as unknown as RTCPeerConnection,
      };
      const sockets: Record<string, { readyState: number }> = { 'wss://a': { readyState: 1 } };

      const stop = mod.startNetDiagnostics({
        scope: 'host',
        getSockets: () => sockets,
        getPeers: () => peers,
        intervalMs: 1000,
      });

      const w = window as unknown as { warband?: { diagnose: () => void } };
      w.warband?.diagnose(); // → snapshot() → peerList.filter(p => connected).length

      // Exactly one of the two peers is 'connected', so the verdict is the
      // transport-up line naming a single connected peer.
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('connected to 1 peer'),
        expect.anything(),
      );
      stop();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
