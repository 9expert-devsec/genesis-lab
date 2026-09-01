import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  plainBulletsToHtml,
  htmlToProjection,
  clampDepth,
  projectionEquals,
  DEPTH_PREFIXES,
  MAX_TOPIC_DEPTH,
} from '@/lib/courses/topicHtml';

/**
 * The pure conversion core for rich `training_topics` bullets.
 *
 * ── WHAT THIS TIER GUARDS ───────────────────────────────────────────────────
 * Two string transforms and one comparison. Nothing here renders, saves, or
 * talks to MSDB — this round builds the core only, and the wiring is a later
 * one. What it CAN establish is the property the whole split-store rests on:
 * that turning the editor on changes nothing for a course nobody has edited.
 *
 * ── FIXTURES ARE REAL ROWS IN THE API'S SHAPE, NOT HAND-SHAPED INPUTS ───────
 * Every fixture below is `{ course_id, training_topics: [{ title, bullets }] }`
 * — the exact shape GET /api/ai/public-course returns and the exact shape
 * src/app/admin/courses/[courseId]/edit/page.jsx seeds the form from. Values
 * were copied from the live API on 2026-08-26, not invented.
 *
 * That is not decoration. A fixture written already in the TARGET shape means
 * the function under test never runs on anything it would actually meet, and
 * this suite has shipped that defect before. Each test starts by reaching into
 * `training_topics[n].bullets` so the conversion is fed what the API gives.
 *
 * ── WHY THE ASSERTIONS ARE WHOLE-STRING EQUALITIES ──────────────────────────
 * Never a bare Thai substring. Thai negates by PREFIX (ไม่-, and the negation
 * can sit several tokens ahead of the word being negated), so
 * `assert.ok(s.includes('<some Thai word>'))` is satisfied by a string that
 * says the opposite of what the test claims to check. Deep-equal on the full
 * array is not merely stricter, it is the only form that cannot be fooled here.
 */

// ── FIXTURES: verbatim rows from GET /api/ai/public-course, 2026-08-26 ──────

/**
 * UIPATH. The row that decides whether escaping is optional.
 *
 * `List<mailmessage>` is a C# generic type — the only angle bracket in 4,443
 * measured values across 79 courses, and it is NOT markup. Unescaped into an
 * editor, the browser parses `<mailmessage>` as an unknown element and the text
 * between the brackets DISAPPEARS from what the admin sees, so the next save
 * writes back a bullet with a hole in it.
 *
 * The first bullet also carries a leading U+200B, which is why this one row
 * serves as both the escaping fixture and the zero-width fixture.
 */
const UIPATH = {
  course_id: 'UIPATH',
  training_topics: [
    {
      title: 'การทำงานกับ Outlook',
      bullets: [
        '​การอ่าน email จาก outlook',
        'อธิบายความสามารถของ List<mailmessage> ที่ได้จากการอ่าน email',
        'กรณีศึกษา: คัดกรอง email ที่มี invoice เป็นไฟล์ attachment เพื่อทำการ download ไฟล์เหล่านั้นลงเครื่อง และจัดการย้าย email เหล่านั้นไปเก็บใน Folder ที่เตรียมไว้ เพื่อป้องกันการอ่าน email ซ้ำ',
      ],
    },
  ],
};

/**
 * EXCEL-HR-02. Its three TITLES are hand-numbered upstream — "1. ", "2. ", "3. ".
 *
 * The public page prints its own ordinal (`{i + 1}. {title}`,
 * CourseOutline.jsx:70), so this course already renders "1. 1. เตรียมข้อมูล…"
 * on the live site. That is a PRE-EXISTING data defect, measured in U5, and it
 * is a fixture here for one reason: to pin that this round does not touch
 * titles. The decision is that the row title stays plain and MSDB-owned; only
 * bullets become rich. A conversion that started reformatting titles would make
 * this row worse, and this fixture is what would say so.
 */
