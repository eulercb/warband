/**
 * Warband — bot AI. PURE TS, host-only.
 *
 * Bots are host-simulated party members that fill out the band. The host owns
 * the authoritative `World`, so a bot simply needs an `InputCommand` produced
 * each sim tick — exactly like a networked player, minus the network. This
 * module turns the current world state into that command per class.
 *
 * Buttons are HELD state and the World edge-detects presses against the bot's
 * own `Player.prevButtons`. To fire an ability we therefore emit a *rising
 * edge*: press only when we want the ability AND it wasn't pressed last tick.
 * Recomputed once per sim step, this naturally pulses (fire / release / fire)
 * so a "want" that persists across ticks re-triggers as each cooldown clears.
 */
import type { Player, InputCommand, ButtonState, Vec2 } from './types';
import type { World } from './world';
import { abilityById } from './monsters';
import {
  add as vadd,
  scale as vscale,
  normalize,
  fromAngle,
  angleOf,
  len,
} from './math';
// Toroidal geometry so bot AI navigates/aims the short way across the wrap seam.
import { sub, dist, pointInCircle, pointInCone, pointInSegment } from './torus';
import {
  BOT_RANGED_STANDOFF,
  BOT_MELEE_RANGE,
  BOT_REVIVE_RANGE,
} from './constants';

/** peerId prefix that marks a roster entry as a bot (never a real Trystero id). */
export const BOT_PEER_PREFIX = 'bot:';

export function isBotPeerId(peerId: string): boolean {
  return peerId.startsWith(BOT_PEER_PREFIX);
}

const NO_BUTTONS: ButtonState = {
  basic: false,
  a1: false,
  a2: false,
  a3: false,
  revive: false,
};

/**
 * Compute one bot's input for the current tick. `seq` is a monotonic counter
 * (the world tick works well) that the host stores verbatim; it is not used for
 * de-dup since bot inputs are set locally, never received over the wire.
 */
export function computeBotInput(world: World, bot: Player, seq: number): InputCommand {
  if (bot.state !== 'alive') {
    return { seq, move: { x: 0, y: 0 }, aim: { ...bot.aim }, buttons: { ...NO_BUTTONS } };
  }

  const boss = world.boss && world.boss.hp > 0 ? world.boss : null;
  const nearestAdd = pickNearestAdd(world, bot.pos);
  const focus = boss ? boss.pos : nearestAdd ? nearestAdd.pos : null;

  // --- Aim: at the boss, else nearest add, else keep current heading. ---
  const aim = focus ? safeDir(sub(focus, bot.pos), bot.aim) : { ...bot.aim };

  // --- Reviving a downed ally takes priority over everything else. ---
  const downed = pickReviveTarget(world, bot);
  if (downed) {
    const toAlly = sub(downed.pos, bot.pos);
    const d = len(toAlly);
    const inReviveRange = d <= 55 + bot.radius + downed.radius; // ~REVIVE_RANGE
    const move = inReviveRange ? { x: 0, y: 0 } : clampMove(toAlly);
    const want: ButtonState = { ...NO_BUTTONS, revive: true };
    return { seq, move, aim, buttons: edge(want, bot.prevButtons) };
  }

  const danger = dangerAvoidance(world, bot);
  const inDanger = danger !== null;

  // --- Movement: flee danger, else position for the class role. ---
  let move: Vec2;
  if (inDanger) {
    move = clampMove(danger);
  } else {
    move = clampMove(positioning(bot, boss ? boss.pos : focus));
  }

  // --- Ability desires per class (gated later by cooldown-aware edge). ---
  const want = decideAbilities(world, bot, boss ? boss.pos : null, focus, inDanger);

  return { seq, move, aim, buttons: edge(want, bot.prevButtons) };
}

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

/** Desired movement vector for the bot's role (not yet normalized). */
function positioning(bot: Player, focus: Vec2 | null): Vec2 {
  if (!focus) return { x: 0, y: 0 };
  const toFocus = sub(focus, bot.pos);
  const d = len(toFocus);
  const dir = safeDir(toFocus, { x: 0, y: -1 });

  if (bot.classId === 'knight') {
    // Melee: close to the boss and stay in its face.
    if (d > BOT_MELEE_RANGE) return dir;
    return { x: 0, y: 0 };
  }

  // Ranged/support: hold a standoff band around the boss.
  const standoff = bot.classId === 'cleric' ? BOT_RANGED_STANDOFF - 40 : BOT_RANGED_STANDOFF;
  if (d < standoff - 40) return vscale(dir, -1); // too close — back off
  if (d > standoff + 40) return dir; // too far — close in
  // In the band: strafe a little so the bot isn't a static target.
  return vscale({ x: -dir.y, y: dir.x }, 0.4);
}

