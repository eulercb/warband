// @vitest-environment jsdom
/**
 * Component tests for src/ui/game/TouchControls.tsx — the mobile on-screen control
 * overlay: two "floating" virtual sticks (MOVE -> setTouchMove, AIM -> setTouchAim)
 * and a cluster of held-state ability buttons (basic/a1/a2/a3 + optional sub/item/
 * swap/revive) that write into the `touch` input singleton.
 *
 * The `touch` input module is fully mocked so we can (a) force `isTouchCapable()`
 * on/off to drive the render/return-null branch and (b) assert the exact vectors /
 * button state the handlers dispatch. `previewAbilityTable` is a spy that delegates
 * to the real implementation, so ability names are real; one test overrides it with
 * a partial table to exercise the slot-code fallback.
 *
 * `@testing-library/jest-dom` is NOT installed, so assertions use `.textContent`,
 * `getByText`/`getByRole`, `.classList` and `toBeTruthy()/toBeNull()`.
 *
 * jsdom lacks Element.setPointerCapture and real pointer geometry, so we stub
 * setPointerCapture and stub getBoundingClientRect on the stick base (origin 0,0),
 * then feed clientX/clientY on the fireEvent init to drive the knob math.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { AbilitySlot } from '../src/engine/core/types';
import type { PlayerAbilityDef } from '../src/engine/content/classes';

// Fully mock the touch input singleton: controllable capability + spyable setters.
vi.mock('../src/input/touch', () => ({
  setTouchMove: vi.fn(),
  setTouchAim: vi.fn(),
  setTouchButton: vi.fn(),
  setTouchSwapAim: vi.fn(),
  resetTouch: vi.fn(),
  isTouchCapable: vi.fn(() => true),
}));

// Spy on previewAbilityTable but keep the real behaviour by default (real ability
// names). One test swaps in a partial table to hit the slot-code fallback.
vi.mock('../src/engine/content/charUpgrades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/engine/content/charUpgrades')>();
  return { ...actual, previewAbilityTable: vi.fn(actual.previewAbilityTable) };
});

import TouchControls from '../src/ui/game/TouchControls';
import { useStore } from '../src/ui/state/store';
import { useHudStore } from '../src/ui/state/hudStore';
import {
  setTouchMove,
  setTouchAim,
  setTouchButton,
  setTouchSwapAim,
  resetTouch,
  isTouchCapable,
} from '../src/input/touch';
import { previewAbilityTable } from '../src/engine/content/charUpgrades';

const STICK_R = 56;
const ELLIPSIS = '…';

const setTouchMoveMock = vi.mocked(setTouchMove);
const setTouchAimMock = vi.mocked(setTouchAim);
const setTouchButtonMock = vi.mocked(setTouchButton);
const setTouchSwapAimMock = vi.mocked(setTouchSwapAim);
const resetTouchMock = vi.mocked(resetTouch);
const isTouchCapableMock = vi.mocked(isTouchCapable);

// jsdom has no pointer-capture; the handlers call it unconditionally.
Element.prototype.setPointerCapture = function () {};
Element.prototype.releasePointerCapture = function () {};

/** Pin a stick's base rect so its centre (the drag origin) is exactly (0,0). */
function centreStickAtOrigin(el: Element): void {
  (el as HTMLElement).getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useHudStore.getState().resetHud();
  useStore.setState({ localClass: 'knight', myCharUpgrades: [] });
  // clearAllMocks keeps implementations; re-assert the capability default each test.
  isTouchCapableMock.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Visibility / gating (line 164: !capable || !hasHud)
// ---------------------------------------------------------------------------

describe('<TouchControls> gating', () => {
  it('renders nothing on a non-touch device (capable === false)', () => {
    isTouchCapableMock.mockReturnValue(false);
    useHudStore.getState().set({ classId: 'knight' });
    const { container } = render(<TouchControls />);
    expect(container.querySelector('.wb-touch-controls')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while no HUD/class is active (hasHud === false)', () => {
    // capable stays true; classId is null after resetHud.
    const { container } = render(<TouchControls />);
    expect(container.querySelector('.wb-touch-controls')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Full render + optional-button branches (166,168,171,179,180,187,188)
// ---------------------------------------------------------------------------

describe('<TouchControls> layout', () => {
  it('renders both sticks and the full button cluster for an equipped hero', () => {
    useHudStore.getState().set({
      classId: 'knight',
      subSkills: ['kn_champion_slam', 'kn_champion_charge'],
      classes: ['knight', 'mage'], // multiclass -> swap button
      potions: 3, // -> item button
    });
    const { container } = render(<TouchControls />);

    // Root group is exposed to AT (the inner controls are aria-hidden).
    expect(screen.getByRole('group', { name: 'Touch controls' })).toBeTruthy();

    // Twin sticks with their labels + a knob each.
    expect(container.querySelector('.wb-touch-stick-left .wb-touch-stick-label')?.textContent).toBe(
      'MOVE',
    );
    expect(
      container.querySelector('.wb-touch-stick-right .wb-touch-stick-label')?.textContent,
    ).toBe('AIM');
    expect(container.querySelectorAll('.wb-touch-knob')).toHaveLength(2);

    // Ability buttons: short names pass through, long names clip to 8 chars + ellipsis.
    expect(container.querySelector('.wb-touch-btn-basic')?.textContent).toBe('Cleave');
    expect(container.querySelector('.wb-touch-btn-a1')?.textContent).toBe('Taunt');
    expect(container.querySelector('.wb-touch-btn-a2')?.textContent).toBe('Shield W' + ELLIPSIS);
    expect(container.querySelector('.wb-touch-btn-a3')?.textContent).toBe('Shield B' + ELLIPSIS);

    // Two subclass buttons (sub2 then sub1 in DOM order) with real skill names.
    expect(container.querySelectorAll('.wb-touch-btn-sub')).toHaveLength(2);
    expect(screen.getByText('Bull Rush')).toBeTruthy(); // sub2 (subSkills[1]) — 9 chars, no clip
    expect(screen.getByText('Earthsha' + ELLIPSIS)).toBeTruthy(); // sub1 (subSkills[0]) — clipped

    // Side cluster: item pip, swap and revive.
    expect(container.querySelector('.wb-touch-btn-item')?.textContent).toBe('\u{1F9EA}3');
    expect(container.querySelector('.wb-touch-btn-swap')?.textContent).toBe('Swap');
    expect(container.querySelector('.wb-touch-btn-revive')?.textContent).toBe('Revive');
  });

  it('omits the sub, item and swap buttons when the hero lacks them', () => {
    useHudStore.getState().set({
      classId: 'knight',
      subSkills: [],
      classes: ['knight'], // length 1 -> not multiclass
      potions: 0,
    });
    const { container } = render(<TouchControls />);

    expect(container.querySelectorAll('.wb-touch-btn-sub')).toHaveLength(0);
    expect(container.querySelector('.wb-touch-btn-item')).toBeNull();
    expect(container.querySelector('.wb-touch-btn-swap')).toBeNull();
    // The always-present buttons still render.
    expect(container.querySelector('.wb-touch-btn-revive')).toBeTruthy();
    expect(container.querySelector('.wb-touch-btn-basic')).toBeTruthy();
    expect(container.querySelector('.wb-touch-btn-a1')).toBeTruthy();
  });

  it('labels an unknown subclass-skill id with an empty string', () => {
    // subName -> getSubSkill(id) === undefined -> '' (the `sk ? ... : ''` else branch).
    useHudStore.getState().set({ classId: 'knight', subSkills: ['not_a_real_skill'] });
    const { container } = render(<TouchControls />);
    const subs = container.querySelectorAll('.wb-touch-btn-sub');
    expect(subs).toHaveLength(1);
    expect(subs[0].textContent).toBe('');
  });

  it('falls back to the UPPERCASED slot code when a slot has no ability def', () => {
    // Override the spy with a table missing `a3` -> shortName hits `?? slot.toUpperCase()`.
    const spy = vi.mocked(previewAbilityTable);
    const original = spy.getMockImplementation();
    spy.mockReturnValue({
      basic: { name: 'Bash' },
      a1: { name: 'Guard' },
      a2: { name: 'Wall' },
      // a3 intentionally absent
    } as unknown as Record<AbilitySlot, PlayerAbilityDef>);
    try {
      useHudStore.getState().set({ classId: 'knight' });
      const { container } = render(<TouchControls />);
      expect(container.querySelector('.wb-touch-btn-basic')?.textContent).toBe('Bash');
      expect(container.querySelector('.wb-touch-btn-a3')?.textContent).toBe('A3');
    } finally {
      spy.mockImplementation(original!);
    }
  });
});

// ---------------------------------------------------------------------------
// Virtual sticks — pointer handlers (49,55,64,68,76)
// ---------------------------------------------------------------------------

describe('<TouchControls> virtual sticks', () => {
  function renderLeftStick(): HTMLElement {
    useHudStore.getState().set({ classId: 'knight' });
    const { container } = render(<TouchControls />);
    const stick = container.querySelector('.wb-touch-stick-left') as HTMLElement;
    centreStickAtOrigin(stick);
    return container;
  }

  it('reports a normalized move vector, clamps past the radius and re-centres on release', () => {
    const container = renderLeftStick();
    const stick = container.querySelector('.wb-touch-stick-left') as HTMLElement;
    const knob = container.querySelector('.wb-touch-stick-left .wb-touch-knob') as HTMLElement;

    // pointerdown re-centres under the finger then moves once. Within-radius: no clamp.
    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 30, clientY: 0 });
    expect(knob.style.transform).toBe('translate(30px, 0px)');
    let [x, y] = setTouchMoveMock.mock.calls.at(-1)!;
    expect(x).toBeCloseTo(30 / STICK_R, 6);
    expect(y).toBe(0);

    // Beyond the radius (|v| = 100 > 56) the knob + vector clamp to the rim.
    fireEvent.pointerMove(stick, { pointerId: 1, clientX: 0, clientY: 100 });
    expect(knob.style.transform).toBe(`translate(0px, ${STICK_R}px)`);
    [x, y] = setTouchMoveMock.mock.calls.at(-1)!;
    expect(x).toBe(0);
    expect(y).toBeCloseTo(1, 6);

    // Release snaps the knob home and zeroes the vector.
    fireEvent.pointerUp(stick, { pointerId: 1 });
    expect(knob.style.transform).toBe('translate(0px, 0px)');
    expect(setTouchMoveMock).toHaveBeenLastCalledWith(0, 0);
  });

  it('ignores a second finger and events from a mismatched pointer id', () => {
    const container = renderLeftStick();
    const stick = container.querySelector('.wb-touch-stick-left') as HTMLElement;

    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 30, clientY: 0 });
    expect(setTouchMoveMock).toHaveBeenCalledTimes(1);
    setTouchMoveMock.mockClear();

    // A second pointerdown while one is captured is dropped (pointerId.current !== null).
    fireEvent.pointerDown(stick, { pointerId: 2, clientX: 90, clientY: 0 });
    // move / up carrying the wrong pointer id are dropped too.
    fireEvent.pointerMove(stick, { pointerId: 2, clientX: 40, clientY: 0 });
    fireEvent.pointerUp(stick, { pointerId: 2 });
    expect(setTouchMoveMock).not.toHaveBeenCalled();

    // The original pointer still owns the stick and can release it.
    fireEvent.pointerUp(stick, { pointerId: 1 });
    expect(setTouchMoveMock).toHaveBeenLastCalledWith(0, 0);
  });

  it('the right stick feeds the AIM vector via setTouchAim', () => {
    useHudStore.getState().set({ classId: 'knight' });
    const { container } = render(<TouchControls />);
    const stick = container.querySelector('.wb-touch-stick-right') as HTMLElement;
    centreStickAtOrigin(stick);

    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 0, clientY: 30 });
    const [x, y] = setTouchAimMock.mock.calls.at(-1)!;
    expect(x).toBe(0);
    expect(y).toBeCloseTo(30 / STICK_R, 6);
    // The left-stick setter is untouched by a right-stick drag.
    expect(setTouchMoveMock).not.toHaveBeenCalled();
  });

  it('a tiny drag inside the aim dead-zone reports {0,0} (keeps last reticle)', () => {
    useHudStore.getState().set({ classId: 'knight' });
    const { container } = render(<TouchControls />);
    const stick = container.querySelector('.wb-touch-stick-right') as HTMLElement;
    centreStickAtOrigin(stick);

    // |v| = 5px is well under AIM_DEAD_ZONE * STICK_R (~15.7px), so no re-aim.
    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 3, clientY: 4 });
    const [x, y] = setTouchAimMock.mock.calls.at(-1)!;
    expect(x).toBe(0);
    expect(y).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ability buttons — held state (114) + resetTouch cleanup (162)
// ---------------------------------------------------------------------------

describe('<TouchControls> ability buttons', () => {
  it('holds a button on pointerdown and releases it on pointerup', () => {
    useHudStore.getState().set({ classId: 'knight' });
    const { container } = render(<TouchControls />);
    const btn = container.querySelector('.wb-touch-btn-basic') as HTMLElement;

    fireEvent.pointerDown(btn, { pointerId: 1 });
    expect(btn.classList.contains('held')).toBe(true);
    expect(setTouchButtonMock).toHaveBeenLastCalledWith('basic', true);

    fireEvent.pointerUp(btn, { pointerId: 1 });
    expect(btn.classList.contains('held')).toBe(false);
    expect(setTouchButtonMock).toHaveBeenLastCalledWith('basic', false);
  });

  it('releases a held button on pointerleave and pointercancel', () => {
    useHudStore.getState().set({ classId: 'knight' });
    const { container } = render(<TouchControls />);

    const a1 = container.querySelector('.wb-touch-btn-a1') as HTMLElement;
    fireEvent.pointerDown(a1, { pointerId: 1 });
    expect(a1.classList.contains('held')).toBe(true);
    fireEvent.pointerLeave(a1, { pointerId: 1 });
    expect(a1.classList.contains('held')).toBe(false);
    expect(setTouchButtonMock).toHaveBeenLastCalledWith('a1', false);

    const a2 = container.querySelector('.wb-touch-btn-a2') as HTMLElement;
    fireEvent.pointerDown(a2, { pointerId: 2 });
    expect(a2.classList.contains('held')).toBe(true);
    fireEvent.pointerCancel(a2, { pointerId: 2 });
    expect(a2.classList.contains('held')).toBe(false);
    expect(setTouchButtonMock).toHaveBeenLastCalledWith('a2', false);
  });

  it('clears the touch singleton when the overlay unmounts', () => {
    useHudStore.getState().set({ classId: 'knight' });
    const { unmount } = render(<TouchControls />);
    expect(resetTouchMock).not.toHaveBeenCalled();
    unmount();
    expect(resetTouchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Ability-button cooldown readout (item: mobile overlay cooldown)
// ---------------------------------------------------------------------------

describe('<TouchControls> ability cooldowns', () => {
  it('badges the remaining seconds and dims the label while a skill is cooling', () => {
    useHudStore.getState().set({
      classId: 'knight',
      cooldowns: { basic: 0.5, a1: 3.2, a2: 0, a3: 0 },
    });
    const { container } = render(<TouchControls />);
    const basic = container.querySelector('.wb-touch-btn-basic') as HTMLElement;
    const a1 = container.querySelector('.wb-touch-btn-a1') as HTMLElement;
    const a2 = container.querySelector('.wb-touch-btn-a2') as HTMLElement;

    // A cooling button shows the remaining seconds (one decimal, straight from the
    // store), dims its label, and carries the radial sweep overlay.
    expect(basic.querySelector('.wb-touch-cd-num')?.textContent).toBe('0.5');
    expect(a1.querySelector('.wb-touch-cd-num')?.textContent).toBe('3.2');
    expect(basic.querySelector('.wb-touch-btn-label')?.classList.contains('cooling')).toBe(true);
    expect(basic.querySelector('.wb-touch-cd')).toBeTruthy();
    // The label stays identifiable while cooling.
    expect(basic.querySelector('.wb-touch-btn-label')?.textContent).toBe('Cleave');

    // A ready skill (0 remaining) shows no badge and an un-dimmed label.
    expect(a2.querySelector('.wb-touch-cd-num')).toBeNull();
    expect(a2.querySelector('.wb-touch-btn-label')?.classList.contains('cooling')).toBe(false);
  });

  it('shows cooldown on sub-skill buttons but never on revive / item', () => {
    useHudStore.getState().set({
      classId: 'knight',
      subSkills: ['kn_champion_slam'],
      potions: 2,
      cooldowns: { basic: 0, a1: 0, a2: 0, a3: 0, sub1: 4 },
    });
    const { container } = render(<TouchControls />);
    expect(container.querySelector('.wb-touch-btn-sub .wb-touch-cd-num')?.textContent).toBe('4.0');
    // The item and revive buttons carry no cooldown slot → never a sweep or a badge.
    expect(container.querySelector('.wb-touch-btn-item .wb-touch-cd-num')).toBeNull();
    expect(container.querySelector('.wb-touch-btn-item .wb-touch-cd')).toBeNull();
    expect(container.querySelector('.wb-touch-btn-revive .wb-touch-cd')).toBeNull();
  });

  it('keeps the imperative held class through a cooldown re-render', () => {
    useHudStore.getState().set({ classId: 'knight', cooldowns: { basic: 0, a1: 0, a2: 0, a3: 0 } });
    const { container } = render(<TouchControls />);
    const basic = container.querySelector('.wb-touch-btn-basic') as HTMLElement;
    fireEvent.pointerDown(basic, { pointerId: 1 });
    expect(basic.classList.contains('held')).toBe(true);
    // A cooldown tick re-renders the button; the imperatively-set held class must persist
    // (the button's own className is kept static precisely so React can't reconcile it away).
    act(() => {
      useHudStore.getState().set({ cooldowns: { basic: 1.2, a1: 0, a2: 0, a3: 0 } });
    });
    expect(basic.classList.contains('held')).toBe(true);
    expect(basic.querySelector('.wb-touch-cd-num')?.textContent).toBe('1.2');
  });
});

// ---------------------------------------------------------------------------
// Swap radial button (item 14) — hold-drag mini-stick that opens the class radial
// ---------------------------------------------------------------------------

describe('<TouchControls> swap radial button', () => {
  const SWAP_DRAG_R = 56;

  function renderSwap(): HTMLElement {
    // A multiclass hero (classes.length > 1) is what surfaces the Swap button.
    useHudStore.getState().set({ classId: 'knight', classes: ['knight', 'mage'] });
    const { container } = render(<TouchControls />);
    const btn = container.querySelector('.wb-touch-btn-swap') as HTMLElement;
    centreStickAtOrigin(btn); // pin its centre (the drag origin) to (0,0)
    return btn;
  }

  it('holds swap on pointerdown and reports a centred (zero) direction', () => {
    const btn = renderSwap();
    fireEvent.pointerDown(btn, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(btn.classList.contains('held')).toBe(true);
    expect(setTouchButtonMock).toHaveBeenLastCalledWith('swap', true);
    expect(setTouchSwapAimMock).toHaveBeenLastCalledWith(0, 0);
  });

  it('a drag beyond the dead-zone reports a scaled unit direction', () => {
    const btn = renderSwap();
    fireEvent.pointerDown(btn, { pointerId: 1, clientX: 0, clientY: 0 });
    setTouchSwapAimMock.mockClear();
    // Drag straight up 40px: |v| = 40 (> 12 dead-zone), scale = 40/56.
    fireEvent.pointerMove(btn, { pointerId: 1, clientX: 0, clientY: -40 });
    const [x, y] = setTouchSwapAimMock.mock.calls.at(-1)!;
    expect(x).toBe(0);
    expect(y).toBeCloseTo(-40 / SWAP_DRAG_R, 6);
  });

  it('clamps a big drag to the rim (magnitude 1)', () => {
    const btn = renderSwap();
    fireEvent.pointerDown(btn, { pointerId: 1, clientX: 0, clientY: 0 });
    setTouchSwapAimMock.mockClear();
    fireEvent.pointerMove(btn, { pointerId: 1, clientX: 200, clientY: 0 }); // way past the radius
    const [x, y] = setTouchSwapAimMock.mock.calls.at(-1)!;
    expect(x).toBeCloseTo(1, 6);
    expect(y).toBe(0);
  });

  it('a tiny drag inside the dead-zone stays centred (cancel)', () => {
    const btn = renderSwap();
    fireEvent.pointerDown(btn, { pointerId: 1, clientX: 0, clientY: 0 });
    setTouchSwapAimMock.mockClear();
    fireEvent.pointerMove(btn, { pointerId: 1, clientX: 3, clientY: 4 }); // |v| = 5 < 12
    expect(setTouchSwapAimMock).toHaveBeenLastCalledWith(0, 0);
  });

  it('releases swap on pointerup and re-centres the direction', () => {
    const btn = renderSwap();
    fireEvent.pointerDown(btn, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(btn, { pointerId: 1, clientX: 0, clientY: -40 });
    fireEvent.pointerUp(btn, { pointerId: 1 });
    expect(btn.classList.contains('held')).toBe(false);
    expect(setTouchButtonMock).toHaveBeenLastCalledWith('swap', false);
    expect(setTouchSwapAimMock).toHaveBeenLastCalledWith(0, 0);
  });

  it('releases on pointercancel too', () => {
    const btn = renderSwap();
    fireEvent.pointerDown(btn, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerCancel(btn, { pointerId: 1 });
    expect(btn.classList.contains('held')).toBe(false);
    expect(setTouchButtonMock).toHaveBeenLastCalledWith('swap', false);
  });

  it('does NOT release when the finger drags off the button (no pointerleave release)', () => {
    const btn = renderSwap();
    fireEvent.pointerDown(btn, { pointerId: 1, clientX: 0, clientY: 0 });
    setTouchButtonMock.mockClear();
    fireEvent.pointerLeave(btn, { pointerId: 1 });
    // Still held: dragging the finger past the rim keeps the radial gesture alive.
    expect(btn.classList.contains('held')).toBe(true);
    expect(setTouchButtonMock).not.toHaveBeenCalledWith('swap', false);
  });

  it('a move before any press is ignored (no active pointer)', () => {
    const btn = renderSwap();
    setTouchSwapAimMock.mockClear();
    fireEvent.pointerMove(btn, { pointerId: 1, clientX: 0, clientY: -40 });
    expect(setTouchSwapAimMock).not.toHaveBeenCalled();
  });

  it('a release before any press is ignored (release sees no active gesture)', () => {
    const btn = renderSwap();
    setTouchButtonMock.mockClear();
    setTouchSwapAimMock.mockClear();
    // A stray pointerup with no preceding pointerdown: `release` finds active ===
    // false and bails out before clearing the swap button / aim state.
    fireEvent.pointerUp(btn, { pointerId: 1 });
    expect(btn.classList.contains('held')).toBe(false);
    expect(setTouchButtonMock).not.toHaveBeenCalled();
    expect(setTouchSwapAimMock).not.toHaveBeenCalled();
  });
});
