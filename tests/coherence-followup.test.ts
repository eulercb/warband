import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { applyBuff, damageBoss, makeBuff } from '../src/engine/combat/combat';
import { subclassDamageMultiplier } from '../src/engine/combat/subclassPassives';
import type { GroundZone, MonsterId, Player } from '../src/engine/core/types';
import {
  componentValue,
  decompose,
  recompose,
  setForgeSeed,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { CLASSES, describeAbility } from '../src/engine/content/classes';
import { getSubclass } from '../src/engine/content/subclasses';
import { previewAbilityTable, previewSubAbility } from '../src/engine/content/charUpgrades';

const ZERO = { x: 0, y: 0 };
afterEach(() => setForgeSeed(null));
function setup(
  classId: 'rogue' | 'warlock',
  upgrades: string[] = [],
  skill?: string,
  monsterId: MonsterId = 'lich',
) {
  const w = new World({
    monsterId,
    seed: 31,
    players: [
      { peerId: 'a', name: 'A', classId, charUpgrades: upgrades, subSkills: skill ? [skill] : [] },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    boss = w.boss!;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  boss.pos = { x: 650, y: 400 };
  boss.hp = boss.maxHp = 10000;
  boss.moveSpeed = 0;
  boss.decisionTimer = 100;
  boss.buffs = [];
  return { w, p, boss };
}
function impact(w: World) {
  for (const shot of w.projectiles) shot.pos = { ...w.boss!.pos };
  (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0);
}
function tickZone(w: World) {
  const z = w.groundZones.at(-1)!;
  z.pos = { ...w.boss!.pos };
  z.armRemaining = 0;
  (w as unknown as { applyZoneTick(zone: GroundZone): void }).applyZoneTick(z);
  return z;
}

describe('pilot ability coherence', () => {
  it('keeps only the ordinary Assassin refund and the authored Hex follow/direct retort owners', () => {
    expect(previewAbilityTable('rogue', ['ro_assassin']).a1.preparedRefund).toBe(1);
    expect(previewAbilityTable('rogue', ['ro_assassin_g_a']).a1.preparedRefund).toBeUndefined();
    expect(
      previewSubAbility('ro_assassin_strike', ['ro_assassin_strike_g'])!.preparedRefund,
    ).toBeUndefined();
    expect(previewAbilityTable('warlock', ['wa_fiend_g_a']).a1.zoneFollow).toBeUndefined();
    expect(previewAbilityTable('warlock', ['wa_gk_a1_a']).a1.zoneFollow).toBe(3);
    expect(previewAbilityTable('warlock', ['wa_rebuke']).a2.rebukeDirect).toBe(true);
    expect(previewAbilityTable('warlock', ['wa_gk_a2_a']).a2.rebukeDirect).toBeUndefined();
    expect(previewAbilityTable('warlock', ['wa_fiend_g_a']).a2.rebukeDirect).toBeUndefined();
    expect(CLASSES.rogue.abilities.a2.kind).toBe('blink');
    expect(
      getSubclass('ro_trickster')!.skills.find((s) => s.id === 'ro_trickster_step')!.ability.kind,
    ).toBe('meleeCone');
    expect(CLASSES.warlock.abilities.a2.kind).toBe('pbaoe');
    expect(
      getSubclass('wa_fiend')!.skills.find((s) => s.id === 'wa_fiend_rebuke')!.ability
        .infernalClaim,
    ).toBe(true);
  });

  it('keeps ordinary, identity and skill-grand Rogue payoffs distinct in one active kit', () => {
    const { w, p, boss } = setup(
      'rogue',
      ['ro_assassin', 'ro_assassin_g_a', 'ro_assassin_strike_g'],
      'ro_assassin_strike',
    );
    boss.hp = boss.maxHp * 0.45;
    expect(subclassDamageMultiplier(p, boss, { direct: true, prepared: true })).toBe(1.3);
    p.cooldowns.a2 = 5;
    applyBuff(p, makeBuff('precision', 1, 4, 'test'));
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.cooldowns.a2).toBe(4); // ordinary Assassinate only
    applyBuff(p, makeBuff('precision', 1, 4, 'test'));
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(boss.buffs.some((b) => b.kind === 'grandOpening')).toBe(true);
    expect(p.cooldowns.a2).toBe(4); // skill grand marks; it does not refund
  });

  it('keeps ordinary, base-grand and Fiend-identity Rebuke payoffs distinct in one kit', () => {
    const { w, p, boss } = setup(
      'warlock',
      ['wa_rebuke', 'wa_gk_a2_a', 'wa_fiend_g_a'],
      'wa_fiend_hurl',
    );
    applyBuff(boss, makeBuff('curse', 1.15, 4, `curse:${p.id}:hex`));
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(p.buffs.some((b) => b.kind === 'rebuke' && b.retaliation?.direct)).toBe(true);
    const before = boss.hp;
    damageBoss(w, p, boss, 1, { direct: true });
    expect(boss.hp).toBeLessThan(before - 1); // ordinary proactive retort
    expect(p.buffs.some((b) => b.source === 'infernalCataclysm')).toBe(true); // base grand
    damageBoss(w, p, boss, 1, { direct: true });
    damageBoss(w, p, boss, 1, { direct: true });
    expect(p.subclassPassiveCooldowns?.['grand:wa_fiend_g_a']).toBe(4); // identity
  });

  it.each([false, true])(
    'Mage Hand Bolt prepares only on a positive impact, composed=%s',
    (composed) => {
      const { w, p, boss } = setup('rogue', [], 'ro_trickster_bolt');
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
      resolvePlayerAbility(w, p, 'sub1', ZERO);
      expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
      applyBuff(boss, makeBuff('invuln', 1, 2, 'test'));
      impact(w);
      expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
      boss.buffs = [];
      resolvePlayerAbility(w, p, 'sub1', ZERO);
      impact(w);
      expect(p.buffs.find((b) => b.kind === 'precision')?.remaining).toBe(4);
    },
  );

  it.each([false, true])(
    'Mirror Cut spends preparation for phase and one echo, composed=%s',
    (composed) => {
      const { w, p, boss } = setup('rogue', ['ro_trickster_step_g'], 'ro_trickster_step');
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
      applyBuff(p, makeBuff('precision', 1, 4, 'test'));
      resolvePlayerAbility(w, p, 'sub1', ZERO);
      expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
      expect(p.buffs.find((b) => b.source === 'mirrorCut')?.remaining).toBe(0.35);
      expect(boss.hp).toBeLessThan(boss.maxHp - 48);
    },
  );

  it.each([false, true])(
    'Infernal Claim needs an own living curse before cooldown and wards from primary damage, composed=%s',
    (composed) => {
      const { w, p, boss } = setup('warlock', ['wa_fiend_rebuke_g'], 'wa_fiend_rebuke');
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
      const use = (
        w as unknown as { tryUseAbility(player: Player, slot: 'sub1', dir: typeof ZERO): void }
      ).tryUseAbility.bind(w);
      applyBuff(p, makeBuff('precision', 1, 4, 'test'));
      use(p, 'sub1', ZERO);
      expect(p.cooldowns.sub1 ?? 0).toBe(0);
      expect(p.buffs.some((b) => b.kind === 'precision')).toBe(true);
      expect(w.events.some((e) => e.t === 'cast' && e.ability === 'Infernal Claim')).toBe(false);
      applyBuff(boss, makeBuff('curse', 1.15, 4, `curse:${p.id}:hex`));
      use(p, 'sub1', ZERO);
      expect(p.cooldowns.sub1).toBeGreaterThanOrEqual(4);
      expect(boss.hp).toBeLessThan(boss.maxHp);
      expect(p.buffs.find((b) => b.kind === 'absorption')?.mult).toBeGreaterThan(0);
      expect(p.buffs.find((b) => b.kind === 'rebuke')).toBeUndefined();
    },
  );

  it('caps Claim target search with Honed ranks, Haste and its grand equipped', () => {
    const w = new World({
      monsterId: 'lich',
      seed: 31,
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'warlock',
          subSkills: ['wa_fiend_rebuke'],
          charUpgrades: [
            ...Array.from({ length: 5 }, () => 'subup_wa_fiend_rebuke'),
            'wa_fiend_rebuke_g',
          ],
          upgrades: Array.from({ length: 5 }, () => 'haste'),
        },
      ],
    });
    w.scene = null;
    w.obstacles = [];
    const p = w.players[0],
      boss = w.boss!;
    p.pos = { x: 600, y: 400 };
    p.aim = { x: 1, y: 0 };
    boss.pos = { x: 1050, y: 400 };
    boss.hp = boss.maxHp = 10000;
    applyBuff(boss, makeBuff('curse', 1.15, 4, `curse:${p.id}:hex`));
    const use = (
      w as unknown as { tryUseAbility(player: Player, slot: 'sub1', dir: typeof ZERO): void }
    ).tryUseAbility.bind(w);
    expect(describeAbility(p.subAbilities!.sub1!)).toContain('within 400u');
    use(p, 'sub1', ZERO);
    expect(p.cooldowns.sub1 ?? 0).toBe(0);
    boss.pos.x = 990;
    use(p, 'sub1', ZERO);
    expect(p.cooldowns.sub1).toBeGreaterThanOrEqual(4);
    expect(boss.hp).toBeLessThan(boss.maxHp);
  });

  it('prices a synthesized Infernal Claim and brands its aimed foe when the forged kit lacks Hex', () => {
    const authored = getSubclass('wa_fiend')!.skills.find(
      (s) => s.id === 'wa_fiend_rebuke',
    )!.ability;
    const plain = { ...authored, infernalClaim: undefined };
    expect(componentValue(decompose(authored))).toBeGreaterThan(componentValue(decompose(plain)));
    const synthesized = synthesizeAbility(31, 'claim-only', 'a2', [
      {
        name: authored.name,
        classId: 'warlock',
        className: 'Warlock',
        slot: 'a2',
        def: authored,
      },
    ]).def;
    expect(synthesized.infernalClaim).toBe(true);
    expect(synthesized.forgeClaimFallback).toBe(true);
    expect(describeAbility(synthesized)).toContain('brand an aimed foe');
    const { w, p, boss } = setup('warlock');
    p.abilities!.a2 = synthesized;
    const use = (
      w as unknown as { tryUseAbility(player: Player, slot: 'a2', dir: typeof ZERO): void }
    ).tryUseAbility.bind(w);
    boss.pos.x = 500;
    use(p, 'a2', ZERO);
    expect(p.cooldowns.a2).toBe(0);
    expect(boss.buffs.some((b) => b.kind === 'curse')).toBe(false);
    boss.pos.x = 650;
    use(p, 'a2', ZERO);
    expect(p.cooldowns.a2).toBeGreaterThanOrEqual(4);
    expect(boss.hp).toBeLessThan(boss.maxHp);
    expect(boss.buffs.some((b) => b.source === `curse:${p.id}:searing`)).toBe(true);
  });

  it('forged Fiend kits without a curse source seed a neutral mark before cadence', () => {
    for (const first of ['wa_fiend_hurl', 'wa_fiend_rebuke', 'wa_fiend_resilience']) {
      let found = false;
      for (let seed = 0; seed < 40 && !found; seed++) {
        setForgeSeed(seed);
        const { w, p, boss } = setup('warlock', ['wa_fiend_g_a'], first);
        const kit = [...Object.values(p.abilities!), ...Object.values(p.subAbilities ?? {})].filter(
          (ab) => ab != null,
        );
        const hasProducer = kit.some(
          (ab) =>
            ((ab.kind === 'groundZone' || ab.kind === 'projectile') && (ab.curseBonus ?? 0) > 0) ||
            (ab.rebukeCurseBonus ?? 0) > 0 ||
            (ab.infernalClaim && ab.forgeClaimFallback),
        );
        if (!Object.values(p.abilities!).some((ab) => ab.components) || hasProducer) continue;
        found = true;
        damageBoss(w, p, boss, 1, { direct: true });
        expect(boss.buffs.find((b) => b.source === `curse:${p.id}:searing`)?.mult, first).toBe(1);
        expect(
          p.buffs.some((b) => b.kind === 'grandCadence'),
          first,
        ).toBe(false);
        for (let i = 0; i < 3; i++) damageBoss(w, p, boss, 1, { direct: true });
        expect(p.subclassPassiveCooldowns?.['grand:wa_fiend_g_a'], first).toBe(4);
      }
      expect(found, `no source-free forged kit found for ${first}`).toBe(true);
    }
    setForgeSeed(7);
    const pit = setup('warlock', ['wa_fiend_g_a'], 'wa_fiend_pit');
    setForgeSeed(null);
    pit.p.subAbilities!.sub1 = {
      ...getSubclass('wa_fiend')!.skills.find((s) => s.id === 'wa_fiend_pit')!.ability,
      slot: 'sub1',
    };
    damageBoss(pit.w, pit.p, pit.boss, 1, { direct: true });
    expect(pit.boss.buffs.some((b) => b.source === `curse:${pit.p.id}:searing`)).toBe(false);
  });

  it('Hex reaches native, copied and composed flying targets while Fire Pit stays ground-bound', () => {
    for (const variant of ['native', 'copied', 'composed'] as const) {
      const { w, p, boss } = setup(
        variant === 'copied' ? 'rogue' : 'warlock',
        variant === 'copied' ? ['hy_hexbrand'] : [],
      );
      if (variant === 'composed')
        p.abilities!.a1 = recompose(decompose(p.abilities!.a1), p.abilities!.a1);
      applyBuff(boss, makeBuff('flight', 1, 4, 'test'));
      resolvePlayerAbility(w, p, variant === 'copied' ? 'a3' : 'a1', ZERO);
      const z = tickZone(w);
      expect(z.airborne, variant).toBe(true);
      expect(boss.hp, variant).toBeLessThan(boss.maxHp);
      expect(
        boss.buffs.some((b) => b.kind === 'curse'),
        variant,
      ).toBe(true);
    }
    const { w, p, boss } = setup('warlock', [], 'wa_fiend_pit');
    applyBuff(boss, makeBuff('flight', 1, 4, 'test'));
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    const z = tickZone(w);
    expect(z.airborne).toBe(false);
    expect(boss.hp).toBe(boss.maxHp);
    expect(boss.buffs.some((b) => b.kind === 'curse')).toBe(false);
    expect(recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!).airborne).toBe(false);
    const staticFlyer = setup('warlock', [], undefined, 'harpy');
    expect(staticFlyer.w.bossFlying(staticFlyer.boss)).toBe(true);
    resolvePlayerAbility(staticFlyer.w, staticFlyer.p, 'a1', ZERO);
    tickZone(staticFlyer.w);
    expect(staticFlyer.boss.hp).toBeLessThan(staticFlyer.boss.maxHp);
  });
});
