import { Graphics } from 'pixi.js';
import {
  drawDefenseState,
  drawSilenceMarker,
  silenceAnchor,
} from '../src/render/pipeline/defenseVisuals';
import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolveBossAbility, beamTick } from '../src/engine/combat/abilities';
import { blockBossPulse } from '../src/engine/combat/projectedGuard';
import { grantFrontGuard } from '../src/engine/combat/defense';
import { applyBuff, makeBuff, tickBuffs } from '../src/engine/combat/combat';
import { silenceStatus } from '../src/engine/core/silenceStatus';
import { MONSTERS, type BossAbilityDef } from '../src/engine/content/monsters';
import type { ExtSlot, Player } from '../src/engine/core/types';
function setup() {
  const w = new World({
    seed: 31,
    monsterId: 'dragon',
    players: [
      {
        peerId: 'a',
        name: 'Knight',
        classId: 'knight',
        charUpgrades: ['kn_champion_g_a'],
        subSkills: ['kn_champion_slam'],
      },
      { peerId: 'b', name: 'Ally', classId: 'mage' },
      { peerId: 'c', name: 'Other', classId: 'ranger' },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const [p, ally, other] = w.players,
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  ally.pos = { x: 450, y: 420 };
  other.pos = { x: 450, y: 380 };
  b.pos = { x: 700, y: 400 };
  b.hp = b.maxHp = 10000;
  b.action = {
    ...b.action,
    kind: 'windup',
    abilityId: 'fireBreath',
    aimAngle: Math.PI,
    targetId: ally.id,
    targetPos: { ...ally.pos },
  };
  grantFrontGuard(p, 1, 4, undefined, { reach: 60, halfWidth: 60 });
  return { w, p, ally, other, b };
}
const pulse = (shape: 'cone' | 'pbaoe'): BossAbilityDef => ({
  id: 'test',
  name: 'Wave',
  shape,
  cooldown: 5,
  windup: 1,
  damage: 30,
  range: 400,
  radius: 400,
  halfAngleDeg: 60,
  silence: 4,
  slowMult: 0.5,
  slowDuration: 2,
  stun: 1,
  knockback: 100,
  pull: 50,
});
const guard = (p: Player) => p.buffs.find((b) => b.kind === 'frontGuard');
describe('emitted boss attacks and spatial cover', () => {
  it.each(['cone', 'pbaoe'] as const)(
    '%s shares its last charge across owner and all allies, suppressing the complete packet',
    (shape) => {
      const { w, p, b } = setup();
      const hp = w.players.map((p) => p.hp),
        positions = w.players.map((p) => ({ ...p.pos }));
      expect(resolveBossAbility(w, b, pulse(shape), b.action)).toBe(0);
      expect(w.players.map((p) => p.hp)).toEqual(hp);
      expect(w.players.map((p) => p.pos)).toEqual(positions);
      for (const target of w.players) {
        expect(target.buffs.some((b) => ['silence', 'moveSpeed', 'stun'].includes(b.kind))).toBe(
          false,
        );
        expect(target.shove).toBeFalsy();
      }
      expect(guard(p)).toBeUndefined();
      expect(w.events.filter((e) => e.t === 'support')).toHaveLength(1);
      expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
      resolveBossAbility(w, b, pulse(shape), b.action);
      expect(w.players.every((p, i) => p.hp < hp[i])).toBe(true);
      expect(w.players.every((p) => p.buffs.some((b) => b.kind === 'silence'))).toBe(true);
    },
  );
  it.each(['pillar', 'monolith', 'crystal', 'totem', 'rock', 'stump'] as const)(
    'audits %s against broad waves',
    (kind) => {
      const { w, p, b, ally } = setup();
      w.obstacles = [{ id: 991, pos: { x: 620, y: 400 }, radius: 42, kind }];
      const tall = !['rock', 'stump'].includes(kind);
      blockBossPulse(w, b.pos, [ally]);
      expect(guard(p)?.mult).toBe(tall ? 1 : undefined);
    },
  );
  it('has deterministic nearest-shield ownership and no charge on a miss', () => {
    const { w, p, ally, other, b } = setup();
    other.pos = { x: 540, y: 400 };
    other.aim = { x: 1, y: 0 };
    grantFrontGuard(other, 1, 4, undefined, { reach: 60, halfWidth: 60 });
    expect(blockBossPulse(w, b.pos, [ally]).has(ally)).toBe(true);
    expect(guard(other)).toBeUndefined();
    expect(guard(p)?.mult).toBe(1);
    ally.pos = { x: 650, y: 400 };
    expect(blockBossPulse(w, b.pos, [ally]).size).toBe(0);
    expect(guard(p)?.mult).toBe(1);
  });
  it.each([
    'down',
    'dead',
    'class',
    'expired',
    'empty',
    'aim',
    'rear',
    'flank',
    'edge',
    'origin',
    'scene',
  ] as const)('rejects invalid cover: %s', (mode) => {
    const { w, p, ally, b } = setup();
    if (mode === 'down') p.state = 'downed';
    if (mode === 'dead') p.hp = 0;
    if (mode === 'class') p.classId = 'mage';
    if (mode === 'expired') guard(p)!.remaining = 0;
    if (mode === 'empty') guard(p)!.mult = 0;
    if (mode === 'aim') p.aim = { x: 0, y: 0 };
    if (mode === 'rear') b.pos.x = 200;
    if (mode === 'flank') ally.pos.y = 650;
    if (mode === 'edge') ally.pos = { x: 550, y: 460 };
    if (mode === 'origin') ally.pos = { ...b.pos };
    if (mode === 'scene') w.scene = 'reward';
    expect(blockBossPulse(w, b.pos, [ally]).size).toBe(0);
  });
  it('uses the torus seam and keeps previews free of mutations', () => {
    const { w, p, ally, b } = setup();
    p.pos.x = w.arena.w - 80;
    ally.pos.x = w.arena.w - 120;
    b.pos.x = 80;
    const before = JSON.stringify(p.buffs);
    expect(blockBossPulse(w, b.pos, [ally], false).has(ally)).toBe(true);
    expect(JSON.stringify(p.buffs)).toBe(before);
    expect(w.events).toHaveLength(0);
    expect(blockBossPulse(w, b.pos, [ally]).has(ally)).toBe(true);
  });
  it('blocks beam ticks individually, prevents drain healing, and checks current position', () => {
    const { w, p, ally, b } = setup();
    grantFrontGuard(p, 2, 4, undefined, { reach: 60, halfWidth: 60 });
    b.hp -= 100;
    const hp = b.hp;
    const ab: BossAbilityDef = { ...pulse('cone'), shape: 'beam', healSelf: true };
    expect(beamTick(w, b, ab, b.action)).toBe(0);
    expect(guard(p)?.mult).toBe(1);
    expect(b.hp).toBe(hp);
    ally.pos.y = 600;
    expect(beamTick(w, b, ab, b.action)).toBeGreaterThan(0);
    expect(guard(p)?.mult).toBe(1);
    ally.pos.y = 420;
    expect(beamTick(w, b, ab, b.action)).toBe(0);
    expect(guard(p)).toBeUndefined();
    expect(beamTick(w, b, ab, b.action)).toBeGreaterThan(0);
  });
  it('local target impacts bypass shield and solid cover', () => {
    const { w, p, ally, b } = setup();
    w.obstacles = [{ id: 991, pos: { x: 620, y: 400 }, radius: 42, kind: 'pillar' }];
    resolveBossAbility(w, b, { ...pulse('cone'), shape: 'circleAtTarget', radius: 45 }, b.action);
    expect(ally.hp).toBeLessThan(ally.maxHp);
    expect(guard(p)?.mult).toBe(1);
    expect(ally.buffs.some((b) => b.kind === 'silence')).toBe(true);
  });
  it('previews current covered recipients and clears on depletion and local impacts', () => {
    const { w, p, ally, b } = setup();
    expect(w.toRenderState(p.id).players.find((v) => v.id === ally.id)?.waveCover).toEqual([b.id]);
    blockBossPulse(w, b.pos, [ally]);
    expect(w.toRenderState(p.id).players.find((v) => v.id === ally.id)?.waveCover).toEqual([]);
  });
  it('audits every authored emitted delivery with tall cover', () => {
    for (const monster of Object.values(MONSTERS))
      for (const ab of monster.abilities) {
        if (!['cone', 'pbaoe', 'beam'].includes(ab.shape)) continue;
        const { w, p, ally, b } = setup();
        p.buffs = [];
        ally.pos = { x: 600, y: 400 };
        p.pos = { x: 620, y: 400 };
        w.obstacles = [{ id: 991, pos: { x: 650, y: 400 }, radius: 10, kind: 'pillar' }];
        const hp = ally.hp;
        if (ab.shape === 'beam') beamTick(w, b, ab, b.action);
        else resolveBossAbility(w, b, ab, b.action);
        expect(ally.hp, `${monster.id}/${ab.id}`).toBe(hp);
      }
  });
});
function use(w: World, p: Player, slot: ExtSlot) {
  (
    w as unknown as {
      tryUseAbility(p: Player, slot: ExtSlot, move: { x: number; y: number }): void;
    }
  ).tryUseAbility(p, slot, { x: 0, y: 0 });
}
describe('public silence status', () => {
  it('shows the longest remaining silence and restores specials after expiry', () => {
    const { w, p } = setup();
    p.buffs = [];
    applyBuff(p, makeBuff('silence', 0, 2, 'bossSilence'));
    applyBuff(p, makeBuff('silence', 0, 4, 'otherSilence'));
    expect(silenceStatus(w.toRenderState(p.id).players[0].buffs)).toBe('Silenced · 4.0s');
    for (const slot of ['a1', 'a2', 'a3', 'sub1'] as const) {
      use(w, p, slot);
      expect(p.cooldowns[slot] ?? 0).toBe(0);
    }
    use(w, p, 'basic');
    expect(p.cooldowns.basic).toBeGreaterThan(0);
    tickBuffs(p, 4.1);
    expect(silenceStatus(w.toRenderState(p.id).players[0].buffs)).toBeUndefined();
    use(w, p, 'a2');
    expect(p.cooldowns.a2).toBeGreaterThan(0);
  });
  it('publishes pool sustain only for armed, living, reachable exposure and counts down after exit', () => {
    const { w, p, b } = setup();
    resolveBossAbility(
      w,
      b,
      {
        ...pulse('cone'),
        shape: 'voidzones',
        zoneSilence: 1.5,
        zoneKind: 'antimagic',
        zoneTickDamage: 1,
        zoneDuration: 8,
      },
      b.action,
    );
    const zone = w.groundZones[0];
    w.groundZones = [zone];
    zone.pos = { ...p.pos };
    zone.radius = 100;
    zone.armRemaining = 0;
    applyBuff(p, makeBuff('silence', 0, 1.5, 'zoneSilence'));
    const status = () => silenceStatus(w.toRenderState(p.id).players[0].buffs);
    expect(status()).toContain('Leave the antimagic pool');
    p.pos.x -= 300;
    expect(status()).toBe('Silenced · 1.5s');
    p.pos = { ...zone.pos };
    zone.armRemaining = 1;
    expect(status()).toBe('Silenced · 1.5s');
    zone.armRemaining = 0;
    applyBuff(p, makeBuff('flight', 0, 3, 'test'));
    expect(status()).toBe('Silenced · 1.5s');
    p.buffs = p.buffs.filter((b) => b.kind !== 'flight');
    zone.remaining = 0;
    expect(status()).toBe('Silenced · 1.5s');
  });
});

describe('cover and silence presentation contracts', () => {
  it.each(['cone', 'pbaoe', 'beam', 'circleAtTarget'] as const)(
    'previews resolved %s geometry including default dimensions',
    (shape) => {
      const { w, p, ally, b } = setup();
      const ab: BossAbilityDef = {
        id: 'minimal',
        name: 'Minimal',
        shape,
        windup: 1,
        cooldown: 5,
        damage: 10,
      };
      w.monsterDef = { ...w.monsterDef, abilities: [ab] };
      b.action.abilityId = ab.id;
      b.pos.x = 590;
      ally.pos.x = 450;
      const view = () => w.toRenderState(p.id).players.find((v) => v.id === ally.id)!;
      expect(view().waveCover).toEqual(shape === 'circleAtTarget' ? [] : [b.id]);
      if (shape === 'beam') {
        ally.pos.x = 50;
        expect(view().waveCover).toEqual([]);
        ally.pos.x = 450;
        b.action.targetId = p.id;
        expect(view().waveCover).toEqual([]);
      }
      b.action.abilityId = 'missing';
      expect(view().waveCover).toEqual([]);
      b.action.abilityId = null;
      expect(view().waveCover).toEqual([]);
      b.action.abilityId = ab.id;
      b.hp = 0;
      expect(view().waveCover).toEqual([]);
      b.hp = 100;
      ally.state = 'downed';
      expect(view().waveCover).toEqual([]);
      ally.state = 'alive';
      ally.hp = 0;
      expect(view().waveCover).toEqual([]);
    },
  );
  it('draws independent covered and silenced markers, ignores expired silence and downed silence', () => {
    const { w, p } = setup();
    const view = w.toRenderState(p.id).players[0],
      g = new Graphics();
    view.waveCover = [w.boss!.id];
    view.buffs = [{ kind: 'silence', mult: 0, remaining: 2 }];
    drawDefenseState(g, view, 100, 100, 12);
    drawSilenceMarker(g, view, { x: 100, y: 100 }, 12, { x: 320, y: 568 });
    expect(
      g.context.instructions.some((i) => i.action === 'fill' && i.data.style.color === 0xb9f1ff),
    ).toBe(true);
    expect(
      g.context.instructions.some((i) => i.action === 'fill' && i.data.style.color === 0x32153c),
    ).toBe(true);
    g.clear();
    view.waveCover = [];
    view.buffs[0].remaining = 0;
    drawDefenseState(g, view, 100, 100, 12);
    drawSilenceMarker(g, view, { x: 100, y: 100 }, 12, { x: 320, y: 568 });
    expect(g.context.instructions).toHaveLength(0);
    view.buffs[0].remaining = 2;
    view.state = 'downed';
    drawDefenseState(g, view, 100, 100, 12);
    drawSilenceMarker(g, view, { x: 100, y: 100 }, 12, { x: 320, y: 568 });
    expect(g.context.instructions).toHaveLength(0);
    view.state = 'alive';
    for (const center of [
      { x: -1, y: 100 },
      { x: 100, y: -1 },
      { x: 321, y: 100 },
      { x: 100, y: 569 },
    ]) {
      drawSilenceMarker(g, view, center, 12, { x: 320, y: 568 });
      expect(g.context.instructions).toHaveLength(0);
    }
    view.hp = 0;
    drawSilenceMarker(g, view, { x: 100, y: 100 }, 12, { x: 320, y: 568 });
    expect(g.context.instructions).toHaveLength(0);
    g.destroy();
  });
  it('shares a reserved block with the owner personal frontal arc on an oblique wave', () => {
    const { w, p, ally, b } = setup();
    b.pos = { x: 700, y: 650 };
    ally.pos = { x: 450, y: 150 };
    const covered = blockBossPulse(w, b.pos, [ally, p]);
    expect(covered.has(ally)).toBe(true);
    expect(covered.has(p)).toBe(true);
    expect(guard(p)).toBeUndefined();
    expect(w.events.filter((e) => e.t === 'support')).toHaveLength(1);
  });
  it('keeps nearest shields deterministic for equal faces and undefined obstacle kinds', () => {
    const { w, p, other, ally, b } = setup();
    other.pos = { ...p.pos };
    other.aim = { ...p.aim };
    grantFrontGuard(other, 1, 4, undefined, { reach: 60, halfWidth: 60 });
    w.obstacles = [{ id: 991, pos: { x: 620, y: 400 }, radius: 20 }];
    expect(blockBossPulse(w, b.pos, [ally]).has(ally)).toBe(true);
    expect(guard(p)).toBeUndefined();
    expect(guard(other)?.mult).toBe(1);
  });
});

it('keeps silence beside/below the hero and inside narrow viewports at either edge', () => {
  for (const center of [
    { x: 100, y: 100 },
    { x: 220, y: 100 },
    { x: 1, y: 1 },
    { x: 319, y: 567 },
  ]) {
    const at = silenceAnchor(center, 12, { x: 320, y: 568 });
    expect(at.x).toBeGreaterThanOrEqual(17);
    expect(at.x).toBeLessThanOrEqual(303);
    expect(at.y).toBeGreaterThanOrEqual(17);
    expect(at.y).toBeLessThanOrEqual(551);
    if (center.y === 100) {
      expect(at.y - 15).toBeGreaterThan(center.y);
      expect(Math.abs(at.x - center.x)).toBeGreaterThan(30);
    }
  }
});
