import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  applyBuff,
  damageBoss,
  damageAdd,
  damagePlayer,
  makeBuff,
  tickBuffs,
} from '../src/engine/combat/combat';
import { tickSubclassPassives } from '../src/engine/combat/subclassPassives';
import { activeSubclassPassive, getSubclass } from '../src/engine/content/subclasses';
import { getClass } from '../src/engine/content/classes';
import { decompose, recompose, setForgeSeed } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import type { Add, ClassId, GroundZone } from '../src/engine/core/types';

const ZERO = { x: 0, y: 0 };
function world(classId: ClassId, subSkills: string[] = [], extraClasses: ClassId[] = []) {
  const w = new World({
    monsterId: 'dragon',
    seed: 41,
    players: [
      { peerId: 'a', name: 'A', classId, subSkills, extraClasses },
      { peerId: 'b', name: 'B', classId: 'knight' },
    ],
  });
  const p = w.players[0];
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  for (const ab of Object.values(p.abilities!)) ab.critChanceBonus = 0;
  w.boss!.pos = { x: 640, y: 400 };
  w.boss!.facing = Math.PI;
  w.boss!.hp = 1000;
  w.boss!.maxHp = 1000;
  return w;
}
function prepare(w: World) {
  resolvePlayerAbility(w, w.players[0], 'a2', ZERO);
  w.players[0].pos = { x: 600, y: 400 };
}
function curse(w: World, owner = w.players[0]) {
  applyBuff(w.boss!, makeBuff('curse', 1.15, 3, `curse:${owner.id}`));
}
function add(w: World): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { x: 640, y: 400 },
    hp: 1000,
    maxHp: 1000,
    radius: 12,
    moveSpeed: 0,
    targetId: null,
    attackCd: 0,
    buffs: [],
  };
  w.adds.push(a);
  return a;
}

describe('passive ownership', () => {
  it.each(['ro_assassin', 'ro_trickster', 'wa_fiend', 'wa_great_old_one'])(
    'any %s skill unlocks the same passive without another slot',
    (sub) => {
      const def = getSubclass(sub)!;
      for (const skill of def.skills) {
        const w = world(def.classId, [skill.id]);
        const p = w.players[0];
        expect(p.subclassPassiveId).toBe(def.passive!.id);
        expect(p.subAbilities?.sub1?.name).toBeTruthy();
        expect(p.subAbilities?.sub2).toBeUndefined();
        expect(activeSubclassPassive(def.classId, [skill.id])).toEqual(def.passive);
      }
    },
  );
  it('does not grant a passive from a graft, an invalid skill, another class or an unimplemented subclass', () => {
    expect(world('rogue').players[0].subclassPassiveId).toBeUndefined();
    const w = world('knight', ['ro_assassin_strike']);
    w.players[0].abilities!.a2 = { ...getClass('rogue').abilities.a2 };
    prepare(w);
    expect(w.players[0].subclassPassiveId).toBeUndefined();
    expect(world('rogue', ['not-a-skill']).players[0].subclassPassiveId).toBeUndefined();
    expect(world('mage', ['mg_evoker_lightning']).players[0].subclassPassiveId).toBeUndefined();
  });
  it('retains authored passive identity under numeric variance and Forge', () => {
    try {
      setProceduralSeed(23);
      expect(getSubclass('ro_trickster')?.passive?.id).toBe('trickster_spellblade');
      setForgeSeed(34);
      expect(getSubclass('wa_fiend')?.passive?.id).toBe('fiend_soul_ember');
      expect(world('warlock', ['wa_fiend_hurl']).players[0].subclassPassiveId).toBe(
        'fiend_soul_ember',
      );
    } finally {
      setForgeSeed(null);
      setProceduralSeed(null);
    }
  });
});

describe("Assassin: Death's Opening", () => {
  it('adds crit damage to a prepared base strike, and adds finishing damage at low health', () => {
    const w = world('rogue', ['ro_assassin_smoke']);
    const p = w.players[0];
    prepare(w);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.boss!.hp).toBe(900);
    w.boss!.hp = 350;
    prepare(w);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.boss!.hp).toBeCloseTo(235);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
  });
  it('does not empower ordinary crits or grant preparation itself', () => {
    const w = world('rogue', ['ro_assassin_poison']);
    const p = w.players[0];
    p.critChance = 1;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.boss!.hp).toBe(910);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
  });
  it('supports subclass and composed precision attacks, including adds', () => {
    const w = world('rogue', ['ro_assassin_strike']);
    const p = w.players[0];
    const a = add(w);
    w.boss!.pos.x += 1000;
    a.hp = 350;
    p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
    prepare(w);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(350 - a.hp).toBeCloseTo(60 * 2.1 * 1.15);
  });
});

