// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configuredRelayUrl,
  generateRoomCode,
  getTrackerSockets,
  readRoomFromHash,
  shareLinkFor,
  writeRoomToHash,
} from '../src/net/room';

// Mirror of the unambiguous alphabet + length declared in src/net/room.ts.
// Intentionally omits O/0, I/1 and L so a code is unmistakable when read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

beforeEach(() => {
  window.location.hash = '';
});

afterEach(() => {
  // Undo any vi.spyOn(Math, 'random') so pinned randomness never leaks.
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('generateRoomCode', () => {
  it('returns a 6-character code', () => {
    expect(generateRoomCode()).toHaveLength(CODE_LENGTH);
  });

  it('uses only characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(CODE_LENGTH);
      for (const ch of code) {
        expect(CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it('never emits the ambiguous characters O, 0, I, 1 or L', () => {
    const blob = Array.from({ length: 300 }, () => generateRoomCode()).join('');
    for (const banned of ['O', '0', 'I', '1', 'L']) {
      expect(blob).not.toContain(banned);
    }
  });

  it('produces varying codes across many draws (statistically)', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateRoomCode()));
    // 31^6 possibilities: two identical draws in 100 is astronomically unlikely.
    expect(codes.size).toBeGreaterThan(1);
  });

  it('is deterministic when Math.random is pinned to 0 (first letter, six times)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // Math.floor(0 * 31) === 0 → CODE_ALPHABET[0] === 'A'.
    expect(generateRoomCode()).toBe('AAAAAA');
  });

  it('maps a fixed Math.random sequence to the exact expected code', () => {
    const indices = [0, 5, 8, 12, 23, 30];
    const rand = vi.spyOn(Math, 'random');
    for (const idx of indices) {
      // Mid-bucket value so Math.floor(r * len) === idx exactly, per position.
      rand.mockReturnValueOnce((idx + 0.5) / CODE_ALPHABET.length);
    }
    const expected = indices.map((i) => CODE_ALPHABET[i]).join('');
    expect(expected).toBe('AFJP29');
    expect(generateRoomCode()).toBe(expected);
  });

  it('maps the top Math.random bucket to the last alphabet character', () => {
    vi.spyOn(Math, 'random').mockReturnValue((CODE_ALPHABET.length - 0.5) / CODE_ALPHABET.length);
    const last = CODE_ALPHABET[CODE_ALPHABET.length - 1];
    expect(generateRoomCode()).toBe(last.repeat(CODE_LENGTH));
  });
});

describe('readRoomFromHash', () => {
  it('parses #room=CODE and defaults net to p2p', () => {
    window.location.hash = '#room=ABC123';
    expect(readRoomFromHash()).toEqual({ code: 'ABC123', net: 'p2p' });
  });

  it('uppercases a lowercase code (case-insensitive match)', () => {
    window.location.hash = '#room=abc123';
    expect(readRoomFromHash()).toEqual({ code: 'ABC123', net: 'p2p' });
  });

  it('reads the &net=g variant as relay', () => {
    window.location.hash = '#room=abc123&net=g';
    expect(readRoomFromHash()).toEqual({ code: 'ABC123', net: 'relay' });
  });

  it('reads the &net=relay variant as relay', () => {
    window.location.hash = '#room=abc123&net=relay';
    expect(readRoomFromHash()).toEqual({ code: 'ABC123', net: 'relay' });
  });

  it('treats the whole hash as case-insensitive (ROOM=/NET= prefixes)', () => {
    window.location.hash = '#ROOM=abc123&NET=G';
    expect(readRoomFromHash()).toEqual({ code: 'ABC123', net: 'relay' });
  });

  it('returns null for an empty hash', () => {
    window.location.hash = '';
    expect(readRoomFromHash()).toBeNull();
  });

  it('returns null for an unrelated hash', () => {
    window.location.hash = '#lobby';
    expect(readRoomFromHash()).toBeNull();
  });

  it('returns null when room= has no code', () => {
    window.location.hash = '#room=';
    expect(readRoomFromHash()).toBeNull();
  });

  it('returns null for an unknown net token', () => {
    window.location.hash = '#room=abc123&net=xyz';
    expect(readRoomFromHash()).toBeNull();
  });

  it('returns null when unexpected junk trails the code', () => {
    window.location.hash = '#room=abc123&foo=bar';
    expect(readRoomFromHash()).toBeNull();
  });
});

describe('writeRoomToHash', () => {
  it('writes room=CODE for a p2p room', () => {
    writeRoomToHash('ABC123');
    expect(window.location.hash).toBe('#room=ABC123');
    expect(readRoomFromHash()).toEqual({ code: 'ABC123', net: 'p2p' });
  });

  it('appends &net=g for a relay room', () => {
    writeRoomToHash('ABC123', 'relay');
    expect(window.location.hash).toBe('#room=ABC123&net=g');
    expect(readRoomFromHash()).toEqual({ code: 'ABC123', net: 'relay' });
  });

  it('omits the net suffix when p2p is explicit', () => {
    writeRoomToHash('ABC123', 'p2p');
    expect(window.location.hash).toBe('#room=ABC123');
  });

  it('clears the hash for an empty code', () => {
    window.location.hash = '#room=OLD123';
    writeRoomToHash('');
    expect(window.location.hash).toBe('');
  });

  it('clears the hash for an empty code even when relay is requested', () => {
    window.location.hash = '#room=OLD123&net=g';
    writeRoomToHash('', 'relay');
    expect(window.location.hash).toBe('');
  });
});

describe('shareLinkFor', () => {
  const base = () => window.location.origin + window.location.pathname;

  it('builds origin + pathname + #room=CODE for p2p', () => {
    expect(shareLinkFor('ABC123')).toBe(`${base()}#room=ABC123`);
  });

  it('adds the &net=g suffix for relay', () => {
    expect(shareLinkFor('ABC123', 'relay')).toBe(`${base()}#room=ABC123&net=g`);
  });

  it('produces a link whose fragment round-trips through readRoomFromHash', () => {
    const link = shareLinkFor('ABC123', 'relay');
    // Emulate a joiner opening the link: adopt just its fragment.
    window.location.hash = link.slice(link.indexOf('#'));
    expect(readRoomFromHash()).toEqual({ code: 'ABC123', net: 'relay' });
  });
});

describe('configuredRelayUrl', () => {
  it('returns a string or null without throwing', () => {
    const url = configuredRelayUrl();
    expect(url === null || typeof url === 'string').toBe(true);
  });
});

describe('getTrackerSockets', () => {
  it('returns a non-null object and never throws', () => {
    const sockets = getTrackerSockets();
    expect(sockets).not.toBeNull();
    expect(typeof sockets).toBe('object');
  });

  it('exposes a record keyed by string tracker urls', () => {
    const sockets = getTrackerSockets();
    for (const key of Object.keys(sockets)) {
      expect(typeof key).toBe('string');
    }
  });
});
