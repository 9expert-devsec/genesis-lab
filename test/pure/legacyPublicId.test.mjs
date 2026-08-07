import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AMPERSAND_REPLACEMENT,
  LEGACY_PUBLIC_ID_PREFIX,
  SUBSTITUTION_RULE,
  TRIM_RULE,
  UNREVIEWED_INVALID_CHARS,
  assertNoUnreviewedInvalidChars,
  legacyPathToPublicId,
  needsAmpersandSubstitution,
  needsTrailingWhitespaceTrim,
  substituteAmpersands,
  trimTrailingWhitespace,
} from '@/lib/legacyPublicId';

// The migration's public_id rule. Two properties are being pinned:
//
//   1. The mapping is the IDENTITY for everything except `&` — spaces, `@`,
//      parentheses, Thai script and letter case all survive verbatim. That was
//      measured against Cloudinary (50 files uploaded, then each delivery URL
//      FETCHED and compared byte for byte), so a regression here is a
//      regression against observed behaviour, not against a guess.
//   2. `&` becomes `and`, and NOTHING else is ever substituted. The other
//      invalid characters must THROW rather than be transformed by a rule
//      nobody reviewed.
//
// The six ampersand cases below are the real filenames from the live legacy
// set, copied exactly. They are the entire population of the problem — the set
// was scanned for every character Cloudinary rejects and `&` was the only one
// present. If a seventh ever appears it is a new decision, not a new test.

/** The six real files, and the ids the ruling says they must get. */
const AMPERSAND_CASES = [
  {
    source: '/sites/default/files/articles/cover/Build & Manage AI Apps with Your Agent Factory - 3-100.jpg',
    expected: 'sites/default/files/articles/cover/Build and Manage AI Apps with Your Agent Factory - 3-100',
  },
  {
    source: '/sites/default/files/articles/cover/ปกคลิป Tricks & Talk ครั้งที่ 3 - n8n - 1-100.jpg',
    expected: 'sites/default/files/articles/cover/ปกคลิป Tricks and Talk ครั้งที่ 3 - n8n - 1-100',
  },
  {
    source: '/sites/default/files/articles/cover/Power Automate Cloud & Power Automate Desktop1300.png',
    expected: 'sites/default/files/articles/cover/Power Automate Cloud and Power Automate Desktop1300',
  },
  {
    source: '/sites/default/files/articles/images/Cover - Accounting & Finance@3x.png',
    expected: 'sites/default/files/articles/images/Cover - Accounting and Finance@3x',
  },
  {
    source: '/sites/default/files/articles/images/Cover - Data Engineering -& Business Intelligence @3x.png',
    expected: 'sites/default/files/articles/images/Cover - Data Engineering -and Business Intelligence @3x',
  },
  {
    source: '/sites/default/files/articles/images/Cover - Visual Communication & Presentation@3x.png',
    expected: 'sites/default/files/articles/images/Cover - Visual Communication and Presentation@3x',
  },
];

test('all six real ampersand filenames map to their substituted public_id', () => {
  for (const { source, expected } of AMPERSAND_CASES) {
    const got = legacyPathToPublicId(source, 'image');
    assert.equal(got.publicId, `${LEGACY_PUBLIC_ID_PREFIX}/${expected}`, source);
    assert.equal(got.substituted, true, `${source} must be flagged as substituted`);
    assert.deepEqual(got.rules, [SUBSTITUTION_RULE], source);
  }
});

test('the six substituted ids are distinct from one another', () => {
  // Substitution is only safe if it does not merge two files. This is the
  // property the pre-flight collision check enforces on the real data; pinning
  // it here means a change to the rule cannot pass tests and then collide.
  const ids = AMPERSAND_CASES.map((c) => legacyPathToPublicId(c.source, 'image').publicId);
  assert.equal(new Set(ids).size, ids.length);
});

test('IDENTITY: a path with no ampersand is unchanged and not flagged', () => {
  const source = '/sites/default/files/articles/images/foo-bar_1.png';
  const got = legacyPathToPublicId(source, 'image');
  assert.equal(got.publicId, `${LEGACY_PUBLIC_ID_PREFIX}/sites/default/files/articles/images/foo-bar_1`);
  assert.equal(got.substituted, false);
  assert.deepEqual(got.rules, []);
});

