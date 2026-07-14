/**
 * Warband — speech balloons.
 *
 * When a player or boss uses a named ability, a little labelled bubble pops up
 * over their head ("Cleave!", "Fire Breath!") so the whole band can read what
 * everyone is doing. Driven by `cast` events; one balloon per source at a time
 * (a new cast replaces the old text and resets the timer). Pooled `Container`s
 * of a rounded-rect `Graphics` + `Text`; nothing here touches React.
 */
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameEvent, RenderState } from '../../engine/core/types';
import type { Camera } from '../pipeline/camera';
import { getMonster } from '../../engine/content/monsters';
import { PLAYER_RADIUS, ADD_RADIUS } from '../../engine/core/constants';
import { clamp } from '../../engine/core/math';

const POOL = 10;
const TTL = 1.7; // s the balloon stays up
const FADE = 0.45; // s of fade-out at the end
const RISE_PX = 10; // gentle upward drift over its life
const CAST_SUFFIX = ' (cast)';

interface BalloonNode {
  container: Container;
  bg: Graphics;
  text: Text;
}

interface Active {
  sourceId: number;
  side: 'player' | 'boss';
  age: number;
  node: BalloonNode;
  lastX: number;
  lastY: number;
}

export class Balloons {
  readonly container = new Container();
  private readonly free: BalloonNode[] = [];
  /** sourceId -> its live balloon (at most one per source). */
  private readonly active = new Map<number, Active>();

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const node = this.makeNode();
      node.container.visible = false;
      this.container.addChild(node.container);
      this.free.push(node);
    }
  }

  /** Spawn/refresh balloons from this frame's `cast` events. */
  ingest(events: GameEvent[]): void {
    for (const e of events) {
      if (e.t !== 'cast') continue;
      // Players: only announce real abilities (Q/E/R), not the spammy basic.
      if (e.side === 'player' && (e.slot == null || e.slot === 'basic')) continue;
      const label = e.ability.endsWith(CAST_SUFFIX)
        ? e.ability.slice(0, -CAST_SUFFIX.length)
        : e.ability;
      this.spawn(e.sourceId, e.side, label);
    }
  }

  /** item 78: true while a source has a live balloon, so the renderer can hand the
   *  anchor to the balloon and hide that entity's name label (no z-fight). */
  isActive(sourceId: number): boolean {
    return this.active.has(sourceId);
  }

  /** Position/fade balloons over their source each frame; retire expired ones. */
  update(state: RenderState, camera: Camera, dtMs: number): void {
    const dt = dtMs / 1000;
    for (const [id, a] of this.active) {
      a.age += dt;
      if (a.age >= TTL) {
        this.retire(id, a);
        continue;
      }
      const loc = this.locate(state, camera, a);
      const t = clamp(a.age / TTL, 0, 1);
      const fadeAlpha = a.age > TTL - FADE ? clamp((TTL - a.age) / FADE, 0, 1) : 1;
      a.node.container.position.set(loc.x, loc.y - RISE_PX * t);
      a.node.container.alpha = fadeAlpha;
    }
  }

  destroy(): void {
    for (const [, a] of this.active) a.node.container.destroy({ children: true });
    for (const n of this.free) n.container.destroy({ children: true });
    this.active.clear();
    this.free.length = 0;
    this.container.destroy();
  }

  // --- internals -----------------------------------------------------------

  private spawn(sourceId: number, side: 'player' | 'boss', label: string): void {
    let a = this.active.get(sourceId);
    if (!a) {
      const node = this.free.pop() ?? this.evictOldest();
      if (!node) return;
      node.container.visible = true;
      a = { sourceId, side, age: 0, node, lastX: 0, lastY: 0 };
      this.active.set(sourceId, a);
    }
    a.side = side;
    a.age = 0;
    this.setText(a.node, label, side);
  }

  /** Find the source's current screen position (falls back to last known). */
  private locate(state: RenderState, camera: Camera, a: Active): { x: number; y: number } {
    let worldY: number | null = null;
    let radius = PLAYER_RADIUS;
    let x = a.lastX;
    let y = a.lastY;
    const srcBoss = a.side === 'boss' ? state.bosses.find((b) => b.id === a.sourceId) : undefined;
    if (srcBoss) {
      const s = camera.worldToScreen(srcBoss.pos);
      x = s.x;
      worldY = s.y;
      radius = getMonster(srcBoss.monsterId).radius;
    } else {
      const p = state.players.find((pl) => pl.id === a.sourceId);
      if (p) {
        const s = camera.worldToScreen(p.pos);
        x = s.x;
        worldY = s.y;
        radius = PLAYER_RADIUS;
      } else {
        const add = state.adds.find((ad) => ad.id === a.sourceId);
        if (add) {
          const s = camera.worldToScreen(add.pos);
          x = s.x;
          worldY = s.y;
          radius = ADD_RADIUS;
        }
      }
    }
    if (worldY !== null) {
      y = worldY - radius * camera.scale - 30;
      a.lastX = x;
      a.lastY = y;
    }
    return { x, y };
  }

  private retire(id: number, a: Active): void {
    a.node.container.visible = false;
    this.active.delete(id);
    this.free.push(a.node);
  }

  private evictOldest(): BalloonNode | null {
    let oldestId = -1;
    let oldestAge = -1;
    for (const [id, a] of this.active) {
      if (a.age > oldestAge) {
        oldestAge = a.age;
        oldestId = id;
      }
    }
    if (oldestId < 0) return null;
    const a = this.active.get(oldestId)!;
    this.active.delete(oldestId);
    return a.node;
  }

  private makeNode(): BalloonNode {
    const container = new Container();
    const bg = new Graphics();
    const text = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        fontWeight: '700',
        fill: 0xffffff,
        align: 'center',
      }),
    });
    text.anchor.set(0.5);
    container.addChild(bg, text);
    return { container, bg, text };
  }

  private setText(node: BalloonNode, label: string, side: 'player' | 'boss'): void {
    node.text.text = label;
    const w = Math.max(24, node.text.width) + 16;
    const h = node.text.height + 10;
    const border = side === 'boss' ? 0xff5a4a : 0xffffff;
    node.bg.clear();
    node.bg
      .roundRect(-w / 2, -h / 2, w, h, 7)
      .fill({ color: 0x14141c, alpha: 0.86 })
      .stroke({ width: 1.5, color: border, alpha: 0.9 });
    // Little downward tail toward the speaker.
    node.bg
      .poly([-5, h / 2 - 1, 5, h / 2 - 1, 0, h / 2 + 6])
      .fill({ color: 0x14141c, alpha: 0.86 });
  }
}
