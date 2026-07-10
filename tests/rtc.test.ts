import { describe, it, expect } from 'vitest';
import {
  buildTurnConfig,
  extraTrackerUrls,
  mergeTrackerUrls,
  sanitizeTrackerUrls,
  rewriteMdnsToLoopback,
  BLOCKED_TRACKER_HOSTS,
  DEFAULT_TURN,
  type RtcEnv,
} from '../src/net/transport/rtc';

describe('buildTurnConfig', () => {
  it('returns the bundled public TURN by default', () => {
    expect(buildTurnConfig({})).toEqual(DEFAULT_TURN);
  });

  it('prepends a custom TURN server from env, keeping the default relays', () => {
    const env: RtcEnv = {
      VITE_TURN_URL: 'turn:my.relay:3478',
      VITE_TURN_USERNAME: 'user',
      VITE_TURN_CREDENTIAL: 'pass',
    };
    const out = buildTurnConfig(env);
    expect(out[0]).toEqual({
      urls: 'turn:my.relay:3478',
      username: 'user',
      credential: 'pass',
    });
    expect(out.length).toBe(1 + DEFAULT_TURN.length);
  });

  it('uses only the custom relay when the default is disabled', () => {
    const env: RtcEnv = {
      VITE_TURN_URL: 'turn:my.relay:3478',
      VITE_TURN_USERNAME: 'user',
      VITE_TURN_CREDENTIAL: 'pass',
      VITE_NO_DEFAULT_TURN: 'true',
    };
    expect(buildTurnConfig(env)).toEqual([
      { urls: 'turn:my.relay:3478', username: 'user', credential: 'pass' },
    ]);
  });

  it('supports multiple comma-separated TURN urls', () => {
    const env: RtcEnv = {
      VITE_TURN_URL: 'turn:a:3478, turn:b:3478',
      VITE_NO_DEFAULT_TURN: '1',
    };
    const out = buildTurnConfig(env);
    expect(out).toEqual([{ urls: ['turn:a:3478', 'turn:b:3478'] }]);
  });

  it('returns nothing when no TURN is configured and the default is disabled', () => {
    expect(buildTurnConfig({ VITE_NO_DEFAULT_TURN: 'yes' })).toEqual([]);
  });
});

describe('rewriteMdnsToLoopback', () => {
  it('is ON by default so two tabs on one machine connect over loopback', () => {
    expect(rewriteMdnsToLoopback({})).toBe(true);
  });

  it('can be turned off via VITE_NO_RTC_LOOPBACK (any truthy value)', () => {
    expect(rewriteMdnsToLoopback({ VITE_NO_RTC_LOOPBACK: 'true' })).toBe(false);
    expect(rewriteMdnsToLoopback({ VITE_NO_RTC_LOOPBACK: '1' })).toBe(false);
    expect(rewriteMdnsToLoopback({ VITE_NO_RTC_LOOPBACK: 'yes' })).toBe(false);
    expect(rewriteMdnsToLoopback({ VITE_NO_RTC_LOOPBACK: 'ON' })).toBe(false);
  });

  it('stays ON for empty / falsy / unrecognized values', () => {
    expect(rewriteMdnsToLoopback({ VITE_NO_RTC_LOOPBACK: '' })).toBe(true);
    expect(rewriteMdnsToLoopback({ VITE_NO_RTC_LOOPBACK: 'false' })).toBe(true);
    expect(rewriteMdnsToLoopback({ VITE_NO_RTC_LOOPBACK: 'no' })).toBe(true);
    expect(rewriteMdnsToLoopback({ VITE_NO_RTC_LOOPBACK: 'maybe' })).toBe(true);
  });
});

describe('tracker url helpers', () => {
  it('parses comma/space separated extra trackers', () => {
    expect(extraTrackerUrls({ VITE_TRACKER_URLS: 'wss://a, wss://b\nwss://c' })).toEqual([
      'wss://a',
      'wss://b',
      'wss://c',
    ]);
    expect(extraTrackerUrls({})).toEqual([]);
  });

  it('merges defaults with extras and de-dupes', () => {
    expect(mergeTrackerUrls(['wss://a', 'wss://b'], ['wss://b', 'wss://c'])).toEqual([
      'wss://a',
      'wss://b',
      'wss://c',
    ]);
  });
});

describe('sanitizeTrackerUrls', () => {
  it('drops the known-broken files.fm tracker (the "forbidden" one)', () => {
    const pool = [
      'wss://tracker.webtorrent.dev',
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz',
      'wss://tracker.files.fm:7073/announce',
    ];
    expect(sanitizeTrackerUrls(pool)).toEqual([
      'wss://tracker.webtorrent.dev',
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz',
    ]);
  });

  it('matches a blocked host regardless of port, path, or casing', () => {
    expect(
      sanitizeTrackerUrls([
        'wss://TRACKER.FILES.FM:7073/announce',
        'wss://tracker.files.fm',
        'wss://tracker.files.fm:1234/other',
      ]),
    ).toEqual([]);
  });

  it('leaves a clean pool untouched and preserves order', () => {
    const pool = ['wss://a', 'wss://b', 'wss://c'];
    expect(sanitizeTrackerUrls(pool)).toEqual(pool);
  });

  it('also strips a blocked tracker that arrived via env extras', () => {
    const merged = mergeTrackerUrls(
      ['wss://tracker.webtorrent.dev'],
      extraTrackerUrls({
        VITE_TRACKER_URLS: 'wss://tracker.files.fm:7073/announce, wss://ok.example',
      }),
    );
    expect(sanitizeTrackerUrls(merged)).toEqual([
      'wss://tracker.webtorrent.dev',
      'wss://ok.example',
    ]);
  });

  it('exposes files.fm on the deny-list', () => {
    expect(BLOCKED_TRACKER_HOSTS).toContain('tracker.files.fm');
  });
});
