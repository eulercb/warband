/** Converted field rates, shared by combat, previews and synthesis valuation. */
export interface PoisonAllocation {
  share: number;
  onExit: boolean;
  damageMult?: number;
}
export function poisonAllocation(p?: PoisonAllocation) {
  const mult = p && !p.onExit ? (p.damageMult ?? 1) : 1;
  return {
    ground: (1 - (p?.share ?? 0)) * mult,
    poison: (p?.onExit ? 1 : (p?.share ?? 0)) * mult,
    mult,
  };
}
export function poisonAllocationDescription(p: PoisonAllocation, tickDamage = 0): string {
  if (p.onExit)
    return 'full ground damage plus 2s strongest-owner poison on effective exit (one field tick per second), up to 3 foes';
  const rates = poisonAllocation(p);
  const pct = (v: number) => Math.round(v * 100);
  const n = (v: number) => Math.round(v * 10) / 10;
  const actual =
    tickDamage > 0
      ? `; ${n(tickDamage * rates.ground)} damage/0.5s field + ${n(tickDamage * rates.poison * 2)} damage/s poison`
      : '';
  return `${pct(rates.ground)}% field + ${pct(rates.poison)}% following poison damage rate (${pct(rates.mult)}% combined)${actual}, 2s linger, up to 3 foes; strongest owner poison wins`;
}
