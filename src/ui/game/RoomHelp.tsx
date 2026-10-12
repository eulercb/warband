import RoomGuide from './RoomGuide';
import type { GuideStep } from './roomGuides';
import type { RoomFocus } from './roomFocus';
import type { useRoomGuide } from './useRoomGuide';

export default function RoomHelp({
  guide,
  steps,
  label,
  focus,
  mobile,
  blocked,
}: {
  guide: ReturnType<typeof useRoomGuide>;
  steps: readonly GuideStep[];
  label: string;
  focus: RoomFocus | null;
  mobile: boolean;
  blocked: boolean;
}) {
  if (blocked) return null;
  return (
    <>
      <button
        type="button"
        className="wb-btn wb-btn-ghost wb-room-guidebtn"
        aria-expanded={guide.open}
        onClick={guide.open ? guide.close : guide.replay}
      >
        {guide.open ? 'Close guide' : 'Guide'}
      </button>
      {guide.open ? (
        <RoomGuide steps={steps} label={label} onClose={guide.close} />
      ) : mobile && focus ? (
        <div className="wb-room-inspect" role="region" aria-label="Nearby option">
          <strong>
            {focus.marker} · {focus.title}
          </strong>
          <p>{focus.detail}</p>
          {focus.disabled ? (
            <span>Currently unavailable</span>
          ) : focus.selected ? (
            <span>Selected ✓</span>
          ) : null}
          {focus.channel > 0 ? (
            <progress aria-label="Selection progress" value={focus.channel} max={1} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
