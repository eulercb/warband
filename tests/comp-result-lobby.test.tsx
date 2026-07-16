// @vitest-environment jsdom
/**
 * Warband — component tests for the two big menu screens:
 *   • src/ui/screens/ResultScreen.tsx — victory/defeat banner, stats table, and the
 *     between-boss upgrade phase (generic + character picks, ready-gate, endless).
 *   • src/ui/screens/Lobby.tsx        — room code / share link, boss pick, roster, class
 *     picker, ready toggle, and the host-only start / bot / gauntlet controls.
 *
 * The session control layer is fully mocked so rendering pulls in NO audio,
 * WebRTC, or Trystero code — every action is a spy we assert on. `@testing-
 * library/jest-dom` is not installed, so assertions use `.textContent`,
 * getBy/queryBy/getAllBy queries and toBeTruthy()/toBeNull().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Every name BOTH components import from ./session must be stubbed here — a
// missing one would resolve to `undefined` and crash the render. shareLink must
// return a string (Lobby renders it in a <code>); copyShareLink a resolved
// promise (Lobby awaits it in an async click handler).
vi.mock('../src/ui/state/session', () => ({
  // ResultScreen
  returnToLobby: vi.fn(),
  retryFight: vi.fn(),
  continueEndless: vi.fn(),
  leaveToMenu: vi.fn(),
  chooseUpgrade: vi.fn(),
  chooseCharUpgrade: vi.fn(),
  setNextReady: vi.fn(),
  playUiSound: vi.fn(),
  // RewardRoom (transitively imported by ResultScreen's advancing branch)
  sfx: { play: vi.fn(), handleEvents: vi.fn() },
  // Lobby
  selectClass: vi.fn(),
  setReady: vi.fn(),
  startFight: vi.fn(),
  shareLink: vi.fn(() => 'https://x/#room=ABC'),
  copyShareLink: vi.fn().mockResolvedValue(undefined),
  setMonster: vi.fn(),
  setGauntlet: vi.fn(),
  addBot: vi.fn(),
  removeBot: vi.fn(),
  setBotClass: vi.fn(),
}));

import ResultScreen from '../src/ui/screens/ResultScreen';
import Lobby from '../src/ui/screens/Lobby';
import { useStore, EMPTY_SF_LOADOUT } from '../src/ui/state/store';
import type { AppState } from '../src/ui/state/store';
import type { FightResult, ResultPlayerStat } from '../src/engine/core/types';
import type { LobbyPlayer } from '../src/net/protocol';
import {
  leaveToMenu,
  retryFight,
  returnToLobby,
  continueEndless,
  playUiSound,
  selectClass,
  setReady,
  startFight,
  setMonster,
  setGauntlet,
  addBot,
  removeBot,
  setBotClass,
  copyShareLink,
} from '../src/ui/state/session';

// --- fixtures --------------------------------------------------------------

function makeStat(over: Partial<ResultPlayerStat> = {}): ResultPlayerStat {
  return {
    peerId: 'p1',
    name: 'Alice',
    classId: 'knight',
    damageDealt: 100,
    healingDone: 0,
    revives: 0,
    deaths: 0,
    score: 500,
    ...over,
  };
}

function makeResult(over: Partial<FightResult> = {}): FightResult {
  return {
    outcome: 'victory',
    timeMs: 12345,
    stats: [makeStat()],
    monsterId: 'dragon',
    ...over,
  };
}

function makePlayer(over: Partial<LobbyPlayer> = {}): LobbyPlayer {
  return {
    peerId: 'p1',
    name: 'Alice',
    classId: 'knight',
    ready: false,
    isHost: false,
    isBot: false,
    ...over,
  };
}

const HOST_ROSTER: LobbyPlayer[] = [
  makePlayer({ peerId: 'h', name: 'Alice', classId: 'knight', isHost: true, ready: true }),
  makePlayer({ peerId: 'p2', name: 'Bob', classId: 'mage', ready: false }),
  makePlayer({ peerId: 'bot1', name: 'Bot 1', classId: 'ranger', isBot: true, ready: true }),
];

// A clean baseline for every field both screens read; individual tests override.
const BASE: Partial<AppState> = {
  result: null,
  isHost: false,
  localClass: 'knight',
  myUpgrades: [],
  myCharUpgrades: [],
  nextReadyReady: 0,
  nextReadyTotal: 0,
  roomCode: null,
  monsterId: 'dragon',
  gauntlet: false,
  players: [],
  localReady: false,
  peerCount: 0,
  netHint: null,
  // The lobby's host-only test-loadout editor reads these; pin them so its
  // collapsed/expanded state is deterministic across the <Lobby> cases below.
  sfLoadout: EMPTY_SF_LOADOUT,
  sfLoadoutOpen: false,
};

// The upgrade offers roll through Math.random in an effect; pin it so the
// offered ids (and thus the first card in each row) are deterministic. With
// 0.1, the generic row is [swift, vigor, haste] and the knight character row
// leads with kn_bulwark (see engine/upgrades + charUpgrades roll math).
const realRandom = Math.random;

beforeEach(() => {
  useStore.setState(BASE);
  // gamepadNav's poll loop is driven by requestAnimationFrame; stub it (and its
  // canceller) to no-ops so the menu hook never actually polls a gamepad.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  Math.random = () => 0.1;
});

afterEach(() => {
  cleanup();
  Math.random = realRandom;
  vi.unstubAllGlobals();
  vi.clearAllMocks(); // clears call history; keeps the shareLink/copyShareLink impls
});

// ===========================================================================
// ResultScreen
// ===========================================================================
describe('<ResultScreen>', () => {
  it('shows the empty-state fallback and returns to the menu when there is no result', () => {
    useStore.setState({ result: null });
    render(<ResultScreen />);

    expect(screen.getByText('No fight results to show.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Main Menu' }));
    expect(vi.mocked(leaveToMenu)).toHaveBeenCalledTimes(1);
  });

  it('renders a VICTORY banner, the stats table with MVP badges, and host actions', () => {
    useStore.setState({
      isHost: true,
      result: makeResult({
        outcome: 'victory',
        timeMs: 12345,
        stats: [
          makeStat({
            peerId: 'a',
            name: 'Alice',
            classId: 'knight',
            damageDealt: 300,
            healingDone: 0,
            revives: 1,
            deaths: 0,
            score: 810,
          }),
          makeStat({
            peerId: 'b',
            name: 'Bob',
            classId: 'cleric',
            damageDealt: 55,
            healingDone: 210,
            revives: 0,
            deaths: 1,
            score: 320,
          }),
        ],
      }),
    });
    render(<ResultScreen />);

    expect(screen.getByText('VICTORY')).toBeTruthy();
    // Roster names + classes.
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Knight')).toBeTruthy();
    expect(screen.getByText('Cleric')).toBeTruthy();
    // Rounded damage / healing numbers.
    expect(screen.getByText('300')).toBeTruthy();
    expect(screen.getByText('210')).toBeTruthy();
    // Time-to-kill formats sub-minute as `s.d`s.
    expect(screen.getByText('12.3s')).toBeTruthy();
    // At least one MVP callout is rendered.
    expect(screen.getAllByText('MVP').length).toBeGreaterThan(0);
    // A plain single-boss victory has no upgrade phase.
    expect(screen.queryByText('Choose a generic upgrade')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));
    expect(vi.mocked(retryFight)).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Lobby' }));
    expect(vi.mocked(returnToLobby)).toHaveBeenCalledTimes(1);
  });

  it('hides the host-only Play Again for a client and offers Back to Lobby', () => {
    useStore.setState({ isHost: false, result: makeResult({ outcome: 'victory' }) });
    render(<ResultScreen />);

    expect(screen.queryByRole('button', { name: 'Play Again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Lobby' }));
    expect(vi.mocked(returnToLobby)).toHaveBeenCalledTimes(1);
  });

  it('renders a DEFEAT banner with the host Retry + Return controls', () => {
    useStore.setState({ isHost: true, result: makeResult({ outcome: 'defeat' }) });
    render(<ResultScreen />);

    expect(screen.getByText('DEFEAT')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(vi.mocked(retryFight)).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Lobby' }));
    expect(vi.mocked(returnToLobby)).toHaveBeenCalledTimes(1);
  });

  it('hides Retry from a defeated client', () => {
    useStore.setState({ isHost: false, result: makeResult({ outcome: 'defeat' }) });
    render(<ResultScreen />);

    expect(screen.getByText('DEFEAT')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to Lobby' })).toBeTruthy();
  });

  // NOTE: the between-boss "advancing" upgrade phase is now the walkable
  // RewardRoom (walk over relics + into the vortex); ResultScreen delegates that
  // case to <RewardRoom>. Its behaviour is covered in tests/comp-reward.test.tsx.
  // What remains here are the TERMINAL result screens (single fight + RUN CLEARED).

  it('shows RUN CLEARED with host Continue/Return when the run is fully cleared', () => {
    useStore.setState({ isHost: true, result: makeResult({ endlessAvailable: true }) });
    const { container } = render(<ResultScreen />);

    expect(screen.getByText('RUN CLEARED')).toBeTruthy();
    expect(screen.getByText('You felled the whole gauntlet!')).toBeTruthy();
    // Banking upgrades is offered even at the end of a run (scope to the endless
    // bank — the special-reward panel above it also uses upgrade-card styling).
    expect(
      container.querySelectorAll('.wb-upgrades .wb-upgrade-card:not(.wb-upgrade-char)').length,
    ).toBe(3);

    fireEvent.click(screen.getByRole('button', { name: /Continue \(Endless\)/ }));
    expect(vi.mocked(continueEndless)).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Lobby' }));
    expect(vi.mocked(returnToLobby)).toHaveBeenCalledTimes(1);
  });

  it('makes a client wait for the host on the run-cleared screen', () => {
    useStore.setState({ isHost: false, result: makeResult({ endlessAvailable: true }) });
    render(<ResultScreen />);

    expect(screen.getByText(/Waiting for the host to choose/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Continue \(Endless\)/ })).toBeNull();
  });

  it('handles an empty stats table', () => {
    useStore.setState({ result: makeResult({ stats: [] }) });
    render(<ResultScreen />);

    expect(screen.getByText('No combatants recorded.')).toBeTruthy();
  });

  it('formats a time-to-kill of a minute or more as m:ss.mmm', () => {
    useStore.setState({ result: makeResult({ timeMs: 65432 }) });
    render(<ResultScreen />);

    expect(screen.getByText('1:05.432')).toBeTruthy();
  });
});

// ===========================================================================
// Lobby
// ===========================================================================
describe('<Lobby>', () => {
  it('renders the room code, boss, share link, roster, and host controls for the host', () => {
    useStore.setState({
      isHost: true,
      roomCode: 'ABCDEF',
      monsterId: 'dragon',
      gauntlet: false,
      peerCount: 2,
      players: HOST_ROSTER,
    });
    const { container } = render(<Lobby />);

    expect(screen.getByText('ABCDEF')).toBeTruthy();
    expect(container.querySelector('.wb-monster-name')?.textContent ?? '').toContain(
      'Ancient Dragon',
    );
    expect(screen.getByText('https://x/#room=ABC')).toBeTruthy();

    // Roster: names + host/bot badges + a members count.
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Bot 1')).toBeTruthy();
    expect(screen.getByText('Host')).toBeTruthy();
    expect(screen.getByText('Bot')).toBeTruthy();
    expect(screen.getByText('Warband (3)')).toBeTruthy();
    expect(screen.getByText('2 players connected')).toBeTruthy();

    // Host-only controls.
    expect(container.querySelector('[aria-label="Change boss"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Add a bot"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gauntlet run' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start Fight' })).toBeTruthy();
  });

  it('routes a class-card click through selectClass', () => {
    useStore.setState({ isHost: true, players: HOST_ROSTER });
    const { container } = render(<Lobby />);

    const mageCard = container.querySelector('.wb-class-grid [data-cls="mage"]');
    if (!mageCard) throw new Error('mage class card not found');
    fireEvent.click(mageCard);
    expect(vi.mocked(selectClass)).toHaveBeenCalledWith('mage');
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('toggles readiness through setReady in both directions', () => {
    useStore.setState({ isHost: false, players: [], localReady: false });
    const { unmount } = render(<Lobby />);
    fireEvent.click(screen.getByRole('button', { name: /Ready/ }));
    expect(vi.mocked(setReady)).toHaveBeenCalledWith(true);
    unmount();

    useStore.setState({ localReady: true });
    render(<Lobby />);
    fireEvent.click(screen.getByRole('button', { name: /Ready/ }));
    expect(vi.mocked(setReady)).toHaveBeenCalledWith(false);
  });

  it('lets the host swap the boss via setMonster', () => {
    useStore.setState({ isHost: true, monsterId: 'dragon', players: HOST_ROSTER });
    render(<Lobby />);

    fireEvent.click(screen.getByRole('button', { name: 'Forest Troll' }));
    expect(vi.mocked(setMonster)).toHaveBeenCalledWith('troll');
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('lets the host toggle a gauntlet run via setGauntlet', () => {
    useStore.setState({ isHost: true, gauntlet: false, players: HOST_ROSTER });
    render(<Lobby />);

    fireEvent.click(screen.getByRole('button', { name: 'Gauntlet run' }));
    expect(vi.mocked(setGauntlet)).toHaveBeenCalledWith(true);
  });

  it('adds a bot of the picked class via addBot', () => {
    useStore.setState({ isHost: true, players: HOST_ROSTER });
    const { container } = render(<Lobby />);

    const group = container.querySelector('[aria-label="Add a bot"]');
    if (!group) throw new Error('add-bot group not found');
    const botButtons = group.querySelectorAll('.wb-addbot-btn');
    fireEvent.click(botButtons[0]); // CLASS_IDS[0] === 'knight'
    expect(vi.mocked(addBot)).toHaveBeenCalledWith('knight');
  });

  it('cycles and removes a bot via setBotClass / removeBot', () => {
    useStore.setState({ isHost: true, players: HOST_ROSTER });
    const { container } = render(<Lobby />);

    const cycle = container.querySelector('.wb-bot-btn:not(.wb-bot-remove)');
    const remove = container.querySelector('.wb-bot-remove');
    if (!cycle || !remove) throw new Error('bot controls not found');

    fireEvent.click(cycle); // ranger -> next in CLASS_IDS === 'mage'
    expect(vi.mocked(setBotClass)).toHaveBeenCalledWith('bot1', 'mage');
    fireEvent.click(remove);
    expect(vi.mocked(removeBot)).toHaveBeenCalledWith('bot1');
  });

  it('starts the fight when the party is ready', () => {
    useStore.setState({
      isHost: true,
      roomCode: 'ABCDEF',
      peerCount: 0,
      players: [makePlayer({ peerId: 'h', name: 'Alice', isHost: true, ready: true })],
    });
    render(<Lobby />);

    const start = screen.getByRole('button', { name: 'Start Fight' });
    expect(start.hasAttribute('disabled')).toBe(false);
    fireEvent.click(start);
    expect(vi.mocked(startFight)).toHaveBeenCalledTimes(1);
    // Host with nobody connected sees the share-the-code prompt.
    expect(
      screen.getByText('Share the room code — players appear here as they connect.'),
    ).toBeTruthy();
  });

  it('disables Start until every human readies up', () => {
    useStore.setState({
      isHost: true,
      peerCount: 1,
      players: [
        makePlayer({ peerId: 'h', name: 'Alice', isHost: true, ready: true }),
        makePlayer({ peerId: 'p2', name: 'Bob', classId: 'mage', ready: false }),
      ],
    });
    const { container } = render(<Lobby />);

    expect(screen.getByRole('button', { name: 'Start Fight' }).hasAttribute('disabled')).toBe(true);
    expect(container.querySelector('.wb-start-hint')?.textContent ?? '').toContain('0/1 ready');
  });

  it('copies the share link and flashes a confirmation', async () => {
    useStore.setState({ isHost: false, roomCode: 'ABCDEF', peerCount: 1, players: [] });
    render(<Lobby />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    expect(vi.mocked(copyShareLink)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
    expect(await screen.findByText('Copied!')).toBeTruthy();
  });

  it('swallows a clipboard failure without flashing a confirmation', async () => {
    vi.mocked(copyShareLink).mockRejectedValueOnce(new Error('clipboard blocked'));
    useStore.setState({ isHost: false, roomCode: 'ABCDEF', peerCount: 1, players: [] });
    render(<Lobby />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    expect(vi.mocked(copyShareLink)).toHaveBeenCalledTimes(1);
    // Let the rejected copy settle; the catch keeps the button un-flashed.
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('Copied!')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy share link' })).toBeTruthy();
  });

  it('leaves to the menu when Leave is clicked', () => {
    useStore.setState({ isHost: false, players: [] });
    render(<Lobby />);

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(vi.mocked(leaveToMenu)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('hides host controls for a client and shows the gauntlet badge', () => {
    useStore.setState({
      isHost: false,
      gauntlet: true,
      roomCode: 'ABCDEF',
      peerCount: 1,
      players: [
        makePlayer({ peerId: 'h', name: 'Alice', isHost: true, ready: true }),
        makePlayer({ peerId: 'me', name: 'Me', classId: 'cleric' }),
      ],
    });
    const { container } = render(<Lobby />);

    expect(screen.queryByRole('button', { name: 'Start Fight' })).toBeNull();
    expect(container.querySelector('[aria-label="Change boss"]')).toBeNull();
    expect(container.querySelector('[aria-label="Add a bot"]')).toBeNull();
    expect(screen.getByText('Gauntlet run')).toBeTruthy(); // read-only badge
    expect(screen.getByText('Connected to the host')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ready/ })).toBeTruthy();
  });

  it('shows the waiting placeholders and a connectivity hint before anyone connects', () => {
    useStore.setState({
      isHost: false,
      peerCount: 0,
      netHint: 'Try a TURN relay',
      players: [],
    });
    render(<Lobby />);

    expect(screen.getByText('Warband (0)')).toBeTruthy();
    expect(screen.getByText(/Waiting for heroes/)).toBeTruthy();
    expect(screen.getByText(/Connecting to the host/)).toBeTruthy();
    expect(screen.getByText('Try a TURN relay')).toBeTruthy();
  });

  it('disables the add-bot buttons when the party is full', () => {
    useStore.setState({
      isHost: true,
      players: [
        makePlayer({ peerId: 'h', name: 'Alice', isHost: true, ready: true }),
        makePlayer({ peerId: 'p2', name: 'Bob', classId: 'mage' }),
        makePlayer({ peerId: 'p3', name: 'Cara', classId: 'ranger' }),
        makePlayer({ peerId: 'p4', name: 'Dan', classId: 'cleric' }),
      ],
    });
    const { container } = render(<Lobby />);

    const group = container.querySelector('[aria-label="Add a bot"]');
    if (!group) throw new Error('add-bot group not found');
    const botButtons = group.querySelectorAll('.wb-addbot-btn');
    expect(botButtons[0].hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Party full')).toBeTruthy();
  });

  it('marks the host gauntlet toggle selected when a run is active, and shows "Hero" for an unnamed player', () => {
    useStore.setState({
      isHost: true,
      gauntlet: true,
      roomCode: 'ABCDEF',
      peerCount: 1,
      players: [
        makePlayer({ peerId: 'h', name: 'Alice', isHost: true, ready: true }),
        makePlayer({ peerId: 'p2', name: '', classId: 'mage' }), // unnamed human
      ],
    });
    const { container } = render(<Lobby />);

    // Host + gauntlet on → the chip carries ' selected', is aria-pressed, and reads
    // "✓ Gauntlet run".
    const gauntletBtn = screen.getByRole('button', { name: '✓ Gauntlet run' });
    expect(gauntletBtn.classList.contains('selected')).toBe(true);
    expect(gauntletBtn.getAttribute('aria-pressed')).toBe('true');

    // The unnamed roster member falls back to the "Hero" placeholder name.
    const names = Array.from(container.querySelectorAll('.wb-player-name')).map(
      (n) => n.textContent,
    );
    expect(names).toContain('Alice');
    expect(names).toContain('Hero');
  });

  // ---- Single-fight test loadout (item: lobby loadout) ----------------------
  // A play-tester reported the host-only "Test loadout" panel was unreachable in a
  // freshly hosted single-boss lobby. Root cause: `.wb-sf-loadout` (overflow:hidden,
  // so its flex min-height resolves to 0) was the one shrinkable child of the height-
  // capped, scrolling muster panel, so flexbox crushed it to its 2px borders and the
  // toggle was clipped away. The fix pins it (`flex-shrink: 0`, styles.css) and lifts
  // it above the tall roster/class grid so it's found without a marathon scroll. These
  // lock in reachability, placement and the host/gauntlet gating from a real <Lobby>;
  // the 2px layout crush itself (a rendered-layout effect jsdom can't see) is guarded
  // by the muster-hall lobby step in scripts/smoke.mjs.
  it('surfaces the host-only test-loadout panel in a single-boss lobby and opens its build sections', () => {
    useStore.setState({ isHost: true, gauntlet: false, players: HOST_ROSTER });
    const { container } = render(<Lobby />);

    // Collapsed: a labelled toggle is present, but no body yet.
    const toggle = container.querySelector('.wb-sf-loadout-toggle');
    expect(toggle).toBeTruthy();
    expect(container.querySelector('[aria-label="Test loadout"]')).toBeTruthy();
    expect(container.querySelector('.wb-sf-loadout-body')).toBeNull();

    // Clicking the toggle expands the body with the always-present build sections
    // reachable — multiclass, subclass skills, class + generic boons, grafts and grands.
    // (The per-sub-skill "Honed" boons section only appears once a sub-skill is equipped,
    // so it isn't asserted from an empty loadout.)
    fireEvent.click(toggle as HTMLElement);
    expect(useStore.getState().sfLoadoutOpen).toBe(true);
    const body = container.querySelector('.wb-sf-loadout-body');
    expect(body).toBeTruthy();
    const labels = Array.from(body!.querySelectorAll('.wb-field-label')).map((e) => e.textContent);
    expect(labels.some((l) => /Multiclass/.test(l ?? ''))).toBe(true);
    expect(labels.some((l) => /Subclass skills/.test(l ?? ''))).toBe(true);
    expect(labels.some((l) => /boons/i.test(l ?? ''))).toBe(true);
    // Grafts (wild cross-class picks) and Grand improvements stay reachable end-to-end
    // (the latter surfaced via offerableGrands).
    expect(body!.querySelector('.wb-btn-graft')).toBeTruthy();
    expect(body!.querySelector('.wb-btn-grand')).toBeTruthy();
  });

  it('docks the test-loadout panel above the roster/class grid and the action bar so it is not buried', () => {
    useStore.setState({ isHost: true, gauntlet: false, players: HOST_ROSTER });
    const { container } = render(<Lobby />);

    const sf = container.querySelector('.wb-sf-loadout');
    const cols = container.querySelector('.wb-lobby-cols');
    const actions = container.querySelector('.wb-lobby-actions');
    if (!sf || !cols || !actions) throw new Error('lobby landmarks not found');
    // DOM order: the test loadout comes BEFORE the tall roster/class columns (so its
    // collapsed toggle is reachable without scrolling past the whole grid) and before
    // the sticky action bar (so its expanded body has room clear of it).
    expect(sf.compareDocumentPosition(cols) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sf.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the test-loadout panel only for a single-boss host — hidden for clients and gauntlets', () => {
    // Positive control: it renders for a single-boss host, so the two negative cases
    // below can't pass vacuously on a wrong/renamed `.wb-sf-loadout` selector.
    useStore.setState({ isHost: true, gauntlet: false, players: HOST_ROSTER });
    const host = render(<Lobby />);
    expect(host.container.querySelector('.wb-sf-loadout')).toBeTruthy();
    cleanup();
    // Non-host client: the build editor never renders.
    useStore.setState({ isHost: false, gauntlet: false, players: HOST_ROSTER });
    const client = render(<Lobby />);
    expect(client.container.querySelector('.wb-sf-loadout')).toBeNull();
    cleanup();
    // Host, but a gauntlet run: it's a single-fight tool, so it stays hidden.
    useStore.setState({ isHost: true, gauntlet: true, players: HOST_ROSTER });
    const gauntlet = render(<Lobby />);
    expect(gauntlet.container.querySelector('.wb-sf-loadout')).toBeNull();
  });
});
