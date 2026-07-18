/**
 * Branch-coverage tests for NEW game mechanics that the happy-path suites miss:
 *
 *   • item 11 — forced movement (knockback / pull) and the root-vs-force rule in
 *     `applyForcedMove` (abilities.ts ~291-301).
 *   • item 11 — Dimension Door's teleport-swap `applyDimensionSwap` (abilities.ts
 *     ~311-333) reached through a blink with `swap: true` (the ~490 dispatch).
 *   • item 5 — a player fireball's AoE-on-impact crit paths in the world sim
 *     (world.ts ~1464 / ~1471-1472), damaging bosses AND adds in the blast.
 *
 * Everything is deterministic (fixed seed; crit forced by setting critChance to
 * exactly 0 or 1 so the seeded crit stream is irrelevant) and asserts a real
 * observable effect (position moved, root kept/broken, HP lost, crit multiplier).
 */
import { describe, it, expect } from 'vitest';
import { resolvePlayerAbility, applyForcedMove, stepShove } from '../src/engine/combat/abilities';
import { World } from '../src/engine/world/world';
import { makeBuff, applyBuff, isRooted } from '../src/engine/combat/combat';
import {
  FORCE_OVERCOME_ROOT,
  CRIT_MULT_BASE,
  ADD_HP,
  ADD_MOVE_SPEED,
  ADD_RADIUS,
} from '../src/engine/core/constants';
import type {
  Player,
  Boss,
  ClassId,
  MonsterId,
  Add,
  Vec2,
  Projectile,
} from '../src/engine/core/types';
import type { PlayerAbilityDef } from '../src/engine/content/classes';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const DT = 0.05;
const ZERO: Vec2 = { x: 0, y: 0 };
const RIGHT: Vec2 = { x: 1, y: 0 };

function mkWorld(classId: ClassId = 'knight', monsterId: MonsterId = 'dragon'): World {
  return new World({ monsterId, seed: 1, players: [{ peerId: 'a', name: 'A', classId }] });
}

/** The player's private (cloned) ability table — World always sets it. */
function tableOf(p: Player) {
  if (!p.abilities) throw new Error('player has no ability table');
  return p.abilities;
}

function mkAdd(w: World, pos: Vec2): Add {
  return {
    id: w.allocId(),
    pos: { ...pos },
    hp: ADD_HP,
    maxHp: ADD_HP,
    moveSpeed: ADD_MOVE_SPEED,
    radius: ADD_RADIUS,
    targetId: null,
    attackCd: 0,
    buffs: [],
  };
}

/** A hand-placed player fireball (AoE-on-impact shot) for the world impact path. */
function mkFireball(w: World, over: Partial<Projectile> = {}): Projectile {
  return {
    id: w.allocId(),
    kind: 'fireball',
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    ownerId: 0,
    side: 'player',
    damage: 30,
    impactRadius: 120,
    hitRadius: 10,
    lifetime: 5,
    rangeLeft: 500,
    ...over,
  };
}

/** A minimal ability def carrying only the forced-movement fields under test. */
const forceAb = (over: Partial<PlayerAbilityDef>): PlayerAbilityDef => ({
  slot: 'a1',
  name: 'Shove',
  kind: 'meleeCone',
  cooldown: 5,
  damage: 0,
  ...over,
});

const distXY = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * item 2 — forced movement now travels over a few ticks as an authoritative slide
 * rather than an instant pos write. Fast-forward an entity's shove to its endpoint so
 * these unit tests can assert the settled position (a no-op if nothing was shoved).
 */
function settle(w: World, e: Boss | Add): void {
  for (let i = 0; i < 16 && e.shove; i++) stepShove(w, e, DT);
}

