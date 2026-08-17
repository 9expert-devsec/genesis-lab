import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  UPSTREAM_TAGS,
  PER_RECORD_TAG_BUILDERS,
  bustUpstream,
} from '@/lib/api/bustUpstream';
import { _calls } from '../stub-next-cache.mjs';
import { scrubSource } from '../sourceScan.mjs';

// Every cache tag set on a READ must have a buster, or the read serves a stale
// value for an hour and nothing anywhere says so. This guard derives BOTH sets
// from source and compares them.
//
// ── WHAT THIS GUARD CANNOT SEE ────────────────────────────────────────────
//
// 1. It matches tags by STATIC LITERAL inside `src/lib/api/*.js`. A tag built
//    by interpolation (`course:${id}`) has no fixed value, so those are matched
//    by normalised SHAPE (`course:<id>`) against the builders the module
//    exports. A tag assembled from a variable defined elsewhere
//    (`const t = PREFIX + id; tags: [t]`) is invisible to it entirely.
// 2. It only walks `src/lib/api/*.js`. A tagged read written anywhere else is
//    unseen — and there is already one: reviews.js is in that directory but
//    does NOT use aiFetch (different host, raw fetchWithTimeout), which is why
//    this scan looks for the `tags:` option rather than for `aiFetch(`. A scan
//    keyed on `aiFetch(` would have missed it.
// 3. IT DOES NOT KNOW WHICH FILES BUST. In particular
//    src/lib/webhooks/handlers.js:69 busts via a DYNAMIC `revalidateTag(tag)`
//    whose argument is a variable — invisible to any literal scan. A guard that
//    tried to prove "file X busts tag Y" by grepping would classify that file
//    as a non-buster and send someone to "fix" working code. So this guard
//    deliberately checks only that a BUSTER EXISTS in the vocabulary, never
//    which call site uses it.
// 4. It USED to be unable to see whether a buster is called at the right TIME.
//    Busting after a sync has already read is the defect this whole effort
//    started from, and it went unguarded long enough for syncNavMenuData to
//    ship without a bust at all. The second half of this file now covers it —
//    see "── sync jobs must bust BEFORE they read ──" below — with the same
//    honest limit as everything else here: it compares POSITIONS IN THE SOURCE
//    TEXT, so it sees a bust written above a read, not a bust that actually
//    executes first. A bust inside a conditional, or behind an early return,
//    reads as correct to this scan.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.join(HERE, '..', '..', 'src', 'lib', 'api');

/** Normalise an interpolated tag template to its shape: `course:${x}` → `course:<id>`. */
function normalise(tag) {
  return tag.replace(/\$\{[^}]*\}/g, '<id>');
}

/**
 * Comments must go before matching, or prose ABOUT tags counts as tags. The
 * first draft of this file scanned bustUpstream.js's own docstring — which
 * contains the phrase "the `tags:` option" — and swallowed 20 lines of English
 * as a tag name. That scrubbing now lives in test/sourceScan.mjs, shared with
 * every other source guard; see its header for the full list of defects.
 */
const stripComments = (src) => scrubSource(src, { stripImports: false });

/** Every tag string handed to a `tags:` option in one source file. */
function scanSource(src) {
  const found = new Set();
  const code = scrubSource(src);
  // `tags: ['a', 'b']`, `tags: 'a'`, and backtick templates alike.
  for (const m of code.matchAll(/tags:\s*(\[[^\]]*\]|'[^']*'|`[^`]*`)/g)) {
    for (const t of m[1].matchAll(/'([^']*)'|`([^`]*)`/g)) {
      const raw = t[1] ?? t[2];
      if (raw) found.add(normalise(raw));
    }
  }
  return found;
}

/**
 * Every tag set on a read across src/lib/api/*.js.
 *
 * bustUpstream.js is EXCLUDED, and not as a convenience: it is the file that
 * declares the vocabulary, so scanning it would make the comparison circular —
 * every tag would have a buster by construction and the guard would be
 * incapable of failing.
 */
