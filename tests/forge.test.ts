/**
 * Chaos Forge — pure generative CORE (docs/CHAOS_FORGE.md). Covers the
 * decompose/recompose round-trip, the balance-pricing weight, the component
 * describer and the name blender. Determinism and full branch coverage are the
 * bar (98% gate); the synthesizers get their own suites.
 */
import { describe, it, expect } from 'vitest';
import {
  decompose,
  recompose,
  componentValue,
  describeComposed,
  syllables,
  blendNames,
  forgeName,
  type AbilityComponents,
  type EffectComponent,
  type Delivery,
} from '../src/engine/content/forge';
import {
  CLASSES,
  CLASS_IDS,
  describeAbility,
  type PlayerAbilityDef,
} from '../src/engine/content/classes';
import type { AbilitySlot } from '../src/engine/core/types';

const SLOTS: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];

/** The executor-relevant fields the component model round-trips. */
function resolvable(def: Partial<PlayerAbilityDef>): Record<string, unknown> {
  const keys = [
    'kind',
    'damage',
    'range',
    'radius',
    'halfAngleDeg',
    'projSpeed',
    'projCount',
    'spreadDeg',
    'castTime',
    'impactRadius',
    'maxRange',
    'iframes',
    'stun',
    'freeze',
    'slowMult',
    'slowDuration',
    'buffDamageMult',
    'buffDefMult',
    'buffMoveMult',
    'zoneDuration',
    'zoneTickDamage',
    'zoneTickHeal',
    'zoneKind',
    'roots',
    'lifestealFrac',
    'healOnUse',
    'landingDamage',
  ] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (def[k] != null) out[k] = def[k];
  return out;
}

/** A deterministic 0-based chooser over [0,k) from a fixed integer stream
 * (defaults to 0 once exhausted, so pick ordering is explicit, not wrapped). */
function seqPick(seq: number[]): (n: number) => number {
  let i = 0;
  return (n: number) => (n <= 0 ? 0 : (seq[i++] ?? 0) % n);
}

