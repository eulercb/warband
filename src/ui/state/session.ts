/**
 * Warband — session control: creates Host/Client, wires their callbacks into
 * the Zustand store, and exposes simple imperative actions the React screens
 * call. Also owns the shared Sfx instance.
 */
import { Host } from '../../net/session/host';
import { Client } from '../../net/session/client';
import { generateRoomCode, writeRoomToHash, shareLinkFor, selfId } from '../../net/transport/room';
import type { NetMode } from '../../net/transport/room';
import { useStore } from './store';
import { netLog } from '../../net/log';
import { Sfx } from '../../audio/sfx';
import type { ClassId } from '../../engine/core/types';
import { mixSeed } from '../../engine/core/math';
import type { UpgradeId } from '../../engine/content/upgrades';

/** Shared audio engine (used here for stings + by GameView for event SFX). */
export const sfx = new Sfx();

// Keep the audio engine synced with the store's mute flag + volume, now and
// whenever they change. Seed from the persisted initial state so it's right on
// load, and only touch the audio bus when the value ACTUALLY changes (the store
// fires on every unrelated update too — pause ticks, phase, results, …).
let lastMuted = useStore.getState().muted;
let lastVolume = useStore.getState().volume;
sfx.setVolume(lastVolume);
sfx.setMuted(lastMuted);
useStore.subscribe((s) => {
  if (s.muted !== lastMuted) {
    lastMuted = s.muted;
    sfx.setMuted(s.muted);
  }
  if (s.volume !== lastVolume) {
    lastVolume = s.volume;
    sfx.setVolume(s.volume);
  }
});

type StoreState = ReturnType<typeof useStore.getState>;

/** Mirror an incoming shared pause state (host or client) into the store. */
function applyPauseState(
  paused: boolean,
  info: { byName?: string; countdown: number | null },
): void {
  const s = useStore.getState();
  s.setPaused(paused);
  s.setPausedBy(paused ? (info.byName ?? null) : null);
  s.setResumeCountdown(info.countdown);
}

/** Clear all pause/countdown UI (fight start, result, leave). */
function resetPauseState(s: StoreState): void {
  s.setPaused(false);
  s.setPausedBy(null);
  s.setResumeCountdown(null);
}

/** How long a client waits for the host before showing a connectivity hint. */
const HOST_SEARCH_TIMEOUT_MS = 15000;
let hostSearchTimer: ReturnType<typeof setTimeout> | null = null;

function clearHostSearchTimer(): void {
  if (hostSearchTimer !== null) {
    clearTimeout(hostSearchTimer);
    hostSearchTimer = null;
  }
}

function nameOrDefault(): string {
  const n = useStore.getState().localName.trim();
  return n || `Hero-${selfId.slice(0, 4)}`;
}

/**
 * Handle a Trystero transport-level join fault (from `openRoom`'s `onJoinError`).
 *
 * The one players hit is the post-SDP connection failure: we reached the other
 * peer and exchanged WebRTC signaling, but no direct/relayed path formed — a NAT
 * or firewall that needs a TURN relay. Trystero's message contains "after
 * exchanging SDP" / "TURN". When we see it and we are still unconnected, replace
 * the vague "still reaching the host" hint with a specific, actionable one — this
 * is the message that has been missing, since `warband.diagnose()` used to blame
 * matchmaking instead. Never escalate to a hard error: another peer or a retry
 * may still succeed.
 */
function handleJoinError(msg: string): void {
  netLog('room', `join error surfaced to UI: ${msg}`);
  const s = useStore.getState();
  if (s.peerCount > 0) return; // already connected — ignore a stray per-peer fault
  if (/exchang\w* SDP|TURN/i.test(msg)) {
    clearHostSearchTimer();
    s.setNetHint(
      "Reached the other player's signaling, but couldn't open a direct connection — one of you " +
        'is behind a NAT or firewall that blocks peer-to-peer. This is NOT the room code or the ' +
        'trackers: it needs a TURN relay. Set VITE_TURN_URL to a relay you control (see the ' +
        'connectivity notes in the README); the bundled public relay is best-effort and may be ' +
        'overloaded.',
    );
  }
}

// `async` by contract: these front the networked session lifecycle and are
// awaited by their callers (Host/Client wire up connections that resolve later).
// No `await` in the body yet, so silence require-await rather than change the
// awaited Promise<void> API that the UI depends on.

/**
 * Resolve the host's master seed from the store's seed mode. `random` returns
 * undefined (Host mints a fresh seed); `daily` hashes today's UTC date so everyone
 * playing the run-of-the-day shares one seed; `custom` hashes whatever text the
 * player typed so any string reproduces the exact same run.
 */
