import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeHttpHref, splitContacts, telHref } from '@/lib/chat/contactLinks';
import { toBulletGlyphs } from '@/lib/chat/messageText';

// Contact linkification.
//
// The point of this file is the BOUNDARY, same as the bullet swap: three shapes
// and nothing else. Every test either pins one of the three, or pins something
// that must be left as prose. If a "leave alone" case starts changing, this has
// stopped being a contact linkifier.
//
// The security-relevant asymmetry, tested separately below: mailto: and tel:
// hrefs are built BY US from matched text, so their scheme cannot be chosen by
// upstream. Only the URL href comes from upstream, and only it is allowlisted.

const only = (text, type) => splitContacts(text).filter((s) => s.type === type);
const one = (text, type) => {
  const hits = only(text, type);
  assert.equal(hits.length, 1, `expected exactly one ${type} in ${JSON.stringify(text)}`);
  return hits[0];
};

test('an email becomes a mailto we build ourselves', () => {
  const s = one('ติดต่อ info@9expert.co.th ได้เลยครับ', 'email');
  assert.equal(s.text, 'info@9expert.co.th', 'the visible text is untouched');
  assert.equal(s.href, 'mailto:info@9expert.co.th', 'and the scheme is ours, not upstream’s');
  // A dotted domain is required, so an internal token is not an address.
  assert.deepEqual(only('เขียนว่า a@b แล้วจบ', 'email'), []);
});

test('a phone becomes a tel with the digits normalised', () => {
  assert.equal(one('โทร 02-219-4304 ครับ', 'phone').href, 'tel:022194304', 'dashes stripped');
  assert.equal(one('โทร 081 234 5678 ครับ', 'phone').href, 'tel:0812345678', 'spaces stripped');
  assert.equal(one('โทร +66 81 234 5678 ครับ', 'phone').href, 'tel:+66812345678', 'the + is kept');
  assert.equal(one('โทร 02-219-4304 ครับ', 'phone').text, '02-219-4304', 'displayed as written');
});

test('numbers that are not phone numbers stay prose', () => {
  // Real strings from these replies. A missed phone number is still readable;
  // a mangled price is not.
  for (const s of ['ราคา 14,900 ฿', 'รหัส GEN-AI-L1', 'วันที่ 05-08-2026', 'อบรม 2 วัน 12 ชม.']) {
    assert.deepEqual(only(s, 'phone'), [], `must not linkify: ${s}`);
  }
});

test('a bare http(s) URL becomes a link, with the sentence punctuation left behind', () => {
  const s = one('ดูที่ https://www.9experttraining.com/contact-us. ขอบคุณครับ', 'url');
  assert.equal(s.text, 'https://www.9experttraining.com/contact-us', 'the trailing period is prose');
  assert.equal(s.href, 'https://www.9experttraining.com/contact-us');
  // …and the period really is still in the output, not swallowed.
  assert.ok(splitContacts('ดูที่ https://x.example.com/a. จบ').some((x) => x.type === 'text' && x.text.startsWith('.')));
});

test('CONTROL: a dangerous scheme never becomes a link', () => {
  // TWO independent reasons, and the load-bearing one is named in the module:
  // the PATTERN only matches http(s)://, so these are never candidates. The
  // allowlist is the second gate, tested directly here so it is not merely
  // assumed to work when the pattern is one day widened.
  for (const s of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:msgbox']) {
    assert.deepEqual(splitContacts(s).filter((x) => x.type === 'url'), [], `not matched: ${s}`);
    assert.equal(safeHttpHref(s), null, `and rejected by the allowlist: ${s}`);
  }
  // The allowlist accepts what it should, so it is not simply refusing everything.
  assert.equal(safeHttpHref('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeHttpHref('http://example.com/a'), 'http://example.com/a');
  assert.equal(safeHttpHref('not a url'), null);
});

test('CONTROL: an address that is only PART of a longer token is rejected', () => {
  // The boundary check, done WITHOUT lookbehind — Safari only shipped that in
  // 16.4 and a regex that fails to parse takes the whole bundle with it.
  //
  // WHAT IT ACTUALLY CATCHES IS NARROWER THAN IT LOOKS, and the first draft of
  // this test had the wrong fixture because of it. `xxinfo@9expert.co.th` is a
  // perfectly valid address — `xxinfo` is just a local part — so it linkifies,
  // correctly. Any character that COULD precede the match and still be part of
  // an address would already have been consumed by the pattern, which leaves
  // exactly one reachable case: a preceding `@`.
  assert.deepEqual(only('x@a@b.com', 'email'), [], 'a second @ makes it not an address');
  assert.deepEqual(only('user@@example.com', 'email'), [], 'nor does a doubled @');
  // …and the guard is not simply refusing everything.
  assert.equal(one('user.info@9expert.co.th', 'email').text, 'user.info@9expert.co.th');
  assert.equal(one('xxinfo@9expert.co.th', 'email').text, 'xxinfo@9expert.co.th');

  // The phone equivalent IS the one that catches a fragment of a longer token,
  // and it works in both directions.
  assert.deepEqual(only('12081234567890', 'phone'), [], 'digits before');
  assert.deepEqual(only('02-219-43041234', 'phone'), [], 'digits after');
  assert.equal(one('โทร02-219-4304', 'phone').text, '02-219-4304', 'but Thai text before is fine');
});

test('every segment joined back together reproduces the input exactly', () => {
  // The strongest single check here: it proves nothing is dropped, duplicated or
  // rewritten, including for the inputs that are REJECTED and must fall back
  // into the surrounding prose.
  for (const s of [
    'ติดต่อ info@9expert.co.th หรือโทร 02-219-4304 ดูที่ https://x.example.com/a. ราคา 14,900 ฿',
    'javascript:alert(1) และ xxinfo@9expert.co.th และ 12081234567890',
    'ไม่มีอะไรเลย',
    '',
  ]) {
    assert.equal(splitContacts(s).map((x) => x.text).join(''), s, `round trip: ${s}`);
  }
});

test('bullets and links do not corrupt each other on the same line', () => {
  // The interaction, driven together rather than argued about. toBulletGlyphs
  // runs first and only touches a `*` at line start; `•` is in none of the
  // contact patterns, so neither can create or destroy the other's match.
  const raw = '*   ติดต่อ info@9expert.co.th หรือ 02-219-4304\n*   ดูที่ https://x.example.com/a';
  const segments = splitContacts(toBulletGlyphs(raw));

  const text = segments.map((s) => s.text).join('');
  assert.ok(text.startsWith('•   ติดต่อ'), 'the first bullet survived linkification');
  assert.ok(text.includes('\n•   ดูที่'), 'and so did the second');
  assert.equal(only(toBulletGlyphs(raw), 'email').length, 1);
  assert.equal(only(toBulletGlyphs(raw), 'phone').length, 1);
  assert.equal(only(toBulletGlyphs(raw), 'url').length, 1);
  // …and running them in this order is not accidentally the same as the other
  // order for this input — the bullet glyph really is applied before splitting.
  assert.ok(!text.includes('*   '), 'no raw markers remain');
});

test('telHref keeps the plus and strips only separators', () => {
  assert.equal(telHref('+66 81-234-5678'), 'tel:+66812345678');
  assert.equal(telHref('02 219 4304'), 'tel:022194304');
});
