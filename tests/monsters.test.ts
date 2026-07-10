/**
 * Unit tests for the data-driven monster (boss) catalog + helpers in
 * src/engine/content/monsters.ts: per-boss definition invariants, registry lookups,
 * the terse ability builders' output, every boss `decide` AI branch, run /
 * encounter assembly (buildRun / buildRunSlots) and the endless cycle
 * modifiers. Decide functions are pure — we drive them with a hand-built
 * BossDecisionCtx and a deterministic stub RNG rather than a full World.
 */
import { describe, it, expect } from 'vitest';
import {
  MONSTERS,
  MONSTER_IDS,
  DEFAULT_MONSTER,
  MONSTERS_BY_TIER,
  getMonster,
  abilityById,
  buildRun,
  buildRunSlots,
  modifierForCycle,
  CYCLE_MODIFIERS,
} from '../src/engine/content/monsters';
import type { BossAbilityShape, BossDecisionCtx, MonsterDef } from '../src/engine/content/monsters';
import type { MonsterId, BossTier, BossBodyShape, Boss, Player } from '../src/engine/core/types';
import { Rng } from '../src/engine/core/math';
import { RUN_LENGTH } from '../src/engine/core/constants';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const ALL_IDS = Object.keys(MONSTERS) as MonsterId[];

const SHAPES: BossAbilityShape[] = [
  'cone',
  'circleAtTarget',
  'pbaoe',
  'line',
  'projectile',
  'summon',
  'voidzones',
  'beam',
  'buffSelf',
];
const TIERS: BossTier[] = ['easy', 'medium', 'hard'];
const BODY_SHAPES: BossBodyShape[] = [
  'star',
  'blob',
  'diamond',
  'beast',
  'humanoid',
  'construct',
  'orb',
  'insect',
  'serpent',
  'tree',
];

/**
 * A deterministic Rng stand-in: `.next()` yields the supplied values in order,
 * then repeats the last one. Only `.next()` is consumed by the decide fns.
 */
function stubRng(...values: number[]): Rng {
  let i = 0;
  return {
    next: () => values[Math.min(i++, values.length - 1)],
  } as unknown as Rng;
}

// Decide functions never read the boss body — a bare stub suffices.
const BOSS_STUB = {} as unknown as Boss;
const PLAYER_STUB = { id: 1 } as unknown as Player;

function ctx(o: Partial<BossDecisionCtx> = {}): BossDecisionCtx {
  return {
    boss: BOSS_STUB,
    hpFrac: 1,
    target: PLAYER_STUB,
    distToTarget: 100,
    anyInMelee: false,
    usable: () => true,
    rng: stubRng(0),
    ...o,
  };
}

function validChoice(def: MonsterDef, choice: string | null): boolean {
  return choice === null || abilityById(def, choice) !== undefined;
}

// ---------------------------------------------------------------------------
// Per-boss definition invariants (data-driven over the whole catalog)
// ---------------------------------------------------------------------------

