/**
 * Warband — boss signatures.
 *
 * Round 2 (item 28, issue #25):
 *   1. Boss-vs-boss synergy — a telegraphed pack bond that only resolves while
 *      both bosses live, empowering / warding a wounded partner (seeded).
 *   2. The knockback/pull primitive + the lethal abyss void (a surge drags a
 *      hero into a bottomless core for an environmental death).
 *   3. Per-boss signatures — the Kraken's tentacle grab (pull), the Beholder's
 *      anti-magic disintegration (silence), the Death Knight's lifedrain.
 *
 * Round 3 — breadth + depth (item 28 follow-up, issue #33):
 *   5. Standable SILENCE zones — an antimagic pool hushes casters who stand IN
 *      it, tick-by-tick, with the 🔇 buff as the HUD cue.
 *   6. Deeper Hard-tier kits — a real Death Grip PULL, the Lich's grasping void,
 *      death-magic / fae silences.
 *   7. Broadened signature terrains — the vampire's blood-mire and the demon's
 *      brimstone, each a surging home arena.
 *   8. The breadth target — EVERY Hard-tier boss now reads as distinctive.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import {
  applyImpulse,
  pullToward,
  resolveBossAbility,
  beamTick,
  spawnZone,
} from '../src/engine/combat/abilities';
import { getMonster, abilityById, MONSTERS_BY_TIER } from '../src/engine/content/monsters';
import { generateTerrain, themeFor, SIGNATURE_TERRAINS } from '../src/engine/world/terrain';
import { hasBuff } from '../src/engine/combat/combat';
import { dist } from '../src/engine/core/torus';
import {
  SYNERGY_WINDUP,
  SYNERGY_EMPOWER_MULT,
  SYNERGY_WARD_MULT,
  TERRAIN_SURGE_INTERVAL,
} from '../src/engine/core/constants';
import type {
  InputCommand,
  ButtonState,
  BossAction,
  TerrainPatch,
  ClassId,
  MonsterId,
} from '../src/engine/core/types';

const DT = 0.05;

function buttons(over: Partial<ButtonState> = {}): ButtonState {
  return { basic: false, a1: false, a2: false, a3: false, revive: false, ...over };
}
function inp(over: Partial<InputCommand> = {}): InputCommand {
  return { seq: 0, move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, buttons: buttons(), ...over };
}
/** A zero-input map for every player in the world (nobody moves or acts). */
function idle(w: World): Map<string, InputCommand> {
  return new Map(w.players.map((p) => [p.peerId, inp()]));
}
function mkWorld(monsterId: MonsterId, classId: ClassId = 'knight'): World {
  return new World({ monsterId, seed: 1, players: [{ peerId: 'a', name: 'A', classId }] });
}
function mkAction(over: Partial<BossAction> = {}): BossAction {
  return {
    kind: 'windup',
    abilityId: null,
    remaining: 0,
    total: 0,
    targetId: null,
    targetPos: null,
    aimAngle: 0,
    channelAccum: 0,
    ...over,
  };
}
let terrainIds = 1;
function counter(): () => number {
  return () => terrainIds++;
}

// ---------------------------------------------------------------------------
// 1. The movement-impulse primitive (shared knockback / pull path)
// ---------------------------------------------------------------------------

