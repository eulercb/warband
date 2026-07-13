/**
 * Branch-coverage suite for the bot AI (src/engine/ai/bot.ts).
 *
 * These tests drive `computeBotInput` (and the pure upgrade/personality helpers)
 * through every decision branch — target selection, per-class ability choice,
 * movement/retreat, revive priority, telegraph dodging, and the geometry edge
 * cases — asserting the concrete input command each branch produces. Everything
 * is seeded / positioned deterministically.
 */
import { describe, it, expect } from 'vitest';
import {
  computeBotInput,
  isBotPeerId,
  BOT_PEER_PREFIX,
  rollPersonality,
  botRoleWeight,
  pickBotUpgrades,
  type BotPersonality,
} from '../src/engine/ai/bot';
import { World } from '../src/engine/world/world';
import type {
  ClassId,
  InputCommand,
  GroundZone,
  TerrainPatch,
  Obstacle,
  Add,
  Boss,
  Player,
} from '../src/engine/core/types';
import { Rng } from '../src/engine/core/math';
import { UPGRADE_IDS, upgradeMaxStacks } from '../src/engine/content/upgrades';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function persona(over: Partial<BotPersonality> = {}): BotPersonality {
  return {
    label: 'Test',
    smart: 0.8,
    aggression: 0.5,
    chaos: 0,
    rng: new Rng(1),
    wander: { x: 0, y: 0 },
    nextWanderTick: Number.MAX_SAFE_INTEGER,
    ...over,
  };
}

/** Build a world with the given classes; strip generated hazards for isolation. */
function mkWorld(
  classes: ClassId[],
  opts: {
    monsterId?: 'dragon' | 'troll' | 'lich';
    coBosses?: ('dragon' | 'troll' | 'lich')[];
  } = {},
): World {
  const w = new World({
    monsterId: opts.monsterId ?? 'dragon',
    seed: 1,
    players: classes.map((c, i) => ({ peerId: `bot:${i + 1}`, name: `B${i}`, classId: c })),
    coBosses: opts.coBosses,
  });
  w.terrain = [];
  w.obstacles = [];
  w.groundZones = [];
  return w;
}

function readyCds(p: Player): void {
  p.cooldowns.basic = 0;
  p.cooldowns.a1 = 0;
  p.cooldowns.a2 = 0;
  p.cooldowns.a3 = 0;
}
function busyCds(p: Player): void {
  p.cooldowns.basic = 9;
  p.cooldowns.a1 = 9;
  p.cooldowns.a2 = 9;
  p.cooldowns.a3 = 9;
}

/** A boss-side damaging ground zone at `pos` (forces the bot's inDanger path). */
function bossZone(pos: { x: number; y: number }): GroundZone {
  return {
    id: 9001,
    kind: 'voidZone',
    pos: { ...pos },
    radius: 130,
    side: 'boss',
    ownerId: 1,
    damagePerTick: 12,
    healPerTick: 0,
    slowMult: 1,
    slowDuration: 0,
    duration: 8,
    remaining: 8,
    tickAccum: 0,
  };
}

function magma(pos: { x: number; y: number }, damagePerTick = 8): TerrainPatch {
  return {
    id: 8001,
    kind: 'magma',
    pos: { ...pos },
    radius: 120,
    damagePerTick,
    slowMult: 1,
    slowDuration: 0,
    tickAccum: 0,
  };
}

function rock(pos: { x: number; y: number }, radius = 44): Obstacle {
  return { id: 7001, pos: { ...pos }, radius };
}

function mkAdd(pos: { x: number; y: number }, hp = 60): Add {
  return {
    id: 6000 + Math.round(pos.x + pos.y),
    pos: { ...pos },
    hp,
    maxHp: 60,
    moveSpeed: 160,
    radius: 12,
    targetId: null,
    attackCd: 0,
    buffs: [],
  };
}

/** Force `boss` into a wind-up telegraph of `abilityId`. */
function setWindup(
  boss: Boss,
  abilityId: string | null,
  o: {
    remaining?: number;
    total?: number;
    aimAngle?: number;
    targetPos?: { x: number; y: number } | null;
    targetId?: number | null;
  } = {},
): void {
  boss.action = {
    kind: 'windup',
    abilityId,
    remaining: o.remaining ?? 0,
    total: o.total ?? 1,
    targetId: o.targetId ?? null,
    targetPos: o.targetPos ?? null,
    aimAngle: o.aimAngle ?? 0,
    channelAccum: 0,
  };
}

/** Override defOf so telegraphFlee sees a fabricated ability (exact optional fields). */
function patchDef(w: World, ability: Record<string, unknown>): void {
  (w as unknown as { defOf: () => unknown }).defOf = () => ({ abilities: [ability] });
}

/** Arm a ranger so ONLY its Roll (a3) tracks inDanger; a3 true <=> bot is fleeing. */
function armRangerDangerProbe(bot: Player): void {
  bot.cooldowns.basic = 9;
  bot.cooldowns.a1 = 9;
  bot.cooldowns.a2 = 9;
  bot.cooldowns.a3 = 0;
}

// ===========================================================================
// Pure helpers: peer ids, personalities, role weights, upgrade picks
// ===========================================================================

describe('bot: peer id helpers', () => {
  it('recognises bot peer ids', () => {
    expect(isBotPeerId(`${BOT_PEER_PREFIX}7`)).toBe(true);
    expect(isBotPeerId('trystero-xyz')).toBe(false);
  });
});

describe('bot: rollPersonality', () => {
  it('rolls a valid archetype for a generic seed', () => {
    const p = rollPersonality(12345);
    const labels = ['Genius', 'Steady', 'Reckless', 'Timid', 'Twitchy', 'Sleepy'];
    expect(labels).toContain(p.label);
    expect(p.smart).toBeGreaterThanOrEqual(0);
    expect(p.smart).toBeLessThanOrEqual(1);
    expect(p.nextWanderTick).toBe(0);
  });

  it('survives the seed that XORs to zero (|| 1 fallback)', () => {
    // seed ^ 0xbf58476d === 0 -> (…>>>0) === 0 -> falls back to 1.
    const p = rollPersonality(0xbf58476d);
    const labels = ['Genius', 'Steady', 'Reckless', 'Timid', 'Twitchy', 'Sleepy'];
    expect(labels).toContain(p.label);
  });
});

