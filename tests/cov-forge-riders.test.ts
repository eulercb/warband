/**
 * Coverage — Chaos Forge component plumbing for the NEW mechanics added in items
 * 7–13 (castSlow, flight, shove/knockback+pull, crit, the airborne zone facet).
 * Exercises the decompose ⇄ recompose round-trip, the composed description, the
 * balance value, the upgrade-reconcile paths (patch existing + add new), and a
 * synthesis sweep that caps/scales the riders. Behaviour-asserting throughout.
 */
import { describe, it, expect } from 'vitest';
import {
  decompose,
  recompose,
  describeComposed,
  componentValue,
  refreshComponents,
  synthesizeAbility,
  type AbilityComponents,
  type EffectComponent,
  type Donor,
} from '../src/engine/content/forge';
import {
  CLASSES,
  CLASS_IDS,
  describeAbility,
  type PlayerAbilityDef,
} from '../src/engine/content/classes';
import { CAST_SLOW_MAX } from '../src/engine/core/constants';

type Def = Omit<PlayerAbilityDef, 'slot'>;
const has = (c: AbilityComponents, k: EffectComponent['kind']): boolean =>
  c.effects.some((e) => e.kind === k);

describe('forge rider components — decompose ⇄ recompose round-trip (items 7–13)', () => {
  it('carries castSlow, flight, knockback, pull and airborne through the component form', () => {
    const hex: Def = {
      name: 'Hex',
      kind: 'meleeCone',
      cooldown: 6,
      damage: 20,
      range: 70,
      halfAngleDeg: 45,
      castSlow: 1.4,
      castSlowDuration: 3,
    };
    const hc = decompose(hex);
    expect(has(hc, 'castSlow')).toBe(true);
    const hr = recompose(hc, { slot: 'a1', name: 'Hex', cooldown: 6 });
    expect(hr.castSlow).toBeCloseTo(1.4, 5);
    expect(hr.castSlowDuration).toBeCloseTo(3, 5);

    const wings: Def = {
      name: 'Wings',
      kind: 'selfBuff',
      cooldown: 12,
      damage: 0,
      grantsFlight: 5,
      buffDuration: 5,
    };
    const wc = decompose(wings);
    expect(has(wc, 'flight')).toBe(true);
    expect(recompose(wc, { slot: 'a2', name: 'Wings', cooldown: 12 }).grantsFlight).toBeCloseTo(
      5,
      5,
    );

    const kb: Def = {
      name: 'Bash',
      kind: 'meleeCone',
      cooldown: 7,
      damage: 30,
      range: 70,
      halfAngleDeg: 45,
      knockback: 170,
    };
    expect(decompose(kb).effects.some((e) => e.kind === 'shove' && !e.pull)).toBe(true);
    expect(recompose(decompose(kb), { slot: 'a1', name: 'Bash', cooldown: 7 }).knockback).toBe(170);

    const pull: Def = {
      name: 'Hook',
      kind: 'meleeCone',
      cooldown: 7,
      damage: 30,
      range: 70,
      halfAngleDeg: 45,
      pull: 200,
    };
    const pc = decompose(pull);
    expect(pc.effects.some((e) => e.kind === 'shove' && e.pull)).toBe(true);
    expect(recompose(pc, { slot: 'a1', name: 'Hook', cooldown: 7 }).pull).toBe(200);

    const rain: Def = {
      name: 'Rain',
      kind: 'groundZone',
      cooldown: 12,
      damage: 0,
      range: 460,
      radius: 120,
      zoneDuration: 3,
      zoneTickDamage: 12,
      zoneKind: 'rainOfArrows',
      airborne: true,
    };
    const rc = decompose(rain);
    const z = rc.effects.find((e) => e.kind === 'zone');
    expect(z && z.kind === 'zone' && z.zone.airborne).toBe(true);
    expect(recompose(rc, { slot: 'a2', name: 'Rain', cooldown: 12 }).airborne).toBe(true);
  });

  it('carries a crit lean — chance-only, mult-only, and both (item 13)', () => {
    const chanceOnly: Def = {
      name: 'Aim',
      kind: 'projectile',
      cooldown: 6,
      damage: 30,
      projSpeed: 700,
      projCount: 1,
      critChanceBonus: 0.3,
    };
    const co = decompose(chanceOnly);
    expect(has(co, 'crit')).toBe(true);
    const cor = recompose(co, { slot: 'a1', name: 'Aim', cooldown: 6 });
    expect(cor.critChanceBonus).toBeCloseTo(0.3, 5);
    expect(cor.critMultBonus).toBeUndefined(); // e.mult === 0 → recompose leaves it unset

    const multOnly: Def = {
      name: 'Deep',
      kind: 'meleeCone',
      cooldown: 6,
      damage: 40,
      range: 60,
      halfAngleDeg: 40,
      critMultBonus: 0.7,
    };
    const mo = decompose(multOnly);
    expect(has(mo, 'crit')).toBe(true);
    const mor = recompose(mo, { slot: 'a1', name: 'Deep', cooldown: 6 });
    expect(mor.critMultBonus).toBeCloseTo(0.7, 5);
    expect(mor.critChanceBonus).toBeUndefined();

    const both: Def = {
      name: 'Kill',
      kind: 'meleeCone',
      cooldown: 7,
      damage: 50,
      range: 58,
      halfAngleDeg: 32,
      critChanceBonus: 0.35,
      critMultBonus: 0.6,
    };
    const br = recompose(decompose(both), { slot: 'a1', name: 'Kill', cooldown: 7 });
    expect(br.critChanceBonus).toBeCloseTo(0.35, 5);
    expect(br.critMultBonus).toBeCloseTo(0.6, 5);
  });
});

