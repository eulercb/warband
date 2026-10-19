import { afterEach, describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  applyBuff,
  buffMult,
  damageBoss,
  damageAdd,
  damagePlayer,
  makeBuff,
  tickBuffs,
} from '../src/engine/combat/combat';
import { tickVenoms } from '../src/engine/combat/skillRetouches';
import { consumeEvocation } from '../src/engine/combat/spellCombos';
import { setSubclassPassive, tickSubclassPassives } from '../src/engine/combat/subclassPassives';
import { getSubSkill, getSubclass, subclassOfSkill } from '../src/engine/content/subclasses';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  synthesizeAbility,
  setForgeSeed,
} from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { describeAbility } from '../src/engine/content/classes';
import { applySubSkillUpgrades, applySubclassGrands } from '../src/engine/content/charUpgrades';
import { heroPowerRatio } from '../src/engine/content/balance';
import { buffView } from '../src/engine/core/buffView';
import { enemyDebuffs, drawEnemyDebuffSymbol } from '../src/render/pipeline/enemyDebuffs';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import type { Add, InputCommand, Player, Projectile, GroundZone } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
const ids = [
  'kn_battle_menacing',
  'bb_berserker_slam',
  'bb_totem_bear',
  'bb_totem_quake',
  'ro_assassin_poison',
  'dr_land_spike',
];
function setup(id: string, composed = false) {
  const classId = subclassOfSkill(id)!.classId;
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      { peerId: 'a', name: 'Owner', classId, subSkills: [id] },
      { peerId: 'b', name: 'Ally', classId: 'knight' },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const [p, ally] = w.players;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  const boss = w.boss!;
  boss.pos = { x: 680, y: 400 };
  boss.hp = boss.maxHp = 10000;
  boss.buffs = [];
  boss.decisionTimer = 100;
  boss.moveSpeed = 0;
  boss.facing = Math.PI;
  if (composed)
    p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
  return { w, p, ally, boss };
}
function add(w: World, x = 690): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { x, y: 400 },
    hp: 1000,
    maxHp: 1000,
    moveSpeed: 0,
    radius: 12,
    targetId: null,
    attackCd: 0,
    buffs: [],
  };
  w.adds.push(a);
  return a;
}
function cast(w: World, p: Player) {
  resolvePlayerAbility(w, p, 'sub1', ZERO);
}
function shot(w: World) {
  const proj = w.projectiles.at(-1)!;
  proj.pos = { ...w.boss!.pos };
  (w as unknown as { resolvePlayerProjectile: (p: Projectile) => boolean }).resolvePlayerProjectile(
    proj,
  );
}
function momentum(p: Player, n: number) {
  applyBuff(p, makeBuff('rageRhythm', 0, 6, 'rageRhythm'));
  applyBuff(p, makeBuff('momentum', n, 6, 'martialMomentum'));
}
function tickZone(w: World, z: GroundZone) {
  (w as unknown as { applyZoneTick: (z: GroundZone) => void }).applyZoneTick(z);
}
afterEach(() => {
  setForgeSeed(null);
  setProceduralSeed(null);
});

