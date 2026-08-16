import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * THE MOUNTED SCREEN CANNOT RENAME ANYTHING.
 *
 * ── WHY A STRUCTURAL PROOF, NOT A DISABLED BUTTON ──────────────────────────
 * "No rename control" rendered as a disabled button is a promise about a click
 * handler: someone removes the `disabled` attribute in a hurry and the write is
 * one line away. The property wanted here is that THE WRITE IS NOT REACHABLE —
 * `renameCourseCode` is not imported anywhere in the screen's module
 * graph, so there is nothing to enable.
 *
 * The walk is transitive for the same reason the preview's read-only guard is:
 * a write one hop away in a helper is the shape that slips through.
 *
 * WHAT IT CANNOT SEE, named: a dynamic `await import()`, a computed method
 * name, and anything the preview's own upstream GET does. The preview IS in
 * this closure and is read-only by its own guard
 * (test/fs/renamePreviewReadOnly), which is the assertion this one leans on
 * rather than duplicating.
 */

const ENTRIES = [
  'src/app/admin/courses/rename/page.jsx',
  'src/app/admin/courses/rename/_components/RenamePreviewClient.jsx',
  'src/app/admin/courses/rename/_components/RenamePreviewReport.jsx',
  'src/app/admin/courses/rename/_components/RenameExecutePanel.jsx',
];

/** The one module in the screen that is allowed to reach the rename. */
const EXECUTOR = 'src/app/admin/courses/rename/_components/RenameExecutePanel.jsx';

function closure(entries) {
  const byRel = new Map(walkSources('src').map((f) => [f.rel, f]));
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel) || !byRel.has(rel)) continue;
    seen.add(rel);
    for (const m of byRel.get(rel).withImports.matchAll(/from\s+'(@\/[^']+|\.[^']*)'/g)) {
      const spec = m[1];
      const base = spec.startsWith('@/')
        ? 'src/' + spec.slice(2)
        : `${rel.split('/').slice(0, -1).join('/')}/${spec.replace(/^\.\//, '')}`;
      for (const cand of [`${base}.js`, `${base}.jsx`, `${base}/index.js`]) {
        if (byRel.has(cand)) { queue.push(cand); break; }
      }
    }
  }
  return [...seen].map((rel) => byRel.get(rel));
}

/**
 * ══ THIS ASSERTION WAS DELIBERATELY NARROWED ═══════════════════════════════
 *
 * 884655b asserted that NO write path was reachable from this screen. That was
 * true and correct while the screen was read-only; the execute panel makes it
 * false on purpose, so the blanket claim is replaced rather than deleted.
 *
 * WHAT IS GUARANTEED NOW: the rename is reachable from EXACTLY ONE module —
 * the execute panel. The page, the client shell and the report cannot perform
 * it, so a preview screen still cannot rename by accident and the write has one
 * place to review.
 *
 * WHAT IS NO LONGER GUARANTEED, said plainly: that the screen cannot write.
 * It can. Whether it writes only behind the typed confirmation and the
 * acknowledgement is a question about a click handler, which no source scan
 * answers — that is `canExecuteRename`'s job, driven for real in
 * test/pure/renameExecuteGate, and the wiring between the two is pinned in
 * test/fs/renameExecuteWiring. Between them they cover what this test used to
 * cover by forbidding the whole thing.
 */
test('the rename is reachable from EXACTLY ONE module — the execute panel', () => {
  const importers = closure(ENTRIES)
    .filter((f) => f.withImports.includes("from '@/lib/actions/course-rename'"))
    .map((f) => f.rel);
  assert.deepEqual(
    importers, [EXECUTOR],
    'the rename action is imported somewhere other than the execute panel — '
    + 'the preview half of this screen must not be able to write'
  );
});

test('the report and the page cannot reach the rename', () => {
  // Named individually, because the set-equality above would also pass if the
  // executor were renamed to one of these.
  for (const rel of ENTRIES.filter((e) => e !== EXECUTOR)) {
    const { withImports } = readSource(rel);
    assert.ok(
      !/renameCourseCode/.test(withImports),
      `${rel} can reach the rename — only the execute panel may`
    );
  }
});

/**
 * ══ THIS ASSERTION WAS DELIBERATELY NARROWED ═══════════════════════════════
 *
 * It used to be "NO UPSTREAM WRITE is reachable from the screen" — true and
 * correct while a HUMAN was supposed to change `course_id` in MSDB. That is
 * retired: the rename writes upstream itself, so the blanket ban would now
 * forbid the feature.
 *
 * WHAT IS GUARANTEED NOW, and it is the same shape the rename-action ban took
 * when the execute panel was added: the upstream write is reachable from
 * EXACTLY ONE module in this screen — the same one the genesis write is
 * reachable from — and it gets there through the rename action rather than by
 * importing `msdb-write` directly.
 *
 * WHAT IS NO LONGER GUARANTEED, said plainly: that this screen cannot change
 * MSDB. It can, and that is the point of the round. Whether it does so only
 * once, only with one key, only after the anchor check and only before genesis
 * is asserted in test/fs/renameUpstreamWrite, over the action itself.
 */
