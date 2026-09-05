/**
 * Legacy Drupal course → genesis course MATCH REPORT — READ-ONLY.
 *
 * ── THIS SCRIPT NEVER WRITES TO A DATABASE ──────────────────────────────────
 * Not behind a flag, not with a prompt, not at all. There is no --apply, no
 * updateOne / insertMany / bulkWrite / $set anywhere in this file, and no
 * mongoose import. It performs ONE upstream GET (through the same read path
 * /admin/courses uses) and writes TWO FILES under docs/legacy/. Nothing else.
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────────
 * docs/legacy/legacy-courses.json holds 65 course titles from the legacy Drupal
 * site, each with the number of registrations that reference it. Those
 * registrations are about to be imported into register_public / register_inhouse
 * and each one needs a genesis courseId. This script does NOT pick that id. It
 * produces a report a human approves, and a map file covering ONLY the two
 * tiers where the machine's answer is re-derivable by reading the row.
 *
 * ── THE READ PATH IS THE EXISTING ONE, NOT A NEW ONE ────────────────────────
 * `listPublicCourses({ includeHidden: true })` from src/lib/api/public-courses.js
 * — the exact call src/app/admin/courses/page.jsx makes. `includeHidden` for the
 * same reason that page states it: a legacy registration for a course that has
 * since been HIDDEN still needs its courseId, and a hidden course dropped from
 * this list would silently land in `unmatched` and read as "no such course".
 *
 * That path also touches Mongo — `loadCourseOrder` and `loadCourseAliasMap`,
 * both READS, both of which affect only row ORDER and the `urlAlias` field, and
 * neither of which this script uses. If Mongo is unreachable they log a warning
 * and return null/empty; the course list still arrives and the match is
 * unaffected. Do not "fix" that by bypassing listPublicCourses — going straight
 * to aiFetch would be a second read path, which is the thing the task forbids.
 *
 * ── THE FOUR TIERS, AND WHY THERE IS NO SCORE ───────────────────────────────
 *   exact       identical after trim + collapse whitespace + lowercase
 *   normalized  identical after ALSO stripping punctuation and the words
 *               "microsoft" and "for business" (each row reports what it stripped)
 *   ambiguous   more than one genesis course matched equally well under the
 *               rule that fired — NO WINNER IS PICKED, ever
 *   unmatched   no genesis course matched under either rule
 *
 * There is deliberately NO fuzzy score, no edit distance, no token overlap
 * ratio. Every match in the two accepted tiers is a string equality a human can
 * re-perform by hand from the columns in the row. A 0.87-similarity match is
 * not reviewable — it is a number the reviewer must either trust or redo — and
 * this round exists to be reviewed.
 *
 * ── THE CONTROL ─────────────────────────────────────────────────────────────
 * `node scripts/match-legacy-courses.mjs --selftest` runs offline, feeds a
 * legacy title with no genesis counterpart through `classify`, and asserts it
 * lands in `unmatched`. Deleting the threshold check in `classify` (marked
 * below) makes it fail — verified, see the comment there.
 *
 * Usage:
 *   node --env-file=.env.local scripts/match-legacy-courses.mjs
 *   node scripts/match-legacy-courses.mjs --selftest     (offline, no network)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const LEGACY_JSON = path.join(ROOT, 'docs', 'legacy', 'legacy-courses.json');
const OUT_DIR = path.join(ROOT, 'docs', 'legacy');
const OUT_TSV = path.join(OUT_DIR, 'course-match-report.tsv');
const OUT_MAP = path.join(OUT_DIR, 'course-match-map.json');

// ───────────────────────────────────────────────────────────────────────────
// NORMALISATION — the two keys, and nothing else
// ───────────────────────────────────────────────────────────────────────────

/**
 * Tier-1 key: trim + collapse internal whitespace + lowercase.
 * Nothing is removed. Two titles sharing this key are the SAME STRING modulo
 * spacing and case, which is why the tier is called `exact`.
 */
