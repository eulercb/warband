// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../src/ui/state/store';
import type { AppState } from '../src/ui/state/store';
import { DEFAULT_CLASS } from '../src/engine/content/classes';
import { DEFAULT_MONSTER } from '../src/engine/content/monsters';
import type { FightResult } from '../src/engine/core/types';
import type { LobbyPlayer, NetSession } from '../src/net/protocol';

// localStorage keys mirror the (unexported) constants in src/ui/state/store.ts.
const NAME_KEY = 'warband.heroName.v1';
const VOLUME_KEY = 'warband.volume.v1';
const AUTOFIRE_KEY = 'warband.autofire.v1';

// Snapshot the pristine store (data + stable action refs) at import time, while
// localStorage is still empty, so we can restore it before every test.
const initialState: AppState = { ...useStore.getState() };

const noop = (): void => undefined;

/** A fully-typed no-op NetSession stub; `onLeave` lets reset() tests observe leave(). */
function makeSession(onLeave: () => void = noop): NetSession {
  return {
    isHost: true,
    selfId: 'self-id',
    localPlayerId: 0,
    setLocalInput: noop,
    getRenderState: () => null,
    setSelection: noop,
    setReady: noop,
    requestPause: noop,
    chooseUpgrade: noop,
    chooseCharUpgrade: noop,
    chooseSubSkill: noop,
    chooseExtraClass: noop,
    buyEphemeral: noop,
    setNextReady: noop,
    leave: onLeave,
  };
}

const player: LobbyPlayer = {
  peerId: 'p1',
  name: 'Alice',
  classId: 'mage',
  ready: true,
  isHost: false,
  isBot: false,
};

const result: FightResult = {
  outcome: 'victory',
  timeMs: 12_345,
  stats: [],
  monsterId: 'dragon',
};

function snapshot(): AppState {
  return { ...useStore.getState() };
}

/** Names of the state keys whose (reference) value differs between two snapshots. */
function changedKeys(before: AppState, after: AppState): string[] {
  const b = before as unknown as Record<string, unknown>;
  const a = after as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (b[k] !== a[k]) changed.push(k);
  }
  return changed.sort();
}

/** Re-import the store module so its load* helpers re-read the current localStorage. */
async function freshStore(): Promise<typeof useStore> {
  vi.resetModules();
  const mod = await import('../src/ui/state/store');
  return mod.useStore;
}

beforeEach(() => {
  localStorage.clear();
  useStore.setState(initialState);
});

describe('initial state', () => {
  it('has the documented defaults', () => {
    const s = useStore.getState();
    expect(s.phase).toBe('menu');
    expect(s.error).toBeNull();
    expect(s.hostLeft).toBe(false);
    expect(s.roomCode).toBeNull();
    expect(s.isHost).toBe(false);
    expect(s.session).toBeNull();
    expect(s.netMode).toBe('p2p');
    expect(s.peerCount).toBe(0);
    expect(s.netHint).toBeNull();
    expect(s.monsterId).toBe(DEFAULT_MONSTER);
    expect(s.players).toEqual([]);
    expect(s.lobbyPhase).toBe('lobby');
    expect(s.gauntlet).toBe(false);
    expect(s.localName).toBe('');
    expect(s.localClass).toBe(DEFAULT_CLASS);
    expect(s.localReady).toBe(false);
    expect(s.paused).toBe(false);
    expect(s.pausedBy).toBeNull();
    expect(s.resumeCountdown).toBeNull();
    expect(s.run).toBeNull();
    expect(s.cycle).toBe(0);
    expect(s.myUpgrades).toEqual([]);
    expect(s.myCharUpgrades).toEqual([]);
    expect(s.nextReadyReady).toBe(0);
    expect(s.nextReadyTotal).toBe(0);
    expect(s.result).toBeNull();
    expect(s.muted).toBe(false);
    expect(s.volume).toBeCloseTo(1);
    expect(s.autofire).toBe(false);
    expect(s.showControls).toBe(false);
  });
});

