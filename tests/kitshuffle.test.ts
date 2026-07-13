import { describe, it, expect } from 'vitest';
import { draftedClassFor, draftedMonsterFor } from '../src/engine/content/kitshuffle';
import { CLASS_IDS, CLASSES, getClass } from '../src/engine/content/classes';
import { MONSTER_IDS, MONSTERS } from '../src/engine/content/monsters';
import { World } from '../src/engine/world/world';
import type { AbilitySlot } from '../src/engine/core/types';
import {
  rollCharChoices,
  describeCharOffer,
  CHAR_UPGRADES,
  CHAR_UPGRADES_BY_CLASS,
} from '../src/engine/content/charUpgrades';

// Fake peer ids + a mix of seeds.
const PEERS = ['peerA', 'peerB', 'peerC', 'host-xyz', 'bot-1'];
const SEEDS = [1, 42, 1337, 987654321, 0xdeadbeef];

describe('kitshuffle — Chaos Draft (item 10)', () => {
  it('drafts a valid class, deterministically per (seed, peer)', () => {
    for (const seed of SEEDS) {
      for (const peer of PEERS) {
        const c = draftedClassFor(seed, peer);
        expect(CLASS_IDS).toContain(c); // always a real class
        expect(draftedClassFor(seed, peer)).toBe(c); // deterministic → every peer agrees
      }
    }
  });

  it('drafts a valid, non-hidden monster, deterministically per (seed, monster)', () => {
    for (const seed of SEEDS) {
      for (const m of MONSTER_IDS) {
        const d = draftedMonsterFor(seed, m);
        expect(MONSTER_IDS).toContain(d); // a real, live boss
        expect(MONSTERS[d].hidden ?? false).toBe(false); // never the practice dummy
        expect(draftedMonsterFor(seed, m)).toBe(d); // deterministic
      }
    }
  });

  it('varies the class draft across seeds and across peers', () => {
    // Different seeds give a different assignment for at least some peer…
    const bySeed1 = PEERS.map((p) => draftedClassFor(1, p));
    const bySeed2 = PEERS.map((p) => draftedClassFor(2, p));
    expect(bySeed1).not.toEqual(bySeed2);
    // …and within one seed the party isn't forced to a single class.
    expect(new Set(PEERS.map((p) => draftedClassFor(42, p))).size).toBeGreaterThan(1);
  });

  it('varies the boss draft across seeds', () => {
    expect(MONSTER_IDS.map((m) => draftedMonsterFor(1, m))).not.toEqual(
      MONSTER_IDS.map((m) => draftedMonsterFor(2, m)),
    );
  });

  it("a drafted hero is offered its DRAFTED class's correct upgrades (foreign kit → correct upgrade)", () => {
    // The core item-10 invariant: whatever class the seed deals you, the reward
    // offers are THAT class's own boons (keyed by the effective class), so a hero
    // dealt the Mage kit is offered the Mage's Fireball upgrade, never a mismatch.
    for (const seed of SEEDS) {
      for (const peer of PEERS) {
        const drafted = draftedClassFor(seed, peer);
        const pool = new Set(CHAR_UPGRADES_BY_CLASS[drafted].map((d) => d.id));
        // The between-boss roll for the drafted class draws only that class's boons.
        const rng = (() => {
          let s = seed >>> 0;
          return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        })();
        for (const id of rollCharChoices(drafted, 3, rng)) {
          // The card resolves against the drafted class (its correct "Now →" values).
          expect(describeCharOffer(drafted, [], id)).not.toBeNull();
          // Every pick is either a boon from the DRAFTED class's own pool or a
          // class-agnostic hybrid — never another class's slot upgrade.
          const native = pool.has(id);
          const hybrid = CHAR_UPGRADES[id]?.classId === 'any';
          expect(native || hybrid).toBe(true);
        }
        // …and the drafted class resolves to a real kit.
        expect(CLASSES[drafted]).toBeTruthy();
      }
    }
  });

  it('a World built from a drafted roster + boss spawns coherent, correct kits (item 10)', () => {
    // End-to-end: the host bakes drafted classes/monster into the World roster; the
    // sim must spawn each hero with their DRAFTED class's real, coherent kit, and the
    // drafted boss. (Whole-class drafts, so nothing is a cross-class Frankenstein.)
    const seed = 12345;
    const peers = ['pa', 'pb', 'pc'];
    const world = new World({
      monsterId: draftedMonsterFor(seed, 'dragon'),
      seed,
      players: peers.map((p) => ({ peerId: p, name: p, classId: draftedClassFor(seed, p) })),
    });
    world.players.forEach((pl, i) => {
      const drafted = draftedClassFor(seed, peers[i]);
      expect(pl.classId).toBe(drafted); // plays the class it was dealt
      const kit = getClass(drafted).abilities;
      for (const slot of ['basic', 'a1', 'a2', 'a3'] as AbilitySlot[]) {
        // Each slot holds that same class's real ability — a whole coherent kit.
        expect(pl.abilities?.[slot].name).toBe(kit[slot].name);
        expect(pl.abilities?.[slot].kind).toBe(kit[slot].kind);
      }
    });
    expect(world.boss?.monsterId).toBe(draftedMonsterFor(seed, 'dragon'));
  });
});
