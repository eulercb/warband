import { CLASSES, type PlayerAbilityDef } from '../src/engine/content/classes';
import { describe, it, expect } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility, spawnZone } from '../src/engine/combat/abilities';
import { getSubSkill, ALL_SUBCLASSES } from '../src/engine/content/subclasses';
import { decompose, recompose } from '../src/engine/content/forge';
import { buffCues, zoneSupportKinds } from '../src/engine/combat/visualCues';
import {
  drawSupportSymbol,
  drawAuraField,
  drawBubble,
  supportStateKind,
} from '../src/render/pipeline/supportVisuals';
import { Fx } from '../src/render/overlays/fx';
import { Camera } from '../src/render/pipeline/camera';
import type { BuffView, SupportCueKind } from '../src/engine/core/types';
const kinds: SupportCueKind[] = ['heal', 'empower', 'protect', 'haste', 'absorb'];
function setup() {
  const w = new World({
    monsterId: 'dragon',
    seed: 5,
    players: [
      { peerId: 'a', name: 'A', classId: 'cleric' },
      { peerId: 'b', name: 'B', classId: 'knight' },
      { peerId: 'c', name: 'C', classId: 'ranger' },
    ],
  });
  w.players.forEach((p, i) => {
    p.pos = { x: 600 + i * 30, y: 400 };
    p.hp = p.maxHp;
  });
  return w;
}
const cues = (w: World) => w.events.filter((e) => e.t === 'support');
describe('actual support recipients, independent of the active class color', () => {
  it('marks only the healed ally and distinguishes blessing recipients from healing', () => {
    const w = setup(),
      [p, a, b] = w.players;
    a.hp = 10;
    b.hp = b.maxHp - 10;
    resolvePlayerAbility(w, p, 'a1', { x: 0, y: 0 });
    expect(cues(w).map((e) => [e.kind, e.targetId])).toEqual([['heal', a.id]]);
    const cue = cues(w)[0];
    p.pos.x += 50;
    a.pos.x += 10;
    expect(cue.from.x).toBe(600);
    expect(cue.pos.x).toBe(630);
    expect(w.events.some((e) => e.t === 'skillArea' && e.area.reach)).toBe(true);
    w.events = [];
    resolvePlayerAbility(w, p, 'a3', { x: 0, y: 0 });
    expect(cues(w).map((e) => e.kind)).toContain('empower');
    expect(cues(w).every((e) => e.kind !== 'heal')).toBe(true);
  });
  it.each(['cl_light_warding', 'cl_life_preserve'])(
    'direct bubble %s identifies only actual recipients, not failed refreshes',
    (id) => {
      const w = setup(),
        p = w.players[0];
      w.players[1].hp = 10;
      const skill = getSubSkill(id);
      expect(skill).toBeTruthy();
      p.subAbilities = { sub1: { ...skill!.ability, slot: 'sub1' } };
      resolvePlayerAbility(w, p, 'sub1', { x: 0, y: 0 });
      const expected = w.players
        .filter((a) => a.buffs.some((b) => b.kind === 'absorption'))
        .map((a) => a.id);
      expect(
        cues(w)
          .filter((e) => e.kind === 'absorb')
          .map((e) => e.targetId),
      ).toEqual(expected);
      w.events = [];
      resolvePlayerAbility(w, p, 'sub1', { x: 0, y: 0 });
      expect(cues(w).filter((e) => e.kind === 'absorb')).toEqual([]);
    },
  );
  it('full-health and out-of-range healing never claims a receipt; composed buffs mark every real recipient', () => {
    const w = setup(),
      p = w.players[0];
    resolvePlayerAbility(w, p, 'a1', { x: 0, y: 0 });
    expect(cues(w)).toEqual([]);
    w.players[1].hp = 10;
    w.players[1].pos.x = 1300;
    resolvePlayerAbility(w, p, 'a1', { x: 0, y: 0 });
    expect(cues(w)).toEqual([]);
    const ab = p.abilities!.a3;
    p.abilities!.a3 = recompose(decompose(ab), ab);
    w.events = [];
    resolvePlayerAbility(w, p, 'a3', { x: 0, y: 0 });
    const targets = new Set(
      cues(w)
        .filter((e) => e.kind === 'empower')
        .map((e) => e.targetId),
    );
    expect(targets).toEqual(new Set([p.id, w.players[2].id]));
  });
  it('supports self, flight, speed and mixed buff feedback without empty effects', () => {
    const w = setup(),
      p = w.players[0];
    buffCues(w, p, p, {});
    expect(cues(w)).toEqual([]);
    buffCues(w, p, p, { grantsFlight: 3 });
    expect(cues(w).map((e) => e.kind)).toEqual(['haste']);
    w.events = [];
    buffCues(w, p, w.players[1], { buffDefMult: 0.7, buffDamageMult: 1.2, buffMoveMult: 1.2 });
    expect(cues(w).map((e) => e.kind)).toEqual(['empower', 'protect', 'haste']);
  });
  it('serializes zone meaning from real mixed payloads, never class or color guesses', () => {
    const w = setup();
    spawnZone(w, {
      kind: 'sanctuary',
      pos: { x: 600, y: 400 },
      radius: 100,
      duration: 5,
      side: 'player',
      ownerId: w.players[0].id,
      damagePerTick: 0,
      healPerTick: 10,
      overflowShield: true,
      allyBuff: { defMult: 0.8, dmgMult: 1.2, moveMult: 1.1, duration: 1 },
    });
    const z = w.groundZones[0];
    expect(zoneSupportKinds(z)).toEqual(['heal', 'absorb', 'protect', 'empower', 'haste']);
    expect(w.serialize().groundZones[0].supportKinds).toEqual(zoneSupportKinds(z));
    expect(zoneSupportKinds({ ...z, side: 'boss' })).toEqual([]);
    expect(
      zoneSupportKinds({ ...z, healPerTick: 0, overflowShield: false, allyBuff: undefined }),
    ).toEqual([]);
    expect(
      zoneSupportKinds({ ...z, healPerTick: 0, overflowShield: false, allyBuff: { duration: 1 } }),
    ).toEqual([]);
  });
});
const instructions = (g: Graphics) =>
  (g.context as unknown as { instructions: unknown[] }).instructions;