describe('navigation & transient UI', () => {
  it('setPhase changes phase and always dismisses the Controls overlay', () => {
    useStore.getState().setShowControls(true);
    const before = snapshot();
    useStore.getState().setPhase('game');
    const after = snapshot();
    expect(after.phase).toBe('game');
    expect(after.showControls).toBe(false);
    expect(changedKeys(before, after)).toEqual(['phase', 'showControls']);
  });

  it('setPhase leaves an already-closed Controls overlay untouched', () => {
    const before = snapshot();
    useStore.getState().setPhase('lobby');
    const after = snapshot();
    expect(after.phase).toBe('lobby');
    expect(changedKeys(before, after)).toEqual(['phase']);
  });

  it('setError sets and clears the error', () => {
    const before = snapshot();
    useStore.getState().setError('kaboom');
    const after = snapshot();
    expect(after.error).toBe('kaboom');
    expect(changedKeys(before, after)).toEqual(['error']);

    useStore.getState().setError(null);
    expect(useStore.getState().error).toBeNull();
  });

  it('setHostLeft toggles the flag', () => {
    const before = snapshot();
    useStore.getState().setHostLeft(true);
    const after = snapshot();
    expect(after.hostLeft).toBe(true);
    expect(changedKeys(before, after)).toEqual(['hostLeft']);
  });

  it('setShowControls opens the overlay', () => {
    const before = snapshot();
    useStore.getState().setShowControls(true);
    const after = snapshot();
    expect(after.showControls).toBe(true);
    expect(changedKeys(before, after)).toEqual(['showControls']);
  });
});

describe('room & session', () => {
  it('setRoom sets roomCode and isHost together', () => {
    const before = snapshot();
    useStore.getState().setRoom('ROOM12', true);
    const after = snapshot();
    expect(after.roomCode).toBe('ROOM12');
    expect(after.isHost).toBe(true);
    expect(changedKeys(before, after)).toEqual(['isHost', 'roomCode']);
  });

  it('setRoom(null, false) clears the room', () => {
    useStore.getState().setRoom('X', true);
    useStore.getState().setRoom(null, false);
    expect(useStore.getState().roomCode).toBeNull();
    expect(useStore.getState().isHost).toBe(false);
  });

  it('setSession stores and clears the session', () => {
    const s = makeSession();
    const before = snapshot();
    useStore.getState().setSession(s);
    const after = snapshot();
    expect(after.session).toBe(s);
    expect(changedKeys(before, after)).toEqual(['session']);

    useStore.getState().setSession(null);
    expect(useStore.getState().session).toBeNull();
  });

  it('setNetMode switches the transport', () => {
    const before = snapshot();
    useStore.getState().setNetMode('relay');
    const after = snapshot();
    expect(after.netMode).toBe('relay');
    expect(changedKeys(before, after)).toEqual(['netMode']);
  });

  it('setPeerCount records connectivity', () => {
    const before = snapshot();
    useStore.getState().setPeerCount(3);
    const after = snapshot();
    expect(after.peerCount).toBe(3);
    expect(changedKeys(before, after)).toEqual(['peerCount']);
  });

  it('setNetHint sets and clears the connectivity hint', () => {
    const before = snapshot();
    useStore.getState().setNetHint('connecting…');
    const after = snapshot();
    expect(after.netHint).toBe('connecting…');
    expect(changedKeys(before, after)).toEqual(['netHint']);

    useStore.getState().setNetHint(null);
    expect(useStore.getState().netHint).toBeNull();
  });
});

