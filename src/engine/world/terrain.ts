/**
 * Warband — per-run PROCEDURAL terrain generation. PURE TS.
 *
 * Terrain is a set of static, themed environmental hazards laid out once at
 * fight start. It is generated deterministically from the run seed so the host
 * and every client agree without extra syncing, and it is themed by the boss:
 * magma in the dragon's lair, swamp in the troll's forest, cursed ice and
 * death-fog in the lich's crypt. Twin encounters blend BOTH bosses' themes.
 *
 * Instead of pure random scatter, each fight rolls a LAYOUT ARCHETYPE — a
 * winding river of hazard, pool clusters, a ring around the arena's heart, a
 * sweeping crescent, or the classic scatter — so arenas read as designed
 * spaces while staying different every run. Patches slow and/or damage players
 * who stand in them (see world.ts `updateTerrain`), turning the flat arena
 * into a positioning puzzle.
 */
import type { MonsterId, TerrainKind, TerrainPatch, Vec2 } from '../core/types';
import { Rng } from '../core/math';
import {
  ARENA_W,
  ARENA_H,
  TERRAIN_MIN_RADIUS,
  TERRAIN_MAX_RADIUS,
  TERRAIN_MAX_PATCHES,
  TERRAIN_SPAWN_CLEARANCE,
  TERRAIN_TICK_INTERVAL,
  TERRAIN_ABYSS_CORE_FRAC,
} from '../core/constants';

/** Static balance profile for one terrain kind (per-tick = per 0.5s). */
interface TerrainProfile {
  kind: TerrainKind;
  damagePerTick: number; // to players inside
  slowMult: number; // moveSpeed mult while inside (1 = none)
  slowDuration: number; // s the slow lingers after leaving
  /** Relative selection weight within a theme. */
  weight: number;
  /**
   * Bottomless lethal-core radius as a FRACTION of the patch radius (the abyss).
   * A surge that drags a hero this deep plunges them to an environmental death
   * (item 28). Absent = no lethal core.
   */
  lethalFrac?: number;
}

const PROFILES: Record<TerrainKind, TerrainProfile> = {
  magma: { kind: 'magma', damagePerTick: 9, slowMult: 0.6, slowDuration: 1.2, weight: 3 },
  ember: { kind: 'ember', damagePerTick: 0, slowMult: 0.7, slowDuration: 1.0, weight: 2 },
  swamp: { kind: 'swamp', damagePerTick: 4, slowMult: 0.5, slowDuration: 1.6, weight: 3 },
  bog: { kind: 'bog', damagePerTick: 0, slowMult: 0.45, slowDuration: 1.8, weight: 2 },
  ice: { kind: 'ice', damagePerTick: 0, slowMult: 0.5, slowDuration: 0.6, weight: 3 },
  deathfog: { kind: 'deathfog', damagePerTick: 6, slowMult: 0.85, slowDuration: 1.0, weight: 2 },
  // Signature terrains (item 28). The abyss carries a bottomless lethal core.
  tide: { kind: 'tide', damagePerTick: 3, slowMult: 0.4, slowDuration: 1.4, weight: 3 },
  abyss: {
    kind: 'abyss',
    damagePerTick: 11,
    slowMult: 0.7,
    slowDuration: 1.0,
    weight: 2,
    lethalFrac: TERRAIN_ABYSS_CORE_FRAC,
  },
  // Signature terrains (item 28 follow-up): the vampire's blood-mire (heavy slow,
  // steady drain) and the demon's brimstone fissures (heavy burn). Both SURGE with
  // a non-lethal pull (see world.TERRAIN_SURGE) so they threaten position, not just HP.
  bloodmire: { kind: 'bloodmire', damagePerTick: 6, slowMult: 0.4, slowDuration: 1.5, weight: 3 },
  brimstone: { kind: 'brimstone', damagePerTick: 12, slowMult: 0.7, slowDuration: 1.0, weight: 3 },
};

/**
 * The signature terrains (item 28 + follow-up): a boss's home ground that reads
 * as its own and — unlike the six generic themes — carries a mechanic (a lethal
 * core or a telegraphed surge-pull), so more marquee bosses fight on distinctive,
 * positionally-relevant terrain. Exported so tests can assert the breadth target.
 */
