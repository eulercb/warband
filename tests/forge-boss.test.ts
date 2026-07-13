/**
 * Chaos Forge — BOSS synthesis (docs/CHAOS_FORGE.md §6). A synthesized monster is
 * a kit of donor abilities from different monsters, each jittered onto budget and
 * rider-grafted, with a GENERATED decide rule set (req. 9 — no ability it can't
 * cast) and a blended name. Every ability reuses one of the 9 shapes, so the boss
 * executor + telegraph-dodge run it unchanged.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { synthesizeMonster, setForgeSeed } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { MONSTERS, MONSTER_IDS, getMonster } from '../src/engine/content/monsters';
import { World } from '../src/engine/world/world';
import { Rng } from '../src/engine/core/math';
import type { BossDecisionCtx, MonsterDef } from '../src/engine/content/monsters';
import type { Boss } from '../src/engine/core/types';

afterEach(() => {
  setForgeSeed(null);
  setProceduralSeed(null);
});

const DONORS: MonsterDef[] = MONSTER_IDS.map((id) => MONSTERS[id]);

function ctx(over: Partial<BossDecisionCtx> = {}): BossDecisionCtx {
  return {
    boss: {} as Boss,
    hpFrac: 1,
    target: null,
    distToTarget: 0,
    anyInMelee: true,
    usable: () => true,
    rng: new Rng(1),
    ...over,
  };
}

describe('synthesizeMonster', () => {
  it('is deterministic per (seed, monster)', () => {
    for (const seed of [1, 42, 999]) {
      const a = synthesizeMonster(seed, MONSTERS.dragon, DONORS);
      const b = synthesizeMonster(seed, MONSTERS.dragon, DONORS);
      // decide is a function (not JSON-comparable) — compare the data instead.
      expect(JSON.stringify({ ...a, decide: undefined })).toBe(
        JSON.stringify({ ...b, decide: undefined }),
      );
    }
  });

  it('every monster fuses a valid, castable kit with preserved identity', () => {
    for (const seed of [3, 77]) {
      for (const id of MONSTER_IDS) {
        const base = MONSTERS[id];
        const m = synthesizeMonster(seed, base, DONORS);
        // Identity preserved.
        expect(m.id).toBe(base.id);
        expect(m.bodyShape).toBe(base.bodyShape);
        expect(m.color).toBe(base.color);
        expect(m.tier).toBe(base.tier);
        // A fused kit of the same size, with fresh ids and blended name.
        expect(m.abilities.length).toBe(base.abilities.length);
        expect(m.abilities.map((a) => a.id)).toEqual(base.abilities.map((_, i) => `f${i}`));
        expect(m.name).toMatch(/, the /);
        // Every ability reuses one of the 9 authored shapes.
        for (const ab of m.abilities) {
          // A telegraphed ability honors the readability floor; an instant one
          // (0 windup — e.g. a self-buff) has no telegraph to floor.
          expect(ab.windup === 0 || ab.windup >= 0.3).toBe(true);
          expect(ab.cooldown).toBeGreaterThan(0);
        }
        // The decide only ever names an ability the monster owns (req. 9).
        const owned = new Set(m.abilities.map((a) => a.id));
        const picked = m.decide(ctx());
        expect(picked === null || owned.has(picked)).toBe(true);
      }
    }
  });

  it('the generated decide always acts when everything is usable, and idles when nothing is', () => {
    const m = synthesizeMonster(5, MONSTERS.lich, DONORS);
    // Something is always castable (an unconditional fallback exists).
    expect(m.decide(ctx({ anyInMelee: true, distToTarget: 0 }))).not.toBeNull();
    expect(m.decide(ctx({ anyInMelee: false, distToTarget: 999 }))).not.toBeNull();
    // Nothing off cooldown → no action.
    expect(m.decide(ctx({ usable: () => false }))).toBeNull();
  });

  it('leaves the hidden practice dummy untouched', () => {
    expect(synthesizeMonster(1, MONSTERS.dummy, DONORS)).toBe(MONSTERS.dummy);
  });
});

describe('getMonster routing', () => {
  it('serves a synthesized monster while Forge is active, canonical when off', () => {
    expect(getMonster('dragon')).toBe(MONSTERS.dragon);
    setForgeSeed(2024);
    const forged = getMonster('dragon');
    expect(forged).not.toBe(MONSTERS.dragon);
    expect(forged.id).toBe('dragon');
    expect(forged.abilities[0].id).toBe('f0'); // synthesized ids
    expect(getMonster('dragon')).toBe(forged); // cached
    setForgeSeed(null);
    expect(getMonster('dragon')).toBe(MONSTERS.dragon);
  });

  it('takes precedence over numeric variance', () => {
    setProceduralSeed(11);
    setForgeSeed(11);
    expect(getMonster('troll').abilities[0].id).toBe('f0'); // forged
    setForgeSeed(null);
    expect(getMonster('troll').abilities[0].id).not.toBe('f0'); // variance keeps ids
  });
});

describe('a forged boss fights end to end', () => {
  it('spawns, decides and casts without error', () => {
    setForgeSeed(31337);
    const w = new World({
      monsterId: 'dragon',
      seed: 31337,
      players: [
        { peerId: 'p1', name: 'A', classId: 'knight' },
        { peerId: 'p2', name: 'B', classId: 'ranger' },
      ],
    });
    expect(w.boss).not.toBeNull();
    let cast = false;
    for (let t = 0; t < 200 && !w.finished; t++) {
      w.step(0.05, new Map());
      if (w.boss && w.boss.action.abilityId != null) cast = true;
      for (const p of w.players) expect(Number.isFinite(p.hp)).toBe(true);
      expect(Number.isFinite(w.boss?.hp ?? 0)).toBe(true);
    }
    expect(cast).toBe(true); // the forged boss actually used its generated kit
  });
});
