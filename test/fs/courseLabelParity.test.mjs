import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { COURSE_SECTION_LABELS } from '@/lib/courseSectionNav';

/**
 * THE ADMIN FORM CALLS EACH SECTION WHAT THE PUBLIC PAGE CALLS IT.
 *
 * ── WHY THIS IS A SOURCE SCAN AND WHAT IT ACTUALLY PROVES ──────────────────
 * Three things have to agree, and only two of them can share a binding:
 *
 *   1. COURSE_SECTION_LABELS — the constant, in lib/courseSectionNav
 *   2. `courseSectionLinks` — imports it, so it agrees BY CONSTRUCTION and
 *      needs no assertion here
 *   3. the four `ContentSection title="…"` props in the public components —
 *      NOT re-sourced from the constant, because rewiring four public
 *      components belongs to a round about the public page, not one about the
 *      admin labels
 *
 * So (3) is PINNED to (1) by reading the literal titles out of source. A
 * heading edited in a public component without editing the constant reddens
 * here and names both files. That is weaker than a shared import and it is the
 * honest trade: the alternative was editing the authoritative side in a round
 * that was told not to.
 *
 * The form itself takes its labels from the constant by import, so the
 * admin↔public pairing is structural. What this file adds is the third leg.
 */

const FORM = 'src/app/admin/courses/_components/CourseForm.jsx';
const PUB = 'src/app/(public)/[...slug]/_components';

/**
 * The heading each public component renders, and the field it renders it over.
 * `id` is the section id, which is also the key in COURSE_SECTION_LABELS.
 */
const PUBLIC_SECTIONS = [
  { id: 'objective',    file: `${PUB}/CourseObjectives.jsx`,    field: 'course_objectives' },
  { id: 'target',       file: `${PUB}/CourseTarget.jsx`,        field: 'course_target_audience' },
  { id: 'prerequisite', file: `${PUB}/CoursePrerequisites.jsx`, field: 'course_prerequisites' },
  { id: 'requirement',  file: `${PUB}/CourseRequirements.jsx`,  field: 'course_system_requirements' },
  { id: 'outline',      file: `${PUB}/CourseOutline.jsx`,       field: 'training_topics' },
];

/** The literal `title="…"` on the component's ContentSection. */
function publicHeading(rel) {
  const { code } = readSource(rel);
  return /<ContentSection[\s\S]{0,120}?title="([^"]+)"/.exec(code)?.[1] ?? null;
}

// ── The public page is authoritative, and the constant matches it ───────────

for (const { id, file } of PUBLIC_SECTIONS) {
  test(`${id}: the constant matches what the public component renders`, () => {
    const heading = publicHeading(file);
    assert.ok(heading, `no ContentSection title found in ${file}`);
    assert.equal(
      COURSE_SECTION_LABELS[id],
      heading,
      `${file} renders "${heading}" but COURSE_SECTION_LABELS.${id} is `
      + `"${COURSE_SECTION_LABELS[id]}". The PUBLIC PAGE IS AUTHORITATIVE — `
      + 'update the constant, not the component.'
    );
  });
}

// ── The admin form uses the constant rather than its own wording ────────────

for (const { id, field } of PUBLIC_SECTIONS) {
  test(`${field}: the form label is the shared constant and nothing else`, () => {
    const { code } = readSource(FORM);
    assert.match(
      code, new RegExp(`COURSE_SECTION_LABELS\\.${id}\\b`),
      `the ${field} label does not read COURSE_SECTION_LABELS.${id} — it has gone `
      + 'back to a hand-written string and can drift from the public heading'
    );
    // U4B: the ` (<field>)` suffix that used to follow the constant is gone.
    // Asserted per-field rather than only in the sweep below, so the failure
    // names which label regressed.
    assert.ok(
      !new RegExp(`COURSE_SECTION_LABELS\\.${id}\\}?\\s*\\(${field}\\)`).test(code),
      `the ${field} label has the "(${field})" suffix back — U4B removed it so `
      + 'the admin heading reads exactly as the public page does'
    );
  });
}

test('the form hard-codes NONE of the public section names', () => {
  /**
   * The regression this whole change exists to prevent. Before it, the form
   * said ความรู้พื้นฐาน where the page said พื้นฐานของผู้เข้าอบรม, and
   * กลุ่มเป้าหมาย where the page said หลักสูตรนี้เหมาะสำหรับ. A literal is how
   * that comes back.
   */
  const { code } = readSource(FORM);
  const offenders = [];
  for (const [id, label] of Object.entries(COURSE_SECTION_LABELS)) {
    if (code.includes(`"${label}`) || code.includes(`'${label}`)) offenders.push(`${id}: ${label}`);
  }
  assert.deepEqual(
    offenders, [],
    'a public section name is written as a literal in the form:\n  ' + offenders.join('\n  ')
  );
});

test('the RETIRED wordings are gone from the form', () => {
  // Named individually, because "no literal" above would also pass on a form
  // that simply deleted the labels.
  const { code } = readSource(FORM);
  for (const stale of ['ความรู้พื้นฐาน', 'กลุ่มเป้าหมาย', 'หัวข้ออบรม']) {
    assert.ok(!code.includes(stale), `the form still says "${stale}"`);
  }
});

// ── The key in parentheses is GONE ──────────────────────────────────────────

