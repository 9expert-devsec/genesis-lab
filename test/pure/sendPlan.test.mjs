import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REASON_NO_ALIAS,
  REASON_TEMPLATE_FAILED,
  VIA_HTML,
  VIA_TEMPLATE,
  decideSendPlan,
  isSendPlan,
} from '@/lib/email/sendPlan';

/**
 * src/lib/email/sendPlan.js — which email gets sent, as a value.
 *
 * ── WHAT THIS FILE REPLACED, AND WHY A SCAN COULD NOT DO IT ─────────────────
 * The three senders each carried `let sentViaTemplate = false`, set on one
 * branch and read on another. Deleting the `if` that read it sent the customer
 * BOTH the Postmark template mail and the hard-coded HTML — and the fs-tier
 * guard could not see it, because a double send has exactly the same two call
 * sites as a correct one. Counting call sites answers "how many sends are
 * WRITTEN", never "how many RUN".
 *
 * So the answer is not a better scan. `decideSendPlan` returns ONE tagged
 * outcome whose shape has no way to say "both", and the senders switch on it.
 * These tests are over that shape.
 *
 * ── WHAT IS AND IS NOT PROVEN HERE ──────────────────────────────────────────
 * PROVEN: for every input, exactly one delivery path is named; a template plan
 * never also carries a fallback instruction; and a hand-written plan that tries
 * to permit both is REJECTED rather than merely unusual.
 *
 * NOT PROVEN: that the senders honour the plan. A caller can still ignore it
 * and send twice — nothing in JavaScript prevents that, and no test in this
 * repo executes these senders (they are async, hit the network, and read
 * process.env). The fs tier pins that the send sits inside the `plan.via`
 * branch; a human sending one real registration is what confirms it.
 */

// ── The three inputs ────────────────────────────────────────────────────────

test('no alias → the HTML fallback, tagged as the rollout switch', () => {
  assert.deepEqual(
    decideSendPlan({ alias: undefined, templateOutcome: undefined }),
    { via: VIA_HTML, reason: REASON_NO_ALIAS }
  );
});

test('alias set and the template SENT → the template path, and nothing else', () => {
  assert.deepEqual(decideSendPlan({ alias: 'reg-public-confirm', templateOutcome: 'sent' }), {
    via: VIA_TEMPLATE,
  });
});

test('alias set and the template FAILED → the HTML fallback, tagged as a failure', () => {
  assert.deepEqual(decideSendPlan({ alias: 'reg-public-confirm', templateOutcome: 'failed' }), {
    via: VIA_HTML,
    reason: REASON_TEMPLATE_FAILED,
  });
});

// ── Totality: there is no fourth answer ─────────────────────────────────────

test('every falsy alias spelling is the no_alias case, not a crash or a template plan', () => {
  // An unset Vercel env var arrives as undefined; a cleared one arrives as ''.
  for (const alias of [undefined, null, '', 0, false, Number.NaN]) {
    assert.deepEqual(
      decideSendPlan({ alias, templateOutcome: 'sent' }),
      { via: VIA_HTML, reason: REASON_NO_ALIAS },
      `alias=${JSON.stringify(alias)} must not reach the template path`
    );
  }
});

test('an alias with an unrecognised outcome FAILS SAFE to one HTML mail', () => {
  // The direction of this default is deliberate. A caller that forgets to
  // report an outcome gets the fallback — ONE email — because a customer with a
  // duplicate is a support ticket and a customer with nothing is a lost sale.
  for (const outcome of [undefined, null, '', 'ok', 'SENT', true, 'skipped']) {
    assert.deepEqual(
      decideSendPlan({ alias: 'x', templateOutcome: outcome }),
      { via: VIA_HTML, reason: REASON_TEMPLATE_FAILED },
      `outcome=${JSON.stringify(outcome)} must not be read as success`
    );
  }
});

test('called with nothing at all, it still returns a valid plan', () => {
  assert.equal(isSendPlan(decideSendPlan()), true);
  assert.equal(isSendPlan(decideSendPlan({})), true);
});

