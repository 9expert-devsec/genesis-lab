import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkSources, readSource, blankStringBodies, countCallSites } from '../sourceScan.mjs';

/**
 * THE BINDING RULE FOR /admin/cache, enforced.
 *
 * docs/cache-console-inventory.md §E sorts every cache surface into READABLE,
 * INFERRED and NOT OBSERVABLE. Nothing in the third group may be rendered as a
 * status, badge, dot, timestamp or health indicator — not greyed out, not
 * "unknown", ABSENT. The reasoning is that an "unknown" badge still tells the
 * reader there is a thing here whose state might one day be shown, and for
 * these there is not: Next's Data Cache and Vercel's ISR entry state are
 * write-only from application code, because `revalidatePath` and
 * `revalidateTag` both return void.
 *
 * ── WHY A SOURCE SCAN AND NOT A RENDER ASSERTION ────────────────────────────
 * The violation this is guarding against is a READ that should not exist — a
 * panel importing something to display it. A render test sees only what a given
 * fixture happens to produce; the import is the thing that is always there.
 * Both are used: the render tier checks the copy, this checks the wiring.
 *
 * Read through sourceScan so comments cannot satisfy or trip a matcher, CRLF is
 * normalised, and the import/call distinction is available — hand-rolling a
 * reader here is the defect class that module exists to end.
 */

const CONSOLE_DIR = 'src/app/admin/cache';
const CONSOLE_LIB = 'src/lib/cache-console';

const consoleFiles = () => [
  ...walkSources(CONSOLE_DIR),
  ...walkSources(CONSOLE_LIB),
];

test('the scan finds the console at all — nothing below is vacuous', () => {
  const files = consoleFiles();
  assert.ok(files.length >= 8, `${files.length} console files found`);
  assert.ok(
    files.some((f) => f.rel.endsWith('cache/page.jsx')),
    'the page itself is in the scan'
  );
});

/**
 * Reads that would produce a NOT-OBSERVABLE value.
 *
 * Each is a real API or module, not a keyword: the point is that the console
 * must not CALL these, because there is nothing truthful it could do with the
 * result. Listing them by name also documents what was considered and rejected.
 */
