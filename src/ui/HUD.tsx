/**
 * Warband — HUD overlay (React). Reads the throttled hudStore updated by the
 * game loop; never re-renders from the hot per-frame path directly.
 */
import { useHudStore } from './hudStore';
import { useStore } from './store';
import VolumeControl from './VolumeControl';
import { CLASSES } from '../engine/classes';
import {
  useBindings,
  keyLabelFor,
  padLabelFor,
  padIndexToLabel,
  SLOT_ACTION,
} from '../input/bindings';
import { buffBadges } from '../render/buffGlyphs';
import type { AbilitySlot, ClassId, BuffView } from '../engine/types';
import type { InputSource } from '../input/input';
import './hud.css';

const SLOT_ORDER: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];

function pct(v: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (v / max) * 100));
}

/** A compact row of buff/debuff chips (glyph + seconds), colour-coded. */
function BuffChips({ buffs }: { buffs: BuffView[] }) {
  const badges = buffBadges(buffs);
  if (badges.length === 0) return null;
  return (
    <span className="hud-buffs">
      {badges.map((b, i) => (
        <span
          key={`${b.glyph}-${i}`}
          className={`hud-buff${b.good ? ' good' : ' bad'}`}
          title={`${b.label} · ${b.secs}s`}
          style={{ borderColor: `#${b.color.toString(16).padStart(6, '0')}` }}
        >
          <span className="hud-buff-glyph" aria-hidden="true">{b.glyph}</span>
          <span className="hud-buff-secs">{b.secs}</span>
        </span>
      ))}
    </span>
  );
}

/** Button label for a slot, keyboard or controller per the active device. */
function slotLabel(slot: AbilitySlot, source: InputSource): string {
  const action = SLOT_ACTION[slot as 'basic' | 'a1' | 'a2' | 'a3'];
  return source === 'gamepad' ? padLabelFor(action) : keyLabelFor(action);
}

function AbilityIcon({
  slot,
  classId,
  source,
}: {
  slot: AbilitySlot;
  classId: ClassId;
  source: InputSource;
}) {
  const remaining = useHudStore((s) => s.cooldowns[slot]);
  // Subscribe to bindings so the label updates live when the player rebinds.
  useBindings((s) => s.bindings);
  const ability = CLASSES[classId].abilities[slot];
  const total = ability.cooldown;
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const ready = frac <= 0.001;
  return (
    <div className={`hud-ability${ready ? ' ready' : ''}`}>
      <div className={`hud-ability-key${source === 'gamepad' ? ' pad' : ''}`}>
        {slotLabel(slot, source)}
      </div>
      <div className="hud-ability-name">{ability.name}</div>
      <div className="hud-cd" style={{ height: `${frac * 100}%` }} />
      {!ready && <div className="hud-cd-num">{remaining.toFixed(1)}</div>}
    </div>
  );
}

export default function HUD() {
  const hud = useHudStore();
  const run = useStore((s) => s.run);
  const cycle = useStore((s) => s.cycle);
  const source = hud.inputSource;
  // Re-render on binding / pad-scheme changes so glyph hints stay in sync.
  useBindings((s) => s.bindings);

  const bossHpPct = pct(hud.bossHp, hud.bossMaxHp);
  const hpPct = pct(hud.hp, hud.maxHp);

  const usingPad = source === 'gamepad';
  const abilityGlyphs = `${padLabelFor('a1')} ${padLabelFor('a2')} ${padLabelFor('a3')}`;
  const hint = usingPad
    ? `L-stick move · R-stick aim · ${padLabelFor('basic')} basic · ${abilityGlyphs} abilities · ${padLabelFor('revive')} revive · ${padIndexToLabel(9)} menu`
    : 'WASD move · Mouse aim · LMB basic · Q/E/R abilities · F revive · Esc menu';
  const bossLabel = hud.bossModName ? `${hud.bossModName} ${hud.bossName}` : hud.bossName;

  return (
    <div className="hud-root">
      {/* Boss bar */}
      {hud.bossPresent && (
        <div className="hud-bossbar">
          <div className="hud-bossbar-label">
            {run && run.total > 1 && (
              <span className="hud-run-tag">Boss {run.index + 1}/{run.total}</span>
            )}
            {cycle > 0 && <span className="hud-cycle-tag">Cycle {cycle + 1}</span>}
            {bossLabel}
            {hud.bossPhase === 'enraged' && <span className="hud-enrage-tag">ENRAGED</span>}
            <BuffChips buffs={hud.bossBuffs} />
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
            <div className="hud-teammate-top">
              <span className="hud-teammate-name" title={t.name || 'Hero'}>
                {t.name || 'Hero'}
                {t.isLocal && <span className="hud-teammate-you"> (you)</span>}
              </span>
              <span className="hud-teammate-class">{CLASSES[t.classId].name}</span>
            </div>
            <div className="hud-teammate-effects">
              <BuffChips buffs={t.buffs} />
            </div>
            <div className="hud-healthbar hud-teammate-hp">
              <div
                className="hud-healthbar-fill"
                style={{ width: `${t.state === 'dead' ? 0 : pct(t.hp, t.maxHp)}%` }}
              />
              <span className="hud-healthbar-num">
                {t.state === 'downed'
                  ? 'DOWNED'
                  : t.state === 'dead'
                    ? 'DEAD'
                    : `${Math.round(t.hp)} / ${Math.round(t.maxHp)}`}
              </span>
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
          <div className="hud-self-row">
            <BuffChips buffs={hud.buffs} />
            <span className="hud-score" title="Your run score">★ {hud.score}</span>
          </div>
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
              <AbilityIcon
                key={slot}
                slot={slot}
                classId={hud.classId as ClassId}
                source={source}
              />
            ))}
          </div>
        )}
      </div>

      {/* Controls hint + volume */}
      <div className="hud-hint">{hint}</div>
      <div className="hud-volume">
        <VolumeControl compact />
      </div>
    </div>
  );
}