const BUSTER_MODULE = 'bustUpstream.js';

function scanReadTags() {
  const found = new Set();
  for (const file of readdirSync(API_DIR).filter((f) => f.endsWith('.js'))) {
    if (file === BUSTER_MODULE) continue;
    for (const tag of scanSource(readFileSync(path.join(API_DIR, file), 'utf8'))) {
      found.add(tag);
    }
  }
  return found;
}

/** Every tag the busting module can produce. */
function busterTags() {
  return new Set([
    ...Object.values(UPSTREAM_TAGS),
    ...Object.keys(PER_RECORD_TAG_BUILDERS),
  ]);
}

/** THE CHECK, as a pure function so a control can feed it a bad set. */
function unbusted(readTags, busters) {
  return [...readTags].filter((t) => !busters.has(t)).sort();
}

// ── the guard ──────────────────────────────────────────────────────

test('every tag set on an upstream read has a buster', () => {
  assert.deepEqual(unbusted(scanReadTags(), busterTags()), []);
});

test('CONTROL: a tag with no buster is reported', () => {
  // Without this, `unbusted` returning a constant [] would satisfy the test
  // above forever.
  const withOrphan = new Set([...scanReadTags(), 'totally-unbusted-tag']);
  assert.deepEqual(unbusted(withOrphan, busterTags()), ['totally-unbusted-tag']);
});

test('CONTROL: removing a buster reddens the real check', () => {
  // Proves the guard depends on the VOCABULARY, not only on the scan.
  const crippled = new Set([...busterTags()].filter((t) => t !== 'faqs'));
  assert.deepEqual(unbusted(scanReadTags(), crippled), ['faqs']);
});

test('the scanner finds the exact read-tag set, not a subset', () => {
  // An exact set, never `size >= n`: a scanner that silently stopped matching
  // would return {} and every "has a buster" assertion above would pass
  // vacuously. Adding a tagged read reddens HERE first, which is the intent.
  assert.deepEqual(
    scanReadTags(),
    new Set([
      'public-courses',
      'public-course:<id>',
      'course:<id>',
      'schedules',
      'schedules:course:<id>',
      'instructors',
      'promotions',
      'career-paths',
      'career-path:<id>',
      'contact-us',
      'programs',
      'faqs',
      'online-courses',
      'skills',
      'reviews',
    ])
  );
});

test('CONTROL: a tag written in a COMMENT is not counted as a tag', () => {
  // The failure this file actually shipped with on the first run: the scan
  // matched bustUpstream.js's own docstring. Without stripping, this returns a
  // tag and the exact-set assertion above becomes unmaintainable noise.
  assert.deepEqual(scanSource("// tags: ['fake-from-a-comment']\nconst x = 1;"), new Set());
  assert.deepEqual(scanSource("/* tags: ['also-fake'] */"), new Set());
  // and the same scanner DOES see a real one, so it is not simply inert
  assert.deepEqual(scanSource("const r = f(p, { tags: ['real'] });"), new Set(['real']));
});

test('the buster module contributes no read tags of its own', () => {
  // Stated honestly: after comment-stripping, bustUpstream.js has no `tags:`
  // option, so the exclusion is belt-and-braces TODAY rather than load-bearing.
  // It is kept because the failure it prevents is circular and silent — if the
  // module ever gained a `tags:` literal (a worked example in code, say), that
  // tag would appear on BOTH sides and `unbusted` could never report it.
  assert.ok(readdirSync(API_DIR).includes(BUSTER_MODULE), 'the module exists');
  assert.deepEqual(
    scanSource(readFileSync(path.join(API_DIR, BUSTER_MODULE), 'utf8')),
    new Set()
  );
});