describe('decompose / recompose round-trip', () => {
  it('every canonical ability round-trips its resolvable fields', () => {
    for (const cid of CLASS_IDS) {
      for (const slot of SLOTS) {
        const def = CLASSES[cid].abilities[slot];
        const comp = decompose(def);
        const back = recompose(comp, { slot, name: def.name, cooldown: def.cooldown });
        // Every canonical ability round-trips its resolvable (executor-relevant)
        // fields. Pure-mobility deliveries (Roll/Blink) and bare taunt carry no
        // payload effect; their only un-modeled field is a taunt timer, which
        // `resolvable` deliberately omits — so the equality holds for all of them.
        expect(resolvable(back)).toEqual(resolvable(def));
        expect(back.components).toBe(comp);
        expect(back.name).toBe(def.name);
        expect(back.cooldown).toBe(def.cooldown);
      }
    }
  });

  it('separates the projectile delivery from the multishot fan (flagship facet 1)', () => {
    const multishot = CLASSES.ranger.abilities.a1; // projCount 3, spreadDeg 30
    const comp = decompose(multishot);
    expect(comp.delivery.kind).toBe('projectile');
    expect(comp.delivery.projCount).toBe(3);
    // The fan is a delivery facet we can drop without losing the projectile.
    const single: AbilityComponents = {
      delivery: { ...comp.delivery, projCount: 1, spreadDeg: 0 },
      effects: comp.effects,
    };
    const back = recompose(single, { slot: 'a1', name: 'x', cooldown: 5 });
    expect(back.projCount).toBe(1);
    expect(back.kind).toBe('projectile');
  });

  it('separates the area-on-impact from dealing damage in it (flagship facet 2)', () => {
    const fireball = CLASSES.mage.abilities.a1; // impactRadius 110, damage 80
    const comp = decompose(fireball);
    expect(comp.delivery.impactRadius).toBe(110);
    expect(comp.effects.some((e) => e.kind === 'damage')).toBe(true);
    // Keep the impact vehicle, drop the damage → a harmless area delivery.
    const vehicle: AbilityComponents = {
      delivery: comp.delivery,
      effects: comp.effects.filter((e) => e.kind !== 'damage'),
    };
    const back = recompose(vehicle, { slot: 'a1', name: 'x', cooldown: 5 });
    expect(back.impactRadius).toBe(110);
    expect(back.damage).toBe(0);
  });

  it('separates the resistance buff from the damage buff bundled in Blessing (flagship facet 3)', () => {
    const blessing = CLASSES.cleric.abilities.a3; // buffDefMult 0.8 + buffDamageMult 1.25
    const comp = decompose(blessing);
    const buffs = comp.effects.filter((e) => e.kind === 'buff');
    expect(buffs.length).toBe(2); // one per axis — separable
    for (const b of buffs) expect(b.kind === 'buff' && b.target).toBe('allies');
    const resistOnly = buffs.find((e) => e.kind === 'buff' && e.defMult != null);
    expect(resistOnly).toBeDefined();
  });

  it('groundZone decomposes the whole zone (ticks, snare, root) into one component', () => {
    const entangle = CLASSES.druid.abilities.a1; // zone: dmg tick + slow + roots
    const comp = decompose(entangle);
    expect(comp.delivery.kind).toBe('groundZone');
    expect(comp.effects.length).toBe(1);
    const z = comp.effects[0];
    expect(z.kind).toBe('zone');
    if (z.kind === 'zone') {
      expect(z.zone.roots).toBe(true);
      expect(z.zone.slowMult).toBeLessThan(1);
      expect(z.zone.tickDamage).toBeGreaterThan(0);
      expect(z.zone.zoneKind).toBe('entangle');
    }
    const back = recompose(comp, { slot: 'a1', name: 'x', cooldown: 10 });
    expect(back.roots).toBe(true);
    expect(back.zoneKind).toBe('entangle');
  });

  it('a heal delivery decomposes damage as a heal effect', () => {
    const heal = CLASSES.cleric.abilities.a1;
    const comp = decompose(heal);
    expect(comp.effects[0]).toEqual({ kind: 'heal', amount: heal.damage });
  });

  // item 9 — SLUGGISH (cast/wind-up slow) as a forge component.
  it("decomposes a curse zone's castSlow into its zone rider and round-trips", () => {
    const hex = CLASSES.warlock.abilities.a1; // Hex: castSlow 1.4 on a poison zone
    const comp = decompose(hex);
    const z = comp.effects.find((e) => e.kind === 'zone');
    expect(z?.kind === 'zone' && z.zone.castSlow).toBe(1.4);
    const back = recompose(comp, { slot: 'a1', name: 'x', cooldown: 11 });
    expect(back.castSlow).toBe(1.4);
  });

  // item 7 — FLIGHT as a forge effect component.
  it('decomposes a flight-granting self-buff into a flight component and round-trips', () => {
    const wings: Omit<PlayerAbilityDef, 'slot'> = {
      name: 'wings',
      kind: 'selfBuff',
      cooldown: 12,
      damage: 0,
      buffDefMult: 0.6,
      buffDuration: 5,
      grantsFlight: 5,
    };
    const comp = decompose(wings);
    const fl = comp.effects.find((e) => e.kind === 'flight');
    expect(fl?.kind === 'flight' && fl.duration).toBe(5);
    expect(componentValue(comp)).toBeGreaterThan(0);
    expect(describeComposed(comp, 12)).toContain('fly');
    const back = recompose(comp, { slot: 'a2', name: 'x', cooldown: 12 });
    expect(back.grantsFlight).toBe(5);
  });

  // item 11 — FORCED MOVEMENT (knockback / pull) as a forge component.
  it('decomposes a knockback / pull rider into a shove component and round-trips', () => {
    const shove: Omit<PlayerAbilityDef, 'slot'> = {
      name: 'bash',
      kind: 'meleeCone',
      cooldown: 6,
      damage: 20,
      range: 70,
      halfAngleDeg: 45,
      knockback: 160,
    };
    const comp = decompose(shove);
    const sh = comp.effects.find((e) => e.kind === 'shove');
    expect(sh?.kind === 'shove' && sh.distance).toBe(160);
    expect(sh?.kind === 'shove' && sh.pull).toBe(false);
    expect(componentValue(comp)).toBeGreaterThan(componentValue(decompose({ ...shove, knockback: undefined })));
    expect(describeComposed(comp, 6)).toContain('knock back');
    const back = recompose(comp, { slot: 'a3', name: 'x', cooldown: 6 });
    expect(back.knockback).toBe(160);

    // A pull round-trips to the pull field.
    const pullComp = decompose({ ...shove, knockback: undefined, pull: 200 });
    const pl = pullComp.effects.find((e) => e.kind === 'shove');
    expect(pl?.kind === 'shove' && pl.pull).toBe(true);
    expect(recompose(pullComp, { slot: 'a3', name: 'x', cooldown: 6 }).pull).toBe(200);
  });

  // item 8 — the AIRBORNE zone facet survives decompose/recompose.
  it('carries a zone airborne flag through the round-trip', () => {
    const rain: Omit<PlayerAbilityDef, 'slot'> = {
      name: 'rain',
      kind: 'groundZone',
      cooldown: 10,
      damage: 0,
      zoneDuration: 4,
      zoneTickDamage: 10,
      zoneKind: 'entangle',
      airborne: true, // an Otiluke-style floating cage on the ground kind
    };
    const comp = decompose(rain);
    const z = comp.effects.find((e) => e.kind === 'zone');
    expect(z?.kind === 'zone' && z.zone.airborne).toBe(true);
    const back = recompose(comp, { slot: 'a1', name: 'x', cooldown: 10 });
    expect(back.airborne).toBe(true);
  });

  it('decomposes a direct-hit castSlow rider — priced, described, round-tripped', () => {
    const cursed: Omit<PlayerAbilityDef, 'slot'> = {
      name: 'cursed strike',
      kind: 'meleeCone',
      cooldown: 6,
      damage: 20,
      range: 70,
      halfAngleDeg: 45,
      castSlow: 1.5,
      castSlowDuration: 3,
    };
    const comp = decompose(cursed);
    const cs = comp.effects.find((e) => e.kind === 'castSlow');
    expect(cs?.kind === 'castSlow' && cs.mult).toBe(1.5);
    // Monotonic pricing — the rider adds value, never subtracts.
    const withCs = componentValue(comp);
    const without = componentValue(decompose({ ...cursed, castSlow: undefined }));
    expect(withCs).toBeGreaterThan(without);
    // Auto-generated card text surfaces it, and it round-trips to flat fields.
    expect(describeComposed(comp, 6)).toContain('wind-up');
    const back = recompose(comp, { slot: 'a1', name: 'x', cooldown: 6 });
    expect(back.castSlow).toBe(1.5);
    expect(back.castSlowDuration).toBe(3);
  });

  it('covers the remaining decompose field-gates via synthetic defs', () => {
    // A healing zone with no explicit zoneKind → sanctuary default.
    const healZone = decompose({
      name: 'z',
      kind: 'groundZone',
      cooldown: 4,
      damage: 0,
      zoneDuration: 3,
      zoneTickHeal: 8,
    });
    const z0 = healZone.effects[0];
    expect(z0.kind === 'zone' && z0.zone.zoneKind).toBe('sanctuary');

    // A damaging zone with no zoneKind → rainOfArrows default, no radius set → 130.
    const dmgZone = decompose({
      name: 'z',
      kind: 'groundZone',
      cooldown: 4,
      damage: 0,
      zoneDuration: 3,
    });
    const z1 = dmgZone.effects[0];
    expect(z1.kind === 'zone' && z1.zone.zoneKind).toBe('rainOfArrows');
    expect(z1.kind === 'zone' && z1.zone.radius).toBe(130);

    // A dash with landing damage + a self move buff.
    const leap = decompose({
      name: 'leap',
      kind: 'dash',
      cooldown: 7,
      damage: 0,
      range: 270,
      landingDamage: 22,
      radius: 120,
      buffMoveMult: 1.2,
      buffDuration: 5,
    });
    expect(leap.effects.some((e) => e.kind === 'landingDamage')).toBe(true);
    const mv = leap.effects.find((e) => e.kind === 'buff');
    expect(mv?.kind === 'buff' && mv.target).toBe('self');
    expect(mv?.kind === 'buff' && mv.moveMult).toBe(1.2);
    expect(leap.delivery.radius).toBe(120);
  });
});