export function normBase(title) {
  return String(title ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * The tokens the normalized tier is allowed to remove. Ordered: the phrase goes
 * before the bare word, so "for business" is never left as a stranded "for".
 *
 * THIS LIST IS THE WHOLE OF THE NORMALIZED RULE. Adding an entry widens what
 * the machine will accept without a human, so an addition is a decision, not a
 * tidy-up — and every row reports which entries fired on it, so a bad addition
 * is visible in the report rather than hidden in the match.
 */
const STRIPPABLE = [
  { label: 'for business', re: /\bfor business\b/g },
  { label: 'microsoft', re: /\bmicrosoft\b/g },
];

/**
 * Tier-2 key: normBase, then punctuation, then the STRIPPABLE tokens.
 *
 * Punctuation = anything that is not a letter, a digit or whitespace, under
 * Unicode rules — so Thai and the digits in "Microsoft 365" survive, while
 * ".", "&", ":" and "-" do not. Punctuation goes FIRST so that "for business,"
 * and "for-business" reduce to the same phrase the token list looks for.
 *
 * Returns the key AND the labels of what actually fired, because "normalized"
 * is only reviewable if the row says what was thrown away to get there.
 */
export function normDeep(title) {
  const stripped = [];
  let key = normBase(title);

  const depunctuated = key.replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (depunctuated !== key) stripped.push('punctuation');
  key = depunctuated;

  for (const { label, re } of STRIPPABLE) {
    const next = key.replace(re, ' ').replace(/\s+/g, ' ').trim();
    if (next !== key) stripped.push(`"${label}"`);
    key = next;
  }

  return { key, stripped };
}

// ───────────────────────────────────────────────────────────────────────────
// THE INDEX + THE CLASSIFIER
// ───────────────────────────────────────────────────────────────────────────

/**
 * Two multi-maps over the genesis courses, key → [course, ...].
 *
 * MULTI-maps, not maps, and that is the point: a key holding two courses is
 * exactly the `ambiguous` signal. Collapsing to last-write-wins here would
 * silently pick a winner in the one tier that exists to refuse to.
 */
export function buildIndex(courses) {
  const byExact = new Map();
  const byNormalized = new Map();
  for (const c of courses) {
    const name = c?.course_name ?? '';
    const k1 = normBase(name);
    const k2 = normDeep(name).key;
    if (k1) (byExact.get(k1) ?? byExact.set(k1, []).get(k1)).push(c);
    if (k2) (byNormalized.get(k2) ?? byNormalized.set(k2, []).get(k2)).push(c);
  }
  return { byExact, byNormalized };
}

/**
 * Which genesis courses are candidates, and under which rule.
 *
 * Exact is tried first and returned unconditionally when it hits, so a title
 * that matches a genesis name outright is never re-examined by the looser rule
 * — the looser rule can only ever ADD candidates, so consulting it after a
 * clean hit could only manufacture ambiguity out of an unambiguous answer.
 *
 * `rule: null` means neither rule fired. That is the ONLY way a title reaches
 * `unmatched`, and it is a fact about string equality, not a threshold anyone
 * tuned.
 */
export function candidateSet(title, index) {
  const k1 = normBase(title);
  if (k1 && index.byExact.has(k1)) {
    return { rule: 'exact', matches: index.byExact.get(k1), stripped: [] };
  }
  const { key: k2, stripped } = normDeep(title);
  if (k2 && index.byNormalized.has(k2)) {
    return { rule: 'normalized', matches: index.byNormalized.get(k2), stripped };
  }
  return { rule: null, matches: [], stripped };
}

/**
 * One legacy row → exactly one tier.
 */
export function classify(legacy, index) {
  const title = legacy?.drupalTitle;

  // A missing title is not a match failure, it is a MISSING RECORD, and it is
  // reported as such rather than dropped — nid 2256 and nid 8 carry one
  // registration each and a human still has to place them by hand.
  if (title == null || String(title).trim() === '') {
    return {
      tier: 'unmatched',
      match: null,
      others: [],
      stripped: [],
      reason:
        'drupalTitle is null in legacy-courses.json — no title to match on; ' +
        'resolve from the Drupal node by hand',
    };
  }

  const { rule, matches, stripped } = candidateSet(title, index);

  /**
   * ── THE THRESHOLD CHECK ──────────────────────────────────────────────────
   * THIS IS THE LINE THE CONTROL DELETES. `--selftest` feeds a title with no
   * genesis counterpart, which produces `rule: null` and `matches: []`. With
   * this check present it returns `unmatched`. Delete it and control flow falls
   * through to the tail return, which reports `tier: null` and a match built
   * from `matches[0]` — i.e. `undefined` — so the fixture stops landing in
   * `unmatched` and the control goes red. Verified by deleting it and running.
   */
  if (rule === null) {
    return {
      tier: 'unmatched',
      match: null,
      others: [],
      stripped,
      reason:
        'no genesis course_name is equal to this title under the exact rule ' +
        'or the normalized rule',
    };
  }

  if (matches.length > 1) {
    return {
      tier: 'ambiguous',
      match: null,
      others: matches,
      stripped,
      reason: `${matches.length} genesis courses match equally well under the ` +
        `${rule} rule — a human must choose`,
    };
  }

  const winner = matches[0];

  /**
   * `others` on a WINNING row: the genesis courses that share the winner's
   * normalized key but are not the winner. On an `exact` row that set can be
   * non-empty — two genesis names that differ only by punctuation or by the
   * word "microsoft" collapse together one tier down — and a reviewer should
   * see that near-neighbour before approving the id. It never changes the
   * verdict; it is context printed beside it.
   */
  const nearby = (index.byNormalized.get(normDeep(title).key) ?? []).filter(
    (c) => c !== winner
  );

  return { tier: rule, match: winner, others: nearby, stripped, reason: '' };
}

// ───────────────────────────────────────────────────────────────────────────
// OUTPUT
// ───────────────────────────────────────────────────────────────────────────

/** TSV cells must not carry a tab or a newline, or the columns shift silently. */
const cell = (v) =>
  String(v ?? '')
    .replace(/[\t\r\n]+/g, ' ')
    .trim();

const label = (c) => `${c?.course_id ?? '?'} — ${c?.course_name ?? '?'}`;

export function buildRows(legacyCourses, index) {
  return legacyCourses
    .map((legacy) => {
      const r = classify(legacy, index);
      return {
        nid: legacy.nid,
        drupalTitle: legacy.drupalTitle,
        tier: r.tier,
        match: r.match,
        others: r.others,
        stripped: r.stripped,
        reason: r.reason,
        totalSubmissions: Number(legacy.totalSubmissions ?? 0),
      };
    })
    // Submissions DESC — the rows that decide the most registrations are
    // reviewed first. nid ASC only to make the file byte-stable across runs
    // when two courses carry the same count.
    .sort(
      (a, b) =>
        b.totalSubmissions - a.totalSubmissions || Number(a.nid) - Number(b.nid)
    );
}

const HEADER = [
  'nid',
  'drupalTitle',
  'tier',
  'genesisCourseId',
  'genesisCourseName',
  'otherCandidates',
  'strippedTokens',
  'reason',
  'totalSubmissions',
];

function toTsv(rows) {
  const lines = [HEADER.join('\t')];
  for (const r of rows) {
    lines.push(
      [
        cell(r.nid),
        cell(r.drupalTitle ?? '(null)'),
        cell(r.tier),
        cell(r.match?.course_id ?? ''),
        cell(r.match?.course_name ?? ''),
        cell(r.others.map(label).join(' | ')),
        cell(r.stripped.join(', ')),
        cell(r.reason),
        cell(r.totalSubmissions),
      ].join('\t')
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * The map carries ONLY exact + normalized. ambiguous and unmatched are absent
 * on purpose — an importer reading this file must find nothing for a nid a
 * human has not resolved, so a gap fails loudly at import rather than
 * defaulting to some course.
 *
 * `courseId` and `courseCode` are BOTH the upstream `course_id` code. That is
 * not a slip: RegisterWizard writes `courseId: course.course_id` and
 * `courseCode: course.course_id` (src/components/registration/RegisterWizard.jsx),
 * and lib/actions/registrations.js resolves a stored `courseId` with
 * `getCourseByCodeInsensitive` — i.e. as a code. Writing the Mongo ObjectId
 * into `courseId` here would produce documents no existing read path resolves.
 */
function toMap(rows) {
  const out = {};
  for (const r of rows) {
    if (r.tier !== 'exact' && r.tier !== 'normalized') continue;
    out[String(r.nid)] = {
      courseId: r.match.course_id,
      courseCode: r.match.course_id,
      courseName: r.match.course_name,
    };
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// THE CONTROL
// ───────────────────────────────────────────────────────────────────────────

function selftest() {
  const genesis = [
    { _id: 'a', course_id: 'MSE-L2', course_name: 'Microsoft Excel Advanced' },
    { _id: 'b', course_id: 'POWER-APPS', course_name: 'Power Apps for Business' },
  ];
  const index = buildIndex(genesis);

  const failures = [];
  const check = (name, ok, detail) => {
    if (!ok) failures.push(`${name} — ${detail}`);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  };

  // THE CONTROL: a legacy title with NO genesis counterpart must land in
  // `unmatched`. This is the assertion the threshold check exists to satisfy.
  const orphan = classify(
    { nid: 9999, drupalTitle: 'Underwater Basket Weaving for Auditors', totalSubmissions: 1 },
    index
  );
  check(
    'a legacy title with no genesis counterpart lands in unmatched',
    orphan.tier === 'unmatched' && orphan.match === null,
    `got tier=${JSON.stringify(orphan.tier)} match=${JSON.stringify(orphan.match?.course_id ?? null)}`
  );

  // Two companions, so the control above cannot pass by the classifier simply
  // returning "unmatched" for everything.
  const hit = classify({ nid: 1, drupalTitle: '  microsoft   EXCEL advanced ' }, index);
  check(
    'trim + collapse + lowercase still lands in exact',
    hit.tier === 'exact' && hit.match?.course_id === 'MSE-L2',
    `got tier=${hit.tier} id=${hit.match?.course_id}`
  );

  const nulled = classify({ nid: 2256, drupalTitle: null }, index);
  check(
    'a null drupalTitle lands in unmatched with a reason',
    nulled.tier === 'unmatched' && nulled.reason.length > 0,
    `got tier=${nulled.tier} reason=${JSON.stringify(nulled.reason)}`
  );

  console.log('');
  if (failures.length) {
    console.error(`SELFTEST RED — ${failures.length} failure(s):`);
    for (const f of failures) console.error(`  · ${f}`);
    process.exit(1);
  }
  console.log('SELFTEST GREEN — 3/3');
}

// ───────────────────────────────────────────────────────────────────────────
// MAIN
// ───────────────────────────────────────────────────────────────────────────

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  // The `@/` aliases are invisible to Node; test/loader.mjs resolves them. The
  // import is dynamic and BELOW this line so that --selftest needs neither the
  // loader nor a network.
  register(new URL('../test/loader.mjs', import.meta.url));
  const { listPublicCourses } = await import('@/lib/api/public-courses');

  const legacy = JSON.parse(readFileSync(LEGACY_JSON, 'utf8'));
  const legacyCourses = legacy.courses ?? [];

  // THE ONLY UPSTREAM CALL. Read. `includeHidden` matches /admin/courses.
  const { items: genesis = [] } = await listPublicCourses({ includeHidden: true });

  const index = buildIndex(genesis);
  const rows = buildRows(legacyCourses, index);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_TSV, toTsv(rows), 'utf8');
  const map = toMap(rows);
  writeFileSync(OUT_MAP, JSON.stringify(map, null, 2) + '\n', 'utf8');

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  const TIERS = ['exact', 'normalized', 'ambiguous', 'unmatched'];
  const totalSubs = rows.reduce((n, r) => n + r.totalSubmissions, 0);

  console.log('');
  console.log(`legacy courses read : ${legacyCourses.length}  (${LEGACY_JSON})`);
  console.log(`genesis courses read: ${genesis.length}  (listPublicCourses includeHidden:true → GET /public-course)`);
  console.log('');
  console.log('tier          courses   submissions');
  console.log('----------------------------------');
  for (const t of TIERS) {
    const inTier = rows.filter((r) => r.tier === t);
    const subs = inTier.reduce((n, r) => n + r.totalSubmissions, 0);
    const pct = totalSubs ? ((subs / totalSubs) * 100).toFixed(1) : '0.0';
    console.log(
      `${t.padEnd(12)}${String(inTier.length).padStart(8)}${String(subs).padStart(14)}   (${pct}% of submissions)`
    );
  }
  console.log('----------------------------------');
  console.log(`${'TOTAL'.padEnd(12)}${String(rows.length).padStart(8)}${String(totalSubs).padStart(14)}`);

  // ── COLLAPSES: one genesis course claimed by two legacy titles ───────────
  // A human decision, always: it means two Drupal courses became one genesis
  // course, and the import would merge two registration histories.
  const claimed = new Map();
  for (const r of rows) {
    if (r.tier !== 'exact' && r.tier !== 'normalized') continue;
    const k = r.match.course_id;
    if (!claimed.has(k)) claimed.set(k, []);
    claimed.get(k).push(r);
  }
  const collapses = [...claimed.entries()].filter(([, rs]) => rs.length > 1);
  console.log('');
  if (collapses.length === 0) {
    console.log('COLLAPSES: none — every matched genesis course is claimed by exactly one legacy title.');
  } else {
    console.log(`COLLAPSES: ${collapses.length} genesis course(s) claimed by more than one legacy title — HUMAN DECISION:`);
    for (const [courseId, rs] of collapses) {
      const subs = rs.reduce((n, r) => n + r.totalSubmissions, 0);
      console.log(`  · ${courseId} ← ${rs.map((r) => `nid ${r.nid} "${r.drupalTitle}" (${r.totalSubmissions})`).join('  +  ')}   [${subs} submissions total]`);
    }
  }

  console.log('');
  console.log(`wrote ${OUT_TSV}  (${rows.length} rows + header)`);
  console.log(`wrote ${OUT_MAP}  (${Object.keys(map).length} entries — exact + normalized only)`);
  console.log('');
  console.log('NOTHING WAS WRITTEN TO ANY DATABASE. Approve the TSV before anything reads the map.');
}
