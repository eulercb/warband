import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_BINDINGS,
  MOVE_ACTIONS,
  BUTTON_ACTIONS,
  codeToLabel,
  padIndexToLabel,
  keyLabelFor,
  padLabelFor,
  getBindings,
  useBindings,
} from '../src/input/bindings';

describe('bindings: defaults + shape', () => {
  beforeEach(() => useBindings.getState().reset());

  it('defines every action for keyboard and pad', () => {
    for (const a of [...MOVE_ACTIONS, ...BUTTON_ACTIONS]) {
      expect(Array.isArray(DEFAULT_BINDINGS.keys[a])).toBe(true);
      expect(DEFAULT_BINDINGS.keys[a].length).toBeGreaterThan(0);
    }
    for (const a of BUTTON_ACTIONS) {
      expect(DEFAULT_BINDINGS.pad[a].length).toBeGreaterThan(0);
    }
  });
});

describe('bindings: display labels', () => {
  it('maps key codes to compact labels', () => {
    expect(codeToLabel('KeyQ')).toBe('Q');
    expect(codeToLabel('Digit1')).toBe('1');
    expect(codeToLabel('Space')).toBe('Space');
    expect(codeToLabel('ArrowUp')).toBe('↑');
    expect(codeToLabel(undefined)).toBe('—');
  });

  it('maps pad indices to glyphs', () => {
    expect(padIndexToLabel(0)).toBe('✕');
    expect(padIndexToLabel(3)).toBe('△');
    expect(padIndexToLabel(4)).toBe('L1');
    expect(padIndexToLabel(-1)).toBe('—');
  });
});

describe('bindings: store + live labels', () => {
  beforeEach(() => useBindings.getState().reset());

  it('label helpers reflect the current bindings', () => {
    expect(keyLabelFor('a1')).toBe('Q'); // default primary
    expect(padLabelFor('basic')).toBe('✕');
    expect(keyLabelFor('basic')).toContain('LMB');
  });

  it('rebinding a key updates getBindings + labels', () => {
    useBindings.getState().setKey('a1', 0, 'KeyZ');
    expect(getBindings().keys.a1[0]).toBe('KeyZ');
    expect(keyLabelFor('a1')).toBe('Z');
    useBindings.getState().reset();
    expect(keyLabelFor('a1')).toBe('Q');
  });

  it('rebinding a pad button updates the label', () => {
    useBindings.getState().setPad('basic', 0, 3);
    expect(padLabelFor('basic')).toBe('△');
  });
});
