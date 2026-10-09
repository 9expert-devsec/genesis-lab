import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeRegex, searchTermPattern, MAX_SEARCH_TERM } from '@/lib/searchTerm';

/**
 * The escape helper, and the property that actually matters about it.
 *
 * ── THE BUG ────────────────────────────────────────────────────────────────
 * `/articles?q=(` returned HTTP 500 and the เกิดข้อผิดพลาด page, because
 * `{ $regex: '(' }` compiles `(` as a pattern and an unterminated group throws
 * while the query is being built.
 *
 * ── THE ASSERTION THAT IS NOT A TAUTOLOGY ──────────────────────────────────
 * Checking that `(` becomes `\(` only restates the implementation. The claim
 * worth pinning is: **the escaped term COMPILES, and it matches the literal
 * characters the user typed and nothing else.** So every case below compiles a
 * real `RegExp` from the output and tests it against real strings — which is
 * what both consumers do (`new RegExp(term, 'i')` in
 * lib/articleViews/queries.js; `{ $regex: term }`, which Mongo compiles the
 * same way).
 *
 * `$regex` is PCRE-ish and `RegExp` is ECMAScript, and they do not agree on
 * everything — but they agree completely on the metacharacters escaped here,
 * and a `RegExp` is the strictest of the two about an unterminated group. A
 * pattern that compiles and matches literally in V8 is one `$regex` accepts.
 */

/** Does the escaped term compile, and match `haystack` as a literal substring? */
function matchesLiterally(term, haystack) {
  const re = new RegExp(searchTermPattern(term), 'i');  // throws if not escaped
  return re.test(haystack);
}

// ── 1. EVERY METACHARACTER, ONE AT A TIME ──────────────────────────────────

const METACHARACTERS = ['(', ')', '[', ']', '*', '+', '?', '.', '^', '$', '|', '{', '}', '\\', '/'];

test('each metacharacter alone COMPILES and matches itself', () => {
  for (const ch of METACHARACTERS) {
    assert.doesNotThrow(
      () => new RegExp(searchTermPattern(ch)),
      `?q=${ch} still produces an uncompilable pattern`,
    );
    assert.equal(matchesLiterally(ch, `a${ch}b`), true, `${ch} does not match itself`);
  }
});

test('the reported query — a bare "(" — no longer throws', () => {
  // This is the production URL, reduced: /articles?q=%28
  assert.doesNotThrow(() => new RegExp(searchTermPattern('(')));
  assert.equal(searchTermPattern('('), '\\(');
});

test('CONTROL: the UNESCAPED term does throw, for the same inputs', () => {
  /**
   * Without this, every assertion above could be true of a helper that does
   * nothing.
   *
   * The list is the SEVEN that actually throw when compiled alone — measured
   * against this Node, not reasoned from the grammar, because the grammar's
   * answer is counter-intuitive: `{`, `}`, `]`, `.`, `^`, `$`, `|`, `/` and `-`
   * all compile raw (Annex B tolerates a lone brace and an unmatched `]`), so
   * listing them here would have made this control fail for a reason that has
   * nothing to do with the fix. They are not harmless — they either match the
   * WRONG thing silently (the next test's job) or throw in a combination a
   * visitor can type (the braces, below).
   */
  for (const ch of ['(', ')', '[', '*', '+', '?', '\\']) {
    assert.throws(() => new RegExp(ch), SyntaxError, `${ch} compiles raw — not a real control`);
  }
  // `{` and `}` compile alone, but a brace a visitor types in a real query
  // reaches the quantifier grammar and throws there. Both measured.
  for (const raw of ['{2}', 'a{2,1}']) {
    assert.throws(() => new RegExp(raw), SyntaxError, `${raw} compiles raw`);
    assert.doesNotThrow(() => new RegExp(searchTermPattern(raw)), `?q=${raw} still throws`);
  }
});

test('CONTROL: an unescaped term matches things the user did not ask for', () => {
  // The quiet half of the bug: `.` is a valid pattern, so no error — just wrong
  // results on every screen that searches.
  assert.equal(new RegExp('a.c', 'i').test('abc'), true, 'raw `a.c` matches `abc`');
  assert.equal(matchesLiterally('a.c', 'abc'), false, 'escaped `a.c` must NOT match `abc`');
  assert.equal(matchesLiterally('a.c', 'xa.cy'), true, 'but it does match a literal `a.c`');
});

