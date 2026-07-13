/**
 * Chaos Forge — data-driven BOT casting (docs/CHAOS_FORGE.md §8). When Forge is
 * live, bots reason over each ability's COMPONENTS (a generic capability policy
 * over every slot incl. sub1/sub2) instead of the per-classId positional
 * heuristics. Canonical runs keep the hand-tuned switch (covered by bot*.test.ts).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { classifyForBot, computeBotInput } from '../src/engine/ai/bot';
import { recompose, type AbilityComponents } from '../src/engine/content/forge';
import { setForgeSeed } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { CLASSES } from '../src/engine/content/classes';
import { World } from '../src/engine/world/world';
import type { ClassId, GroundZone, Vec2 } from '../src/engine/core/types';

afterEach(() => {
  setForgeSeed(null);
  setProceduralSeed(null);
});

function synth(comp: AbilityComponents, cooldown = 8): ReturnType<typeof recompose> {
  return recompose(comp, { slot: 'a1', name: 'x', cooldown });
}

/** A World with Forge active (so the generic bot policy engages). */
function forgeWorld(classes: ClassId[], seed = 5): World {
  setForgeSeed(seed);
  const w = new World({
    monsterId: 'dragon',
    seed,
    players: classes.map((c, i) => ({ peerId: `bot:${i + 1}`, name: `B${i}`, classId: c })),
  });
  w.terrain = [];
  w.obstacles = [];
  w.groundZones = [];
  return w;
}

/** A boss-side damaging zone under `pos` → dangerAvoidance flags the bot inDanger. */
function bossZone(w: World, pos: Vec2): GroundZone {
  const z: GroundZone = {
    id: w.allocId(),
    kind: 'voidZone',
    pos: { ...pos },
    radius: 120,
    side: 'boss',
    ownerId: w.boss!.id,
    damagePerTick: 10,
    healPerTick: 0,
    slowMult: 1,
    slowDuration: 0,
    duration: 5,
    remaining: 5,
    tickAccum: 0,
  };
  w.groundZones.push(z);
  return z;
}

describe('classifyForBot — from components', () => {
  const role = (c: AbilityComponents): string => classifyForBot(synth(c)).role;

  it('reads the recombined payload for its role', () => {
    expect(role({ delivery: { kind: 'heal' }, effects: [{ kind: 'heal', amount: 40 }] })).toBe('heal');
    expect(
      role({ delivery: { kind: 'groundZone' }, effects: [{ kind: 'zone', zone: { zoneKind: 'sanctuary', radius: 100, duration: 4, allyBuff: { defMult: 0.8, duration: 4 } } }] }),
    ).toBe('allyBuff');
    expect(
      role({ delivery: { kind: 'groundZone' }, effects: [{ kind: 'zone', zone: { zoneKind: 'sanctuary', radius: 100, duration: 4, tickHeal: 8 } }] }),
    ).toBe('allyBuff');
    expect(
      role({ delivery: { kind: 'selfBuff' }, effects: [{ kind: 'buff', target: 'self', defMult: 0.6, duration: 4 }] }),
    ).toBe('selfDefense');
    expect(role({ delivery: { kind: 'taunt' }, effects: [] })).toBe('selfDefense');
    expect(role({ delivery: { kind: 'dash', range: 200 }, effects: [] })).toBe('mobility');
    expect(role({ delivery: { kind: 'blink', range: 200 }, effects: [] })).toBe('mobility');
    expect(
      role({ delivery: { kind: 'projectile' }, effects: [{ kind: 'stun', seconds: 0.8 }] }),
    ).toBe('control');
    expect(
      role({ delivery: { kind: 'meleeCone', range: 80 }, effects: [{ kind: 'damage', amount: 20 }] }),
    ).toBe('offensiveMelee');
    expect(
      role({ delivery: { kind: 'projectile' }, effects: [{ kind: 'damage', amount: 20 }] }),
    ).toBe('offensiveRanged');
  });

  it('flags a rooted cast', () => {
    const cap = classifyForBot(synth({ delivery: { kind: 'projectile', castTime: 0.7 }, effects: [{ kind: 'damage', amount: 60 }] }));
    expect(cap.rooted).toBe(true);
  });
});

