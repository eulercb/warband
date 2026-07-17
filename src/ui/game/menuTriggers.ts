/**
 * Warband — trigger relays for the walkable menu scenes (War Room + Muster Hall).
 *
 * Each walkable scene drains its committed station triggers every frame; the
 * component hands each one to the matching relay here, which mirrors it into the
 * shared Zustand store / networked session — the exact walkable counterpart of the
 * List view (HostSetup) and Lobby panel controls, so both paths stay in sync.
 *
 * Extracted from the components' RAF loops so the station-trigger → store/session
 * mapping is unit-testable on its own: the component tests stub `requestAnimationFrame`
 * away (the Pixi loop never runs), so without this a miswire — e.g. `chaosdraft`
 * flipping `hardcore` — would pass every component test undetected.
 */
import { useStore } from '../state/store';
import type { AppState } from '../state/store';
import {
  setMonster,
  setGauntlet,
  setReady,
  startFight,
  addBot,
  removeBot,
  playUiSound,
} from '../state/session';
import { MAX_PLAYERS } from '../../engine/core/constants';
import type { ClassId, MonsterId } from '../../engine/core/types';
import type { WarTrigger } from '../state/warScene';
import type { MusterTrigger } from '../state/musterScene';

/** Whether the host may start now (no other humans, or all of them are ready). */
export function computeCanStart(s: Pick<AppState, 'players' | 'isHost'>): boolean {
  const otherHumans = s.players.filter((p) => !p.isBot && !p.isHost);
  return otherHumans.length === 0 || otherHumans.every((p) => p.ready);
}

/**
 * Relay one War-Room station trigger. Boss + run-mode selections go through the
 * session helpers (which also relay to a live host — a no-op here, pre-host); the
 * modifier toggles flip the same store fields the List view writes, so both paths
 * stay in sync via WarRoom's `[dep]` effects. `daily` toggles seedMode daily↔random
 * (a 'custom' seed lands on daily, then random — text entry stays List-view only).
 * `host` runs the raise-banner commit via the passed-in callback.
 */
export function relayWarTrigger(trig: WarTrigger, doHost: () => void): void {
  const s = useStore.getState();
  switch (trig.kind) {
    case 'boss':
      if (trig.refId) {
        setMonster(trig.refId as MonsterId);
        playUiSound('uiClick');
      }
      break;
    case 'single':
      setGauntlet(false);
      playUiSound('uiClick');
      break;
    case 'gauntlet':
      setGauntlet(true);
      playUiSound('uiClick');
      break;
    case 'hardcore':
      s.setHardcore(!s.hardcore);
      playUiSound('uiClick');
      break;
    case 'chaosforge':
      s.setChaosForge(!s.chaosForge);
      playUiSound('uiClick');
      break;
    case 'chaosdraft':
      s.setRandomKits(!s.randomKits);
      playUiSound('uiClick');
      break;
    case 'daily':
      s.setSeedMode(s.seedMode === 'daily' ? 'random' : 'daily');
      playUiSound('uiClick');
      break;
    case 'host':
      doHost();
      break;
  }
}

/**
 * Relay one Muster-Hall station trigger. `muster` toggles readiness, `start` sounds
 * the war-horn (gated on everyone being ready), `addbot` adds a bot of the walked
 * class if the band has room, and `removebot` removes that specific bot (host only —
 * `session.removeBot` is itself host-gated). Both paths call the same helpers, so the
 * DOM roster and the walkable markers stay in sync.
 */
export function relayMusterTrigger(trig: MusterTrigger): void {
  const store = useStore.getState();
  switch (trig.kind) {
    case 'muster':
      setReady(!store.localReady);
      playUiSound('uiConfirm');
      break;
    case 'start':
      if (computeCanStart(store)) startFight();
      break;
    case 'addbot':
      if (trig.refId && store.players.length < MAX_PLAYERS) {
        addBot(trig.refId as ClassId);
        playUiSound('uiConfirm');
      }
      break;
    case 'removebot':
      if (trig.refId) {
        removeBot(trig.refId);
        playUiSound('uiClick');
      }
      break;
  }
}
