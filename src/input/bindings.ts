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
/**
 * Ability / action buttons (rebindable on both keyboard and gamepad). Beyond the
 * base kit: `sub1`/`sub2` fire the two subclass skills, `swap` cycles multiclass
 * (hold for the radial), and `item` spends the selected ephemeral shop item.
 */
export type ButtonAction =
  'basic' | 'a1' | 'a2' | 'a3' | 'revive' | 'sub1' | 'sub2' | 'swap' | 'item';
export type KeyAction = MoveAction | ButtonAction;

/** Two slots per action: a primary and an optional alternate. */
export type KeyBindings = Record<KeyAction, string[]>;
export type PadBindings = Record<ButtonAction, number[]>;

/**
 * Which glyph set to draw for gamepad buttons. `auto` sniffs the connected pad's
 * id (PlayStation shapes vs. Xbox/Nintendo letters); the rest force a set so a
 * player on an unrecognised pad can still pick the icons that match their device.
 */
export type PadScheme = 'auto' | 'playstation' | 'xbox' | 'nintendo' | 'letters';
export const PAD_SCHEMES: PadScheme[] = ['auto', 'playstation', 'xbox', 'nintendo', 'letters'];
export const PAD_SCHEME_LABELS: Record<PadScheme, string> = {
  auto: 'Auto-detect',
  playstation: 'PlayStation (✕ ◯ ▢ △)',
  xbox: 'Xbox (A B X Y)',
  nintendo: 'Nintendo (B A Y X)',
  letters: 'Letters (A B X Y)',
};

export interface Bindings {
  keys: KeyBindings;
  pad: PadBindings;
  /** Preferred gamepad glyph set (persisted). */
  padScheme: PadScheme;
}

export const MOVE_ACTIONS: MoveAction[] = ['up', 'down', 'left', 'right'];
export const BUTTON_ACTIONS: ButtonAction[] = [
  'basic',
  'a1',
  'a2',
  'a3',
  'revive',
  'sub1',
  'sub2',
  'swap',
  'item',
];

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
  sub1: 'Subclass Skill 1',
  sub2: 'Subclass Skill 2',
  swap: 'Swap Class (hold: radial)',
  item: 'Use Item',
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
    sub1: ['KeyZ'],
    sub2: ['KeyX'],
    swap: ['KeyC'],
    item: ['KeyV'],
  },
  // Standard-mapping button indices (see gamepad.ts): 0=✕ 1=◯ 2=▢ 3=△ 4=L1 5=R1
  // 6=L2 7=R2 8=Share/View 10=L3 (9=Options/Start is reserved for pause).
  pad: {
    basic: [0],
    a1: [1],
    a2: [2],
    a3: [3],
    revive: [4, 5],
    sub1: [6],
    sub2: [7],
    swap: [8],
    item: [10],
  },
  padScheme: 'auto',
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
    padScheme: b.padScheme,
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
        if (Array.isArray(saved.keys[a])) base.keys[a] = saved.keys[a];
      }
    }
    if (saved.pad) {
      for (const a of Object.keys(base.pad) as ButtonAction[]) {
        if (Array.isArray(saved.pad[a])) base.pad[a] = saved.pad[a];
      }
    }
    if (typeof saved.padScheme === 'string' && PAD_SCHEMES.includes(saved.padScheme)) {
      base.padScheme = saved.padScheme;
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
  /** Choose the gamepad glyph set (auto / PlayStation / Xbox / …). */
  setPadScheme: (scheme: PadScheme) => void;
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
  setPadScheme: (scheme) => {
    const next = clone(get().bindings);
    next.padScheme = scheme;
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
export const SLOT_ACTION: Record<'basic' | 'a1' | 'a2' | 'a3' | 'sub1' | 'sub2', ButtonAction> = {
  basic: 'basic',
  a1: 'a1',
  a2: 'a2',
  a3: 'a3',
  sub1: 'sub1',
  sub2: 'sub2',
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

/** Concrete glyph type a scheme resolves to (never `auto`). */
export type PadGlyphs = 'playstation' | 'xbox' | 'nintendo' | 'letters';

/** Face/shoulder/dpad glyphs per concrete scheme, keyed by standard-mapping index. */
const PAD_GLYPHS: Record<PadGlyphs, Record<number, string>> = {
  playstation: {
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
  },
  xbox: {
    0: 'A',
    1: 'B',
    2: 'X',
    3: 'Y',
    4: 'LB',
    5: 'RB',
    6: 'LT',
    7: 'RT',
    8: 'View',
    9: 'Menu',
    10: 'LS',
    11: 'RS',
    12: '↑',
    13: '↓',
    14: '←',
    15: '→',
  },
  nintendo: {
    0: 'B',
    1: 'A',
    2: 'Y',
    3: 'X',
    4: 'L',
    5: 'R',
    6: 'ZL',
    7: 'ZR',
    8: '-',
    9: '+',
    10: 'LS',
    11: 'RS',
    12: '↑',
    13: '↓',
    14: '←',
    15: '→',
  },
  letters: {
    0: 'A',
    1: 'B',
    2: 'X',
    3: 'Y',
    4: 'LB',
    5: 'RB',
    6: 'LT',
    7: 'RT',
    8: 'Select',
    9: 'Start',
    10: 'LS',
    11: 'RS',
    12: '↑',
    13: '↓',
    14: '←',
    15: '→',
  },
};

/** Sniff the first connected pad's id string for its family (PlayStation-default). */
export function detectPadGlyphs(): PadGlyphs {
  try {
    const nav = navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] };
    for (const pad of nav.getGamepads?.() ?? []) {
      if (!pad || !pad.connected) continue;
      const id = pad.id.toLowerCase();
      if (/xbox|xinput|x-input|045e|microsoft/.test(id)) return 'xbox';
      if (/switch|joy-?con|pro controller|057e|nintendo/.test(id)) return 'nintendo';
      if (/054c|dualsense|dualshock|playstation|wireless controller/.test(id)) return 'playstation';
      return 'letters'; // recognised a pad but not its family → safe A/B/X/Y
    }
  } catch {
    /* no gamepad API */
  }
  return 'playstation';
}

/** The concrete glyph set to draw right now, honouring the user's `padScheme`. */
export function resolvePadGlyphs(): PadGlyphs {
  const scheme = getBindings().padScheme;
  return scheme === 'auto' ? detectPadGlyphs() : scheme;
}

/** Glyph for a gamepad button index in the active (or a forced) scheme. */
export function padIndexToLabel(index: number | undefined, glyphs?: PadGlyphs): string {
  if (index == null || index < 0) return '—';
  const set = PAD_GLYPHS[glyphs ?? resolvePadGlyphs()];
  return set[index] ?? `B${index}`;
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
