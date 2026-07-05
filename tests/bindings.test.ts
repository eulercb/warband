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

  it('rebinding a key already used by another action clears the old owner', () => {
    // 'KeyQ' is the default primary for a1. Bind it to a2 and a1 must lose it.
    useBindings.getState().setKey('a2', 0, 'KeyQ');
    expect(getBindings().keys.a2[0]).toBe('KeyQ');
    expect(getBindings().keys.a1.includes('KeyQ')).toBe(false);
  });

  it('rebinding a pad button already in use clears the old owner', () => {
    // Button 0 is the default for basic. Bind it to a1 and basic must lose it.
    useBindings.getState().setPad('a1', 0, 0);
    expect(getBindings().pad.a1[0]).toBe(0);
    expect(getBindings().pad.basic.includes(0)).toBe(false);
  });
});