const EXCEL_HR_02 = {
  course_id: 'EXCEL-HR-02',
  training_topics: [
    {
      title: '1. เตรียมข้อมูลให้พร้อมทำ Dashboard',
      bullets: [
        'โครงสร้างตารางที่ถูกต้อง / แปลงข้อมูลเป็น Table และตั้งชื่อช่วง / ทำความสะอาดข้อมูลด้วย Power Query เบื้องต้น',
      ],
    },
    { title: '2. สรุปข้อมูลด้วย PivotTable', bullets: [] },
    { title: '3. ประกอบร่างเป็น Dashboard', bullets: [] },
  ],
};

/** GOO-ADK. A bullet whose only oddity is a leading U+200B ZERO WIDTH SPACE. */
const GOO_ADK = {
  course_id: 'GOO-ADK',
  training_topics: [
    {
      title: 'Agentic AI VS Traditional AI',
      bullets: [
        '​เรียนรู้เกี่ยวกับความแตกต่างระหว่าง AI แบบดั้งเติม (Traditional AI) และ AI ที่มีความสามารถในการดำเนินการได้เอง (Agentic AI)',
      ],
    },
  ],
};

/** A seven-level paste — one past MAX_TOPIC_DEPTH, so clampDepth must lift it. */
const SEVEN_DEEP =
  '<ul><li>L1<ul><li>L2<ul><li>L3<ul><li>L4<ul><li>L5<ul><li>L6<ul><li>L7</li></ul></li></ul></li></ul></li></ul></li></ul></li></ul></li></ul>';

/** An <li> whose entire content is a nested list: it holds no text of its own. */
const HOLDER_ONLY = '<ul><li><ul><li>child</li></ul></li></ul>';

const bulletsOf = (row, i = 0) => row.training_topics[i].bullets;

// ── the seed direction: flat MSDB bullets → editor HTML ─────────────────────

test('the seed ESCAPES: List<mailmessage> survives as text, not as an element', () => {
  const html = plainBulletsToHtml(bulletsOf(UIPATH));
  assert.ok(
    html.includes('List&lt;mailmessage&gt;'),
    'the C# generic went into the editor unescaped — a browser reads '
    + '<mailmessage> as an unknown element and the text vanishes at author time',
  );
  assert.ok(
    !html.includes('List<mailmessage>'),
    'the raw angle brackets are still present in the emitted HTML',
  );
});

test('CONTROL: that fixture genuinely carries a bracket the escape has to catch', () => {
  // Without this, the assertion above could pass against a fixture with no
  // angle bracket in it at all — the escape would never run and the test would
  // be green for the wrong reason.
  assert.ok(
    bulletsOf(UIPATH).some((b) => b.includes('<') && b.includes('>')),
    'the UIPATH fixture no longer contains the angle brackets it exists for',
  );
});

test('the seed produces one flat <ul>, one <li> per stored bullet', () => {
  const html = plainBulletsToHtml(bulletsOf(UIPATH));
  assert.equal((html.match(/<ul>/g) || []).length, 1, 'expected exactly one list');
  assert.equal((html.match(/<li>/g) || []).length, 3, 'expected one <li> per bullet');
  assert.ok(!/<ul>[\s\S]*<ul>/.test(html), 'the seed must not nest');
});

test('a row with no bullets seeds NOTHING, not an empty list', () => {
  // 125 rows across 27 courses legitimately have no bullets. An empty <ul>
  // on every one of them would be markup created by opening a form.
  assert.equal(plainBulletsToHtml(bulletsOf(EXCEL_HR_02, 1)), '');
  assert.equal(plainBulletsToHtml([]), '');
  assert.equal(plainBulletsToHtml(undefined), '');
});

test('CONTROL: the bullet-less fixture rows really are bullet-less', () => {
  assert.deepEqual(bulletsOf(EXCEL_HR_02, 1), []);
  assert.deepEqual(bulletsOf(EXCEL_HR_02, 2), []);
});

// ── the flatten direction: editor HTML → the plain array MSDB stores ────────

test('flatten prefixes by level, six deep: none, then en-dash repeated', () => {
  assert.deepEqual(
    htmlToProjection(
      '<ul><li>a<ul><li>b<ul><li>c<ul><li>d<ul><li>e<ul><li>f</li></ul></li></ul></li></ul></li></ul></li></ul></li></ul>',
    ),
    ['a', '– b', '– – c', '– – – d', '– – – – e', '– – – – – f'],
  );
});