describe('monster catalog: per-boss invariants', () => {
  for (const id of ALL_IDS) {
    const def = MONSTERS[id];
    it(`${id} has a well-formed definition`, () => {
      // The registry key and the definition's own id agree.
      expect(def.id).toBe(id);

      expect(typeof def.name).toBe('string');
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.theme.length).toBeGreaterThan(0);
      expect(def.difficulty.length).toBeGreaterThan(0);

      expect(TIERS).toContain(def.tier);
      expect(BODY_SHAPES).toContain(def.bodyShape);

      expect(Number.isFinite(def.color)).toBe(true);

      // Stats: HP/radius strictly positive; the rest non-negative (the hidden
      // training dummy is stationary with 0 moveSpeed / meleeRange).
      expect(def.baseHp).toBeGreaterThan(0);
      expect(def.radius).toBeGreaterThan(0);
      expect(def.moveSpeed).toBeGreaterThanOrEqual(0);
      expect(def.regen).toBeGreaterThanOrEqual(0);
      expect(def.meleeRange).toBeGreaterThanOrEqual(0);

      expect(def.enrageThreshold).toBeGreaterThanOrEqual(0);
      expect(def.enrageThreshold).toBeLessThanOrEqual(1);
      expect(def.enrageCooldownMult).toBeGreaterThan(0);
      expect(def.enrageRegenMult).toBeGreaterThan(0);

      expect(Array.isArray(def.abilities)).toBe(true);
      expect(typeof def.decide).toBe('function');
    });

    it(`${id} has well-formed, uniquely-named abilities`, () => {
      const seen = new Set<string>();
      for (const ab of def.abilities) {
        expect(typeof ab.id).toBe('string');
        expect(ab.id.length).toBeGreaterThan(0);
        expect(seen.has(ab.id)).toBe(false); // unique within the boss
        seen.add(ab.id);

        expect(ab.name.length).toBeGreaterThan(0);
        expect(SHAPES).toContain(ab.shape);

        expect(ab.windup).toBeGreaterThanOrEqual(0);
        expect(ab.cooldown).toBeGreaterThan(0);
        expect(ab.damage).toBeGreaterThanOrEqual(0);

        // Optional geometry, when present, is strictly positive.
        if (ab.range != null) expect(ab.range).toBeGreaterThan(0);
        if (ab.radius != null) expect(ab.radius).toBeGreaterThan(0);
        if (ab.width != null) expect(ab.width).toBeGreaterThan(0);
        if (ab.halfAngleDeg != null) expect(ab.halfAngleDeg).toBeGreaterThan(0);
      }
      expect(seen.size).toBe(def.abilities.length);
    });

    if (def.blink) {
      it(`${id} blink parameters are positive`, () => {
        expect(def.blink!.range).toBeGreaterThan(0);
        expect(def.blink!.threatenRange).toBeGreaterThan(0);
        expect(def.blink!.internalCd).toBeGreaterThan(0);
      });
    }
  }

  it('every registry key is unique and matches its definition id', () => {
    const ids = ALL_IDS.map((id) => MONSTERS[id].id);
    expect(new Set(ids).size).toBe(ALL_IDS.length);
  });
});

// ---------------------------------------------------------------------------
// Registry lists + lookups
// ---------------------------------------------------------------------------

