// @vitest-environment jsdom
/**
 * Warband — branch-coverage component tests for src/ui/screens/ResultScreen.tsx.
 *
 * The existing tests/comp-result-lobby.test.tsx already covers the headline
 * ResultScreen variants (VICTORY / DEFEAT / RUN CLEARED / empty state). This file
 * drives the remaining CONDITIONAL branches the reference test never reaches:
 *   • the between-boss `advancing` delegation to <RewardRoom>,
 *   • the run-progress line (mod-name prefix + cycle suffix, present vs absent),
 *   • the endless upgrade bank (seeded vs Math.random roll, generic + character
 *     pick → picked / dimmed / tick, per-choice headings, owned-boon badges),
 *   • the hardcore retry gate (host vs client, victory vs wipe, banked Second
 *     Chance vs a terminal wipe), and the empty-name / no-MVP table fallbacks.
 *
 * `@testing-library/jest-dom` is NOT installed, so assertions use `.textContent`,
 * getBy/queryBy queries and toBeTruthy()/toBeNull().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

// Mock the session control layer so rendering pulls in no audio / WebRTC. Every
// name ResultScreen AND its children (RewardRoom, SpecialReward, EphemeralShop)
// import must be present — a missing one resolves to `undefined` and would crash
// the render if referenced.
vi.mock('../src/ui/state/session', () => ({
  // ResultScreen
  returnToLobby: vi.fn(),
  retryFight: vi.fn(),
  continueEndless: vi.fn(),
  leaveToMenu: vi.fn(),
  chooseUpgrade: vi.fn(),
  chooseCharUpgrade: vi.fn(),
  playUiSound: vi.fn(),
  // RewardRoom (transitively imported by the `advancing` branch)
  setNextReady: vi.fn(),
  sfx: { play: vi.fn(), handleEvents: vi.fn() },
  // SpecialReward (rendered on the RUN CLEARED / endless bank screen)
  chooseSubSkill: vi.fn(),
  chooseExtraClass: vi.fn(),
}));

// The `advancing` branch delegates to <RewardRoom>, whose mount effect spins up
// the Pixi renderer + input manager. Stub both so the delegated render runs
// headless under jsdom (mirrors tests/comp-reward.test.tsx).
vi.mock('../src/render/pipeline/renderer', () => ({
  Renderer: {
    create: vi.fn().mockResolvedValue({
      dispose: vi.fn(),
      render: vi.fn(),
      worldToScreen: () => ({ x: 0, y: 0 }),
      app: { canvas: { addEventListener: vi.fn(), removeEventListener: vi.fn() } },
    }),
  },
}));
vi.mock('../src/input/input', () => ({
  InputManager: class {
    activeSource = 'keyboard';
    sample() {
      return {
        move: { x: 0, y: 0 },
        aim: { x: 0, y: -1 },
        buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
      };
    }
    dispose() {}
  },
}));

// Spy on rollCharChoices but keep the real behaviour by default (so the seeded
// roll tests still see genuine offers). One test overrides it to inject an
// unresolvable id and exercise the `describeCharOffer → null` skip branch.
vi.mock('../src/engine/content/charUpgrades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/engine/content/charUpgrades')>();
  return { ...actual, rollCharChoices: vi.fn(actual.rollCharChoices) };
});

import ResultScreen from '../src/ui/screens/ResultScreen';
import { rollCharChoices } from '../src/engine/content/charUpgrades';
import { useStore } from '../src/ui/state/store';
import type { AppState } from '../src/ui/state/store';
import type { FightResult, ResultPlayerStat } from '../src/engine/core/types';
import {
  leaveToMenu,
  retryFight,
  returnToLobby,
  continueEndless,
  chooseUpgrade,
  chooseCharUpgrade,
  playUiSound,
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

// A clean baseline for every field ResultScreen (+ its children) reads.
const BASE: Partial<AppState> = {
  result: null,
  isHost: false,
  activeHardcore: false,
  localClass: 'knight',
  localName: 'Alice',
  myUpgrades: [],
  myCharUpgrades: [],
  myExtraClasses: [],
  myCoins: 0,
  nextReadyReady: 0,
  nextReadyTotal: 0,
  showControls: false,
  autofire: false,
  muted: true,
};

const realRandom = Math.random;

beforeEach(() => {
  useStore.setState(BASE);
  // The gamepad-menu hook + RewardRoom's render loop poll via rAF; stub both to
  // no-ops so nothing actually loops under jsdom.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  // Pin the (Math.random-driven) endless offer roll: at 0.1 the generic row is
  // [swift, vigor, haste] and the knight character row leads with kn_bulwark
  // ("Impenetrable") — grands are no longer offered in this pool (item 20).
  Math.random = () => 0.1;
});

afterEach(() => {
  cleanup();
  Math.random = realRandom;
  vi.unstubAllGlobals();
  vi.clearAllMocks(); // clears call history; keeps the Renderer.create impl
});

/** The endless-bank container (ResultScreen's own upgrade block, not SpecialReward's). */
function upgradesBlock(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.wb-upgrades');
  if (!el) throw new Error('.wb-upgrades block not rendered');
  return el as HTMLElement;
}
function genCards(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    upgradesBlock(container).querySelectorAll('.wb-upgrade-card:not(.wb-upgrade-char)'),
  );
}
function charCards(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(upgradesBlock(container).querySelectorAll('.wb-upgrade-char'));
}