describe.each([false, true])('active identities, composed=%s', (composed) => {
  it('Roar weakens nearby foes without retargeting or harming allies, then readies one counter after a melee cast', () => {
    const { w, p, boss, ally } = setup('kn_battle_menacing', composed);
    const a = add(w, 660);
    const far = add(w, 1000);
    cast(w, p);
    expect(buffMult(p, 'damageDealt')).toBe(1.3);
    expect(buffMult(boss, 'damageDealt')).toBe(0.8);
    expect(buffMult(a, 'damageDealt')).toBe(0.8);
    expect(buffMult(far, 'damageDealt')).toBe(1);
    expect(ally.buffs).toHaveLength(0);
    expect(w.tauntTargetId).toBeNull();
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(before - boss.hp).toBeCloseTo(22 * 1.3); // no counter applied midway through first cone
    expect(1000 - a.hp).toBeCloseTo(22 * 1.3);
    expect(p.buffs.find((b) => b.kind === 'counter')?.mult).toBe(1.3);
    expect(p.buffs.some((b) => b.kind === 'challengeReady')).toBe(false);
    const after = boss.hp;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(after - boss.hp).toBeCloseTo(22 * 1.3 * 1.3);
  });
  it('Bear blocks two frontal hits, readies a counter on each, preserves hard-control resistance and rear/ground counterplay', () => {
    const { w, p } = setup('bb_totem_bear', composed);
    cast(w, p);
    expect(damagePlayer(w, p, 100, { x: 700, y: 400 })).toBe(0);
    expect(p.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(1);
    expect(p.buffs.find((b) => b.kind === 'counter')?.mult).toBe(1.3);
    expect(damagePlayer(w, p, 100, { x: 700, y: 400 })).toBe(0);
    expect(p.buffs.filter((b) => b.kind === 'counter')).toHaveLength(1);
    expect(damagePlayer(w, p, 10, { x: 700, y: 400 })).toBe(8);
    applyBuff(p, makeBuff('root', 0, 3, 'test'));
    expect(p.buffs.some((b) => b.kind === 'root')).toBe(false);
    expect(damagePlayer(w, p, 10, { x: 500, y: 400 })).toBe(8);
    expect(damagePlayer(w, p, 10)).toBe(8);
  });
  it('Slam leaves a ground fissure only after spending Momentum, retaining ordinary burst otherwise', () => {
    const { w, p, boss } = setup('bb_berserker_slam', composed);
    cast(w, p);
    expect(boss.hp).toBe(9960);
    expect(w.groundZones).toHaveLength(0);
    momentum(p, 3);
    cast(w, p);
    expect(boss.hp).toBe(9908);
    const z = w.groundZones.at(-1)!;
    expect(z.damagePerTick).toBe(12);
    expect(z.radius).toBe(180);
    expect(z.duration).toBe(3);
    expect(z.pos).toEqual(p.pos);
    tickZone(w, z);
    expect(boss.hp).toBe(9896);
    expect(boss.buffs.some((b) => b.kind === 'moveSpeed' && b.mult === 0.65)).toBe(true);
    applyBuff(boss, makeBuff('flight', 0, 2, 'test'));
    tickZone(w, z);
    expect(boss.hp).toBe(9896);
  });
  it('Earth Totem is a placed slowing field with unchanged 9s recharge and useful Momentum pulses', () => {
    const { w, p, boss } = setup('bb_totem_quake', composed);
    expect(p.subAbilities!.sub1!.cooldown).toBe(9);
    momentum(p, 2);
    cast(w, p);
    const z = w.groundZones[0];
    expect(z.radius).toBe(180);
    expect(z.damagePerTick).toBeCloseTo(7.8);
    expect(z.pos.x).toBeGreaterThan(p.pos.x);
    expect(z.armRemaining).toBeGreaterThan(0);
    z.pos = { ...boss.pos };
    tickZone(w, z);
    expect(boss.hp).toBeCloseTo(9992.2);
    expect(boss.buffs.some((b) => b.kind === 'moveSpeed' && b.mult === 0.5)).toBe(true);
  });
  it('Coated Blade follows one enemy rather than poisoning a ground area, and precision strengthens it', () => {
    const { w, p, boss } = setup('ro_assassin_poison', composed);
    const a = add(w);
    cast(w, p);
    expect(w.groundZones).toHaveLength(0);
    applyBuff(p, makeBuff('precision', 1, 4, 'preparedCrit'));
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.some((b) => b.kind === 'venomReady')).toBe(true);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(boss.buffs.find((b) => b.kind === 'venom')?.mult).toBe(36);
    expect(a.buffs.some((b) => b.kind === 'venom')).toBe(false);
    boss.pos.x = 1000;
    const hp = boss.hp;
    tickVenoms(w, 1);
    expect(boss.hp).toBe(hp - 36);
    expect(p.buffs.some((b) => b.kind === 'venomReady')).toBe(false);
  });
  it('Erupting Earth launches a ranged burst, keeps base damage and rewards existing control', () => {
    const { w, p, boss } = setup('dr_land_spike', composed);
    boss.pos.x = 1000;
    cast(w, p);
    expect(w.projectiles).toHaveLength(1);
    expect(boss.hp).toBe(10000);
    applyBuff(boss, makeBuff('root', 0, 3, 'test'));
    shot(w);
    expect(boss.hp).toBe(9952.5);
  });
});

