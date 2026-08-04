import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countCallSites, readSource, sourceExists, walkSources } from '../sourceScan.mjs';

/**
 * Source-anchored guards over the public / in-house / paid-receipt mail paths.
 *
 * ── THE SHAPE BEING PROTECTED ───────────────────────────────────────────────
 * ONE email per registration. It goes to the registrant, its subject and body
 * come from a Postmark Template, and everyone internal receives that same mail
 * as a BCC copy configured once in POSTMARK_BCC_EMAILS. There is no second,
 * admin-only email, and there is no per-call bcc argument.
 *
 * ── WHY THE FS TIER AT ALL ──────────────────────────────────────────────────
 * Because none of this is observable anywhere else in the suite. There is no
 * test double for Postmark, no jsdom, and these functions are async, hit the
 * network, and read process.env. The behavioural claim — "exactly one email
 * leaves this function" — has no runtime harness to prove it in, so the guard
 * is over the SOURCE and its limits are stated at the bottom of this file
 * rather than left to be discovered.
 *
 * Every match goes through test/sourceScan.mjs. Its comment stripping is
 * load-bearing here, not hygiene: the three files under test all DISCUSS the
 * things banned below — send-receipt.js explains what the deleted
 * POSTMARK_ADMIN_EMAIL branch used to do, and public-registration.js quotes the
 * per-call `bcc:` it no longer passes. A raw scan would go red on exactly the
 * prose that documents the change, and the obvious way to "fix" that is to
 * delete the explanation.
 *
 * ── `code` vs `withImports`, AND WHY EVERY ASSERTION SAYS WHICH ─────────────
 * The reader scrubs imports by DEFAULT, and picking the wrong form fails
 * silently in both directions:
 *   · a "nothing imports X" guard read from `code` sees no import statements at
 *     all and passes VACUOUSLY. Guards (c) and (d) below are exactly that shape
 *     and would have been worthless.
 *   · a "this file does not CALL X" guard read from `withImports` is satisfied
 *     by the import line alone — defect 5 in sourceScan.mjs's own header.
 * So: existence-anywhere guards use `withImports`, behaviour guards use `code`.
 *
 * ── WHAT GUARD (g) NOW CLAIMS, AFTER BEING RE-POINTED ──────────────────────
 * It used to be introduced as proving "exactly one send". It never did. It
 * counts CALL SITES, and a double send has the same two call sites as a correct
 * one — which is why deleting the old `if (!sentViaTemplate)` guard left every
 * assertion here green. That hole is closed in the SHAPE now (a single tagged
 * plan, src/lib/email/sendPlan.js, tested in test/pure/sendPlan.test.mjs), not
 * by a better scan. What survives here is narrower and honest: a third send
 * cannot be added, the decision is taken exactly once, and the fallback send
 * sits inside the branch that decision governs.
 */

const PUBLIC_SENDER = 'src/lib/email/template-senders/public-registration.js';
const INHOUSE_SENDER = 'src/lib/email/template-senders/inhouse-registration.js';
const RECEIPT = 'src/lib/registration/send-receipt.js';
const PUBLIC_ROUTE = 'src/app/api/registration/public/route.js';
const INHOUSE_ROUTE = 'src/app/api/registration/inhouse/route.js';
const MASTERCLASS = 'src/lib/email/template-senders/masterclass.js';

/** The three paths this change owns. Masterclass is NOT one of them. */
const SEND_PATHS = [PUBLIC_SENDER, INHOUSE_SENDER, RECEIPT];

const SRC = walkSources('src');
const files = Object.fromEntries(SEND_PATHS.concat([PUBLIC_ROUTE, INHOUSE_ROUTE]).map((rel) => [rel, readSource(rel)]));

// ── (a) the three paths send through Postmark Templates ─────────────────────

