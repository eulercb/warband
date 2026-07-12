/**
 * Tests for the class-radial store (src/ui/state/radialStore.ts) — the tiny
 * off-React store GameView pushes the wheel state into and <ClassRadial> reads.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useRadialStore, radialSet, radialClose } from '../src/ui/state/radialStore';

beforeEach(() => {
  useRadialStore.setState({
    open: false,
    options: [],
    activeClassId: null,
    hover: -1,
    ready: true,
  });
});

describe('radialStore', () => {
  it('starts closed and empty', () => {
    const s = useRadialStore.getState();
    expect(s.open).toBe(false);
    expect(s.options).toEqual([]);
    expect(s.hover).toBe(-1);
    expect(s.ready).toBe(true);
  });

  it('radialSet patches the wheel state', () => {
    radialSet({
      open: true,
      options: ['knight', 'mage'],
      activeClassId: 'knight',
      hover: 1,
      ready: false,
    });
    const s = useRadialStore.getState();
    expect(s.open).toBe(true);
    expect(s.options).toEqual(['knight', 'mage']);
    expect(s.activeClassId).toBe('knight');
    expect(s.hover).toBe(1);
    expect(s.ready).toBe(false);
  });

  it('radialClose hides the wheel and clears the hover but keeps the last options', () => {
    radialSet({ open: true, options: ['knight', 'mage'], hover: 1 });
    radialClose();
    const s = useRadialStore.getState();
    expect(s.open).toBe(false);
    expect(s.hover).toBe(-1);
    expect(s.options).toEqual(['knight', 'mage']); // untouched for a clean fade
  });

  it('exposes the same set() through the hook instance', () => {
    useRadialStore.getState().set({ hover: 3 });
    expect(useRadialStore.getState().hover).toBe(3);
    useRadialStore.getState().close();
    expect(useRadialStore.getState().open).toBe(false);
  });
});
