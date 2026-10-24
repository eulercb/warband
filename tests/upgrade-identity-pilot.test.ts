import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility, spawnZone } from '../src/engine/combat/abilities';
import {
  applyBuff,
  damageBoss,
  damagePlayer,
  makeBuff,
  tickBuffs,
} from '../src/engine/combat/combat';
import {
  applyFieldPoison,
  tickVenoms,
  updateUpgradeZone,
} from '../src/engine/combat/skillRetouches';
import { applySubSkillUpgrades, previewAbilityTable } from '../src/engine/content/charUpgrades';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  setForgeSeed,
} from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { heroPowerRatio } from '../src/engine/content/balance';
import { describeAbility } from '../src/engine/content/classes';
import type { Add, ClassId, GroundZone } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
function setup(classId: ClassId = 'rogue', upgrades: string[] = [], subSkills: string[] = []) {
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [{ peerId: 'a', name: 'Owner', classId, charUpgrades: upgrades, subSkills }],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    boss = w.boss!;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  boss.pos = { x: 680, y: 400 };
  boss.hp = boss.maxHp = 100000;
  boss.buffs = [];
  boss.decisionTimer = 100;
  boss.moveSpeed = 0;
  return { w, p, boss };
}
function add(w: World, x = 690) {
  const a: Add = {
    id: w.allocId(),
    pos: { x, y: 400 },
    hp: 10000,
    maxHp: 10000,
    radius: 12,
    moveSpeed: 0,
    targetId: null,
    attackCd: 0,
    buffs: [],
  };
  w.adds.push(a);
  return a;
}
function zoneTick(w: World, z: GroundZone) {
  (w as unknown as { applyZoneTick(z: GroundZone): void }).applyZoneTick(z);
}
function updateZones(w: World, dt: number) {
  (w as unknown as { updateZones(dt: number): void }).updateZones(dt);
}
function castZone(w: World, slot: 'a1' | 'a3') {
  resolvePlayerAbility(w, w.players[0], slot, ZERO);
  const z = w.groundZones.at(-1)!;
  z.pos = { ...w.boss!.pos };
  z.armRemaining = 0;
  return z;
}
afterEach(() => {
  setForgeSeed(null);
  setProceduralSeed(null);
});

describe('Assassinate prepared-hit tempo', () => {
  it.each([false, true])('refunds once per actual prepared cast, composed=%s', (composed) => {
    const { w, p, boss } = setup('rogue', ['ro_assassin']);
    const a = add(w, 650);
    if (composed) p.abilities!.a1 = recompose(decompose(p.abilities!.a1), p.abilities!.a1);
    p.cooldowns.a2 = 5;
    applyBuff(p, makeBuff('precision', 1, 4, 'precision'));
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.cooldowns.a2).toBe(4);
    expect(p.upgradeRefundRemaining).toBe(4);
    expect(boss.hp).toBeLessThan(boss.maxHp);
    expect(a.hp).toBeLessThan(a.maxHp);
    applyBuff(p, makeBuff('precision', 1, 4, 'precision'));
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.cooldowns.a2).toBe(4);
    p.upgradeRefundRemaining = 0;
    applyBuff(p, makeBuff('precision', 1, 4, 'precision'));
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.cooldowns.a2).toBe(3);
  });
  it.each(['immune', 'miss', 'ready', 'unprepared'] as const)(
    'does not spend refund gate: %s',
    (condition) => {
      const { w, p, boss } = setup('rogue', ['ro_assassin']);
      p.cooldowns.a2 = condition === 'ready' ? 0 : 5;
      if (condition !== 'unprepared') applyBuff(p, makeBuff('precision', 1, 4, 'precision'));
      if (condition === 'immune') applyBuff(boss, makeBuff('invuln', 1, 2, 'test'));
      if (condition === 'miss') boss.pos.x = 1100;
      resolvePlayerAbility(w, p, 'a1', ZERO);
      expect(p.cooldowns.a2).toBe(condition === 'ready' ? 0 : 5);
      expect(p.upgradeRefundRemaining ?? 0).toBe(0);
    },
  );
});

