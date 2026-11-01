import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { damageBoss, tickBuffs } from '../src/engine/combat/combat';
import { resolvedCoating } from '../src/engine/content/classes';
import { synthesizeAbility } from '../src/engine/content/forge';
import type { Player } from '../src/engine/core/types';

const zero = { x: 0, y: 0 };
const ready = (p: Player) => p.buffs.find((b) => b.kind === 'venomReady');
function setup(ranks = 0, grand = false) {
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      {
        peerId: 'a',
        name: 'Assassin',
        classId: 'rogue',
        subSkills: ['ro_assassin_poison'],
        charUpgrades: [
          'ro_assassin_g_b',
          ...(grand ? ['ro_assassin_poison_g'] : []),
          ...Array<string>(ranks).fill('subup_ro_assassin_poison'),
        ],
      },
    ],
  });
  w.scene = null;
  w.terrain = [];
  w.obstacles = [];
  const p = w.players[0],
    boss = w.boss!;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  boss.hp = boss.maxHp = 10000;
  boss.pos = { x: 650, y: 400 };
  boss.buffs = [];
  return { w, p, boss };
}

describe('combined Assassin coating preparation', () => {
  it.each(Array.from({ length: 12 }, (_, i) => [i % 6, i >= 6] as const))(
    'Coated Blade at Honed %i, grand=%s survives weaker Shadowstep and keeps its original expiry',
    (ranks, grand) => {
      const { w, p, boss } = setup(ranks, grand);
      resolvePlayerAbility(w, p, 'sub1', zero);
      tickBuffs(p, 0.5);
      const before = structuredClone(ready(p)!);
      resolvePlayerAbility(w, p, 'a2', zero);
      expect(ready(p)?.coating).toEqual(before.coating);
      expect(ready(p)?.remaining).toBe(before.remaining);
      expect(p.pos.x).toBeGreaterThan(600); // The blink itself still executes.
      boss.pos = { x: p.pos.x + 30, y: p.pos.y };
      resolvePlayerAbility(w, p, 'a1', zero);
      expect(boss.buffs.find((b) => b.kind === 'venom')?.mult).toBe(before.coating!.damage * 1.5);
      expect(ready(p)).toBeUndefined();
    },
  );
  it('reversing the cast order upgrades the coating instead of pinning the first preparation', () => {
    const { w, p } = setup(2, true);
    resolvePlayerAbility(w, p, 'a2', zero);
    expect(ready(p)?.coating?.damage).toBe(12);
    resolvePlayerAbility(w, p, 'sub1', zero);
    const strong = resolvedCoating(p.subAbilities!.sub1!)!;
    expect(ready(p)?.coating).toEqual({ damage: strong.damage, duration: strong.duration });
  });
  it('an expired stronger coating cannot prevent a fresh Shadowstep preparation', () => {
    const { w, p } = setup();
    resolvePlayerAbility(w, p, 'sub1', zero);
    ready(p)!.remaining = 0;
    resolvePlayerAbility(w, p, 'a2', zero);
    expect(ready(p)?.coating).toEqual({ damage: 12, duration: 4 });
    expect(ready(p)?.remaining).toBe(6);
  });
  it('equal damage with a shorter duration cannot downgrade or refresh preparation', () => {
    const { w, p } = setup();
    resolvePlayerAbility(w, p, 'sub1', zero);
    tickBuffs(p, 1);
    const before = structuredClone(ready(p)!);
    p.abilities!.a2.venomCoating = { damage: 24, duration: 4, window: 8 };
    resolvePlayerAbility(w, p, 'a2', zero);
    expect(ready(p)).toEqual(before);
  });
  it('another class’s stored coating cannot protect or replace the active class preparation', () => {
    const { w, p } = setup();
    p.buffs.push({
      kind: 'venomReady',
      mult: 100,
      remaining: 8,
      source: 'venomReady:mage',
      coating: { damage: 100, duration: 8 },
    });
    resolvePlayerAbility(w, p, 'a2', zero);
    expect(p.buffs.find((b) => b.source === 'venomReady:rogue')?.coating?.damage).toBe(12);
  });
  it.each([
    ['same strength', 24, 6],
    ['longer but weaker', 12, 8],
    ['stronger but shorter', 48, 2],
  ] as const)(
    'a deliberate %s coating is allowed to replace rather than inventing a total-damage ranking',
    (_label, damage, duration) => {
      const { w, p } = setup();
      resolvePlayerAbility(w, p, 'sub1', zero);
      tickBuffs(p, 0.5);
      p.abilities!.a2.venomCoating = { damage, duration, window: 8 };
      resolvePlayerAbility(w, p, 'a2', zero);
      expect(ready(p)?.coating).toEqual({ damage, duration });
      expect(ready(p)?.remaining).toBe(8);
    },
  );
  it('another actor’s preparation and a missing legacy payload do not lock the caster’s slot', () => {
    const { w, p } = setup();
    resolvePlayerAbility(w, p, 'sub1', zero);
    const other = structuredClone(p);
    other.id = w.allocId();
    other.peerId = 'b';
    w.players.push(other);
    resolvePlayerAbility(w, other, 'a2', zero);
    expect(ready(p)?.coating?.damage).toBe(24);
    ready(p)!.coating = undefined;
    resolvePlayerAbility(w, p, 'a2', zero);
    expect(ready(p)?.coating?.damage).toBe(12);
  });
  it('an immune target leaves the protected preparation available for a later hit', () => {
    const { w, p, boss } = setup();
    resolvePlayerAbility(w, p, 'sub1', zero);
    resolvePlayerAbility(w, p, 'a2', zero);
    boss.buffs.push({ kind: 'invuln', mult: 0, remaining: 2, source: 'test' });
    damageBoss(w, p, boss, 1, { direct: true, prepared: true });
    expect(ready(p)?.coating?.damage).toBe(24);
    boss.buffs = [];
    damageBoss(w, p, boss, 1, { direct: true, prepared: true });
    expect(boss.buffs.find((b) => b.kind === 'venom')?.mult).toBe(36);
  });
  it('actual Forge synthesis protects retained dominant coatings through subsequent utility casts', () => {
    let retained = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const { w, p } = setup(2, true);
      const native = p.subAbilities!.sub1!;
      const forged = synthesizeAbility(seed, 'prepared-poison', 'a2', [
        { classId: 'rogue', className: 'Rogue', name: native.name, slot: 'a2', def: native },
      ]).def;
      const coating = resolvedCoating(forged);
      if (!coating || coating.damage <= 12 || coating.duration < 4) continue;
      retained++;
      p.subclassPassiveId = undefined; // Copied payloads need no Assassin passive.
      p.subAbilities!.sub1 = { ...forged, slot: 'sub1' };
      resolvePlayerAbility(w, p, 'sub1', zero);
      tickBuffs(p, 0.25);
      const before = structuredClone(ready(p)!);
      resolvePlayerAbility(w, p, 'a2', zero);
      expect(ready(p)?.coating).toEqual(before.coating);
      expect(ready(p)?.remaining).toBe(before.remaining);
    }
    expect(retained).toBeGreaterThan(0);
  });
});
