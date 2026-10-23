import { afterEach, describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import {
  commandCompanion,
  prepareCompanionWard,
  updateCompanions,
  PACK_BOND,
} from '../src/engine/combat/companions';
import { damageBoss, damageAdd, damagePlayer, tickBuffs } from '../src/engine/combat/combat';
import { grantAbsorption, absorptionAmount } from '../src/engine/combat/absorption';
import { resolvePlayerAbility, stepPlayerGlide } from '../src/engine/combat/abilities';
import { getSubclass } from '../src/engine/content/subclasses';
import { setSubclassPassive, tickSubclassPassives } from '../src/engine/combat/subclassPassives';
import { decompose, recompose, setForgeSeed } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import { SnapshotInterpolator } from '../src/render/pipeline/interpolate';
import { drawCompanion } from '../src/render/pipeline/companionVisuals';
import { ARENA_W, INTERP_DELAY_MS } from '../src/engine/core/constants';
import { dist } from '../src/engine/core/torus';
import type { Add, InputCommand, Snapshot } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
function setup(choice = 0, party = true) {
  const sub = getSubclass('rg_beastmaster')!;
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      {
        peerId: 'a',
        name: 'Hunter',
        classId: 'ranger',
        subSkills: [sub.skills[choice].id],
        extraClasses: ['knight'],
      },
      ...(party ? [{ peerId: 'b', name: 'Ally', classId: 'knight' as const }] : []),
    ],
  });
  w.obstacles = [];
  w.terrain = [];
  w.scene = null;
  const [p, ally] = w.players;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  if (ally) ally.pos = { x: 650, y: 400 };
  const boss = w.boss!;
  boss.pos = { x: 700, y: 400 };
  boss.hp = boss.maxHp = 10000;
  boss.decisionTimer = 100;
  boss.moveSpeed = 0;
  return { w, p, ally, boss };
}
function advance(w: World, seconds = 0.5) {
  for (let i = 0; i < seconds * 60; i++) updateCompanions(w, 1 / 60);
}
function bite(w: World) {
  damageBoss(w, w.players[0], w.boss!, 1, { direct: true });
  advance(w);
}
function add(w: World): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { ...w.boss!.pos },
    hp: 1000,
    maxHp: 1000,
    moveSpeed: 0,
    radius: 12,
    buffs: [],
    targetId: null,
    attackCd: 0,
  };
  w.adds.push(a);
  return a;
}
afterEach(() => {
  vi.restoreAllMocks();
  setForgeSeed(null);
  setProceduralSeed(null);
});

