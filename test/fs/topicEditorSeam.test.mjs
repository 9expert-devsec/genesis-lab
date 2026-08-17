import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { readSource } from '../sourceScan.mjs';

/**
 * SOURCE-LEVEL GUARDS for the section-7 editor's wiring.
 *
 * ══ WHAT BELONGS HERE, AND WHAT DOES NOT ═══════════════════════════════════
 *
 * Everything about BEHAVIOUR is tested by running the code —
 * test/pure/topicEditorContract, topicEditorSeed and topicEditorSave. What is
 * left is a small set of facts a running test genuinely cannot reach, because
 * they are about a `'use server'` module or a component whose effect is a
 * network call:
 *
 *   · the server action really does re-sanitise before writing;
 *   · CourseForm really does pass `trainingTopicsRich` to the extension save;
 *   · no throwaway dev route survives in the tree.
 *
 * A source scan is the weakest kind of guard and is used only where it is the
 * only kind available. Each one below names the revert it must fire on.
 */

/**
 * A route directory name that can only be scratch work.
 *
 * Shared by the sweep and its control, so the control cannot pass against a
 * different predicate than the one that runs.
 */
const THROWAWAY = (entry) =>
  /^(_dev|__dev|sandbox|scratch|throwaway)$/i.test(entry)
  || /^(dev|preview)[-_](outline|topic|rich)$/i.test(entry)
  || /^(outline|topic|rich)[-_](test|preview|sandbox|dev)$/i.test(entry);

const FORM = 'src/app/admin/courses/_components/CourseForm.jsx';
const ACTION = 'src/lib/actions/course-extensions.js';
const EDITOR = 'src/components/admin/TopicBulletsEditor.jsx';
const EXTENSIONS = 'src/components/admin/topicEditorExtensions.js';

// ── a. the write-side sanitiser is actually wired ──────────────────────────

