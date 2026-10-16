import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility, spawnZone } from '../src/engine/combat/abilities';
import { healSupportAlly } from '../src/engine/combat/support';
import {
  applyBuff,
  buffMult,
  damagePlayer,
  makeBuff,
  tickBuffs,
} from '../src/engine/combat/combat';
import { getClass, describeAbility } from '../src/engine/content/classes';
import { getSubSkill } from '../src/engine/content/subclasses';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
} from '../src/engine/content/forge';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import { computeBotInput } from '../src/engine/ai/bot';
import type { ClassId, ExtSlot, GroundZone, Player } from '../src/engine/core/types';
import { applyCharUpgrades } from '../src/engine/content/charUpgrades';
import { heroPowerRatio } from '../src/engine/content/balance';
import { ARENA_W } from '../src/engine/core/constants';
const ZERO = { x: 0, y: 0 };
function world(classId: ClassId) {
  const w = new World({
    monsterId: 'dragon',
    seed: 5,
    players: [
      { peerId: 'a', name: 'A', classId, extraClasses: ['knight'] },
      { peerId: 'b', name: 'B', classId: 'knight' },
      { peerId: 'c', name: 'C', classId: 'ranger' },
    ],
  });
  w.players.forEach((p, i) => {
    p.pos = { x: 600 + i * 40, y: 400 };
    p.aim = { x: 1, y: 0 };
    p.critChance = 0;
  });
  w.boss!.pos = { x: 660, y: 400 };
  return w;
}
function use(w: World, slot: ExtSlot) {
  (
    w as unknown as { tryUseAbility: (p: Player, slot: ExtSlot, move: typeof ZERO) => void }
  ).tryUseAbility(w.players[0], slot, ZERO);
}
function tickZone(w: World, zone: GroundZone) {
  (w as unknown as { applyZoneTick: (z: GroundZone) => void }).applyZoneTick(zone);
}
function sub(w: World, id: string) {
  w.players[0].subAbilities = { sub1: { ...getSubSkill(id)!.ability, slot: 'sub1' } };
}

describe('Cleric rescue', () => {
  it('uses pre-heal health, credits effective healing, and wards the rescued ally', () => {
    const w = world('cleric');
    const [p, ally] = w.players;
    ally.hp = ally.maxHp * 0.35;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(ally.hp).toBeCloseTo(84 + 78);
    expect(p.stats.healingDone).toBe(78);
    expect(p.threat).toBeGreaterThan(0);
    expect(buffMult(ally, 'damageTaken')).toBe(1);
    expect(ally.buffs.find((b) => b.kind === 'absorption')?.mult).toBe(36);
    const hp = ally.hp;
    damagePlayer(w, ally, 40);
    expect(ally.hp).toBeCloseTo(hp - 4);
    tickBuffs(ally, 2.1);
    expect(buffMult(ally, 'damageTaken')).toBe(1);
  });
  it('keeps ordinary healing above the threshold; full health and downed allies give no ward', () => {
    const w = world('cleric');
    const [p, ally] = w.players;
    ally.hp = 85;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(ally.hp).toBe(145);
    expect(ally.buffs).toEqual([]);
    ally.hp = ally.maxHp;
    ally.state = 'downed';
    expect(healSupportAlly(w, p, ally, 60, p.abilities!.a1)).toBe(0);
    expect(ally.buffs).toEqual([]);
    ally.state = 'alive';
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.stats.healingDone).toBe(60);
    expect(p.buffs).toEqual([]);
  });
  it('rescues solo, caps healing at missing HP, and keeps one capped absorption pool', () => {
    const w = world('cleric');
    const p = w.players[0];
    p.hp = 30;
    p.abilities!.a1.damage = 1000;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.hp).toBe(p.maxHp);
    expect(p.stats.healingDone).toBe(p.maxHp - 30);
    expect(p.threat).toBe(0);
    p.hp = 30;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.buffs.filter((b) => b.kind === 'absorption')).toHaveLength(1);
  });
  it.each(['cl_light_flash', 'cl_life_mend'])('extends rescue to %s and copied skills', (id) => {
    const w = world('knight');
    const [p, ally] = w.players;
    sub(w, id);
    ally.hp = 20;
    const amount = p.subAbilities!.sub1!.damage;
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(ally.hp).toBeCloseTo(20 + amount * 1.3);
    expect(ally.buffs.some((b) => b.kind === 'absorption')).toBe(true);
  });
});