test('IDENTITY holds for the characters that are NOT substituted', () => {
  // Every one of these was uploaded and fetched back byte-identically, so the
  // correct behaviour is to leave them completely alone.
  const cases = [
    ['/sites/default/files/articles/images/Cover - Data Analyst@3x.png', 'Cover - Data Analyst@3x'],
    ['/sites/default/files/articles/cover/การควบคุมการมองเห็น (Visibility)-01.png', 'การควบคุมการมองเห็น (Visibility)-01'],
    ['/sites/default/files/articles/cover/web-service_2 (1)_0.png', 'web-service_2 (1)_0'],
    ['/sites/default/files/articles/cover/cover-article-9-mistake-in-power-bi_0.PNG', 'cover-article-9-mistake-in-power-bi_0'],
  ];
  for (const [source, tail] of cases) {
    const got = legacyPathToPublicId(source, 'image');
    assert.ok(got.publicId.endsWith(tail), `${source} → ${got.publicId}`);
    assert.equal(got.substituted, false, source);
  }
});

test('raw keeps its extension, image drops it', () => {
  const raw = legacyPathToPublicId('/files/document/case-study.xlsx', 'raw');
  assert.equal(raw.publicId, `${LEGACY_PUBLIC_ID_PREFIX}/files/document/case-study.xlsx`);
  assert.equal(raw.ext, 'xlsx');

  const img = legacyPathToPublicId('/images/web2024/loyshy.png', 'image');
  assert.equal(img.publicId, `${LEGACY_PUBLIC_ID_PREFIX}/images/web2024/loyshy`);
  assert.equal(img.ext, 'png');
});

test('substituteAmpersands replaces every occurrence, not just the first', () => {
  assert.equal(substituteAmpersands('a & b & c'), `a ${AMPERSAND_REPLACEMENT} b ${AMPERSAND_REPLACEMENT} c`);
  assert.equal(substituteAmpersands('&&'), `${AMPERSAND_REPLACEMENT}${AMPERSAND_REPLACEMENT}`);
  assert.equal(substituteAmpersands('no ampersand here'), 'no ampersand here');
});

test('needsAmpersandSubstitution detects only the ampersand', () => {
  assert.equal(needsAmpersandSubstitution('Accounting & Finance'), true);
  assert.equal(needsAmpersandSubstitution('Accounting and Finance'), false);
  assert.equal(needsAmpersandSubstitution('Data Analyst@3x'), false);
});

test('CONTROL: every other invalid character THROWS rather than being substituted', () => {
  // The whole point of the narrow rule. If this ever starts passing silently,
  // some helper has begun inventing mappings nobody reviewed.
  for (const ch of UNREVIEWED_INVALID_CHARS) {
    assert.throws(
      () => assertNoUnreviewedInvalidChars(`folder/name${ch}thing`),
      /no reviewed substitution/,
      `${ch} must throw`,
    );
    assert.throws(
      () => legacyPathToPublicId(`/sites/default/files/x/name${ch}thing.png`, 'image'),
      /no reviewed substitution/,
      `${ch} must throw through the full mapping`,
    );
  }
});

// ── RULING 2: trailing whitespace ───────────────────────────────────────────
// Cloudinary: `public_id must not end with a whitespace`. Six real files carry
// a space before the extension. INTERNAL spaces are legitimate and must not be
// touched — hundreds of migrated files depend on them surviving verbatim, and
// that was measured, so a rule that trimmed everywhere would break far more
// than it fixed.

