import { MAX_STARS, xpFor } from './stars.js';

/**
 * Player progress, `{ [series]: { [levelId]: { stars, xp, passedAt } } }`, kept
 * in the browser only. Level ids repeat across tiers (Beginner 1-1, Intermediate
 * 1-1), so a level is only ever identified by series + id; the map, HUD and star
 * totals are handed one tier's map (`seriesProgress`). A replay never lowers a
 * level's score: the reducer keeps the best stars, and the first `passedAt` of
 * that best.
 *
 * v1 was one flat `{ [levelId]: … }` map from before the re-tier, when 3-1…3-5
 * and `boss` were the IF levels. `migrateV1` moves those entries with the levels
 * they were earned on. v1's key is read, never written or removed, and once a v2
 * value exists it is ignored.
 *
 * Storage is a convenience, never a requirement. Every read and write is
 * wrapped, and anything that does not parse into the shape above reads back
 * as empty progress — a private window, blocked storage or a hand-edited value
 * must still leave a playable page.
 */

export const PROGRESS_KEY = 'play:v2:progress';
export const LEGACY_PROGRESS_KEY = 'play:v1:progress';

/** Where v1 entries went: the IF chapter moved tier; the old boss left the map. */
const V1_MOVED = {
  '3-1': ['intermediate', '1-1'],
  '3-2': ['intermediate', '1-2'],
  '3-3': ['intermediate', '1-3'],
  '3-4': ['intermediate', '1-4'],
  '3-5': ['intermediate', '1-5'],
  boss: ['retired', 'boss'],
};

/** One tier's `{ [levelId]: entry }`, the shape map.js and totalStars read. */
export const seriesProgress = (progress, series) => progress?.[series] ?? {};

export function progressReducer(state, action) {
  const current = state || {};
  if (action?.type !== 'pass' || !action.series) return current;
  const stars = Math.max(1, Math.min(MAX_STARS, Math.floor(Number(action.stars) || 0)));
  const tier = seriesProgress(current, action.series);
  const prev = tier[action.levelId];
  if (prev && prev.stars >= stars) return current;
  return {
    ...current,
    [action.series]: {
      ...tier,
      [action.levelId]: { stars, xp: xpFor(stars), passedAt: action.passedAt ?? new Date().toISOString() },
    },
  };
}

/** Keep only well-formed entries; anything else is dropped, not repaired. */
function sanitizeEntries(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, entry] of Object.entries(raw)) {
    const stars = entry?.stars;
    if (!Number.isInteger(stars) || stars < 1 || stars > MAX_STARS) continue;
    out[id] = { stars, xp: xpFor(stars), passedAt: typeof entry.passedAt === 'string' ? entry.passedAt : null };
  }
  return out;
}

export function sanitizeProgress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [series, entries] of Object.entries(raw)) {
    const clean = sanitizeEntries(entries);
    if (Object.keys(clean).length) out[series] = clean;
  }
  return out;
}

export function migrateV1(raw) {
  const out = {};
  for (const [id, entry] of Object.entries(sanitizeEntries(raw))) {
    const [series, levelId] = V1_MOVED[id] ?? ['beginner', id];
    (out[series] ||= {})[levelId] = entry;
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
    if (text) return sanitizeProgress(JSON.parse(text));
    const legacy = storage?.getItem(LEGACY_PROGRESS_KEY);
    return legacy ? migrateV1(JSON.parse(legacy)) : {};
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
