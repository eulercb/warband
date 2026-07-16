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
  setTouchSwapAim,
  resetTouch,
  isTouchCapable,
} from '../../input/touch';
import { previewAbilityTable, previewSubAbility } from '../../engine/content/charUpgrades';
import { getSubSkill, subclassOfSkill } from '../../engine/content/subclasses';
import { AIM_DEAD_ZONE } from '../../engine/core/constants';
import type { AbilitySlot, ButtonState, Cooldowns } from '../../engine/core/types';

/** Radius (px) of a virtual stick's active area; the knob clamps to this. */
const STICK_R = 56;

/** A draggable virtual stick that reports a normalized [-1,1] vector on drag.
 * `deadzone` (0..1) suppresses sub-threshold drags so a resting finger/tremor on
 * the aim stick doesn't twitch the reticle (item: aim changes for no reason). */
function VirtualStick({
  side,
  label,
  onVec,
  deadzone = 0,
}: {
  side: 'left' | 'right';
  label: string;
  onVec: (x: number, y: number) => void;
  deadzone?: number;
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
      // Swallow the gesture so the browser never starts a text-selection / long-
      // press callout on the stick (item: holding a stick opens copy/paste).
      e.preventDefault();
      pointerId.current = e.pointerId;
      base.setPointerCapture(e.pointerId);
      // Re-centre the stick under the finger for a "floating" stick feel.
      const r = base.getBoundingClientRect();
      origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      move(e);
    };
    const move = (e: PointerEvent): void => {
      if (pointerId.current !== e.pointerId) return;
      e.preventDefault();
      let dx = e.clientX - origin.current.x;
      let dy = e.clientY - origin.current.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) {
        dx = (dx / len) * STICK_R;
        dy = (dy / len) * STICK_R;
      }
      setKnob(dx, dy);
      // Below the dead-zone report {0,0}: for aim that means "keep the last
      // reticle" (the sanitizer persists it), so idle jitter never re-aims.
      if (len < deadzone * STICK_R) {
        onVec(0, 0);
        return;
      }
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
  }, [onVec, deadzone]);

  return (
    <div ref={baseRef} className={`wb-touch-stick wb-touch-stick-${side}`} aria-hidden="true">
      <div ref={knobRef} className="wb-touch-knob" />
      <span className="wb-touch-stick-label">{label}</span>
    </div>
  );
}

/**
 * A held-state ability button. When `cdSlot` + `total` are supplied it also shows a
 * cooldown readout — a radial sweep, a remaining-seconds badge and a dimmed label —
 * reading the SAME per-slot remaining seconds the HUD tiles consume (hudStore.cooldowns)
 * and the SAME total (the resolved ability def's cooldown) so the two stay in lock-step.
 *
 * The `held` state is toggled imperatively on the element (below), so the button's own
 * `className` is kept STATIC across renders — otherwise React would reconcile it away
 * mid-press when the ~15 Hz cooldown refresh re-renders. The cooldown lives entirely in
 * child overlays, which React is free to update without touching the button's class.
 */
function TouchButton({
  slot,
  label,
  kind,
  cdSlot,
  total = 0,
}: {
  slot: keyof ButtonState;
  label: string;
  kind: string;
  cdSlot?: keyof Cooldowns;
  total?: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const remaining = useHudStore((s) => (cdSlot ? (s.cooldowns[cdSlot] ?? 0) : 0));
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const cooling = frac > 0.001;
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
    <button
      ref={ref}
      type="button"
      className={`wb-touch-btn wb-touch-btn-${kind}`}
      aria-hidden="true"
    >
      {cdSlot != null ? (
        <span
          className="wb-touch-cd"
          aria-hidden="true"
          style={{
            background: `conic-gradient(rgba(4,8,16,0.62) ${frac * 360}deg, transparent ${frac * 360}deg)`,
          }}
        />
      ) : null}
      <span className={`wb-touch-btn-label${cooling ? ' cooling' : ''}`}>{label}</span>
      {cooling ? (
        <span className="wb-touch-cd-num" aria-hidden="true">
          {remaining.toFixed(1)}
        </span>
      ) : null}
    </button>
  );
}

/** Drag distance (px) that maps to a full-magnitude radial direction. */
const SWAP_DRAG_R = 56;
/** Below this drag distance (px) the radial reads "centred" (release = cancel). */
const SWAP_DRAG_DEADZONE = 12;

