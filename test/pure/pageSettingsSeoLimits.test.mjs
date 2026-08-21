import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seoSchema } from '@/lib/schemas/pageBuilder';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 26 — ONE TRIPWIRE OVER A MEASURED ASYMMETRY, NOT A RULE.
 *
 * ══ READ THIS BEFORE MAKING IT GREEN AGAIN ══════════════════════════════════
 *
 * `PageSettingsDialog` renders a character counter for both SEO fields, and the
 * schema enforces a maximum on both. Only ONE of them warns:
 *
 *   metaTitle        counter `${len}/60`    AND  invalid={len > 60}
 *   metaDescription  counter `${len}/160`   and  nothing
 *
 * So an author who types 161 characters of description sees `161/160` in a
 * field that looks entirely normal, and the save is rejected by the schema when
 * it runs. One field stops them at the door; the other lets them walk into a
 * failed save. Both boundaries were parsed to confirm the rejection is real —
 * 160 accepted, 161 rejected — rather than assumed from `.max()`.
 *
 * SELF-RETIRING. This fails on the day metaDescription gets the same guard, and
 * the correct response is to DELETE it together with step 5 of
 * docs/page-settings-redesign.md — never to update the expectation so it agrees
 * with whatever it finds.
 *
 * ── WHY A SOURCE ASSERTION AND NOT A RENDER ONE ────────────────────────────
 * The dialog reads `useEditor()`, and a static render cannot supply that
 * context — the same constraint round 15 hit with SettingsPanel, which it
 * solved by exporting the tab bodies. Exporting this dialog's screen bodies is
 * step 0 of the redesign, not this round's work, so the claim is made against
 * the source with its limits stated rather than made falsely against a render.
 *
 * PURE: source text and one schema parse. No React, no DOM.
 */

const SRC = 'src/components/pageBuilder/editor/PageSettingsDialog.jsx';

/** The JSX for one `<Field …>` block, by its label. */
function fieldBlock(code, label) {
  const start = code.indexOf(`<Field label="${label}"`);
  assert.notEqual(start, -1, `the "${label}" field is no longer in ${SRC}`);
  const end = code.indexOf('</Field>', start);
  assert.notEqual(end, -1, `the "${label}" field block is unterminated`);
  return code.slice(start, end);
}

test('the SEO maxima are real — both boundaries parsed, not inferred from .max()', () => {
  const x = (n) => 'x'.repeat(n);
  assert.equal(seoSchema.safeParse({ metaTitle: x(60) }).success, true);
  assert.equal(seoSchema.safeParse({ metaTitle: x(61) }).success, false);
  assert.equal(seoSchema.safeParse({ metaDescription: x(160) }).success, true);
  assert.equal(seoSchema.safeParse({ metaDescription: x(161) }).success, false,
    'metaDescription no longer has a maximum — then the counter below promises a limit that '
    + 'does not exist, which is a different defect and a worse one');
});

test('AUDIT TRIPWIRE (round 26): metaDescription counts but does NOT warn', () => {
  const { code } = readSource(SRC);
  const title = fieldBlock(code, 'Meta title');
  const description = fieldBlock(code, 'Meta description');

  // Both count. The counter is what makes the missing guard surprising rather
  // than merely absent — the field is already tracking the number it ignores.
  assert.match(title, /\/60/, 'the meta title counter is gone');
  assert.match(description, /\/160/, 'the meta description counter is gone');

  // One guards…
  assert.match(title, /invalid=\{String\(seo\.metaTitle \?\? ''\)\.length > 60\}/,
    'the meta TITLE lost its over-length guard — that is a regression, not this finding');

  // …and the other does not. This is the finding.
  assert.equal(/invalid=/.test(description), false,
    'THE ASYMMETRY IS FIXED: meta description now carries an over-length guard. DELETE this '
    + 'test and step 5 of docs/page-settings-redesign.md — the finding it records is closed.');
});

test('CONTROL: the field reader discriminates — it can see a guard where one exists', () => {
  /**
   * Without this, "description has no invalid=" could be passing on a reader
   * that returns the wrong block, or one that never matches anything. The same
   * extractor is pointed at the field that DOES carry a guard, and at a field
   * from a different group entirely.
   */
  const { code } = readSource(SRC);
  assert.match(fieldBlock(code, 'Meta title'), /invalid=/,
    'the reader cannot see a guard that is definitely there');

  // A third field, to show the extractor is not returning the whole file.
  const canonical = fieldBlock(code, 'Canonical URL');
  assert.equal(/invalid=/.test(canonical), false);
  assert.equal(canonical.includes('Meta title'), false,
    'the block extractor is over-reaching — it swallowed a neighbouring field');
  assert.ok(canonical.length < 400, 'the extracted block is implausibly large');
});