describe('decompose / recompose — remaining field gates', () => {
  it('round-trips a kitchen-sink strike (freeze, maxRange, all riders)', () => {
    const comp: AbilityComponents = {
      delivery: {
        kind: 'projectile',
        projSpeed: 600,
        projCount: 1,
        maxRange: 800,
        impactRadius: 80,
      },
      effects: [
        { kind: 'damage', amount: 50 },
        { kind: 'freeze', seconds: 0.8 },
        { kind: 'slow', mult: 0.6, duration: 2 },
        { kind: 'lifesteal', frac: 0.15 },
      ],
    };
    const def = recompose(comp, { slot: 'a1', name: 'x', cooldown: 6 });
    expect(def.freeze).toBe(0.8);
    expect(def.maxRange).toBe(800);
    expect(def.slowMult).toBe(0.6);
    expect(def.lifestealFrac).toBe(0.15);
    // decompose reproduces those effects (freeze + maxRange gates on the read side).
    const round = decompose(def);
    expect(round.delivery.maxRange).toBe(800);
    expect(round.effects.some((e) => e.kind === 'freeze')).toBe(true);
  });

  it('drops damage on a delivery that is neither a strike nor a heal', () => {
    // A selfBuff carrying damage has no direct-strike delivery → no damage effect.
    const comp = decompose({
      name: 'x',
      kind: 'selfBuff',
      cooldown: 10,
      damage: 40,
      buffDefMult: 0.6,
      buffDuration: 5,
    });
    expect(comp.effects.some((e) => e.kind === 'damage')).toBe(false);
    expect(comp.effects.some((e) => e.kind === 'buff')).toBe(true);
  });
});

