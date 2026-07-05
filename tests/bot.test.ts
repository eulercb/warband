import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world';
import { computeBotInput, isBotPeerId, BOT_PEER_PREFIX } from '../src/engine/bot';
import type { InputCommand } from '../src/engine/types';

function botMap(w: World): Map<string, InputCommand> {
  const map = new Map<string, InputCommand>();
  for (const p of w.players) map.set(p.peerId, computeBotInput(w, p, w.tick));
  return map;
}

describe('bot: peer id helpers', () => {
  it('recognises bot peer ids', () => {
    expect(isBotPeerId(`${BOT_PEER_PREFIX}1`)).toBe(true);
    expect(isBotPeerId('real-peer-id')).toBe(false);
  });
});

describe('bot: input is always well-formed', () => {
  it('emits finite input with |move|<=1 and a unit aim', () => {
    const w = new World({
      monsterId: 'lich',
      seed: 3,
      players: [{ peerId: 'bot:1', name: 'B', classId: 'mage' }],
    });
    for (let t = 0; t < 40; t++) {
      const cmd = computeBotInput(w, w.players[0], w.tick);
      expect(Number.isFinite(cmd.move.x)).toBe(true);
      expect(Number.isFinite(cmd.move.y)).toBe(true);
      expect(Math.hypot(cmd.move.x, cmd.move.y)).toBeLessThanOrEqual(1.0001);
      expect(Math.hypot(cmd.aim.x, cmd.aim.y)).toBeCloseTo(1, 3);
      w.step(0.05, botMap(w));
    }
  });
});

describe('bot: actually fights', () => {
  it('an all-bot party damages the boss and stays NaN-free', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 8,
      players: [
        { peerId: 'bot:1', name: 'Knight', classId: 'knight' },
        { peerId: 'bot:2', name: 'Ranger', classId: 'ranger' },
        { peerId: 'bot:3', name: 'Cleric', classId: 'cleric' },
      ],
    });
    const startHp = w.boss!.hp;
    for (let t = 0; t < 400 && !w.finished; t++) {
      w.step(0.05, botMap(w));
      for (const p of w.players) {
        expect(Number.isFinite(p.pos.x)).toBe(true);
        expect(Number.isFinite(p.hp)).toBe(true);
      }
      expect(Number.isFinite(w.boss!.hp)).toBe(true);
    }
    expect(w.boss!.hp).toBeLessThan(startHp); // bots dealt damage
  });
});

describe('bot: co-op behaviour', () => {
  it('moves to revive a downed ally in range', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 2,
      players: [
        { peerId: 'bot:1', name: 'Medic', classId: 'cleric' },
        { peerId: 'p2', name: 'Fallen', classId: 'ranger' },
      ],
    });
    w.boss = null;
    const bot = w.players[0];
    const ally = w.players[1];
    bot.pos = { x: 500, y: 500 };
    ally.pos = { x: 560, y: 500 }; // within BOT_REVIVE_RANGE
    ally.state = 'downed';
    ally.downedTimer = 15;

    const cmd = computeBotInput(w, bot, 0);
    expect(cmd.buttons.revive).toBe(true);
    // Heading toward the ally (to the right).
    expect(cmd.move.x).toBeGreaterThanOrEqual(0);
  });
});
