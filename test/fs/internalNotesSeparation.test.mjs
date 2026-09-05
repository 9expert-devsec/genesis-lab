import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * THE CUSTOMER'S NOTE AND THE INTERNAL NOTE ARE NEVER READ OR WRITTEN THROUGH
 * ONE PATH.
 *
 * ══ THE TRAP THIS GUARDS, MEASURED ══════════════════════════════════════════
 *
 * `register_public.notes` ALREADY EXISTED before internal notes were built. It
 * holds THE CUSTOMER'S OWN NOTE — non-empty on 31 of 39 documents — and it is
 * QUOTED BACK TO THEM in the confirmation email. An internal note must never be.
 *
 * So the new field is NOT called `notes`. The four fields, side by side:
 *
 *     model             CUSTOMER note (they see it)   INTERNAL note (never)
 *     ───────────────   ──────────────────────────    ─────────────────────
 *     RegisterPublic    `notes`     String(500)       `adminNotes`  Array
 *     RegisterInhouse   `message`   String(2000)      `adminNotes`  Array
 *
 * The failure mode is not a crash. It is one line — a helper that takes "the
 * note", a template that renders "the note", a projection that selects both —
 * and then an internal note about what a customer can afford arrives in their
 * inbox. Nothing would fail; it would just send.
 *
 * ══ WHAT THIS FILE CAN AND CANNOT SEE ═══════════════════════════════════════
 *
 * It is a source scan, so it sees TEXT. It cannot see computed access
 * (`doc[field]`), and it cannot prove intent. What it CAN do is assert that no
 * single function body mentions both names — which is where a shared path would
 * have to appear — and that the customer-facing surfaces never mention the
 * internal one at all. That second half is the one that matters most, because
 * it is the direction with a real-world consequence.
 */

const CUSTOMER_FIELDS = ['notes', 'message'];
const INTERNAL_FIELD  = 'adminNotes';

// ── 1. No customer-facing surface mentions the internal field ───────────────

/**
 * Everything that renders to, or is sent to, a customer.
 *
 * The email layer is the whole point: a template or a model that learned the
 * internal field is exactly how the note reaches an inbox.
 */
const CUSTOMER_SURFACES = [
  'src/lib/email/models/publicRegistrationModel.js',
  'src/lib/email/models/inhouseRegistrationModel.js',
  'src/lib/email/models/publicPaidReceiptModel.js',
  'src/lib/email/templates/registration-user.js',
  'src/lib/email/templates/registration-inhouse-user.js',
  'src/lib/email/templates/registration-paid.js',
  'src/lib/email/template-senders/public-registration.js',
  'src/lib/email/template-senders/inhouse-registration.js',
  'src/lib/registration/build-public.js',
  'src/lib/registration/create-public.js',
  'src/lib/registration/send-receipt.js',
];

test('NO customer-facing surface mentions adminNotes', () => {
  for (const rel of CUSTOMER_SURFACES) {
    const src = readSource(rel);
    assert.ok(!src.code.includes(INTERNAL_FIELD),
      `${rel} references ${INTERNAL_FIELD}. This is the path by which an internal note `
      + 'about a customer reaches that customer. Nothing would throw; it would just send.');
  }
});

test('CONTROL: those surfaces DO mention the customer note, so the scan reaches them', () => {
  /**
   * Without this, the assertion above passes on eleven files that were renamed,
   * deleted, or that this list simply has wrong — ∅ contains no forbidden
   * string. At least one file in the set must demonstrably talk about notes.
   */
  const mentioning = CUSTOMER_SURFACES.filter((rel) => {
    const code = readSource(rel).code;
    return CUSTOMER_FIELDS.some((f) => new RegExp(`\\b${f}\\b`).test(code));
  });
  assert.ok(mentioning.length >= 2,
    `only ${mentioning.length} of the customer surfaces mention a customer note field — `
    + 'this list is stale and the assertion above is checking nothing');
});

// ── 2. No single function body touches both ─────────────────────────────────

