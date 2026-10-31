/**
 * Warband — buff/debuff glyphs shared by the canvas labels and the React HUD.
 * Pure (only depends on the BuffView shape) so both the renderer and the HUD can
 * read out, at a glance, what is affecting a creature and for how long.
 */
import type { BuffView, BuffKind } from '../../engine/core/types';

export interface BuffBadge {
  glyph: string;
  /** Whole seconds remaining (for the cooldown number shown beside the glyph). */
  secs: number;
  /** CSS/Pixi hex color for the badge accent. */
  color: number;
  good: boolean;
  label: string;
  /**
   * item 1 — a CONSTANT status with no duration (a permanent flyer's airborne
   * state): the badge shows the glyph alone, with no (misleading) countdown. Timed
   * buffs leave this unset and keep their shrinking `secs`.
   */
  permanent?: boolean;
}

/** Emoji + accent for one buff/debuff, or null if it shouldn't surface. */
function describe(
  kind: BuffKind,
  mult: number,
): { glyph: string; color: number; good: boolean; label: string } | null {
  switch (kind) {
    case 'auraBulwark':
      return {
        glyph: '🏰',
        color: 0xffdc79,
        good: true,
        label: 'Bulwark aura: 15% less damage; stuns, roots, slows and silence last 35% less',
      };
    case 'auraStrike':
      return {
        glyph: '⚔️',
        color: 0xffdc79,
        good: true,
        label: 'Pursuit: next connecting melee hit deals 25% more damage; once per activation',
      };
    case 'auraRenewal':
      return {
        glyph: '💚',
        color: 0x7fe3a5,
        good: true,
        label: 'Renewal aura: 10 HP/s while nearby; equivalent auras do not stack',
      };
    case 'absorption':
      return {
        glyph: '🫧',
        color: 0x7edfff,
        good: true,
        label: `Absorption: ${Math.ceil(mult)} protection HP; consumed before health, after damage reduction`,
      };
    case 'bloodRage':
      return {
        glyph: '🩸',
        color: 0xff6655,
        good: true,
        label: 'Blood Frenzy: pay 2% max HP/s; leech 20% of direct damage; cost cannot kill you',
      };
    case 'wolfHunt':
      return {
        glyph: '🐺',
        color: 0x6bbf59,
        good: true,
        label: 'Wolf Hunt: walk 120u for a momentum stack; melee hits do not build stacks',
      };
    case 'mirrorImages':
      return {
        glyph: '🪞',
        color: 0xc7b8ff,
        good: true,
        label: `Mirror images: ${Math.round(mult)} left; each reduces one direct hit by 60%, then breaks; ground damage bypasses`,
      };
    case 'frontGuard':
      return {
        glyph: '◖',
        color: 0x80e4ff,
        good: true,
        label: `Frontal guard: ${Math.round(mult)} damage blocks, aim within 120°; ground hazards and control bypass it`,
      };
    case 'steadfast':
      return {
        glyph: '⚓',
        color: 0xffce70,
        good: true,
        label: 'Steadfast: prevents roots, stuns, pushes and pulls; slows still apply',
      };
    case 'guard':
      return {
        glyph: '🏰',
        color: 0x59d9ff,
        good: true,
        label: 'Guard: taking a nonlethal hit readies one +30% melee counter',
      };
    case 'counter':
      return {
        glyph: '⚔️',
        color: 0xffd36b,
        good: true,
        label: 'Counter ready: next connecting melee hit deals +30% damage',
      };
    case 'moonRest':
      return {
        glyph: '🌙',
        color: 0xa5a0c9,
        good: true,
        label:
          'Moon rest: next special can transform when this countdown ends; all abilities remain usable',
      };
    case 'moonForm':
      return {
        glyph: '🐻',
        color: 0xd8c7ff,
        good: true,
        label:
          'Moon bear: +20% movement; basics add a 14-damage aimed claw at 95u; close direct hits/claws mend 3% max HP (minimum 4) once per 1s; all spells retained',
      };
    case 'packBond':
      return {
        glyph: '🐾',
        color: 0xffdc79,
        good: true,
        label:
          'Pack Bond: next successful spirit bite grants the healed ally 8% max-HP absorption (minimum 12) for 4s, within 420u',
      };
    case 'rampage':
      return {
        glyph: '🪓',
        color: 0xff9a3d,
        good: true,
        label: `Rampage: next basic cast +${Math.round(mult * 10)}% damage and +${mult * 8}u melee reach; a miss spends it`,
      };
    case 'momentum':
      return {
        glyph: '🔥',
        color: 0xff9a3d,
        good: true,
        label: `Momentum ${Math.round(mult)}/3: finisher gains +10% damage and more reach per stack`,
      };
    case 'flow':
      return {
        glyph: '🌊',
        color: 0x59d9ff,
        good: true,
        label: 'Flow: next marked skill is instant, with its listed reach/control bonus',
      };
    case 'harmony':
      return {
        glyph: '🎶',
        color: 0x7dffa0,
        good: true,
        label:
          'Harmony verse: stored healing, no effect alone. Get Discord, then use Inspiration/Battle Hymn.',
      };
    case 'discord':
      return {
        glyph: '🎭',
        color: 0xc06cff,
        good: true,
        label:
          'Discord verse: stored disruption, no effect alone. Get Harmony by healing, then use Inspiration/Battle Hymn.',
      };
    case 'spellSurge':
      return {
        glyph: '🔮',
        color: 0xc06cff,
        good: true,
        label: 'Spell surge: next heavy spell empowered',
      };
    case 'wildWeave':
      return {
        glyph: '🌀',
        color: 0xc06cff,
        good: true,
        label:
          'Spell Weave: next positive direct hit returns 2s to your last Surge-preparation utility, or gives 20% movement for 2s during protected recovery',
      };
    case 'fortune':
      return {
        glyph: '🍀',
        color: 0x8eff9b,
        good: true,
        label:
          'Fortune: next positive direct hit delays enemy wind-ups and weakens their damage; misses and ticks preserve it',
      };
    case 'luckExposure':
      return {
        glyph: '🎲',
        color: 0x8eff9b,
        good: false,
        label: `Loaded Fate: the owner’s next direct hit from a different cast deals +${Math.round((mult - 1) * 100)}% damage`,
      };
    case 'rescueStrike':
      return {
        glyph: '✨',
        color: 0xffe588,
        good: true,
        label: `Rescue follow-through: next direct hit +${Math.round((mult - 1) * 100)}% damage; ticks cannot spend it`,
      };
    case 'radiantCharge':
      return {
        glyph: '☀️',
        color: 0xffe588,
        good: true,
        label: 'Refulgence: next direct hit +25% damage and 30% slower enemy wind-ups for 3s',
      };
    case 'refrainEcho':
      return {
        glyph: '🎶',
        color: 0x66ff88,
        good: true,
        label:
          'Echoed Refrain: next effective dedicated heal echoes 50%, up to max(35, 12% recipient max HP)',
      };
    case 'grandOpening':
      return {
        glyph: '🎯',
        color: 0xffb168,
        good: false,
        label: 'Exposed: marking Rogue’s next direct hit deals 25% more',
      };
    case 'grandCadence':
      return {
        glyph: '🔥',
        color: 0xf68042,
        good: true,
        label: `Hellfire cadence: ${Math.round(mult)}/3 cursed direct hits`,
      };
    case 'spellblade':
      return {
        glyph: '⚔️',
        color: 0xb488e0,
        good: true,
        label: 'Spellblade: next melee hit empowered',
      };
    case 'precision':
      return { glyph: '🗡️', color: 0xffd36b, good: true, label: 'Prepared critical strike' };
    case 'curse':
      return {
        glyph: '🕸️',
        color: 0xb488e0,
        good: false,
        label: 'Hexed: caster deals extra damage',
      };
    case 'evocation':
      return {
        glyph: '⚡',
        color: 0xb49aff,
        good: true,
        label:
          'Evocation ready: next nonbasic damaging spell gains 25% damage and half wind-up; basics and utility preserve it',
      };
    case 'challengeReady':
      return {
        glyph: '📣',
        color: 0xd4b16b,
        good: true,
        label: 'Challenge ready: next connecting melee cast readies a +30% counter',
      };
    case 'venomReady':
      return {
        glyph: '🧪',
        color: 0x85c75a,
        good: true,
        label:
          'Blade coated: next positive direct hit poisons one foe; held precision waits for a prepared strike, which gains 50% poison damage',
      };
    case 'venom':
      return {
        glyph: '🧪',
        color: 0x85c75a,
        good: false,
        label: 'Poisoned: damage every second; poison follows this enemy',
      };
    case 'brambleReady':
      return {
        glyph: '🌵',
        color: 0x89c96a,
        good: true,
        label:
          'Bramble ready: next positive nearby direct hit or bear claw releases a slowing burst around you; misses and zone ticks preserve it',
      };
    case 'rebuke':
      return { glyph: '🔥', color: 0xff9a3d, good: true, label: 'Counterburst ready' };
    case 'stun':
      return { glyph: '💫', color: 0xffe14d, good: false, label: 'Stunned' };
    case 'silence':
      return { glyph: '🔇', color: 0xc06cff, good: false, label: 'Silenced' };
    case 'root': // item 9 — immobilised (movement + blink/charge/teleport disabled)
      return { glyph: '🌿', color: 0x6bbf59, good: false, label: 'Rooted' };
    case 'castSlow': // item 9 — wind-up / cast time stretched (Hex, venom)
      return { glyph: '⏳', color: 0xb488e0, good: false, label: 'Sluggish' };
    case 'invuln':
      return { glyph: '✨', color: 0xbfe9ff, good: true, label: 'Invulnerable' };
    case 'flight': // item 7 — airborne: soaring over ground effects
      return { glyph: '🕊️', color: 0xbfe0ff, good: true, label: 'Airborne' };
    case 'moveSpeed':
      return mult < 1
        ? { glyph: '🐌', color: 0x59a0ff, good: false, label: 'Slowed' }
        : { glyph: '💨', color: 0x7dffa0, good: true, label: 'Hastened' };
    case 'damageDealt':
      return mult >= 1
        ? { glyph: '💪', color: 0xff9a3d, good: true, label: 'Empowered' }
        : { glyph: '🔻', color: 0x9a7dff, good: false, label: 'Weakened' };
    case 'damageTaken':
      return mult <= 1
        ? { glyph: '🛡️', color: 0x59d9ff, good: true, label: 'Shielded' }
        : { glyph: '💔', color: 0xff5a5a, good: false, label: 'Vulnerable' };
    default:
      return null;
  }
}

