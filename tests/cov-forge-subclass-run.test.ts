/**
 * Coverage — subclass SYNTHESIS under an active Chaos Forge run: `subclassesFor`
 * routes through `getSubclass`, which recombines each sub-skill from cross-subclass
 * components and renames the subclass after the subclasses that donated the most
 * components. Asserts the forged subclasses are structurally valid + deterministic.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setForgeSeed } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { subclassesFor, getSubclass, getSubSkill } from '../src/engine/content/subclasses';
import { describeAbility } from '../src/engine/content/classes';

afterEach(() => {
  setForgeSeed(null);
  setProceduralSeed(null);
});

describe('subclass synthesis under a Forge run', () => {
  it('subclassesFor yields recombined, renamed, valid subclasses', () => {
    setForgeSeed(4242);
    const subs = subclassesFor('knight');
    expect(subs.length).toBeGreaterThan(0);
    for (const sub of subs) {
      expect(sub.skills).toHaveLength(4); // structure preserved
      expect(sub.name.length).toBeGreaterThan(0); // renamed after top donor subclasses
      for (const sk of sub.skills) {
        expect(sk.ability.name.length).toBeGreaterThan(0);
        expect(describeAbility(sk.ability)).not.toMatch(/NaN|undefined/);
      }
    }
  });

  it('getSubclass / getSubSkill are seed-deterministic in a Forge run', () => {
    setForgeSeed(4242);
    const a = getSubclass('kn_champion')!;
    const aSkill = getSubSkill('kn_champion_slam')!;
    setForgeSeed(null);
    setForgeSeed(4242);
    const b = getSubclass('kn_champion')!;
    const bSkill = getSubSkill('kn_champion_slam')!;
    expect(b.name).toBe(a.name);
    expect(JSON.stringify(b.skills)).toBe(JSON.stringify(a.skills));
    expect(bSkill.name).toBe(aSkill.name);
    // A forged subclass differs from the canonical one (its name is reblended).
    setForgeSeed(null);
    const canon = getSubclass('kn_champion')!;
    expect(canon.name).toBe('Champion');
    expect(a.name).not.toBe('Champion'); // the Forge run actually reblended the name
  });
});