describe('Beast Master identity and reliable commands', () => {
  it.each([0, 1, 2, 3])('choice %i needs only a base basic hit, native and composed', (choice) => {
    for (const composed of [false, true]) {
      const { w, p, boss } = setup(choice);
      expect(p.subclassPassiveId).toBe(PACK_BOND);
      if (composed)
        p.abilities!.basic = recompose(decompose(p.abilities!.basic), p.abilities!.basic);
      resolvePlayerAbility(w, p, 'basic', ZERO);
      const shot = w.projectiles.at(-1)!;
      shot.pos = { ...boss.pos };
      (
        w as unknown as { resolvePlayerProjectile: (projectile: typeof shot) => boolean }
      ).resolvePlayerProjectile(shot);
      const before = boss.hp;
      expect(p.spiritCompanion?.order?.targetId).toBe(boss.id);
      advance(w);
      expect(before - boss.hp).toBe(16);
      expect(p.spiritCompanion?.order).toBeUndefined();
    }
  });
  for (const choice of [0, 3])
    it.each([false, true])(
      `subclass choice ${choice} commands on its own damage (composed=%s)`,
      (composed) => {
        const { w, p, boss } = setup(choice);
        if (composed)
          p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
        boss.pos.x = p.pos.x + (choice === 0 ? (p.subAbilities!.sub1!.range ?? 220) : 40);
        resolvePlayerAbility(w, p, 'sub1', ZERO);
        if (choice === 0) stepPlayerGlide(w, p, 1);
        expect(p.spiritCompanion?.order?.targetId).toBe(boss.id);
        const before = boss.hp;
        advance(w);
        expect(before - boss.hp).toBe(16);
      },
    );
  it.each([false, true])(
    'Snare controls the next bite but its zone ticks cannot command (composed=%s)',
    (composed) => {
      const { w, p, boss } = setup(1);
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
      boss.pos.x = p.pos.x + (p.subAbilities!.sub1!.range ?? 500);
      resolvePlayerAbility(w, p, 'sub1', ZERO);
      for (let i = 0; i < 60; i++) w.step(1 / 60, new Map());
      expect(boss.buffs.some((b) => b.kind === 'moveSpeed' && b.mult < 1)).toBe(true);
      expect(p.spiritCompanion?.order).toBeUndefined();
      commandCompanion(p, boss, 'boss', 1, true);
      const before = boss.hp;
      advance(w);
      expect(before - boss.hp).toBe(20);
    },
  );
  it('keeps its authored passive in variance/Forge and does not grant pets from grafts', () => {
    setProceduralSeed(13);
    setForgeSeed(42);
    expect(getSubclass('rg_beastmaster')!.passive?.id).toBe(PACK_BOND);
    const { w, p } = setup();
    setSubclassPassive(p, undefined);
    p.abilities!.a1 = { ...getSubclass('rg_beastmaster')!.skills[0].ability, slot: 'a1' };
    updateCompanions(w, 0);
    expect(p.spiritCompanion).toBeUndefined();
  });
  it('a direct command has visible travel/wind-up; no immediate, autonomous or recursive damage', () => {
    const { w, p, boss } = setup();
    updateCompanions(w, 0);
    const home = { ...p.spiritCompanion!.pos };
    advance(w, 3);
    expect(boss.hp).toBe(10000);
    damageBoss(w, p, boss, 1, { direct: true });
    updateCompanions(w, 0.1);
    expect(boss.hp).toBe(9999);
    expect(dist(home, p.spiritCompanion!.pos)).toBeGreaterThan(0);
    advance(w, 0.3);
    expect(boss.hp).toBe(9983);
    advance(w, 4);
    expect(boss.hp).toBe(9983);
    expect(p.stats.damageDealt).toBe(17);
    expect(w.players).toHaveLength(2);
    expect(w.adds).toHaveLength(0);
  });
  it('one owner-wide gate prevents multi-projectile/multi-target spam and survives class swaps', () => {
    const { w, p, boss } = setup();
    const a = add(w);
    damageBoss(w, p, boss, 1, { direct: true });
    damageAdd(w, p, a, 1, { direct: true });
    expect(p.spiritCompanion?.order?.targetId).toBe(boss.id);
    advance(w);
    expect(a.hp).toBe(999);
    setSubclassPassive(p, undefined);
    setSubclassPassive(p, PACK_BOND);
    commandCompanion(p, a, 'add', 1, true);
    expect(p.spiritCompanion).toBeUndefined();
    tickSubclassPassives(p, 2.5);
    commandCompanion(p, a, 'add', 1, true);
    advance(w);
    expect(a.hp).toBe(983);
  });
  it('each owner has its own spirit and gate; all damage is attributed to its owner', () => {
    const { w, p, ally, boss } = setup();
    ally.subclassPassiveId = PACK_BOND;
    damageBoss(w, p, boss, 1, { direct: true });
    damageBoss(w, ally, boss, 1, { direct: true });
    advance(w);
    expect(boss.hp).toBe(9966);
    expect(p.stats.damageDealt).toBe(17);
    expect(ally.stats.damageDealt).toBe(17);
    expect(p.spiritCompanion).not.toBe(ally.spiritCompanion);
  });
  it.each(['moveSpeed', 'root', 'stun'] as const)(
    'bite exploits live %s control, not wind-up slow alone',
    (kind) => {
      const { w, p, boss } = setup();
      boss.buffs.push({
        kind,
        mult: kind === 'moveSpeed' ? 0.75 : 0,
        remaining: 2,
        source: 'test',
      });
      bite(w);
      expect(boss.hp).toBe(9979);
      tickSubclassPassives(p, 2.5);
      boss.buffs = [{ kind: 'castSlow', mult: 1.4, remaining: 2, source: 'test' }];
      bite(w);
      expect(boss.hp).toBe(9962);
    },
  );
  it('uses owner damage stats, respects enemy defenses and reaches flyers', () => {
    const { w, p, boss } = setup();
    p.damageMult = 2;
    boss.buffs.push(
      { kind: 'flight', mult: 0, remaining: 2, source: 'test' },
      { kind: 'damageTaken', mult: 0.5, remaining: 2, source: 'testDef' },
    );
    bite(w);
    expect(boss.hp).toBe(9983);
    expect(p.stats.damageDealt).toBe(17);
  });
  it('zero damage, corpses, non-direct hits and out-of-range hits cannot issue orders', () => {
    const { p, boss } = setup();
    commandCompanion(p, boss, 'boss', 0, true);
    commandCompanion(p, boss, 'boss', 1);
    commandCompanion(p, boss, 'boss', 1, false);
    boss.hp = 0;
    commandCompanion(p, boss, 'boss', 1, true);
    boss.hp = 1000;
    boss.pos.x = 1300;
    commandCompanion(p, boss, 'boss', 1, true);
    expect(p.spiritCompanion).toBeUndefined();
    expect(p.subclassPassiveCooldowns?.[PACK_BOND]).toBeUndefined();
  });
  it.each(['dead', 'removed', 'range', 'timeout', 'invuln'] as const)(
    'cancels or harmlessly misses a target that becomes %s',
    (reason) => {
      const { w, p, boss } = setup();
      commandCompanion(p, boss, 'boss', 1, true);
      if (reason === 'dead') boss.hp = 0;
      if (reason === 'removed') w.bosses = [];
      if (reason === 'range') boss.pos.x = 1300;
      if (reason === 'timeout') p.spiritCompanion!.order!.remaining = 0.001;
      if (reason === 'invuln')
        boss.buffs.push({ kind: 'invuln', mult: 0, remaining: 2, source: 'test' });
      const before = boss.hp;
      advance(w);
      expect(boss.hp).toBe(before);
      expect(p.spiritCompanion!.order).toBeUndefined();
      expect(p.subclassPassiveCooldowns?.[PACK_BOND]).toBe(2.5);
    },
  );
});

