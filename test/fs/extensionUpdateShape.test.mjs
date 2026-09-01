import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { EXTENSION_FIELDS } from '@/lib/courses/extensionUpdate';

/**
 * The SEAM between saveCourseExtension and its update builder.
 *
 * test/pure/extensionUpdate.test.mjs proves the builder BEHAVES correctly. It
 * cannot prove the action still USES it, or that the action stopped handing a
 * partial object to a consumer that needs a whole one. Those are source
 * questions, and `lib/actions/course-extensions.js` is `use server` — no test
 * can import it, so source is the only tier that can ask.
 *
 * ── EVERY READ IS COMMENT-STRIPPED, AND THAT MATTERS HERE ──────────────────
 * The action's header now explains the defect at length and names `update`,
 * `after: update` and the old fallbacks in prose. A raw-text scan would find
 * every one of them and pass — or fail — on the explanation rather than the
 * code. `readSource().code` strips comments; every assertion below uses it.
 */

const ACTION = 'src/lib/actions/course-extensions.js';

// ── C3. the visibility plan must get the WHOLE document ───────────────────

test('C3: planVisibilityRevalidation is given `doc`, never the partial `update`', () => {
  /**
   * ── THE FAILURE THIS CATCHES, AND WHY IT IS INVISIBLE WITHOUT A TEST ──────
   * `update` is now PARTIAL — only the keys the caller sent. `isVisible` reads
   * `ext.isPublished !== false`, so an ABSENT `isPublished` reads as VISIBLE.
   *
   * A caller that omits the flag would therefore make the plan see a
   * hidden→visible flip that never happened, and revalidate the mega menu, the
   * home page, /training-course, /schedule and every catalog page for nothing.
   * Nothing throws, nothing looks wrong, and the only symptom is a cache sweep
   * no one asked for.
   *
   * `doc` is the real post-write document from `{ new: true }`, so it carries
   * the EFFECTIVE state of every field — written or carried forward.
   */
  const { code } = readSource(ACTION);
  const call = code.indexOf('planVisibilityRevalidation({');
  assert.notEqual(call, -1, 'the visibility plan call is gone');

  const args = code.slice(call, code.indexOf('}).paths', call));
  assert.match(args, /after:\s*doc\b/, 'the visibility plan is not receiving `doc`');
  assert.doesNotMatch(
    args, /after:\s*update\b/,
    'the visibility plan is back on the PARTIAL `update` — a caller that omits '
    + 'isPublished will now trigger a spurious hidden→visible revalidation sweep',
  );
  assert.match(args, /before:\s*beforeDoc\b/, '`before` stopped being the stored document');
});

test('CONTROL: that matcher can tell the two argument spellings apart', () => {
  // Both halves fired at literal samples, so the assertion above cannot be
  // passing because the slice came back empty or the regex matches nothing.
  const good = 'planVisibilityRevalidation({ before: beforeDoc, after: doc, ';
  const bad = 'planVisibilityRevalidation({ before: beforeDoc, after: update, ';
  assert.match(good, /after:\s*doc\b/);
  assert.doesNotMatch(good, /after:\s*update\b/);
  assert.match(bad, /after:\s*update\b/);
  assert.doesNotMatch(bad, /after:\s*doc\b/);
});

// ── the action must still route through the builder ───────────────────────

test('the action builds its update through buildExtensionUpdate', () => {
  const { code, withImports } = readSource(ACTION);
  assert.ok(
    withImports.includes('courses/extensionUpdate'),
    'the action no longer imports the update builder',
  );
  assert.match(
    code, /const update = buildExtensionUpdate\(/,
    'the action is building its update object inline again — the key-presence '
    + 'rule and its tests live in lib/courses/extensionUpdate and cannot guard '
    + 'a literal that bypasses them',
  );
});

test('the action does not rebuild the update literal inline', () => {
  /**
   * The regression that would defeat the pure tests entirely: reinstating the
   * unconditional literal beside the builder call, or instead of it. Anchored on
   * the two fallbacks that only ever appeared in that literal.
   */
  const { code } = readSource(ACTION);
  for (const gone of [
    "String(data?.metaTitle ?? '').trim()",
    "typeof data?.omisePaymentEnabled === 'boolean'",
  ]) {
    assert.ok(
      !code.includes(gone),
      `the unconditional update literal is back in the action: ${gone}`,
    );
  }
});

test('CONTROL: those anchors are real strings, not typos that can never match', () => {
  /**
   * A "does NOT contain" guard whose needle is misspelled passes forever. Both
   * needles are fired at the builder, where the same expressions DO live.
   *
   * This control EARNED ITSELF on its first run: the needles were originally
   * written including the `metaTitle: ` / `: false` tails, which the builder
   * does not have — it wraps each coercion in `() =>` and breaks the
   * omisePaymentEnabled ternary across lines. Both "does not contain"
   * assertions above would have passed forever against any regression.
   */
  const { code } = readSource('src/lib/courses/extensionUpdate.js');
  for (const needle of [
    "String(data?.metaTitle ?? '').trim()",
    "typeof data?.omisePaymentEnabled === 'boolean'",
  ]) {
    assert.ok(code.includes(needle), `needle never matches anywhere: ${needle}`);
  }
});

// ── the schema field ──────────────────────────────────────────────────────

test('trainingTopicsRich is a [String] on the model, defaulting to []', () => {
  /**
   * The shape is ruled, not incidental: PER-ROW HTML index-aligned with
   * `training_topics`, stored as a real array rather than JSON in a string. A
   * JSON string would add a parse failure mode and buy nothing Mongo does not
   * already do, and `topicRichState` reads the array directly because of it.
   */
  const { code } = readSource('src/models/CourseExtension.js');
  assert.match(
    code, /trainingTopicsRich:\s*\{\s*type:\s*\[String\]\s*,\s*default:\s*\[\]\s*\}/,
    'trainingTopicsRich is not declared as `{ type: [String], default: [] }`',
  );
});

test('descriptionRich is a String on the model, defaulting to empty', () => {
  const { code } = readSource('src/models/CourseExtension.js');
  assert.match(
    code, /descriptionRich:\s*\{\s*type:\s*String\s*,\s*default:\s*''\s*\}/,
    "descriptionRich is not declared as `{ type: String, default: '' }`",
  );
});

test('every writable field the builder knows exists on the model', () => {
  // Catches the half-landed change: a field added to the builder and not to the
  // schema writes a key Mongoose silently drops (strict mode), so the save
  // reports success and stores nothing.
  const { code } = readSource('src/models/CourseExtension.js');
  for (const field of EXTENSION_FIELDS) {
    assert.match(
      code, new RegExp(`\\b${field}:\\s*\\{`),
      `${field} is writable by the builder but is not a field on CourseExtension`,
    );
  }
});

test('CONTROL: that sweep would notice a field the model does not have', () => {
  const { code } = readSource('src/models/CourseExtension.js');
  assert.doesNotMatch(code, /\bnotAFieldAtAll:\s*\{/);
  assert.ok(EXTENSION_FIELDS.length === 10, `expected 10 writable fields, found ${EXTENSION_FIELDS.length}`);
});