describe('classifyForBot — from flat canonical fields', () => {
  it('classifies authored abilities with no component list', () => {
    expect(classifyForBot(CLASSES.knight.abilities.basic).role).toBe('offensiveMelee');
    expect(classifyForBot(CLASSES.ranger.abilities.basic).role).toBe('offensiveRanged');
    expect(classifyForBot(CLASSES.cleric.abilities.a1).role).toBe('heal'); // Heal
    expect(classifyForBot(CLASSES.cleric.abilities.a3).role).toBe('allyBuff'); // Blessing
    expect(classifyForBot(CLASSES.knight.abilities.a2).role).toBe('selfDefense'); // Shield Wall
    expect(classifyForBot(CLASSES.ranger.abilities.a3).role).toBe('mobility'); // Roll
    // A control ability with no damage (only canonical-shaped via a flat def).
    expect(
      classifyForBot({ slot: 'a1', name: 'Snare', kind: 'groundZone', cooldown: 8, damage: 0, roots: true }).role,
    ).toBe('control');
  });
});

describe('decideAbilitiesForged — casting policy', () => {
  it('fires an offensive ability at a boss in range', () => {
    const w = forgeWorld(['ranger']);
    const bot = w.players[0];
    bot.pos = { x: 500, y: 500 };
    w.boss!.pos = { x: 560, y: 500 };
    bot.abilities!.a1 = synth({ delivery: { kind: 'projectile' }, effects: [{ kind: 'damage', amount: 30 }] });
    const cmd = computeBotInput(w, bot, w.tick);
    expect(cmd.buttons.a1).toBe(true);
  });

  it('holds fire with no target (no boss, no adds)', () => {
    const w = forgeWorld(['ranger']);
    const bot = w.players[0];
    w.boss = null; // no boss → distBoss Infinity, hasTarget false
    bot.abilities!.a1 = synth({ delivery: { kind: 'projectile' }, effects: [{ kind: 'damage', amount: 30 }] });
    const cmd = computeBotInput(w, bot, w.tick);
    expect(cmd.buttons.a1).toBe(false); // nothing to shoot at
  });

  it('heals only when an ally is wounded', () => {
    const w = forgeWorld(['cleric', 'knight']);
    const [bot, ally] = w.players;
    bot.pos = { x: 500, y: 500 };
    ally.pos = { x: 520, y: 500 };
    w.boss!.pos = { x: 560, y: 500 };
    bot.abilities!.a1 = synth({ delivery: { kind: 'heal' }, effects: [{ kind: 'heal', amount: 40 }] });
    // Healthy band → no heal.
    expect(computeBotInput(w, bot, w.tick).buttons.a1).toBe(false);
    // Wounded ally → heal fires.
    ally.hp = ally.maxHp * 0.3;
    expect(computeBotInput(w, bot, w.tick).buttons.a1).toBe(true);
  });

  it('pops a self-defense buff when low on HP', () => {
    const w = forgeWorld(['knight']);
    const bot = w.players[0];
    w.boss!.pos = { x: 560, y: 500 };
    bot.pos = { x: 500, y: 500 };
    bot.abilities!.a1 = synth({ delivery: { kind: 'selfBuff' }, effects: [{ kind: 'buff', target: 'self', defMult: 0.5, duration: 4 }] });
    expect(computeBotInput(w, bot, w.tick).buttons.a1).toBe(false); // healthy
    bot.hp = bot.maxHp * 0.2;
    expect(computeBotInput(w, bot, w.tick).buttons.a1).toBe(true);
  });

  it('escapes with mobility in danger, but will not root itself mid-dodge', () => {
    const w = forgeWorld(['mage']);
    const bot = w.players[0];
    bot.pos = { x: 500, y: 500 };
    w.boss!.pos = { x: 900, y: 500 };
    bossZone(w, bot.pos); // stand in a hazard → inDanger
    bot.abilities!.a1 = synth({ delivery: { kind: 'blink', range: 250 }, effects: [] }); // mobility
    bot.abilities!.a2 = synth({ delivery: { kind: 'projectile', castTime: 0.7 }, effects: [{ kind: 'damage', amount: 60 }] }); // rooted ranged
    const cmd = computeBotInput(w, bot, w.tick);
    expect(cmd.buttons.a1).toBe(true); // dashes to safety
    expect(cmd.buttons.a2).toBe(false); // won't commit to a rooted cast while fleeing
  });

  it('fires control and ally-buff abilities while engaged', () => {
    const w = forgeWorld(['druid']);
    const bot = w.players[0];
    bot.pos = { x: 500, y: 500 };
    w.boss!.pos = { x: 560, y: 500 };
    bot.abilities!.a1 = synth({ delivery: { kind: 'projectile' }, effects: [{ kind: 'stun', seconds: 0.8 }] }); // control
    bot.abilities!.a2 = synth({ delivery: { kind: 'buffAlly', range: 400 }, effects: [{ kind: 'buff', target: 'allies', dmgMult: 1.2, duration: 5 }] });
    const cmd = computeBotInput(w, bot, w.tick);
    expect(cmd.buttons.a1).toBe(true);
    expect(cmd.buttons.a2).toBe(true);
  });

  it('buffs the band off-target when someone is wounded', () => {
    const w = forgeWorld(['cleric', 'knight']);
    const [bot, ally] = w.players;
    w.boss = null; // no target at all
    ally.hp = ally.maxHp * 0.3;
    bot.abilities!.a1 = synth({ delivery: { kind: 'buffAlly', range: 400 }, effects: [{ kind: 'buff', target: 'allies', dmgMult: 1.2, duration: 5 }] });
    expect(computeBotInput(w, bot, w.tick).buttons.a1).toBe(true); // fires via a wounded ally
  });

  it('casts subclass slots, respects cooldowns/edges, and skips empty slots', () => {
    const w = forgeWorld(['ranger']);
    const bot = w.players[0];
    bot.pos = { x: 500, y: 500 };
    w.boss!.pos = { x: 560, y: 500 };
    const shot = () => synth({ delivery: { kind: 'projectile' }, effects: [{ kind: 'damage', amount: 20 }] });
    // Only sub1 bound; sub2 empty (skipped). cd.sub1 left undefined → `?? 0` = ready.
    bot.subAbilities = { sub1: shot() };
    const cmd = computeBotInput(w, bot, w.tick);
    expect(cmd.buttons.sub1).toBe(true);
    expect(cmd.buttons.sub2 ?? false).toBe(false); // empty slot → never fires
    // Bind sub2 too and fire it (covers the sub2 edge path).
    bot.subAbilities.sub2 = shot();
    bot.prevButtons = { ...bot.prevButtons, sub2: false };
    expect(computeBotInput(w, bot, w.tick).buttons.sub2).toBe(true);
    // sub1 on cooldown → held off.
    bot.cooldowns.sub1 = 3;
    bot.prevButtons = { ...bot.prevButtons, sub1: false };
    expect(computeBotInput(w, bot, w.tick).buttons.sub1).toBe(false);
  });
});

describe('a forged bot band fights', () => {
  it('clears health off a synthesized boss with synthesized kits', () => {
    const w = forgeWorld(['knight', 'ranger', 'cleric', 'mage'], 88);
    const startHp = w.boss!.hp;
    for (let t = 0; t < 400 && !w.finished; t++) {
      const inputs = new Map(w.players.map((p) => [p.peerId, computeBotInput(w, p, w.tick)]));
      w.step(0.05, inputs);
      for (const p of w.players) expect(Number.isFinite(p.hp)).toBe(true);
    }
    expect(w.boss!.hp).toBeLessThan(startHp); // the band dealt damage with fused kits
  });
});