describe('Vial allocation and following poison', () => {
  it('composed ordinary Vial retains full ground output after Forge caps and adds an exit tail', () => {
    const { w, p, boss } = setup('rogue', ['ro_poison']);
    const ab = p.abilities!.a3;
    ab.components = refreshComponents(recompose(decompose(ab), ab));
    p.abilities!.a3 = recompose(ab.components, ab);
    expect(p.abilities!.a3.zonePoison).toEqual({ share: 0, onExit: true });
    expect(describeAbility(p.abilities!.a3)).toContain('full ground damage plus 2s');
    const z = castZone(w, 'a3');
    zoneTick(w, z);
    expect(boss.maxHp - boss.hp).toBe(18);
    boss.pos.x += 500;
    updateUpgradeZone(w, z, 0);
    const before = boss.hp;
    tickVenoms(w, 2);
    expect(before - boss.hp).toBe(36);
  });
  it('common boon keeps stationary output and adds effective exit damage without a second owner pool', () => {
    const { w, p, boss } = setup('rogue', ['ro_poison']);
    const z = castZone(w, 'a3');
    zoneTick(w, z);
    expect(boss.maxHp - boss.hp).toBeCloseTo(18);
    expect(boss.buffs.some((b) => b.kind === 'venom')).toBe(false);
    boss.pos.x += 500;
    updateUpgradeZone(w, z, 0);
    expect(boss.buffs.find((b) => b.kind === 'venom')!.mult).toBeCloseTo(18);
    const before = boss.hp;
    tickVenoms(w, 2);
    expect(before - boss.hp).toBeCloseTo(36);
    expect(p.stats.damageDealt).toBeCloseTo(54);
  });
  it('expiry emits the tail even when the final tick seeds new contact', () => {
    const { w, boss } = setup('rogue', ['ro_poison']);
    const z = castZone(w, 'a3');
    z.remaining = 0.5;
    updateZones(w, 0.5);
    expect(w.groundZones).toHaveLength(0);
    expect(boss.buffs.find((b) => b.kind === 'venom')!.remaining).toBe(2);
  });
  it('immunity and flight cannot seed an exit; repeated exits share a two-second gate', () => {
    const { w, boss } = setup('rogue', ['ro_poison']);
    const z = castZone(w, 'a3');
    applyBuff(boss, makeBuff('invuln', 1, 2, 'test'));
    zoneTick(w, z);
    expect(z.poisonContacts?.size ?? 0).toBe(0);
    boss.buffs = [];
    applyBuff(boss, makeBuff('flight', 1, 2, 'test'));
    zoneTick(w, z);
    expect(z.poisonContacts?.size ?? 0).toBe(0);
    boss.buffs = [];
    zoneTick(w, z);
    boss.pos.x += 500;
    updateUpgradeZone(w, z, 0);
    const poison = boss.buffs.find((b) => b.kind === 'venom')!;
    poison.remaining = 1;
    boss.pos = { ...z.pos };
    zoneTick(w, z);
    boss.pos.x += 500;
    updateUpgradeZone(w, z, 0);
    expect(poison.remaining).toBe(1);
  });
  it('grand supersedes common allocation in either order and does not double-credit field damage', () => {
    for (const upgrades of [
      ['ro_poison', 'ro_grand_venom'],
      ['ro_grand_venom', 'ro_poison'],
    ]) {
      const { w, p, boss } = setup('rogue', upgrades);
      const z = castZone(w, 'a3');
      expect(z.zonePoison).toEqual({ share: 0.4, onExit: false });
      zoneTick(w, z);
      tickVenoms(w, 0.5);
      tickBuffs(boss, 0.5);
      zoneTick(w, z);
      tickVenoms(w, 0.5);
      tickBuffs(boss, 0.5);
      expect(boss.maxHp - boss.hp).toBeCloseTo(80); // 40*2, allocated once
      expect(p.stats.damageDealt).toBeCloseTo(80);
    }
  });
  it('refresh preserves tick phase beyond eight seconds and caps field recipients at three', () => {
    const { w, p, boss } = setup('rogue', ['ro_grand_venom']);
    const targets = [boss, add(w), add(w), add(w)];
    for (const t of targets) applyFieldPoison(w, p, t, 10);
    expect(targets.filter((t) => t.buffs.some((b) => b.kind === 'venom'))).toHaveLength(3);
    for (let i = 0; i < 20; i++) {
      applyFieldPoison(w, p, boss, 10);
      tickVenoms(w, 0.5);
      tickBuffs(boss, 0.5);
    }
    expect(boss.maxHp - boss.hp).toBeCloseTo(100);
  });
  it('stronger Coated poison is preserved, owners remain independent, dead owners do not create tails', () => {
    const { w, p, boss } = setup('rogue', ['ro_poison'], ['ro_assassin_poison']);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    damageBoss(w, p, boss, 1, { direct: true });
    const poison = boss.buffs.find((b) => b.kind === 'venom')!;
    applyFieldPoison(w, p, boss, 5);
    expect(boss.buffs.find((b) => b.kind === 'venom')).toBe(poison);
    const other = { ...p, id: 999, buffs: [] };
    w.players.push(other);
    applyFieldPoison(w, other, boss, 10);
    expect(boss.buffs.filter((b) => b.kind === 'venom')).toHaveLength(2);
    const z = castZone(w, 'a3');
    zoneTick(w, z);
    p.state = 'downed';
    boss.pos.x += 500;
    updateUpgradeZone(w, z, 0);
    expect(z.poisonContacts?.size).toBe(0);
  });
});

