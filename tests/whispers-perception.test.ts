import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility, resolveBossAbility } from '../src/engine/combat/abilities';
import { damageBoss, damageAdd, makeBuff } from '../src/engine/combat/combat';
import { healSupportAlly } from '../src/engine/combat/support';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import { buffView } from '../src/engine/core/buffView';
import { damageEcho } from '../src/engine/combat/combat';
import { Graphics } from 'pixi.js';
import { drawApparition, drawBorrowedAlly } from '../src/render/pipeline/perceptionVisuals';
import { SnapshotInterpolator } from '../src/render/pipeline/interpolate';
import { setSubclassPassive } from '../src/engine/combat/subclassPassives';
import {
  apparitionViews,
  onWhisperHit,
  spendSecret,
  stepFear,
  tickWhispers,
  whisperCast,
  stepCharmedAdd,
  takeQuarry,
  moveToQuarry,
} from '../src/engine/combat/whispers';
import { getSubSkill } from '../src/engine/content/subclasses';
import {
  decompose,
  recompose,
  componentValue,
  describeComposed,
  setForgeSeed,
  synthesizeAbility,
  refreshComponents,
} from '../src/engine/content/forge';
import { previewSubAbility } from '../src/engine/content/charUpgrades';
import type { Add, Boss, GroundZone, Player, Projectile, Vec2 } from '../src/engine/core/types';
import type { BossAbilityDef, MonsterDef } from '../src/engine/content/monsters';

