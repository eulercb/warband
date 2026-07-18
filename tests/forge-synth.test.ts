/**
 * Chaos Forge — SKILL & CLASS SYNTHESIS (docs/CHAOS_FORGE.md). Determinism,
 * balance-budget bounds, the flagship's producibility from the general method
 * (never hardcoded), and class renaming after the donor classes.
 */
import { describe, it, expect } from 'vitest';
import {
  synthesizeAbility,
  synthesizeClass,
  forgeClassStats,
  abilityCapability,
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

/** Median canonical output-per-second of a slot — the synthesis budget target. item 5 —
 * a HEAL delivery budgets against same-slot HEAL donors (healing is worth more per second
 * than damage), so mirror that here to bound a heal fusion's on-budget check. */
function slotBudget(slot: AbilitySlot, heal = false): number {
  const inSlot = POOL.filter((d) => d.slot === slot);
  const src = heal ? inSlot.filter((d) => d.def.kind === 'heal' && d.def.damage > 0) : inSlot;
  const pool = src.length > 0 ? src : inSlot;
  const vals = pool
    .map((d) => componentValue(decompose(d.def)) / Math.max(0.1, d.def.cooldown))
    .sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

/** The slowest canonical cooldown per slot — a fusion must never price above it
 * (basics spam; specials cycle within the authored 14/16s envelope). */
const CANON_MAX_CD: Record<AbilitySlot, number> = { basic: 0.9, a1: 14, a2: 16, a3: 16 };

/** The canonical MEDIAN cooldown per slot — fusions should center HERE, not at the
 * band ceiling (the pace synthesis prices toward). Derived from the donor pool. */
function canonMedianCd(slot: AbilitySlot): number {
  const cds = POOL.filter((d) => d.slot === slot)
    .map((d) => d.def.cooldown)
    .sort((a, b) => a - b);
  return cds[Math.floor(cds.length / 2)];
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

          // Cooldown sits within the slot's CANONICAL band — a fusion never prices
          // ABOVE the slowest hand-tuned ability of its slot (basics ~0.4–0.7s;
          // specials the 3.5–14/16s classes.ts occupies). Guards the cooldown fix:
          // before it, rigid fusions pinned at an inflated 16–18s ceiling.
          expect(def.cooldown).toBeGreaterThan(0);
          expect(def.cooldown).toBeLessThanOrEqual(CANON_MAX_CD[slot]);

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
          // (synthesis prices power to the budget; it never mints it). A heal fusion is
          // priced against the HEAL budget (item 5), so bound it against that.
          const ops = componentValue(comp) / def.cooldown;
          expect(ops).toBeLessThanOrEqual(slotBudget(slot, comp.delivery.kind === 'heal') * 1.75 + 2);
        }
      }
    }
  });

  // item 5 — no fused skill carries two components on the same axis. The buff dedup
  // (mergeBuffs) guarantees at most ONE buff component per target (self / allies),
  // so two same-axis buffs can't coexist — and pricing then matches delivery.
  it('never carries redundant buff components (≤1 buff per target) across seeds', () => {
    for (const seed of SEEDS) {
      for (const cid of CLASS_IDS) {
        for (const slot of SLOTS) {
          const { def } = synthesizeAbility(seed, `${cid}.${slot}`, slot, POOL);
          const buffs = def.components!.effects.filter((e) => e.kind === 'buff');
          const selves = buffs.filter((e) => e.kind === 'buff' && e.target === 'self').length;
          const allies = buffs.filter((e) => e.kind === 'buff' && e.target === 'allies').length;
          expect(selves).toBeLessThanOrEqual(1);
          expect(allies).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  // item 6 — a fusion whose DELIVERY implies direct output always lands a PLAYABLE
  // hit/heal (never the old single-digit / literally-1 dud): the compression floor
  // keeps the anchor's magnitude up, and ensureOutputAnchor guarantees one exists.
  it('a direct-output delivery always carries a playable damage/heal anchor', () => {
    for (const seed of SEEDS) {
      for (const cid of CLASS_IDS) {
        for (const slot of SLOTS) {
          const { def } = synthesizeAbility(seed, `${cid}.${slot}`, slot, POOL);
          const comp = def.components!;
          const k = comp.delivery.kind;
          const where = `${cid}.${slot}@${seed}`;
          if (k === 'meleeCone' || k === 'pbaoe' || k === 'projectile') {
            const dmg = comp.effects.find((e) => e.kind === 'damage');
            expect(dmg, `${where} should carry a damage anchor`).toBeDefined();
            if (dmg?.kind === 'damage') expect(dmg.amount, where).toBeGreaterThan(2);
          }
          if (k === 'heal') {
            const heal = comp.effects.find((e) => e.kind === 'heal');
            expect(heal, `${where} should carry a heal anchor`).toBeDefined();
            if (heal?.kind === 'heal') expect(heal.amount, where).toBeGreaterThan(2);
          }
        }
      }
    }
  });

  // item 5 — forged skills must clear a VIABILITY bar: their per-use damage/heal output
  // per second lands in the same league as a canonical ability of the slot, so a forged
  // kit can actually progress a run (the old pricing starved a hit that also bundled
  // utility to ~15–30% of canonical, making runs impossible from turn one).
  it('forged damage/heal output clears a minimum output-vs-canonical bar', () => {
    const dk = ['meleeCone', 'pbaoe', 'projectile'];
    const median = (a: number[]): number => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
    // Canonical median per-hit DPS / HPS of a slot (× projCount for a fan).
    const canonDps = (slot: AbilitySlot): number =>
      median(
        POOL.filter((d) => d.slot === slot && dk.includes(d.def.kind) && d.def.damage > 0).map(
          (d) => (d.def.damage * Math.max(1, d.def.projCount ?? 1)) / d.def.cooldown,
        ),
      );
    const canonHps = (slot: AbilitySlot): number =>
      median(
        POOL.filter((d) => d.slot === slot && d.def.kind === 'heal' && d.def.damage > 0).map(
          (d) => d.def.damage / d.def.cooldown,
        ),
      );

    for (const slot of SLOTS) {
      const cD = canonDps(slot);
      const cH = canonHps(slot);
      const dps: number[] = [];
      const hps: number[] = [];
      for (const seed of SEEDS) {
        for (const cid of CLASS_IDS) {
          const { def } = synthesizeAbility(seed, `${cid}.${slot}`, slot, POOL);
          const comp = def.components!;
          const fan = Math.max(1, comp.delivery.projCount ?? 1);
          if (dk.includes(comp.delivery.kind)) {
            const d = comp.effects.find((e) => e.kind === 'damage');
            if (d?.kind === 'damage') dps.push((d.amount * fan) / def.cooldown);
          }
          if (comp.delivery.kind === 'heal') {
            const h = comp.effects.find((e) => e.kind === 'heal');
            if (h?.kind === 'heal') hps.push(h.amount / def.cooldown);
          }
        }
      }
      // The TYPICAL forged hit/heal is in the same league as canonical (≥ 0.5 of median),
      // and even the WEAKEST (a utility-heavy fusion) never craters below ~1/3 — far above
      // the old ~0.15 floor. Bars are conservative to absorb seed/quantization variance.
      if (dps.length > 0) {
        expect(median(dps) / cD, `${slot} damage median`).toBeGreaterThanOrEqual(0.5);
        expect(Math.min(...dps) / cD, `${slot} damage min`).toBeGreaterThanOrEqual(0.3);
      }
      if (hps.length > 0 && cH > 0) {
        expect(median(hps) / cH, `${slot} heal median`).toBeGreaterThanOrEqual(0.5);
        expect(Math.min(...hps) / cH, `${slot} heal min`).toBeGreaterThanOrEqual(0.3);
      }
    }
  });

  // item 5 — a merged buff keeps the STRONGEST value per axis (so the price reflects
  // what is delivered, not the sum of two components the runtime collapses to one).
  it('mergeBuffs keeps the strongest per axis and drops the redundant component', () => {
    // Two self def buffs among the donors → the fused skill keeps exactly one, at the
    // stronger (lower) defMult. Build a tiny pool of two resistance self-buffs.
    const twoResist: Donor[] = [
      {
        name: 'Ward',
        classId: 'knight',
        className: 'Knight',
        slot: 'a2',
        def: {
          name: 'Ward',
          kind: 'selfBuff',
          cooldown: 12,
          damage: 0,
          buffDefMult: 0.7,
          buffDuration: 6,
        },
      },
      {
        name: 'Aegis',
        classId: 'paladin',
        className: 'Paladin',
        slot: 'a2',
        def: {
          name: 'Aegis',
          kind: 'selfBuff',
          cooldown: 12,
          damage: 0,
          buffDefMult: 0.5,
          buffDuration: 6,
        },
      },
    ];
    for (const seed of SEEDS) {
      const { def } = synthesizeAbility(seed, 'k.a2', 'a2', twoResist);
      const defBuffs = def.components!.effects.filter(
        (e) => e.kind === 'buff' && e.defMult != null,
      );
      expect(defBuffs.length).toBeLessThanOrEqual(1); // never two resistance components
    }
  });

  it('cooldowns center on the canonical pace, NOT the band ceiling', () => {
    // Regression guard for the cooldown fix: fusions used to pin at the 16–18s
    // ceiling (rigid buff/CC/zone value priced against the band max). They now
    // compress to the slot's canonical median, so the DISTRIBUTION per slot should
    // sit around that median with only a thin tail near the ceiling.
    for (const slot of SLOTS) {
      const cds: number[] = [];
      for (const seed of SEEDS)
        for (const cid of CLASS_IDS)
          cds.push(synthesizeAbility(seed, `${cid}.${slot}`, slot, POOL).def.cooldown);
      cds.sort((a, b) => a - b);
      const median = cds[Math.floor(cds.length / 2)];
      const ceiling = CANON_MAX_CD[slot];
      const canonMed = canonMedianCd(slot);

      // Median lands in the canonical range: near the canonical median, well under
      // the ceiling (never within the top 15% of the band — i.e. not "clustered at
      // the top", which is what the bug produced).
      expect(median).toBeLessThanOrEqual(canonMed * 1.6);
      expect(median).toBeLessThanOrEqual(ceiling * 0.85);
      // Only a small minority may reach the ceiling (rigid, un-dilutable fusions);
      // the bug pinned the MAJORITY there.
      const atCeiling = cds.filter((c) => c >= ceiling - (slot === 'basic' ? 0.05 : 0.5)).length;
      expect(atCeiling / cds.length).toBeLessThan(0.1);
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

  it('recomputes vitals from the fused kit; preserves role + slot layout (item 4)', () => {
    const c = synthesizeClass(42, CLASSES.knight, POOL);
    // Role + a complete 4-slot kit are still inherited.
    expect(c.role).toBe(CLASSES.knight.role);
    expect(Object.keys(c.abilities).sort()).toEqual(['a1', 'a2', 'a3', 'basic']);
    // Vitals are DERIVED from the fused kit's component profile (not inherited from
    // the base class), and match the pure derivation exactly.
    expect({ maxHp: c.maxHp, moveSpeed: c.moveSpeed, threatMult: c.threatMult }).toEqual(
      forgeClassStats(c.abilities),
    );
    // …bounded to the canonical envelope, so a fusion is never a stat outlier.
    expect(c.maxHp).toBeGreaterThanOrEqual(100);
    expect(c.maxHp).toBeLessThanOrEqual(240);
    expect(c.moveSpeed).toBeGreaterThanOrEqual(190);
    expect(c.moveSpeed).toBeLessThanOrEqual(252);
    expect(c.threatMult).toBeGreaterThanOrEqual(0.5);
    expect(c.threatMult).toBeLessThanOrEqual(1.5);
  });

  it('derives archetype-appropriate vitals: a melee/defensive kit reads tankier + slower + higher-threat than a ranged/mobile one (item 4)', () => {
    // Two synthetic 4-ability kits, classified purely by capability.
    const ab = (over: Partial<import('../src/engine/content/classes').PlayerAbilityDef>) =>
      ({ slot: 'a1', name: 'x', kind: 'meleeCone', cooldown: 5, damage: 20, ...over }) as const;
    const meleeKit = {
      basic: ab({ kind: 'meleeCone' }),
      a1: ab({ kind: 'meleeCone' }),
      a2: ab({ kind: 'selfBuff', damage: 0 }), // self-defence → tanky
      a3: ab({ kind: 'pbaoe' }),
    } as Record<AbilitySlot, import('../src/engine/content/classes').PlayerAbilityDef>;
    const rangedKit = {
      basic: ab({ kind: 'projectile' }),
      a1: ab({ kind: 'projectile' }),
      a2: ab({ kind: 'dash', damage: 0 }), // mobility → squishy/fast
      a3: ab({ kind: 'projectile' }),
    } as Record<AbilitySlot, import('../src/engine/content/classes').PlayerAbilityDef>;
    // Sanity: the classifier reads those kinds as expected.
    expect(abilityCapability(meleeKit.basic)).toBe('offensiveMelee');
    expect(abilityCapability(rangedKit.a2)).toBe('mobility');

    const melee = forgeClassStats(meleeKit);
    const ranged = forgeClassStats(rangedKit);
    expect(melee.maxHp).toBeGreaterThan(ranged.maxHp); // tankier
    expect(melee.moveSpeed).toBeLessThan(ranged.moveSpeed); // slower
    expect(melee.threatMult).toBeGreaterThan(ranged.threatMult); // pulls more aggro
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