describe('forge rider components — description + value (items 7–13)', () => {
  it('describeComposed phrases each rider', () => {
    const line = describeComposed(
      {
        delivery: { kind: 'meleeCone', range: 70, halfAngleDeg: 45 },
        effects: [
          { kind: 'damage', amount: 30 },
          { kind: 'castSlow', mult: 1.4, duration: 3 },
          { kind: 'shove', distance: 170, pull: false },
          { kind: 'crit', chance: 0.3, mult: 0.5 },
        ],
      },
      7,
    );
    expect(line).toContain('enemy wind-up');
    expect(line).toContain('knock back 170u');
    expect(line).toContain('crit');

    // Pull phrase + a flight phrase + a chance-only crit phrase (mult === 0 branch).
    const line2 = describeComposed(
      {
        delivery: { kind: 'selfBuff' },
        effects: [
          { kind: 'flight', duration: 5 },
          { kind: 'shove', distance: 200, pull: true },
          { kind: 'crit', chance: 0.2, mult: 0 },
        ],
      },
      8,
    );
    expect(line2).toContain('fly 5s');
    expect(line2).toContain('pull 200u');
    expect(line2).toMatch(/\+\d+% crit/);
    expect(line2).not.toContain('crit dmg'); // mult 0 → the short crit phrase

    // A MULT-only crit (chance 0) reads only the crit-damage clause — never a
    // spurious "+0% crit" (each clause is guarded independently).
    const line3 = describeComposed(
      {
        delivery: { kind: 'meleeCone', range: 70, halfAngleDeg: 45 },
        effects: [{ kind: 'crit', chance: 0, mult: 0.5 }],
      },
      6,
    );
    expect(line3).toContain('+0.5× crit dmg');
    expect(line3).not.toContain('% crit'); // no "+0% crit" prefix
  });

  it('componentValue prices each rider above the bare delivery', () => {
    const base: AbilityComponents = {
      delivery: { kind: 'meleeCone', range: 70, halfAngleDeg: 45 },
      effects: [{ kind: 'damage', amount: 20 }],
    };
    const v0 = componentValue(base);
    for (const rider of [
      { kind: 'castSlow', mult: 1.5, duration: 4 } as const,
      { kind: 'flight', duration: 5 } as const,
      { kind: 'shove', distance: 200, pull: false } as const,
      { kind: 'crit', chance: 0.3, mult: 0.5 } as const,
    ]) {
      const v = componentValue({ ...base, effects: [...base.effects, rider] });
      expect(v).toBeGreaterThan(v0);
    }
  });
});