export const SIGNATURE_TERRAINS: ReadonlySet<TerrainKind> = new Set([
  'tide',
  'abyss',
  'bloodmire',
  'brimstone',
]);

/**
 * Which terrain kinds each boss's arena is themed with. Fiery brutes get magma,
 * forest/swamp beasts get bog, and undead/cold things get ice + death-fog. Any
 * boss without an explicit theme falls back to a varied mix.
 */
const THEMES: Partial<Record<MonsterId, TerrainKind[]>> = {
  // Fire / infernal
  dragon: ['magma', 'ember'],
  kobold: ['magma', 'ember'],
  wisp: ['ember', 'magma'],
  manticore: ['ember', 'magma'],
  // Forest / swamp / venom
  troll: ['swamp', 'bog'],
  treant: ['swamp', 'bog'],
  spider: ['swamp', 'bog'],
  gnoll: ['swamp', 'bog'],
  owlbear: ['swamp', 'bog'],
  basilisk: ['swamp', 'bog'],
  mudGolem: ['swamp', 'bog'],
  goblin: ['bog', 'ember'],
  bandit: ['abyss', 'bog'],
  direwolf: ['bog', 'swamp'],
  minotaur: ['swamp', 'bog'],
  fae: ['swamp', 'ember'],
  // Signature arenas (item 28 + follow-up): the Kraken drags you into a surging
  // ocean, the Bandit Captain fights on the lip of a black chasm, the Demon Lord
  // over molten brimstone fissures.
  kraken: ['tide', 'bog'],
  demon: ['brimstone', 'magma'],
  // Frost / undead
  lich: ['ice', 'deathfog'],
  archlich: ['ice', 'deathfog'],
  wraith: ['ice', 'deathfog'],
  zombie: ['deathfog', 'bog'],
  // The Vampire Lord holds court over a mire of spilled blood.
  vampire: ['bloodmire', 'deathfog'],
  deathknight: ['ice', 'deathfog'],
  frostGiant: ['ice', 'ember'],
  mindflayer: ['deathfog', 'ice'],
  // Stone / construct
  animatedArmor: ['ember', 'ice'],
  gargoyle: ['ember', 'ice'],
  cyclops: ['ember', 'bog'],
  ettin: ['bog', 'ember'],
  orc: ['ember', 'bog'],
  beholder: ['deathfog', 'ember'],
  harpy: ['ember', 'bog'],
};

/** A varied mix used when a boss has no explicit terrain theme. */
const DEFAULT_THEME: TerrainKind[] = ['ember', 'bog', 'ice'];

/** How the arena's hazards are arranged this run. Rolled from the seed. */
export type TerrainLayout = 'scatter' | 'river' | 'pools' | 'ring' | 'crescent';

const LAYOUTS: TerrainLayout[] = ['scatter', 'river', 'pools', 'ring', 'crescent'];

/** Weighted pick of a terrain kind from a theme list. */
function pickKind(rng: Rng, kinds: TerrainKind[]): TerrainKind {
  const total = kinds.reduce((s, k) => s + PROFILES[k].weight, 0);
  let roll = rng.range(0, total);
  for (const k of kinds) {
    roll -= PROFILES[k].weight;
    if (roll <= 0) return k;
  }
  return kinds[kinds.length - 1];
}

/** The combined theme for an encounter (twin fights blend both bosses'). */
export function themeFor(monsterIds: MonsterId[]): TerrainKind[] {
  const kinds: TerrainKind[] = [];
  for (const id of monsterIds) {
    for (const k of THEMES[id] ?? DEFAULT_THEME) {
      if (!kinds.includes(k)) kinds.push(k);
    }
  }
  return kinds.length > 0 ? kinds : [...DEFAULT_THEME];
}

/** Reserved keep-clear anchors: party spawn strip (bottom center) + boss start. */
const SPAWN_ANCHOR: Vec2 = { x: ARENA_W / 2, y: ARENA_H - 220 };
const BOSS_ANCHOR: Vec2 = { x: ARENA_W / 2, y: 300 };