describe('one shared proactive/reactive Rebuke', () => {
  it.each([false, true])('next positive basic releases at victim, composed=%s', (composed) => {
    const { w, p, boss } = setup('warlock', ['wa_rebuke']);
    if (composed) p.abilities!.a2 = recompose(decompose(p.abilities!.a2), p.abilities!.a2);
    boss.pos.x = 1050;
    const neighbor = add(w, 1060);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(p.buffs.some((b) => b.kind === 'rebuke')).toBe(true);
    damageBoss(w, p, boss, 10); // ticks cannot spend
    expect(p.buffs.some((b) => b.kind === 'rebuke')).toBe(true);
    damageBoss(w, p, boss, 1, { direct: true });
    expect(p.buffs.some((b) => b.kind === 'rebuke')).toBe(false);
    expect(neighbor.hp).toBeLessThan(neighbor.maxHp);
    const hp = neighbor.hp;
    damagePlayer(w, p, 1);
    expect(neighbor.hp).toBe(hp);
    expect(w.events.some((e) => e.t === 'skillArea' && e.area.origin.x === 1050)).toBe(true);
  });
  it('incoming damage wins; immunity, zero and expiry do not cause an extra discharge', () => {
    const { w, p, boss } = setup('warlock', ['wa_rebuke']);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    applyBuff(boss, makeBuff('invuln', 1, 2, 'test'));
    damageBoss(w, p, boss, 1, { direct: true });
    damageBoss(w, p, boss, 0, { direct: true });
    expect(p.buffs.some((b) => b.kind === 'rebuke')).toBe(true);
    damagePlayer(w, p, 1);
    expect(p.buffs.some((b) => b.kind === 'rebuke')).toBe(false);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    tickBuffs(p, 3.1);
    boss.buffs = [];
    const before = boss.hp;
    damageBoss(w, p, boss, 1, { direct: true });
    expect(before - boss.hp).toBeGreaterThan(0);
    expect(before - boss.hp).toBeLessThan(5);
  });
});

