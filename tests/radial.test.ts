/**
 * Unit tests for the multiclass class-radial gesture + geometry (src/input/radial.ts).
 *
 * Pure and device-agnostic: we drive the tap-vs-hold state machine with explicit
 * timestamps (never a real clock) and assert the wheel-layout helpers place owned
 * classes evenly and map a pointing direction to the right slot. This is the logic
 * behind "a quick tap cycles, a hold opens the radial you release onto" — GameView
 * only wires it to input + the store.
 */
import { describe, it, expect } from 'vitest';
import {
  SwapGesture,
  RADIAL_HOLD_MS,
  slotAngle,
  slotOffset,
  hoveredSlot,
} from '../src/input/radial';

describe('SwapGesture — tap vs hold', () => {
  it('a quick press+release (under the hold threshold) resolves to a cycle', () => {
    const g = new SwapGesture();
    expect(g.update(0, false, true)).toEqual({ open: false, release: null }); // idle
    expect(g.update(0, true, true)).toEqual({ open: false, release: null }); // rising edge
    // Released well before RADIAL_HOLD_MS → a tap.
    expect(g.update(RADIAL_HOLD_MS - 50, false, true)).toEqual({ open: false, release: 'cycle' });
    expect(g.isOpen).toBe(false);
  });

  it('holding past the threshold opens the radial, and releasing commits it', () => {
    const g = new SwapGesture();
    g.update(0, true, true); // press
    expect(g.update(100, true, true).open).toBe(false); // still under threshold
    const opened = g.update(RADIAL_HOLD_MS + 10, true, true);
    expect(opened).toEqual({ open: true, release: null });
    expect(g.isOpen).toBe(true);
    // Release while open → commit the selection.
    const released = g.update(RADIAL_HOLD_MS + 40, false, true);
    expect(released).toEqual({ open: false, release: 'commit' });
    expect(g.isOpen).toBe(false);
  });

  it('never opens while it is not openable, and still cycles on release', () => {
    const g = new SwapGesture();
    g.update(0, true, false); // press, but canOpen === false (e.g. single class / frozen)
    expect(g.update(RADIAL_HOLD_MS + 100, true, false).open).toBe(false);
    expect(g.update(RADIAL_HOLD_MS + 120, false, false).release).toBe('cycle');
  });

  it('drops an open radial back to a tap-cycle if it stops being openable mid-hold', () => {
    const g = new SwapGesture();
    g.update(0, true, true);
    expect(g.update(RADIAL_HOLD_MS + 10, true, true).open).toBe(true); // opened
    expect(g.update(RADIAL_HOLD_MS + 20, true, false).open).toBe(false); // canOpen lost → closes
    // Because it is no longer "opened", the eventual release cycles, not commits.
    expect(g.update(RADIAL_HOLD_MS + 30, false, false).release).toBe('cycle');
  });

  it('emits nothing on a frame where the button is merely held', () => {
    const g = new SwapGesture();
    g.update(0, true, true);
    expect(g.update(50, true, true)).toEqual({ open: false, release: null });
  });

  it('reset() clears an open radial and requires a fresh press to reopen', () => {
    const g = new SwapGesture();
    g.update(0, true, true);
    expect(g.update(RADIAL_HOLD_MS + 10, true, true).open).toBe(true);
    g.reset();
    expect(g.isOpen).toBe(false);
    // The button is still physically held, but reset drops the held flag, so the
    // next frame is treated as a new rising edge and re-times from there.
    expect(g.update(RADIAL_HOLD_MS + 20, true, true).open).toBe(false);
    expect(g.update(2 * RADIAL_HOLD_MS + 40, true, true).open).toBe(true);
  });
});

describe('radial geometry', () => {
  it('slot 0 sits at the top and slots march clockwise', () => {
    // Screen space: +y points down, so "top" is angle -π/2.
    expect(slotAngle(0, 4)).toBeCloseTo(-Math.PI / 2, 6);
    expect(slotAngle(1, 4)).toBeCloseTo(0, 6); // right
    expect(slotAngle(2, 4)).toBeCloseTo(Math.PI / 2, 6); // bottom
    expect(slotAngle(3, 4)).toBeCloseTo(Math.PI, 6); // left
    expect(slotAngle(0, 0)).toBe(0); // degenerate guard
  });

  it('slotOffset is the unit-circle position of a slot', () => {
    const top = slotOffset(0, 4);
    expect(top.x).toBeCloseTo(0, 6);
    expect(top.y).toBeCloseTo(-1, 6); // straight up
    const right = slotOffset(1, 4);
    expect(right.x).toBeCloseTo(1, 6);
    expect(right.y).toBeCloseTo(0, 6);
  });

  it('hoveredSlot maps a pointing direction to the nearest slot', () => {
    // n = 4: up, right, down, left.
    expect(hoveredSlot(0, -1, 4)).toBe(0); // up
    expect(hoveredSlot(1, 0, 4)).toBe(1); // right
    expect(hoveredSlot(0, 1, 4)).toBe(2); // down
    expect(hoveredSlot(-1, 0, 4)).toBe(3); // left
    // n = 2: up vs down.
    expect(hoveredSlot(0.1, -0.9, 2)).toBe(0);
    expect(hoveredSlot(-0.1, 0.9, 2)).toBe(1);
  });

  it('a centred / tiny / non-finite direction selects nothing (cancel)', () => {
    expect(hoveredSlot(0, 0, 4)).toBe(-1);
    expect(hoveredSlot(0.00001, 0, 4, 0.001)).toBe(-1); // inside the dead-zone
    expect(hoveredSlot(1, 0, 0)).toBe(-1); // no slots
    expect(hoveredSlot(NaN, 0, 4)).toBe(-1);
  });
});