test('(a) all three send paths call sendTemplateEmail', () => {
  for (const rel of SEND_PATHS) {
    assert.ok(
      countCallSites(files[rel].code, 'sendTemplateEmail') > 0,
      `${rel} does not call sendTemplateEmail — the template path is missing`
    );
    // The import is checked on `withImports` for the obvious reason: `code` has
    // had the import statements removed.
    assert.match(
      files[rel].withImports,
      /import\s*\{[^}]*\bsendTemplateEmail\b[^}]*\}\s*from/,
      `${rel} does not import sendTemplateEmail`
    );
  }
});

test('(a) each path reads its own alias env var and no other flow\'s', () => {
  const OWN = {
    [PUBLIC_SENDER]: 'POSTMARK_TEMPLATE_ALIAS_REG_USER',
    [INHOUSE_SENDER]: 'POSTMARK_TEMPLATE_ALIAS_INHOUSE_USER',
    [RECEIPT]: 'POSTMARK_TEMPLATE_ALIAS_PAID_USER',
  };
  for (const [rel, alias] of Object.entries(OWN)) {
    assert.match(files[rel].code, new RegExp(`process\\.env\\.${alias}\\b`), `${rel} does not read ${alias}`);
    for (const other of Object.values(OWN)) {
      if (other === alias) continue;
      assert.doesNotMatch(files[rel].code, new RegExp(`\\b${other}\\b`), `${rel} reads ${other}, which belongs to another flow`);
    }
  }
});

// ── (b) the failure path is LOUD ────────────────────────────────────────────