describe('forge upgrade reconcile — refreshComponents (item 2 × new riders)', () => {
  it('PATCHES an existing rider component when the flat field is retuned', () => {
    // Start from a fused def that already carries every rider as a component.
    const seed = recompose(
      {
        delivery: { kind: 'meleeCone', range: 70, halfAngleDeg: 45 },
        effects: [
          { kind: 'damage', amount: 30 },
          { kind: 'castSlow', mult: 1.3, duration: 3 },
          { kind: 'shove', distance: 120, pull: false },
          { kind: 'shove', distance: 120, pull: true },
          { kind: 'crit', chance: 0.2, mult: 0.3 },
        ],
      },
      { slot: 'a1', name: 'Fused', cooldown: 7 },
    );
    // An upgrade retunes the flat fields; refreshComponents must patch the components.
    seed.castSlow = 1.6;
    seed.knockback = 200;
    seed.pull = 180;
    seed.critChanceBonus = 0.4;
    seed.critMultBonus = 0.6;
    const comp = refreshComponents(seed);
    const cs = comp.effects.find((e) => e.kind === 'castSlow');
    expect(cs && cs.kind === 'castSlow' && cs.mult).toBeCloseTo(1.6, 5);
    const kb = comp.effects.find((e) => e.kind === 'shove' && !e.pull);
    expect(kb && kb.kind === 'shove' && kb.distance).toBe(200);
    const pl = comp.effects.find((e) => e.kind === 'shove' && e.pull);
    expect(pl && pl.kind === 'shove' && pl.distance).toBe(180);
    const cr = comp.effects.find((e) => e.kind === 'crit');
    expect(cr && cr.kind === 'crit' && cr.chance).toBeCloseTo(0.4, 5);
  });

  it('ADDS a rider component for a boon axis the fused skill lacked (never no-ops)', () => {
    // A fused strike with NO riders in its components...
    const seed = recompose(
      {
        delivery: { kind: 'meleeCone', range: 70, halfAngleDeg: 45 },
        effects: [{ kind: 'damage', amount: 30 }],
      },
      { slot: 'a1', name: 'Plain', cooldown: 7 },
    );
    // ...gains flat rider fields from a boon; refreshComponents adds matching components.
    seed.castSlow = 1.4;
    seed.knockback = 150;
    seed.pull = 160;
    seed.critChanceBonus = 0.25;
    seed.critMultBonus = 0.4;
    seed.grantsFlight = 5;
    const comp = refreshComponents(seed);
    expect(has(comp, 'castSlow')).toBe(true);
    expect(comp.effects.some((e) => e.kind === 'shove' && !e.pull)).toBe(true);
    expect(comp.effects.some((e) => e.kind === 'shove' && e.pull)).toBe(true);
    expect(has(comp, 'crit')).toBe(true);
    expect(has(comp, 'flight')).toBe(true);
  });

  it('PATCHES the airborne facet onto a fused zone (item 8)', () => {
    const seed = recompose(
      {
        delivery: { kind: 'groundZone', range: 460, radius: 120 },
        effects: [
          { kind: 'zone', zone: { zoneKind: 'poison', duration: 3, radius: 120, tickDamage: 12 } },
        ],
      },
      { slot: 'a2', name: 'Cloud', cooldown: 10 },
    );
    seed.airborne = true;
    const comp = refreshComponents(seed);
    const z = comp.effects.find((e) => e.kind === 'zone');
    expect(z && z.kind === 'zone' && z.zone.airborne).toBe(true);
  });
});

