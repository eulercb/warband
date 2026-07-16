/**
 * Chaos Forge — SUBCLASS + sub-skill synthesis (docs/CHAOS_FORGE.md §9, item 5).
 * getSubSkill / getSubclass resolve a component-recombined fusion while a Forge seed
 * is active (blended names, composed abilities, subclass renamed after donor
 * subclasses), fall back to canonical/variance when off, and every peer with the same
 * seed derives identical content.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setForgeSeed } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import {
  getSubSkill,
  getSubclass,
  subclassOfSkill,
  ALL_SUBCLASSES,
} from '../src/engine/content/subclasses';
import { describeAbility } from '../src/engine/content/classes';

const SKILL = 'kn_champion_slam';
const SUB = subclassOfSkill(SKILL)!; // canonical owner

afterEach(() => {
  setForgeSeed(null);
  setProceduralSeed(null);
});

describe('Chaos Forge subclass synthesis', () => {
  it('serves a canonical sub-skill (no components) when Forge is off', () => {
    expect(getSubSkill(SKILL)!.ability.components).toBeUndefined();
    expect(getSubclass(SUB.id)!.name).toBe(SUB.name);
  });

  it('synthesizes a composed sub-skill with a fresh name while Forge is active', () => {
    setForgeSeed(4242);
    const sk = getSubSkill(SKILL)!;
    expect(sk.id).toBe(SKILL); // identity (id/icon) preserved for lookups
    expect(sk.ability.components).toBeDefined(); // recombined, not canonical
    expect(sk.desc.length).toBeGreaterThan(0);
    expect(describeAbility(sk.ability)).not.toMatch(/NaN|undefined/);
  });

  it('renames a synthesized subclass after its donor subclasses and composes every skill', () => {
    setForgeSeed(1234);
    const sub = getSubclass(SUB.id)!;
    expect(sub.id).toBe(SUB.id); // identity preserved
    expect(sub.name.length).toBeGreaterThan(0);
    expect(sub.skills).toHaveLength(SUB.skills.length);
    for (const sk of sub.skills) expect(sk.ability.components).toBeDefined();
  });

  it('keeps getSubSkill consistent with the same skill inside getSubclass', () => {
    setForgeSeed(999);
    const solo = getSubSkill(SKILL)!;
    const inSub = getSubclass(SUB.id)!.skills.find((s) => s.id === SKILL)!;
    expect(JSON.stringify(solo)).toBe(JSON.stringify(inSub)); // one derivation, two paths
  });

  it('two peers with the same seed derive identical sub-skills', () => {
    setForgeSeed(777);
    const a = JSON.stringify(getSubSkill(SKILL));
    setForgeSeed(null);
    setForgeSeed(777);
    const b = JSON.stringify(getSubSkill(SKILL));
    expect(a).toBe(b);
  });

  it('reverts to canonical once the Forge seed clears', () => {
    setForgeSeed(4242);
    expect(getSubSkill(SKILL)!.ability.components).toBeDefined();
    setForgeSeed(null);
    expect(getSubSkill(SKILL)!.ability.components).toBeUndefined();
  });

  it('every subclass synthesizes coherent, describable skills under Forge', () => {
    setForgeSeed(0xbead);
    for (const canon of ALL_SUBCLASSES) {
      const sub = getSubclass(canon.id)!;
      expect(sub.id).toBe(canon.id);
      for (const sk of sub.skills) {
        expect(sk.ability.components).toBeDefined();
        expect(describeAbility(sk.ability)).not.toMatch(/NaN|undefined/);
      }
    }
  });
});