test('the prefixes are en dashes (U+2013), not hyphen-minus', () => {
  // A leading "- " is one of the marker glyphs the public page draws itself
  // (bulletLines.js) — storing one produces "• - item" on the page.
  assert.deepEqual(DEPTH_PREFIXES, ['', '– ', '– – ', '– – – ', '– – – – ', '– – – – – ']);
  assert.ok(!DEPTH_PREFIXES.join('').includes('-'), 'a hyphen-minus got into the prefix table');
});

test('DEPTH_PREFIXES has exactly MAX_TOPIC_DEPTH entries, every one distinct', () => {
  // The two must move together — see topicHtml.js's own comment on the table.
  // A level past the table's end silently reuses the LAST entry's text, which
  // is exactly the "depth information lost in the comparison" resolveTopicRich
  // depends on this table not doing within the cap.
  assert.equal(DEPTH_PREFIXES.length, MAX_TOPIC_DEPTH,
    'DEPTH_PREFIXES did not move with MAX_TOPIC_DEPTH');
  assert.equal(new Set(DEPTH_PREFIXES).size, DEPTH_PREFIXES.length,
    'two levels share one prefix — they would flatten to indistinguishable text');
});

test('inline marks are stripped to their text and entities are decoded', () => {
  assert.deepEqual(
    htmlToProjection('<ul><li><strong>bo</strong>ld &amp; <em>it</em></li></ul>'),
    ['bold & it'],
  );
});

test('a newline or tab flattens to ONE space, and <br> becomes a space', () => {
  // These are the only whitespace characters the flatten normalises, because
  // they are the only ones a single-line plain-text field cannot carry.
  const NL = String.fromCharCode(10);
  const TAB = String.fromCharCode(9);
  assert.deepEqual(htmlToProjection(`<ul><li>a${NL}${TAB}b</li></ul>`), ['a b']);
  assert.deepEqual(htmlToProjection(`<ul><li>  ${NL} a </li></ul>`), ['a']);
  assert.deepEqual(htmlToProjection('<ul><li>a<br>b</li></ul>'), ['a b']);
});

/**
 * THE THREE CHARACTER CLASSES THAT MUST SURVIVE UNTOUCHED.
 *
 * Measured across all 4,443 live titles and bullets: 41 values carry runs of
 * two or more plain spaces, 35 carry U+00A0, and 14 bullets lead with U+200B.
 * A `s+` collapse — the obvious rule, and the one this module had in its
 * first draft — would have rewritten 60 stored values the first time an admin
 * opened and saved one of those courses. Invisible on the page, because HTML
 * collapses whitespace at render either way, and therefore invisible in review.
 */
for (const [name, value] of [
  ['a run of plain spaces', 'GPT Models  GPT-o1'],
  [`U+00A0 NO-BREAK SPACE`, `a${String.fromCharCode(160)}b`],
  [`U+200B ZERO WIDTH SPACE`, `${String.fromCharCode(8203)}เรียนรู้`],
]) {
  test(`${name} is PRESERVED — this round formats, it does not clean data`, () => {
    assert.deepEqual(htmlToProjection(plainBulletsToHtml([value])), [value]);
  });
}

test('CONTROL: a bare \\s+ collapse WOULD have rewritten those values', () => {
  // Proves the three tests above assert a decision rather than a coincidence:
  // the rejected rule genuinely changes two of them, and the shipped rule
  // changes none.
  const naive = (s) => s.replace(/\s+/g, ' ').trim();
  const NBSP = String.fromCharCode(160);
  const ZWSP = String.fromCharCode(8203);

  assert.notEqual(naive('GPT Models  GPT-o1'), 'GPT Models  GPT-o1');
  assert.notEqual(naive(`a${NBSP}b`), `a${NBSP}b`);

  // U+200B is the exception even under the naive rule — \s never matched it
  // (the class covers U+2000-U+200A; 200B sits outside). Preserving it was
  // accidental before and is a decision now, and saying so is the point.
  assert.equal(naive(`${ZWSP}เรียนรู้`), `${ZWSP}เรียนรู้`);

  // And the shipped rule leaves all three alone.
  for (const v of [`GPT Models  GPT-o1`, `a${NBSP}b`, `${ZWSP}เรียนรู้`]) {
    assert.deepEqual(htmlToProjection(plainBulletsToHtml([v])), [v]);
  }
});

