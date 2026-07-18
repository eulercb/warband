/**
 * Chaos Forge — the active-run registry + getter routing (docs/CHAOS_FORGE.md).
 * getClass resolves a synthesized FUSION while a Forge seed is active, falls back
 * to numeric-variance / canonical when it is off, and every peer with the same
 * seed derives identical content.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setForgeSeed, forgeSeed, forgeVariant } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { CLASSES, CLASS_IDS, getClass, describeAbility } from '../src/engine/content/classes';
import type { AbilitySlot } from '../src/engine/core/types';

const SLOTS: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];

// Forge and procgen share the process-global registries; reset both after each
// test so nothing leaks into sibling suites (their determinism assertions rely
// on canonical content being served when no run is active).
afterEach(() => {
  setForgeSeed(null);
  setProceduralSeed(null);
});

describe('Chaos Forge active-run registry', () => {
  it('serves a synthesized fusion while active, cached, then reverts', () => {
    expect(forgeSeed()).toBeNull();
    expect(getClass('mage')).toBe(CLASSES.mage); // off → canonical

    setForgeSeed(4242);
    expect(forgeSeed()).toBe(4242);
    const mage = getClass('mage');
    expect(mage).not.toBe(CLASSES.mage); // synthesized, not canonical
    expect(mage.id).toBe('mage'); // identity preserved
    for (const slot of SLOTS) expect(mage.abilities[slot].components).toBeDefined();
    expect(getClass('mage')).toBe(mage); // one cached object per run

    setForgeSeed(null);
    expect(getClass('mage')).toBe(CLASSES.mage); // reverts to canonical
  });

  it('every class synthesizes a coherent, describable kit under Forge', () => {
    setForgeSeed(1234);
    for (const cid of CLASS_IDS) {
      const c = getClass(cid);
      expect(c.id).toBe(cid);
      expect(c.name.length).toBeGreaterThan(0);
      for (const slot of SLOTS) {
        expect(c.abilities[slot].components).toBeDefined();
        expect(describeAbility(c.abilities[slot])).not.toMatch(/NaN|undefined/);
      }
    }
  });

  it('two peers with the same seed derive identical fusions', () => {
    setForgeSeed(777);
    const a = JSON.stringify(getClass('rogue'));
    setForgeSeed(null);
    setForgeSeed(777);
    const b = JSON.stringify(getClass('rogue'));
    expect(a).toBe(b);
  });

  it('Forge takes precedence over numeric variance when both are active', () => {
    setProceduralSeed(99);
    setForgeSeed(99);
    // Forge wins in the getter → a synthesized (component-carrying) kit.
    expect(getClass('knight').abilities.a1.components).toBeDefined();
    // With only the procedural seed, it is a numeric variant (no components).
    setForgeSeed(null);
    expect(getClass('knight').abilities.a1.components).toBeUndefined();
    expect(getClass('knight')).not.toBe(CLASSES.knight); // still a variance roll
  });

  it('forgeVariant returns null when no Forge run is active', () => {
    expect(forgeVariant('class', 'knight', () => 'x')).toBeNull();
    setForgeSeed(5);
    expect(forgeVariant('thing', 'id', () => 'made')).toBe('made');
  });

  // item 3 — the lobby class-picker/roster/cards read class identity through
  // getClass, so a Forge run shows the FORGED name (not the base class name).
  it('a forged class carries a fused NAME distinct from the base (item 3)', () => {
    setForgeSeed(4242);
    // Every base name is renamed for the run; at least most differ from canonical.
    const renamed = CLASS_IDS.filter((cid) => getClass(cid).name !== CLASSES[cid].name);
    expect(renamed.length).toBeGreaterThan(CLASS_IDS.length / 2);
    // The name a picker/card would show comes from getClass, so for a renamed class it shows
    // the FORGED name the engine plays — never the canonical one still sitting in CLASSES.
    const sample = renamed[0];
    expect(getClass(sample).name).not.toBe(CLASSES[sample].name);
  });

  // item 4 — vitals are RECOMPUTED from the fused kit, not inherited: in the canonical
  // envelope, and at least some class ends up with stats that differ from its base.
  it('forged classes derive HP/speed/threat in-band, not inherited from the base (item 4)', () => {
    setForgeSeed(4242);
    let anyChanged = false;
    for (const cid of CLASS_IDS) {
      const c = getClass(cid);
      expect(c.maxHp).toBeGreaterThanOrEqual(100);
      expect(c.maxHp).toBeLessThanOrEqual(240);
      expect(c.moveSpeed).toBeGreaterThanOrEqual(190);
      expect(c.moveSpeed).toBeLessThanOrEqual(252);
      expect(c.threatMult).toBeGreaterThanOrEqual(0.5);
      expect(c.threatMult).toBeLessThanOrEqual(1.5);
      const base = CLASSES[cid];
      if (
        c.maxHp !== base.maxHp ||
        c.moveSpeed !== base.moveSpeed ||
        c.threatMult !== base.threatMult
      ) {
        anyChanged = true;
      }
    }
    expect(anyChanged).toBe(true); // the derivation actually re-tunes vitals
  });

  it('forged names + vitals are seed-reproducible across peers (item 3/4)', () => {
    setForgeSeed(2024);
    const snap = (cid: (typeof CLASS_IDS)[number]) => {
      const c = getClass(cid);
      return { name: c.name, maxHp: c.maxHp, moveSpeed: c.moveSpeed, threatMult: c.threatMult };
    };
    const a = CLASS_IDS.map(snap);
    setForgeSeed(null);
    setForgeSeed(2024);
    const b = CLASS_IDS.map(snap);
    expect(a).toEqual(b);
  });
});

describe('store integration — Chaos Forge activation from the run seed', () => {
  it('the flag + run seed sync the Forge registry; reset clears both', async () => {
    const { useStore } = await import('../src/ui/state/store');
    const st = () => useStore.getState();
    st().setActiveChaosForge(true);
    expect(forgeSeed()).toBeNull(); // flag on, but no seed yet
    st().setActiveRunSeed(31337);
    expect(forgeSeed()).toBe(31337); // seed arrives → synthesis on
    st().setActiveChaosForge(false);
    expect(forgeSeed()).toBeNull(); // flag off → synthesis off (seed stays)
    st().setActiveChaosForge(true);
    expect(forgeSeed()).toBe(31337);
    st().setChaosForge(true); // host setting is independent of the active mirror
    expect(st().chaosForge).toBe(true);
    st().reset(); // leaving the run ends synthesis
    expect(forgeSeed()).toBeNull();
    expect(st().activeChaosForge).toBe(false);
    st().setChaosForge(false); // tidy the shared store singleton for sibling suites
  });
});
