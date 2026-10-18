/** Bounded martial skill interactions. Ordinary buff timers carry all readiness. */
import { BLOOD_PRICE, BLOOD_LEECH, HUNT_STEP, FLOW_EXTENSION_CAP } from '../content/martialRules';
import type { Buff, Player } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
function put(p: Player, buff: Buff): void {
  // Counters are one readiness state, including a Battlemaster-prepared counter.
  const index = p.buffs.findIndex(
    (b) => b.source === buff.source || (buff.kind === 'counter' && b.kind === 'counter'),
  );
  if (index < 0) p.buffs.push(buff);
  else p.buffs[index] = buff;
}
function ready(p: Player, kind: Buff['kind']): Buff | undefined {
  return p.buffs.find((b) => b.kind === kind && b.remaining > 0);
}
export function armMartialUtility(p: Player, ab: PlayerAbilityDef): void {
  if (ab.guardWindow)
    put(p, { kind: 'guard', mult: 1.3, remaining: ab.guardWindow, source: 'martialGuard' });
  if (ab.momentumWindow || ab.wolfHunt || ab.bloodRage) {
    p.buffs = p.buffs.filter(
      (b) => !['momentum', 'momentumBeat', 'rageRhythm', 'wolfHunt', 'bloodRage'].includes(b.kind),
    );
    p.huntDistance = 0;
    const duration = Math.max(ab.momentumWindow ?? 0, ab.wolfHunt ?? 0);
    if (duration)
      put(p, { kind: 'rageRhythm', mult: 0, remaining: duration, source: 'rageRhythm' });
    if (ab.wolfHunt)
      put(p, { kind: 'wolfHunt', mult: 0, remaining: ab.wolfHunt, source: 'wolfHunt' });
    if (ab.bloodRage)
      put(p, {
        kind: 'bloodRage',
        mult: BLOOD_LEECH,
        remaining: ab.bloodRage,
        source: 'bloodRage',
      });
  }
}
export function prepareMartialFlow(p: Player, ab: PlayerAbilityDef): void {
  if (ab.prepareFlow)
    put(p, {
      kind: 'flow',
      mult: 0,
      remaining: ab.prepareFlow,
      source: 'martialFlow',
      flowExtended: 0,
    });
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
  let mult = 1;
  for (const kind of ['counter', 'auraStrike'] as const) {
    const buff = melee && ready(p, kind);
    if (buff) {
      p.buffs.splice(p.buffs.indexOf(buff), 1);
      mult *= buff.mult;
    }
  }
  return mult;
}
/** Parry is armed after the entire cone, never chained across its victims. */
export function onParryHit(p: Player, ab: PlayerAbilityDef, dealt: number): void {
  if (!ab.parryOnHit || dealt <= 0 || p.state !== 'alive' || p.hp <= 0) return;
  put(p, { kind: 'counter', mult: 1.3, remaining: 4, source: 'martialCounter' });
  put(p, { kind: 'damageTaken', mult: 0.6, remaining: ab.parryOnHit, source: 'parryDef' });
}
/** Voluntary blood cost bypasses wards, causes no hit procs, and cannot kill. */
export function tickBloodPrice(p: Player, dt: number): void {
  const blood = ready(p, 'bloodRage');
  if (!blood || p.state !== 'alive' || p.hp <= 0 || dt <= 0) return;
  p.hp = Math.min(p.hp, Math.max(1, p.hp - p.maxHp * BLOOD_PRICE * Math.min(dt, blood.remaining)));
}
export function bloodHitHealing(p: Player, effective: number, direct: boolean | undefined): number {
  return direct && effective > 0 && p.state === 'alive' && p.hp > 0
    ? effective * (ready(p, 'bloodRage')?.mult ?? 0)
    : 0;
}
function gainMomentum(p: Player): void {
  const rage = ready(p, 'rageRhythm');
  if (!rage || ready(p, 'momentumBeat')) return;
  const stacks = Math.min(3, (ready(p, 'momentum')?.mult ?? 0) + 1);
  put(p, { kind: 'momentum', mult: stacks, remaining: rage.remaining, source: 'martialMomentum' });
  put(p, { kind: 'momentumBeat', mult: 0, remaining: 0.4, source: 'momentumBeat' });
}
/** Only resolved, ordinary walking is credited; teleports and shoves are excluded by World. */
export function onHuntWalk(p: Player, distance: number): void {
  if (!ready(p, 'wolfHunt') || p.state !== 'alive' || distance <= 0) return;
  p.huntDistance = Math.min(HUNT_STEP, (p.huntDistance ?? 0) + distance);
  if (p.huntDistance >= HUNT_STEP && !ready(p, 'momentumBeat')) {
    p.huntDistance = 0;
    gainMomentum(p);
  }
}
/** One momentum beat per 0.4s; Flow extensions share a 1s lifetime budget. */
export function onMartialHit(
  p: Player,
  effective: number,
  melee: boolean | undefined,
  flowExtend?: number,
): void {
  if (effective <= 0 || p.state !== 'alive') return;
  const flow = flowExtend && ready(p, 'flow');
  if (flow) {
    const extension = Math.min(
      flowExtend,
      Math.max(0, FLOW_EXTENSION_CAP - (flow.flowExtended ?? 0)),
    );
    flow.remaining += extension;
    flow.flowExtended = (flow.flowExtended ?? 0) + extension;
  }
  if (melee && !ready(p, 'wolfHunt')) gainMomentum(p);
}
/** Commit finisher preparation after normal cast gates, carrying the resolved def. */
export function consumeMartialFinishers(p: Player, ab: PlayerAbilityDef): PlayerAbilityDef {
  let out = ab;
  const rampage = ab.slot === 'basic' && ready(p, 'rampage');
  if (rampage) {
    p.buffs.splice(p.buffs.indexOf(rampage), 1);
    out = {
      ...out,
      damage: out.damage * (1 + rampage.mult * 0.1),
      ...(out.kind === 'meleeCone' ? { range: (out.range ?? 70) + rampage.mult * 8 } : {}),
    };
  }
  const momentum = ab.spendsMomentum && ready(p, 'momentum');
  if (momentum && ready(p, 'rageRhythm')) {
    p.buffs.splice(p.buffs.indexOf(momentum), 1);
    out = {
      ...out,
      momentumUsed: momentum.mult,
      damage: out.damage * (1 + momentum.mult * 0.1),
      ...(out.kind === 'meleeCone'
        ? { range: (out.range ?? 70) + momentum.mult * 8 }
        : { radius: (out.radius ?? 130) + momentum.mult * 10 }),
    };
  }
  const flow = ab.consumesFlow && ready(p, 'flow');
  if (flow) {
    p.buffs.splice(p.buffs.indexOf(flow), 1);
    out = { ...out, castTime: 0, flowUsed: true };
    if (out.kind === 'projectile') out.freeze = Math.max(out.freeze ?? 0, 0.6);
    else if (out.kind === 'groundZone') {
      out.radius = (out.radius ?? 130) + 35;
      out.slowMult = Math.min(out.slowMult ?? 1, 0.6);
      out.slowDuration = Math.max(out.slowDuration ?? 0, 0.8);
      if (out.components)
        out.components = {
          ...out.components,
          effects: out.components.effects.map((e) =>
            e.kind === 'zone'
              ? {
                  ...e,
                  zone: {
                    ...e.zone,
                    radius: out.radius!,
                    slowMult: Math.min(e.zone.slowMult ?? 1, 0.6),
                    slowDuration: Math.max(e.zone.slowDuration ?? 0, 0.8),
                  },
                }
              : e,
          ),
        };
    } else if (out.kind === 'meleeCone') out.range = (out.range ?? 70) + 30;
    else out.radius = (out.radius ?? 130) + 35;
  }
  return out;
}