test('U+200B survives on the REAL GOO-ADK bullet, not just a synthetic one', () => {
  const [only] = bulletsOf(GOO_ADK);
  const out = htmlToProjection(plainBulletsToHtml([only]));
  assert.deepEqual(out, [only]);
  assert.ok(out[0].startsWith('​'), 'the zero-width space was silently stripped');
});

test('an <li> holding ONLY a nested list contributes no entry; its children do', () => {
  assert.deepEqual(htmlToProjection(HOLDER_ONLY), ['– child']);
});

test('CONTROL: the holder fixture really has an empty holder <li>', () => {
  // Proves the case above is exercised: strip the nested list and the holder
  // contributes nothing at all, which is what "no entry of its own" means.
  assert.deepEqual(htmlToProjection('<ul><li></li></ul>'), []);
});

test('empty and whitespace-only entries are dropped', () => {
  assert.deepEqual(htmlToProjection('<ul><li>a</li><li>   </li><li></li><li>b</li></ul>'), ['a', 'b']);
});

test('empty input yields an empty array, never a throw', () => {
  for (const v of ['', null, undefined, '   ']) assert.deepEqual(htmlToProjection(v), []);
});

// ── THE ROUND-TRIP PROPERTY ────────────────────────────────────────────────

/**
 * THE GUARANTEE THE WHOLE ROUND EXISTS TO EARN.
 *
 * For flat, markup-free bullets — which is every one of the 3,614 values
 * measured across 79 courses — seeding the editor and flattening it back must
 * return the SAME ARRAY. If it does not, then merely opening and saving a
 * course that nobody meant to edit rewrites its outline.
 */
for (const row of [UIPATH, EXCEL_HR_02, GOO_ADK]) {
  for (let i = 0; i < row.training_topics.length; i += 1) {
    const bullets = bulletsOf(row, i);
    if (bullets.length === 0) continue;
    test(`round trip is lossless for ${row.course_id} row ${i}`, () => {
      assert.deepEqual(htmlToProjection(plainBulletsToHtml(bullets)), bullets);
    });
  }
}

test('round trip is lossless across a sweep of markup-free shapes', () => {
  const cases = [
    ['a'],
    ['a', 'b', 'c'],
    ['List<mailmessage>', 'a & b', '"quoted"', "it's"],
    ['​zero width', 'em – dash', 'arrow → there'],
    ['Professional AI‑Driven Development Workflow'],
    ['1. เตรียมข้อมูลให้พร้อมทำ Dashboard'],
    ['a'.repeat(562)],
    ['GPT Models  GPT-o1', 'run  of  doubles'],
    [`a${String.fromCharCode(160)}nbsp`],
  ];
  for (const input of cases) {
    assert.deepEqual(
      htmlToProjection(plainBulletsToHtml(input)),
      input,
      `round trip lost data for ${JSON.stringify(input)}`,
    );
  }
});

test('CONTROL: the round trip is NOT vacuous — it can and does fail', () => {
  /**
   * The property has a precondition, and this names it rather than letting the
   * passes above imply there is none. A value carrying a NEWLINE or a TAB does
   * not survive, by design: those are what the flatten normalises, and a
   * single-line plain-text field cannot hold them.
   *
   * The precondition costs nothing on real data — ZERO of the 4,443 live values
   * contain either character — which is precisely why the flatten was narrowed
   * to only these. An earlier draft collapsed all `\s+` and this control passed
   * on `['a  b']`; that version would have rewritten 60 stored values, and the
   * fact that a green control sat on top of it is the reason the rule was
   * measured against the corpus instead of reasoned about.
   */
  for (const notStable of [['a\nb'], ['a\tb'], ['  padded  ']]) {
    assert.notDeepEqual(htmlToProjection(plainBulletsToHtml(notStable)), notStable);
  }
  assert.deepEqual(htmlToProjection(plainBulletsToHtml(['a\nb'])), ['a b']);

  // And the half that would have been wrong: a double space now SURVIVES.
  assert.deepEqual(htmlToProjection(plainBulletsToHtml(['a  b'])), ['a  b']);
});

