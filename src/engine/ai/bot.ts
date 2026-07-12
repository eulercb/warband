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
import type { Player, Boss, InputCommand, ButtonState, Vec2, ClassId } from '../core/types';
import type { World } from '../world/world';
import { abilityById } from '../content/monsters';
import {
  UPGRADE_IDS,
  UPGRADES,
  upgradeAtMax,
  type UpgradeId,
  type UpgradeRole,
} from '../content/upgrades';
import { CHAR_UPGRADES_BY_CLASS, charUpgradeAtMax } from '../content/charUpgrades';
import {
  Rng,
  add as vadd,
  scale as vscale,
  normalize,
  fromAngle,
  angleOf,
  len,
} from '../core/math';
// Toroidal geometry so bot AI navigates/aims the short way across the wrap seam.
import { sub, dist, pointInCircle, pointInCone, pointInSegment } from '../core/torus';
import { BOT_RANGED_STANDOFF, BOT_MELEE_RANGE, BOT_REVIVE_RANGE } from '../core/constants';

/** peerId prefix that marks a roster entry as a bot (never a real Trystero id). */
export const BOT_PEER_PREFIX = 'bot:';

export function isBotPeerId(peerId: string): boolean {
  return peerId.startsWith(BOT_PEER_PREFIX);
}

// ---------------------------------------------------------------------------
// Personalities
// ---------------------------------------------------------------------------

/**
 * A bot's rolled temperament. Multiple bots in one band behave visibly
 * differently: a Genius reads telegraphs the instant they start, a Sleepy one
 * eats the first half of every wind-up; a Reckless bruiser hugs the boss while
 * a Timid archer hangs way back; a Twitchy bot never stops wandering.
 */
export interface BotPersonality {
  /** Human-readable temperament tag shown in the bot's name ("Genius", …). */
  label: string;
  /** 0..1 — how early the bot reads danger and how disciplined its casts are. */
  smart: number;
  /** 0..1 — appetite for closing in (melee hug / ranged crowding). */
  aggression: number;
  /** 0..1 — positioning jitter: how much aimless wander it mixes in. */
  chaos: number;
  /** Private dice + wander state (host-only; bots never cross the wire). */
  rng: Rng;
  wander: Vec2;
  nextWanderTick: number;
}

/** Steady veteran used when no personality is supplied (also keeps tests stable). */
export function defaultPersonality(): BotPersonality {
  return {
    label: 'Steady',
    smart: 0.8,
    aggression: 0.5,
    chaos: 0,
    rng: new Rng(1),
    wander: { x: 0, y: 0 },
    nextWanderTick: Number.MAX_SAFE_INTEGER,
  };
}

/** Named temperament archetypes a rolled bot can land on. */
const ARCHETYPES: Array<{
  label: string;
  smart: [number, number];
  aggr: [number, number];
  chaos: [number, number];
}> = [
  { label: 'Genius', smart: [0.9, 1.0], aggr: [0.4, 0.7], chaos: [0.0, 0.15] },
  { label: 'Steady', smart: [0.7, 0.85], aggr: [0.4, 0.6], chaos: [0.05, 0.2] },
  { label: 'Reckless', smart: [0.35, 0.6], aggr: [0.85, 1.0], chaos: [0.2, 0.45] },
  { label: 'Timid', smart: [0.55, 0.8], aggr: [0.05, 0.25], chaos: [0.1, 0.3] },
  { label: 'Twitchy', smart: [0.5, 0.75], aggr: [0.4, 0.7], chaos: [0.6, 1.0] },
  // Sleepy is slow, not suicidal: the floor still dodges the tail end of most
  // long wind-ups, so a Sleepy bot is a liability without being a corpse.
  { label: 'Sleepy', smart: [0.22, 0.42], aggr: [0.3, 0.6], chaos: [0.0, 0.2] },
];

/** Roll a seeded temperament for a fresh bot (deterministic per seed). */
export function rollPersonality(seed: number): BotPersonality {
  const rng = new Rng((seed ^ 0xbf58476d) >>> 0 || 1);
  const arch = ARCHETYPES[rng.int(0, ARCHETYPES.length - 1)];
  return {
    label: arch.label,
    smart: rng.range(arch.smart[0], arch.smart[1]),
    aggression: rng.range(arch.aggr[0], arch.aggr[1]),
    chaos: rng.range(arch.chaos[0], arch.chaos[1]),
    rng,
    wander: { x: 0, y: 0 },
    nextWanderTick: 0,
  };
}

