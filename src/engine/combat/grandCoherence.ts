/** Owner-scoped, nonrecursive grand payoffs. Only positive direct-hit paths call these. */
import type { Add, Boss, Buff, Player } from '../core/types';
import type { World } from '../world/world';
import { personallyCursed } from '../core/curses';
import { applyBuff, damageAdd, damageBoss } from './combat';

type Mark = { bonus: number; cast: { spent: boolean } };
interface Target {
  hp: number;
  buffs: Buff[];
}
const exposureSource = (p: Player) => `grandOpening:${p.id}`;
const CADENCE = 'subclass:grand:warlock:wa_fiend_g_a';
const GATE = 'grand:wa_fiend_g_a';

/** A random forged kit may omit every source of the personal mark this identity needs. */
function needsForgedCurseSeed(source: Player): boolean {
  const base = Object.values(source.abilities ?? {});
  if (!base.some((ab) => ab.components)) return false;
  const bound = Object.values(source.subAbilities ?? {}).filter((ab) => ab != null);
  return ![...base, ...bound].some((ab) => {
    if (ab.infernalClaim && ab.forgeClaimFallback) return true;
    if (ab.components)
      return ab.components.effects.some(
        (e) =>
          (e.kind === 'zone' && (e.zone.curseBonus ?? 0) > 0) ||
          (e.kind === 'rebuke' && (e.curseBonus ?? 0) > 0),
      );
    return (
      (ab.kind === 'groundZone' && (ab.curseBonus ?? 0) > 0) ||
      (ab.kind === 'pbaoe' && (ab.rebukeDuration ?? 0) > 0 && (ab.rebukeCurseBonus ?? 0) > 0)
    );
  });
}

/** Called after immunity/zero-damage checks; a cast cannot consume its own mark. */
export function grandDirectMultiplier(
  source: Player,
  target: Target,
  mods?: { direct?: boolean; mark?: Mark },
): number {
  if (
    !mods?.direct ||
    source.state !== 'alive' ||
    source.hp <= 0 ||
    source.classId !== 'rogue' ||
    !source.charUpgradeIds?.includes('ro_assassin_strike_g')
  )
    return 1;
  const mark = target.buffs.find(
    (b) =>
      b.kind === 'grandOpening' &&
      b.remaining > 0 &&
      b.source === exposureSource(source) &&
      b.openingCast !== mods.mark?.cast,
  );
  if (!mark) return 1;
  target.buffs.splice(target.buffs.indexOf(mark), 1);
  return mark.mult;
}

/** Existing World direct-hit routing owns provenance; supplemental damage cannot enter this path. */
export function onGrandDirectHit(
  world: World,
  source: Player,
  target: Boss | Add,
  effective: number,
  prepared?: boolean,
  mark?: Mark,
): void {
  if (
    world.scene !== null ||
    source.state !== 'alive' ||
    source.hp <= 0 ||
    effective <= 0 ||
    target.hp <= 0
  )
    return;
  if (
    prepared &&
    mark &&
    !mark.cast.spent &&
    source.classId === 'rogue' &&
    source.charUpgradeIds?.includes('ro_assassin_strike_g')
  ) {
    mark.cast.spent = true;
    applyBuff(target, {
      kind: 'grandOpening',
      mult: 1 + Math.min(0.25, Math.max(0, mark.bonus)),
      remaining: 4,
      source: exposureSource(source),
      openingCast: mark.cast,
    });
  }
  if (
    source.classId !== 'warlock' ||
    !source.charUpgradeIds?.includes('wa_fiend_g_a') ||
    (source.subclassPassiveCooldowns?.[GATE] ?? 0) > 0
  )
    return;
  if (!personallyCursed(source.id, target)) {
    if (needsForgedCurseSeed(source))
      applyBuff(target, {
        kind: 'curse',
        mult: 1,
        remaining: 4,
        source: `curse:${source.id}:searing`,
      });
    return; // A seed is setup, never the first cadence count.
  }
  const progress = source.buffs.find(
    (b) => b.kind === 'grandCadence' && b.source === CADENCE && b.remaining > 0,
  );
  const hits = (progress?.mult ?? 0) + 1;
  if (hits < 3) {
    applyBuff(source, { kind: 'grandCadence', mult: hits, remaining: 8, source: CADENCE });
    return;
  }
  source.buffs = source.buffs.filter((b) => b.source !== CADENCE);
  source.subclassPassiveCooldowns ??= {};
  source.subclassPassiveCooldowns[GATE] = 4; // Spend before damage, including overkill.
  if (world.bosses.includes(target as Boss)) damageBoss(world, source, target as Boss, 25);
  else damageAdd(world, source, target as Add, 25);
  world.events.push({
    t: 'skillArea',
    sourceId: source.id,
    side: 'player',
    color: 0xf68042,
    area: {
      kind: 'circle',
      origin: { ...target.pos },
      radius: 24,
      range: 0,
      angle: 0,
      halfAngle: 0,
    },
  });
}
