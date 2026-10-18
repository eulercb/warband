/** Moon's temporary combat shape. Spell tables, health pools and input bindings never change. */
import type { Player, Buff, Vec2 } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import type { World } from '../world/world';
import { dist, pointInCone } from '../core/torus';
import { damageBoss, damageAdd, healPlayer, type EventSink } from './combat';
export const MOON_ASPECT = 'moon_aspect';
export const MOON_CLAW_DAMAGE = 14;
export const MOON_CLAW_RANGE = 95;
const PREFIX = 'subclass:moon:';
export function inMoonForm(p: Player): boolean {
  return (
    p.subclassPassiveId === MOON_ASPECT &&
    p.state === 'alive' &&
    p.hp > 0 &&
    p.buffs.some((b) => b.kind === 'moonForm' && b.remaining > 0)
  );
}
function ready(p: Player, key: string): boolean {
  return (p.subclassPassiveCooldowns?.[key] ?? 0) <= 0;
}
function spend(p: Player, key: string, seconds: number): void {
  p.subclassPassiveCooldowns ??= {};
  p.subclassPassiveCooldowns[key] = seconds;
}
function mend(sink: EventSink, p: Player, effective: number): void {
  if (!inMoonForm(p) || effective <= 0 || p.hp >= p.maxHp || !ready(p, 'moon_mend')) return;
  healPlayer(sink, p, p, 4);
  spend(p, 'moon_mend', 1);
  sink.events.push({
    t: 'support',
    sourceId: p.id,
    targetId: p.id,
    from: { ...p.pos },
    pos: { ...p.pos },
    kind: 'heal',
  });
}
/** Ordinary positive direct hits can mend nearby, including Maul and Pounce. Never zone healing. */
export function onMoonDirectHit(
  sink: EventSink,
  p: Player,
  target: { pos: Vec2; radius: number },
  effective: number,
  direct?: boolean,
): void {
  if (direct && dist(p.pos, target.pos) <= 130 + target.radius) mend(sink, p, effective);
}
/** Called once per resolved cast on native/composed paths, before that cast's effects. */
export function onMoonAbility(world: World, p: Player, ab: PlayerAbilityDef): void {
  if (
    world.scene !== null ||
    p.subclassPassiveId !== MOON_ASPECT ||
    p.state !== 'alive' ||
    p.hp <= 0
  )
    return;
  if (
    (ab.kind === 'dash' || ab.kind === 'blink') &&
    p.buffs.some((b) => b.kind === 'root' && b.remaining > 0)
  )
    return;
  if (ab.slot !== 'basic') {
    if (!ready(p, MOON_ASPECT)) return;
    p.buffs = p.buffs.filter((b) => !b.source.startsWith(PREFIX));
    const buffs: Buff[] = [
      { kind: 'moonForm', mult: 1, remaining: 6, source: PREFIX + 'shape' },
      { kind: 'moveSpeed', mult: 1.2, remaining: 6, source: PREFIX + 'stride' },
    ];
    p.buffs.push(...buffs);
    spend(p, MOON_ASPECT, 12);
    world.events.push({
      t: 'support',
      sourceId: p.id,
      targetId: p.id,
      from: { ...p.pos },
      pos: { ...p.pos },
      kind: 'empower',
    });
    return;
  }
  if (!inMoonForm(p)) return;
  const angle = Math.atan2(p.aim.y, p.aim.x),
    half = (Math.PI * 55) / 180;
  world.events.push({
    t: 'skillArea',
    sourceId: p.id,
    side: 'player',
    color: 0xd8c7ff,
    area: {
      kind: 'cone',
      origin: { ...p.pos },
      angle,
      range: MOON_CLAW_RANGE,
      radius: 0,
      halfAngle: half,
    },
  });
  let dealt = 0;
  for (const boss of world.bosses) {
    if (boss.hp <= 0 || !pointInCone(boss.pos, p.pos, angle, MOON_CLAW_RANGE, half, boss.radius))
      continue;
    const before = boss.hp;
    damageBoss(world, p, boss, MOON_CLAW_DAMAGE);
    dealt += Math.max(0, before - Math.max(0, boss.hp));
  }
  for (const add of world.adds) {
    if (add.hp <= 0 || !pointInCone(add.pos, p.pos, angle, MOON_CLAW_RANGE, half, add.radius))
      continue;
    const before = add.hp;
    damageAdd(world, p, add, MOON_CLAW_DAMAGE);
    dealt += Math.max(0, before - Math.max(0, add.hp));
  }
  // One mend attempt for the entire swipe. Supplemental claws do not crit or trigger direct-hit riders.
  mend(world, p, dealt);
}
export function maintainMoonForms(world: World): void {
  for (const p of world.players) {
    const eligible =
      world.scene === null &&
      p.subclassPassiveId === MOON_ASPECT &&
      p.state === 'alive' &&
      p.hp > 0;
    if (!eligible) p.buffs = p.buffs.filter((b) => !b.source.startsWith(PREFIX));
    else if (!inMoonForm(p)) {
      p.buffs = p.buffs.filter((b) => !b.source.startsWith(PREFIX));
      const left = p.subclassPassiveCooldowns?.[MOON_ASPECT] ?? 0;
      if (left > 0)
        p.buffs.push({ kind: 'moonRest', mult: 0, remaining: left, source: PREFIX + 'rest' });
    }
  }
}
