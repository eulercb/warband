import { expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { drawReflectionWard } from '../src/render/pipeline/reflectionVisuals';
it.each([0, 0.1, 2, 4, 6])(
  'keeps every mirror facet local at remaining=%s, without a screen-origin connector',
  (remaining) => {
    const g = new Graphics();
    // A prior current point must never become part of an unrelated sigil's path.
    g.moveTo(0, 0);
    drawReflectionWard(g, { x: 600, y: 400 }, remaining, 1);
    const box = g.getLocalBounds();
    expect(box.minX).toBeGreaterThan(555);
    expect(box.maxX).toBeLessThan(655);
    expect(box.minY).toBeGreaterThan(345);
    expect(box.maxY).toBeLessThan(440);
  },
);
it('retains a readable minimum size on a small phone without reaching other arena paths', () => {
  const g = new Graphics();
  drawReflectionWard(g, { x: 160, y: 280 }, 4, 0.3);
  const box = g.getLocalBounds();
  expect(box.width).toBeGreaterThan(50);
  expect(box.width).toBeLessThan(66);
  expect(box.minY).toBeGreaterThan(240);
});
