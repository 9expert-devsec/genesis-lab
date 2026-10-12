/**
 * Career-path course codes, group rules and prerequisite pairs — pure, shared by the public
 * pick step (CareerPathRegisterClient) and the server re-check
 * (createCareerPathRegistration). No imports, no I/O.
 *
 * ── CODES HAVE NO CANONICAL CASING ─────────────────────────────────────────
 * A curriculum item carries the code it was synced with (`Power-Apps`) while
 * upstream may now spell it `POWER-APPS`; see getCourseByCodeInsensitive in
 * lib/api/public-courses for why neither spelling is wrong. Course resolution
 * goes through that function, and everything that MATCHES one code against
 * another — a prerequisite against a pick, a stored code against a resolved one
 * — goes through `courseCodeKey` here. Exact-except-case, nothing fuzzier.
 */

// ── Round dates ──────────────────────────────────────────────────
// MOVED here from CareerPathRegisterClient so the pick step and the server
// read a round's span through the same four functions. Unchanged.

export function sortedDates(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return [];
  return [...dates].filter(Boolean).sort();
}

export function minDateOf(dates) {
  const s = sortedDates(dates);
  return s.length ? s[0] : null;
}

export function maxDateOf(dates) {
  const s = sortedDates(dates);
  return s.length ? s[s.length - 1] : null;
}

// ISO `YYYY-MM-DD` strings sort lexicographically — same order as time,
// so `'2026-05-23' > '2026-05-22'` does the right thing.
export function isAfter(a, b) {
  if (!a || !b) return false;
  return a > b;
}

/**
 * A round's first / last DAY as `YYYY-MM-DD`. Upstream sends midnight-UTC
 * datetimes (`2026-11-09T00:00:00.000Z`); the pair rule compares DAYS, so the
 * time part is cut rather than compared — a round ending at 00:00 and one
 * starting at 09:00 the same day is the same day. `null` when there are none.
 */
export function roundStartDay(dates) {
  const m = minDateOf(dates);
  return m ? String(m).slice(0, 10) : null;
}

export function roundEndDay(dates) {
  const m = maxDateOf(dates);
  return m ? String(m).slice(0, 10) : null;
}

/** The comparison key for a course code: exact except for case. */
export function courseCodeKey(code) {
  return String(code ?? '').toLowerCase();
}

// ── Curriculum ───────────────────────────────────────────────────
// MOVED here from CareerPathRegisterClient, unchanged, so the server
// re-check applies the same group rules the pick step does.

export function itemCode(item) {
  return String(item?.snap?.code ?? item?.course_id ?? '');
}

export function isChoiceGroup(group) {
  return String(group?.kind ?? '').toLowerCase() === 'choice';
}

export function groupItems(group) {
  return Array.isArray(group?.items) ? group.items : [];
}

// Hybrid picks are stored with `type: 'hybrid'` until the user resolves
// them to Classroom or MS Teams (at which point `type` becomes
// "Hybrid (Classroom)" / "Hybrid (MS Teams)"). Unresolved picks must
// not count toward group completion.
export function isPickResolved(sel) {
  return Boolean(sel) && String(sel?.type ?? '').toLowerCase() !== 'hybrid';
}

// A group is "satisfied" when its own selection threshold is met. Used
// to decide whether the NEXT group's overlay should unlock.
export function isGroupSatisfied(group, selected) {
  const items = groupItems(group);
  if (items.length === 0) return true; // nothing to pick, treat as done
  const picks = items.filter((it) => isPickResolved(selected[itemCode(it)])).length;
  if (isChoiceGroup(group)) {
    return picks >= Math.max(1, Number(group?.chooseMin) || 1);
  }
  return picks === items.length;
}

/**
 * Rewrite a curriculum so every item code and every prerequisite code is the
 * CANONICAL resolved code. Returns a new array; the input is not mutated, and
 * nothing here is ever written back to the stored document.
 *
 * @param {Array} curriculum  career_paths.curriculum
 * @param {Map<string,string>} canonicalByCode  stored item code → resolved `course_id`
 *   (codes that did not resolve are simply absent and keep their own spelling)
 */