// ===========================================================================
// item 11 — applyForcedMove: knockback / pull / root-vs-force
// ===========================================================================
describe('applyForcedMove (item 11)', () => {
  it('knockback shoves a non-rooted enemy AWAY from the caster', () => {
    const w = mkWorld('knight');
    const boss = w.boss!;
    const from: Vec2 = { x: 500, y: 500 };
    boss.pos = { x: 600, y: 500 }; // 100u to the caster's right
    const d0 = distXY(from, boss.pos);

    applyForcedMove(w, from, boss, forceAb({ knockback: 80 }));
    settle(w, boss); // item 2: the shove now slides in over ticks — resolve it

    expect(boss.pos.x).toBeCloseTo(680, 3); // pushed a further 80u along +x
    expect(boss.pos.y).toBeCloseTo(500, 3); // straight away — no lateral drift
    expect(boss.pos.x).toBeGreaterThan(600);
    expect(distXY(from, boss.pos)).toBeGreaterThan(d0); // strictly farther out
  });

  it('pull drags a non-rooted enemy TOWARD the caster', () => {
    const w = mkWorld('knight');
    const boss = w.boss!;
    const from: Vec2 = { x: 500, y: 500 };
    boss.pos = { x: 600, y: 500 };
    const d0 = distXY(from, boss.pos);

    applyForcedMove(w, from, boss, forceAb({ pull: 40 }));
    settle(w, boss); // item 2: the pull now slides in over ticks — resolve it

    expect(boss.pos.x).toBeCloseTo(560, 3); // dragged 40u back toward x=500
    expect(boss.pos.y).toBeCloseTo(500, 3);
    expect(boss.pos.x).toBeLessThan(600);
    expect(distXY(from, boss.pos)).toBeLessThan(d0); // strictly closer in
  });

  it('a rooted enemy resists a weak shove but a strong one rips the root off and moves it', () => {
    const w = mkWorld('knight');
    const boss = w.boss!;
    const from: Vec2 = { x: 500, y: 500 };
    boss.pos = { x: 600, y: 500 };
    applyBuff(boss, makeBuff('root', 0, 5, 'test'));
    expect(isRooted(boss)).toBe(true);

    // Below FORCE_OVERCOME_ROOT → the bind wins: no movement (no shove), root intact.
    applyForcedMove(w, from, boss, forceAb({ knockback: FORCE_OVERCOME_ROOT - 1 }));
    settle(w, boss); // no-op: a held target was never shoved
    expect(boss.pos.x).toBe(600); // held fast
    expect(boss.pos.y).toBe(500);
    expect(isRooted(boss)).toBe(true); // root still present

    // At/above the threshold → the shove overpowers the bind: root broken + moved.
    applyForcedMove(w, from, boss, forceAb({ knockback: FORCE_OVERCOME_ROOT + 50 }));
    settle(w, boss); // item 2: resolve the slide to its endpoint
    expect(boss.pos.x).toBeGreaterThan(600); // finally shoved out
    expect(boss.pos.x).toBeCloseTo(800, 3); // 600 + 200 impulse
    expect(isRooted(boss)).toBe(false); // root ripped free
    expect(boss.buffs.some((b) => b.kind === 'root')).toBe(false);
  });
});