function resolveHostSeed(): number | undefined {
  const st = useStore.getState();
  if (!st.gauntlet) return undefined; // seeds only govern gauntlet assembly
  if (st.seedMode === 'daily') {
    const d = new Date();
    const key = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    return mixSeed(key, 0xda11);
  }
  if (st.seedMode === 'custom') {
    const t = st.seedInput.trim();
    if (!t) return undefined;
    // Numeric text uses the number directly; any other text hashes its chars, so
    // both "12345" and "warband" are valid, shareable seeds.
    const asNum = Number(t);
    if (Number.isFinite(asNum) && /^\d+$/.test(t)) return asNum >>> 0 || 1;
    const acc: number[] = [];
    for (let i = 0; i < t.length; i++) acc.push(t.charCodeAt(i));
    return mixSeed(...acc, t.length);
  }
  return undefined; // 'random'
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function hostGame(): Promise<void> {
  const st = useStore.getState();
  const code = generateRoomCode();
  const net: NetMode = st.netMode;
  writeRoomToHash(code, net);

  const host = new Host({
    code,
    net,
    monsterId: st.monsterId,
    gauntlet: st.gauntlet,
    hardcore: st.hardcore,
    seed: resolveHostSeed(),
    name: nameOrDefault(),
    classId: st.localClass,
    onLobby: (msg) =>
      useStore.getState().setLobby(msg.players, msg.monsterId, msg.phase, msg.gauntlet),
    onStart: (info) => {
      const s = useStore.getState();
      s.setResult(null);
      resetPauseState(s);
      s.setRun({ index: info.runIndex, total: info.runTotal });
      s.setCycle(info.cycle);
      s.setActiveRunSeed(info.runSeed);
      s.setActiveHardcore(info.hardcore);
      s.setNextReadyState(0, 0);
      // A fresh fight consumes any ephemeral perks bought last interstitial (item 21).
      s.resetEphemeralStock();
      // Fresh run (first boss of cycle 0) clears carried upgrade display. Every new
      // gauntlet (item 23) resets the ephemeral coin purse — coins accumulate across
      // a 5-boss run, then reset at the next gauntlet — while the build persists.
      if (info.runIndex === 0) {
        if (info.cycle === 0) s.clearMyUpgrades();
        else s.resetCoins();
      }
      s.setPhase('game');
    },
    onNextReady: (info) => useStore.getState().setNextReadyState(info.ready, info.total),
    onPause: applyPauseState,
    onResult: (result) => {
      const s = useStore.getState();
      s.setResult(result);
      s.awardCoinsFromResult(result); // bank ephemeral coins earned this fight (item 21)
      resetPauseState(s);
      s.setPhase('result');
      sfx.resume();
      sfx.play(result.outcome === 'victory' ? 'victory' : 'defeat');
    },
    onPeers: (n) => useStore.getState().setPeerCount(n),
    onError: (e) => useStore.getState().setError(e),
    onJoinError: handleJoinError,
  });

  const s = useStore.getState();
  s.setRoom(code, true);
  s.setSession(host);
  // Activate the run's procedural content (rolled kits / monsters / boons) from
  // the master seed right away, so the lobby's class previews match the fight.
  s.setActiveRunSeed(host.runSeed);
  s.setError(null);
  s.setPeerCount(0);
  s.setNetHint(null);
  host.setSelection(st.localClass);
  s.setPhase('lobby');
}

// eslint-disable-next-line @typescript-eslint/require-await -- async by API contract (see hostGame)
export async function joinGame(code: string): Promise<void> {
  const upper = code.trim().toUpperCase();
  const net: NetMode = useStore.getState().netMode;

  const client = new Client({
    code: upper,
    net,
    name: nameOrDefault(),
    onLobby: (msg) => {
      const s = useStore.getState();
      s.setLobby(msg.players, msg.monsterId, msg.phase, msg.gauntlet);
      // The host shares its master seed with the lobby: activate the run's
      // procedural content now so class previews already show the rolled kits.
      if (msg.runSeed != null) s.setActiveRunSeed(msg.runSeed);
      if (msg.phase === 'inFight' && s.phase !== 'game') {
        s.setPhase('waiting');
      } else if (msg.phase === 'lobby' && (s.phase === 'join' || s.phase === 'waiting')) {
        s.setPhase('lobby');
      }
    },
    onStart: (msg) => {
      const s = useStore.getState();
      s.setResult(null);
      resetPauseState(s);
      s.setRun({ index: msg.runIndex, total: msg.runTotal });
      s.setCycle(msg.cycle);
      if (msg.runSeed != null) s.setActiveRunSeed(msg.runSeed);
      s.setActiveHardcore(msg.hardcore ?? false);
      s.setNextReadyState(0, 0);
      s.resetEphemeralStock(); // a fresh fight consumes bought ephemeral perks (item 21)
      // Fresh run wipes the build; each later gauntlet resets only coins (item 23).
      if (msg.runIndex === 0) {
        if (msg.cycle === 0) s.clearMyUpgrades();
        else s.resetCoins();
      }
      s.setPhase('game');
    },
    onNextReady: (info) => useStore.getState().setNextReadyState(info.ready, info.total),
    onPause: applyPauseState,
    onResult: (result) => {
      const s = useStore.getState();
      s.setResult(result);
      s.awardCoinsFromResult(result); // bank ephemeral coins earned this fight (item 21)
      resetPauseState(s);
      s.setPhase('result');
      sfx.resume();
      sfx.play(result.outcome === 'victory' ? 'victory' : 'defeat');
    },
    onReturnLobby: () => useStore.getState().setPhase('lobby'),
    onHostLeft: () => {
      clearHostSearchTimer();
      const s = useStore.getState();
      s.setHostLeft(true);
      s.setError('Host disconnected — the session has ended.');
      try {
        s.session?.leave();
      } catch {
        /* ignore */
      }
      s.setSession(null);
      s.setRoom(null, false);
      s.setPeerCount(0);
      s.setNetHint(null);
      // Scrub run/fight residue so the menu playground doesn't show stale run
      // tags, grafted ability buttons or the dead run's procedural kits.
      s.setResult(null);
      s.setRun(null);
      s.setCycle(0);
      s.setActiveRunSeed(null);
      s.clearMyUpgrades();
      resetPauseState(s);
      s.setPhase('menu');
    },
    onPeers: (n) => {
      const s = useStore.getState();
      s.setPeerCount(n);
      if (n > 0) {
        // Reached the host — cancel the pending "still connecting" hint.
        clearHostSearchTimer();
        s.setNetHint(null);
      }
    },
    onError: (e) => useStore.getState().setError(e),
    onJoinError: handleJoinError,
  });

  const s = useStore.getState();
  s.setRoom(upper, false);
  s.setSession(client);
  s.setError(null);
  s.setPeerCount(0);
  s.setNetHint(null);
  client.setSelection(s.localClass);
  s.setPhase('lobby');

  // If we haven't reached the host after a while, surface an actionable hint
  // (the code, the host being offline, or a NAT that needs TURN). This is a hint,
  // not a hard error — the connection may still complete afterwards.
  clearHostSearchTimer();
  hostSearchTimer = setTimeout(() => {
    hostSearchTimer = null;
    const cur = useStore.getState();
    if (cur.peerCount === 0 && cur.roomCode === upper) {
      netLog(
        'client',
        `still no host after ${HOST_SEARCH_TIMEOUT_MS / 1000}s — showing connectivity hint. ` +
          'Run warband.diagnose() to inspect trackers/peers.',
      );
      cur.setNetHint(
        "Still reaching the host… Double-check the room code and that the host's tab is open. " +
          'If it keeps failing, one of you may be on a network that blocks direct connections — ' +
          'see the connectivity notes in the README.',
      );
    }
  }, HOST_SEARCH_TIMEOUT_MS);
}

export function selectClass(classId: ClassId): void {
  const s = useStore.getState();
  s.setLocalClass(classId);
  s.session?.setSelection(classId);
}

export function setReady(ready: boolean): void {
  const s = useStore.getState();
  s.setLocalReady(ready);
  s.session?.setReady(ready);
}

export function startFight(): void {
  const s = useStore.getState();
  if (s.isHost && s.session instanceof Host) {
    // Host's onStart callback drives the phase/run transition (also covers
    // retry + gauntlet auto-advance), so just kick it off here.
    s.session.startFight();
  }
}

/** Host: restart the current fight after a loss (same boss / run position). */
export function retryFight(): void {
  const s = useStore.getState();
  if (s.isHost && s.session instanceof Host) s.session.retryFight();
}

/** Host: skip the gauntlet interstitial and start the next boss now. */
export function advanceGauntlet(): void {
  const s = useStore.getState();
  if (s.isHost && s.session instanceof Host) s.session.advanceGauntlet();
}

export function returnToLobby(): void {
  const s = useStore.getState();
  s.setResult(null);
  s.setLocalReady(false);
  resetPauseState(s);
  s.setRun(null);
  s.clearMyUpgrades();
  if (s.isHost && s.session instanceof Host) {
    // Host: reset the world + tell clients; then transition our own UI.
    s.session.returnToLobby();
  }
  // Both host and client return to the lobby locally (client also gets the
  // host's returnLobby broadcast, which is idempotent with this).
  s.setPhase('lobby');
}

export function setMonster(monsterId: import('../../engine/core/types').MonsterId): void {
  const s = useStore.getState();
  s.setMonster(monsterId);
  if (s.isHost && s.session instanceof Host) s.session.setMonster(monsterId);
}

export function setGauntlet(on: boolean): void {
  const s = useStore.getState();
  s.setGauntlet(on);
  if (s.isHost && s.session instanceof Host) s.session.setGauntlet(on);
}

// --- Bots (host only) ------------------------------------------------------

export function addBot(classId: ClassId): void {
  const s = useStore.getState();
  if (s.isHost && s.session instanceof Host) s.session.addBot(classId);
}

export function removeBot(peerId: string): void {
  const s = useStore.getState();
  if (s.isHost && s.session instanceof Host) s.session.removeBot(peerId);
}

export function setBotClass(peerId: string, classId: ClassId): void {
  const s = useStore.getState();
  if (s.isHost && s.session instanceof Host) s.session.setBotClass(peerId, classId);
}

// --- Pause menu ------------------------------------------------------------

/**
 * Request the shared sim pause (true) or resume (false). Any player may do this:
 * the host acts on it directly, a client relays it, and the authoritative pause
 * state comes back through `onPause` for everyone (so all peers show the menu).
 */
export function requestPause(paused: boolean): void {
  useStore.getState().session?.requestPause(paused);
}

/** Submit this player's between-boss generic upgrade pick (records + relays). */
export function chooseUpgrade(id: UpgradeId): void {
  const s = useStore.getState();
  s.session?.chooseUpgrade(id);
  s.addMyUpgrade(id);
}

/** Submit this player's between-boss character (class) upgrade pick. */
export function chooseCharUpgrade(id: string): void {
  const s = useStore.getState();
  s.session?.chooseCharUpgrade(id);
  s.addMyCharUpgrade(id);
}

/** Submit this player's run-clear subclass-skill pick (item 13; records + relays). */
export function chooseSubSkill(subclassId: string, skillId: string): void {
  const s = useStore.getState();
  s.session?.chooseSubSkill(subclassId, skillId);
  s.addMySubSkill(subclassId, skillId);
}

/** Submit this player's run-clear extra-class (multiclass) pick (item 14). */
export function chooseExtraClass(classId: ClassId): void {
  const s = useStore.getState();
  s.session?.chooseExtraClass(classId);
  s.addMyExtraClass(classId);
}

/**
 * Request a multiclass swap (item 14). `target` swaps directly to that owned
 * class (the class radial landed on it); omitted, cycles to the next owned class
 * (a quick tap). Host-authoritative — the host validates + applies it, and the
 * result arrives back through the normal snapshot stream.
 */
export function swapClass(target?: ClassId): void {
  useStore.getState().session?.swapClass(target);
}

/** Mark this player ready (or not) to advance to the next boss. */
export function setNextReady(ready: boolean): void {
  useStore.getState().session?.setNextReady(ready);
}

/** Host: carry the run into the next endless cycle (harder, keeps upgrades). */
export function continueEndless(): void {
  const s = useStore.getState();
  if (s.isHost && s.session instanceof Host) s.session.continueEndless();
}

/** Host: end the current fight immediately as a defeat (pause-menu "End Run"). */
export function endRun(): void {
  const s = useStore.getState();
  if (s.isHost && s.session instanceof Host) s.session.endRun('defeat');
}

export function openControls(): void {
  useStore.getState().setShowControls(true);
}

export function closeControls(): void {
  useStore.getState().setShowControls(false);
}

export function leaveToMenu(): void {
  clearHostSearchTimer();
  try {
    writeRoomToHash('');
    if (typeof location !== 'undefined') {
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch {
    /* ignore */
  }
  useStore.getState().reset();
}

export function shareLink(): string {
  const s = useStore.getState();
  return s.roomCode ? shareLinkFor(s.roomCode, s.netMode) : '';
}

export async function copyShareLink(): Promise<void> {
  const link = shareLink();
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    /* clipboard may be unavailable; ignore */
  }
}

export function playUiSound(name: 'uiClick' | 'uiConfirm'): void {
  sfx.resume();
  sfx.play(name);
}