describe('Nature’s Bond protects its actual healed recipient', () => {
  it.each([false, true])(
    'effective native/composed healing links the ally, then the bite grants a ward (composed=%s)',
    (composed) => {
      const { w, p, ally } = setup(2);
      ally.hp -= 40;
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
      resolvePlayerAbility(w, p, 'sub1', ZERO);
      expect(p.spiritCompanion?.wardTargetId).toBe(ally.id);
      expect(absorptionAmount(ally.buffs)).toBe(0);
      expect(buffBadges(p.buffs).some((b) => b.label.includes('next successful spirit bite'))).toBe(
        true,
      );
      bite(w);
      expect(absorptionAmount(ally.buffs)).toBeCloseTo(Math.max(12, ally.maxHp * 0.08));
      expect(p.spiritCompanion?.wardTargetId).toBeUndefined();
      expect(p.buffs.some((b) => b.kind === 'packBond')).toBe(false);
      expect(
        w.events.some((e) => e.t === 'support' && e.kind === 'absorb' && e.targetId === ally.id),
      ).toBe(true);
      tickBuffs(ally, 4);
      expect(absorptionAmount(ally.buffs)).toBe(0);
    },
  );
  it('works solo, but full-health or lifesteal healing does not prepare protection', () => {
    const { w, p } = setup(2, false);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.spiritCompanion).toBeUndefined();
    p.hp -= 30;
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    bite(w);
    expect(absorptionAmount(p.buffs)).toBe(12);
    const s = setup(3, false);
    s.p.hp -= 30;
    s.boss.pos.x = 640;
    resolvePlayerAbility(s.w, s.p, 'sub1', ZERO);
    expect(s.p.spiritCompanion?.wardTargetId).toBeUndefined();
  });
  it.each(['stronger', 'range', 'downed', 'dead', 'removed'] as const)(
    'preserves preparation when recipient is %s',
    (reason) => {
      const { w, p, ally } = setup();
      prepareCompanionWard(p, ally, 10);
      if (reason === 'stronger') grantAbsorption(ally, 30, 8);
      if (reason === 'range') ally.pos.x = 1100;
      if (reason === 'downed') ally.state = 'downed';
      if (reason === 'dead') ally.hp = 0;
      if (reason === 'removed') w.removePlayerByPeer('b');
      bite(w);
      expect(p.spiritCompanion?.wardTargetId).toBe(ally.id);
      expect(absorptionAmount(ally.buffs)).toBe(reason === 'stronger' ? 30 : 0);
      tickBuffs(p, 6);
      updateCompanions(w, 0);
      expect(p.spiritCompanion?.wardTargetId).toBeUndefined();
    },
  );
  it('a last effective recipient replaces preparation; immune bite does not spend it', () => {
    const { w, p, ally, boss } = setup();
    prepareCompanionWard(p, p, 10);
    prepareCompanionWard(p, ally, 10);
    expect(p.buffs.filter((b) => b.kind === 'packBond')).toHaveLength(1);
    commandCompanion(p, boss, 'boss', 1, true);
    boss.buffs.push({ kind: 'invuln', mult: 0, remaining: 2, source: 'test' });
    advance(w);
    expect(p.spiritCompanion?.wardTargetId).toBe(ally.id);
    expect(absorptionAmount(ally.buffs)).toBe(0);
  });
  it('invalid/dead recipients and zero healing never prepare the bond', () => {
    const { p, ally } = setup();
    prepareCompanionWard(p, ally, 0);
    ally.state = 'dead';
    prepareCompanionWard(p, ally, 1);
    ally.state = 'alive';
    ally.hp = 0;
    prepareCompanionWard(p, ally, 1);
    expect(p.spiritCompanion).toBeUndefined();
    p.hp = 0;
    prepareCompanionWard(p, p, 1);
    expect(p.spiritCompanion).toBeUndefined();
  });
});

