/**
 * Warband — pure label-declutter helpers for world-anchored captions (item 78).
 *
 * Every world-anchored text element (entity name labels, speech balloons,
 * reward-room relic labels, war-room effigy labels) is drawn by the renderer at a
 * fixed offset above its anchor, with no collision handling — so neighbouring
 * captions merged, balloons z-fought name labels, and labels near the arena's top
 * edge slid under the fixed boss bar. These helpers own the small amount of maths
 * that fixes that; they are pure and unit-tested, and the Pixi renderer (a layer
 * excluded from coverage) just applies the numbers.
 */

/**
 * Alpha multiplier in [0,1] that fades a world label out as it enters the top
 * `band` px of the viewport — the zone the fixed boss bar / HP readout occupy.
 * Fully opaque at or below `band`, fading linearly to 0 at the very top edge, so
 * world text thins out under the HUD instead of colliding with it. A non-positive
 * band disables the fade (returns 1).
 */
export function topBandFade(screenY: number, band: number): number {
  if (band <= 0) return 1;
  if (screenY >= band) return 1;
  if (screenY <= 0) return 0;
  return screenY / band;
}

/**
 * Extra UPWARD offset (px) for the label of the `index`-th prop in a packed row
 * (reward relics, war-room effigies). Even indices sit on the base row; odd ones
 * lift by `rowHeight`, so two horizontally-adjacent captions never render on the
 * same line even when the props are closer together than a label is wide.
 */
export function staggerOffset(index: number, rowHeight: number): number {
  return (Math.abs(Math.trunc(index)) % 2) * rowHeight;
}
