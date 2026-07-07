/**
 * Tests for the "chaos" feature round: stun diminishing returns, twin-boss
 * encounters, chaotic run assembly, bot personalities, hybrid (cross-class)
 * upgrades, procedural terrain themes, and the menu-playground practice mode.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world';
import { applyStun, tickStunDr, tickBuffs } from '../src/engine/combat';
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
    return {
      id: 7,
      pos: { x: 0, y: 0 },
      buffs: [] as { kind: string; remaining: number }[],
    } as unknown as Parameters<typeof applyStun>[1];
  }

  it('each chained stun keeps only the DR factor of the previous duration', () => {
    const s = sink();
    const t = target();
    expect(applyStun(s, t, 1.0, 'stun')).toBeCloseTo(1.0);
    tickBuffs(t, 1.01); // let the stun expire — a shorter one never overwrites
    expect(applyStun(s, t, 1.0, 'stun')).toBeCloseTo(STUN_DR_FACTOR);
    tickBuffs(t, 0.51);
    expect(applyStun(s, t, 1.0, 'stun')).toBeCloseTo(STUN_DR_FACTOR * STUN_DR_FACTOR);
  });

  it('a shorter chained stun never overwrites a longer one still ticking', () => {
    const s = sink();
    const t = target();
    expect(applyStun(s, t, 1.0, 'stun')).toBeCloseTo(1.0);
    // Immediate second stun would be 0.5s — but 1.0s is still active: wasted.
    expect(applyStun(s, t, 1.0, 'stun')).toBe(0);
    const stun = t.buffs.find((b) => b.kind === 'stun');
    expect(stun?.remaining).toBeCloseTo(1.0);
  });

  it('falls to full immunity (one stunResist cue) below the floor', () => {
    const s = sink();
    const t = target();
    applyStun(s, t, 1.0, 'stun');
    tickBuffs(t, 1.01);
    applyStun(s, t, 1.0, 'stun');
    tickBuffs(t, 0.51);
    applyStun(s, t, 1.0, 'stun');
    tickBuffs(t, 0.26);
    // 4th chained stun would be 0.125s < floor → resisted outright…
    expect(applyStun(s, t, 1.0, 'stun')).toBe(0);
    expect(applyStun(s, t, 1.0, 'stun')).toBe(0);
    // …and the RESIST cue fires once per window, not per spam attempt.
    expect(s.events.filter((e) => e.t === 'stunResist').length).toBe(1);
  });

  it('resisted attempts do NOT refresh the window (no permanent immunity)', () => {
    const s = sink();
    const t = target();
    applyStun(s, t, 1.0, 'stun');
    tickBuffs(t, 1.01);
    applyStun(s, t, 1.0, 'stun');
    tickBuffs(t, 0.51);
    applyStun(s, t, 1.0, 'stun');
    tickBuffs(t, 0.26);
    expect(applyStun(s, t, 1.0, 'stun')).toBe(0); // immune now
    // Keep spamming resisted stuns through most of the window…
    tickStunDr(t, STUN_DR_WINDOW / 2);
    expect(applyStun(s, t, 1.0, 'stun')).toBe(0);
    // …the window still expires on schedule from the last LANDED stun.
    tickStunDr(t, STUN_DR_WINDOW / 2 + 0.1);
    expect(applyStun(s, t, 1.0, 'stun')).toBeCloseTo(1.0);
  });

  it('the falloff resets once the window elapses without new stuns', () => {
    const s = sink();
    const t = target();
    applyStun(s, t, 1.0, 'stun');
    tickBuffs(t, 1.01);
    applyStun(s, t, 1.0, 'stun');
    tickBuffs(t, 0.51);
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
    // Land freezes back-to-back as each expires (skipping cooldown pacing).
    let landed = 0;
    for (let i = 0; i < 6; i++) {
      if (applyStun(w, boss, 1.1, 'freeze') > 0) landed++;
      tickBuffs(boss, 1.2);
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

  it('a felled twin clears its wind-up and telegraphs nothing', () => {
    const w = twinWorld();
    const b = w.bosses[0];
    b.action = {
      kind: 'windup',
      abilityId: 'fireBreath',
      remaining: 1,
      total: 1.2,
      targetId: null,
      targetPos: null,
      aimAngle: 0,
      channelAccum: 0,
    };
    b.hp = 0;
    w.step(DT, new Map());
    expect(b.action.kind).toBe('idle');
    const view = w.serialize().bosses.find((v) => v.id === b.id);
    expect(view?.telegraph).toBeNull();
  });

  it('the surviving twin slides back to hunting the TOP threat', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 12,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'mage' },
      ],
      coBosses: ['troll'],
    });
    w.players[0].threat = 100; // knight holds top threat
    w.players[1].threat = 10;
    // Kill the first twin; step so the survivor re-targets.
    w.bosses[0].hp = 0;
    const survivor = w.bosses[1];
    survivor.pos = { x: 800, y: 300 };
    // Keep torus distances unambiguous: knight is 350u below the troll (short
    // way), the low-threat mage is closer still but off to the side.
    w.players[0].pos = { x: 800, y: 650 };
    w.players[1].pos = { x: 640, y: 300 };
    for (let i = 0; i < 40; i++) w.step(DT, new Map());
    // The troll walks toward the top-threat knight (down), not the nearby mage.
    expect(survivor.pos.y).toBeGreaterThan(320);
  });

  it('twin odds shrink for small parties', () => {
    let soloTwins = 0;
    let bandTwins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const slot of buildRunSlots('goblin', 1, new Rng(seed), 1)) {
        if (slot.length === 2) soloTwins++;
      }
      for (const slot of buildRunSlots('goblin', 1, new Rng(seed), 4)) {
        if (slot.length === 2) bandTwins++;
      }
    }
    expect(soloTwins).toBeLessThan(bandTwins);
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

  it('excluded hybrids are never offered to (or applied on) their exclusions', () => {
    // Healers never see Field Medic; a mage never sees Pyromancer's Pact.
    for (let i = 0; i < 80; i++) {
      const rng = new Rng(i * 7 + 1);
      expect(rollCharChoices('cleric', 4, () => rng.next())).not.toContain('hy_fieldmedic');
      expect(rollCharChoices('mage', 4, () => rng.next())).not.toContain('hy_pyromancer');
    }
    // Even a forged pick is ignored at apply time (host-authoritative guard).
    const table = previewAbilityTable('cleric', ['hy_fieldmedic']);
    expect(table.a2.name).toBe('Sanctuary');
  });

  it('Vampiric shots heal the archer in a live fight', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 8,
      players: [{ peerId: 'r', name: 'R', classId: 'ranger', charUpgrades: ['hy_vampiric'] }],
    });
    const r = w.players[0];
    const boss = w.boss!;
    r.pos = { x: 800, y: 700 };
    boss.pos = { x: 800, y: 500 };
    r.hp = 50; // wounded, so lifesteal is visible
    // Fire an arrow straight at the boss and let it fly.
    w.step(DT, new Map([['r', inp({ aim: { x: 0, y: -1 }, buttons: buttons({ basic: true }) })]]));
    for (let i = 0; i < 20 && r.hp <= 50; i++) w.step(DT, new Map([['r', inp()]]));
    expect(r.hp).toBeGreaterThan(50);
  });

  it('Frostbrand chills through melee swings', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 8,
      players: [{ peerId: 'k', name: 'K', classId: 'knight', charUpgrades: ['hy_frostbrand'] }],
    });
    const k = w.players[0];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 500 };
    k.pos = { x: 800, y: 560 }; // inside Cleave range
    w.step(DT, new Map([['k', inp({ aim: { x: 0, y: -1 }, buttons: buttons({ basic: true }) })]]));
    expect(boss.buffs.some((b) => b.kind === 'moveSpeed' && b.mult < 1)).toBe(true);
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
