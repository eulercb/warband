import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility, stepPlayerGlide } from '../src/engine/combat/abilities';
import {
  damageBoss,
  damagePlayer,
  applyBuff,
  makeBuff,
  tickBuffs,
} from '../src/engine/combat/combat';
import {
  healSupportAlly,
  guardCrossedAlly,
  rescueStrikeMultiplier,
} from '../src/engine/combat/support';
import { absorptionAmount } from '../src/engine/combat/absorption';
import {
  onSubclassFinisher,
  onSubclassHeal,
  onSubclassOverheal,
  onSubclassChorus,
} from '../src/engine/combat/subclassPassives';
import {
  prepareCompanionWard,
  commandCompanion,
  updateCompanions,
} from '../src/engine/combat/companions';
import { getSubSkill, subclassOfSkill } from '../src/engine/content/subclasses';
import {
  decompose,
  recompose,
  refreshComponents,
  synthesizeAbility,
  setForgeSeed,
  componentValue,
} from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { applySubSkillUpgrades, applySubclassGrands } from '../src/engine/content/charUpgrades';
import { describeAbility } from '../src/engine/content/classes';
import { heroPowerRatio } from '../src/engine/content/balance';
import { ARENA_W } from '../src/engine/core/constants';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import type { Player } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
const ids = [
  'cl_life_mend',
  'cl_light_flash',
  'mo_openhand_wind',
  'rg_hunter_hail',
  'rg_hunter_mark',
];
function setup(id: string, composed = false, count = 2) {
  const classId = subclassOfSkill(id)!.classId;
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      { peerId: 'owner', name: 'Owner', classId, subSkills: [id] },
      ...Array.from({ length: count - 1 }, (_, i) => ({
        peerId: `ally${i}`,
        name: `Ally${i}`,
        classId: 'knight' as const,
      })),
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const [p, ally] = w.players;
  for (const a of w.players) a.hp = a.maxHp = 200;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  for (const a of w.players.slice(1)) a.pos = { x: 700, y: 400 };
  const boss = w.boss!;
  boss.pos = { x: 680, y: 400 };
  boss.hp = boss.maxHp = 10000;
  boss.buffs = [];
  boss.moveSpeed = 0;
  boss.decisionTimer = 100;
  if (composed)
    p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
  return { w, p, ally, boss };
}
function cast(w: World, p: Player) {
  resolvePlayerAbility(w, p, 'sub1', ZERO);
}
afterEach(() => {
  setForgeSeed(null);
  setProceduralSeed(null);
});

