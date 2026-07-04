import { describe, it, expect } from 'vitest';
import type { Player, Boss, GameEvent } from '../src/engine/types';
import {
  damageBoss,
  damagePlayer,
  healPlayer,
  applyBuff,
  makeBuff,
  buffMult,
  tickBuffs,
} from '../src/engine/combat';

function mkPlayer(over: Partial<Player> = {}): Player {
  return {
    id: 1,
    peerId: 'p1',
    name: 'P',
    classId: 'knight',
    pos: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    hp: 100,
    maxHp: 100,
    moveSpeed: 200,
    radius: 16,
    state: 'alive',
    downedTimer: 0,
    reviveProgress: 0,
    reviverId: null,
    cooldowns: { basic: 0, a1: 0, a2: 0, a3: 0 },
    castTimer: 0,
    castSlot: null,
    buffs: [],
    threat: 0,
    stats: { damageDealt: 0, healingDone: 0, revives: 0, deaths: 0 },
    prevButtons: { basic: false, a1: false, a2: false, a3: false, revive: false },
    lastSeq: -1,
    ...over,
  };
}

function mkBoss(): Boss {
  return {
    id: 99,
    monsterId: 'dragon',
    pos: { x: 0, y: 0 },
    facing: 0,
    hp: 1000,
    maxHp: 1000,
    moveSpeed: 100,
    radius: 72,
    phase: 'normal',
    action: {
      kind: 'idle',
      abilityId: null,
      remaining: 0,
      total: 0,
      targetId: null,
      targetPos: null,
      aimAngle: 0,
      channelAccum: 0,
    },
    cooldowns: {},
    decisionTimer: 0,
    regen: 0,
    blinkTimer: 0,
    buffs: [],
  };
}

const sink = (): { events: GameEvent[] } => ({ events: [] });

describe('combat: damage', () => {
  it('applies base damage and tracks dealt', () => {
    const p = mkPlayer({ classId: 'ranger' });
    const boss = mkBoss();
    const out = damageBoss(sink(), p, boss, 20);
    expect(out).toBe(20);
    expect(boss.hp).toBe(980);
    expect(p.stats.damageDealt).toBe(20);
  });

  it('damageDealt buff multiplies outgoing damage', () => {
    const p = mkPlayer();
    applyBuff(p, makeBuff('damageDealt', 1.25, 6, 'blessing'));
    const boss = mkBoss();
    const out = damageBoss(sink(), p, boss, 40);
    expect(out).toBeCloseTo(50);
    expect(boss.hp).toBeCloseTo(950);
  });

  it('damageTaken buff mitigates incoming damage', () => {
    const target = mkPlayer();
    applyBuff(target, makeBuff('damageTaken', 0.5, 4, 'shieldWall'));
    const dealt = damagePlayer(sink(), target, 40);
    expect(dealt).toBeCloseTo(20);
    expect(target.hp).toBeCloseTo(80);
  });

  it('i-frames (invuln) negate all damage', () => {
    const target = mkPlayer();
    applyBuff(target, makeBuff('invuln', 0, 0.3, 'dash'));
    const dealt = damagePlayer(sink(), target, 40);
    expect(dealt).toBe(0);
    expect(target.hp).toBe(100);
  });

  it('downed/dead players take no damage', () => {
    const target = mkPlayer({ state: 'downed', hp: 0 });
    expect(damagePlayer(sink(), target, 40)).toBe(0);
  });
});

describe('combat: healing', () => {
  it('heals and clamps at maxHp (overheal wasted)', () => {
    const src = mkPlayer({ id: 2, classId: 'cleric' });
    const target = mkPlayer({ hp: 70 });
    const healed = healPlayer(sink(), src, target, 60);
    expect(target.hp).toBe(100);
    expect(healed).toBe(30); // only 30 needed; 30 overheal wasted
    expect(src.stats.healingDone).toBe(30);
  });

  it('does not heal downed players', () => {
    const target = mkPlayer({ state: 'downed', hp: 0 });
    expect(healPlayer(sink(), null, target, 60)).toBe(0);
    expect(target.hp).toBe(0);
  });
});

describe('combat: buffs', () => {
  it('buffMult aggregates same-kind buffs multiplicatively', () => {
    const p = mkPlayer();
    applyBuff(p, makeBuff('damageTaken', 0.5, 4, 'shieldWall'));
    applyBuff(p, makeBuff('damageTaken', 0.8, 6, 'blessingDef'));
    expect(buffMult(p, 'damageTaken')).toBeCloseTo(0.4);
  });

  it('same-source buff refreshes rather than stacking', () => {
    const p = mkPlayer();
    applyBuff(p, makeBuff('damageTaken', 0.5, 4, 'shieldWall'));
    applyBuff(p, makeBuff('damageTaken', 0.5, 4, 'shieldWall'));
    expect(p.buffs.filter((b) => b.source === 'shieldWall').length).toBe(1);
  });

  it('buffs expire after their duration', () => {
    const p = mkPlayer();
    applyBuff(p, makeBuff('damageDealt', 1.25, 1, 'blessing'));
    tickBuffs(p, 0.6);
    expect(p.buffs.length).toBe(1);
    tickBuffs(p, 0.6);
    expect(p.buffs.length).toBe(0);
  });
});