describe('Paladin frontline protection', () => {
  it('retains the personal shield and shares a bounded ward with nearby living allies only', () => {
    const w = world('paladin');
    const [p, ally, far] = w.players;
    far.pos.x = p.pos.x + 181;
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(buffMult(p, 'damageTaken')).toBe(0.35);
    expect(buffMult(ally, 'damageTaken')).toBe(0.85);
    expect(far.buffs).toEqual([]);
    ally.state = 'downed';
    ally.buffs = [];
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(ally.buffs).toEqual([]);
    tickBuffs(p, 4.1);
    expect(buffMult(p, 'damageTaken')).toBe(1);
  });
  it('uses toroidal range and refreshes overlapping shared wards without multiplying', () => {
    const w = world('paladin');
    const [p, ally] = w.players;
    p.pos.x = 5;
    ally.pos.x = ARENA_W - 5;
    resolvePlayerAbility(w, p, 'a3', ZERO);
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(ally.buffs.filter((b) => b.source === 'sharedWard')).toHaveLength(1);
    expect(buffMult(ally, 'damageTaken')).toBe(0.85);
  });
  it('Consecration heals, damages, and protects inside; leaving/flight respects ground rules', () => {
    const w = world('paladin');
    const [p, ally, flyer] = w.players;
    ally.hp = 100;
    flyer.hp = 100;
    applyBuff(flyer, makeBuff('flight', 0, 5, 'flight'));
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const z = w.groundZones[0];
    const hp = w.boss!.hp;
    tickZone(w, z);
    expect(w.boss!.hp).toBeLessThan(hp);
    expect(ally.hp).toBe(108);
    expect(buffMult(ally, 'damageTaken')).toBe(0.9);
    // Friendly support retains the existing ability to reach airborne allies.
    expect(flyer.hp).toBe(108);
    expect(buffMult(flyer, 'damageTaken')).toBe(0.9);
    ally.pos.x = p.pos.x + 400;
    tickBuffs(ally, 0.8);
    tickZone(w, z);
    expect(buffMult(ally, 'damageTaken')).toBe(1);
  });
  it('Devotion aura retains self protection while protecting the band', () => {
    const w = world('paladin');
    const [p, ally] = w.players;
    sub(w, 'pa_devotion_aura');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(buffMult(p, 'damageTaken')).toBe(0.55);
    expect(buffMult(ally, 'damageTaken')).toBe(0.8);
  });
});

describe('Druid territory and recovery', () => {
  it('an effective Regrowth creates a stationary grove at the target, with attributed tick healing', () => {
    const w = world('druid');
    const [p, ally, other] = w.players;
    ally.hp = 20;
    other.hp = 90;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(ally.hp).toBe(75);
    const grove = w.groundZones[0];
    expect(grove.pos).toEqual(ally.pos);
    expect(grove.recovery).toBe(true);
    tickZone(w, grove);
    expect(ally.hp).toBe(79);
    expect(other.hp).toBe(94);
    expect(p.stats.healingDone).toBe(63);
    ally.pos.x += 200;
    expect(grove.pos.x).toBe(640);
    tickZone(w, grove);
    expect(ally.hp).toBe(79);
  });
  it("keeps one grove per caster without erasing unrelated or other casters' zones; overheal cannot replace it", () => {
    const w = world('druid');
    const [p, ally] = w.players;
    spawnZone(w, {
      kind: 'sanctuary',
      pos: p.pos,
      radius: 100,
      side: 'player',
      ownerId: p.id,
      damagePerTick: 0,
      healPerTick: 10,
      duration: 4,
    });
    spawnZone(w, {
      kind: 'sanctuary',
      pos: p.pos,
      radius: 100,
      side: 'player',
      ownerId: ally.id,
      damagePerTick: 0,
      healPerTick: 4,
      duration: 3,
      recovery: true,
    });
    ally.hp = 20;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(w.groundZones).toHaveLength(3);
    const id = w.groundZones.find((z) => z.recovery && z.ownerId === p.id)!.id;
    w.players.forEach((a) => (a.hp = a.maxHp));
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(w.groundZones.find((z) => z.recovery && z.ownerId === p.id)!.id).toBe(id);
  });
  it('Entangle retains damage/root and heals nearby allies without affecting airborne enemies', () => {
    const w = world('druid');
    const [p, ally] = w.players;
    p.abilities!.a1.range = 40;
    ally.hp = 100;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const z = w.groundZones[0];
    tickZone(w, z);
    expect(ally.hp).toBe(104);
    expect(w.boss!.buffs.some((b) => b.kind === 'root')).toBe(true);
    const hp = w.boss!.hp;
    applyBuff(w.boss!, makeBuff('flight', 0, 5, 'flight'));
    tickZone(w, z);
    expect(w.boss!.hp).toBe(hp);
  });
  it('Moon recovery and Land thorn territory carry their respective identity', () => {
    const w = world('druid');
    const p = w.players[0];
    p.hp = 20;
    sub(w, 'dr_moon_regen');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(w.groundZones[0].recovery).toBe(true);
    sub(w, 'dr_land_wall');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(w.groundZones.at(-1)!.healPerTick).toBe(4);
    expect(w.groundZones.at(-1)!.damagePerTick).toBe(13);
  });
});

