import { expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { drawFont, drawFontFootprint } from '../src/render/pipeline/fontVisuals';
it.each([false, true])(
  'font marker stays local with claimed=%s and remains readable on phones',
  (claimed) => {
    for (const scale of [0.3, 1]) {
      const g = new Graphics();
      g.moveTo(0, 0);
      drawFont(g, { x: 500, y: 300 }, scale, claimed);
      const b = g.getLocalBounds();
      expect(b.minX).toBeGreaterThan(465);
      expect(b.minY).toBeGreaterThan(265);
      expect(b.width).toBeGreaterThan(30);
      expect(b.maxX).toBeLessThan(535);
    }
  },
);
it('claimed footprint brackets have explicit path starts and show the actual captured radius', () => {
  const g = new Graphics();
  g.moveTo(0, 0);
  drawFontFootprint(g, { x: 500, y: 300 }, 100, 1);
  const b = g.getLocalBounds();
  expect(b.minX).toBeGreaterThan(395);
  expect(b.maxX).toBeLessThan(605);
  expect(b.minY).toBeGreaterThan(195);
  expect(b.maxY).toBeLessThan(405);
  expect(b.width).toBeGreaterThan(195);
});