test('EVERY reachable input produces a plan naming exactly ONE path', () => {
  const aliases = [undefined, '', 'reg-public-confirm', 'reg-paid-receipt'];
  const outcomes = [undefined, 'sent', 'failed', 'weird'];
  for (const alias of aliases) {
    for (const templateOutcome of outcomes) {
      const plan = decideSendPlan({ alias, templateOutcome });
      assert.equal(isSendPlan(plan), true, `invalid plan for ${alias}/${templateOutcome}`);
      // `via` is a single scalar field — this is the structural reason "both"
      // is not expressible, restated as an assertion rather than assumed.
      assert.equal(typeof plan.via, 'string');
      assert.equal([VIA_TEMPLATE, VIA_HTML].includes(plan.via), true);
    }
  }
});

test('a template plan carries NO reason; an html plan ALWAYS carries one', () => {
  const t = decideSendPlan({ alias: 'x', templateOutcome: 'sent' });
  assert.equal('reason' in t, false, 'a reason on a template plan means the fallback was also decided');

  for (const alias of [undefined, 'x']) {
    const h = decideSendPlan({ alias, templateOutcome: 'failed' });
    assert.equal(h.via, VIA_HTML);
    assert.equal(typeof h.reason, 'string');
    assert.ok(h.reason.length > 0);
  }
});

test('the two fallback reasons are DISTINGUISHABLE — they drive different log levels', () => {
  // If these collapsed to one value the senders could not tell the rollout
  // switch (info) from a mistyped alias (error), which is the whole asymmetry.
  assert.notEqual(REASON_NO_ALIAS, REASON_TEMPLATE_FAILED);
  assert.notEqual(
    decideSendPlan({ alias: undefined }).reason,
    decideSendPlan({ alias: 'x', templateOutcome: 'failed' }).reason
  );
});

// ── The control the whole design rests on ───────────────────────────────────

test('CONTROL: a plan that permits BOTH sends is REJECTED', () => {
  // This is the assertion that makes the refactor worth doing. Every shape
  // below is a way of saying "send the template AND the HTML", and each one
  // would pass a naive guard that only looked at `via`.
  const permitsBoth = [
    { via: 'both' },
    { via: VIA_TEMPLATE, reason: REASON_TEMPLATE_FAILED }, // template + a fallback instruction
    { via: VIA_TEMPLATE, alsoSendHtml: true },
    { via: VIA_HTML, reason: REASON_NO_ALIAS, alsoSendTemplate: true },
    { template: true, html: true },
    { via: [VIA_TEMPLATE, VIA_HTML] },
    { via: VIA_TEMPLATE, via2: VIA_HTML },
  ];
  for (const plan of permitsBoth) {
    assert.equal(isSendPlan(plan), false, `${JSON.stringify(plan)} was accepted as a valid plan`);
  }
});

test('CONTROL: isSendPlan is not vacuously false — it ACCEPTS the three real plans', () => {
  // Without this, `isSendPlan = () => false` would satisfy the control above
  // perfectly while rejecting every plan the senders actually receive.
  assert.equal(isSendPlan({ via: VIA_TEMPLATE }), true);
  assert.equal(isSendPlan({ via: VIA_HTML, reason: REASON_NO_ALIAS }), true);
  assert.equal(isSendPlan({ via: VIA_HTML, reason: REASON_TEMPLATE_FAILED }), true);
});

test('CONTROL: isSendPlan rejects non-objects and malformed tags', () => {
  for (const bad of [null, undefined, 'template', 42, [], [{ via: VIA_TEMPLATE }], {}, { via: '' }]) {
    assert.equal(isSendPlan(bad), false, `${JSON.stringify(bad)} was accepted`);
  }
  // An html plan needs a RECOGNISED reason, not any string — an unknown reason
  // is a branch the senders have no log level for.
  assert.equal(isSendPlan({ via: VIA_HTML, reason: 'because' }), false);
  assert.equal(isSendPlan({ via: VIA_HTML }), false, 'an html plan with no reason is incomplete');
});

test('CONTROL: the exported tag constants are the strings the senders compare against', () => {
  // The senders switch on the LITERALS 'html' and 'template' (a source scan
  // reads literals, not imported constants). If these drifted, the senders
  // would silently take the wrong branch — and since the plan would still be
  // structurally valid, nothing else here would notice.
  assert.equal(VIA_TEMPLATE, 'template');
  assert.equal(VIA_HTML, 'html');
  assert.equal(REASON_NO_ALIAS, 'no_alias');
  assert.equal(REASON_TEMPLATE_FAILED, 'template_failed');
});