describe('monster registry lists', () => {
  it('MONSTER_IDS is the catalog minus the hidden dummy', () => {
    expect(MONSTER_IDS).not.toContain('dummy');
    expect(MONSTERS.dummy.hidden).toBe(true);
    // Every non-hidden boss is listed; the count is the catalog minus 1 (dummy).
    expect(MONSTER_IDS.length).toBe(ALL_IDS.length - 1);
    for (const id of ALL_IDS) {
      if (MONSTERS[id].hidden) continue;
      expect(MONSTER_IDS).toContain(id);
    }
    // No listed boss is hidden.
    for (const id of MONSTER_IDS) expect(MONSTERS[id].hidden).toBeFalsy();
  });

  it('catalog spans all three tiers with a healthy roster', () => {
    expect(MONSTER_IDS.length).toBeGreaterThanOrEqual(33);
    expect(MONSTERS_BY_TIER.easy.length).toBeGreaterThanOrEqual(10);
    expect(MONSTERS_BY_TIER.medium.length).toBeGreaterThanOrEqual(10);
    expect(MONSTERS_BY_TIER.hard.length).toBeGreaterThanOrEqual(10);
  });

  it('MONSTERS_BY_TIER partitions exactly the pickable roster', () => {
    for (const tier of TIERS) {
      for (const id of MONSTERS_BY_TIER[tier]) {
        expect(MONSTERS[id].tier).toBe(tier); // tier buckets are consistent
        expect(MONSTERS[id].hidden).toBeFalsy(); // and never leak the dummy
      }
    }
    const union = [...MONSTERS_BY_TIER.easy, ...MONSTERS_BY_TIER.medium, ...MONSTERS_BY_TIER.hard];
    // A clean partition: no overlaps and the union is exactly MONSTER_IDS.
    expect(union.length).toBe(MONSTER_IDS.length);
    expect(new Set(union)).toEqual(new Set(MONSTER_IDS));
  });

  it('DEFAULT_MONSTER is a real, pickable boss', () => {
    expect(DEFAULT_MONSTER).toBe('dragon');
    expect(MONSTERS[DEFAULT_MONSTER]).toBeDefined();
    expect(MONSTER_IDS).toContain(DEFAULT_MONSTER);
    expect(MONSTERS[DEFAULT_MONSTER].hidden).toBeFalsy();
  });

  it('getMonster returns the registry entry by id', () => {
    expect(getMonster('dragon')).toBe(MONSTERS.dragon);
    expect(getMonster('lich')).toBe(MONSTERS.lich);
    for (const id of ALL_IDS) expect(getMonster(id)).toBe(MONSTERS[id]);
  });

  it('getMonster has no fallback: an unknown id yields undefined', () => {
    // Documents ACTUAL behaviour — the lookup is a bare index, so a bad id is
    // undefined (there is no default-boss fallback despite the getter name).
    const missing = 'notaboss' as unknown as MonsterId;
    expect(getMonster(missing)).toBeUndefined();
  });

  it('abilityById finds an ability or returns undefined', () => {
    const fireball = abilityById(MONSTERS.dragon, 'fireball');
    expect(fireball).toBeDefined();
    expect(fireball?.id).toBe('fireball');
    expect(fireball).toBe(MONSTERS.dragon.abilities.find((a) => a.id === 'fireball'));

    expect(abilityById(MONSTERS.dragon, 'nope')).toBeUndefined();
    // The dummy has no abilities, so any lookup misses.
    expect(abilityById(MONSTERS.dummy, 'fireball')).toBeUndefined();
  });

  it('every decide-returned ability id maps to a real ability', () => {
    // A structural guard: no boss rule can name a phantom ability.
    for (const id of ALL_IDS) {
      const def = MONSTERS[id];
      for (const cfg of [
        ctx({ anyInMelee: true, distToTarget: 100, hpFrac: 0.4 }),
        ctx({ anyInMelee: false, distToTarget: 1000 }),
      ]) {
        expect(validChoice(def, def.decide(cfg))).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Ability builder output (defaults + shape mapping)
// ---------------------------------------------------------------------------

describe('ability builders produce the expected shapes', () => {
  it('cone / circle carry their geometry', () => {
    const cone = abilityById(MONSTERS.dragon, 'fireBreath')!;
    expect(cone.shape).toBe('cone');
    expect(cone.damage).toBe(55);
    expect(cone.range).toBe(400);
    expect(cone.halfAngleDeg).toBe(30);

    const circle = abilityById(MONSTERS.dragon, 'fireball')!;
    expect(circle.shape).toBe('circleAtTarget');
    expect(circle.range).toBe(700);
    expect(circle.radius).toBe(110);
    expect(circle.cooldown).toBe(4);
  });

  it('nova maps to a pbaoe and keeps its knockback', () => {
    const nova = abilityById(MONSTERS.dragon, 'tailSweep')!;
    expect(nova.shape).toBe('pbaoe');
    expect(nova.radius).toBe(160);
    expect(nova.knockback).toBe(120);
  });

  it('line defaults chargeSpeed to 600', () => {
    const line = abilityById(MONSTERS.troll, 'charge')!;
    expect(line.shape).toBe('line');
    expect(line.chargeSpeed).toBe(600);
    expect(line.width).toBe(45);
    expect(line.range).toBe(700);
    expect(line.targetRandom).toBe(true);
  });

  it('summon is a zero-damage adds-scaled shape', () => {
    const summon = abilityById(MONSTERS.lich, 'summonSkeletons')!;
    expect(summon.shape).toBe('summon');
    expect(summon.damage).toBe(0);
    expect(summon.countScaling).toBe('adds');
  });

  it('voids defaults to a random-targeted, zone-scaled hazard', () => {
    const voids = abilityById(MONSTERS.lich, 'voidZone')!;
    expect(voids.shape).toBe('voidzones');
    expect(voids.countScaling).toBe('zones');
    expect(voids.targetRandom).toBe(true);
    expect(voids.zoneDuration).toBe(8);
    expect(voids.zoneTickDamage).toBe(12);
  });

  it('beam defaults to a 500-range, 2s channel', () => {
    const beam = abilityById(MONSTERS.lich, 'lifeDrain')!;
    expect(beam.shape).toBe('beam');
    expect(beam.range).toBe(500);
    expect(beam.width).toBe(24);
    expect(beam.channelDuration).toBe(2);
    expect(beam.healSelf).toBe(true);
  });

  it('buffSelf carries a self-buff payload', () => {
    const buff = abilityById(MONSTERS.direwolf, 'howl')!;
    expect(buff.shape).toBe('buffSelf');
    expect(buff.damage).toBe(0);
    expect(buff.buffMoveMult).toBeCloseTo(1.35);
    expect(buff.buffDuration).toBe(6);
  });

  it('projectile fans keep their volley parameters', () => {
    const fan = abilityById(MONSTERS.bandit, 'daggerFan')!;
    expect(fan.shape).toBe('projectile');
    expect(fan.projCount).toBe(3);
    expect(fan.spreadDeg).toBe(26);
    expect(fan.projSpeed).toBe(520);
  });
});

// ---------------------------------------------------------------------------
// Boss decision AI
// ---------------------------------------------------------------------------

describe('boss decide: universal invariants', () => {
  // Constant-valued stubs so the (shared) rng is safe to reuse across bosses.
  const CONFIGS: Partial<BossDecisionCtx>[] = [
    { hpFrac: 1, anyInMelee: true, distToTarget: 100, rng: stubRng(0) },
    { hpFrac: 1, anyInMelee: false, distToTarget: 1000, rng: stubRng(0) },
    { hpFrac: 0.4, anyInMelee: true, distToTarget: 100, rng: stubRng(0) },
    { hpFrac: 1, anyInMelee: false, distToTarget: 1000, rng: stubRng(1) }, // high rng skips chance rules
    { hpFrac: 1, anyInMelee: false, distToTarget: 200, rng: stubRng(0) },
    { hpFrac: 1, anyInMelee: true, distToTarget: 100, target: null, rng: stubRng(0) },
  ];

  it('every decision is null or a real ability of that boss', () => {
    for (const id of ALL_IDS) {
      const def = MONSTERS[id];
      for (const cfg of CONFIGS) {
        expect(validChoice(def, def.decide(ctx(cfg)))).toBe(true);
      }
    }
  });

  it('a live boss acts in at least one situation; the dummy never does', () => {
    for (const id of ALL_IDS) {
      const def = MONSTERS[id];
      const anyAction = CONFIGS.some((cfg) => def.decide(ctx(cfg)) !== null);
      expect(anyAction).toBe(id !== 'dummy');
    }
  });

  it('no boss acts when nothing is off cooldown', () => {
    for (const id of ALL_IDS) {
      const def = MONSTERS[id];
      expect(def.decide(ctx({ usable: () => false, anyInMelee: true }))).toBeNull();
      expect(def.decide(ctx({ usable: () => false, anyInMelee: false }))).toBeNull();
    }
  });

  it('the training dummy is inert regardless of context', () => {
    expect(MONSTERS.dummy.decide(ctx({ anyInMelee: true }))).toBeNull();
    expect(MONSTERS.dummy.decide(ctx({ anyInMelee: false, distToTarget: 50 }))).toBeNull();
  });
});

describe('boss decide: Dragon priority list', () => {
  const dragon = MONSTERS.dragon;

  it('wing-gusts below half HP when the coin flip passes', () => {
    expect(dragon.decide(ctx({ hpFrac: 0.4, anyInMelee: true, rng: stubRng(0.2) }))).toBe(
      'wingGust',
    );
  });

  it('skips wing gust when the coin flip fails, then tail-sweeps in melee', () => {
    expect(dragon.decide(ctx({ hpFrac: 0.4, anyInMelee: true, rng: stubRng(0.8) }))).toBe(
      'tailSweep',
    );
  });

  it('skips wing gust when it is on cooldown', () => {
    expect(
      dragon.decide(
        ctx({
          hpFrac: 0.4,
          anyInMelee: true,
          usable: (id) => id !== 'wingGust',
          rng: stubRng(0.2),
        }),
      ),
    ).toBe('tailSweep');
  });

  it('tail-sweeps in melee above half HP', () => {
    expect(dragon.decide(ctx({ hpFrac: 1, anyInMelee: true }))).toBe('tailSweep');
  });

  it('fire-breathes at range within 420u', () => {
    expect(dragon.decide(ctx({ anyInMelee: false, distToTarget: 400 }))).toBe('fireBreath');
  });

  it('throws a fireball past fire-breath range', () => {
    expect(dragon.decide(ctx({ anyInMelee: false, distToTarget: 500 }))).toBe('fireball');
  });

  it('falls back to fireball when fire breath is unavailable', () => {
    expect(
      dragon.decide(
        ctx({ anyInMelee: false, distToTarget: 100, usable: (id) => id !== 'fireBreath' }),
      ),
    ).toBe('fireball');
  });

  it('does nothing with everything on cooldown', () => {
    expect(dragon.decide(ctx({ usable: () => false }))).toBeNull();
  });
});

describe('boss decide: Troll melee/ranged split', () => {
  const troll = MONSTERS.troll;

  it('ground-slams in melee on a low roll', () => {
    expect(troll.decide(ctx({ anyInMelee: true, rng: stubRng(0.1) }))).toBe('groundSlam');
  });

  it('smashes in melee on a high roll', () => {
    expect(troll.decide(ctx({ anyInMelee: true, rng: stubRng(0.9) }))).toBe('smash');
  });

  it('ground-slams as the melee fallback when smash is down', () => {
    expect(
      troll.decide(ctx({ anyInMelee: true, usable: (id) => id !== 'smash', rng: stubRng(0.9) })),
    ).toBe('groundSlam');
  });

  it('does nothing in melee with all melee options down', () => {
    expect(troll.decide(ctx({ anyInMelee: true, usable: () => false }))).toBeNull();
  });

  it('charges from range', () => {
    expect(troll.decide(ctx({ anyInMelee: false }))).toBe('charge');
  });

  it('ground-slams from range when charge is down', () => {
    expect(troll.decide(ctx({ anyInMelee: false, usable: (id) => id === 'groundSlam' }))).toBe(
      'groundSlam',
    );
  });

  it('does nothing from range with everything down', () => {
    expect(troll.decide(ctx({ anyInMelee: false, usable: () => false }))).toBeNull();
  });
});

describe('boss decide: Lich caster priority', () => {
  const lich = MONSTERS.lich;

  it('summons above all else', () => {
    expect(lich.decide(ctx())).toBe('summonSkeletons');
  });

  it('drops a void zone when summon is down', () => {
    expect(lich.decide(ctx({ usable: (id) => id !== 'summonSkeletons' }))).toBe('voidZone');
  });

  it('life-drains a valid target', () => {
    expect(lich.decide(ctx({ usable: (id) => id === 'lifeDrain', target: PLAYER_STUB }))).toBe(
      'lifeDrain',
    );
  });

  it('shadow-bolts when only that is up', () => {
    expect(lich.decide(ctx({ usable: (id) => id === 'shadowBolt' }))).toBe('shadowBolt');
  });

  it('withholds target-gated casts when there is no target', () => {
    expect(lich.decide(ctx({ usable: (id) => id === 'lifeDrain', target: null }))).toBeNull();
    expect(lich.decide(ctx({ usable: (id) => id === 'shadowBolt', target: null }))).toBeNull();
  });

  it('idles with everything on cooldown', () => {
    expect(lich.decide(ctx({ usable: () => false }))).toBeNull();
  });
});

describe('boss decide: decideBy guard branches', () => {
  it('Goblin walks its priority list (unconditional / melee / fallback)', () => {
    const g = MONSTERS.goblin;
    expect(g.decide(ctx())).toBe('callRabble'); // first rule, no guard
    expect(g.decide(ctx({ usable: (id) => id !== 'callRabble', anyInMelee: true }))).toBe('hack');
    // hack's melee guard fails → falls through to boneToss.
    expect(g.decide(ctx({ usable: (id) => id !== 'callRabble', anyInMelee: false }))).toBe(
      'boneToss',
    );
    expect(g.decide(ctx({ usable: () => false }))).toBeNull();
  });

  it('Bandit uses the far(260) guard', () => {
    const b = MONSTERS.bandit;
    expect(b.decide(ctx({ distToTarget: 300 }))).toBe('rush'); // far → rush
    expect(b.decide(ctx({ distToTarget: 200 }))).toBe('daggerFan'); // not far → next rule
    expect(
      b.decide(ctx({ distToTarget: 100, anyInMelee: true, usable: (id) => id === 'slash' })),
    ).toBe('slash');
  });

  it('Direwolf sequences howl / pounce / callPack / maul', () => {
    const d = MONSTERS.direwolf;
    expect(d.decide(ctx({ hpFrac: 0.5 }))).toBe('howl'); // hp<0.6
    expect(d.decide(ctx({ hpFrac: 0.8, distToTarget: 300 }))).toBe('pounce'); // far(240)
    expect(d.decide(ctx({ hpFrac: 0.8, distToTarget: 100 }))).toBe('callPack'); // near
    expect(
      d.decide(
        ctx({ hpFrac: 0.8, distToTarget: 100, anyInMelee: true, usable: (id) => id === 'maul' }),
      ),
    ).toBe('maul');
  });

  it('Basilisk uses the within(360) guard', () => {
    const b = MONSTERS.basilisk;
    expect(b.decide(ctx({ distToTarget: 300 }))).toBe('petrifyGaze'); // within 360
    // out of gaze range, not in melee → venom spit
    expect(b.decide(ctx({ distToTarget: 500, anyInMelee: false }))).toBe('venomSpit');
  });

  it('Animated Armor honours the chance-gated shockwave', () => {
    const a = MONSTERS.animatedArmor;
    // In melee, low roll: chance passes → shockwave.
    expect(a.decide(ctx({ anyInMelee: true, rng: stubRng(0.2) }))).toBe('shockwave');
    // In melee, high roll: chance fails → slam.
    expect(a.decide(ctx({ anyInMelee: true, rng: stubRng(0.9) }))).toBe('slam');
    // Out of melee: melee guards fail → unconditional shockwave fallback.
    expect(a.decide(ctx({ anyInMelee: false, rng: stubRng(0.9) }))).toBe('shockwave');
    // Below half HP: brace first.
    expect(a.decide(ctx({ hpFrac: 0.4 }))).toBe('brace');
  });

  it('Beholder eye-rays only when the 0.6 chance clears', () => {
    const b = MONSTERS.beholder;
    expect(b.decide(ctx({ rng: stubRng(0.1) }))).toBe('eyeRays'); // 0.1 <= 0.6
    expect(b.decide(ctx({ rng: stubRng(0.9) }))).toBe('disintegrate'); // 0.9 > 0.6 → skip
  });

  it('Beholder death-rays only its last resort, and only with a target', () => {
    const b = MONSTERS.beholder;
    // Everything but deathRay down → its target guard is finally evaluated.
    expect(b.decide(ctx({ usable: (id) => id === 'deathRay', target: PLAYER_STUB }))).toBe(
      'deathRay',
    );
    expect(b.decide(ctx({ usable: (id) => id === 'deathRay', target: null }))).toBeNull();
  });

  it('Archlich soul-rends only its last resort, and only with a target', () => {
    const a = MONSTERS.archlich;
    expect(a.decide(ctx({ usable: (id) => id === 'soulRend', target: PLAYER_STUB }))).toBe(
      'soulRend',
    );
    expect(a.decide(ctx({ usable: (id) => id === 'soulRend', target: null }))).toBeNull();
  });

  it('Gargoyle idles in its kite band (all guards fail → null)', () => {
    const g = MONSTERS.gargoyle;
    expect(g.decide(ctx({ hpFrac: 1, distToTarget: 135, anyInMelee: false }))).toBe('divebomb');
    // hp>=0.5, not far(>130) at 120u, not in melee → no rule fires.
    expect(g.decide(ctx({ hpFrac: 1, distToTarget: 120, anyInMelee: false }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Run assembly
// ---------------------------------------------------------------------------

describe('buildRun', () => {
  it('produces a RUN_LENGTH run led by the chosen boss', () => {
    const run = buildRun('troll', 0, new Rng(1));
    expect(run).toHaveLength(RUN_LENGTH);
    expect(run[0]).toBe('troll');
  });

  it('draws only pickable (non-hidden) bosses, no duplicates', () => {
    const run = buildRun('goblin', 0, new Rng(7));
    for (const id of run) {
      expect(MONSTER_IDS).toContain(id);
      expect(id).not.toBe('dummy');
    }
    expect(new Set(run).size).toBe(run.length);
  });

  it('is deterministic for a given seed', () => {
    expect(buildRun('lich', 1, new Rng(99))).toEqual(buildRun('lich', 1, new Rng(99)));
  });

  it('follows the cycle-0 difficulty spine after the opener', () => {
    // Slot 0 is the (easy) opener; slots 1..4 follow patternC0[1..4].
    const run = buildRun('goblin', 0, new Rng(3));
    const tiers = run.map((id) => MONSTERS[id].tier);
    expect(tiers.slice(1)).toEqual(['easy', 'medium', 'medium', 'hard']);
  });

  it('hardens the spine on later cycles', () => {
    const c1 = buildRun('goblin', 1, new Rng(3)).map((id) => MONSTERS[id].tier);
    expect(c1.slice(1)).toEqual(['medium', 'medium', 'hard', 'hard']);

    const c2 = buildRun('goblin', 2, new Rng(3)).map((id) => MONSTERS[id].tier);
    expect(c2.slice(1)).toEqual(['medium', 'hard', 'hard', 'hard']);
  });
});

describe('buildRunSlots', () => {
  const lowerTier: Record<BossTier, BossTier> = { easy: 'easy', medium: 'easy', hard: 'medium' };

  it('keeps the spine shape: RUN_LENGTH slots led by the chosen boss', () => {
    const slots = buildRunSlots('goblin', 0, new Rng(42));
    expect(slots).toHaveLength(RUN_LENGTH);
    expect(slots[0]).toEqual(['goblin']); // cycle-0 opener is always solo
    for (const slot of slots) {
      expect(slot[0]).toBeDefined();
      expect(slot.length).toBeGreaterThanOrEqual(1);
      expect(slot.length).toBeLessThanOrEqual(2);
    }
  });

  it('leads every slot list with the spine boss', () => {
    const slots = buildRunSlots('orc', 2, new Rng(5));
    expect(slots[0][0]).toBe('orc');
  });

  it('is deterministic for a given seed + party size', () => {
    expect(buildRunSlots('goblin', 2, new Rng(8), 4)).toEqual(
      buildRunSlots('goblin', 2, new Rng(8), 4),
    );
  });

  it('never fields the hidden dummy', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const slot of buildRunSlots('dragon', 3, new Rng(seed))) {
        expect(slot).not.toContain('dummy');
      }
    }
  });

  it('twin partners are distinct and drawn from the same or lower tier', () => {
    let twins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const slot of buildRunSlots('goblin', 2, new Rng(seed), 4)) {
        if (slot.length !== 2) continue;
        twins++;
        const [lead, partner] = slot;
        expect(partner).not.toBe(lead);
        expect(MONSTER_IDS).toContain(partner);
        const allowed = [MONSTERS[lead].tier, lowerTier[MONSTERS[lead].tier]];
        expect(allowed).toContain(MONSTERS[partner].tier);
      }
    }
    expect(twins).toBeGreaterThan(0); // the twin branch is actually exercised
  });

  it('scales twin odds down for small parties (party-factor branches)', () => {
    const count = (partySize: number): number => {
      let n = 0;
      for (let seed = 1; seed <= 80; seed++) {
        for (const slot of buildRunSlots('goblin', 2, new Rng(seed), partySize)) {
          if (slot.length === 2) n++;
        }
      }
      return n;
    };
    const solo = count(1); // factor 0.3
    const duo = count(2); // factor 0.6
    const band = count(4); // factor 1
    expect(solo).toBeLessThan(duo);
    expect(duo).toBeLessThan(band);
  });

  it('cycle-0 opener stays solo but later slots may twin', () => {
    let laterTwins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const slots = buildRunSlots('goblin', 0, new Rng(seed), 4);
      expect(slots[0]).toHaveLength(1); // opener always solo on the first run
      for (let i = 1; i < slots.length; i++) {
        if (slots[i].length === 2) laterTwins++;
      }
    }
    expect(laterTwins).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Endless cycle modifiers
// ---------------------------------------------------------------------------

describe('cycle modifiers', () => {
  it('CYCLE_MODIFIERS is a well-formed 5-element table', () => {
    const auras = ['frost', 'shadow', 'ember', 'venom', 'storm'];
    expect(CYCLE_MODIFIERS).toHaveLength(5);
    const ids = CYCLE_MODIFIERS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length); // unique ids
    for (const m of CYCLE_MODIFIERS) {
      expect(auras).toContain(m.aura);
      expect(m.id).toBe(m.aura); // id and aura are kept in lockstep
      expect(m.prefix.length).toBeGreaterThan(0);
      expect(Number.isFinite(m.color)).toBe(true);
    }
  });

  it('cycle 0 (and anything below it) has no modifier', () => {
    expect(modifierForCycle(0)).toBeNull();
    expect(modifierForCycle(-1)).toBeNull();
    expect(modifierForCycle(-5)).toBeNull();
  });

  it('cycles 1..5 map to the table in order', () => {
    expect(modifierForCycle(1)).toBe(CYCLE_MODIFIERS[0]);
    expect(modifierForCycle(2)).toBe(CYCLE_MODIFIERS[1]);
    expect(modifierForCycle(3)).toBe(CYCLE_MODIFIERS[2]);
    expect(modifierForCycle(4)).toBe(CYCLE_MODIFIERS[3]);
    expect(modifierForCycle(5)).toBe(CYCLE_MODIFIERS[4]);
    expect(modifierForCycle(1)?.aura).toBe('frost');
    expect(modifierForCycle(2)?.aura).toBe('shadow');
  });

  it('wraps around past the table length', () => {
    expect(modifierForCycle(6)).toBe(CYCLE_MODIFIERS[0]); // (6-1) % 5 = 0
    expect(modifierForCycle(11)).toBe(CYCLE_MODIFIERS[0]); // (11-1) % 5 = 0
    expect(modifierForCycle(7)).toBe(CYCLE_MODIFIERS[1]);
  });
});
