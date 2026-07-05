/**
 * Warband — remappable input bindings (keyboard + gamepad), persisted locally.
 *
 * Each player customizes their own controls; bindings live in `localStorage`
 * and are read by `keyboard.ts` / `gamepad.ts` every sample and by the HUD to
 * label ability buttons. A small Zustand store is the reactive source of truth
 * so the Controls screen re-renders on change; `getBindings()` is the cheap,
 * non-reactive read used by the hot input path.
 */
import { create } from 'zustand';

/** Directional movement actions (keyboard only; pads use the left stick). */
export type MoveAction = 'up' | 'down' | 'left' | 'right';
/** Ability / action buttons (rebindable on both keyboard and gamepad). */
export type ButtonAction = 'basic' | 'a1' | 'a2' | 'a3' | 'revive';
export type KeyAction = MoveAction | ButtonAction;

/** Two slots per action: a primary and an optional alternate. */
export type KeyBindings = Record<KeyAction, string[]>;
export type PadBindings = Record<ButtonAction, number[]>;

export interface Bindings {
  keys: KeyBindings;
  pad: PadBindings;
}

export const MOVE_ACTIONS: MoveAction[] = ['up', 'down', 'left', 'right'];
export const BUTTON_ACTIONS: ButtonAction[] = ['basic', 'a1', 'a2', 'a3', 'revive'];

/** Human-facing labels for each action row in the Controls screen. */
export const ACTION_LABELS: Record<KeyAction, string> = {
  up: 'Move Up',
  down: 'Move Down',
  left: 'Move Left',
  right: 'Move Right',
  basic: 'Basic Attack',
  a1: 'Ability 1',
  a2: 'Ability 2',
  a3: 'Ability 3',
  revive: 'Revive (hold)',
};

export const DEFAULT_BINDINGS: Bindings = {
  keys: {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    basic: ['Space'],
    a1: ['KeyQ', 'Digit1'],
    a2: ['KeyE', 'Digit2'],
    a3: ['KeyR', 'Digit3'],
    revive: ['KeyF'],
  },
  // Standard-mapping button indices (see gamepad.ts): 0=✕ 1=◯ 2=▢ 3=△ 4=L1 5=R1.
  pad: {
    basic: [0],
    a1: [1],
    a2: [2],
    a3: [3],
    revive: [4, 5],
  },
};

const STORAGE_KEY = 'warband.bindings.v1';

function clone(b: Bindings): Bindings {
  return {
    keys: Object.fromEntries(
      (Object.keys(b.keys) as KeyAction[]).map((k) => [k, [...b.keys[k]]]),
    ) as KeyBindings,
    pad: Object.fromEntries(
      (Object.keys(b.pad) as ButtonAction[]).map((k) => [k, [...b.pad[k]]]),
    ) as PadBindings,
  };
}

/** Load persisted bindings, merged over defaults so new actions get a default. */
function load(): Bindings {
  const base = clone(DEFAULT_BINDINGS);
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Bindings>;
    if (saved.keys) {
      for (const a of Object.keys(base.keys) as KeyAction[]) {
        if (Array.isArray(saved.keys[a])) base.keys[a] = saved.keys[a] as string[];
      }
    }
    if (saved.pad) {
      for (const a of Object.keys(base.pad) as ButtonAction[]) {
        if (Array.isArray(saved.pad[a])) base.pad[a] = saved.pad[a] as number[];
      }
    }
  } catch {
    /* corrupt / unavailable storage — fall back to defaults */
  }
  return base;
}

function persist(b: Bindings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
    }
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

interface BindingsStore {
  bindings: Bindings;
  /** Set the keyboard code at `slot` (0 = primary, 1 = alternate) for an action. */
  setKey: (action: KeyAction, slot: number, code: string) => void;
  /** Set the gamepad button index at `slot` for an action. */
  setPad: (action: ButtonAction, slot: number, buttonIndex: number) => void;
  reset: () => void;
}

export const useBindings = create<BindingsStore>((set, get) => ({
  bindings: load(),
  setKey: (action, slot, code) => {
    const next = clone(get().bindings);
    // A key can only ever drive ONE action: strip this code from every action
    // (including other slots of the target) before assigning it, so re-binding a
    // key already in use clears its previous owner instead of double-binding it.
    for (const a of Object.keys(next.keys) as KeyAction[]) {
      next.keys[a] = next.keys[a].filter((c) => c !== code);
    }
    const arr = next.keys[action];
    while (arr.length <= slot) arr.push('');
    arr[slot] = code;
    // Keep the array compact (drop an empty alternate slot).
    next.keys[action] = arr.filter((c, i) => c !== '' || i === 0);
    persist(next);
    set({ bindings: next });
  },
  setPad: (action, slot, buttonIndex) => {
    const next = clone(get().bindings);
    // Same single-owner rule for gamepad buttons: clear the button from any other
    // action first so the newest binding wins and the old one is released.
    for (const a of Object.keys(next.pad) as ButtonAction[]) {
      next.pad[a] = next.pad[a].filter((v) => v !== buttonIndex);
    }
    const arr = next.pad[action];
    while (arr.length <= slot) arr.push(-1);
    arr[slot] = buttonIndex;
    next.pad[action] = arr.filter((v, i) => v >= 0 || i === 0);
    persist(next);
    set({ bindings: next });
  },
  reset: () => {
    const next = clone(DEFAULT_BINDINGS);
    persist(next);
    set({ bindings: next });
  },
}));

/** Cheap, non-reactive read for the hot input path. */
export function getBindings(): Bindings {
  return useBindings.getState().bindings;
}

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

/** Slot -> the action button that fires it (for HUD labels). */
export const SLOT_ACTION: Record<'basic' | 'a1' | 'a2' | 'a3', ButtonAction> = {
  basic: 'basic',
  a1: 'a1',
  a2: 'a2',
  a3: 'a3',
};

/** Compact display label for a `KeyboardEvent.code` (e.g. `KeyQ` -> `Q`). */
export function codeToLabel(code: string | undefined): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  if (code.startsWith('Arrow')) {
    return { Up: '↑', Down: '↓', Left: '←', Right: '→' }[code.slice(5)] ?? code;
  }
  const special: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'LShift',
    ShiftRight: 'RShift',
    ControlLeft: 'LCtrl',
    ControlRight: 'RCtrl',
    Enter: '⏎',
    Tab: 'Tab',
    Backquote: '`',
  };
  return special[code] ?? code;
}

/** PlayStation/standard glyph for a gamepad button index (DualSense-first). */
export function padIndexToLabel(index: number | undefined): string {
  if (index == null || index < 0) return '—';
  const glyphs: Record<number, string> = {
    0: '✕',
    1: '◯',
    2: '▢',
    3: '△',
    4: 'L1',
    5: 'R1',
    6: 'L2',
    7: 'R2',
    8: 'Share',
    9: 'Options',
    10: 'L3',
    11: 'R3',
    12: '↑',
    13: '↓',
    14: '←',
    15: '→',
  };
  return glyphs[index] ?? `B${index}`;
}

/** Primary keyboard label for an action (used by the HUD). */
export function keyLabelFor(action: KeyAction): string {
  const codes = getBindings().keys[action];
  // Basic also always fires on left mouse; show that hint when relevant.
  const primary = codeToLabel(codes[0]);
  if (action === 'basic') return codes.length ? `LMB/${primary}` : 'LMB';
  return primary;
}

/** Primary gamepad label for an action (used by the HUD). */
export function padLabelFor(action: ButtonAction): string {
  return padIndexToLabel(getBindings().pad[action][0]);
}
