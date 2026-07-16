/**
 * Chaos Forge — char-upgrade synthesis (docs/CHAOS_FORGE.md §9, item 6). In a Forge run
 * a class boon (a) genuinely improves the FUSED skill it targets — a buff/zone/heal tweak
 * flows into the fused skill's components instead of no-opping — and (b) is re-presented
 * via getCharUpgrade with a name blended for that fused skill. Canonical when off.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setForgeSeed } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import {
  CHAR_UPGRADES,
  getCharUpgrade,
  describeCharOffer,
  previewAbilityTable,
  previewSubAbility,
  applySubSkillUpgrades,
} from '../src/engine/content/charUpgrades';
import type { Player } from '../src/engine/core/types';

afterEach(() => {
  setForgeSeed(null);
  setProceduralSeed(null);
});

describe('Chaos Forge char-upgrade synthesis', () => {
  it('getCharUpgrade is byte-identical to the canonical def when Forge is off', () => {
    expect(getCharUpgrade('kn_bulwark')).toBe(CHAR_UPGRADES['kn_bulwark']);
    expect(getCharUpgrade('not_a_real_boon')).toBeUndefined();
  });

  it('re-presents a skill-targeting boon for its fused skill while Forge is active', () => {
    const off = getCharUpgrade('kn_bulwark')!;
    setForgeSeed(4242);
    const on = getCharUpgrade('kn_bulwark')!;
    expect(on.id).toBe('kn_bulwark'); // identity preserved for offers + replay
    expect(on.apply).toBe(off.apply); // SAME apply — it flows through the components refresh
    expect(on.name.length).toBeGreaterThan(0);
    expect(on.desc).toMatch(/empowers your/i); // regenerated to reference the fused skill
  });

  it('leaves a stat-only boon (no target slot) exactly as authored under Forge', () => {
    setForgeSeed(4242);
    const secondwind = getCharUpgrade('kn_secondwind')!; // +regen — touches no ability slot
    expect(secondwind.name).toBe(CHAR_UPGRADES['kn_secondwind'].name);
    expect(secondwind.desc).toBe(CHAR_UPGRADES['kn_secondwind'].desc);
  });

  it('a component-sourced boon meaningfully changes a fused skill (no longer a no-op)', () => {
    setForgeSeed(4242);
    const before = previewAbilityTable('knight', []);
    const after = previewAbilityTable('knight', ['kn_bulwark']); // tugs a2's buff (component-sourced)
    // The fused a2's COMPONENTS differ — the boon flowed through instead of no-opping.
    expect(after.a2.components).toBeDefined();
    expect(JSON.stringify(after.a2.components)).not.toBe(JSON.stringify(before.a2.components));
  });

  it('the offer card shows the reforged boon name + a real fused-skill preview', () => {
    setForgeSeed(4242);
    const view = describeCharOffer('knight', [], 'kn_bulwark')!;
    expect(view.label).toContain(getCharUpgrade('kn_bulwark')!.name);
    expect(view.desc).toMatch(/empowers your/i);
  });

  it('two peers with the same seed derive the same reforged boon', () => {
    setForgeSeed(777);
    const a = JSON.stringify({ ...getCharUpgrade('mg_freeze'), apply: undefined });
    setForgeSeed(null);
    setForgeSeed(777);
    const b = JSON.stringify({ ...getCharUpgrade('mg_freeze'), apply: undefined });
    expect(a).toBe(b);
  });

  it('reverts to the canonical boon once the Forge seed clears', () => {
    setForgeSeed(4242);
    expect(getCharUpgrade('kn_bulwark')!.desc).toMatch(/empowers your/i);
    setForgeSeed(null);
    expect(getCharUpgrade('kn_bulwark')).toBe(CHAR_UPGRADES['kn_bulwark']);
  });

  it('reforges a base-skill GRAND capstone for its fused slot', () => {
    setForgeSeed(4242);
    const grand = getCharUpgrade('kn_gk_a3_a')!; // Skullcracker — a skill grand on a3
    expect(grand.grand).toBe(true);
    expect(grand.desc).toMatch(/Reforged capstone/i);
  });

  it('leaves a cross-class hybrid boon (classId "any") as authored under Forge', () => {
    setForgeSeed(4242);
    const hy = getCharUpgrade('hy_pyromancer')!;
    expect(hy.desc).toBe(CHAR_UPGRADES['hy_pyromancer'].desc); // grafts swap kits, not renamed
  });

  it('flows a Honed sub-skill boon into a fused sub-skill (preview + sim paths)', () => {
    setForgeSeed(4242);
    // Preview path (previewSubAbility).
    const before = previewSubAbility('kn_champion_slam', [])!;
    const after = previewSubAbility('kn_champion_slam', ['subup_kn_champion_slam'])!;
    expect(after.components).toBeDefined();
    expect(JSON.stringify(after.components)).not.toBe(JSON.stringify(before.components));

    // Sim path (applySubSkillUpgrades on a bound sub-ability).
    const sub1 = { ...before, slot: 'sub1' as const }; // the fused sub-skill, no boons yet
    const baseComp = JSON.stringify(sub1.components);
    const player = {
      classId: 'knight',
      subSkillIds: ['kn_champion_slam'],
      subAbilities: { sub1 },
      abilities: {},
    } as unknown as Player;
    applySubSkillUpgrades(player, ['subup_kn_champion_slam']);
    expect(JSON.stringify(player.subAbilities!.sub1!.components)).not.toBe(baseComp);
  });
});
