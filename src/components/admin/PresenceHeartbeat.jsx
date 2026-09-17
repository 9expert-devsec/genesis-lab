'use client';

import { useEffect, useRef } from 'react';

/**
 * The admin presence heartbeat. Renders nothing; mounted ONCE, in
 * src/app/admin/layout.jsx beside the sidebar (and therefore not on the
 * login page, which that layout renders bare).
 *
 * ── WHAT IT DOES ────────────────────────────────────────────────────────────
 * POSTs /api/admin/presence — immediately on mount, then every BEAT_MS while
 * `document.visibilityState === 'visible'`, and again when the tab becomes
 * visible or the window gains focus. Every beat goes through `beat()`, which
 * refuses to fire twice within MIN_GAP_MS, so a visibilitychange followed by a
 * focus (the usual pair when you switch back to a window) is one request, and
 * the interval and the events cannot stack.
 *
 * ── WHAT IT NEVER DOES: BEAT ON LEAVE ───────────────────────────────────────
 * No `sendBeacon`, nothing on `pagehide` / `beforeunload` / `unload`. A stamp
 * on the way OUT would keep an admin who has just closed the tab "Online" for
 * a full threshold after they left — the opposite of what the stamp means.
 * Leaving is signalled by the beats STOPPING, and the accounts list reads the
 * silence. test/fs/adminPresence asserts none of those names appear here.
 *
 * ── HIDDEN TABS ARE SILENT ──────────────────────────────────────────────────
 * The interval callback checks visibility on every tick rather than being
 * torn down on hide: a browser throttles background timers, and a tick that
 * fires late in a hidden tab must still be a no-op. A hidden tab therefore
 * costs nothing, and several open tabs beat at most once per visible window.
 *
 * ── FAILURE IS SILENT, BY DESIGN ────────────────────────────────────────────
 * `keepalive: true` lets a beat in flight complete if the tab navigates; the
 * promise's rejection is swallowed. A lost beat costs one minute of "seen"
 * and the next one repairs it; there is nothing to show the admin.
 */

export const PRESENCE_ENDPOINT = '/api/admin/presence';
export const BEAT_MS = 60_000;
export const MIN_GAP_MS = 30_000;

export function PresenceHeartbeat() {
  const lastBeatAt = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      const at = Date.now();
      if (at - lastBeatAt.current < MIN_GAP_MS) return;
      lastBeatAt.current = at;
      try {
        fetch(PRESENCE_ENDPOINT, { method: 'POST', keepalive: true, cache: 'no-store' }).catch(() => {});
      } catch {
        // fetch itself threw (no network stack) — nothing to do until the next beat.
      }
    };

    const onVisibility = () => { if (document.visibilityState === 'visible') beat(); };

    beat();
    const timer = setInterval(beat, BEAT_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', beat);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', beat);
    };
  }, []);

  return null;
}
