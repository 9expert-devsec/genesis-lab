/**
 * Chapter progress and the soft unlock rule for the /play mission map and the
 * level HUD. Client-side only and advisory: it decides how a node or a dot
 * LOOKS, never whether a level URL opens.
 *
 *   · CH.1 is always unlocked.
 *   · CH.n (n = 2, 3) unlocks when every level of CH.n−1 is passed.
 *   · The boss (chapter 4) unlocks when every level of CH.1–3 is passed.
 *
 * `levels` is the index in play order (only id / chapter / order are read);
 * `progress` is the stored `{ [levelId]: { stars } }` map.
 */

export const BOSS_CHAPTER = 4;

const isPassed = (progress, id) => !!progress?.[id];

function inChapter(levels, chapter) {
  return levels.filter((l) => l.chapter === chapter).sort((a, b) => a.order - b.order);
}

/** `{ [chapter]: { passed, total } }` for every chapter present in `levels`. */
export function chapterProgress(levels, progress) {
  const out = {};
  for (const l of levels) {
    const c = (out[l.chapter] ||= { passed: 0, total: 0 });
    c.total += 1;
    if (isPassed(progress, l.id)) c.passed += 1;
  }
  return out;
}

export function isChapterComplete(chapter, levels, progress) {
  const ls = inChapter(levels, chapter);
  return ls.length > 0 && ls.every((l) => isPassed(progress, l.id));
}

export function isBossUnlocked(levels, progress) {
  const chapters = [...new Set(levels.map((l) => l.chapter))].filter((c) => c !== BOSS_CHAPTER);
  return chapters.length > 0 && chapters.every((c) => isChapterComplete(c, levels, progress));
}

export function isChapterUnlocked(chapter, levels, progress) {
  if (chapter <= 1) return true;
  if (chapter === BOSS_CHAPTER) return isBossUnlocked(levels, progress);
  return isChapterComplete(chapter - 1, levels, progress);
}

/** The first unpassed level of a chapter, or its first level when all are passed. */
export function firstUnpassedLevel(chapter, levels, progress) {
  const ls = inChapter(levels, chapter);
  const open = ls.find((l) => !isPassed(progress, l.id));
  return (open || ls[0] || null)?.id ?? null;
}

/** The hero CTA's target: the first unpassed level in play order, else the first level. */
export function nextLevelForPlayer(levels, progress) {
  const open = levels.find((l) => !isPassed(progress, l.id));
  return (open || levels[0] || null)?.id ?? null;
}

/**
 * The chapter the map marks as "you are here": the one holding the first
 * unpassed level. With everything passed that is the boss, not CH.1.
 */
export function currentChapter(levels, progress) {
  const open = levels.find((l) => !isPassed(progress, l.id));
  return open ? open.chapter : BOSS_CHAPTER;
}