describe('bot: botRoleWeight covers every role', () => {
  it('returns a positive weight for each upgrade role', () => {
    const p = persona({ aggression: 0.5, smart: 0.5, chaos: 0.2 });
    for (const role of ['offense', 'defense', 'sustain', 'tempo', 'mobility'] as const) {
      expect(botRoleWeight(role, p)).toBeGreaterThan(0);
    }
  });
});

describe('bot: pickBotUpgrades edge cases', () => {
  it('returns a null generic when every boon is maxed (empty pool)', () => {
    const maxed = UPGRADE_IDS.flatMap((id) => Array(upgradeMaxStacks(id)).fill(id) as string[]);
    const pick = pickBotUpgrades('knight', persona(), maxed, [], new Rng(3));
    expect(pick.generic).toBeNull();
    // Class pool is still open, so the character pick remains available.
    expect(pick.char).not.toBeNull();
  });

  it('returns a null char pick for an unrecognised class (?? [] path)', () => {
    const pick = pickBotUpgrades('nonesuch' as ClassId, persona(), [], [], new Rng(3));
    expect(pick.char).toBeNull();
    expect(pick.generic).not.toBeNull();
  });

  it('returns a null char pick when the whole class pool is maxed', () => {
    // Ranger has five class upgrades; own each at its default cap.
    const ids = ['rg_pierce', 'rg_frost', 'rg_volley', 'rg_barbed', 'rg_fleet'];
    const maxedChar = ids.flatMap((id) => Array(5).fill(id) as string[]);
    const pick = pickBotUpgrades('ranger', persona(), [], maxedChar, new Rng(3));
    expect(pick.char).toBeNull();
  });
});

// ===========================================================================
// computeBotInput: top-level guards, focus selection, aim
// ===========================================================================

describe('bot: dead/downed bot emits a neutral command', () => {
  it('returns no-buttons + zero move when not alive', () => {
    const w = mkWorld(['knight']);
    const bot = w.players[0];
    bot.aim = { x: 0.6, y: -0.8 };
    bot.state = 'downed';
    const cmd = computeBotInput(w, bot, 5, persona());
    expect(cmd.move).toEqual({ x: 0, y: 0 });
    expect(cmd.buttons.basic).toBe(false);
    expect(cmd.buttons.revive).toBe(false);
    expect(cmd.aim).toEqual({ x: 0.6, y: -0.8 });
  });
});

describe('bot: default personality', () => {
  it('omitting the personality uses the steady-veteran default', () => {
    const w = mkWorld(['knight']);
    const bot = w.players[0];
    faceOff(w, 150);
    readyCds(bot);
    const cmd = computeBotInput(w, bot, 0); // no personality arg -> defaultPersonality()
    expect(cmd.buttons.basic).toBe(true); // engages the boss like a normal bot
    expect(Math.hypot(cmd.aim.x, cmd.aim.y)).toBeCloseTo(1, 3);
  });
});

describe('bot: focus falls back boss -> add -> none', () => {
  it('with no boss but an add present, aims/positions on the add', () => {
    const w = mkWorld(['knight']);
    w.boss = null;
    w.adds.push(mkAdd({ x: 800, y: 300 }));
    const bot = w.players[0];
    bot.pos = { x: 800, y: 600 };
    readyCds(bot);
    const cmd = computeBotInput(w, bot, 0, persona());
    // hasTarget (add) => Cleave fires; bossPos is null => Taunt/Bash do not.
    expect(cmd.buttons.basic).toBe(true);
    expect(cmd.buttons.a1).toBe(false);
    expect(cmd.buttons.a3).toBe(false);
    // aim points up toward the add.
    expect(cmd.aim.y).toBeLessThan(0);
  });

  it('with no boss and no add, keeps its heading and holds position', () => {
    const w = mkWorld(['knight']);
    w.boss = null;
    const bot = w.players[0];
    bot.pos = { x: 800, y: 600 };
    bot.aim = { x: 1, y: 0 };
    readyCds(bot);
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.move).toEqual({ x: 0, y: 0 }); // positioning(!focus) => {0,0}
    expect(cmd.aim.x).toBeCloseTo(1, 5);
    expect(cmd.aim.y).toBeCloseTo(0, 5);
    // No target and no boss => the whole knight kit stays quiet.
    expect(cmd.buttons.basic).toBe(false);
    expect(cmd.buttons.a1).toBe(false);
    expect(cmd.buttons.a2).toBe(false);
    expect(cmd.buttons.a3).toBe(false);
  });

  it('aim degenerates to the current heading when the boss is on top of the bot', () => {
    const w = mkWorld(['ranger']);
    const bot = w.players[0];
    const boss = w.boss!;
    bot.pos = { x: 800, y: 500 };
    bot.aim = { x: -1, y: 0 };
    boss.pos = { x: 800, y: 500 }; // identical -> safeDir falls back to bot.aim
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.aim.x).toBeCloseTo(-1, 5);
    expect(cmd.aim.y).toBeCloseTo(0, 5);
  });
});

// ===========================================================================
// pickNearestBoss / pickNearestAdd
// ===========================================================================

describe('bot: nearest-boss selection', () => {
  it('skips a dead boss and locks onto the surviving twin', () => {
    const w = mkWorld(['knight'], { coBosses: ['troll'] });
    const [b0, b1] = w.bosses;
    b0.pos = { x: 500, y: 300 };
    b1.pos = { x: 1100, y: 300 };
    b0.hp = 0; // dead lead -> skipped by pickNearestBoss AND dangerAvoidance
    const bot = w.players[0];
    bot.pos = { x: 1100, y: 600 }; // directly below the live troll
    const cmd = computeBotInput(w, bot, 0, persona());
    // Aims at the LIVE boss (straight up): x ~ 0. The dead boss would pull x < 0.
    expect(cmd.aim.x).toBeCloseTo(0, 1);
    expect(cmd.aim.y).toBeLessThan(0);
  });

  it('keeps the nearer of two live bosses (second is not closer)', () => {
    const w = mkWorld(['knight'], { coBosses: ['troll'] });
    const [b0, b1] = w.bosses;
    b0.pos = { x: 500, y: 300 };
    b1.pos = { x: 1100, y: 300 };
    const bot = w.players[0];
    bot.pos = { x: 500, y: 600 }; // below the nearer lead boss
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.aim.x).toBeCloseTo(0, 1); // aims at the nearer boss
    expect(cmd.aim.y).toBeLessThan(0);
  });
});

