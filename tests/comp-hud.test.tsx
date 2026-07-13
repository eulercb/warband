// @vitest-environment jsdom
/**
 * Component tests for the two in-fight React surfaces:
 *   - src/ui/game/HUD.tsx      — reads hudStore + the app store, renders hero/boss/
 *                           teammate frames, buff badges, ability buttons and the
 *                           controls hint.
 *   - src/ui/screens/Controls.tsx — the key/gamepad rebinding overlay backed by the real
 *                           (localStorage-persisted) bindings store.
 *
 * `@testing-library/jest-dom` is NOT installed, so assertions use `.textContent`,
 * `getByText`/`queryByText`/`getByRole` and `toBeTruthy()/toBeNull()`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

// Mock the session module (audio + networking). HUD pulls it in transitively via
// VolumeControl (`playUiSound`); Controls calls `closeControls`/`playUiSound`.
vi.mock('../src/ui/state/session', () => ({
  playUiSound: vi.fn(),
  closeControls: vi.fn(),
}));

// Stub the gamepad-menu hook so tests don't spin up the global gamepad nav poll
// loop. Controls still calls it (line coverage kept); it's just a no-op here.
vi.mock('../src/input/useGamepadMenu', () => ({ useGamepadMenu: vi.fn() }));

import HUD from '../src/ui/game/HUD';
import Controls from '../src/ui/screens/Controls';
import { useHudStore } from '../src/ui/state/hudStore';
import type { HudBoss, HudTeammate } from '../src/ui/state/hudStore';
import { useStore } from '../src/ui/state/store';
import { useBindings } from '../src/input/bindings';
import { closeControls, playUiSound } from '../src/ui/state/session';
import type { BuffView } from '../src/engine/core/types';

const closeControlsMock = vi.mocked(closeControls);
const playUiSoundMock = vi.mocked(playUiSound);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Reset the two module-singleton stores read by these components.
  useHudStore.getState().resetHud();
  useBindings.getState().reset();
  // Only the app-store fields HUD/Controls (and the embedded VolumeControl) read.
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
  // Drop any per-test gamepad stub so other specs see the jsdom default (none).
  delete (navigator as unknown as Record<string, unknown>).getGamepads;
});

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

describe('<HUD>', () => {
  it('renders the local hero health, score and ability buttons', () => {
    useHudStore.getState().set({
      active: true,
      classId: 'knight',
      hp: 120,
      maxHp: 200,
      score: 1234,
    });
    const { container } = render(<HUD />);

    // Health readout: "{round(hp)} / {round(maxHp)}".
    expect(container.querySelector('.hud-selfhp .hud-healthbar-num')?.textContent).toBe(
      '120 / 200',
    );
    // Run score badge.
    expect(container.querySelector('.hud-score')?.textContent).toContain('1234');

    // Knight ability table (no upgrades) — names + per-slot key labels.
    expect(screen.getByText('Cleave')).toBeTruthy();
    expect(screen.getByText('Taunt')).toBeTruthy();
    expect(screen.getByText('Shield Wall')).toBeTruthy();
    expect(screen.getByText('Shield Bash')).toBeTruthy();
    // basic slot shows the "LMB/<key>" hint; a1 shows the bound key.
    expect(screen.getByText('LMB/Space')).toBeTruthy();
    expect(screen.getByText('Q')).toBeTruthy();
    expect(container.querySelectorAll('.hud-ability')).toHaveLength(4);
  });

  it('shows a concrete effect tooltip on each ability icon (item 19)', () => {
    useHudStore.getState().set({ active: true, classId: 'knight', hp: 100, maxHp: 200 });
    const { container } = render(<HUD />);
    const tiles = Array.from(container.querySelectorAll('.hud-ability'));
    const cleave = tiles.find(
      (t) => t.querySelector('.hud-ability-name')?.textContent === 'Cleave',
    );
    expect(cleave).toBeTruthy();
    const tip = cleave!.getAttribute('title');
    expect(tip).toContain('Cleave —');
    expect(tip).toContain('22 dmg');
    expect(tip).toContain('reach');
    expect(tip).toContain('cooldown');
    // aria-label mirrors the tooltip so assistive tech reads the same thing.
    expect(cleave!.getAttribute('aria-label')).toBe(tip);
  });

  it("the ability tooltip reflects the hero's upgrade-resolved numbers", () => {
    // A Mage who took Combustion should see Fireball's boosted damage + blast.
    useStore.setState({ myCharUpgrades: ['mg_combust'] });
    useHudStore.getState().set({ active: true, classId: 'mage', hp: 100, maxHp: 100 });
    const { container } = render(<HUD />);
    const tiles = Array.from(container.querySelectorAll('.hud-ability'));
    const fireball = tiles.find(
      (t) => t.querySelector('.hud-ability-name')?.textContent === 'Fireball',
    );
    expect(fireball).toBeTruthy();
    const tip = fireball!.getAttribute('title');
    expect(tip).toContain('92 dmg');
    expect(tip).toContain('135u blast');
  });

  it('shows buff badges (glyph + seconds + tooltip) when the hero has buffs', () => {
    const buffs: BuffView[] = [
      { kind: 'invuln', remaining: 3, mult: 1 },
      { kind: 'moveSpeed', remaining: 2, mult: 0.5 }, // mult < 1 => slowed
    ];
    useHudStore.getState().set({ active: true, classId: 'knight', hp: 50, maxHp: 100, buffs });
    const { container } = render(<HUD />);

    const good = container.querySelector('.hud-self-row .hud-buff.good');
    const bad = container.querySelector('.hud-self-row .hud-buff.bad');
    expect(good).toBeTruthy();
    expect(bad).toBeTruthy();
    expect(good?.querySelector('.hud-buff-glyph')?.textContent).toBe('✨');
    expect(good?.querySelector('.hud-buff-secs')?.textContent).toBe('3');
    expect(good?.getAttribute('title')).toBe('Invulnerable · 3s');
    expect(bad?.querySelector('.hud-buff-glyph')?.textContent).toBe('🐌');
    expect(bad?.querySelector('.hud-buff-secs')?.textContent).toBe('2');
  });

  it('renders no buff chips when the hero has no buffs', () => {
    useHudStore.getState().set({ active: true, classId: 'knight', hp: 50, maxHp: 100, buffs: [] });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-self-row .hud-buff')).toBeNull();
  });

  it('renders a boss bar with health, enrage tag, run/cycle tags and boss buffs', () => {
    useStore.setState({ run: { index: 0, total: 3 }, cycle: 1 });
    const boss: HudBoss = {
      id: 1,
      name: 'Dragon',
      hp: 100,
      maxHp: 300,
      phase: 'enraged',
      buffs: [{ kind: 'damageTaken', remaining: 5, mult: 1.5 }], // vulnerable
      modName: 'Frost',
      affixes: [],
    };
    useHudStore
      .getState()
      .set({ active: true, classId: 'knight', hp: 10, maxHp: 100, bosses: [boss] });
    const { container } = render(<HUD />);

    const label = container.querySelector('.hud-bossbar-label');
    expect(label?.textContent).toContain('Frost Dragon');
    expect(container.querySelector('.hud-bossbar-num')?.textContent).toBe('100 / 300');
    expect(screen.getByText('ENRAGED')).toBeTruthy();
    expect(container.querySelector('.hud-run-tag')?.textContent).toBe('Boss 1/3');
    expect(container.querySelector('.hud-cycle-tag')?.textContent).toBe('Cycle 2');
    // Enraged fill variant.
    expect(container.querySelector('.hud-bossbar-fill.enraged')).toBeTruthy();
    // Boss buff badge (damageTaken > 1 => 💔 Vulnerable).
    const bossBuff = container.querySelector('.hud-bossbar-label .hud-buff');
    expect(bossBuff?.querySelector('.hud-buff-glyph')?.textContent).toBe('💔');
    expect(bossBuff?.querySelector('.hud-buff-secs')?.textContent).toBe('5');
  });

  it('renders no boss bars when there are no bosses', () => {
    useHudStore.getState().set({ active: true, classId: 'knight', hp: 10, maxHp: 100, bosses: [] });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-bossbars')).toBeNull();
    expect(screen.queryByText('ENRAGED')).toBeNull();
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
    expect(container.querySelectorAll('.hud-affix').length).toBe(2);
    expect(screen.getByText('Vampiric')).toBeTruthy();
    expect(screen.getByText('Frenzied')).toBeTruthy();
  });

  it('shows a transient corruption banner and fades it after the beat', () => {
    vi.useFakeTimers();
    try {
      useHudStore.getState().set({ active: true, classId: 'knight', hp: 10, maxHp: 100 });
      const { container } = render(<HUD />);
      expect(container.querySelector('.hud-corruption')).toBeNull();
      act(() => {
        useHudStore.getState().set({ banner: { text: 'Telegraph Rain', good: false, seq: 1 } });
      });
      expect(container.querySelector('.hud-corruption-name')?.textContent).toBe('Telegraph Rain');
      expect(container.querySelector('.hud-corruption-tag')?.textContent).toBe('Corruption');
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      expect(container.querySelector('.hud-corruption')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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
    // Empty name falls back to "Hero".
    expect(screen.getByText('Hero')).toBeTruthy();
    expect(container.querySelector('.hud-teammate-you')?.textContent).toContain('you');
    // Class display names.
    expect(screen.getByText('Ranger')).toBeTruthy();
    expect(screen.getByText('Mage')).toBeTruthy();
    expect(screen.getByText('Cleric')).toBeTruthy();
    // State labels + class hooks.
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
    // Math.ceil(7.2) => 8.
    expect(screen.getByText(/bleed-out in 8s/)).toBeTruthy();
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

  it('shows the keyboard controls hint by default', () => {
    useHudStore.getState().set({ active: true, classId: 'knight', hp: 10, maxHp: 100 });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-hint')?.textContent).toBe(
      'WASD move · Mouse aim · LMB basic · Q/E/R abilities · F revive · Esc menu',
    );
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
    // Ability key chips carry the "pad" modifier when a controller is active.
    expect(container.querySelector('.hud-ability-key.pad')).toBeTruthy();
  });

  it('hides the ability bar when no class is selected', () => {
    useHudStore.getState().set({ active: true, classId: null, hp: 10, maxHp: 100 });
    const { container } = render(<HUD />);
    expect(container.querySelector('.hud-abilities')).toBeNull();
    // Self health still renders (defaults to the knight skin).
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
    // Only a1 (Taunt) is on cooldown => exactly one cooldown number, "6.0".
    const nums = container.querySelectorAll('.hud-cd-num');
    expect(nums).toHaveLength(1);
    expect(nums[0].textContent).toBe('6.0');
    // The three ready abilities carry the "ready" class.
    expect(container.querySelectorAll('.hud-ability.ready')).toHaveLength(3);
  });

  // --- hardcore kill-deadline countdown (item 11) -------------------------
  const deadlineBoss: HudBoss = {
    id: 9,
    name: 'Dragon',
    hp: 200,
    maxHp: 300,
    phase: 'normal',
    buffs: [],
    modName: '',
    affixes: [],
  };

  it('shows NO ticking deadline timer — the deadline warns via banners now (item 24)', () => {
    // Even in a hardcore fight the HUD paints no visual countdown clock; warnings
    // arrive as transient banners (see world.stepDeadline). The deadline is no
    // longer plumbed to the HUD at all — there is nothing here to render.
    useHudStore.getState().set({
      active: true,
      classId: 'knight',
      hp: 10,
      maxHp: 100,
      bosses: [deadlineBoss],
    });
    const { container } = render(<HUD />);

    expect(container.querySelector('.hud-deadline')).toBeNull();
    // The boss bar is still there — only the clock beneath it is gone.
    expect(container.querySelector('.hud-bossbar')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/** The Controller bind section. Controls is tabbed now, so switch to the
 * Controller tab first (idempotent), then return its single bind column. */