describe('Trickster: Spellblade', () => {
  it('a base utility action empowers exactly one connecting melee hit; misses preserve it', () => {
    const w = world('rogue', ['ro_trickster_shield']);
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(true);
    p.aim = { x: -1, y: 0 };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(true);
    p.aim = { x: 1, y: 0 };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(w.boss!.hp).toBeCloseTo(978.4);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(w.boss!.hp).toBeCloseTo(960.4);
  });
  it('uses subclass magic, preserves readiness on an invulnerable boss and respects the proc cooldown', () => {
    const w = world('rogue', ['ro_trickster_bolt']);
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    applyBuff(w.boss!, makeBuff('invuln', 0, 2, 'test'));
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(true);
    tickBuffs(w.boss!, 2.1);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.boss!.hp).toBeCloseTo(940);
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(false);
    tickSubclassPassives(p, 6);
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(true);
  });
  it('expires and is not prepared by basics, melee skills, rooted mobility, or an empty slot', () => {
    const w = world('rogue', ['ro_trickster_step']);
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'basic', ZERO);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    resolvePlayerAbility(w, p, 'sub2', ZERO);
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(false);
    applyBuff(p, makeBuff('root', 0, 2, 'test'));
    prepare(w);
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(false);
    tickBuffs(p, 2.1);
    prepare(w);
    tickBuffs(p, 5.1);
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(false);
  });
  it('works with a grafted spell and consumes on an add, not ranged damage', () => {
    const w = world('rogue', ['ro_trickster_snare']);
    const p = w.players[0];
    const a = add(w);
    w.boss!.pos.x += 1000;
    p.abilities!.a1 = { ...getClass('mage').abilities.a1, slot: 'a1' };
    resolvePlayerAbility(w, p, 'a1', ZERO);
    damageAdd(w, p, a, 10);
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(true);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(a.hp).toBeCloseTo(968.4);
  });
});

describe('Fiend: Soul Ember', () => {
  it('rewards personal curse damage with attributed healing and a short ward, once per cooldown', () => {
    const w = world('warlock', ['wa_fiend_resilience']);
    const p = w.players[0];
    p.hp = 80;
    curse(w);
    damageBoss(w, p, w.boss!, 100);
    expect(p.hp).toBeCloseTo(86.5);
    expect(p.stats.healingDone).toBeCloseTo(6.5);
    damageBoss(w, p, w.boss!, 100);
    expect(p.hp).toBeCloseTo(86.5);
    damagePlayer(w, p, 10);
    expect(p.hp).toBeCloseTo(77.5);
    tickBuffs(p, 3.1);
    damagePlayer(w, p, 10);
    expect(p.hp).toBeCloseTo(67.5);
    tickSubclassPassives(p, 6);
    damageBoss(w, p, w.boss!, 100);
    expect(p.hp).toBeCloseTo(74);
  });
  it("does not proc on another owner's curse, zero damage, invulnerability or a dead caster", () => {
    const w = world('warlock', ['wa_fiend_rebuke']);
    const p = w.players[0];
    p.hp = 80;
    curse(w, w.players[1]);
    damageBoss(w, p, w.boss!, 10);
    expect(p.hp).toBe(80);
    curse(w);
    damageBoss(w, p, w.boss!, 0);
    expect(p.hp).toBe(80);
    applyBuff(w.boss!, makeBuff('invuln', 0, 1, 'test'));
    damageBoss(w, p, w.boss!, 100);
    expect(p.hp).toBe(80);
    tickBuffs(w.boss!, 1.1);
    p.state = 'dead';
    p.hp = 0;
    damageBoss(w, p, w.boss!, 10);
    expect(p.hp).toBe(0);
    expect(p.buffs.some((b) => b.source.startsWith('subclass:'))).toBe(false);
  });
  it('supports curse zones and cursed adds, caps healing at max health and does not stack wards', () => {
    const w = world('warlock', ['wa_fiend_hurl']);
    const p = w.players[0];
    p.hp = p.maxHp - 1;
    const a = add(w);
    applyBuff(a, makeBuff('curse', 1.15, 5, `curse:${p.id}`));
    damageAdd(w, p, a, 10);
    expect(p.hp).toBe(p.maxHp);
    expect(p.stats.healingDone).toBe(1);
    tickSubclassPassives(p, 6);
    damageAdd(w, p, a, 10);
    expect(p.buffs.filter((b) => b.source === 'subclass:fiend_soul_ember')).toHaveLength(1);
    tickSubclassPassives(p, 6);
    p.hp = 80;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const z = w.groundZones.at(-1)!;
    z.pos = { ...w.boss!.pos };
    (w as unknown as { applyZoneTick: (z: GroundZone) => void }).applyZoneTick(z);
    expect(p.hp).toBeGreaterThan(80);
  });
});