describe('timing, ownership and lifecycle limits', () => {
  it('four venom ticks are delivered through real World steps, without direct-hit recursion', () => {
    const { w, p, boss } = setup('ro_assassin_poison');
    cast(w, p);
    damageBoss(w, p, boss, 10, { direct: true });
    const hp = boss.hp;
    for (let i = 0; i < 4; i++) w.step(1, new Map());
    expect(boss.hp).toBe(hp - 96);
    expect(boss.buffs.some((b) => b.kind === 'venom')).toBe(false);
    expect(p.buffs.some((b) => b.kind === 'venomReady')).toBe(false);
  });
  it('venom has a bounded large-step tick count, preserves stronger same-caster poison, and removes disconnected ownership', () => {
    const { w, p, boss } = setup('ro_assassin_poison');
    cast(w, p);
    damageBoss(w, p, boss, 1, { direct: true, prepared: true });
    cast(w, p);
    damageBoss(w, p, boss, 1, { direct: true });
    expect(p.buffs.some((b) => b.kind === 'venomReady')).toBe(true);
    const hp = boss.hp;
    tickVenoms(w, 10);
    expect(hp - boss.hp).toBe(144);
    const venom = boss.buffs.find((b) => b.kind === 'venom')!;
    venom.remaining = 20;
    venom.venom!.accum = 0;
    tickVenoms(w, 20);
    expect(venom.venom!.ticks).toBe(8);
    w.removePlayerByPeer(p.peerId);
    tickVenoms(w, 1);
    expect(venom.remaining).toBe(0);
  });
  it('coating works without Assassin passive, misses/immune/zero hits preserve it, and separate casters own separate poison', () => {
    const { w, p, boss, ally } = setup('ro_assassin_poison');
    setSubclassPassive(p, undefined);
    cast(w, p);
    damageBoss(w, p, boss, 0, { direct: true });
    applyBuff(boss, makeBuff('invuln', 0, 2, 'test'));
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.buffs.some((b) => b.kind === 'venomReady')).toBe(true);
    boss.buffs = [];
    damageBoss(w, p, boss, 1, { direct: true });
    expect(boss.buffs.find((b) => b.kind === 'venom')?.mult).toBe(24);
    ally.subAbilities = { sub1: { ...getSubSkill('ro_assassin_poison')!.ability, slot: 'sub1' } };
    cast(w, ally);
    damageBoss(w, ally, boss, 1, { direct: true });
    expect(boss.buffs.filter((b) => b.kind === 'venom')).toHaveLength(2);
    const views = boss.buffs.map(buffView);
    expect(enemyDebuffs(views, p.id).some((b) => b.kind === 'venom' && b.own)).toBe(true);
    expect(views.find((b) => b.kind === 'venom')).not.toHaveProperty('venom');
    drawEnemyDebuffSymbol(new Graphics(), 'venom', 0, 0, 4, 0x85c75a);
  });
  it.each(['downed', 'dead', 'class', 'room', 'expiry'] as const)(
    'clears pending challenge/venom on %s without clearing already-applied poison',
    (reason) => {
      for (const id of ['kn_battle_menacing', 'ro_assassin_poison']) {
        const { w, p } = setup(id);
        cast(w, p);
        if (reason === 'downed' || reason === 'dead') p.state = reason;
        if (reason === 'class') p.classId = 'mage';
        if (reason === 'room') w.scene = 'reward';
        if (reason === 'expiry') tickBuffs(p, 6);
        w.step(0, new Map());
        expect(p.buffs.some((b) => b.kind === 'challengeReady' || b.kind === 'venomReady')).toBe(
          false,
        );
      }
    },
  );
  it('stronger existing counters are preserved; a miss does not waste the challenge', () => {
    const { w, p, boss } = setup('kn_battle_menacing');
    cast(w, p);
    boss.pos.x = 1100;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.some((b) => b.kind === 'challengeReady')).toBe(true);
    applyBuff(p, makeBuff('counter', 1.8, 4, 'counter'));
    p.aim = { x: 0, y: 0 };
    expect(p.buffs.find((b) => b.kind === 'counter')?.mult).toBe(1.8);
  });
});

