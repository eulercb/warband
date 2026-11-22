# Switching controls during play

Keyboard, mouse, touch and gamepad can hand off control during a fight.
Fresh input changes the source, and a held stick or button can sustain pad
control without repeatedly taking it back. The aim direction persists when the
right stick returns to center.

The browser's standard gamepad layout is used directly when available. The
raw 8BitDo SN30 Pro layout with product ID `2100` exposes vertical aim on a
different axis, separated from horizontal aim by the trigger axes. Warband
normalizes this layout before reading actions, capturing button bindings or
checking Start. The default SN30 Pro face-button labels follow physical
positions: **B** for basic, **A** for Ability 1, **Y** for Ability 2 and
**X** for Ability 3. Existing bindings still refer to those positions.
Controller icon style and action buttons can be changed in Controls.

To verify on hardware, leave the controller connected and move, aim and cast
with the keyboard and mouse. Pick it up and check all four aim directions,
each face button, both subclass triggers once unlocked, and Start. Switch back
to the mouse with a controller input still held and check that the HUD follows
the device in use. The automated tests reproduce the browser input reports;
physical pairing modes and browser mappings can differ.
