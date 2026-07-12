import { describe, it, expect } from 'vitest';
import type { Player, Boss, GameEvent } from '../src/engine/core/types';
import { damageBoss } from '../src/engine/combat/combat';
import {
  decayThreat,
  highestThreatTarget,
  nthThreatTarget,
  forceTopThreat,
} from '../src/engine/combat/threat';

function mkPlayer(id: number, classId: Player['classId']): Player {
  return {
    id,
    peerId: `p${id}`,
    name: `P${id}`,
    classId,
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
    cooldownMult: 1,
    castMult: 1,
    damageMult: 1,
    damageTakenMult: 1,
    terrainResist: 0,
    regenPerSec: 0,
    threat: 0,
    stats: { damageDealt: 0, healingDone: 0, revives: 0, deaths: 0 },
    prevButtons: { basic: false, a1: false, a2: false, a3: false, revive: false },
    lastSeq: -1,
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

describe('threat', () => {
  it('damage adds threat scaled by class threat multiplier', () => {
    const knight = mkPlayer(1, 'knight'); // 1.5x
    const ranger = mkPlayer(2, 'ranger'); // 1.0x
    const boss = mkBoss();
    damageBoss(sink(), knight, boss, 100);
    damageBoss(sink(), ranger, boss, 100);
    expect(knight.threat).toBeCloseTo(150);
    expect(ranger.threat).toBeCloseTo(100);
  });

  it('boss focuses the highest-threat living player', () => {
    const a = mkPlayer(1, 'ranger');
    const b = mkPlayer(2, 'mage');
    a.threat = 50;
    b.threat = 120;
    expect(highestThreatTarget([a, b], null, 0)?.id).toBe(2);
  });

  it('taunt forces focus and sets top threat', () => {
    const knight = mkPlayer(1, 'knight');
    const mage = mkPlayer(2, 'mage');
    knight.threat = 40;
    mage.threat = 300;
    forceTopThreat([knight, mage], knight.id);
    expect(knight.threat).toBeGreaterThan(mage.threat);
    // even without recomputing, active taunt forces focus
    expect(highestThreatTarget([knight, mage], knight.id, 4)?.id).toBe(1);
  });

  it('taunt ignored when taunt timer has expired', () => {
    const knight = mkPlayer(1, 'knight');
    const mage = mkPlayer(2, 'mage');
    knight.threat = 40;
    mage.threat = 300;
    expect(highestThreatTarget([knight, mage], knight.id, 0)?.id).toBe(2);
  });

  it('dead/downed players are never targeted', () => {
    const a = mkPlayer(1, 'ranger');
    const b = mkPlayer(2, 'mage');
    a.threat = 500;
    a.state = 'downed';
    b.threat = 10;
    expect(highestThreatTarget([a, b], null, 0)?.id).toBe(2);
  });

  it('threat decays over time', () => {
    const p = mkPlayer(1, 'ranger');
    p.threat = 100;
    decayThreat([p], 1); // 5%/s
    expect(p.threat).toBeCloseTo(95);
  });

  it('returns no target when the whole party is down', () => {
    const a = mkPlayer(1, 'ranger');
    const b = mkPlayer(2, 'mage');
    a.state = 'downed';
    b.state = 'downed';
    a.threat = 500; // threat is irrelevant once nobody is alive
    expect(highestThreatTarget([a, b], null, 0)).toBeNull();
  });

  it('a taunt whose target is no longer alive is ignored (top threat wins)', () => {
    const a = mkPlayer(1, 'knight'); // taunt target...
    const b = mkPlayer(2, 'mage');
    a.state = 'downed'; // ...but face-down, so the taunt cannot force it
    a.threat = 999;
    b.threat = 10;
    // taunt is active (timer 4) and names id 1, yet id 1 is not among the living
    expect(highestThreatTarget([a, b], 1, 4)?.id).toBe(2);
  });
});

describe('nthThreatTarget', () => {
  it('picks the index-th highest-threat living player, clamping past the tail', () => {
    const a = mkPlayer(1, 'ranger');
    const b = mkPlayer(2, 'mage');
    const c = mkPlayer(3, 'knight');
    a.threat = 300;
    b.threat = 200;
    c.threat = 100;
    expect(nthThreatTarget([a, b, c], 0, null, 0)?.id).toBe(1); // top threat
    expect(nthThreatTarget([a, b, c], 1, null, 0)?.id).toBe(2); // runner-up
    expect(nthThreatTarget([a, b, c], 9, null, 0)?.id).toBe(3); // clamps to the last
  });

  it('an active taunt overrides the nth pick for every boss', () => {
    const a = mkPlayer(1, 'ranger');
    const b = mkPlayer(2, 'mage');
    a.threat = 10;
    b.threat = 500;
    // boss #1 would normally take the runner-up, but the live taunt forces id 1
    expect(nthThreatTarget([a, b], 1, 1, 4)?.id).toBe(1);
  });

  it('ignores a dead taunt target, then returns null once nobody is alive', () => {
    const a = mkPlayer(1, 'ranger');
    const b = mkPlayer(2, 'mage');
    a.state = 'downed'; // taunt names id 1, but it is down
    b.threat = 50;
    expect(nthThreatTarget([a, b], 0, 1, 4)?.id).toBe(2); // taunt skipped, falls to nth
    b.state = 'downed';
    expect(nthThreatTarget([a, b], 0, null, 0)).toBeNull(); // no living players
  });
});

describe('forceTopThreat', () => {
  it('is a no-op when the taunter is not in the party', () => {
    const a = mkPlayer(1, 'knight');
    const b = mkPlayer(2, 'mage');
    a.threat = 40;
    b.threat = 300;
    forceTopThreat([a, b], 999); // no such player id → nothing to promote
    expect(a.threat).toBe(40);
    expect(b.threat).toBe(300);
  });
});