test('CONTROL: the scanner is live — it sees the non-aiFetch reviews tag', () => {
  // reviews.js sets `tags: ['reviews']` on a raw fetch, not through aiFetch.
  // Scanning for `aiFetch(` instead of `tags:` would miss it, and that omission
  // would be invisible in the set assertion above unless it is named.
  assert.ok(scanReadTags().has('reviews'));
  // stripComments again, and for the same reason: reviews.js's own docstring
  // says it "does not go through the `aiFetch` client", so a raw
  // `src.includes('aiFetch')` is satisfied by the sentence explaining that it
  // does not. This assertion failed exactly that way on its first run.
  const code = stripComments(readFileSync(path.join(API_DIR, 'reviews.js'), 'utf8'));
  assert.ok(!code.includes('aiFetch'), 'reviews.js deliberately bypasses aiFetch');
});

// ── the helper ─────────────────────────────────────────────────────

test('bustUpstream flattens, skips empties, and reports what it busted', () => {
  _calls.length = 0;
  const busted = bustUpstream(UPSTREAM_TAGS.FAQS, ['', null, UPSTREAM_TAGS.SKILLS]);
  assert.deepEqual(busted, ['faqs', 'skills']);
  assert.deepEqual(
    _calls.filter((c) => c.kind === 'tag').map((c) => c.tag),
    ['faqs', 'skills']
  );
});

test('CONTROL: it reports nothing when given nothing', () => {
  // Pairs with the test above: a `return wanted` that never called through
  // would pass there and fail here, and vice versa for a hardcoded list.
  _calls.length = 0;
  assert.deepEqual(bustUpstream(), []);
  assert.deepEqual(_calls, []);
});

// ── sync jobs must bust BEFORE they read ───────────────────────────
//
// A sync job reads upstream IN ORDER TO WRITE LOCALLY. Every one of those
// reads is cached for an hour. If the job does not bust first, it re-reads the
// same cached response the previous run saw and writes it into Mongo with a
// fresh timestamp and a success status — so the row created upstream ten
// minutes ago is still missing afterwards, and the job reports 'ok'. The admin
// presses the button again and gets the same answer.
//
// That is not hypothetical: syncNavMenuData shipped with no bust at all while
// five sibling jobs had one, and nothing anywhere could tell you.

const LIB_DIR = path.join(HERE, '..', '..', 'src', 'lib');

