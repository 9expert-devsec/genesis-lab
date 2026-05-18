'use client';

/**
 * TopNotificationBarClient
 *
 * Renders a single top bar with freeform hex colors applied as inline
 * styles. Tailwind cannot generate arbitrary hex classes at runtime, so
 * `bg_color`, `text_color`, and the button overrides go through `style`.
 *
 * Dismissal is per-tab (sessionStorage). To avoid a flash where the
 * server-rendered HTML shows the bar before we know the user dismissed
 * it, the component starts in `dismissed=true` and only reveals the bar
 * after the first effect tick confirms there is no dismissal marker.
 *
 * `pathname` matching is performed here — the server payload doesn't
 * know which page the bar will render on, so per-page scoping has to
 * happen in the client.
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

function pageMatches(scope, pathname) {
  if (!Array.isArray(scope) || scope.length === 0) return true;
  return scope.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Format the time-until-target as "HH:MM:SS" or "D วัน HH:MM:SS".
 * Returns null when the target is unset or already passed — the
 * countdown UI hides itself when this is null.
 */
function formatDiff(targetDate) {
  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return null;

  const totalSecs = Math.floor(diff / 1000);
  const days  = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins  = Math.floor((totalSecs % 3600) / 60);
  const secs  = totalSecs % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  return days > 0 ? `${days} วัน ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

/**
 * Live countdown — re-renders every 1s while the target is in the
 * future. Cleanup tears down the interval on unmount or target change.
 */
function useCountdown(targetDate) {
  const [display, setDisplay] = useState(() => formatDiff(targetDate));

  useEffect(() => {
    if (!targetDate) {
      setDisplay(null);
      return;
    }
    const tick = () => setDisplay(formatDiff(targetDate));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return display;
}

/**
 * WCAG-style perceived-luminance check. We use this to flip the
 * countdown badge's overlay tint so it stays readable on both
 * light (lime/promo) and dark (navy/blue) bar backgrounds.
 */
function isLightBg(hex) {
  if (!hex) return false;
  const h = hex.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

export function TopNotificationBarClient({ bar }) {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(true);
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown(bar?.countdown_target ?? null);

  useEffect(() => {
    try {
      const key = `topbar_dismissed_${bar._id}`;
      if (!sessionStorage.getItem(key)) {
        setDismissed(false);
      }
    } catch {
      // sessionStorage disabled — show the bar.
      setDismissed(false);
    }
  }, [bar._id]);

  if (!bar) return null;
  if (!pageMatches(bar.page_scope, pathname)) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(`topbar_dismissed_${bar._id}`, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bar.btn_copy_value ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore (insecure context / permission denied)
    }
  };

  const hasBtn = Boolean(bar.btn_label?.trim());

  const barStyle = {
    backgroundColor: bar.bg_color || '#2486FF',
    color: bar.text_color || '#FFFFFF',
  };

  if (bar.bg_image_url) {
    barStyle.backgroundImage = `url(${bar.bg_image_url})`;
    barStyle.backgroundRepeat = 'no-repeat';
    barStyle.backgroundPosition = 'center center';
    barStyle.backgroundSize =
      bar.bg_image_size === 'cover'   ? 'cover'   :
      bar.bg_image_size === 'contain' ? 'contain' :
      'auto 100%';
  }

  const btnStyle = {
    // Fallback: translucent white on dark backgrounds, dark text otherwise.
    // Editors can override either via btn_bg_color / btn_text_color.
    backgroundColor: bar.btn_bg_color || 'rgba(255,255,255,0.2)',
    color: bar.btn_text_color || bar.text_color || '#FFFFFF',
  };

  return (
    <div
      role="status"
      aria-label={bar.name || 'Notification'}
      className="relative w-full overflow-hidden px-4 py-4 text-sm font-medium"
      style={barStyle}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 pr-6">
        <span className="line-clamp-1 text-center">{bar.message}</span>

        {countdown && (
          <span
            className="flex-shrink-0 rounded-md px-2.5 py-0.5 font-mono text-xs font-bold tracking-wider tabular-nums"
            style={{
              backgroundColor: isLightBg(bar.bg_color)
                ? 'rgba(0,0,0,0.12)'
                : 'rgba(0,0,0,0.25)',
              color: bar.text_color || '#FFFFFF',
            }}
          >
            ⏱ {countdown}
          </span>
        )}

        {hasBtn &&
          (bar.btn_action === 'copy' ? (
            <button
              type="button"
              onClick={handleCopy}
              className="flex-shrink-0 rounded-full px-3 py-0.5 text-xs font-bold transition-opacity hover:opacity-80"
              style={btnStyle}
            >
              {copied ? bar.btn_copy_ok || 'คัดลอกแล้ว!' : bar.btn_label}
            </button>
          ) : (
            <a
              href={bar.btn_href || '#'}
              target={bar.btn_new_tab ? '_blank' : '_self'}
              rel={bar.btn_new_tab ? 'noopener noreferrer' : undefined}
              className="flex-shrink-0 rounded-full px-3 py-0.5 text-xs font-bold transition-opacity hover:opacity-80"
              style={btnStyle}
            >
              {bar.btn_label}
            </a>
          ))}
      </div>

      {bar.dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="ปิดประกาศ"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100"
          style={{ color: bar.text_color || '#FFFFFF' }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}