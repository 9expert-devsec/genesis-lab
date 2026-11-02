import { MAX_STARS, xpFor } from './stars.js';

/**
 * Player progress, `{ [levelId]: { stars, xp, passedAt } }`, kept in the
 * browser only. A replay never lowers a level's score: the reducer keeps the
 * best stars, and the first `passedAt` of that best.
 *
 * Storage is a convenience, never a requirement. Every read and write is
 * wrapped, and anything that does not parse into the shape above reads back
 * as empty progress — a private window, blocked storage or a hand-edited value
 * must still leave a playable page.
 */

export const PROGRESS_KEY = 'play:v1:progress';

export function progressReducer(state, action) {
  const current = state || {};
  if (action?.type !== 'pass') return current;
  const stars = Math.max(1, Math.min(MAX_STARS, Math.floor(Number(action.stars) || 0)));
  const prev = current[action.levelId];
  if (prev && prev.stars >= stars) return current;
  return {
    ...current,
    [action.levelId]: { stars, xp: xpFor(stars), passedAt: action.passedAt ?? new Date().toISOString() },
  };
}

/** Keep only well-formed entries; anything else is dropped, not repaired. */
export function sanitizeProgress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, entry] of Object.entries(raw)) {
    const stars = entry?.stars;
    if (!Number.isInteger(stars) || stars < 1 || stars > MAX_STARS) continue;
    out[id] = { stars, xp: xpFor(stars), passedAt: typeof entry.passedAt === 'string' ? entry.passedAt : null };
  }
  return out;
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadProgress(storage = defaultStorage()) {
  try {
    const text = storage?.getItem(PROGRESS_KEY);
    return text ? sanitizeProgress(JSON.parse(text)) : {};
  } catch {
    return {};
  }
}

export function saveProgress(progress, storage = defaultStorage()) {
  try {
    storage?.setItem(PROGRESS_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function totalStars(progress, levels) {
  return (levels || []).reduce((sum, l) => sum + (progress?.[l.id]?.stars || 0), 0);
}