/**
 * The multiclass Swap control (item 14). A quick tap cycles to the next class; a
 * HOLD opens the class radial (driven by GameView's gesture) and the button then
 * doubles as a mini-stick — drag toward a class and release to swap to it, or let
 * go centred to cancel. Unlike a plain TouchButton it does NOT release on
 * pointerleave, so dragging the finger off the button keeps the gesture alive.
 */
function SwapRadialButton() {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const origin = { x: 0, y: 0 };
    let active = false;
    const press = (e: PointerEvent): void => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('held');
      active = true;
      const r = el.getBoundingClientRect();
      origin.x = r.left + r.width / 2;
      origin.y = r.top + r.height / 2;
      setTouchButton('swap', true);
      setTouchSwapAim(0, 0);
    };
    const move = (e: PointerEvent): void => {
      if (!active) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      const len = Math.hypot(dx, dy);
      if (len < SWAP_DRAG_DEADZONE) {
        setTouchSwapAim(0, 0);
        return;
      }
      const scale = Math.min(len, SWAP_DRAG_R) / SWAP_DRAG_R;
      setTouchSwapAim((dx / len) * scale, (dy / len) * scale);
    };
    const release = (): void => {
      if (!active) return;
      active = false;
      el.classList.remove('held');
      setTouchButton('swap', false);
      setTouchSwapAim(0, 0);
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    return () => {
      el.removeEventListener('pointerdown', press);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
    };
  }, []);
  return (
    <button ref={ref} type="button" className="wb-touch-btn wb-touch-btn-swap" aria-hidden="true">
      Swap
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
  const activeClass = useHudStore((s) => s.classId);
  const subSkills = useHudStore((s) => s.subSkills);
  const multiclass = useHudStore((s) => s.classes.length > 1);
  const potions = useHudStore((s) => s.potions);

  useEffect(() => () => resetTouch(), []);

  if (!capable || !hasHud) return null;

  const clip = (n: string): string => (n.length > 9 ? n.slice(0, 8) + '…' : n);
  const shortName = (slot: AbilitySlot): string =>
    clip(abilities[slot]?.name ?? slot.toUpperCase());
  const subName = (id: string | undefined): string => {
    const sk = id ? getSubSkill(id) : undefined;
    return sk ? clip(sk.name) : '';
  };
  // A sub skill only shows while its owning class is the active one (item 14).
  const subVisible = (id: string | undefined): boolean => {
    if (!id) return false;
    const owner = subclassOfSkill(id)?.classId;
    return owner == null || owner === activeClass;
  };
  // Total cooldown for a sub skill — resolved the SAME way the HUD tile does, so the
  // touch button's sweep matches the HUD's (previewSubAbility folds in Honed boons).
  const subCd = (id: string | undefined): number =>
    (id ? previewSubAbility(id, myCharUpgrades)?.cooldown : 0) ?? 0;

  return (
    <div className="wb-touch-controls" role="group" aria-label="Touch controls">
      <VirtualStick side="left" label="MOVE" onVec={setTouchMove} />
      <VirtualStick side="right" label="AIM" onVec={setTouchAim} deadzone={AIM_DEAD_ZONE} />
      <div className="wb-touch-buttons">
        {subVisible(subSkills[1]) ? (
          <TouchButton
            slot="sub2"
            label={subName(subSkills[1])}
            kind="sub"
            cdSlot="sub2"
            total={subCd(subSkills[1])}
          />
        ) : null}
        {subVisible(subSkills[0]) ? (
          <TouchButton
            slot="sub1"
            label={subName(subSkills[0])}
            kind="sub"
            cdSlot="sub1"
            total={subCd(subSkills[0])}
          />
        ) : null}
        <TouchButton slot="a3" label={shortName('a3')} kind="a3" cdSlot="a3" total={abilities.a3?.cooldown} />
        <TouchButton slot="a2" label={shortName('a2')} kind="a2" cdSlot="a2" total={abilities.a2?.cooldown} />
        <TouchButton slot="a1" label={shortName('a1')} kind="a1" cdSlot="a1" total={abilities.a1?.cooldown} />
        <TouchButton
          slot="basic"
          label={shortName('basic')}
          kind="basic"
          cdSlot="basic"
          total={abilities.basic?.cooldown}
        />
      </div>
      <div className="wb-touch-side">
        {potions > 0 ? <TouchButton slot="item" label={`🧪${potions}`} kind="item" /> : null}
        {multiclass ? <SwapRadialButton /> : null}
        <TouchButton slot="revive" label="Revive" kind="revive" />
      </div>
    </div>
  );
}
