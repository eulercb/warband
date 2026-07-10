/**
 * Extra rtc.ts coverage: relayUrl normalization and the trackerHost parse
 * fallback for URLs the WHATWG `URL` parser rejects. (buildTurnConfig, tracker
 * merge/sanitize and the loopback flag are covered in rtc.test.ts.)
 */
import { describe, it, expect } from 'vitest';
import { relayUrl, sanitizeTrackerUrls } from '../src/net/transport/rtc';

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

describe('sanitizeTrackerUrls parse fallback', () => {
  it('extracts the host from a scheme-less url the URL parser rejects', () => {
    // 'tracker.files.fm/announce' has no scheme, so `new URL()` throws and the
    // best-effort fallback in trackerHost() must still recognise the blocked host.
    expect(sanitizeTrackerUrls(['tracker.files.fm/announce'])).toEqual([]);
    // A scheme-less clean host survives.
    expect(sanitizeTrackerUrls(['ok.example.com/announce'])).toEqual(['ok.example.com/announce']);
  });
});