// ---------------------------------------------------------------------------
// Bot progression — auto-picked between-boss upgrades (item 6)
// ---------------------------------------------------------------------------

/** One bot's between-boss picks: a generic boon + a class upgrade (either may be
 * null once every option is maxed). */
export interface BotUpgradePick {
  generic: UpgradeId | null;
  char: string | null;
}

/** How strongly a bot of the given temperament favours a boon of `role`. */
export function botRoleWeight(role: UpgradeRole, p: BotPersonality): number {
  const base = 1 + p.chaos * 0.6; // chaos flattens toward a random pick
  switch (role) {
    case 'offense':
      return base + p.aggression * 1.6;
    case 'defense':
      return base + (1 - p.aggression) * 1.6;
    case 'sustain':
      return base + (1 - p.aggression) * 1.0 + (1 - p.smart) * 0.6;
    case 'tempo':
      return base + p.smart * 1.4;
    case 'mobility':
      return base + p.chaos * 0.8 + p.aggression * 0.4;
  }
}

/** Weighted random pick from `pool` (null if empty). Pure aside from `rng`. */
function weightedPick<T>(pool: T[], weight: (x: T) => number, rng: Rng): T | null {
  if (pool.length === 0) return null;
  const weights = pool.map((x) => Math.max(0.0001, weight(x)));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rng.range(0, total);
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * Choose a bot's between-boss upgrades. The generic boon is biased by the bot's
 * temperament (a Reckless bot hoards damage, a Timid one stacks health/mitigation,
 * a Genius favours tempo…); the class pick simply advances its kit. Both respect
 * the per-skill stacking caps. Pure aside from the injected `rng`, so a bot band's
 * power growth is reproducible from a seed.
 */
export function pickBotUpgrades(
  classId: ClassId,
  personality: BotPersonality,
  ownedGeneric: readonly string[],
  ownedChar: readonly string[],
  rng: Rng,
): BotUpgradePick {
  const genPool = UPGRADE_IDS.filter((id) => !upgradeAtMax(id, ownedGeneric));
  const generic = weightedPick(genPool, (id) => botRoleWeight(UPGRADES[id].role, personality), rng);
  const charPool = (CHAR_UPGRADES_BY_CLASS[classId] ?? [])
    .map((d) => d.id)
    .filter((id) => !charUpgradeAtMax(id, ownedChar));
  const char =
    charPool.length > 0
      ? charPool[Math.floor(rng.next() * charPool.length) % charPool.length]
      : null;
  return { generic, char };
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
 * `personality` shapes reactions, positioning and discipline; omitted = a
 * steady veteran (keeps existing tests and callers stable).
 */
export function computeBotInput(
  world: World,
  bot: Player,
  seq: number,
  personality: BotPersonality = defaultPersonality(),
): InputCommand {
  if (bot.state !== 'alive') {
    return { seq, move: { x: 0, y: 0 }, aim: { ...bot.aim }, buttons: { ...NO_BUTTONS } };
  }

  const boss = pickNearestBoss(world, bot.pos);
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

  const danger = dangerAvoidance(world, bot, personality);
  const inDanger = danger !== null;

  // --- Movement: flee danger, else position for the class role. ---
  let move: Vec2;
  if (inDanger) {
    move = clampMove(danger);
  } else {
    let desired = positioning(bot, boss ? boss.pos : focus, personality);
    desired = vadd(desired, wanderDrift(personality, seq));
    move = clampMove(avoidObstacles(world, bot, desired));
  }

  // --- Ability desires per class (gated later by cooldown-aware edge). ---
  const want = decideAbilities(world, bot, boss ? boss.pos : null, focus, inDanger, personality);

  return { seq, move, aim, buttons: edge(want, bot.prevButtons) };
}

/** Nearest alive boss (twin fights: each bot picks its own closest threat). */
function pickNearestBoss(world: World, from: Vec2): Boss | null {
  let best: Boss | null = null;
  let bestD = Infinity;
  for (const b of world.bosses) {
    if (b.hp <= 0) continue;
    const d = dist(from, b.pos);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/**
 * A chaotic bot mixes in an aimless drift, re-rolled every ~1.5s. Magnitude
 * scales with the temperament's `chaos`, so a Twitchy bot never sits still
 * while a Genius holds textbook position.
 */
function wanderDrift(p: BotPersonality, tick: number): Vec2 {
  if (p.chaos <= 0) return { x: 0, y: 0 };
  if (tick >= p.nextWanderTick) {
    p.nextWanderTick = tick + 20 + p.rng.int(0, 20); // 1-2s at 20Hz
    p.wander =
      p.rng.next() < 0.25
        ? { x: 0, y: 0 } // sometimes just stand there menacingly
        : fromAngle(p.rng.range(0, Math.PI * 2), p.chaos * 0.7);
  }
  return p.wander;
}

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

/** Melee-role classes close the distance; the rest hold a ranged standoff. */
const MELEE_CLASSES = new Set(['knight', 'barbarian', 'rogue', 'paladin']);

/** Desired movement vector for the bot's role (not yet normalized). */
function positioning(bot: Player, focus: Vec2 | null, p: BotPersonality): Vec2 {
  if (!focus) return { x: 0, y: 0 };
  const toFocus = sub(focus, bot.pos);
  const d = len(toFocus);
  const dir = safeDir(toFocus, { x: 0, y: -1 });

  if (MELEE_CLASSES.has(bot.classId)) {
    // Melee: close to the boss and stay in its face. A reckless bruiser wants
    // to touch the boss; a timid one hovers at the edge of its swing.
    const hug = BOT_MELEE_RANGE + (0.5 - p.aggression) * 70;
    if (d > hug) return dir;
    return { x: 0, y: 0 };
  }

  // Ranged/support: hold a standoff band around the boss. Aggressive archers
  // crowd in for the thrill; timid ones snipe from the horizon.
  let standoff = bot.classId === 'cleric' ? BOT_RANGED_STANDOFF - 40 : BOT_RANGED_STANDOFF;
  standoff += (0.5 - p.aggression) * 160;
  if (d < standoff - 40) return vscale(dir, -1); // too close — back off
  if (d > standoff + 40) return dir; // too far — close in
  // In the band: strafe a little so the bot isn't a static target.
  return vscale({ x: -dir.y, y: dir.x }, 0.4);
}

/**
 * Nudge a desired move so the bot slides around solid cover instead of grinding
 * into it (obstacles now block movement — see world.separateAndClamp). Adds a
 * perpendicular component when heading into a nearby obstacle.
 */
function avoidObstacles(world: World, bot: Player, move: Vec2): Vec2 {
  if (world.obstacles.length === 0) return move;
  let out = move;
  for (const o of world.obstacles) {
    const toObs = sub(o.pos, bot.pos);
    const d = len(toObs);
    const clearance = o.radius + bot.radius + 40;
    if (d > clearance || d < 1e-3) continue;
    const dir = safeDir(toObs, { x: 1, y: 0 });
    // Only steer if we're actually heading toward it.
    if (dir.x * out.x + dir.y * out.y <= 0) continue;
    const perp = { x: -dir.y, y: dir.x };
    // Push away + sideways so we round the obstacle.
    out = vadd(out, vadd(vscale(dir, -0.8), vscale(perp, 0.8)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Danger avoidance (terrain, boss ground zones, boss telegraphs)
// ---------------------------------------------------------------------------

/**
 * If the bot is inside (or right at the edge of) something that will hurt it,
 * return a strong flee direction; otherwise null. Covers damaging terrain,
 * boss-side ground zones (void zones), and the current boss wind-up area.
 */
function dangerAvoidance(world: World, bot: Player, p: BotPersonality): Vec2 | null {
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

  for (const boss of world.bosses) {
    if (boss.hp <= 0) continue;
    const tele = telegraphFlee(world, boss, bot, p);
    if (tele) {
      flee = vadd(flee, tele);
      found = true;
    }
  }

  return found ? safeDir(flee, { x: 0, y: 1 }) : null;
}

/**
 * Flee vector out of one boss's current wind-up danger area, or null. Reaction
 * time is temperament-driven: a smart bot starts dodging the instant the
 * telegraph appears, a sleepy one only notices once most of the wind-up has
 * elapsed — often too late. That asymmetry is what makes a mixed bot band feel
 * like different people.
 */
function telegraphFlee(world: World, boss: Boss, bot: Player, p: BotPersonality): Vec2 | null {
  const a = boss.action;
  if (a.kind !== 'windup' || !a.abilityId) return null;
  const ab = abilityById(world.defOf(boss), a.abilityId);
  if (!ab) return null;
  // How far into the wind-up the bot "notices" the danger.
  const elapsedFrac = a.total > 1e-6 ? 1 - a.remaining / a.total : 1;
  const reactionLag = (1 - p.smart) * 0.75;
  if (elapsedFrac < reactionLag) return null;
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
      if (
        pointInCone(
          bot.pos,
          boss.pos,
          a.aimAngle,
          ab.range ?? 300,
          ((ab.halfAngleDeg ?? 30) * Math.PI) / 180,
          r,
        )
      ) {
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
  p: BotPersonality,
): ButtonState {
  const want: ButtonState = { ...NO_BUTTONS };
  const cd = bot.cooldowns;
  const distBoss = bossPos ? dist(bot.pos, bossPos) : Infinity;
  const hpFrac = bot.hp / bot.maxHp;
  const hasTarget = focus !== null;
  // Smart bots pop defensives early (hp < ~0.55); sleepy ones panic late (~0.3).
  const panicAt = 0.28 + p.smart * 0.27;
  // Aggressive bots swing big cooldowns at the edge of (or past) sensible range.
  const reach = (base: number): number => base * (0.85 + p.aggression * 0.4);

  switch (bot.classId) {
    case 'knight': {
      if (hasTarget && cd.basic <= 0) want.basic = true; // Cleave
      if (bossPos && cd.a1 <= 0) want.a1 = true; // Taunt on cooldown
      if (cd.a2 <= 0 && (hpFrac < panicAt || inDanger)) want.a2 = true; // Shield Wall
      if (bossPos && cd.a3 <= 0 && distBoss <= reach(BOT_MELEE_RANGE + 40)) want.a3 = true; // Shield Bash
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
      // Fireball roots mid-cast — smart mages only cast when it's safe to
      // stand still; reckless/sleepy ones greed the cast anyway.
      const greedy = p.smart < 0.45;
      if (bossPos && cd.a1 <= 0 && (greedy || !inDanger) && distBoss > 180) want.a1 = true;
      if (bossPos && cd.a2 <= 0 && distBoss <= reach(170)) want.a2 = true; // Frost Nova
      if (inDanger && cd.a3 <= 0) want.a3 = true; // Blink out of danger
      break;
    }
    case 'cleric': {
      const wounded = mostWounded(world);
      const needHeal = wounded ? wounded.hp / wounded.maxHp < 0.4 + p.smart * 0.3 : false;
      if (needHeal && cd.a1 <= 0)
        want.a1 = true; // Heal
      else if (cd.a2 <= 0 && woundedCount(world) >= 2)
        want.a2 = true; // Sanctuary
      else if (cd.a3 <= 0)
        want.a3 = true; // Blessing on cooldown
      else if (hasTarget && cd.basic <= 0) want.basic = true; // Smite when idle
      break;
    }
    case 'barbarian': {
      if (hasTarget && cd.basic <= 0) want.basic = true; // Reckless Swing
      if (cd.a1 <= 0 && (hpFrac < 0.7 || distBoss <= BOT_MELEE_RANGE + 60)) want.a1 = true; // Rage
      if (bossPos && cd.a2 <= 0 && (inDanger || distBoss > 220)) want.a2 = true; // Leap
      if (cd.a3 <= 0 && distBoss <= reach(150)) want.a3 = true; // Whirlwind
      break;
    }
    case 'rogue': {
      if (hasTarget && cd.basic <= 0) want.basic = true; // Slash
      if (bossPos && cd.a1 <= 0 && distBoss <= reach(BOT_MELEE_RANGE + 20)) want.a1 = true; // Backstab
      if (cd.a2 <= 0 && inDanger) want.a2 = true; // Shadowstep out
      if (bossPos && cd.a3 <= 0) want.a3 = true; // Poison Vial toward boss
      break;
    }
    case 'paladin': {
      const wounded = mostWounded(world);
      const needHeal = wounded ? wounded.hp / wounded.maxHp < 0.35 + p.smart * 0.25 : false;
      if (cd.a3 <= 0 && (hpFrac < panicAt || inDanger))
        want.a3 = true; // Divine Shield
      else if (needHeal && cd.a2 <= 0)
        want.a2 = true; // Lay on Hands
      else if (cd.a1 <= 0 && distBoss <= reach(170))
        want.a1 = true; // Consecration
      else if (hasTarget && cd.basic <= 0) want.basic = true; // Holy Strike
      break;
    }
    case 'druid': {
      const wounded = mostWounded(world);
      const needHeal = wounded ? wounded.hp / wounded.maxHp < 0.35 + p.smart * 0.25 : false;
      if (needHeal && cd.a2 <= 0) want.a2 = true; // Regrowth
      if (bossPos && cd.a1 <= 0) want.a1 = true; // Entangle toward boss
      if (cd.a3 <= 0 && distBoss <= reach(170)) want.a3 = true; // Cyclone
      if (hasTarget && cd.basic <= 0) want.basic = true; // Thornlash
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
