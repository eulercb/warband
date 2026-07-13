/**
 * Chaos Forge — SKILL & CLASS SYNTHESIS (docs/CHAOS_FORGE.md). Determinism,
 * balance-budget bounds, the flagship's producibility from the general method
 * (never hardcoded), and class renaming after the donor classes.
 */
import { describe, it, expect } from 'vitest';
import {
  synthesizeAbility,
  synthesizeClass,
  decompose,
  componentValue,
  type Donor,
} from '../src/engine/content/forge';
import { CLASSES, CLASS_IDS, describeAbility } from '../src/engine/content/classes';
import type { AbilitySlot } from '../src/engine/core/types';

const SLOTS: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];

/** The full component library — every canonical ability, tagged with its source. */
function donorPool(): Donor[] {
  const out: Donor[] = [];
  for (const cid of CLASS_IDS) {
    const c = CLASSES[cid];
    for (const slot of SLOTS) {
      out.push({
        name: c.abilities[slot].name,
        classId: cid,
        className: c.name,
        slot,
        def: c.abilities[slot],
      });
    }
  }
  return out;
}
const POOL = donorPool();

/** Median canonical output-per-second of a slot — the synthesis budget target. */
function slotBudget(slot: AbilitySlot): number {
  const vals = POOL.filter((d) => d.slot === slot)
    .map((d) => componentValue(decompose(d.def)) / Math.max(0.1, d.def.cooldown))
    .sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

const SEEDS = [1, 7, 42, 99, 1234, 55555, 0, 8675309];

describe('synthesizeAbility — determinism', () => {
  it('same (seed, key) → byte-identical fusion; different seeds vary', () => {
    for (const seed of SEEDS) {
      const a = synthesizeAbility(seed, 'knight.a1', 'a1', POOL);
      const b = synthesizeAbility(seed, 'knight.a1', 'a1', POOL);
      expect(JSON.stringify(a.def)).toBe(JSON.stringify(b.def));
    }
    // Across seeds the fusion changes (not a constant).
    const names = new Set(SEEDS.map((s) => synthesizeAbility(s, 'knight.a1', 'a1', POOL).def.name));
    expect(names.size).toBeGreaterThan(1);
  });
});

describe('synthesizeAbility — validity + balance budget', () => {
  it('every fusion is coherent, on-budget, and within CC/buff ceilings', () => {
    for (const seed of SEEDS) {
      for (const cid of CLASS_IDS) {
        for (const slot of SLOTS) {
          const { def } = synthesizeAbility(seed, `${cid}.${slot}`, slot, POOL);
          const comp = def.components!;
          expect(comp).toBeDefined();

          // Structural: a real delivery kind + at least a delivery (mobility can
          // be effect-less); the flat kind matches the delivery.
          expect(def.kind).toBe(comp.delivery.kind);
          expect(def.name.length).toBeGreaterThan(0);
          expect(describeAbility(def)).not.toMatch(/NaN|undefined/);

          // Cooldown within a sane band.
          expect(def.cooldown).toBeGreaterThan(0);
          expect(def.cooldown).toBeLessThanOrEqual(19);

          // At most ONE hard CC (no stun+freeze pile-up).
          const hardCC = comp.effects.filter(
            (e) => e.kind === 'stun' || e.kind === 'freeze',
          ).length;
          expect(hardCC).toBeLessThanOrEqual(1);

          // Buff ceilings (never immunity; capped boosts) — direct + zone allyBuff.
          for (const e of comp.effects) {
            if (e.kind === 'buff') {
              if (e.defMult != null) expect(e.defMult).toBeGreaterThanOrEqual(0.2);
              if (e.dmgMult != null) expect(e.dmgMult).toBeLessThanOrEqual(1.6);
              if (e.moveMult != null) expect(e.moveMult).toBeLessThanOrEqual(1.5);
            }
            if (e.kind === 'slow') {
              expect(e.mult).toBeGreaterThanOrEqual(0.2);
              expect(e.mult).toBeLessThanOrEqual(0.95);
            }
            if (e.kind === 'zone' && e.zone.allyBuff) {
              const b = e.zone.allyBuff;
              if (b.defMult != null) expect(b.defMult).toBeGreaterThanOrEqual(0.2);
              if (b.dmgMult != null) expect(b.dmgMult).toBeLessThanOrEqual(1.6);
            }
          }

          // Budget: output-per-second never far exceeds the slot's canonical median
          // (synthesis prices power to the budget; it never mints it).
          const ops = componentValue(comp) / def.cooldown;
          expect(ops).toBeLessThanOrEqual(slotBudget(slot) * 1.75 + 2);
        }
      }
    }
  });
});

describe('the flagship is PRODUCIBLE from the general method (never hardcoded)', () => {
  it('some seed yields a projectile that blooms an ally-resistance zone on impact', () => {
    let found: ReturnType<typeof synthesizeAbility> | null = null;
    outer: for (let seed = 0; seed < 400 && !found; seed++) {
      for (const cid of CLASS_IDS) {
        for (const slot of SLOTS) {
          const syn = synthesizeAbility(seed, `${cid}.${slot}`, slot, POOL);
          const comp = syn.def.components!;
          if (comp.delivery.kind !== 'projectile') continue;
          const zone = comp.effects.find((e) => e.kind === 'zone');
          if (zone && zone.kind === 'zone' && zone.zone.allyBuff?.defMult != null) {
            found = syn;
            break outer;
          }
        }
      }
    }
    expect(found).not.toBeNull();
    // It reads as one coherent ability, and its name blends its donors' names.
    const text = describeAbility(found!.def);
    expect(text).toContain('shot');
    expect(text).toContain('less dmg taken');
    expect(found!.def.name.length).toBeGreaterThan(0);
    // Not every fusion is the flagship — the method produces variety.
    const kinds = new Set(
      CLASS_IDS.flatMap((cid) =>
        SLOTS.map((s) => synthesizeAbility(0, `${cid}.${s}`, s, POOL).def.kind),
      ),
    );
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe('synthesizeClass — kit + rename', () => {
  it('fuses four slots and renames the class deterministically', () => {
    for (const seed of [1, 42, 777]) {
      const a = synthesizeClass(seed, CLASSES.rogue, POOL);
      const b = synthesizeClass(seed, CLASSES.rogue, POOL);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // deterministic
      // Identity preserved, kit fully synthesized, renamed.
      expect(a.id).toBe('rogue');
      expect(a.color).toBe(CLASSES.rogue.color);
      for (const slot of SLOTS) expect(a.abilities[slot].components).toBeDefined();
      expect(a.name.length).toBeGreaterThan(0);
    }
    // The rename varies across seeds (a real generative blend, not a constant).
    const names = new Set([1, 2, 3, 4, 5].map((s) => synthesizeClass(s, CLASSES.mage, POOL).name));
    expect(names.size).toBeGreaterThan(1);
  });

  it('preserves class stats and slot layout', () => {
    const c = synthesizeClass(42, CLASSES.knight, POOL);
    expect(c.maxHp).toBe(CLASSES.knight.maxHp);
    expect(c.role).toBe(CLASSES.knight.role);
    expect(Object.keys(c.abilities).sort()).toEqual(['a1', 'a2', 'a3', 'basic']);
  });
});

describe('future-proofing — new content flows through with no per-item wiring', () => {
  it('a slot absent from the donor pool falls back to a default budget', () => {
    // Only basics in the pool → synthesizing an a3 has no same-slot budget/donor.
    const basicsOnly = POOL.filter((d) => d.slot === 'basic');
    const { def } = synthesizeAbility(3, 'x.a3', 'a3', basicsOnly);
    expect(def.components).toBeDefined();
    expect(def.cooldown).toBeGreaterThan(0);
  });

  it('a NEW ally-buff axis (haste aura) is absorbed into fused zones automatically', () => {
    // A hypothetical future ability: an ally buff carrying move + dmg axes (no
    // canonical donor has an ally moveMult today). It should fold into synthesized
    // zones and be capped like any other — with zero new wiring.
    const future: Donor = {
      name: 'Windsong',
      classId: 'bard',
      className: 'Bard',
      slot: 'a2',
      def: {
        name: 'Windsong',
        kind: 'buffAlly',
        cooldown: 12,
        damage: 0,
        range: 400,
        buffMoveMult: 1.3,
        buffDamageMult: 1.25,
        buffDuration: 6,
      },
    };
    const pool = [...POOL, future];
    let folded: { defMult?: number; dmgMult?: number; moveMult?: number } | undefined;
    for (let seed = 0; seed < 500 && !folded?.moveMult; seed++) {
      for (const cid of CLASS_IDS) {
        for (const slot of SLOTS) {
          const comp = synthesizeAbility(seed, `${cid}.${slot}`, slot, pool).def.components!;
          const z = comp.effects.find((e) => e.kind === 'zone');
          if (z && z.kind === 'zone' && z.zone.allyBuff?.moveMult != null) {
            folded = z.zone.allyBuff;
          }
        }
      }
    }
    expect(folded?.moveMult).toBeDefined();
    // Capped to the move-buff ceiling (never above 1.5×).
    expect(folded!.moveMult!).toBeLessThanOrEqual(1.5);
  });
});