describe('bot: nearest-add selection', () => {
  it('skips a dead add and picks the closest live one', () => {
    const w = mkWorld(['knight']);
    w.boss = null;
    w.adds.push(mkAdd({ x: 805, y: 300 }, 0)); // dead -> skipped
    w.adds.push(mkAdd({ x: 810, y: 300 })); // nearest live
    w.adds.push(mkAdd({ x: 1300, y: 300 })); // farther live -> not chosen
    const bot = w.players[0];
    bot.pos = { x: 800, y: 600 };
    readyCds(bot);
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.buttons.basic).toBe(true); // has a (live add) target
    expect(Number.isFinite(cmd.move.x)).toBe(true);
    expect(cmd.aim.y).toBeLessThan(0); // toward the add cluster above
  });
});

// ===========================================================================
// Reviving a downed ally (priority over everything)
// ===========================================================================

describe('bot: revive behaviour', () => {
  it('holds position and channels revive when the ally is in reach', () => {
    const w = mkWorld(['cleric', 'ranger']);
    w.boss = null;
    const bot = w.players[0];
    const ally = w.players[1];
    bot.pos = { x: 500, y: 500 };
    ally.pos = { x: 560, y: 500 }; // d=60 <= ~87 revive-touch range
    ally.state = 'downed';
    ally.downedTimer = 12;
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.buttons.revive).toBe(true);
    expect(cmd.move).toEqual({ x: 0, y: 0 });
  });

  it('walks toward a downed ally that is in range but not yet touching', () => {
    const w = mkWorld(['cleric', 'ranger']);
    w.boss = null;
    const bot = w.players[0];
    const ally = w.players[1];
    bot.pos = { x: 500, y: 500 };
    ally.pos = { x: 700, y: 500 }; // d=200: within BOT_REVIVE_RANGE, past touch range
    ally.state = 'downed';
    ally.downedTimer = 12;
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.buttons.revive).toBe(true);
    expect(cmd.move.x).toBeGreaterThan(0); // heading right toward the ally
  });

  it('ignores a downed ally beyond revive range', () => {
    const w = mkWorld(['cleric', 'ranger']);
    const bot = w.players[0];
    const ally = w.players[1];
    bot.pos = { x: 500, y: 500 };
    ally.pos = { x: 500, y: 900 }; // d=400 > BOT_REVIVE_RANGE(340)
    ally.state = 'downed';
    ally.downedTimer = 12;
    readyCds(bot);
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.buttons.revive).toBe(false); // no revive target selected
  });
});

// ===========================================================================
// Positioning (melee hug vs ranged standoff bands)
// ===========================================================================

describe('bot: positioning', () => {
  it('melee closes the distance when out past its hug range', () => {
    const w = mkWorld(['knight']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 600 }; // d=300 > hug(120)
    busyCds(bot); // silence abilities so we only read movement
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.move.y).toBeLessThan(0); // moves up toward the boss
  });

  it('melee holds still once inside its hug range', () => {
    const w = mkWorld(['knight']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 400 }; // d=100 <= hug(120)
    busyCds(bot);
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.move).toEqual({ x: 0, y: 0 });
  });

  it('ranged backs off when it is too close', () => {
    const w = mkWorld(['mage']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 500 }; // d=200 < standoff-40(300)
    busyCds(bot);
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.move.y).toBeGreaterThan(0); // retreats downward, away from boss
  });

  it('ranged closes in when it is too far', () => {
    const w = mkWorld(['mage']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 700 }; // d=400 > standoff+40(380)
    busyCds(bot);
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.move.y).toBeLessThan(0); // advances upward toward boss
  });

  it('ranged strafes while inside the standoff band', () => {
    const w = mkWorld(['mage']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 640 }; // d=340, inside [300,380] band
    busyCds(bot);
    const cmd = computeBotInput(w, bot, 0, persona());
    // Strafe is perpendicular (sideways) at ~0.4 magnitude, not toward/away.
    expect(Math.abs(cmd.move.x)).toBeGreaterThan(0.2);
    expect(Math.abs(cmd.move.y)).toBeLessThan(0.2);
    expect(Math.hypot(cmd.move.x, cmd.move.y)).toBeLessThan(0.6);
  });

  it('cleric uses the tighter (−40u) standoff band', () => {
    const w = mkWorld(['cleric']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 520 }; // d=220 < cleric standoff-40(260) -> back off
    busyCds(bot);
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.move.y).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Obstacle avoidance
// ===========================================================================

describe('bot: obstacle avoidance', () => {
  it('steers sideways around cover directly in its path (and ignores far/behind cover)', () => {
    const w = mkWorld(['knight']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 450 }; // wants to move straight up toward the boss
    busyCds(bot);
    w.obstacles = [
      rock({ x: 800, y: 385 }, 40), // in the path, within clearance -> steer
      rock({ x: 800, y: 520 }, 40), // behind the bot (opposite heading) -> skipped
      rock({ x: 200, y: 200 }, 40), // far away -> skipped
    ];
    const cmd = computeBotInput(w, bot, 0, persona());
    // Steering injects a perpendicular (sideways) component.
    expect(Math.abs(cmd.move.x)).toBeGreaterThan(0.05);
    expect(Number.isFinite(cmd.move.y)).toBe(true);
  });
});

// ===========================================================================
// Danger avoidance: terrain and boss ground zones
// ===========================================================================

describe('bot: danger avoidance (terrain + zones)', () => {
  it('flees damaging terrain it is standing in', () => {
    const w = mkWorld(['mage']);
    const bot = w.players[0];
    bot.pos = { x: 800, y: 500 };
    w.terrain = [magma({ x: 800, y: 470 }, 8)]; // bot offset from centre -> real flee vector
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.move.y).toBeGreaterThan(0); // pushed away (downward) from the patch above
    expect(Math.hypot(cmd.move.x, cmd.move.y)).toBeCloseTo(1, 3); // normalised flee
  });

  it('non-damaging terrain does not trigger a flee', () => {
    const w = mkWorld(['mage']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 640 }; // in the standoff band
    w.terrain = [magma({ x: 800, y: 640 }, 0)]; // damagePerTick 0 -> skipped
    busyCds(bot);
    const cmd = computeBotInput(w, bot, 0, persona());
    // Behaves as if safe: strafes rather than making a unit-length flee dash.
    expect(Math.hypot(cmd.move.x, cmd.move.y)).toBeLessThan(0.6);
  });

  it('terrain patch the bot is clear of does not trigger a flee', () => {
    const w = mkWorld(['ranger']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 640 };
    w.terrain = [magma({ x: 200, y: 200 }, 8)]; // far away: len(away) > margin
    armRangerDangerProbe(bot);
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.buttons.a3).toBe(false); // not in danger
  });

  it('flees a boss-side damaging ground zone (and player-side zones are ignored)', () => {
    const w = mkWorld(['ranger']);
    const bot = w.players[0];
    bot.pos = { x: 800, y: 500 };
    armRangerDangerProbe(bot);
    // A harmless player-side zone (side !== 'boss') the loop must skip...
    const friendly = bossZone({ x: 800, y: 500 });
    friendly.side = 'player';
    // ...and the real boss-side hazard right on the bot.
    w.groundZones = [friendly, bossZone({ x: 800, y: 500 })];
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.buttons.a3).toBe(true); // Roll fires: the bot is in danger
    expect(Number.isFinite(cmd.move.x)).toBe(true);
  });
});

