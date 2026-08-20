/**
 * THE CONTROLS FOR ROUND 8's GUARDS.
 *
 * A guard nobody has watched go red is a guard nobody has tested. This applies a
 * NAMED BREAK to the real source, prints the diff that landed so the edit can be
 * seen rather than trusted, and puts it back.
 *
 *   node scripts/_control-round8.mjs list
 *   node scripts/_control-round8.mjs verify
 *   node scripts/_control-round8.mjs apply <name>
 *   node test/run.mjs
 *   node scripts/_control-round8.mjs revert
 *
 * ── TEN CONTROLS WERE RETIRED WITH THE PATH THEY BROKE ─────────────────────
 * Round 8 built a sanctioned door through the paid gate — `updateAttendeesCountPaid`
 * and its ขอเพิ่มจำนวนผู้เข้าอบรม panel — and these controls broke it in ten
 * ways: `allow-decrease`, `no-roster-floor`, `recalc`, `race`, `drop-diff`,
 * `unlist-key`, `always-control`, `charged-from-count`, `prefill-draft` and
 * `wrong-door`.
 *
 * That door has been removed: a paid record's seat count cannot be changed by
 * any path. A control whose FIND text is gone is not a weaker control, it is a
 * TRAP — `spliceOnce` throws "the source has moved on", which reads like the
 * script has rotted rather than like the feature was deleted on purpose. So the
 * ten are deleted and named here instead.
 *
 * THE GATE ITSELF STILL HAS ITS CONTROLS. `ungate`, `wide-gate` and `dup-status`
 * break the rule that survived, and it survived STRICTER than it was written.
 *
 * ── `verify` EXISTS BECAUSE NOTHING ELSE RUNS THIS FILE ────────────────────
 * `npm test` never imports it, so a FIND that stops matching is invisible until
 * a human reaches for that control — which is exactly when they are relying on
 * it. `verify` resolves every FIND against the real tree and reports the ones
 * that no longer identify exactly one site. Run it after any change to the
 * files these controls point at.
 *
 * ── WHY A SCRIPT AND NOT A HAND EDIT ───────────────────────────────────────
 * A hand edit is not reproducible by the next reader, so "I checked it goes red"
 * is a claim rather than a procedure. And a hand edit is not reliably UNDONE — a
 * control left in the tree is a defect committed on purpose, which is the worst
 * possible outcome of testing a test. `revert` restores from a byte-for-byte
 * backup and `apply` refuses while one is outstanding.
 *
 * ── THE TREE IS CRLF ───────────────────────────────────────────────────────
 * Every FIND below is written with LF and spliced against whatever the file
 * actually stores, with the file's own ending preserved. A control that silently
 * rewrote 3,000 line endings would produce a diff touching the whole file and
 * make the real edit unreadable — which is exactly what this note prevents. The
 * diff printer reports the total line count before and after for the same
 * reason: if those two numbers are not equal to within the lines named, the
 * splice went wrong.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ACTIONS = 'src/lib/actions/registrations.js';
const CONTRACT = 'src/lib/audit/auditContract.js';
const CLIENT = 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx';
const SCHEMA = 'src/lib/schemas/register-public.js';
const SHELL = 'src/app/admin/registrations/_components/detailShell.jsx';
const PAGE = 'src/app/admin/registrations/page.jsx';
const CLIENT_LIST = 'src/app/admin/registrations/_components/RegistrationsClient.jsx';
const FILTERS = 'src/app/admin/registrations/_components/FilterPanel.jsx';

/**
 * Each break names the file, an exact FIND, its REPLACE, and — the part that
 * matters — WHICH assertions it is expected to redden. A break with no expected
 * set is not a control, it is a mutation.
 */