describe('lobby & local selections', () => {
  it('setMonster picks the boss', () => {
    const before = snapshot();
    useStore.getState().setMonster('troll');
    const after = snapshot();
    expect(after.monsterId).toBe('troll');
    expect(changedKeys(before, after)).toEqual(['monsterId']);
  });

  it('setGauntlet toggles the gauntlet flag', () => {
    const before = snapshot();
    useStore.getState().setGauntlet(true);
    const after = snapshot();
    expect(after.gauntlet).toBe(true);
    expect(changedKeys(before, after)).toEqual(['gauntlet']);
  });

  it('setLobby mirrors players, monster, phase and gauntlet at once', () => {
    const players = [player];
    const before = snapshot();
    useStore.getState().setLobby(players, 'lich', 'inFight', true);
    const after = snapshot();
    expect(after.players).toBe(players);
    expect(after.monsterId).toBe('lich');
    expect(after.lobbyPhase).toBe('inFight');
    expect(after.gauntlet).toBe(true);
    expect(changedKeys(before, after)).toEqual(['gauntlet', 'lobbyPhase', 'monsterId', 'players']);
  });

  it('setLocalClass changes the picked class', () => {
    const before = snapshot();
    useStore.getState().setLocalClass('ranger');
    const after = snapshot();
    expect(after.localClass).toBe('ranger');
    expect(changedKeys(before, after)).toEqual(['localClass']);
  });

  it('setLocalReady flips readiness', () => {
    const before = snapshot();
    useStore.getState().setLocalReady(true);
    const after = snapshot();
    expect(after.localReady).toBe(true);
    expect(changedKeys(before, after)).toEqual(['localReady']);
  });
});

describe('hero name persistence', () => {
  it('setLocalName updates state and persists to localStorage', () => {
    const before = snapshot();
    useStore.getState().setLocalName('Aragorn');
    const after = snapshot();
    expect(after.localName).toBe('Aragorn');
    expect(changedKeys(before, after)).toEqual(['localName']);
    expect(localStorage.getItem(NAME_KEY)).toBe('Aragorn');
  });

  it('setLocalName does not cap length at write time (the 16-char cap is load-only)', () => {
    const long = 'x'.repeat(30);
    useStore.getState().setLocalName(long);
    expect(useStore.getState().localName).toHaveLength(30);
    expect(localStorage.getItem(NAME_KEY)).toBe(long);
  });
});

describe('fight / run state', () => {
  it('setPaused freezes the sim', () => {
    const before = snapshot();
    useStore.getState().setPaused(true);
    const after = snapshot();
    expect(after.paused).toBe(true);
    expect(changedKeys(before, after)).toEqual(['paused']);
  });

  it('setPausedBy sets and clears the pauser name', () => {
    const before = snapshot();
    useStore.getState().setPausedBy('Bob');
    const after = snapshot();
    expect(after.pausedBy).toBe('Bob');
    expect(changedKeys(before, after)).toEqual(['pausedBy']);

    useStore.getState().setPausedBy(null);
    expect(useStore.getState().pausedBy).toBeNull();
  });

  it('setResumeCountdown sets and clears the countdown', () => {
    const before = snapshot();
    useStore.getState().setResumeCountdown(3);
    const after = snapshot();
    expect(after.resumeCountdown).toBe(3);
    expect(changedKeys(before, after)).toEqual(['resumeCountdown']);

    useStore.getState().setResumeCountdown(null);
    expect(useStore.getState().resumeCountdown).toBeNull();
  });

  it('setRun sets and clears gauntlet progress', () => {
    const run = { index: 1, total: 5 };
    const before = snapshot();
    useStore.getState().setRun(run);
    const after = snapshot();
    expect(after.run).toEqual(run);
    expect(changedKeys(before, after)).toEqual(['run']);

    useStore.getState().setRun(null);
    expect(useStore.getState().run).toBeNull();
  });

  it('setCycle records the endless cycle', () => {
    const before = snapshot();
    useStore.getState().setCycle(2);
    const after = snapshot();
    expect(after.cycle).toBe(2);
    expect(changedKeys(before, after)).toEqual(['cycle']);
  });
});