test('(b) the alias-set-but-FAILED path calls console.error, not console.warn', () => {
  // The asymmetry is the point. An UNSET alias is the rollout switch and logs
  // at info. An alias that is set and whose send comes back non-2xx (a 422 for
  // an alias that is not on the server) is a mistyped env var that would
  // otherwise ship the old HTML forever with nothing louder than a shrug —
  // and since this is now the only mail the flow sends, a quiet failure loses
  // the customer's copy AND the team's notification together.
  for (const rel of SEND_PATHS) {
    const { code } = files[rel];
    assert.ok(countCallSites(code, 'console.error') >= 0); // shape guard only; see below
    assert.match(code, /console\.error\(/, `${rel} has no console.error at all`);
    assert.doesNotMatch(
      code,
      /console\.warn\(/,
      `${rel} logs a template failure at warn level — it must be error`
    );
    // The error must name the alias and the status, or the log is useless for
    // the one thing it exists for: telling you WHICH alias was wrong.
    assert.match(code, /console\.error\([\s\S]{0,400}?['"]alias:['"],\s*alias/, `${rel}'s console.error does not name the alias`);
    assert.match(code, /console\.error\([\s\S]{0,400}?status/, `${rel}'s console.error does not name the status`);
  }
});

test('(b) the alias-UNSET path logs at info, and is not an error or a throw', () => {
  for (const rel of SEND_PATHS) {
    const { code } = files[rel];
    assert.match(code, /console\.info\(/, `${rel} does not log the unset-alias rollout case at info level`);
    assert.doesNotMatch(
      code,
      /throw new Error\([\s\S]{0,120}ALIAS/,
      `${rel} throws on a missing alias — that is the masterclass policy, not this one`
    );
  }
});

// ── (c) the orphan wrapper is gone ──────────────────────────────────────────

test('(c) sendPublicPaidReceiptEmail is gone and NOTHING imports it', () => {
  // It had zero callers while looking like the live paid-receipt door; all
  // three real paths import sendPaidReceipt from send-receipt.js directly. A
  // second door that looks live is worse than no door: the next person migrates
  // the wrapper, sees nothing change, and concludes the template is broken.
  // withImports, not code: an `import { sendPublicPaidReceiptEmail }` is
  // exactly what this is looking for, and `code` has those lines removed.
  const offenders = SRC.filter((f) => /\bsendPublicPaidReceiptEmail\b/.test(f.withImports)).map((f) => f.rel);
  assert.deepEqual(offenders, [], `sendPublicPaidReceiptEmail is back in: ${offenders.join(', ')}`);
});

test('(c) all three paid-receipt call sites still reach send-receipt.js', () => {
  const CALLERS = [
    'src/app/api/registration/public/charge/route.js',
    'src/app/api/webhooks/omise/route.js',
    'src/app/api/registration/public/dev-mark-paid/route.js',
  ];
  for (const rel of CALLERS) {
    const { code, withImports } = readSource(rel);
    // All three reach it through a DYNAMIC `await import(…)` inside the handler,
    // which `stripImports` leaves alone — but read withImports anyway so a
    // future switch to a static import does not silently blind this.
    assert.match(
      withImports,
      /['"][^'"]*lib\/registration\/send-receipt['"]/,
      `${rel} no longer references send-receipt`
    );
    assert.ok(countCallSites(code, 'sendPaidReceipt') > 0, `${rel} no longer calls sendPaidReceipt`);
  }
});

// ── (d) the admin templates are gone ────────────────────────────────────────

test('(d) both admin templates are deleted and nothing imports them', () => {
  for (const rel of [
    'src/lib/email/templates/registration-admin.js',
    'src/lib/email/templates/registration-inhouse-admin.js',
  ]) {
    assert.equal(sourceExists(rel), false, `${rel} still exists — admin mail was removed, not migrated`);
  }
  // withImports throughout: the thing being banned IS an import statement, and
  // reading `code` here would pass over a file that imports both templates.
  const offenders = SRC.filter(
    (f) => /templates\/registration-admin|templates\/registration-inhouse-admin/.test(f.withImports)
  ).map((f) => f.rel);
  assert.deepEqual(offenders, [], `still importing a deleted admin template: ${offenders.join(', ')}`);

  const byName = SRC.filter((f) => /\b(adminNotificationEmail|inhouseAdminNotificationEmail)\b/.test(f.withImports)).map((f) => f.rel);
  assert.deepEqual(byName, [], `still referencing an admin template export: ${byName.join(', ')}`);
});

// ── (e) the admin parameters died with the templates ────────────────────────

test('(e) neither registration route computes adminDashboardUrl', () => {
  for (const rel of [PUBLIC_ROUTE, INHOUSE_ROUTE]) {
    assert.doesNotMatch(files[rel].code, /adminDashboardUrl/, `${rel} still builds adminDashboardUrl`);
    assert.doesNotMatch(
      files[rel].code,
      /\/admin\/registrations/,
      `${rel} still builds an admin dashboard link`
    );
  }
});

test('(e) neither sender accepts adminEmail or adminDashboardUrl', () => {
  for (const rel of [PUBLIC_SENDER, INHOUSE_SENDER, RECEIPT]) {
    for (const param of ['adminEmail', 'adminDashboardUrl']) {
      assert.doesNotMatch(files[rel].code, new RegExp(`\\b${param}\\b`), `${rel} still names ${param}`);
    }
  }
});

test('(e) NO file in src/ passes adminDashboardUrl anywhere', () => {
  const offenders = SRC.filter((f) => /\badminDashboardUrl\b/.test(f.code)).map((f) => f.rel);
  assert.deepEqual(offenders, [], `adminDashboardUrl survives in: ${offenders.join(', ')}`);
});

// ── (f) POSTMARK_ADMIN_EMAIL survives only in masterclass ───────────────────

test('(f) none of the three changed paths references POSTMARK_ADMIN_EMAIL', () => {
  for (const rel of SEND_PATHS) {
    assert.doesNotMatch(
      files[rel].code,
      /POSTMARK_ADMIN_EMAIL/,
      `${rel} still reads POSTMARK_ADMIN_EMAIL — internal recipients are POSTMARK_BCC_EMAILS now`
    );
  }
});

test('(f) EXEMPTION, named: masterclass.js is the only src/ file left reading POSTMARK_ADMIN_EMAIL', () => {
  // src/lib/email/template-senders/masterclass.js is OUT OF SCOPE for this
  // change and still sends its own admin email. It is exempt BY NAME rather
  // than by a pattern, so migrating it later reddens this test and forces the
  // exemption to be deleted instead of quietly outliving its reason.
  const readers = SRC.filter((f) => /POSTMARK_ADMIN_EMAIL/.test(f.code)).map((f) => f.rel).sort();
  assert.deepEqual(
    readers,
    [MASTERCLASS],
    `POSTMARK_ADMIN_EMAIL is read outside the masterclass exemption: ${readers.join(', ')}`
  );
});

test('(f) no changed path passes a per-call bcc argument', () => {
  // buildBcc() in postmark.js merges POSTMARK_BCC_EMAILS into every send, so
  // the internal list is configured in ONE place. A per-call bcc makes two
  // places that have to agree, and one of them gets missed.
  for (const rel of SEND_PATHS) {
    assert.doesNotMatch(files[rel].code, /\bbcc\s*:/, `${rel} passes a per-call bcc`);
  }
});

// ── (g) EXACTLY ONE send per path ───────────────────────────────────────────

test('(g) each send path has EXACTLY ONE sendTemplateEmail and ONE sendEmail call site', () => {
  // COUNTS, not existence — a ">= 1" here is the weak-lower-bound failure this
  // repo already shipped as `writes.length >= 2` in planDemotion.
  //
  // NARROWED CLAIM. This does NOT prove one send happens; two call sites are
  // two call sites whether or not both run, which is why the old double-send
  // hole was invisible to it. What it still does prove is that a THIRD send —
  // the shape the deleted admin email had — cannot be added without going red.
  // The one-send property itself is structural now: see (g2).
  for (const rel of SEND_PATHS) {
    const { code } = files[rel];
    assert.equal(
      countCallSites(code, 'sendTemplateEmail'),
      1,
      `${rel} has ${countCallSites(code, 'sendTemplateEmail')} sendTemplateEmail call sites, expected exactly 1`
    );
    assert.equal(
      countCallSites(code, 'sendEmail'),
      1,
      `${rel} has ${countCallSites(code, 'sendEmail')} sendEmail call sites, expected exactly 1 (the HTML fallback)`
    );
  }
});

test('(g2) the send decision is taken EXACTLY ONCE, by the planner', () => {
  // Two decideSendPlan calls would mean two plans, and two plans is how "both"
  // becomes expressible again after sendPlan.js made it unrepresentable in one.
  for (const rel of SEND_PATHS) {
    const n = countCallSites(files[rel].code, 'decideSendPlan');
    assert.equal(n, 1, `${rel} calls decideSendPlan ${n} times, expected exactly 1`);
  }
});

test('(g2) NO send path keeps a mutable flag — the plan is a value, not an accumulator', () => {
  // `let sentViaTemplate = false` WAS the double-send bug: a boolean set on one
  // branch, read on another, and silently desynchronised by any edit between
  // them. None of these three needs a `let` at all now, so the ban is total
  // rather than a blocklist of flag names someone can rename around.
  for (const rel of SEND_PATHS) {
    assert.doesNotMatch(
      files[rel].code,
      /(?:^|[^.\w])let\s+\w/,
      `${rel} declares a mutable local — if the send decision is being accumulated again, that is the bug`
    );
  }
});

test('(g2) the HTML fallback send sits INSIDE the branch the plan governs', () => {
  // Positional, and deliberately modest: it proves the fallback is written
  // after the `plan.via === 'html'` test, not that control flow reaches it only
  // through that test. A scan cannot do better — see the closing note.
  for (const rel of SEND_PATHS) {
    const { code } = files[rel];
    const branchAt = code.indexOf("plan.via === 'html'");
    const sendAt = code.search(/(?<![.\w$])sendEmail\s*\(/);
    assert.ok(branchAt > -1, `${rel} has no plan.via === 'html' branch`);
    assert.ok(sendAt > branchAt, `${rel} calls sendEmail outside the plan branch`);
    // And the LEVELS hang off the plan's reason, not off a re-derived condition.
    assert.match(code, /plan\.reason === 'template_failed'/, `${rel} does not branch its log level on the plan`);
  }
});

test('(g) no send path uses Promise.allSettled — one send needs no fan-out', () => {
  // Each sender previously built an array of two sends and settled them. With
  // the admin mail gone the array is one element, and leaving the combinator in
  // place is an open invitation to push a second send back into it.
  for (const rel of SEND_PATHS) {
    assert.doesNotMatch(files[rel].code, /Promise\.allSettled/, `${rel} still fans out sends`);
  }
});

test('(g) the receipt idempotency guard is unchanged', () => {
  const { code } = files[RECEIPT];
  assert.match(code, /doc\.payment\.receiptSentAt\s*=\s*new Date\(\)/, 'the receiptSentAt assignment changed shape');
  assert.match(code, /await doc\.save\(\)/, 'the doc.save() persistence is gone');
  assert.doesNotMatch(code, /findByIdAndUpdate/, 'the guard was switched to findByIdAndUpdate — it must stay on the loaded doc');
  // Set AFTER the send, never before: a Postmark outage must not permanently
  // mark the receipt as sent.
  const sendAt = code.indexOf('sendTemplateEmail(');
  const flagAt = code.indexOf('doc.payment.receiptSentAt =');
  assert.ok(sendAt > -1 && flagAt > sendAt, 'receiptSentAt is set before the send resolves');
});

// ── (h) the course-cover lookup must never cost the customer their mail ─────

test('(h) both routes wrap the course lookup in try/catch and fall back to empties', () => {
  // The builders are PURE, so this one piece of I/O lives in the route. It runs
  // AFTER the registration row is already written, which is what makes the
  // failure mode unacceptable: an upstream hiccup would otherwise turn a saved
  // registration into a 500 with no confirmation email, over a picture and a
  // nicer course title.
  //
  // The two catches return DIFFERENT shapes — a bare string for the public
  // route, `{ courseImage, courseName }` for the in-house one — so each is
  // pinned to its own fallback rather than to a shared loose pattern that would
  // match either and therefore assert neither.
  const EXPECTED_FALLBACK = {
    [PUBLIC_ROUTE]: /\}\s*catch\s*\([\s\S]{0,200}?return\s*'';/,
    [INHOUSE_ROUTE]: /\}\s*catch\s*\([\s\S]{0,240}?return\s*\{\s*courseImage:\s*'',\s*courseName:\s*''\s*\};/,
  };
  for (const rel of [PUBLIC_ROUTE, INHOUSE_ROUTE]) {
    const { code } = files[rel];
    assert.match(code, /getCourseByCode\s*\(/, `${rel} does not look up the course`);
    assert.match(code, /try\s*\{[\s\S]{0,500}?getCourseByCode/, `${rel}'s lookup is not inside a try`);
    assert.match(
      code,
      EXPECTED_FALLBACK[rel],
      `${rel}'s catch does not fall back to the empty value the model expects`
    );
    assert.match(code, /course_cover_url/, `${rel} reads the wrong upstream field for the cover`);
  }
});

test('(h) the email send is NOT inside the course-lookup try block', () => {
  // If the send were inside it, a Postmark failure would be swallowed by a
  // catch written for a course lookup — and the fallback policy's console.error
  // would never fire. Positional: the helper closes before the send begins.
  //
  // Anchored on `catch (err)`, which BOTH routes contain. An earlier version
  // anchored on the literal `return '';` and went vacuous the moment the
  // in-house catch started returning an object: lastIndexOf gave -1, and
  // `sendAt > -1` is true for any file that sends at all.
  for (const rel of [PUBLIC_ROUTE, INHOUSE_ROUTE]) {
    const { code } = files[rel];
    const catchAt = code.lastIndexOf('catch (err)');
    const sendAt = code.search(/send(?:Public|Inhouse)RegistrationEmails\s*\(/);
    assert.ok(catchAt > -1, `${rel} has no catch (err) — the anchor is gone and this guard is vacuous`);
    assert.ok(sendAt > -1, `${rel} no longer sends`);
    assert.ok(
      sendAt > catchAt,
      `${rel} calls the sender inside the course-lookup try/catch — a mail failure would be swallowed`
    );
  }
});

test('(h) the lookup is AWAITED before its values are handed to the sender', () => {
  // The model is built synchronously inside the sender, so an unresolved
  // promise would reach the template as `undefined` — the <img> would silently
  // vanish and the course name would render as the string "undefined".
  // Two shapes: the public route takes a single string, the in-house route
  // destructures cover AND title out of one call.
  assert.match(
    files[PUBLIC_ROUTE].code,
    /const courseImage = await \w+\(/,
    `${PUBLIC_ROUTE} does not await the cover lookup`
  );
  assert.match(
    files[INHOUSE_ROUTE].code,
    /const \{[^}]*\bcourseName\b[^}]*\} = await \w+\(/,
    `${INHOUSE_ROUTE} does not await the course lookup, or no longer takes the title from it`
  );
});

test('(h) the in-house route resolves the title from ONE fetch, not a second lookup', () => {
  // The cover and the title come off the same upstream response. A second
  // getCourseByCode for a field already in hand would double the upstream cost
  // of every in-house submission — and, being a separate call, could fail
  // independently and leave the two disagreeing about which course this is.
  const n = countCallSites(files[INHOUSE_ROUTE].code, 'getCourseByCode');
  assert.equal(n, 1, `${INHOUSE_ROUTE} makes ${n} course lookups, expected exactly 1`);
  assert.match(
    files[INHOUSE_ROUTE].code,
    /course\?\.course_name/,
    `${INHOUSE_ROUTE} no longer reads the display title from the response`
  );
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the walker actually walked src/', () => {
  assert.ok(SRC.length > 100, `only ${SRC.length} source files scanned — the walk is broken`);
  for (const rel of SEND_PATHS) {
    assert.ok(SRC.some((f) => f.rel === rel), `${rel} was not reached by the walk`);
  }
});

test('CONTROL: comment stripping is live, proven on the real files', () => {
  // Not a fixture. send-receipt.js explains in prose what the deleted
  // POSTMARK_ADMIN_EMAIL branch used to do, and public-registration.js quotes
  // the per-call `bcc:` it no longer passes. Both guards above would go red on
  // that prose if the stripper stopped working — and would go green on
  // anything at all if it became over-eager and blanked whole files.
  const receipt = files[RECEIPT];
  assert.match(receipt.raw, /POSTMARK_ADMIN_EMAIL/, 'the explanatory note is gone — did someone delete it?');
  assert.doesNotMatch(receipt.code, /POSTMARK_ADMIN_EMAIL/);
  assert.ok(receipt.code.includes('sendPaidReceipt'), 'stripping ate the code as well as the comments');

  const pub = files[PUBLIC_SENDER];
  assert.match(pub.raw, /bcc: process\.env\.POSTMARK_ADMIN_EMAIL/, 'the explanatory note is gone');
  assert.doesNotMatch(pub.code, /\bbcc\s*:/);
  assert.ok(pub.code.includes('sendTemplateEmail'), 'stripping ate the code');
});

test('CONTROL: countCallSites counts, and counts the right thing', () => {
  // If the counter were dead, every "exactly 1" above would be asserting 0 === 1
  // and would already be red — but a counter that OVER-counts is the silent
  // failure, so both directions are pinned.
  assert.equal(countCallSites('await sendEmail({a:1}); sendEmail(x);', 'sendEmail'), 2);
  assert.equal(countCallSites('sendTemplateEmail({});', 'sendEmail'), 0, 'sendEmail must not match inside sendTemplateEmail');
  assert.equal(countCallSites("import { sendEmail } from 'x';", 'sendEmail'), 0, 'an import binding is not a call site');
  assert.equal(countCallSites('obj.sendEmail();', 'sendEmail'), 0, 'a property call is not the imported binding');
});

test('CONTROL: the `let` ban distinguishes a declaration from the letters l-e-t', () => {
  // Without this, a matcher that fired on `completed`, `letter` or `.let` would
  // make (g2) permanently red for the wrong reason — or one anchored too
  // tightly would miss the declaration it exists to catch.
  const LET = /(?:^|[^.\w])let\s+\w/;
  assert.equal(LET.test('let sentViaTemplate = false;'), true, 'the real shape must match');
  assert.equal(LET.test('  let x;'), true);
  assert.equal(LET.test('const completed = true;'), false, '"completed" contains let');
  assert.equal(LET.test('const letter = 1;'), false);
  assert.equal(LET.test('obj.let(1);'), false);
});

test('CONTROL: every file under test was actually READ, in both forms', () => {
  // A typo'd path would make readSource throw, but an empty scrub would make
  // every doesNotMatch above pass over nothing at all.
  for (const rel of SEND_PATHS) {
    const f = files[rel];
    assert.ok(f.code.length > 500, `${rel} scrubbed to ${f.code.length} chars — the reader is broken`);
    assert.ok(f.withImports.length > f.code.length, `${rel}: withImports must retain the import lines`);
    assert.match(f.withImports, /^import /m, `${rel} has no import statements in withImports`);
    assert.doesNotMatch(f.code, /^import /m, `${rel}: stripImports did not strip`);
  }
});

test('CONTROL: the deleted-file check can tell a live file from a dead one', () => {
  assert.equal(sourceExists(PUBLIC_SENDER), true);
  assert.equal(sourceExists('src/lib/email/templates/registration-admin.js'), false);
  assert.equal(sourceExists('src/lib/email/this-never-existed.js'), false);
});

test('CONTROL: the src/ scan can still SEE POSTMARK_ADMIN_EMAIL where it legitimately lives', () => {
  // The (f) exemption test asserts a list of exactly one file. If the matcher
  // were dead that list would be EMPTY and the assertion would be red — but if
  // the walk silently skipped the template-senders directory it would also be
  // empty, and this pins which of the two is happening.
  const mc = SRC.find((f) => f.rel === MASTERCLASS);
  assert.ok(mc, 'masterclass.js was not reached by the walk');
  assert.match(mc.code, /POSTMARK_ADMIN_EMAIL/, 'masterclass no longer reads it — delete the exemption above');
});

/**
 * ── WHAT THIS FILE CANNOT SEE ───────────────────────────────────────────────
 * Written down rather than left to be discovered. This is a TEXT scan, not a
 * parser and not a runtime:
 *
 *   · MUTUAL EXCLUSIVITY, still — but much less of it. (g) sees two call sites,
 *     (g2) sees that the fallback is WRITTEN inside the plan branch and that no
 *     mutable flag survives. None of that is control-flow analysis: a `return`
 *     inserted mid-branch, an early `await sendEmail` hoisted above the plan
 *     into the template block, or a caller that discards the plan entirely
 *     would all pass. What closed the actual hole is the SHAPE — one tagged
 *     plan with a single `via` — proven in test/pure/sendPlan.test.mjs. This
 *     tier now guards the wiring, not the invariant.
 *   · That the BCC actually arrives. POSTMARK_BCC_EMAILS is read inside
 *     postmark.js at send time; whether it is set in Vercel, whether the
 *     addresses are valid, and whether Postmark honours them are all invisible.
 *   · That the Postmark templates EXIST under these aliases, that their models
 *     match the builders, or that their subjects carry {{ref_no}}. A 422 for an
 *     unknown alias is caught at runtime by the console.error this file pins
 *     the LEVEL of — it cannot pin that anyone reads the log.
 *   · Anything about the fallback HTML being correct. It is unchanged and
 *     untested here, as it was before this change.
 *   · WHETHER THE COVER LOOKUP ACTUALLY SURVIVES A FAILURE. Guard (h) proves a
 *     try/catch is WRITTEN around it and that the send sits outside it. It does
 *     not execute either route — they need Next's request context and a live
 *     Mongo — so a real upstream 500, a DNS failure or a timeout is verified by
 *     a human and by nothing here. What IS proven end-to-end is that `''` is a
 *     fully supported value: test/pure/emailTemplateModels asserts both builders
 *     emit an empty `course_image` rather than null, which is the state a
 *     swallowed failure produces.
 *   · Computed access — `process.env['POSTMARK_ADMIN_EMAIL']`, a send behind an
 *     alias binding, a re-export — defeats every matcher above.
 */
