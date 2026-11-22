/**
 * Warband — FX layer regression tests.
 *
 * Every attack (player or boss) emits a `cast` event, which spawns a short-lived
 * "burst" circle. Those bursts are drawn into a PixiJS `Graphics` that — unlike
 * every other render layer — is only ever cleared inside `Fx.draw`. PixiJS v8
 * Graphics is retained-mode, so a missing `clear()` makes each frame's circles
 * pile up forever, leaving a permanent ring on the ground under every attack.
 *
 * These tests pin the fix: `draw` must fully redraw the layer each frame so
 * bursts appear and then disappear after a while.
 */
import { describe, it, expect } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { Fx } from '../src/render/overlays/fx';
import { drawBlinkEndpoint } from '../src/render/overlays/blinkVisual';
import {
  advanceAnimalMotion,
  animalFoot,
  moonBasicPose,
  blendAnimalFacing,
  strikeProgress,
} from '../src/render/pipeline/animalMotion';
import { drawSkeleton } from '../src/render/pipeline/skeletonVisual';
import { drawElementalBurst } from '../src/render/overlays/elementalBurst';
import type { PlayerView } from '../src/engine/core/types';
import { drawKnightArmor, drawKnightShield } from '../src/render/rig/knightArmor';
import { heroStance } from '../src/render/rig/math/heroStance';
import { drawMageGarment, playerVisualHeadroom } from '../src/render/rig/mageGarment';
import { Camera } from '../src/render/pipeline/camera';
import type { GameEvent } from '../src/engine/core/types';

/** Number of retained draw instructions currently held by a Graphics. */
function instructionCount(g: Graphics): number {
  return (g as unknown as { context: { instructions: unknown[] } }).context.instructions.length;
}

const castEvent: GameEvent = {
  t: 'cast',
  ability: 'Slash',
  sourceId: 1,
  pos: { x: 800, y: 500 },
  side: 'player',
};

describe('Fx: attack bursts do not accumulate on the ground', () => {
  it('redraws the fx layer each frame instead of piling up geometry', () => {
    const fx = new Fx(new Container());
    const camera = new Camera(1600, 1000);
    const g = new Graphics();

    // A player attack: spawns a filled burst circle.
    fx.processEvents([castEvent], camera);

    // Drive ~2s of frames (the cast burst lives 0.3s) reusing the SAME Graphics,
    // exactly as the renderer does. Retained geometry must stay bounded — with
    // the pre-fix code (no clear) it would grow by a circle every single frame.
    let peak = 0;
    for (let frame = 0; frame < 120; frame++) {
      fx.update(16);
      fx.draw(g, camera);
      peak = Math.max(peak, instructionCount(g));
    }

    expect(peak).toBeGreaterThan(0); // the burst really was drawn at some point
    expect(peak).toBeLessThan(16); // ...but a single burst never balloons the layer
    expect(instructionCount(g)).toBe(0); // and once it expires the ground is clean
  });

  it('draws a circle while the burst is alive, then none once it expires', () => {
    const fx = new Fx(new Container());
    const camera = new Camera(1600, 1000);

    fx.processEvents([castEvent], camera);

    const alive = new Graphics();
    fx.draw(alive, camera);
    expect(instructionCount(alive)).toBeGreaterThan(0); // visible right after the attack

    // Advance well past the burst's 0.3s time-to-live.
    for (let frame = 0; frame < 40; frame++) fx.update(16);

    const expired = new Graphics();
    fx.draw(expired, camera);
    expect(instructionCount(expired)).toBe(0); // no lingering circle on the ground
  });
});