// ===========================================================================
// telegraphFlee: every boss ability shape, reaction lag, and defensive paths.
// A ranger probe (only a3/Roll off cooldown) makes a3 === "the bot is fleeing".
// ===========================================================================

describe('bot: telegraph dodging by shape', () => {
  function probe(monsterId: 'dragon' | 'troll' | 'lich' = 'dragon') {
    const w = mkWorld(['ranger'], { monsterId });
    const bot = w.players[0];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 300 };
    armRangerDangerProbe(bot);
    return { w, bot, boss };
  }

  it('pbaoe (Tail Sweep): flees when inside, ignores when outside', () => {
    const inside = probe();
    inside.bot.pos = { x: 800, y: 400 }; // d=100 < radius 160
    setWindup(inside.boss, 'tailSweep', { total: 1, remaining: 0 });
    const cmdIn = computeBotInput(inside.w, inside.bot, 0, persona({ smart: 1 }));
    expect(cmdIn.buttons.a3).toBe(true);
    expect(cmdIn.move.y).toBeGreaterThan(0); // straight out, away from the boss

    const outside = probe();
    outside.bot.pos = { x: 800, y: 640 }; // d=340 > radius 160
    setWindup(outside.boss, 'tailSweep', { total: 1, remaining: 0 });
    const cmdOut = computeBotInput(outside.w, outside.bot, 0, persona({ smart: 1 }));
    expect(cmdOut.buttons.a3).toBe(false);
  });

  it('circleAtTarget (Fireball): flees a circle centred on the telegraph target', () => {
    const t = probe();
    t.bot.pos = { x: 800, y: 480 };
    // targetPos present -> circle centred there (radius 110), bot 20u inside.
    setWindup(t.boss, 'fireball', { total: 1, remaining: 0, targetPos: { x: 800, y: 500 } });
    const cmdIn = computeBotInput(t.w, t.bot, 0, persona({ smart: 1 }));
    expect(cmdIn.buttons.a3).toBe(true);

    const out = probe();
    out.bot.pos = { x: 800, y: 760 }; // 260u from the target centre -> outside
    setWindup(out.boss, 'fireball', { total: 1, remaining: 0, targetPos: { x: 800, y: 500 } });
    expect(computeBotInput(out.w, out.bot, 0, persona({ smart: 1 })).buttons.a3).toBe(false);
  });

  it('cone (Fire Breath): flees when caught in the swept arc', () => {
    const t = probe();
    t.bot.pos = { x: 800, y: 450 }; // straight below the boss, d=150 < range 400
    setWindup(t.boss, 'fireBreath', { total: 1, remaining: 0, aimAngle: Math.PI / 2 }); // aimed down
    expect(computeBotInput(t.w, t.bot, 0, persona({ smart: 1 })).buttons.a3).toBe(true);

    const out = probe();
    out.bot.pos = { x: 800, y: 450 };
    setWindup(out.boss, 'fireBreath', { total: 1, remaining: 0, aimAngle: -Math.PI / 2 }); // aimed away
    expect(computeBotInput(out.w, out.bot, 0, persona({ smart: 1 })).buttons.a3).toBe(false);
  });

  it('line (Charge): flees the capsule between the boss and its explicit target', () => {
    const t = probe('troll');
    t.bot.pos = { x: 800, y: 500 }; // on the boss->target segment
    setWindup(t.boss, 'charge', { total: 1, remaining: 0, targetPos: { x: 800, y: 800 } });
    expect(computeBotInput(t.w, t.bot, 0, persona({ smart: 1 })).buttons.a3).toBe(true);

    const out = probe('troll');
    out.bot.pos = { x: 400, y: 500 }; // 400u off the line, past its half-width
    setWindup(out.boss, 'charge', { total: 1, remaining: 0, targetPos: { x: 800, y: 800 } });
    expect(computeBotInput(out.w, out.bot, 0, persona({ smart: 1 })).buttons.a3).toBe(false);
  });

  it('beam (Life Drain): flees only when it is both in range and the beam target', () => {
    const targeted = probe('lich');
    targeted.bot.pos = { x: 800, y: 450 }; // d=150 < range 500
    setWindup(targeted.boss, 'lifeDrain', { total: 1, remaining: 0, targetId: targeted.bot.id });
    expect(computeBotInput(targeted.w, targeted.bot, 0, persona({ smart: 1 })).buttons.a3).toBe(
      true,
    );

    const notMe = probe('lich');
    notMe.bot.pos = { x: 800, y: 450 }; // in range, but the beam is aimed elsewhere
    setWindup(notMe.boss, 'lifeDrain', { total: 1, remaining: 0, targetId: 999999 });
    expect(computeBotInput(notMe.w, notMe.bot, 0, persona({ smart: 1 })).buttons.a3).toBe(false);
  });

  it('a line telegraph with no explicit target projects from the aim angle', () => {
    const t = probe('troll');
    // Aim the projected charge line horizontally (stays within half the arena, so
    // the torus does not wrap the far endpoint back the other way).
    t.bot.pos = { x: 1100, y: 300 }; // along the projected line, right of the boss
    setWindup(t.boss, 'charge', { total: 1, remaining: 0, aimAngle: 0, targetPos: null });
    expect(computeBotInput(t.w, t.bot, 0, persona({ smart: 1 })).buttons.a3).toBe(true);
  });
});

