import { describe, it, expect } from 'vitest';
import { CLASSES, describeAbility } from '../src/engine/content/classes';
import type { PlayerAbilityDef } from '../src/engine/content/classes';
import { previewAbilityTable } from '../src/engine/content/charUpgrades';
import { getSubSkill } from '../src/engine/content/subclasses';

// ---------------------------------------------------------------------------
// describeAbility — the player-facing effect line behind an ability icon (#32,
// item 19). Asserts the concrete numbers/percentages surface, per ability kind,
// and that a hero's *upgrade-resolved* def (grafts/boons) changes what it reads.
// ---------------------------------------------------------------------------

describe('describeAbility (base-kit abilities)', () => {
  it('a melee attack: damage, reach, arc and cooldown', () => {
    // Knight Cleave — meleeCone with damage + range + half-angle.
    expect(describeAbility(CLASSES.knight.abilities.basic)).toBe(
      '22 dmg · 70u reach · 90° arc · 0.7s cooldown',
    );
  });

  it('a melee attack with a stun surfaces the stun seconds', () => {
    // Knight Shield Bash — meleeCone + stun.
    expect(describeAbility(CLASSES.knight.abilities.a3)).toBe(
      '30 dmg · 60u reach · 80° arc · 0.8s stun · 8s cooldown',
    );
  });

  it('a self-buff: damage-reduction percentage + duration', () => {
    // Knight Shield Wall — buffDefMult 0.5 → "50% less dmg taken".
    expect(describeAbility(CLASSES.knight.abilities.a2)).toBe(
      '50% less dmg taken · for 4s · 16s cooldown',
    );
  });

  it('a taunt names its effect (no magnitude) plus duration', () => {
    expect(describeAbility(CLASSES.knight.abilities.a1)).toBe('Pull aggro · for 4s · 12s cooldown');
  });

  it('a multi-projectile attack shows the projectile count', () => {
    // Ranger Multishot — projCount 3, now an aimed wind-up volley (item 10).
    expect(describeAbility(CLASSES.ranger.abilities.a1)).toBe(
      '3× 19 dmg · 0.3s wind-up · 6s cooldown',
    );
    // Sorcerer Chaos Bolt — twin bolts.
    expect(describeAbility(CLASSES.sorcerer.abilities.basic)).toBe('2× 12 dmg · 0.5s cooldown');
  });

  it('a projectile bomb: blast radius + wind-up', () => {
    // Mage Fireball — impactRadius + castTime (shown as "wind-up", item 10).
    expect(describeAbility(CLASSES.mage.abilities.a1)).toBe(
      '80 dmg · 110u blast · 0.7s wind-up · 7s cooldown',
    );
  });

  it('a point-blank AoE with a slow shows the slow % and its duration', () => {
    // Mage Frost Nova — radius + slowMult 0.6 for 3s.
    expect(describeAbility(CLASSES.mage.abilities.a2)).toBe(
      '20 dmg · 150u radius · slow to 60% for 3s · 10s cooldown',
    );
  });

  it('a damage ground-zone: per-tick damage, radius and lifetime', () => {
    // Ranger Rain of Arrows — an AIRBORNE zone (item 8), so it reads "hits flyers".
    expect(describeAbility(CLASSES.ranger.abilities.a2)).toBe(
      '12/tick dmg · 120u radius · lasts 3s · hits flyers · 12s cooldown',
    );
  });

  it('a healing ground-zone reads per-tick heal', () => {
    // Cleric Sanctuary.
    expect(describeAbility(CLASSES.cleric.abilities.a2)).toBe(
      '10/tick heal · 140u radius · lasts 4s · 14s cooldown',
    );
  });

  it('a direct heal: heal amount + who it can reach', () => {
    // Cleric Heal — heal magnitude + range.
    expect(describeAbility(CLASSES.cleric.abilities.a1)).toBe('Heal 60 · 400u range · 3s cooldown');
  });

  it('an ally buff: damage up, damage-taken down, duration + range', () => {
    // Cleric Blessing — buffDamageMult 1.25, buffDefMult 0.8, range 400.
    expect(describeAbility(CLASSES.cleric.abilities.a3)).toBe(
      '+25% dmg · 20% less dmg taken · for 6s · 400u range · 12s cooldown',
    );
  });

  it('a self-buff with a move bonus reads +dmg and +move', () => {
    // Barbarian Rage — buffDamageMult 1.35 + buffMoveMult 1.2.
    expect(describeAbility(CLASSES.barbarian.abilities.a1)).toBe(
      '+35% dmg · +20% move · for 6s · 14s cooldown',
    );
  });

  it('a leap: landing damage, radius, distance and i-frames', () => {
    // Barbarian Leap — landingDamage + radius + dash range + iframes.
    expect(describeAbility(CLASSES.barbarian.abilities.a2)).toBe(
      '22 landing dmg · 120u radius · 270u dash · 0.25s i-frames · 7s cooldown',
    );
  });

  it('a pure dash reads distance + i-frames', () => {
    // Ranger Roll.
    expect(describeAbility(CLASSES.ranger.abilities.a3)).toBe(
      '220u dash · 0.3s i-frames · 5s cooldown',
    );
  });

  it('a blink reads a blink distance (not a dash)', () => {
    // Mage Blink — now carries the escape-parity i-frames (item 56).
    expect(describeAbility(CLASSES.mage.abilities.a3)).toBe(
      '250u blink · 0.2s i-frames · 6s cooldown',
    );
  });

  it('a lifesteal attack shows the lifesteal percentage', () => {
    // Warlock Eldritch Blast — lifestealFrac 0.15.
    expect(describeAbility(CLASSES.warlock.abilities.basic)).toBe(
      '22 dmg · 15% lifesteal · 0.55s cooldown',
    );
  });

  it('a mobility skill that heals on use shows the flat heal', () => {
    // Monk Step of the Wind — healOnUse 18.
    expect(describeAbility(CLASSES.monk.abilities.a2)).toBe(
      'heal 18 · 250u dash · 0.3s i-frames · 5s cooldown',
    );
  });
});