/**
 * ── THE UNIT IS A STATEMENT, NOT A FUNCTION BODY. MEASURED. ────────────────
 *
 * The first draft split on function boundaries and asserted that no BODY
 * mentioned both. It reddened on both detail clients — correctly, by its own
 * rule, and WRONGLY as a statement about the code: each screen renders BOTH
 * notes, in two separate cards, so its component function necessarily reads
 * `doc.notes` and `doc.adminNotes` a few lines apart. That is the feature.
 *
 * Widening the allowlist to cover them would have exempted the two files where
 * a real leak is most likely — the only two that hold both values at once — so
 * the guard would have been strongest exactly where it was needed least.
 *
 * So the unit is a STATEMENT. The hazard is one expression handling both:
 *
 *     doc.notes ?? doc.adminNotes          a fallback chain
 *     render([doc.notes, doc.adminNotes])  one renderer, two sources
 *     const note = internal || customer    one variable, either meaning
 *
 * Every one of those is a single statement. Two `useState` calls on adjacent
 * lines are not, and must not be flagged.
 *
 * Bounded on `;` and newline rather than on `)` — sourceScan's header, defect 6:
 * a matcher bounded by a delimiter that occurs inside arrow functions cannot
 * cross its own subject.
 */
function statements(code) {
  return code.split(/[;\n]/).filter((s) => s.trim().length > 0);
}

/**
 * Files where both names legitimately appear IN ONE STATEMENT, with a reason.
 *
 * Empty, and that is the finding: after moving to statement granularity there
 * is not one place in the tree where a single expression touches both. An entry
 * here would need arguing for in a diff.
 */
const BOTH_IN_ONE_STATEMENT_ALLOWED = {};