const BREAKS = {
  ungate: {
    file: ACTIONS,
    why: 'Remove the paid gate entirely — the exact state that shipped before round 8. Since the reversal there is no second door, so this restores an UNGUARDED count on a paid record rather than moving it to another path.',
    reddens: [
      'fs/attendeesCountPaidGate › updateRegistration raises the paid gate for attendeesCount and no other field',
      'fs/publicStatusWriteGate › the paid gate reaches attendeesCount ONLY',
    ],
    /**
     * ── ONE CLAIM WAS REMOVED FROM THIS LIST, MEASURED RATHER THAN REASONED ──
     *
     * It also named `fs/attendeesCountPaidGate › the gate is in the FILTER, and
     * it does not replace the cancellation lock`. That test STAYS GREEN under
     * this break, and the run that proved it is why the line is gone.
     *
     * It is not a weak test. The two claims are genuinely separable: this break
     * deletes `paidGuard = true`, while that test asserts the SHAPE of `blocked`
     * and of the filter — which is untouched. A gate can be correctly shaped and
     * never raised, and that is exactly the state this break produces.
     *
     * Per run.mjs's own note on controls that fire nothing, the honest move is
     * to SAY the claims are not separable by this break rather than to widen the
     * break until the number matches. The filter shape has no control of its
     * own; `dup-status` breaks it the other way, by making the list wrong.
     */
    find: '      if (!isNaN(n) && n >= 1 && n <= 50) update.attendeesCount = n;\n      paidGuard = true;',
    replace: '      if (!isNaN(n) && n >= 1 && n <= 50) update.attendeesCount = n;',
  },

  'wide-gate': {
    file: ACTIONS,
    why: 'Gate EVERY field on paid — round 1 undone as a side effect. The direction a careless widening goes.',
    reddens: [
      'fs/publicStatusWriteGate › the paid gate reaches attendeesCount ONLY — every other field stays editable',
      'fs/attendeesCountPaidGate › the gate is in the FILTER, and it does not replace the cancellation lock',
    ],
    find: "  const blocked = paidGuard ? ['cancelled', 'paid'] : ['cancelled'];",
    replace: "  const blocked = ['cancelled', 'paid'];",
  },

  'dup-status': {
    file: ACTIONS,
    why: 'Write the paid rule as a SECOND `status:` key. An object literal keeps the last duplicate, so this silently DELETES the cancellation lock while reading like an addition.',
    reddens: [
      'fs/attendeesCountPaidGate › the gate is in the FILTER, and it does not replace the cancellation lock',
      'fs/publicStatusWriteGate › updateRegistration refuses a write to a cancelled record, in the FILTER',
      'fs/inhouseWriteGate › updateRegistration gates BOTH sources',
    ],
    find: '  const filter = { _id: id, status: { $nin: blocked } };',
    replace: "  const filter = { _id: id, status: { $ne: 'cancelled' }, status: { $ne: 'paid' } };",
  },

  // ── the client half ──────────────────────────────────────────────────────

  'send-count': {
    file: CLIENT,
    why: 'Post attendeesCount on a paid record too. The server refuses on the KEY being present, so a plain name correction loses the whole save — each half correct alone.',
    reddens: [
      'fs/attendeesCountPaidGate › the attendee save OMITS attendeesCount on a paid record',
    ],
    find: `  const attendeePayload = countLockedByPayment
    ? { attendeesListProvided, attendees }
    : { attendeesListProvided, attendeesCount, attendees };`,
    replace: '  const attendeePayload = { attendeesListProvided, attendeesCount, attendees };',
  },

  'live-count-input': {
    file: CLIENT,
    why: 'Render the count input on a paid record too — the save then carries the key and is refused wholesale.',
    reddens: [
      'fs/attendeesCountPaidGate › the count INPUT is absent on a paid record, not disabled',
    ],
    find: `                    <p className="flex h-9 items-center text-sm text-[var(--text-primary)]">
                      {attendeesCount} ท่าน
                    </p>`,
    replace: `                    <input type="number" min={1} max={50} value={attendeesCount}
                      onChange={(e) => setAttendeesCount(parseInt(e.target.value, 10) || 1)} />`,
  },

  // ── item 3: the seat lock ────────────────────────────────────────────────

  'client-unlock': {
    file: CLIENT,
    why: 'THE ONE THAT MATTERS: remove BOTH client guards, so nothing on screen stops an over-capacity roster. The SERVER assertions must stay green — that is what proves the button was never the enforcement.',
    reddens: [
      'render/registrationAttendeeTab › at capacity the + button is DISABLED and states why',
      'render/registrationAttendeeTab › an ALREADY-OVER roster disables it too',
      'fs/rosterSeatLock › both + buttons read the SAME seatsAvailable, derived once',
    ],
    staysGreen: [
      'fs/rosterSeatLock › the roster ceiling is enforced in updateRegistration, both cases — THE MEASUREMENT: the lock survives the UI being gone',
    ],
    find: '  const seatsAvailable = rosterHasRoom({ attendeesListProvided, attendeesCount, attendees });',
    replace: '  const seatsAvailable = true;',
  },

  'no-server-lock': {
    file: ACTIONS,
    why: 'Remove the server ceiling entirely, leaving only the disabled button. The mirror of client-unlock.',
    reddens: [
      'fs/rosterSeatLock › the roster ceiling is enforced in updateRegistration, both cases',
      'fs/rosterSeatLock › the refusal NAMES the seat lock rather than blaming cancellation',
    ],
    find: "      filter.$expr = { $gte: ['$attendeesCount', rosterLength] };",
    replace: '      void rosterLength;',
  },

  'dup-off': {
    file: ACTIONS,
    why: 'Accept a duplicate attendee. The rule is the only thing standing between a roster and the same person entered twice.',
    reddens: [
      'fs/rosterSeatLock › the duplicate rule is imported, not re-implemented in the action',
    ],
    find: '      const dup = firstDuplicateAttendee(update.attendees);',
    replace: '      const dup = -1;',
  },

  'require-four': {
    file: ACTIONS,
    why: 'Put email and phone back on the admin path — the tightening direction of the asymmetry.',
    reddens: [
      'fs/rosterSeatLock › the ADMIN path requires only ชื่อ and นามสกุล',
    ],
    find: '        if (!a.firstName?.trim() || !a.lastName?.trim()) {',
    replace: '        if (!a.firstName?.trim() || !a.lastName?.trim() || !a.email?.trim() || !a.phone?.trim()) {',
  },

  'loosen-wizard': {
    file: SCHEMA,
    why: 'Loosen the CUSTOMER wizard to two fields — the other direction, and the one a reader "tidying the inconsistency" would reach for. It changes what the public form accepts.',
    reddens: [
      'fs/rosterSeatLock › the WIZARD’s zod is UNCHANGED and still demands all four',
    ],
    find: `  email:     z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  phone:     z.string().trim().regex(thaiPhoneRegex, 'รูปแบบเบอร์โทรไม่ถูกต้อง (10 หลัก หรือ +ประเทศ)'),
});`,
    replace: `  email:     z.string().optional(),
  phone:     z.string().optional(),
});`,
  },

  'flatten-over': {
    file: 'src/lib/registrations/attendeeInfo.js',
    why: 'Revert the roster derivation to `named >= count`, so an over-capacity roster reports `complete` again — exactly the state that hid one production record for three rounds.',
    reddens: [
      'pure/attendeeInfo › MORE named rows than declared is `over`',
      'pure/attendeeInfo › the production shape reproduces: 2 named against a count of 1',
      'render/registrationAttendeeTab › an ALREADY-OVER roster shows M > N, and shows it as wrong',
      'render/registrationDetailShell › all three roster branches still render',
    ],
    find: `  if (named > count) return { state: 'over', named, count };
  return { state: named === count ? 'complete' : 'incomplete', named, count };`,
    replace: "  return { state: named >= count ? 'complete' : 'incomplete', named, count };",
  },

  // ── item 2: the columns and the required-field warning ───────────────────

  'chip-back': {
    file: CLIENT,
    why: 'Reinstate the สถานะข้อมูล column in ATTENDEE_COLUMNS. The header set and the body cells then disagree by one — the exact defect the derived-header guard exists for.',
    reddens: [
      'render/registrationAttendeeTab › the table has five columns: #, name, email, phone, menu',
      'render/registrationDetailShell › the attendee table’s body rows have exactly as many cells as its header',
      'render/registrationDetailShell › the colgroup has one <col> per header cell',
      'render/registrationDetailShell › only the two FIXED columns are px',
    ],
    find: "  { key: 'phone',   label: 'เบอร์โทร',        share: 22.0 },",
    replace: "  { key: 'phone',   label: 'เบอร์โทร',        share: 22.0 },\n  { key: 'info',    label: 'สถานะข้อมูล',    share: 22.0 },",
  },

  'merge-contact': {
    file: CLIENT,
    why: 'Put the phone back inside the email cell, so a name-only row falls back once instead of twice.',
    reddens: [
      'render/registrationAttendeeTab › email and phone are separate cells, each falling back to its own dash',
      'render/registrationAttendeeTab › a row with NO contact details renders two dashes, one per column',
      'render/registrationDetailShell › an attendee with a name and no contact details renders TWO dashes',
    ],
    find: `                {a.phone ? (
                  <span className="block truncate text-[13px] leading-[17.25px] text-[var(--text-primary)]">
                    {a.phone}
                  </span>
                ) : (
                  <span className="text-[13px] leading-[17.25px] text-[var(--text-muted)]">—</span>
                )}`,
    replace: '                {a.phone}',
  },

  'asterisk-back': {
    file: CLIENT,
    why: 'Put `required` back on the attendee email — the screen claiming a field the server accepts empty. THE GAP THIS CLOSES: before round 8 added its pairing test, this change bound nothing at all.',
    reddens: [
      'fs/rosterSeatLock › the EDITOR agrees with the server about which fields are required',
    ],
    find: '                          <EditField label="อีเมล" type="email" value={a.email} onChange={(v) => updateAttendee(i, \'email\', v)} />',
    replace: '                          <EditField label="อีเมล" type="email" required value={a.email} onChange={(v) => updateAttendee(i, \'email\', v)} />',
  },

  'silent-save': {
    file: CLIENT,
    why: 'Remove the per-row warning, leaving only the page-level error AFTER a failed save — which cannot say which of fifty rows is at fault.',
    reddens: [
      'fs/rosterSeatLock › the warning renders in the ROW, before the save, and does not disable it',
    ],
    find: '                        {missing.length ? (',
    replace: '                        {false ? (',
  },

  // ── item 1: the copy affordance ──────────────────────────────────────────

  'copy-gated': {
    file: CLIENT,
    why: 'Wire the attendee row copy to the EDIT gate — the easiest mistake to make, since it sits beside an item that IS gated. Copying is a read and must survive the cancellation lock.',
    reddens: [
      'render/registrationCopyAffordance › every copy control survives the cancellation lock, on BOTH screens',
      'render/registrationAttendeeTab › the row menu still offers BOTH copies on a cancelled record',
    ],
    find: '    rowText\n      ? { key: \'copy-row\', icon: Copy, label: \'คัดลอกผู้เข้าอบรม\', onClick: () => copyText(rowText) }\n      : null,',
    replace: '    rowText && onEditRow\n      ? { key: \'copy-row\', icon: Copy, label: \'คัดลอกผู้เข้าอบรม\', onClick: () => copyText(rowText) }\n      : null,',
  },

  'copy-empty': {
    file: SHELL,
    why: 'Let CopyAction render for an empty value — a control that puts nothing on the clipboard and reads as broken. Round 5’s wrapped-but-empty defeat, at a different surface.',
    reddens: [
      'render/registrationCopyAffordance › CopyAction renders NOTHING for an empty or whitespace-only text',
      'render/registrationCopyAffordance › no copy control renders beside a value that is not there',
    ],
    find: "  const value = typeof text === 'string' ? text.trim() : '';\n  if (!value) return null;",
    replace: "  const value = typeof text === 'string' ? text.trim() : '';",
  },

  'copy-audits': {
    file: SHELL,
    why: 'Reach the server from a copy. The audit log is a record of CHANGES; a read is not one, and filling it with copies buries the changes it exists for.',
    reddens: [
      'render/registrationAttendeeTab › a copy control writes NO audit row',
    ],
    find: '      await navigator.clipboard.writeText(value);',
    replace: '      await navigator.clipboard.writeText(value);\n      await fetch(`/api/audit?copied=${encodeURIComponent(label)}`);',
  },

  'copy-comma': {
    file: 'src/lib/registrations/copyText.js',
    why: 'Separate the attendee fields with a comma. It pastes into ONE spreadsheet cell instead of three, and names and addresses contain commas.',
    reddens: [
      'pure/copyText › the separator is a TAB, and that is a decision about where this is pasted',
      'pure/copyText › one attendee is name, email, phone — in that order',
      'pure/copyText › a MISSING field keeps its column — the trailing tab is the point',
    ],
    find: "export const COPY_FIELD_SEPARATOR = '\\t';",
    replace: "export const COPY_FIELD_SEPARATOR = ', ';",
  },

  'copy-drop-empty': {
    file: 'src/lib/registrations/copyText.js',
    why: 'Drop absent fields instead of emptying them. Columns then shift per row and a pasted roster does not line up — invisible until someone sorts it.',
    reddens: [
      'pure/copyText › a MISSING field keeps its column — the trailing tab is the point',
    ],
    find: '  return [name, email, phone].join(COPY_FIELD_SEPARATOR);',
    replace: '  return [name, email, phone].filter(Boolean).join(COPY_FIELD_SEPARATOR);',
  },

  // ── item 5a: the q defect ────────────────────────────────────────────────

  'q-loose': {
    file: PAGE,
    why: 'REPRODUCE THE ORIGINAL DEFECT: stop passing `q` to the cards and the badges. The table filters to one row under cards still reading 39 — and this is the state that shipped until round 8.',
    reddens: [
      'fs/registrationsFilterWiring › every SCOPE_PARAM is PASSED by the page to all three',
    ],
    find: '    getRegistrationStatusCounts({ q, range, source, from, to, course }),',
    replace: '    getRegistrationStatusCounts({ range, source, from, to, course }),',
  },

  'q-dropped-by-builder': {
    file: 'src/lib/registrations/listFilter.js',
    why: 'Thread `q` everywhere and then drop it in the builder. Every SOURCE assertion still passes — the parameter is in all four signatures and all four call sites — and no number changes. Only a behaviour test can see this.',
    reddens: [
      'pure/listFilterDateCourse › EVERY dimension moves the scope — none is silently ignored',
      'pure/listFilterDateCourse › the SCOPE is what every number on the screen counts inside',
      'pure/listFilterDateCourse › a search AND a course both apply',
      'pure/listFilterDateCourse › every filter dimension composes into ONE query',
      'pure/registrationRangeFilter (search clauses)',
    ],
    staysGreen: [
      'fs/registrationsFilterWiring › every SCOPE_PARAM is accepted / PASSED — THE MEASUREMENT: a source guard cannot see a dimension that is threaded and then ignored',
    ],
    // RE-POINTED IN ROUND 10. `searchClauses` gained a third argument — the
    // course codes an in-house term resolved to — so the call in the FIND text
    // moved and this anchor went stale. Found by `verify`, not by anyone
    // reaching for the control: nothing in `npm test` imports this file, which
    // is the whole reason `verify` exists. The BREAK is unchanged — blank the
    // term so the builder silently drops `q`.
    find: '  const term = String(q ?? \'\').trim();\n  if (term) scope.$or = searchClauses(source, term, courseCodes);',
    replace: '  const term = \'\';\n  if (term) scope.$or = searchClauses(source, term, courseCodes);',
  },

  'scope-shrunk': {
    file: 'src/lib/registrations/listFilter.js',
    why: 'Take `q` out of the ENUMERATION. The guard then stops demanding it of anyone — which is exactly how `q` went missing for four rounds.',
    reddens: [
      'fs/registrationsFilterWiring › CONTROL: the enumeration is real, and the probe can miss a dimension',
    ],
    find: "export const SCOPE_PARAMS = Object.freeze(['q', 'range', 'from', 'to', 'course']);",
    replace: "export const SCOPE_PARAMS = Object.freeze(['range', 'from', 'to', 'course']);",
  },

  // ── item 5b: the panel ───────────────────────────────────────────────────

  'chips-read-range': {
    file: CLIENT_LIST,
    why: 'Light the chips from `range` instead of the resolved preset. วันนี้ stays lit above a table filtered to a custom range — two controls over one field, which is exactly what option (a) exists to prevent.',
    reddens: [
      'render/registrationFilterPanel › a CUSTOM range deselects EVERY chip — one value, two ways in',
    ],
    find: '                aria-pressed={dateWindow.preset === opt.value}',
    replace: '                aria-pressed={range === opt.value}',
  },

  'active-hidden': {
    file: FILTERS,
    why: 'Move the active-filter marker OFF the summary. The panel still reports it — but only when open, which is the one state where the reader does not need telling.',
    reddens: [
      'render/registrationFilterPanel › an ACTIVE filter shows on the SUMMARY — the part visible when closed',
      'render/registrationFilterPanel › the badge counts what is actually set — one filter reads 1',
      'render/registrationFilterPanel › an OPEN-ENDED range still counts and still says which end',
    ],
    find: '        {hasActive ? (\n          <span\n            title={active.join(\' · \')}',
    replace: '        {false ? (\n          <span\n            title={active.join(\' · \')}',
  },

  'swap-silent': {
    file: FILTERS,
    why: 'Swap the reversed range and say nothing. The reader typed one thing, the screen shows another, and nothing explains it — the correction becomes the screen deciding on their behalf.',
    reddens: [
      'render/registrationFilterPanel › a REVERSED range is corrected AND the panel says so',
    ],
    // `window` → `dateWindow`: the prop was renamed because the old name
    // shadowed the browser global and stopped FilterPanel mounting. This FIND
    // went stale in that commit and nothing said so — `npm test` does not import
    // this file. It is what `verify` was added for, and it found it on the first
    // run.
    find: '        {dateWindow.swapped ? (',
    replace: '        {false ? (',
  },

  'panel-empty': {
    file: FILTERS,
    why: 'Remove the course control, leaving a disclosure that opens onto less than it claims. The round-3 ruling forbids a control that opens onto nothing; this is the half-way version.',
    reddens: [
      'render/registrationFilterPanel › it opens onto TWO REAL FILTERS — the round-3 condition, asserted',
      'render/registrationFilterPanel › the course options come from the REGISTRATIONS, not a catalogue',
    ],
    find: '              id="reg-filter-course" name="course"',
    replace: '              id="reg-filter-course" name="course-disabled"',
  },

  'panel-state': {
    file: FILTERS,
    why: 'Copy a filter into useState — the shape that shipped wrong chrome over right data on this very screen.',
    reddens: [
      'fs/urlFilterNoState › FilterPanel: no filter is copied into useState',
    ],
    find: "import { SlidersHorizontal, X } from 'lucide-react';",
    replace: "import { useState } from 'react';\nimport { SlidersHorizontal, X } from 'lucide-react';",
    also: {
      find: '  const hasActive = active.length > 0;',
      replace: '  const [, setCourse] = useState(course);\n  const hasActive = active.length > 0;',
    },
  },

};

