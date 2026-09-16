/**
 * The masterclass chat card's price row, as a view — pure, no React, so the
 * `pure` tier can pin the stale-snapshot rule and the Bangkok date without a
 * DOM. Rendered by MasterclassCard in src/components/chat/ChatCards.jsx.
 *
 * The upstream item (`/api/chat` → `masterclasses[]`, served from genesis's
 * own /api/corpus/masterclass-cards) carries:
 *
 *   price: null | { amount, normal_amount, early_bird, early_bird_ends_at }
 *
 * where `normal_amount` and `early_bird_ends_at` are set only while the
 * early bird is live, and `early_bird_ends_at` is ISO UTC.
 *
 * ── STALE SNAPSHOT ─────────────────────────────────────────────────────────
 * The card is restored from sessionStorage, so `early_bird: true` can be
 * days old. At render time: if `early_bird_ends_at` is at or before `now`,
 * render as if `early_bird` were false — and show `amount` only if it equals
 * the normal price; otherwise show `normal_amount`, because that is the
 * price after the early bird.
 *
 * ── THE DATE IS BANGKOK, NOT THE MACHINE ───────────────────────────────────
 * `2026-09-16T16:59:00Z` is 23:59 on the 16th in Bangkok and already the
 * 17th in Sydney. The deadline is an end-of-day-Bangkok instant, so the
 * calendar day is read through siteDateParts (Asia/Bangkok pinned), and
 * only then handed to the round-date formatter for the day + abbreviated
 * Thai month — the repo's one locale-data month source, not a tenth table.
 */
import { siteDateParts } from '@/lib/articlePublishTime';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** `'2026-09-16T16:59:00Z'` → `'16 ก.ย.'` — the Bangkok calendar day, no year; null when unusable. */
export function bangkokDayMonth(iso) {
  const p = siteDateParts(iso);
  if (!p) return null;
  // A LOCAL-midnight Date of the Bangkok calendar fields: formatRoundDays
  // reads local fields, so this is how the machine zone drops out.
  const label = formatRoundDays([new Date(p.year, p.month - 1, p.day)], { showMonth: true });
  return label === '-' ? null : label;
}

/**
 * @param {object|null} price the item's `price`
 * @param {number|Date} [now] the instant to judge the early bird against
 * @returns {null | { amount: number, normalAmount: number|null, earlyBird: boolean, endsLabel: string|null }}
 *   null → no price row. `normalAmount` and `endsLabel` are non-null only
 *   while the early bird is live at `now`.
 */
export function masterclassPriceView(price, now = Date.now()) {
  if (!price || typeof price !== 'object') return null;
  const amount = num(price.amount);
  const normal = num(price.normal_amount);
  if (amount === null) return null;

  const endsAt = price.early_bird_ends_at ? new Date(price.early_bird_ends_at).getTime() : NaN;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  // Stale snapshot: a deadline at or before now ends the early bird here, whatever the stored flag says.
  const expired = Number.isFinite(endsAt) && endsAt <= nowMs;
  const live = price.early_bird === true && !expired;

  if (!live) {
    // After the early bird the buyer pays the normal price; `amount` is only
    // right if it already IS that price.
    const shown = normal !== null && normal !== amount ? normal : amount;
    return { amount: shown, normalAmount: null, earlyBird: false, endsLabel: null };
  }

  return {
    amount,
    normalAmount: normal !== null && normal !== amount ? normal : null,
    earlyBird: true,
    endsLabel: Number.isFinite(endsAt) ? bangkokDayMonth(price.early_bird_ends_at) : null,
  };
}