describe('Bard verses and chorus', () => {
  it('two different verses turn Inspiration into group buffs and movement; basics do not contribute', () => {
    const w = world('bard');
    const [p, ally, far] = w.players;
    ally.hp = 100;
    far.pos.x = p.pos.x + 421;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs).toEqual([]);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(buffBadges(p.buffs).map((b) => b.glyph)).toEqual(['🎶', '🎭']);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    for (const a of [p, ally]) {
      expect(buffMult(a, 'damageDealt')).toBe(1.2);
      expect(buffMult(a, 'damageTaken')).toBe(0.85);
      expect(buffMult(a, 'moveSpeed')).toBe(1.15);
    }
    expect(far.buffs).toEqual([]);
    expect(p.buffs.some((b) => b.kind === 'harmony' || b.kind === 'discord')).toBe(false);
    p.buffs = [];
    ally.buffs = [];
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.buffs).toEqual([]);
    expect(buffMult(ally, 'damageDealt')).toBe(1.2);
    expect(buffMult(ally, 'moveSpeed')).toBe(1);
  });
  it('repeating one verse cannot substitute for the other; unused verses expire; overheal cannot prepare harmony', () => {
    const w = world('bard');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(p.buffs).toEqual([]);
    resolvePlayerAbility(w, p, 'a3', ZERO);
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.buffs.filter((b) => b.kind === 'discord')).toHaveLength(1);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'discord')).toBe(true);
    tickBuffs(p, 8.1);
    expect(p.buffs).toEqual([]);
  });
  it('blocked attempts preserve both verses; a copied chorus consumes readiness normally', () => {
    const w = world('bard');
    const [p, ally] = w.players;
    ally.hp = 100;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    resolvePlayerAbility(w, p, 'a3', ZERO);
    p.cooldowns.a1 = 1;
    use(w, 'a1');
    p.cooldowns.a1 = 0;
    applyBuff(p, makeBuff('silence', 0, 1, 'silence'));
    use(w, 'a1');
    expect(p.buffs.filter((b) => b.kind === 'harmony' || b.kind === 'discord')).toHaveLength(2);
    tickBuffs(p, 1.1);
    use(w, 'a1');
    expect(p.buffs.some((b) => b.kind === 'harmony' || b.kind === 'discord')).toBe(false);
  });
  it('subclass verses and Battle Hymn contribute without requiring a specific extra skill pair', () => {
    const w = world('bard');
    const [p, ally] = w.players;
    ally.hp = 100;
    sub(w, 'ba_whispers_song');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    sub(w, 'ba_valor_blade');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    sub(w, 'ba_valor_inspire');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(buffMult(ally, 'damageDealt')).toBe(1.3);
    expect(buffMult(ally, 'moveSpeed')).toBe(1.15);
    expect(buffMult(p, 'damageDealt')).toBe(1.3);
  });
  it('bots cast available verses before Inspiration rather than spending it in the same tick', () => {
    const w = world('bard');
    const [p, ally] = w.players;
    ally.hp = 60;
    const input = computeBotInput(w, p, 1);
    expect(input.buttons.a2).toBe(true);
    expect(input.buttons.a3).toBe(true);
    expect(input.buttons.a1).toBe(false);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(computeBotInput(w, p, 2).buttons.a1).toBe(true);
  });
});

it.each(['cleric', 'paladin', 'druid', 'bard'] as const)(
  'Forge round-trips and executes %s support interactions',
  (classId) => {
    const w = world(classId);
    const [p, ally] = w.players;
    ally.hp = 20;
    for (const slot of ['a1', 'a2', 'a3'] as const) {
      const def = p.abilities![slot];
      const comp = decompose(def);
      expect(componentValue(comp)).toBeGreaterThan(0);
      p.abilities![slot] = recompose(comp, def);
      expect(describeAbility(p.abilities![slot])).toContain('cooldown');
    }
    if (classId === 'cleric') {
      resolvePlayerAbility(w, p, 'a1', ZERO);
      expect(ally.hp).toBe(98);
    }
    if (classId === 'paladin') {
      resolvePlayerAbility(w, p, 'a3', ZERO);
      expect(buffMult(ally, 'damageTaken')).toBe(0.85);
      resolvePlayerAbility(w, p, 'a1', ZERO);
      expect(w.groundZones[0].allyBuff?.defMult).toBe(0.9);
    }
    if (classId === 'druid') {
      resolvePlayerAbility(w, p, 'a2', ZERO);
      expect(w.groundZones[0].recovery).toBe(true);
    }
    if (classId === 'bard') {
      resolvePlayerAbility(w, p, 'a2', ZERO);
      resolvePlayerAbility(w, p, 'a3', ZERO);
      resolvePlayerAbility(w, p, 'a1', ZERO);
      expect(buffMult(ally, 'moveSpeed')).toBe(1.15);
      expect(buffMult(ally, 'damageDealt')).toBe(1.2);
    }
  },
);
it('support upgrades preserve nested values through Forge refresh', () => {
  const def = recompose(decompose(getClass('druid').abilities.a2), getClass('druid').abilities.a2);
  def.recoveryZone = { ...def.recoveryZone!, tickHeal: 5 };
  expect(recompose(refreshComponents(def), def).recoveryZone?.tickHeal).toBe(5);
  const ward = recompose(
    decompose(getClass('paladin').abilities.a3),
    getClass('paladin').abilities.a3,
  );
  ward.allyWard = { ...ward.allyWard!, duration: 5, range: 200 };
  expect(recompose(refreshComponents(ward), ward).allyWard).toEqual(ward.allyWard);
});

