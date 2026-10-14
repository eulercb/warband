/** Bounded martial skill interactions. Ordinary buff timers carry all readiness. */
import type { Buff, Player } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
function put(p: Player, buff: Buff): void {
  const index = p.buffs.findIndex((b) => b.source === buff.source);
  if (index < 0) p.buffs.push(buff);
  else p.buffs[index] = buff;
}
function ready(p: Player, kind: Buff['kind']): Buff | undefined {
  return p.buffs.find((b) => b.kind === kind && b.remaining > 0);
}
export function armMartialUtility(p: Player, ab: PlayerAbilityDef): void {
  if (ab.guardWindow)
    put(p, { kind: 'guard', mult: 1.3, remaining: ab.guardWindow, source: 'martialGuard' });
  if (ab.momentumWindow) {
    put(p, { kind: 'rageRhythm', mult: 0, remaining: ab.momentumWindow, source: 'rageRhythm' });
    // A new rage does not stockpile momentum from a previous window.
    p.buffs = p.buffs.filter((b) => b.kind !== 'momentum');
  }
}
export function prepareMartialFlow(p: Player, ab: PlayerAbilityDef): void {
  if (ab.prepareFlow)
    put(p, { kind: 'flow', mult: 0, remaining: ab.prepareFlow, source: 'martialFlow' });
}
/** First real, nonlethal guarded hit readies a counter; dodges/zero hits do not. */
export function onGuardedDamage(p: Player): void {
  const guard = ready(p, 'guard');
  if (!guard) return;
  p.buffs.splice(p.buffs.indexOf(guard), 1);
  put(p, { kind: 'counter', mult: guard.mult, remaining: 4, source: 'martialCounter' });
}
/** Only a connecting, positive melee hit consumes the one counterattack. */
export function martialHitMultiplier(p: Player, melee: boolean | undefined): number {
  const counter = melee && ready(p, 'counter');
  if (!counter) return 1;
  p.buffs.splice(p.buffs.indexOf(counter), 1);
  return counter.mult;
}
/** At most one momentum stack per 0.4s, even when a cone strikes many targets. */
export function onMartialHit(p: Player, effective: number, melee: boolean | undefined): void {
  const rage = melee && ready(p, 'rageRhythm');
  if (!rage || effective <= 0 || p.state !== 'alive' || ready(p, 'momentumBeat')) return;
  const stacks = Math.min(3, (ready(p, 'momentum')?.mult ?? 0) + 1);
  put(p, { kind: 'momentum', mult: stacks, remaining: rage.remaining, source: 'martialMomentum' });
  put(p, { kind: 'momentumBeat', mult: 0, remaining: 0.4, source: 'momentumBeat' });
}
/** Commit finisher preparation after normal cast gates, carrying the resolved def. */
export function consumeMartialFinishers(p: Player, ab: PlayerAbilityDef): PlayerAbilityDef {
  let out = ab;
  const momentum = ab.spendsMomentum && ready(p, 'momentum');
  if (momentum && ready(p, 'rageRhythm')) {
    p.buffs.splice(p.buffs.indexOf(momentum), 1);
    out = {
      ...out,
      damage: out.damage * (1 + momentum.mult * 0.1),
      ...(out.kind === 'meleeCone'
        ? { range: (out.range ?? 70) + momentum.mult * 8 }
        : { radius: (out.radius ?? 130) + momentum.mult * 10 }),
    };
  }
  const flow = ab.consumesFlow && ready(p, 'flow');
  if (flow) {
    p.buffs.splice(p.buffs.indexOf(flow), 1);
    out = {
      ...out,
      castTime: 0,
      ...(out.kind === 'meleeCone'
        ? { range: (out.range ?? 70) + 30 }
        : { radius: (out.radius ?? 130) + 35 }),
    };
  }
  return out;
}
