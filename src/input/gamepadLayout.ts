/** Normalize known raw browser layouts to the Web Gamepad button positions.
 * Saved bindings and HUD glyphs always refer to these positions. */
const SN30_PRO_BUTTONS = [1, 0, 4, 3, 6, 7, 8, 9, 10, 11, 13, 14];
const SN30_PRO_RAW_ID = /2dc8.*2100/i;
const BROWSER_PRODUCT = /product:\s*[a-f0-9]{4}/i;
const SN30_PRO_NAME = /8\s*bitdo\s+sn30\s+pro\b(?![+\s]*2\b|\+)/i;

export function isSn30Pro(id: string): boolean {
  return SN30_PRO_NAME.test(id) || SN30_PRO_RAW_ID.test(id);
}

function rawSn30Pro(pad: Gamepad): boolean {
  // The raw 2100 layout exposes right Y at 5, with trigger axes in between.
  // Layout reference: https://github.com/gabomdq/SDL_GameControllerDB
  // Trust a browser's standard mapping, which has already rearranged the axes.
  return (
    pad.mapping !== 'standard' &&
    pad.axes.length >= 6 &&
    (SN30_PRO_RAW_ID.test(pad.id) || (!BROWSER_PRODUCT.test(pad.id) && isSn30Pro(pad.id)))
  );
}

interface AimAxis {
  index: number;
  sign: number;
}

const aimAxes = new Map<string, AimAxis | null>();

function aimAxisKey(id: string): string {
  return `warband.pad.aim-y:${id}`;
}

function savedAimAxis(id: string): AimAxis | null {
  if (!aimAxes.has(id)) {
    let axis = null;
    try {
      const raw = localStorage.getItem(aimAxisKey(id));
      if (raw && /^\d+:[-]?1$/.test(raw)) {
        const [index, sign] = raw.split(':').map(Number);
        axis = { index, sign };
      }
    } catch {
      // Keep session-only calibration when storage is unavailable.
    }
    aimAxes.set(id, axis);
  }
  return aimAxes.get(id)!;
}

/** Capture the axis with the largest motion from a centered stick. */
export function calibrateAimDown(pad: Gamepad, neutral: readonly number[]): boolean {
  let index = -1;
  let change = 0;
  for (const [i, center] of neutral.entries()) {
    const delta = pad.axes[i] - center;
    if (Math.abs(delta) > Math.abs(change)) {
      index = i;
      change = delta;
    }
  }
  if (Math.abs(change) < 0.65) return false;
  const sign = Math.sign(change);
  aimAxes.set(pad.id, { index, sign });
  try {
    localStorage.setItem(aimAxisKey(pad.id), `${index}:${sign}`);
  } catch {
    // The current session still has the captured axis.
  }
  return true;
}

export function rightStick(pad: Gamepad): readonly [number, number] {
  const axis = savedAimAxis(pad.id);
  const index = axis?.index ?? (rawSn30Pro(pad) ? 5 : 3);
  return [pad.axes[2] ?? 0, (pad.axes[index] ?? 0) * (axis?.sign ?? 1)];
}

export function padButtonPressed(pad: Gamepad, index: number): boolean {
  if (!rawSn30Pro(pad)) return pad.buttons[index]?.pressed === true;
  return pad.buttons[SN30_PRO_BUTTONS[index]]?.pressed === true;
}

export function connectedGamepads(): Gamepad[] {
  try {
    return Array.from(navigator.getGamepads?.() ?? []).filter(
      (pad): pad is Gamepad => !!pad?.connected,
    );
  } catch {
    return [];
  }
}

export function padMenuPressed(): boolean {
  return connectedGamepads().some((pad) => padButtonPressed(pad, 9));
}
