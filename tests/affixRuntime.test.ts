/**
 * Warband — boss AFFIX behaviour in the live World (world.ts hooks). Affixes are
 * off unless the World is built with `bossAffixes`, so these tests opt in per
 * boss and drive the sim to observe each affix's effect. Mirrors the chaos.test
 * conventions (local inp()/buttons()/DT, forcing a boss action by hand).
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import type { BossAction, AffixId } from '../src/engine/core/types';
import {
  AFFIX_SPLIT_INTERVAL,
  AFFIX_WARD_INTERVAL,
  AFFIX_BARBED_INTERVAL,
  AFFIX_ACCEL_MAX,
  AFFIX_OVERCHARGE_SCALE,
} from '../src/engine/core/constants';
import { buffMult, applyBuff, makeBuff } from '../src/engine/combat/combat';
import { AFFIXES } from '../src/engine/content/affixes';

// These sims run without player input; an empty input map suffices each tick.
const DT = 0.05;

function world(affixes: AffixId[], monster: 'dragon' | 'lich' = 'dragon'): World {
  return new World({
    monsterId: monster,
    seed: 7,
    players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    bossAffixes: [affixes],
  });
}

/** Force a boss action to windup and step once so it executes this tick. */
function windup(
  abilityId: string,
  aimAngle: number,
  targetPos: { x: number; y: number },
): BossAction {
  return {
    kind: 'windup',
    abilityId,
    remaining: 0.01,
    total: 0.01,
    targetId: null,
    targetPos,
    aimAngle,
    channelAccum: 0,
  };
}

describe('affix application', () => {
  it('spawns bosses carrying the rolled affixes (and over the wire)', () => {
    const w = world(['vampiric', 'frenzied']);
    expect(w.boss?.affixes).toEqual(['vampiric', 'frenzied']);
    expect(w.serialize().bosses[0]?.affixes).toEqual(['vampiric', 'frenzied']);
  });

  it('a plain boss carries no affixes', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 7,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    expect(w.boss?.affixes).toBeUndefined();
    expect(w.serialize().bosses[0]?.affixes).toBeUndefined();
  });
});

describe('vampiric', () => {
  it('heals the boss a fraction of the damage its attack deals', () => {
    const w = world(['vampiric']);
    const boss = w.boss!;
    boss.hp = 1000; // below max so the heal is visible
    // A hero directly below the boss, inside the fire-breath cone (aim +y).
    w.players[0].pos = { x: boss.pos.x, y: boss.pos.y + 200 };
    boss.action = windup('fireBreath', Math.PI / 2, { x: boss.pos.x, y: boss.pos.y + 200 });
    w.step(DT, new Map());
    expect(boss.hp).toBeGreaterThan(1000);
    expect(w.players[0].hp).toBeLessThan(w.players[0].maxHp); // hero was hit
    expect(w.events.some((e) => e.t === 'heal' && e.targetId === boss.id)).toBe(true);
  });

  it('a non-vampiric boss does not heal from its hits', () => {
    const w = world([]);
    const boss = w.boss!;
    boss.hp = 1000;
    w.players[0].pos = { x: boss.pos.x, y: boss.pos.y + 200 };
    boss.action = windup('fireBreath', Math.PI / 2, { x: boss.pos.x, y: boss.pos.y + 200 });
    w.step(DT, new Map());
    expect(boss.hp).toBeLessThanOrEqual(1000);
  });
});

describe('frenzied', () => {
  it('shortens cooldowns as HP falls below half', () => {
    const mk = (affixes: AffixId[]): number => {
      const w = world(affixes);
      const boss = w.boss!;
      boss.hp = boss.maxHp * 0.4; // below 50% (frenzy) but above 25% (no enrage yet)
      boss.action = windup('fireball', Math.PI / 2, { x: boss.pos.x, y: boss.pos.y + 100 });
      w.step(DT, new Map());
      return boss.cooldowns.fireball;
    };
    expect(mk(['frenzied'])).toBeGreaterThan(0);
    expect(mk(['frenzied'])).toBeLessThan(mk([])); // frenzied attacks come faster
  });
});

describe('volatile', () => {
  it('leaves a lingering pool where a telegraphed impact lands', () => {
    const w = world(['volatile']);
    const boss = w.boss!;
    const target = { x: boss.pos.x + 150, y: boss.pos.y };
    expect(w.groundZones.length).toBe(0);
    boss.action = windup('fireball', 0, target);
    w.step(DT, new Map());
    const pool = w.groundZones.find((z) => z.side === 'boss');
    expect(pool).toBeTruthy();
    expect(Math.hypot(pool!.pos.x - target.x, pool!.pos.y - target.y)).toBeLessThan(80);
    // The pool carries the affix's themed tint (not the default void-zone purple).
    expect(pool!.color).toBe(AFFIXES.volatile.color);
    expect(w.serialize().groundZones.find((z) => z.color != null)?.color).toBe(
      AFFIXES.volatile.color,
    );
  });
});