// ---------------------------------------------------------------------------
// Danger avoidance (terrain, boss ground zones, boss telegraphs)
// ---------------------------------------------------------------------------

/**
 * If the bot is inside (or right at the edge of) something that will hurt it,
 * return a strong flee direction; otherwise null. Covers damaging terrain,
 * boss-side ground zones (void zones), and the current boss wind-up area.
 */
function dangerAvoidance(world: World, bot: Player): Vec2 | null {
  let flee: Vec2 = { x: 0, y: 0 };
  let found = false;

  for (const t of world.terrain) {
    if (t.damagePerTick <= 0) continue;
    const margin = t.radius + bot.radius + 24;
    const away = sub(bot.pos, t.pos);
    if (len(away) <= margin) {
      flee = vadd(flee, withMag(away, margin - len(away) + 1));
      found = true;
    }
  }

  for (const z of world.groundZones) {
    if (z.side !== 'boss' || z.damagePerTick <= 0) continue;
    const margin = z.radius + bot.radius + 24;
    const away = sub(bot.pos, z.pos);
    if (len(away) <= margin) {
      flee = vadd(flee, withMag(away, margin - len(away) + 1));
      found = true;
    }
  }

  const tele = telegraphFlee(world, bot);
  if (tele) {
    flee = vadd(flee, tele);
    found = true;
  }

  return found ? safeDir(flee, { x: 0, y: 1 }) : null;
}

