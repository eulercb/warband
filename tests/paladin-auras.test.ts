import { describe, it, expect } from 'vitest';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import { classifyForBot } from '../src/engine/ai/bot';
import { World } from '../src/engine/world/world';
import { armPaladinAura, updatePaladinAuras } from '../src/engine/combat/paladinAuras';
import {
  applyBuff,
  applyStun,
  damagePlayer,
  makeBuff,
  damageBoss,
} from '../src/engine/combat/combat';
import { martialHitMultiplier } from '../src/engine/combat/martial';
import { healSupportAlly } from '../src/engine/combat/support';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { getSubSkill } from '../src/engine/content/subclasses';
import {
  decompose,
  recompose,
  componentValue,
  describeComposed,
  refreshComponents,
  synthesizeAbility,
} from '../src/engine/content/forge';
import type { PlayerAbilityDef } from '../src/engine/content/classes';
import { CHAR_UPGRADES } from '../src/engine/content/charUpgrades';
import { heroPowerRatio, balanceAdjust } from '../src/engine/content/balance';
const sub = (id: string) => ({ ...getSubSkill(id)!.ability, slot: 'sub1' as const });
function setup() {
  const w = new World({
    monsterId: 'dragon',
    seed: 5,
    players: [
      { peerId: 'a', name: 'A', classId: 'paladin' },
      { peerId: 'b', name: 'B', classId: 'cleric' },
      { peerId: 'c', name: 'C', classId: 'knight' },
    ],
  });
  const [p, a, b] = w.players;
  p.pos = { x: 600, y: 400 };
  a.pos = { x: 650, y: 400 };
  b.pos = { x: 1100, y: 400 };
  w.terrain = [];
  w.obstacles = [];
  return { w, p, a, b };
}
const tick = (w: World, dt = 0.05) =>
  (w as unknown as { tickTimers: (dt: number) => void }).tickTimers(dt);