// ===========================================================================
// item 2 — forced movement travels over a few ticks (heroes, bosses AND adds)
// ===========================================================================
describe('forced-move slide over time (item 2)', () => {
  const forceAb = (over: Partial<PlayerAbilityDef>): PlayerAbilityDef => ({
    slot: 'a1',
    name: 'Shove',
    kind: 'meleeCone',
    cooldown: 5,
    damage: 0,
    ...over,
  });

  it('does not teleport a boss or add — it arms a shove and slides them over MULTIPLE ticks', () => {
    const w = mkWorld('knight');
    const boss = w.boss!;
    const add = mkAdd(w, { x: 300, y: 300 });
    boss.pos = { x: 800, y: 500 };
    applyForcedMove(w, { x: 600, y: 500 }, boss, forceAb({ knockback: 200 })); // +200x
    applyForcedMove(w, { x: 300, y: 100 }, add, forceAb({ knockback: 200 })); // +200y

    // Neither jumps to the endpoint: a shove is armed, positions are unchanged.
    expect(boss.shove).toBeTruthy();
    expect(add.shove).toBeTruthy();
    expect(boss.pos.x).toBeCloseTo(800, 3);
    expect(add.pos.y).toBeCloseTo(300, 3);

    // A single tick advances each only PART of the way (it travels, not a jump).
    stepShove(w, boss, DT);
    stepShove(w, add, DT);
    expect(boss.pos.x).toBeGreaterThan(800);
    expect(boss.pos.x).toBeLessThan(1000);
    expect(add.pos.y).toBeGreaterThan(300);
    expect(add.pos.y).toBeLessThan(500);

    // Counting the ticks it takes to settle proves it resolves over several, not one.
    let ticks = 1;
    while (boss.shove && ticks < 20) {
      stepShove(w, boss, DT);
      ticks++;
    }
    expect(ticks).toBeGreaterThan(2);
    settle(w, add);

    // Both land at exactly the endpoint the old instant write produced, then clear.
    expect(boss.pos.x).toBeCloseTo(1000, 3); // 800 + 200
    expect(add.pos.y).toBeCloseTo(500, 3); // 300 + 200
    expect(boss.shove == null).toBe(true);
    expect(add.shove == null).toBe(true);
  });

  it('the world sim loop advances an in-flight shove each tick, and freezes the boss walk', () => {
    const w = mkWorld('knight');
    const boss = w.boss!;
    w.players[0].pos = { x: 100, y: 100 }; // tuck the hero away — no separation nudges
    boss.pos = { x: 800, y: 500 };
    boss.decisionTimer = 999; // keep the boss from choosing an ability
    applyForcedMove(w, { x: 600, y: 500 }, boss, forceAb({ knockback: 200 }));
    const x0 = boss.pos.x;

    w.step(DT, new Map()); // one full sim tick — its stepShoves must advance the slide
    expect(boss.pos.x).toBeGreaterThan(x0); // moved by the loop's shove step
    expect(boss.pos.x).toBeLessThan(x0 + 200); // only part-way (a slide, not a jump)
    // The boss is being carried by the shove, so it did NOT also walk toward the hero
    // at (100,100) — that would have pulled its x DOWN, not up.
    expect(boss.pos.y).toBeCloseTo(500, 0);
  });

  it('a shoved add is carried by its slide, not its own walk toward the hero', () => {
    const w = mkWorld('knight');
    w.boss!.pos = { x: 100, y: 100 }; // boss well away
    w.players[0].pos = { x: 800, y: 500 }; // hero ABOVE the add
    const add = mkAdd(w, { x: 800, y: 800 });
    w.adds = [add];
    // Shove the add DOWN (+y), i.e. AWAY from the hero it would otherwise chase upward.
    applyForcedMove(w, { x: 800, y: 700 }, add, forceAb({ knockback: 200 }));
    expect(add.shove).toBeTruthy();
    const y0 = add.pos.y;

    w.step(DT, new Map());
    // The slide carried it DOWN; had it walked toward the hero it would have gone UP.
    expect(add.pos.y).toBeGreaterThan(y0);
  });

  it("drops a felled hero's shove mid-slide (no ghost-sliding a corpse)", () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    p.pos = { x: 800, y: 500 };
    applyForcedMove(w, { x: 600, y: 500 }, p, forceAb({ knockback: 200 }));
    expect(p.shove).toBeTruthy();

    p.state = 'downed'; // fell while the knockback was still carrying them
    w.step(DT, new Map()); // stepShoves must clear the shove for a non-alive hero
    expect(p.shove == null).toBe(true);
  });

  it('drops a boss’s in-flight shove when it BLINKS away (instant reposition, not a slide)', () => {
    // A blink teleports the boss, so a knockback still carrying it must be dropped or it
    // keeps ghost-sliding from the spot it left (world.ts:2599). A fresh boss starts idle —
    // the branch where handleBlink runs each tick — so a single step fires the blink.
    const w = mkWorld('knight', 'lich'); // lich has a native blink (threatenRange 100)
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: p.pos.x + 30, y: p.pos.y }; // inside threatenRange → it blinks off the hero
    boss.blinkTimer = 0; // blink off cooldown
    applyForcedMove(w, { x: boss.pos.x - 50, y: boss.pos.y }, boss, forceAb({ knockback: 80 }));
    expect(boss.shove).toBeTruthy(); // knockback in flight
    const before = { ...boss.pos };

    w.step(DT, new Map());

    expect(boss.shove == null).toBe(true); // the blink dropped the slide…
    expect(distXY(before, boss.pos)).toBeGreaterThan(100); // …and it teleported clear (blink range 300)
  });
});