describe('Fx: fight-start and party-wipe transitions (item)', () => {
  it('a fightStart event paints an opening burst that then clears', () => {
    const fx = new Fx(new Container());
    const camera = new Camera(1600, 1000);

    fx.processEvents([{ t: 'fightStart', pos: { x: 800, y: 500 } }], camera);
    const alive = new Graphics();
    fx.draw(alive, camera);
    expect(instructionCount(alive)).toBeGreaterThan(0); // the opening ring is drawn

    for (let frame = 0; frame < 80; frame++) fx.update(16);
    const cleared = new Graphics();
    fx.draw(cleared, camera);
    expect(instructionCount(cleared)).toBe(0); // and it doesn't linger
  });

  it('a defeat event kicks off a somber ember lap that feeds bursts, then settles', () => {
    const fx = new Fx(new Container());
    const camera = new Camera(1600, 1000);

    fx.processEvents([{ t: 'defeat', pos: { x: 800, y: 500 } }], camera);

    // Over the defeat lap, updateDefeat keeps spawning embers — the layer stays lit
    // (and bounded) rather than empty, distinguishing it from a single one-shot burst.
    let peak = 0;
    for (let frame = 0; frame < 30; frame++) {
      fx.update(16);
      const g = new Graphics();
      fx.draw(g, camera);
      peak = Math.max(peak, instructionCount(g));
    }
    expect(peak).toBeGreaterThan(0); // embers were actively drawn during the lap

    // After the lap (~2.2s) the embers stop and the ground clears.
    for (let frame = 0; frame < 200; frame++) fx.update(16);
    const settled = new Graphics();
    fx.draw(settled, camera);
    expect(instructionCount(settled)).toBe(0);
  });
});

it('draws the lightning strike across its area and clears it after fading', () => {
  const fx = new Fx(new Container());
  const camera = new Camera(1600, 1000);
  const g = new Graphics();
  fx.processEvents(
    [
      {
        t: 'skillArea',
        sourceId: 1,
        side: 'player',
        color: 0x75aaff,
        area: {
          kind: 'line',
          style: 'lightning',
          contacts: [{ id: 2, pos: { x: 700, y: 500 }, radius: 26 }],
          stoppedByCover: true,
          origin: { x: 450, y: 500 },
          angle: 0,
          range: 500,
          radius: 14,
          halfAngle: 0,
        },
      },
    ],
    camera,
  );
  fx.draw(g, camera);
  expect(instructionCount(g)).toBe(14);
  for (let frame = 0; frame < 18; frame++) fx.update(16);
  fx.draw(g, camera);
  expect(instructionCount(g)).toBe(9);
  for (let frame = 0; frame < 12; frame++) fx.update(16);
  fx.draw(g, camera);
  expect(instructionCount(g)).toBe(9);
  for (let frame = 0; frame < 40; frame++) fx.update(16);
  fx.draw(g, camera);
  expect(instructionCount(g)).toBe(0);
});

it('keeps the Mage garment ordered around the body and bends its trailing cloth', () => {
  const behind = new Graphics();
  const front = new Graphics();
  const at = (forward: number, lateral: number, height = 0) => ({
    x: 200 + forward * 16,
    y: 200 + lateral * 16 - height * 16,
  });
  drawMageGarment(behind, front, at, 16, 0, 0);
  const resting = { ...behind.getLocalBounds() };
  expect(instructionCount(behind)).toBe(8);
  expect(instructionCount(front)).toBe(8);
  expect(front.getLocalBounds().minY).toBeLessThan(170);
  behind.clear();
  front.clear();
  drawMageGarment(behind, front, at, 16, 0.24, 0.9);
  expect(behind.getLocalBounds().maxY).toBeGreaterThan(resting.maxY);
  expect(instructionCount(front)).toBe(8);
});

it('changes the skeleton silhouette on hit at phone scale and settles at the same anchor', () => {
  const g = new Graphics();
  const anchor = { x: 100, y: 100 };
  drawSkeleton(g, anchor, 8, 0, 0);
  const idle = { ...g.getLocalBounds() };
  expect(instructionCount(g)).toBeGreaterThan(20);
  g.clear();
  drawSkeleton(g, anchor, 8, 1, 0);
  const struck = g.getLocalBounds();
  expect(struck.minY).toBeLessThan(idle.minY);
  expect(struck.maxY).toBe(idle.maxY);
});