describe('Evoker learns from applying control and has a visible burst follow-up', () => {
  it.each([false, true])(
    'a first Nova hit refunds its own cooldown and readies a faster Fireball, composed=%s',
    (composed) => {
      const { w, p, boss } = setup('mg_evoker_lightning');
      if (composed) {
        p.abilities!.a2 = recompose(decompose(p.abilities!.a2), p.abilities!.a2);
        p.abilities!.a1 = recompose(decompose(p.abilities!.a1), p.abilities!.a1);
      }
      const cmd: InputCommand = {
        seq: 1,
        move: ZERO,
        aim: { x: 1, y: 0 },
        buttons: {
          revive: false,
          basic: false,
          a1: false,
          a2: true,
          a3: false,
          sub1: false,
          sub2: false,
        },
      };
      w.step(0, new Map([[p.peerId, cmd]]));
      expect(p.cooldowns.a2).toBe(16);
      expect(p.buffs.some((b) => b.kind === 'evocation')).toBe(true);
      resolvePlayerAbility(w, p, 'basic', ZERO);
      expect(p.buffs.some((b) => b.kind === 'evocation')).toBe(true);
      w.step(
        0,
        new Map([[p.peerId, { ...cmd, seq: 2, buttons: { ...cmd.buttons, a2: false, a1: true } }]]),
      );
      expect(p.castTimer).toBeCloseTo(0.35);
      expect(p.buffs.some((b) => b.kind === 'evocation')).toBe(false);
      boss.pos.x = 1000;
      w.step(0.35, new Map());
      const fireball = w.projectiles.find((s) => s.impactRadius > 0)!;
      expect(fireball.damage).toBe(100);
      fireball.pos = { ...boss.pos };
      const before = boss.hp;
      shot(w);
      expect(before - boss.hp).toBe(125);
    },
  );
  it('basics, utility and ground zones preserve preparation; already-ready cooldowns and held charge preserve a trigger', () => {
    const { w, p, boss } = setup('mg_evoker_lightning');
    applyBuff(boss, makeBuff('root', 0, 4, 'test'));
    damageBoss(w, p, boss, 1, { direct: true });
    const charge = p.buffs.find((b) => b.kind === 'evocation')!;
    expect(buffBadges([buffView(charge)]).some((b) => b.label.startsWith('Evocation ready:'))).toBe(
      true,
    );
    expect(consumeEvocation(p, p.abilities!.basic)).toBe(p.abilities!.basic);
    expect(consumeEvocation(p, p.abilities!.a3)).toBe(p.abilities!.a3);
    expect(consumeEvocation(p, { ...p.abilities!.a1, kind: 'groundZone' })).toHaveProperty(
      'damage',
      80,
    );
    tickSubclassPassives(p, 6);
    damageBoss(w, p, boss, 1, { direct: true });
    expect(p.subclassPassiveCooldowns!.evoker_arcane_cadence).toBe(0);
  });
  it.each([0, 1, 2, 3])('all Evoker choices work with base Nova, pick %i', (pick) => {
    const id = getSubclass('mg_evoker')!.skills[pick].id;
    const { w, p } = setup(id);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(p.buffs.some((b) => b.kind === 'evocation')).toBe(true);
  });
  it('immune/zero hits and resisted stun do not count, while a real slow does; passive gates survive swaps', () => {
    const { w, p, boss } = setup('mg_evoker_lightning');
    damageBoss(w, p, boss, 0, { direct: true, controlOnHit: 'slow' });
    expect(p.buffs.some((b) => b.kind === 'evocation')).toBe(false);
    applyBuff(boss, makeBuff('steadfast', 0, 3, 'test'));
    damageBoss(w, p, boss, 1, { direct: true, controlOnHit: 'stun' });
    expect(p.buffs.some((b) => b.kind === 'evocation')).toBe(false);
    damageBoss(w, p, boss, 1, { direct: true, controlOnHit: 'slow' });
    expect(p.buffs.some((b) => b.kind === 'evocation')).toBe(true);
    setSubclassPassive(p, undefined);
    expect(p.buffs.some((b) => b.kind === 'evocation')).toBe(false);
    expect(p.subclassPassiveCooldowns!.evoker_arcane_cadence).toBe(6);
  });
});

