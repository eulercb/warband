/**
 * Warband — HUD overlay (React). Reads the throttled hudStore updated by the
 * game loop; never re-renders from the hot per-frame path directly.
 */
import { useHudStore } from './hudStore';
import { useStore } from './store';
import { CLASSES } from '../engine/classes';
import type { AbilitySlot, ClassId } from '../engine/types';
import './hud.css';

const SLOT_ORDER: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];
const SLOT_KEYS: Record<AbilitySlot, string> = {
  basic: 'LMB',
  a1: 'Q',
  a2: 'E',
  a3: 'R',
};

function pct(v: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (v / max) * 100));
}

function AbilityIcon({ slot, classId }: { slot: AbilitySlot; classId: ClassId }) {
  const remaining = useHudStore((s) => s.cooldowns[slot]);
  const ability = CLASSES[classId].abilities[slot];
  const total = ability.cooldown;
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const ready = frac <= 0.001;
  return (
    <div className={`hud-ability${ready ? ' ready' : ''}`}>
      <div className="hud-ability-key">{SLOT_KEYS[slot]}</div>
      <div className="hud-ability-name">{ability.name}</div>
      <div className="hud-cd" style={{ height: `${frac * 100}%` }} />
      {!ready && <div className="hud-cd-num">{remaining.toFixed(1)}</div>}
    </div>
  );
}

export default function HUD() {
  const hud = useHudStore();
  const muted = useStore((s) => s.muted);
  const toggleMute = useStore((s) => s.toggleMute);

  const bossHpPct = pct(hud.bossHp, hud.bossMaxHp);
  const hpPct = pct(hud.hp, hud.maxHp);

  return (
    <div className="hud-root">
      {/* Boss bar */}
      {hud.bossPresent && (
        <div className="hud-bossbar">
          <div className="hud-bossbar-label">
            {hud.bossName}
            {hud.bossPhase === 'enraged' && <span className="hud-enrage-tag">ENRAGED</span>}
          </div>
          <div className="hud-bossbar-track">
            <div
              className={`hud-bossbar-fill${hud.bossPhase === 'enraged' ? ' enraged' : ''}`}
              style={{ width: `${bossHpPct}%` }}
            />
          </div>
          <div className="hud-bossbar-num">
            {Math.round(hud.bossHp)} / {Math.round(hud.bossMaxHp)}
          </div>
        </div>
      )}

      {/* Teammate frames */}
      <div className="hud-teammates">
        {hud.teammates.map((t) => (
          <div
            key={t.id}
            className={`hud-teammate cls-${t.classId}${
              t.state === 'downed' ? ' downed' : t.state === 'dead' ? ' dead' : ''
            }${t.isLocal ? ' local' : ''}`}
          >
            <div className="hud-teammate-name">
              {t.name}
              {t.state === 'downed' && ' ⤓'}
              {t.state === 'dead' && ' ✕'}
            </div>
            <div className="hud-healthbar small">
              <div className="hud-healthbar-fill" style={{ width: `${pct(t.hp, t.maxHp)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Downed note */}
      {hud.state === 'downed' && (
        <div className="hud-downed-note">
          <div className="hud-downed-title">You are down!</div>
          {hud.reviveProgress > 0 ? (
            <div className="hud-downed-sub">
              Being revived… {Math.round(hud.reviveProgress * 100)}%
            </div>
          ) : (
            <div className="hud-downed-sub">
              Hold on — bleed-out in {Math.ceil(hud.downedTimer)}s
            </div>
          )}
        </div>
      )}
      {hud.state === 'dead' && (
        <div className="hud-downed-note">
          <div className="hud-downed-title">You have fallen</div>
          <div className="hud-downed-sub">Spectating — cheer your band on.</div>
        </div>
      )}

      {/* Local health + abilities */}
      <div className="hud-bottom">
        <div className={`hud-selfhp cls-${hud.classId ?? 'knight'}`}>
          <div className="hud-healthbar">
            <div className="hud-healthbar-fill" style={{ width: `${hpPct}%` }} />
            <span className="hud-healthbar-num">
              {Math.round(hud.hp)} / {Math.round(hud.maxHp)}
            </span>
          </div>
        </div>
        {hud.classId && (
          <div className="hud-abilities">
            {SLOT_ORDER.map((slot) => (
              <AbilityIcon key={slot} slot={slot} classId={hud.classId as ClassId} />
            ))}
          </div>
        )}
      </div>

      {/* Controls hint + mute */}
      <div className="hud-hint">
        WASD move · Mouse aim · LMB/Space basic · Q/E/R abilities · F revive
      </div>
      <button
        className="hud-mute"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}