describe('bounded, color-independent rendering', () => {
  it('uses different geometry for all five meanings and all three aura roles', () => {
    const marks = kinds.map((kind) => {
      const g = new Graphics();
      drawSupportSymbol(g, kind, 100, 100, 8, 1);
      return JSON.stringify(
        (
          g.context.instructions as unknown as {
            action: string;
            data: { path: { instructions: unknown[] } };
          }[]
        ).map((i) => ({ action: i.action, path: i.data.path.instructions })),
      );
    });
    expect(new Set(marks).size).toBe(5);
    for (const kind of ['bulwark', 'pursuit', 'renewal'] as const)
      for (const local of [true, false]) {
        const g = new Graphics();
        drawAuraField(g, { kind, radius: 220, remaining: 5 }, 100, 100, 0.5, local, 1);
        expect(instructions(g).length).toBeGreaterThan(6);
      }
    const g = new Graphics();
    drawBubble(g, 100, 100, 10, 1);
    expect(instructions(g).length).toBeGreaterThan(2);
  });
  it('only shows live positive support states, including aura recipients', () => {
    const b = (kind: BuffView['kind'], mult = 1.2, remaining = 2) => ({ kind, mult, remaining });
    expect(
      [
        b('auraRenewal'),
        b('auraStrike'),
        b('auraBulwark'),
        b('damageDealt'),
        b('damageTaken', 0.8),
        b('moveSpeed'),
      ].map(supportStateKind),
    ).toEqual(['heal', 'empower', 'protect', 'empower', 'protect', 'haste']);
    for (const buff of [
      b('stun'),
      b('damageDealt', 0.8),
      b('damageTaken', 1.2),
      b('moveSpeed', 0.8),
      b('auraStrike', 1.2, 0),
    ])
      expect(supportStateKind(buff)).toBeNull();
  });
  it('caps simultaneous receipt cues and removes their geometry after expiry', () => {
    const fx = new Fx(new Container()),
      camera = new Camera(1600, 1000),
      g = new Graphics();
    const events = Array.from({ length: 100 }, (_, i) => ({
      t: 'support' as const,
      kind: kinds[i % 5],
      sourceId: 1,
      targetId: i + 2,
      from: { x: 700, y: 500 },
      pos: { x: 800, y: 500 },
    }));
    fx.processEvents(events, camera);
    fx.draw(g, camera);
    const peak = instructions(g).length;
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(300);
    fx.update(300);
    fx.draw(g, camera);
    expect(instructions(g).length).toBeLessThan(peak);
    fx.update(500);
    fx.draw(g, camera);
    expect(instructions(g)).toHaveLength(0);
  });
});

const catalogue = [
  ...Object.values(CLASSES).flatMap((c) => Object.values(c.abilities)),
  ...ALL_SUBCLASSES.flatMap((s) => s.skills.map((k) => ({ ...k.ability, slot: 'a1' as const }))),
].filter((a) => ['heal', 'selfBuff', 'buffAlly'].includes(a.kind));
it.each(catalogue.map((a) => [a.name, a] as const))(
  'authored and composed %s share truthful support feedback',
  (_, original) => {
    for (const composed of [false, true]) {
      const w = setup(),
        p = w.players[0];
      w.players.forEach((a) => {
        a.hp = 10;
      });
      const ab: PlayerAbilityDef = { ...original, slot: 'a1' };
      p.abilities!.a1 = composed ? recompose(decompose(ab), ab) : ab;
      resolvePlayerAbility(w, p, 'a1', { x: 0, y: 0 });
      const actual = cues(w).map((e) => e.kind);
      if (ab.kind === 'heal') expect(actual).toContain('heal');
      if (ab.buffDamageMult) expect(actual).toContain('empower');
      if (ab.buffDefMult) expect(actual).toContain('protect');
      if (ab.buffMoveMult || ab.grantsFlight) expect(actual).toContain('haste');
      if (ab.absorption) expect(actual).toContain('absorb');
      expect(
        cues(w).every((e) => w.players.some((a) => a.id === e.targetId && a.state === 'alive')),
      ).toBe(true);
    }
  },
);