describe('following Paladin auras', () => {
  it('Bulwark follows its owner, applies to nearby living allies, and respects departure/downing', () => {
    const { w, p, a, b } = setup();
    armPaladinAura(w, p, p.abilities!.a3);
    expect(a.buffs.find((x) => x.kind === 'auraBulwark')?.mult).toBe(0.85);
    expect(b.buffs).toEqual([]);
    const hp = a.hp;
    expect(damagePlayer(w, a, 100)).toBe(85);
    expect(a.hp).toBe(hp - 85);
    a.pos = { ...b.pos };
    updatePaladinAuras(w, 0, 0);
    expect(a.buffs.some((x) => x.kind === 'auraBulwark')).toBe(false);
    p.pos = { ...b.pos };
    updatePaladinAuras(w, 0, 0);
    expect(b.buffs.some((x) => x.kind === 'auraBulwark')).toBe(true);
    p.state = 'downed';
    updatePaladinAuras(w, 0, 0);
    expect(p.paladinAura).toBeUndefined();
    expect(b.buffs.some((x) => x.kind === 'auraBulwark')).toBe(false);
  });
  it('shortens stuns once and other control, leaving ordinary buffs unchanged', () => {
    const { w, p, a } = setup();
    armPaladinAura(w, p, p.abilities!.a3);
    expect(applyStun(w, a, 2, 'test')).toBe(1.3);
    expect(a.buffs.find((x) => x.kind === 'stun')?.remaining).toBe(1.3);
    applyBuff(a, makeBuff('root', 0, 2, 'root'));
    expect(a.buffs.find((x) => x.kind === 'root')?.remaining).toBe(1.3);
    applyBuff(a, makeBuff('moveSpeed', 1.2, 2, 'haste'));
    expect(a.buffs.find((x) => x.source === 'haste')?.remaining).toBe(2);
  });
  it('equivalent Bulwark fields do not multiply, and all owner lifecycle exits remove them', () => {
    const { w, p, a, b } = setup();
    b.pos = { ...p.pos };
    armPaladinAura(w, p, p.abilities!.a3);
    armPaladinAura(w, b, p.abilities!.a3);
    expect(a.buffs.filter((x) => x.kind === 'auraBulwark')).toHaveLength(1);
    p.classId = 'mage';
    b.paladinAura!.remaining = 0;
    updatePaladinAuras(w, 0, 0);
    expect(a.buffs.some((x) => x.kind === 'auraBulwark')).toBe(false);
    p.classId = 'paladin';
    armPaladinAura(w, p, p.abilities!.a3);
    w.players = w.players.filter((x) => x !== p);
    updatePaladinAuras(w, 0, 0);
    expect(a.buffs.some((x) => x.kind === 'auraBulwark')).toBe(false);
  });
  it('Pursuit grants one connecting melee payoff, never refreshes on reentry and replaces another aura', () => {
    const { w, p, a } = setup();
    const ab = sub('pa_vengeance_hunt');
    armPaladinAura(w, p, ab);
    expect(a.buffs.find((x) => x.source === 'paladinFieldPursuit')?.mult).toBe(1.18);
    expect(martialHitMultiplier(a, false)).toBe(1);
    expect(martialHitMultiplier(a, true)).toBe(1.25);
    expect(martialHitMultiplier(a, true)).toBe(1);
    a.pos.x = 1100;
    updatePaladinAuras(w, 0, 0);
    a.pos.x = 650;
    updatePaladinAuras(w, 0, 0);
    expect(martialHitMultiplier(a, true)).toBe(1);
    armPaladinAura(w, p, ab);
    expect(martialHitMultiplier(a, true)).toBe(1.25);
    armPaladinAura(w, p, p.abilities!.a3);
    expect(a.buffs.some((x) => x.source === 'paladinFieldPursuit' || x.kind === 'auraStrike')).toBe(
      false,
    );
  });
  it('overlapping Pursuit fields cannot multiply the same empowered hit', () => {
    const { w, p, a, b } = setup();
    b.pos = { ...p.pos };
    const ab = sub('pa_vengeance_hunt');
    armPaladinAura(w, p, ab);
    armPaladinAura(w, b, ab);
    expect(a.buffs.filter((x) => x.kind === 'auraStrike')).toHaveLength(1);
    expect(martialHitMultiplier(a, true)).toBe(1.25);
    updatePaladinAuras(w, 0, 0);
    expect(martialHitMultiplier(a, true)).toBe(1);
  });
  it('Renewal needs effective healing, pulses once across owners, and credits its healer', () => {
    const { w, p, a, b } = setup();
    a.hp = a.maxHp;
    healSupportAlly(w, p, a, 90, p.abilities!.a2);
    expect(p.paladinAura).toBeUndefined();
    a.hp -= 50;
    healSupportAlly(w, p, a, 10, p.abilities!.a2);
    expect(p.paladinAura?.kind).toBe('renewal');
    b.pos = { ...p.pos };
    armPaladinAura(w, b, p.abilities!.a2);
    const hp = a.hp;
    const stats = p.stats.healingDone;
    expect(updatePaladinAuras(w, 0.5, 0)).toBe(0.5);
    expect(a.hp).toBe(hp);
    updatePaladinAuras(w, 0.5, 0.5);
    expect(a.hp).toBe(hp + 10);
    expect(p.stats.healingDone).toBe(stats + 10);
    b.state = 'dead';
    p.paladinAura!.remaining = 0;
    updatePaladinAuras(w, 0, 0);
    expect(a.buffs.some((x) => x.kind === 'auraRenewal')).toBe(false);
  });
  it('duration counts down normally, scene changes clear fields, and snapshots carry only the visible field', () => {
    const { w, p } = setup();
    armPaladinAura(w, p, p.abilities!.a3);
    tick(w, 1);
    expect(p.paladinAura!.remaining).toBe(4);
    const visible = w.serialize().players.find((x) => x.id === p.id)!.paladinAura;
    expect(visible).toEqual({ kind: 'bulwark', radius: 220, remaining: 4 });
    expect(visible).not.toHaveProperty('spent');
    tick(w, 5);
    updatePaladinAuras(w, 0, 0);
    expect(p.paladinAura).toBeUndefined();
    armPaladinAura(w, p, p.abilities!.a3);
    w.scene = 'reward';
    updatePaladinAuras(w, 0, 0);
    expect(p.paladinAura).toBeUndefined();
  });
  it('ordinary world steps deliver the field and connecting damage consumes Pursuit', () => {
    const { w, p, a } = setup();
    resolvePlayerAbility(w, p, 'a3', { x: 0, y: 0 });
    w.step(0.05, new Map());
    expect(a.buffs.some((x) => x.kind === 'auraBulwark')).toBe(true);
    armPaladinAura(w, p, sub('pa_vengeance_hunt'));
    const before = w.boss!.hp;
    damageBoss(w, a, w.boss!, 10, { melee: true });
    expect(before - w.boss!.hp).toBeCloseTo(12.5);
  });
  it.each(['pa_devotion_sanctuary', 'pa_devotion_bless', 'pa_devotion_aura', 'pa_vengeance_hunt'])(
    'preserves %s through Forge and refresh',
    (id) => {
      const ab = sub(id);
      const rebuilt = recompose(decompose(ab), ab);
      expect(rebuilt.paladinAura).toEqual(ab.paladinAura);
      expect(componentValue(decompose(ab))).toBeGreaterThan(0);
      expect(describeComposed(decompose(ab), ab.cooldown)).toContain('aura');
      rebuilt.paladinAura = { ...rebuilt.paladinAura!, radius: 260 };
      expect(recompose(refreshComponents(rebuilt), rebuilt).paladinAura!.radius).toBe(260);
      rebuilt.paladinAura = undefined;
      expect(recompose(refreshComponents(rebuilt), rebuilt).paladinAura).toEqual(ab.paladinAura);
      for (let seed = 0; seed < 30; seed++)
        expect(
          synthesizeAbility(seed, 'aura', ab.kind === 'heal' ? 'a2' : 'a3', [
            {
              name: ab.name,
              classId: 'paladin',
              className: 'Paladin',
              slot: ab.kind === 'heal' ? 'a2' : 'a3',
              def: ab,
            },
          ]).def,
        ).toBeTruthy();
    },
  );
});

