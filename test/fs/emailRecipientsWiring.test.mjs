import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * THE APP-WIDE CC/BCC PAIR IS RETIRED, AND EACH SENDER NAMES ITS FLOW.
 *
 * `buildCc()` / `buildBcc()` in postmark.js used to read POSTMARK_CC_EMAILS /
 * POSTMARK_BCC_EMAILS on every send, so every flow copied the same people —
 * and `buildCc(undefined)` discarded any caller CC. Two facts hold now, and a
 * source scan is the right instrument for both because each is a claim about
 * WHICH TEXT IS IN A FILE:
 *
 *   1. no file under src/ references either retired name (CODE view —
 *      comments are stripped, so a historical note may still say the name);
 *   2. every registration sender resolves its copies through
 *      `resolveRecipients(<its flow>, { kind })` — once per flow, twice for
 *      masterclass (quote and payment) — and postmark.js reads no env for them.
 *
 * Read from `.code`, never `.raw`: the senders' headers explain the old design
 * in prose, and a raw scan would be red on the explanation of the very thing
 * it guards (test/sourceScan.mjs, defect 1).
 */

const RETIRED = /\bPOSTMARK_(CC|BCC)_EMAILS\b/;

/** sender file → the `resolveRecipients(` call sites it must contain, as (flow, kind). */
const EXPECTED = {
  'src/lib/email/template-senders/public-registration.js':     [['public', 'quote']],
  'src/lib/registration/send-receipt.js':                       [['public', 'payment']],
  'src/lib/email/template-senders/inhouse-registration.js':    [['inhouse', 'quote']],
  'src/lib/email/template-senders/bundle-registration.js':     [['bundle', 'quote']],
  'src/lib/email/template-senders/careerpath-registration.js': [['careerpath', 'quote']],
  'src/lib/email/template-senders/masterclass.js':             [['masterclass', 'payment'], ['masterclass', 'quote']],
};