describe('lifecycle, movement and actual world integration', () => {
  it.each(['downed', 'dead', 'zeroHp', 'classSwap', 'reward', 'war'] as const)(
    'removes pending bite and link for %s',
    (reason) => {
      const { w, p, boss } = setup();
      prepareCompanionWard(p, p, 1);
      commandCompanion(p, boss, 'boss', 1, true);
      if (reason === 'downed' || reason === 'dead') p.state = reason;
      if (reason === 'zeroHp') p.hp = 0;
      if (reason === 'classSwap') setSubclassPassive(p, undefined);
      if (reason === 'reward' || reason === 'war') w.scene = reason;
      expect(w.serialize().players[0].spiritCompanion).toBeUndefined();
      updateCompanions(w, 0);
      expect(p.spiritCompanion).toBeUndefined();
      expect(p.buffs.some((b) => b.kind === 'packBond')).toBe(false);
      expect(p.subclassPassiveCooldowns?.[PACK_BOND]).toBe(2.5);
      p.state = 'alive';
      p.hp = p.maxHp;
      w.scene = null;
      setSubclassPassive(p, PACK_BOND);
      updateCompanions(w, 0);
      expect(p.spiritCompanion?.order).toBeUndefined();
      advance(w);
      expect(boss.hp).toBe(10000);
    },
  );
  it('disconnect removes its only state; companion never affects alive-party counts or aggro', () => {
    const { w, p, boss } = setup();
    commandCompanion(p, boss, 'boss', 1, true);
    w.removePlayerByPeer('a');
    advance(w);
    expect(boss.hp).toBe(10000);
    expect(w.serialize().players).toHaveLength(1);
  });
  it('wraps the seam, follows walking and recalls after a distant teleport', () => {
    const { w, p, boss } = setup();
    p.pos.x = 10;
    boss.pos.x = ARENA_W - 40;
    commandCompanion(p, boss, 'boss', 1, true);
    advance(w);
    expect(boss.hp).toBe(9984);
    const before = { ...p.spiritCompanion!.pos };
    p.pos.y += 100;
    advance(w, 0.1);
    expect(dist(before, p.spiritCompanion!.pos)).toBeGreaterThan(0);
    p.pos.x += 800;
    updateCompanions(w, 0);
    expect(dist(p.pos, p.spiritCompanion!.pos)).toBeLessThan(50);
  });
  it('real edge-triggered basic input spawns and commands the companion without another button', () => {
    const { w, p, boss } = setup(2, false);
    boss.pos.x = 900;
    const cmd: InputCommand = {
      seq: 0,
      move: ZERO,
      aim: { x: 1, y: 0 },
      autofire: false,
      buttons: { basic: true, a1: false, a2: false, a3: false, revive: false },
    };
    let casts = 0;
    for (let i = 0; i < 60; i++) {
      w.step(1 / 60, new Map([['a', cmd]]));
      casts += w.events.filter((e) => e.t === 'cast').length;
    }
    expect(p.spiritCompanion).toBeDefined();
    expect(p.stats.damageDealt).toBeGreaterThan(p.abilities!.basic.damage);
    expect(casts).toBe(1);
    const hp = p.hp;
    damagePlayer(w, p, 5, boss.pos);
    expect(p.hp).toBe(hp - 5);
  });
});

