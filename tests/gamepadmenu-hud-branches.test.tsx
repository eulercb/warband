// @vitest-environment jsdom
/**
 * Branch-coverage tests for TWO surfaces, kept together in one file:
 *
 *   1. src/input/useGamepadMenu.ts — the controller menu-nav hook. We mock
 *      gamepadNav.pushNavHandler to capture the nav handler and drive it
 *      directly. jsdom does no layout (getBoundingClientRect is all-zero and
 *      offsetParent is null), so we stub both to force the geometric-navigation
 *      branches (direction ternaries, score comparison, best-vs-wrap).
 *
 *   2. src/ui/game/HUD.tsx — the in-fight HUD. We reset the two singleton stores
 *      before each test (mirroring tests/comp-hud.test.tsx) and drive the store
 *      into the states that light up its remaining branches: positive corruption
 *      banner, subclass skill buttons (valid + invalid), healing-vial pip,
 *      multiclass swap indicator, and the max<=0 percentage guard.
 *
 * `@testing-library/jest-dom` is NOT installed — assertions use `.textContent`,
 * `getByText`/`queryByText`, `.classList`, `toBeTruthy()`/`toBeNull()`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useRef } from 'react';
import type { NavDir } from '../src/input/gamepadNav';

// ---------------------------------------------------------------------------
// gamepadNav mock — capture the handler pushNavHandler receives so we can call
// onNav/onConfirm/onBack by hand. The closure only touches `captured` when the
// hook actually calls pushNavHandler (during render), by which point the module
// singletons below are initialised.
// ---------------------------------------------------------------------------
interface NavHandler {
  onNav: (dir: NavDir) => void;
  onConfirm: () => void;
  onBack: () => void;
}
const captured: { handler: NavHandler | null; unsub: ReturnType<typeof vi.fn> } = {
  handler: null,
  unsub: vi.fn(),
};
vi.mock('../src/input/gamepadNav', () => ({
  pushNavHandler: (h: NavHandler) => {
    captured.handler = h;
    return captured.unsub;
  },
}));

// HUD pulls in the session module transitively via VolumeControl (playUiSound).
vi.mock('../src/ui/state/session', () => ({
  playUiSound: vi.fn(),
  closeControls: vi.fn(),
}));

import { useGamepadMenu } from '../src/input/useGamepadMenu';
import HUD from '../src/ui/game/HUD';
import { useHudStore } from '../src/ui/state/hudStore';
import type { HudBoss, HudTeammate } from '../src/ui/state/hudStore';
import { useStore } from '../src/ui/state/store';
import { useBindings, keyLabelFor, padLabelFor } from '../src/input/bindings';
import type { BuffView } from '../src/engine/core/types';

// ===========================================================================
// TARGET 1 — useGamepadMenu
// ===========================================================================
describe('useGamepadMenu — branch coverage', () => {
  beforeEach(() => {
    captured.handler = null;
    captured.unsub = vi.fn();
    // jsdom leaves offsetParent null for every element, which the hook's
    // visibility filter would reject. Make attached elements report a truthy
    // offsetParent so focusables() sees them (as tests/useGamepadMenu does).
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get(this: HTMLElement) {
        return this.parentNode as Element | null;
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  // A plain row of three controls (zero-layout in jsdom => geometry always
  // fails and navigation wraps by index order).
  function Menu(props: { enabled?: boolean; suspended?: boolean; onBack?: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useGamepadMenu(ref, props);
    return (
      <div ref={ref}>
        <button type="button" data-testid="a">
          A
        </button>
        <button type="button" data-testid="b">
          B
        </button>
        <button type="button" data-testid="c">
          C
        </button>
      </div>
    );
  }

  // Exercises the `opts = {}` default (hook called with a single argument).
  function DefaultsMenu() {
    const ref = useRef<HTMLDivElement>(null);
    useGamepadMenu(ref);
    return (
      <div ref={ref}>
        <button type="button" data-testid="only">
          Only
        </button>
      </div>
    );
  }

  // A 2x2 grid whose rects we stub so 2-D geometric navigation actually runs.
  function GridMenu() {
    const ref = useRef<HTMLDivElement>(null);
    useGamepadMenu(ref, {});
    return (
      <div ref={ref}>
        <button type="button" data-testid="tl">
          TL
        </button>
        <button type="button" data-testid="tr">
          TR
        </button>
        <button type="button" data-testid="bl">
          BL
        </button>
        <button type="button" data-testid="br">
          BR
        </button>
      </div>
    );
  }

  // No focusable descendants at all.
  function EmptyMenu() {
    const ref = useRef<HTMLDivElement>(null);
    useGamepadMenu(ref, {});
    return (
      <div ref={ref}>
        <span>no controls here</span>
      </div>
    );
  }

  // A mix that the focusables() filter must whittle down to just "ok".
  function FilterMenu() {
    const ref = useRef<HTMLDivElement>(null);
    useGamepadMenu(ref, {});
    return (
      <div ref={ref}>
        <button type="button" data-testid="ok">
          OK
        </button>
        <button type="button" disabled data-testid="dis">
          Disabled
        </button>
        <button type="button" aria-hidden="true" data-testid="hid">
          Hidden
        </button>
        <div tabIndex={-1} data-testid="nt">
          Not tabbable
        </div>
      </div>
    );
  }

  // The ref is never attached, so containerRef.current stays null.
  function NullRefMenu() {
    const ref = useRef<HTMLDivElement>(null);
    useGamepadMenu(ref, {});
    return <div>ref intentionally detached</div>;
  }

  function setRect(el: Element, x: number, y: number, w = 10, h = 10): void {
    (el as HTMLElement).getBoundingClientRect = () => ({
      x,
      y,
      left: x,
      top: y,
      right: x + w,
      bottom: y + h,
      width: w,
      height: h,
      toJSON() {},
    });
  }

  it('registers a nav handler when enabled and the container exists', () => {
    render(<Menu />);
    expect(captured.handler).not.toBeNull();
  });

  it('does not register while disabled', () => {
    render(<Menu enabled={false} />);
    expect(captured.handler).toBeNull();
  });

  it('bails out when the container ref is null (never attached)', () => {
    render(<NullRefMenu />);
    expect(captured.handler).toBeNull();
  });

  it('works with default options (no opts argument passed)', () => {
    const { getByTestId } = render(<DefaultsMenu />);
    expect(captured.handler).not.toBeNull();
    captured.handler?.onNav('down');
    expect(document.activeElement).toBe(getByTestId('only'));
  });

  it('focuses the first control on the initial nav press', () => {
    const { getByTestId } = render(<Menu />);
    captured.handler?.onNav('down'); // current is null => seed to els[0]
    expect(document.activeElement).toBe(getByTestId('a'));
    expect(getByTestId('a').classList.contains('wb-gp-focus')).toBe(true);
  });

  it('moves focus geometrically in every direction', () => {
    const { getByTestId } = render(<GridMenu />);
    setRect(getByTestId('tl'), 0, 0);
    setRect(getByTestId('tr'), 100, 0);
    setRect(getByTestId('bl'), 0, 100);
    setRect(getByTestId('br'), 100, 100);

    captured.handler?.onNav('down'); // seed -> tl (first control)
    expect(document.activeElement).toBe(getByTestId('tl'));

    // right: two candidates (tr, br) lie to the right; the nearer (tr) wins,
    // so the farther one exercises the `score < bestScore` false branch.
    captured.handler?.onNav('right');
    expect(document.activeElement).toBe(getByTestId('tr'));

    // down: vertical move (horiz === false path); br is directly below.
    captured.handler?.onNav('down');
    expect(document.activeElement).toBe(getByTestId('br'));

    // left: dx < -4 branch.
    captured.handler?.onNav('left');
    expect(document.activeElement).toBe(getByTestId('bl'));

    // up: dy < -4 branch.
    captured.handler?.onNav('up');
    expect(document.activeElement).toBe(getByTestId('tl'));
  });

  it('wraps through index order when nothing lies in the nav direction', () => {
    const { getByTestId } = render(<Menu />); // zero rects => no geometric target
    captured.handler?.onNav('down'); // seed -> A
    captured.handler?.onNav('right'); // wrap forward -> B
    expect(document.activeElement).toBe(getByTestId('b'));
    captured.handler?.onNav('up'); // wrap backward -> A
    expect(document.activeElement).toBe(getByTestId('a'));
    captured.handler?.onNav('down'); // wrap forward -> B
    expect(document.activeElement).toBe(getByTestId('b'));
  });

  it('swallows navigation while suspended', () => {
    const { getByTestId } = render(<Menu suspended />);
    captured.handler?.onNav('down');
    expect(getByTestId('a').classList.contains('wb-gp-focus')).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('nav is a no-op when there are no focusable controls', () => {
    render(<EmptyMenu />);
    captured.handler?.onNav('down');
    expect(document.activeElement).toBe(document.body);
  });

  it('ignores disabled, aria-hidden and non-tabbable controls', () => {
    const { getByTestId } = render(<FilterMenu />);
    captured.handler?.onNav('down'); // only "ok" survives the filter => seeds there
    expect(document.activeElement).toBe(getByTestId('ok'));
    expect(getByTestId('dis').classList.contains('wb-gp-focus')).toBe(false);
    expect(getByTestId('hid').classList.contains('wb-gp-focus')).toBe(false);
    expect(getByTestId('nt').classList.contains('wb-gp-focus')).toBe(false);
  });

  it('skips a control with no offset parent (not laid out)', () => {
    const { getByTestId } = render(<FilterMenu />);
    const ok = getByTestId('ok');
    // Shadow the prototype getter for this element only => reported as invisible.
    Object.defineProperty(ok, 'offsetParent', { configurable: true, get: () => null });
    captured.handler?.onNav('down'); // now nothing is focusable
    expect(ok.classList.contains('wb-gp-focus')).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('activates the focused control on confirm', () => {
    const { getByTestId } = render(<Menu />);
    const onClick = vi.fn();
    getByTestId('a').addEventListener('click', onClick);
    captured.handler?.onNav('down'); // focus A
    captured.handler?.onConfirm();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('confirm with nothing focused clicks the first control', () => {
    const { getByTestId } = render(<Menu />);
    const onClick = vi.fn();
    getByTestId('a').addEventListener('click', onClick);
    // No prior nav: activeElement is <body>, which is not inside the container.
    captured.handler?.onConfirm();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('swallows confirm while suspended', () => {
    const { getByTestId } = render(<Menu suspended />);
    const onClick = vi.fn();
    getByTestId('a').addEventListener('click', onClick);
    captured.handler?.onConfirm();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('confirm is a no-op when there are no focusable controls', () => {
    render(<EmptyMenu />);
    expect(captured.handler).not.toBeNull();
    captured.handler?.onConfirm();
    expect(document.activeElement).toBe(document.body);
  });

  it('invokes onBack on the back button', () => {
    const onBack = vi.fn();
    render(<Menu onBack={onBack} />);
    captured.handler?.onBack();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('back button is a no-op when no onBack is supplied', () => {
    render(<Menu />);
    expect(() => captured.handler?.onBack()).not.toThrow();
  });

  it('swallows the back button while suspended', () => {
    const onBack = vi.fn();
    render(<Menu suspended onBack={onBack} />);
    captured.handler?.onBack();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('unsubscribes and clears the focus ring on unmount', () => {
    const { getByTestId, unmount } = render(<Menu />);
    captured.handler?.onNav('down'); // ring on A
    const a = getByTestId('a');
    expect(a.classList.contains('wb-gp-focus')).toBe(true);
    const unsub = captured.unsub;
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(a.classList.contains('wb-gp-focus')).toBe(false);
  });
});

// ===========================================================================
// TARGET 2 — HUD
// ===========================================================================
describe('HUD — branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useHudStore.getState().resetHud();
    useBindings.getState().reset();
    useStore.setState({
      run: null,
      cycle: 0,
      myCharUpgrades: [],
      autofire: false,
      volume: 1,
      muted: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (navigator as unknown as Record<string, unknown>).getGamepads;
  });

  it('renders hero health, score and the four ability buttons (keyboard)', () => {
    useHudStore
      .getState()
      .set({ active: true, classId: 'knight', hp: 120, maxHp: 200, score: 1234 });
    const { container } = render(<HUD />);

    expect(container.querySelector('.hud-selfhp .hud-healthbar-num')?.textContent).toBe(
      '120 / 200',
    );
    expect(container.querySelector('.hud-score')?.textContent).toContain('1234');
    expect(container.querySelectorAll('.hud-ability')).toHaveLength(4);
    expect(screen.getByText('Cleave')).toBeTruthy();
    // basic label "LMB/Space" (>5 chars) gets the ".long" modifier; a1 "Q" does not.
    expect(container.querySelector('.hud-ability-key.long')).toBeTruthy();
    // default cooldowns are all 0 => every ability ready, no cd numbers.
    expect(container.querySelectorAll('.hud-ability.ready')).toHaveLength(4);
    expect(container.querySelector('.hud-cd-num')).toBeNull();
    // no buffs => BuffChips returns null.
    expect(container.querySelector('.hud-self-row .hud-buff')).toBeNull();
    // no banner => CorruptionBanner returns null.
    expect(container.querySelector('.hud-corruption')).toBeNull();
    // keyboard hint by default.
    expect(container.querySelector('.hud-hint')?.textContent).toContain('WASD move');
  });

  it('renders good and bad buff chips for the hero', () => {
    const buffs: BuffView[] = [
      { kind: 'invuln', remaining: 3, mult: 1 }, // good
      { kind: 'moveSpeed', remaining: 2, mult: 0.5 }, // mult < 1 => slowed => bad
    ];
    useHudStore.getState().set({ active: true, classId: 'knight', hp: 50, maxHp: 100, buffs });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-self-row .hud-buff.good')).toBeTruthy();
    expect(container.querySelector('.hud-self-row .hud-buff.bad')).toBeTruthy();
  });

  it('renders a boss bar with enrage, run/cycle tags and a boss buff', () => {
    useStore.setState({ run: { index: 0, total: 3 }, cycle: 1 });
    const boss: HudBoss = {
      id: 1,
      name: 'Dragon',
      hp: 100,
      maxHp: 300,
      phase: 'enraged',
      buffs: [{ kind: 'damageTaken', remaining: 5, mult: 1.5 }],
      modName: 'Frost',
      affixes: [],
    };
    useHudStore
      .getState()
      .set({ active: true, classId: 'knight', hp: 10, maxHp: 100, bosses: [boss] });
    const { container } = render(<HUD />);

    expect(container.querySelector('.hud-bossbar-label')?.textContent).toContain('Frost Dragon');
    expect(container.querySelector('.hud-bossbar-num')?.textContent).toBe('100 / 300');
    expect(screen.getByText('ENRAGED')).toBeTruthy();
    expect(container.querySelector('.hud-run-tag')?.textContent).toBe('Boss 1/3');
    expect(container.querySelector('.hud-cycle-tag')?.textContent).toBe('Cycle 2');
    expect(container.querySelector('.hud-bossbar-fill.enraged')).toBeTruthy();
    expect(container.querySelector('.hud-bossbar-label .hud-buff')).toBeTruthy();
  });

  it('hides the run tag for a single-boss fight and the cycle tag on cycle 0', () => {
    useStore.setState({ run: { index: 0, total: 1 }, cycle: 0 });
    const boss: HudBoss = {
      id: 7,
      name: 'Troll',
      hp: 50,
      maxHp: 50,
      phase: 'normal',
      buffs: [],
      modName: '',
      affixes: [],
    };
    useHudStore
      .getState()
      .set({ active: true, classId: 'knight', hp: 10, maxHp: 100, bosses: [boss] });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-run-tag')).toBeNull();
    expect(container.querySelector('.hud-cycle-tag')).toBeNull();
    expect(container.querySelector('.hud-bossbar-label')?.textContent).toContain('Troll');
    expect(container.querySelector('.hud-bossbar-fill.enraged')).toBeNull();
  });

  it('renders affix name chips on the boss bar', () => {
    const boss: HudBoss = {
      id: 2,
      name: 'Orc',
      hp: 80,
      maxHp: 100,
      phase: 'normal',
      buffs: [],
      modName: '',
      affixes: ['vampiric', 'frenzied'],
    };
    useHudStore
      .getState()
      .set({ active: true, classId: 'knight', hp: 10, maxHp: 100, bosses: [boss] });
    const { container } = render(<HUD />);
    expect(container.querySelectorAll('.hud-affix')).toHaveLength(2);
    expect(screen.getByText('Vampiric')).toBeTruthy();
    expect(screen.getByText('Frenzied')).toBeTruthy();
  });

  it('renders no boss bars when there are no bosses', () => {
    useHudStore.getState().set({ active: true, classId: 'knight', hp: 10, maxHp: 100, bosses: [] });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-bossbars')).toBeNull();
  });

  it('shows a negative corruption banner and fades it out after the beat', () => {
    vi.useFakeTimers();
    try {
      useHudStore.getState().set({ active: true, classId: 'knight', hp: 10, maxHp: 100 });
      const { container } = render(<HUD />);
      expect(container.querySelector('.hud-corruption')).toBeNull(); // seq == null path
      act(() => {
        useHudStore.getState().set({ banner: { text: 'Telegraph Rain', good: false, seq: 1 } });
      });
      expect(container.querySelector('.hud-corruption-tag')?.textContent).toBe('Corruption'); // good false
      expect(container.querySelector('.hud-corruption')?.classList.contains('good')).toBe(false);
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      expect(container.querySelector('.hud-corruption')).toBeNull(); // banner.seq === dismissedSeq
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders a positive "Rift" corruption banner', () => {
    useHudStore.getState().set({
      active: true,
      classId: 'knight',
      hp: 10,
      maxHp: 100,
      banner: { text: 'Rift Opens', good: true, seq: 9 },
    });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-corruption-tag')?.textContent).toBe('Rift'); // good true
    expect(container.querySelector('.hud-corruption')?.classList.contains('good')).toBe(true);
    expect(container.querySelector('.hud-corruption-name')?.textContent).toBe('Rift Opens');
  });

  it('renders teammate frames with names, classes, the "(you)" tag and states', () => {
    const teammates: HudTeammate[] = [
      {
        id: 2,
        name: 'Aria',
        classId: 'ranger',
        hp: 80,
        maxHp: 130,
        state: 'alive',
        isLocal: true,
        buffs: [],
        score: 0,
      },
      {
        id: 3,
        name: '',
        classId: 'mage',
        hp: 0,
        maxHp: 100,
        state: 'dead',
        isLocal: false,
        buffs: [],
        score: 0,
      },
      {
        id: 4,
        name: 'Bob',
        classId: 'cleric',
        hp: 10,
        maxHp: 100,
        state: 'downed',
        isLocal: false,
        buffs: [],
        score: 0,
      },
    ];
    useHudStore.getState().set({ active: true, classId: 'ranger', hp: 80, maxHp: 130, teammates });
    const { container } = render(<HUD />);

    expect(screen.getByText('Aria')).toBeTruthy();
    expect(screen.getByText('Hero')).toBeTruthy(); // empty name fallback
    expect(container.querySelector('.hud-teammate-you')?.textContent).toContain('you');
    expect(screen.getByText('DEAD')).toBeTruthy();
    expect(screen.getByText('DOWNED')).toBeTruthy();
    expect(container.querySelector('.hud-teammate.dead')).toBeTruthy();
    expect(container.querySelector('.hud-teammate.downed')).toBeTruthy();
    expect(container.querySelector('.hud-teammate.local')).toBeTruthy();
  });

  it('shows the downed note with a bleed-out timer', () => {
    useHudStore.getState().set({
      active: true,
      classId: 'knight',
      hp: 0,
      maxHp: 100,
      state: 'downed',
      reviveProgress: 0,
      downedTimer: 7.2,
    });
    render(<HUD />);
    expect(screen.getByText('You are down!')).toBeTruthy();
    expect(screen.getByText(/bleed-out in 8s/)).toBeTruthy(); // Math.ceil(7.2)
  });

  it('shows the revive progress percentage while being revived', () => {
    useHudStore.getState().set({
      active: true,
      classId: 'knight',
      hp: 0,
      maxHp: 100,
      state: 'downed',
      reviveProgress: 0.5,
      downedTimer: 7,
    });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-downed-sub')?.textContent).toContain('Being revived');
    expect(container.querySelector('.hud-downed-sub')?.textContent).toContain('50%');
  });

  it('shows the fallen note when the hero is dead', () => {
    useHudStore
      .getState()
      .set({ active: true, classId: 'knight', hp: 0, maxHp: 100, state: 'dead' });
    render(<HUD />);
    expect(screen.getByText('You have fallen')).toBeTruthy();
    expect(screen.getByText(/Spectating/)).toBeTruthy();
  });

  it('switches to gamepad glyph hints and pad ability keys when the pad is active', () => {
    useHudStore.getState().set({
      active: true,
      classId: 'knight',
      hp: 10,
      maxHp: 100,
      inputSource: 'gamepad',
    });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-hint')?.textContent).toContain('L-stick move');
    expect(container.querySelector('.hud-ability-key.pad')).toBeTruthy();
  });

  it('hides the ability bar when no class is selected', () => {
    useHudStore.getState().set({ active: true, classId: null, hp: 10, maxHp: 100 });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-abilities')).toBeNull();
    // Self health still renders, defaulting the skin to the knight class.
    expect(container.querySelector('.hud-selfhp.cls-knight')).toBeTruthy();
    expect(container.querySelector('.hud-selfhp .hud-healthbar-num')?.textContent).toBe('10 / 100');
  });

  it('shows a cooldown number for an ability on cooldown and hides it when ready', () => {
    useHudStore.getState().set({
      active: true,
      classId: 'knight',
      hp: 10,
      maxHp: 100,
      cooldowns: { basic: 0, a1: 6, a2: 0, a3: 0 },
    });
    const { container } = render(<HUD />);
    const nums = container.querySelectorAll('.hud-cd-num');
    expect(nums).toHaveLength(1);
    expect(nums[0].textContent).toBe('6.0');
    expect(container.querySelectorAll('.hud-ability.ready')).toHaveLength(3);
  });

  it('clamps the health percentage to 0 when maxHp <= 0', () => {
    useHudStore.getState().set({ active: true, classId: 'knight', hp: 0, maxHp: 0 });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-selfhp .hud-healthbar-num')?.textContent).toBe('0 / 0');
    const fill = container.querySelector<HTMLElement>('.hud-selfhp .hud-healthbar-fill');
    expect(fill?.style.width).toBe('0%');
  });

  it('renders subclass skill buttons and skips unknown skill ids', () => {
    useHudStore.getState().set({
      active: true,
      classId: 'knight',
      hp: 10,
      maxHp: 100,
      // sub1 (valid), sub2 (valid), and an unknown id that must render nothing.
      subSkills: ['kn_champion_slam', 'kn_champion_charge', 'totally_invalid_id'],
    });
    const { container } = render(<HUD />);
    // 4 base slots + 2 resolved subclass skills (the invalid id yields null).
    expect(container.querySelectorAll('.hud-ability')).toHaveLength(6);
    expect(container.textContent).toContain('Earthshaker'); // kn_champion_slam
    expect(container.textContent).toContain('Bull Rush'); // kn_champion_charge
  });

  it('shows the healing-vial pip and multiclass swap indicator (keyboard)', () => {
    useHudStore.getState().set({
      active: true,
      classId: 'knight',
      hp: 10,
      maxHp: 100,
      potions: 3,
      classes: ['knight', 'mage'],
    });
    const { container } = render(<HUD />);

    // Healing vial pip.
    expect(container.querySelector('.hud-item')).toBeTruthy();
    expect(container.querySelector('.hud-item-count')?.textContent).toBe('×3');
    expect(container.querySelector('.hud-item-key')?.textContent).toBe(keyLabelFor('item'));

    // Multiclass indicator: the active class chip carries ".active", the other doesn't.
    expect(container.querySelector('.hud-multiclass')).toBeTruthy();
    expect(container.querySelector('.hud-multiclass-key')?.textContent).toBe(keyLabelFor('swap'));
    const chips = container.querySelectorAll('.hud-multiclass-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0].classList.contains('active')).toBe(true); // knight === classId
    expect(chips[1].classList.contains('active')).toBe(false); // mage !== classId
  });

  it('shows the healing-vial and swap keys as pad glyphs when the pad is active', () => {
    useHudStore.getState().set({
      active: true,
      classId: 'knight',
      hp: 10,
      maxHp: 100,
      potions: 2,
      classes: ['knight', 'mage'],
      inputSource: 'gamepad',
    });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-item-key')?.textContent).toBe(padLabelFor('item'));
    expect(container.querySelector('.hud-multiclass-key')?.textContent).toBe(padLabelFor('swap'));
  });
});