function oldCleric(ab: PlayerAbilityDef): PlayerAbilityDef {
  const out = structuredClone(ab);
  const oldDamage: Record<string, number> = {
    Smite: 12,
    Heal: 80, // legacy credit 60/3s translated to the new 4s cadence
    'Flash of Light': 70,
    'Mass Cure': 80,
  };
  if (oldDamage[out.name] != null) out.damage = oldDamage[out.name];
  delete out.balanceDamageScale;
  if (out.name === 'Sanctuary') out.zoneTickHeal = 10;
  if (out.name === 'Blessed Bloom') out.zoneTickHeal = 14;
  delete out.balanceZoneHealScale;
  if (out.absorption) {
    out.absorption.amount = out.name === 'Warding Flare' ? 40 : 30;
    delete out.absorption.balanceAmount;
  }
  return out;
}
it('Cleric tuning leaves difficulty credit equal for native, copied and composed skills', () => {
  const { w, a } = setup();
  const current = heroPowerRatio(a);
  a.abilities = Object.fromEntries(
    Object.entries(a.abilities!).map(([slot, ab]) => [slot, oldCleric(ab)]),
  ) as typeof a.abilities;
  expect(heroPowerRatio(a)).toBeCloseTo(current, 12);
  for (const id of [
    'cl_light_warding',
    'cl_life_preserve',
    'cl_light_flash',
    'cl_life_mend',
    'cl_life_bloom',
  ]) {
    for (const composed of [false, true]) {
      const ab = sub(id);
      const now = composed ? recompose(decompose(ab), ab) : ab;
      w.players[0].subAbilities = { sub1: now };
      const power = heroPowerRatio(w.players[0]);
      w.players[0].subAbilities = { sub1: oldCleric(now) };
      expect(heroPowerRatio(w.players[0])).toBeCloseTo(power, 12);
      expect(balanceAdjust(1, power, 3)).toEqual(balanceAdjust(1, heroPowerRatio(w.players[0]), 3));
    }
  }
});