/**
 * Build the terrain for one run. `seed` is the run seed; `allocId` mints entity
 * ids from the World so terrain shares the id space with everything else. The
 * boss's opening position and the party's spawn strip are kept clear so nobody
 * starts inside a hazard. Accepts every boss of the encounter so twin fights
 * mix both arenas' themes. (A single MonsterId is accepted for compatibility.)
 */
export function generateTerrain(
  monsterIds: MonsterId | MonsterId[],
  seed: number,
  allocId: () => number,
): TerrainPatch[] {
  // Dedicated RNG derived from the run seed so terrain layout is reproducible
  // on clients and does NOT perturb the world's own RNG stream.
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const ids = Array.isArray(monsterIds) ? monsterIds : [monsterIds];
  const kinds = themeFor(ids);
  const layout = LAYOUTS[rng.int(0, LAYOUTS.length - 1)];

  const anchors = layoutAnchors(rng, layout);
  const patches: TerrainPatch[] = [];
  for (const a of anchors) {
    if (patches.length >= TERRAIN_MAX_PATCHES) break;
    if (near(a.pos, SPAWN_ANCHOR, a.radius + TERRAIN_SPAWN_CLEARANCE)) continue;
    if (near(a.pos, BOSS_ANCHOR, a.radius + TERRAIN_SPAWN_CLEARANCE)) continue;
    // Scatter keeps patches apart; structured layouts intentionally overlap.
    if (layout === 'scatter' && patches.some((p) => near(a.pos, p.pos, a.radius + p.radius - 30)))
      continue;
    const profile = PROFILES[pickKind(rng, kinds)];
    patches.push({
      id: allocId(),
      kind: profile.kind,
      pos: a.pos,
      radius: a.radius,
      damagePerTick: profile.damagePerTick,
      slowMult: profile.slowMult,
      slowDuration: profile.slowDuration,
      tickAccum: 0,
      variant: rng.int(0, 0xffff),
      lethalRadius: profile.lethalFrac ? a.radius * profile.lethalFrac : undefined,
    });
  }
  // A degenerate roll (every anchor rejected by the clearance rules) falls back
  // to one classic blob at a spot known to satisfy them, so no arena is bare.
  if (patches.length === 0) {
    const profile = PROFILES[pickKind(rng, kinds)];
    patches.push({
      id: allocId(),
      kind: profile.kind,
      pos: { x: ARENA_W * 0.5 + 340, y: ARENA_H * 0.5 },
      radius: TERRAIN_MIN_RADIUS,
      damagePerTick: profile.damagePerTick,
      slowMult: profile.slowMult,
      slowDuration: profile.slowDuration,
      tickAccum: 0,
      variant: rng.int(0, 0xffff),
      lethalRadius: profile.lethalFrac ? TERRAIN_MIN_RADIUS * profile.lethalFrac : undefined,
    });
  }
  return patches;
}

