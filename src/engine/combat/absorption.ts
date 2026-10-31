/** One shared pool per hero: equivalent bubbles never multiply across casters. */
import type { BuffView, Player } from '../core/types';
export const ABSORPTION_CAP = 0.5;
export const OVERFLOW_CAP = 0.3;
export const OVERFLOW_SECONDS = 6;
/** Direct authored barriers track recipient health growth; already proportional rewards do not. */
export function healthScaledAbsorption(amount: number, maxHp: number, baseMaxHp: number): number {
  return amount * Math.max(1, maxHp / baseMaxHp);
}
export interface AbsorptionGrant {
  amount: number;
  /** Self protection gains a bounded bonus from distinct nearby personally cursed enemies. */
  curseSiphon?: { range: number; amount: number; maxTargets: number };
  /** Pre-tuning power credit; buffs must not automatically strengthen bosses. */
  balanceAmount?: number;
  duration: number;
  target: 'weakest' | 'nearby' | 'self';
}
export function absorptionAmount(buffs: readonly BuffView[]): number {
  return buffs.reduce(
    (n, b) => (b.kind === 'absorption' && b.remaining > 0 ? Math.max(n, b.mult) : n),
    0,
  );
}
/** Strongest direct cast wins; healing adds within its applicable ceiling. */
export function grantAbsorption(
  p: Player,
  amount: number,
  duration: number,
  overflow: boolean | 'heal' = false,
): number {
  if (p.state !== 'alive' || p.hp <= 0 || amount <= 0 || duration <= 0) return 0;
  const old = p.buffs.find((b) => b.kind === 'absorption' && b.remaining > 0);
  const before = Math.min(old?.mult ?? 0, p.maxHp * ABSORPTION_CAP);
  const ceiling = p.maxHp * (overflow === true ? OVERFLOW_CAP : ABSORPTION_CAP);
  const after = overflow
    ? Math.max(before, Math.min(ceiling, before + amount))
    : Math.max(before, Math.min(ceiling, amount));
  // Weaker direct casts cannot refresh; overflow cannot prolong a larger pool.
  if (after <= before) {
    // Additive healing renews only pools within its own ceiling.
    if (overflow && before <= ceiling && old) old.remaining = Math.max(old.remaining, duration);
    return 0;
  }
  p.buffs = p.buffs.filter((b) => b.kind !== 'absorption');
  p.buffs.push({
    kind: 'absorption',
    mult: after,
    remaining: overflow ? Math.max(old?.remaining ?? 0, duration) : duration,
    source: 'absorption',
  });
  return after - before;
}
/** Remove life-bound protection on downing/death and bound it after max-HP changes. */
export function maintainAbsorption(p: Player): void {
  if (p.state !== 'alive' || p.hp <= 0) p.buffs = p.buffs.filter((b) => b.kind !== 'absorption');
  else
    for (const b of p.buffs)
      if (b.kind === 'absorption') b.mult = Math.min(b.mult, p.maxHp * ABSORPTION_CAP);
}
/** Post-mitigation damage consumes absorption before HP; returns HP damage. */
export function absorbDamage(p: Player, damage: number): number {
  const pool = p.buffs.find((b) => b.kind === 'absorption' && b.remaining > 0);
  if (!pool || damage <= 0) return damage;
  pool.mult = Math.min(pool.mult, p.maxHp * ABSORPTION_CAP);
  const absorbed = Math.min(damage, pool.mult);
  pool.mult -= absorbed;
  if (pool.mult <= 0) p.buffs.splice(p.buffs.indexOf(pool), 1);
  return damage - absorbed;
}

export function absorptionDescription(g: AbsorptionGrant): string {
  const n = (v: number) => Math.round(v * 100) / 100;
  const siphon = g.curseSiphon;
  return `${n(g.amount)} absorption for ${n(g.duration)}s to ${g.target === 'self' ? 'yourself' : g.target === 'nearby' ? 'nearby allies' : 'lowest-health ally'}${siphon && g.target === 'self' ? `; siphon hits up to ${siphon.maxTargets} nearby personally cursed enemies for ${n(siphon.amount)} dmg within ${n(siphon.range)}u; +${n(siphon.amount)} protection per successful hit` : ''}`;
}

/** Maximum authored grant, used to price composition rather than treating siphons as free. */
export function absorptionMaximum(g: AbsorptionGrant): number {
  return (
    g.amount +
    (g.target === 'self' && g.curseSiphon ? g.curseSiphon.amount * g.curseSiphon.maxTargets : 0)
  );
}
export function scaleAbsorption(g: AbsorptionGrant, factor: number, reach = 1): AbsorptionGrant {
  return {
    ...g,
    amount: g.amount * factor,
    ...(g.balanceAmount != null ? { balanceAmount: g.balanceAmount * factor } : {}),
    ...(g.curseSiphon
      ? {
          curseSiphon: {
            ...g.curseSiphon,
            amount: g.curseSiphon.amount * factor,
            range: g.curseSiphon.range * reach,
          },
        }
      : {}),
  };
}
