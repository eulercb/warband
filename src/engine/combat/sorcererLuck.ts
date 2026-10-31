/** Deterministic fortune uses positive direct-hit provenance and shared cast ownership. */
import type { Add, Boss, Player } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { applyBuff, type EventSink, type HitMods } from './combat';

export function armFortune(sink: EventSink, p: Player, ab: PlayerAbilityDef): void {
  if (!ab.fortune) return;
  applyBuff(p, {
    kind: 'fortune',
    mult: 1,
    remaining: ab.fortune.duration,
    source: `subclass:fortune:${p.classId}`,
    fortune: { ...ab.fortune },
  });
  sink.events.push({
    t: 'support',
    sourceId: p.id,
    targetId: p.id,
    from: { ...p.pos },
    pos: { ...p.pos },
    kind: 'empower',
  });
}

export function luckExposureMultiplier(p: Player, target: Boss | Add, mods?: HitMods): number {
  if (!mods?.direct || !mods.pilot || p.state !== 'alive' || p.hp <= 0) return 1;
  const mark = target.buffs.find(
    (b) =>
      b.kind === 'luckExposure' &&
      b.remaining > 0 &&
      b.source === `fortune:${p.classId}:${p.id}` &&
      b.openingCast !== mods.pilot?.cast,
  );
  if (!mark) return 1;
  target.buffs.splice(target.buffs.indexOf(mark), 1);
  return mark.mult;
}

export function onFortunateHit(
  sink: EventSink,
  p: Player,
  target: Boss | Add,
  effective: number,
  mods?: HitMods,
): void {
  if (!mods?.direct || effective <= 0 || p.state !== 'alive' || p.hp <= 0 || target.hp <= 0) return;
  const ready = p.buffs.find(
    (b) =>
      b.kind === 'fortune' &&
      b.remaining > 0 &&
      b.source === `subclass:fortune:${p.classId}` &&
      b.fortune,
  );
  if (!ready?.fortune) return;
  p.buffs.splice(p.buffs.indexOf(ready), 1);
  const luck = ready.fortune;
  const delay = target.buffs.find((b) => b.source === 'fortuneDelay' && b.remaining > 0);
  const weakness = target.buffs.find((b) => b.source === 'weakness:fortune' && b.remaining > 0);
  applyBuff(target, {
    kind: 'castSlow',
    mult: Math.max(luck.castSlowMult, delay?.mult ?? 1),
    remaining: Math.max(luck.debuffDuration, delay?.remaining ?? 0),
    source: 'fortuneDelay',
  });
  // One shared weakness family: multiple players cannot multiply this debuff down.
  applyBuff(target, {
    kind: 'damageDealt',
    mult: Math.min(luck.damageMult, weakness?.mult ?? 1),
    remaining: Math.max(luck.debuffDuration, weakness?.remaining ?? 0),
    source: 'weakness:fortune',
  });
  if (luck.markBonus && mods.pilot)
    applyBuff(target, {
      kind: 'luckExposure',
      mult: 1 + luck.markBonus,
      remaining: 5,
      source: `fortune:${p.classId}:${p.id}`,
      openingCast: mods.pilot.cast,
    });
  sink.events.push({
    t: 'support',
    sourceId: p.id,
    targetId: target.id,
    from: { ...p.pos },
    pos: { ...target.pos },
    kind: 'empower',
  });
}
