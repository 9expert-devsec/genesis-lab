import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrubSource } from '../sourceScan.mjs';

// CourseFaqManager is rendered by several admin surfaces, and its own docstring
// claimed THREE while five were live — the program and skill hosts had been
// added without the comment following. That mattered the moment a fix was
// verified: "tested on the course tab and the career-path page" silently left
// three surfaces unexercised.
//
// This guard pins the host set, so a sixth surface cannot be added without
// this file and the docstring both being updated.
//
// WHAT IT CANNOT SEE: a host that reaches the component indirectly (re-exported
// through a barrel file, or rendered by a component that imports it on the
// host's behalf). It matches a direct import of the specifier, which is how all
// five do it today.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..', 'src');
const SPECIFIER = '@/app/admin/_components/CourseFaqManager';
const COMPONENT = path.join('src', 'app', 'admin', '_components', 'CourseFaqManager.jsx');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Comments are stripped before matching — a commented-out import is not a host,
 * and counting one would inflate the set the next person has to reconcile.
 * Imports are deliberately KEPT here: an import IS the subject of this guard.
 * Scrubbing lives in test/sourceScan.mjs; see its header for the defect list.
 */
const stripComments = (src) => scrubSource(src, { stripImports: false });

/** THE MATCHER, as a pure function so a control can feed it a synthetic list. */
function findHosts(files, read) {
  return files
    .filter((f) => !f.endsWith('CourseFaqManager.jsx'))
    .filter((f) => stripComments(read(f)).includes(SPECIFIER))
    .map((f) => path.relative(path.join(HERE, '..', '..'), f).split(path.sep).join('/'))
    .sort();
}

const readFile = (f) => readFileSync(f, 'utf8');
const ALL_FILES = walk(SRC);

const EXPECTED_HOSTS = [
  'src/app/admin/career-paths/[id]/faqs/_components/CareerPathFaqClient.jsx',
  'src/app/admin/courses/[courseId]/_components/FaqTab.jsx',
  'src/app/admin/local-faqs/program/[id]/_components/ProgramFaqClient.jsx',
  'src/app/admin/local-faqs/skill/[id]/_components/SkillFaqClient.jsx',
  'src/app/admin/masterclass/[id]/faqs/_components/MasterclassFaqClient.jsx',
];

test('CourseFaqManager has exactly these five hosts', () => {
  // An exact set, never a count: a matcher that silently stopped working would
  // return [] and a `length >= 3` assertion would have to be rewritten to catch
  // it, which is how the docstring got out of date in the first place.
  assert.deepEqual(findHosts(ALL_FILES, readFile), EXPECTED_HOSTS);
});

test('CONTROL: a sixth host is reported', () => {
  // Without this, `findHosts` returning a hardcoded list would satisfy the test
  // above forever.
  const fakeFile = path.join(SRC, 'app', 'admin', 'fake', 'SixthFaqHost.jsx');
  const fakeRead = (f) =>
    f === fakeFile ? `import { CourseFaqManager } from '${SPECIFIER}';` : readFile(f);
  const found = findHosts([...ALL_FILES, fakeFile], fakeRead);
  assert.equal(found.length, EXPECTED_HOSTS.length + 1);
  assert.ok(found.some((f) => f.endsWith('SixthFaqHost.jsx')));
});

test('CONTROL: a COMMENTED-OUT import is not counted as a host', () => {
  const fakeFile = path.join(SRC, 'app', 'admin', 'fake', 'CommentedOut.jsx');
  const fakeRead = (f) =>
    f === fakeFile ? `// import { CourseFaqManager } from '${SPECIFIER}';` : readFile(f);
  assert.deepEqual(findHosts([...ALL_FILES, fakeFile], fakeRead), EXPECTED_HOSTS);
});

test('CONTROL: the matcher is live — removing the import drops a host', () => {
  const stripped = (f) =>
    f.endsWith('FaqTab.jsx') ? readFile(f).replaceAll(SPECIFIER, '@/nowhere') : readFile(f);
  const found = findHosts(ALL_FILES, stripped);
  assert.equal(found.length, EXPECTED_HOSTS.length - 1);
  assert.ok(!found.some((f) => f.endsWith('FaqTab.jsx')));
});

test('the docstring states five hosts, and names each one', () => {
  // The comment and the guard have to agree, or the next reader trusts the
  // wrong one. Names are matched, not just the numeral, so "FIVE" alone in a
  // sentence about something else cannot satisfy this.
  const src = readFileSync(path.join(HERE, '..', '..', COMPONENT), 'utf8');
  const doc = src.slice(0, src.indexOf('*/'));
  for (const name of [
    'FaqTab',
    'CareerPathFaqClient',
    'MasterclassFaqClient',
    'ProgramFaqClient',
    'SkillFaqClient',
  ]) {
    assert.ok(doc.includes(name), `docstring names ${name}`);
  }
  assert.ok(/FIVE|five/.test(doc), 'docstring says how many');
});

test('every host splices through the shared list helpers, not its own array', () => {
  // The hosts are thin wrappers today — none holds FAQ list state of its own.
  // If one ever did, it would become a second source of truth and the splice in
  // CourseFaqManager would fix only half the screen (the defect `recruits` has).
  for (const host of EXPECTED_HOSTS) {
    const src = readFileSync(path.join(HERE, '..', '..', host), 'utf8');
    assert.ok(
      !/useState\s*\(\s*(initialFaqs|faqs)\b/.test(src),
      `${host} must not snapshot the FAQ list into its own state`
    );
  }
});