// ── the title is NOT part of this ──────────────────────────────────────────

test('the conversion never touches a row title — EXCEL-HR-02 keeps its "1. "', () => {
  // The decision is that titles stay plain and MSDB-owned. Nothing in this
  // module takes a title, and this pins that the hand-numbered strings that
  // already render "1. 1. …" on the public page are not made worse here.
  for (const t of EXCEL_HR_02.training_topics) {
    const before = t.title;
    plainBulletsToHtml(t.bullets);
    htmlToProjection(plainBulletsToHtml(t.bullets));
    assert.equal(t.title, before);
  }
  assert.deepEqual(
    EXCEL_HR_02.training_topics.map((t) => t.title),
    [
      '1. เตรียมข้อมูลให้พร้อมทำ Dashboard',
      '2. สรุปข้อมูลด้วย PivotTable',
      '3. ประกอบร่างเป็น Dashboard',
    ],
  );
});

// ── clampDepth: LIFT, never DROP ───────────────────────────────────────────

test('a 7-level paste is LIFTED to 6 levels and every line survives', () => {
  const clamped = clampDepth(SEVEN_DEEP);
  assert.deepEqual(
    htmlToProjection(clamped),
    ['L1', '– L2', '– – L3', '– – – L4', '– – – – L5', '– – – – – L6', '– – – – – L7'],
    'L7 must arrive beside L6, not be deleted',
  );
});

test('CONTROL: the fixture really is 7 deep, and 7 deep really is over the cap', () => {
  // Without this the test above could be clamping something that was already
  // legal, which would pass while proving nothing.
  assert.equal(MAX_TOPIC_DEPTH, 6);
  assert.deepEqual(
    htmlToProjection(SEVEN_DEEP),
    ['L1', '– L2', '– – L3', '– – – L4', '– – – – L5', '– – – – – L6', '– – – – – L7'],
    'unclamped, the 7th level is already prefix-clamped by htmlToProjection — '
    + 'so the depth difference must be observed in the HTML, below',
  );
  const sevenListsDeep = /<ul>[\s\S]*<ul>[\s\S]*<ul>[\s\S]*<ul>[\s\S]*<ul>[\s\S]*<ul>[\s\S]*<ul>/;
  assert.ok(sevenListsDeep.test(SEVEN_DEEP), 'fixture is not 7 lists deep');
  assert.ok(
    !sevenListsDeep.test(clampDepth(SEVEN_DEEP)),
    'clampDepth left a 7th list in place',
  );
});

test('no text is lost at any depth, however deep the paste', () => {
  // Nine levels — three past the new cap of 6 — so this still exercises real
  // lifting rather than becoming a no-op now that 6 itself is legal.
  const nine =
    '<ul><li>1<ul><li>2<ul><li>3<ul><li>4<ul><li>5<ul><li>6<ul><li>7<ul><li>8<ul><li>9</li></ul></li></ul></li></ul></li></ul></li></ul></li></ul></li></ul></li></ul></li></ul>';
  const out = htmlToProjection(clampDepth(nine));
  for (const n of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    assert.ok(out.some((s) => s.endsWith(n)), `level ${n} was dropped instead of lifted`);
  }
  assert.equal(out.length, 9);
});

test('content already within the cap is returned as the SAME BYTES', () => {
  // All six levels, not just three — proves the FULL new cap round-trips as a
  // no-op, not merely a depth that happened to already work under the old one.
  const legal =
    '<ul><li>a<ul><li>b<ul><li>c<ul><li>d<ul><li>e<ul><li>f</li></ul></li></ul></li></ul></li></ul></li></ul></li></ul>';
  assert.equal(clampDepth(legal), legal);
});