describe('bounded following Hex', () => {
  it('acquires nearest effective actor across bosses/adds, then anchors without hopping', () => {
    const { w, boss } = setup('warlock', ['wa_grand_ruin']);
    const z = castZone(w, 'a1');
    boss.pos.x += 50;
    const a = add(w, z.pos.x + 10);
    zoneTick(w, z);
    expect(z.followId).toBe(a.id);
    a.pos.x += 100;
    updateUpgradeZone(w, z, 1);
    expect(z.pos).toEqual(a.pos);
    a.hp = 0;
    const last = { ...z.pos };
    updateUpgradeZone(w, z, 1);
    boss.pos.x += 300;
    zoneTick(w, z);
    updateUpgradeZone(w, z, 1);
    expect(z.pos).toEqual(last);
    expect(z.zoneFollow).toBe(0);
  });
  it('time expires after three seconds; an immune or airborne boss is never acquired', () => {
    const { w, boss } = setup('warlock', ['wa_grand_ruin']);
    const z = castZone(w, 'a1');
    applyBuff(boss, makeBuff('invuln', 1, 2, 'test'));
    zoneTick(w, z);
    expect(z.followId).toBeUndefined();
    boss.buffs = [];
    applyBuff(boss, makeBuff('flight', 1, 2, 'test'));
    zoneTick(w, z);
    expect(z.followId).toBeUndefined();
    boss.buffs = [];
    zoneTick(w, z);
    for (let i = 0; i < 3; i++) {
      boss.pos.x += 20;
      updateUpgradeZone(w, z, 1);
    }
    const last = { ...z.pos };
    boss.pos.x += 50;
    updateUpgradeZone(w, z, 1);
    expect(z.pos).toEqual(last);
  });
  it('hostile zones cannot inherit player poison or following behavior', () => {
    const { w } = setup();
    spawnZone(w, {
      kind: 'voidZone',
      pos: { x: 600, y: 400 },
      side: 'boss',
      ownerId: 10,
      radius: 100,
      duration: 5,
      damagePerTick: 10,
      healPerTick: 0,
      zonePoison: { share: 0.4, onExit: false },
      zoneFollow: 3,
    });
    expect(w.groundZones[0].zonePoison).toBeUndefined();
    expect(w.groundZones[0].zoneFollow).toBeUndefined();
  });
});

describe('zone ownership and contact boundaries', () => {
  it('dead contacts are removed, living contacts wait for exit, flight releases contact', () => {
    const { w, p, boss } = setup('rogue', ['ro_poison']);
    const z = castZone(w, 'a3');
    const a = add(w);
    zoneTick(w, z);
    a.hp = 0;
    updateUpgradeZone(w, z, 0);
    expect(z.poisonContacts!.has(a.id)).toBe(false);
    expect(z.poisonContacts!.has(boss.id)).toBe(true);
    applyBuff(boss, makeBuff('flight', 1, 2, 'fixture'));
    updateUpgradeZone(w, z, 0);
    expect(z.poisonContacts!.has(boss.id)).toBe(false);
    expect(boss.buffs.some((b) => b.kind === 'venom')).toBe(true);
    const hp = boss.hp;
    tickVenoms(w, 1);
    expect(boss.hp).toBeLessThan(hp);
    applyFieldPoison(w, p, a, 10);
    expect(a.buffs.some((b) => b.kind === 'venom')).toBe(false);
  });
  it('stronger field refresh preserves phase; dead/zero/room/absent owners do not create poison', () => {
    const { w, p, boss } = setup();
    applyFieldPoison(w, p, boss, 10);
    tickVenoms(w, 0.5);
    applyFieldPoison(w, p, boss, 20);
    tickVenoms(w, 0.5);
    expect(boss.maxHp - boss.hp).toBe(20);
    boss.buffs = [];
    applyFieldPoison(w, p, boss, 0);
    expect(boss.buffs).toHaveLength(0);
    p.hp = 0;
    applyFieldPoison(w, p, boss, 10);
    expect(boss.buffs).toHaveLength(0);
    p.hp = p.maxHp;
    const z = castZone(w, 'a3');
    z.zoneFollow = 3;
    w.players = [];
    updateUpgradeZone(w, z, 1);
    expect(z.zoneFollow).toBe(0);
  });
  it('equal-distance candidates use ID, disappearances stop following and never reacquire', () => {
    const { w, boss } = setup('warlock', ['wa_grand_ruin']);
    const z = castZone(w, 'a1');
    boss.pos.x += 500;
    const a = add(w, z.pos.x + 10);
    const b = add(w, z.pos.x - 10);
    w.adds.reverse();
    zoneTick(w, z);
    expect(z.followId).toBe(a.id);
    w.adds = [b];
    updateUpgradeZone(w, z, 0.5);
    expect(z.zoneFollow).toBe(0);
    zoneTick(w, z);
    expect(z.followId).toBe(a.id);
  });
  it('airborne follow target anchors immediately at the last ground position', () => {
    const { w, boss } = setup('warlock', ['wa_grand_ruin']);
    const z = castZone(w, 'a1');
    zoneTick(w, z);
    const last = { ...z.pos };
    boss.pos.x += 20;
    applyBuff(boss, makeBuff('flight', 1, 2, 'fixture'));
    updateUpgradeZone(w, z, 0.1);
    expect(z.pos).toEqual(last);
    expect(z.zoneFollow).toBe(0);
  });
  it.each([0, 100])(
    'prepared projectile preserves precision on immunity and refunds once: blast %i',
    (impactRadius) => {
      const { w, p, boss } = setup('rogue', ['ro_assassin']);
      const ab = p.abilities!.a1,
        comp = decompose(ab);
      comp.delivery = {
        kind: 'projectile',
        projSpeed: 1000,
        maxRange: 600,
        impactRadius,
        projCount: 2,
      };
      p.abilities!.a1 = recompose(comp, ab);
      p.cooldowns.a2 = 5;
      applyBuff(p, makeBuff('precision', 1, 4, 'precision'));
      applyBuff(boss, makeBuff('invuln', 1, 2, 'fixture'));
      resolvePlayerAbility(w, p, 'a1', ZERO);
      for (const shot of w.projectiles) shot.pos = { ...boss.pos };
      (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0);
      expect(p.buffs.some((b) => b.kind === 'precision')).toBe(true);
      expect(p.cooldowns.a2).toBe(5);
      boss.buffs = [];
      resolvePlayerAbility(w, p, 'a1', ZERO);
      for (const shot of w.projectiles) shot.pos = { ...boss.pos };
      (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0);
      expect(p.cooldowns.a2).toBe(4);
      expect(p.upgradeRefundRemaining).toBe(4);
    },
  );
  it('a composed projectile carries grand poison allocation to its impact zone', () => {
    const { w, p, boss } = setup('rogue', ['ro_grand_venom']);
    const ab = p.abilities!.a3;
    const comp = decompose(ab);
    comp.delivery = { kind: 'projectile', projSpeed: 1000, maxRange: 600 };
    comp.effects.unshift({ kind: 'damage', amount: 1 });
    p.abilities!.a3 = recompose(comp, ab);
    resolvePlayerAbility(w, p, 'a3', ZERO);
    for (const shot of w.projectiles) shot.pos = { ...boss.pos };
    (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0);
    const z = w.groundZones[0];
    expect(z.zonePoison).toEqual({ share: 0.4, onExit: false });
    zoneTick(w, z);
    expect(boss.buffs.some((b) => b.kind === 'venom')).toBe(true);
  });
});

