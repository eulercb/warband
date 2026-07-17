/**
 * Coverage — composed-ability EXECUTOR branches added by items 7–13: flight riders
 * lifting the caster / allies (item 7), a composed heal reaching a wounded ally, and
 * the add-miss / zone-absent branches of the strike + groundZone deliveries. Drives
 * hand-built synthesized abilities through a real World (see forge-exec.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { World } from '../src/engine/world/world';
import { makeBuff, applyBuff } from '../src/engine/combat/combat';
import { recompose, type AbilityComponents } from '../src/engine/content/forge';
import type { Player, ClassId, Vec2, Add } from '../src/engine/core/types';
import { ADD_HP, ADD_MOVE_SPEED, ADD_RADIUS } from '../src/engine/core/constants';

function synth(comp: AbilityComponents, cooldown = 8): ReturnType<typeof recompose> {
  return recompose(comp, { slot: 'a1', name: 'Test Fusion', cooldown });
}
function duo(caster: ClassId = 'knight', ally: ClassId = 'ranger'): World {
  const w = new World({
    monsterId: 'dragon',
    seed: 1,
    players: [
      { peerId: 'a', name: 'A', classId: caster },
      { peerId: 'b', name: 'B', classId: ally },
    ],
  });
  w.terrain = [];
  w.obstacles = [];
  w.groundZones = [];
  return w;
}
function mkAdd(w: World, pos: Vec2): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { ...pos },
    hp: ADD_HP,
    maxHp: ADD_HP,
    moveSpeed: ADD_MOVE_SPEED,
    radius: ADD_RADIUS,
    targetId: null,
    attackCd: 0,
    buffs: [],
  };
  w.adds.push(a);
  return a;
}
const RIGHT: Vec2 = { x: 1, y: 0 };
const ZERO: Vec2 = { x: 0, y: 0 };
const kinds = (p: Player): string[] => p.buffs.map((b) => b.kind);

describe('composed executor — flight riders (item 7)', () => {
  it('a selfBuff flight rider lifts the caster airborne', () => {
    const w = duo();
    const p = w.players[0];
    p.abilities!.a1 = synth({
      delivery: { kind: 'selfBuff' },
      effects: [{ kind: 'flight', duration: 5 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(kinds(p)).toContain('flight');
  });

  it('a buffAlly flight rider lifts allies in range (even without a rally buff)', () => {
    const w = duo('cleric', 'knight');
    const [p, ally] = w.players;
    p.pos = { x: 500, y: 500 };
    ally.pos = { x: 520, y: 500 }; // within buffAlly range
    p.abilities!.a1 = synth({
      delivery: { kind: 'buffAlly', range: 400 },
      effects: [{ kind: 'flight', duration: 6 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(kinds(p)).toContain('flight'); // caster counts as an ally
    expect(kinds(ally)).toContain('flight');
  });
});

describe('composed executor — heal delivery reaches a wounded ally (item forge)', () => {
  it('a heal-delivery heal effect mends the lowest-hp ally in range', () => {
    const w = duo('cleric', 'knight');
    const [p, ally] = w.players;
    p.pos = { x: 500, y: 500 };
    ally.pos = { x: 540, y: 500 };
    ally.hp = ally.maxHp - 60;
    p.abilities!.a1 = synth({
      delivery: { kind: 'heal', range: 400 },
      effects: [{ kind: 'heal', amount: 40 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(ally.hp).toBeGreaterThan(ally.maxHp - 60); // healed
  });
});

describe('composed executor — strike + zone miss branches', () => {
  it('meleeCone: an add OUTSIDE the cone is not struck', () => {
    const w = duo();
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    p.aim = { ...RIGHT }; // cone faces +x
    w.boss!.pos = { x: 100, y: 100 }; // boss out of the way
    const behind = mkAdd(w, { x: 440, y: 500 }); // behind the caster → out of the +x cone
    p.abilities!.a1 = synth({
      delivery: { kind: 'meleeCone', range: 80, halfAngleDeg: 30 },
      effects: [{ kind: 'damage', amount: 25 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(behind.hp).toBe(ADD_HP); // untouched (the add-miss branch)
  });

  it('pbaoe: an add OUTSIDE the radius is not struck', () => {
    const w = duo();
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    w.boss!.pos = { x: 100, y: 100 };
    const far = mkAdd(w, { x: 900, y: 500 }); // way outside a 120u burst
    p.abilities!.a1 = synth({
      delivery: { kind: 'pbaoe', radius: 120 },
      effects: [{ kind: 'damage', amount: 25 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(far.hp).toBe(ADD_HP);
  });

  it('groundZone: a composed zone with no zone effect spawns nothing (self-buff only)', () => {
    const w = duo();
    const p = w.players[0];
    p.abilities!.a1 = synth({
      delivery: { kind: 'groundZone', range: 460 },
      effects: [{ kind: 'buff', target: 'self', dmgMult: 1.2, duration: 4 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.groundZones.length).toBe(0); // no zone effect → nothing armed
    expect(kinds(p)).toContain('damageDealt'); // but the self-buff still fired
  });
});

describe('composed executor — mobility deliveries carry their self riders', () => {
  it('a composed blink teleports, grants i-frames, heals on use and self-buffs', () => {
    const w = duo();
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    p.hp = p.maxHp - 40;
    const x0 = p.pos.x;
    p.abilities!.a1 = synth({
      delivery: { kind: 'blink', range: 200, iframes: 0.3 },
      effects: [
        { kind: 'healOnUse', amount: 20 },
        { kind: 'buff', target: 'self', dmgMult: 1.2, duration: 4 },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.pos.x).toBeGreaterThan(x0); // teleported forward
    expect(kinds(p)).toContain('invuln'); // i-frames on the blink
    expect(kinds(p)).toContain('damageDealt'); // self-buff
    expect(p.hp).toBeGreaterThan(p.maxHp - 40); // healed on use
  });

  it('a composed dash starts a glide and self-buffs', () => {
    const w = duo();
    const p = w.players[0];
    p.aim = { ...RIGHT };
    p.abilities!.a1 = synth({
      delivery: { kind: 'dash', range: 200, iframes: 0.3 },
      effects: [{ kind: 'buff', target: 'self', moveMult: 1.2, duration: 4 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(kinds(p)).toContain('moveSpeed'); // self-buff fired on the dash
  });

  it('a rooted caster cannot blink (the root locks the teleport)', () => {
    const w = duo();
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    applyBuff(p, makeBuff('root', 0, 5, 'test'));
    const x0 = p.pos.x;
    p.abilities!.a1 = synth({
      delivery: { kind: 'blink', range: 200, iframes: 0.3 },
      effects: [{ kind: 'buff', target: 'self', dmgMult: 1.2, duration: 4 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.pos.x).toBe(x0); // rooted → no teleport
  });
});