describe('bot: telegraph reaction discipline + defensive guards', () => {
  it('a sleepy bot ignores an early telegraph a smart bot already dodges', () => {
    const mk = () => {
      const w = mkWorld(['ranger']);
      const bot = w.players[0];
      w.boss!.pos = { x: 800, y: 300 };
      bot.pos = { x: 800, y: 400 };
      armRangerDangerProbe(bot);
      setWindup(w.boss!, 'tailSweep', { total: 1, remaining: 0.5 }); // 50% into the wind-up
      return { w, bot };
    };
    const sleepy = mk();
    expect(computeBotInput(sleepy.w, sleepy.bot, 0, persona({ smart: 0 })).buttons.a3).toBe(false);
    const smart = mk();
    expect(computeBotInput(smart.w, smart.bot, 0, persona({ smart: 1 })).buttons.a3).toBe(true);
  });

  it('reacts to an instant (total 0) telegraph without dividing by zero', () => {
    const w = mkWorld(['ranger']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 400 };
    armRangerDangerProbe(bot);
    setWindup(w.boss!, 'tailSweep', { total: 0, remaining: 0 }); // elapsedFrac -> 1
    expect(computeBotInput(w, bot, 0, persona({ smart: 1 })).buttons.a3).toBe(true);
  });

  it('ignores a wind-up referencing an unknown ability id', () => {
    const w = mkWorld(['ranger']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 400 };
    armRangerDangerProbe(bot);
    setWindup(w.boss!, 'no_such_ability', { total: 1, remaining: 0 });
    expect(computeBotInput(w, bot, 0, persona({ smart: 1 })).buttons.a3).toBe(false);
  });

  it('ignores a wind-up with a null ability id', () => {
    const w = mkWorld(['ranger']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 400 };
    armRangerDangerProbe(bot);
    setWindup(w.boss!, null, { total: 1, remaining: 0 });
    expect(computeBotInput(w, bot, 0, persona({ smart: 1 })).buttons.a3).toBe(false);
  });
});

describe('bot: telegraph shape default dimensions (?? fallbacks)', () => {
  // Fabricated abilities that omit their optional geometry field, so telegraphFlee
  // must fall back to the built-in default while still catching the bot.
  const shapes: Array<{
    name: string;
    ability: Record<string, unknown>;
    botPos: { x: number; y: number };
    windup: Parameters<typeof setWindup>[2];
  }> = [
    {
      name: 'pbaoe radius ?? 160',
      ability: { id: 'fk', name: 'fk', shape: 'pbaoe' },
      botPos: { x: 800, y: 420 },
      windup: { total: 1, remaining: 0 },
    },
    {
      name: 'circleAtTarget radius ?? 110 at boss',
      ability: { id: 'fk', name: 'fk', shape: 'circleAtTarget' },
      botPos: { x: 800, y: 380 },
      windup: { total: 1, remaining: 0, targetPos: null },
    },
    {
      name: 'cone range ?? 300 / halfAngle ?? 30',
      ability: { id: 'fk', name: 'fk', shape: 'cone' },
      botPos: { x: 800, y: 450 },
      windup: { total: 1, remaining: 0, aimAngle: Math.PI / 2 },
    },
    {
      name: 'line range ?? 600 / width ?? 45',
      ability: { id: 'fk', name: 'fk', shape: 'line' },
      botPos: { x: 1100, y: 300 }, // along a horizontally-projected line (no torus wrap)
      windup: { total: 1, remaining: 0, aimAngle: 0, targetPos: null },
    },
  ];

  for (const s of shapes) {
    it(`flees using default: ${s.name}`, () => {
      const w = mkWorld(['ranger']);
      const bot = w.players[0];
      w.boss!.pos = { x: 800, y: 300 };
      bot.pos = s.botPos;
      armRangerDangerProbe(bot);
      patchDef(w, s.ability);
      setWindup(w.boss!, 'fk', s.windup);
      expect(computeBotInput(w, bot, 0, persona({ smart: 1 })).buttons.a3).toBe(true);
    });
  }

  it('flees using default: beam range ?? 500', () => {
    const w = mkWorld(['ranger']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 450 }; // d=150 < 500 default
    armRangerDangerProbe(bot);
    patchDef(w, { id: 'fk', name: 'fk', shape: 'beam' });
    setWindup(w.boss!, 'fk', { total: 1, remaining: 0, targetId: bot.id });
    expect(computeBotInput(w, bot, 0, persona({ smart: 1 })).buttons.a3).toBe(true);
  });

  it('a non-dodgeable shape (projectile) never triggers a flee', () => {
    const w = mkWorld(['ranger']);
    const bot = w.players[0];
    w.boss!.pos = { x: 800, y: 300 };
    bot.pos = { x: 800, y: 320 };
    armRangerDangerProbe(bot);
    patchDef(w, { id: 'fk', name: 'fk', shape: 'projectile' });
    setWindup(w.boss!, 'fk', { total: 1, remaining: 0 });
    expect(computeBotInput(w, bot, 0, persona({ smart: 1 })).buttons.a3).toBe(false);
  });
});

// ===========================================================================
// decideAbilities: per-class ability logic
// ===========================================================================

/** Place the boss and bot a fixed distance apart (vertically), boss above. */
function faceOff(w: World, dist: number): void {
  w.boss!.pos = { x: 800, y: 300 };
  w.players[0].pos = { x: 800, y: 300 + dist };
}

