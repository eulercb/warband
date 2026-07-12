/**
 * Warband — the multiclass class-radial overlay (item 14).
 *
 * A hold-to-open wheel of the hero's owned classes. It is purely presentational:
 * GameView owns the swap gesture (open/close, which slot is hovered, whether the
 * swap gate is ready) and pushes that into `radialStore`; this component just
 * draws the wheel — owned classes evenly around a ring in their class colours,
 * the active one marked, the hovered one lit — with a centre readout of the
 * pending selection (or a cancel / recharging hint).
 */
import { useRadialStore } from '../state/radialStore';
import { CLASSES } from '../../engine/content/classes';
import { slotOffset } from '../../input/radial';

/** Ring radius (px) the class nodes sit on, from the wheel centre. */
const RING_R = 92;

function hexColor(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export default function ClassRadial() {
  const open = useRadialStore((s) => s.open);
  const options = useRadialStore((s) => s.options);
  const activeClassId = useRadialStore((s) => s.activeClassId);
  const hover = useRadialStore((s) => s.hover);
  const ready = useRadialStore((s) => s.ready);

  if (!open || options.length === 0) return null;

  const n = options.length;
  const hovered = hover >= 0 && hover < n ? options[hover] : null;
  const centreText = hovered
    ? CLASSES[hovered].name
    : ready
      ? 'Release to cancel'
      : 'Swap recharging…';

  return (
    <div className="wb-radial" role="group" aria-label="Swap class">
      <div className={`wb-radial-wheel${ready ? '' : ' recharging'}`}>
        {options.map((c, i) => {
          const off = slotOffset(i, n);
          const hex = hexColor(CLASSES[c].color);
          const isActive = c === activeClassId;
          const isHover = i === hover;
          const cls = 'wb-radial-node' + (isActive ? ' active' : '') + (isHover ? ' hover' : '');
          return (
            <div
              key={c}
              className={cls}
              aria-current={isHover ? 'true' : undefined}
              style={{
                left: `calc(50% + ${(off.x * RING_R).toFixed(1)}px)`,
                top: `calc(50% + ${(off.y * RING_R).toFixed(1)}px)`,
                borderColor: hex,
                background: isHover ? hex : undefined,
              }}
            >
              {CLASSES[c].name}
            </div>
          );
        })}
        <div className="wb-radial-center">{centreText}</div>
      </div>
    </div>
  );
}
