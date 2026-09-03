import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readSource, ROOT } from '../sourceScan.mjs';

/**
 * THE CLASS GUARD FOR THE LABEL-FORWARD BUG — every `<Field>` call site in
 * CourseForm.jsx, not four assertions hand-picked for the four new fields.
 *
 * ══ THE BUG, AGAIN ═══════════════════════════════════════════════════════
 * `Field` (CourseForm.jsx) renders `<label>{children}</label>` unless given
 * `plain`. An IMPLICIT label with no `for` forwards a click ANYWHERE inside
 * it to the label's "labeled control" — per the HTML label-activation
 * algorithm, the FIRST labelable descendant (button, non-hidden input,
 * select, textarea) in tree order. A contenteditable region is not
 * labelable, so when a Field wraps a component whose OWN toolbar renders a
 * `<button>` ahead of its contenteditable area, a plain click on editor TEXT
 * gets forwarded to that button instead — which is exactly what "reverted
 * on click" turned out to be for the section-1 rich body (see CourseForm.jsx's
 * `Field` header and CourseBodyEditor.jsx).
 *
 * ══ ROOTED ON FILE PATHS, NOT ON COMPONENT NAMES ═══════════════════════════
 * This guard does not hardcode "CourseBodyEditor is dangerous". It parses
 * CourseForm.jsx's own import map, resolves every capitalised JSX tag used as
 * a direct child of a `<Field>` call to the FILE that defines it, reads THAT
 * file, and asks a structural question of its markup: does a `<button>`
 * appear before any real form control (a non-hidden `<input>`, `<select>` or
 * `<textarea>`)? That is the actual hazard — CourseBodyEditor's toolbar
 * precedes its contenteditable, so a stray click lands on Undo. A component
 * whose FIRST labelable descendant is a normal field (CourseSearchSelect: a
 * real `<input type="text">` before its conditional "ล้าง" button) is safe by
 * the same test, even though it also contains a `<button>` — clicking
 * anywhere in that Field still forwards to the input, which is where a click
 * on an ordinary Field is supposed to land. A rename of CourseBodyEditor, or a
 * fifth field reusing it under a different local import alias, is still
 * caught: the check follows the import, not the identifier text.
 *
 * ══ SCOPE: FIELD WRAPS A COMPONENT, NOT FIELD WRAPS INLINE JSX ═════════════
 * This guard resolves CAPITALISED JSX tags (component references) found as
 * children of a `<Field>` — it does not scan for bare `<button>`s written
 * directly inline inside CourseForm.jsx's own JSX. The Skills field
 * (`<Field label="Skills">`, a `<div>` of inline per-skill toggle buttons
 * with no wrapping sub-component) is a structurally similar hazard by the
 * same label-activation mechanism, but it is a DIFFERENT bug — an existing
 * one, not introduced by this round, not touched by the settled decisions for
 * this task ("REMOVE the four preview boxes… do not touch section 7, the
 * article editor, sanitizeTopicHtml, or the promotions page" says nothing
 * about it either way) — and is reported separately rather than folded into
 * this guard's pass/fail. See this round's report for the repo-wide sweep.
 */

const COURSE_FORM = 'src/app/admin/courses/_components/CourseForm.jsx';

// ── the reader: import map, Field-site extraction, hazard detection ────────

/** Local JSX name -> absolute file path (or null if unresolved/external). */
function parseImportMap(withImportsText, fileAbsDir) {
  const map = {};
  const importRe = /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(withImportsText))) {
    const [, named, defaultName, source] = m;
    const resolved = resolveImportSource(source, fileAbsDir);
    if (named) {
      for (const raw of named.split(',')) {
        const piece = raw.trim();
        if (!piece) continue;
        const asMatch = piece.match(/^(\w+)\s+as\s+(\w+)$/);
        const localName = asMatch ? asMatch[2] : piece;
        map[localName] = resolved;
      }
    } else if (defaultName) {
      map[defaultName] = resolved;
    }
  }
  return map;
}

function resolveImportSource(source, fileAbsDir) {
  let base;
  if (source.startsWith('@/')) base = path.join(ROOT, 'src', source.slice(2));
  else if (source.startsWith('.')) base = path.resolve(fileAbsDir, source);
  else return null; // an external package — not a file this guard can read
  for (const ext of ['.jsx', '.js']) {
    try {
      readSource(path.relative(ROOT, base + ext).split(path.sep).join('/'));
      return base + ext;
    } catch { /* try the next extension */ }
  }
  return null;
}