describe.each([false, true])('support roles composed=%s', (composed) => {
  it('Mass Cure relays effective primary healing to just one lowest-ratio ally near the recipient', () => {
    const { w, p, ally } = setup('cl_life_mend', composed, 4);
    p.hp = 80;
    ally.hp = 140;
    w.players[2].hp = 100;
    w.players[3].hp = 180;
    const before = w.players.map((a) => a.hp);
    cast(w, p);
    expect(p.hp - before[0]).toBe(100); // above rescue threshold
    expect(w.players[2].hp - before[2]).toBeCloseTo(35);
    expect(ally.hp).toBe(before[1]);
    expect(w.players[3].hp).toBe(before[3]);
    expect(p.stats.healingDone).toBe(135);
    expect(absorptionAmount(w.players[2].buffs)).toBe(0);
    const links = w.events.filter((e) => e.t === 'support' && e.kind === 'heal');
    expect(links).toHaveLength(2);
    expect(links[1]).toMatchObject({ sourceId: p.id, targetId: w.players[2].id, from: p.pos });
  });
  it('relay is recipient-centered, excludes primary/dead/downed and has no full-health primary exploit', () => {
    const { w, p, ally } = setup('cl_life_mend', composed, 4);
    p.pos = { x: 600, y: 400 };
    ally.pos = { x: 990, y: 400 };
    ally.hp = 100;
    w.players[2].pos = { x: 1040, y: 400 };
    w.players[2].hp = 150;
    w.players[3].pos = { x: 650, y: 400 };
    w.players[3].hp = 180;
    cast(w, p);
    expect(ally.hp).toBe(200);
    expect(w.players[2].hp).toBe(185);
    expect(w.players[3].hp).toBe(180);
    w.players[2].state = 'downed';
    w.players[3].state = 'dead';
    ally.hp = 199;
    healSupportAlly(w, p, ally, 100, p.subAbilities!.sub1!);
    expect(p.stats.healingDone).toBe(136);
    const hp = w.players[2].hp;
    healSupportAlly(w, p, ally, 100, p.subAbilities!.sub1!);
    expect(w.players[2].hp).toBe(hp);
  });
  it('solo primary healing remains strong, and relay measures actual healing rather than nominal or overflow', () => {
    const { w, p } = setup('cl_life_mend', composed, 1);
    p.hp = p.maxHp - 5;
    cast(w, p);
    expect(p.hp).toBe(p.maxHp);
    expect(p.stats.healingDone).toBe(5);
    expect(absorptionAmount(p.buffs)).toBeGreaterThan(0); // existing Abundance, not relay
  });
  it('Flash rescue readies the healed recipient, not the healthy caster; ticks, zero and immunity preserve it', () => {
    const { w, p, ally, boss } = setup('cl_light_flash', composed);
    ally.hp = 20;
    cast(w, p);
    expect(ally.hp).toBeCloseTo(130.5);
    expect(ally.buffs.find((b) => b.kind === 'rescueStrike')).toMatchObject({
      mult: 1.2,
      remaining: 6,
    });
    expect(p.buffs.some((b) => b.kind === 'rescueStrike')).toBe(false);
    expect(buffBadges(ally.buffs, 20).some((b) => b.label.includes('Rescue follow-through'))).toBe(
      true,
    );
    expect(damageBoss(w, ally, boss, 10)).toBe(10);
    expect(damageBoss(w, ally, boss, 0, { direct: true })).toBe(0);
    applyBuff(boss, makeBuff('invuln', 0, 1, 'test'));
    expect(damageBoss(w, ally, boss, 10, { direct: true })).toBe(0);
    boss.buffs = [];
    expect(damageBoss(w, ally, boss, 10, { direct: true })).toBe(12);
    expect(damageBoss(w, ally, boss, 10, { direct: true })).toBe(10);
    expect(ally.buffs.some((b) => b.kind === 'rescueStrike')).toBe(false);
  });
  it('Flash retains ordinary healing without granting readiness above rescue HP; copied skills do not need Light', () => {
    const { w, p, ally } = setup('cl_light_flash', composed);
    delete p.subclassPassiveId;
    ally.hp = 80;
    cast(w, p);
    expect(ally.hp).toBe(165);
    expect(ally.buffs.some((b) => b.kind === 'rescueStrike')).toBe(false);
    p.hp = 20;
    ally.hp = ally.maxHp;
    cast(w, p);
    expect(p.buffs.some((b) => b.kind === 'rescueStrike')).toBe(true);
    tickBuffs(p, 7);
    expect(p.buffs.some((b) => b.kind === 'rescueStrike')).toBe(false);
  });
  it('Wind Step protects only the first crossed ally, preserving solo heal/Flow and stronger guards', () => {
    const { w, p, ally } = setup('mo_openhand_wind', composed, 4);
    p.hp -= 30;
    ally.pos = { x: 680, y: 400 };
    w.players[2].pos = { x: 790, y: 400 };
    w.players[3].pos = { x: 670, y: 600 };
    applyBuff(ally, makeBuff('root', 0, 5, 'root'));
    applyBuff(ally, makeBuff('frontGuard', 2, 6, 'strong'));
    cast(w, p);
    expect(p.hp).toBe(p.maxHp - 8);
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(true);
    stepPlayerGlide(w, p, 0.04);
    stepPlayerGlide(w, p, 1);
    expect(ally.buffs.some((b) => b.kind === 'root')).toBe(false);
    expect(ally.buffs.find((b) => b.kind === 'frontGuard')).toMatchObject({
      mult: 2,
      remaining: 6,
    });
    expect(w.players[2].buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
    expect(w.players[3].buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
    expect(p.pos.x).toBeCloseTo(880);
  });
  it('Wind Step never supports through cover or while rooted, and a granted block is directional', () => {
    const { w, p, ally } = setup('mo_openhand_wind', composed);
    ally.pos = { x: 850, y: 400 };
    w.obstacles = [
      {
        id: w.allocId(),
        pos: { x: 700, y: 400 },
        radius: 35,
        height: 'tall',
        kind: 'pillar',
      } as (typeof w.obstacles)[number],
    ];
    cast(w, p);
    stepPlayerGlide(w, p, 1);
    expect(ally.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
    w.obstacles = [];
    p.pos = { x: 600, y: 400 };
    ally.pos = { x: 700, y: 400 };
    applyBuff(p, makeBuff('root', 0, 3, 'root'));
    cast(w, p);
    expect(p.glide).toBeNull();
    p.buffs = [];
    cast(w, p);
    stepPlayerGlide(w, p, 1);
    ally.aim = { x: 1, y: 0 };
    expect(damagePlayer(w, ally, 10, { x: 600, y: 400 })).toBe(10);
    expect(damagePlayer(w, ally, 10, { x: 800, y: 400 })).toBe(0);
  });
  it('Wind Step cannot reach through thin cover even when an ally is inside the path endcap', () => {
    const { w, p, ally } = setup('mo_openhand_wind', composed);
    ally.pos = { x: 730, y: 400 };
    w.obstacles = [{ id: w.allocId(), pos: { x: 700, y: 400 }, radius: 10, kind: 'pillar' }];
    cast(w, p);
    stepPlayerGlide(w, p, 1);
    expect(p.pos.x).toBeLessThan(700);
    expect(ally.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
  });
  it('Hail is close disengagement, retaining damage and applying slow/forced movement without moving allies', () => {
    const { w, p, ally, boss } = setup('rg_hunter_hail', composed);
    const before = { ...ally.pos };
    cast(w, p);
    expect(boss.hp).toBe(9966);
    expect(boss.shove).toBeTruthy();
    expect(boss.buffs.some((b) => b.kind === 'moveSpeed' && b.mult === 0.65)).toBe(true);
    expect(ally.pos).toEqual(before);
    expect(ally.shove).toBeUndefined();
    expect(boss.buffs.some((b) => b.source === 'hunterQuarry')).toBe(true);
  });
});

describe('growth and compatibility', () => {
  it('relay works across the arena seam with deterministic ID tie-breaking', () => {
    const { w, p, ally } = setup('cl_life_mend', false, 4);
    p.pos = { x: ARENA_W - 50, y: 400 };
    p.hp = 80;
    ally.pos = { x: 20, y: 400 };
    ally.hp = 100;
    w.players[2].pos = { x: 30, y: 400 };
    w.players[2].hp = 100;
    w.players[3].state = 'downed';
    cast(w, p);
    expect(ally.hp).toBe(135);
    expect(w.players[2].hp).toBe(100);
  });
  it.each([140, 400, 1000])('support pools use recipient HP=%i, not caster HP', (hp) => {
    const { w, p, ally } = setup('cl_life_mend');
    ally.maxHp = ally.hp = hp;
    p.maxHp = 1000;
    onSubclassOverheal(w, p, ally, 1000);
    expect(absorptionAmount(ally.buffs)).toBeCloseTo(Math.max(25, hp * 0.12));
    ally.buffs = ally.buffs.filter((b) => b.kind !== 'absorption');
    p.subclassPassiveId = 'totem_shelter';
    onSubclassFinisher(w, p, { ...p.subAbilities!.sub1!, momentumUsed: 3 });
    expect(absorptionAmount(ally.buffs)).toBeCloseTo(Math.max(20, hp * 0.1));
    ally.buffs = ally.buffs.filter((b) => b.kind !== 'absorption');
    p.classId = 'ranger';
    p.subclassPassiveId = 'beast_pack_bond';
    prepareCompanionWard(p, ally, 10);
    commandCompanion(p, w.boss!, 'boss', 1, true);
    for (let i = 0; i < 60; i++) updateCompanions(w, 1 / 60);
    expect(absorptionAmount(ally.buffs)).toBeCloseTo(Math.max(12, hp * 0.08));
  });
  it('Refrain retains deliberate next-heal routing, with an HP-aware single-recipient cap and no recursion', () => {
    const { w, p, ally } = setup('cl_life_mend');
    p.subclassPassiveId = 'whispers_echoed_refrain';
    ally.maxHp = 1000;
    ally.hp = 100;
    p.hp = p.maxHp - 10;
    onSubclassChorus(w, p, 420);
    onSubclassHeal(w, p, p, 500);
    expect(ally.hp).toBe(220);
    expect(p.buffs.some((b) => b.kind === 'refrainEcho')).toBe(false);
    expect(absorptionAmount(ally.buffs)).toBe(0);
    expect(p.stats.healingDone).toBe(120);
  });
  it('rescue readiness clears on downing, noncombat rooms and a recipient class change', () => {
    for (const mode of ['down', 'room', 'class']) {
      const { w, p } = setup('cl_light_flash', false, 1);
      p.hp = 20;
      cast(w, p);
      if (mode === 'down') p.state = 'downed';
      if (mode === 'room') w.scene = 'reward';
      if (mode === 'class') p.classId = 'knight';
      (w as unknown as { maintainCloseBursts: () => void }).maintainCloseBursts();
      expect(p.buffs.some((b) => b.kind === 'rescueStrike')).toBe(false);
    }
  });
  it('relay and rescue Forge effects are useful without separately drawing rescueHeal or a donor passive', () => {
    const { w, p, ally, boss } = setup('cl_light_flash');
    p.subAbilities!.sub1 = recompose(
      {
        delivery: { kind: 'heal', range: 420 },
        effects: [
          { kind: 'heal', amount: 20 },
          { kind: 'rescueStrike', strike: { mult: 1.2, duration: 6 } },
        ],
      },
      { slot: 'sub1', name: 'Borrowed rescue', cooldown: 5 },
    );
    p.subclassPassiveId = undefined;
    ally.hp = 10;
    cast(w, p);
    expect(ally.hp).toBe(30);
    expect(damageBoss(w, ally, boss, 10, { direct: true })).toBe(12);
  });
  it.each(ids)('%s keeps native/composed, Honed and subclass-grand payloads', (id) => {
    const raw = getSubSkill(id)!.ability;
    const comp = decompose(raw);
    const copy = recompose(comp, { ...raw, slot: 'sub1' });
    for (const k of [
      'relayHeal',
      'rescueStrike',
      'crossingGuard',
      'knockback',
      'slowMult',
      'pierce',
    ] as const)
      expect(copy[k]).toEqual(raw[k]);
    expect(componentValue(comp)).toBeGreaterThan(0);
    const { p } = setup(id);
    p.subAbilities = { sub1: copy };
    const subs = p.subAbilities;
    applySubSkillUpgrades(p, [`subup_${id}`]);
    applySubclassGrands(p, [`${subclassOfSkill(id)!.id}_g_a`]);
    const refreshed = recompose(refreshComponents(subs.sub1!), subs.sub1!);
    expect(refreshed.damage).toBeGreaterThanOrEqual(raw.damage);
    if (raw.relayHeal) {
      expect(refreshed.relayHeal!.fraction).toBe(0.35);
      expect(refreshed.relayHeal!.radius).toBeGreaterThan(raw.relayHeal.radius);
    }
    if (raw.rescueStrike) {
      expect(refreshed.rescueStrike!.mult).toBe(1.2);
      expect(refreshed.rescueStrike!.duration).toBeGreaterThan(raw.rescueStrike.duration);
    }
    if (raw.crossingGuard) {
      expect(refreshed.crossingGuard!.width).toBeGreaterThan(raw.crossingGuard.width);
      expect(refreshed.crossingGuard!.duration).toBeGreaterThan(raw.crossingGuard.duration);
    }
    expect(refreshed.knockback).toBe(raw.knockback);
    expect(refreshed.pierce).toBe(raw.pierce);
    expect(describeAbility(refreshed)).not.toContain('NaN');
  });
  it('repeat rescues refresh one preparation without weakening a stronger readiness or stacking hits', () => {
    const { w, p, ally, boss } = setup('cl_light_flash');
    ally.hp = 20;
    cast(w, p);
    const charge = ally.buffs.find((b) => b.kind === 'rescueStrike')!;
    charge.mult = 1.3;
    charge.remaining = 2;
    ally.hp = 20;
    cast(w, p);
    expect(ally.buffs.filter((b) => b.kind === 'rescueStrike')).toHaveLength(1);
    expect(charge.mult).toBe(1.3);
    expect(charge.remaining).toBe(6);
    expect(damageBoss(w, ally, boss, 10, { direct: true })).toBe(13);
    expect(damageBoss(w, ally, boss, 10, { direct: true })).toBe(10);
  });
  it('one large Wind Step tick chooses the nearest ally and breaks equal-distance ties by ID', () => {
    for (const tie of [false, true]) {
      const { w, p, ally } = setup('mo_openhand_wind', false, 4);
      ally.pos = { x: 680, y: 400 };
      w.players[2].pos = { x: tie ? 680 : 740, y: 400 };
      w.players[3].pos = { x: 780, y: 400 };
      w.players.reverse();
      cast(w, p);
      stepPlayerGlide(w, p, 1);
      expect(ally.buffs.some((b) => b.kind === 'frontGuard')).toBe(true);
      expect(
        w.players
          .filter((a) => a !== ally)
          .some((a) => a.buffs.some((b) => b.kind === 'frontGuard')),
      ).toBe(false);
    }
  });
  it.each(['relayHeal', 'rescueStrike', 'crossingGuard'] as const)(
    'Forge refresh preserves an existing %s payload when a replay step lacks its flat field',
    (key) => {
      const id =
        key === 'relayHeal'
          ? 'cl_life_mend'
          : key === 'rescueStrike'
            ? 'cl_light_flash'
            : 'mo_openhand_wind';
      const { p } = setup(id, true);
      const ab = p.subAbilities!.sub1!;
      const before = structuredClone(ab[key]);
      delete ab[key];
      const refreshed = recompose(refreshComponents(ab), ab);
      expect(refreshed[key]).toEqual(before);
    },
  );
  it('invalid caster states and zero movement cannot grant crossing support or consume rescue readiness', () => {
    const { w, p, ally } = setup('mo_openhand_wind');
    const ab = p.subAbilities!.sub1!;
    for (const invalid of ['down', 'hp', 'room', 'stationary']) {
      p.state = invalid === 'down' ? 'downed' : 'alive';
      p.hp = invalid === 'hp' ? 0 : p.maxHp;
      w.scene = invalid === 'room' ? 'reward' : null;
      expect(guardCrossedAlly(w, p, ab, p.pos, invalid === 'stationary' ? p.pos : ally.pos)).toBe(
        false,
      );
    }
    p.buffs = [makeBuff('rescueStrike', 1.2, 6, `rescueStrike:${p.classId}`)];
    p.state = 'downed';
    expect(rescueStrikeMultiplier(p, true)).toBe(1);
    p.state = 'alive';
    p.hp = 0;
    expect(rescueStrikeMultiplier(p, true)).toBe(1);
    expect(p.buffs).toHaveLength(1);
  });
  it('seeded Forge generation stays finite and routes support effects only to supported deliveries', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 35; seed++) {
      for (const id of ids) {
        const base = { ...getSubSkill(id)!.ability, slot: 'sub1' as const };
        const generated = synthesizeAbility(
          seed,
          `coherence-c:${id}`,
          'a1',
          [0, 1].map((i) => ({
            name: `${base.name} donor ${i}`,
            classId: subclassOfSkill(id)!.classId,
            className: 'Donor',
            slot: 'a1',
            def: base,
          })),
        ).def;
        expect(Number.isFinite(generated.damage)).toBe(true);
        for (const effect of generated.components!.effects)
          if (['relayHeal', 'rescueStrike', 'crossingGuard'].includes(effect.kind))
            seen.add(effect.kind);
        if (generated.relayHeal || generated.rescueStrike) expect(generated.kind).toBe('heal');
        if (generated.crossingGuard) expect(generated.kind).toBe('dash');
      }
    }
    expect(seen).toEqual(new Set(['relayHeal', 'rescueStrike', 'crossingGuard']));
  });
  it('new support riders retain baseline difficulty credit', () => {
    for (const id of ['cl_life_mend', 'cl_light_flash', 'mo_openhand_wind']) {
      const { w, p } = setup(id);
      const ratio = heroPowerRatio(p);
      delete p.subAbilities!.sub1!.relayHeal;
      delete p.subAbilities!.sub1!.rescueStrike;
      delete p.subAbilities!.sub1!.crossingGuard;
      expect(heroPowerRatio(p)).toBe(ratio);
      expect(w.players).toHaveLength(2);
    }
  });
});