it('rejects invalid owners, empty target health and dead recipients; supports copied aura skills', () => {
  const { w, p, a } = setup();
  armPaladinAura(w, p, p.abilities!.basic);
  expect(p.paladinAura).toBeUndefined();
  p.state = 'dead';
  armPaladinAura(w, p, p.abilities!.a3);
  expect(p.paladinAura).toBeUndefined();
  p.state = 'alive';
  p.hp = 0;
  armPaladinAura(w, p, p.abilities!.a3);
  expect(p.paladinAura).toBeUndefined();
  p.hp = 100;
  a.hp = 0;
  armPaladinAura(w, p, p.abilities!.a3);
  expect(a.buffs).toEqual([]);
  p.hp = 0;
  updatePaladinAuras(w, 0, 0);
  expect(p.paladinAura).toBeUndefined();
  p.hp = 100;
  p.classId = 'mage';
  a.hp = 100;
  armPaladinAura(w, p, p.abilities!.a3);
  expect(p.paladinAura?.classId).toBe('mage');
  p.classId = 'paladin';
  updatePaladinAuras(w, 0, 0);
  expect(a.buffs.some((b) => b.kind === 'auraBulwark')).toBe(false);
});

it('Renewal resolves overlapping attribution independently of owner iteration order', () => {
  const { w, p, a, b } = setup();
  b.pos = { ...p.pos };
  const ab = p.abilities!.a2;
  armPaladinAura(w, p, ab);
  armPaladinAura(w, b, ab);
  w.players.reverse();
  a.hp = 50;
  updatePaladinAuras(w, 1, 0);
  expect(a.hp).toBe(60);
  expect(p.stats.healingDone).toBe(10);
  expect(b.stats.healingDone).toBe(0);
});

it('keeps legacy shared-ward components functional alongside the new aura system', () => {
  const { w, p, a } = setup();
  const old = {
    ...p.abilities!.a3,
    paladinAura: undefined,
    allyWard: { range: 180, mult: 0.85, duration: 4 },
  };
  const comp = decompose(old);
  expect(componentValue(comp)).toBeGreaterThan(0);
  expect(describeComposed(comp, old.cooldown)).toContain('other allies');
  p.abilities!.a3 = recompose(comp, old);
  resolvePlayerAbility(w, p, 'a3', { x: 0, y: 0 });
  expect(a.buffs.find((b) => b.source === 'sharedWard')?.mult).toBe(0.85);
  for (let seed = 0; seed < 60; seed++)
    expect(
      synthesizeAbility(seed, 'legacy-ward', 'a3', [
        { name: old.name, classId: 'paladin', className: 'Paladin', slot: 'a3', def: old },
      ]).def,
    ).toBeTruthy();
  const restored = recompose(comp, old);
  restored.allyWard = undefined;
  expect(recompose(refreshComponents(restored), old).allyWard).toEqual(old.allyWard);
});

it('describes aura benefits and classifies their proactive support role for bots', () => {
  const { p } = setup();
  expect(classifyForBot(p.abilities!.a3).role).toBe('allyBuff');
  expect(classifyForBot(recompose(decompose(p.abilities!.a3), p.abilities!.a3)).role).toBe(
    'allyBuff',
  );
  const badges = buffBadges([
    { kind: 'auraBulwark', mult: 0.9, remaining: 3 },
    { kind: 'auraStrike', mult: 1.15, remaining: 4 },
    { kind: 'auraRenewal', mult: 6, remaining: 0.35 },
  ]);
  expect(badges.map((b) => b.label).join(' ')).toMatch(/35% less.*25% more.*10 HP\/s/);
});

it('Cleric upgrade stacks cannot charge higher difficulty for these balance buffs', () => {
  const { a: current } = setup();
  const { a: previous } = setup();
  previous.abilities = Object.fromEntries(
    Object.entries(previous.abilities!).map(([k, ab]) => [k, oldCleric(ab)]),
  ) as typeof previous.abilities;
  for (let rank = 0; rank < 5; rank++) {
    for (const id of ['cl_greaterheal', 'cl_sanctuary', 'cl_smite']) {
      CHAR_UPGRADES[id].apply({ player: current, abilities: current.abilities! });
      CHAR_UPGRADES[id].apply({ player: previous, abilities: previous.abilities! });
    }
    expect(heroPowerRatio(current)).toBeLessThanOrEqual(heroPowerRatio(previous));
  }
});
