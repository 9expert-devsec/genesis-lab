import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompletePanel } from '@/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient';
import { readSource } from '../sourceScan.mjs';

/**
 * THE CAREER PATH SUCCESS SCREEN SHOWS NO REFERENCE NUMBER.
 *
 * ── WHAT WAS THERE ─────────────────────────────────────────────────────────
 * A "เลขอ้างอิงการสมัคร" line printing the raw 24-character Mongo `_id` — not
 * the 8-character `refNo(_id)` the other flows mint, the whole ObjectId, in a
 * monospace face, as the one number the customer was told to keep.
 *
 * The public and in-house quote flows show none: the block is commented out in
 * `StepComplete`, deliberately, on both live paths, and the note there records
 * that a bundle's attempt to opt back in was WITHDRAWN because the confirmation
 * email carries the number and is the copy a customer keeps. Career Path now
 * sends that email too.
 *
 * ── WHY A HEX SWEEP AND NOT A LABEL PROBE ──────────────────────────────────
 * Asserting the STRING "เลขอ้างอิงการสมัคร" is absent proves only that one
 * wording is gone. The claim is that no ObjectId reaches the customer, by any
 * label or none — so the primary assertion is a sweep for 24 hex characters
 * anywhere in the rendered markup, with a control proving the sweep sees one
 * when it is planted.
 *
 * The label probe is kept ALONGSIDE it, bounded as `>label<`: Thai negates by
 * prefix, so a bare `includes()` cannot distinguish a label from its own
 * negation, and the two assertions fail for different reasons.
 */

const EMAIL = 'somchai@example.co.th';

/** A real ObjectId shape — 24 lowercase hex, as `String(doc._id)` produces. */
const OBJECT_ID = '68f0a1c2d3e4b5a697887766';

/** 24 hex characters, not part of a longer hex run. */
const OBJECT_ID_RE = /(?<![0-9a-fA-F])[0-9a-fA-F]{24}(?![0-9a-fA-F])/;

const html = (props = {}) =>
  renderToStaticMarkup(createElement(CompletePanel, { email: EMAIL, ...props }));

const countLabel = (markup, label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (markup.match(new RegExp(`>${escaped}<`, 'g')) ?? []).length;
};

// ── 1. No number reaches the customer ──────────────────────────────────────

test('the screen renders NO 24-hex string', () => {
  const markup = html();
  const hit = markup.match(OBJECT_ID_RE);
  assert.equal(hit, null, `an ObjectId reached the success screen: ${hit?.[0]}`);
});

test('and the reference LABEL is gone with it', () => {
  // A second, independent reason to fail. The sweep above would also pass on a
  // screen that kept the label and printed something else next to it.
  const markup = html();
  assert.equal(countLabel(markup, 'เลขอ้างอิงการสมัคร:'), 0);
  assert.equal(/เลขอ้างอิง/.test(markup), false, 'any spelling of the label');
});

test('the panel accepts no id to print — the prop is gone, not merely unused', () => {
  /**
   * Passing one must change nothing. A prop that still exists is a prop a future
   * edit can render, and the call site would look like it always fed it.
   */
  assert.equal(html({ id: OBJECT_ID }), html(), 'an id prop still influences the render');
  assert.equal(OBJECT_ID_RE.test(html({ id: OBJECT_ID })), false);
});

// ── 2. What the screen still owes the customer ─────────────────────────────

test('the thank-you heading, the contact promise and the way out all remain', () => {
  const markup = html();

  assert.equal(countLabel(markup, 'ขอบคุณสำหรับการลงทะเบียน'), 1, 'the heading');
  assert.ok(markup.includes(EMAIL), 'the customer must be told where the mail went');
  assert.ok(
    markup.includes('ภายใน 1–2 วันทำการ'),
    'the "we will get back to you" promise must survive'
  );
  assert.equal(countLabel(markup, 'ดู Career Path อื่นเพิ่มเติม'), 1, 'the way out');
  assert.match(markup, /href="\/career-path-project"/, 'and it must still go somewhere');
});

test('with no email the panel still renders its heading and its way out', () => {
  // The email line is gated; the rest is not, and a customer whose address never
  // reached this component must not land on a bare box.
  const markup = renderToStaticMarkup(createElement(CompletePanel, {}));
  assert.equal(countLabel(markup, 'ขอบคุณสำหรับการลงทะเบียน'), 1);
  assert.equal(countLabel(markup, 'ดู Career Path อื่นเพิ่มเติม'), 1);
  assert.equal(OBJECT_ID_RE.test(markup), false);

  // The promise is NOT gated on the email — it is about what happens next, not
  // about where a mail went, and a customer without an address still gets it.
  assert.ok(markup.includes('ทีมขายจะติดต่อกลับหาท่านภายใน 1–2 วันทำการ'));
});

