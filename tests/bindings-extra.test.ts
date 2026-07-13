// @vitest-environment jsdom
/**
 * Extra bindings coverage: pad-scheme selection, gamepad-id sniffing, the label
 * edge cases, and the persisted-load merge path. (Core store behaviour lives in
 * bindings.test.ts.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useBindings,
  getBindings,
  codeToLabel,
  padIndexToLabel,
  detectPadGlyphs,
  resolvePadGlyphs,
  keyLabelFor,
  PAD_SCHEMES,
  type PadGlyphs,
} from '../src/input/bindings';

interface FakePad {
  id: string;
  connected: boolean;
}

function stubGamepads(pads: (FakePad | null)[]): void {
  Object.defineProperty(navigator, 'getGamepads', {
    value: () => pads,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
  useBindings.getState().reset();
});

afterEach(() => {
  useBindings.getState().reset();
});

describe('setPadScheme', () => {
  it('updates and persists the chosen scheme', () => {
    useBindings.getState().setPadScheme('xbox');
    expect(getBindings().padScheme).toBe('xbox');
    expect(localStorage.getItem('warband.bindings.v1')).toContain('xbox');
  });

  it('supports every declared scheme', () => {
    for (const s of PAD_SCHEMES) {
      useBindings.getState().setPadScheme(s);
      expect(getBindings().padScheme).toBe(s);
    }
  });
});

describe('detectPadGlyphs', () => {
  it('defaults to playstation when no pad is connected', () => {
    stubGamepads([]);
    expect(detectPadGlyphs()).toBe('playstation');
    stubGamepads([null]);
    expect(detectPadGlyphs()).toBe('playstation');
  });

  it('sniffs the pad family from its id', () => {
    const cases: [string, PadGlyphs][] = [
      ['Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'xbox'],
      ['045e-Microsoft controller', 'xbox'],
      ['Pro Controller (Nintendo Switch)', 'nintendo'],
      ['Joy-Con (L)', 'nintendo'],
      ['DualSense Wireless Controller', 'playstation'],
      ['054c-PlayStation', 'playstation'],
      ['Some Generic USB Gamepad', 'letters'], // recognised, unknown family
    ];
    for (const [id, expected] of cases) {
      stubGamepads([{ id, connected: true }]);
      expect(detectPadGlyphs()).toBe(expected);
    }
  });

  it('skips disconnected pads', () => {
    stubGamepads([
      { id: 'Xbox', connected: false },
      { id: 'DualSense', connected: true },
    ]);
    expect(detectPadGlyphs()).toBe('playstation');
  });

  it('falls back to playstation if the gamepad API throws', () => {
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => {
        throw new Error('no gamepad api');
      },
      configurable: true,
      writable: true,
    });
    expect(detectPadGlyphs()).toBe('playstation');
  });
});

describe('resolvePadGlyphs', () => {
  it('returns the forced scheme when not auto', () => {
    useBindings.getState().setPadScheme('nintendo');
    expect(resolvePadGlyphs()).toBe('nintendo');
  });

  it('detects from the pad when auto', () => {
    useBindings.getState().setPadScheme('auto');
    stubGamepads([{ id: 'Xbox Wireless Controller', connected: true }]);
    expect(resolvePadGlyphs()).toBe('xbox');
  });
});

describe('label edge cases', () => {
  it('codeToLabel handles numpad, modifiers, arrows and passthrough', () => {
    expect(codeToLabel('Numpad5')).toBe('Num5');
    expect(codeToLabel('ShiftLeft')).toBe('LShift');
    expect(codeToLabel('ControlRight')).toBe('RCtrl');
    expect(codeToLabel('Enter')).toBe('⏎');
    expect(codeToLabel('Backquote')).toBe('`');
    expect(codeToLabel('ArrowLeft')).toBe('←');
    expect(codeToLabel('F5')).toBe('F5'); // unknown → passthrough
  });

  it('padIndexToLabel honours a forced glyph set and unknown indices', () => {
    expect(padIndexToLabel(0, 'xbox')).toBe('A');
    expect(padIndexToLabel(1, 'nintendo')).toBe('A');
    expect(padIndexToLabel(99, 'xbox')).toBe('B99'); // out of table
    expect(padIndexToLabel(undefined)).toBe('—');
  });

  it('keyLabelFor shows the LMB hint for the basic attack', () => {
    expect(keyLabelFor('basic')).toContain('LMB');
  });
});

describe('setKey slot handling', () => {
  it('assigns an alternate slot and keeps the primary', () => {
    useBindings.getState().setKey('a1', 1, 'KeyZ');
    const codes = getBindings().keys.a1;
    expect(codes[1]).toBe('KeyZ');
    expect(codes[0]).toBe('KeyQ'); // primary preserved
  });
});

describe('persisted load merge', () => {
  it('merges saved bindings over defaults on a fresh module load', async () => {
    localStorage.setItem(
      'warband.bindings.v1',
      JSON.stringify({ keys: { a1: ['KeyZ'] }, pad: { a1: [7] }, padScheme: 'xbox' }),
    );
    // Reset the module registry so a fresh import re-runs load() against storage.
    vi.resetModules();
    const mod = await import('../src/input/bindings');
    const b = mod.getBindings();
    expect(b.keys.a1[0]).toBe('KeyZ');
    expect(b.pad.a1[0]).toBe(7);
    expect(b.padScheme).toBe('xbox');
    // Untouched actions keep their defaults.
    expect(b.keys.up[0]).toBe('KeyW');
  });

  it('falls back to defaults when storage holds corrupt JSON', async () => {
    localStorage.setItem('warband.bindings.v1', '{not valid json');
    vi.resetModules();
    const mod = await import('../src/input/bindings');
    expect(mod.getBindings().keys.a1[0]).toBe('KeyQ');
  });
});

describe('persisted load — absent pad + invalid scheme branches', () => {
  it('leaves pad + scheme at defaults when the saved blob omits them (line 137 false, 142 non-string)', async () => {
    // Only `keys` was persisted: the `if (saved.pad)` guard takes its false arm
    // and `typeof saved.padScheme === 'string'` is false (padScheme is absent).
    localStorage.setItem('warband.bindings.v1', JSON.stringify({ keys: { a1: ['KeyM'] } }));
    vi.resetModules();
    const mod = await import('../src/input/bindings');
    const b = mod.getBindings();
    expect(b.keys.a1[0]).toBe('KeyM'); // saved key merged over the default
    expect(b.pad.a1[0]).toBe(1); // no saved.pad → default button retained
    expect(b.padScheme).toBe('auto'); // absent padScheme → default retained
  });

  it('ignores a padScheme string that is not a known scheme (line 142 includes-false)', async () => {
    // padScheme is a string (typeof passes) but not one of PAD_SCHEMES, so the
    // `PAD_SCHEMES.includes(...)` term is false and the default scheme is kept.
    localStorage.setItem(
      'warband.bindings.v1',
      JSON.stringify({ pad: { a1: [9] }, padScheme: 'nonsense' }),
    );
    vi.resetModules();
    const mod = await import('../src/input/bindings');
    const b = mod.getBindings();
    expect(b.pad.a1[0]).toBe(9); // saved pad merged (the `if (saved.pad)` true arm)
    expect(b.padScheme).toBe('auto'); // unknown scheme rejected → default kept
  });
});

describe('setKey / setPad slot compaction', () => {
  it('drops an empty middle slot when a key lands past the array end (line 186)', () => {
    // sub1 has a single default key ('KeyZ'); binding a fresh key at slot 2 pads
    // slot 1 with '' — the compaction filter must drop that empty interior gap.
    useBindings.getState().setKey('sub1', 2, 'KeyM');
    expect(getBindings().keys.sub1).toEqual(['KeyZ', 'KeyM']);
  });

  it('keeps an empty PRIMARY slot when the action was emptied first (line 186, i===0)', () => {
    // Rebinding revive's only key ('KeyF') onto its alternate slot strips it from
    // the primary; the `|| i === 0` clause preserves the (now empty) primary slot.
    useBindings.getState().setKey('revive', 1, 'KeyF');
    expect(getBindings().keys.revive).toEqual(['', 'KeyF']);
  });

  it('grows the pad array then drops the -1 filler (lines 198, 200)', () => {
    // Binding at slot 2 runs the while-loop padding with -1 (line 198); the
    // compaction filter (line 200) drops the interior -1 but keeps real indices.
    useBindings.getState().setPad('sub1', 2, 5);
    expect(getBindings().pad.sub1).toEqual([6, 5]);
  });

  it('keeps a -1 PRIMARY slot when the action was emptied first (line 200, i===0)', () => {
    // Moving sub1's only button (6) to its alternate slot empties the primary;
    // `|| i === 0` preserves the (now -1) primary slot.
    useBindings.getState().setPad('sub1', 1, 6);
    expect(getBindings().pad.sub1).toEqual([-1, 6]);
  });
});

describe('label fallbacks', () => {
  it('codeToLabel falls back to the raw code for an unknown Arrow* code (line 243)', () => {
    // The Up/Down/Left/Right lookup misses, so `?? code` returns the code itself.
    expect(codeToLabel('ArrowFoo')).toBe('ArrowFoo');
  });

  it('keyLabelFor(basic) is just "LMB" when basic has no bound key (line 373)', () => {
    // Steal basic's only key (Space) -> basic becomes empty -> the ternary's
    // false arm ('LMB', with no `/key` suffix) is taken.
    useBindings.getState().setKey('a1', 0, 'Space');
    expect(getBindings().keys.basic).toEqual([]);
    expect(keyLabelFor('basic')).toBe('LMB');
  });
});
