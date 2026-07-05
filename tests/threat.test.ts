import { describe, it, expect } from 'vitest';
import type { Player, Boss, GameEvent } from '../src/engine/types';
import { damageBoss } from '../src/engine/combat';
import {
  decayThreat,
  highestThreatTarget,
  forceTopThreat,
} from '../src/engine/threat';

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
});