test('clampDepth never emits a prefix beyond the table', () => {
  const out = htmlToProjection(clampDepth(SEVEN_DEEP));
  const beyondTable = '– '.repeat(DEPTH_PREFIXES.length); // one level past the last entry
  for (const line of out) {
    assert.ok(!line.startsWith(beyondTable), `a prefix past the table escaped: ${line}`);
  }
});

test('a custom max is honoured, and a nonsense max falls back to the cap', () => {
  assert.deepEqual(
    htmlToProjection(clampDepth(SEVEN_DEEP, 1)),
    ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'],
  );
  assert.deepEqual(htmlToProjection(clampDepth(SEVEN_DEEP, 0)), htmlToProjection(clampDepth(SEVEN_DEEP)));
});

// ── projectionEquals: whole-array, order-sensitive ─────────────────────────

const ROWS = () => [
  { title: 'a', bullets: ['x', 'y'] },
  { title: 'b', bullets: [] },
];

test('identical projections compare equal', () => {
  assert.equal(projectionEquals(ROWS(), ROWS()), true);
});

test('AN INSERT IN THE MIDDLE IS NOT EQUAL — this is the corruption guard', () => {
  // MSDB's own admin form can insert a row. Per-index matching would compare
  // row 1 against row 2 and keep applying the wrong formatting to the wrong
  // text, silently. Whole-array comparison degrades to plain instead.
  const withInsert = ROWS();
  withInsert.splice(1, 0, { title: 'inserted', bullets: [] });
  assert.equal(projectionEquals(ROWS(), withInsert), false);
});

test('a REORDER is not equal either', () => {
  assert.equal(projectionEquals(ROWS(), ROWS().reverse()), false);
});

test('A ROW APPENDED AT THE END is not equal — the length check is load-bearing', () => {
  /**
   * FOUND BY A CONTROL THAT FIRED NOTHING.
   *
   * Deleting `if (a.length !== b.length) return false` reddened NO test, which
   * looked like redundancy in the code. It was not — it was a hole in this
   * file. The loop runs to `a.length`, so when `b` merely has an extra row on
   * the END every compared index matches and the loop returns TRUE. An MSDB
   * admin appending a row would have kept the rich copy live against a
   * projection that no longer describes it.
   *
   * Insert-in-the-middle was already covered and does redden without the length
   * check, because it shifts every following row. Append does not shift
   * anything, which is exactly why it slipped through.
   */
  const appended = [...ROWS(), { title: 'c', bullets: ['new'] }];
  assert.equal(projectionEquals(ROWS(), appended), false);
  assert.equal(projectionEquals(appended, ROWS()), false, 'and in the other direction');
});

test('a single changed bullet, title, or length makes the whole thing unequal', () => {
  const bulletChanged = ROWS(); bulletChanged[0].bullets[1] = 'z';
  const titleChanged = ROWS();  titleChanged[1].title = 'B';
  const shorter = ROWS().slice(0, 1);
  const bulletAdded = ROWS(); bulletAdded[1].bullets.push('new');
  for (const other of [bulletChanged, titleChanged, shorter, bulletAdded]) {
    assert.equal(projectionEquals(ROWS(), other), false);
  }
});

test('anything that is not an array of rows is FALSE, never a lenient true', () => {
  for (const bad of [null, undefined, '', 0, {}, 'rows', [null], [{ title: 'a' }]]) {
    assert.equal(projectionEquals(ROWS(), bad), false, `${JSON.stringify(bad)} compared equal`);
    assert.equal(projectionEquals(bad, ROWS()), false, `${JSON.stringify(bad)} compared equal (lhs)`);
  }
});

test('CONTROL: the comparison is not simply always-false', () => {
  // A guard that returns false for everything would pass every negative test
  // above and be worthless. Two empty arrays, and two equal non-trivial ones,
  // must compare TRUE.
  assert.equal(projectionEquals([], []), true);
  assert.equal(projectionEquals(ROWS(), ROWS()), true);
});
