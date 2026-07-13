// @vitest-environment jsdom
/**
 * Branch-coverage tests for src/ui/state/session.ts. This complements
 * tests/session.test.ts by driving the *other* side of each guard that the
 * happy-path suite leaves half-covered:
 *  - the mute/volume audio-sync store subscription (change vs no-change),
 *  - resolveHostSeed across every seed mode (random / daily / custom / empty / 0),
 *  - the client onStart / onResult / onLobby / onPeers callbacks,
 *  - applyPauseState's named / anonymous / resumed branches,
 *  - handleJoinError filtering (TURN match vs miss vs already-connected),
 *  - the connectivity-timeout guard (still searching vs peer already present),
 *  - and every host-only action's non-host (Client) inert path.
 *
 * Host / Client / Sfx / room / log are mocked exactly as in session.test.ts so we
 * exercise session's own wiring with no real networking or audio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture constructor options of the mocked Host/Client so tests can invoke the
// callbacks session.ts passes in, and assert on the imperative methods it calls.
interface Captured {
  opts: Record<string, (...args: unknown[]) => unknown>;
  spies: Record<string, ReturnType<typeof vi.fn>>;
}
const hosts: Captured[] = [];
const clients: Captured[] = [];

function makeSpies(): Record<string, ReturnType<typeof vi.fn>> {
  const names = [
    'setSelection',
    'setReady',
    'startFight',
    'retryFight',
    'advanceGauntlet',
    'returnToLobby',
    'setMonster',
    'setGauntlet',
    'addBot',
    'removeBot',
    'setBotClass',
    'requestPause',
    'chooseUpgrade',
    'chooseCharUpgrade',
    'chooseSubSkill',
    'chooseExtraClass',
    'setNextReady',
    'continueEndless',
    'endRun',
    'leave',
  ];
  const out: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const n of names) out[n] = vi.fn();
  return out;
}

vi.mock('../src/net/session/host', () => {
  class Host {
    constructor(opts: Record<string, (...a: unknown[]) => unknown>) {
      const spies = makeSpies();
      Object.assign(this, spies);
      hosts.push({ opts, spies });
    }
  }
  return { Host };
});

vi.mock('../src/net/session/client', () => {
  class Client {
    constructor(opts: Record<string, (...a: unknown[]) => unknown>) {
      const spies = makeSpies();
      Object.assign(this, spies);
      clients.push({ opts, spies });
    }
  }
  return { Client };
});

// Hoisted so the mock factory (hoisted above imports) can reference it when
// session.ts builds its `Sfx` at module-load time.
const sfxSpies = vi.hoisted(() => ({
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  resume: vi.fn(),
  play: vi.fn(),
}));
vi.mock('../src/audio/sfx', () => {
  class Sfx {
    setVolume = sfxSpies.setVolume;
    setMuted = sfxSpies.setMuted;
    resume = sfxSpies.resume;
    play = sfxSpies.play;
  }
  return { Sfx };
});

vi.mock('../src/net/transport/room', () => ({
  generateRoomCode: vi.fn(() => 'ABC234'),
  writeRoomToHash: vi.fn(),
  shareLinkFor: vi.fn((code: string, net: string) => `https://warband/#room=${code}&net=${net}`),
  selfId: 'selfpeerid',
}));

vi.mock('../src/net/log', () => ({ netLog: vi.fn(), netWarn: vi.fn() }));

// Import the SUT and store AFTER the mocks are registered.
import * as session from '../src/ui/state/session';
import { useStore } from '../src/ui/state/store';

function resetStore(): void {
  useStore.setState({
    phase: 'menu',
    error: null,
    hostLeft: false,
    roomCode: null,
    isHost: false,
    session: null,
    netMode: 'p2p',
    peerCount: 0,
    netHint: null,
    players: [],
    lobbyPhase: 'lobby',
    gauntlet: false,
    seedMode: 'random',
    seedInput: '',
    activeRunSeed: null,
    hardcore: false,
    activeHardcore: false,
    localName: 'Tester',
    localClass: 'knight',
    localReady: false,
    paused: false,
    pausedBy: null,
    resumeCountdown: null,
    run: null,
    cycle: 0,
    myUpgrades: [],
    myCharUpgrades: [],
    mySubclassId: null,
    mySubSkills: [],
    myExtraClasses: [],
    myCoins: 0,
    myEphemeral: {},
    nextReadyReady: 0,
    nextReadyTotal: 0,
    result: null,
    muted: false,
    volume: 1,
    showControls: false,
  });
}

beforeEach(() => {
  hosts.length = 0;
  clients.length = 0;
  localStorage.clear();
  resetStore();
  // Clear audio spies AFTER the reset so any mute/volume writes the reset itself
  // triggers via the store subscription don't leak into a test's expectations.
  for (const s of Object.values(sfxSpies)) s.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

const st = () => useStore.getState();

// ---------------------------------------------------------------------------
// Module-level store subscription: only touch the audio bus on a real change.
// ---------------------------------------------------------------------------
describe('audio bus stays in sync with the store', () => {
  it('writes mute/volume only when that value actually changes', () => {
    useStore.setState({ muted: false, volume: 1 });
    sfxSpies.setMuted.mockClear();
    sfxSpies.setVolume.mockClear();

    // muted flips -> setMuted(true); volume unchanged -> setVolume untouched.
    useStore.setState({ muted: true });
    expect(sfxSpies.setMuted).toHaveBeenLastCalledWith(true);
    expect(sfxSpies.setVolume).not.toHaveBeenCalled();

    // volume changes -> setVolume(0.25); muted unchanged -> setMuted untouched.
    sfxSpies.setMuted.mockClear();
    useStore.setState({ volume: 0.25 });
    expect(sfxSpies.setVolume).toHaveBeenLastCalledWith(0.25);
    expect(sfxSpies.setMuted).not.toHaveBeenCalled();

    // An unrelated update touches neither audio setter.
    sfxSpies.setMuted.mockClear();
    sfxSpies.setVolume.mockClear();
    useStore.setState({ phase: 'lobby' });
    expect(sfxSpies.setMuted).not.toHaveBeenCalled();
    expect(sfxSpies.setVolume).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resolveHostSeed (reached through hostGame, surfaced as the Host's `seed` opt).
// ---------------------------------------------------------------------------
describe('resolveHostSeed covers every seed mode', () => {
  it('falls back to a generated hero name when the local name is blank', async () => {
    useStore.setState({ localName: '   ' });
    await session.hostGame();
    expect(hosts[0].opts.name).toBe('Hero-self'); // selfId 'selfpeerid'.slice(0, 4)
  });

  it('mints no seed when the gauntlet is off (seeds only govern gauntlets)', async () => {
    useStore.setState({ gauntlet: false, seedMode: 'daily' });
    await session.hostGame();
    expect(hosts[0].opts.seed).toBeUndefined();
  });

  it('random mode leaves the seed for the host to mint', async () => {
    useStore.setState({ gauntlet: true, seedMode: 'random' });
    await session.hostGame();
    expect(hosts[0].opts.seed).toBeUndefined();
  });

  it('daily mode derives a numeric seed from the UTC date', async () => {
    useStore.setState({ gauntlet: true, seedMode: 'daily' });
    await session.hostGame();
    expect(typeof hosts[0].opts.seed).toBe('number');
  });

  it('custom numeric text uses the number directly', async () => {
    useStore.setState({ gauntlet: true, seedMode: 'custom', seedInput: '12345' });
    await session.hostGame();
    expect(hosts[0].opts.seed).toBe(12345);
  });

  it('custom "0" falls back to 1 (never a zero seed)', async () => {
    useStore.setState({ gauntlet: true, seedMode: 'custom', seedInput: '0' });
    await session.hostGame();
    expect(hosts[0].opts.seed).toBe(1);
  });

  it('custom non-numeric text hashes its characters to a number', async () => {
    useStore.setState({ gauntlet: true, seedMode: 'custom', seedInput: 'warband' });
    await session.hostGame();
    expect(typeof hosts[0].opts.seed).toBe('number');
  });

  it('an empty custom seed mints no seed', async () => {
    useStore.setState({ gauntlet: true, seedMode: 'custom', seedInput: '   ' });
    await session.hostGame();
    expect(hosts[0].opts.seed).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Host callbacks: onStart fresh-vs-mid run, onPause branches, onResult, mirrors.
// ---------------------------------------------------------------------------
describe('Host callbacks drive the store', () => {
  beforeEach(async () => {
    await session.hostGame();
  });

  it('onStart clears carried upgrades on a fresh run (index 0, cycle 0)', () => {
    useStore.setState({ myUpgrades: ['swift'], myCharUpgrades: ['knight:rage'] });
    hosts[0].opts.onStart({ runIndex: 0, runTotal: 3, cycle: 0, runSeed: 1, hardcore: false });
    expect(st().phase).toBe('game');
    expect(st().run).toEqual({ index: 0, total: 3 });
    expect(st().myUpgrades).toEqual([]);
    expect(st().myCharUpgrades).toEqual([]);
  });

  it('onStart keeps carried upgrades mid-gauntlet (index > 0)', () => {
    useStore.setState({ myUpgrades: ['swift'], myCharUpgrades: ['knight:rage'] });
    hosts[0].opts.onStart({ runIndex: 1, runTotal: 3, cycle: 0, runSeed: 9, hardcore: true });
    expect(st().phase).toBe('game');
    expect(st().myUpgrades).toEqual(['swift']);
    expect(st().activeHardcore).toBe(true);
  });

  it('onStart resets only the coin purse on a fresh CYCLE (index 0, cycle > 0)', () => {
    useStore.setState({ myUpgrades: ['swift'], myCoins: 50, myEphemeral: { potions: 2 } });
    // index 0 with cycle > 0 takes the `else s.resetCoins()` arm: the build persists,
    // only coins + ephemeral stock reset (item 23).
    hosts[0].opts.onStart({ runIndex: 0, runTotal: 3, cycle: 1, runSeed: 7, hardcore: false });
    expect(st().phase).toBe('game');
    expect(st().myUpgrades).toEqual(['swift']); // NOT cleared -> the else arm, not clearMyUpgrades
    expect(st().myCoins).toBe(0);
    expect(st().myEphemeral).toEqual({});
  });

  it('onPause mirrors named, anonymous, and resumed shared-pause states', () => {
    hosts[0].opts.onPause(true, { byName: 'Bob', countdown: 3 });
    expect(st().paused).toBe(true);
    expect(st().pausedBy).toBe('Bob');
    expect(st().resumeCountdown).toBe(3);

    // Paused but no name provided -> ?? null fallback.
    hosts[0].opts.onPause(true, { countdown: null });
    expect(st().paused).toBe(true);
    expect(st().pausedBy).toBeNull();

    // Resumed -> pausedBy is forced null regardless of name.
    hosts[0].opts.onPause(false, { byName: 'Bob', countdown: null });
    expect(st().paused).toBe(false);
    expect(st().pausedBy).toBeNull();
  });

  it('onResult banks the result and plays the matching outcome sting', () => {
    hosts[0].opts.onResult({ outcome: 'victory' });
    expect(st().phase).toBe('result');
    expect(sfxSpies.resume).toHaveBeenCalled();
    expect(sfxSpies.play).toHaveBeenCalledWith('victory');

    hosts[0].opts.onResult({ outcome: 'defeat' });
    expect(sfxSpies.play).toHaveBeenCalledWith('defeat');
  });

  it('onLobby / onNextReady / onPeers / onError mirror into the store', () => {
    hosts[0].opts.onLobby({
      players: [],
      monsterId: st().monsterId,
      phase: 'lobby',
      gauntlet: true,
    });
    expect(st().gauntlet).toBe(true);
    hosts[0].opts.onNextReady({ ready: 2, total: 4 });
    expect(st().nextReadyReady).toBe(2);
    expect(st().nextReadyTotal).toBe(4);
    hosts[0].opts.onPeers(3);
    expect(st().peerCount).toBe(3);
    hosts[0].opts.onError('boom');
    expect(st().error).toBe('boom');
  });
});

// ---------------------------------------------------------------------------
// Client callbacks (never exercised by the happy-path suite).
// ---------------------------------------------------------------------------
describe('Client callbacks drive the store', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await session.joinGame('abc234');
  });

  it('onStart applies a provided seed + hardcore flag and clears upgrades on a fresh run', () => {
    useStore.setState({ myUpgrades: ['swift'], activeRunSeed: null, activeHardcore: false });
    clients[0].opts.onStart({ runIndex: 0, runTotal: 3, cycle: 0, runSeed: 777, hardcore: true });
    expect(st().activeRunSeed).toBe(777);
    expect(st().activeHardcore).toBe(true);
    expect(st().myUpgrades).toEqual([]);
    expect(st().phase).toBe('game');
  });

  it('onStart without seed/hardcore keeps the seed, defaults hardcore off, keeps upgrades mid-run', () => {
    useStore.setState({ myUpgrades: ['swift'], activeRunSeed: 42, activeHardcore: true });
    clients[0].opts.onStart({ runIndex: 2, runTotal: 3, cycle: 1 });
    expect(st().activeRunSeed).toBe(42); // runSeed == null -> left untouched
    expect(st().activeHardcore).toBe(false); // hardcore ?? false
    expect(st().myUpgrades).toEqual(['swift']); // not a fresh run -> kept
    expect(st().phase).toBe('game');
  });

  it('onStart resets only the coin purse on a fresh CYCLE (index 0, cycle > 0)', () => {
    useStore.setState({ myUpgrades: ['swift'], myCoins: 50, myEphemeral: { potions: 2 } });
    // Mirrors the host path: index 0 + cycle > 0 keeps the build but resets coins.
    clients[0].opts.onStart({ runIndex: 0, runTotal: 3, cycle: 1, runSeed: 7, hardcore: false });
    expect(st().phase).toBe('game');
    expect(st().myUpgrades).toEqual(['swift']); // NOT cleared -> the else arm
    expect(st().myCoins).toBe(0);
    expect(st().myEphemeral).toEqual({});
  });

  it('onResult plays victory then defeat stings and shows the result', () => {
    clients[0].opts.onResult({ outcome: 'victory' });
    expect(sfxSpies.resume).toHaveBeenCalled();
    expect(sfxSpies.play).toHaveBeenCalledWith('victory');
    clients[0].opts.onResult({ outcome: 'defeat' });
    expect(sfxSpies.play).toHaveBeenCalledWith('defeat');
    expect(st().phase).toBe('result');
  });

  it('onLobby returns a lobby-phase player to the lobby from both waiting and join', () => {
    useStore.setState({ phase: 'waiting' });
    clients[0].opts.onLobby({
      players: [],
      monsterId: st().monsterId,
      phase: 'lobby',
      gauntlet: false,
    });
    expect(st().phase).toBe('lobby');

    useStore.setState({ phase: 'join' });
    clients[0].opts.onLobby({
      players: [],
      monsterId: st().monsterId,
      phase: 'lobby',
      gauntlet: false,
    });
    expect(st().phase).toBe('lobby');
  });

  it('onLobby leaves an in-game player alone and does not pull other screens into the lobby', () => {
    // Already in the fight: inFight message must not bounce us to "waiting".
    useStore.setState({ phase: 'game' });
    clients[0].opts.onLobby({
      players: [],
      monsterId: st().monsterId,
      phase: 'inFight',
      gauntlet: false,
    });
    expect(st().phase).toBe('game');

    // lobby message while on the menu: neither join nor waiting -> no transition.
    useStore.setState({ phase: 'menu' });
    clients[0].opts.onLobby({
      players: [],
      monsterId: st().monsterId,
      phase: 'lobby',
      gauntlet: false,
    });
    expect(st().phase).toBe('menu');
  });

  it('onLobby moves a late joiner to waiting when a fight is in progress', () => {
    clients[0].opts.onLobby({
      players: [],
      monsterId: st().monsterId,
      phase: 'inFight',
      gauntlet: false,
    });
    expect(st().phase).toBe('waiting');
  });

  it('onPeers(1) proves the host link and clears the pending hint + timer', () => {
    useStore.setState({ netHint: 'searching' });
    clients[0].opts.onPeers(1);
    expect(st().peerCount).toBe(1);
    expect(st().netHint).toBeNull();
    // The timer was cleared: crossing the timeout must not re-arm the hint.
    vi.advanceTimersByTime(20000);
    expect(st().netHint).toBeNull();
  });

  it('onPeers(0) updates the count but leaves any pending hint intact', () => {
    useStore.setState({ netHint: 'searching' });
    clients[0].opts.onPeers(0);
    expect(st().peerCount).toBe(0);
    expect(st().netHint).toBe('searching');
  });

  it('onNextReady / onError mirror into the store', () => {
    clients[0].opts.onNextReady({ ready: 1, total: 3 });
    expect(st().nextReadyReady).toBe(1);
    expect(st().nextReadyTotal).toBe(3);
    clients[0].opts.onError('client boom');
    expect(st().error).toBe('client boom');
  });

  it('onReturnLobby / onHostLeft return the client to lobby / menu', () => {
    clients[0].opts.onReturnLobby();
    expect(st().phase).toBe('lobby');

    clients[0].opts.onHostLeft();
    expect(st().hostLeft).toBe(true);
    expect(st().session).toBeNull();
    expect(st().phase).toBe('menu');
    expect(st().error).toMatch(/Host disconnected/);
  });
});

// ---------------------------------------------------------------------------
// The 15s connectivity-timeout guard.
// ---------------------------------------------------------------------------
describe('connectivity-timeout hint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('surfaces the "still reaching the host" hint when no peer arrives in time', async () => {
    await session.joinGame('abc234');
    expect(st().netHint).toBeNull();
    vi.advanceTimersByTime(15000);
    expect(st().netHint).toMatch(/Still reaching the host/);
  });

  it('is suppressed when a peer is already present as the timer fires', async () => {
    await session.joinGame('abc234');
    // Reach a peer WITHOUT going through onPeers (which would clear the timer),
    // so the timer still fires but its peerCount===0 guard is now false.
    useStore.setState({ peerCount: 3 });
    vi.advanceTimersByTime(15000);
    expect(st().netHint).toBeNull();
  });

  it('is suppressed when the room changed out from under the timer', async () => {
    await session.joinGame('abc234');
    useStore.setState({ roomCode: 'OTHER1' });
    vi.advanceTimersByTime(15000);
    expect(st().netHint).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// handleJoinError filtering (shared by host + client onJoinError).
// ---------------------------------------------------------------------------
describe('join-error handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('surfaces a TURN/NAT hint for a post-SDP failure while unconnected', async () => {
    await session.joinGame('abc234');
    clients[0].opts.onJoinError('connection failed after exchanging SDP');
    expect(st().netHint).toMatch(/TURN relay/);
  });

  it('ignores an unrelated join error (no SDP/TURN text)', async () => {
    await session.joinGame('abc234');
    clients[0].opts.onJoinError('tracker handshake hiccup');
    expect(st().netHint).toBeNull();
  });

  it('ignores any join error once at least one peer is connected', async () => {
    await session.joinGame('abc234');
    useStore.setState({ peerCount: 1 });
    clients[0].opts.onJoinError('failed after exchanging SDP');
    expect(st().netHint).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Host-only actions: the TRUE side (active Host) and the inert non-host side.
// ---------------------------------------------------------------------------
describe('host-only actions with an active Host', () => {
  beforeEach(async () => {
    await session.hostGame();
  });

  it('fight-lifecycle actions call straight through to the Host', () => {
    session.startFight();
    session.retryFight();
    session.advanceGauntlet();
    session.continueEndless();
    session.endRun();
    const s = hosts[0].spies;
    expect(s.startFight).toHaveBeenCalled();
    expect(s.retryFight).toHaveBeenCalled();
    expect(s.advanceGauntlet).toHaveBeenCalled();
    expect(s.continueEndless).toHaveBeenCalled();
    expect(s.endRun).toHaveBeenCalledWith('defeat');
  });

  it('lobby-config + bot actions update local state and call the Host', () => {
    session.setMonster('troll');
    session.setGauntlet(true);
    session.addBot('mage');
    session.removeBot('bot1');
    session.setBotClass('bot1', 'knight');
    const s = hosts[0].spies;
    expect(st().monsterId).toBe('troll');
    expect(s.setMonster).toHaveBeenCalledWith('troll');
    expect(st().gauntlet).toBe(true);
    expect(s.setGauntlet).toHaveBeenCalledWith(true);
    expect(s.addBot).toHaveBeenCalledWith('mage');
    expect(s.removeBot).toHaveBeenCalledWith('bot1');
    expect(s.setBotClass).toHaveBeenCalledWith('bot1', 'knight');
  });

  it('returnToLobby resets local run state and tells the Host', () => {
    useStore.setState({
      run: { index: 1, total: 2 },
      result: { outcome: 'defeat' } as never,
      localReady: true,
    });
    session.returnToLobby();
    expect(hosts[0].spies.returnToLobby).toHaveBeenCalled();
    expect(st().run).toBeNull();
    expect(st().result).toBeNull();
    expect(st().localReady).toBe(false);
    expect(st().phase).toBe('lobby');
  });
});

describe('host-only actions are inert for a client (non-host) session', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await session.joinGame('abc234'); // Client session, isHost === false
  });

  it('fight-lifecycle actions never reach a non-Host session', () => {
    session.startFight();
    session.retryFight();
    session.advanceGauntlet();
    session.continueEndless();
    session.endRun();
    const c = clients[0].spies;
    expect(c.startFight).not.toHaveBeenCalled();
    expect(c.retryFight).not.toHaveBeenCalled();
    expect(c.advanceGauntlet).not.toHaveBeenCalled();
    expect(c.continueEndless).not.toHaveBeenCalled();
    expect(c.endRun).not.toHaveBeenCalled();
  });

  it('bot actions never reach a non-Host session', () => {
    session.addBot('mage');
    session.removeBot('bot1');
    session.setBotClass('bot1', 'knight');
    const c = clients[0].spies;
    expect(c.addBot).not.toHaveBeenCalled();
    expect(c.removeBot).not.toHaveBeenCalled();
    expect(c.setBotClass).not.toHaveBeenCalled();
  });

  it('setMonster/setGauntlet still update local state but skip the non-Host session', () => {
    session.setMonster('troll');
    session.setGauntlet(true);
    const c = clients[0].spies;
    expect(st().monsterId).toBe('troll');
    expect(st().gauntlet).toBe(true);
    expect(c.setMonster).not.toHaveBeenCalled();
    expect(c.setGauntlet).not.toHaveBeenCalled();
  });

  it('returnToLobby resets local state and returns to lobby without a Host call', () => {
    useStore.setState({ run: { index: 1, total: 2 }, result: { outcome: 'defeat' } as never });
    session.returnToLobby();
    expect(clients[0].spies.returnToLobby).not.toHaveBeenCalled();
    expect(st().run).toBeNull();
    expect(st().result).toBeNull();
    expect(st().phase).toBe('lobby');
  });
});

// ---------------------------------------------------------------------------
// Per-player relays: session present vs the optional-chaining no-session path.
// ---------------------------------------------------------------------------
describe('per-player relays', () => {
  it('reach the active session and record local intent', async () => {
    await session.hostGame();
    session.selectClass('mage');
    expect(st().localClass).toBe('mage');
    expect(hosts[0].spies.setSelection).toHaveBeenCalledWith('mage');

    session.setReady(true);
    expect(st().localReady).toBe(true);
    expect(hosts[0].spies.setReady).toHaveBeenCalledWith(true);

    session.requestPause(true);
    expect(hosts[0].spies.requestPause).toHaveBeenCalledWith(true);

    session.setNextReady(true);
    expect(hosts[0].spies.setNextReady).toHaveBeenCalledWith(true);

    session.chooseUpgrade('swift');
    expect(hosts[0].spies.chooseUpgrade).toHaveBeenCalledWith('swift');
    expect(st().myUpgrades).toEqual(['swift']);

    session.chooseCharUpgrade('knight:rage');
    expect(hosts[0].spies.chooseCharUpgrade).toHaveBeenCalledWith('knight:rage');
    expect(st().myCharUpgrades).toEqual(['knight:rage']);

    session.chooseSubSkill('sub', 'skill');
    expect(hosts[0].spies.chooseSubSkill).toHaveBeenCalledWith('sub', 'skill');

    session.chooseExtraClass('rogue');
    expect(hosts[0].spies.chooseExtraClass).toHaveBeenCalledWith('rogue');
  });

  it('are safe no-ops without a session, yet still record local intent', () => {
    // session is null (menu). Optional chaining short-circuits the network relay.
    session.selectClass('mage');
    expect(st().localClass).toBe('mage');

    session.setReady(true);
    expect(st().localReady).toBe(true);

    expect(() => session.requestPause(true)).not.toThrow();
    expect(() => session.setNextReady(true)).not.toThrow();

    session.chooseUpgrade('swift');
    expect(st().myUpgrades).toEqual(['swift']);

    session.chooseCharUpgrade('knight:rage');
    expect(st().myCharUpgrades).toEqual(['knight:rage']);

    session.chooseSubSkill('sub', 'skill');
    expect(st().mySubclassId).toBe('sub');
    expect(st().mySubSkills).toEqual(['skill']);

    session.chooseExtraClass('rogue');
    expect(st().myExtraClasses).toEqual(['rogue']);
  });
});

// ---------------------------------------------------------------------------
// Misc helpers, including leaveToMenu with and without a `location` global.
// ---------------------------------------------------------------------------
describe('misc helpers', () => {
  it('openControls / closeControls toggle the store flag', () => {
    session.openControls();
    expect(st().showControls).toBe(true);
    session.closeControls();
    expect(st().showControls).toBe(false);
  });

  it('playUiSound resumes and plays the named ui sound', () => {
    session.playUiSound('uiClick');
    expect(sfxSpies.resume).toHaveBeenCalled();
    expect(sfxSpies.play).toHaveBeenCalledWith('uiClick');
  });

  it('shareLink returns a link only when a room is set', () => {
    expect(session.shareLink()).toBe('');
    useStore.setState({ roomCode: 'ABC234', netMode: 'p2p' });
    expect(session.shareLink()).toBe('https://warband/#room=ABC234&net=p2p');
  });

  it('copyShareLink writes the link when present and is a no-op otherwise', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await session.copyShareLink(); // no room -> no link -> no-op
    expect(writeText).not.toHaveBeenCalled();

    useStore.setState({ roomCode: 'ABC234' });
    await session.copyShareLink();
    expect(writeText).toHaveBeenCalledWith('https://warband/#room=ABC234&net=p2p');
  });

  it('copyShareLink swallows a clipboard failure', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    useStore.setState({ roomCode: 'ABC234' });
    await expect(session.copyShareLink()).resolves.toBeUndefined();
  });

  it('leaveToMenu rewrites the URL and resets when location exists', async () => {
    await session.hostGame();
    session.leaveToMenu();
    expect(st().phase).toBe('menu');
    expect(st().session).toBeNull();
    expect(st().roomCode).toBeNull();
  });

  it('leaveToMenu still resets when location is unavailable', async () => {
    await session.hostGame();
    vi.stubGlobal('location', undefined);
    try {
      session.leaveToMenu();
      expect(st().phase).toBe('menu');
      expect(st().roomCode).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