describe('per-run upgrades', () => {
  it('addMyUpgrade appends in order and allows duplicates', () => {
    const g = useStore.getState();
    g.addMyUpgrade('swift');
    g.addMyUpgrade('vigor');
    g.addMyUpgrade('swift');
    expect(useStore.getState().myUpgrades).toEqual(['swift', 'vigor', 'swift']);
  });

  it('addMyUpgrade produces a fresh array (immutably) touching only myUpgrades', () => {
    const before = snapshot();
    useStore.getState().addMyUpgrade('haste');
    const after = snapshot();
    expect(after.myUpgrades).toEqual(['haste']);
    expect(after.myUpgrades).not.toBe(before.myUpgrades);
    expect(changedKeys(before, after)).toEqual(['myUpgrades']);
  });

  it('addMyCharUpgrade appends to the character-upgrade list', () => {
    const g = useStore.getState();
    g.addMyCharUpgrade('cleave+');
    g.addMyCharUpgrade('bash+');
    const after = snapshot();
    expect(after.myCharUpgrades).toEqual(['cleave+', 'bash+']);
  });

  it('clearMyUpgrades empties every per-run progression list at once', () => {
    const g = useStore.getState();
    g.addMyUpgrade('swift');
    g.addMyCharUpgrade('cleave+');
    g.addMySubSkill('kn_champion', 'kn_champion_slam');
    const before = snapshot();
    g.clearMyUpgrades();
    const after = snapshot();
    expect(after.myUpgrades).toEqual([]);
    expect(after.myCharUpgrades).toEqual([]);
    expect(after.mySubSkills).toEqual([]);
    expect(after.myExtraClasses).toEqual([]);
    expect(after.mySubclassId).toBeNull();
    // The subclass-id key also resets; assert the list keys that flipped from ours.
    expect(changedKeys(before, after)).toEqual(
      expect.arrayContaining(['myCharUpgrades', 'myUpgrades', 'mySubSkills']),
    );
  });

  it('setNextReadyState records the between-boss tally', () => {
    const before = snapshot();
    useStore.getState().setNextReadyState(2, 4);
    const after = snapshot();
    expect(after.nextReadyReady).toBe(2);
    expect(after.nextReadyTotal).toBe(4);
    expect(changedKeys(before, after)).toEqual(['nextReadyReady', 'nextReadyTotal']);
  });
});

describe('ephemeral shop (item 21)', () => {
  it("awardCoinsFromResult banks this hero row's coins", () => {
    const g = useStore.getState();
    g.setSession(makeSession()); // selfId = 'self-id'
    g.awardCoinsFromResult({
      outcome: 'victory',
      timeMs: 1,
      monsterId: 'dragon',
      stats: [
        {
          peerId: 'self-id',
          name: 'Me',
          classId: 'knight',
          damageDealt: 0,
          healingDone: 0,
          revives: 0,
          deaths: 0,
          score: 0,
          coins: 5,
        },
        {
          peerId: 'other',
          name: 'O',
          classId: 'mage',
          damageDealt: 0,
          healingDone: 0,
          revives: 0,
          deaths: 0,
          score: 0,
          coins: 3,
        },
      ],
    });
    expect(useStore.getState().myCoins).toBe(5);
  });

  it('buyEphemeral deducts coins, mirrors the stock and relays to the host', () => {
    const bought: string[] = [];
    const session: NetSession = {
      ...makeSession(),
      buyEphemeral: (id) => {
        bought.push(id);
      },
    };
    const g = useStore.getState();
    g.setSession(session);
    useStore.setState({ myCoins: 10 });
    const ok = useStore.getState().buyEphemeral('potion');
    expect(ok).toBe(true);
    expect(useStore.getState().myCoins).toBe(7); // potion costs 3
    expect(useStore.getState().myEphemeral.potions).toBe(1);
    expect(bought).toEqual(['potion']);
  });

  it('buyEphemeral refuses a perk the hero cannot afford', () => {
    const g = useStore.getState();
    g.setSession(makeSession());
    useStore.setState({ myCoins: 1 });
    const ok = useStore.getState().buyEphemeral('revive'); // costs 6
    expect(ok).toBe(false);
    expect(useStore.getState().myCoins).toBe(1);
    expect(useStore.getState().myEphemeral.revives).toBeUndefined();
  });

  it('resetEphemeralStock clears the pending stock but keeps coins', () => {
    useStore.setState({ myCoins: 4, myEphemeral: { potions: 2, speed: true } });
    useStore.getState().resetEphemeralStock();
    expect(useStore.getState().myEphemeral).toEqual({});
    expect(useStore.getState().myCoins).toBe(4);
  });

  it('clearMyUpgrades also wipes coins and pending stock', () => {
    useStore.setState({ myCoins: 9, myEphemeral: { potions: 1 } });
    useStore.getState().clearMyUpgrades();
    expect(useStore.getState().myCoins).toBe(0);
    expect(useStore.getState().myEphemeral).toEqual({});
  });
});

