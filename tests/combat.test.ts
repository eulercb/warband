import { describe, it, expect } from 'vitest';
import type { Player, Boss, GameEvent } from '../src/engine/core/types';
import {
  damageBoss,
  damageAdd,
  damagePlayer,
  healPlayer,
  healBoss,
  applyBuff,
  applyStun,
  makeBuff,
  buffMult,
  tickBuffs,
  coReviveSpeed,
  isRooted,
  isControlBuff,
  isCcImmune,
  cleanseControl,
  BOSS_INVULN_SOURCE,
} from '../src/engine/combat/combat';
import { REVIVE_TIME, REVIVE_MIN_TIME } from '../src/engine/core/constants';

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
    castTimerMax: 0,
    castSlot: null,
    buffs: [],
    cooldownMult: 1,
    castMult: 1,
    damageMult: 1,
    damageTakenMult: 1,
    terrainResist: 0,
    regenPerSec: 0,
    critChance: 0,
    critMult: 1.5,
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

describe('combat: boss active-heal damping + invuln (items 2 & 5)', () => {
  it('healBoss scales an active heal by boss.healScale (item 2)', () => {
    const boss = mkBoss();
    boss.hp = 100;
    boss.healScale = 0.35;
    healBoss(boss, 200);
    expect(boss.hp).toBeCloseTo(100 + 70, 6); // 200 × 0.35
  });

  it('healBoss defaults to the full heal when healScale is unset', () => {
    const boss = mkBoss();
    boss.hp = 100;
    healBoss(boss, 50);
    expect(boss.hp).toBe(150);
  });

  it('healBoss never overheals past maxHp', () => {
    const boss = mkBoss();
    boss.hp = boss.maxHp - 10;
    boss.healScale = 1;
    healBoss(boss, 999);
    expect(boss.hp).toBe(boss.maxHp);
  });

  it('a boss with an invuln buff soaks no damage — no HP, threat or regen-lockout (item 5)', () => {
    const p = mkPlayer();
    const boss = mkBoss();
    applyBuff(boss, makeBuff('invuln', 0, 2, 'bossInvuln'));
    const before = boss.hp;
    const s = sink();
    const out = damageBoss(s, p, boss, 500);
    expect(out).toBe(0);
    expect(boss.hp).toBe(before); // fully immune
    expect(boss.regenLockout ?? 0).toBe(0); // no pressure recorded while immune
    expect(boss.recentDamageTaken ?? 0).toBe(0);
    // A muted "0" hit still spawns so the strike reads as absorbed, not dropped.
    expect(s.events.some((e) => e.t === 'hit' && e.amount === 0)).toBe(true);
  });

  it('damage resumes the instant the invuln buff is gone', () => {
    const p = mkPlayer();
    const boss = mkBoss();
    boss.buffs = []; // no invuln
    const out = damageBoss(sink(), p, boss, 40);
    expect(out).toBe(40);
    expect(boss.hp).toBe(boss.maxHp - 40);
  });
});

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

  // #60: self-heals (lifesteal / healOnUse / a self-targeted heal) count toward
  // score exactly like a heal cast on someone else, but never build threat — so a
  // hero can't tank the boss by patching itself, and a heal's bookkeeping no longer
  // depends on which mechanic (and thus which release) produced it.
  it('a self-heal (source === target) credits score but no threat', () => {
    const p = mkPlayer({ hp: 40 }); // wounded, so the heal actually lands
    const threatBefore = p.threat;
    const healed = healPlayer(sink(), p, p, 30);
    expect(healed).toBe(30);
    expect(p.stats.healingDone).toBe(30); // scores 1:1
    expect(p.threat).toBe(threatBefore); // ...but generates no self-heal threat
  });

  it('healing another ally credits both score and threat', () => {
    const healer = mkPlayer({ id: 2, classId: 'cleric' });
    const ally = mkPlayer({ id: 1, hp: 40 });
    const healed = healPlayer(sink(), healer, ally, 30);
    expect(healed).toBe(30);
    expect(healer.stats.healingDone).toBe(30);
    expect(healer.threat).toBeGreaterThan(0); // healing someone else still draws aggro
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

describe('combat: stun guard', () => {
  it('a non-positive stun is resisted outright (returns 0, applies no buff)', () => {
    const boss = mkBoss();
    expect(applyStun(sink(), boss, 0, 'test')).toBe(0); // seconds <= 0 short-circuit
    expect(applyStun(sink(), boss, -2, 'test')).toBe(0);
    expect(boss.buffs.some((b) => b.kind === 'stun')).toBe(false);
    expect(boss.stunDr).toBeUndefined(); // never even touched the DR bookkeeping
  });

  it('a positive stun lands as a stun buff of the effective duration', () => {
    const boss = mkBoss();
    const applied = applyStun(sink(), boss, 1.5, 'test');
    expect(applied).toBeCloseTo(1.5, 6);
    const stun = boss.buffs.find((b) => b.kind === 'stun' && b.source === 'test');
    expect(stun!.remaining).toBeCloseTo(1.5, 6);
  });
});

describe('combat: regen lockout', () => {
  it('zero effective damage never arms the regen lockout', () => {
    const p = mkPlayer({ classId: 'ranger' });
    const boss = mkBoss();
    const out = damageBoss(sink(), p, boss, 0); // 0 base → 0 outgoing → 0 effective
    expect(out).toBe(0);
    expect(boss.hp).toBe(1000); // unharmed
    expect(boss.regenLockout).toBeUndefined(); // effective > 0 branch NOT taken
  });

  it('real damage arms the regen lockout', () => {
    const p = mkPlayer({ classId: 'ranger' });
    const boss = mkBoss();
    damageBoss(sink(), p, boss, 20);
    expect(boss.regenLockout).toBeGreaterThan(0); // the taken branch, for contrast
  });
});

// ---------------------------------------------------------------------------
// coReviveSpeed — co-revive speed-up with diminishing returns + a floor (item 10)
// ---------------------------------------------------------------------------

describe('coReviveSpeed (item 10)', () => {
  it('is 1× for a lone (or no) reviver and rises with each additional reviver', () => {
    expect(coReviveSpeed(0)).toBe(1);
    expect(coReviveSpeed(1)).toBe(1);
    expect(coReviveSpeed(2)).toBeGreaterThan(1);
    expect(coReviveSpeed(3)).toBeGreaterThan(coReviveSpeed(2) - 1e-9);
  });

  it('has diminishing returns — each extra reviver helps less than the last', () => {
    const gain2 = coReviveSpeed(2) - coReviveSpeed(1);
    const gain3 = coReviveSpeed(3) - coReviveSpeed(2);
    expect(gain2).toBeGreaterThan(0);
    expect(gain3).toBeLessThan(gain2); // the 2nd extra reviver adds less than the 1st
  });

  it('clamps so the revive can NEVER complete faster than the minimum time', () => {
    const cap = REVIVE_TIME / REVIVE_MIN_TIME;
    expect(coReviveSpeed(3)).toBeLessThanOrEqual(cap);
    expect(coReviveSpeed(50)).toBeLessThanOrEqual(cap); // saturates, never exceeds the cap
    // Effective revive time (REVIVE_TIME / speed) is floored at REVIVE_MIN_TIME.
    for (const n of [2, 3, 4, 10, 100]) {
      expect(REVIVE_TIME / coReviveSpeed(n)).toBeGreaterThanOrEqual(REVIVE_MIN_TIME - 1e-9);
    }
  });
});

// ---------------------------------------------------------------------------
// Boss invuln → crowd-control cleanse + immunity (item 1)
// ---------------------------------------------------------------------------

describe('boss invuln CC cleanse + immunity (item 1)', () => {
  it('isControlBuff tags stun / root / silence / slow, not hastes or non-control buffs', () => {
    expect(isControlBuff(makeBuff('stun', 0, 1, 's'))).toBe(true);
    expect(isControlBuff(makeBuff('root', 0, 1, 's'))).toBe(true);
    expect(isControlBuff(makeBuff('silence', 0, 1, 's'))).toBe(true);
    expect(isControlBuff(makeBuff('moveSpeed', 0.4, 1, 's'))).toBe(true); // a slow
    // Not control:
    expect(isControlBuff(makeBuff('moveSpeed', 1.5, 1, 's'))).toBe(false); // a haste
    expect(isControlBuff(makeBuff('damageDealt', 0.5, 1, 's'))).toBe(false);
    expect(isControlBuff(makeBuff('damageTaken', 2, 1, 's'))).toBe(false);
    expect(isControlBuff(makeBuff('invuln', 0, 1, 's'))).toBe(false);
  });

  it('isCcImmune is true only for a boss-invuln window, never for player i-frames', () => {
    const boss = mkBoss();
    expect(isCcImmune(boss)).toBe(false);
    applyBuff(boss, makeBuff('invuln', 0, 1.6, BOSS_INVULN_SOURCE));
    expect(isCcImmune(boss)).toBe(true);
    // A player i-frame (dash / Phoenix Charm) is the same KIND but a different
    // source — it must NOT confer CC immunity.
    const p = mkPlayer();
    applyBuff(p, makeBuff('invuln', 0, 0.3, 'dash'));
    expect(isCcImmune(p)).toBe(false);
    const p2 = mkPlayer();
    applyBuff(p2, makeBuff('invuln', 0, 2, 'phoenixCharm'));
    expect(isCcImmune(p2)).toBe(false);
  });

  it('cleanseControl strips CC but leaves beneficial / non-control buffs', () => {
    const boss = mkBoss();
    applyBuff(boss, makeBuff('stun', 0, 2, 'daze'));
    applyBuff(boss, makeBuff('moveSpeed', 0.3, 2, 'zoneSlow'));
    applyBuff(boss, makeBuff('root', 0, 2, 'zoneRoot'));
    applyBuff(boss, makeBuff('moveSpeed', 1.4, 2, 'bossHaste')); // haste — kept
    applyBuff(boss, makeBuff('damageTaken', 0.6, 2, 'bossWard')); // ward — kept
    cleanseControl(boss);
    expect(boss.buffs.some((b) => b.kind === 'stun')).toBe(false);
    expect(boss.buffs.some((b) => b.kind === 'root')).toBe(false);
    expect(boss.buffs.some((b) => b.kind === 'moveSpeed' && b.mult < 1)).toBe(false);
    expect(boss.buffs.some((b) => b.source === 'bossHaste')).toBe(true);
    expect(boss.buffs.some((b) => b.source === 'bossWard')).toBe(true);
  });

  it('applyBuff rejects new CC on a CC-immune boss but allows a haste / ward', () => {
    const boss = mkBoss();
    applyBuff(boss, makeBuff('invuln', 0, 1.6, BOSS_INVULN_SOURCE));
    applyBuff(boss, makeBuff('moveSpeed', 0.3, 2, 'zoneSlow'));
    applyBuff(boss, makeBuff('root', 0, 2, 'zoneRoot'));
    applyBuff(boss, makeBuff('silence', 0, 2, 'bossSilence'));
    expect(boss.buffs.some((b) => b.source === 'zoneSlow')).toBe(false);
    expect(boss.buffs.some((b) => b.source === 'zoneRoot')).toBe(false);
    expect(boss.buffs.some((b) => b.source === 'bossSilence')).toBe(false);
    // A beneficial haste still lands.
    applyBuff(boss, makeBuff('moveSpeed', 1.4, 2, 'bossHaste'));
    expect(boss.buffs.some((b) => b.source === 'bossHaste')).toBe(true);
  });

  it('applyStun on a CC-immune boss returns 0, banks no DR load and cues a Resisted', () => {
    const boss = mkBoss();
    applyBuff(boss, makeBuff('invuln', 0, 1.6, BOSS_INVULN_SOURCE));
    const s = sink();
    const applied = applyStun(s, boss, 2, 'daze');
    expect(applied).toBe(0);
    expect(boss.buffs.some((b) => b.kind === 'stun')).toBe(false);
    expect(boss.stunDr?.load ?? 0).toBe(0); // no load banked — the attempt was free
    expect(s.events.some((e) => e.t === 'stunResist' && e.id === boss.id)).toBe(true);
  });

  it('CC resumes normally the instant the invuln window lapses', () => {
    const boss = mkBoss();
    applyBuff(boss, makeBuff('invuln', 0, 1.6, BOSS_INVULN_SOURCE));
    expect(applyStun(sink(), boss, 1.5, 'daze')).toBe(0);
    tickBuffs(boss, 2); // window lapses
    expect(isCcImmune(boss)).toBe(false);
    expect(applyStun(sink(), boss, 1.5, 'daze')).toBeCloseTo(1.5, 6);
    applyBuff(boss, makeBuff('moveSpeed', 0.4, 2, 'zoneSlow'));
    expect(boss.buffs.some((b) => b.source === 'zoneSlow')).toBe(true);
  });

  it('a player i-frame does NOT block CC (scoped to the boss mechanic)', () => {
    const p = mkPlayer();
    applyBuff(p, makeBuff('invuln', 0, 0.3, 'dash'));
    // A boss stun landing on this player still applies (players keep taking CC).
    expect(applyStun(sink(), p, 1, 'bossStun')).toBeCloseTo(1, 6);
    applyBuff(p, makeBuff('moveSpeed', 0.5, 2, 'bossSlow'));
    expect(p.buffs.some((b) => b.source === 'bossSlow')).toBe(true);
  });
});

describe('isRooted (item 9)', () => {
  it('is true only while a root buff is present', () => {
    const boss = mkBoss();
    expect(isRooted(boss)).toBe(false);
    applyBuff(boss, makeBuff('root', 0, 2, 'zoneRoot'));
    expect(isRooted(boss)).toBe(true);
    // A moveSpeed slow is NOT a root.
    const slowed = mkBoss();
    applyBuff(slowed, makeBuff('moveSpeed', 0.3, 2, 'zoneSlow'));
    expect(isRooted(slowed)).toBe(false);
    // Expires with its buff.
    tickBuffs(boss, 3);
    expect(isRooted(boss)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hit modifiers — crit / backstab flags + multiplier on the damage functions (item 5)
// ---------------------------------------------------------------------------

describe('damage hit modifiers (item 5)', () => {
  it('applies the crit multiplier to a boss hit and flags the event', () => {
    const p = mkPlayer({ classId: 'ranger' });
    const boss = mkBoss();
    const s = sink();
    const out = damageBoss(s, p, boss, 20, { mult: 1.5, crit: true });
    expect(out).toBe(30); // 20 × 1.5
    expect(s.events.find((e) => e.t === 'hit')).toMatchObject({ crit: true });
  });

  it('flags a backstab on a boss hit', () => {
    const p = mkPlayer({ classId: 'rogue' });
    const boss = mkBoss();
    const s = sink();
    damageBoss(s, p, boss, 20, { mult: 1.4, backstab: true });
    expect(s.events.find((e) => e.t === 'hit')).toMatchObject({ backstab: true });
  });

  it('crits an add too (crit multiplier + flag)', () => {
    const p = mkPlayer({ classId: 'ranger' });
    const add = { id: 5, pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, radius: 12, buffs: [] } as never;
    const s = sink();
    const out = damageAdd(s, p, add, 10, { mult: 2, crit: true });
    expect(out).toBe(20);
    expect(s.events.find((e) => e.t === 'hit')).toMatchObject({ crit: true });
  });

  it('an ordinary hit (no mods) carries neither flag and no bonus', () => {
    const p = mkPlayer({ classId: 'ranger' });
    const boss = mkBoss();
    const s = sink();
    const out = damageBoss(s, p, boss, 20);
    expect(out).toBe(20); // no multiplier
    const hit = s.events.find((e) => e.t === 'hit');
    expect(hit && 'crit' in hit ? hit.crit : undefined).toBeUndefined();
    expect(hit && 'backstab' in hit ? hit.backstab : undefined).toBeUndefined();
  });
});