test('the upstream write is reachable from EXACTLY ONE module, and only via the action', () => {
  const direct = closure(ENTRIES)
    .filter((f) => f.withImports.includes("from '@/lib/api/msdb-write'"))
    .map((f) => f.rel);
  assert.deepEqual(
    direct, ['src/lib/actions/course-rename.js'],
    'msdb-write is imported somewhere other than the rename action:\n  ' + direct.join('\n  ')
  );

  // No COMPONENT may call an upstream verb, whatever it imports.
  const inComponents = [];
  for (const rel of ENTRIES) {
    const { code } = readSource(rel);
    for (const verb of ['msdbCreate', 'msdbUpdate', 'msdbDelete']) {
      if (new RegExp(String.raw`(?<![\w$])${verb}\s*\(`).test(code)) inComponents.push(`${rel}: ${verb}(`);
    }
  }
  assert.deepEqual(inComponents, [], 'a component calls MSDB directly:\n  ' + inComponents.join('\n  '));
});

test('no component in the rename screen writes to Mongo or upstream directly', () => {
  const BANNED = [
    'save', 'create', 'insertOne', 'insertMany', 'bulkWrite',
    'updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate',
    'deleteOne', 'deleteMany', 'msdbCreate', 'msdbUpdate', 'msdbDelete',
  ];
  const offenders = [];
  for (const rel of ENTRIES) {
    const { code } = readSource(rel);
    for (const verb of BANNED) {
      if (new RegExp(String.raw`(?<![\w$])${verb}\s*\(`).test(code)) offenders.push(`${rel}: ${verb}(`);
    }
  }
  assert.deepEqual(offenders, [], 'the screen writes directly:\n  ' + offenders.join('\n  '));
});

test('the screen calls the PREVIEW, so it is not inert', () => {
  // Three negatives above pass over a screen that does nothing at all.
  const { withImports, code } = readSource(ENTRIES[1]);
  assert.match(withImports, /from '@\/lib\/actions\/course-rename-preview'/);
  assert.match(code, /await previewCourseCodeRename\(/, 'the screen never runs a preview');
});

test('CONTROL: the closure is real and would catch the import it bans', () => {
  const rels = closure(ENTRIES).map((f) => f.rel);
  assert.ok(rels.length >= 6, `the closure found only ${rels.length} modules`);
  for (const e of ENTRIES) assert.ok(rels.includes(e), `${e} missing from its own closure`);
  // It follows BOTH relative and alias imports.
  assert.ok(
    rels.includes('src/app/admin/courses/rename/_components/RenamePreviewReport.jsx'),
    'the walk did not follow the relative import from the client'
  );
  assert.ok(rels.includes('src/lib/courses/renamePreviewView.js'), 'the walk did not follow @/ imports');
  assert.ok(rels.includes('src/lib/actions/course-rename-preview.js'), 'the walk did not reach the preview');

  // And the ban would fire: the rename action really does export that symbol.
  assert.match(
    readSource('src/lib/actions/course-rename.js').code,
    /export async function renameCourseCode/,
    'the banned symbol no longer exists — the ban is checking for nothing'
  );
});

// ── The route is reachable from where the question is asked ────────────────

test('the course form links to the preview from the non-editable code field', () => {
  /**
   * The screen existing is not the same as it being findable. The form says
   * the code cannot be edited; until this link, "then how do I change it" had
   * no answer on the page where it is asked.
   */
  const { code } = readSource('src/app/admin/courses/_components/CourseForm.jsx');
  // The href now CARRIES the course — asserted in full in
  // test/fs/renameExecuteWiring; here it is enough that a link exists and is
  // edit-only.
  assert.match(code, /\/admin\/courses\/rename\?course=/, 'the form does not link to the preview');
  assert.match(code, /mode === 'edit' &&/, 'the link shows on the create form too, where there is nothing to rename');
});

test('the route inherits the courses RBAC key rather than adding one', () => {
  const { code } = readSource(ENTRIES[0]);
  assert.match(code, /requirePage\('courses'\)/, 'the page is not gated');
  // Prefix match in lib/rbac/pages.js — asserted so a change there is noticed.
  assert.match(
    readSource('src/lib/rbac/pages.js').code,
    /key: 'courses',[\s\S]{0,80}href: '\/admin\/courses',[\s\S]{0,40}match: 'prefix'/,
    'the courses key stopped matching by prefix — /admin/courses/rename would fall out of RBAC'
  );
});