/** Flee vector out of the boss's current wind-up danger area, or null. */
function telegraphFlee(world: World, bot: Player): Vec2 | null {
  const boss = world.boss;
  if (!boss || boss.hp <= 0) return null;
  const a = boss.action;
  if (a.kind !== 'windup' || !a.abilityId) return null;
  const ab = abilityById(world.monsterDef, a.abilityId);
  if (!ab) return null;
  const r = bot.radius;

  switch (ab.shape) {
    case 'pbaoe':
      if (pointInCircle(bot.pos, boss.pos, ab.radius ?? 160, r)) {
        return withMag(sub(bot.pos, boss.pos), 1); // straight out
      }
      return null;
    case 'circleAtTarget': {
      const c = a.targetPos ?? boss.pos;
      if (pointInCircle(bot.pos, c, ab.radius ?? 110, r)) return withMag(sub(bot.pos, c), 1);
      return null;
    }
    case 'cone':
      if (pointInCone(bot.pos, boss.pos, a.aimAngle, ab.range ?? 300, ((ab.halfAngleDeg ?? 30) * Math.PI) / 180, r)) {
        // Step sideways out of the cone.
        return fromAngle(a.aimAngle + Math.PI / 2);
      }
      return null;
    case 'line': {
      const to = a.targetPos ?? vadd(boss.pos, fromAngle(a.aimAngle, ab.range ?? 600));
      if (pointInSegment(bot.pos, boss.pos, to, (ab.width ?? 45) + r, r)) {
        return fromAngle(a.aimAngle + Math.PI / 2);
      }
      return null;
    }
    case 'beam':
      if (pointInCircle(bot.pos, boss.pos, ab.range ?? 500, r) && a.targetId === bot.id) {
        return fromAngle(angleOf(sub(bot.pos, boss.pos)) + Math.PI / 2);
      }
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Ability decisions
// ---------------------------------------------------------------------------

function decideAbilities(
  world: World,
  bot: Player,
  bossPos: Vec2 | null,
  focus: Vec2 | null,
  inDanger: boolean,
): ButtonState {
  const want: ButtonState = { ...NO_BUTTONS };
  const cd = bot.cooldowns;
  const distBoss = bossPos ? dist(bot.pos, bossPos) : Infinity;
  const hpFrac = bot.hp / bot.maxHp;
  const hasTarget = focus !== null;

  switch (bot.classId) {
    case 'knight': {
      if (hasTarget && cd.basic <= 0) want.basic = true; // Cleave
      if (bossPos && cd.a1 <= 0) want.a1 = true; // Taunt on cooldown
      if (cd.a2 <= 0 && (hpFrac < 0.5 || inDanger)) want.a2 = true; // Shield Wall
      if (bossPos && cd.a3 <= 0 && distBoss <= BOT_MELEE_RANGE + 40) want.a3 = true; // Shield Bash
      break;
    }
    case 'ranger': {
      if (hasTarget && cd.basic <= 0) want.basic = true; // Arrow
      if (hasTarget && cd.a1 <= 0) want.a1 = true; // Multishot
      if (bossPos && cd.a2 <= 0) want.a2 = true; // Rain of Arrows toward boss
      if (inDanger && cd.a3 <= 0) want.a3 = true; // Roll (i-frames) out of danger
      break;
    }
    case 'mage': {
      if (hasTarget && cd.basic <= 0) want.basic = true; // Arcane Bolt
      // Fireball roots mid-cast — only when it's safe to stand still.
      if (bossPos && cd.a1 <= 0 && !inDanger && distBoss > 180) want.a1 = true;
      if (bossPos && cd.a2 <= 0 && distBoss <= 170) want.a2 = true; // Frost Nova
      if (inDanger && cd.a3 <= 0) want.a3 = true; // Blink out of danger
      break;
    }
    case 'cleric': {
      const wounded = mostWounded(world);
      const needHeal = wounded ? wounded.hp / wounded.maxHp < 0.65 : false;
      if (needHeal && cd.a1 <= 0) want.a1 = true; // Heal
      else if (cd.a2 <= 0 && woundedCount(world) >= 2) want.a2 = true; // Sanctuary
      else if (cd.a3 <= 0) want.a3 = true; // Blessing on cooldown
      else if (hasTarget && cd.basic <= 0) want.basic = true; // Smite when idle
      break;
    }
  }
  return want;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Emit a rising edge: press only what's wanted AND wasn't pressed last tick. */
function edge(want: ButtonState, prev: ButtonState): ButtonState {
  return {
    basic: want.basic && !prev.basic,
    a1: want.a1 && !prev.a1,
    a2: want.a2 && !prev.a2,
    a3: want.a3 && !prev.a3,
    revive: want.revive, // held, not edge-triggered (revive is a channel)
  };
}

function pickNearestAdd(world: World, from: Vec2): { pos: Vec2 } | null {
  let best: { pos: Vec2 } | null = null;
  let bestD = Infinity;
  for (const a of world.adds) {
    if (a.hp <= 0) continue;
    const d = dist(from, a.pos);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** Nearest downed ally within reviving reach (not the bot itself). */
function pickReviveTarget(world: World, bot: Player): Player | null {
  let best: Player | null = null;
  let bestD = BOT_REVIVE_RANGE;
  for (const p of world.players) {
    if (p.id === bot.id || p.state !== 'downed') continue;
    const d = dist(bot.pos, p.pos);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function mostWounded(world: World): Player | null {
  let best: Player | null = null;
  let bestRatio = 1;
  for (const p of world.players) {
    if (p.state !== 'alive') continue;
    const ratio = p.hp / p.maxHp;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = p;
    }
  }
  return best;
}

function woundedCount(world: World): number {
  let n = 0;
  for (const p of world.players) {
    if (p.state === 'alive' && p.hp / p.maxHp < 0.7) n++;
  }
  return n;
}

/** Normalize `v`, clamping magnitude to 1; fall back to `fallback` if degenerate. */
function clampMove(v: Vec2): Vec2 {
  const l = len(v);
  if (l < 1e-6) return { x: 0, y: 0 };
  if (l <= 1) return { x: v.x, y: v.y };
  return { x: v.x / l, y: v.y / l };
}

/** Unit direction of `v`, or `fallback` (already a unit vector) if degenerate. */
function safeDir(v: Vec2, fallback: Vec2): Vec2 {
  const n = normalize(v);
  if (n.x === 0 && n.y === 0) return { ...fallback };
  return n;
}

/** `v` rescaled to magnitude `m` (0 vector stays 0). */
function withMag(v: Vec2, m: number): Vec2 {
  const l = len(v);
  if (l < 1e-6) return { x: 0, y: 0 };
  return vscale(v, m / l);
}
