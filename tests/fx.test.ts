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
import { Fx } from '../src/render/fx';
import { Camera } from '../src/render/camera';
import type { GameEvent } from '../src/engine/types';

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