/** Candidate patch positions/radii for a layout archetype. */
function layoutAnchors(rng: Rng, layout: TerrainLayout): Array<{ pos: Vec2; radius: number }> {
  const out: Array<{ pos: Vec2; radius: number }> = [];
  const rr = (lo: number, hi: number): number => rng.range(lo, hi);

  switch (layout) {
    case 'scatter': {
      // The classic look: 3-5 independent blobs, generous attempts budget.
      const count = rng.int(3, 5);
      for (let i = 0; i < count * 4 && out.length < count; i++) {
        const radius = rr(TERRAIN_MIN_RADIUS, TERRAIN_MAX_RADIUS);
        out.push({
          pos: { x: rr(radius, ARENA_W - radius), y: rr(radius, ARENA_H - radius) },
          radius,
        });
      }
      break;
    }
    case 'river': {
      // A winding band of hazard crossing the arena horizontally (or vertically),
      // built from a chain of overlapping small patches. Leaves fordable gaps.
      const vertical = rng.next() < 0.4;
      const steps = rng.int(6, 9);
      let t = vertical ? rr(120, ARENA_H * 0.25) : rr(120, ARENA_W * 0.25);
      let cross = vertical ? rr(ARENA_W * 0.25, ARENA_W * 0.75) : rr(ARENA_H * 0.3, ARENA_H * 0.7);
      const advance = ((vertical ? ARENA_H : ARENA_W) - 2 * t) / steps;
      for (let i = 0; i < steps; i++) {
        if (rng.next() < 0.2) {
          // a ford — skip a link so the river is crossable without wading
          t += advance;
          continue;
        }
        cross += rr(-110, 110);
        const radius = rr(TERRAIN_MIN_RADIUS * 0.7, TERRAIN_MIN_RADIUS * 1.15);
        const x = vertical ? cross : t;
        const y = vertical ? t : cross;
        out.push({
          pos: { x: contain(x, radius, ARENA_W), y: contain(y, radius, ARENA_H) },
          radius,
        });
        t += advance;
      }
      break;
    }
    case 'pools': {
      // 2-3 constellations of small pools clustered around hidden anchors.
      const clusters = rng.int(2, 3);
      for (let c = 0; c < clusters; c++) {
        const cx = rr(ARENA_W * 0.18, ARENA_W * 0.82);
        const cy = rr(ARENA_H * 0.2, ARENA_H * 0.8);
        const n = rng.int(2, 4);
        for (let i = 0; i < n; i++) {
          const ang = rr(0, Math.PI * 2);
          const d = rr(40, 150);
          const radius = rr(TERRAIN_MIN_RADIUS * 0.65, TERRAIN_MIN_RADIUS * 1.1);
          out.push({
            pos: {
              x: contain(cx + Math.cos(ang) * d, radius, ARENA_W),
              y: contain(cy + Math.sin(ang) * d, radius, ARENA_H),
            },
            radius,
          });
        }
      }
      break;
    }
    case 'ring': {
      // A broken halo of hazard around the arena's heart — fight inside the
      // eye or skirt the rim, but crossing costs you.
      const cx = ARENA_W / 2 + rr(-120, 120);
      const cy = ARENA_H / 2 + rr(-80, 80);
      const ringR = rr(260, 360);
      const n = rng.int(5, 8);
      const gapAt = rng.int(0, n - 1); // guaranteed doorway
      for (let i = 0; i < n; i++) {
        if (i === gapAt || rng.next() < 0.15) continue;
        const ang = (i / n) * Math.PI * 2 + rr(-0.15, 0.15);
        const radius = rr(TERRAIN_MIN_RADIUS * 0.7, TERRAIN_MIN_RADIUS * 1.05);
        out.push({
          pos: {
            x: contain(cx + Math.cos(ang) * ringR, radius, ARENA_W),
            y: contain(cy + Math.sin(ang) * ringR, radius, ARENA_H),
          },
          radius,
        });
      }
      break;
    }
    case 'crescent': {
      // A sweeping arc through one half of the arena.
      const cx = rr(ARENA_W * 0.3, ARENA_W * 0.7);
      const cy = rr(ARENA_H * 0.35, ARENA_H * 0.65);
      const arcR = rr(280, 420);
      const start = rr(0, Math.PI * 2);
      const sweep = rr(Math.PI * 0.6, Math.PI * 1.1);
      const n = rng.int(4, 6);
      for (let i = 0; i < n; i++) {
        const ang = start + (i / (n - 1)) * sweep;
        const radius = rr(TERRAIN_MIN_RADIUS * 0.75, TERRAIN_MIN_RADIUS * 1.15);
        out.push({
          pos: {
            x: contain(cx + Math.cos(ang) * arcR, radius, ARENA_W),
            y: contain(cy + Math.sin(ang) * arcR, radius, ARENA_H),
          },
          radius,
        });
      }
      break;
    }
  }
  return out;
}

/** Keep a patch fully inside the arena (not a torus wrap — hazards hugging the
 * seam read badly, so layouts stay in the visible field). */
function contain(v: number, radius: number, max: number): number {
  const margin = radius + 6;
  return Math.min(max - margin, Math.max(margin, v));
}

/** Squared-distance proximity test (avoids a sqrt per candidate). */
function near(a: Vec2, b: Vec2, within: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < within * within;
}

export { TERRAIN_TICK_INTERVAL };
