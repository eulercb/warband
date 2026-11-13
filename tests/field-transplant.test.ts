import { afterEach, describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import {
  tryFieldTransplant,
  fieldTransplantViews,
  maintainFieldTransplants,
  transplantDestination,
} from '../src/engine/combat/fieldTransplant';
import { makeBuff } from '../src/engine/combat/combat';
import { decompose, recompose, setForgeSeed, componentValue } from '../src/engine/content/forge';
import { describeAbility } from '../src/engine/content/classes';
import { grandEarnable, normalizeGrandLoadout } from '../src/engine/content/grandSelections';
import { drawFieldTransplant, transplantEdge } from '../src/render/pipeline/transplantVisuals';
import type { ExtSlot, InputCommand } from '../src/engine/core/types';
const zero = { x: 0, y: 0 },
  right = { x: 1, y: 0 },
  left = { x: -1, y: 0 };
const skills = ['dr_land_spike', 'dr_land_wall', 'dr_land_wind', 'dr_land_spring'];
afterEach(() => setForgeSeed(null));
function setup(skill = skills[0], mods = ['dr_land_g_b']) {
  const w = new World({
    seed: 31,
    monsterId: 'lich',
    players: [
      {
        peerId: 'a',
        name: 'Land',
        classId: 'druid',
        subSkills: [skill],
        charUpgrades: mods,
        extraClasses: ['mage'],
      },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = right;
  p.critChance = 0;
  b.pos = { x: 900, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  return { w, p, b };
}
function input(w: World, slot?: ExtSlot, aim = right, autofire = false) {
  const buttons: InputCommand['buttons'] = {
    basic: false,
    a1: false,
    a2: false,
    a3: false,
    revive: false,
  };
  if (slot) buttons[slot] = true;
  w.step(0.01, new Map([['a', { seq: w.tick, move: zero, aim, buttons, autofire }]]));
}
function arm(w: World) {
  for (let i = 0; i < 100 && w.groundZones.some((z) => (z.armRemaining ?? 0) > 0); i++) input(w);
}
describe('Land field transplantation', () => {
  it.each(skills)('starting Entangle gives a full-health solo route with %s', (skill) => {
    const { w, p } = setup(skill);
    input(w, 'a1');
    arm(w);
    const z = w.groundZones[0];
    expect(p.hp).toBe(p.maxHp);
    expect(fieldTransplantViews(w, p)[0].zoneId).toBe(z.id);
    const before = {
      id: z.id,
      remaining: z.remaining,
      ticks: z.tickAccum,
      radius: z.radius,
      damage: z.damagePerTick,
      heal: z.healPerTick,
      cd: p.cooldowns.a1,
    };
    p.aim = left;
    const target = transplantDestination(w, p);
    expect(tryFieldTransplant(w, p, 'a1', true)).toBe(true);
    expect(z.pos).toEqual(target);
    expect({
      id: z.id,
      remaining: z.remaining,
      ticks: z.tickAccum,
      radius: z.radius,
      damage: z.damagePerTick,
      heal: z.healPerTick,
      cd: p.cooldowns.a1,
    }).toEqual(before);
    expect(fieldTransplantViews(w, p)).toEqual([]);
    expect(tryFieldTransplant(w, p, 'a1', true)).toBe(false);
    expect(w.groundZones).toHaveLength(1);
  });
  it('uses fresh real input, preserves normal cadence and does not perform another cast', () => {
    const { w, p, b } = setup();
    input(w, 'a1');
    arm(w);
    const z = w.groundZones[0],
      old = { ...z.pos };
    input(w, 'a1', left, true);
    expect(z.pos).toEqual(transplantDestination(w, p));
    expect(z.pos).not.toEqual(old);
    expect(w.events.filter((e) => e.t === 'cast')).toHaveLength(0);
    const hp = b.hp;
    for (let i = 0; i < 30; i++) input(w, 'a1', right, true);
    expect(z.pos).not.toEqual(old);
    expect(b.hp).toBe(hp);
  });
  it('a held initial button cannot transplant until released and pressed again', () => {
    const { w, p } = setup();
    input(w, 'a1', right, true);
    const z = w.groundZones[0],
      original = { ...z.pos };
    for (let i = 0; i < 100; i++) input(w, 'a1', left, true);
    expect(z.pos).toEqual(original);
    expect(fieldTransplantViews(w, p)).toHaveLength(1);
    input(w);
    input(w, 'a1', left);
    expect(z.pos).toEqual(transplantDestination(w, p));
  });
  it('Healing Spring relocates at full health and heals only on its scheduled ticks', () => {
    const { w, p } = setup('dr_land_spring');
    input(w, 'sub1');
    const z = w.groundZones[0];
    expect(fieldTransplantViews(w, p)).toHaveLength(1);
    const phase = z.tickAccum;
    p.aim = left;
    tryFieldTransplant(w, p, 'sub1', true);
    expect(z.tickAccum).toBe(phase);
    expect(p.hp).toBe(p.maxHp);
    p.pos = { ...z.pos };
    p.hp -= 30;
    for (let i = 0; i < 50; i++) input(w);
    expect(p.hp).toBeGreaterThan(p.maxHp - 30);
  });
  it.each([false, true])('anchors Wandering Briar before or after acquisition (%s)', (acquired) => {
    const { w, p, b } = setup(skills[0], ['dr_land_g_b', 'dr_gk_a1_a']);
    input(w, 'a1');
    arm(w);
    const z = w.groundZones[0];
    z.followId = acquired ? b.id : undefined;
    z.followAcquired = acquired;
    p.aim = left;
    tryFieldTransplant(w, p, 'a1', true);
    const pos = { ...z.pos };
    for (let i = 0; i < 70; i++) input(w);
    expect(z.pos).toEqual(pos);
    expect(z.zoneFollow).toBe(0);
    expect(z.followAcquired).toBe(true);
  });
  it.each(['stun', 'silence', 'cast', 'glide', 'shove'] as const)(
    'blocks relocation while %s without spending it',
    (reason) => {
      const { w, p } = setup();
      input(w, 'a1');
      arm(w);
      const old = { ...w.groundZones[0].pos };
      if (reason === 'stun' || reason === 'silence') p.buffs.push(makeBuff(reason, 0, 2, 'test'));
      if (reason === 'cast') p.castTimer = 1;
      if (reason === 'glide') p.glide = {} as NonNullable<typeof p.glide>;
      if (reason === 'shove') p.shove = {} as NonNullable<typeof p.shove>;
      expect(fieldTransplantViews(w, p)[0].blocked).toBeTruthy();
      expect(tryFieldTransplant(w, p, 'a1', true)).toBe(true);
      expect(w.groundZones[0].pos).toEqual(old);
      expect(p.fieldTransplants!.a1!.used).toBe(false);
    },
  );
  it.each(['source', 'class', 'down', 'scene', 'finished', 'expiry', 'cooldown'] as const)(
    'invalidates readiness on %s',
    (reason) => {
      const { w, p } = setup();
      input(w, 'a1');
      arm(w);
      if (reason === 'source') p.abilities!.a1 = { ...p.abilities!.a1 };
      if (reason === 'class') {
        w.setActiveClass(p, 'mage');
        w.setActiveClass(p, 'druid');
      }
      if (reason === 'down') p.state = 'downed';
      if (reason === 'scene') w.scene = 'reward';
      if (reason === 'finished') w.finished = true;
      if (reason === 'expiry') w.groundZones = [];
      if (reason === 'cooldown') p.cooldowns.a1 = 0;
      maintainFieldTransplants(w);
      expect(fieldTransplantViews(w, p)).toEqual([]);
      expect(p.fieldTransplants?.a1).toBeUndefined();
    },
  );
  it('independent field slots retain independent one-use candidates', () => {
    const { w, p } = setup('dr_land_spring');
    input(w, 'a1');
    arm(w);
    input(w, 'sub1');
    input(w);
    expect(fieldTransplantViews(w, p)).toHaveLength(2);
    p.aim = left;
    tryFieldTransplant(w, p, 'a1', true);
    expect(fieldTransplantViews(w, p).map((v) => v.slot)).toEqual(['sub1']);
  });
  it.each([false, true])(
    'a retained priced component works on direct fields and projectile blooms (%s)',
    (projectile) => {
      const { w, p } = setup();
      const original = p.abilities!.a1,
        c = decompose(original);
      const zone = c.effects.find((e) => e.kind === 'zone')!;
      expect(
        componentValue(c) -
          componentValue({
            ...c,
            effects: c.effects.map((e) =>
              e === zone && e.kind === 'zone'
                ? { ...e, zone: { ...e.zone, zoneTransplant: false } }
                : e,
            ),
          }),
      ).toBe(12);
      if (projectile) {
        c.delivery = { kind: 'projectile', projSpeed: 1000, maxRange: 600 };
        c.effects.unshift({ kind: 'damage', amount: 1 });
      }
      p.abilities!.a1 = recompose(c, original);
      expect(describeAbility(p.abilities!.a1)).toContain('transplant');
      input(w, 'a1');
      if (projectile) for (let i = 0; i < 80 && !w.groundZones.length; i++) input(w);
      arm(w);
      expect(fieldTransplantViews(w, p)).toHaveLength(1);
      p.aim = left;
      tryFieldTransplant(w, p, 'a1', true);
      expect(w.groundZones[0].pos).toEqual(transplantDestination(w, p));
    },
  );
  it('copying the field to another class retains its transplant but copying a nonfield does not', () => {
    const { w, p } = setup();
    const copy = recompose(decompose(p.abilities!.a1), { slot: 'a1', name: 'Copied', cooldown: 8 });
    w.setActiveClass(p, 'mage');
    p.abilities!.a1 = copy;
    p.cooldowns.a1 = 0;
    input(w, 'a1');
    arm(w);
    expect(fieldTransplantViews(w, p)).toHaveLength(1);
    const nonfield = recompose(
      {
        delivery: { kind: 'projectile', projSpeed: 700 },
        effects: [{ kind: 'damage', amount: 20 }],
      },
      copy,
    );
    expect(describeAbility(nonfield)).not.toContain('transplant');
  });
  it('replacing a field with a nonfield cast removes the old recast instead of moving it', () => {
    const { w, p } = setup();
    input(w, 'a1');
    arm(w);
    const old = w.groundZones[0];
    p.abilities!.a1 = {
      slot: 'a1',
      name: 'Replacement',
      kind: 'projectile',
      damage: 10,
      cooldown: 8,
      projSpeed: 700,
    };
    p.cooldowns.a1 = 0;
    input(w);
    input(w, 'a1');
    expect(p.fieldTransplants!.a1).toBeUndefined();
    expect(w.groundZones[0]).toBe(old);
    expect(fieldTransplantViews(w, p)).toEqual([]);
  });
  it('original arming must complete before a fresh transplant can be used', () => {
    const { w, p } = setup();
    input(w, 'a1');
    expect(w.groundZones[0].armRemaining).toBeGreaterThan(0);
    expect(tryFieldTransplant(w, p, 'a1', true)).toBe(false);
    arm(w);
    expect(fieldTransplantViews(w, p)).toHaveLength(1);
  });
  it('a ready original cooldown starts a normal new field instead of relocating an old one', () => {
    const { w, p } = setup();
    input(w, 'a1');
    arm(w);
    const old = w.groundZones[0];
    p.cooldowns.a1 = 0;
    input(w);
    input(w, 'a1', left);
    expect(w.groundZones).toHaveLength(2);
    expect(old.pos).not.toEqual(w.groundZones[1].pos);
    expect(p.fieldTransplants!.a1!.zoneId).toBe(w.groundZones[1].id);
  });
  it('late impacts from an older cast cannot replace the newer field candidate', () => {
    const { w, p } = setup();
    const original = p.abilities!.a1,
      c = decompose(original);
    c.delivery = { kind: 'projectile', projSpeed: 100, maxRange: 600 };
    c.effects.unshift({ kind: 'damage', amount: 1 });
    p.abilities!.a1 = recompose(c, original);
    input(w, 'a1');
    const old = w.projectiles[0];
    input(w);
    p.cooldowns.a1 = 0;
    input(w, 'a1');
    const newer = w.projectiles[1];
    newer.pos = { ...w.boss!.pos };
    (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0);
    const latest = p.fieldTransplants!.a1!.zoneId;
    old.pos = { ...w.boss!.pos };
    (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0);
    expect(latest).toBeDefined();
    expect(p.fieldTransplants!.a1!.zoneId).toBe(latest);
    expect(w.groundZones).toHaveLength(2);
  });
  it('draws detached exact-destination readiness without a distant-origin connecting line', () => {
    const { w } = setup();
    input(w, 'a1');
    arm(w);
    const v = w.serialize().players[0].fieldTransplants![0];
    expect(JSON.stringify(v)).not.toContain('source');
    const g = new Graphics();
    drawFieldTransplant(g, v, { x: 100, y: 100 }, { x: 300, y: 100 }, 0.5);
    drawFieldTransplant(
      g,
      { ...v, blocked: 'Stunned' },
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      0.5,
    );
    expect(g.context.instructions.length).toBeGreaterThan(0);
    g.destroy();
  });
  it.each([
    { x: -400, y: 150 },
    { x: 800, y: 150 },
    { x: 200, y: -300 },
    { x: 200, y: 900 },
    { x: 200, y: 150 },
  ])('keeps off-camera destination cues visible (%s)', (to) => {
    const viewport = { width: 400, height: 300 };
    const cue = transplantEdge(to, viewport);
    if (cue) {
      expect(cue.x).toBeGreaterThan(0);
      expect(cue.x).toBeLessThan(400);
      expect(cue.y).toBeGreaterThan(0);
      expect(cue.y).toBeLessThan(300);
    } else expect(to).toEqual({ x: 200, y: 150 });
    const g = new Graphics();
    drawFieldTransplant(
      g,
      {
        reach: 400,
        slot: 'a1',
        zoneId: 1,
        from: { x: 0, y: 0 },
        to,
        radius: 100,
        remaining: 3,
        blocked: null,
      },
      { x: 100, y: 100 },
      to,
      1,
      viewport,
    );
    expect(g.context.instructions.length).toBeGreaterThan(0);
    g.destroy();
  });
  it('native field eligibility follows graft/reclaim while preserving the earned identity bank', () => {
    const ctx = {
      classes: ['druid' as const],
      history: [] as string[],
      subSkills: ['dr_land_spike'],
    };
    expect(grandEarnable('dr_land_g_b', 'druid', ctx)).toBe(true);
    ctx.history = ['hy_warhowl'];
    expect(grandEarnable('dr_land_g_b', 'druid', ctx)).toBe(false);
    const loadout = normalizeGrandLoadout(
      { version: 1, classes: { druid: { bank: ['dr_land_g_b'], equipped: ['dr_land_g_b'] } } },
      ctx,
    );
    expect(loadout.classes.druid!.bank).toContain('dr_land_g_b');
    expect(loadout.classes.druid!.equipped).toEqual([]);
    ctx.history.push('restore:a1');
    expect(grandEarnable('dr_land_g_b', 'druid', ctx)).toBe(true);
  });
  it('Forge eligibility requires an actual retained field instead of promising a nonfield benefit', () => {
    for (let seed = 0; seed < 12; seed++) {
      setForgeSeed(seed);
      const { p } = setup();
      const anyField = [
        ...Object.values(p.abilities!),
        ...Object.values(p.subAbilities ?? {}),
      ].some((ab) =>
        ab.components?.effects.some((e) => e.kind === 'zone' && e.zone.zoneTransplant),
      );
      expect(
        grandEarnable('dr_land_g_b', 'druid', {
          classes: ['druid'],
          history: [],
          subSkills: [skills[0]],
        }),
      ).toBe(anyField);
    }
  });
});