describe('bot: knight abilities', () => {
  it('all four fire when engaged, hurt, and in bash range', () => {
    const w = mkWorld(['knight']);
    const bot = w.players[0];
    faceOff(w, 150); // <= reach(160) for Shield Bash
    bot.hp = bot.maxHp * 0.3; // below panic -> Shield Wall
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons).toMatchObject({ basic: true, a1: true, a2: true, a3: true });
  });

  it('Shield Wall also pops from danger even at full health', () => {
    const w = mkWorld(['knight']);
    const bot = w.players[0];
    faceOff(w, 150);
    readyCds(bot);
    w.groundZones = [bossZone(bot.pos)]; // inDanger
    expect(computeBotInput(w, bot, 0, persona()).buttons.a2).toBe(true);
  });

  it('holds Shield Wall and Bash when healthy, safe, and out of range', () => {
    const w = mkWorld(['knight']);
    const bot = w.players[0];
    faceOff(w, 300); // out of bash range
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.basic).toBe(true);
    expect(c.buttons.a1).toBe(true);
    expect(c.buttons.a2).toBe(false); // healthy + safe
    expect(c.buttons.a3).toBe(false); // too far
  });

  it('stays silent on cooldown', () => {
    const w = mkWorld(['knight']);
    const bot = w.players[0];
    faceOff(w, 150);
    busyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons).toMatchObject({ basic: false, a1: false, a2: false, a3: false });
  });
});

describe('bot: ranger abilities', () => {
  it('shoots and rains while safe, holds Roll', () => {
    const w = mkWorld(['ranger']);
    const bot = w.players[0];
    faceOff(w, 300);
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.basic).toBe(true);
    expect(c.buttons.a1).toBe(true);
    expect(c.buttons.a2).toBe(true);
    expect(c.buttons.a3).toBe(false); // no danger -> no Roll
  });

  it('rolls out of danger', () => {
    const w = mkWorld(['ranger']);
    const bot = w.players[0];
    faceOff(w, 300);
    readyCds(bot);
    w.groundZones = [bossZone(bot.pos)];
    expect(computeBotInput(w, bot, 0, persona()).buttons.a3).toBe(true);
  });
});

describe('bot: mage abilities', () => {
  it('a disciplined mage fireballs from range only when it is safe', () => {
    const w = mkWorld(['mage']);
    const bot = w.players[0];
    faceOff(w, 200); // > 180 for Fireball, > reach(170) so no Frost Nova
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona({ smart: 0.8 })); // not greedy
    expect(c.buttons.a1).toBe(true); // Fireball (safe)
    expect(c.buttons.a2).toBe(false);
    expect(c.buttons.a3).toBe(false);
  });

  it('Frost Nova fires point-blank', () => {
    const w = mkWorld(['mage']);
    const bot = w.players[0];
    faceOff(w, 150); // <= reach(170)
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona({ smart: 0.8 }));
    expect(c.buttons.a2).toBe(true);
    expect(c.buttons.a1).toBe(false); // 150 < 180 -> no Fireball
  });

  it('a disciplined mage refuses to greed Fireball while in danger, and blinks instead', () => {
    const w = mkWorld(['mage']);
    const bot = w.players[0];
    faceOff(w, 200);
    readyCds(bot);
    w.groundZones = [bossZone(bot.pos)];
    const c = computeBotInput(w, bot, 0, persona({ smart: 0.8 })); // greedy=false + inDanger
    expect(c.buttons.a1).toBe(false); // (greedy || !inDanger) === false
    expect(c.buttons.a3).toBe(true); // Blink out
  });

  it('a reckless mage greeds Fireball even while in danger', () => {
    const w = mkWorld(['mage']);
    const bot = w.players[0];
    faceOff(w, 200);
    readyCds(bot);
    w.groundZones = [bossZone(bot.pos)];
    const c = computeBotInput(w, bot, 0, persona({ smart: 0.3 })); // greedy=true
    expect(c.buttons.a1).toBe(true);
    expect(c.buttons.a3).toBe(true);
  });
});

describe('bot: cleric abilities (priority chain)', () => {
  it('heals the most wounded ally first', () => {
    const w = mkWorld(['cleric', 'ranger']);
    const bot = w.players[0];
    faceOff(w, 300);
    w.players[1].hp = w.players[1].maxHp * 0.3; // wounded ally
    readyCds(bot);
    expect(computeBotInput(w, bot, 0, persona()).buttons.a1).toBe(true);
  });

  it('drops Sanctuary when two allies are hurt but none critically', () => {
    const w = mkWorld(['cleric', 'ranger', 'mage']);
    const bot = w.players[0];
    faceOff(w, 300);
    w.players[1].hp = w.players[1].maxHp * 0.65; // wounded (<0.7) but not critical (>0.64)
    w.players[2].hp = w.players[2].maxHp * 0.65;
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.a1).toBe(false); // no critical heal
    expect(c.buttons.a2).toBe(true); // Sanctuary (woundedCount >= 2)
  });

  it('blesses on cooldown when nobody needs help', () => {
    const w = mkWorld(['cleric']);
    const bot = w.players[0];
    faceOff(w, 300);
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.a1).toBe(false);
    expect(c.buttons.a2).toBe(false);
    expect(c.buttons.a3).toBe(true); // Blessing
  });

  it('smites when everything else is on cooldown', () => {
    const w = mkWorld(['cleric']);
    const bot = w.players[0];
    faceOff(w, 300);
    readyCds(bot);
    bot.cooldowns.a3 = 9; // block Blessing -> falls through to Smite
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.a3).toBe(false);
    expect(c.buttons.basic).toBe(true); // Smite
  });
});

describe('bot: barbarian abilities', () => {
  it('rages (low hp), leaps (in danger) and whirlwinds (in range)', () => {
    const w = mkWorld(['barbarian']);
    const bot = w.players[0];
    faceOff(w, 150); // <= reach(150) for Whirlwind
    bot.hp = bot.maxHp * 0.5; // < 0.7 -> Rage
    readyCds(bot);
    w.groundZones = [bossZone(bot.pos)]; // inDanger -> Leap
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons).toMatchObject({ basic: true, a1: true, a2: true, a3: true });
  });

  it('rages from proximity even at full health', () => {
    const w = mkWorld(['barbarian']);
    const bot = w.players[0];
    faceOff(w, 150); // <= BOT_MELEE_RANGE+60(180)
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.a1).toBe(true); // Rage via distance
    expect(c.buttons.a3).toBe(true); // Whirlwind
    expect(c.buttons.a2).toBe(false); // safe + close -> no Leap
  });

  it('leaps to close a long gap', () => {
    const w = mkWorld(['barbarian']);
    const bot = w.players[0];
    faceOff(w, 300); // > 220 -> Leap; > reach(150) -> no Whirlwind; healthy+far -> no Rage
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.a2).toBe(true); // Leap via distance
    expect(c.buttons.a1).toBe(false);
    expect(c.buttons.a3).toBe(false);
  });
});

