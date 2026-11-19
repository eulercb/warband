import { expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { drawRefuge } from '../src/render/pipeline/refugeVisuals';
it.each([0.3, 1])('refuge boundary has local independent paths at scale %s', (scale) => {
  const g = new Graphics();
  g.moveTo(0, 0);
  drawRefuge(g, { x: 500, y: 300 }, 140, scale);
  const bounds = g.getLocalBounds();
  expect(bounds.minX).toBeGreaterThan(500 - 140 * scale - 10);
  expect(bounds.maxX).toBeLessThan(500 + 140 * scale + 10);
  expect(bounds.width).toBeGreaterThan(280 * scale);
});
