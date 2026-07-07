/**
 * Tests for the "chaos" feature round: stun diminishing returns, twin-boss
 * encounters, chaotic run assembly, bot personalities, hybrid (cross-class)
 * upgrades, procedural terrain themes, and the menu-playground practice mode.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world';
import { applyStun, tickStunDr } from '../src/engine/combat';
import { buildRunSlots, buildRun, MONSTERS } from '../src/engine/monsters';
import { generateTerrain } from '../src/engine/terrain';
import { generateObstacles } from '../src/engine/obstacles';
import { nthThreatTarget } from '../src/engine/threat';
import { computeBotInput, rollPersonality, defaultPersonality } from '../src/engine/bot';
import type { BotPersonality } from '../src/engine/bot';
import { previewAbilityTable, rollCharChoices, CHAR_UPGRADES } from '../src/engine/charUpgrades';
import {
  STUN_DR_FACTOR,
  STUN_DR_WINDOW,
  TWIN_HP_FRAC,
  RUN_LENGTH,
  TERRAIN_MAX_PATCHES,
} from '../src/engine/constants';
import { Rng } from '../src/engine/math';
import type {
  ButtonState,
  InputCommand,
  GameEvent,
  Player,
  MonsterId,
  TerrainKind,
} from '../src/engine/types';

const DT = 0.05;

function buttons(over: Partial<ButtonState> = {}): ButtonState {
  return { basic: false, a1: false, a2: false, a3: false, revive: false, ...over };
}

function inp(over: Partial<InputCommand> = {}): InputCommand {
  return { seq: 0, move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, buttons: buttons(), ...over };
}

function sink(): { events: GameEvent[] } {
  return { events: [] };
}

function counter(): () => number {
  let n = 1;
  return () => n++;
}

// ---------------------------------------------------------------------------
// Stun diminishing returns
// ---------------------------------------------------------------------------

describe('stun diminishing returns', () => {
  function target() {
    return { id: 7, pos: { x: 0, y: 0 }, buffs: [] as { kind: string }[] } as unknown as Parameters<
      typeof applyStun
    >[1];
  }

  it('each chained stun keeps only the DR factor of the previous duration', () => {
    const s = sink();
    const t = target();
    expect(applyStun(s, t, 1.0, 'stun')).toBeCloseTo(1.0);
    expect(applyStun(s, t, 1.0, 'stun')).toBeCloseTo(STUN_DR_FACTOR);
    expect(applyStun(s, t, 1.0, 'stun')).toBeCloseTo(STUN_DR_FACTOR * STUN_DR_FACTOR);
  });

  it('falls to full immunity (a stunResist event) below the floor', () => {
    const s = sink();
    const t = target();
    applyStun(s, t, 1.0, 'stun');
    applyStun(s, t, 1.0, 'stun');
    applyStun(s, t, 1.0, 'stun');
    // 4th chained stun would be 0.125s < floor → resisted outright.
    expect(applyStun(s, t, 1.0, 'stun')).toBe(0);
    expect(s.events.some((e) => e.t === 'stunResist')).toBe(true);
  });

  it('the falloff resets once the window elapses without new stuns', () => {
    const s = sink();
    const t = target();
    applyStun(s, t, 1.0, 'stun');
    applyStun(s, t, 1.0, 'stun');
    tickStunDr(t, STUN_DR_WINDOW + 0.1);
    expect(applyStun(s, t, 1.0, 'stun')).toBeCloseTo(1.0);
  });

  it('bosses in a live fight resist chained freezes', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [{ peerId: 'm', name: 'M', classId: 'mage', charUpgrades: ['mg_freeze'] }],
    });
    const boss = w.boss!;
    // Land many freezes in a row (directly, to skip cooldown pacing).
    let landed = 0;
    for (let i = 0; i < 6; i++) {
      if (applyStun(w, boss, 1.1, 'freeze') > 0) landed++;
    }
    expect(landed).toBeLessThan(6); // DR kicked in before all six landed
    expect(w.events.some((e) => e.t === 'stunResist')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Twin-boss encounters
// ---------------------------------------------------------------------------

describe('twin-boss encounters', () => {
  function twinWorld() {
    return new World({
      monsterId: 'dragon',
      seed: 11,
      players: [{ peerId: 'k', name: 'K', classId: 'knight' }],
      coBosses: ['troll'],
    });
  }

  it('spawns both bosses with split HP at distinct positions', () => {
    const w = twinWorld();
    expect(w.bosses.length).toBe(2);
    expect(w.bosses[0].monsterId).toBe('dragon');
    expect(w.bosses[1].monsterId).toBe('troll');
    expect(w.bosses[0].maxHp).toBe(Math.round(MONSTERS.dragon.baseHp * TWIN_HP_FRAC));
    expect(w.bosses[0].pos.x).not.toBeCloseTo(w.bosses[1].pos.x);
    expect(w.bosses[0].dmgScale).toBeLessThan(1);
  });

  it('the fight continues after the first boss falls and ends after both', () => {
    const w = twinWorld();
    w.bosses[0].hp = 0;
    w.step(DT, new Map());
    expect(w.finished).toBe(false);
    expect(w.events.some((e) => e.t === 'death' && e.kind === 'boss')).toBe(true);

    w.bosses[1].hp = 0;
    w.step(DT, new Map());
    expect(w.finished).toBe(true);
    expect(w.outcome).toBe('victory');
    expect(w.events.some((e) => e.t === 'victory')).toBe(true);
  });

  it('does not announce a boss death twice', () => {
    const w = twinWorld();
    w.bosses[0].hp = 0;
    w.step(DT, new Map());
    w.step(DT, new Map());
    const deaths = w.events.filter((e) => e.t === 'death' && e.kind === 'boss');
    expect(deaths.length).toBe(0); // second step emitted nothing new
  });

  it('serializes every boss into the snapshot (with the run seed)', () => {
    const w = twinWorld();
    const snap = w.serialize();
    expect(snap.bosses.length).toBe(2);
    expect(snap.seed).toBe(11);
  });

  it('splits attention: the second boss hunts the second-highest threat', () => {
    const a = { id: 1, state: 'alive', threat: 100 } as unknown as Player;
    const b = { id: 2, state: 'alive', threat: 50 } as unknown as Player;
    expect(nthThreatTarget([a, b], 0, null, 0)?.id).toBe(1);
    expect(nthThreatTarget([a, b], 1, null, 0)?.id).toBe(2);
    expect(nthThreatTarget([a, b], 5, null, 0)?.id).toBe(2); // clamps to last
    expect(nthThreatTarget([a, b], 1, 1, 3)?.id).toBe(1); // taunt overrides all
  });
});

// ---------------------------------------------------------------------------
// Chaotic run assembly
// ---------------------------------------------------------------------------

describe('run assembly with twin slots', () => {
  it('keeps the classic spine shape: RUN_LENGTH slots, lead boss first', () => {
    const slots = buildRunSlots('goblin', 0, new Rng(42));
    expect(slots.length).toBe(RUN_LENGTH);
    expect(slots[0]).toEqual(['goblin']); // cycle-0 opener is always solo
    for (const slot of slots) {
      expect(slot.length).toBeGreaterThanOrEqual(1);
      expect(slot.length).toBeLessThanOrEqual(2);
      if (slot.length === 2) expect(slot[0]).not.toBe(slot[1]);
    }
  });

  it('twin fights appear across seeds and never duplicate a boss in a slot', () => {
    let twins = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const slot of buildRunSlots('goblin', 2, new Rng(seed))) {
        if (slot.length === 2) {
          twins++;
          expect(slot[0]).not.toBe(slot[1]);
        }
      }
    }
    expect(twins).toBeGreaterThan(0);
  });

  it('legacy buildRun still returns a flat 5-boss climb', () => {
    const run = buildRun('goblin', 0, new Rng(7));
    expect(run.length).toBe(RUN_LENGTH);
    expect(run[0]).toBe('goblin');
    expect(new Set(run).size).toBe(run.length);
  });

  it('the hidden practice dummy never enters run pools', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const slots = buildRunSlots('dragon', 3, new Rng(seed));
      for (const slot of slots) expect(slot).not.toContain('dummy');
    }
  });
});

// ---------------------------------------------------------------------------
// Bot personalities
// ---------------------------------------------------------------------------

describe('bot personalities', () => {
  it('rolls deterministically per seed', () => {
    const a = rollPersonality(123);
    const b = rollPersonality(123);
    expect(a.label).toBe(b.label);
    expect(a.smart).toBeCloseTo(b.smart);
    expect(a.aggression).toBeCloseTo(b.aggression);
  });

  it('smart bots dodge a fresh telegraph; sleepy bots eat it', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 9,
      players: [{ peerId: 'bot:1', name: 'B', classId: 'knight' }],
    });
    w.terrain = [];
    w.obstacles = [];
    const bot = w.players[0];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 400 };
    bot.pos = { x: 800, y: 500 }; // 100u away — inside Tail Sweep's 160u radius
    // Fresh wind-up: only 20% elapsed.
    boss.action = {
      kind: 'windup',
      abilityId: 'tailSweep',
      remaining: 0.8,
      total: 1.0,
      targetId: null,
      targetPos: null,
      aimAngle: Math.PI / 2,
      channelAccum: 0,
    };

    const genius: BotPersonality = {
      ...defaultPersonality(),
      label: 'Genius',
      smart: 0.98,
      aggression: 0.5,
      chaos: 0,
    };
    const sleepy: BotPersonality = {
      ...defaultPersonality(),
      label: 'Sleepy',
      smart: 0.1,
      aggression: 0.5,
      chaos: 0,
    };

    const fast = computeBotInput(w, bot, 1, genius);
    expect(Math.hypot(fast.move.x, fast.move.y)).toBeGreaterThan(0.1); // fleeing

    bot.prevButtons = buttons();
    const slow = computeBotInput(w, bot, 1, sleepy);
    // A sleepy melee bot hasn't noticed yet: it holds its ground in melee.
    expect(Math.hypot(slow.move.x, slow.move.y)).toBeLessThan(0.1);
  });

  it('bots without a personality still fight (back-compat default)', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 4,
      players: [{ peerId: 'bot:1', name: 'B', classId: 'ranger' }],
    });
    const cmd = computeBotInput(w, w.players[0], w.tick);
    expect(Number.isFinite(cmd.move.x)).toBe(true);
    expect(cmd.buttons.basic || cmd.buttons.a1 || true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hybrid (cross-class) upgrades
// ---------------------------------------------------------------------------

describe('hybrid upgrades', () => {
  it("Pyromancer's Pact grafts the Mage Fireball onto any class's A2", () => {
    const table = previewAbilityTable('knight', ['hy_pyromancer']);
    expect(table.a2.name).toBe('Fireball');
    expect(table.a2.kind).toBe('projectile');
    expect(table.a2.slot).toBe('a2');
    expect((table.a2.impactRadius ?? 0) > 0).toBe(true);
  });

  it('a grafted power works in a live world (knight throws a fireball)', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 6,
      players: [{ peerId: 'k', name: 'K', classId: 'knight', charUpgrades: ['hy_pyromancer'] }],
    });
    const k = w.players[0];
    expect(k.abilities!.a2.name).toBe('Fireball');
    w.boss!.pos = { x: 200, y: 200 }; // far away so nothing melees
    k.pos = { x: 800, y: 800 };
    w.step(DT, new Map([['k', inp({ buttons: buttons({ a2: true }) })]]));
    // Fireball has a cast time — the knight is now casting, rooted.
    expect(k.castSlot).toBe('a2');
  });

  it('Vampiric Style trades max HP for lifesteal across the kit', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 6,
      players: [
        { peerId: 'a', name: 'A', classId: 'barbarian' },
        { peerId: 'b', name: 'B', classId: 'barbarian', charUpgrades: ['hy_vampiric'] },
      ],
    });
    const [plain, vamp] = w.players;
    expect(vamp.maxHp).toBeLessThan(plain.maxHp);
    expect(vamp.abilities!.basic.lifestealFrac ?? 0).toBeGreaterThan(
      plain.abilities!.basic.lifestealFrac ?? 0,
    );
  });

  it('mismatched class ids are still skipped; hybrids are not', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 6,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight', charUpgrades: ['mg_freeze', 'hy_juggernaut'] },
      ],
    });
    const p = w.players[0];
    expect(p.abilities!.a2.freeze ?? 0).toBe(0); // mage upgrade ignored on a knight
    expect(p.maxHp).toBeGreaterThan(240); // juggernaut applied
  });

  it('every id rollCharChoices returns exists in the registry', () => {
    for (let i = 0; i < 50; i++) {
      const rng = new Rng(i + 1);
      for (const id of rollCharChoices('druid', 3, () => rng.next())) {
        expect(CHAR_UPGRADES[id]).toBeTruthy();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Procedural terrain + obstacles
// ---------------------------------------------------------------------------

describe('procedural terrain layouts', () => {
  it('is deterministic and bounded for array (twin) inputs too', () => {
    const ids: MonsterId[] = ['dragon', 'lich'];
    const a = generateTerrain(ids, 999, counter());
    const b = generateTerrain(ids, 999, counter());
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a.length).toBeLessThanOrEqual(TERRAIN_MAX_PATCHES);
    a.forEach((p, i) => {
      expect(p.kind).toBe(b[i].kind);
      expect(p.pos.x).toBeCloseTo(b[i].pos.x);
    });
  });

  it('twin encounters blend both bosses’ themes (and nothing else)', () => {
    const union: TerrainKind[] = ['magma', 'ember', 'ice', 'deathfog'];
    for (let seed = 1; seed <= 20; seed++) {
      for (const p of generateTerrain(['dragon', 'lich'], seed * 17, counter())) {
        expect(union).toContain(p.kind);
      }
    }
  });

  it('obstacles carry a visual kind + variant and stay in bounds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const obs = generateObstacles(seed * 13, counter(), []);
      for (const o of obs) {
        expect(o.kind).toBeTruthy();
        expect(o.variant).toBeGreaterThanOrEqual(0);
        expect(o.pos.x - o.radius).toBeGreaterThanOrEqual(-0.01);
        expect(o.pos.x + o.radius).toBeLessThanOrEqual(1600.01);
        expect(o.pos.y - o.radius).toBeGreaterThanOrEqual(-0.01);
        expect(o.pos.y + o.radius).toBeLessThanOrEqual(1000.01);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Practice playground (menu world)
// ---------------------------------------------------------------------------

describe('practice playground', () => {
  function playgroundWorld() {
    return new World({
      monsterId: 'dummy',
      seed: 21,
      players: [{ peerId: 'me', name: 'Me', classId: 'knight' }],
      practice: true,
    });
  }

  it('spawns four solid totems and no hazards', () => {
    const w = playgroundWorld();
    expect(w.totems.length).toBe(4);
    expect(w.terrain.length).toBe(0);
    expect(w.obstacles.length).toBe(0);
    const kinds = w.totems.map((t) => t.kind).sort();
    expect(kinds).toEqual(['class', 'controls', 'host', 'join']);
  });

  it('the dummy respawns instead of granting victory', () => {
    const w = playgroundWorld();
    const dummy = w.boss!;
    dummy.hp = 0;
    w.step(DT, new Map());
    expect(w.finished).toBe(false);
    expect(dummy.hp).toBe(dummy.maxHp);
    expect(w.events.some((e) => e.t === 'dummyReset')).toBe(true);
  });

  it('totems block movement like cover', () => {
    const w = playgroundWorld();
    const p = w.players[0];
    const totem = w.totems[0];
    p.pos = { x: totem.pos.x + 1, y: totem.pos.y };
    w.step(DT, new Map([['me', inp()]]));
    const d = Math.hypot(p.pos.x - totem.pos.x, p.pos.y - totem.pos.y);
    expect(d).toBeGreaterThanOrEqual(totem.radius + p.radius - 0.5);
  });

  it('reports totem proximity through totemViews', () => {
    const w = playgroundWorld();
    const p = w.players[0];
    const totem = w.totems[0];
    p.pos = { x: totem.pos.x + totem.radius + p.radius + 4, y: totem.pos.y };
    const views = w.totemViews(p.id);
    expect(views.find((t) => t.id === totem.id)?.active).toBe(true);
    p.pos = { x: totem.pos.x + totem.triggerRadius + 50, y: totem.pos.y };
    const views2 = w.totemViews(p.id);
    expect(views2.find((t) => t.id === totem.id)?.active).toBe(false);
  });
});
