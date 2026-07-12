/**
 * Subclass skills (item 13) + multiclass swap (item 14) — host-authoritative
 * World behaviour, driven directly.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import { SIM_DT } from '../src/engine/core/constants';
import { getSubSkill } from '../src/engine/content/subclasses';
import type { InputCommand } from '../src/engine/core/types';

function input(over: Partial<InputCommand['buttons']>): InputCommand {
  return {
    seq: 1,
    move: { x: 0, y: 0 },
    aim: { x: 0, y: -1 },
    buttons: { basic: false, a1: false, a2: false, a3: false, revive: false, ...over },
  };
}

describe('subclass skills', () => {
  it('binds chosen skills to sub1/sub2 with their own cooldowns', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          subSkills: ['kn_champion_slam', 'kn_champion_riposte'],
        },
      ],
    });
    const p = w.players[0];
    expect(p.subAbilities?.sub1?.name).toBe(getSubSkill('kn_champion_slam')!.ability.name);
    expect(p.subAbilities?.sub2?.name).toBe(getSubSkill('kn_champion_riposte')!.ability.name);
    expect(p.cooldowns.sub1).toBe(0);
    expect(p.cooldowns.sub2).toBe(0);
    expect(p.subSkillIds).toEqual(['kn_champion_slam', 'kn_champion_riposte']);
  });

  it('firing sub1 casts the skill and puts it on cooldown', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 2,
      players: [{ peerId: 'a', name: 'A', classId: 'knight', subSkills: ['kn_champion_slam'] }],
    });
    // Stand next to the boss so the pbaoe lands.
    w.players[0].pos = { ...w.bosses[0].pos };
    const before = w.bosses[0].hp;
    w.step(SIM_DT, new Map([['a', input({ sub1: true })]]));
    expect(w.players[0].cooldowns.sub1).toBeGreaterThan(0);
    expect(w.bosses[0].hp).toBeLessThan(before); // Earthshaker connected
  });

  it('a silenced hero can only use the basic attack', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [{ peerId: 'a', name: 'A', classId: 'knight', subSkills: ['kn_champion_slam'] }],
    });
    const p = w.players[0];
    p.buffs.push({ kind: 'silence', mult: 1, remaining: 5, source: 'test' });
    p.pos = { ...w.bosses[0].pos };
    w.step(SIM_DT, new Map([['a', input({ sub1: true, a1: true })]]));
    // Silenced: neither the sub skill nor a1 went on cooldown.
    expect(p.cooldowns.sub1 ?? 0).toBe(0);
    expect(p.cooldowns.a1).toBe(0);
  });
});

describe('multiclass swap', () => {
  function multiWorld() {
    return new World({
      monsterId: 'dragon',
      seed: 5,
      players: [{ peerId: 'a', name: 'A', classId: 'knight', extraClasses: ['mage'] }],
    });
  }

  it('builds a swappable kit per owned class', () => {
    const w = multiWorld();
    const p = w.players[0];
    expect(p.classes).toEqual(['knight', 'mage']);
    expect(p.classTables?.knight?.a1.name).toBe('Taunt');
    expect(p.classTables?.mage?.a1.name).toBe('Fireball');
    expect(p.classId).toBe('knight');
  });

  it('setActiveClass swaps the active kit and preserves per-class cooldowns', () => {
    const w = multiWorld();
    const p = w.players[0];
    p.cooldowns.a1 = 8; // Taunt on cooldown
    w.setActiveClass(p, 'mage');
    expect(p.classId).toBe('mage');
    expect(p.abilities?.a1.name).toBe('Fireball'); // now wielding the mage kit
    expect(p.classCooldowns?.knight?.a1).toBe(8); // knight's Taunt cd was stashed
    // The swap gate blocks an immediate re-swap.
    w.setActiveClass(p, 'knight');
    expect(p.classId).toBe('mage');
  });

  it('a tap on swap cycles the class in a live step', () => {
    const w = multiWorld();
    w.step(SIM_DT, new Map([['a', input({ swap: true })]]));
    expect(w.players[0].classId).toBe('mage');
  });
});
