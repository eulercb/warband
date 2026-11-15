import { afterEach, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolveBossAbility } from '../src/engine/combat/abilities';
import { getMonster } from '../src/engine/content/monsters';
import {
  fontAvailable,
  fontRecoveryView,
  reserveFont,
  fontCanSaveWipe,
} from '../src/engine/combat/revivalFont';
import { revivalFont } from '../src/engine/content/fontRules';
import { describeAbility } from '../src/engine/content/classes';
import { grandEligible } from '../src/engine/content/grandSelections';
import { getClass } from '../src/engine/content/classes';
import { previewSubAbility } from '../src/engine/content/charUpgrades';
import { applyCharUpgrades } from '../src/engine/content/charUpgrades';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  synthesizeAbility,
  setForgeSeed,
} from '../src/engine/content/forge';
import type { ExtSlot, InputCommand, Player } from '../src/engine/core/types';
const zero = { x: 0, y: 0 },
  right = { x: 1, y: 0 };
const picks = ['cl_life_bloom', 'cl_life_mend', 'cl_life_preserve', 'cl_life_smite'];
afterEach(() => setForgeSeed(null));
function setup(pick = picks[0], mods = ['cl_life_g_a'], party = 1, hardcore = false) {
  const w = new World({
    hardcore,
    seed: 31,
    monsterId: 'troll',
    players: Array.from({ length: party }, (_, i) => ({
      peerId: String(i),
      name: `Life ${i}`,
      classId: 'cleric' as const,
      subSkills: [pick],
      charUpgrades: mods,
      extraClasses: ['mage' as const],
    })),
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = right;
  p.critChance = 0;
  b.pos = { x: 1000, y: 700 };
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  b.hp = b.maxHp = 10000;
  for (const ally of w.players.slice(1)) ally.pos = { x: 520, y: 400 };
  return { w, p, b };
}
function step(w: World, slot?: ExtSlot, dt = 0.01, revive = false, peer = '0') {
  const buttons: InputCommand['buttons'] = {
    basic: false,
    a1: false,
    a2: false,
    a3: false,
    revive,
  };
  if (slot) buttons[slot] = true;
  w.step(dt, new Map([[peer, { seq: w.tick, move: zero, aim: right, buttons, autofire: false }]]));
}
function down(w: World, target: Player) {
  const b = w.boss!,
    ab = getMonster('troll').abilities.find((a) => a.id === 'groundSlam')!;
  b.pos = { ...target.pos };
  b.dmgScale = 10;
  resolveBossAbility(w, b, ab, {
    kind: 'windup',
    abilityId: ab.id,
    remaining: 0,
    total: ab.windup,
    targetId: target.id,
    targetPos: { ...target.pos },
    aimAngle: 0,
    channelAccum: 0,
  });
  b.pos = { x: 1000, y: 700 };
}
function finishRescue(w: World, p: Player) {
  for (let i = 0; i < 350 && p.state === 'downed' && !w.finished; i++) step(w);
}
it.each(picks)('every first pick %s can prepare a solo rescue at full health', (pick) => {
  const { w, p } = setup(pick);
  const hp = p.maxHp;
  step(w, 'a2');
  const z = w.groundZones[0];
  expect(fontAvailable(w, z)).toBe(true);
  expect(w.serialize().groundZones[0].revivalFont).toBe(true);
  expect(p.hp).toBe(hp);
  down(w, p);
  step(w);
  expect(p.state).toBe('downed');
  expect(w.finished).toBe(false);
  expect(w.fontSpent.has(p.id)).toBe(true);
  expect(w.groundZones.includes(z)).toBe(false);
  expect(fontRecoveryView(w, p)).toBeDefined();
  for (let i = 0; i < 280; i++) step(w);
  expect(p.state).toBe('downed');
  finishRescue(w, p);
  expect(p.state).toBe('alive');
  expect(p.hp).toBeCloseTo(hp * 0.4);
  expect(p.stats.revives).toBe(1);
  expect(w.fontRescues).toHaveLength(0);
  expect(w.finished).toBe(false);
});
it('a claimed font can finish after the consumed healing field would have expired', () => {
  const { w, p } = setup();
  step(w, 'a2');
  for (let i = 0; i < 385; i++) step(w);
  expect(w.groundZones[0].remaining).toBeLessThan(0.2);
  down(w, p);
  step(w);
  finishRescue(w, p);
  expect(p.state).toBe('alive');
});
it('without the identity the same solo downing ends the encounter', () => {
  const { w, p } = setup(picks[0], []);
  step(w, 'a2');
  down(w, p);
  step(w);
  expect(w.outcome).toBe('defeat');
});
it('Sanctuary and Bloom share one attempt across fields and class swaps', () => {
  const { w, p } = setup();
  step(w, 'a2');
  step(w, 'sub1');
  expect(w.groundZones).toHaveLength(2);
  down(w, p);
  step(w);
  expect(w.fontRescues).toHaveLength(1);
  finishRescue(w, p);
  w.setActiveClass(p, 'mage');
  w.setActiveClass(p, 'cleric');
  p.cooldowns.a2 = 0;
  step(w, 'a2');
  expect(w.groundZones.every((z) => !fontAvailable(w, z))).toBe(true);
  down(w, p);
  step(w);
  expect(w.outcome).toBe('defeat');
});
it('shared revive stock is spent once on completion, never bypassed at zero', () => {
  const { w, p } = setup();
  w.reviveBudget = 1;
  step(w, 'a2');
  down(w, p);
  step(w);
  expect(w.reviveBudget).toBe(1);
  finishRescue(w, p);
  expect(w.reviveBudget).toBe(0);
  const other = setup();
  other.w.reviveBudget = 0;
  step(other.w, 'a2');
  down(other.w, other.p);
  step(other.w);
  expect(other.w.fontSpent.size).toBe(0);
  expect(other.w.outcome).toBe('defeat');
});
it('a nearby manual reviver helps through the existing bounded co-revive rate', () => {
  const { w, p } = setup(picks[1], ['cl_life_g_a'], 2),
    ally = w.players[1];
  ally.pos = { x: 900, y: 700 };
  step(w, 'a2');
  down(w, p);
  step(w);
  ally.pos = { x: 520, y: 400 };
  let elapsed = 0;
  while (p.state === 'downed' && elapsed < 3) {
    step(w, undefined, 0.01, true, '1');
    elapsed += 0.01;
  }
  expect(elapsed).toBeGreaterThanOrEqual(1.5);
  expect(elapsed).toBeLessThan(1.8);
  expect(p.state).toBe('alive');
});
it.each(['leave', 'class', 'source', 'disconnect', 'stock', 'death'])(
  'pending rescue cancels on %s and does not refund the attempt',
  (mode) => {
    const { w, p } = setup(picks[1], ['cl_life_g_a'], 2),
      ally = w.players[1];
    ally.pos = { x: 900, y: 700 };
    step(w, 'a2');
    down(w, p);
    step(w);
    expect(w.fontRescues).toHaveLength(1);
    if (mode === 'leave') p.pos = { x: 900, y: 700 };
    if (mode === 'class') w.setActiveClass(p, 'mage');
    if (mode === 'source') p.abilities!.a2 = { ...p.abilities!.a2 };
    if (mode === 'disconnect') w.removePlayerByPeer(p.peerId);
    if (mode === 'stock') w.reviveBudget = 0;
    if (mode === 'death') p.state = 'dead';
    step(w);
    expect(w.fontRescues).toHaveLength(0);
    expect(w.fontSpent.has(p.id)).toBe(true);
  },
);
it('a target too near bleedout cannot postpone an otherwise inevitable solo wipe', () => {
  const { w, p } = setup();
  step(w, 'a2');
  p.state = 'downed';
  p.hp = 0;
  p.downedTimer = 0.5;
  step(w);
  expect(w.outcome).toBe('defeat');
});
it('normal Phoenix recovery takes precedence and leaves the font charge unused', () => {
  const { w, p } = setup();
  p.selfRevives = 1;
  step(w, 'a2');
  down(w, p);
  step(w);
  expect(p.state).toBe('alive');
  expect(w.fontSpent.has(p.id)).toBe(false);
});
it('copied and actually synthesized fonts keep the priced encounter limit without Life passive', () => {
  const { w, p } = setup();
  const native = p.abilities!.a2,
    comp = decompose(native);
  expect(
    componentValue(comp) -
      componentValue({ ...comp, effects: comp.effects.filter((e) => e.kind !== 'revivalFont') }),
  ).toBe(48);
  let made;
  for (let seed = 0; seed < 128 && !made; seed++) {
    const a = synthesizeAbility(
      seed,
      'font',
      'a2',
      ['Font', 'Grove', 'Sanctuary'].map((name) => ({
        name,
        classId: 'cleric' as const,
        className: 'Cleric',
        slot: 'a2',
        def: native,
      })),
      new Set(['groundZone']),
    ).def;
    if (revivalFont(a)) made = a;
  }
  if (!made) throw Error('Actual synthesis lost healing font');
  w.setActiveClass(p, 'mage');
  p.abilities!.a2 = made;
  p.cooldowns.a2 = 0;
  step(w, 'a2');
  expect(fontAvailable(w, w.groundZones[0])).toBe(true);
  down(w, p);
  step(w);
  finishRescue(w, p);
  expect(p.state).toBe('alive');
  expect(describeAbility(made)).toContain('one rescue attempt');
  expect(refreshComponents(made).effects.some((e) => e.kind === 'revivalFont')).toBe(true);
  for (const invalid of [
    { ...comp, delivery: { kind: 'projectile' as const } },
    { ...comp, effects: comp.effects.filter((e) => e.kind !== 'zone') },
  ]) {
    const bad = recompose(invalid, { slot: 'a2', name: 'Invalid', cooldown: 8 });
    expect(revivalFont(bad)).toBe(false);
    expect(describeAbility(bad)).not.toContain('rescue attempt');
  }
});
it('earning Font on an existing composed healing field refreshes its paid component', () => {
  const { w, p } = setup(picks[0], []);
  p.abilities!.a2 = recompose(decompose(p.abilities!.a2), {
    slot: 'a2',
    name: 'Composed',
    cooldown: 14,
  });
  applyCharUpgrades(p, ['cl_life_g_a']);
  expect(p.abilities!.a2.components!.effects.some((e) => e.kind === 'revivalFont')).toBe(true);
  step(w, 'a2');
  expect(fontAvailable(w, w.groundZones[0])).toBe(true);
});

it('Forge grand eligibility requires an actual healing-ground receiver and retains other identity options', () => {
  for (const seed of [1, 7, 29])
    for (const pick of picks) {
      setForgeSeed(seed);
      const ctx = { classes: ['cleric' as const], history: [], subSkills: [pick] };
      const candidates = [
        ...Object.values(getClass('cleric').abilities),
        previewSubAbility(pick, [])!,
      ];
      const possible = candidates.some(
        (ab) => ab.slot !== 'basic' && ab.kind === 'groundZone' && (ab.zoneTickHeal ?? 0) > 0,
      );
      expect(grandEligible('cl_life_g_a', 'cleric', ctx)).toBe(possible);
      expect(grandEligible('cl_life_g_b', 'cleric', ctx)).toBe(true);
    }
});

it('one remaining revive stock cannot be claimed by two simultaneous fonts', () => {
  const { w, p } = setup(picks[0], ['cl_life_g_a'], 2),
    ally = w.players[1];
  ally.pos = { x: 900, y: 700 };
  w.reviveBudget = 1;
  step(w, 'a2');
  step(w, 'a2', 0.01, false, '1');
  down(w, p);
  down(w, ally);
  step(w);
  expect(w.fontRescues).toHaveLength(1);
  expect(w.fontSpent.size).toBe(1);
  expect(w.finished).toBe(false);
  for (let i = 0; i < 310; i++) step(w);
  expect(w.reviveBudget).toBe(0);
  expect(w.players.filter((p) => p.state === 'alive')).toHaveLength(1);
});
it('an expired or outside field offers no solo wipe protection', () => {
  for (const mode of ['outside', 'expired']) {
    const { w, p } = setup();
    step(w, 'a2');
    if (mode === 'outside') p.pos = { x: 900, y: 700 };
    else for (let i = 0; i < 410; i++) step(w);
    down(w, p);
    step(w);
    expect(w.outcome).toBe('defeat');
    expect(w.fontSpent.size).toBe(0);
  }
});
it('hardcore deadline activation cancels the channel instead of extending a terminal wipe', () => {
  const { w, p } = setup(picks[0], ['cl_life_g_a'], 1, true);
  step(w, 'a2');
  down(w, p);
  step(w);
  expect(w.finished).toBe(false);
  w.hardcoreDeadline = w.elapsed + 0.005;
  step(w);
  expect(w.deadlineActive).toBe(true);
  expect(w.outcome).toBe('defeat');
  expect(fontRecoveryView(w, p)).toBeUndefined();
});
it('normal victory and explicit forfeit override an active rescue', () => {
  for (const mode of ['victory', 'forfeit']) {
    const { w, p, b } = setup();
    step(w, 'a2');
    down(w, p);
    step(w);
    if (mode === 'victory') {
      b.hp = 0;
      step(w);
    } else w.forceFinish('defeat');
    expect(w.finished).toBe(true);
    expect(w.outcome).toBe(mode === 'victory' ? 'victory' : 'defeat');
    expect(fontRecoveryView(w, p)).toBeUndefined();
  }
});
it('a valid existing manual channel can finish with font help without a second revive charge', () => {
  const { w, p } = setup(picks[1], ['cl_life_g_a'], 2),
    ally = w.players[1];
  ally.pos = { x: 900, y: 700 };
  step(w, 'a2');
  down(w, p);
  step(w);
  w.reviveBudget = 1;
  ally.pos = { x: 520, y: 400 };
  for (let i = 0; i < 180 && p.state === 'downed'; i++) step(w, undefined, 0.01, true, '1');
  expect(p.state).toBe('alive');
  expect(w.reviveBudget).toBe(0);
  expect(ally.stats.revives).toBe(1);
});
it('heals and their recovery groves are not free font carriers', () => {
  const { w, p } = setup();
  p.hp -= 40;
  step(w, 'a1');
  expect(w.groundZones).toHaveLength(0);
  expect(w.fontSpent.size).toBe(0);
  expect(p.abilities!.a1.recoveryZone).toBeUndefined();
});

it('the living caster can act while the font tends a fallen ally', () => {
  const { w, p } = setup(picks[1], ['cl_life_g_a'], 2),
    ally = w.players[1];
  step(w, 'a2');
  p.pos = { x: 900, y: 700 };
  down(w, ally);
  step(w);
  expect(w.fontRescues[0].targetId).toBe(ally.id);
  expect(p.state).toBe('alive');
  step(w, 'a3');
  expect(p.cooldowns.a3).toBeGreaterThan(0);
  expect(ally.reviveProgress).toBeGreaterThan(0);
  finishRescue(w, ally);
  expect(ally.state).toBe('alive');
  expect(p.stats.revives).toBe(1);
});

it('flat stale flags cannot advertise a font without its retained healing-ground contract', () => {
  const { p } = setup();
  const native = p.abilities!.a2,
    comp = decompose(native);
  expect(
    revivalFont({
      ...native,
      components: { ...comp, effects: comp.effects.filter((e) => e.kind !== 'zone') },
    }),
  ).toBe(false);
  expect(
    revivalFont({ ...native, components: { ...comp, delivery: { kind: 'projectile' } } }),
  ).toBe(false);
});

it('publishes a claimed footprint and progress, then removes both after recovery', () => {
  const { w, p } = setup();
  step(w, 'a2');
  down(w, p);
  step(w);
  const snapshot = w.serialize();
  expect(snapshot.fontRescues).toEqual([
    { ownerId: p.id, targetId: p.id, pos: w.fontRescues[0].pos, radius: w.fontRescues[0].radius },
  ]);
  expect(snapshot.players[0].fontRecovery).toBeDefined();
  step(w, undefined, 0.1);
  expect(w.serialize().players[0].fontRecovery!.progress).toBeGreaterThan(0);
  finishRescue(w, p);
  expect(w.serialize().fontRescues).toEqual([]);
  expect(w.serialize().players[0].fontRecovery).toBeUndefined();
});

it('the oldest downed body gets the only available rescue, with stable ID ties', () => {
  for (const tied of [false, true]) {
    const { w, p } = setup(picks[0], ['cl_life_g_a'], 4);
    w.players[3].pos = { x: 900, y: 700 };
    step(w, 'a2');
    for (const target of w.players.slice(0, 3)) {
      target.state = 'downed';
      target.hp = 0;
      target.downedTimer = 10;
    }
    if (!tied) w.players[2].downedTimer = 8;
    step(w);
    expect(w.fontRescues[0].targetId).toBe(tied ? p.id : w.players[2].id);
  }
});

it('a composed font requires a positive retained zone heal, not just a stale flat heal', () => {
  const { p } = setup();
  const native = p.abilities!.a2;
  const comp = decompose(native);
  for (const tickHeal of [0, undefined]) {
    expect(
      revivalFont({
        ...native,
        components: {
          ...comp,
          effects: comp.effects.map((e) =>
            e.kind === 'zone' ? { ...e, zone: { ...e.zone, tickHeal } } : e,
          ),
        },
      }),
    ).toBe(false);
  }
});

it('an unbound healing field cannot reserve an owner source', () => {
  const { w, p } = setup(picks[1]);
  expect(reserveFont(w, p, { ...p.abilities!.a2, slot: 'sub2' })).toBeUndefined();
});

it('a stale claimed rescue cannot hold defeat open after its body leaves', () => {
  const { w, p } = setup();
  step(w, 'a2');
  down(w, p);
  step(w);
  expect(fontCanSaveWipe(w)).toBe(true);
  p.pos = { x: 900, y: 700 };
  expect(fontCanSaveWipe(w)).toBe(false);
});
