import { describe, it, expect } from 'vitest';
import { ACTIONS, APP_ID } from '../src/net/protocol';

describe('protocol', () => {
  it('exposes a stable app id', () => {
    expect(APP_ID).toBe('warband-v1-boss-fight');
  });

  it('defines every action id used by host and client', () => {
    // The wire ids must stay short and, crucially, identical across peers — a
    // drift here silently breaks matchmaking. Pin the full table.
    expect(ACTIONS).toEqual({
      hello: 'hello',
      select: 'sel',
      ready: 'rdy',
      lobby: 'lob',
      start: 'go',
      input: 'inp',
      snapshot: 'snp',
      result: 'res',
      returnLobby: 'rtl',
      pause: 'pau',
      pauseReq: 'prq',
      upgrade: 'upg',
      nextReady: 'nrd',
      nextReadyState: 'nrs',
      bye: 'bye',
    });
  });

  it('has no duplicate wire ids (each channel is distinct)', () => {
    const ids = Object.values(ACTIONS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every wire id within Trystero-safe length (<= 12 bytes)', () => {
    for (const id of Object.values(ACTIONS)) {
      expect(id.length).toBeGreaterThan(0);
      expect(id.length).toBeLessThanOrEqual(12);
    }
  });
});
