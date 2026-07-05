/**
 * Warband — client-side snapshot interpolation.
 *
 * The host streams authoritative `Snapshot`s at ~20 Hz. To hide jitter and
 * packet timing, clients render `INTERP_DELAY_MS` in the past and linearly
 * interpolate entity positions between the two buffered snapshots that bracket
 * that render time. Non-positional data (hp, state, telegraph, facing, zones)
 * is carried verbatim from the newer of the two snapshots — never interpolated.
 *
 * `net/client.ts` depends on this EXACT public interface.
 */
import type {
  Snapshot,
  PlayerView,
  BossView,
  AddView,
  ProjectileView,
  ZoneView,
  TerrainView,
  RenderState,
  GameEvent,
  Vec2,
  EntityId,
} from '../engine/types';
import { INTERP_DELAY_MS } from '../engine/constants';

interface Buffered {
  snap: Snapshot;
  recvMs: number;
}

/** How long to keep snapshots around (ms) and a hard cap on buffer length. */
const MAX_AGE_MS = 1000;
const MAX_BUFFERED = 20;

export interface SampleOpts {
  localPlayerId: EntityId | null;
  arena: { w: number; h: number };
  predictedLocalPos?: Vec2 | null;
}

export class SnapshotInterpolator {
  /** Buffered snapshots, kept in ascending `recvMs` (arrival) order. */
  private buffer: Buffered[] = [];
  /** Highest snapshot tick whose events have already been emitted. */
  private lastEmittedTick = -1;

  /** Store an incoming snapshot; prune stale / excess entries. */
  push(snap: Snapshot): void {
    const recvMs = performance.now();
    this.buffer.push({ snap, recvMs });
    const cutoff = recvMs - MAX_AGE_MS;
    while (this.buffer.length > 0 && this.buffer[0].recvMs < cutoff) {
      this.buffer.shift();
    }
    if (this.buffer.length > MAX_BUFFERED) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFERED);
    }
  }

  /** The most recent view of the local player (by peerId) — used for prediction. */
  latestOwnView(selfId: string): PlayerView | null {
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const p = this.buffer[i].snap.players.find((pl) => pl.peerId === selfId);
      if (p) return p;
    }
    return null;
  }

  /**
   * Produce a `RenderState` for the given wall-clock time. Returns null if no
   * snapshots are buffered yet.
   */
  sample(nowMs: number, opts: SampleOpts): RenderState | null {
    if (this.buffer.length === 0) return null;

    const renderTime = nowMs - INTERP_DELAY_MS;

    // Find the pair bracketing renderTime by arrival time.
    let older: Buffered | null = null;
    let newer: Buffered | null = null;
    for (let i = 0; i < this.buffer.length; i++) {
      const b = this.buffer[i];
      if (b.recvMs <= renderTime) {
        older = b;
      } else {
        newer = b;
        break;
      }
    }

    // Decide which snapshot carries authoritative data and whether we lerp.
    let carry: Snapshot;
    let from: Snapshot | null;
    let t: number;
    if (older && newer) {
      // Bracketed: lerp positions older->newer, carry the rest from newer.
      carry = newer.snap;
      from = older.snap;
      const span = newer.recvMs - older.recvMs;
      t = span > 1e-6 ? (renderTime - older.recvMs) / span : 1;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    } else if (older) {
      // Render time past the newest buffered snapshot: clamp to newest.
      carry = older.snap;
      from = null;
      t = 1;
    } else {
      // Render time before the oldest buffered snapshot: use it directly.
      carry = (newer as Buffered).snap;
      from = null;
      t = 0;
    }

    const players = this.lerpPlayers(from, carry, t);
    const boss = this.lerpBoss(from, carry, t);
    const adds = this.lerpAdds(from, carry, t);
    const projectiles = this.lerpProjectiles(from, carry, t);

    // Zones + terrain + events come from the carry (newer) snapshot / buffer.
    const groundZones: ZoneView[] = carry.groundZones.map((z) => ({ ...z }));
    const terrain: TerrainView[] = carry.terrain.map((t) => ({ ...t }));
    const events = this.collectEvents();

    // Client-side prediction override for the local player.
    if (opts.predictedLocalPos && opts.localPlayerId != null) {
      for (const p of players) {
        if (p.id === opts.localPlayerId) {
          p.pos = { x: opts.predictedLocalPos.x, y: opts.predictedLocalPos.y };
          break;
        }
      }
    }

    return {
      tick: carry.tick,
      players,
      boss,
      adds,
      projectiles,
      groundZones,
      terrain,
      events,
      localPlayerId: opts.localPlayerId,
      arena: opts.arena,
    };
  }

  reset(): void {
    this.buffer = [];
    this.lastEmittedTick = -1;
  }

  // --- internals -----------------------------------------------------------

  private lerpVec(a: Vec2 | undefined, b: Vec2, t: number): Vec2 {
    if (!a) return { x: b.x, y: b.y };
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  private lerpPlayers(from: Snapshot | null, carry: Snapshot, t: number): PlayerView[] {
    const prev = from ? indexById(from.players) : null;
    return carry.players.map((p) => ({
      ...p,
      pos: this.lerpVec(prev?.get(p.id)?.pos, p.pos, t),
    }));
  }

  private lerpBoss(from: Snapshot | null, carry: Snapshot, t: number): BossView | null {
    if (!carry.boss) return null;
    const prev = from?.boss && from.boss.id === carry.boss.id ? from.boss : undefined;
    // Telegraph + facing intentionally taken from `carry` (never interpolated).
    return { ...carry.boss, pos: this.lerpVec(prev?.pos, carry.boss.pos, t) };
  }

  private lerpAdds(from: Snapshot | null, carry: Snapshot, t: number): AddView[] {
    const prev = from ? indexById(from.adds) : null;
    return carry.adds.map((a) => ({
      ...a,
      pos: this.lerpVec(prev?.get(a.id)?.pos, a.pos, t),
    }));
  }

  private lerpProjectiles(
    from: Snapshot | null,
    carry: Snapshot,
    t: number,
  ): ProjectileView[] {
    const prev = from ? indexById(from.projectiles) : null;
    return carry.projectiles.map((pr) => ({
      ...pr,
      pos: this.lerpVec(prev?.get(pr.id)?.pos, pr.pos, t),
    }));
  }

  /** Emit each snapshot's events exactly once across the whole buffer. */
  private collectEvents(): GameEvent[] {
    const events: GameEvent[] = [];
    let newest = this.lastEmittedTick;
    for (const b of this.buffer) {
      if (b.snap.tick > this.lastEmittedTick) {
        for (const e of b.snap.events) events.push(e);
        if (b.snap.tick > newest) newest = b.snap.tick;
      }
    }
    this.lastEmittedTick = newest;
    return events;
  }
}

/** Build an id->entity lookup for a list of entities that carry an `id`. */
function indexById<E extends { id: EntityId }>(list: E[]): Map<EntityId, E> {
  const m = new Map<EntityId, E>();
  for (const e of list) m.set(e.id, e);
  return m;
}