describe('componentValue — balance pricing', () => {
  const strike = (amount: number): AbilityComponents => ({
    delivery: { kind: 'projectile' },
    effects: [{ kind: 'damage', amount }],
  });

  it('is monotonic — adding a component never lowers the value', () => {
    const base = strike(40);
    const withStun: AbilityComponents = {
      delivery: base.delivery,
      effects: [...base.effects, { kind: 'stun', seconds: 1 }],
    };
    expect(componentValue(withStun)).toBeGreaterThan(componentValue(base));
  });

  it('prices every effect kind and the fan multiplier', () => {
    expect(componentValue(strike(40))).toBeCloseTo(40, 6);
    // The fan multiplies damage output.
    const fan: AbilityComponents = {
      delivery: { kind: 'projectile', projCount: 3 },
      effects: [{ kind: 'damage', amount: 40 }],
    };
    expect(componentValue(fan)).toBeCloseTo(120, 6);

    const each: Array<[EffectComponent, number]> = [
      [{ kind: 'landingDamage', amount: 20 }, 20],
      [{ kind: 'heal', amount: 50 }, 50],
      [{ kind: 'healOnUse', amount: 18 }, 18],
      [{ kind: 'lifesteal', frac: 0.2 }, 12],
      [{ kind: 'stun', seconds: 1 }, 55],
      [{ kind: 'freeze', seconds: 1 }, 50],
      [{ kind: 'slow', mult: 0.5, duration: 2 }, 12],
    ];
    for (const [e, want] of each) {
      const c: AbilityComponents = { delivery: { kind: 'pbaoe' }, effects: [e] };
      expect(componentValue(c)).toBeCloseTo(want, 4);
    }
  });

  it('prices buffs per axis and discounts a rooted cast', () => {
    const dmgBuff: AbilityComponents = {
      delivery: { kind: 'selfBuff' },
      effects: [{ kind: 'buff', target: 'self', dmgMult: 1.3, duration: 6 }],
    };
    const defBuff: AbilityComponents = {
      delivery: { kind: 'selfBuff' },
      effects: [{ kind: 'buff', target: 'self', defMult: 0.7, duration: 6 }],
    };
    const moveBuff: AbilityComponents = {
      delivery: { kind: 'selfBuff' },
      effects: [{ kind: 'buff', target: 'self', moveMult: 1.2, duration: 6 }],
    };
    expect(componentValue(dmgBuff)).toBeGreaterThan(0);
    expect(componentValue(defBuff)).toBeGreaterThan(0);
    expect(componentValue(moveBuff)).toBeGreaterThan(0);

    // The cast discount lowers an otherwise-identical nuke's price.
    const instant = strike(80);
    const cast: AbilityComponents = {
      delivery: { kind: 'projectile', castTime: 0.7 },
      effects: [{ kind: 'damage', amount: 80 }],
    };
    expect(componentValue(cast)).toBeLessThan(componentValue(instant));
  });

  it('values a zone with ticks, snare, roots and an ally buff', () => {
    const zone: AbilityComponents = {
      delivery: { kind: 'groundZone' },
      effects: [
        {
          kind: 'zone',
          zone: {
            zoneKind: 'rainOfArrows',
            duration: 4,
            radius: 120,
            tickDamage: 10,
            tickHeal: 5,
            slowMult: 0.5,
            roots: true,
            allyBuff: { defMult: 0.8, duration: 4 },
          },
        },
      ],
    };
    expect(componentValue(zone)).toBeGreaterThan(0);
  });
});

