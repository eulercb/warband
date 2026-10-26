import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { drawOpportunityMarker, opportunityAnchor } from '../src/render/overlays/opportunityMarker';

describe('actionable target marker', () => {
  it('uses the roomier side of a phone, away from the enemy name and buff rows', () => {
    expect(opportunityAnchor({ x: 280, y: 180, radius: 30 }, { w: 320, h: 568 })).toEqual({
      x: 224,
      y: 180,
      side: -1,
    });
    expect(opportunityAnchor({ x: 40, y: 180, radius: 30 }, { w: 320, h: 568 })).toEqual({
      x: 96,
      y: 180,
      side: 1,
    });
  });

  it('keeps the badge on screen at edges, even with an oversized or partly offscreen enemy', () => {
    const viewport = { w: 320, h: 568 };
    for (const target of [
      { x: 315, y: 0, radius: 400 },
      { x: 5, y: 568, radius: 400 },
      { x: 400, y: 700, radius: 10 },
      { x: -100, y: -100, radius: 10 },
    ]) {
      const anchor = opportunityAnchor(target, viewport);
      expect(anchor.x).toBeGreaterThanOrEqual(18);
      expect(anchor.x).toBeLessThanOrEqual(302);
      expect(anchor.y).toBeGreaterThanOrEqual(18);
      expect(anchor.y).toBeLessThanOrEqual(550);
    }
  });

  it('keeps the same opaque screen-space footprint on bosses and small adds at different zooms', () => {
    const widths: number[] = [];
    for (const radius of [4, 15, 80]) {
      const g = new Graphics();
      drawOpportunityMarker(g, { x: 640, y: 400, radius }, { w: 1280, h: 800 });
      const gold = g.context.instructions.filter(
        (i) => i.action === 'fill' && i.data.style.color === 0xffd66b,
      );
      expect(gold).toHaveLength(1);
      expect(gold[0]).toMatchObject({ data: { style: { alpha: 1 } } });
      widths.push(g.getBounds().width);
      g.destroy();
    }
    expect(widths[0]).toBeGreaterThanOrEqual(40);
    expect(widths[1]).toBeCloseTo(widths[0]);
    expect(widths[2]).toBeCloseTo(widths[0]);
  });
});