it('lifts alternating feet and changes the sword silhouette on an authored attack frame', () => {
  const g = new Graphics();
  const anchor = { x: 100, y: 100 };
  drawSkeleton(g, anchor, 12, 0, 0);
  const idle = { ...g.getLocalBounds() };
  g.clear();
  drawSkeleton(g, anchor, 12, 0, 0, { distance: Math.PI * 2, moving: true, swing: 0, facing: 1 });
  expect(g.getLocalBounds().minY).toBeLessThan(idle.minY);
  g.clear();
  drawSkeleton(g, anchor, 12, 0, 0, { distance: 0, moving: false, swing: 0.18, facing: -1 });
  const strike = { ...g.getLocalBounds() };
  g.clear();
  drawSkeleton(g, anchor, 12, 0, 0, { distance: 0, moving: false, swing: 0.08, facing: -1 });
  expect(g.getLocalBounds().minX).toBeGreaterThan(strike.minX);
});

it.each([
  ['mage', 'alive', undefined, 37.44],
  ['knight', 'alive', undefined, 40.8],
  ['mage', 'downed', undefined, 16],
  ['mage', 'alive', 'moonBear', 25.92],
  ['druid', 'downed', 'moonBear', 16],
  ['ranger', 'alive', undefined, 16],
] as const)('reserves headroom for the raised heroes', (classId, state, form, expected) => {
  const p = { classId, state, form } as PlayerView;
  expect(playerVisualHeadroom(p, 16)).toBeCloseTo(expected);
});

it.each([false, true])('draws bounded elemental layers, ice=%s', (ice) => {
  const g = new Graphics();
  for (const age of [0, 0.3, 0.95]) {
    g.clear();
    drawElementalBurst(g, { x: 100, y: 100 }, 40, age, ice);
    expect(instructionCount(g)).toBeGreaterThan(20);
    const bounds = g.getLocalBounds();
    expect(bounds.minX).toBeGreaterThanOrEqual(59);
    expect(bounds.maxX).toBeCloseTo(140);
    expect(bounds.minY).toBeGreaterThanOrEqual(59);
    expect(bounds.maxY).toBeLessThanOrEqual(141);
  }
});

it.each(['shutter', 'tiles'] as const)(
  'draws %s Blink at two separate local endpoints',
  (variant) => {
    const g = new Graphics();
    drawBlinkEndpoint(g, { x: 100, y: 100 }, 1, 0.05, false, variant);
    const departure = { ...g.getLocalBounds() };
    g.clear();
    drawBlinkEndpoint(g, { x: 320, y: 100 }, 1, 0.05, true, variant);
    const arrival = g.getLocalBounds();
    expect(instructionCount(g)).toBeGreaterThan(5);
    expect(departure.maxX).toBeLessThan(130);
    expect(arrival.minX).toBeGreaterThan(290);
    expect(arrival.maxY - arrival.minY).not.toBe(departure.maxY - departure.minY);
  },
);

it('keeps the torso near travel while aim points across the circle', () => {
  let facing = 0;
  for (let i = 0; i < 30; i++) facing = heroStance(facing, Math.PI * 0.8, 0, true, 1 / 60);
  expect(facing).toBeCloseTo(0.64);
  expect(heroStance(facing, Math.PI * 0.8, 0, false, 1 / 60)).toBeGreaterThan(facing);
  expect(heroStance(-Math.PI + 0.05, Math.PI - 0.05, 0, false, 1 / 60)).toBeCloseTo(
    -Math.PI - 0.05,
  );
});

it('draws a raised Knight silhouette and opens the shield on guard', () => {
  const g = new Graphics();
  drawKnightArmor(g, (x, y, h) => ({ x: 100 + x * 16, y: 100 + y * 8 - h * 16 }), 16);
  expect(g.getLocalBounds().minY).toBeLessThan(67);
  g.clear();
  drawKnightShield(g, { x: 100, y: 100 }, 16, 0);
  const idle = g.getLocalBounds().width;
  g.clear();
  drawKnightShield(g, { x: 100, y: 100 }, 16, 1);
  expect(g.getLocalBounds().width).toBeGreaterThan(idle * 2);
});

