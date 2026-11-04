import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import { damageBoss, tickBuffs } from '../src/engine/combat/combat';
import { resolvePlayerAbility, resolveBossAbility, beamTick } from '../src/engine/combat/abilities';
import { getMonster, MONSTER_IDS, type BossAbilityShape } from '../src/engine/content/monsters';
import { forethoughtLabel, foresightHint } from '../src/engine/content/forethought';
import { SnapshotInterpolator } from '../src/render/pipeline/interpolate';
import { tickForethought } from '../src/engine/combat/forethought';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import { drawForesight } from '../src/render/pipeline/foresightVisuals';
import type { Boss, MonsterId, BossView } from '../src/engine/core/types';
import type { Camera } from '../src/render/pipeline/camera';
function setup(monsterId: MonsterId = 'troll') {
  const w = new World({
    seed: 31,
    monsterId,
    players: [
      {
        peerId: 'a',
        name: 'Reader',
        classId: 'warlock',
        charUpgrades: ['wa_great_old_one_g_a', 'wa_goo_tentacle_g'],
        subSkills: ['wa_goo_tentacle'],
      },
      { peerId: 'b', name: 'Ally', classId: 'knight' },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  b.pos = { x: 600, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 1.2;
  w.players[1].pos = { x: 1000, y: 700 };
  return { w, p, b };
}
function update(w: World, b: Boss, dt = 0) {
  (w as unknown as { updateBoss(n: number, b: Boss, i: number): void }).updateBoss(dt, b, 0);
}
function commit(w: World, b: Boss) {
  b.action.kind = 'idle';
  b.decisionTimer = 0;
  update(w, b);
}
function arm(w: World, b: Boss, id?: string) {
  const p = w.players[0];
  damageBoss(w, p, b, 1, {
    direct: true,
    forethought: { ownerClass: p.classId, requiresCurse: false },
  });
  if (id) b.forethought!.abilityId = id;
  update(w, b);
}
const shapes: BossAbilityShape[] = [
  'cone',
  'circleAtTarget',
  'line',
  'pbaoe',
  'projectile',
  'beam',
  'voidzones',
  'summon',
  'buffSelf',
];
describe('visible, truthful boss foresight', () => {
  it.each(shapes)(
    'exposes authoritative %s geometry through host projection and client interpolation',
    (shape) => {
      const id = MONSTER_IDS.find((id) => getMonster(id).abilities.some((a) => a.shape === shape))!;
      const { w, b } = setup(id),
        ab = w.defOf(b).abilities.find((a) => a.shape === shape)!;
      if (ab.minHpFrac) b.hp = b.maxHp * ab.minHpFrac;
      arm(w, b, ab.id);
      const host = w.toRenderState(w.players[0].id);
      expect(host.bosses[0].forethought?.preview?.abilityId).toBe(ab.id);
      const client = new SnapshotInterpolator();
      client.push(JSON.parse(JSON.stringify(w.serialize())) as ReturnType<World['serialize']>);
      const remote = client.sample(performance.now() + 100, {
        localPlayerId: w.players[0].id,
        arena: w.arena,
      })!;
      const view = remote.bosses[0];
      expect(view.forethought?.preview).toEqual(host.bosses[0].forethought?.preview);
      expect(foresightHint(view.forethought!.preview).length).toBeGreaterThan(20);
      const calls = paint(view);
      expect(calls.ellipse).toHaveBeenCalled();
      if (shape === 'voidzones' || shape === 'summon' || shape === 'buffSelf')
        expect(view.forethought!.preview!.shape).toBeUndefined();
      else expect(calls.stroke).toHaveBeenCalled();
    },
  );
  it('close Tentacle reveals without a curse and its grand leaves the revealed cue through the slower wind-up', () => {
    const { w, p, b } = setup();
    resolvePlayerAbility(w, p, 'sub1', { x: 0, y: 0 });
    update(w, b);
    expect(b.forethought?.plan).toBeDefined();
    const preview = w.serialize().bosses[0].forethought!.preview!;
    commit(w, b);
    expect(w.serialize().bosses[0].revealed?.abilityId).toBe(preview.abilityId);
    const before = b.action.remaining;
    update(w, b, 0.7);
    expect(b.action.remaining).toBeCloseTo(before - 0.5);
    expect(foresightLabelCurrent(w)).toContain('REVEALED');
  });
  it('preserves a fixed ground impact point after the victim moves', () => {
    const { w, p, b } = setup('dragon');
    arm(w, b, 'fireball');
    const point = { ...b.forethought!.plan!.targetPos! };
    p.pos = { x: 900, y: 700 };
    commit(w, b);
    expect(b.action.targetPos).toEqual(point);
    expect(w.serialize().bosses[0].telegraph!.target).toEqual(point);
  });
  it('foreseen projectiles actually keep the previewed angle when their target moves', () => {
    const { w, p, b } = setup('lich');
    arm(w, b, 'shadowBolt');
    const angle = b.forethought!.plan!.aimAngle;
    p.pos = { x: 600, y: 700 };
    commit(w, b);
    const ab = w.defOf(b).abilities.find((a) => a.id === 'shadowBolt')!;
    resolveBossAbility(w, b, ab, b.action);
    expect(Math.atan2(w.projectiles[0].vel.y, w.projectiles[0].vel.x)).toBeCloseTo(angle);
    expect(w.projectiles.length).toBeGreaterThan(0); // An instant bolt has already left its wind-up.
  });
  it('beam disclosure follows its real victim and presents escape range rather than a sidestep lane', () => {
    const { w, p, b } = setup('lich');
    arm(w, b, 'lifeDrain');
    commit(w, b);
    p.pos = { x: 650, y: 700 };
    const view = w.serialize().bosses[0].revealed!;
    expect(view.mode).toBe('tracking');
    expect(view.shape!.target).toEqual(p.pos);
    const ab = w.defOf(b).abilities.find((a) => a.id === 'lifeDrain')!;
    expect(beamTick(w, b, ab, b.action)).toBeGreaterThan(0);
    p.pos = { x: b.pos.x + (ab.range ?? 500) + 10, y: b.pos.y };
    expect(beamTick(w, b, ab, b.action)).toBe(0);
  });
  it('boss-centered previews follow movement but fixed world circles do not', () => {
    const { w, b } = setup();
    arm(w, b, 'groundSlam');
    b.pos.x += 40;
    expect(w.serialize().bosses[0].forethought!.preview!.shape!.target).toEqual(b.pos);
  });
  it.each(['taunt', 'illusion', 'victim'] as const)(
    'clears an obsolete preview after %s changes targeting',
    (reason) => {
      const { w, p, b } = setup();
      arm(w, b, 'smash');
      if (reason === 'taunt') {
        w.tauntTargetId = w.players[1].id;
        w.tauntTimer = 2;
      }
      if (reason === 'illusion')
        b.perception = {
          mode: 'lure',
          pos: { x: 300, y: 300 },
          ownerId: p.id,
          remaining: 2,
        } as NonNullable<Boss['perception']>;
      if (reason === 'victim') p.state = 'downed';
      expect(w.serialize().bosses[0].forethought).toBeUndefined();
      update(w, b);
      expect(b.forethought).toBeUndefined();
    },
  );
  it('discloses an existing quarry without spending it until the actual attack begins', () => {
    const { w, p, b } = setup();
    b.perception = {
      mode: 'lure',
      pos: { x: 300, y: 400 },
      ownerId: p.id,
      remaining: 5,
    } as NonNullable<Boss['perception']>;
    // stepFear/lure movement does not consume the deception while reserving the attack.
    arm(w, b, 'smash');
    expect(b.forethought!.plan!.illusionPos).toEqual({ x: 300, y: 400 });
    expect(b.perception).toBeDefined();
    commit(w, b);
    expect(b.perception).toBeUndefined();
    expect(b.action.illusionPos).toEqual({ x: 300, y: 400 });
  });
  it('keeps current disclosure without queueing the following move', () => {
    const { w, b } = setup();
    arm(w, b, 'smash');
    commit(w, b);
    arm(w, b);
    const view = w.serialize().bosses[0];
    expect(view.revealed?.abilityId).toBe('smash');
    expect(view.forethought).toBeUndefined();
    expect(forethoughtLabel(b.monsterId, view.forethought, view.revealed)).toContain('REVEALED');
  });
  it('keeps the revealed eye during a cone without drawing another danger countdown', () => {
    const { w, b } = setup();
    arm(w, b, 'smash');
    commit(w, b);
    const view = w.serialize().bosses[0],
      calls = paint(view);
    expect(calls.ellipse).toHaveBeenCalled();
    expect(calls.arc).not.toHaveBeenCalled();
  });
  it('keeps a tracking beam tether and escape ring during the real wind-up', () => {
    const { w, b } = setup('lich');
    arm(w, b, 'lifeDrain');
    commit(w, b);
    const calls = paint(w.serialize().bosses[0]);
    expect(calls.arc).toHaveBeenCalled();
    expect(calls.lineTo).toHaveBeenCalled();
  });
  it('draws multi-shot rays and tolerates a partial older preview', () => {
    const { w, b } = setup('lich');
    arm(w, b, 'shadowBolt');
    const view = w.serialize().bosses[0];
    const preview = view.forethought!.preview!;
    preview.rays = 3;
    preview.shape!.halfAngle = 0.3;
    const fan = paint(view);
    expect(fan.lineTo).toHaveBeenCalled();
    preview.rays = undefined;
    expect(paint(view).lineTo).toHaveBeenCalled();
    preview.mode = 'tracking';
    preview.range = undefined;
    expect(paint(view).arc).toHaveBeenCalled();
    preview.mode = 'fixed';
    preview.shape!.kind = 'line';
    preview.shape!.target = { ...preview.shape!.origin };
    expect(paint(view).lineTo).toHaveBeenCalled();
    view.forethought = undefined;
    view.revealed = preview;
    preview.mode = 'volley';
    expect(paint(view).lineTo).toHaveBeenCalled();
  });
  it('uses the active taunt once when reserving the victim, then expires an obsolete taunt plan', () => {
    const { w, b } = setup('lich');
    w.tauntTimer = 3;
    w.tauntTargetId = w.players[1].id;
    arm(w, b, 'lifeDrain');
    expect(b.forethought!.plan!.targetId).toBe(w.players[1].id);
    w.tauntTimer = 0;
    expect(w.serialize().bosses[0].forethought).toBeUndefined();
    update(w, b);
    expect(b.forethought).toBeUndefined();
  });
  it.each(['cone', 'circleAtTarget', 'pbaoe', 'line', 'beam'] as const)(
    'uses resolver defaults for optional %s content dimensions',
    (shape) => {
      const id = MONSTER_IDS.find((id) => getMonster(id).abilities.some((a) => a.shape === shape))!;
      const { w, b } = setup(id),
        def = w.defOf(b),
        raw = def.abilities.find((a) => a.shape === shape)!;
      const ab = { ...raw, range: undefined, radius: undefined, width: undefined };
      vi.spyOn(w, 'defOf').mockReturnValue({ ...def, abilities: [ab] });
      arm(w, b, ab.id);
      expect(w.serialize().bosses[0].forethought!.preview!.shape).toBeDefined();
      // Lost targeting must produce a safe public fallback rather than leak stale positions.
      const action = { ...b.forethought!.plan!, targetId: null, targetPos: null };
      expect(w.foresightPreview(b, action)).toBeDefined();
      b.hp = 0;
      expect(w.foresightPreview(b, action)).toBeUndefined();
    },
  );
  it.each(['disintegrate', 'deathRay', 'antimagicEye'])(
    'Pixi %s arcs start at their own circle, never a previous path or screen corner',
    (id) => {
      const { w, b } = setup('beholder');
      arm(w, b, id);
      const g = new Graphics(),
        camera = {
          scale: 1,
          worldToScreen: ({ x, y }: { x: number; y: number }) => ({ x: x + 40, y: y + 80 }),
        } as Camera;
      drawForesight(g, w.serialize().bosses[0], camera);
      let arcs = 0;
      for (const instruction of g.context.instructions) {
        if (instruction.action !== 'stroke') continue;
        const path = instruction.data.path.instructions;
        for (let j = 0; j < path.length; j++) {
          if (path[j].action !== 'arc') continue;
          arcs++;
          expect(path[j - 1].action).toBe('moveTo');
          const [x, y, r, start] = path[j].data as [number, number, number, number];
          const [mx, my] = path[j - 1].data as [number, number];
          expect(mx).toBeCloseTo(x + Math.cos(start) * r);
          expect(my).toBeCloseTo(y + Math.sin(start) * r);
        }
      }
      expect(arcs).toBeGreaterThan(0);
      g.destroy();
    },
  );
  it('held hits cannot extend pending lifetime; expiry closes the shared mind', () => {
    const { w, p, b } = setup();
    arm(w, b, 'smash');
    tickForethought(w, b, 3);
    arm(w, b);
    expect(b.forethought!.remaining).toBe(5);
    damageBoss(w, w.players[1], b, 1, {
      direct: true,
      forethought: { ownerClass: 'knight', requiresCurse: false },
    });
    expect(b.forethought!.remaining).toBe(5);
    tickForethought(w, b, 5);
    expect(b.forethought).toBeUndefined();
    expect(
      w.serialize().bosses[0].buffs.find((x) => x.kind === 'forethoughtRecovery')?.remaining,
    ).toBe(8);
    arm(w, b);
    expect(b.forethought).toBeUndefined();
    tickBuffs(b, 7.99);
    arm(w, b);
    expect(b.forethought).toBeUndefined();
    tickBuffs(b, 0.02);
    arm(w, b);
    expect(b.forethought).toBeDefined();
    expect(p.hp).toBe(p.maxHp);
  });
  it('starts the full quiet interval after a long revealed channel, not at the first hit', () => {
    const { w, p, b } = setup('lich');
    p.hp = p.maxHp = 10000;
    arm(w, b, 'lifeDrain');
    commit(w, b);
    b.action.kind = 'channel';
    b.action.remaining = 20;
    b.action.channelAccum = 0;
    update(w, b, 10);
    arm(w, b);
    expect(b.forethought).toBeUndefined();
    expect(b.buffs.some((x) => x.kind === 'forethoughtRecovery')).toBe(false);
    b.action.remaining = 0.1;
    update(w, b, 0.1);
    const closed = w.serialize().bosses[0].buffs.find((x) => x.kind === 'forethoughtRecovery')!;
    expect(closed.remaining).toBe(8);
    expect(buffBadges([closed])[0].label).toContain('Mind closed');
    arm(w, b);
    expect(b.forethought).toBeUndefined();
  });
  it('interruption ends a revealed attack and starts the same quiet interval', () => {
    const { w, p, b } = setup();
    arm(w, b, 'smash');
    commit(w, b);
    w.onThoughtBreak(p, b, 1, { spent: false, ownerClass: p.classId });
    expect(b.action.kind).toBe('recover');
    expect(b.action.forethought).toBeUndefined();
    expect(b.buffs.find((x) => x.kind === 'forethoughtRecovery')?.remaining).toBe(8);
  });
  it('pending invalidation starts recovery before a fresh hit can replace it', () => {
    const { w, b } = setup();
    arm(w, b, 'smash');
    w.tauntTimer = 2;
    w.tauntTargetId = w.players[1].id;
    arm(w, b);
    expect(b.forethought).toBeUndefined();
    expect(b.buffs.find((x) => x.kind === 'forethoughtRecovery')?.remaining).toBe(8);
    arm(w, b);
    expect(b.forethought).toBeUndefined();
  });
  it('recovery is party-wide but does not close an independent boss', () => {
    const { w, p, b } = setup();
    arm(w, b, 'smash');
    commit(w, b);
    w.onThoughtBreak(p, b, 1, { spent: false, ownerClass: p.classId });
    damageBoss(w, w.players[1], b, 1, {
      direct: true,
      forethought: { ownerClass: 'knight', requiresCurse: false },
    });
    expect(b.forethought).toBeUndefined();
    const other = {
      ...b,
      id: 123,
      buffs: [],
      action: { ...b.action },
      cooldowns: { ...b.cooldowns },
    };
    w.bosses.push(other);
    damageBoss(w, p, other, 1, {
      direct: true,
      forethought: { ownerClass: p.classId, requiresCurse: false },
    });
    expect(other.forethought).toBeDefined();
  });
  it('no read means no eye or forecast geometry', () => {
    const { w } = setup();
    const ellipse = vi.fn();
    const g = { ellipse } as unknown as Graphics;
    drawForesight(g, w.serialize().bosses[0], {} as Camera);
    expect(ellipse).not.toHaveBeenCalled();
  });
});
function foresightLabelCurrent(w: World) {
  const b = w.serialize().bosses[0];
  return forethoughtLabel(b.monsterId, b.forethought, b.revealed);
}

function paint(view: BossView) {
  const calls = {
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    circle: vi.fn(),
    fill: vi.fn(),
  };
  const g = calls as unknown as Graphics;
  for (const key of ['moveTo', 'lineTo', 'stroke', 'arc', 'ellipse', 'circle', 'fill'] as const)
    calls[key].mockReturnValue(g);
  const camera = {
    scale: 1,
    worldToScreen: ({ x, y }: { x: number; y: number }) => ({ x, y }),
  } as Camera;
  drawForesight(g, view, camera);
  return calls;
}