describe('bot: rogue abilities', () => {
  it('slashes, backstabs, shadowsteps and throws poison when close and in danger', () => {
    const w = mkWorld(['rogue']);
    const bot = w.players[0];
    faceOff(w, 100); // <= reach(140) for Backstab
    readyCds(bot);
    w.groundZones = [bossZone(bot.pos)]; // inDanger -> Shadowstep
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons).toMatchObject({ basic: true, a1: true, a2: true, a3: true });
  });

  it('keeps Backstab and Shadowstep holstered when far and safe', () => {
    const w = mkWorld(['rogue']);
    const bot = w.players[0];
    faceOff(w, 300); // > reach(140)
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.a1).toBe(false); // out of backstab range
    expect(c.buttons.a2).toBe(false); // not in danger
    expect(c.buttons.a3).toBe(true); // Poison Vial (boss present)
    expect(c.buttons.basic).toBe(true);
  });
});

describe('bot: paladin abilities (priority chain)', () => {
  it('Divine Shield first when hurt', () => {
    const w = mkWorld(['paladin']);
    const bot = w.players[0];
    faceOff(w, 150);
    bot.hp = bot.maxHp * 0.3; // < panic
    readyCds(bot);
    expect(computeBotInput(w, bot, 0, persona()).buttons.a3).toBe(true);
  });

  it('Lay on Hands when a healthy paladin has a wounded ally', () => {
    const w = mkWorld(['paladin', 'ranger']);
    const bot = w.players[0];
    faceOff(w, 150);
    w.players[1].hp = w.players[1].maxHp * 0.3;
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.a3).toBe(false);
    expect(c.buttons.a2).toBe(true);
  });

  it('Consecration when safe, unhurt allies, and in range', () => {
    const w = mkWorld(['paladin']);
    const bot = w.players[0];
    faceOff(w, 150); // <= reach(170)
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.a3).toBe(false);
    expect(c.buttons.a2).toBe(false);
    expect(c.buttons.a1).toBe(true);
  });

  it('falls through to Holy Strike out of Consecration range', () => {
    const w = mkWorld(['paladin']);
    const bot = w.players[0];
    faceOff(w, 300); // > reach(170)
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.a1).toBe(false);
    expect(c.buttons.basic).toBe(true);
  });
});

describe('bot: druid abilities', () => {
  it('regrows, entangles, cyclones and thornlashes at once when applicable', () => {
    const w = mkWorld(['druid', 'ranger']);
    const bot = w.players[0];
    faceOff(w, 150); // <= reach(170) for Cyclone
    w.players[1].hp = w.players[1].maxHp * 0.3; // wounded ally -> Regrowth
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons).toMatchObject({ basic: true, a1: true, a2: true, a3: true });
  });

  it('skips Regrowth and Cyclone when nobody is hurt and the boss is far', () => {
    const w = mkWorld(['druid']);
    const bot = w.players[0];
    faceOff(w, 300); // > reach(170)
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.a2).toBe(false); // no wounded ally -> needHeal false
    expect(c.buttons.a3).toBe(false); // out of cyclone range
    expect(c.buttons.a1).toBe(true); // Entangle (boss present)
    expect(c.buttons.basic).toBe(true); // Thornlash
  });

  it('goes quiet on cooldown', () => {
    const w = mkWorld(['druid']);
    const bot = w.players[0];
    faceOff(w, 150);
    busyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons).toMatchObject({ basic: false, a1: false, a2: false, a3: false });
  });
});

// ===========================================================================
// Edge detection (rising-edge button pulses) + a downed ally suppressing mostWounded
// ===========================================================================

describe('bot: rising-edge button gating', () => {
  it('suppresses buttons that were already held last tick, passes fresh presses', () => {
    const w = mkWorld(['ranger']);
    const bot = w.players[0];
    faceOff(w, 300);
    readyCds(bot);
    w.groundZones = [bossZone(bot.pos)]; // all four wants active (incl. Roll)

    bot.prevButtons = { basic: true, a1: true, a2: true, a3: true, revive: false };
    const held = computeBotInput(w, bot, 0, persona());
    expect(held.buttons).toMatchObject({ basic: false, a1: false, a2: false, a3: false });

    bot.prevButtons = { basic: false, a1: false, a2: false, a3: false, revive: false };
    const fresh = computeBotInput(w, bot, 0, persona());
    expect(fresh.buttons).toMatchObject({ basic: true, a1: true, a2: true, a3: true });
  });

  it('a downed teammate is skipped by mostWounded (heal targets the living)', () => {
    const w = mkWorld(['cleric', 'ranger', 'mage']);
    const bot = w.players[0];
    faceOff(w, 300);
    w.players[1].state = 'dead'; // non-alive: excluded from mostWounded/woundedCount
    w.players[1].hp = 0;
    w.players[2].hp = w.players[2].maxHp * 0.3; // the only wounded, living ally
    readyCds(bot);
    expect(computeBotInput(w, bot, 0, persona()).buttons.a1).toBe(true);
  });
});

// ===========================================================================
// wanderDrift (chaotic positioning jitter)
// ===========================================================================