const zero = { x: 0, y: 0 };
function setup(
  skill = 'ba_whispers_wound',
  history: string[] = [],
  monsterId: 'troll' | 'lich' | 'dummy' = 'troll',
) {
  const w = new World({
    monsterId,
    seed: 31,
    players: [
      { peerId: 'a', name: 'A', classId: 'bard', subSkills: [skill], charUpgrades: history },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    b = w.boss!;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  b.pos = { x: 680, y: 400 };
  b.hp = b.maxHp = 10000;
  b.decisionTimer = 999;
  b.regen = 0;
  b.action.kind = 'idle';
  return { w, p, b };
}
function internals(w: World) {
  return w as unknown as {
    resolvePlayerProjectile(p: Projectile): boolean;
    applyZoneTick(z: GroundZone): void;
    startBossAbility(b: Boss, def: MonsterDef, ab: BossAbilityDef, target: Player | null): void;
    bossDecide(b: Boss, def: MonsterDef, target: Player | null): void;
    bossExecute(b: Boss, def: MonsterDef): void;
    updateAdds(dt: number): void;
  };
}
function shoot(w: World, p: Player, b: Boss | Add, slot: 'basic' | 'sub1' = 'basic') {
  resolvePlayerAbility(w, p, slot, zero);
  const shot = w.projectiles.at(-1)!;
  shot.pos = { ...b.pos };
  internals(w).resolvePlayerProjectile(shot);
}
function learn(w: World, p: Player, b: Boss) {
  shoot(w, p, b);
  expect(p.whisperSecret?.targetId).toBe(b.id);
}
function add(w: World, pos: Vec2): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { ...pos },
    hp: 300,
    maxHp: 300,
    radius: 12,
    moveSpeed: 100,
    attackCd: 0,
    targetId: null,
    buffs: [],
  };
  w.adds.push(a);
  return a;
}
const bolt: BossAbilityDef = {
  id: 'test',
  name: 'Test bolt',
  shape: 'projectile',
  windup: 0.5,
  cooldown: 10,
  damage: 20,
  projSpeed: 300,
};
afterEach(() => setForgeSeed(null));

describe('Whispers secrets through real casts', () => {
  it('learns from a connecting basic, preserves the mark through held basics and spends a later Discord hit', () => {
    const { w, p, b } = setup();
    learn(w, p, b);
    shoot(w, p, b);
    expect(b.perception).toBeUndefined();
    shoot(w, p, b, 'sub1');
    expect(b.perception?.mode).toBe('fear');
    expect(p.whisperSecret).toBeUndefined();
    expect(p.whisperRecovery).toBe(8);
    const x = b.pos.x;
    w.step(0.1, new Map());
    expect(b.pos.x).toBeGreaterThan(x);
    expect(w.serialize().apparitions?.[0].pos).toEqual({ x: 600, y: 400 });
  });
  it('cannot learn and spend from one multishot cast, nor from misses, immunity or zero damage', () => {
    const { w, p, b } = setup();
    p.subAbilities!.sub1!.projCount = 3;
    resolvePlayerAbility(w, p, 'sub1', zero);
    for (const shot of [...w.projectiles]) {
      shot.pos = { ...b.pos };
      internals(w).resolvePlayerProjectile(shot);
    }
    expect(p.whisperSecret?.targetId).toBe(b.id);
    expect(b.perception).toBeUndefined();
    p.whisperSecret = undefined;
    b.buffs.push(makeBuff('invuln', 0, 2, 'test'));
    shoot(w, p, b);
    expect(p.whisperSecret).toBeUndefined();
    onWhisperHit(w, p, b, 0);
    expect(p.whisperSecret).toBeUndefined();
  });
  it.each([false, true])(
    'full-health Harmony heals peel without healing score or a fabricated verse, composed=%s',
    (composed) => {
      const { w, p, b } = setup('ba_whispers_song');
      learn(w, p, b);
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
      resolvePlayerAbility(w, p, 'sub1', zero);
      expect(b.perception?.pos).toEqual(p.pos);
      expect(p.stats.healingDone).toBe(0);
      expect(p.buffs.some((x) => x.kind === 'harmony')).toBe(false);
    },
  );
  it.each([false, true])(
    'Mantle keeps the accepted verse-powered afterimage alongside its secret, composed=%s',
    (composed) => {
      const { w, p, b } = setup('ba_whispers_mantle', ['ba_whispers_mantle_g']);
      learn(w, p, b);
      const origin = { ...p.pos };
      p.hp -= 30;
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
      p.buffs.push(
        makeBuff('harmony', 0, 8, 'bardHarmony'),
        makeBuff('discord', 0, 8, 'bardDiscord'),
      );
      resolvePlayerAbility(w, p, 'sub1', zero);
      expect(p.pos.x).toBeGreaterThan(origin.x);
      expect(b.perception?.pos).toEqual(origin);
      expect(p.buffs.some((x) => x.kind === 'invuln')).toBe(true);
      expect(p.hp).toBe(p.maxHp - 30);
      expect(p.buffs.find((x) => x.kind === 'whisperRefrain')).toMatchObject({
        mult: 4,
        whisperRefrainState: { anchor: origin },
      });
    },
  );
  it.each([false, true])(
    'Words spends on its first positive field hit and never rearms on ticks, composed=%s',
    (composed) => {
      const { w, p, b } = setup('ba_whispers_words');
      learn(w, p, b);
      b.pos = { x: 1060, y: 400 };
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
      resolvePlayerAbility(w, p, 'sub1', zero);
      const z = w.groundZones.at(-1)!;
      z.armRemaining = 0;
      internals(w).applyZoneTick(z);
      expect(b.perception?.pos).toEqual(z.pos);
      expect(p.whisperSecret).toBeUndefined();
      b.perception = undefined;
      internals(w).applyZoneTick(z);
      expect(b.perception).toBeUndefined();
    },
  );
  it('can learn from an actual damaging field in a kit without a direct basic', () => {
    const { w, p, b } = setup('ba_whispers_words');
    b.pos = { x: 1060, y: 400 };
    resolvePlayerAbility(w, p, 'sub1', zero);
    const z = w.groundZones.at(-1)!;
    z.armRemaining = 0;
    internals(w).applyZoneTick(z);
    internals(w).applyZoneTick(z);
    expect(p.whisperSecret?.targetId).toBe(b.id);
    expect(b.perception).toBeUndefined();
    resolvePlayerAbility(w, p, 'a2', zero);
    expect(b.perception?.mode).toBe('fear');
  });
  it('ordinary healing and Shared Refrain still relay without the removed passive echo', () => {
    const { w, p } = setup('ba_whispers_song', ['ba_whispers_song_g']);
    const ally = structuredClone(p);
    ally.id = w.allocId();
    ally.pos.x += 20;
    ally.hp -= 90;
    w.players.push(ally);
    p.hp -= 100;
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(p.hp).toBe(p.maxHp - 20);
    expect(ally.hp).toBeCloseTo(ally.maxHp - 58);
    expect(p.buffs.some((x) => x.kind === 'refrainEcho')).toBe(false);
  });
});

describe('actual fear and targeting decisions', () => {
  it('forces a ranged boss out of comfortable range and suppresses its automatic blink', () => {
    const { w, p, b } = setup('ba_whispers_song', [], 'lich');
    learn(w, p, b);
    b.blinkTimer = 0;
    resolvePlayerAbility(w, p, 'sub1', zero);
    const x = b.pos.x;
    w.step(0.1, new Map());
    expect(b.pos.x).toBeGreaterThan(x);
    expect(b.pos.x - x).toBeLessThanOrEqual(13);
    expect(w.events.some((e) => e.t === 'blink' && e.id === b.id)).toBe(false);
  });
  it('finishes an already committed windup before retreating, without rotating its target', () => {
    const { w, p, b } = setup();
    internals(w).startBossAbility(b, w.defOf(b), bolt, p);
    const aim = b.action.aimAngle,
      target = { ...b.action.targetPos! };
    learn(w, p, b);
    resolvePlayerAbility(w, p, 'a2', zero);
    const before = { ...b.pos };
    w.step(0.1, new Map());
    expect(b.pos).toEqual(before);
    expect(b.action.aimAngle).toBe(aim);
    expect(b.action.targetPos).toEqual(target);
    b.action.kind = 'recover';
    w.step(0.1, new Map());
    expect(b.pos.x).toBeGreaterThan(before.x);
  });
  it.each(['root', 'taunt', 'dummy'] as const)(
    '%s rejects fear without spending the secret',
    (kind) => {
      const { w, p, b } = setup('ba_whispers_song', [], kind === 'dummy' ? 'dummy' : 'troll');
      learn(w, p, b);
      if (kind === 'root') b.buffs.push(makeBuff('root', 0, 2, 'test'));
      if (kind === 'taunt') {
        w.tauntTimer = 2;
        w.tauntTargetId = p.id;
      }
      resolvePlayerAbility(w, p, 'sub1', zero);
      expect(b.perception).toBeUndefined();
      expect(p.whisperSecret?.targetId).toBe(b.id);
    },
  );
  it('bounds travel and cannot wrap or tunnel through a pillar', () => {
    const { w, p, b } = setup();
    learn(w, p, b);
    resolvePlayerAbility(w, p, 'a2', zero);
    const from = { ...b.pos };
    for (let i = 0; i < 120; i++) stepFear(w, b, 1 / 60);
    expect(Math.hypot(b.pos.x - from.x, b.pos.y - from.y)).toBeLessThanOrEqual(163);
    b.perceptionRecovery = 0;
    p.whisperRecovery = 0;
    b.pos = { x: w.arena.w - b.radius - 1, y: 400 };
    onWhisperHit(w, p, b, 1);
    p.pos = { x: b.pos.x - 50, y: 400 };
    spendSecret(w, p, whisperCast(w, p, p.abilities!.a2), p.pos);
    stepFear(w, b, 0.1);
    expect(b.pos.x).toBeLessThanOrEqual(w.arena.w - b.radius);
  });
  it('directed identity changes the retreat side instead of adding damage or duration', () => {
    const { w, p, b } = setup('ba_whispers_song', ['ba_whispers_g_a']);
    learn(w, p, b);
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(b.perception?.pos.x).toBe(b.pos.x + 100);
    expect(b.perception?.remaining).toBe(1.4);
    const x = b.pos.x;
    stepFear(w, b, 0.1);
    expect(b.pos.x).toBeLessThan(x);
  });
  it('a decoy freezes an actual random-target projectile aim through release', () => {
    const { w, p, b } = setup('ba_whispers_mantle', ['ba_whispers_g_b']);
    learn(w, p, b);
    const origin = { ...p.pos };
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(b.perception?.mode).toBe('lure');
    internals(w).startBossAbility(b, w.defOf(b), { ...bolt, targetRandom: true }, p);
    expect(b.action.illusionPos).toEqual(origin);
    expect(b.action.targetId).toBeNull();
    p.pos = { x: 1000, y: 600 };
    resolveBossAbility(w, b, bolt, b.action);
    const shot = w.projectiles.at(-1)!;
    expect(shot.vel.x).toBeLessThan(0);
    expect(Math.abs(shot.vel.y)).toBeLessThan(0.001);
    expect(apparitionViews(w).some((x) => x.mode === 'lure')).toBe(true);
  });
  it.each(['cone', 'circleAtTarget', 'line', 'beam'] as const)(
    'decoys redirect a newly committed %s while preserving geometry',
    (shape) => {
      const { w, p, b } = setup('ba_whispers_song', ['ba_whispers_g_b']);
      learn(w, p, b);
      resolvePlayerAbility(w, p, 'sub1', zero);
      const origin = { ...p.pos };
      internals(w).startBossAbility(b, w.defOf(b), { ...bolt, shape, range: 50 }, p);
      expect(b.action.illusionPos).toEqual(origin);
      expect(b.action.targetId).toBeNull();
      if (shape === 'line')
        expect(
          Math.hypot(b.action.targetPos!.x - b.pos.x, b.action.targetPos!.y - b.pos.y),
        ).toBeCloseTo(50);
    },
  );
  it('does not consume a quarry on an untargeted nova or while taunted', () => {
    const { w, p, b } = setup('ba_whispers_song', ['ba_whispers_g_b']);
    learn(w, p, b);
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(takeQuarry(w, b, 'pbaoe')).toBeUndefined();
    expect(b.perception).toBeDefined();
    w.tauntTimer = 1;
    expect(takeQuarry(w, b, 'projectile')).toBeUndefined();
  });
  it('multiple Bards cannot overwrite another perception or consume each other’s secret', () => {
    const { w, p, b } = setup();
    learn(w, p, b);
    const other = structuredClone(p);
    other.id = w.allocId();
    other.peerId = 'b';
    w.players.push(other);
    resolvePlayerAbility(w, p, 'a2', zero);
    resolvePlayerAbility(w, other, 'a2', zero);
    expect(b.perception?.ownerId).toBe(p.id);
    expect(other.whisperSecret?.targetId).toBe(b.id);
  });
  it('cleans dead targets, owner downing and class swaps while retaining recovery', () => {
    const { w, p, b } = setup();
    learn(w, p, b);
    resolvePlayerAbility(w, p, 'a2', zero);
    p.state = 'downed';
    tickWhispers(w, 0.1);
    expect(b.perception).toBeUndefined();
    p.state = 'alive';
    setSubclassPassive(p, undefined);
    tickWhispers(w, 1);
    expect(p.whisperRecovery).toBeCloseTo(6.9);
    p.whisperSecret = { targetId: b.id, remaining: 2 };
    tickWhispers(w, 0);
    expect(p.whisperSecret).toBeUndefined();
  });
});

describe('bounded add conversion and genuine payloads', () => {
  it.each([false, true])(
    'Words grand charms at most one add, leaves bosses hostile, and allies do not absorb player shots, composed=%s',
    (composed) => {
      const { w, p, b } = setup('ba_whispers_words', ['ba_whispers_words_g']);
      b.pos = { x: 1060, y: 400 };
      const first = add(w, { x: 1050, y: 410 }),
        second = add(w, { x: 1060, y: 420 });
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
      resolvePlayerAbility(w, p, 'sub1', zero);
      const z = w.groundZones.at(-1)!;
      z.armRemaining = 0;
      internals(w).applyZoneTick(z);
      internals(w).applyZoneTick(z);
      expect(first.charm?.ownerId).toBe(p.id);
      expect(second.charm).toBeUndefined();
      expect('charm' in b).toBe(false);
      const hp = first.hp;
      damageAdd(w, p, first, 500, { direct: true });
      expect(first.hp).toBe(hp);
      b.pos.x = 1200;
      second.pos.x = 1250;
      resolvePlayerAbility(w, p, 'basic', zero);
      const shot = w.projectiles.at(-1)!;
      shot.pos = { ...first.pos };
      expect(internals(w).resolvePlayerProjectile(shot)).toBe(false);
      tickWhispers(w, 4.1);
      expect(first.charm).toBeUndefined();
    },
  );
  it('borrowed attacks damage former allies with attribution but no owner damage multiplier or passive recursion', () => {
    const { w, p, b } = setup();
    const ally = add(w, { x: b.pos.x - b.radius - 15, y: b.pos.y });
    ally.charm = { ownerId: p.id, ownerClass: p.classId, remaining: 4 };
    p.damageMult = 100;
    const before = b.hp;
    stepCharmedAdd(w, ally, 0.1);
    expect(before - b.hp).toBe(10);
    expect(p.stats.damageDealt).toBe(10);
    expect(p.whisperSecret).toBeUndefined();
    const foe = add(w, { x: ally.pos.x - 10, y: ally.pos.y });
    b.pos.x += 400;
    ally.attackCd = 0;
    stepCharmedAdd(w, ally, 0.1);
    expect(foe.hp).toBe(290);
    p.state = 'downed';
    tickWhispers(w, 0.1);
    expect(ally.charm).toBeUndefined();
  });
  it('charmed adds chase hostiles rather than their nearest living player', () => {
    const { w, p, b } = setup();
    const a = add(w, { x: 900, y: 400 });
    a.charm = { ownerId: p.id, ownerClass: p.classId, remaining: 4 };
    b.pos.x = 1150;
    const x = a.pos.x;
    internals(w).updateAdds(0.1);
    expect(a.pos.x).toBeGreaterThan(x);
  });
  it('copies carry a priced, described charm component without granting the passive', () => {
    const grand = previewSubAbility('ba_whispers_words', ['ba_whispers_words_g'])!;
    const parts = decompose(grand);
    expect(parts.effects.some((x) => x.kind === 'apparition')).toBe(true);
    const without = { ...parts, effects: parts.effects.filter((x) => x.kind !== 'apparition') };
    expect(componentValue(parts)).toBeGreaterThan(componentValue(without));
    expect(describeComposed(parts, grand.cooldown)).toContain('former allies');
    const { w, p } = setup();
    setSubclassPassive(p, undefined);
    p.subAbilities!.sub1 = recompose(parts, { ...grand, slot: 'sub1' });
    const a = add(w, { x: 1060, y: 400 });
    resolvePlayerAbility(w, p, 'sub1', zero);
    const z = w.groundZones.at(-1)!;
    z.armRemaining = 0;
    internals(w).applyZoneTick(z);
    expect(a.charm).toBeDefined();
    expect(p.subclassPassiveId).toBeUndefined();
  });
  it.each([7, 29])(
    'actual Forge seed %s retains only budgeted components with native and copied fallback',
    (seed) => {
      setForgeSeed(seed);
      const { w, p, b } = setup('ba_whispers_song', ['ba_whispers_g_b']);
      damageBoss(w, p, b, 1, { direct: true });
      // A retained Harmony heal can spend even when its recipient is healthy.
      const ab = { ...getSubSkill('ba_whispers_song')!.ability, slot: 'sub1' as const };
      ab.whisperCast = whisperCast(w, p, ab);
      healSupportAlly(w, p, p, ab.damage, ab);
      expect(b.perception?.mode).toBe(ab.bardSong === 'harmony' ? 'lure' : undefined);
      expect(JSON.stringify(p.abilities)).not.toContain('NaN');
    },
  );
});

describe('perception ownership, recovery and obstruction contracts', () => {
  it('the actual boss decision sees a nearby false quarry in melee while real players are distant', () => {
    const { w, p, b } = setup('ba_whispers_mantle', ['ba_whispers_g_b']);
    learn(w, p, b);
    resolvePlayerAbility(w, p, 'sub1', zero);
    p.pos = { x: 1100, y: 700 };
    b.decisionTimer = 999;
    b.pos.x = 900;
    const x = b.pos.x;
    w.step(0.01, new Map());
    expect(b.pos.x).toBeLessThan(x);
    b.pos.x = 600 + w.defOf(b).meleeRange * 0.5;
    const def: MonsterDef = {
      ...w.defOf(b),
      abilities: [bolt],
      decide: (ctx) => {
        expect(ctx.anyInMelee).toBe(true);
        expect(ctx.distToTarget).toBeLessThan(100);
        return bolt.id;
      },
    };
    internals(w).bossDecide(b, def, p);
    expect(b.action.illusionPos).toEqual({ x: 600, y: 400 });
  });
  it.each(['fear', 'lure'] as const)(
    'publishes and draws %s anchors on peers without mutating snapshots',
    (mode) => {
      const { w, p, b } = setup('ba_whispers_song', mode === 'lure' ? ['ba_whispers_g_b'] : []);
      learn(w, p, b);
      resolvePlayerAbility(w, p, 'sub1', zero);
      tickWhispers(w, 0);
      expect(b.buffs.find((x) => x.kind === 'nightmare')?.mult).toBe(mode === 'fear' ? 1 : 2);
      const snap = w.serialize(),
        interp = new SnapshotInterpolator();
      interp.push(snap);
      const rendered = interp.sample(performance.now() + 1000, {
        localPlayerId: p.id,
        arena: w.arena,
      })!;
      expect(rendered.apparitions).toEqual(snap.apparitions);
      rendered.apparitions![0].pos.x += 10;
      expect(snap.apparitions![0].pos.x).not.toBe(rendered.apparitions![0].pos.x);
      const g = new Graphics();
      drawApparition(g, snap.apparitions![0], zero, b.pos, 1);
      drawApparition(g, { ...snap.apparitions![0], pending: false }, zero, undefined, 0.5);
      expect(g.context.instructions.length).toBeGreaterThan(5);
      drawBorrowedAlly(g, zero, 0.5);
      g.destroy();
    },
  );
  it('clears a learned mark when its victim becomes an ally', () => {
    const { w, p, b } = setup();
    b.pos.x = 1200;
    const a = add(w, { x: 650, y: 400 });
    shoot(w, p, a);
    a.charm = { ownerId: p.id, ownerClass: p.classId, remaining: 2 };
    tickWhispers(w, 0);
    expect(p.whisperSecret).toBeUndefined();
  });
  it('a quarry is pursued when distant and a stable tie picks the same hostile for a converted add', () => {
    const { w, p, b } = setup('ba_whispers_song', ['ba_whispers_g_b']);
    learn(w, p, b);
    resolvePlayerAbility(w, p, 'sub1', zero);
    b.pos.x = 1000;
    moveToQuarry(w, b, 0.1);
    expect(b.pos.x).toBeLessThan(1000);
    const ally = add(w, { x: 900, y: 400 });
    ally.charm = { ownerId: p.id, ownerClass: p.classId, remaining: 2 };
    b.pos = { x: 1000, y: 400 };
    add(w, { x: 800, y: 400 });
    stepCharmedAdd(w, ally, 0.1);
    expect(ally.pos.x).toBeGreaterThan(900);
  });
  it('real synthesis prices and caps retained conversion rather than carrying an off-budget flat flag', () => {
    const grand = previewSubAbility('ba_whispers_words', ['ba_whispers_words_g'])!;
    let retained = 0;
    for (const kind of ['groundZone', 'projectile', 'selfBuff'] as const)
      for (let seed = 1; seed <= 16; seed++) {
        const donor = {
          name: 'Beguiling Words',
          className: 'Bard',
          classId: 'bard' as const,
          slot: 'a1',
          def: { ...grand, kind },
        };
        const def = synthesizeAbility(seed, 'perception-contract', 'a1', [donor]).def;
        const component = def.components!.effects.find((x) => x.kind === 'apparition');
        if (component?.kind === 'apparition') {
          retained++;
          expect(component.effect.duration).toBeGreaterThanOrEqual(1);
          expect(component.effect.duration).toBeLessThanOrEqual(4);
          expect(describeComposed(def.components!, def.cooldown)).toContain('former allies');
          expect(def.apparition).toEqual(component.effect);
          const missing = { ...def, apparition: undefined };
          expect(refreshComponents(missing).effects.some((x) => x.kind === 'apparition')).toBe(
            true,
          );
        } else expect(def.apparition).toBeUndefined();
        if (kind === 'selfBuff') expect(component).toBeUndefined();
      }
    expect(retained).toBeGreaterThan(0);
  });
  it.each(['far', 'gone', 'spent', 'stale', 'recovery', 'steadfast', 'shove', 'dead'] as const)(
    'an invalid %s spend leaves its secret intact',
    (reason) => {
      const { w, p, b } = setup();
      learn(w, p, b);
      const cast = whisperCast(w, p, p.abilities!.a2);
      if (reason === 'far') b.pos.x = 1300;
      if (reason === 'gone') b.hp = 0;
      if (reason === 'spent') cast.spent = true;
      if (reason === 'stale') cast.targetId = 999;
      if (reason === 'recovery') b.perceptionRecovery = 2;
      if (reason === 'steadfast') b.buffs.push(makeBuff('steadfast', 0, 2, 'test'));
      if (reason === 'shove') b.shove = { vx: 10, vy: 0, remaining: 1 };
      if (reason === 'dead') p.hp = 0;
      expect(spendSecret(w, p, cast, p.pos)).toBe(false);
      expect(p.whisperSecret?.targetId).toBe(b.id);
    },
  );
  it('a zero-length aim still gives directed placement a finite deterministic position', () => {
    const { w, p, b } = setup('ba_whispers_song', ['ba_whispers_g_a']);
    learn(w, p, b);
    p.aim = { ...zero };
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(b.perception?.pos).toEqual(b.pos);
    expect(stepFear(w, b, 0.1)).toBe(true);
    expect(Number.isFinite(b.pos.x)).toBe(true);
  });
  it('Words’ bounded retreat ends when a target has exited the fixed feared area', () => {
    const { w, p, b } = setup();
    learn(w, p, b);
    const cast = whisperCast(w, p, p.abilities!.a2);
    spendSecret(w, p, cast, p.pos, 10);
    stepFear(w, b, 0.1);
    expect(b.perception).toBeUndefined();
  });
  it.each(['taunt', 'root', 'shove'] as const)(
    'quarry pursuit honors an intervening %s without consuming its aim point',
    (reason) => {
      const { w, p, b } = setup('ba_whispers_song', ['ba_whispers_g_b']);
      learn(w, p, b);
      resolvePlayerAbility(w, p, 'sub1', zero);
      if (reason === 'taunt') w.tauntTimer = 1;
      if (reason === 'root') b.buffs.push(makeBuff('root', 0, 1, 'test'));
      if (reason === 'shove') b.shove = { vx: 10, vy: 0, remaining: 1 };
      const pos = { ...b.pos };
      moveToQuarry(w, b, 0.1);
      expect(b.pos).toEqual(pos);
      expect(b.perception?.mode).toBe('lure');
    },
  );
  it('a new fear waits when a taunt arrives, then resumes without retargeting a committed action', () => {
    const { w, p, b } = setup();
    learn(w, p, b);
    resolvePlayerAbility(w, p, 'a2', zero);
    w.tauntTimer = 1;
    expect(stepFear(w, b, 0.1)).toBe(false);
    w.tauntTimer = 0;
    expect(stepFear(w, b, 0.1)).toBe(true);
  });
  it('a converted add with no remaining hostile waits, and restores allegiance if its owner disappears', () => {
    const { w, p, b } = setup();
    const a = add(w, { x: 900, y: 400 });
    a.charm = { ownerId: p.id, ownerClass: p.classId, remaining: 4 };
    b.hp = 0;
    expect(stepCharmedAdd(w, a, 0.1)).toBe(true);
    expect(a.targetId).toBeNull();
    w.players = [];
    expect(stepCharmedAdd(w, a, 0.1)).toBe(false);
    expect(a.charm).toBeUndefined();
  });
  it.each(['root', 'shove', 'cooldown'] as const)(
    'conversion respects existing %s instead of granting free actions',
    (reason) => {
      const { w, p, b } = setup();
      const a = add(w, { x: 950, y: 400 });
      a.charm = { ownerId: p.id, ownerClass: p.classId, remaining: 4 };
      if (reason === 'root') a.buffs.push(makeBuff('root', 0, 1, 'test'));
      if (reason === 'shove') a.shove = { vx: 10, vy: 0, remaining: 1 };
      if (reason === 'cooldown') {
        a.pos = { ...b.pos };
        a.attackCd = 1;
      }
      const pos = { ...a.pos },
        hp = b.hp;
      stepCharmedAdd(w, a, 0.1);
      expect(a.pos).toEqual(pos);
      expect(b.hp).toBe(hp);
    },
  );
  it('a fear routes around another boss instead of merging their bodies', () => {
    const { w, p, b } = setup();
    learn(w, p, b);
    resolvePlayerAbility(w, p, 'a2', zero);
    const twin = structuredClone(b);
    twin.id = w.allocId();
    twin.perception = undefined;
    twin.pos = { x: b.pos.x + b.radius * 2 + 1, y: b.pos.y };
    w.bosses.push(twin);
    stepFear(w, b, 0.1);
    expect(Math.hypot(twin.pos.x - b.pos.x, twin.pos.y - b.pos.y)).toBeGreaterThanOrEqual(
      b.radius + twin.radius,
    );
  });
  it('newly converted adds receive neither the converting field’s slow nor a friendly echo', () => {
    const { w, p } = setup('ba_whispers_words', ['ba_whispers_words_g']);
    const a = add(w, { x: 1060, y: 400 });
    resolvePlayerAbility(w, p, 'sub1', zero);
    const z = w.groundZones.at(-1)!;
    z.armRemaining = 0;
    z.roots = true;
    internals(w).applyZoneTick(z);
    expect(a.charm).toBeDefined();
    expect(a.buffs.some((x) => ['root', 'moveSpeed'].includes(x.kind))).toBe(false);
    const hp = a.hp;
    expect(damageEcho(w, p, a, 100)).toBe(0);
    expect(a.hp).toBe(hp);
  });
  it('a delayed former-class payload cannot learn, spend or convert after swapping', () => {
    const { w, p, b } = setup('ba_whispers_words', ['ba_whispers_words_g']);
    learn(w, p, b);
    const a = add(w, { x: 1060, y: 400 });
    resolvePlayerAbility(w, p, 'sub1', zero);
    const z = w.groundZones.at(-1)!;
    z.armRemaining = 0;
    p.classId = 'mage';
    internals(w).applyZoneTick(z);
    expect(a.charm).toBeUndefined();
    expect(b.perception).toBeUndefined();
  });
  it('copied charms survive without a Whispers passive, but end on their caster’s class change', () => {
    const { w, p } = setup('ba_whispers_words', ['ba_whispers_words_g']);
    setSubclassPassive(p, undefined);
    const a = add(w, { x: 1060, y: 400 });
    resolvePlayerAbility(w, p, 'sub1', zero);
    const z = w.groundZones.at(-1)!;
    z.armRemaining = 0;
    internals(w).applyZoneTick(z);
    tickWhispers(w, 0.1);
    expect(a.charm).toBeDefined();
    p.classId = 'mage';
    tickWhispers(w, 0);
    expect(a.charm).toBeUndefined();
  });
  it.each(['death', 'expire', 'room', 'owner'] as const)(
    'clears an unspent secret on %s',
    (cause) => {
      const { w, p, b } = setup();
      learn(w, p, b);
      if (cause === 'death') b.hp = 0;
      if (cause === 'room') w.scene = 'reward';
      if (cause === 'owner') p.hp = 0;
      tickWhispers(w, cause === 'expire' ? 9 : 0);
      expect(p.whisperSecret).toBeUndefined();
    },
  );
  it.each(['pending', 'duration', 'owner', 'class', 'room', 'enemy'] as const)(
    'expires a perception on %s without rewriting an attack',
    (cause) => {
      const { w, p, b } = setup('ba_whispers_song', ['ba_whispers_g_b']);
      learn(w, p, b);
      resolvePlayerAbility(w, p, 'sub1', zero);
      if (cause === 'pending') b.perception!.pending = 0;
      if (cause === 'duration') b.perception!.remaining = 0;
      if (cause === 'owner') p.state = 'downed';
      if (cause === 'class') p.classId = 'mage';
      if (cause === 'room') w.scene = 'reward';
      if (cause === 'enemy') b.hp = 0;
      const action = structuredClone(b.action);
      tickWhispers(w, 0);
      expect(b.perception).toBeUndefined();
      expect(b.action).toEqual(action);
    },
  );
  it('retreat respects slows, later roots and shoves; a fully blocked route ends without wrapping', () => {
    const { w, p, b } = setup();
    learn(w, p, b);
    resolvePlayerAbility(w, p, 'a2', zero);
    b.buffs = [makeBuff('moveSpeed', 0.1, 3, 'test')];
    const x = b.pos.x;
    stepFear(w, b, 0.01);
    expect(b.pos.x - x).toBeCloseTo(b.moveSpeed * 0.001);
    b.buffs.push(makeBuff('root', 0, 3, 'test'));
    expect(stepFear(w, b, 0.1)).toBe(false);
    b.buffs = [];
    b.shove = { vx: 10, vy: 0, remaining: 1 };
    expect(stepFear(w, b, 0.1)).toBe(false);
    b.shove = null;
    w.obstacles = [
      {
        id: 9999,
        pos: { ...b.pos },
        radius: 300,
        height: 'tall',
        kind: 'pillar',
      } as World['obstacles'][number],
    ];
    expect(stepFear(w, b, 0.1)).toBe(true);
    expect(b.perception).toBeUndefined();
  });
  it('basic learn plus Harmony works on adds and a quarry draws their next strike', () => {
    const { w, p, b } = setup('ba_whispers_song', ['ba_whispers_g_b']);
    b.pos.x = 1200;
    const a = add(w, { x: 650, y: 400 });
    shoot(w, p, a);
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(a.perception?.mode).toBe('lure');
    a.pos = { ...p.pos };
    const hp = p.hp;
    internals(w).updateAdds(0.1);
    expect(p.hp).toBe(hp);
    expect(a.perception).toBeUndefined();
    expect(a.attackCd).toBeGreaterThan(0);
  });
  it('converting on a direct strike does not immediately stun the new ally', () => {
    const { w, p, b } = setup();
    b.pos.x = 1200;
    const a = add(w, { x: 650, y: 400 });
    p.abilities!.a3 = {
      slot: 'a3',
      name: 'Test conversion',
      kind: 'pbaoe',
      cooldown: 10,
      damage: 1,
      radius: 150,
      stun: 2,
      apparition: { mode: 'charm', duration: 4 },
    };
    resolvePlayerAbility(w, p, 'a3', zero);
    expect(a.charm).toBeDefined();
    expect(a.buffs.some((x) => x.kind === 'stun')).toBe(false);
  });
  it('publishes intelligible readiness, enemy ownership and distinct mask/fear states', () => {
    const { w, p, b } = setup();
    learn(w, p, b);
    tickWhispers(w, 0);
    expect(buffBadges(p.buffs, 20).some((x) => x.label.includes('Secret learned'))).toBe(true);
    const mark = b.buffs.find((x) => x.kind === 'secretMark')!;
    expect(buffView(mark).ownerId).toBe(p.id);
    for (const [kind, mult] of [
      ['secretMark', 1],
      ['nightmare', 1],
      ['nightmare', 2],
      ['beguiling', 1],
    ] as const)
      expect(buffBadges([makeBuff(kind, mult, 2, 'test')], 20)).toHaveLength(1);
  });
});
