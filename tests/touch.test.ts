// @vitest-environment jsdom
/**
 * Mobile touch overlay (item 2): the `touch` singleton feeds a first-class input
 * source into the InputManager. We assert that an engaged virtual stick/button
 * wins over an idle keyboard and that held button state passes straight through.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InputManager } from '../src/input/input';
import {
  setTouchMove,
  setTouchAim,
  setTouchButton,
  setTouchSwapAim,
  touchSwapAim,
  resetTouch,
  touchEngaged,
  isTouchCapable,
} from '../src/input/touch';

const ORIGIN = { x: 0, y: 0 };
let target: HTMLElement;
let manager: InputManager;

beforeEach(() => {
  resetTouch();
  target = document.createElement('canvas');
  document.body.appendChild(target);
  manager = new InputManager(target);
});
afterEach(() => {
  resetTouch();
  manager.dispose();
  target.remove();
});

describe('touch input source', () => {
  it('is idle by default (keyboard wins)', () => {
    expect(touchEngaged()).toBe(false);
    const s = manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('keyboard');
    expect(s.move).toEqual({ x: 0, y: 0 });
  });

  it('an engaged stick makes touch the active source and passes move through', () => {
    setTouchMove(0.6, -0.8);
    const s = manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('touch');
    expect(s.move.x).toBeCloseTo(0.6, 5);
    expect(s.move.y).toBeCloseTo(-0.8, 5);
  });

  it('a held virtual button reports held state (host does the edge detection)', () => {
    setTouchButton('a1', true);
    let s = manager.sample(ORIGIN);
    expect(manager.activeSource).toBe('touch');
    expect(s.buttons.a1).toBe(true);
    setTouchButton('a1', false);
    // Still touch (recently used) but no longer held.
    s = manager.sample(ORIGIN);
    expect(s.buttons.a1).toBe(false);
  });

  it('a touch aim vector becomes a unit reticle direction', () => {
    setTouchAim(0, 3); // straight down, un-normalized
    const s = manager.sample(ORIGIN);
    expect(Math.hypot(s.aim.x, s.aim.y)).toBeCloseTo(1, 5);
    expect(s.aim.y).toBeCloseTo(1, 5);
  });

  it('isTouchCapable does not throw in a DOM environment', () => {
    expect(typeof isTouchCapable()).toBe('boolean');
  });

  it('carries the class-radial swap-drag direction and clears it on reset', () => {
    expect(touchSwapAim()).toEqual({ x: 0, y: 0 });
    setTouchSwapAim(0.5, -0.5);
    expect(touchSwapAim()).toEqual({ x: 0.5, y: -0.5 });
    // Returned as a copy — mutating it can't corrupt the singleton.
    const v = touchSwapAim();
    v.x = 99;
    expect(touchSwapAim().x).toBe(0.5);
    // A non-zero drag counts as touch activity (wins over an idle keyboard).
    expect(touchEngaged()).toBe(false); // swapAim alone isn't "engaged"…
    setTouchButton('swap', true); // …but the held Swap button is
    expect(touchEngaged()).toBe(true);
    resetTouch();
    expect(touchSwapAim()).toEqual({ x: 0, y: 0 });
  });
});
