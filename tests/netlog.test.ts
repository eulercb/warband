import { describe, it, expect } from 'vitest';
import {
  resolveNetDebug,
  summarizeSockets,
  summarizePeers,
  summarizeIceServers,
  isSignalingFrame,
  summarizeTrackerDetail,
  diagnosisVerdict,
} from '../src/net/log';

describe('resolveNetDebug', () => {
  const base = { stored: null, buildFlag: undefined, dev: false };

  it('is off by default in a production build', () => {
    expect(resolveNetDebug(base)).toBe(false);
  });

  it('is on by default under the dev server', () => {
    expect(resolveNetDebug({ ...base, dev: true })).toBe(true);
  });

  it('honours the build-time VITE_NET_DEBUG flag', () => {
    expect(resolveNetDebug({ ...base, buildFlag: 'true' })).toBe(true);
    expect(resolveNetDebug({ ...base, buildFlag: '1' })).toBe(true);
    expect(resolveNetDebug({ ...base, dev: true, buildFlag: 'false' })).toBe(false);
  });

  it('lets an explicit localStorage override win over everything', () => {
    // Force ON in a prod build...
    expect(resolveNetDebug({ ...base, stored: '1' })).toBe(true);
    // ...and force OFF even in dev / with the build flag set.
    expect(resolveNetDebug({ stored: '0', buildFlag: 'true', dev: true })).toBe(false);
  });

  it('ignores unrecognized override values and falls through', () => {
    expect(resolveNetDebug({ ...base, stored: 'maybe', dev: true })).toBe(true);
  });
});

describe('summarizeSockets', () => {
  it('reports when no tracker sockets exist yet', () => {
    expect(summarizeSockets({})).toBe('no tracker sockets yet');
  });

  it('breaks sockets down by readyState name', () => {
    // 0=connecting, 1=open, 2=closing, 3=closed
    const sockets = {
      'wss://a': { readyState: 1 },
      'wss://b': { readyState: 1 },
      'wss://c': { readyState: 0 },
    };
    expect(summarizeSockets(sockets)).toBe('3 tracker sockets (2 open, 1 connecting)');
  });

  it('handles a single open socket (singular noun)', () => {
    expect(summarizeSockets({ 'wss://a': { readyState: 1 } })).toBe('1 tracker socket (1 open)');
  });
});

describe('summarizePeers', () => {
  it('reports zero active peers (the stuck-handshake signal)', () => {
    expect(summarizePeers({})).toBe('0 active peers');
  });

  it('lists each peer with its connection/ICE state, truncating the id', () => {
    const peers = {
      abcdef123456: { connectionState: 'connected', iceConnectionState: 'completed' },
    };
    expect(summarizePeers(peers)).toBe('1 active peer (abcdef=connected/completed)');
  });

  it('tolerates missing state fields', () => {
    expect(summarizePeers({ abcdef: {} })).toBe('1 active peer (abcdef=?/?)');
  });
});

describe('summarizeIceServers', () => {
  it('reports "none" for an empty ICE config', () => {
    expect(summarizeIceServers([])).toBe('none');
  });

  it('tallies STUN vs TURN urls (string or array), leaking no credentials', () => {
    const servers = [
      { urls: 'stun:openrelay.metered.ca:80' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'secretuser', credential: 'secretpass' },
      { urls: ['turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'] },
    ];
    const out = summarizeIceServers(servers);
    expect(out).toBe('4 url(s): 1 STUN, 3 TURN');
    expect(out).not.toContain('secretuser');
    expect(out).not.toContain('secretpass');
  });
});

describe('isSignalingFrame', () => {
  it('flags a relayed offer/answer frame', () => {
    expect(isSignalingFrame('{"action":"announce","offer":{"type":"offer","sdp":"…"}}')).toBe(true);
    expect(isSignalingFrame('{"action":"announce","answer":{"type":"answer"}}')).toBe(true);
  });

  it('does NOT flag a plain announce response (no match relayed)', () => {
    expect(
      isSignalingFrame('{"action":"announce","interval":120,"complete":0,"incomplete":1}'),
    ).toBe(false);
  });

  it('ignores non-string frames (Blob/ArrayBuffer)', () => {
    expect(isSignalingFrame(new ArrayBuffer(8))).toBe(false);
    expect(isSignalingFrame(undefined)).toBe(false);
  });
});

describe('summarizeTrackerDetail', () => {
  it('reports nothing before any socket exists', () => {
    expect(summarizeTrackerDetail({})).toBe('  (no tracker sockets yet)');
  });

  it('calls out an open-but-mute tracker (the black-hole case)', () => {
    const out = summarizeTrackerDetail({
      'wss://mute': { readyState: 1, frames: 0, signaling: 0 },
    });
    expect(out).toContain('wss://mute — open');
    expect(out).toContain('silent — 0 frames in (mute: cannot introduce peers)');
  });

  it('shows inbound frame + signaling counts for a live tracker', () => {
    const out = summarizeTrackerDetail({
      'wss://live': { readyState: 1, frames: 4, signaling: 1 },
    });
    expect(out).toBe('  wss://live — open, 4 frames in, 1 signaling');
  });
});

describe('diagnosisVerdict', () => {
  const base = {
    socketsOpen: 3,
    socketsTotal: 3,
    peersTotal: 0,
    peersConnected: 0,
    signalingFrames: 0,
  };

  it('blames matchmaking (NOT NAT/TURN) only when sockets are open AND no signaling was relayed', () => {
    const out = diagnosisVerdict(base);
    expect(out).toContain('no peer has been introduced yet');
    expect(out).toContain('matchmaking stage');
    expect(out).toContain('NOT NAT/TURN');
    // With zero relayed signaling, TURN is genuinely not the fix yet.
    expect(out).not.toContain('Matchmaking WORKED');
  });

  it('points at TURN once signaling was relayed but no peer became active (SDP exchanged, no connection)', () => {
    // This is the reported bug: trackers open, offers/answers relayed both ways,
    // yet 0 active peers. `getPeers()` only counts post-handshake peers, so an
    // ICE/NAT stall reads as 0 too — and the verdict must call it what it is.
    const out = diagnosisVerdict({ ...base, signalingFrames: 8 });
    expect(out).toContain('Matchmaking WORKED');
    expect(out).toContain('NAT-traversal stage');
    expect(out).toContain('TURN');
    expect(out).toContain('8 offer/answer frame(s)');
    // It must NOT repeat the old, backwards "matchmaking, TURN won't help" advice.
    expect(out).not.toContain('matchmaking stage');
  });

  it('points at TURN once a peer was introduced (active) but never connected', () => {
    const out = diagnosisVerdict({ ...base, peersTotal: 1 });
    expect(out).toContain('TURN');
    expect(out).toContain('WebRTC path is not completing');
  });

  it('blames unreachable trackers when no socket is open', () => {
    const out = diagnosisVerdict({ ...base, socketsOpen: 0 });
    expect(out).toContain('matchmaking cannot even start');
  });

  it('reports a healthy transport when a peer is connected', () => {
    const out = diagnosisVerdict({ ...base, peersTotal: 1, peersConnected: 1 });
    expect(out).toContain('transport is up');
  });
});
