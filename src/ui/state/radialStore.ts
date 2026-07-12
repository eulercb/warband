/**
 * Warband — tiny store backing the multiclass class-radial overlay (item 14).
 *
 * Kept apart from the main app store (like hudStore) so the hot game loop can
 * push radial state ~per-frame without re-rendering menus. GameView owns the
 * gesture and writes here non-reactively via `radialSet`/`radialClose`; the
 * `<ClassRadial>` overlay subscribes and draws the wheel.
 */
import { create } from 'zustand';
import type { ClassId } from '../../engine/core/types';

export interface RadialState {
  /** Whether the wheel is shown right now. */
  open: boolean;
  /** Owned classes around the wheel; index order = slot order. */
  options: ClassId[];
  /** The hero's currently-active class (highlighted). */
  activeClassId: ClassId | null;
  /** Highlighted slot index, or -1 when centred (releasing there cancels). */
  hover: number;
  /** Whether a swap is off its gate now (false ⇒ a "recharging" hint). */
  ready: boolean;

  set: (patch: Partial<Omit<RadialState, 'set' | 'close'>>) => void;
  /** Hide the wheel and clear the hover (keeps the last options for a clean fade). */
  close: () => void;
}

const INITIAL: Omit<RadialState, 'set' | 'close'> = {
  open: false,
  options: [],
  activeClassId: null,
  hover: -1,
  ready: true,
};

export const useRadialStore = create<RadialState>((set) => ({
  ...INITIAL,
  set: (patch) => set(patch),
  close: () => set({ open: false, hover: -1 }),
}));

/** Non-reactive setter for the render loop (avoids hook subscription cost). */
export const radialSet = (patch: Partial<Omit<RadialState, 'set' | 'close'>>): void =>
  useRadialStore.getState().set(patch);

/** Non-reactive close for the render loop. */
export const radialClose = (): void => useRadialStore.getState().close();