/** Every `sync*.js` under src/lib, recursively. */
function syncJobFiles(dir = LIB_DIR, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) syncJobFiles(full, out);
    else if (/^sync[A-Z].*\.js$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The body of every `export async function sync*()` in a source string.
 *
 * SCOPED TO THE EXPORTED FUNCTION, and the first draft of this check was not —
 * which made it wrong in a way worth recording. syncNavMenuData defines a
 * `buildEntry` helper ABOVE its entry point, and that helper calls
 * listPublicCourses. A whole-file position compare therefore saw a read above
 * the bust and reported a correctly-busted job as an offender. The bust only
 * has to precede the reads the sync itself triggers; a helper defined earlier
 * and CALLED later is fine.
 *
 * Brace matching, not a regex — a regex cannot balance braces. It can still be
 * fooled by a `{` inside a string literal, which none of these files has.
 */
function exportedSyncBodies(code) {
  const bodies = [];
  for (const m of code.matchAll(/export\s+async\s+function\s+(sync\w*)\s*\([^)]*\)\s*\{/g)) {
    const start = m.index + m[0].length - 1;
    let depth = 0;
    let i = start;
    for (; i < code.length; i += 1) {
      if (code[i] === '{') depth += 1;
      else if (code[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    bodies.push(code.slice(start, i + 1));
  }
  return bodies;
}

/**
 * THE CHECK. Returns the basenames of sync jobs whose exported entry point
 * reads an upstream adapter without a `bustUpstream(` call earlier in that
 * same function body.
 *
 * Adapter names are taken from the file's OWN `@/lib/api/*` imports rather
 * than a hardcoded list, so a job that starts reading a new domain is covered
 * the day it does.
 */
function syncJobsReadingUnbusted(files) {
  const offenders = [];
  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const withImports = scrubSource(raw, { stripImports: false });

    // Which adapter functions does this file pull in?
    const adapters = [];
    for (const m of withImports.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*'@\/lib\/api\/(?!bustUpstream)[^']+'/g
    )) {
      for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        adapters.push(name.split(/\s+as\s+/).pop());
      }
    }
    if (adapters.length === 0) continue; // reads nothing upstream

    for (const body of exportedSyncBodies(scrubSource(raw))) {
      const readIdxs = adapters
        .map((n) => body.search(new RegExp(`\\b${n}\\s*\\(`)))
        .filter((i) => i >= 0);
      if (readIdxs.length === 0) continue; // this entry point reads nothing

      const firstRead = Math.min(...readIdxs);
      const bustIdx = body.search(/\bbustUpstream\s*\(/);
      if (bustIdx === -1 || bustIdx > firstRead) {
        offenders.push(path.basename(file));
        break;
      }
    }
  }
  return offenders.sort();
}

const SYNC_FILES = syncJobFiles();

test('the sync-job scan finds the jobs at all', () => {
  // Guards the whole section against a discovery walk that silently returns
  // nothing — which would make every assertion below pass vacuously.
  const names = SYNC_FILES.map((f) => path.basename(f)).sort();
  assert.deepEqual(names, [
    'syncCareerPaths.js',
    'syncFaqs.js',
    'syncInstructors.js',
    'syncLandingData.js',
    'syncNavMenuData.js',
    'syncPromotions.js',
  ]);
});

test('EXACTLY these sync jobs read upstream without busting first', () => {
  // NOW EMPTY, AND THE LIST STAYS AN EXACT SET RATHER THAN BECOMING `length === 0`.
  //
  // It used to hold syncLandingData.js, with a note saying the offender was
  // real and knowingly left for later — and that this line would have to be
  // updated in the same commit that fixed it, rather than leaving a lie
  // behind. That is what happened; the entry is gone because the defect is.
  //
  // An exact set still reddens in the direction that remains: a NEW sync job
  // that reads upstream without busting appears here the moment it is written.
  // The detector's own controls are below — they drive it with fixtures, so an
  // empty expectation here is not the same as an untested one.
  assert.deepEqual(syncJobsReadingUnbusted(SYNC_FILES), []);
});

test('syncNavMenuData busts before its first read', () => {
  // The concrete repair, pinned by name so a revert is loud.
  assert.ok(!syncJobsReadingUnbusted(SYNC_FILES).includes('syncNavMenuData.js'));
});

test('syncLandingData busts before its first read', () => {
  // The same repair, one job later and over five domains instead of two.
  // Pinned by name for the same reason: the empty set above would also be
  // satisfied by a scan that stopped finding this file, and this would not.
  assert.ok(SYNC_FILES.some((f) => f.endsWith('syncLandingData.js')), 'the file is still scanned');
  assert.ok(!syncJobsReadingUnbusted(SYNC_FILES).includes('syncLandingData.js'));
});

test('syncLandingData busts every FIXED tag its own reads carry', () => {
  /**
   * Presence-and-order is what the scan above checks. This checks the SET,
   * because busting the wrong tags is silent in exactly the way busting none
   * was: the job still runs, still writes, still reports ok, and the domain
   * whose tag was forgotten is still served from an hour-old entry.
   *
   * Derived from the file's own imports rather than hard-coded, so adding a
   * sixth tagged read without busting it fails here instead of shipping.
   * Per-record tags (`course:<id>`, `schedules:course:<oid>`) are deliberately
   * out of scope — their ids are not known until after the list read, which
   * the file documents at its bust site.
   */
  const src = scrubSource(
    readFileSync(path.join(HERE, '..', '..', 'src', 'lib', 'landing', 'syncLandingData.js'), 'utf8')
  );
  const call = /bustUpstream\(([\s\S]*?)\);/.exec(src);
  assert.ok(call, 'syncLandingData calls bustUpstream');
  const busted = [...call[1].matchAll(/UPSTREAM_TAGS\.([A-Z_]+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(busted, [
    'ONLINE_COURSES', // getOnlineCourses
    'PROGRAMS',       // listPrograms
    'PUBLIC_COURSES', // listPublicCourses, incl. the per-program probe reads
    'REVIEWS',        // getReviewsById
    'SKILLS',         // listSkills
  ]);
});

test('CONTROL: moving the bust BELOW the first read reddens', () => {
  // The assertion that proves the check reads ORDER and not mere presence.
  // Both fixtures contain a bust and a read; only the order differs.
  const good = [
    "import { listPrograms } from '@/lib/api/programs';",
    "import { bustUpstream, UPSTREAM_TAGS } from '@/lib/api/bustUpstream';",
    'export async function syncX() {',
    '  bustUpstream(UPSTREAM_TAGS.PROGRAMS);',
    '  const r = await listPrograms();',
    '}',
  ].join('\n');
  const bad = good
    .replace('  bustUpstream(UPSTREAM_TAGS.PROGRAMS);\n', '')
    .replace('  const r = await listPrograms();', '  const r = await listPrograms();\n  bustUpstream(UPSTREAM_TAGS.PROGRAMS);');

  const tmp = path.join(HERE, '..', '..', 'node_modules', '.cache-synccheck');
  mkdirSync(tmp, { recursive: true });
  const goodFile = path.join(tmp, 'syncGood.js');
  const badFile = path.join(tmp, 'syncBad.js');
  writeFileSync(goodFile, good, 'utf8');
  writeFileSync(badFile, bad, 'utf8');

  assert.deepEqual(syncJobsReadingUnbusted([goodFile]), []);
  assert.deepEqual(syncJobsReadingUnbusted([badFile]), ['syncBad.js']);
});

test('CONTROL: a job with NO bust at all is reported', () => {
  // The state syncNavMenuData was actually in.
  const none = [
    "import { listPrograms } from '@/lib/api/programs';",
    'export async function syncY() { return listPrograms(); }',
  ].join('\n');
  const tmp = path.join(HERE, '..', '..', 'node_modules', '.cache-synccheck');
  mkdirSync(tmp, { recursive: true });
  const f = path.join(tmp, 'syncNone.js');
  writeFileSync(f, none, 'utf8');
  assert.deepEqual(syncJobsReadingUnbusted([f]), ['syncNone.js']);
});

test('CONTROL: a bust written only in a COMMENT does not count', () => {
  // scrubSource runs first for exactly this reason — syncNavMenuData's fix is
  // a bust surrounded by fifteen lines of prose ABOUT busting, and a scan that
  // matched the prose would call every documented gap fixed.
  const commented = [
    "import { listPrograms } from '@/lib/api/programs';",
    'export async function syncZ() {',
    '  // bustUpstream(UPSTREAM_TAGS.PROGRAMS); ← should not count',
    '  return listPrograms();',
    '}',
  ].join('\n');
  const tmp = path.join(HERE, '..', '..', 'node_modules', '.cache-synccheck');
  mkdirSync(tmp, { recursive: true });
  const f = path.join(tmp, 'syncCommented.js');
  writeFileSync(f, commented, 'utf8');
  assert.deepEqual(syncJobsReadingUnbusted([f]), ['syncCommented.js']);
});

test('per-record builders produce the shapes the reads use', () => {
  assert.equal(PER_RECORD_TAG_BUILDERS['course:<id>']('MSE-L1'), 'course:MSE-L1');
  assert.equal(PER_RECORD_TAG_BUILDERS['schedules:course:<id>']('abc'), 'schedules:course:abc');
  // and the normaliser agrees with them, which is what makes the set
  // comparison above meaningful rather than a coincidence of spelling
  assert.equal(normalise('course:${courseId}'), 'course:<id>');
});