/**
 * Build compact badges for a list of buffs (deduped by glyph, longest wins).
 *
 * item 1 — `flying` surfaces a CONSTANT flyer's airborne state (a boss with
 * `MonsterDef.flying`, which carries no timed `'flight'` buff): a permanent 🕊️
 * badge with no countdown, inserted first so it survives the `cap` and wins over
 * any same-glyph timed buff. Timed flyers surface through their real buff instead,
 * so the default `flying = false` keeps every non-flyer byte-identical.
 */
export function buffBadges(buffs: BuffView[] | undefined, cap = 4, flying = false): BuffBadge[] {
  const byGlyph = new Map<string, BuffBadge>();
  if (flying) {
    const d = describe('flight', 0);
    if (d) byGlyph.set(d.glyph, { ...d, secs: 0, permanent: true });
  }
  if (buffs) {
    for (const b of buffs) {
      const d = describe(b.kind, b.mult);
      if (!d) continue;
      const existing = byGlyph.get(d.glyph);
      if (existing?.permanent) continue; // constant status already shown — don't overwrite it
      const secs = Math.max(1, Math.ceil(b.remaining));
      if (!existing || secs > existing.secs) {
        byGlyph.set(d.glyph, {
          glyph: d.glyph,
          secs,
          color: d.color,
          good: d.good,
          label: d.label,
        });
      }
    }
  }
  return [...byGlyph.values()].slice(0, cap);
}

/** One-line text summary ("🛡️2 ❄3") for a canvas label. A permanent badge (a
 * constant flyer's flight) shows the glyph alone, without a countdown. */
export function buffLabel(buffs: BuffView[] | undefined, cap = 4, flying = false): string {
  return buffBadges(buffs, cap, flying)
    .map((b) => (b.permanent ? b.glyph : `${b.glyph}${b.secs}`))
    .join(' ');
}
