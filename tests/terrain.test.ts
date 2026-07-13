import { describe, it, expect } from 'vitest';
import { generateTerrain, themeFor } from '../src/engine/world/terrain';
import { World } from '../src/engine/world/world';
import {
  TERRAIN_MAX_PATCHES,
  TERRAIN_SPAWN_CLEARANCE,
  ARENA_W,
  ARENA_H,
} from '../src/engine/core/constants';
import type { InputCommand } from '../src/engine/core/types';

const DT = 0.05;

function counter(): () => number {
  let n = 1;
  return () => n++;
}

describe('terrain: generation', () => {
  it('is deterministic for a given (monster, seed)', () => {
    const a = generateTerrain('dragon', 12345, counter());
    const b = generateTerrain('dragon', 12345, counter());
    expect(a.length).toBe(b.length);
    a.forEach((pa, i) => {
      expect(pa.kind).toBe(b[i].kind);
      expect(pa.pos.x).toBeCloseTo(b[i].pos.x);
      expect(pa.pos.y).toBeCloseTo(b[i].pos.y);
      expect(pa.radius).toBeCloseTo(b[i].radius);
    });
  });

  it('produces a themed, bounded number of patches', () => {
    const dragon = generateTerrain('dragon', 7, counter());
    expect(dragon.length).toBeGreaterThanOrEqual(1);
    expect(dragon.length).toBeLessThanOrEqual(TERRAIN_MAX_PATCHES);
    for (const p of dragon) expect(['magma', 'ember']).toContain(p.kind);

    for (const p of generateTerrain('troll', 7, counter())) {
      expect(['swamp', 'bog']).toContain(p.kind);
    }
    for (const p of generateTerrain('lich', 7, counter())) {
      expect(['ice', 'deathfog']).toContain(p.kind);
    }
  });

  it('gives signature bosses their own arena hazards (item 28)', () => {
    // The Kraken drags you into a surging tide; the Bandit fights on an abyss.
    for (const p of generateTerrain('kraken', 9, counter())) {
      expect(['tide', 'bog']).toContain(p.kind);
    }
    // Every bandit patch is drawn from its theme, and the abyss shows up across
    // a spread of seeds (weighted, so any single seed may skip it).
    let sawAbyss = false;
    for (let seed = 1; seed <= 20; seed++) {
      for (const p of generateTerrain('bandit', seed * 7, counter())) {
        expect(['abyss', 'bog']).toContain(p.kind);
        if (p.kind === 'abyss') sawAbyss = true;
      }
    }
    expect(sawAbyss).toBe(true);
  });

  it('keeps patches inside the arena and clear of the spawn/boss anchors', () => {
    const spawn = { x: ARENA_W / 2, y: ARENA_H - 220 };
    const boss = { x: ARENA_W / 2, y: 300 };
    for (let seed = 1; seed <= 25; seed++) {
      for (const patch of generateTerrain('troll', seed * 31, counter())) {
        expect(patch.pos.x - patch.radius).toBeGreaterThanOrEqual(-0.01);
        expect(patch.pos.x + patch.radius).toBeLessThanOrEqual(ARENA_W + 0.01);
        const dSpawn = Math.hypot(patch.pos.x - spawn.x, patch.pos.y - spawn.y);
        const dBoss = Math.hypot(patch.pos.x - boss.x, patch.pos.y - boss.y);
        expect(dSpawn).toBeGreaterThanOrEqual(patch.radius + TERRAIN_SPAWN_CLEARANCE - 0.5);
        expect(dBoss).toBeGreaterThanOrEqual(patch.radius + TERRAIN_SPAWN_CLEARANCE - 0.5);
      }
    }
  });
});

describe('terrain: themeFor', () => {
  // DEFAULT_THEME is module-private; its value is ['ember', 'bog', 'ice'].
  const DEFAULT_THEME = ['ember', 'bog', 'ice'];

  it('themes a boss from its arena kinds', () => {
    expect(themeFor(['dragon'])).toEqual(['magma', 'ember']);
    expect(themeFor(['lich'])).toEqual(['ice', 'deathfog']);
  });

  it('falls back to the default mix for a boss with no explicit theme (?? DEFAULT_THEME, L155)', () => {
    // The hidden training dummy carries no THEMES entry, so the nullish fallback fires.
    expect(themeFor(['dummy'])).toEqual(DEFAULT_THEME);
  });

  it('a twin of same-themed bosses dedupes shared kinds (the !includes false arm, L156)', () => {
    // Troll and Treant both theme to ['swamp', 'bog']; the second boss's kinds are
    // already present, so every push is skipped — the blended set has no duplicates.
    expect(themeFor(['troll', 'treant'])).toEqual(['swamp', 'bog']);
  });

  it('a twin of differently-themed bosses blends both arenas in order', () => {
    // Kraken ['tide','bog'] + Dragon ['magma','ember']; bog is unique to each list-head.
    expect(themeFor(['kraken', 'dragon'])).toEqual(['tide', 'bog', 'magma', 'ember']);
  });

  it('an empty encounter returns a fresh copy of the default theme (: DEFAULT_THEME, L159)', () => {
    const got = themeFor([]);
    expect(got).toEqual(DEFAULT_THEME);
    // It is a copy (spread), not the shared module constant — mutating it is safe.
    got.push('magma');
    expect(themeFor([])).toEqual(DEFAULT_THEME);
  });
});

describe('terrain: effects in the world', () => {
  it('a fresh fight has terrain and at least the requested minimum', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 99,
      players: [{ peerId: 'a', name: 'A', classId: 'ranger' }],
    });
    expect(w.terrain.length).toBeGreaterThanOrEqual(1);
    // The snapshot exposes terrain to clients.
    expect(w.serialize().terrain.length).toBe(w.terrain.length);
  });

  it('damages and slows a player standing in a magma patch', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 4,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    w.boss = null; // isolate terrain from boss damage
    // Force one damaging patch under the player.
    const p = w.players[0];
    w.terrain = [
      {
        id: w.allocId(),
        kind: 'magma',
        pos: { x: p.pos.x, y: p.pos.y },
        radius: 120,
        damagePerTick: 9,
        slowMult: 0.6,
        slowDuration: 1.2,
        tickAccum: 0,
      },
    ];
    const before = p.hp;
    const zero: InputCommand = {
      seq: 0,
      move: { x: 0, y: 0 },
      aim: { x: 1, y: 0 },
      buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
    };
    for (let t = 0; t < 1.2; t += DT) w.step(DT, new Map([['a', zero]]));
    expect(p.hp).toBeLessThan(before); // took contact damage
    expect(p.buffs.some((b) => b.source === 'terrain' && b.kind === 'moveSpeed')).toBe(true);
  });
});
