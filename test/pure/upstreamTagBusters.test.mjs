import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
// 4. It cannot see whether a buster is called at the right TIME. Busting after
//    a sync has already read is the defect this whole effort started from, and
//    it is invisible here — ordering is asserted by reading the sync libs, not
//    by this test.

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

test('per-record builders produce the shapes the reads use', () => {
  assert.equal(PER_RECORD_TAG_BUILDERS['course:<id>']('MSE-L1'), 'course:MSE-L1');
  assert.equal(PER_RECORD_TAG_BUILDERS['schedules:course:<id>']('abc'), 'schedules:course:abc');
  // and the normaliser agrees with them, which is what makes the set
  // comparison above meaningful rather than a coincidence of spelling
  assert.equal(normalise('course:${courseId}'), 'course:<id>');
});