/** Every `<Field …>…</Field>` call site: opening-tag attrs + children text. */
function extractFieldSites(codeText) {
  const sites = [];
  const re = /<Field\b([^>]*)>([\s\S]*?)<\/Field>/g;
  let m;
  while ((m = re.exec(codeText))) {
    sites.push({
      attrs: m[1],
      children: m[2],
      matchStart: m.index,
      matchEnd: m.index + m[0].length,
    });
  }
  return sites;
}

/**
 * 'button' | 'field' | 'none' — which labelable construct appears FIRST in
 * a file's JSX. A `<input type="hidden">` is excluded: it is not labelable
 * (HTML spec), and CourseSearchSelect's own hidden mirror-input must not be
 * mistaken for "the real control comes first".
 */
function firstLabelableKind(scrubbedCode) {
  const positions = [];
  for (const m of scrubbedCode.matchAll(/<button\b/g)) positions.push([m.index, 'button']);
  for (const m of scrubbedCode.matchAll(/<input\b([^>]*)>/g)) {
    if (/type\s*=\s*["']hidden["']/.test(m[1])) continue;
    positions.push([m.index, 'field']);
  }
  for (const m of scrubbedCode.matchAll(/<select\b/g)) positions.push([m.index, 'field']);
  for (const m of scrubbedCode.matchAll(/<textarea\b/g)) positions.push([m.index, 'field']);
  if (!positions.length) return 'none';
  positions.sort((a, b) => a[0] - b[0]);
  return positions[0][1];
}

/** Component tag names (capitalised) referenced directly in a JSX fragment. */
function componentTagsIn(jsxText) {
  return [...new Set([...jsxText.matchAll(/<([A-Z]\w*)/g)].map((m) => m[1]))];
}

/**
 * One row per `<Field>` call site: its label (for a readable test name),
 * whether it carries `plain`, and whether any child component it resolves to
 * is hazardous by `firstLabelableKind`.
 */
function analyze(codeText, importMap) {
  return extractFieldSites(codeText).map((site) => {
    // A literal string (`label="…"`) or a template expression
    // (`` label={`…`} ``, e.g. Section 6's `${COURSE_SECTION_LABELS.x} (…)`
    // — courseLabelParity.test.mjs requires the constant, not a hardcoded
    // literal, for any label whose text duplicates a public section name).
    // Either way this is read-only, for a human-legible test name — the
    // detector below never depends on what the label SAYS.
    const literalMatch = site.attrs.match(/label="([^"]*)"/);
    const templateMatch = site.attrs.match(/label=\{`([^`]*)`\}/);
    const label = literalMatch ? literalMatch[1]
      : templateMatch ? templateMatch[1]
      : `(unlabelled @${site.matchStart})`;
    const hasPlain = /\bplain\b/.test(site.attrs);

    const hazardComponents = componentTagsIn(site.children).filter((tag) => {
      const file = importMap[tag];
      if (!file) return false;
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      const { code } = readSource(rel);
      return firstLabelableKind(code) === 'button';
    });

    return { label, hasPlain, hazardous: hazardComponents.length > 0, hazardComponents, site };
  });
}

const { code: REAL_CODE, withImports: REAL_WITH_IMPORTS } = readSource(COURSE_FORM);
const IMPORT_MAP = parseImportMap(REAL_WITH_IMPORTS, path.dirname(path.join(ROOT, COURSE_FORM)));
const REAL_ANALYSIS = analyze(REAL_CODE, IMPORT_MAP);

// ── the guard itself: one test per hazardous field, named by its own label ──

test('CONTROL: the detector found at least one hazardous Field in CourseForm.jsx', () => {
  // Without this, every per-field assertion below could be passing because
  // the extraction found nothing at all.
  const hazardous = REAL_ANALYSIS.filter((f) => f.hazardous);
  assert.ok(hazardous.length >= 5, // section-1 body + the four section-6 fields
    `expected at least 5 hazardous Field sites, found ${hazardous.length}: `
    + hazardous.map((f) => f.label).join(', '));
});

for (const field of REAL_ANALYSIS.filter((f) => f.hazardous)) {
  test(`FIELD LABEL FORWARD GUARD: "${field.label}" wraps ${field.hazardComponents.join('/')} and must pass plain`, () => {
    assert.ok(
      field.hasPlain,
      `Field label="${field.label}" wraps ${field.hazardComponents.join('/')} — which puts a `
      + '<button> ahead of any real form control — without `plain`. A click anywhere in this '
      + 'field forwards to that button instead of the field itself.',
    );
  });
}

// ── the negative case: a field that has a button is not flagged just for that ─

test('CONTROL: a Field wrapping a component whose FIRST labelable element is a real input is not flagged', () => {
  const searchField = REAL_ANALYSIS.find((f) => f.label === 'หลักสูตรก่อนหน้า');
  assert.ok(searchField, 'the CourseSearchSelect field was not found by the extractor');
  assert.equal(
    searchField.hazardous, false,
    'CourseSearchSelect has its own <button>, but a real <input> precedes it — flagging this '
    + 'field would be a false positive the same class as the one this guard exists to avoid',
  );
  assert.equal(searchField.hasPlain, false,
    'this field does not need `plain`, and must not be made to carry it either');
});

test('CONTROL: firstLabelableKind tells a hidden input apart from a real one', () => {
  assert.equal(firstLabelableKind('<input type="hidden" name="x"><button>b</button>'), 'button');
  assert.equal(firstLabelableKind('<input type="text" name="x"><button>b</button>'), 'field');
  assert.equal(firstLabelableKind('<div>no controls here</div>'), 'none');
});

// ── separation: removing `plain` from ONE field reddens only that field ────
//
// Not asserted structurally — PROVEN by actually mutating the source and
// re-running the same detector, per sourceScan.mjs's own discipline: a claim
// this guard can distinguish before-from-after belongs in a discrimination
// test, not a comment.

/**
 * Strip the bare `plain` attribute from the Field call site at a given
 * position (a `matchStart`, from a previous `analyze()` result — NOT from
 * re-parsing the label text, which for Section 6 is a template expression
 * courseLabelParity.test.mjs requires, not a literal string a regex could
 * safely reconstruct from its rendered value).
 */
function withPlainRemovedAt(codeText, matchStart) {
  const target = extractFieldSites(codeText).find((s) => s.matchStart === matchStart);
  assert.ok(target, `fixture error: no Field call site at offset ${matchStart}`);
  const mutatedAttrs = target.attrs.replace(/\bplain\b/, '');
  assert.notEqual(mutatedAttrs, target.attrs, `fixture error: the Field at ${matchStart} had no plain to remove`);
  const openTag = `<Field${target.attrs}>`;
  const mutatedOpenTag = `<Field${mutatedAttrs}>`;
  return codeText.slice(0, target.matchStart) + mutatedOpenTag
    + codeText.slice(target.matchStart + openTag.length);
}

// The section-1 rich body (the field `plain` was originally added for) and
// the first of Section 6's four — one field from each round, not two from
// the same one, so the proof covers both.
const SEPARATION_TARGETS = REAL_ANALYSIS.filter((f) => f.hazardous).slice(0, 2);
assert.ok(SEPARATION_TARGETS.length === 2, 'fixture error: expected at least 2 hazardous fields to test separation with');

for (const targetField of SEPARATION_TARGETS) {
  test(`SEPARATION: removing plain from "${targetField.label}" reddens only that field`, () => {
    // Mutation is located by POSITION (robust to the label being a template
    // expression). Verification afterward is by LABEL TEXT, not position —
    // removing `plain` from an earlier field shifts every later field's
    // offset in the mutated string, but never touches any `label="…"` /
    // `` label={`…`} `` text itself, so labels stay a stable identity across
    // the mutation while offsets do not.
    const mutated = withPlainRemovedAt(REAL_CODE, targetField.site.matchStart);
    const after = analyze(mutated, IMPORT_MAP);

    const afterTarget = after.find((f) => f.label === targetField.label);
    assert.ok(afterTarget?.hazardous, `fixture error: "${targetField.label}" is not hazardous under the detector`);
    assert.equal(afterTarget.hasPlain, false, `"${targetField.label}" should have lost plain in the mutated copy`);

    const untouched = REAL_ANALYSIS.filter((f) => f.hazardous && f.label !== targetField.label);
    assert.ok(untouched.length >= 1, 'fixture error: no OTHER hazardous field to prove separation against');
    for (const f of untouched) {
      const stillOk = after.find((a) => a.label === f.label);
      assert.equal(
        stillOk?.hasPlain, true,
        `mutating "${targetField.label}" also affected "${f.label}" — the guard is not separated per field`,
      );
    }
  });
}