describe('result', () => {
  it('setResult stores the fight result and clears it', () => {
    const before = snapshot();
    useStore.getState().setResult(result);
    const after = snapshot();
    expect(after.result).toBe(result);
    expect(changedKeys(before, after)).toEqual(['result']);

    useStore.getState().setResult(null);
    expect(useStore.getState().result).toBeNull();
  });
});

describe('audio & input options', () => {
  it('toggleMute flips the muted flag each call', () => {
    expect(useStore.getState().muted).toBe(false);
    useStore.getState().toggleMute();
    expect(useStore.getState().muted).toBe(true);
    useStore.getState().toggleMute();
    expect(useStore.getState().muted).toBe(false);
  });

  it('setVolume stores an in-range value and persists the exact string', () => {
    const before = snapshot();
    useStore.getState().setVolume(0.42);
    const after = snapshot();
    expect(after.volume).toBeCloseTo(0.42);
    expect(changedKeys(before, after)).toEqual(['volume']);
    expect(localStorage.getItem(VOLUME_KEY)).toBe('0.42');
  });

  it('setVolume clamps values above 1 (and persists the clamped value)', () => {
    useStore.getState().setVolume(1.5);
    expect(useStore.getState().volume).toBeCloseTo(1);
    expect(localStorage.getItem(VOLUME_KEY)).toBe('1');
  });

  it('setVolume clamps values below 0', () => {
    useStore.getState().setVolume(-0.5);
    expect(useStore.getState().volume).toBeCloseTo(0);
    expect(localStorage.getItem(VOLUME_KEY)).toBe('0');
  });

  it('raising volume above zero lifts an explicit mute', () => {
    useStore.getState().toggleMute(); // muted = true
    const before = snapshot();
    useStore.getState().setVolume(0.8);
    const after = snapshot();
    expect(after.volume).toBeCloseTo(0.8);
    expect(after.muted).toBe(false);
    expect(changedKeys(before, after)).toEqual(['muted', 'volume']);
  });

  it('setting volume to zero keeps an existing mute', () => {
    useStore.getState().toggleMute(); // muted = true
    useStore.getState().setVolume(0);
    expect(useStore.getState().volume).toBeCloseTo(0);
    expect(useStore.getState().muted).toBe(true);
  });

  it('setting volume to zero does not switch on mute when unmuted', () => {
    useStore.getState().setVolume(0);
    expect(useStore.getState().volume).toBeCloseTo(0);
    expect(useStore.getState().muted).toBe(false);
  });

  it('setAutofire(true) updates state and persists "1"', () => {
    const before = snapshot();
    useStore.getState().setAutofire(true);
    const after = snapshot();
    expect(after.autofire).toBe(true);
    expect(changedKeys(before, after)).toEqual(['autofire']);
    expect(localStorage.getItem(AUTOFIRE_KEY)).toBe('1');
  });

  it('setAutofire(false) persists "0"', () => {
    useStore.getState().setAutofire(true);
    useStore.getState().setAutofire(false);
    expect(useStore.getState().autofire).toBe(false);
    expect(localStorage.getItem(AUTOFIRE_KEY)).toBe('0');
  });
});