/**
 * ── THIS RULE WAS INVERTED IN U4B, DELIBERATELY ─────────────────────────────
 * It used to assert the opposite: that every renamed label still carried its
 * `(field_name)` key, "for developers reading the form beside the API", and the
 * round that wrote it recorded that keeping the key was an explicit
 * instruction. U4B reverses that instruction on UAT feedback — an admin
 * filling the form should see the same words the public page prints, with no
 * schema vocabulary in the way.
 *
 * The developer aid is not simply lost: `name=` is still the field name on
 * every input, and the one genuinely non-obvious mapping (`title`, which stores
 * the body) keeps its explanation in that field's `hint`.
 */

/** Every visible label/title string the form renders, as literal source text. */
function labelStrings(code) {
  return [
    ...code.matchAll(/(?:label|title)=(?:"([^"]*)"|\{`([^`]*)`\})/g),
  ].map((m) => m[1] ?? m[2]);
}

/** The field names whose suffix U4B stripped — section 6 plus the sweep. */
const STRIPPED_KEYS = [
  'course_name', 'course_id', 'course_teaser', 'title', 'course_cover_url',
  'course_trainingdays', 'course_traininghours', 'course_levels',
  'course_price', 'course_netprice', 'sort_order', 'previous_course',
  'program', 'bullets',
  ...PUBLIC_SECTIONS.map((s) => s.field),
];

test('no visible label carries a technical field name in parentheses', () => {
  // Scoped to label/title PROPS rather than the whole file on purpose: `(title)`
  // and `(program)` also occur in ordinary JS (arrow params, comments), and a
  // whole-file scan would redden on those and prove nothing.
  const { code } = readSource(FORM);
  const offenders = [];
  for (const label of labelStrings(code)) {
    for (const key of STRIPPED_KEYS) {
      if (label.includes(`(${key})`)) offenders.push(`${key} in "${label}"`);
    }
  }
  assert.deepEqual(
    offenders, [],
    'a field-name suffix came back into a visible label:\n  ' + offenders.join('\n  ')
  );
});

test('CONTROL: the label extractor actually finds the form\'s labels', () => {
  // Without this, the sweep above would pass trivially on a regex that matched
  // nothing — which is exactly how a "does not contain" guard goes blind.
  const { code } = readSource(FORM);
  const labels = labelStrings(code);
  assert.ok(labels.length > 20, `only ${labels.length} label strings extracted`);
  assert.ok(labels.includes('ชื่อหลักสูตร *'), 'the first field label was not extracted');
});

test('the parentheticals that are NOT field names are left alone', () => {
  // The sweep must not turn into "strip every parenthesis". These six carry
  // guidance — a Thai gloss, a document type, a language code — and one of them
  // (Certificate) is not even the field name: that input is
  // `course_certificate_status`.
  const { code } = readSource(FORM);
  const labels = labelStrings(code);
  for (const kept of [
    'Public (เผยแพร่บนเว็บ)',
    'In-house (รับจัดในองค์กร)',
    'มอบใบรับรอง (Certificate)',
    'ภาษาไทย (TH)',
    'ภาษาอังกฤษ (EN)',
  ]) {
    assert.ok(labels.includes(kept), `the guidance parenthetical "${kept}" was stripped too`);
  }
  assert.ok(
    code.includes('title="7b. ไฟล์หลักสูตร (Course Outline PDF)"'),
    'the Course Outline PDF section title lost its document-type gloss',
  );
});

// ── The nav agrees by construction, asserted so the import cannot be undone ─

test('courseSectionLinks reads the constant rather than its own strings', () => {
  const { code } = readSource('src/lib/courseSectionNav.js');
  const links = code.slice(code.indexOf('export function courseSectionLinks'));
  const literals = [...links.matchAll(/label: '([^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(
    literals, [],
    'the nav went back to literal labels — it and the headings can now drift: '
    + literals.join(', ')
  );
  for (const id of Object.keys(COURSE_SECTION_LABELS)) {
    assert.match(links, new RegExp(`label: COURSE_SECTION_LABELS\\.${id},`), `${id} is not wired`);
  }
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the heading extractor reads real titles, not nothing', () => {
  // Every parity assertion above compares against this extractor's output. If
  // it returned null the `assert.ok` would catch it, but if it returned a
  // CONSTANT the equality checks would be comparing the constant to itself.
  const headings = PUBLIC_SECTIONS.map((s) => publicHeading(s.file));
  assert.equal(new Set(headings).size, PUBLIC_SECTIONS.length, 'the extractor returned duplicates');
  assert.ok(headings.every(Boolean));
  assert.equal(publicHeading('src/app/(public)/[...slug]/_components/ContentSection.jsx'), null,
    'the extractor matched a component that renders no literal title');
});

test('CONTROL: the constant covers every section the nav offers', () => {
  // A key removed from the constant would make its parity test vanish rather
  // than fail — the loop above iterates PUBLIC_SECTIONS, not the constant.
  const { code } = readSource('src/lib/courseSectionNav.js');
  const navIds = [...code.matchAll(/id: '([a-z]+)',/g)].map((m) => m[1]);
  assert.ok(navIds.length >= 10, `only ${navIds.length} nav sections found`);
  for (const id of navIds) {
    assert.ok(COURSE_SECTION_LABELS[id], `the nav offers "${id}" with no label in the constant`);
  }
});