// ── Apply / revert ──────────────────────────────────────────────────────────

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-round8.state');

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const write = (rel, text) => writeFileSync(path.join(ROOT, rel), text, 'utf8');

/** Splice one occurrence, preserving the file's own line endings. */
function spliceOnce(source, find, replace, label) {
  const crlf = source.includes('\r\n');
  const needle = crlf ? find.replace(/\n/g, '\r\n') : find;
  const value = crlf ? replace.replace(/\n/g, '\r\n') : replace;
  const at = source.indexOf(needle);
  if (at === -1) {
    throw new Error(`${label}: the FIND text is not in the file — the source has moved on:\n---\n${find}\n---`);
  }
  if (source.indexOf(needle, at + needle.length) !== -1) {
    throw new Error(`${label}: the FIND text appears more than once — it does not identify one site`);
  }
  return source.slice(0, at) + value + source.slice(at + needle.length);
}

/** Line-numbered before/after for the region that changed. Proof it landed. */
function showDiff(rel, before, after) {
  const b = before.split(/\r?\n/);
  const a = after.split(/\r?\n/);
  let head = 0;
  while (head < b.length && head < a.length && b[head] === a[head]) head += 1;
  let tail = 0;
  while (tail < b.length - head && tail < a.length - head
         && b[b.length - 1 - tail] === a[a.length - 1 - tail]) tail += 1;

  console.log(`\n--- a/${rel}`);
  console.log(`+++ b/${rel}`);
  console.log(`@@ -${head + 1},${b.length - head - tail} +${head + 1},${a.length - head - tail} @@`);
  for (let i = head; i < b.length - tail; i += 1) console.log(`-${b[i]}`);
  for (let i = head; i < a.length - tail; i += 1) console.log(`+${a[i]}`);
  console.log(`\nfile lines ${b.length} -> ${a.length}; `
    + `${b.length - head - tail} removed, ${a.length - head - tail} added.`);
  console.log('(A control that changed the whole file is a control that failed — check those numbers.)');
}

