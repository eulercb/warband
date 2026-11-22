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

export function rightStick(pad: Gamepad): readonly [number, number] {
  return [pad.axes[2] ?? 0, pad.axes[rawSn30Pro(pad) ? 5 : 3] ?? 0];
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