// ── 2. COMBINATIONS, AND THE SHAPES THAT ACTUALLY GET TYPED ────────────────

test('all the metacharacters at once still compile and match literally', () => {
  const all = METACHARACTERS.join('');
  assert.doesNotThrow(() => new RegExp(searchTermPattern(all)));
  assert.equal(matchesLiterally(all, `xx${all}yy`), true);
});

test('real queries with punctuation behave', () => {
  const cases = [
    ['Excel (Advanced)', 'หลักสูตร Excel (Advanced) รุ่น 3', true],
    ['Excel (Advanced)', 'Excel Advanced', false],   // the brackets are required now
    ['a+b@9expert.co.th', 'ส่งไปที่ a+b@9expert.co.th แล้ว', true],
    ['a+b@9expert.co.th', 'aab@9expert.co.th', false],
    ['C++', 'เรียน C++ เบื้องต้น', true],
    ['50%?', 'ลด 50%? จริงไหม', true],
    ['/articles/dax', 'ไปที่ /articles/dax ได้เลย', true],
    ['$100', 'ราคา $100', true],
    ['[DRAFT]', 'ชื่อเรื่อง [DRAFT] ห้ามเผยแพร่', true],
    // `-` is NOT escaped (see escapeRegex's header for why it came back out),
    // and it does not need to be: outside a character class it is already a
    // literal, so a hyphenated course code behaves and `a-z` is not a range.
    ['ZZTEST-EXCEL-01', 'รหัส ZZTEST-EXCEL-01', true],
    ['a-z', 'ช่วง a-z', true],
    ['a-z', 'ตัวอักษร m', false],
  ];
  for (const [term, haystack, expected] of cases) {
    assert.equal(
      matchesLiterally(term, haystack), expected,
      `${JSON.stringify(term)} vs ${JSON.stringify(haystack)}`,
    );
  }
});

// ── 3. THAI, WHICH IS WHAT THE SITE IS ACTUALLY SEARCHED IN ────────────────

test('ORDINARY text passes through byte-identically', () => {
  /**
   * The property that keeps every existing `$regex` string the same, and the
   * reason `-` is not in the escape class: a hyphenated code, a slug and a
   * date are the most common things typed into these boxes, and churning the
   * emitted query for them buys no safety at all.
   */
  for (const term of ['Excel', 'Power BI', 'ZZTEST-EXCEL-01', 'power-bi-desktop', '2026-10-09']) {
    assert.equal(escapeRegex(term), term, `${term} was altered`);
    assert.equal(searchTermPattern(term), term);
  }
});

test('Thai text passes through UNCHANGED, byte for byte', () => {
  /**
   * The matching rule this repo relies on is substring, precisely because Thai
   * has no word boundaries (see lib/search/matchSearch.js's header). So an
   * escape pass that touched a Thai codepoint — or that was applied somewhere
   * that then anchored or tokenised — would break the majority of real
   * searches. No Thai codepoint is a regex metacharacter, and the identity is
   * asserted rather than assumed.
   */
  for (const term of [
    'วิเคราะห์ข้อมูล',
    'สูตร VLOOKUP',
    'เกิดข้อผิดพลาด',
    'ดึงราคาสินค้า Power BI',
    'ปฏิทิน',                                   // combining vowels + tone marks
  ]) {
    assert.equal(escapeRegex(term), term, `${term} was altered`);
    assert.equal(searchTermPattern(term), term);
  }
});

test('a Thai term still matches MID-WORD, which is the whole point', () => {
  assert.equal(
    matchesLiterally('วิเคราะห์', 'การวิเคราะห์ข้อมูลด้วย Power BI'), true,
    'the substring rule broke — this is the case Thai search depends on',
  );
});

test('Thai mixed with punctuation keeps both halves', () => {
  assert.equal(matchesLiterally('ตอนที่ 1 (ต่อ)', 'บทความ ตอนที่ 1 (ต่อ) ครับ'), true);
});

