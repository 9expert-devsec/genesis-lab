import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Source with comments removed — the standing rule in this suite, and here it
 * is load-bearing twice over.
 *
 * Every guard below that slices a WINDOW around a call site was measuring raw
 * source, so a doc block added at that call site pushed the code it was looking
 * for out of the window and reddened a correct file. That happened: the cover's
 * reasoning note sits inside the send call and moved `catch (err)` past 1600
 * characters. The window was never meant to measure prose length.
 *
 * `[^:]` spares the `//` in a URL literal.
 */
function scrub(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const ROUTE = 'src/app/api/registration/bundle/route.js';
const SENDER = 'src/lib/email/template-senders/bundle-registration.js';
const PUBLIC_SENDER = 'src/lib/email/template-senders/public-registration.js';

/**
 * ONE EMAIL PER REQUEST, AND IT IS SENT AFTER THE ROWS EXIST.
 *
 * Both are seam properties no unit test can see: the model builders are pure
 * and know nothing about how often they are called, and there is no mail server
 * here to count deliveries against. What CAN be read is the source — how many
 * send call sites exist, whether the decision is a value or a boolean, and
 * where the send sits relative to the write.
 */

test('the sender is called EXACTLY ONCE, and not inside any loop', () => {
  /**
   * Three rows are a storage shape. Three confirmations would leak it to the
   * customer, who made one request and would have no way to tell an intended
   * package from three accidental submissions.
   *
   * A call count alone would not catch a call inside a `for (const leg …)`, so
   * this checks the surrounding text as well.
   */
  const code = read(ROUTE);
  const calls = [...code.matchAll(/sendBundleRegistrationEmail\(/g)];
  assert.equal(calls.length, 1, `expected one send call site, found ${calls.length}`);

  const at = calls[0].index;
  const before = code.slice(Math.max(0, at - 600), at);
  for (const looping of ['for (', 'forEach(', '.map(', 'while (']) {
    assert.equal(
      before.includes(looping),
      false,
      `the send may be inside a ${looping} — one mail per leg is the defect this pins`,
    );
  }
});

test('CONTROL: the loop probe would see a send inside a loop', () => {
  const planted = 'for (const leg of legs) {\n  await sendBundleRegistrationEmail({';
  const at = planted.indexOf('sendBundleRegistrationEmail(');
  assert.equal(planted.slice(0, at).includes('for ('), true);
});

test('the send happens AFTER the write, never before it', () => {
  /**
   * Mailing first would hand a customer a reference number for a request that
   * then aborted — worse than a plain failure, because the sales team has
   * nothing to find when they ring about it.
   */
  const code = read(ROUTE);
  const writeAt = code.indexOf('await writeLegsAtomically(orderedLegs)');
  const sendAt = code.indexOf('sendBundleRegistrationEmail(');
  assert.notEqual(writeAt, -1);
  assert.notEqual(sendAt, -1);
  assert.ok(writeAt < sendAt, 'the confirmation is sent before the rows are committed');
});

test('a failed email does NOT fail the request — the rows are already saved', () => {
  /**
   * The opposite ruling from the write's catch, and deliberately so: that one
   * had nothing saved to protect, this one does. A Postmark outage must not
   * turn a saved request into a 500 that invites the customer to submit again,
   * because that second submission would write a SECOND complete bundle.
   */
  // SCRUBBED: the window is a claim about how much CODE sits between the send
  // and its catch, and prose inside the call must not count toward it.
  const code = scrub(read(ROUTE));
  const at = code.indexOf('sendBundleRegistrationEmail(');
  const after = code.slice(at, at + 1600);
  assert.match(after, /catch \(err\)/, 'the send is unguarded — an outage would 500 a saved request');
  assert.match(after, /CONFIRMATION EMAIL FAILED/, 'the failure is silent');
  assert.equal(
    /catch[\s\S]{0,400}status:\s*5\d\d/.test(after),
    false,
    'a mail failure returns an error status for a request that succeeded',
  );
});

test('the send is decided as a VALUE, never a mutable sentViaTemplate boolean', () => {
  /**
   * The documented double-send hazard: a boolean that has to be kept in
   * agreement with the control flow, whose failure mode sends the customer BOTH
   * mails — and which a call-site count cannot distinguish from a correct send.
   * `decideSendPlan` returns one tagged outcome with no shape meaning "both".
   */
  const sender = read(SENDER);
  assert.match(sender, /decideSendPlan\(/, 'the sender no longer decides as a value');
  assert.match(sender, /plan\.via === 'html'/, 'the plan is not switched on');

  /**
   * ── THE PROBE TARGETS THE MECHANISM, NOT THE WORD ─────────────────────
   * A bare `/sentViaTemplate/` matches the paragraph above this function
   * EXPLAINING why the boolean is not used — and it would match the identical
   * paragraph in the public sender too, so the guard would have been red on
   * correct code and impossible to satisfy without deleting the explanation.
   * What is forbidden is a mutable flag: its declaration, its assignment, or a
   * branch reading it.
   */
  for (const spelling of [/\blet\s+sentViaTemplate\b/, /\bsentViaTemplate\s*=/, /if\s*\(\s*!?\s*sentViaTemplate\b/]) {
    assert.equal(spelling.test(sender), false, `the double-send boolean is back: ${spelling}`);
  }
});

test('CONTROL: the mutable-flag probe catches the shape it forbids, and spares the prose', () => {
  const forbidden = "let sentViaTemplate = false;\nif (!sentViaTemplate) { await sendEmail(x); }";
  const prose = ' * never a mutable `sentViaTemplate` boolean — that boolean is the hazard.';
  const probes = [/\blet\s+sentViaTemplate\b/, /\bsentViaTemplate\s*=/, /if\s*\(\s*!?\s*sentViaTemplate\b/];
  assert.equal(probes.some((p) => p.test(forbidden)), true, 'the probes miss the real defect');
  assert.equal(probes.some((p) => p.test(prose)), false, 'the probes fire on a comment about the defect');
});

test('it uses its OWN alias, and the course sender still uses its own', () => {
  // A new template rather than a variant: serving both from one alias would
  // mean editing a template that is currently delivering real registrations.
  const sender = read(SENDER);
  assert.match(sender, /POSTMARK_TEMPLATE_ALIAS_REG_BUNDLE/);
  assert.equal(
    /POSTMARK_TEMPLATE_ALIAS_REG_USER/.test(sender),
    false,
    'the bundle sender reaches for the course alias',
  );
  assert.match(read(PUBLIC_SENDER), /POSTMARK_TEMPLATE_ALIAS_REG_USER/, 'the course sender lost its alias');
});

test('the same asymmetric fallback policy, at the same two log levels', () => {
  /**
   * alias unset → INFO (a rollout switch, not a failure).
   * alias set and the send fails → ERROR naming the alias, THEN the HTML.
   *
   * This is the only mail a bundle request produces, so a mistyped alias
   * failing quietly would take the customer's confirmation, the team's BCC copy
   * and the trail together.
   */
  const sender = read(SENDER);
  assert.match(sender, /console\.error/, 'a failed template send is not logged as an error');
  assert.match(sender, /console\.info/, 'the not-yet-configured path is not logged at info');
  assert.match(sender, /bundleConfirmationEmail\(/, 'there is no HTML fallback at all');
});

test('nothing passes a bcc — the internal list is one env var, merged by postmark.js', () => {
  /**
   * A per-call `bcc: process.env.POSTMARK_ADMIN_EMAIL` means two places to edit
   * and one of them gets missed. `buildBcc()` merges POSTMARK_BCC_EMAILS into
   * every send, so the team receives this mail without this file naming them.
   */
  const sender = read(SENDER);
  assert.equal(/\bbcc:/.test(sender), false, 'the bundle sender passes its own bcc');
  assert.match(read('src/lib/email/postmark.js'), /POSTMARK_BCC_EMAILS/, 'the global bcc merge is gone');
});

test('CONTROL: the bcc probe would see one', () => {
  assert.equal(/\bbcc:/.test('await sendEmail({ to, bcc: process.env.X, subject });'), true);
});

/**
 * ── THE COVER: READ FROM THE PAGE, STORED NOWHERE ──────────────────────────
 *
 * Both halves are seam properties. The model is pure and cannot see where its
 * `coverImage` came from; the schema cannot see that nothing writes a cover to
 * it. What CAN be read is the source: which expression the route passes, how
 * many page reads it makes, and whether the tag grew a field.
 *
 * The call site carries a long note explaining the decision, and that note
 * NAMES every token these guards match on. So they read SCRUBBED source — the
 * standing rule in this suite, earned repeatedly — and the control below proves
 * the scrubber is what makes the match a claim about code.
 */

test('the cover is the page the route ALREADY loaded — not a second read', () => {
  /**
   * `getPublishedPageBuilderPageById` selects `-draft`, which excludes the
   * draft subtree and nothing else, so `promotionCover` is already in hand from
   * the read at the top of the handler. A second read here would be a query
   * added to every bundle submission for a value the route is holding.
   */
  const code = scrub(read(ROUTE));
  assert.match(
    code,
    /coverImage:\s*page\.promotionCover/,
    'the send no longer passes the page cover',
  );
  assert.equal(
    [...code.matchAll(/getPublishedPageBuilderPageById\(/g)].length,
    1,
    'the route reads the page more than once — the cover should reuse the first read',
  );
});

test('CONTROL: scrubbing is what makes that a claim about CODE, not about prose', () => {
  /**
   * The direction that matters: a comment MENTIONING the expression must not
   * satisfy the guard. Unscrubbed, this fixture matches; scrubbed, it must not.
   */
  const prose = '// the send passes coverImage: page.promotionCover, and here is why\nconst x = 1;';
  assert.match(prose, /coverImage:\s*page\.promotionCover/, 'the fixture is not what this control needs');
  assert.equal(
    /coverImage:\s*page\.promotionCover/.test(scrub(prose)),
    false,
    'the scrubber leaves comment text behind — every guard above is reading prose',
  );
  // …and it spares real code, so the guards cannot pass by scrubbing everything.
  assert.match(scrub('const y = 2; // trailing note\n'), /const y = 2;/);
  assert.match(scrub("const u = 'https://x.test/a.png';\n"), /https:\/\/x\.test/);
});

test('NO cover is stored — the bundle tag is still its four identity fields', () => {
  /**
   * A schema field with no reader is the one thing this repo does not add, and
   * a stored cover would have none: there is ONE send, inside the POST, and the
   * call-site guard above forbids a second. The round that builds a RE-SEND is
   * the round that earns the field — and it would owe the courses too.
   */
  for (const file of [
    'src/models/RegisterPublic.js',
    'src/lib/registration/build-public.js',
    'src/lib/registration/bundleLegs.js',
  ]) {
    assert.equal(
      /cover/i.test(scrub(read(file))),
      false,
      `${file} grew a cover field — nothing reads it`,
    );
  }
});

test('CONTROL: the stored-cover probe would see one', () => {
  assert.equal(/cover/i.test(scrub('  name: String(name ?? ""), cover: promotionCover,')), true);
});

test('the two bodies of the fallback are built from one course list', () => {
  // A hand-written HTML/text pair is how a customer ends up with two bodies
  // naming different courses, with nothing to report it.
  const tpl = read('src/lib/email/templates/registration-bundle-user.js');
  const rowsUses = [...tpl.matchAll(/\brows\b/g)];
  assert.ok(rowsUses.length >= 3, `the shared row array is used ${rowsUses.length} times — has the shape changed?`);
  assert.match(tpl, /const text = \[/, 'the text body no longer derives from the array');
  assert.match(tpl, /rows\.map\(/, 'the HTML body no longer derives from the array');
});
