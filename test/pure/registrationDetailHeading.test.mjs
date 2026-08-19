import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DETAIL_HEADING_LABEL,
  detailHeading,
  publicHeadingIdentifier,
  inhouseHeadingIdentifier,
} from '@/lib/registrations/detailHeading';

/**
 * THE DETAIL H1, AND ESPECIALLY WHAT IT DOES WHEN IT HAS NOTHING TO NAME.
 *
 * The heading now depends on a field that CAN BE MISSING — a public
 * registration whose coordinator has no name, an in-house request with no
 * company recorded — and the failure it must not have is a 40px line reading
 * `ข้อมูลการลงทะเบียน : ` with a colon pointing at nothing. A reader cannot tell
 * that from a page whose data failed to load.
 *
 * Driven here rather than through a render because the interesting cases are
 * data shapes, not markup: whitespace-only names, half-present names, the
 * divergent legacy company. A render tier would need a fixture per case and
 * would be asserting the same function through three layers of JSX.
 */

// ── 1. The empty rule ───────────────────────────────────────────────────────

test('an absent identifier renders the label ALONE — never a trailing colon', () => {
  for (const empty of [undefined, null, '', '   ', '\t', '\n']) {
    const heading = detailHeading(empty);
    assert.equal(heading, DETAIL_HEADING_LABEL,
      `detailHeading(${JSON.stringify(empty)}) produced ${JSON.stringify(heading)}`);
    assert.ok(!heading.includes(':'), 'the heading ends in a separator with nothing after it');
    assert.equal(heading, heading.trim(), 'the heading has trailing whitespace');
  }
});

test('CONTROL: the naive template WOULD produce the bare colon', () => {
  /**
   * The assertion above is only worth running if the defect it forbids is
   * reachable. This is the spelling anyone would write first, shown failing —
   * so a future reader can see that `detailHeading` is doing work rather than
   * wrapping a string concatenation for no reason.
   */
  const naive = (name) => `${DETAIL_HEADING_LABEL} : ${name ?? ''}`;
  assert.ok(naive('').includes(': '), 'the control does not reproduce the defect');
  assert.notEqual(naive('').trim(), DETAIL_HEADING_LABEL,
    'the naive form and the guarded form are indistinguishable — this control measures nothing');
  assert.match(naive(''), /:\s*$/, 'the naive form must end in a dangling separator');
});

test('a present identifier is joined with a spaced colon', () => {
  assert.equal(detailHeading('สมชาย ใจดี'), `${DETAIL_HEADING_LABEL} : สมชาย ใจดี`);
});

test('the identifier is trimmed, so padding cannot fake a value', () => {
  // `'  '` is truthy. Without the trim inside detailHeading it would produce
  // `label :   ` — the bare-colon defect wearing a disguise.
  assert.equal(detailHeading('  สมชาย  '), `${DETAIL_HEADING_LABEL} : สมชาย`);
});

// ── 2. The public identifier ────────────────────────────────────────────────

test('the public heading names the coordinator', () => {
  assert.equal(
    publicHeadingIdentifier({ coordinator: { firstName: 'สมชาย', lastName: 'ใจดี' } }),
    'สมชาย ใจดี',
  );
});

test('a half-named coordinator produces no trailing space', () => {
  // `${first} ${last}` with an empty last name yields 'สมชาย ' — truthy, and
  // rendered the heading ends mid-name against a space.
  assert.equal(publicHeadingIdentifier({ coordinator: { firstName: 'สมชาย', lastName: '' } }), 'สมชาย');
  assert.equal(publicHeadingIdentifier({ coordinator: { firstName: '', lastName: 'ใจดี' } }), 'ใจดี');
});

test('a coordinator holding only whitespace is ABSENT, not present-and-blank', () => {
  const id = publicHeadingIdentifier({ coordinator: { firstName: '  ', lastName: '\t' } });
  assert.equal(id, '');
  assert.equal(detailHeading(id), DETAIL_HEADING_LABEL, 'a whitespace coordinator produced a bare colon');
});

test('a missing coordinator subdocument does not throw', () => {
  // `getRegistrationById` is an unprojected `.lean()`, so this is only reachable
  // through a malformed document — but the heading is the first thing rendered
  // and a throw here is a blank page rather than a missing line.
  for (const doc of [{}, { coordinator: null }, { coordinator: undefined }, null, undefined]) {
    assert.equal(publicHeadingIdentifier(doc), '');
  }
});

// ── 3. The in-house identifier ──────────────────────────────────────────────

test('the in-house heading names the COMPANY, not the contact', () => {
  const doc = {
    companyName: 'บริษัท ทดสอบ จำกัด',
    quotationCompany: 'บริษัท ทดสอบ จำกัด',
    contactFirstName: 'สมชาย',
    contactLastName: 'ใจดี',
  };
  assert.equal(inhouseHeadingIdentifier(doc), 'บริษัท ทดสอบ จำกัด');
  assert.ok(!inhouseHeadingIdentifier(doc).includes('สมชาย'),
    'the heading names the contact — the ruling is the company');
});

test('the divergent legacy pair follows displayCompany exactly', () => {
  /**
   * On a pre-consolidation document the two company fields DISAGREE, and the
   * card below the heading resolves that with a stated precedence: the CONTACT
   * company wins, and the quotation company gets its own row. The heading must
   * make the same choice — one company in the heading and a different one three
   * inches below it is the screen contradicting itself about which entity the
   * record is for.
   */
  assert.equal(
    inhouseHeadingIdentifier({ companyName: 'ผู้ติดต่อ จำกัด', quotationCompany: 'ใบเสนอราคา จำกัด' }),
    'ผู้ติดต่อ จำกัด',
  );
});

test('with one company present, that one is used whichever it is', () => {
  assert.equal(inhouseHeadingIdentifier({ quotationCompany: 'ก จำกัด' }), 'ก จำกัด');
  assert.equal(inhouseHeadingIdentifier({ companyName: 'ข จำกัด' }), 'ข จำกัด');
});

test('a request with no company at all renders the label alone', () => {
  for (const doc of [{}, { companyName: '', quotationCompany: '   ' }, null]) {
    assert.equal(detailHeading(inhouseHeadingIdentifier(doc)), DETAIL_HEADING_LABEL);
  }
});

// ── 4. The two screens share one label ──────────────────────────────────────

test('both screens build from the SAME label constant', () => {
  // Not "both say ข้อมูลการลงทะเบียน" — that is satisfied by two literals which
  // can then drift by a character. The constant is the subject.
  assert.equal(typeof DETAIL_HEADING_LABEL, 'string');
  assert.ok(DETAIL_HEADING_LABEL.length > 0);
  assert.ok(detailHeading('x').startsWith(DETAIL_HEADING_LABEL));
  assert.ok(!DETAIL_HEADING_LABEL.includes(':'), 'the separator has leaked into the label');
});