describe('upgrade, Forge and difficulty-index continuity', () => {
  it.each(ids)('%s keeps copied/native mechanics and upgraded payloads', (id) => {
    const { p } = setup(id, true);
    const canonical = structuredClone(getSubSkill(id)!.ability);
    applySubSkillUpgrades(p, [`subup_${id}`]);
    applySubclassGrands(p, [`${subclassOfSkill(id)!.id}_g_a`]);
    const ab = recompose(refreshComponents(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
    expect(componentValue(decompose(ab))).toBeGreaterThanOrEqual(0);
    expect(describeAbility(ab).length).toBeGreaterThan(40);
    if (id === 'kn_battle_menacing') expect(ab.warCry!.radius).toBeGreaterThan(180);
    if (id === 'bb_totem_bear') expect(ab.frontGuard!.counter).toBe(1.3);
    if (id === 'bb_berserker_slam') expect(ab.momentumFissure).toBeGreaterThan(4);
    if (id === 'ro_assassin_poison') expect(ab.venomCoating!.damage).toBeGreaterThan(24);
    expect(getSubSkill(id)!.ability).toEqual(canonical);
  });
  it('native Earth Totem and Coated Blade retain their previous baseline offense credit', () => {
    for (const id of ['bb_totem_quake', 'ro_assassin_poison']) {
      const { p } = setup(id);
      const current = heroPowerRatio(p);
      const ab = p.subAbilities!.sub1!;
      p.subAbilities!.sub1 =
        id === 'bb_totem_quake'
          ? { ...ab, kind: 'pbaoe', damage: 26, zoneTickDamage: undefined, zoneDuration: undefined }
          : {
              ...ab,
              kind: 'groundZone',
              damage: 0,
              venomCoating: undefined,
              zoneTickDamage: 12,
              zoneDuration: 4,
            };
      expect(heroPowerRatio(p)).toBeCloseTo(current, 10);
    }
  });
  it('seeded fusions can deliver new components without unbounded coefficients', () => {
    const seen = new Set<string>();
    for (const id of ids)
      for (let seed = 1; seed <= 35; seed++) {
        const ab = { ...getSubSkill(id)!.ability, slot: 'sub1' as const };
        const def = synthesizeAbility(seed, 'retouch-b', 'a1', [
          {
            name: ab.name,
            classId: subclassOfSkill(id)!.classId,
            className: 'Donor',
            slot: 'a1',
            def: ab,
          },
          {
            name: `${ab.name} echo`,
            classId: subclassOfSkill(id)!.classId,
            className: 'Donor',
            slot: 'a1',
            def: ab,
          },
        ]).def;
        for (const eff of def.components!.effects)
          if (['warCry', 'venomCoating', 'momentumFissure'].includes(eff.kind)) seen.add(eff.kind);
        expect(Number.isFinite(def.cooldown)).toBe(true);
      }
    expect(seen).toEqual(new Set(['warCry', 'venomCoating', 'momentumFissure']));
  });
});

describe('additional poison and control boundaries', () => {
  it('poisons summons, limits overkill to effective damage and stops ticks on death', () => {
    const { w, p } = setup('ro_assassin_poison');
    const a = add(w);
    a.hp = a.maxHp = 3;
    cast(w, p);
    damageAdd(w, p, a, 1, { direct: true });
    const credited = p.stats.damageDealt;
    tickVenoms(w, 4);
    expect(p.stats.damageDealt - credited).toBe(2);
    expect(a.buffs.find((b) => b.kind === 'venom')!.venom!.ticks).toBe(1);
    const total = p.stats.damageDealt;
    tickVenoms(w, 4);
    expect(p.stats.damageDealt).toBe(total);
  });
  it('equal fresh poison preserves coating; later refresh and stronger applications replace, never stack', () => {
    const { w, p, boss } = setup('ro_assassin_poison');
    cast(w, p);
    damageBoss(w, p, boss, 1, { direct: true });
    cast(w, p);
    damageBoss(w, p, boss, 1, { direct: true });
    expect(p.buffs.some((b) => b.kind === 'venomReady')).toBe(true);
    tickBuffs(boss, 1);
    damageBoss(w, p, boss, 1, { direct: true });
    expect(p.buffs.some((b) => b.kind === 'venomReady')).toBe(false);
    expect(boss.buffs.find((b) => b.kind === 'venom')!.remaining).toBe(4);
    applySubSkillUpgrades(p, ['subup_ro_assassin_poison']);
    cast(w, p);
    damageBoss(w, p, boss, 1, { direct: true });
    expect(boss.buffs.filter((b) => b.kind === 'venom')).toHaveLength(1);
    expect(boss.buffs.find((b) => b.kind === 'venom')!.mult).toBe(27);
  });
  it.each(['room', 'dead', 'zeroHp'] as const)(
    'retouch payloads cannot arm while invalid: %s',
    (invalid) => {
      for (const id of ['kn_battle_menacing', 'ro_assassin_poison', 'bb_berserker_slam']) {
        const { w, p, boss } = setup(id);
        momentum(p, 3);
        if (invalid === 'room') w.scene = 'reward';
        if (invalid === 'dead') p.state = 'dead';
        if (invalid === 'zeroHp') p.hp = 0;
        cast(w, p);
        expect(p.buffs.some((b) => b.kind === 'challengeReady' || b.kind === 'venomReady')).toBe(
          false,
        );
        expect(boss.buffs.some((b) => b.source === 'weakness:challenge')).toBe(false);
        expect(w.groundZones).toHaveLength(0);
      }
    },
  );
  it('freeze still qualifies when a fused spell explicitly has zero stun; neutral or expired slow does not', () => {
    const { w, p } = setup('mg_evoker_lightning');
    expect(w.critRoll(p, { stun: 0, freeze: 0.5 }).controlOnHit).toBe('stun');
    expect(w.critRoll(p, { slowMult: 1, stun: 0, freeze: 0 }).controlOnHit).toBeUndefined();
    expect(w.critRoll(p, { slowMult: 0.5, slowDuration: 0 }).controlOnHit).toBeUndefined();
  });
});
