/**
 * THE CONTROLS FOR ROUND 10's GUARDS.
 *
 * A guard nobody has watched go red is a guard nobody has tested. This applies a
 * NAMED BREAK to the real source, prints the diff that landed so the edit can be
 * seen rather than trusted, and puts it back.
 *
 *   node scripts/_control-round10.mjs list
 *   node scripts/_control-round10.mjs verify
 *   node scripts/_control-round10.mjs apply <name>
 *   node test/run.mjs
 *   node scripts/_control-round10.mjs revert
 *
 * Same harness as _control-round8.mjs, including the CRLF handling and the
 * unknown-key hard failure that round earned. `verify` is carried over too: it
 * resolves every FIND against the tree, because `npm test` never imports this
 * file and a stale anchor is otherwise invisible until someone reaches for the
 * control — which is exactly when they are relying on it.
 *
 * ── SOME OF THESE ARE EXPECTED TO LEAVE PART OF THE SUITE GREEN ────────────
 * `staysGreen` is not a footnote here, it is a measurement. The per-source work
 * has a pure tier that mirrors the client's navigators and an fs tier that
 * checks the client USES them, and breaking the client must move the second
 * without moving the first. A control that reddened both would mean the pure
 * tier was reaching into the component, and a control that reddened neither
 * would mean nothing was watching. See `no-namespace`.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PAGE    = 'src/app/admin/registrations/page.jsx';
const CLIENT  = 'src/app/admin/registrations/_components/RegistrationsClient.jsx';
const ACTIONS = 'src/lib/actions/registrations.js';
const FILTERS = 'src/lib/registrations/listFilter.js';
const SEARCH  = 'src/lib/registrations/inhouseCourseSearch.js';
const SCOPE   = 'src/lib/registrations/filterScope.js';

const BREAKS = {
  // ── item 1: filters are remembered per source ────────────────────────────

  'no-namespace': {
    file: CLIENT,
    why: 'Write every filter to the BARE key — the exact state that shipped before round 10, where switching source carried the values across.',
    reddens: [
      'fs/perSourceFilterWiring › navigate writes every key through filterParamKey, never bare',
    ],
    staysGreen: [
      'pure/perSourceFilters › every preservation test — THE MEASUREMENT: the pure tier mirrors the navigators through the real helpers and cannot see whether the COMPONENT uses them. That is why the fs file exists, and this control is the proof that neither tier is redundant.',
    ],
    find: '      const key = filterParamKey(name, source);',
    replace: '      const key = name;',
  },

  'switch-resets': {
    file: CLIENT,
    why: 'Make switching source clear the other side\'s filters — the "one set spanning both sources" behaviour, rebuilt as an explicit reset.',
    reddens: [
      'fs/perSourceFilterWiring › switchSource touches ONE parameter, and no filter key',
    ],
    find: "    if (value === 'public') params.delete('source');",
    replace: "    params.delete('q'); params.delete('inhouse.q');\n    if (value === 'public') params.delete('source');",
  },

  'navigate-source': {
    file: CLIENT,
    why: 'Put `source` back into navigate\'s serialised object. A toggle click would then write the CURRENT side\'s values while the page renders the other side.',
    reddens: [
      'fs/perSourceFilterWiring › navigate no longer serialises `source`, and switchSource does',
      'fs/urlFilterNoState › RegistrationsClient: a selector is written to the URL, and NOT by navigate',
    ],
    find: "    const next = { page: '1', status, q, range, from, to, course, ...overrides };",
    replace: "    const next = { page: '1', status, q, source, range, from, to, course, ...overrides };",
  },

  'page-bare-q': {
    file: PAGE,
    why: 'Read the search term from the BARE searchParams key. On an in-house render that is PUBLIC\'s term — the half-converted page, which looks right and crosses one filter over.',
    reddens: [
      'fs/perSourceFilterWiring › page.jsx derives no filter from a BARE searchParams key any more',
    ],
    find: '  const q      = active.q;',
    replace: "  const q      = typeof sp.q === 'string' ? sp.q : '';",
  },

  'badge-active-filters': {
    file: PAGE,
    why: 'Feed the other source\'s badge the ACTIVE source\'s filters — the pre-round-10 behaviour, which now counts a set no click can produce.',
    reddens: [
      'fs/perSourceFilterWiring › the other source\'s badge counts under the OTHER source\'s filters',
    ],
    find: '      q:      other.q,',
    replace: '      q,',
  },

  /**
   * ── THE PAIR THAT PROVES THE BADGE MATCHER DISCRIMINATES ─────────────────
   * `registrationsFilterWiring`'s badge assertion sat GREEN through round 10's
   * inversion of its own property, because `/\brange\b/` matched the KEY on both
   * sides. Re-pointing it at the VALUE is only worth something if the new probe
   * can actually tell the two apart — so there is a control in each direction.
   */
  'badge-active-range': {
    file: PAGE,
    why: 'DIRECTION ONE: feed the badge the ACTIVE source\'s range, by shorthand — the pre-round-10 meaning. The re-pointed assertion must redden; the old `/\\brange\\b/` probe would not have.',
    reddens: [
      'fs/registrationsFilterWiring › the toggle badge reads the OTHER source\'s own range, not the active one',
      'fs/perSourceFilterWiring › the other source\'s badge counts under the OTHER source\'s filters',
    ],
    find: '      range:  otherRange,',
    replace: '      range,',
  },

  'badge-other-range-spelling': {
    file: PAGE,
    why: 'DIRECTION TWO: keep the OTHER source\'s range but spell it `other.range` instead of the normalised local. The property is preserved, so NOTHING may redden — a guard that fails here is bound to a name rather than to the property, which is face TWO of defect 7.',
    reddens: [],
    staysGreen: [
      'fs/registrationsFilterWiring › the toggle badge reads the OTHER source\'s own range — THE MEASUREMENT: the probe accepts every spelling of "the other source\'s range" and rejects only the active one.',
      'fs/perSourceFilterWiring › the other source\'s badge counts under the OTHER source\'s filters',
    ],
    find: '      range:  otherRange,',
    replace: '      range:  other.range,',
  },

  'badge-spread': {
    file: PAGE,
    why: 'Spread the badge arguments instead of naming them. Behaviour is IDENTICAL and fs/registrationsFilterWiring stops seeing any dimension — defect 7, staged.',
    reddens: [
      'fs/perSourceFilterWiring › the badge call names every dimension and SPREADS none',
      'fs/registrationsFilterWiring › every SCOPE_PARAM is PASSED by the page to all three',
    ],
    find: `    getRegistrationTotal({
      q:      other.q,
      range:  otherRange,
      source: otherSource,
      from:   other.from,
      to:     other.to,
      course: other.course,
    }),`,
    replace: '    getRegistrationTotal({ ...other, range: otherRange, source: otherSource }),',
  },

  // ── item 2: in-house course options show names ───────────────────────────

  'drop-unresolvable': {
    file: PAGE,
    why: 'Drop options the catalogue could not name. THE ONE THAT HIDES ROWS WHILE LOOKING COMPLETE: ZZTEST-EXCEL-01\'s registrations become unreachable by filter and nothing says so.',
    reddens: [
      'render/inhouseCourseOptions › AN UNRESOLVABLE CODE STILL APPEARS, LABELLED WITH ITS CODE, AND IS SELECTABLE',
      'render/inhouseCourseOptions › every code handed to the panel reaches the dropdown',
    ],
    find: '    ? courseOptions.map((o) => ({',
    replace: '    ? courseOptions.filter((o) => courseNames[String(o.code).toLowerCase()]).map((o) => ({',
  },

  'label-as-value': {
    file: PAGE,
    why: 'Use the resolved NAME as the option value. Every existing ?course= link and bookmark breaks, and the filter matches nothing.',
    reddens: [
      'render/inhouseCourseOptions › every option keeps a code as its value — no label ever becomes the value',
    ],
    find: '        label: courseNames[String(o.code).toLowerCase()] || o.code,',
    replace: '        code: courseNames[String(o.code).toLowerCase()] || o.code,\n        label: courseNames[String(o.code).toLowerCase()] || o.code,',
  },

  // ── item 3: in-house search gains หลักสูตร ────────────────────────────────

  'codes-not-names': {
    file: SEARCH,
    why: 'THE TRAP THE MODULE EXISTS FOR: resolve by matching the term against the CODE rather than the name. Typing "Excel" then works by accident of naming and "Power BI" finds nothing — a search box failing silently at a field its placeholder promises.',
    reddens: [
      'pure/inhouseCourseSearch › a name substring resolves to every course that contains it',
      'pure/inhouseCourseSearch › it is a SUBSTRING match, matching what the other four clauses do',
      'pure/inhouseCourseSearch › searching by NAME reaches the query as an $in of resolved codes',
    ],
    find: '    if (String(name ?? \'\').toLowerCase().includes(needle)) hits.add(code);',
    replace: '    if (String(code ?? \'\').toLowerCase().includes(needle)) hits.add(code);',
  },

  'empty-in': {
    file: FILTERS,
    why: 'Emit `{$in: []}` for a term that resolved to nothing, rather than omitting the clause. Harmless inside an $or and it is the shape that becomes catastrophic the moment anyone moves the clause to $and.',
    reddens: [
      'pure/registrationRangeFilter › an unresolvable name adds no $in, and does not empty the rest of the query',
      'pure/inhouseCourseSearch › A NAME THAT RESOLVES TO NOTHING IS NO MATCH ON THAT TERM, NOT AN ERROR',
    ],
    find: '  if (codes.length) clauses.push({ coursesInterested: { $in: codes } });',
    replace: '  clauses.push({ coursesInterested: { $in: codes } });',
  },

  'no-code-clause': {
    file: FILTERS,
    why: 'Drop the RAW code clause, leaving only name resolution. Typing a course code then finds nothing — and ZZTEST-EXCEL-01, which has no name anywhere, becomes unsearchable by any means.',
    reddens: [
      'pure/registrationRangeFilter › in-house search matches coursesInterested by CODE, always',
      'pure/inhouseCourseSearch › searching by CODE reaches the query as a regex on the stored field',
      'pure/registrationRangeFilter › in-house search names company/contact fields and no public field',
    ],
    find: '    { coursesInterested: rx },\n  ];',
    replace: '  ];',
  },

  'counts-skip-resolve': {
    file: ACTIONS,
    why: 'Remove the resolution from the COUNTS action only, leaving the list and the badge with it. The classic shape of this screen\'s recurring defect: one of three consumers ignoring a dimension, so the cards disagree with the table below them.',
    reddens: [
      'fs/perSourceFilterWiring › all three query actions resolve the term and pass the codes to the builder',
      'fs/perSourceFilterWiring › the resolution has exactly ONE derivation site',
    ],
    find: '  const courseCodes = await inhouseCourseCodes({ q, source });\n  const scope = buildRegistrationScope({ q, source, range, from, to, course, courseCodes });',
    replace: '  const scope = buildRegistrationScope({ q, source, range, from, to, course, courseCodes: [] });',
  },

  'placeholder-lies': {
    file: FILTERS,
    why: 'Remove BOTH course clauses while leaving the placeholder promising หลักสูตร — the exact silent failure the placeholder rule exists to prevent.',
    reddens: [
      'fs/perSourceFilterWiring › the in-house placeholder names หลักสูตร only because the clause exists',
    ],
    find: '    { coursesInterested: rx },\n  ];\n  const codes',
    replace: '  ];\n  const codes',
  },

  'status-not-per-source': {
    file: SCOPE,
    why: 'Exempt `status` from the namespace — the tempting special case, on the grounds that a status means the same thing on both sides. It is true and it makes the rule unpredictable.',
    reddens: [
      'pure/perSourceFilters › every per-source parameter is independent, one at a time',
      'pure/perSourceFilters › CONTROL: the enumeration is real, and defaults are genuinely absent',
    ],
    find: "export function filterParamKey(name, source) {\n  return source === 'inhouse' ? `inhouse.${name}` : name;\n}",
    replace: "export function filterParamKey(name, source) {\n  if (name === 'status') return name;\n  return source === 'inhouse' ? `inhouse.${name}` : name;\n}",
  },
};

