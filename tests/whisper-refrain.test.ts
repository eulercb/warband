import { previewSubAbility } from '../src/engine/content/charUpgrades';
import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { getSubclass, getSubSkill } from '../src/engine/content/subclasses';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  applyBuff,
  damageBoss,
  damageEcho,
  makeBuff,
  tickBuffs,
} from '../src/engine/combat/combat';
import { setSubclassPassive } from '../src/engine/combat/subclassPassives';
import {
  componentValue,
  decompose,
  recompose,
  refreshComponents,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { boundedAbility } from '../src/engine/content/abilityLimits';
import { buffView } from '../src/engine/core/buffView';
import { drawWhisperAfterimage, whisperAfterimage } from '../src/render/pipeline/whisperVisuals';
import type { Graphics } from 'pixi.js';
import { ARENA_W } from '../src/engine/core/constants';
import { applySubclassGrands, applySubSkillUpgrades } from '../src/engine/content/charUpgrades';
import type { ExtSlot, Player, Projectile } from '../src/engine/core/types';

const zero = { x: 0, y: 0 };
function setup(skill = 'ba_whispers_mantle') {
  const w = new World({
    monsterId: 'lich',
    seed: 47,
    players: [{ peerId: 'a', name: 'A', classId: 'bard', subSkills: [skill] }],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0];
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  const boss = w.boss!;
  boss.pos = { x: 600, y: 400 };
  boss.hp = boss.maxHp = 10000;
  return { w, p, boss };
}
function use(w: World, p: Player, slot: ExtSlot) {
  (w as unknown as { tryUseAbility(p: Player, s: ExtSlot, d: typeof zero): void }).tryUseAbility(
    p,
    slot,
    zero,
  );
}
function connect(w: World, shot: Projectile) {
  shot.pos = { ...w.boss!.pos };
  (w as unknown as { resolvePlayerProjectile(p: Projectile): void }).resolvePlayerProjectile(shot);
}
function verses(w: World, p: Player) {
  p.hp -= 10;
  resolvePlayerAbility(w, p, 'a2', zero);
  resolvePlayerAbility(w, p, 'a3', zero);
  expect(p.buffs.some((b) => b.kind === 'harmony')).toBe(true);
  expect(p.buffs.some((b) => b.kind === 'discord')).toBe(true);
}
function image(p: Player) {
  return p.buffs.find((b) => b.kind === 'whisperRefrain');
}
function hit(w: World, p: Player, amount = 20, cast = { spent: false }) {
  return damageBoss(w, p, w.boss!, amount, { direct: true, pilot: { cast } });
}

describe('Whispers departure refrain', () => {
  it('offer previews never alter the authored skill or another hero’s echo budget', () => {
    const native = structuredClone(getSubSkill('ba_whispers_mantle')!.ability);
    previewSubAbility('ba_whispers_mantle', [
      'ba_whispers_mantle_g',
      ...Array<string>(5).fill('subup_ba_whispers_mantle'),
    ]);
    expect(getSubSkill('ba_whispers_mantle')!.ability).toEqual(native);
    expect(setup().p.subAbilities!.sub1!.whisperRefrain).toEqual({
      duration: 6,
      radius: 180,
      fraction: 0.35,
      charges: 3,
    });
  });
  it('a zero-distance blink leaves verses intact and does not create a false departure', () => {
    const { w, p } = setup();
    verses(w, p);
    p.aim = zero;
    use(w, p, 'sub1');
    expect(image(p)).toBeUndefined();
    expect(p.buffs.filter((b) => b.kind === 'harmony' || b.kind === 'discord')).toHaveLength(2);
    expect(p.buffs.some((b) => b.kind === 'refrainEcho')).toBe(false);
  });
  it.each([false, true])(
    'retains plain blink; a real chorus leaves its image at departure (composed=%s)',
    (composed) => {
      const { w, p } = setup();
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), {
          slot: 'sub1',
          name: 'Copied Mantle',
          cooldown: 6,
        });
      const origin = { ...p.pos };
      use(w, p, 'sub1');
      expect(p.pos).toEqual({ x: origin.x + 260, y: origin.y });
      expect(p.buffs.find((b) => b.kind === 'invuln')?.remaining).toBe(0.3);
      expect(image(p)).toBeUndefined();
      p.pos = origin;
      p.cooldowns.sub1 = 0;
      verses(w, p);
      use(w, p, 'sub1');
      expect(image(p)).toMatchObject({
        mult: 3,
        remaining: 6,
        whisperRefrainState: { anchor: origin, radius: 180, fraction: 0.35, usedCasts: [] },
      });
      expect(p.buffs.filter((b) => b.kind === 'harmony' || b.kind === 'discord')).toHaveLength(0);
      expect(p.buffs.filter((b) => b.kind === 'refrainEcho')).toHaveLength(0);
      expect(p.buffs.some((b) => b.source === 'chorusMove')).toBe(false);
      expect(w.events.filter((e) => e.t === 'blink')).toHaveLength(2);
    },
  );

  it.each(getSubclass('ba_whispers')!.skills.map((s) => s.id))(
    'actual first pick %s has a full-health fallback and a one-boss chorus route',
    (skill) => {
      const { w, p } = setup(skill);
      resolvePlayerAbility(w, p, 'a2', zero); // no overheal verse
      expect(p.buffs.some((b) => b.kind === 'harmony')).toBe(false);
      resolvePlayerAbility(w, p, 'a3', zero);
      expect(p.buffs.some((b) => b.kind === 'discord')).toBe(true);
      if (skill === 'ba_whispers_mantle') {
        use(w, p, 'sub1');
        expect(image(p)).toBeUndefined();
        p.cooldowns.sub1 = 0;
      }
      verses(w, p);
      use(w, p, skill === 'ba_whispers_mantle' ? 'sub1' : 'a1');
      expect(p.buffs.some((b) => b.kind === 'harmony' || b.kind === 'discord')).toBe(false);
      expect(p.buffs.some((b) => b.kind === 'refrainEcho')).toBe(false);
      expect(w.bosses.filter((b) => b.hp > 0)).toHaveLength(1);
      expect(w.adds).toHaveLength(0);
    },
  );

  it('rejects rooted casts before spending verses/cooldown; one or expired verse keeps the other', () => {
    const { w, p } = setup();
    verses(w, p);
    applyBuff(p, makeBuff('root', 0, 2, 'test'));
    const origin = { ...p.pos };
    use(w, p, 'sub1');
    expect(p.cooldowns.sub1).toBe(0);
    expect(p.pos).toEqual(origin);
    expect(p.buffs.filter((b) => b.kind === 'harmony' || b.kind === 'discord')).toHaveLength(2);
    p.buffs = p.buffs.filter((b) => b.kind !== 'root' && b.kind !== 'harmony');
    use(w, p, 'sub1');
    expect(image(p)).toBeUndefined();
    expect(p.buffs.some((b) => b.kind === 'discord')).toBe(true);
  });

  it('basics spend three distinct casts near the old position, not the caster, using effective damage once', () => {
    const { w, p, boss } = setup();
    verses(w, p);
    use(w, p, 'sub1');
    p.damageMult = 2;
    applyBuff(p, makeBuff('damageDealt', 1.5, 10, 'test'));
    for (let i = 0; i < 3; i++) {
      resolvePlayerAbility(w, p, 'basic', zero);
      const shot = w.projectiles.at(-1)!;
      const before = boss.hp;
      connect(w, shot);
      expect(boss.hp).toBeCloseTo(before - shot.damage * 3 * 1.35);
      expect(image(p)?.mult ?? 0).toBe(2 - i);
    }
    expect(image(p)).toBeUndefined();
    const links = w.events.filter((e) => e.t === 'support' && e.targetId === boss.id);
    expect(links).toHaveLength(3);
    expect(links[0]).toMatchObject({ from: { x: 500, y: 400 } });
  });

  it('late interleaved fan/pierce hits cannot spend the same cast again', () => {
    const { w, p, boss } = setup();
    verses(w, p);
    use(w, p, 'sub1');
    p.abilities!.basic = { ...p.abilities!.basic, projCount: 3, pierce: 2 };
    resolvePlayerAbility(w, p, 'basic', zero);
    const first = w.projectiles.slice(-3);
    resolvePlayerAbility(w, p, 'basic', zero);
    const second = w.projectiles.slice(-3);
    const before = boss.hp;
    for (const shot of [first[0], second[0], first[1], second[1], first[2]]) connect(w, shot);
    expect(image(p)?.mult).toBe(1);
    expect(image(p)?.whisperRefrainState?.usedCasts).toHaveLength(2);
    expect(boss.hp).toBeCloseTo(before - first[0].damage * 5 - first[0].damage * 0.7);
    expect(first[0].pilotCast).toBe(first[1].pilotCast);
    expect(first[0].pilotCast).not.toBe(second[0].pilotCast);
  });

  it.each([false, true])(
    'actual grand plus five Honed ranks preserve four distinct echoes at 45%% (composed=%s)',
    (composed) => {
      const { w, p, boss } = setup();
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), {
          slot: 'sub1',
          name: 'Forged Mantle',
          cooldown: 6,
        });
      applySubclassGrands(p, ['ba_whispers_mantle_g']);
      applySubSkillUpgrades(p, Array<string>(5).fill('subup_ba_whispers_mantle'));
      const ab = p.subAbilities!.sub1!;
      expect(ab.whisperRefrain).toMatchObject({ charges: 4, fraction: 0.45 });
      expect(ab.range).toBe(300);
      expect(ab.iframes).toBeCloseTo(0.4);
      expect(ab.healOnUse).toBeUndefined();
      expect(ab.steadfastDuration).toBeUndefined();
      verses(w, p);
      use(w, p, 'sub1');
      for (let i = 0; i < 4; i++) {
        const before = boss.hp;
        hit(w, p);
        expect(boss.hp).toBeCloseTo(before - 29);
      }
      expect(image(p)).toBeUndefined();
    },
  );

  it('another owner cannot spend or echo through your image; raw echo does not leech', () => {
    const { w, p, boss } = setup();
    verses(w, p);
    use(w, p, 'sub1');
    const other = { ...p, id: p.id + 1, buffs: [], stats: { ...p.stats } };
    const before = boss.hp;
    hit(w, other);
    expect(boss.hp).toBe(before - 20);
    expect(image(p)?.mult).toBe(3);
    p.hp = p.maxHp - 50;
    applyBuff(p, makeBuff('bloodRage', 0.2, 5, 'test-blood'));
    const hp = p.hp;
    hit(w, p);
    expect(p.hp).toBeCloseTo(hp + 4); // 20% of primary20, not primary+echo27
    expect(image(p)?.mult).toBe(2);
  });

  it('misses, ticks, zero/immune hits, far victims, secondary echoes and overkill preserve charges', () => {
    const { w, p, boss } = setup();
    verses(w, p);
    use(w, p, 'sub1');
    resolvePlayerAbility(w, p, 'basic', zero); // not connected
    damageBoss(w, p, boss, 20);
    hit(w, p, 0);
    damageEcho(w, p, boss, 20);
    applyBuff(boss, makeBuff('invuln', 0, 1, 'test'));
    hit(w, p);
    boss.buffs = [];
    boss.pos = { ...p.pos }; // near caster, outside departure radius
    hit(w, p);
    expect(image(p)?.mult).toBe(3);
    boss.pos = { x: 600, y: 400 };
    boss.hp = 1;
    hit(w, p, 200);
    expect(image(p)?.mult).toBe(3);
    expect(image(p)?.whisperRefrainState?.usedCasts).toHaveLength(0);
  });

  it('uses wrapped departure distance and does not import donor passives into copied skills', () => {
    const { w, p, boss } = setup();
    setSubclassPassive(p, undefined);
    p.classId = 'mage';
    p.pos = { x: ARENA_W - 40, y: 400 };
    boss.pos = { x: 30, y: 400 };
    verses(w, p);
    use(w, p, 'sub1');
    const before = boss.hp;
    hit(w, p);
    expect(boss.hp).toBeCloseTo(before - 27);
    expect(image(p)?.mult).toBe(2);
    expect(p.buffs.some((b) => b.kind === 'refrainEcho')).toBe(false);
  });

  it('clears on expiry, downing, scene changes, class changes and source removal; refresh replaces position and tokens', () => {
    for (const mode of ['expiry', 'downed', 'scene', 'class', 'source', 'refresh']) {
      const { w, p } = setup();
      verses(w, p);
      use(w, p, 'sub1');
      hit(w, p);
      if (mode === 'refresh') {
        const anchor = { ...p.pos };
        verses(w, p);
        p.cooldowns.sub1 = 0;
        use(w, p, 'sub1');
        expect(image(p)).toMatchObject({ mult: 3, whisperRefrainState: { anchor, usedCasts: [] } });
        expect(p.buffs.filter((b) => b.kind === 'whisperRefrain')).toHaveLength(1);
        continue;
      }
      if (mode === 'expiry') tickBuffs(p, 6);
      if (mode === 'downed') p.state = 'downed';
      if (mode === 'scene') w.scene = 'reward';
      if (mode === 'class') p.classId = 'mage';
      if (mode === 'source') delete p.subAbilities!.sub1;
      (w as unknown as { maintainCloseBursts(): void }).maintainCloseBursts();
      expect(image(p), mode).toBeUndefined();
    }
  });

  it('projects only anchor, radius and charges; rendering drops expired/empty images', () => {
    const { w, p } = setup();
    verses(w, p);
    use(w, p, 'sub1');
    hit(w, p);
    const view = buffView(image(p)!);
    expect(view).toEqual({
      kind: 'whisperRefrain',
      remaining: 6,
      mult: 2,
      whisperRefrain: { anchor: { x: 500, y: 400 }, radius: 180, charges: 2 },
    });
    expect(JSON.stringify(view)).not.toMatch(/usedCasts|fraction|slot|source/);
    expect(whisperAfterimage(view)).toMatchObject({ charges: 2, remaining: 6 });
    expect(whisperAfterimage({ ...view, remaining: 0 })).toBeNull();
    expect(
      whisperAfterimage({ ...view, whisperRefrain: { ...view.whisperRefrain!, charges: 0 } }),
    ).toBeNull();
    expect(whisperAfterimage({ kind: 'harmony', mult: 0, remaining: 2 })).toBeNull();
  });

  it('keeps exact field size while the phone mask and charge notches remain readable', () => {
    const { w, p } = setup();
    verses(w, p);
    use(w, p, 'sub1');
    const view = buffView(image(p)!);
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const drawing: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ['circle', 'ellipse', 'fill', 'stroke', 'moveTo', 'lineTo'])
      drawing[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return drawing;
      };
    const graphics = drawing as unknown as Graphics;
    drawWhisperAfterimage(graphics, view, zero, 0.25, true, 0);
    expect(calls.find((c) => c.method === 'circle')?.args).toEqual([0, 0, 45]);
    expect(calls.find((c) => c.method === 'ellipse')?.args).toEqual([0, -4.25, 8.5, 12.75]);
    expect(
      calls.filter((c) => c.method === 'stroke' && (c.args[0] as { width: number }).width === 3),
    ).toHaveLength(3);
    calls.length = 0;
    drawWhisperAfterimage(graphics, view, zero, 1, false, 1);
    expect(calls.find((c) => c.method === 'circle')?.args).toEqual([0, 0, 180]);
    calls.length = 0;
    drawWhisperAfterimage(graphics, { ...view, remaining: 0 }, zero, 1, true, 0);
    expect(calls).toHaveLength(0);
  });

  it('actual synthesis prices, scales, fits and refreshes a self-contained chorus effect', () => {
    const native = getSubSkill('ba_whispers_mantle')!.ability;
    const donor = {
      name: 'Mantle of Whispers',
      classId: 'bard' as const,
      className: 'Bard',
      slot: 'a3',
      def: native,
    };
    const forged = synthesizeAbility(47, 'refrain-test', 'a3', [donor]).def;
    expect(forged.whisperRefrain).toBeDefined();
    expect(forged.bardSong).toBe('chorus');
    const parts = forged.components!;
    expect(parts.effects.some((e) => e.kind === 'whisperRefrain')).toBe(true);
    expect(parts.effects.some((e) => e.kind === 'bardSong')).toBe(false);
    expect(componentValue(parts)).toBeGreaterThan(componentValue({ ...parts, effects: [] }));
    expect(forged.whisperRefrain!.fraction).toBeGreaterThan(0);
    expect(forged.whisperRefrain!.fraction).toBeLessThanOrEqual(0.45);
    forged.whisperRefrain = { duration: 20, radius: 800, fraction: 2, charges: 20 };
    const refreshed = recompose(refreshComponents(forged), {
      slot: 'a3',
      name: forged.name,
      cooldown: forged.cooldown,
    });
    expect(refreshed.whisperRefrain).toEqual({
      duration: 8,
      radius: 220,
      fraction: 0.45,
      charges: 4,
    });
    expect(boundedAbility(refreshed, { w: 600, h: 600 }).whisperRefrain!.radius).toBe(144);
    const altered = { ...forged, kind: 'selfBuff' as const };
    expect(refreshComponents(altered).effects.some((e) => e.kind === 'whisperRefrain')).toBe(false);
    const { w, p, boss } = setup();
    setSubclassPassive(p, undefined);
    p.abilities!.a3 = refreshed;
    applyBuff(p, makeBuff('harmony', 0, 8, 'test-harmony'));
    applyBuff(p, makeBuff('discord', 0, 8, 'test-discord'));
    use(w, p, 'a3');
    expect(image(p)?.mult).toBe(4);
    const before = boss.hp;
    hit(w, p);
    expect(boss.hp).toBeCloseTo(before - 29);
    expect(image(p)?.mult).toBe(3);
  });
});
