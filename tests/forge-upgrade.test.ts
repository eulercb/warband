/**
 * Chaos Forge — char-upgrade synthesis (docs/CHAOS_FORGE.md §9, item 6). In a Forge run
 * a class boon (a) genuinely improves the FUSED skill it targets — a buff/zone/heal tweak
 * flows into the fused skill's components instead of no-opping — and (b) is re-presented
 * via getCharUpgrade with a name blended for that fused skill. Canonical when off.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setForgeSeed, refreshComponents } from '../src/engine/content/forge';
import type { AbilityComponents, EffectComponent } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import {
  CHAR_UPGRADES,
  getCharUpgrade,
  describeCharOffer,
  previewAbilityTable,
  previewSubAbility,
  applySubSkillUpgrades,
} from '../src/engine/content/charUpgrades';
import { CLASS_IDS, type PlayerAbilityDef } from '../src/engine/content/classes';
import { getSubSkill, getSubclass } from '../src/engine/content/subclasses';
import type { Player, AbilitySlot, ClassId } from '../src/engine/core/types';

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

  // item 2 — across MANY seeds and MANY boons, every skill-targeting class boon
  // MEANINGFULLY APPLIES to the fused kit: applying it changes the kit (flat fields
  // reach the def; effect fields reach the components — see the direct axis test
  // above), never a total no-op. Also proves the reforge is seed-deterministic.
  it('every skill-targeting class boon meaningfully changes the fused kit across seeds', () => {
    const SLOTS = ['basic', 'a1', 'a2', 'a3'] as const;
    const kitStr = (t: Record<AbilitySlot, PlayerAbilityDef>): string =>
      SLOTS.map((s) => JSON.stringify(t[s])).join('|');
    // Skill-targeting boons: those whose apply changes the CANONICAL kit at all. Each
    // carries its narrowed base ClassId (skip 'any'-class hybrids — they graft, not tune).
    const boons = Object.values(CHAR_UPGRADES)
      .map((up) => ({ up, cid: up.classId as ClassId }))
      .filter(({ up, cid }) => {
        if (!CLASS_IDS.includes(cid)) return false;
        return kitStr(previewAbilityTable(cid, [])) !== kitStr(previewAbilityTable(cid, [up.id]));
      });
    expect(boons.length).toBeGreaterThan(20);

    for (const seed of [1, 7, 4242, 271828]) {
      setForgeSeed(seed);
      for (const { up, cid } of boons) {
        const before = kitStr(previewAbilityTable(cid, []));
        const after = kitStr(previewAbilityTable(cid, [up.id]));
        expect(after, `${up.id}@${seed}`).not.toBe(before); // the boon lands on the fused kit
      }
      setForgeSeed(null);
    }
  });

  // item 3 — subclass-skill "Honed X" upgrades now generate a fresh Forge name (they
  // used to keep the authored "Honed <original skill>" name).
  it('a sub-skill upgrade gets a fresh reforged name + a description naming the fused skill', () => {
    const id = 'subup_kn_champion_slam'; // authored "Honed Earthshaker"
    const off = getCharUpgrade(id)!;
    expect(off.name).toMatch(/^Honed /); // canonical off-Forge
    setForgeSeed(4242);
    const on = getCharUpgrade(id)!;
    expect(on.name).not.toBe(off.name); // reforged, not the authored name
    expect(on.apply).toBe(off.apply); // apply preserved (flows via components)
    const fused = getSubSkill('kn_champion_slam')!;
    expect(on.desc).toContain(fused.name); // copy names the run's blended sub-skill
    expect(on.desc).not.toBe(off.desc); // regenerated
  });

  // item 4 — subclass grands rename AND their descriptions reference the run's blended
  // subclass name instead of the original ("Your Champion skills…" → the fused name).
  it('a subclass grand gets a fresh name + a description naming the blended subclass', () => {
    const id = 'kn_champion_g_a'; // "Unbroken Champion" — "Your Champion skills strike 50% harder…"
    const off = getCharUpgrade(id)!;
    expect(off.desc).toContain('Champion'); // authored: names the canonical subclass
    setForgeSeed(4242);
    const on = getCharUpgrade(id)!;
    expect(on.name).not.toBe(off.name); // renamed
    expect(on.apply).toBe(off.apply);
    const fused = getSubclass('kn_champion')!;
    expect(on.desc).toContain(fused.name); // now names the blended subclass
    expect(on.desc).not.toBe(off.desc); // no longer the original static copy
  });

  // item 4 — stat-only class capstones also get a fresh reforged name.
  it('a stat-only class capstone gets a fresh reforged name', () => {
    const id = 'kn_grand_immovable'; // touches only player stats (no ability slot)
    const off = getCharUpgrade(id)!;
    setForgeSeed(4242);
    const on = getCharUpgrade(id)!;
    expect(on.name).not.toBe(off.name);
    expect(on.apply).toBe(off.apply); // stat capstone still applies as authored
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

// ---------------------------------------------------------------------------
// refreshComponents — the flat→components patch behind item 6. These drive it
// DIRECTLY (seed-independent) to prove the properties a components-inequality
// assertion can't: a boon's change flows onto the RIGHT existing effect, a
// mismatched boon is a safe no-op (never a minted ~80%-DR near-immunity), and
// structural data a flat round-trip would lose (zone ally-buffs, buff targets,
// multiple buff axes) survives intact.
// ---------------------------------------------------------------------------
type Fused = Omit<PlayerAbilityDef, 'slot'>;
function fused(
  kind: PlayerAbilityDef['kind'],
  flat: Partial<PlayerAbilityDef>,
  effects: EffectComponent[],
): Fused {
  const components: AbilityComponents = { delivery: { kind }, effects };
  return { name: 'Fused', kind, cooldown: 8, damage: 0, ...flat, components };
}
const buffsOf = (c: AbilityComponents): Array<Extract<EffectComponent, { kind: 'buff' }>> =>
  c.effects.filter((e): e is Extract<EffectComponent, { kind: 'buff' }> => e.kind === 'buff');
const zoneOf = (c: AbilityComponents): Extract<EffectComponent, { kind: 'zone' }> | undefined =>
  c.effects.find((e): e is Extract<EffectComponent, { kind: 'zone' }> => e.kind === 'zone');

describe('refreshComponents (item 6 flat→components patch)', () => {
  it('flows an upgrade onto the existing buff axis, keeping the buff target', () => {
    // A boon did mul(buffDefMult, 0.8): 0.5 → 0.4 on an ally-targeting defence buff.
    const def = fused('buffAlly', { buffDefMult: 0.4, buffDuration: 6 }, [
      { kind: 'buff', target: 'allies', defMult: 0.5, duration: 6 },
    ]);
    const [buff] = buffsOf(refreshComponents(def));
    expect(buff).toMatchObject({ target: 'allies', defMult: 0.4 }); // flowed through; target kept
  });

  it('mints a MEANINGFUL buff (not a no-op, not a 0.2 near-immunity) for a boon-added axis (item 2)', () => {
    // item 2 supersedes the old no-op: a defence-buff boon on a fused skill with no such
    // buff must now MEANINGFULLY apply. mul(undefined→0) leaves flat buffDefMult 0 (the
    // garbage a mul-of-undefined produces); the reconcile adds a SELF buff at a SANE
    // default — never the 0.2 (≈80%-DR) near-immunity a naive decompose would cap it to,
    // and never a silent no-op (the exact upgrade-doesn't-apply bug).
    const def = fused('meleeCone', { damage: 30, buffDefMult: 0 }, [
      { kind: 'damage', amount: 30 },
    ]);
    const out = refreshComponents(def);
    const buffs = buffsOf(out);
    expect(buffs).toHaveLength(1); // the boon now genuinely lands
    expect(buffs[0].target).toBe('self');
    expect(buffs[0].defMult!).toBeGreaterThan(0.2); // NOT the fabricated near-immunity floor
    expect(buffs[0].defMult!).toBeLessThan(1); // a real, capped mitigation
    expect(out.effects.find((e) => e.kind === 'damage')).toMatchObject({ amount: 30 });
  });

  it('lands EVERY effect axis a boon can add onto a fused skill that lacks it (item 2)', () => {
    // Each case is a boon-added flat field on a fused melee skill with NO matching
    // component. The reconcile must add the effect (never a no-op) at a sane magnitude
    // (never the 0.2 near-immunity). Covers buffs, hard CC, soft CC, forced movement,
    // flight, sustain — the full rider vocabulary, so future boons flow through too.
    const cases: Array<[Partial<PlayerAbilityDef>, (c: AbilityComponents) => boolean]> = [
      [{ buffDefMult: 0 }, (c) => buffsOf(c).some((b) => (b.defMult ?? 0) > 0.2)], // mul-of-undefined
      [{ buffDamageMult: 0 }, (c) => buffsOf(c).some((b) => b.dmgMult != null)],
      [{ buffMoveMult: 0 }, (c) => buffsOf(c).some((b) => b.moveMult != null)],
      [{ stun: 0.5 }, (c) => c.effects.some((e) => e.kind === 'stun')],
      [{ freeze: 0.5 }, (c) => c.effects.some((e) => e.kind === 'freeze')],
      [{ slowMult: 0.6, slowDuration: 2 }, (c) => c.effects.some((e) => e.kind === 'slow')],
      [{ castSlow: 1.3 }, (c) => c.effects.some((e) => e.kind === 'castSlow')],
      [{ knockback: 120 }, (c) => c.effects.some((e) => e.kind === 'shove' && !e.pull)],
      [{ pull: 120 }, (c) => c.effects.some((e) => e.kind === 'shove' && e.pull)],
      [{ grantsFlight: 4 }, (c) => c.effects.some((e) => e.kind === 'flight')],
      [{ lifestealFrac: 0.15 }, (c) => c.effects.some((e) => e.kind === 'lifesteal')],
      [{ healOnUse: 20 }, (c) => c.effects.some((e) => e.kind === 'healOnUse')],
      [{ landingDamage: 20 }, (c) => c.effects.some((e) => e.kind === 'landingDamage')],
    ];
    for (const [flat, check] of cases) {
      const def = fused('meleeCone', { damage: 30, ...flat }, [{ kind: 'damage', amount: 30 }]);
      const out = refreshComponents(def);
      expect(check(out), `boon ${JSON.stringify(flat)} should land`).toBe(true);
      // A boon never fabricates a near-immunity, whatever the axis.
      for (const b of buffsOf(out)) if (b.defMult != null) expect(b.defMult).toBeGreaterThan(0.2);
      // The damage anchor is untouched.
      expect(out.effects.find((e) => e.kind === 'damage')).toMatchObject({ amount: 30 });
    }
  });

  it("preserves a zone's ally-buff (which flat fields cannot represent) while flowing the tick boon", () => {
    const def = fused('groundZone', { zoneTickDamage: 15, zoneDuration: 4, radius: 130 }, [
      {
        kind: 'zone',
        zone: {
          zoneKind: 'rainOfArrows',
          duration: 4,
          radius: 130,
          tickDamage: 12,
          allyBuff: { dmgMult: 1.2, duration: 5 },
        },
      },
    ]);
    const zone = zoneOf(refreshComponents(def));
    expect(zone?.zone.tickDamage).toBe(15); // the boon flowed through
    expect(zone?.zone.allyBuff).toMatchObject({ dmgMult: 1.2 }); // NOT dropped by the refresh
  });

  it('keeps distinct buffs (separate axes + targets) from collapsing into one', () => {
    const def = fused('buffAlly', { buffDamageMult: 1.4, buffMoveMult: 1.3, buffDuration: 6 }, [
      { kind: 'buff', target: 'allies', dmgMult: 1.3, duration: 6 },
      { kind: 'buff', target: 'self', moveMult: 1.2, duration: 6 },
    ]);
    const buffs = buffsOf(refreshComponents(def));
    expect(buffs).toHaveLength(2); // neither buff collapsed away
    expect(buffs.find((b) => b.dmgMult != null)).toMatchObject({ target: 'allies', dmgMult: 1.4 });
    expect(buffs.find((b) => b.moveMult != null)).toMatchObject({ target: 'self', moveMult: 1.3 });
  });

  it('flows every strike / CC / zone effect kind from its matching flat field', () => {
    const def = fused(
      'projectile',
      {
        landingDamage: 25,
        lifestealFrac: 0.2,
        healOnUse: 15,
        stun: 1.0,
        freeze: 0.8,
        slowMult: 0.5,
        slowDuration: 3,
        zoneTickDamage: 14,
        zoneTickHeal: 9,
        zoneDuration: 5,
        radius: 120,
      },
      [
        { kind: 'landingDamage', amount: 10 },
        { kind: 'lifesteal', frac: 0.1 },
        { kind: 'healOnUse', amount: 5 },
        { kind: 'stun', seconds: 0.5 },
        { kind: 'freeze', seconds: 0.5 },
        { kind: 'slow', mult: 0.9, duration: 2 },
        {
          kind: 'zone',
          zone: { zoneKind: 'rainOfArrows', duration: 4, radius: 100, slowMult: 0.8 },
        },
      ],
    );
    const out = refreshComponents(def);
    const by = (k: EffectComponent['kind']): EffectComponent | undefined =>
      out.effects.find((e) => e.kind === k);
    expect(by('landingDamage')).toMatchObject({ amount: 25 });
    expect(by('lifesteal')).toMatchObject({ frac: 0.2 });
    expect(by('healOnUse')).toMatchObject({ amount: 15 });
    expect(by('stun')).toMatchObject({ seconds: 1 });
    expect(by('freeze')).toMatchObject({ seconds: 0.8 });
    expect(by('slow')).toMatchObject({ mult: 0.5, duration: 3 }); // direct slow patched
    expect(zoneOf(out)?.zone.slowMult).toBe(0.5); // zone slow patched from the same flat field
  });

  it('leaves an effect untouched when no flat field targets it (the no-op branch)', () => {
    // Effects present but their flat fields absent — an upgrade that didn't tug them.
    const def = fused('projectile', {}, [
      { kind: 'landingDamage', amount: 20 },
      { kind: 'lifesteal', frac: 0.15 },
      { kind: 'healOnUse', amount: 12 },
      { kind: 'stun', seconds: 1.0 },
      { kind: 'freeze', seconds: 0.7 },
      { kind: 'slow', mult: 0.6, duration: 2 },
      { kind: 'buff', target: 'self', defMult: 0.5, dmgMult: 1.2, moveMult: 1.2, duration: 6 },
      { kind: 'zone', zone: { zoneKind: 'rainOfArrows', duration: 4, radius: 100, tickDamage: 8 } },
    ]);
    const out = refreshComponents(def);
    expect(out.effects.find((e) => e.kind === 'stun')).toMatchObject({ seconds: 1 });
    expect(out.effects.find((e) => e.kind === 'slow')).toMatchObject({ mult: 0.6, duration: 2 });
    expect(buffsOf(out)[0]).toMatchObject({ defMult: 0.5, dmgMult: 1.2, moveMult: 1.2 }); // untouched
    expect(zoneOf(out)?.zone.tickDamage).toBe(8); // untouched
  });

  it('falls back to a capped decompose for a def with no prior components', () => {
    const bare: Fused = { name: 'Bare', kind: 'meleeCone', cooldown: 5, damage: 20, range: 60 };
    const out = refreshComponents(bare);
    expect(out.effects.find((e) => e.kind === 'damage')).toMatchObject({ amount: 20 });
  });

  it('patches a heal-delivery amount from the flat damage field', () => {
    const def = fused('heal', { damage: 55 }, [{ kind: 'heal', amount: 40 }]);
    const heal = refreshComponents(def).effects.find((e) => e.kind === 'heal');
    expect(heal).toMatchObject({ amount: 55 });
  });

  it('keeps the existing slow durations when an upgrade tugs only the slow magnitude', () => {
    const def = fused('groundZone', { slowMult: 0.4 }, [
      // slowMult moved, slowDuration absent → both the direct slow and the zone slow keep theirs.
      { kind: 'slow', mult: 0.6, duration: 2 },
      {
        kind: 'zone',
        zone: {
          zoneKind: 'rainOfArrows',
          duration: 4,
          radius: 100,
          slowMult: 0.6,
          slowDuration: 3,
        },
      },
    ]);
    const out = refreshComponents(def);
    expect(out.effects.find((e) => e.kind === 'slow')).toMatchObject({ mult: 0.4, duration: 2 });
    expect(zoneOf(out)?.zone.slowDuration).toBe(3);
  });
});