// ===========================================================================
// item 11 — Dimension Door: a swap-blink reflects enemies across the caster
// ===========================================================================
describe('blink swap / applyDimensionSwap (item 11)', () => {
  it('reflects a boss and an add across the mage, while a close-bound foe holds fast', () => {
    const w = mkWorld('mage');
    w.obstacles = [];
    const p = w.players[0];
    // Park the mage in place (range 0) and turn its Blink into a Dimension Door.
    const t = tableOf(p);
    t.a3.range = 0;
    t.a3.swap = true;
    t.a3.radius = 220;
    p.pos = { x: 800, y: 500 };
    p.aim = { ...RIGHT };

    // A boss 100u to the right — unrooted, so it reflects to the mage's far (left) side.
    const boss = w.boss!;
    boss.pos = { x: 900, y: 500 };

    // An add 200u below — unrooted, reflects across to the top side (line 332).
    const addFar = mkAdd(w, { x: 800, y: 700 });
    // A rooted add 50u away — 2·d = 100 < FORCE_OVERCOME_ROOT(150) → stays put (line 326).
    const addNearRooted = mkAdd(w, { x: 850, y: 500 });
    applyBuff(addNearRooted, makeBuff('root', 0, 5, 'test'));
    // A rooted add 150u away — 2·d = 300 ≥ 150 → root ripped off, then reflected (line 327).
    const addFarRooted = mkAdd(w, { x: 800, y: 650 });
    applyBuff(addFarRooted, makeBuff('root', 0, 5, 'test'));
    w.adds = [addFar, addNearRooted, addFarRooted];

    resolvePlayerAbility(w, p, 'a3', ZERO); // Dimension Door
    // item 2: the reflected foes now slide across over ticks — resolve every shove.
    settle(w, boss);
    for (const a of w.adds) settle(w, a);

    // The mage itself did not move (range 0) — the reflection is across its spot.
    expect(p.pos.x).toBeCloseTo(800, 3);
    expect(p.pos.y).toBeCloseTo(500, 3);

    // Boss: 100u right → 100u left of the mage (crossed x = 800). [line 331]
    expect(boss.pos.x).toBeCloseTo(700, 3);
    expect(boss.pos.x).toBeLessThan(800);

    // Far add: 200u below → 200u above the mage (crossed y = 500). [line 332]
    expect(addFar.pos.y).toBeCloseTo(300, 3);
    expect(addFar.pos.y).toBeLessThan(500);

    // Near rooted add: the bind holds — unmoved and still rooted. [line 326]
    expect(addNearRooted.pos.x).toBeCloseTo(850, 3);
    expect(addNearRooted.pos.y).toBeCloseTo(500, 3);
    expect(isRooted(addNearRooted)).toBe(true);

    // Far rooted add: strong enough swap tears the root off and flings it across. [line 327]
    expect(addFarRooted.pos.y).toBeCloseTo(350, 3);
    expect(addFarRooted.pos.y).toBeLessThan(500);
    expect(isRooted(addFarRooted)).toBe(false);
  });
});

