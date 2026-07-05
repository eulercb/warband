import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world';
import { zoneFadeAlpha } from '../src/render/entityView';
import { ZONE_FADE_IN, ZONE_FADE_OUT } from '../src/engine/constants';
import type { GroundZone } from '../src/engine/types';

const DT = 0.05;

function pushZone(w: World, duration: number): GroundZone {
  const zone: GroundZone = {
    id: w.allocId(),
    kind: 'voidZone',
    pos: { x: 800, y: 500 },
    radius: 90,
    side: 'boss',
    ownerId: w.boss!.id,
    damagePerTick: 0, // harmless so the fight can't end mid-test
    healPerTick: 0,
    duration,
    remaining: duration,
    tickAccum: 0,
  };
  w.groundZones.push(zone);
  return zone;
}

describe('ground zones: area effects disappear after a while', () => {
  it('removes a zone from the world once its duration elapses', () => {
    // Dragon has no zone-spawning abilities and will not act within this window
    // (its first decision is BOSS_DECISION_MIN=1.2s away), so the only zone is ours.
    const w = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [{ peerId: 'a', name: 'A', classId: 'ranger' }],
    });
    pushZone(w, 0.5);
    expect(w.groundZones.length).toBe(1);

    for (let t = 0; t < 0.6; t += DT) w.step(DT, new Map());

    expect(w.finished).toBe(false); // fight still running, so the sim kept ticking
    expect(w.groundZones.length).toBe(0); // ...and the zone is gone
  });
});

describe('zoneFadeAlpha: fade envelope', () => {
  const D = 8;

  it('is 0 for an expired zone', () => {
    expect(zoneFadeAlpha(0, D)).toBe(0);
    expect(zoneFadeAlpha(-1, D)).toBe(0);
  });

  it('ramps up from spawn over ZONE_FADE_IN', () => {
    expect(zoneFadeAlpha(D, D)).toBeCloseTo(0); // age 0 — just spawned
    expect(zoneFadeAlpha(D - ZONE_FADE_IN / 2, D)).toBeCloseTo(0.5);
    expect(zoneFadeAlpha(D - ZONE_FADE_IN, D)).toBeCloseTo(1); // fully faded in
  });

  it('is fully opaque through the middle of its life', () => {
    expect(zoneFadeAlpha(D / 2, D)).toBe(1);
  });

  it('ramps back down over ZONE_FADE_OUT toward expiry', () => {
    expect(zoneFadeAlpha(ZONE_FADE_OUT, D)).toBeCloseTo(1);
    expect(zoneFadeAlpha(ZONE_FADE_OUT / 2, D)).toBeCloseTo(0.5);
  });
});