/** The six real files whose derived id ended in whitespace. */
const TRIM_CASES = [
  {
    source: '/sites/default/files/articles/images/ใช้ความสามารถของ Azure Data Factory เพื่อทำ ETL ไปยัง Data Warehouse .png',
    expected: 'sites/default/files/articles/images/ใช้ความสามารถของ Azure Data Factory เพื่อทำ ETL ไปยัง Data Warehouse',
  },
  {
    source: '/sites/default/files/articles/images/Azure Data Factory เป็นการทำกระบวนการเพื่อทำการ .png',
    expected: 'sites/default/files/articles/images/Azure Data Factory เป็นการทำกระบวนการเพื่อทำการ',
  },
  {
    source: '/sites/default/files/articles/images/custom-prompt .png',
    expected: 'sites/default/files/articles/images/custom-prompt',
  },
  {
    source: '/sites/default/files/articles/images/ETL (Extract, Transform, Load) .png',
    expected: 'sites/default/files/articles/images/ETL (Extract, Transform, Load)',
  },
  {
    source: '/sites/default/files/articles/images/generative_ai .png',
    expected: 'sites/default/files/articles/images/generative_ai',
  },
  {
    source: '/sites/default/files/articles/images/Infographics Bento Generative AI .png',
    expected: 'sites/default/files/articles/images/Infographics Bento Generative AI',
  },
];

test('all six real trailing-whitespace filenames get a trimmed public_id', () => {
  for (const { source, expected } of TRIM_CASES) {
    const got = legacyPathToPublicId(source, 'image');
    assert.equal(got.publicId, `${LEGACY_PUBLIC_ID_PREFIX}/${expected}`, source);
    assert.equal(got.substituted, true, source);
    assert.deepEqual(got.rules, [TRIM_RULE], source);
    assert.ok(!/\s$/.test(got.publicId), `${source} → id must not end in whitespace`);
  }
});

test('the six trimmed ids are distinct from one another', () => {
  const ids = TRIM_CASES.map((c) => legacyPathToPublicId(c.source, 'image').publicId);
  assert.equal(new Set(ids).size, ids.length);
});

test('IDENTITY: internal spaces are NEVER touched', () => {
  // The rule that would have been easy to get wrong. These all round-tripped
  // byte-identically through Cloudinary with their spaces intact.
  const cases = [
    '/sites/default/files/articles/images/Cover - Data Analyst@3x.png',
    '/sites/default/files/course/cover/Build AI Multi-Agent with Claude Code.png',
    '/sites/default/files/articles/images/การ Mark as date table เพื่อกำหนด Date Dimension เพื่อทำ Time Intelligence_0.png',
  ];
  for (const source of cases) {
    const got = legacyPathToPublicId(source, 'image');
    const expectedTail = source.replace(/^\//, '').replace(/\.[^./]+$/, '');
    assert.equal(got.publicId, `${LEGACY_PUBLIC_ID_PREFIX}/${expectedTail}`, source);
    assert.equal(got.substituted, false, source);
    assert.deepEqual(got.rules, [], source);
    assert.ok(got.publicId.includes(' '), `${source} must keep its internal spaces`);
  }
});

test('trimTrailingWhitespace removes only the tail', () => {
  assert.equal(trimTrailingWhitespace('a b  '), 'a b');
  assert.equal(trimTrailingWhitespace('  a b'), '  a b');   // leading is not ours to touch
  assert.equal(trimTrailingWhitespace('a b'), 'a b');
  assert.equal(needsTrailingWhitespaceTrim('a b '), true);
  assert.equal(needsTrailingWhitespaceTrim('a b'), false);
});

test('BOTH rules compose on one path, and both are recorded', () => {
  // A scalar rule field would keep one of these and lose the other, which is
  // the entire reason the record holds an array.
  const got = legacyPathToPublicId('/sites/default/files/x/Sales & Marketing .png', 'image');
  assert.equal(got.publicId, `${LEGACY_PUBLIC_ID_PREFIX}/sites/default/files/x/Sales and Marketing`);
  assert.equal(got.substituted, true);
  assert.deepEqual(got.rules, [SUBSTITUTION_RULE, TRIM_RULE]);
});

test('CONTROL: the substitution is NOT reversible, so nothing may try', () => {
  // `Build and Manage` is an ordinary filename that was never substituted, and
  // it is indistinguishable from the substituted form of `Build & Manage`.
  // This is why the migration record carries a queryable flag instead of the
  // resolver attempting to reverse the rule.
  const original = legacyPathToPublicId('/x/Build and Manage.png', 'image');
  const substitutedForm = legacyPathToPublicId('/x/Build & Manage.png', 'image');
  assert.equal(original.publicId, substitutedForm.publicId);
  assert.equal(original.substituted, false);
  assert.equal(substitutedForm.substituted, true);
});
