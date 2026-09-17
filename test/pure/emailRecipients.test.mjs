import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRecipients, recipientVarsFor, parseAddressList, FLOWS, KINDS, MASTERCLASS_PAYMENT_BCC_VAR,
} from '@/lib/email/recipients';

/**
 * src/lib/email/recipients.js — which env variable each customer mail copies.
 *
 * Every case hands in its OWN `env` object and its own `log` sink. Nothing
 * here touches process.env: the suite is one process with isolation:'none',
 * and a written variable would change what every other file runs against.
 */

const silent = () => {};
const rr = (flow, kind, env, log = silent) => resolveRecipients(flow, { kind, env, log });

/** The routing table from the brief — one row per (flow, kind), with the variables each reads. */
const TABLE = [
  ['public',      'quote',   'POSTMARK_CC_PUBLIC_EMAILS',      ['POSTMARK_BCC_PUBLIC_EMAILS']],
  ['public',      'payment', 'POSTMARK_CC_PUBLIC_EMAILS',      ['POSTMARK_BCC_PUBLIC_EMAILS']],
  ['inhouse',     'quote',   'POSTMARK_CC_INHOUSE_EMAILS',     ['POSTMARK_BCC_INHOUSE_EMAILS']],
  ['bundle',      'quote',   'POSTMARK_CC_BUNDLE_EMAILS',      ['POSTMARK_BCC_BUNDLE_EMAILS']],
  ['careerpath',  'quote',   'POSTMARK_CC_CAREERPATH_EMAILS',  ['POSTMARK_BCC_CAREERPATH_EMAILS']],
  ['masterclass', 'quote',   'POSTMARK_CC_MASTERCLASS_EMAILS', ['POSTMARK_BCC_MASTERCLASS_EMAILS']],
  ['masterclass', 'payment', 'POSTMARK_CC_MASTERCLASS_EMAILS', ['POSTMARK_BCC_MASTERCLASS_EMAILS', 'POSTMARK_BCC_MASTERCLASS_PAYMENT_EMAILS']],
];

/** An env where EVERY variable holds a distinct, recognisable address. */
const ALL_SET = Object.fromEntries(
  TABLE.flatMap(([, , cc, bccs]) => [cc, ...bccs]).map((name) => [name, `${name.toLowerCase()}@copy.example`]),
);

test('every row of the table reads exactly its own variables — and nothing from another flow', () => {
  for (const [flow, kind, ccVar, bccVars] of TABLE) {
    const r = rr(flow, kind, ALL_SET);
    assert.equal(r.cc, ALL_SET[ccVar], `${flow}/${kind} cc`);
    assert.equal(r.bcc, bccVars.map((v) => ALL_SET[v]).join(', '), `${flow}/${kind} bcc`);
    // Nothing from any OTHER variable leaked in.
    const mine = new Set([ccVar, ...bccVars].map((v) => ALL_SET[v]));
    for (const [name, addr] of Object.entries(ALL_SET)) {
      if (mine.has(addr)) continue;
      assert.equal(`${r.cc} ${r.bcc}`.includes(addr), false, `${flow}/${kind} leaked ${name}`);
    }
    assert.deepEqual(recipientVarsFor(flow, kind), { cc: [ccVar], bcc: bccVars });
  }
  assert.equal(TABLE.length, 7, 'the table covers seven (flow, kind) pairs');
  assert.equal(new Set(TABLE.flatMap(([, , cc, bccs]) => [cc, ...bccs])).size, 11, 'eleven distinct variables');
});

test('masterclass payment BCC is the UNION of the flow list and the payment-only list', () => {
  const env = {
    POSTMARK_BCC_MASTERCLASS_EMAILS: 'ops@x.example, sales@x.example',
    POSTMARK_BCC_MASTERCLASS_PAYMENT_EMAILS: 'finance@x.example, ops@x.example',
  };
  assert.deepEqual(rr('masterclass', 'payment', env), { cc: undefined, bcc: 'ops@x.example, sales@x.example, finance@x.example' });
  assert.equal(MASTERCLASS_PAYMENT_BCC_VAR, 'POSTMARK_BCC_MASTERCLASS_PAYMENT_EMAILS');
});

test('masterclass QUOTE does NOT include the payment-only list', () => {
  const env = {
    POSTMARK_BCC_MASTERCLASS_EMAILS: 'ops@x.example',
    POSTMARK_BCC_MASTERCLASS_PAYMENT_EMAILS: 'finance@x.example',
  };
  assert.deepEqual(rr('masterclass', 'quote', env), { cc: undefined, bcc: 'ops@x.example' });
  // And no other flow's payment kind reads it either.
  assert.deepEqual(rr('public', 'payment', env), { cc: undefined, bcc: undefined });
});