// ── 4. CASE, TRIMMING AND EMPTINESS ───────────────────────────────────────

test('case is NOT folded by the helper — the call sites own that', () => {
  /**
   * Every consumer passes `$options: 'i'` or the `i` flag. Lower-casing here
   * would be a second, invisible place deciding case, and would break the one
   * site that is anchored and case-insensitive on the STORED side
   * (`findCourseExtensionCodeInsensitive`, which returns the stored spelling).
   */
  assert.equal(searchTermPattern('Excel'), 'Excel');
  assert.equal(matchesLiterally('excel', 'เรียน Excel'), true, 'the `i` flag still does the work');
});

test('surrounding whitespace is trimmed', () => {
  assert.equal(searchTermPattern('  Power BI  '), 'Power BI');
  // Inner whitespace is content, not padding.
  assert.equal(searchTermPattern('Power  BI'), 'Power  BI');
});

test('an empty or whitespace-only term yields "" so the clause can be SKIPPED', () => {
  /**
   * This is what makes a no-op search render the normal list instead of
   * `{ $regex: '' }`, which matches every document. Every call site tests the
   * return value before building its clause.
   */
  for (const raw of ['', '   ', '\t\n', null, undefined]) {
    assert.equal(searchTermPattern(raw), '', `${JSON.stringify(raw)} produced a pattern`);
  }
});

test('a non-string is coerced rather than thrown on', () => {
  // searchParams can hand over an array when a param repeats (`?q=a&q=b`).
  assert.doesNotThrow(() => searchTermPattern(['a', 'b']));
  assert.doesNotThrow(() => searchTermPattern(7));
  assert.equal(searchTermPattern(7), '7');
});

// ── 5. THE LENGTH CAP ─────────────────────────────────────────────────────

test('the cap is 200 and it clears the longest stored title', () => {
  /**
   * Measured over the real collections: article.title max 96, article.slug max
   * 86, custom_page.title max 47. A cap below ~100 would stop an admin pasting
   * a whole title; 200 clears every one with room to spare.
   */
  assert.equal(MAX_SEARCH_TERM, 200);
  assert.ok(MAX_SEARCH_TERM > 96, 'the longest article title must still be pasteable in full');
});

test('an over-long term is TRUNCATED, not refused', () => {
  const long = 'ก'.repeat(5000);
  const out = searchTermPattern(long);
  assert.equal(out.length, MAX_SEARCH_TERM);
  assert.doesNotThrow(() => new RegExp(out));
  // And it still finds what the user was looking for.
  assert.equal(matchesLiterally(long, 'ก'.repeat(5000)), true);
});

test('the cap counts TYPED characters, not escape backslashes', () => {
  /**
   * Truncation before escaping is what makes the limit mean one thing. Escaping
   * first and then cutting at 200 would admit only 100 brackets while admitting
   * 200 letters — and, worse, could cut between a backslash and the character
   * it escapes, leaving a trailing lone `\`: an invalid pattern, i.e. the
   * original bug reintroduced by the fix for it.
   */
  const brackets = '('.repeat(5000);
  const out = searchTermPattern(brackets);
  assert.doesNotThrow(() => new RegExp(out), 'the cut landed mid-escape');
  assert.equal(out, '\\('.repeat(MAX_SEARCH_TERM), '200 typed characters, each escaped');
  assert.equal(out.length, MAX_SEARCH_TERM * 2);
  assert.doesNotMatch(out, /(^|[^\\])\\$/, 'a dangling backslash survived');
});

test('a term of exactly the cap length is untouched', () => {
  const exact = 'a'.repeat(MAX_SEARCH_TERM);
  assert.equal(searchTermPattern(exact), exact);
});

test('escapeRegex itself does NOT cap — the two exports are different jobs', () => {
  /**
   * The highlighter in SearchClient and the token test in seoTitleCleanup use
   * `escapeRegex` precisely because a cap would be wrong for them: one must mark
   * the whole of an already-found match, the other tests a single word out of a
   * stored title.
   */
  const long = 'a'.repeat(5000);
  assert.equal(escapeRegex(long).length, 5000);
});