test('saveCourseExtension re-sanitises before building the update', () => {
  /**
   * REVERT THIS FIRES ON: the write-side sanitiser bypassed.
   *
   * `src/lib/actions/course-extensions.js` is `'use server'` and imports
   * next/cache, the audit recorder and the Mongo client, so no test in this
   * suite can import it — the same constraint that put the parse in
   * lib/courses/trainingTopics.js. The FUNCTION's behaviour is tested in
   * test/pure/topicEditorSave; what only a scan can say is that the action
   * calls it, and calls it on the way INTO the builder rather than after.
   */
  const { withImports } = readSource(ACTION);
  assert.match(withImports, /import \{ sanitiseTopicRichForWrite \} from '@\/lib\/courses\/topicEditorSave'/,
    'the action no longer imports the write-side sanitiser');
  assert.match(
    withImports,
    /buildExtensionUpdate\(\{[\s\S]{0,200}?data:\s*sanitiseTopicRichForWrite\(data\)/,
    'the update is built from RAW `data` — a crafted POST reaches '
    + 'dangerouslySetInnerHTML unsanitised',
  );
});

test('CONTROL: the probe rejects the bypassed form', () => {
  // The shape the revert would leave behind, checked against the same regex.
  const bypassed = 'const update = buildExtensionUpdate({ courseId, data, cleanAlias });';
  assert.doesNotMatch(
    bypassed,
    /buildExtensionUpdate\(\{[\s\S]{0,200}?data:\s*sanitiseTopicRichForWrite\(data\)/,
    'the probe matches the bypassed call too, so it is not guarding anything',
  );
});

// ── b. the form passes the field, and shows the warning ────────────────────

test('saveExtensionFor passes trainingTopicsRich to the extension save', () => {
  /**
   * REVERT THIS FIRES ON: saveExtensionFor stops passing trainingTopicsRich.
   *
   * `buildExtensionUpdate` selects on KEY PRESENCE, so a caller that stops
   * naming the field does not fail — the field is simply LEFT ALONE, forever.
   * Every rich edit an admin makes would appear to save and never persist,
   * with no error anywhere. That silence is why this is guarded at all.
   */
  const { code } = readSource(FORM);
  /**
   * Anchored on `}).catch` rather than the first `})`. The payload contains
   * `gallery.map((item, i) => ({ ...item, order: i }))`, so a non-greedy match
   * to the first `})` stops INSIDE the gallery expression and captures a
   * fragment that never reaches the rich field — the guard would have gone
   * green the moment the field was removed.
   */
  const call = /saveCourseExtension\(\s*code\s*,\s*\{([\s\S]*?)\}\)\.catch/.exec(code);
  assert.ok(call, 'could not find the saveCourseExtension call');
  assert.match(call[1], /\btrainingTopicsRich\b/,
    'the extension save no longer names the rich field — edits would silently '
    + 'never persist');
});

test('the form seeds section 7 from seedTopicEditorRows, not a second seed', () => {
  const { withImports } = readSource(FORM);
  assert.match(withImports, /import \{ seedTopicEditorRows \} from '@\/lib\/courses\/topicEditorSeed'/);
  assert.match(withImports, /staleWarning=\{topicSeed\.warning\}/,
    'the stale warning is no longer handed to the editor — see the render test '
    + 'for what an admin loses without it');
  assert.match(withImports, /onRowsChange=\{setTrainingTopicsRich\}/);
});

test('the rich rows enter the unsaved-changes signature', () => {
  /**
   * REVERT THIS FIRES ON: the rich half dropped from the dirty check.
   *
   * The rows are React state with no `name`, so they never enter FormData. A
   * FORMATTING-ONLY edit — bolding a word, nesting a bullet — leaves the plain
   * projection in the hidden input byte-identical, so without this entry the
   * guard reports CLEAN and lets the admin navigate away from the work.
   */
  const { code } = readSource('src/lib/courses/courseFormDirty.js');
  assert.match(code, /trainingTopicsRich/,
    'courseEditorSignature ignores the rich bullets');
  const { code: formCode } = readSource(FORM);
  assert.match(formCode, /courseEditorSignature\(\{[\s\S]*?trainingTopicsRich[\s\S]*?\}\)/,
    'the form does not put the rich rows into the signature it computes');
});

// ── c. the editor's settled shape ──────────────────────────────────────────

test('the editor has NO source view', () => {
  /**
   * ArticleForm has one. This must not: a raw-HTML box is a way to put bytes
   * into the field that the editor's own schema never approved, which is the
   * single thing the node/mark contract exists to prevent. Nothing downstream
   * would notice — the sanitiser would clean it, and the contract check would
   * still be green, because the bytes did not come from the schema.
   */
  const { code } = readSource(EDITOR);
  for (const probe of [/sourceMode/, /setSourceMode/, /getHTML\(\)\s*;?\s*<textarea/]) {
    assert.doesNotMatch(code, probe, 'a raw-HTML editing mode appeared on this editor');
  }
});

test('the depth lock is wired to the Tab key and reads the shared rule', () => {
  /**
   * REVERT THIS FIRES ON: depth lock removed.
   *
   * The RULE is exercised against real ProseMirror documents in
   * test/pure/topicEditorContract. What that cannot see is whether anything
   * calls it — a lock nobody consults is not a lock. Both entry points, the
   * Tab key and the toolbar button, must go through `canNestDeeper`.
   */
  const { code } = readSource(EXTENSIONS);
  assert.match(code, /Tab:\s*\(\{\s*editor\s*\}\)\s*=>/, 'the Tab binding is gone');
  assert.match(code, /canNestDeeper\(bulletListDepthAt\(editor\.state\.selection\.\$from\)\)/,
    'the Tab handler no longer consults the depth rule');
  assert.match(code, /export function canIndentSelection/,
    'the toolbar has no shared way to read the same rule and would grow its own');
  assert.match(code, /priority:\s*1000/,
    "ListItem's own Tab binding would shadow the lock without a higher priority");
});

test('the editor does not install the extensions the sanitiser would drop', () => {
  const { withImports } = readSource(EXTENSIONS);
  for (const banned of [
    'extension-text-align', 'extension-color', 'extension-image',
    'extension-table', 'extension-youtube', 'extension-subscript',
    'extension-superscript',
  ]) {
    assert.doesNotMatch(withImports, new RegExp(banned),
      `${banned} is installed — TextAlign in particular is an ATTRIBUTE, so the `
      + 'schema check cannot catch it and alignment would vanish at save');
  }
});

// ── d. no throwaway route survives ─────────────────────────────────────────

test('no throwaway dev/preview route for the outline exists in the tree', () => {
  /**
   * REVERT THIS FIRES ON: a throwaway dev route exists in the tree.
   *
   * B2 used one to photograph the rich renderer in isolation and it was
   * removed. It rendered CourseOutline with hand-made props, outside the ISR
   * page chain, real Mongo data, the accordion wrapper and the rest of the
   * page's CSS — so it could show green while the real page was broken, which
   * is the precise reason it must not come back as a permanent fixture.
   *
   * ── SCOPED, BECAUSE TWO REAL ROUTES LOOK LIKE THIS ────────────────────
   * A first draft flagged any directory named `dev` or `preview` and caught
   * `src/app/(public)/preview/[slug]` — the password-protected DRAFT PREVIEW
   * from d6aa2eb, a security-hardened product feature, not a leftover. The two
   * `dev-mark-paid` API routes (fe0a2ee, 2026-08-16) are likewise real payment
   * helpers.
   *
   * So a bare `dev` or `preview` segment is NOT an offender. Only two shapes
   * are: names that can only ever be scratch (`sandbox`, `scratch`,
   * `throwaway`, `_dev`), and dev/preview segments QUALIFIED by this feature
   * (`dev-outline`, `outline-preview`, `topic_test`).
   */
  const APP = path.join(process.cwd(), 'src', 'app');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (THROWAWAY(entry)) {
          offenders.push(path.relative(process.cwd(), full));
        }
        walk(full);
      }
    }
  };
  walk(APP);
  assert.deepEqual(offenders, [], `throwaway route(s) left in the tree: ${offenders.join(', ')}`);
});

test('CONTROL: the throwaway-route probe catches scratch and spares real routes', () => {
  /**
   * Both directions, against the SAME predicate the sweep uses. A regex that
   * matched nothing would read as "the tree is clean"; one that matched
   * everything would have deleted a shipped feature's guard instead.
   */
  for (const name of ['_dev', '__dev', 'sandbox', 'scratch', 'throwaway',
    'dev-outline', 'preview_topic', 'outline-preview', 'topic_test', 'rich-sandbox']) {
    assert.equal(THROWAWAY(name), true, `the probe would not catch a route named "${name}"`);
  }
  for (const name of ['admin', 'courses', 'schedule', '[...slug]',
    'preview', 'dev-mark-paid', '[slug]']) {
    assert.equal(THROWAWAY(name), false, `the probe would flag the REAL route "${name}"`);
  }
});