it.each([
  ['cleric', 'cl_greaterheal', 'a1'],
  ['paladin', 'pa_aegis', 'a3'],
  ['druid', 'dr_regrowth', 'a2'],
] as const)(
  'real %s upgrades improve the new interaction and its composed form',
  (classId, id, slot) => {
    const w = world(classId);
    const p = w.players[0];
    const ab = p.abilities![slot];
    p.abilities![slot] = recompose(decompose(ab), ab);
    applyCharUpgrades(p, [id]);
    const updated = recompose(p.abilities![slot].components!, p.abilities![slot]);
    if (classId === 'cleric') expect(updated.rescueHealBonus).toBeCloseTo(0.35);
    if (classId === 'paladin')
      expect(updated.allyWard).toEqual({ range: 200, mult: 0.85, duration: 5 });
    if (classId === 'druid') expect(updated.recoveryZone?.tickHeal).toBe(5);
  },
);
it('upgrades and sustain estimates remain meaningful when copied skills lack support hooks', () => {
  const w = world('cleric');
  const p = w.players[0];
  p.abilities!.a1 = { ...getClass('paladin').abilities.a2 };
  applyCharUpgrades(p, ['cl_greaterheal']);
  expect(p.abilities!.a1.rescueHealBonus).toBeUndefined();
  const before = heroPowerRatio(p);
  p.abilities!.a1.recoveryZone = { radius: 95, duration: 3, tickHeal: 4 };
  expect(heroPowerRatio(p)).toBeGreaterThan(before);
  const paladin = world('paladin').players[0];
  paladin.abilities!.a3 = { ...getClass('knight').abilities.a2 };
  applyCharUpgrades(paladin, ['pa_aegis']);
  expect(paladin.abilities!.a3.allyWard).toBeUndefined();
  const druid = world('druid').players[0];
  druid.abilities!.a2 = { ...getClass('cleric').abilities.a1 };
  applyCharUpgrades(druid, ['dr_regrowth']);
  expect(druid.abilities!.a2.recoveryZone).toBeUndefined();
});
it('copied verses retain ordinary expiration across swaps without refresh; default chorus reaches only living allies', () => {
  const w = world('bard');
  const [p, ally, dead] = w.players;
  ally.hp = 20;
  resolvePlayerAbility(w, p, 'a2', ZERO);
  resolvePlayerAbility(w, p, 'a3', ZERO);
  tickBuffs(p, 2);
  w.setActiveClass(p, 'knight');
  expect(p.buffs.find((b) => b.kind === 'harmony')!.remaining).toBe(6);
  p.abilities!.a1 = { ...getClass('bard').abilities.a1, range: undefined, buffDuration: undefined };
  dead.state = 'downed';
  resolvePlayerAbility(w, p, 'a1', ZERO);
  expect(buffMult(ally, 'moveSpeed')).toBe(1.15);
  expect(dead.buffs).toEqual([]);
  expect(p.buffs.some((b) => b.kind === 'harmony' || b.kind === 'discord')).toBe(false);
});
it('Forge refresh can add new support effects while preserving old components', () => {
  const source = getClass('cleric').abilities.a1;
  let def = recompose(decompose({ ...source, rescueHealBonus: undefined }), source);
  def.rescueHealBonus = 0.3;
  def.recoveryZone = { radius: 95, duration: 3, tickHeal: 4 };
  def.bardSong = 'harmony';
  const refreshed = recompose(refreshComponents(def), def);
  expect(refreshed.rescueHealBonus).toBe(0.3);
  expect(refreshed.recoveryZone?.tickHeal).toBe(4);
  expect(refreshed.bardSong).toBe('harmony');
  def = recompose(decompose(getClass('sorcerer').abilities.a2), getClass('sorcerer').abilities.a2);
  def.allyWard = { range: 180, mult: 0.85, duration: 4 };
  expect(recompose(refreshComponents(def), def).allyWard).toEqual(def.allyWard);
});