describe('signatures: impulse primitive', () => {
  it('applyImpulse shoves a target along a direction (degenerate dir → +x)', () => {
    const w = mkWorld('dragon');
    const t = { pos: { x: 800, y: 500 } };
    applyImpulse(w, t, { x: 1, y: 0 }, 100);
    expect(t.pos.x).toBeCloseTo(900, 4);
    expect(t.pos.y).toBeCloseTo(500, 4);
    // A zero direction never no-ops — it falls back to +x so a shove always lands.
    const u = { pos: { x: 400, y: 400 } };
    applyImpulse(w, u, { x: 0, y: 0 }, 50);
    expect(u.pos.x).toBeCloseTo(450, 4);
  });

  it('applyImpulse wraps around the torus instead of clamping to a wall', () => {
    const w = mkWorld('dragon');
    const t = { pos: { x: w.arena.w - 20, y: 500 } };
    applyImpulse(w, t, { x: 1, y: 0 }, 60);
    // 1580 + 60 = 1640 → wraps to 40 on a 1600-wide torus.
    expect(t.pos.x).toBeCloseTo(40, 3);
  });

  it('pullToward drags a target toward a centre, never overshooting it', () => {
    const w = mkWorld('dragon');
    const t = { pos: { x: 800, y: 300 } };
    const moved = pullToward(w, t, { x: 800, y: 500 }, 50); // centre 200 below
    expect(moved).toBeCloseTo(50, 4);
    expect(t.pos.y).toBeCloseTo(350, 4);

    // A pull longer than the gap lands exactly on the centre (no overshoot).
    const u = { pos: { x: 800, y: 300 } };
    const moved2 = pullToward(w, u, { x: 800, y: 500 }, 999);
    expect(moved2).toBeCloseTo(200, 4);
    expect(u.pos.y).toBeCloseTo(500, 4);

    // Already at the centre → no movement.
    const v = { pos: { x: 800, y: 500 } };
    expect(pullToward(w, v, { x: 800, y: 500 }, 100)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. The lethal abyss void (surge pull → environmental death)
// ---------------------------------------------------------------------------

describe('signatures: lethal abyss void', () => {
  /** A two-player world so a single victim downing never ends the fight. */
  function voidWorld(): World {
    const w = new World({
      monsterId: 'bandit',
      seed: 5,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
      ],
    });
    w.boss = null; // isolate the terrain surge from boss behaviour
    w.terrain = [];
    return w;
  }

  it('a surge drags a caught hero into the core for an environmental death', () => {
    const w = voidWorld();
    const [victim, bystander] = w.players;
    const centre = { x: 800, y: 500 };
    victim.pos = { x: 800, y: 380 }; // 120u from centre: inside the pull, outside the core
    bystander.pos = { x: 150, y: 150 }; // far outside the surge
    // A telegraphed pull-strike about to land (a surge distilled to one detonation).
    w.addPendingStrike({
      pos: { ...centre },
      radius: 160,
      fuse: DT * 0.5,
      damage: 0,
      pull: { strength: 210, lethalRadius: 80, lethalDamage: 100000 },
    });
    w.step(DT, idle(w));
    // Dragged to the heart of the chasm and plunged.
    expect(victim.state).toBe('downed');
    expect(dist(victim.pos, centre)).toBeLessThanOrEqual(80);
    // The hero safely outside the surge is untouched (no cheap-shot at range).
    expect(bystander.state).toBe('alive');
    expect(bystander.pos).toEqual({ x: 150, y: 150 });
  });

  it('an i-frame slips the surge grip entirely (dodge saves you)', () => {
    const w = voidWorld();
    const victim = w.players[0];
    victim.pos = { x: 800, y: 380 };
    victim.buffs.push({ kind: 'invuln', mult: 0, remaining: 5, source: 'test' });
    w.addPendingStrike({
      pos: { x: 800, y: 500 },
      radius: 160,
      fuse: DT * 0.5,
      damage: 0,
      pull: { strength: 210, lethalRadius: 80, lethalDamage: 100000 },
    });
    w.step(DT, idle(w));
    expect(victim.state).toBe('alive');
    expect(victim.pos).toEqual({ x: 800, y: 380 }); // not pulled at all
  });

  it('a non-lethal (tide) pull hauls a hero deeper without killing them', () => {
    const w = voidWorld();
    const victim = w.players[0];
    const centre = { x: 800, y: 500 };
    victim.pos = { x: 800, y: 300 }; // 200u away
    w.addPendingStrike({
      pos: { ...centre },
      radius: 260,
      fuse: DT * 0.5,
      damage: 0,
      pull: { strength: 150, lethalRadius: 0, lethalDamage: 100000 }, // no core → never lethal
    });
    w.step(DT, idle(w));
    expect(victim.state).toBe('alive'); // dragged, but the tide has no bottomless core
    expect(dist(victim.pos, centre)).toBeCloseTo(50, 0); // 200 - 150 pull
  });

  it('an abyss patch surges on its cadence, telegraphs it, then plunges a hero in the core', () => {
    const w = voidWorld();
    const victim = w.players[0];
    w.players[1].pos = { x: 150, y: 150 };
    const centre = { x: 800, y: 500 };
    const patch: TerrainPatch = {
      id: w.allocId(),
      kind: 'abyss',
      pos: { ...centre },
      radius: 160,
      damagePerTick: 0, // isolate the plunge from the ambient DoT
      slowMult: 1,
      slowDuration: 0,
      tickAccum: 0,
      lethalRadius: 80,
      surgeAccum: TERRAIN_SURGE_INTERVAL, // due to surge on the next tick
    };
    w.terrain = [patch];
    victim.pos = { x: 800, y: 400 }; // 100u from centre, inside the pull

    // First tick: the surge schedules a telegraphed pull the band can read.
    w.step(DT, idle(w));
    expect(w.pendingStrikes.some((s) => s.pull != null)).toBe(true);
    const tg = w.serialize().telegraphs ?? [];
    expect(tg.some((t) => t.kind === 'circle')).toBe(true);

    // It then detonates after its fuse and plunges the hero into the void.
    for (let i = 0; i < 60 && victim.state === 'alive'; i++) w.step(DT, idle(w));
    expect(victim.state).toBe('downed');
  });

  it('a tide patch surges with a non-lethal pull (no bottomless core)', () => {
    const w = voidWorld();
    w.terrain = [
      {
        id: w.allocId(),
        kind: 'tide',
        pos: { x: 800, y: 500 },
        radius: 200,
        damagePerTick: 0,
        slowMult: 1,
        slowDuration: 0,
        tickAccum: 0,
        surgeAccum: TERRAIN_SURGE_INTERVAL,
      },
    ];
    w.step(DT, idle(w));
    const surge = w.pendingStrikes.find((s) => s.pull != null);
    expect(surge).toBeTruthy();
    expect(surge!.pull!.lethalRadius).toBe(0); // the tide hauls, but never plunges
  });

  it('ordinary terrain (magma) never surges — only the signature hazards do', () => {
    const w = voidWorld();
    w.terrain = [
      {
        id: w.allocId(),
        kind: 'magma',
        pos: { x: 800, y: 500 },
        radius: 150,
        damagePerTick: 0,
        slowMult: 1,
        slowDuration: 0,
        tickAccum: 0,
        surgeAccum: 999, // would fire immediately IF magma surged
      },
    ];
    w.step(DT, idle(w));
    expect(w.pendingStrikes.length).toBe(0);
  });

  it('generated abyss patches carry a lethal core; the tide never does', () => {
    let sawAbyssCore = false;
    for (let seed = 1; seed <= 25; seed++) {
      for (const p of generateTerrain('bandit', seed * 7, counter())) {
        if (p.kind === 'abyss') {
          expect(p.lethalRadius).toBeGreaterThan(0);
          sawAbyssCore = true;
        }
      }
      for (const p of generateTerrain('kraken', seed * 7, counter())) {
        if (p.kind === 'tide') expect(p.lethalRadius ?? 0).toBe(0);
      }
    }
    expect(sawAbyssCore).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Boss-vs-boss synergy (twin / N-boss packs)
// ---------------------------------------------------------------------------

describe('signatures: boss-vs-boss synergy', () => {
  function twin(seed = 11): World {
    return new World({
      monsterId: 'dragon',
      seed,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
      coBosses: ['troll'],
    });
  }

  it('a lone boss never forms a pack bond (solo fights are untouched)', () => {
    const w = mkWorld('dragon');
    w.synergyTimer = 0.01; // even if forced, a single boss has no partner
    for (let i = 0; i < 5; i++) w.step(DT, idle(w));
    expect(w.bond).toBeNull();
    expect(w.serialize().telegraphs).toBeUndefined();
  });

  it('a pack bond forms in a twin fight, is telegraphed, and empowers/wards a partner', () => {
    const w = twin();
    w.synergyTimer = 0.01;
    w.step(DT, new Map()); // synergy timer elapses → bond begins winding up
    expect(w.bond).not.toBeNull();

    // Telegraphed: a line telegraph connects the two bosses during the wind-up.
    const tg = w.serialize().telegraphs ?? [];
    expect(tg.some((t) => t.kind === 'line')).toBe(true);

    // Burn through the wind-up; the bond resolves onto the partner.
    for (let i = 0; i < Math.ceil(SYNERGY_WINDUP / DT) + 3 && w.bond; i++) w.step(DT, new Map());
    expect(w.bond).toBeNull();

    const partner = w.bosses.find((b) =>
      b.buffs.some((bf) => bf.source === 'packEmpower' || bf.source === 'packWard'),
    );
    expect(partner).toBeTruthy();
    const buff = partner!.buffs.find(
      (bf) => bf.source === 'packEmpower' || bf.source === 'packWard',
    )!;
    // The gift is exactly one of the two designed values.
    expect([SYNERGY_EMPOWER_MULT, SYNERGY_WARD_MULT]).toContain(buff.mult);
  });

  it('resolves both gifts — empower grants outgoing damage, ward grants mitigation', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40 && seen.size < 2; seed++) {
      const w = twin(seed);
      w.synergyTimer = 0.01;
      w.step(DT, new Map());
      const kind = w.bond?.kind;
      if (!kind || seen.has(kind)) continue;
      for (let i = 0; i < Math.ceil(SYNERGY_WINDUP / DT) + 3 && w.bond; i++) w.step(DT, new Map());
      const partner = w.bosses.find((b) =>
        b.buffs.some((bf) => bf.source === 'packEmpower' || bf.source === 'packWard'),
      )!;
      const buff = partner.buffs.find(
        (bf) => bf.source === 'packEmpower' || bf.source === 'packWard',
      )!;
      if (kind === 'empower') {
        expect(buff.kind).toBe('damageDealt'); // partner hits harder
        expect(buff.mult).toBeCloseTo(SYNERGY_EMPOWER_MULT);
      } else {
        expect(buff.kind).toBe('damageTaken'); // partner takes less
        expect(buff.mult).toBeCloseTo(SYNERGY_WARD_MULT);
      }
      seen.add(kind);
    }
    expect(seen).toEqual(new Set(['empower', 'ward']));
  });

  it('the combo only resolves while BOTH bosses live — killing one cancels it', () => {
    const w = twin();
    w.synergyTimer = 0.01;
    w.step(DT, new Map());
    expect(w.bond).not.toBeNull();

    // Fell the partner mid wind-up.
    const partner = w.bosses.find((b) => b.id === w.bond!.partnerId)!;
    partner.hp = 0;
    w.step(DT, new Map());

    expect(w.bond).toBeNull(); // fizzled
    const anyPackBuff = w.bosses.some((b) =>
      b.buffs.some((bf) => bf.source === 'packEmpower' || bf.source === 'packWard'),
    );
    expect(anyPackBuff).toBe(false); // no gift was ever granted
  });

  it('the bond gift is seeded — the same seed picks the same empower/ward', () => {
    const pick = (seed: number): string | undefined => {
      const w = twin(seed);
      w.synergyTimer = 0.01;
      w.step(DT, new Map());
      return w.bond?.kind;
    };
    expect(pick(4)).toBe(pick(4));
    expect(pick(4)).toBe(pick(4));
    expect(['empower', 'ward']).toContain(pick(4));
  });
});

// ---------------------------------------------------------------------------
// 4. New per-boss signature abilities
// ---------------------------------------------------------------------------

describe('signatures: new per-boss abilities', () => {
  it("the Kraken's tentacle grab HAULS a distant hero toward the leviathan", () => {
    const w = mkWorld('kraken', 'ranger');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 300 };
    p.pos = { x: 800, y: 600 }; // 300u below the kraken
    const ab = abilityById(getMonster('kraken'), 'tentacleGrab')!;
    expect(ab.pull).toBeGreaterThan(0);
    const before = dist(p.pos, boss.pos);
    resolveBossAbility(
      w,
      boss,
      ab,
      mkAction({ abilityId: 'tentacleGrab', targetId: p.id, targetPos: { ...p.pos } }),
    );
    const after = dist(p.pos, boss.pos);
    expect(after).toBeLessThan(before); // grabbed and dragged inward
    expect(before - after).toBeCloseTo(ab.pull!, 0); // pulled ~the grab distance
    expect(hasBuff(p, 'moveSpeed')).toBe(true); // and left clinging in the slow
  });

  it("the Beholder's disintegration ray silences (anti-magic variety)", () => {
    const ab = abilityById(getMonster('beholder'), 'disintegrate')!;
    expect(ab.silence).toBeGreaterThan(0);
    const w = mkWorld('beholder', 'mage');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 300 };
    p.pos = { x: 800, y: 400 };
    resolveBossAbility(
      w,
      boss,
      ab,
      mkAction({ abilityId: 'disintegrate', targetId: p.id, targetPos: { ...p.pos } }),
    );
    expect(hasBuff(p, 'silence')).toBe(true);
  });

  it('the Death Knight can drain a soul to heal itself (lifedrain theme)', () => {
    const ab = abilityById(getMonster('deathknight'), 'soulHarvest')!;
    expect(ab.shape).toBe('beam');
    expect(ab.healSelf).toBe(true);
    const w = mkWorld('deathknight', 'knight');
    const boss = w.boss!;
    const p = w.players[0];
    boss.hp = boss.maxHp * 0.5;
    boss.pos = { x: 800, y: 300 };
    p.pos = { x: 800, y: 400 }; // in beam range
    const before = boss.hp;
    beamTick(w, boss, ab, mkAction({ kind: 'channel', abilityId: 'soulHarvest', targetId: p.id }));
    expect(boss.hp).toBeGreaterThan(before); // knit its undeath back together
    expect(p.hp).toBeLessThan(p.maxHp); // at the hero's expense
  });

  it('the Death Knight reaches for Soul Harvest when wounded, with a target', () => {
    const dk = getMonster('deathknight');
    const choice = dk.decide({
      boss: { cooldowns: {} } as never,
      hpFrac: 0.5,
      target: { id: 1 } as never,
      distToTarget: 300,
      anyInMelee: false,
      usable: (id) => id === 'soulHarvest',
      rng: { next: () => 0.5 } as never,
    });
    expect(choice).toBe('soulHarvest');
  });
});

// ---------------------------------------------------------------------------
// 5. Standable SILENCE zones (item 28 follow-up, issue #33)
//    An antimagic pool is a zone you can stand IN — casters caught inside are
//    silenced tick-by-tick (the 🔇 buff is the HUD cue), not merely on-hit.
// ---------------------------------------------------------------------------

describe('signatures: standable antimagic silence zones', () => {
  /** A boss-side antimagic silence pool centred on `pos` (harmless damage so a
   * test fight can't end mid-way). Uses the real spawnZone construction. */
  function silencePool(w: World, pos: { x: number; y: number }): void {
    spawnZone(w, {
      kind: 'antimagic',
      pos: { ...pos },
      radius: 120,
      side: 'boss',
      ownerId: w.boss!.id,
      damagePerTick: 0,
      healPerTick: 0,
      silence: 1.5,
      duration: 12,
    });
  }

  it("the Beholder's Antimagic Pools spawn as silencing antimagic zones", () => {
    const ab = abilityById(getMonster('beholder'), 'antimagic')!;
    expect(ab.zoneKind).toBe('antimagic');
    expect(ab.zoneSilence).toBeGreaterThan(0);
    const w = mkWorld('beholder', 'mage');
    w.groundZones = [];
    resolveBossAbility(w, w.boss!, ab, mkAction());
    expect(w.groundZones.length).toBeGreaterThanOrEqual(1);
    for (const z of w.groundZones) {
      expect(z.kind).toBe('antimagic'); // a standable silence pool, not a plain void
      expect(z.silence ?? 0).toBeGreaterThan(0);
    }
  });

  it("the Mind Flayer's Psychic Rift also tears open a standable silence zone", () => {
    const ab = abilityById(getMonster('mindflayer'), 'psychicRift')!;
    expect(ab.zoneKind).toBe('antimagic');
    expect(ab.zoneSilence).toBeGreaterThan(0);
    const w = mkWorld('mindflayer', 'mage');
    w.groundZones = [];
    resolveBossAbility(w, w.boss!, ab, mkAction());
    expect(w.groundZones.every((z) => z.kind === 'antimagic' && (z.silence ?? 0) > 0)).toBe(true);
  });

  it('standing in the pool silences the caster on the zone tick (HUD cue), sparing those outside', () => {
    // The dragon does not act within this short window (first decision 1.2s away),
    // so the only effect on the party is our controlled pool.
    const w = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [
        { peerId: 'a', name: 'A', classId: 'mage' },
        { peerId: 'b', name: 'B', classId: 'mage' },
      ],
    });
    w.terrain = [];
    w.obstacles = [];
    const [inside, outside] = w.players;
    inside.pos = { x: 800, y: 500 };
    outside.pos = { x: 150, y: 150 };
    silencePool(w, inside.pos);

    expect(hasBuff(inside, 'silence')).toBe(false); // nothing until the pool ticks
    for (let t = 0; t < 0.6; t += DT) w.step(DT, idle(w)); // one ZONE_TICK_INTERVAL elapses
    expect(hasBuff(inside, 'silence')).toBe(true); // 🔇 — hushed by the pool (the HUD cue)
    expect(hasBuff(outside, 'silence')).toBe(false); // the pool only reaches who stands in it

    // A special can't fire while the pool hushes the caster (rising edge, still inside).
    inside.prevButtons = buttons();
    w.step(
      DT,
      new Map([
        ['a', inp({ buttons: buttons({ a1: true }) })],
        ['b', inp()],
      ]),
    );
    expect(inside.cooldowns.a1).toBe(0); // silenced → the special never went off
  });

  it('stepping out of the pool lets the silence lapse — the caster casts again', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [{ peerId: 'a', name: 'A', classId: 'mage' }],
    });
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    p.pos = { x: 800, y: 500 };
    silencePool(w, p.pos);
    for (let t = 0; t < 0.6; t += DT) w.step(DT, idle(w));
    expect(hasBuff(p, 'silence')).toBe(true);

    // Walk clear of the pool; with no tick to refresh it, the silence expires.
    p.pos = { x: 150, y: 150 };
    for (let t = 0; t < 2.0; t += DT) w.step(DT, idle(w));
    expect(hasBuff(p, 'silence')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. More per-boss signatures (item 28 follow-up): a real Death Grip pull, the
//    Lich's grasping void, and death-magic / fae silences.
// ---------------------------------------------------------------------------

describe('signatures: deepened Hard-tier boss kits', () => {
  it("the Death Knight's Death Grip is a true PULL that yanks a kiting hero in", () => {
    const ab = abilityById(getMonster('deathknight'), 'deathGrip')!;
    expect(ab.shape).toBe('circleAtTarget'); // a ranged yank, not a shove-charge
    expect(ab.pull).toBeGreaterThan(0);
    expect(ab.knockback ?? 0).toBe(0); // a pull, never a knockback
    const w = mkWorld('deathknight', 'ranger');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 300 };
    p.pos = { x: 800, y: 640 }; // kiting at range
    const before = dist(p.pos, boss.pos);
    resolveBossAbility(
      w,
      boss,
      ab,
      mkAction({ abilityId: 'deathGrip', targetId: p.id, targetPos: { ...p.pos } }),
    );
    const after = dist(p.pos, boss.pos);
    expect(after).toBeLessThan(before); // hauled toward the champion
    expect(before - after).toBeCloseTo(ab.pull!, 0);
    expect(hasBuff(p, 'moveSpeed')).toBe(true); // left dazed in the grip
  });

  it("the Lich's Void Zone is a heavy grasping snare that mires a hero standing in it", () => {
    const ab = abilityById(getMonster('lich'), 'voidZone')!;
    expect(ab.slowMult ?? 1).toBeLessThanOrEqual(0.35); // clutching dead — a hard snare
    const w = mkWorld('lich', 'knight');
    w.terrain = [];
    w.obstacles = [];
    w.groundZones = [];
    // Spawn the lich's actual void, then drop a hero into it and tick.
    resolveBossAbility(w, w.boss!, ab, mkAction({ targetId: w.players[0].id }));
    const z = w.groundZones[0];
    expect(z.slowMult).toBeLessThanOrEqual(0.35);
    const p = w.players[0];
    p.pos = { ...z.pos };
    for (let t = 0; t < 0.6; t += DT) w.step(DT, idle(w));
    const mire = p.buffs.find((b) => b.source === 'zoneSlow');
    expect(mire).toBeTruthy();
    expect(mire!.mult).toBeLessThanOrEqual(0.35);
  });

  it("the Archlich's Necrotic Burst snuffs magic (a desperation silence)", () => {
    const ab = abilityById(getMonster('archlich'), 'necroBurst')!;
    expect(ab.silence).toBeGreaterThan(0);
    const w = mkWorld('archlich', 'mage');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 500 };
    p.pos = { x: 800, y: 560 }; // inside the necrotic nova
    resolveBossAbility(w, boss, ab, mkAction({ abilityId: 'necroBurst' }));
    expect(hasBuff(p, 'silence')).toBe(true);
  });

  it("the Archfae's Bewilder leaves a hero too bewildered to cast (a silence)", () => {
    const ab = abilityById(getMonster('fae'), 'charm')!;
    expect(ab.silence).toBeGreaterThan(0);
    const w = mkWorld('fae', 'mage');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 300 };
    p.pos = { x: 800, y: 400 };
    resolveBossAbility(
      w,
      boss,
      ab,
      mkAction({ abilityId: 'charm', targetId: p.id, targetPos: { ...p.pos } }),
    );
    expect(hasBuff(p, 'silence')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Broadened signature terrains (item 28 follow-up): the vampire's blood-mire
//    and the demon's brimstone, each a themed home arena that SURGES.
// ---------------------------------------------------------------------------

describe('signatures: broadened signature terrains', () => {
  /** A two-player world with no boss/terrain so a surge can be studied in isolation. */
  function terrainWorld(): World {
    const w = new World({
      monsterId: 'dragon',
      seed: 9,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
      ],
    });
    w.boss = null;
    w.terrain = [];
    return w;
  }

  function surgePatch(w: World, kind: 'bloodmire' | 'brimstone'): void {
    w.terrain = [
      {
        id: w.allocId(),
        kind,
        pos: { x: 800, y: 500 },
        radius: 200,
        damagePerTick: 0,
        slowMult: 1,
        slowDuration: 0,
        tickAccum: 0,
        surgeAccum: TERRAIN_SURGE_INTERVAL, // due to surge on the next tick
      },
    ];
  }

  it('a blood-mire patch surges with a non-lethal pull (the mire drags you in)', () => {
    const w = terrainWorld();
    surgePatch(w, 'bloodmire');
    w.step(DT, idle(w));
    const surge = w.pendingStrikes.find((s) => s.pull != null);
    expect(surge).toBeTruthy();
    expect(surge!.pull!.strength).toBeGreaterThan(0);
    expect(surge!.pull!.lethalRadius).toBe(0); // hauls you deeper, never plunges
  });

  it('a brimstone patch surges with a non-lethal pull (the fissure sucks you toward the vent)', () => {
    const w = terrainWorld();
    surgePatch(w, 'brimstone');
    w.step(DT, idle(w));
    const surge = w.pendingStrikes.find((s) => s.pull != null);
    expect(surge).toBeTruthy();
    expect(surge!.pull!.strength).toBeGreaterThan(0);
    expect(surge!.pull!.lethalRadius).toBe(0);
  });

  it("the Vampire's arena themes to blood-mire; the Demon's to brimstone", () => {
    let sawBloodmire = false;
    let sawBrimstone = false;
    for (let seed = 1; seed <= 30; seed++) {
      for (const p of generateTerrain('vampire', seed * 7, counter())) {
        if (p.kind === 'bloodmire') sawBloodmire = true;
      }
      for (const p of generateTerrain('demon', seed * 7, counter())) {
        if (p.kind === 'brimstone') sawBrimstone = true;
      }
    }
    expect(sawBloodmire).toBe(true);
    expect(sawBrimstone).toBe(true);
  });

  it('the new signature terrains are members of the exported signature set', () => {
    expect(SIGNATURE_TERRAINS.has('bloodmire')).toBe(true);
    expect(SIGNATURE_TERRAINS.has('brimstone')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Breadth target (issue #33 acceptance): EVERY Hard-tier boss now reads as
//    distinctive — carrying a pull, a silence (on-hit or standable zone), a
//    heavy control snare, or a signature home terrain — not the generic toolkit.
// ---------------------------------------------------------------------------

describe('signatures: breadth target — every Hard-tier boss is distinctive', () => {
  const SIGNATURE_SLOW = 0.35; // a slow at/under this reads as a hard control snare/freeze

  /** A flashy "marquee" marker: a pull, any silence, or a signature home terrain. */
  function marqueeMarker(id: MonsterId): boolean {
    const abil = getMonster(id).abilities.some(
      (a) => (a.pull ?? 0) > 0 || (a.silence ?? 0) > 0 || (a.zoneSilence ?? 0) > 0,
    );
    return abil || themeFor([id]).some((k) => SIGNATURE_TERRAINS.has(k));
  }

  /** Any distinctive signature, including a heavy control snare/freeze. */
  function hasSignature(id: MonsterId): boolean {
    if (marqueeMarker(id)) return true;
    return getMonster(id).abilities.some((a) => (a.slowMult ?? 1) <= SIGNATURE_SLOW);
  }

  it('every Hard-tier boss carries at least one distinctive signature', () => {
    for (const id of MONSTERS_BY_TIER.hard) {
      expect(hasSignature(id), `${id} has no distinctive signature`).toBe(true);
    }
  });

  it('the hard tier is broad and mostly carries a marquee (pull / silence / signature-terrain) marker', () => {
    expect(MONSTERS_BY_TIER.hard.length).toBeGreaterThanOrEqual(10);
    const marquee = MONSTERS_BY_TIER.hard.filter(marqueeMarker);
    // Up from ~3 hard-tier bosses (kraken, beholder, mind flayer) before this round.
    expect(marquee.length).toBeGreaterThanOrEqual(8);
  });
});