const [, , cmd, name] = process.argv;

if (!cmd || cmd === 'list') {
  console.log('Round 8 controls:\n');
  for (const [key, brk] of Object.entries(BREAKS)) {
    console.log(`  ${key}`);
    console.log(`      ${brk.why}`);
    for (const r of brk.reddens) console.log(`      red: ${r}`);
    console.log('');
  }
  process.exit(0);
}

if (cmd === 'verify') {
  /**
   * Every FIND, resolved against the real tree. Reports rather than throws on
   * the first failure: one stale anchor usually means several, and a reader
   * fixing them wants the whole list.
   *
   * `also` blocks are checked too — a two-part control with one live half is
   * the same trap in a costume.
   */
  const stale = [];
  for (const [key, brk] of Object.entries(BREAKS)) {
    const source = read(brk.file);
    const crlf = source.includes('\r\n');
    for (const [part, spec] of [['find', brk], ['also', brk.also]].filter(([, s]) => s)) {
      const needle = crlf ? spec.find.replace(/\n/g, '\r\n') : spec.find;
      const first = source.indexOf(needle);
      if (first === -1) stale.push(`${key}${part === 'also' ? '.also' : ''}: FIND is gone from ${brk.file}`);
      else if (source.indexOf(needle, first + needle.length) !== -1) {
        stale.push(`${key}${part === 'also' ? '.also' : ''}: FIND matches more than once in ${brk.file}`);
      }
    }
  }
  const total = Object.keys(BREAKS).length;
  if (stale.length === 0) {
    console.log(`all ${total} controls resolve to exactly one site each.`);
    process.exit(0);
  }
  console.error(`${stale.length} of ${total} controls no longer identify one site:\n`);
  for (const line of stale) console.error(`  ${line}`);
  console.error('\nEither the source moved (re-point the FIND) or the feature was removed '
    + '(delete the control and name it in the header, as the round-8 seat-count ten are).');
  process.exit(1);
}