// ===========================================================================
// item 5 — fireball AoE-on-impact can crit bosses AND adds in the blast
// ===========================================================================
describe('fireball AoE impact crits (item 5)', () => {
  /** Fire a Mage Fireball into two frozen adds and report the blast damage taken. */
  function fireballIntoAdds(critChance: number): { aDmg: number; bDmg: number; sawCrit: boolean } {
    const w = mkWorld('mage');
    w.boss = null; // no boss → the shot must detonate on an add
    w.obstacles = []; // nothing to absorb the shot in flight
    w.terrain = [];
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    p.critChance = critChance; // 1 → always crit, 0 → never (seed-independent)

    // Trigger add is on-axis; the splash add sits off-axis but inside the blast.
    const trigger = mkAdd(w, { x: 600, y: 500 });
    const splash = mkAdd(w, { x: 600, y: 560 });
    for (const a of [trigger, splash]) {
      a.moveSpeed = 0; // frozen so the blast geometry is deterministic
      a.hp = 1000; // survive the hit so the damage delta is observable
      a.maxHp = 1000;
    }
    w.adds = [trigger, splash];

    resolvePlayerAbility(w, p, 'a1', ZERO); // Mage Fireball (impactRadius 110)
    for (let i = 0; i < 60 && w.projectiles.length > 0; i++) w.step(DT, new Map());

    const sawCrit = w.events.some((e) => e.t === 'hit' && e.crit === true);
    return { aDmg: 1000 - trigger.hp, bDmg: 1000 - splash.hp, sawCrit };
  }

  it('a detonating fireball damages every add in the blast and reflects the crit multiplier', () => {
    const crit = fireballIntoAdds(1);
    const plain = fireballIntoAdds(0);

    // Both the trigger add and the off-axis splash add take AoE damage (world.ts ~1471/1472).
    expect(crit.aDmg).toBeGreaterThan(0);
    expect(crit.bDmg).toBeGreaterThan(0);
    expect(plain.aDmg).toBeGreaterThan(0);
    expect(plain.bDmg).toBeGreaterThan(0);

    // The crit multiplier is observable: a crit blast lands exactly CRIT_MULT_BASE× the plain one.
    expect(crit.aDmg).toBeCloseTo(plain.aDmg * CRIT_MULT_BASE, 4);
    expect(crit.bDmg).toBeCloseTo(plain.bDmg * CRIT_MULT_BASE, 4);

    // The crit flag is recorded on the hit event only when it actually crit.
    expect(crit.sawCrit).toBe(true);
    expect(plain.sawCrit).toBe(false);
  });

  it('a fireball blast crits a boss and an add caught together (world impact path ~1464)', () => {
    const w = mkWorld('mage');
    w.obstacles = [];
    w.terrain = [];
    const p = w.players[0];
    p.critChance = 1; // force the crit branch
    const boss = w.boss!;
    boss.decisionTimer = 100; // keep the boss from wandering out of its own blast
    boss.pos = { x: 800, y: 400 };
    const add = mkAdd(w, { x: 800, y: 440 }); // 40u away — inside the 120u blast
    add.moveSpeed = 0;
    add.hp = 1000;
    add.maxHp = 1000;
    w.adds = [add];

    const bossBefore = boss.hp;
    // Detonate a fireball right on the boss so the AoE catches boss + add together.
    w.projectiles = [
      mkFireball(w, { ownerId: p.id, pos: { x: 800, y: 400 }, damage: 30, impactRadius: 120 }),
    ];
    w.step(DT, new Map());

    // Boss AoE crit path (world.ts ~1464): 30 base × 1.5 crit multiplier.
    expect(bossBefore - boss.hp).toBeCloseTo(30 * CRIT_MULT_BASE, 4);
    // Add AoE crit path in the same blast (world.ts ~1471/1472).
    expect(1000 - add.hp).toBeCloseTo(30 * CRIT_MULT_BASE, 4);

    // Both strikes are flagged as crits on their hit events.
    expect(w.events.some((e) => e.t === 'hit' && e.targetId === boss.id && e.crit === true)).toBe(
      true,
    );
    expect(w.events.some((e) => e.t === 'hit' && e.targetId === add.id && e.crit === true)).toBe(
      true,
    );
  });
});
