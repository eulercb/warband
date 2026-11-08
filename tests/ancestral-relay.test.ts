import { afterEach, describe, it, expect } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  ancestralRelayView,
  reserveAncestralCast,
  ancestralOrigin,
  finishAncestralCast,
  tickAncestralRelay,
  invalidateAncestralRelay,
  nativeRelayIdentity,
} from '../src/engine/combat/ancestralRelay';
import {
  getClass,
  CLASSES,
  describeAbility,
  resolvedAncestralRelay,
} from '../src/engine/content/classes';
import {
  setForgeSeed,
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  synthesizeClass,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { previewAbilityTable, previewSubAbility } from '../src/engine/content/charUpgrades';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import { drawAncestralRelay } from '../src/render/pipeline/ancestralVisuals';
import type { ExtSlot, Player } from '../src/engine/core/types';
const zero = { x: 0, y: 0 };
const skills = ['bb_totem_bear', 'bb_totem_wolf', 'bb_totem_quake', 'bb_totem_mend'];
afterEach(() => setForgeSeed(null));
function setup(skill = skills[0], ids = ['bb_totem_g_b']) {
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      {
        peerId: 'a',
        name: 'Totem',
        classId: 'barbarian',
        charUpgrades: ids,
        subSkills: [skill],
        extraClasses: ['mage'],
      },
      { peerId: 'b', name: 'Ally', classId: 'knight' },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    b = w.boss!,
    ally = w.players[1];
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  p.buffs = [];
  b.pos = { x: 820, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  ally.pos = { x: 820, y: 400 };
  return { w, p, b, ally };
}
function use(w: World, p: Player, slot: ExtSlot) {
  (w as unknown as { tryUseAbility(p: Player, s: ExtSlot, d: typeof zero): void }).tryUseAbility(
    p,
    slot,
    zero,
  );
}
function finish(w: World) {
  for (let i = 0; i < 12; i++) w.step(0.05, new Map());
}
describe('Ancestral Relay native combat', () => {
  it.each(skills)('offers a remote first-pick route with %s', (skill) => {
    const { w, p, b, ally } = setup(skill);
    use(w, p, 'a1');
    expect(p.ancestralStation?.pos).toEqual({ x: 680, y: 400 });
    expect(ancestralRelayView(w, p)).toMatchObject({ remote: true, seedSlot: 'a1', slot: 'a3' });
    p.pos = { x: 400, y: 400 };
    ally.pos = { x: 720, y: 400 };
    applyBuff(p, makeBuff('momentum', 3, 10, 'test'));
    const before = b.hp,
      body = { ...p.pos };
    use(w, p, 'a3');
    expect(p.castTimer).toBeGreaterThan(0);
    expect(ancestralRelayView(w, p)).toMatchObject({
      casting: true,
      origin: { x: 680, y: 400 },
      next: body,
    });
    finish(w);
    expect(b.hp).toBeLessThan(before);
    expect(p.pos).toEqual(body);
    expect(p.ancestralStation?.pos).toEqual(body);
    expect(ally.buffs.filter((b) => b.kind === 'absorption').length).toBeGreaterThan(0);
    expect(p.buffs.filter((b) => b.kind === 'absorption').length ?? 0).toBe(0);
  });
  it('persists through the actual recharge and relocates once per cast without a hit', () => {
    const { w, p, b } = setup();
    b.pos = { x: 1200, y: 1000 };
    use(w, p, 'a3');
    finish(w);
    expect(p.ancestralStation?.pos).toEqual({ x: 500, y: 400 });
    const cd = p.cooldowns.a3;
    expect(cd).toBeGreaterThan(14);
    for (let i = 0; i < 350; i++) w.step(0.05, new Map());
    expect(p.ancestralStation?.pos).toEqual({ x: 500, y: 400 });
    p.pos = { x: 800, y: 400 };
    use(w, p, 'a3');
    const cast = p.castAbility!;
    expect(cast.ancestralCast?.origin).toEqual({ x: 500, y: 400 });
    p.pos = { x: 850, y: 400 };
    finish(w);
    expect(p.ancestralStation?.pos).toEqual({ x: 800, y: 400 });
    finishAncestralCast(w, p, cast);
    expect(p.ancestralStation?.pos).toEqual({ x: 800, y: 400 });
  });
  it('reserves both points across reseeding and uses a local fallback out of range', () => {
    const { w, p } = setup();
    use(w, p, 'a1');
    const ab = { ...p.abilities!.a3 };
    ab.ancestralCast = reserveAncestralCast(w, p, ab, 'a3');
    p.ancestralStation!.pos = { x: 1000, y: 800 };
    p.pos = { x: 550, y: 450 };
    expect(ancestralOrigin(w, p, ab)).toEqual({ x: 680, y: 400 });
    finishAncestralCast(w, p, ab);
    expect(p.ancestralStation?.pos).toEqual({ x: 500, y: 400 });
    p.pos = { x: 1000, y: 800 };
    const local = reserveAncestralCast(w, p, p.abilities!.a3, 'a3')!;
    expect(local.remote).toBe(false);
    expect(local.origin).toEqual(p.pos);
    expect(ancestralRelayView(w, p)).toMatchObject({ remote: false });
  });
  it('routes the existing Earth Shelter pulse to the placed field without duplicating it', () => {
    const { w, p, ally } = setup('bb_totem_quake');
    use(w, p, 'a1');
    applyBuff(p, makeBuff('momentum', 2, 10, 'test'));
    ally.pos = { x: 880, y: 400 };
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(ally.buffs.filter((b) => b.kind === 'absorption').length).toBe(1);
    expect(p.buffs.filter((b) => b.kind === 'absorption').length ?? 0).toBe(0);
    expect(w.groundZones[0].pos).toEqual(ally.pos);
  });
  it('does not give free Shelter without Momentum and keeps normal basic reach', () => {
    const { w, p, b, ally } = setup();
    resolvePlayerAbility(w, p, 'a1', zero);
    p.buffs = [];
    const before = b.hp;
    resolvePlayerAbility(w, p, 'basic', zero);
    expect(b.hp).toBe(before);
    resolvePlayerAbility(w, p, 'a3', zero);
    expect(ally.buffs.filter((b) => b.kind === 'absorption').length ?? 0).toBe(0);
  });
  it('still establishes the next station against immunity', () => {
    const { w, p, b } = setup();
    resolvePlayerAbility(w, p, 'a1', zero);
    applyBuff(b, makeBuff('invuln', 0, 3, 'test'));
    const before = b.hp;
    resolvePlayerAbility(w, p, 'a3', zero);
    expect(b.hp).toBe(before);
    expect(p.ancestralStation?.pos).toEqual(p.pos);
  });
});
describe('ownership and portable contract', () => {
  it('self-seeds a copied burst with no subclass, then strikes at the previous station', () => {
    const { w, p, b } = setup(skills[0], []);
    p.subclassPassiveId = undefined;
    p.abilities!.a3 = recompose(decompose({ ...p.abilities!.a3, ancestralRelay: { range: 360 } }), {
      slot: 'a3',
      name: 'Copied relay',
      cooldown: 9,
    });
    expect(ancestralRelayView(w, p)?.seedSlot).toBeUndefined();
    resolvePlayerAbility(w, p, 'a1', zero);
    expect(p.ancestralStation).toBeUndefined();
    resolvePlayerAbility(w, p, 'a3', zero);
    p.pos = { x: 800, y: 400 };
    b.pos = { x: 500, y: 400 };
    const before = b.hp;
    resolvePlayerAbility(w, p, 'a3', zero);
    expect(b.hp).toBeLessThan(before);
    expect(p.ancestralStation?.pos).toEqual(p.pos);
  });
  it('does not treat a grafted or composed Rage as the native seed shortcut', () => {
    const { w, p } = setup();
    p.abilities!.a1 = recompose(decompose(p.abilities!.a1), {
      slot: 'a1',
      name: 'Rage',
      cooldown: 14,
    });
    expect(reserveAncestralCast(w, p, p.abilities!.a1, 'a1')).toBeUndefined();
    delete p.abilities!.a1.components;
    p.charUpgradeIds = [...p.charUpgradeIds!, 'hy_inspire'];
    expect(reserveAncestralCast(w, p, p.abilities!.a1, 'a1')).toBeUndefined();
  });
  it('requires active identity, native provenance and a receiving skill', () => {
    const { w, p } = setup();
    p.charUpgradeIds = [];
    expect(nativeRelayIdentity(p)).toBe(false);
    expect(reserveAncestralCast(w, p, p.abilities!.a1, 'a1')).toBeUndefined();
    p.charUpgradeIds = ['bb_totem_g_b'];
    const source = p.abilities!.a1;
    p.abilities!.a1 = { ...source, kind: 'heal' };
    expect(ancestralRelayView(w, p)?.seedSlot).toBeUndefined();
    p.abilities!.a1 = source;
    delete p.abilities!.a3.ancestralRelay;
    expect(ancestralRelayView(w, p)).toBeUndefined();
    expect(reserveAncestralCast(w, p, source, 'a1')).toBeUndefined();
    expect(reserveAncestralCast(w, p, source, 'basic')).toBeUndefined();
    expect(reserveAncestralCast(w, p, source, 'sub2')).toBeUndefined();
  });
  it.each(['down', 'scene', 'class', 'epoch', 'lost'] as const)(
    'clears invalid station: %s',
    (reason) => {
      const { w, p } = setup();
      resolvePlayerAbility(w, p, 'a1', zero);
      const ab = {
        ...p.abilities!.a3,
        ancestralCast: reserveAncestralCast(w, p, p.abilities!.a3, 'a3'),
      };
      if (reason === 'down') p.hp = 0;
      if (reason === 'scene') w.scene = 'reward';
      if (reason === 'class') p.classId = 'mage';
      if (reason === 'epoch') p.ancestralEpoch = 1;
      if (reason === 'lost') delete p.abilities!.a3.ancestralRelay;
      tickAncestralRelay(w);
      expect(p.ancestralStation).toBeUndefined();
      finishAncestralCast(w, p, ab);
      expect(p.ancestralStation).toBeUndefined();
      if (reason === 'down' || reason === 'scene') expect(ancestralRelayView(w, p)).toBeUndefined();
    },
  );
  it('rejects stale source reservations and exposes a local unreserved origin', () => {
    const { w, p } = setup();
    const ab = {
      ...p.abilities!.a3,
      ancestralCast: reserveAncestralCast(w, p, p.abilities!.a3, 'a3'),
    };
    p.abilities!.a3 = { ...p.abilities!.a3 };
    finishAncestralCast(w, p, ab);
    expect(p.ancestralStation).toBeUndefined();
    expect(ancestralOrigin(w, p, ab)).toEqual(p.pos);
    invalidateAncestralRelay(p);
    expect(p.ancestralEpoch).toBe(1);
  });
  it('uses a predictable zero-aim seed and separates party owners', () => {
    const { w, p, ally } = setup();
    p.aim = zero;
    resolvePlayerAbility(w, p, 'a1', zero);
    expect(p.ancestralStation?.pos.x).toBe(680);
    expect(ally.ancestralStation).toBeUndefined();
  });
});
describe('content, synthesis and presentation', () => {
  it('keeps Great Spirit focused on guards and preserves useful individual grands', () => {
    const a = previewAbilityTable('barbarian', ['bb_totem_g_a']);
    expect(a.a1.frontGuard?.charges).toBe(1);
    expect(a.basic.lifestealFrac).toBeUndefined();
    expect(a.a3.lifestealFrac).toBeUndefined();
    const wolf = previewSubAbility('bb_totem_wolf', ['bb_totem_g_a']);
    expect(wolf?.wolfHunt).toBe(5);
    const earth = previewSubAbility('bb_totem_quake', ['bb_totem_g_a']);
    expect(earth?.zoneDuration).toBe(4);
  });
  it('round-trips, prices, scales, caps and refreshes the relay component', () => {
    const raw = { ...getClass('barbarian').abilities.a3, ancestralRelay: { range: 360 } };
    const comp = decompose(raw);
    const rebuilt = recompose(comp, { slot: 'a3', name: 'Relay', cooldown: 9 });
    expect(resolvedAncestralRelay(rebuilt)).toEqual({ range: 360 });
    expect(componentValue(comp)).toBeGreaterThan(
      componentValue(decompose(getClass('barbarian').abilities.a3)),
    );
    expect(describeAbility(rebuilt)).toContain('first burst establishes');
    expect(describeAbility(raw)).toContain('ancestral relay');
    rebuilt.ancestralRelay = { range: 1000 };
    expect(refreshComponents(rebuilt).effects).toContainEqual({
      kind: 'ancestralRelay',
      range: 360,
    });
    const clean = recompose(decompose(getClass('barbarian').abilities.a3), {
      slot: 'a3',
      name: 'New',
      cooldown: 9,
    });
    clean.ancestralRelay = { range: 360 };
    expect(refreshComponents(clean).effects).toContainEqual({ kind: 'ancestralRelay', range: 360 });
    const donor = {
      classId: 'barbarian' as const,
      className: 'Barbarian',
      slot: 'a3' as const,
      name: 'Relay',
      def: raw,
    };
    for (let seed = 0; seed < 30; seed++) {
      const syn = synthesizeAbility(seed, 'relay', 'a3', [donor]);
      expect(resolvedAncestralRelay(syn.def)?.range ?? 360).toBeLessThanOrEqual(360);
      expect(syn.def.cooldown).toBeGreaterThan(0);
    }
  });
  it('rejects incompatible deliveries, basics, duplicate relays and targeted claims', () => {
    const raw = { ...getClass('barbarian').abilities.a3, ancestralRelay: { range: 360 } };
    const c = decompose(raw);
    c.effects.push({ kind: 'ancestralRelay', range: 200 });
    expect(
      recompose(c, { slot: 'a3', name: 'R', cooldown: 9 }).components!.effects.filter(
        (e) => e.kind === 'ancestralRelay',
      ),
    ).toHaveLength(1);
    expect(
      resolvedAncestralRelay(recompose(c, { slot: 'basic', name: 'R', cooldown: 9 })),
    ).toBeUndefined();
    c.delivery = { ...c.delivery, kind: 'meleeCone' };
    expect(
      resolvedAncestralRelay(recompose(c, { slot: 'a3', name: 'R', cooldown: 9 })),
    ).toBeUndefined();
    const claim = { ...raw, infernalClaim: true };
    expect(resolvedAncestralRelay(claim)).toBeUndefined();
    expect(decompose(claim).effects.some((e) => e.kind === 'ancestralRelay')).toBe(false);
    const cc = decompose(raw);
    cc.effects.push(...decompose(claim).effects.filter((e) => e.kind === 'skillContract'));
    expect(recompose(cc, { slot: 'a3', name: 'R', cooldown: 9 }).ancestralRelay).toBeUndefined();
    const stale = { ...raw, components: decompose(getClass('barbarian').abilities.a3) };
    expect(resolvedAncestralRelay(stale)).toBeUndefined();
  });
  it('guarantees a priced compatible Forge burst and self-seeding identity for all first picks', () => {
    const mage = CLASSES.mage;
    const donors = Object.values(mage.abilities).map((def) => ({
      name: def.name,
      classId: mage.id,
      className: mage.name,
      slot: def.slot,
      def,
    }));
    for (let seed = 0; seed < 12; seed++) {
      const c = synthesizeClass(seed, CLASSES.barbarian, donors);
      expect(
        Object.values(c.abilities).some(
          (a) => a.slot !== 'basic' && a.kind === 'pbaoe' && !a.infernalClaim,
        ),
      ).toBe(true);
    }
    for (const skill of skills) {
      setForgeSeed(7);
      const { w, p } = setup(skill);
      const receivers = Object.values(p.abilities!).filter((a) => resolvedAncestralRelay(a));
      expect(receivers.length).toBeGreaterThan(0);
      expect(ancestralRelayView(w, p)?.seedSlot).toBeUndefined();
      resolvePlayerAbility(w, p, receivers[0].slot, zero);
      expect(p.ancestralStation).toBeDefined();
      setForgeSeed(null);
    }
  });
  it('draws ready, local, remote and committed footprints on the actual Graphics API', () => {
    const { w, p } = setup();
    const g = new Graphics();
    const screen = (p: { x: number; y: number }) => p;
    drawAncestralRelay(g, ancestralRelayView(w, p)!, screen, 1, true, p.pos);
    resolvePlayerAbility(w, p, 'a1', zero);
    drawAncestralRelay(g, ancestralRelayView(w, p)!, screen, 0.6, false, p.pos);
    use(w, p, 'a3');
    drawAncestralRelay(g, ancestralRelayView(w, p)!, screen, 1, true, p.pos);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    g.destroy();
  });
});

describe('relay integration edge cases', () => {
  it('loses the native shortcut with a graft and regains it on reclaim; class swap discards the station', () => {
    const { w, p } = setup();
    p.charUpgradeIds = ['bb_totem_g_b', 'hy_inspire'];
    p.abilities = previewAbilityTable('barbarian', p.charUpgradeIds);
    expect(ancestralRelayView(w, p)?.seedSlot).toBeUndefined();
    p.charUpgradeIds.push('restore:a1');
    p.abilities = previewAbilityTable('barbarian', p.charUpgradeIds);
    expect(ancestralRelayView(w, p)?.seedSlot).toBe('a1');
    resolvePlayerAbility(w, p, 'a1', zero);
    expect(p.ancestralStation).toBeDefined();
    (w as unknown as { setActiveClass(p: Player, id: 'mage'): void }).setActiveClass(p, 'mage');
    expect(p.ancestralStation).toBeUndefined();
  });
  it('wraps a vertical seed, shows real Momentum radius, and keeps a single station after a local fallback', () => {
    const { w, p } = setup();
    p.pos = { x: 500, y: 1100 };
    p.aim = { x: 0, y: 1 };
    resolvePlayerAbility(w, p, 'a1', zero);
    expect(p.ancestralStation?.pos.y).toBeLessThan(p.pos.y);
    expect(ancestralRelayView(w, p)?.radius).toBe(135);
    applyBuff(p, makeBuff('momentum', 2, 6, 'test'));
    expect(ancestralRelayView(w, p)?.radius).toBe(155);
    p.buffs = [];
    expect(ancestralRelayView(w, p)?.radius).toBe(135);
    const ab = { ...p.abilities!.a3 };
    delete ab.radius;
    p.abilities!.a3 = ab;
    expect(ancestralRelayView(w, p)?.radius).toBe(150);
    p.pos = { x: 1000, y: 600 };
    resolvePlayerAbility(w, p, 'a3', zero);
    expect(p.ancestralStation?.pos).toEqual(p.pos);
  });
  it.each(['sanctuary', 'consecration', 'entangle'] as const)(
    'centres copied %s field Shelter on its actual zone',
    (kind) => {
      const { w, p, ally } = setup('bb_totem_quake');
      const field = { ...p.subAbilities!.sub1!, zoneKind: kind, range: 1000 };
      p.subAbilities!.sub1 = recompose(decompose(field), {
        slot: 'sub1',
        name: 'Copied field',
        cooldown: 9,
      });
      applyBuff(p, makeBuff('rageRhythm', 0, 6, 'rage'));
      applyBuff(p, makeBuff('momentum', 2, 6, 'test'));
      ally.pos =
        kind === 'entangle'
          ? { x: 500 + Math.min(w.arena.w, w.arena.h) * 0.4, y: 400 }
          : { ...p.pos };
      resolvePlayerAbility(w, p, 'sub1', zero);
      expect(w.groundZones[0].pos).toEqual(ally.pos);
      expect(ally.buffs.some((b) => b.kind === 'absorption')).toBe(true);
    },
  );
  it.each([0, 5])('uses the actual fallback centre for a native zone with healing %s', (heal) => {
    const { w, p, ally } = setup('bb_totem_quake');
    const ab = { ...p.subAbilities!.sub1!, zoneTickHeal: heal };
    delete ab.zoneKind;
    delete ab.range;
    p.subAbilities!.sub1 = ab;
    applyBuff(p, makeBuff('rageRhythm', 0, 6, 'rage'));
    applyBuff(p, makeBuff('momentum', 2, 6, 'test'));
    ally.pos = heal > 0 ? { ...p.pos } : { x: 1000, y: 400 };
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(w.groundZones[0].pos).toEqual(ally.pos);
    expect(ally.buffs.some((b) => b.kind === 'absorption')).toBe(true);
  });
  it('retains relay on receiving Forge subskills and adds none to incompatible skills', () => {
    let found = false;
    for (let seed = 0; seed < 40; seed++) {
      setForgeSeed(seed);
      const ab = previewSubAbility('bb_totem_quake', ['bb_totem_g_b']);
      if (ab?.kind === 'pbaoe' && !ab.infernalClaim) {
        expect(resolvedAncestralRelay(ab)).toEqual({ range: 360 });
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