/** Every `resolveRecipients(<flow>, { kind: <kind> })` call in a code view, as [flow, kind] pairs. */
function callSites(code) {
  return [...code.matchAll(/resolveRecipients\(\s*['"]([a-z]+)['"]\s*,\s*\{\s*kind:\s*['"]([a-z]+)['"]/g)]
    .map((m) => [m[1], m[2]]);
}

const SRC = walkSources('src');

test('the walk reached the source tree and every expected sender', () => {
  assert.ok(SRC.length > 500, `walked only ${SRC.length} files`);
  for (const rel of Object.keys(EXPECTED)) {
    assert.ok(SRC.some((f) => f.rel === rel), `${rel} was not reached by the walk`);
  }
});

test('no file under src/ references POSTMARK_CC_EMAILS or POSTMARK_BCC_EMAILS (code view)', () => {
  const offenders = SRC.filter((f) => RETIRED.test(f.code)).map((f) => f.rel);
  assert.deepEqual(offenders, [], 'the app-wide pair is retired — every copy is per-flow via src/lib/email/recipients.js');
});

test('CONTROL: the retired-name matcher fires on a synthetic string that reads one', () => {
  assert.equal(RETIRED.test("const envRaw = process.env.POSTMARK_BCC_EMAILS ?? '';"), true);
  assert.equal(RETIRED.test('process.env.POSTMARK_CC_EMAILS'), true);
  assert.equal(RETIRED.test('process.env.POSTMARK_BCC_PUBLIC_EMAILS'), false, 'a per-flow name is not the retired one');
  assert.equal(RETIRED.test('POSTMARK_BCC_MASTERCLASS_PAYMENT_EMAILS'), false);
});

test('each registration sender contains exactly its expected resolveRecipients call sites', () => {
  for (const [rel, expected] of Object.entries(EXPECTED)) {
    const { code, withImports } = readSource(rel);
    assert.match(withImports, /from ['"]@\/lib\/email\/recipients['"]/, `${rel} does not import the resolver`);
    assert.deepEqual(callSites(code), expected, `${rel}: resolveRecipients call sites`);
    // The resolved pair reaches the send: `cc,` and `bcc,` (or `cc:`/`bcc:`) appear after the call.
    const after = code.slice(code.indexOf('resolveRecipients('));
    assert.match(after, /\bcc\s*[,:]/, `${rel} resolves recipients but never passes cc`);
    assert.match(after, /\bbcc\s*[,:]/, `${rel} resolves recipients but never passes bcc`);
  }
});

test('the resolver call precedes BOTH branches where a sender has a template send and an HTML fallback', () => {
  // The four flows with a fallback: the pair is resolved ONCE, before the
  // template send, so `plan.via === 'html'` reuses the same values. A resolver
  // call placed inside one branch would copy people on that path only.
  for (const rel of [
    'src/lib/email/template-senders/public-registration.js',
    'src/lib/registration/send-receipt.js',
    'src/lib/email/template-senders/inhouse-registration.js',
    'src/lib/email/template-senders/bundle-registration.js',
  ]) {
    const { code } = readSource(rel);
    const resolveAt = code.indexOf('resolveRecipients(');
    const templateAt = code.indexOf('sendTemplateEmail({');
    const fallbackAt = code.indexOf('sendEmail({');
    assert.ok(resolveAt !== -1 && templateAt !== -1 && fallbackAt !== -1, `${rel}: a landmark is missing`);
    assert.ok(resolveAt < templateAt, `${rel}: resolve after the template send`);
    assert.ok(templateAt < fallbackAt, `${rel}: the fallback is not after the template send`);
    assert.equal(code.slice(templateAt, fallbackAt).includes('resolveRecipients('), false, `${rel}: a second resolver call between the branches`);
  }
});

test('CONTROL: the call-site extractor reads flow and kind, and ignores a call with a different shape', () => {
  assert.deepEqual(
    callSites("const { cc, bcc } = resolveRecipients('masterclass', { kind: 'payment' });\nresolveRecipients(\"inhouse\", { kind: \"quote\" });"),
    [['masterclass', 'payment'], ['inhouse', 'quote']],
  );
  assert.deepEqual(callSites("resolveRecipients(flow, { kind })"), [], 'a computed flow is not a literal call site');
});

test('postmark.js: sendEmail and sendTemplateEmail take cc and bcc, and read no recipient env', () => {
  const { code } = readSource('src/lib/email/postmark.js');
  assert.match(code, /export async function sendEmail\(\{[^}]*\bcc\b[^}]*\bbcc\b[^}]*\}\)/, 'sendEmail must accept cc and bcc');
  assert.match(code, /export async function sendTemplateEmail\(\{[^}]*\bcc\b[^}]*\bbcc\b[^}]*\}\)/, 'sendTemplateEmail must accept cc and bcc');
  assert.equal(/buildCc|buildBcc/.test(code), false, 'the env-merging helpers are gone');
  const envReads = [...code.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(envReads)].sort(), ['POSTMARK_FROM_EMAIL', 'POSTMARK_SERVER_TOKEN'], 'postmark.js reads only its token and sender');
  assert.equal((code.match(/Cc: header\(cc\)/g) ?? []).length, 2, 'both payloads carry the caller cc');
  assert.equal((code.match(/Bcc: header\(bcc\)/g) ?? []).length, 2, 'both payloads carry the caller bcc');
});

test('the masterclass admin mails (to POSTMARK_ADMIN_EMAIL) pass NO cc/bcc', () => {
  const { code } = readSource('src/lib/email/template-senders/masterclass.js');
  const adminSends = [...code.matchAll(/sendEmail\(\{[\s\S]*?\}\)/g)].map((m) => m[0]);
  assert.equal(adminSends.length, 2, 'two admin sends');
  for (const s of adminSends) {
    assert.match(s, /to: adminEmail/);
    assert.equal(/\b(cc|bcc)\s*[,:]/.test(s), false, 'an admin mail must not copy the customer lists');
  }
});