describe('bot: wander drift', () => {
  it('a calm bot never wanders; a chaotic one that has not hit its timer stays put', () => {
    const w = mkWorld(['knight']);
    const bot = w.players[0];
    faceOff(w, 100); // melee-close so base positioning is {0,0}
    busyCds(bot);
    // chaos 0 -> {0,0}
    expect(computeBotInput(w, bot, 0, persona({ chaos: 0 })).move).toEqual({ x: 0, y: 0 });
    // chaos > 0 but the re-roll tick is far in the future -> still the (zero) wander
    const notYet = persona({ chaos: 0.6, nextWanderTick: 1e9 });
    expect(computeBotInput(w, bot, 0, notYet).move).toEqual({ x: 0, y: 0 });
  });

  it('a chaotic bot both stands still and drifts across seeds when its timer fires', () => {
    let sawStill = false;
    let sawDrift = false;
    for (let seed = 1; seed <= 80 && !(sawStill && sawDrift); seed++) {
      const w = mkWorld(['knight']);
      const bot = w.players[0];
      faceOff(w, 100);
      busyCds(bot);
      const p = persona({ chaos: 0.8, rng: new Rng(seed), nextWanderTick: 0 });
      computeBotInput(w, bot, 0, p); // tick 0 >= nextWanderTick -> re-roll
      if (p.wander.x === 0 && p.wander.y === 0) sawStill = true;
      else sawDrift = true;
    }
    expect(sawStill).toBe(true); // the "stand there menacingly" (<0.25) branch
    expect(sawDrift).toBe(true); // the fromAngle drift branch
  });
});

// ===========================================================================
// Integration sweep: full band, rolled personalities, many ticks.
// ===========================================================================

describe('bot: integrated all-class fights stay finite and land damage', () => {
  function runBand(classes: ClassId[], seed: number): void {
    const w = new World({
      monsterId: 'dragon',
      seed,
      players: classes.map((c, i) => ({ peerId: `bot:${i + 1}`, name: `B${i}`, classId: c })),
    });
    const personalities = new Map<string, BotPersonality>();
    w.players.forEach((p, i) => personalities.set(p.peerId, rollPersonality(seed * 31 + i)));
    const startHp = w.boss!.hp;
    for (let t = 0; t < 260 && !w.finished; t++) {
      const map = new Map<string, InputCommand>();
      for (const p of w.players) {
        map.set(p.peerId, computeBotInput(w, p, w.tick, personalities.get(p.peerId)));
      }
      w.step(0.05, map);
      for (const p of w.players) {
        expect(Number.isFinite(p.pos.x)).toBe(true);
        expect(Number.isFinite(p.hp)).toBe(true);
      }
      if (w.boss) expect(Number.isFinite(w.boss.hp)).toBe(true);
    }
    if (w.boss) expect(w.boss.hp).toBeLessThan(startHp);
  }

  it('knight/ranger/mage/cleric', () => runBand(['knight', 'ranger', 'mage', 'cleric'], 8));
  it('barbarian/rogue/paladin/druid', () => runBand(['barbarian', 'rogue', 'paladin', 'druid'], 5));
  // The four expansion classes must fight too — before their bot AI was wired
  // they pressed no buttons and never scratched the boss (item: bots broken).
  it('bard/monk/sorcerer/warlock', () => runBand(['bard', 'monk', 'sorcerer', 'warlock'], 12));
});

describe('bot: expansion classes press their abilities', () => {
  // Each new class, with a boss in melee reach and every cooldown ready, must
  // want at least its basic attack (the pre-fix bug left them button-dead).
  for (const c of ['bard', 'monk', 'sorcerer', 'warlock'] as const) {
    it(`${c} presses its basic attack against a boss`, () => {
      const w = mkWorld([c]);
      const bot = w.players[0];
      // Stand right on top of the boss so melee/pbaoe ranges are satisfied too.
      bot.pos = { x: w.boss!.pos.x, y: w.boss!.pos.y + 40 };
      readyCds(bot);
      const cmd = computeBotInput(w, bot, w.tick, persona());
      const pressedSomething =
        cmd.buttons.basic || cmd.buttons.a1 || cmd.buttons.a2 || cmd.buttons.a3;
      expect(pressedSomething).toBe(true);
    });
  }
});

// ===========================================================================
// Bard Healing Word — the needHeal branch (decideAbilities, line 536)
// ===========================================================================

describe('bot: bard heals a wounded ally', () => {
  it('casts Healing Word when an ally drops below the heal threshold (line 536)', () => {
    const w = mkWorld(['bard', 'ranger']);
    const bot = w.players[0];
    faceOff(w, 300);
    w.players[1].hp = w.players[1].maxHp * 0.3; // wounded ally -> needHeal true
    readyCds(bot);
    const c = computeBotInput(w, bot, 0, persona());
    expect(c.buttons.a2).toBe(true); // Healing Word (needHeal && cd.a2 <= 0)
  });

  it('holds Healing Word when the whole band is healthy (needHeal false arm)', () => {
    const w = mkWorld(['bard', 'ranger']);
    const bot = w.players[0];
    faceOff(w, 300); // both at full hp -> mostWounded ratio 1 -> needHeal false
    readyCds(bot);
    expect(computeBotInput(w, bot, 0, persona()).buttons.a2).toBe(false);
  });
});

// ===========================================================================
// dangerAvoidance: a boss zone the bot is clear of (loop's not-inside arm, L359)
// ===========================================================================

describe('bot: distant boss zone', () => {
  it('a boss-side damaging zone the bot is well clear of does not trigger a flee (line 359)', () => {
    const w = mkWorld(['ranger']);
    const bot = w.players[0];
    bot.pos = { x: 800, y: 500 };
    armRangerDangerProbe(bot); // only Roll (a3) is ready => a3 <=> "the bot is fleeing"
    // The zone passes the side/damage guard but sits far away: len(away) > margin.
    w.groundZones = [bossZone({ x: 200, y: 200 })];
    const cmd = computeBotInput(w, bot, 0, persona());
    expect(cmd.buttons.a3).toBe(false); // out of the zone -> not in danger
  });
});

// ===========================================================================
// pickBotUpgrades: weightedPick's last-element fallback (line 154)
// ===========================================================================

describe('bot: weightedPick fallthrough', () => {
  it('takes the last-pool fallback when the roll overshoots the weight sum (line 154)', () => {
    // weightedPick returns as soon as its running roll crosses 0. An rng whose
    // range() overshoots the total keeps the roll positive, so the loop runs to the
    // end and returns pool[last]. A real seeded Rng (range ∈ [0,total)) can't reach
    // it, so we drive it with an rng stand-in (as the suite already does elsewhere).
    const overshoot = { range: (): number => 1e9, next: (): number => 0 } as unknown as Rng;
    const pick = pickBotUpgrades('knight', persona(), [], [], overshoot);
    expect(pick.generic).not.toBeNull(); // still a real generic boon id
    expect(UPGRADE_IDS).toContain(pick.generic);
  });
});