if (cmd === 'revert') {
  if (!existsSync(STATE)) { console.log('nothing to revert'); process.exit(0); }
  const rel = readFileSync(STATE, 'utf8').trim();
  const backup = path.join(ROOT, rel + BACKUP_SUFFIX);
  if (!existsSync(backup)) throw new Error(`the backup for ${rel} is gone — restore it from git`);
  const original = readFileSync(backup, 'utf8');
  write(rel, original);
  unlinkSync(backup);
  unlinkSync(STATE);
  console.log(`reverted ${rel} (${original.length} bytes restored)`);
  process.exit(0);
}

if (cmd !== 'apply' || !BREAKS[name]) {
  console.error(`unknown break "${name ?? ''}" — run \`list\``);
  process.exit(2);
}
if (existsSync(STATE)) {
  console.error('a control is already applied — revert it before applying another');
  process.exit(2);
}

const brk = BREAKS[name];

/**
 * ══ EVERY KEY MUST BE KNOWN, AND THAT IS NOT PEDANTRY ═══════════════════════
 *
 * `panel-state` declared an `also` — a SECOND edit — and this harness silently
 * ignored it, applying only the first. The control then reported "stayed green"
 * for a break that was never fully made, which is the worst possible output from
 * a tool whose entire job is to tell you whether a guard fires.
 *
 * It looked exactly like a vacuous guard and it was a broken harness. So an
 * unrecognised key is now a hard failure: a control cannot quietly do less than
 * it says.
 */
