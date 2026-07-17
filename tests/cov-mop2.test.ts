/**
 * Coverage mop-up 2 — reachable branches on the new-mechanic paths that the main
 * suites don't drive: the forge patchEffect NO-flat-field branches (a rider component
 * kept as-is), a buffAlly flight rider, an on-add forced shove, a rooting zone landing
 * a root on an add, and a sub-slot press with nothing bound. Behaviour-asserting.
 */
import { describe, it, expect } from 'vitest';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { World } from '../src/engine/world/world';
import { refreshComponents, recompose } from '../src/engine/content/forge';
import { isRooted } from '../src/engine/combat/combat';
import { SIM_DT } from '../src/engine/core/constants';
import type { Vec2, Add, InputCommand, ClassId } from '../src/engine/core/types';
import { ADD_HP, ADD_MOVE_SPEED, ADD_RADIUS } from '../src/engine/core/constants';

const ZERO: Vec2 = { x: 0, y: 0 };
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
function solo(cls: ClassId): World {
  return new World({
    monsterId: 'dragon',
    seed: 1,
    players: [{ peerId: 'a', name: 'A', classId: cls }],
  });
}
function input(over: Partial<InputCommand['buttons']>): InputCommand {
  return {
    seq: 1,
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    buttons: { basic: false, a1: false, a2: false, a3: false, revive: false, ...over },
  };
}

describe('forge patchEffect keeps a rider when the flat field is absent (item 2)', () => {
  it('refreshComponents leaves castSlow/flight/shove/crit components untouched with no flat field', () => {
    const def = recompose(
      {
        delivery: { kind: 'meleeCone', range: 70, halfAngleDeg: 45 },
        effects: [
          { kind: 'damage', amount: 30 },
          { kind: 'castSlow', mult: 1.3, duration: 3 },
          { kind: 'flight', duration: 5 },
          { kind: 'shove', distance: 120, pull: false },
          { kind: 'shove', distance: 120, pull: true },
          { kind: 'crit', chance: 0.2, mult: 0.3 },
        ],
      },
      { slot: 'a1', name: 'Fused', cooldown: 7 },
    );
    // Strip every rider's flat field — patchEffect must return each rider unchanged
    // (the `: e` branch) rather than reading an absent field.
    delete def.castSlow;
    delete def.castSlowDuration;
    delete def.grantsFlight;
    delete def.knockback;
    delete def.pull;
    delete def.critChanceBonus;
    delete def.critMultBonus;
    const comp = refreshComponents(def);
    const cs = comp.effects.find((e) => e.kind === 'castSlow');
    expect(cs && cs.kind === 'castSlow' && cs.mult).toBeCloseTo(1.3, 5); // unchanged
    const fl = comp.effects.find((e) => e.kind === 'flight');
    expect(fl && fl.kind === 'flight' && fl.duration).toBeCloseTo(5, 5);
    expect(comp.effects.filter((e) => e.kind === 'shove')).toHaveLength(2); // both kept
    const cr = comp.effects.find((e) => e.kind === 'crit');
    expect(cr && cr.kind === 'crit' && cr.chance).toBeCloseTo(0.2, 5);
  });
});

describe('forge patchEffect keeps a component secondary when only the primary is retuned', () => {
  it('a retuned castSlow / crit keeps the component duration / chance (the `?? e` fallback)', () => {
    const def = recompose(
      {
        delivery: { kind: 'meleeCone', range: 70, halfAngleDeg: 45 },
        effects: [
          { kind: 'damage', amount: 30 },
          { kind: 'castSlow', mult: 1.3, duration: 3 },
          { kind: 'crit', chance: 0.2, mult: 0.3 },
        ],
      },
      { slot: 'a1', name: 'Fused', cooldown: 7 },
    );
    def.castSlow = 1.5;
    delete def.castSlowDuration; // → patchEffect falls back to the component's duration
    def.critMultBonus = 0.6;
    delete def.critChanceBonus; // → patchEffect falls back to the component's chance
    const comp = refreshComponents(def);
    const cs = comp.effects.find((e) => e.kind === 'castSlow');
    expect(cs && cs.kind === 'castSlow' && cs.mult).toBeCloseTo(1.5, 5); // primary retuned
    expect(cs && cs.kind === 'castSlow' && cs.duration).toBeCloseTo(3, 5); // secondary kept
    const cr = comp.effects.find((e) => e.kind === 'crit');
    expect(cr && cr.kind === 'crit' && cr.mult).toBeCloseTo(0.6, 5); // primary retuned
    expect(cr && cr.kind === 'crit' && cr.chance).toBeCloseTo(0.2, 5); // secondary kept
  });
});

describe('canonical buffAlly grantsFlight (item 7)', () => {
  it('a rallying buff with grantsFlight lifts its target airborne', () => {
    const w = solo('cleric');
    const p = w.players[0];
    const a3 = p.abilities!.a3;
    expect(a3.kind).toBe('buffAlly'); // Blessing
    a3.grantsFlight = 5; // graft flight onto the rally
    resolvePlayerAbility(w, p, 'a3', ZERO);
    // Solo → the rally target is the caster; it takes flight.
    expect(p.buffs.some((b) => b.kind === 'flight')).toBe(true);
  });
});

describe('forced shove lands on an add (item 11)', () => {
  it('a knockback strike pushes a struck add away from the caster', () => {
    const w = solo('knight');
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    p.aim = { x: 1, y: 0 };
    w.boss!.pos = { x: 100, y: 100 }; // out of the way
    const add = mkAdd(w, { x: 545, y: 500 }); // inside the basic's cone
    const basic = p.abilities!.basic;
    basic.knockback = 200;
    const x0 = add.pos.x;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(add.pos.x).toBeGreaterThan(x0); // shoved further along +x (away from caster)
  });
});

describe('a rooting zone roots an add (item 9)', () => {
  it('Entangle immobilises an add standing in it', () => {
    const w = solo('druid');
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    p.aim = { x: 1, y: 0 };
    w.boss!.pos = { x: 50, y: 50 };
    resolvePlayerAbility(w, p, 'a1', ZERO); // Entangle (groundZone, roots)
    expect(w.groundZones.length).toBeGreaterThan(0);
    const z = w.groundZones[0];
    const add = mkAdd(w, { ...z.pos }); // drop the add at the zone centre
    // Hold the add at the zone centre while it arms + ticks (its AI would otherwise
    // drift it out); step past the arm window and a couple of tick intervals.
    for (let t = 0; t < 80 && !isRooted(add); t++) {
      add.pos = { ...z.pos };
      w.step(SIM_DT, new Map());
    }
    expect(isRooted(add)).toBe(true); // the zone's root landed on the add
  });
});

describe('a sub slot with nothing bound is inert (item 15)', () => {
  it('pressing sub1 with no subskill does nothing', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }], // no subSkills
    });
    const p = w.players[0];
    w.step(SIM_DT, new Map([['a', input({ sub1: true })]]));
    expect(p.cooldowns.sub1 ?? 0).toBe(0); // no bound skill → nothing fired
  });
});