// ── Apply / revert ──────────────────────────────────────────────────────────

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-round10.state');

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
  console.log('Round 10 controls:\n');
  for (const [key, brk] of Object.entries(BREAKS)) {
    console.log(`  ${key}`);
    console.log(`      ${brk.why}`);
    for (const r of brk.reddens) console.log(`      red:   ${r}`);
    for (const g of brk.staysGreen ?? []) console.log(`      green: ${g}`);
    console.log('');
  }
  process.exit(0);
}

if (cmd === 'verify') {
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
    + '(delete the control and name it in the header).');
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

if (cmd !== 'apply' || !name || !BREAKS[name]) {
  console.error(`unknown control "${name ?? ''}" — run \`list\` to see them`);
  process.exit(2);
}
if (existsSync(STATE)) {
  console.error('a control is already applied — revert it before applying another');
  process.exit(2);
}

const brk = BREAKS[name];

// Round 8 earned this: a control that declares a key this harness does not apply
// reports a WEAKER break than it claims, and then "stayed green" is a lie about
// a break that never fully landed.
const KNOWN_KEYS = new Set(['file', 'why', 'reddens', 'staysGreen', 'find', 'replace', 'also']);
for (const key of Object.keys(brk)) {
  if (!KNOWN_KEYS.has(key)) {
    console.error(`${name}: unknown key "${key}". A control that declares something this harness `
      + 'does not apply reports a weaker break than it claims.');
    process.exit(2);
  }
}

const before = read(brk.file);
let after = spliceOnce(before, brk.find, brk.replace, name);
if (brk.also) after = spliceOnce(after, brk.also.find, brk.also.replace, `${name} (second site)`);

writeFileSync(path.join(ROOT, brk.file + BACKUP_SUFFIX), before, 'utf8');
write(brk.file, after);
writeFileSync(STATE, brk.file, 'utf8');

console.log(`APPLIED: ${name}\n${brk.why}`);
showDiff(brk.file, before, after);
console.log('\nEXPECTED RED:');
for (const r of brk.reddens) console.log(`  ${r}`);
if (brk.staysGreen) {
  console.log('\nEXPECTED GREEN (this is a measurement, not a gap):');
  for (const g of brk.staysGreen) console.log(`  ${g}`);
}
console.log('\nnow: node test/run.mjs   then: node scripts/_control-round10.mjs revert');
