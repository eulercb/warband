/**
 * Warband — shared volume control: a mute toggle plus a 0..100 slider, wired to
 * the app store (which persists the value and drives the Sfx master bus). Used
 * on the main menu and in the in-fight HUD so both surfaces stay in sync.
 */
import { useStore } from './store';
import { playUiSound } from './session';

export default function VolumeControl({ compact = false }: { compact?: boolean }) {
  const volume = useStore((s) => s.volume);
  const muted = useStore((s) => s.muted);
  const setVolume = useStore((s) => s.setVolume);
  const toggleMute = useStore((s) => s.toggleMute);

  const silent = muted || volume <= 0;
  const pct = Math.round(volume * 100);

  return (
    <div className={`wb-volume${compact ? ' compact' : ''}`}>
      <button
        type="button"
        className="wb-volume-mute"
        onClick={() => {
          playUiSound('uiClick');
          toggleMute();
        }}
        aria-pressed={muted}
        aria-label={silent ? 'Unmute sound' : 'Mute sound'}
        title={silent ? 'Unmute' : 'Mute'}
      >
        {silent ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
      </button>
      <input
        className="wb-volume-slider"
        type="range"
        min={0}
        max={100}
        step={1}
        value={silent ? 0 : pct}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
        aria-label="Sound volume"
        title={`Volume ${silent ? 0 : pct}%`}
      />
      {!compact && <span className="wb-volume-num">{silent ? 0 : pct}%</span>}
    </div>
  );
}
