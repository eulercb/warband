/**
 * Coverage mop-up — canonical (non-composed) resolution paths for the new riders
 * that the mechanic tests reach via buffs/manual setup rather than a real cast.
 */
import { describe, it, expect } from 'vitest';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { World } from '../src/engine/world/world';
import type { Vec2 } from '../src/engine/core/types';

const ZERO: Vec2 = { x: 0, y: 0 };

describe('canonical selfBuff grantsFlight (item 7)', () => {
  it('casting Dragon Wings lifts the caster airborne', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [{ peerId: 'a', name: 'A', classId: 'sorcerer', subSkills: ['so_draconic_wing'] }],
    });
    const p = w.players[0];
    expect(p.subAbilities?.sub1?.name).toBe('Dragon Wings');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'flight')).toBe(true); // grantsFlight rider fired
    expect(p.buffs.some((b) => b.kind === 'moveSpeed')).toBe(true); // + the speed buff
  });
});