describe('Great Old One: Dread Insight', () => {
  it.each(['root', 'stun', 'moveSpeed', 'castSlow'] as const)(
    'exploits a personal curse plus %s',
    (kind) => {
      const w = world('warlock', ['wa_goo_blast']);
      const p = w.players[0];
      curse(w);
      applyBuff(
        w.boss!,
        makeBuff(kind, kind === 'moveSpeed' ? 0.5 : kind === 'castSlow' ? 1.4 : 0, 3, 'test'),
      );
      expect(damageBoss(w, p, w.boss!, 100)).toBeCloseTo(124.2);
      expect(damageBoss(w, w.players[1], w.boss!, 100)).toBe(100);
    },
  );
  it('requires both effects; haste and neutral wind-up do not count', () => {
    const w = world('warlock', ['wa_goo_whispers']);
    const p = w.players[0];
    applyBuff(w.boss!, makeBuff('moveSpeed', 0.5, 2, 'slow'));
    expect(damageBoss(w, p, w.boss!, 100)).toBe(100);
    w.boss!.buffs = [];
    curse(w);
    expect(damageBoss(w, p, w.boss!, 100)).toBeCloseTo(115);
    applyBuff(w.boss!, makeBuff('moveSpeed', 1.2, 2, 'haste'));
    applyBuff(w.boss!, makeBuff('castSlow', 1, 2, 'neutral'));
    expect(damageBoss(w, p, w.boss!, 100)).toBeCloseTo(115);
  });
  it('works on cursed controlled adds and ignores expired control', () => {
    const w = world('warlock', ['wa_goo_tentacle']);
    const p = w.players[0];
    const a = add(w);
    applyBuff(a, makeBuff('curse', 1.15, 3, `curse:${p.id}`));
    applyBuff(a, makeBuff('root', 0, 2, 'test'));
    expect(damageAdd(w, p, a, 100)).toBeCloseTo(124.2);
    a.buffs.find((b) => b.kind === 'root')!.remaining = 0;
    expect(damageAdd(w, p, a, 100)).toBeCloseTo(115);
  });
});

describe('swap, timers, snapshots and replay', () => {
  it('changes active passives, discards prepared passive effects and preserves cooldowns across swaps', () => {
    const w = world('rogue', ['ro_trickster_step', 'wa_fiend_hurl'], ['warlock']);
    const p = w.players[0];
    prepare(w);
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(true);
    w.setActiveClass(p, 'warlock');
    expect(p.subclassPassiveId).toBe('fiend_soul_ember');
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(false);
    curse(w);
    damageBoss(w, p, w.boss!, 10);
    w.setActiveClass(p, 'rogue');
    prepare(w);
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(false);
    (w as unknown as { tickTimers: (dt: number) => void }).tickTimers(6);
    prepare(w);
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(true);
    w.setActiveClass(p, 'warlock');
    expect(p.subclassPassiveCooldowns?.fiend_soul_ember).toBe(0);
  });
  it('removes the active passive on a swap to a class with no subclass', () => {
    const w = world('rogue', ['ro_trickster_shield'], ['knight']);
    const p = w.players[0];
    prepare(w);
    w.setActiveClass(p, 'knight');
    expect(p.subclassPassiveId).toBeUndefined();
    expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(false);
    w.setActiveClass(p, 'rogue');
    expect(p.subclassPassiveId).toBe('trickster_spellblade');
  });
  it('reproduces outcomes deterministically and sends readiness, not private proc state', () => {
    const run = () => {
      const w = world('rogue', ['ro_trickster_shield']);
      prepare(w);
      const snap = w.serialize();
      expect(snap.players[0].buffs.some((b) => b.kind === 'spellblade')).toBe(true);
      expect(snap.players[0]).not.toHaveProperty('subclassPassiveCooldowns');
      resolvePlayerAbility(w, w.players[0], 'a1', ZERO);
      return { snap: w.serialize(), events: w.events };
    };
    expect(run()).toEqual(run());
    expect(buffBadges([{ kind: 'spellblade', mult: 1.2, remaining: 3 }])[0].label).toMatch(
      /next melee hit/,
    );
  });
});

it('zero-output and already-defeated targets cannot consume Spellblade readiness', () => {
  const w = world('rogue', ['ro_trickster_shield']);
  const p = w.players[0];
  prepare(w);
  p.damageMult = 0;
  resolvePlayerAbility(w, p, 'basic', ZERO);
  expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(true);
  const a = add(w);
  damageAdd(w, p, a, 10, { melee: true });
  expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(true);
  p.damageMult = 1;
  a.hp = 0;
  damageAdd(w, p, a, 10, { melee: true });
  w.boss!.hp = 0;
  damageBoss(w, p, w.boss!, 10, { melee: true });
  expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(true);
});