// ── 2b. The wording is public's, except where the commitment differs ───────

/**
 * `StepComplete`'s quote variant is the reference screen. These pin the strings
 * ADOPTED from it, and — just as load-bearing — the one that was deliberately
 * NOT adopted.
 */
const WIZARD = readSource('src/components/registration/RegisterWizard.jsx');

test('the confirmation-email line is public`s, word for word', () => {
  /**
   * It used to read "เราได้รับข้อมูลของคุณแล้ว ทีมขายจะติดต่อกลับที่ <email>
   * ภายใน 1–2 วันทำการ" — one sentence doing two jobs, and under-claiming the
   * first: it said only that the data had arrived, because no mail was sent
   * until the Career Path sender shipped. One is now.
   */
  const markup = html();
  assert.ok(markup.includes('ทาง 9Expert ได้ส่งอีเมลยืนยันไปที่'), 'public`s opening');
  assert.ok(markup.includes('เรียบร้อย'), 'public`s closing');

  // The same string, verbatim, in the screen this one is following. Read from
  // `raw`: it is JSX prose, which the comment-stripping `code` view keeps but
  // which is not code in any sense a matcher should depend on.
  assert.ok(
    WIZARD.raw.includes('ทาง 9Expert ได้ส่งอีเมลยืนยันไปที่'),
    'the reference screen no longer says this — the two have drifted apart'
  );

  // And the sentence it replaced is gone.
  assert.equal(/เราได้รับข้อมูลของคุณแล้ว/.test(markup), false);
});

test('the PROMISE is NOT public`s, and that is deliberate', () => {
  /**
   * Public commits to a PDF quotation by email within THREE working days. This
   * flow commits to a sales contact within ONE TO TWO. They occupy the same slot
   * and they are not the same sentence said two ways — adopting public's wording
   * here would quietly restate a commitment made to a customer in order to make
   * two screens match. The mail built in commit 5 is written around this promise.
   */
  const markup = html();

  assert.ok(markup.includes('1–2 วันทำการ'), 'the service level must survive verbatim');
  assert.equal(/3 วันทำการ/.test(markup), false, 'public`s three-day SLA was copied across');
  assert.equal(
    /ใบเสนอราคาเป็นเอกสาร PDF/.test(markup),
    false,
    'public`s deliverable was copied across — this flow does not promise a PDF'
  );

  // The reference screen still promises its own, untouched.
  assert.ok(WIZARD.raw.includes('ภายใน 3 วันทำการ'), 'the public promise was edited');
});

test('the icon is the one public uses', () => {
  /**
   * `SuccessPulseIcon` was written to replace the flat lucide `CheckCircle2` on
   * the registration success screens — its own header says so — and simply never
   * reached this one. Asserted on the rendered SVG rather than on the import, so
   * a stale import cannot satisfy it.
   */
  const markup = html();
  assert.match(markup, /<svg[^>]*viewBox="0 0 300 300"/, 'the pulse mark did not render');
  assert.match(markup, /pulseCircle/, 'the animated rings are missing');

  // `CheckCircle2` is still imported for the STEP INDICATOR, so its absence here
  // is asserted on this panel's markup and not on the module.
  assert.equal(/lucide/i.test(markup), false, 'a lucide glyph is still on the success panel');
});

test('the link follows public`s phrasing and keeps this flow`s destination', () => {
  // Public: `ดูคอร์สอื่นเพิ่มเติม` → this flow's noun, same pattern. The
  // destination is deliberately NOT public's.
  const markup = html();
  assert.equal(countLabel(markup, 'ดู Career Path อื่นเพิ่มเติม'), 1);
  assert.equal(countLabel(markup, 'ดู Career Path อื่น'), 0, 'the old phrasing survived');
  assert.match(markup, /href="\/career-path-project"/);
  assert.equal(/href="\/training-course"/.test(markup), false, 'it now points at public`s listing');

  assert.ok(WIZARD.raw.includes('ดูคอร์สอื่นเพิ่มเติม'), 'the phrasing being followed is gone');
});

// ── 3. The id is not merely hidden — it is not carried ─────────────────────

const CLIENT = readSource(
  'src/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient.jsx'
);

