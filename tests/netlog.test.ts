import { describe, it, expect } from 'vitest';
import {
  resolveNetDebug,
  summarizeSockets,
  summarizePeers,
  summarizeIceServers,
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