// ===========================================================================
describe('<ResultScreen> branch coverage', () => {
  // --- empty state ---------------------------------------------------------
  it('shows the no-result fallback and routes Main Menu to leaveToMenu', () => {
    useStore.setState({ result: null });
    render(<ResultScreen />);

    expect(screen.getByText('No fight results to show.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Main Menu' }));
    expect(vi.mocked(leaveToMenu)).toHaveBeenCalledTimes(1);
  });

  // --- advancing → RewardRoom ---------------------------------------------
  it('delegates a between-boss result (another boss queued) to the walkable RewardRoom', () => {
    useStore.setState({
      result: makeResult({ nextMonsterId: 'troll', runIndex: 0, runTotal: 5 }),
    });
    const { container } = render(<ResultScreen />);

    // RewardRoom, not the flat card screen: its banner + List-view fallback show,
    // and none of ResultScreen's own terminal chrome renders.
    expect(screen.getByRole('button', { name: 'List view' })).toBeTruthy();
    expect(container.querySelector('.wb-reward-banner-title')?.textContent ?? '').toContain(
      'Boss 1 of 5 felled',
    );
    expect(screen.queryByText('Time to kill')).toBeNull();
    expect(container.querySelector('.wb-result-panel')).toBeNull();
  });

  // --- victory / MVP table -------------------------------------------------
  it('renders a host VICTORY with MVP callouts and wires Play Again / Return to Lobby', () => {
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
    expect(screen.getByText('12.3s')).toBeTruthy(); // sub-minute format
    expect(screen.getAllByText('MVP').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));
    expect(vi.mocked(retryFight)).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Lobby' }));
    expect(vi.mocked(returnToLobby)).toHaveBeenCalledTimes(1);
  });

  it('hides Play Again from a victorious client and offers Back to Lobby', () => {
    useStore.setState({ isHost: false, result: makeResult({ outcome: 'victory' }) });
    render(<ResultScreen />);

    expect(screen.queryByRole('button', { name: 'Play Again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Lobby' }));
    expect(vi.mocked(returnToLobby)).toHaveBeenCalledTimes(1);
  });

  it('falls back to "Hero" for an empty name and renders no MVP when every stat is zero', () => {
    useStore.setState({
      result: makeResult({
        stats: [
          makeStat({ name: '', damageDealt: 0, healingDone: 0, revives: 0, deaths: 0, score: 0 }),
        ],
      }),
    });
    const { container } = render(<ResultScreen />);

    // The name cell (not the "Hero" column header) falls back to "Hero".
    expect(container.querySelector('.wb-cell-name')?.textContent).toBe('Hero');
    expect(screen.queryByText('MVP')).toBeNull();
  });

  // --- run progress line (isRun) ------------------------------------------
  it('renders the run-progress line with the mod-name prefix and cycle suffix, and formats a long kill time', () => {
    useStore.setState({
      isHost: true,
      result: makeResult({
        outcome: 'defeat',
        timeMs: 65432,
        monsterId: 'dragon',
        runIndex: 2,
        runTotal: 5,
        modName: 'Frost',
        cycle: 1,
      }),
    });
    const { container } = render(<ResultScreen />);

    const progress = container.querySelector('.wb-run-progress')?.textContent ?? '';
    expect(progress).toContain('Frost');
    expect(progress).toContain('Ancient Dragon');
    expect(progress).toContain('Boss 3 of 5');
    expect(progress).toContain('Cycle 2');
    expect(screen.getByText('DEFEAT')).toBeTruthy();
    expect(screen.getByText('1:05.432')).toBeTruthy(); // >= 1 min format

    // Non-hardcore wipe → the host still gets a free Retry.
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(vi.mocked(retryFight)).toHaveBeenCalledTimes(1);
  });

  it('omits the mod-name prefix and cycle suffix on a plain cycle-0 run, and hides Retry from a client', () => {
    useStore.setState({
      isHost: false,
      result: makeResult({
        outcome: 'defeat',
        monsterId: 'dragon',
        runIndex: 0,
        runTotal: 3,
        cycle: 0,
      }),
    });
    const { container } = render(<ResultScreen />);

    const progress = container.querySelector('.wb-run-progress')?.textContent ?? '';
    expect(progress).toContain('Boss 1 of 3');
    expect(progress).not.toContain('Cycle');
    expect(progress).not.toContain('Frost');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to Lobby' })).toBeTruthy();
  });

  // --- hardcore retry gate -------------------------------------------------
  it('still offers the host Play Again after a HARDCORE victory (the wipe rule does not apply)', () => {
    useStore.setState({
      isHost: true,
      activeHardcore: true,
      result: makeResult({ outcome: 'victory' }),
    });
    render(<ResultScreen />);

    expect(screen.getByText('VICTORY')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));
    expect(vi.mocked(retryFight)).toHaveBeenCalledTimes(1);
  });

  it('denies the host any retry on a terminal HARDCORE wipe (no banked Second Chance)', () => {
    useStore.setState({
      isHost: true,
      activeHardcore: true,
      result: makeResult({ outcome: 'defeat' }), // hardcoreRetryAvailable absent
    });
    render(<ResultScreen />);

    expect(screen.getByText('DEFEAT')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Second Chance' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play Again' })).toBeNull();
    // The lobby return is still there.
    fireEvent.click(screen.getByRole('button', { name: 'Return to Lobby' }));
    expect(vi.mocked(returnToLobby)).toHaveBeenCalledTimes(1);
  });

  it('offers the host a "Second Chance" on a HARDCORE wipe when one was banked', () => {
    useStore.setState({
      isHost: true,
      activeHardcore: true,
      result: makeResult({ outcome: 'defeat', hardcoreRetryAvailable: true }),
    });
    render(<ResultScreen />);

    const btn = screen.getByRole('button', { name: 'Second Chance' });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(vi.mocked(retryFight)).toHaveBeenCalledTimes(1);
  });

  // --- endless bank (RUN CLEARED) -----------------------------------------
  it('shows RUN CLEARED with the endless offer, host Continue/Return, and no owned-boon section when empty', () => {
    useStore.setState({ isHost: true, result: makeResult({ endlessAvailable: true }) });
    const { container } = render(<ResultScreen />);

    expect(screen.getByText('RUN CLEARED')).toBeTruthy();
    expect(screen.getByText('You felled the whole gauntlet!')).toBeTruthy();
    // Pre-pick headings.
    expect(screen.getByText('Choose a generic upgrade')).toBeTruthy();
    expect(screen.getByText('Choose a Knight upgrade')).toBeTruthy();
    // The endless bank rolls exactly 3 generic offers.
    expect(genCards(container).length).toBe(3);
    // Nothing owned yet → no "Your upgrades" section.
    expect(container.querySelector('.wb-upgrade-owned')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Continue \(Endless\)/ }));
    expect(vi.mocked(continueEndless)).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Lobby' }));
    expect(vi.mocked(returnToLobby)).toHaveBeenCalledTimes(1);
  });

  it('re-draws the endless-bank offers, still full, after a reroll (item: reroll)', () => {
    // rerollCount > 0 drives the salted + exclude-biased re-draw (a reroll bought via the
    // shared coin stall on this screen). setState bypasses setResult, so it stays set.
    useStore.setState({
      isHost: true,
      result: makeResult({ endlessAvailable: true, rewardSeed: 12345 }),
      rerollCount: 2,
    });
    const { container } = render(<ResultScreen />);
    // Both offer sets still fill after two rerolls (biased to differ, degrading gracefully).
    expect(genCards(container).length).toBe(3);
    expect(charCards(container).length).toBe(4);
  });

  it('picks a generic upgrade: relays chooseUpgrade, marks it picked, dims the rest, swaps the heading', () => {
    useStore.setState({ isHost: true, result: makeResult({ endlessAvailable: true }) });
    const { container } = render(<ResultScreen />);

    const cards = genCards(container);
    expect(cards.length).toBe(3);
    expect(cards[0].textContent ?? '').toContain('Swift');

    fireEvent.click(cards[0]);
    expect(vi.mocked(chooseUpgrade)).toHaveBeenCalledWith('swift');
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiConfirm');

    // Heading flips, the chosen card is picked (with a tick), the others dim.
    expect(screen.getByText('Generic upgrade chosen')).toBeTruthy();
    const picked = upgradesBlock(container).querySelector(
      '.wb-upgrade-card.picked:not(.wb-upgrade-char)',
    );
    expect(picked).toBeTruthy();
    expect(picked?.querySelector('.wb-upgrade-tick')?.textContent).toContain('✓');
    expect(
      upgradesBlock(container).querySelectorAll('.wb-upgrade-card.dimmed:not(.wb-upgrade-char)')
        .length,
    ).toBe(2);

    // A second click on the now-disabled card is a no-op (the pick is locked in).
    fireEvent.click(cards[0]);
    expect(vi.mocked(chooseUpgrade)).toHaveBeenCalledTimes(1);
  });

  it('picks a character upgrade: relays chooseCharUpgrade, marks it picked, dims the rest, swaps the heading', () => {
    useStore.setState({ isHost: true, result: makeResult({ endlessAvailable: true }) });
    const { container } = render(<ResultScreen />);

    const cards = charCards(container);
    expect(cards.length).toBe(4);
    // Grands left the pool (item 20); the leading class pick is now an ordinary boon.
    expect(cards[0].textContent ?? '').toContain('Impenetrable');

    fireEvent.click(cards[0]);
    expect(vi.mocked(chooseCharUpgrade)).toHaveBeenCalledWith('kn_bulwark');

    expect(screen.getByText('Character upgrade chosen')).toBeTruthy();
    const picked = upgradesBlock(container).querySelector('.wb-upgrade-char.picked');
    expect(picked).toBeTruthy();
    expect(picked?.querySelector('.wb-upgrade-tick')?.textContent).toContain('✓');
    expect(upgradesBlock(container).querySelectorAll('.wb-upgrade-char.dimmed').length).toBe(3);

    fireEvent.click(cards[0]);
    expect(vi.mocked(chooseCharUpgrade)).toHaveBeenCalledTimes(1);
  });

  it('re-rolls the character offers, spanning the new class, when one is multiclassed on this screen (item 8)', () => {
    const spy = vi.mocked(rollCharChoices);
    useStore.setState({
      isHost: true,
      localClass: 'knight',
      myExtraClasses: [],
      mySubSkills: [],
      result: makeResult({ endlessAvailable: true, rewardSeed: 4242 }),
    });
    spy.mockClear();
    render(<ResultScreen />);
    // The initial roll spans only the primary class (no extras yet).
    const firstCall = spy.mock.calls.find((c) => c[0] === 'knight');
    expect(firstCall?.[4]).toEqual([]); // extraClasses arg

    spy.mockClear();
    // Simulate acquiring a class on THIS screen (SpecialReward → chooseExtraClass mirror).
    act(() => {
      useStore.setState({ myExtraClasses: ['mage'] });
    });
    // The character offers re-roll, now spanning the newly-acquired class.
    const reroll = spy.mock.calls.find((c) => c[0] === 'knight');
    expect(reroll).toBeTruthy();
    expect(reroll?.[4]).toEqual(['mage']);
  });

  it('does NOT re-roll (or reset) the character pick once it is committed (item 8 guard)', () => {
    useStore.setState({
      isHost: true,
      localClass: 'knight',
      myExtraClasses: [],
      mySubSkills: [],
      result: makeResult({ endlessAvailable: true, rewardSeed: 4242 }),
    });
    const { container } = render(<ResultScreen />);
    fireEvent.click(charCards(container)[0]); // commit a char pick
    expect(vi.mocked(chooseCharUpgrade)).toHaveBeenCalledTimes(1);

    const spy = vi.mocked(rollCharChoices);
    spy.mockClear();
    // A late multiclass must not disturb the banked pick (would double-bank it).
    act(() => {
      useStore.setState({ myExtraClasses: ['mage'] });
    });
    expect(spy).not.toHaveBeenCalled(); // char offers frozen once picked
    expect(screen.getByText('Character upgrade chosen')).toBeTruthy();
  });

  it('skips a character offer whose id resolves to no view (describeCharOffer → null)', () => {
    // Inject one resolvable grand pick + one bogus id. describeCharOffer returns
    // null for the bogus id, so its card renders nothing (the `if (!view) return
    // null` branch) — only the resolvable offer survives.
    const spy = vi.mocked(rollCharChoices);
    const original = spy.getMockImplementation();
    spy.mockReturnValue(['kn_grand_immovable', 'zzz_not_a_real_upgrade']);
    try {
      useStore.setState({ isHost: true, result: makeResult({ endlessAvailable: true }) });
      const { container } = render(<ResultScreen />);

      const cards = charCards(container);
      expect(cards.length).toBe(1); // the bogus offer contributed no card
      expect(cards[0].textContent ?? '').toContain('Immovable Object');
      // The character-pick heading still renders (we DID map the offers).
      expect(screen.getByText('Choose a Knight upgrade')).toBeTruthy();
    } finally {
      spy.mockImplementation(original!);
    }
  });

  it('lists owned generic + character boons, skipping an unrecognised character id', () => {
    // 'bogus_id' has no badge (charUpgradeBadge returns null) → it renders nothing.
    useStore.setState({
      isHost: true,
      myUpgrades: ['swift'],
      myCharUpgrades: ['kn_bulwark', 'bogus_id'],
      result: makeResult({ endlessAvailable: true }),
    });
    const { container } = render(<ResultScreen />);

    const owned = container.querySelector('.wb-upgrade-owned');
    expect(owned).toBeTruthy();
    const text = owned?.textContent ?? '';
    expect(text).toContain('Swift'); // generic badge
    expect(text).toContain('Impenetrable'); // kn_bulwark badge name
    // Exactly two badges rendered (the bogus id contributes none).
    expect(owned?.querySelectorAll('.wb-upgrade-badge').length).toBe(2);
  });

  it('shows the owned section from character boons alone (no generic boons owned)', () => {
    useStore.setState({
      isHost: true,
      myUpgrades: [],
      myCharUpgrades: ['kn_widecleave'],
      result: makeResult({ endlessAvailable: true }),
    });
    const { container } = render(<ResultScreen />);

    const owned = container.querySelector('.wb-upgrade-owned');
    expect(owned).toBeTruthy();
    expect(owned?.textContent ?? '').toContain('Sweeping Blows'); // kn_widecleave name
  });

  it('seeds the endless offer roll deterministically from result.rewardSeed', () => {
    useStore.setState({
      isHost: true,
      result: makeResult({ endlessAvailable: true, rewardSeed: 98765 }),
    });
    const { container } = render(<ResultScreen />);

    // The seeded roll path (result.rewardSeed != null) still produces the bank's
    // 3 generic offers; we assert the count rather than the exact seeded ids.
    expect(screen.getByText('RUN CLEARED')).toBeTruthy();
    expect(genCards(container).length).toBe(3);
    expect(charCards(container).length).toBe(4);
  });

  it('makes a client wait for the host on the RUN CLEARED screen', () => {
    useStore.setState({ isHost: false, result: makeResult({ endlessAvailable: true }) });
    render(<ResultScreen />);

    expect(screen.getByText(/Waiting for the host to choose/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Continue \(Endless\)/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Return to Lobby' })).toBeNull();
  });

  it('renders the empty-combatants row when the stats table is empty', () => {
    useStore.setState({ result: makeResult({ stats: [] }) });
    render(<ResultScreen />);
    expect(screen.getByText('No combatants recorded.')).toBeTruthy();
  });
});