it.each(['fireball', 'frostNova'] as const)(
  'keeps %s readable past the old area lifetime and then retires it',
  (style) => {
    const fx = new Fx(new Container());
    const g = new Graphics();
    const camera = new Camera(1600, 1000);
    fx.processEvents(
      [
        {
          t: 'skillArea',
          sourceId: 1,
          side: 'player',
          color: 0xffffff,
          area: {
            kind: 'circle',
            style,
            origin: { x: 800, y: 500 },
            angle: 0,
            range: 0,
            radius: 110,
            halfAngle: 0,
          },
        },
      ],
      camera,
    );
    for (let i = 0; i < 28; i++) fx.update(17);
    fx.draw(g, camera);
    expect(instructionCount(g)).toBeGreaterThan(20);
    for (let i = 0; i < 14; i++) fx.update(17);
    fx.draw(g, camera);
    expect(instructionCount(g)).toBe(0);
  },
);

it('smooths animal gait and heading across the arena seam and resets after a discontinuity', () => {
  const initial = advanceAnimalMotion(undefined, { x: 1598, y: 100 }, 0, Math.PI - 0.1);
  const next = advanceAnimalMotion(initial, { x: 3, y: 100 }, 24, -Math.PI + 0.1);
  expect(next.speed).toBeGreaterThan(0);
  expect(next.speed).toBeLessThan(210);
  expect(next.phase).toBeGreaterThan(0);
  expect(next.facing).toBeGreaterThan(initial.facing);
  expect(blendAnimalFacing(initial.facing, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI);
  expect(advanceAnimalMotion(next, { x: 320, y: 100 }, 40, 0).phase).toBe(0);
  expect(advanceAnimalMotion(next, { x: 4, y: 100 }, 300, 0).stride).toBe(0);
  expect(strikeProgress(undefined, 0, 400)).toBe(1);
  const strike = { angle: Math.PI, started: 100 };
  expect(strikeProgress(strike, 90, 400)).toBe(0);
  expect(strikeProgress(strike, 300, 400)).toBe(0.5);
  expect(strikeProgress(strike, 601, 400)).toBe(1);
});

it('pushes planted paws against travel while the lifted paws reach along travel', () => {
  const plant = animalFoot(Math.PI * 1.25, Math.PI, 0, 1);
  const plantLater = animalFoot(Math.PI * 1.75, Math.PI, 0, 1);
  expect(plant.lift).toBe(0);
  expect(plantLater.x).toBeGreaterThan(plant.x);
  const lift = animalFoot(Math.PI * 0.25, Math.PI / 2, 0, 1);
  const liftLater = animalFoot(Math.PI * 0.75, Math.PI / 2, 0, 1);
  expect(lift.lift).toBeGreaterThan(0);
  expect(liftLater.y).toBeGreaterThan(lift.y);
  expect(moonBasicPose(0.15)).toMatchObject({ cast: 1, sweep: 0 });
  expect(moonBasicPose(0.5)).toMatchObject({ cast: 0, sweep: 1 });
  expect(moonBasicPose(1)).toMatchObject({ cast: 0, sweep: 0 });
});

it.each([
  ['cleave', Math.PI / 4],
  ['cleave', Math.PI],
  ['daggerSlash', Math.PI / 4],
  ['daggerSlash', Math.PI],
  ['holyStrike', Math.PI / 4],
  ['moonClaw', Math.PI / 4],
] as const)('draws and retires the authored %s effect with half-angle %s', (style, halfAngle) => {
  const fx = new Fx(new Container());
  const camera = new Camera(1600, 1000);
  const graphics = new Graphics();
  fx.processEvents(
    [
      {
        t: 'skillArea',
        side: 'player',
        sourceId: 1,
        color: 0xffffff,
        area: {
          kind: 'cone',
          style,
          origin: { x: 500, y: 500 },
          angle: 0,
          range: 70,
          radius: 0,
          halfAngle,
        },
      },
    ],
    camera,
  );
  fx.draw(graphics, camera);
  expect(instructionCount(graphics)).toBeGreaterThanOrEqual(3);
  fx.update(180);
  fx.draw(graphics, camera);
  expect(instructionCount(graphics)).toBeGreaterThanOrEqual(3);
  fx.update(510);
  fx.draw(graphics, camera);
  expect(instructionCount(graphics)).toBe(0);
  graphics.destroy();
});