describe('repeat picks, composition and copied skills', () => {
  it.each([0, 1, 3, 5])('bounded Honed paths at %i stacks', (n) => {
    const { p } = setup('rogue', [], ['ro_assassin_poison']);
    applySubSkillUpgrades(p, Array<string>(n).fill('subup_ro_assassin_poison'));
    const a = p.subAbilities!.sub1!;
    expect(a.venomCoating!.duration).toBe(4 + Math.min(2, n));
    expect(a.venomCoating!.window).toBe(6);
    expect(a.cooldown).toBeCloseTo(9 * 0.96 ** Math.max(0, n - 1));
    const { p: warlock } = setup('warlock', Array<string>(n).fill('wa_hex'), ['wa_goo_blast']);
    applySubSkillUpgrades(warlock, Array<string>(n).fill('subup_wa_goo_blast'));
    expect(warlock.subAbilities!.sub1!.cursePayoff).toBe(Math.min(5, 3 + n));
    if (n) expect(warlock.abilities!.a1.slowDuration).toBe(Math.min(4, 1.5 + 0.5 * n));
  });
  it.each(['rogue', 'warlock'] as const)(
    'new payloads survive refreshed Forge components: %s',
    (classId) => {
      const ids =
        classId === 'rogue'
          ? ['ro_assassin', 'ro_poison', 'ro_grand_venom']
          : ['wa_hex', 'wa_rebuke', 'wa_grand_ruin'];
      const table = previewAbilityTable(classId, ids);
      for (const a of Object.values(table)) {
        const copy = recompose(decompose(a), a);
        copy.components = refreshComponents(copy);
        const again = recompose(copy.components, copy);
        expect(again.zonePoison).toEqual(a.zonePoison);
        expect(again.zoneFollow).toBe(a.zoneFollow);
        expect(again.preparedRefund).toBe(a.preparedRefund);
        expect(again.rebukeDirect ?? false).toBe(a.rebukeDirect ?? false);
        expect(componentValue(decompose(again))).toBeGreaterThanOrEqual(0);
        const description = describeAbility(again);
        if (a.zonePoison) expect(description).toContain('poison');
        if (a.preparedRefund) expect(description).toContain('once per cast and 4s');
        if (a.zoneFollow) expect(description).toContain('follow first damaged foe up to 3s');
        if (a.rebukeDirect) expect(description).toContain('on next positive direct hit or if hurt');
      }
    },
  );
  it('Honed poison replay never mutates authored coating or contaminates later players', () => {
    const first = setup('rogue', Array<string>(5).fill('subup_ro_assassin_poison'), [
      'ro_assassin_poison',
    ]);
    expect(first.p.subAbilities!.sub1!.venomCoating!.damage).toBe(38);
    const fresh = setup('rogue', [], ['ro_assassin_poison']);
    expect(fresh.p.subAbilities!.sub1!.venomCoating).toEqual({
      damage: 24,
      duration: 4,
      window: 6,
    });
    const again = setup('rogue', Array<string>(5).fill('subup_ro_assassin_poison'), [
      'ro_assassin_poison',
    ]);
    expect(again.p.subAbilities!.sub1!.venomCoating).toEqual(
      first.p.subAbilities!.sub1!.venomCoating,
    );
  });
  it.each([1, 7, 31, 99])(
    'seeded Forge/procedural replay stays finite and isolated: seed %i',
    (seed) => {
      setForgeSeed(seed);
      setProceduralSeed(seed);
      for (const classId of ['rogue', 'warlock'] as const)
        for (const n of [0, 1, 3, 5]) {
          const ids =
            classId === 'rogue'
              ? ['ro_assassin', 'ro_poison', 'subup_ro_assassin_poison', 'ro_grand_venom']
              : ['wa_hex', 'wa_rebuke', 'subup_wa_goo_blast', 'wa_grand_ruin'];
          const upgrades = ids.flatMap((id) =>
            Array<string>(id.includes('grand') ? 1 : n).fill(id),
          );
          const sub = classId === 'rogue' ? 'ro_assassin_poison' : 'wa_goo_blast';
          const { w, p } = setup(classId, upgrades, [sub]);
          for (const ab of [...Object.values(p.abilities!), ...Object.values(p.subAbilities!)]) {
            expect(Number.isFinite(ab.cooldown)).toBe(true);
            expect(ab.cooldown).toBeGreaterThan(0);
            expect(Number.isFinite(componentValue(decompose(ab)))).toBe(true);
            expect(describeAbility(ab)).not.toMatch(/NaN|Infinity/);
          }
          for (const slot of ['a1', 'a2', 'a3', 'sub1'] as const)
            resolvePlayerAbility(w, p, slot, ZERO);
          w.step(0.5, new Map());
          expect(Number.isFinite(p.stats.damageDealt)).toBe(true);
        }
    },
  );
  it('production input uses resolved cooldowns and refunds a running Shadowstep', () => {
    const { w, p, boss } = setup('rogue', ['ro_assassin']);
    const command = (slot: 'a1' | 'a2', seq: number) => ({
      seq,
      move: ZERO,
      aim: p.aim,
      buttons: {
        basic: false,
        a1: slot === 'a1',
        a2: slot === 'a2',
        a3: false,
        sub1: false,
        sub2: false,
        revive: false,
      },
    });
    w.step(0, new Map([[p.peerId, command('a2', 1)]]));
    expect(p.cooldowns.a2).toBe(6);
    boss.pos = { x: p.pos.x + 40, y: p.pos.y };
    w.step(0, new Map([[p.peerId, command('a1', 2)]]));
    expect(p.cooldowns.a1).toBeCloseTo(7.8);
    expect(p.cooldowns.a2).toBe(5);
    expect(p.upgradeRefundRemaining).toBe(4);
  });
  it('a farther follow candidate cannot steal the initial anchor', () => {
    const { w, boss } = setup('warlock', ['wa_grand_ruin']);
    const z = castZone(w, 'a1');
    add(w, z.pos.x + 40);
    zoneTick(w, z);
    expect(z.followId).toBe(boss.id);
  });
  it('zero-effective direct callbacks cannot spend any prepared payload', () => {
    const { w, p, boss } = setup('warlock', ['wa_rebuke']);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    p.cooldowns.a2 = 5;
    const cast = { spent: false };
    w.onPlayerDirectHit(p, boss, 0, true, { seconds: 1, cast });
    expect(cast.spent).toBe(false);
    expect(p.cooldowns.a2).toBe(5);
    expect(p.buffs.some((b) => b.kind === 'rebuke')).toBe(true);
  });
  it('grand plus Honed composed coating uses its advertised capped payload in combat and power', () => {
    const { w, p, boss } = setup(
      'rogue',
      ['ro_assassin_g_a', ...Array<string>(5).fill('subup_ro_assassin_poison')],
      ['ro_assassin_poison'],
    );
    const ab = p.subAbilities!.sub1!;
    ab.components = refreshComponents(recompose(decompose(ab), ab));
    const component = ab.components.effects.find((e) => e.kind === 'venomCoating');
    expect(component?.kind).toBe('venomCoating');
    if (component?.kind !== 'venomCoating') throw new Error('Missing coating');
    expect(component.coating.damage).toBe(50);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    damageBoss(w, p, boss, 1, { direct: true });
    expect(boss.buffs.find((b) => b.kind === 'venom')!.mult).toBe(component.coating.damage);
    expect(describeAbility(ab)).toContain('poison 50 dmg/s');
    const power = heroPowerRatio(p);
    ab.venomCoating = { ...component.coating };
    expect(heroPowerRatio(p)).toBe(power);
  });
  it('an allied shorter Mind Blast cannot erase the longer Honed hindrance window', () => {
    const { w, p, boss } = setup('warlock');
    const ally = { ...p, id: 999, buffs: [], stats: { ...p.stats } };
    w.players.push(ally);
    applyBuff(boss, makeBuff('curse', 1.15, 6, `curse:${p.id}:hex`));
    applyBuff(boss, makeBuff('curse', 1.15, 6, `curse:${ally.id}:hex`));
    damageBoss(w, p, boss, 1, { direct: true, cursePayoff: 5 });
    damageBoss(w, ally, boss, 1, { direct: true, cursePayoff: 3 });
    expect(boss.buffs.filter((b) => b.source === 'mindBlastWindup')).toHaveLength(1);
    expect(boss.buffs.find((b) => b.source === 'mindBlastWindup')!.remaining).toBe(5);
  });
  it('a stale graftup cannot tune a native slot after reclaim', () => {
    const table = previewAbilityTable('knight', ['hy_hexbrand', 'restore:a3', 'graftup:a3:wa_hex']);
    expect(table.a3).toEqual(previewAbilityTable('knight', []).a3);
  });
  it('Hexbrand gets linger without a donor passive, reclaims and re-seats without leaking grands', () => {
    const base = previewAbilityTable('knight', ['hy_hexbrand']);
    const upgraded = previewAbilityTable('knight', ['hy_hexbrand', 'graftup:a3:wa_hex']);
    expect(upgraded.a3.slowDuration).toBe(2);
    expect(upgraded.a3.zoneFollow).toBeUndefined();
    const reclaimed = previewAbilityTable('knight', [
      'hy_hexbrand',
      'graftup:a3:wa_hex',
      'restore:a3',
    ]);
    expect(reclaimed.a3).toEqual(previewAbilityTable('knight', []).a3);
    const reseated = previewAbilityTable('knight', [
      'hy_hexbrand',
      'graftup:a3:wa_hex',
      'restore:a3',
      'hy_hexbrand',
    ]);
    expect(reseated.a3).toEqual(upgraded.a3);
    expect(base.a3.zoneFollow).toBeUndefined();
  });
});