describe('replication and graphics', () => {
  it('serializes only a detached visual pose, never orders, cooldowns or ward recipients', () => {
    const { w, p, boss } = setup();
    prepareCompanionWard(p, p, 10);
    commandCompanion(p, boss, 'boss', 1, true);
    const view = w.serialize().players[0].spiritCompanion!;
    expect(view).toMatchObject({ attacking: true, bondReady: true });
    expect(Object.keys(view).sort()).toEqual(['attacking', 'bondReady', 'facing', 'pos']);
    expect(view.pos).not.toBe(p.spiritCompanion!.pos);
    const plain = JSON.parse(JSON.stringify(w.serialize())) as Snapshot;
    expect(plain.players[0].spiritCompanion).not.toHaveProperty('order');
    tickBuffs(p, 6);
    updateCompanions(w, 0);
    expect(w.serialize().players[0].spiritCompanion?.bondReady).toBe(false);
  });
  it('interpolates the wolf independently across the torus and removes it with the newer snapshot', () => {
    const { w, p } = setup();
    updateCompanions(w, 0);
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const interp = new SnapshotInterpolator();
    p.spiritCompanion!.pos = { x: ARENA_W - 10, y: 100 };
    interp.push(w.serialize());
    clock = 1100;
    p.spiritCompanion!.pos = { x: 10, y: 200 };
    interp.push(w.serialize());
    const rs = interp.sample(1050 + INTERP_DELAY_MS, { localPlayerId: null, arena: w.arena });
    expect(rs!.players[0].spiritCompanion!.pos.x % ARENA_W).toBeCloseTo(0);
    expect(rs!.players[0].spiritCompanion!.pos.y).toBeCloseTo(150);
    clock = 1200;
    delete p.spiritCompanion;
    interp.push(w.serialize());
    expect(
      interp.sample(1200 + INTERP_DELAY_MS, { localPlayerId: null, arena: w.arena })!.players[0]
        .spiritCompanion,
    ).toBeUndefined();
  });
  it('draws at mobile scale and adds distinct attack and prepared-bond cues', () => {
    const g = new Graphics();
    const circle = vi.spyOn(g, 'circle');
    const pet = { pos: ZERO, facing: Math.PI / 2, attacking: false, bondReady: false };
    drawCompanion(g, pet, { x: 50, y: 50 }, 0.3);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    const ordinaryCircles = circle.mock.calls.length;
    g.clear();
    circle.mockClear();
    drawCompanion(g, { ...pet, attacking: true, bondReady: true }, ZERO, 2);
    expect(circle.mock.calls.length).toBe(ordinaryCircles + 2);
    g.destroy();
  });
});
