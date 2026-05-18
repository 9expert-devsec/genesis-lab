'use client';

/**
 * SitePopup — image-only promotional overlay.
 *
 * The popup is intentionally just a picture: editors compose the visual
 * (text, CTAs, logos) in Figma/Canva and upload one image. Optionally
 * an outer link wraps the image so clicking it navigates.
 *
 * Flow:
 *   1. On pathname change, fetch /api/notifications/active.
 *   2. Pick the first popup that passes scope + cooldown.
 *   3. Install its configured trigger (immediate / delay / scroll / exit).
 *   4. On trigger, mark seen (localStorage) and render.
 *
 * Body-scroll is locked while the popup is open; ESC and overlay click
 * dismiss.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

function isOnCooldown(notif) {
  if (!notif?._id) return true;
  const hours = Number(notif?.cooldown_hours ?? 0);
  if (!Number.isFinite(hours) || hours <= 0) return false;
  try {
    const last = localStorage.getItem(`popup_seen_${notif._id}`);
    if (!last) return false;
    return (Date.now() - Number(last)) / 3_600_000 < hours;
  } catch {
    return false;
  }
}

function markSeen(notif) {
  if (!notif?._id) return;
  try {
    localStorage.setItem(`popup_seen_${notif._id}`, String(Date.now()));
  } catch {
    // localStorage disabled — re-show on every visit is the safe fallback.
  }
}

function matchesScope(notif, pathname) {
  if (!Array.isArray(notif?.page_scope) || notif.page_scope.length === 0) return true;
  return notif.page_scope.some((prefix) => pathname.startsWith(prefix));
}

function setupTrigger(notif, showFn) {
  const trigger = notif?.trigger ?? 'delay';

  if (trigger === 'immediate') {
    showFn();
    return () => {};
  }

  if (trigger === 'delay') {
    const ms = (Number(notif?.delay_seconds) || 3) * 1000;
    const t = setTimeout(showFn, ms);
    return () => clearTimeout(t);
  }

  if (trigger === 'scroll') {
    const pct = Number(notif?.scroll_pct) || 40;
    const handler = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      if ((window.scrollY / max) * 100 >= pct) {
        showFn();
        window.removeEventListener('scroll', handler);
      }
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }

  if (trigger === 'exit_intent') {
    const handler = (e) => {
      if (e.clientY < 10) {
        showFn();
        document.removeEventListener('mouseleave', handler);
      }
    };
    document.addEventListener('mouseleave', handler);
    return () => document.removeEventListener('mouseleave', handler);
  }

  return () => {};
}

export function SitePopup() {
  const pathname = usePathname();
  const [active, setActive] = useState(null);

  const close = useCallback(() => setActive(null), []);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    // Reset when the user navigates — the trigger for a new page may differ.
    setActive(null);

    (async () => {
      try {
        const res = await fetch('/api/notifications/active', { cache: 'no-store' });
        if (!res.ok) return;
        const popups = await res.json();
        if (cancelled || !Array.isArray(popups)) return;

        const eligible = popups.find(
          (p) => p.image_url && matchesScope(p, pathname) && !isOnCooldown(p)
        );
        if (!eligible) return;

        cleanup = setupTrigger(eligible, () => {
          if (cancelled) return;
          markSeen(eligible);
          setActive(eligible);
        });
      } catch {
        // Network failure — silently skip.
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [pathname]);

  // Body-scroll lock while open.
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  // ESC closes.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, close]);

  if (!active || !active.image_url) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={active.name || 'Notification'}
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="relative w-[92vw] max-w-[360px] sm:max-w-[480px] min-[1537px]:max-w-[700px] rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          aria-label="ปิด"
          className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
        >
          <X className="h-4 w-4" />
        </button>

        {active.click_href ? (
          <a
            href={active.click_href}
            target={active.click_new_tab ? '_blank' : '_self'}
            rel={active.click_new_tab ? 'noopener noreferrer' : undefined}
            onClick={close}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.image_url}
              alt={active.name || 'promotion'}
              className="block h-auto w-full cursor-pointer"
              draggable={false}
            />
          </a>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={active.image_url}
            alt={active.name || 'promotion'}
            className="block h-auto w-full"
            draggable={false}
          />
        )}
      </div>
    </div>
  );
}