test('the submit no longer stashes the id in client state', () => {
  /**
   * Removing the line that PRINTS it while still carrying the value leaves state
   * whose last reader has been deleted — which is how a value comes back later
   * looking like it was always needed. The document's `_id` is untouched; this
   * is about what the browser holds.
   */
  assert.equal(
    /setResult\(\{\s*id:\s*res\.id\s*\}\)/.test(CLIENT.code),
    false,
    'the id is still being stashed for a reader that no longer exists'
  );
  assert.match(CLIENT.code, /setResult\(\{\s*submitted:\s*true\s*\}\)/);
  assert.equal(
    /<CompletePanel\s+id=/.test(CLIENT.code),
    false,
    'the call site still feeds an id'
  );
});

test('the PUBLIC success screen was not touched to achieve this', () => {
  /**
   * Its reference block is commented out and its note explains that restoring it
   * is a decision for all flows at once. Mirroring that screen must not mean
   * editing it.
   */
  const wizard = readSource('src/components/registration/RegisterWizard.jsx');
  assert.match(wizard.raw, /\{\/\* <p className="mt-3 text-sm text-\[var\(--text-secondary\)\]">/);
  assert.equal(
    /careerpath|career-path|CompletePanel/i.test(wizard.withImports),
    false,
    'the public wizard now references the career-path flow'
  );
});

// ── 4. Controls ────────────────────────────────────────────────────────────

test('CONTROL: the hex sweep DOES see an ObjectId when one is present', () => {
  /**
   * Without this the primary assertion is vacuous — a regex that can never match
   * reports "no ObjectId" forever. Fired at the markup the screen used to
   * produce, verbatim.
   */
  const before =
    '<p class="mt-3">เลขอ้างอิงการสมัคร: ' +
    `<span class="font-mono">${OBJECT_ID}</span></p>`;
  assert.match(before, OBJECT_ID_RE, 'the sweep cannot see the string it exists to catch');
  assert.equal(countLabel(before, 'เลขอ้างอิงการสมัคร:'), 0, 'the label probe needs its boundary');
  assert.ok(/เลขอ้างอิง/.test(before), 'the loose probe does catch the old markup');
});

test('CONTROL: the hex sweep does not fire on things that merely look hexy', () => {
  // A colour, a shorter id, a longer hash. An unguarded matcher would go red on
  // unrelated markup and get weakened rather than fixed.
  for (const s of [
    '<div class="bg-[#0D1B2A]">x</div>',
    '<span>68f0a1c2d3e4b5a6</span>',
    '<span>68f0a1c2d3e4b5a69788776655</span>',
  ]) {
    assert.equal(OBJECT_ID_RE.test(s), false, `false positive on: ${s}`);
  }
});

test('CONTROL: the wording probes DO fire on the copy this screen used to carry', () => {
  /**
   * Without this every adopted-string assertion is vacuous — a probe that cannot
   * match reports "adopted" forever. Fired at the pre-change markup verbatim, and
   * at public's own closing line, which is the wording that must NOT appear here.
   */
  const before =
    '<p class="mt-3">เราได้รับข้อมูลของคุณแล้ว ทีมขายจะติดต่อกลับที่ ' +
    '<span>somchai@example.co.th</span> ภายใน 1–2 วันทำการ</p>' +
    '<a href="/career-path-project">ดู Career Path อื่น</a>';

  assert.ok(/เราได้รับข้อมูลของคุณแล้ว/.test(before), 'the replaced sentence must be catchable');
  assert.equal(before.includes('ทาง 9Expert ได้ส่งอีเมลยืนยันไปที่'), false, 'the adopted line is new');
  assert.equal(countLabel(before, 'ดู Career Path อื่นเพิ่มเติม'), 0, 'the old phrasing is not the new one');
  assert.equal(countLabel(before, 'ดู Career Path อื่น'), 1, 'and the old phrasing IS catchable');

  // The two probes that guard the promise must be able to fire on public's copy.
  const publicClosing =
    'ทั้งนี้ ทางบริษัทจะดำเนินการจัดส่งใบเสนอราคาเป็นเอกสาร PDF ให้ท่านทางอีเมลภายใน 3 วันทำการ';
  assert.ok(/3 วันทำการ/.test(publicClosing));
  assert.ok(/ใบเสนอราคาเป็นเอกสาร PDF/.test(publicClosing));

  // And the icon probe fires on the mark it replaced.
  assert.equal(/viewBox="0 0 300 300"/.test('<svg class="lucide lucide-circle-check">'), false);
});

test('CONTROL: the render and the reader both produced real content', () => {
  // Every assertion of absence above passes on an empty string, and both a
  // failed render and a failed read are silent.
  const markup = html();
  assert.ok(markup.length > 400, 'the panel rendered something substantial');
  assert.ok(CLIENT.code.length > 20000, 'the client was actually read');
});
