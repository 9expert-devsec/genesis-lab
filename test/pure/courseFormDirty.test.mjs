import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseEditorSignature, isCourseEditorDirty } from '@/lib/courses/courseFormDirty';

/**
 * When the course editor counts as edited.
 *
 * THE CONTROL IS THE POINT OF THIS FILE. A guard that fires when nothing
 * changed is worse than no guard: admins learn to click through it, and then it
 * does not protect the one time it matters. Every "is dirty" assertion below is
 * paired with the "was NOT touched" case that a naive implementation — one that
 * compares against emptiness, or reports dirty whenever a field merely exists —
 * would fail.
 */

const SEED_FORM = [
  ['course_name', 'AI Agents with Microsoft Copilot Studio'],
  ['course_id', 'COPILOT-STU'],
  ['course_price', '7500'],
  ['website_urls', 'https://www.9experttraining.com/copilot-studio-training-course'],
  ['training_topics', '[{"title":"Intro","bullets":["a"]}]'],
];

const SEED_EXT = {
  urlAlias: '/copilot-studio-training-course',
  metaTitle: 'Copilot Studio',
  metaDescription: 'desc',
  ogImage: '',
  tags: 'AI, Copilot',
  isPublished: true,
  gallery: [{ type: 'youtube', videoId: 'dQw4w9WgXcQ', alt: '', order: 0 }],
};

const sig = (formEntries, extension) => courseEditorSignature({ formEntries, extension });
const BASE = sig(SEED_FORM, SEED_EXT);

// ── dirty after a real edit ─────────────────────────────────────────────────

test('typing in ชื่อหลักสูตร is dirty', () => {
  const edited = SEED_FORM.map(([k, v]) =>
    k === 'course_name' ? [k, 'AI Agents with Microsoft Copilot Studio X'] : [k, v]
  );
  assert.equal(isCourseEditorDirty(BASE, sig(edited, SEED_EXT)), true);
});

test('editing a rail field is dirty', () => {
  assert.equal(
    isCourseEditorDirty(BASE, sig(SEED_FORM, { ...SEED_EXT, metaTitle: 'Changed' })),
    true
  );
});

test('editing the gallery is dirty', () => {
  const gallery = [...SEED_EXT.gallery, { type: 'image', url: 'https://x/y.png', alt: '' }];
  assert.equal(isCourseEditorDirty(BASE, sig(SEED_FORM, { ...SEED_EXT, gallery })), true);
});

test('unticking the alias-resolution checkbox is dirty', () => {
  assert.equal(
    isCourseEditorDirty(BASE, sig(SEED_FORM, { ...SEED_EXT, isPublished: false })),
    true
  );
});

// ── THE CONTROL: untouched is clean ─────────────────────────────────────────

test('CONTROL: opened and closed with no edit is NOT dirty', () => {
  // The whole reason for a signature seeded from the loaded values rather than
  // a "has anything been typed into an empty form" check.
  assert.equal(isCourseEditorDirty(BASE, sig(SEED_FORM, SEED_EXT)), false);
});

test('CONTROL: a hidden Gallery tab is not a change just for existing', () => {
  // The tab is `hidden`, not unmounted, so its rows are in the DOM the whole
  // time. Present is not changed.
  const reordered = { ...SEED_EXT, gallery: SEED_EXT.gallery.map((g) => ({ ...g, order: 99 })) };
  assert.equal(
    isCourseEditorDirty(BASE, sig(SEED_FORM, reordered)),
    false,
    '`order` is positional and renumbered on save — it must not read as an edit'
  );
});

test('CONTROL: form entry ORDER is not a change', () => {
  // FormData iteration order follows the DOM, and the Gallery tab toggling
  // `hidden` must never be able to reorder it into a false positive.
  const shuffled = [...SEED_FORM].reverse();
  assert.equal(isCourseEditorDirty(BASE, sig(shuffled, SEED_EXT)), false);
});

test('CONTROL: a leading slash on the alias is not a change', () => {
  // The rail edits the alias without its slash and the store keeps it with one.
  assert.equal(
    isCourseEditorDirty(BASE, sig(SEED_FORM, { ...SEED_EXT, urlAlias: 'copilot-studio-training-course' })),
    false
  );
});

test('CONTROL: before the baseline exists, nothing is dirty', () => {
  // The frame between mount and the rAF snapshot. Warning about work that
  // cannot have happened yet is the false positive this guard must not have.
  assert.equal(isCourseEditorDirty(null, sig(SEED_FORM, SEED_EXT)), false);
  assert.equal(isCourseEditorDirty(undefined, sig([], {})), false);
});

// ── save outcomes ───────────────────────────────────────────────────────────

test('CONTROL: after a successful save the form is clean again', () => {
  // On the joint success the component re-baselines to the values just written.
  const afterEdit = SEED_FORM.map(([k, v]) => (k === 'course_name' ? [k, 'New name'] : [k, v]));
  const saved = sig(afterEdit, SEED_EXT);
  assert.equal(isCourseEditorDirty(saved, sig(afterEdit, SEED_EXT)), false);
});

test('after a PARTIAL save the form is still dirty', () => {
  // MSDB ok, extension failed: the baseline is NOT moved, so the unsaved half
  // still reads as unsaved and leaving still prompts.
  const afterEdit = SEED_FORM.map(([k, v]) => (k === 'course_name' ? [k, 'New name'] : [k, v]));
  assert.equal(isCourseEditorDirty(BASE, sig(afterEdit, SEED_EXT)), true);
});

// ── shape guards ────────────────────────────────────────────────────────────

test('File entries are ignored — only their uploaded URL counts', () => {
  // A File is not comparable across renders; the uploaders post their result as
  // a hidden text input, and that is what the comparison sees.
  const withFile = [...SEED_FORM, ['cover_file', { name: 'x.png' }]];
  assert.equal(isCourseEditorDirty(BASE, sig(withFile, SEED_EXT)), false);
});

test('CONTROL: the signature can tell two different forms apart at all', () => {
  // Without this, every assert.equal(…, false) above passes vacuously if the
  // signature collapsed everything to a constant.
  assert.notEqual(sig(SEED_FORM, SEED_EXT), sig([['course_name', 'other']], SEED_EXT));
});
