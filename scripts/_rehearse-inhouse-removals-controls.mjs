/**
 * REHEARSAL — undo the two in-house removals, and prove the suite goes RED.
 *
 * Same harness as the five sibling scripts: real edits to real files, a fresh
 * process per case, every target restored in a `finally`, every `find` required
 * to match EXACTLY ONCE.
 *
 * ── THE CASE THAT IS ABOUT VACUITY ─────────────────────────────────────────
 *   3. Restoring the course-code LINE reddens the "no code element" guard that
 *      REPLACED a guard which had gone vacuous. The old assertion said the
 *      headline code was not repeated underneath; with the code line deleted no
 *      row can duplicate one, so it became unfalsifiable. The replacement is the
 *      inverse and stronger — a resolved course shows no code element at all —
 *      and this case is what proves the replacement can fail.
 *
 * Usage: node scripts/_rehearse-inhouse-removals-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const INHT   = 'src/app/admin/registrations/_components/InhouseTable.jsx';
const CLIENT = 'src/app/admin/registrations/_components/RegistrationsClient.jsx';
const PAGE   = 'src/app/admin/registrations/page.jsx';

const INHR  = 'test/render/registrationsInhouseTable.test.mjs';
const PUBR  = 'test/render/registrationsPublicTable.test.mjs';
const STRIP = 'test/render/registrationsStatStrip.test.mjs';

if (process.argv[2] === '--child') {
  process.env.NODE_ENV = 'production';
  const { register } = await import('node:module');
  register(new URL('./test/loader.mjs', `file://${ROOT.split(path.sep).join('/')}/`));
  const { run } = await import('node:test');

  const files = process.argv.slice(3).map((f) => path.join(ROOT, f));
  const failed = [];
  let passed = 0;
  const stream = run({ files, isolation: 'none', concurrency: true });
  stream.on('test:pass', () => { passed += 1; });
  stream.on('test:fail', (e) => { failed.push(e.name); });
  stream.on('data', () => {});
  stream.on('close', () => console.log(`__RESULT__${JSON.stringify({ passed, failed })}`));
}

function runTests(files) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', ...files], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('__RESULT__'));
  if (!line) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error('the child produced no result line — it probably failed to start');
  }
  return JSON.parse(line.slice('__RESULT__'.length));
}

/** The tree is CRLF; the cases below are written with `\n`. */
function withEol(text, file) {
  return file.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n');
}

const ok = (b) => (b ? '✓' : '✖');
let failures = 0;
const check = (label, condition, detail = '') => {
  if (!condition) failures += 1;
  console.log(`     ${ok(condition)} ${label}${detail ? ` — ${detail}` : ''}`);
};

const CASES = [
  {
    name: '1. the audit hint comes back on the in-house date cell',
    why: 'ruled out after being seen in place — a second timestamp under the one the column is for',
    edits: [{
      file: INHT,
      find: 'export function InhouseTable({ items, courseNames = null, detailHref }) {',
      replace: 'export function InhouseTable({ items, lastEdited = {}, courseNames = null, detailHref }) {',
    }, {
      file: INHT,
      find: '                  <DateCell iso={row.createdAt} />',
      replace: '                  <DateCell iso={row.createdAt} entry={lastEdited[String(row._id)]} />',
    }],
    files: [INHR],
    /**
     * THIS CASE FIRED NOTHING ON ITS FIRST RUN, and the fix was in the TEST.
     *
     * The guard asserted against a render that supplied no `lastEdited` at all,
     * so re-wiring the component to display the hint left it green — there was
     * simply no data to display. It also carried
     * `assert.equal(/lastEdited/.test(html), false)`, which is true of every
     * possible render: `lastEdited` is a prop name and never reaches markup.
     *
     * The guard now renders the in-house table WITH an audit map it does not
     * accept (React drops unknown props), so the claim is "no hint even when the
     * data is there" — which this mutation can fail.
     */
    mustFail: ['the in-house row carries NO audit hint, and the public row still does'],
  },
  {
    name: '2. the hint is swept off BOTH tables',
    why: 'the likelier mistake: DateCell is shared, so a "remove the hint" edit looks table-agnostic',
    edits: [{
      file: 'src/app/admin/registrations/_components/PublicTable.jsx',
      find: '                  <DateCell iso={row.createdAt} entry={lastEdited[String(row._id)]} />',
      replace: '                  <DateCell iso={row.createdAt} />',
    }],
    files: [INHR, PUBR],
    mustFail: [
      'the in-house row carries NO audit hint, and the public row still does',
      'the audit hint renders on the row that has one and NOT on the rows that do not',
    ],
  },
  {
    name: '3. the course-code line comes back',
    why: 'replaces a guard that had gone vacuous — see the header',
    edits: [{
      file: INHT,
      find: '      {month ? (\n        <div className="flex h-[32px] items-center">\n'
        + '          <span className="truncate text-[13px] leading-[15px] text-[var(--text-secondary)]">\n'
        + '            {month}\n          </span>\n        </div>\n      ) : null}',
      replace: '      {(name || month) ? (\n        <div className="flex h-[32px] items-center gap-[7px]">\n'
        + '          {name ? (<span className="truncate font-mono text-[12px] leading-[15px] text-[var(--text-muted)]">{first}</span>) : null}\n'
        + '          {month ? (\n'
        + '          <span className="truncate text-[13px] leading-[15px] text-[var(--text-secondary)]">\n'
        + '            {month}\n          </span>\n          ) : null}\n        </div>\n      ) : null}',
    }],
    files: [INHR],
    mustFail: [
      'a resolved course shows NO code element — the code line is gone',
      'the course cell is bold name over the month — two lines, not one shared line',
      'a resolved course with NO month drops the second row entirely',
    ],
  },
  {
    name: '4. the unresolved course renders a placeholder instead of its code',
    why: 'the record holds the code and nothing else identifies the course',
    edits: [{
      file: INHT,
      find: '          {name ?? first}',
      replace: "          {name ?? '—'}",
    }],
    files: [INHR],
    mustFail: [
      'an unresolved course renders its CODE in the name slot, never empty',
      // Declared: NO_NAME_NO_MONTH's headline becomes the placeholder too, so the
      // assertion that its CODE is the headline reddens with it. Both are the same
      // finding seen from two fixtures.
      'an unresolved code with NO month drops the second row entirely',
    ],
    /*
      The multi-course row was declared to redden and does NOT: its first code
      RESOLVES, so the headline is a name either way and the +N badge is
      untouched. The placeholder only reaches rows whose lookup misses — which is
      the correct blast radius, and a wrong prediction on my part rather than a
      gap.
    */
  },
  {
    name: '5. page.jsx fetches the audit map for in-house again',
    why: 'a serial round trip per page load for data the table no longer renders',
    edits: [{
      file: PAGE,
      find: "  const lastEdited = source === 'inhouse'\n    ? {}\n    : await readLastEditedMap({",
      replace: '  const lastEdited = await readLastEditedMap({',
    }, {
      file: PAGE,
      find: "        entity: 'public',\n        recordIds: data.items.map((r) => String(r._id)),\n      });",
      replace: "        entity: source === 'inhouse' ? 'inhouse' : 'public',\n        recordIds: data.items.map((r) => String(r._id)),\n      });",
    }],
    files: [INHR],
    /**
     * DECLARED AS A NON-EVENT, and that is the honest reading rather than a gap
     * to paper over. The audit query is a SERVER concern in a `page.jsx` that
     * the render tier cannot mount — a server component with five awaits — so no
     * render assertion can see it, and the table would look identical either
     * way because it no longer accepts the prop.
     *
     * The waste is real (one serial round trip per in-house page load) and it is
     * invisible to this suite. It is reported as such rather than guarded by an
     * assertion that would have to be a source scan pretending to be a
     * behavioural one.
     */
    mustFail: [],
    mustStillPass: ['the in-house row carries NO audit hint, and the public row still does'],
  },
];

