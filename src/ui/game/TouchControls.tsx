/**
 * Warband — mobile TOUCH control overlay.
 *
 * A twin-stick + buttons layer shown on touch-capable devices: a left virtual
 * stick to MOVE, a right virtual stick to AIM, and a cluster of ability buttons
 * (Basic + A1/A2/A3) plus Revive. It writes HELD state into the `touch` input
 * singleton, which the `InputManager` samples as a first-class source — so the
 * host does all edge detection exactly as it does for keyboard/gamepad, and the
 * same overlay drives the fight, the reward room and the menu playground.
 *
 * Rendered as a sibling of <HUD/>. Purely presentational + input; no gameplay
 * logic lives here.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../state/store';
import { useHudStore } from '../state/hudStore';
import {
  setTouchMove,
  setTouchAim,
  setTouchButton,
  resetTouch,
  isTouchCapable,
} from '../../input/touch';
import { previewAbilityTable } from '../../engine/content/charUpgrades';
import type { AbilitySlot, ButtonState } from '../../engine/core/types';

/** Radius (px) of a virtual stick's active area; the knob clamps to this. */
const STICK_R = 56;

/** A draggable virtual stick that reports a normalized [-1,1] vector on drag. */
function VirtualStick({
  side,
  label,
  onVec,
}: {
  side: 'left' | 'right';
  label: string;
  onVec: (x: number, y: number) => void;
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const base = baseRef.current;
    const knob = knobRef.current;
    if (!base || !knob) return;

    const setKnob = (dx: number, dy: number): void => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const down = (e: PointerEvent): void => {
      if (pointerId.current !== null) return;
      pointerId.current = e.pointerId;
      base.setPointerCapture(e.pointerId);
      // Re-centre the stick under the finger for a "floating" stick feel.
      const r = base.getBoundingClientRect();
      origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      move(e);
    };
    const move = (e: PointerEvent): void => {
      if (pointerId.current !== e.pointerId) return;
      let dx = e.clientX - origin.current.x;
      let dy = e.clientY - origin.current.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) {
        dx = (dx / len) * STICK_R;
        dy = (dy / len) * STICK_R;
      }
      setKnob(dx, dy);
      onVec(dx / STICK_R, dy / STICK_R);
    };
    const up = (e: PointerEvent): void => {
      if (pointerId.current !== e.pointerId) return;
      pointerId.current = null;
      setKnob(0, 0);
      onVec(0, 0);
    };
    base.addEventListener('pointerdown', down);
    base.addEventListener('pointermove', move);
    base.addEventListener('pointerup', up);
    base.addEventListener('pointercancel', up);
    return () => {
      base.removeEventListener('pointerdown', down);
      base.removeEventListener('pointermove', move);
      base.removeEventListener('pointerup', up);
      base.removeEventListener('pointercancel', up);
    };
  }, [onVec]);

  return (
    <div ref={baseRef} className={`wb-touch-stick wb-touch-stick-${side}`} aria-hidden="true">
      <div ref={knobRef} className="wb-touch-knob" />
      <span className="wb-touch-stick-label">{label}</span>
    </div>
  );
}

/** A held-state ability button. */
function TouchButton({
  slot,
  label,
  kind,
}: {
  slot: keyof ButtonState;
  label: string;
  kind: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const press = (e: PointerEvent): void => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('held');
      setTouchButton(slot, true);
    };
    const release = (): void => {
      el.classList.remove('held');
      setTouchButton(slot, false);
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
    return () => {
      el.removeEventListener('pointerdown', press);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
      el.removeEventListener('pointerleave', release);
    };
  }, [slot]);
  return (
    <button ref={ref} type="button" className={`wb-touch-btn wb-touch-btn-${kind}`} aria-hidden="true">
      {label}
    </button>
  );
}

export default function TouchControls() {
  const capable = useMemo(() => isTouchCapable(), []);
  const localClass = useStore((s) => s.localClass);
  const myCharUpgrades = useStore((s) => s.myCharUpgrades);
  // Follow the ability names the hero actually has (hybrid grafts rename slots).
  const abilities = useMemo(
    () => previewAbilityTable(localClass, myCharUpgrades),
    [localClass, myCharUpgrades],
  );
  const hasHud = useHudStore((s) => s.classId !== null);

  useEffect(() => () => resetTouch(), []);

  if (!capable || !hasHud) return null;

  const shortName = (slot: AbilitySlot): string => {
    const n = abilities[slot]?.name ?? slot.toUpperCase();
    return n.length > 9 ? n.slice(0, 8) + '…' : n;
  };

  return (
    <div className="wb-touch-controls" role="group" aria-label="Touch controls">
      <VirtualStick side="left" label="MOVE" onVec={setTouchMove} />
      <VirtualStick side="right" label="AIM" onVec={setTouchAim} />
      <div className="wb-touch-buttons">
        <TouchButton slot="a3" label={shortName('a3')} kind="a3" />
        <TouchButton slot="a2" label={shortName('a2')} kind="a2" />
        <TouchButton slot="a1" label={shortName('a1')} kind="a1" />
        <TouchButton slot="basic" label={shortName('basic')} kind="basic" />
      </div>
      <div className="wb-touch-revive">
        <TouchButton slot="revive" label="Revive" kind="revive" />
      </div>
    </div>
  );
}