test('an address in CC is removed from BCC — case-insensitively, CC wins', () => {
  const env = {
    POSTMARK_CC_BUNDLE_EMAILS: 'Lead@x.example, second@x.example',
    POSTMARK_BCC_BUNDLE_EMAILS: 'lead@X.EXAMPLE, Archive@x.example, SECOND@x.example',
  };
  assert.deepEqual(rr('bundle', 'quote', env), { cc: 'Lead@x.example, second@x.example', bcc: 'Archive@x.example' });
});

test('within one list: trimmed, empties dropped, de-duplicated case-insensitively, first spelling kept', () => {
  assert.deepEqual(parseAddressList(' a@x.example ,, B@x.example, b@X.example ,a@x.example, ,'), ['a@x.example', 'B@x.example']);
  assert.deepEqual(parseAddressList(''), []);
  assert.deepEqual(parseAddressList(undefined), []);
  assert.deepEqual(parseAddressList(42), []);
  const env = { POSTMARK_CC_INHOUSE_EMAILS: ' one@x.example, ONE@x.example ,,two@x.example ' };
  assert.equal(rr('inhouse', 'quote', env).cc, 'one@x.example, two@x.example');
});

test('empty and unset → undefined for that header, never an error', () => {
  assert.deepEqual(rr('public', 'quote', {}), { cc: undefined, bcc: undefined });
  assert.deepEqual(rr('public', 'quote', { POSTMARK_CC_PUBLIC_EMAILS: '', POSTMARK_BCC_PUBLIC_EMAILS: '  , , ' }), { cc: undefined, bcc: undefined });
  assert.deepEqual(rr('public', 'quote', { POSTMARK_CC_PUBLIC_EMAILS: 'a@x.example' }), { cc: 'a@x.example', bcc: undefined });
  assert.deepEqual(rr('public', 'quote', { POSTMARK_BCC_PUBLIC_EMAILS: 'a@x.example' }), { cc: undefined, bcc: 'a@x.example' });
  assert.deepEqual(rr('public', 'quote', undefined), { cc: undefined, bcc: undefined }, 'a missing env object is the same as an empty one');
});

test('an unset variable is logged once per resolution, by name, at info', () => {
  const lines = [];
  rr('masterclass', 'payment', { POSTMARK_CC_MASTERCLASS_EMAILS: 'a@x.example' }, (m) => lines.push(m));
  assert.equal(lines.length, 1, 'one line per send, not one per variable');
  assert.match(lines[0], /masterclass\/payment/);
  assert.match(lines[0], /POSTMARK_BCC_MASTERCLASS_EMAILS/);
  assert.match(lines[0], /POSTMARK_BCC_MASTERCLASS_PAYMENT_EMAILS/);
  assert.doesNotMatch(lines[0], /POSTMARK_CC_MASTERCLASS_EMAILS/, 'a SET variable is not reported');

  const quiet = [];
  rr('bundle', 'quote', { POSTMARK_CC_BUNDLE_EMAILS: 'a@x.example', POSTMARK_BCC_BUNDLE_EMAILS: 'b@x.example' }, (m) => quiet.push(m));
  assert.deepEqual(quiet, [], 'nothing is logged when everything is set');

  const blank = [];
  rr('bundle', 'quote', { POSTMARK_CC_BUNDLE_EMAILS: '   ', POSTMARK_BCC_BUNDLE_EMAILS: 'b@x.example' }, (m) => blank.push(m));
  assert.equal(blank.length, 1, 'a blank value is reported like an unset one');
  assert.match(blank[0], /POSTMARK_CC_BUNDLE_EMAILS/);
});

test('unknown flow or kind throws — a programmer error, not a silent no-copy', () => {
  assert.throws(() => rr('promotion', 'quote', {}), /unknown flow "promotion"/);
  assert.throws(() => rr(undefined, 'quote', {}), /unknown flow/);
  assert.throws(() => rr('public', 'receipt', {}), /unknown kind "receipt"/);
  assert.throws(() => recipientVarsFor('PUBLIC'), /unknown flow/, 'flow keys are exact, lower-case');
  assert.deepEqual([...FLOWS], ['public', 'inhouse', 'bundle', 'careerpath', 'masterclass']);
  assert.deepEqual([...KINDS], ['quote', 'payment']);
});

test('kind defaults to quote', () => {
  const env = { POSTMARK_BCC_MASTERCLASS_EMAILS: 'ops@x.example', POSTMARK_BCC_MASTERCLASS_PAYMENT_EMAILS: 'finance@x.example' };
  assert.deepEqual(resolveRecipients('masterclass', { env, log: silent }), { cc: undefined, bcc: 'ops@x.example' });
});