test('no single STATEMENT reads or writes both a customer note and adminNotes', () => {
  const offenders = [];
  for (const src of walkSources('src')) {
    if (BOTH_IN_ONE_STATEMENT_ALLOWED[src.rel]) continue;
    if (!src.code.includes(INTERNAL_FIELD)) continue;

    for (const stmt of statements(src.code)) {
      if (!stmt.includes(INTERNAL_FIELD)) continue;
      const alsoCustomer = CUSTOMER_FIELDS.filter((f) => new RegExp(`\\b(?:doc|data|d)\\.${f}\\b`).test(stmt));
      if (alsoCustomer.length) {
        offenders.push(`${src.rel}: \`${stmt.trim().slice(0, 90)}\` touches ${INTERNAL_FIELD} and ${alsoCustomer.join('/')}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'one expression handles both the customer note and the internal note. That is how the '
    + 'internal one ends up where the customer one goes:\n  ' + offenders.join('\n  '));
});

test('CONTROL: the statement splitter and the field probe both find real things', () => {
  /**
   * Both halves of the scan can silently find nothing — a splitter returning one
   * giant statement, or a probe whose regex matches no real access — and either
   * makes the assertion above pass on everything.
   */
  const client = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx');
  const stmts = statements(client.code);
  assert.ok(stmts.length > 200, `the splitter produced ${stmts.length} statements for a 1400-line file`);
  assert.ok(stmts.some((s) => s.includes(INTERNAL_FIELD)),
    'no statement of the public detail client mentions adminNotes — the scan skips this file entirely');
  assert.ok(stmts.some((s) => /\bdoc\.notes\b/.test(s)),
    'the doc.<field> probe shape matches no statement in a file that definitely reads the customer note');
});

test('CONTROL: the scan DOES fire on a statement that touches both', () => {
  /**
   * The assertion above is a `deepEqual(x, [])`, which is satisfied by a scan
   * that finds nothing for any reason. This runs the same two probes over a
   * synthetic offender and requires a hit — so "no offenders" means "looked and
   * found none" rather than "looked at nothing".
   */
  const leak = 'const note = doc.adminNotes ?? doc.notes;';
  const hits = statements(leak).filter((s) =>
    s.includes(INTERNAL_FIELD) && CUSTOMER_FIELDS.some((f) => new RegExp(`\\b(?:doc|data|d)\\.${f}\\b`).test(s)));
  assert.equal(hits.length, 1, 'the scan cannot see a fallback chain between the two fields');

  // …and it does NOT fire on the legitimate shape: two separate statements.
  const fine = 'const a = doc.notes;\nconst b = readNotes(doc.adminNotes);';
  const falsePositives = statements(fine).filter((s) =>
    s.includes(INTERNAL_FIELD) && CUSTOMER_FIELDS.some((f) => new RegExp(`\\b(?:doc|data|d)\\.${f}\\b`).test(s)));
  assert.equal(falsePositives.length, 0,
    'the scan flags two adjacent statements — it would redden on both detail screens by design');
});

/**
 * ── AND THE TWO CLIENTS KEEP THEM IN SEPARATE VARIABLES ───────────────────
 *
 * The statement rule allows a component to read both, which is right — each
 * screen renders both, in two cards. What it cannot check is that the two
 * values stay apart AFTER being read. This does, at the one place it matters:
 * the state each is held in.
 */
test('each detail client holds the two notes in DISTINCT state', () => {
  const PUB = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx');
  const INH = readSource('src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx');

  // Public: the customer note in `notes`, the internal list in `internalNotes`.
  assert.match(PUB.code, /useState\(doc\.notes \?\? ''\)/, 'the public customer note lost its own state');
  assert.match(PUB.code, /useState\(\(\) => readNotes\(doc\.adminNotes\)\)/,
    'the public internal notes are not read through readNotes into their own state');

  // In-house: the customer note is `message`.
  assert.match(INH.code, /useState\(doc\.message \?\? ''\)/, 'the in-house customer note lost its own state');
  assert.match(INH.code, /useState\(\s*\(\) => readNotes\(doc\.adminNotes/,
    'the in-house internal notes are not read through readNotes into their own state');
});

// ── 3. The two fields keep their distinct names ─────────────────────────────

test('the internal field is NOT called `notes` on either model', () => {
  /**
   * The whole trap in one assertion. `register_public.notes` is the customer's,
   * so an internal array under the same name would collide with a field that is
   * shown back to them — on 31 of 39 live documents.
   */
  for (const rel of ['src/models/RegisterPublic.js', 'src/models/RegisterInhouse.js']) {
    const code = readSource(rel).code;
    assert.match(code, /adminNotes:\s*\{\s*type:\s*\[InternalNoteSchema\]/,
      `${rel}: the internal notes field is not named adminNotes`);
    assert.ok(!/\bnotes:\s*\{\s*type:\s*\[/.test(code),
      `${rel}: a field literally called \`notes\` is typed as an array — that is the customer's field name`);
  }
});

test('the public customer note is STILL a plain capped String', () => {
  /**
   * The other side: `notes` must not have been quietly repurposed. It is the
   * CUSTOMER'S, it is a plain capped String, and 31 live documents hold one.
   *
   * ── THE CAP MOVED 500 → 2000, AND THE CLAIM HERE DID NOT ─────────────────
   * The legacy Drupal import became a writer of this field and carries customer
   * text up to 559 characters, so the STORAGE FLOOR was widened to 2000 (the
   * same limit RegisterInhouse.message already had). The 500 was incidental to
   * what this test is actually about — that `notes` is still a String and has
   * not become an InternalNoteSchema array like `adminNotes`.
   *
   * The 500 itself is NOT unguarded. It moved to where it belongs: the wizard's
   * zod still caps a customer's typing at 500, and test/pure/legacyImportDedup
   * asserts the floor and the wizard TOGETHER so neither can be tidied into
   * agreement with the other.
   */
  const code = readSource('src/models/RegisterPublic.js').code;
  assert.match(code, /notes:\s*\{\s*type:\s*String[^}]*maxlength:\s*2000/,
    'register_public.notes is no longer a capped String — the customer note changed shape');
  assert.doesNotMatch(code, /notes:\s*\{\s*type:\s*\[/,
    'register_public.notes became an ARRAY — that is `adminNotes`, and it must never reach the customer');
});

test('the in-house customer note is still `message`, not renamed into the internal one', () => {
  const code = readSource('src/models/RegisterInhouse.js').code;
  assert.match(code, /message:\s*\{\s*type:\s*String/, 'the in-house customer note changed shape');
});