describe('reset', () => {
  it('returns to the menu, tears down the run, and calls session.leave()', () => {
    let leaveCount = 0;
    const session = makeSession(() => {
      leaveCount += 1;
    });
    const g = useStore.getState();
    // Dirty the reset-managed fields.
    g.setSession(session);
    g.setRoom('ROOM12', true);
    g.setPhase('game');
    g.setError('boom');
    g.setHostLeft(true);
    g.setPeerCount(4);
    g.setNetHint('connecting');
    g.setLobby([player], 'lich', 'inFight', true);
    g.setLocalReady(true);
    g.setPaused(true);
    g.setPausedBy('Bob');
    g.setResumeCountdown(3);
    g.setRun({ index: 1, total: 3 });
    g.setCycle(2);
    g.addMyUpgrade('swift');
    g.addMyCharUpgrade('cleave+');
    g.setNextReadyState(2, 4);
    g.setResult(result);
    g.setShowControls(true);

    useStore.getState().reset();
    const s = useStore.getState();

    expect(leaveCount).toBe(1);
    expect(s.phase).toBe('menu');
    expect(s.error).toBeNull();
    expect(s.hostLeft).toBe(false);
    expect(s.roomCode).toBeNull();
    expect(s.isHost).toBe(false);
    expect(s.session).toBeNull();
    expect(s.peerCount).toBe(0);
    expect(s.netHint).toBeNull();
    expect(s.players).toEqual([]);
    expect(s.lobbyPhase).toBe('lobby');
    expect(s.localReady).toBe(false);
    expect(s.paused).toBe(false);
    expect(s.pausedBy).toBeNull();
    expect(s.resumeCountdown).toBeNull();
    expect(s.run).toBeNull();
    expect(s.cycle).toBe(0);
    expect(s.myUpgrades).toEqual([]);
    expect(s.myCharUpgrades).toEqual([]);
    expect(s.nextReadyReady).toBe(0);
    expect(s.nextReadyTotal).toBe(0);
    expect(s.result).toBeNull();
    expect(s.showControls).toBe(false);
  });

  it('preserves persisted prefs and non-run settings across a reset', () => {
    const g = useStore.getState();
    g.setNetMode('relay');
    g.setMonster('troll');
    g.setLocalName('Keeper');
    g.setLocalClass('mage');
    g.toggleMute(); // muted = true
    g.setVolume(0); // volume 0, mute retained
    g.setAutofire(true);
    g.setGauntlet(true);

    useStore.getState().reset();
    const s = useStore.getState();

    expect(s.netMode).toBe('relay');
    expect(s.monsterId).toBe('troll');
    expect(s.localName).toBe('Keeper');
    expect(s.localClass).toBe('mage');
    expect(s.muted).toBe(true);
    expect(s.volume).toBeCloseTo(0);
    expect(s.autofire).toBe(true);
    // gauntlet is a lobby setting, likewise untouched by reset().
    expect(s.gauntlet).toBe(true);
  });

  it('swallows errors thrown by session.leave()', () => {
    const session = makeSession(() => {
      throw new Error('leave failed');
    });
    useStore.getState().setSession(session);
    expect(() => {
      useStore.getState().reset();
    }).not.toThrow();
    expect(useStore.getState().session).toBeNull();
    expect(useStore.getState().phase).toBe('menu');
  });

  it('works when there is no active session', () => {
    useStore.getState().setPhase('lobby');
    expect(() => {
      useStore.getState().reset();
    }).not.toThrow();
    expect(useStore.getState().session).toBeNull();
    expect(useStore.getState().phase).toBe('menu');
  });
});