function controllerSection(container: HTMLElement): Element {
  const tab = screen.getByRole('tab', { name: 'Controller' });
  if (tab.getAttribute('aria-selected') !== 'true') fireEvent.click(tab);
  return container.querySelector('.wb-controls-col') as Element;
}

describe('<Controls>', () => {
  it('renders the rebindable actions and their default bindings across tabs', () => {
    const { container } = render(<Controls />);

    // The Keyboard tab is default: title, a movement action, and 13 keyboard rows
    // (4 move + 9 button actions). Default keyboard labels (basic => Space, a1 => Q).
    expect(screen.getByText('Controls')).toBeTruthy();
    expect(screen.getByText('Move Up')).toBeTruthy();
    expect(screen.getByText('Basic Attack')).toBeTruthy();
    expect(
      container.querySelector('.wb-controls-col')?.querySelectorAll('.wb-bind-row'),
    ).toHaveLength(13);
    expect(screen.getByText('Space')).toBeTruthy();
    expect(screen.getByText('Q')).toBeTruthy();

    // Controller tab: 9 button rows + the pad-scheme chips (auto-detect default),
    // and the first button (basic) glyph is ✕ (PlayStation).
    fireEvent.click(screen.getByRole('tab', { name: 'Controller' }));
    expect(
      container.querySelector('.wb-controls-col')?.querySelectorAll('.wb-bind-row'),
    ).toHaveLength(9);
    expect(screen.getByText('Auto-detect')).toBeTruthy();
    expect(screen.getByText('Xbox (A B X Y)')).toBeTruthy();
    expect(screen.getByText('Auto-detect').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.wb-controls-col .wb-bind-key')?.textContent).toBe('✕');

    // Options tab: the auto-fire toggle, defaulting off.
    fireEvent.click(screen.getByRole('tab', { name: 'Options' }));
    expect(screen.getByText('Hold to auto-fire')).toBeTruthy();
    expect(useStore.getState().autofire).toBe(false);
  });

  it('selecting a controller icon scheme updates the store and the button glyphs', () => {
    const { container } = render(<Controls />);
    expect(controllerSection(container).querySelector('.wb-bind-key')?.textContent).toBe('✕');

    fireEvent.click(screen.getByText('Xbox (A B X Y)'));

    expect(useBindings.getState().bindings.padScheme).toBe('xbox');
    expect(screen.getByText('Xbox (A B X Y)').getAttribute('aria-pressed')).toBe('true');
    // basic's controller glyph now follows the Xbox set (index 0 => "A").
    expect(controllerSection(container).querySelector('.wb-bind-key')?.textContent).toBe('A');
    expect(playUiSoundMock).toHaveBeenCalled();
  });

  it('clicking a keyboard binding enters the "press a key" capture state', () => {
    render(<Controls />);
    // The a1 keyboard bind button reads "Q" by default.
    fireEvent.click(screen.getByText('Q'));

    expect(screen.getByText('Press a key…')).toBeTruthy();
    expect(screen.queryByText('Q')).toBeNull();
    // Subtitle gains the cancel hint while capturing.
    expect(document.querySelector('.wb-subtitle')?.textContent).toContain('Press Esc to cancel');
  });

  it('pressing a key commits the rebind', () => {
    render(<Controls />);
    fireEvent.click(screen.getByText('Q')); // enter capture for a1
    // The capture listener lives on window (capture phase); commit with a KeyZ.
    fireEvent.keyDown(window, { code: 'KeyZ' });

    expect(screen.queryByText('Press a key…')).toBeNull();
    expect(screen.getByText('Z')).toBeTruthy(); // codeToLabel('KeyZ')
    expect(useBindings.getState().bindings.keys.a1[0]).toBe('KeyZ');
  });

  it('entering a controller-button capture shows "press a button…"', () => {
    const { container } = render(<Controls />);
    // First controller bind button (basic) reads ✕ by default.
    const padBtn = controllerSection(container).querySelector('.wb-bind-key');
    expect(padBtn).toBeTruthy();
    if (padBtn) fireEvent.click(padBtn);
    // With no gamepad connected the poll never commits, so it stays capturing.
    expect(screen.getByText('Press a button…')).toBeTruthy();
  });

  it('reset-to-defaults restores the default bindings', () => {
    // Pre-mutate: rebind a1 to M (an otherwise-unbound key) to observe the reset.
    useBindings.getState().setKey('a1', 0, 'KeyM');
    render(<Controls />);
    expect(screen.getByText('M')).toBeTruthy();

    fireEvent.click(screen.getByText('Reset to defaults'));

    expect(screen.queryByText('M')).toBeNull();
    expect(screen.getByText('Q')).toBeTruthy();
    expect(useBindings.getState().bindings.keys.a1[0]).toBe('KeyQ');
  });

  it('the Done button closes the overlay via the session action', () => {
    render(<Controls />);
    fireEvent.click(screen.getByText('Done'));
    expect(closeControlsMock).toHaveBeenCalledTimes(1);
  });

  it('toggling auto-fire updates the store and shows the checkmark', () => {
    const { container } = render(<Controls />);
    fireEvent.click(screen.getByRole('tab', { name: 'Options' }));
    const toggle = container.querySelector('.wb-gauntlet-toggle');
    expect(toggle).toBeTruthy();
    if (toggle) fireEvent.click(toggle);

    expect(useStore.getState().autofire).toBe(true);
    expect(container.querySelector('.wb-gauntlet-check')?.textContent).toBe('✓');
    expect(playUiSoundMock).toHaveBeenCalled();
  });

  it('pressing Escape (when not capturing) closes the overlay', () => {
    render(<Controls />);
    fireEvent.keyDown(window, { code: 'Escape' });
    expect(closeControlsMock).toHaveBeenCalledTimes(1);
  });

  it('capturing a controller button commits the newly pressed pad button', () => {
    // A connected fake gamepad whose button state we mutate mid-capture.
    const pad = {
      connected: true,
      id: 'Test Pad',
      buttons: Array.from({ length: 8 }, () => ({ pressed: false })),
      axes: [0, 0],
    };
    const nav = navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] };
    nav.getGamepads = () => [pad as unknown as Gamepad];

    // A hand-driven rAF queue so we control exactly when the capture poll runs
    // (and so it can't recurse forever while no new button is pressed).
    const rafCbs: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
      rafCbs.push(cb);
      return rafCbs.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (): void => {});
    const flushFrame = (): void => {
      for (const cb of rafCbs.splice(0)) cb(0);
    };

    const { container } = render(<Controls />);
    const padBtn = controllerSection(container).querySelector('.wb-bind-key');
    expect(padBtn).toBeTruthy();
    // Enter pad capture; baseline snapshot is taken with nothing pressed.
    if (padBtn) fireEvent.click(padBtn);
    expect(screen.getByText('Press a button…')).toBeTruthy();

    // Press button index 5 (R1), then let the poll observe the fresh press.
    pad.buttons[5].pressed = true;
    act(() => {
      flushFrame();
    });

    expect(screen.queryByText('Press a button…')).toBeNull();
    // basic rebinds to button 5; the single-owner rule frees it from revive ([4, 5] -> [4]).
    expect(useBindings.getState().bindings.pad.basic[0]).toBe(5);
    expect(useBindings.getState().bindings.pad.revive).toEqual([4]);
    // The glyph follows the auto-detected scheme: the fake pad's id matches no
    // known family, so detectPadGlyphs falls back to the "letters" set (5 => RB).
    expect(controllerSection(container).querySelector('.wb-bind-key')?.textContent).toBe('RB');
  });

  it('pressing Escape while capturing a key cancels the rebind and keeps the old binding', () => {
    render(<Controls />);
    fireEvent.click(screen.getByText('Q')); // enter capture for a1
    expect(screen.getByText('Press a key…')).toBeTruthy();

    // Escape is the "cancel" key inside a capture: setKey is skipped, the capture
    // ends, and a1 keeps its default 'Q' binding.
    fireEvent.keyDown(window, { code: 'Escape' });
    expect(screen.queryByText('Press a key…')).toBeNull();
    expect(screen.getByText('Q')).toBeTruthy();
    expect(useBindings.getState().bindings.keys.a1[0]).toBe('KeyQ');
    // Escape here is consumed as "cancel", NOT forwarded to closeControls.
    expect(closeControlsMock).not.toHaveBeenCalled();
  });

  it('ignores a non-Escape key while the overlay is idle (does not close)', () => {
    render(<Controls />);
    // Not capturing → the window key listener only acts on Escape; any other key
    // is a no-op and must not close the overlay.
    fireEvent.keyDown(window, { code: 'KeyJ' });
    expect(closeControlsMock).not.toHaveBeenCalled();
  });

  it('toggles screen-shake off→on and shows the accessibility copy while off', () => {
    useStore.setState({ screenShake: false });
    const { container } = render(<Controls />);
    fireEvent.click(screen.getByRole('tab', { name: 'Options' }));
    const toggle = screen.getByText('Screen shake').closest('button');
    if (!toggle) throw new Error('screen-shake toggle not found');

    // While OFF: no `on` class, aria-pressed false, an empty checkmark, and the
    // steady-camera accessibility blurb.
    expect(toggle.classList.contains('on')).toBe(false);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.querySelector('.wb-gauntlet-check')?.textContent).toBe('');
    expect(toggle.textContent).toContain('Off: the camera stays perfectly steady');

    fireEvent.click(toggle);
    expect(useStore.getState().screenShake).toBe(true);
    expect(playUiSoundMock).toHaveBeenCalledWith('uiClick');
    // Re-rendered ON: the checkmark now shows.
    expect(container.querySelector('.wb-gauntlet-toggle.on .wb-gauntlet-check')?.textContent).toBe(
      '✓',
    );
  });

  it('keeps listening when the capture poll sees only null / disconnected pad slots', () => {
    // An empty controller slot (null) — getGamepads reports one every frame.
    const nav = navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] };
    nav.getGamepads = () => [null];

    const rafCbs: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
      rafCbs.push(cb);
      return rafCbs.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (): void => {});
    const flushFrame = (): void => {
      for (const cb of rafCbs.splice(0)) cb(0);
    };

    const { container } = render(<Controls />);
    const padBtn = controllerSection(container).querySelector('.wb-bind-key');
    if (padBtn) fireEvent.click(padBtn);
    expect(screen.getByText('Press a button…')).toBeTruthy();

    // The poll skips the null slot, finds no press, and re-arms the next frame
    // instead of committing a rebind.
    act(() => {
      flushFrame();
    });
    expect(screen.getByText('Press a button…')).toBeTruthy();
    expect(rafCbs.length).toBeGreaterThan(0); // rescheduled another poll frame
  });

  it('ignores a controller button already held when capture starts (waits for a fresh press)', () => {
    const pad = {
      connected: true,
      id: 'Test Pad',
      buttons: Array.from({ length: 8 }, () => ({ pressed: false })),
      axes: [0, 0],
    };
    pad.buttons[3].pressed = true; // held BEFORE we begin listening → it's in the baseline
    const nav = navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] };
    nav.getGamepads = () => [pad as unknown as Gamepad];

    const rafCbs: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
      rafCbs.push(cb);
      return rafCbs.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (): void => {});
    const flushFrame = (): void => {
      for (const cb of rafCbs.splice(0)) cb(0);
    };

    const { container } = render(<Controls />);
    const padBtn = controllerSection(container).querySelector('.wb-bind-key');
    if (padBtn) fireEvent.click(padBtn); // baseline snapshot already includes button 3
    act(() => {
      flushFrame();
    });

    // Button 3 was already down at baseline, so it is NOT treated as a new press:
    // capture stays open and `basic` keeps its default (button 0, not 3).
    expect(screen.getByText('Press a button…')).toBeTruthy();
    expect(useBindings.getState().bindings.pad.basic[0]).not.toBe(3);
  });
});