describe('forge synthesis — riders are capped + scaled on budget (items 9,11,13)', () => {
  it('a rider-rich donor pool synthesizes valid, capped a1 fusions across seeds', () => {
    const pool: Donor[] = [];
    for (const cid of CLASS_IDS) {
      const c = CLASSES[cid];
      pool.push({
        name: c.abilities.a1.name,
        classId: cid,
        className: c.name,
        slot: 'a1',
        def: {
          ...c.abilities.a1,
          kind: 'meleeCone',
          range: 70,
          halfAngleDeg: 45,
          damage: 30,
          castSlow: 1.6,
          castSlowDuration: 4,
          knockback: 220,
          critChanceBonus: 0.4,
          critMultBonus: 0.7,
        },
      });
    }
    for (const seed of [1, 7, 42, 99, 1234, 55555]) {
      const { def } = synthesizeAbility(seed, `rider.a1.${seed}`, 'a1', pool);
      expect(def.cooldown).toBeGreaterThan(0);
      expect(describeAbility(def)).not.toMatch(/NaN|undefined/);
      // Any surviving rider sits within its ceiling (capEffect).
      if (def.castSlow != null) expect(def.castSlow).toBeLessThanOrEqual(CAST_SLOW_MAX + 1e-9);
      if (def.critChanceBonus != null) expect(def.critChanceBonus).toBeLessThanOrEqual(0.5 + 1e-9);
      if (def.critMultBonus != null) expect(def.critMultBonus).toBeLessThanOrEqual(1.5 + 1e-9);
      if (def.knockback != null) expect(def.knockback).toBeLessThanOrEqual(260 + 1e-9);
    }
  });

  it('a flight/self-buff donor pool synthesizes valid a2 fusions across seeds', () => {
    const pool: Donor[] = [];
    for (const cid of CLASS_IDS) {
      const c = CLASSES[cid];
      pool.push({
        name: c.abilities.a2.name,
        classId: cid,
        className: c.name,
        slot: 'a2',
        def: {
          name: c.abilities.a2.name,
          kind: 'selfBuff',
          cooldown: 12,
          damage: 0,
          grantsFlight: 6,
          buffDuration: 6,
          buffDefMult: 0.6,
        },
      });
    }
    for (const seed of [2, 8, 21, 404, 9001]) {
      const { def } = synthesizeAbility(seed, `flight.a2.${seed}`, 'a2', pool);
      expect(def.cooldown).toBeGreaterThan(0);
      expect(describeAbility(def)).not.toMatch(/NaN|undefined/);
      if (def.grantsFlight != null) expect(def.grantsFlight).toBeLessThanOrEqual(8 + 1e-9);
    }
  });

  it('a heal-delivery pool with no heal effect injects an output anchor (item 6)', () => {
    // Every donor is a heal DELIVERY carrying only a buff (damage 0 → no heal effect),
    // so the fusion picks a heal delivery yet needs an anchor injected.
    const pool: Donor[] = [];
    for (const cid of CLASS_IDS) {
      const c = CLASSES[cid];
      pool.push({
        name: c.abilities.a1.name,
        classId: cid,
        className: c.name,
        slot: 'a1',
        def: {
          name: c.abilities.a1.name,
          kind: 'heal',
          cooldown: 10,
          damage: 0,
          range: 400,
          buffDefMult: 0.7,
          buffDuration: 5,
        },
      });
    }
    for (const seed of [3, 17, 256, 4096, 31337]) {
      const { def } = synthesizeAbility(seed, `heal.a1.${seed}`, 'a1', pool);
      expect(def.kind).toBe('heal');
      expect(def.damage).toBeGreaterThan(0); // an output anchor was guaranteed
      expect(describeAbility(def)).not.toMatch(/NaN|undefined/);
    }
  });

  it('a CC-stacked pool is trimmed to at most one hard CC (item balance)', () => {
    // Each donor piles stun + freeze + slow; the fusion must shed the extra hard CC.
    const pool: Donor[] = [];
    for (const cid of CLASS_IDS) {
      const c = CLASSES[cid];
      pool.push({
        name: c.abilities.a1.name,
        classId: cid,
        className: c.name,
        slot: 'a1',
        def: {
          name: c.abilities.a1.name,
          kind: 'meleeCone',
          cooldown: 8,
          damage: 30,
          range: 70,
          halfAngleDeg: 45,
          stun: 1,
          freeze: 1,
          slowMult: 0.5,
          slowDuration: 2,
        },
      });
    }
    for (const seed of [5, 50, 500, 5000, 50000]) {
      const { def } = synthesizeAbility(seed, `cc.a1.${seed}`, 'a1', pool);
      const hardCc = (def.stun ? 1 : 0) + (def.freeze ? 1 : 0);
      expect(hardCc).toBeLessThanOrEqual(1); // never two hard CC on one fusion
      expect(describeAbility(def)).not.toMatch(/NaN|undefined/);
    }
  });
});