export function canonicaliseCurriculumCodes(curriculum, canonicalByCode) {
  const byKey = new Map();
  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      const code = itemCode(it);
      if (code && !byKey.has(courseCodeKey(code))) byKey.set(courseCodeKey(code), code);
    }
  }
  for (const [code, canonical] of canonicalByCode ?? []) {
    if (code && canonical) byKey.set(courseCodeKey(code), String(canonical));
  }
  const canon = (code) => byKey.get(courseCodeKey(code)) ?? String(code);

  return (Array.isArray(curriculum) ? curriculum : []).map((g) => ({
    ...g,
    items: (Array.isArray(g?.items) ? g.items : []).map((it) => {
      const code = itemCode(it);
      const next = { ...it };
      if (code) {
        if (it?.snap?.code != null) next.snap = { ...it.snap, code: canon(code) };
        if (it?.course_id != null) next.course_id = canon(code);
      }
      if (Array.isArray(it?.prerequisites)) {
        next.prerequisites = it.prerequisites.map((p) => canon(p));
      }
      return next;
    }),
  }));
}

// ── Prerequisite pairs ───────────────────────────────────────────
//
// THE RULE. Course D lists course P under "ต้องเรียนก่อน". When BOTH are
// picked, D's round must START strictly after P's round ENDS — by day, so the
// same day or any overlap is a violation. A round with no dates cannot satisfy
// a pair it is part of. An unpicked P imposes nothing on D (it may simply not
// have been chosen in a Choice group), and chains A → B → C hold because every
// pair is checked on its own.

/**
 * Every (dependent, prerequisite) pair in the curriculum, both as spelled on
 * their curriculum items. A prerequisite code is matched to an item without
 * regard to case; one that names no item in this path, or the item itself,
 * is ignored.
 *
 * @returns {Array<{ dependent: string, prerequisite: string }>}
 */
export function prerequisitePairs(curriculum) {
  const byKey = new Map();
  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      const code = itemCode(it);
      if (code && !byKey.has(courseCodeKey(code))) byKey.set(courseCodeKey(code), code);
    }
  }
  const pairs = [];
  const seen = new Set();
  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      const dependent = itemCode(it);
      if (!dependent || !Array.isArray(it?.prerequisites)) continue;
      for (const p of it.prerequisites) {
        const prerequisite = byKey.get(courseCodeKey(p));
        if (!prerequisite || courseCodeKey(prerequisite) === courseCodeKey(dependent)) continue;
        const id = `${courseCodeKey(dependent)}|${courseCodeKey(prerequisite)}`;
        if (seen.has(id)) continue;
        seen.add(id);
        pairs.push({ dependent, prerequisite });
      }
    }
  }
  return pairs;
}

/** Does a dependent round (by its dates) come strictly after a prerequisite round? */
export function pairHolds(dependentDates, prerequisiteDates) {
  return isAfter(roundStartDay(dependentDates), roundEndDay(prerequisiteDates));
}

function pickLookup(picks) {
  const byKey = new Map();
  for (const [code, pick] of Object.entries(picks ?? {})) {
    if (pick) byKey.set(courseCodeKey(code), pick);
  }
  return (code) => byKey.get(courseCodeKey(code)) ?? null;
}

/**
 * Pairs whose BOTH courses are picked and whose rounds break the rule.
 *
 * @param {Array} curriculum
 * @param {Record<string, { dates?: string[] }>} picks  course code → picked round
 * @returns {Array<{ dependent: string, prerequisite: string }>}
 */
export function pairViolations(curriculum, picks) {
  const pickOf = pickLookup(picks);
  return prerequisitePairs(curriculum).filter(({ dependent, prerequisite }) => {
    const d = pickOf(dependent);
    const p = pickOf(prerequisite);
    return d && p && !pairHolds(d.dates, p.dates);
  });
}

/**
 * Would picking a round with `dates` for course `code` break a pair against the
 * OTHER current picks? Returns the first blocking pick, or null when allowed.
 *
 *   needs: 'after'  — `code` is the dependent; it must start after `code`'s blocker ends
 *   needs: 'before' — `code` is the prerequisite; it must end before the blocker starts
 *
 * @returns {{ code: string, needs: 'after' | 'before' } | null}
 */
export function roundBlocker(curriculum, picks, code, dates) {
  const pickOf = pickLookup(picks);
  const self = courseCodeKey(code);
  for (const { dependent, prerequisite } of prerequisitePairs(curriculum)) {
    if (courseCodeKey(dependent) === self) {
      const p = pickOf(prerequisite);
      if (p && !pairHolds(dates, p.dates)) return { code: prerequisite, needs: 'after' };
    } else if (courseCodeKey(prerequisite) === self) {
      const d = pickOf(dependent);
      if (d && !pairHolds(d.dates, dates)) return { code: dependent, needs: 'before' };
    }
  }
  return null;
}