const FORBIDDEN_READS = [
  {
    pattern: /\bunstable_cache\b/,
    why: 'a Data Cache handle — its entry state is still not readable, and using it here would imply otherwise',
  },
  // `view: 'withImports'` on the two import bans below is LOAD-BEARING and was
  // found by a control-break getting past this guard. sourceScan's `code` has
  // import statements STRIPPED, so an import-ban read from it sees no imports
  // at all and passes vacuously — defect 5 in that module's header, which this
  // file walked straight into. Call bans stay on `code` (blanked), where an
  // import line must not be able to satisfy them.
  {
    pattern: /\bgetSearchCorpus\s*\(/,
    why: 'would BUILD the corpus in the admin instance; the act of measuring would create the thing measured, and the result would describe one instance of an unknown number',
  },
  {
    pattern: /\bresetSearchCorpusCache\s*\(/,
    why: 'a write, and one that reaches only this process — round 3 at the earliest, and even then it cannot do what its name promises',
  },
  /**
   * THE IMPORT, not just the call — added after a control-break got past the
   * call patterns. Breaking the rule by importing `getSearchCorpus` into a
   * panel reddened only the render tier, and only because that module reaches
   * db/connect which throws without MONGODB_URI. That is an accident of the
   * import graph, not a guard: move the corpus behind a lazy import and the
   * same violation would have shipped green.
   *
   * `SEARCH_CORPUS_TTL_MS` from the same module is fine and is what the page
   * actually imports — a compile-time constant, true of every instance. So the
   * ban is on the BINDINGS that read or mutate per-process state, not on the
   * module.
   */
  {
    pattern: /import\s*\{[^}]*\bgetSearchCorpus\b[^}]*\}\s*from/,
    view: 'withImports',
    why: 'importing the builder into the console is the wiring that precedes calling it; only SEARCH_CORPUS_TTL_MS may be imported from that module',
  },
  {
    pattern: /import\s*\{[^}]*\bresetSearchCorpusCache\b[^}]*\}\s*from/,
    view: 'withImports',
    why: 'same — the reset binding has no read-only use',
  },
  {
    pattern: /\brevalidatePath\s*\(/,
    why: 'a write. This console is read-only, and calling it would also imply the result says something — it returns void',
  },
  {
    pattern: /\brevalidateTag\s*\(/,
    why: 'same: a write, returning void',
  },
];

test('the console performs none of the reads that cannot yield a truthful value', () => {
  for (const f of consoleFiles()) {
    // Strings blanked: a panel may NAME revalidateTag in its explanatory copy —
    // it does, deliberately, to tell the admin why there is no status — and
    // that must not read as a call.
    const views = {
      code: blankStringBodies(f.code),
      withImports: blankStringBodies(f.withImports),
    };
    for (const { pattern, why, view = 'code' } of FORBIDDEN_READS) {
      assert.ok(
        !pattern.test(views[view]),
        `${f.rel} matches ${pattern} — ${why}`
      );
    }
  }
});

test('CONTROL: the import view really does contain imports, and `code` does not', () => {
  /**
   * The precondition every import ban rests on, asserted rather than assumed.
   * `code` has import statements stripped, so an import-ban read from it
   * passes for every file that ever existed. A control-break got past this
   * guard exactly once for this reason, which is why the check is here.
   */
  const page = consoleFiles().find((f) => f.rel.endsWith('cache/page.jsx'));
  assert.ok(page, 'the page is in the scan');
  assert.match(page.withImports, /^import /m, 'withImports keeps import lines');
  assert.ok(!/^import /m.test(page.code), 'code strips them');
});

test('CONTROL: each forbidden pattern fires on a real call, and not on prose', () => {
  // Without this, the sweep above passes for a list of regexes that match
  // nothing — the exact shape of an "absent" assertion gone decorative.
  /**
   * Paired BY MATCHING, not by index. The first version of this control keyed
   * samples to array positions and broke the moment two patterns were inserted
   * in the middle — it reported "revalidatePath does not fire" while
   * revalidatePath was fine and only the numbering had moved. An index is a
   * second thing to keep in step, and this file exists because things that must
   * be kept in step by hand do not stay in step.
   */
  const samples = [
    'const x = unstable_cache(fn);',
    'await getSearchCorpus();',
    'resetSearchCorpusCache();',
    'revalidatePath("/");',
    'revalidateTag("programs");',
    "import { getSearchCorpus } from '@/lib/search/searchCorpus';",
    "import { resetSearchCorpusCache } from '@/lib/search/searchCorpus';",
  ];

  // Every sample is caught by at least one pattern.
  for (const snippet of samples) {
    assert.ok(
      FORBIDDEN_READS.some(({ pattern }) => pattern.test(snippet)),
      `nothing catches: ${snippet}`
    );
  }
  // And every pattern catches at least one sample — so a regex that can never
  // match anything cannot sit in the list looking like protection.
  for (const { pattern, why } of FORBIDDEN_READS) {
    assert.ok(
      samples.some((s) => pattern.test(s)),
      `${pattern} fires on no sample — it is decorative (${why})`
    );
  }

  // The prose case: naming the API inside a string must NOT fire, because the
  // panels deliberately name these APIs in their explanatory copy.
  const prose = blankStringBodies("const copy = 'revalidateTag returns void';");
  assert.ok(
    !FORBIDDEN_READS.some(({ pattern }) => pattern.test(prose)),
    'a mention inside a string is not a call'
  );

  // The permitted import must NOT be caught — otherwise the page's own TTL
  // import is a false positive and the bans get reverted rather than tightened.
  const allowed = "import { SEARCH_CORPUS_TTL_MS } from '@/lib/search/searchCorpus';";
  assert.ok(
    !FORBIDDEN_READS.some(({ pattern }) => pattern.test(allowed)),
    'SEARCH_CORPUS_TTL_MS is a compile-time constant and stays allowed'
  );
});

test('the console names the NOT-OBSERVABLE limitation in visible copy', () => {
  /**
   * The rule has two halves and only one is an absence. Where leaving a value
   * out would make a panel look empty, the panel must say WHY in words — an
   * empty panel and a healthy one look identical, and the empty reading is the
   * reassuring one.
   *
   * Asserted on the page's own text (strings NOT blanked here — the copy IS the
   * subject), so deleting the explanation to tidy the layout goes red.
   */
  const { code } = readSource('src/app/admin/cache/page.jsx');
  assert.match(code, /Data Cache/, 'the page names what it cannot read');
  assert.match(code, /ISR/);
  assert.match(code, /void/, 'and why: the APIs return nothing');
});

test('no panel renders a freshness verdict for a served page', () => {
  /**
   * The specific forbidden claim, in the words it would most likely be written
   * in. `syncedAt` is INFERRED and may be shown WITH its caveat; "this page is
   * fresh / stale / up to date" is a claim about ISR entry state and may not be
   * shown at all.
   *
   * Matched against blanked strings would defeat the purpose — the violation
   * here IS a string, a label rendered to the admin. So this reads raw text and
   * accepts that it also sees comments; a comment claiming a page is fresh is
   * worth catching too.
   */
  const BANNED_CLAIMS = [/\bpage is (fresh|stale)\b/i, /\bcache hit\b/i, /\bserving from cache\b/i];
  for (const f of consoleFiles()) {
    for (const claim of BANNED_CLAIMS) {
      assert.ok(!claim.test(f.raw), `${f.rel} claims ${claim}`);
    }
  }
});

test('CONTROL: those claim patterns fire on the text they are meant to catch', () => {
  assert.ok(/\bpage is (fresh|stale)\b/i.test('This page is fresh'));
  assert.ok(/\bcache hit\b/i.test('Cache hit'));
  assert.ok(/\bserving from cache\b/i.test('currently serving from cache'));
});

test('the sync button is the ONLY write the console can perform', () => {
  /**
   * Round 2 is read-only apart from the ported "Sync now". Any other mutating
   * fetch would be round-3 scope landing early and unreviewed, so the count is
   * pinned rather than the absence of a keyword: one POST, to one endpoint.
   */
  const posts = [];
  for (const f of consoleFiles()) {
    for (const m of f.code.matchAll(/method:\s*'(POST|PUT|PATCH|DELETE)'/g)) {
      posts.push(`${f.rel}: ${m[1]}`);
    }
  }
  assert.deepEqual(posts, [
    "src/app/admin/cache/_components/LandingSyncButton.jsx: POST",
  ]);
});

test('the ported sync button still points at the endpoint it was ported from', () => {
  // Ported UNCHANGED is the claim; this is the part of it that can be checked.
  const { code } = readSource('src/app/admin/cache/_components/LandingSyncButton.jsx');
  assert.match(code, /'\/api\/admin\/landing\/sync'/);
  assert.equal(countCallSites(code, 'fetch'), 1, 'exactly one request');
});

test('/admin/landing-cache guards BEFORE it redirects', () => {
  /**
   * Order matters and is invisible at runtime if wrong: reversed, the old URL
   * would bounce a signed-out visitor to /admin/cache and let that page refuse,
   * turning a clean 403 into a redirect chain that leaks the console's
   * existence to someone who cannot open it.
   */
  const { code } = readSource('src/app/admin/landing-cache/page.jsx');
  const guardAt = code.indexOf('requirePage(');
  const redirectAt = code.indexOf('redirect(');
  assert.ok(guardAt > -1, 'it still guards');
  assert.ok(redirectAt > -1, 'it still redirects');
  assert.ok(guardAt < redirectAt, 'the guard comes first');
  assert.match(code, /redirect\('\/admin\/cache'\)/);
});

test('the console and the redirect guard on the SAME permission key', () => {
  // A new key would silently revoke the screen from every role granted the old
  // one. Both files must name the key that Role.pages already holds.
  for (const rel of ['src/app/admin/cache/page.jsx', 'src/app/admin/landing-cache/page.jsx']) {
    assert.match(readSource(rel).code, /requirePage\('landing_cache'\)/, rel);
  }
});