describe('describeAbility (upgrade-resolved values, item 19)', () => {
  it('reflects a character boon that boosts the numbers', () => {
    // Combustion: Fireball → +22 damage (102) across a +35 blast (145u).
    const table = previewAbilityTable('mage', ['mg_combust']);
    expect(describeAbility(table.a1)).toBe('102 dmg · 145u blast · 0.7s wind-up · 14s cooldown');
  });

  it('reflects a boon that adds a brand-new effect (Deep Freeze)', () => {
    // Deep Freeze grafts a freeze onto Frost Nova and bumps damage/radius.
    const table = previewAbilityTable('mage', ['mg_freeze']);
    expect(describeAbility(table.a2)).toBe(
      '28 dmg · 168u radius · 1.1s freeze · slow to 60% for 3s · 20s cooldown',
    );
  });

  it('describes a grafted foreign ability by its real numbers', () => {
    // Pyromancer's Pact grafts the Mage's Fireball onto a Knight's a2 slot.
    const table = previewAbilityTable('knight', ['hy_pyromancer']);
    const line = describeAbility(table.a2);
    expect(line).toContain('80 dmg');
    expect(line).toContain('110u blast');
    expect(line).toContain('0.7s wind-up');
  });
});

describe('describeAbility (slot-less subclass skills + edge shapes)', () => {
  it('accepts a subclass skill ability (which carries no slot)', () => {
    const earthshaker = getSubSkill('kn_champion_slam');
    expect(earthshaker).toBeTruthy();
    expect(describeAbility(earthshaker!.ability)).toBe('40 dmg · 150u radius · 8s cooldown');
  });

  it('a slow without a duration omits the "for Ns" tail', () => {
    const def: Omit<PlayerAbilityDef, 'slot'> = {
      name: 'Chill',
      kind: 'pbaoe',
      cooldown: 5,
      damage: 10,
      radius: 100,
      slowMult: 0.5,
    };
    expect(describeAbility(def)).toBe('10 dmg · 100u radius · slow to 50% · 5s cooldown');
  });

  it('a self-only heal (range 1) omits the range readout', () => {
    const def: Omit<PlayerAbilityDef, 'slot'> = {
      name: 'Second Wind',
      kind: 'heal',
      cooldown: 10,
      damage: 90,
      range: 1,
    };
    expect(describeAbility(def)).toBe('Heal 90 · 10s cooldown');
  });

  it('a melee with no explicit arc omits the arc part', () => {
    const def: Omit<PlayerAbilityDef, 'slot'> = {
      name: 'Jab',
      kind: 'meleeCone',
      cooldown: 1,
      damage: 10,
      range: 50,
    };
    expect(describeAbility(def)).toBe('10 dmg · 50u reach · 1s cooldown');
  });
});

describe('describeAbility (generic mods fold + cooldown floor, item 2)', () => {
  const jab: Omit<PlayerAbilityDef, 'slot'> = {
    name: 'Jab',
    kind: 'meleeCone',
    cooldown: 0.4,
    damage: 10,
    range: 50,
  };

  it('scales damage / cooldown / wind-up by the passed multipliers', () => {
    const def: Omit<PlayerAbilityDef, 'slot'> = { ...jab, cooldown: 4, castTime: 1 };
    expect(describeAbility(def, { damageMult: 1.5, cooldownMult: 0.5, castMult: 0.5 })).toBe(
      '15 dmg · 50u reach · 0.5s wind-up · 2s cooldown',
    );
  });

  it('clamps the shown cooldown at cooldownFloor, matching the sim basic-slot clamp', () => {
    // 0.4 × 0.1 = 0.04s, below the floor → the line must read 0.3s (what the sim delivers),
    // not the sub-floor number.
    expect(describeAbility(jab, { cooldownMult: 0.1, cooldownFloor: 0.3 })).toBe(
      '10 dmg · 50u reach · 0.3s cooldown',
    );
    // With no floor (every non-basic slot, and every pre-item-2 caller) the raw value shows.
    expect(describeAbility(jab, { cooldownMult: 0.1 })).toBe('10 dmg · 50u reach · 0.04s cooldown');
    // A floor below the (already larger) cooldown is inert — no clamp, unchanged line.
    expect(describeAbility(jab, { cooldownFloor: 0.3 })).toBe('10 dmg · 50u reach · 0.4s cooldown');
  });
});