describe('branch completeness — defensive gates', () => {
  it('decompose: a slow with no explicit duration falls back, a >=1 mult is not a slow', () => {
    const noDur = decompose({
      name: 'x',
      kind: 'pbaoe',
      cooldown: 5,
      damage: 10,
      radius: 100,
      slowMult: 0.5, // no slowDuration → ?? 2 fallback
    });
    const slow = noDur.effects.find((e) => e.kind === 'slow');
    expect(slow?.kind === 'slow' && slow.duration).toBe(2);

    // slowMult >= 1 is "no slow" — the < 1 guard drops it.
    const noSlow = decompose({
      name: 'x',
      kind: 'pbaoe',
      cooldown: 5,
      damage: 10,
      radius: 100,
      slowMult: 1,
    });
    expect(noSlow.effects.some((e) => e.kind === 'slow')).toBe(false);
  });

  it('recompose: a zone with neither slow nor roots sets no slow/root fields', () => {
    const def = recompose(
      {
        delivery: { kind: 'groundZone' },
        effects: [
          { kind: 'zone', zone: { zoneKind: 'sanctuary', duration: 4, radius: 100, tickHeal: 8 } },
        ],
      },
      { slot: 'a2', name: 'x', cooldown: 12 },
    );
    expect(def.slowMult).toBeUndefined();
    expect(def.roots).toBeUndefined();
    expect(def.zoneTickHeal).toBe(8);
  });

  it('componentValue: a snare-only zone, and a plain damaging zone (no slow/roots/buff)', () => {
    const snare = componentValue({
      delivery: { kind: 'groundZone' },
      effects: [
        { kind: 'zone', zone: { zoneKind: 'entangle', duration: 4, radius: 100, slowMult: 0.4 } },
      ],
    });
    expect(snare).toBeGreaterThan(0);
    // A plain damaging zone exercises the slowMult/roots/allyBuff false gates.
    const plain = componentValue({
      delivery: { kind: 'groundZone' },
      effects: [
        { kind: 'zone', zone: { zoneKind: 'poison', duration: 4, radius: 100, tickDamage: 10 } },
      ],
    });
    expect(plain).toBeGreaterThan(0);
  });

  it('decompose/recompose: a snare zone with no explicit durations uses the fallbacks', () => {
    // groundZone with slowMult but no slowDuration and no zoneDuration.
    const comp = decompose({
      name: 'x',
      kind: 'groundZone',
      cooldown: 10,
      damage: 0,
      radius: 120,
      slowMult: 0.4,
    });
    const z = comp.effects[0];
    expect(z.kind === 'zone' && z.zone.duration).toBe(4); // zoneDuration ?? 4
    expect(z.kind === 'zone' && z.zone.slowDuration).toBe(2); // slowDuration ?? 2

    // recompose a zone whose slowMult carries no slowDuration → ?? 2.
    const def = recompose(
      {
        delivery: { kind: 'groundZone' },
        effects: [
          { kind: 'zone', zone: { zoneKind: 'entangle', duration: 4, radius: 100, slowMult: 0.4 } },
        ],
      },
      { slot: 'a1', name: 'x', cooldown: 10 },
    );
    expect(def.slowDuration).toBe(2);
  });

  it('forgeName uses the default connective chance for 2 donors with no opts', () => {
    const name = forgeName(['Multishot', 'Fireball'], seqPick([0, 0, 0]));
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('blendNames tolerates empty donor stems (capitalize empty guard)', () => {
    expect(blendNames('', '', seqPick([0, 0]))).toBe('');
  });
});

describe('describeComposed', () => {
  it('describes the flagship fusion without NaN/undefined', () => {
    const flagship: AbilityComponents = {
      delivery: { kind: 'projectile', projSpeed: 700, projCount: 1, impactRadius: 100 },
      effects: [
        {
          kind: 'zone',
          zone: {
            zoneKind: 'sanctuary',
            duration: 4,
            radius: 100,
            allyBuff: { defMult: 0.8, duration: 4 },
          },
        },
      ],
    };
    const text = describeComposed(flagship, 9);
    expect(text).not.toMatch(/NaN|undefined/);
    expect(text).toContain('single shot');
    expect(text).toContain('blast');
    expect(text).toContain('less dmg taken');
    expect(text).toContain('9s cooldown');
  });

  it('covers every delivery phrase (with and without optional facets)', () => {
    const cases: Array<[Delivery, RegExp]> = [
      [{ kind: 'meleeCone', halfAngleDeg: 45 }, /cleave/],
      [{ kind: 'meleeCone' }, /^cleave/],
      [{ kind: 'projectile', projCount: 3 }, /3× shot/],
      [{ kind: 'projectile' }, /single shot/],
      [{ kind: 'groundZone' }, /ground zone/],
      [{ kind: 'pbaoe', radius: 150 }, /burst/],
      [{ kind: 'pbaoe' }, /^burst/],
      [{ kind: 'dash', range: 220 }, /dash/],
      [{ kind: 'dash' }, /^dash/], // no range → bare "dash"
      [{ kind: 'blink', range: 250 }, /blink/],
      [{ kind: 'blink' }, /^blink/], // no range → bare "blink"
      [{ kind: 'selfBuff' }, /self-buff/],
      [{ kind: 'buffAlly' }, /ally boon/],
      [{ kind: 'heal' }, /targeted heal/],
      [{ kind: 'taunt' }, /taunt/],
    ];
    for (const [d, re] of cases) {
      const text = describeComposed({ delivery: d, effects: [] }, 5);
      expect(text).toMatch(re);
    }
  });

  it('describes single-axis buffs and single-axis ally-buffs', () => {
    // A self buff with ONLY a def axis, and one with ONLY a move axis.
    const defOnly = describeComposed(
      {
        delivery: { kind: 'selfBuff' },
        effects: [{ kind: 'buff', target: 'self', defMult: 0.6, duration: 4 }],
      },
      5,
    );
    expect(defOnly).toContain('less dmg taken');
    expect(defOnly).not.toContain('dmg for'); // no +dmg axis
    const moveOnly = describeComposed(
      {
        delivery: { kind: 'selfBuff' },
        effects: [{ kind: 'buff', target: 'self', moveMult: 1.2, duration: 4 }],
      },
      5,
    );
    expect(moveOnly).toContain('move');

    // Zones whose ally-buff carries only one axis each.
    for (const axis of ['dmgMult', 'moveMult'] as const) {
      const z = describeComposed(
        {
          delivery: { kind: 'groundZone' },
          effects: [
            {
              kind: 'zone',
              zone: {
                zoneKind: 'sanctuary',
                duration: 4,
                radius: 100,
                allyBuff: { [axis]: axis === 'dmgMult' ? 1.2 : 1.15, duration: 4 },
              },
            },
          ],
        },
        8,
      );
      expect(z).not.toMatch(/NaN|undefined/);
      expect(z).toContain('allies');
    }
  });

  it('covers every effect phrase', () => {
    const effects: EffectComponent[] = [
      { kind: 'damage', amount: 40 },
      { kind: 'heal', amount: 50 },
      { kind: 'healOnUse', amount: 18 },
      { kind: 'landingDamage', amount: 22 },
      { kind: 'lifesteal', frac: 0.2 },
      { kind: 'stun', seconds: 0.8 },
      { kind: 'freeze', seconds: 1 },
      { kind: 'slow', mult: 0.6, duration: 3 },
      { kind: 'buff', target: 'allies', dmgMult: 1.25, moveMult: 1.1, defMult: 0.8, duration: 6 },
      { kind: 'buff', target: 'self', dmgMult: 1.3, duration: 4 },
    ];
    const text = describeComposed({ delivery: { kind: 'pbaoe' }, effects }, 8);
    expect(text).not.toMatch(/NaN|undefined/);
    expect(text).toContain('40 dmg');
    expect(text).toContain('lifesteal');
    expect(text).toContain('stun');
    expect(text).toContain('freeze');
    expect(text).toContain('slow to 60%');
    expect(text).toContain('allies');
    expect(text).toContain('self');
  });

  it('describes each zone variant (roots, slow, ally-buff axes, and a bare zone)', () => {
    const rooty = describeComposed(
      {
        delivery: { kind: 'groundZone' },
        effects: [
          {
            kind: 'zone',
            zone: {
              zoneKind: 'entangle',
              duration: 4,
              radius: 120,
              tickDamage: 6,
              tickHeal: 3,
              roots: true,
              allyBuff: { defMult: 0.8, dmgMult: 1.2, moveMult: 1.1, duration: 4 },
            },
          },
        ],
      },
      10,
    );
    expect(rooty).toContain('roots');
    expect(rooty).toContain('tick');
    expect(rooty).not.toMatch(/NaN|undefined/);

    const slowy = describeComposed(
      {
        delivery: { kind: 'groundZone' },
        effects: [
          { kind: 'zone', zone: { zoneKind: 'poison', duration: 4, radius: 100, slowMult: 0.5 } },
        ],
      },
      10,
    );
    expect(slowy).toContain('slow to 50%');

    const bare = describeComposed(
      {
        delivery: { kind: 'groundZone' },
        effects: [{ kind: 'zone', zone: { zoneKind: 'voidZone', duration: 3, radius: 90 } }],
      },
      10,
    );
    expect(bare).toContain('zone');
  });
});

describe('name blending', () => {
  it('syllable-splits words on vowel→consonant boundaries', () => {
    expect(syllables('Multishot')).toEqual(['Mu', 'lti', 'sho', 't']);
    expect(syllables('Fireball')).toContain('Fi');
    expect(syllables('')).toEqual(['']);
    // An all-consonant / no-boundary word stays whole.
    expect(syllables('sky')).toEqual(['sky']);
  });

  it('blends two donor names deterministically and legibly', () => {
    const pick = seqPick([0, 0]);
    const name = blendNames('Multishot', 'Fireball', pick);
    expect(name.length).toBeGreaterThanOrEqual(3);
    expect(name[0]).toBe(name[0].toUpperCase());
    // Deterministic given the same pick stream.
    expect(blendNames('Multishot', 'Fireball', seqPick([0, 0]))).toBe(name);
  });

  it('blends on the first word and strips leading articles', () => {
    const name = blendNames('Rain of Arrows', 'the Ravenous', seqPick([1, 0]));
    expect(name).not.toMatch(/\bthe\b/);
    expect(name.length).toBeGreaterThan(0);
  });

  it('falls back to a clean concat for a degenerate blend', () => {
    // Force a tiny head + tail that would be too short → length fallback path.
    const name = blendNames('a', 'b', seqPick([0, 0]));
    expect(name.length).toBeGreaterThanOrEqual(1);
    expect(name[0]).toBe(name[0].toUpperCase());
  });

  it('forgeName: 0 / 1 / 2+ donors and both connective shapes', () => {
    expect(forgeName([], seqPick([0]))).toBe('Forged Rite');
    expect(forgeName(['Fireball'], seqPick([0]))).toBe('Fireball');

    // connectiveChance 0 → never adds a connective (pure blend).
    const plain = forgeName(['Multishot', 'Fireball', 'Blessing'], seqPick([0, 0, 0]), {
      connectiveChance: 0,
    });
    expect(plain).not.toMatch(/ of | Exalted/);

    // connectiveChance 1 → always a connective; pick(2)=0 → leading prefix.
    const prefixed = forgeName(['Multishot', 'Fireball', 'Blessing'], seqPick([0, 0, 0, 0]), {
      connectiveChance: 1,
    });
    expect(prefixed.split(' ').length).toBeGreaterThanOrEqual(2);

    // Picks: [blendA, blendB, roll, branch(pick(2)), connectiveIdx]. branch=1 →
    // trailing "... of X Y" using the third donor.
    const trailing = forgeName(['Multishot', 'Fireball', 'Blessing'], seqPick([0, 0, 0, 1, 0]), {
      connectiveChance: 1,
    });
    expect(trailing).toMatch(/ of /);
  });

  it('forgeName dedupes donors and avoids echoing a donor with no distinct third', () => {
    // Two identical donors dedupe to one → single-donor path.
    expect(forgeName(['Fireball', 'Fireball'], seqPick([0]))).toBe('Fireball');
    // With only two unique donors, the trailing "… of X" form (which needs a
    // distinct third donor) falls back to the leading form — never "X of … X".
    const t = forgeName(['Multishot', 'Fireball'], seqPick([0, 0, 0, 1, 0]), {
      connectiveChance: 1,
    });
    expect(t).not.toMatch(/ of /);
    expect(t.split(' ').length).toBeGreaterThanOrEqual(2); // a leading connective
  });
});

describe('parity with the authored describer', () => {
  it('describeAbility still uses the flat walk for canonical (no components)', () => {
    // Canonical abilities carry no components → the authored exact-string path.
    expect(describeAbility(CLASSES.knight.abilities.basic)).toBe(
      '22 dmg · 70u reach · 90° arc · 0.7s cooldown',
    );
  });
});