const ALL_TARGETS = [INHT, CLIENT, PAGE, 'src/app/admin/registrations/_components/PublicTable.jsx'];
const ALL_TESTS   = [INHR, PUBR, STRIP];

async function main() {
  const original = new Map(
    ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('══ IN-HOUSE REMOVALS CONTROL REHEARSAL ════════════════════════════════════');
  for (const rel of ALL_TARGETS) console.log(`   target: ${rel}`);
  console.log('   every file is restored in a finally, including on error');
  console.log('');

  try {
    console.log('── baseline (unmutated) ────────────────────────────────────────────────────');
    const base = runTests(ALL_TESTS);
    check('the guarding tests are green to start with', base.failed.length === 0,
      base.failed.length ? `already failing: ${base.failed.join(', ')}` : `${base.passed} passed`);
    console.log('');

    for (const c of CASES) {
      console.log(`── ${c.name} ${'─'.repeat(Math.max(0, 71 - c.name.length))}`);
      console.log(`   ${c.why}`);

      const applied = c.edits.map((e) => {
        const before = original.get(e.file);
        return { file: e.file, find: withEol(e.find, before), replace: withEol(e.replace, before) };
      });
      for (const e of applied) {
        const hits = original.get(e.file).split(e.find).length - 1;
        if (hits !== 1) {
          throw new Error(
            `case "${c.name}": the find text occurs ${hits} times in ${e.file}, expected exactly 1.\n` +
            `  ${JSON.stringify(e.find.slice(0, 130))}`,
          );
        }
      }
      const mutated = new Map(original);
      for (const e of applied) mutated.set(e.file, mutated.get(e.file).replace(e.find, e.replace));
      for (const [rel, text] of mutated) writeFileSync(path.join(ROOT, rel), text);

      const r = runTests(c.files);

      if (c.mustFail.length === 0) {
        check('DECLARED INVISIBLE: no test reddens, and that is reported not hidden',
          r.failed.length === 0, r.failed.length ? `unexpectedly red: ${r.failed.join(' | ')}` : '');
      }
      for (const name of c.mustFail) {
        check(`RED: ${name}`, r.failed.includes(name),
          r.failed.includes(name) ? '' : `still green (failures: ${r.failed.join(' | ') || 'none'})`);
      }
      for (const name of c.mustStillPass ?? []) {
        check(`green: ${name}`, !r.failed.includes(name), r.failed.includes(name) ? 'went red unexpectedly' : '');
      }
      const declared = new Set(c.mustFail);
      const surprises = r.failed.filter((n) => !declared.has(n));
      check('no undeclared failures', surprises.length === 0, surprises.length ? surprises.join(' | ') : '');

      for (const [rel, text] of original) writeFileSync(path.join(ROOT, rel), text);
      console.log('');
    }
  } finally {
    for (const [rel, text] of original) writeFileSync(path.join(ROOT, rel), text);
    console.log('── restored ────────────────────────────────────────────────────────────────');
    for (const rel of ALL_TARGETS) {
      const same = readFileSync(path.join(ROOT, rel), 'utf8') === original.get(rel);
      console.log(`   ${ok(same)} ${rel}`);
      if (!same) failures += 1;
    }
  }

  console.log('');
  console.log(failures === 0
    ? '══ ALL CONTROLS BEHAVED AS DECLARED ═══════════════════════════════════════'
    : `══ ${failures} CONTROL(S) DID NOT BEHAVE AS DECLARED ════════════════════════`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[2] !== '--child') await main();
