/**
 * Extra rtc.ts coverage: relayUrl normalization, the trackerHost parse fallback
 * for URLs the WHATWG `URL` parser rejects, and the buildTurnConfig edge where a
 * truthy VITE_TURN_URL splits to zero entries. (buildTurnConfig's common paths,
 * tracker merge/sanitize and the loopback flag are covered in rtc.test.ts.)
 */
import { describe, it, expect } from 'vitest';
import {
  buildTurnConfig,
  relayUrl,
  sanitizeTrackerUrls,
  DEFAULT_TURN,
} from '../src/net/transport/rtc';

describe('relayUrl', () => {
  it('is null when unset or blank', () => {
    expect(relayUrl({})).toBeNull();
    expect(relayUrl({ VITE_RELAY_URL: '   ' })).toBeNull();
  });

  it('passes through an explicit ws/wss scheme', () => {
    expect(relayUrl({ VITE_RELAY_URL: 'wss://relay.example' })).toBe('wss://relay.example');
    expect(relayUrl({ VITE_RELAY_URL: 'ws://relay.example:8080' })).toBe('ws://relay.example:8080');
  });

  it('defaults a bare host to a secure wss:// url', () => {
    expect(relayUrl({ VITE_RELAY_URL: 'relay.example' })).toBe('wss://relay.example');
    expect(relayUrl({ VITE_RELAY_URL: '  relay.example:9000  ' })).toBe('wss://relay.example:9000');
  });
});

describe('buildTurnConfig with a truthy-but-empty VITE_TURN_URL', () => {
  it('adds no custom server when the url splits to zero non-blank entries', () => {
    // ',' trims to a non-empty (truthy) string, so the outer guard passes, but
    // splitting on commas and dropping blanks leaves NO url — the custom-server
    // block must be skipped. With the default TURN disabled, the result is empty.
    expect(buildTurnConfig({ VITE_TURN_URL: ',', VITE_NO_DEFAULT_TURN: '1' })).toEqual([]);
  });

  it('still yields exactly the bundled default TURN when only the custom url is empty', () => {
    // Same truthy-but-empty custom url, but the default is left enabled: the
    // output is precisely the bundled public TURN — nothing custom slipped in.
    expect(buildTurnConfig({ VITE_TURN_URL: '  ,  ,' })).toEqual(DEFAULT_TURN);
  });
});

describe('sanitizeTrackerUrls parse fallback', () => {
  it('extracts the host from a scheme-less url the URL parser rejects', () => {
    // 'tracker.files.fm/announce' has no scheme, so `new URL()` throws and the
    // best-effort fallback in trackerHost() must still recognise the blocked host.
    expect(sanitizeTrackerUrls(['tracker.files.fm/announce'])).toEqual([]);
    // A scheme-less clean host survives.
    expect(sanitizeTrackerUrls(['ok.example.com/announce'])).toEqual(['ok.example.com/announce']);
  });
});