describe('persistence resilience', () => {
  it('setters swallow localStorage write failures but still update state', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    try {
      expect(() => {
        useStore.getState().setLocalName('Boromir');
      }).not.toThrow();
      expect(useStore.getState().localName).toBe('Boromir');

      expect(() => {
        useStore.getState().setVolume(0.3);
      }).not.toThrow();
      expect(useStore.getState().volume).toBeCloseTo(0.3);

      expect(() => {
        useStore.getState().setAutofire(true);
      }).not.toThrow();
      expect(useStore.getState().autofire).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('setters skip persistence but still update state when localStorage is absent', () => {
    vi.stubGlobal('localStorage', undefined);
    try {
      expect(() => {
        useStore.getState().setLocalName('Faramir');
      }).not.toThrow();
      expect(useStore.getState().localName).toBe('Faramir');

      expect(() => {
        useStore.getState().setVolume(0.6);
      }).not.toThrow();
      expect(useStore.getState().volume).toBeCloseTo(0.6);

      expect(() => {
        useStore.getState().setAutofire(true);
      }).not.toThrow();
      expect(useStore.getState().autofire).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('load helpers use defaults when localStorage is absent at module init', async () => {
    vi.stubGlobal('localStorage', undefined);
    try {
      const store = await freshStore();
      const s = store.getState();
      expect(s.localName).toBe('');
      expect(s.volume).toBeCloseTo(1);
      expect(s.autofire).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('persisted preference loading (fresh module init)', () => {
  it('loads a persisted hero name, capping it at 16 chars', async () => {
    localStorage.setItem(NAME_KEY, 'x'.repeat(40));
    const store = await freshStore();
    expect(store.getState().localName).toBe('x'.repeat(16));
  });

  it('loads a short hero name unchanged', async () => {
    localStorage.setItem(NAME_KEY, 'Gimli');
    const store = await freshStore();
    expect(store.getState().localName).toBe('Gimli');
  });

  it('defaults the hero name to empty when unset', async () => {
    const store = await freshStore();
    expect(store.getState().localName).toBe('');
  });

  it('loads an in-range persisted volume', async () => {
    localStorage.setItem(VOLUME_KEY, '0.25');
    const store = await freshStore();
    expect(store.getState().volume).toBeCloseTo(0.25);
  });

  it('clamps a persisted volume above 1 down to 1', async () => {
    localStorage.setItem(VOLUME_KEY, '5');
    const store = await freshStore();
    expect(store.getState().volume).toBeCloseTo(1);
  });

  it('clamps a persisted negative volume up to 0', async () => {
    localStorage.setItem(VOLUME_KEY, '-3');
    const store = await freshStore();
    expect(store.getState().volume).toBeCloseTo(0);
  });

  it('falls back to full volume for a non-finite persisted value', async () => {
    localStorage.setItem(VOLUME_KEY, 'not-a-number');
    const store = await freshStore();
    expect(store.getState().volume).toBeCloseTo(1);
  });

  it('defaults volume to 1 when unset', async () => {
    const store = await freshStore();
    expect(store.getState().volume).toBeCloseTo(1);
  });

  it('loads autofire on when persisted as "1"', async () => {
    localStorage.setItem(AUTOFIRE_KEY, '1');
    const store = await freshStore();
    expect(store.getState().autofire).toBe(true);
  });

  it('loads autofire off for any non-"1" persisted value', async () => {
    localStorage.setItem(AUTOFIRE_KEY, '0');
    const store = await freshStore();
    expect(store.getState().autofire).toBe(false);
  });

  it('defaults autofire off when unset', async () => {
    const store = await freshStore();
    expect(store.getState().autofire).toBe(false);
  });

  it('load helpers fall back to defaults when localStorage.getItem throws', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    try {
      const store = await freshStore();
      const s = store.getState();
      expect(s.localName).toBe('');
      expect(s.volume).toBeCloseTo(1);
      expect(s.autofire).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