const KNOWN_KEYS = new Set(['file', 'why', 'reddens', 'staysGreen', 'find', 'replace', 'also']);
for (const key of Object.keys(brk)) {
  if (!KNOWN_KEYS.has(key)) {
    console.error(`${name}: unknown key "${key}". A control that declares something this harness `
      + 'does not apply reports a weaker break than it claims — see the note above.');
    process.exit(2);
  }
}

const before = read(brk.file);
let after = spliceOnce(before, brk.find, brk.replace, name);
// A SECOND SITE, when one edit cannot express the break — e.g. an import plus
// its use. `spliceOnce` throws if it does not land, so a half-applied control is
// now impossible rather than merely unlikely.
if (brk.also) after = spliceOnce(after, brk.also.find, brk.also.replace, `${name} (second site)`);

writeFileSync(path.join(ROOT, brk.file + BACKUP_SUFFIX), before, 'utf8');
write(brk.file, after);
writeFileSync(STATE, brk.file, 'utf8');

console.log(`APPLIED: ${name}\n${brk.why}`);
showDiff(brk.file, before, after);
console.log('\nEXPECTED RED:');
for (const r of brk.reddens) console.log(`  ${r}`);
console.log('\nnow: node test/run.mjs   then: node scripts/_control-round8.mjs revert');