describe('molten', () => {
  it('trails a burning pool as the fight runs', () => {
    const w = world(['molten']);
    // No dragon ability spawns a zone, so any boss-side zone is the molten trail.
    for (let i = 0; i < 30; i++) w.step(DT, new Map());
    expect(w.groundZones.some((z) => z.side === 'boss')).toBe(true);
  });
});

describe('splitting', () => {
  it('calls a fresh add wave on its cadence', () => {
    const w = world(['splitting']); // dragon has no summon of its own
    w.boss!.affixTimers = { splitting: AFFIX_SPLIT_INTERVAL };
    expect(w.adds.length).toBe(0);
    w.step(DT, new Map());
    expect(w.adds.length).toBeGreaterThan(0);
  });
});

describe('warding', () => {
  it('periodically raises a damage-absorbing ward', () => {
    const w = world(['warding']);
    w.boss!.affixTimers = { warding: AFFIX_WARD_INTERVAL };
    w.step(DT, new Map());
    expect(buffMult(w.boss!, 'damageTaken')).toBeLessThan(1);
    expect(w.boss!.buffs.some((b) => b.source === 'affixWard')).toBe(true);
  });
});

describe('accelerating', () => {
  it('ramps move speed with fight time, capped', () => {
    const w = world(['accelerating']);
    w.step(DT, new Map());
    const b = w.boss!;
    expect(buffMult(b, 'moveSpeed')).toBeGreaterThan(1);
    // Force a long elapsed time and confirm the ramp saturates at the cap.
    w.elapsed = 1000;
    w.step(DT, new Map());
    expect(buffMult(w.boss!, 'moveSpeed')).toBeCloseTo(AFFIX_ACCEL_MAX, 5);
  });
});

describe('barbed', () => {
  it('retaliates for damage recently soaked, hitting nearby heroes', () => {
    const w = world(['barbed']);
    const boss = w.boss!;
    boss.recentDamageTaken = 400;
    boss.affixTimers = { barbed: AFFIX_BARBED_INTERVAL };
    w.players[0].pos = { x: boss.pos.x + 20, y: boss.pos.y }; // point-blank
    const hp0 = w.players[0].hp;
    w.step(DT, new Map());
    expect(w.players[0].hp).toBeLessThan(hp0);
  });
});

describe('teleporting', () => {
  it('lets a non-blinker blink away from a crowding hero', () => {
    const w = world(['teleporting']); // dragon can't normally blink
    const boss = w.boss!;
    boss.blinkTimer = 0; // ready
    w.players[0].pos = { x: boss.pos.x + 40, y: boss.pos.y }; // inside threaten range
    w.step(DT, new Map());
    expect(w.events.some((e) => e.t === 'blink')).toBe(true);
  });

  it('a ROOTED boss cannot teleport away (item 9)', () => {
    const w = world(['teleporting']);
    const boss = w.boss!;
    boss.blinkTimer = 0; // ready to blink…
    applyBuff(boss, makeBuff('root', 0, 2, 'zoneRoot')); // …but rooted
    w.players[0].pos = { x: boss.pos.x + 40, y: boss.pos.y }; // inside threaten range
    const before = { ...boss.pos };
    w.step(DT, new Map());
    expect(w.events.some((e) => e.t === 'blink')).toBe(false); // no teleport while rooted
    expect(boss.pos).toEqual(before); // and it didn't relocate
  });
});

describe('overcharged', () => {
  it('swells the telegraph (and thus the hit) beyond the base size', () => {
    const base = new World({
      monsterId: 'dragon',
      seed: 7,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    base.boss!.action = windup('fireball', 0, { x: base.boss!.pos.x + 100, y: base.boss!.pos.y });
    base.boss!.action.remaining = 1; // keep it winding up so the telegraph is live
    const baseR = base.serialize().bosses[0]?.telegraph?.radius ?? 0;

    const oc = world(['overcharged']);
    oc.boss!.action = windup('fireball', 0, { x: oc.boss!.pos.x + 100, y: oc.boss!.pos.y });
    oc.boss!.action.remaining = 1;
    const ocR = oc.serialize().bosses[0]?.telegraph?.radius ?? 0;

    expect(baseR).toBeGreaterThan(0);
    expect(ocR).toBeCloseTo(baseR * AFFIX_OVERCHARGE_SCALE, 3);
  });
});
