import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExtensionUpdate, EXTENSION_FIELDS } from '@/lib/courses/extensionUpdate';

/**
 * The CourseExtension update object: key SELECTION, and the proof it changed
 * nothing for anyone who exists today.
 *
 * ── WHAT CHANGED ────────────────────────────────────────────────────────────
 * The action used to name all its keys unconditionally, so a caller that did not
 * render a field actively WROTE the fallback into it. Now a key is written only
 * when the caller named it. `omisePaymentEnabled` was silently reset to false in
 * production by exactly that shape.
 *
 * ── WHY THESE ARE REAL TESTS AND NOT A SOURCE SCAN ──────────────────────────
 * `lib/actions/course-extensions.js` is `use server` and no test can import it,
 * which is why the builder is its own pure module. The claim that matters —
 * "identical output for the payloads the two live callers send" — is behavioural.
 * A source scan would have been satisfied by a builder that was subtly wrong.
 */

// ── P1. NO-OP EQUIVALENCE ──────────────────────────────────────────────────

/**
 * THE OLD BUILDER, transcribed from the literal this replaced.
 *
 * Kept as an independent reimplementation ON PURPOSE. Importing anything from
 * the new module to describe the old behaviour would make the comparison
 * circular — the two would agree because they are the same code, not because
 * the behaviour is unchanged.
 *
 * This is the pre-change `update` literal from course-extensions.js, with the
 * gallery and tags normalisation that sat immediately above it inlined, at the
 * commit before this one.
 */
function buildExtensionUpdate_BEFORE({ courseId, data, cleanAlias }) {
  const galleryRaw = Array.isArray(data?.gallery) ? data.gallery : [];
  const gallery = galleryRaw
    .filter((item) => {
      if (!item || !item.type) return false;
      if (item.type === 'youtube') return Boolean(item.videoId?.trim());
      if (item.type === 'image') return Boolean(item.url?.trim());
      return false;
    })
    .map((item, i) => ({
      type: item.type,
      url: item.type === 'image' ? String(item.url ?? '').trim() : '',
      videoId: item.type === 'youtube' ? String(item.videoId ?? '').trim() : '',
      alt: String(item.alt ?? '').trim(),
      order: i,
    }));

  const tags = Array.isArray(data?.tags)
    ? data.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];

  return {
    courseId,
    urlAlias: cleanAlias,
    metaTitle: String(data?.metaTitle ?? '').trim(),
    metaDescription: String(data?.metaDescription ?? '').trim(),
    ogImage: String(data?.ogImage ?? '').trim(),
    tags,
    gallery,
    isPublished:
      typeof data?.isPublished === 'boolean' ? data.isPublished : true,
    omisePaymentEnabled:
      typeof data?.omisePaymentEnabled === 'boolean' ? data.omisePaymentEnabled : false,
  };
}

/**
 * CourseForm.jsx:417 — `saveExtensionFor`, the callback behind THREE paths:
 * create (:547), create-retry (:489) and the edit save (:602). Nine keys.
 * `upstreamId` is in the payload but is not a writable field — the action
 * decides it separately through resolveAnchorWrite — so it is not in the update.
 */
const COURSE_FORM_PAYLOAD = () => ({
  urlAlias: 'power-bi-xdm',
  metaTitle: 'Power BI XDM',
  metaDescription: 'คำอธิบาย',
  ogImage: 'https://res.cloudinary.com/x/og.jpg',
  tags: ['power bi', 'data'],
  gallery: [
    { type: 'image', url: 'https://x/1.jpg', alt: 'หนึ่ง', order: 0 },
    { type: 'youtube', videoId: 'abc123', alt: '', order: 1 },
  ],
  isPublished: true,
  omisePaymentEnabled: false,
  upstreamId: '692d39b52ee07293c9131fd8',
});

/** ExtensionEditor.jsx:72 — the payment tab. The same eight, no `upstreamId`. */
const EXTENSION_EDITOR_PAYLOAD = () => {
  const { upstreamId, ...rest } = COURSE_FORM_PAYLOAD();
  void upstreamId;
  return rest;
};

const CALLERS = [
  ['CourseForm.jsx:417 (create / retry / edit)', COURSE_FORM_PAYLOAD],
  ['ExtensionEditor.jsx:72 (payment tab)', EXTENSION_EDITOR_PAYLOAD],
];

for (const [what, payload] of CALLERS) {
  test(`P1 NO-OP: ${what} builds the IDENTICAL update it built before`, () => {
    /**
     * This is the test that makes the change safe to ship before any caller
     * uses the new behaviour. Both live callers pass every writable key, so
     * key-presence selection can only produce what unconditional naming
     * produced. If either caller ever starts omitting a key, THIS test is what
     * says the behaviour has diverged — loudly, and before a field is blanked.
     */
    const args = { courseId: 'POWER-BI-XDM', data: payload(), cleanAlias: 'power-bi-xdm' };
    assert.deepEqual(buildExtensionUpdate(args), buildExtensionUpdate_BEFORE(args));
  });
}

test('P1 NO-OP holds across awkward but realistic values', () => {
  // Empty strings, blank tags, half-filled gallery rows, an explicit `false`
  // — the shapes an admin actually produces by clearing boxes.
  const shapes = [
    { urlAlias: '', metaTitle: '', metaDescription: '', ogImage: '', tags: [], gallery: [], isPublished: false, omisePaymentEnabled: true },
    { urlAlias: '/x/', metaTitle: '  padded  ', metaDescription: '', ogImage: '', tags: ['', ' a ', ''], gallery: [{ type: 'image', url: '   ' }, { type: 'youtube', videoId: 'v' }, { type: 'bogus' }, null], isPublished: true, omisePaymentEnabled: false },
    { urlAlias: 'x', metaTitle: 'T', metaDescription: 'D', ogImage: 'O', tags: 'not-an-array', gallery: 'not-an-array', isPublished: 'yes', omisePaymentEnabled: 1 },
  ];
  for (const data of shapes) {
    const args = { courseId: 'C', data, cleanAlias: 'c' };
    assert.deepEqual(
      buildExtensionUpdate(args), buildExtensionUpdate_BEFORE(args),
      `diverged for ${JSON.stringify(data)}`,
    );
  }
});

test('CONTROL: the two builders are genuinely different implementations', () => {
  /**
   * P1 would be worthless if `buildExtensionUpdate_BEFORE` were an alias for the
   * new one. They must AGREE on full payloads and DISAGREE on a partial one —
   * disagreeing on partials is the entire behaviour change.
   */
  const args = { courseId: 'C', data: { metaTitle: 'only this' }, cleanAlias: '' };
  const now = buildExtensionUpdate(args);
  const before = buildExtensionUpdate_BEFORE(args);
  assert.notDeepEqual(now, before, 'the two builders behave identically on a PARTIAL payload — '
    + 'either the change did not land or the reference implementation is not independent');
  assert.deepEqual(Object.keys(now).sort(), ['courseId', 'metaTitle']);
  assert.equal(Object.keys(before).length, 9, 'the old builder always named nine keys');
});

// ── P2. THE WIPE GUARD ─────────────────────────────────────────────────────

test('P2 WIPE GUARD: a caller that omits trainingTopicsRich does not write it', () => {
  /**
   * THE POINT OF THE WHOLE ROUND. Both live callers omit this key and always
   * will until B3 wires the editor. If the key were ever written from an absent
   * value, every save from the payment tab or the SEO rail would erase a
   * course's rich copy — the `omisePaymentEnabled` incident again, on a field
   * whose loss is not recoverable from anywhere else.
   */
  for (const [what, payload] of CALLERS) {
    const update = buildExtensionUpdate({
      courseId: 'C', data: payload(), cleanAlias: 'c',
    });
    assert.ok(
      !('trainingTopicsRich' in update),
      `${what} would WRITE trainingTopicsRich despite never sending it — `
      + 'that is the wipe this selection exists to prevent',
    );
  }
});

test('P2: no absent key is ever written, for any field', () => {
  // The general form. A future field added with a fallback but no presence
  // gate would reintroduce the defect class for itself alone.
  const update = buildExtensionUpdate({ courseId: 'C', data: {}, cleanAlias: '' });
  assert.deepEqual(Object.keys(update), ['courseId'],
    'an empty payload wrote something other than the upsert key');
});

test('P2: a key that IS sent is still written, including a falsy value', () => {
  // The other half. A guard that never writes anything would pass every
  // assertion above and break every save.
  const update = buildExtensionUpdate({
    courseId: 'C',
    data: { trainingTopicsRich: ['<ul><li>a</li></ul>', ''], isPublished: false, tags: [] },
    cleanAlias: '',
  });
  assert.deepEqual(update.trainingTopicsRich, ['<ul><li>a</li></ul>', '']);
  assert.equal(update.isPublished, false, 'an explicit false must be written, not dropped');
  assert.deepEqual(update.tags, [], 'an explicit empty array must be written');
});

test('P2: trainingTopicsRich is coerced to strings when present', () => {
  // It lands in a [String] path. A non-string would either throw on validation
  // or store something a reader cannot use.
  const update = buildExtensionUpdate({
    courseId: 'C', data: { trainingTopicsRich: ['<ul></ul>', null, 7] }, cleanAlias: '',
  });
  assert.deepEqual(update.trainingTopicsRich, ['<ul></ul>', '', '7']);
  const nonArray = buildExtensionUpdate({
    courseId: 'C', data: { trainingTopicsRich: 'not an array' }, cleanAlias: '',
  });
  assert.deepEqual(nonArray.trainingTopicsRich, [],
    'a present-but-wrong value still writes, and writes something valid');
});

// ── P3. C1 SEMANTICS — presence, not value ─────────────────────────────────

test('P3: `{ metaTitle: undefined }` CLEARS — presence is the test, not value', () => {
  /**
   * A caller that names a key means it, even when what it names is `undefined`
   * — a broken destructure, a bad prop, a typo. That must keep taking the old
   * path and clear the field.
   *
   * Reading it as leave-alone would trade one silent bug for another that looks
   * identical from outside, and the replacement would be HARDER to find: the
   * field would simply never change again, with no error anywhere.
   */
  const update = buildExtensionUpdate({
    courseId: 'C', data: { metaTitle: undefined }, cleanAlias: '',
  });
  assert.ok('metaTitle' in update, 'a named key was skipped because its value was undefined');
  assert.equal(update.metaTitle, '', 'the named key must clear, exactly as before');
});

test('P3: `{}` — the key ABSENT — leaves it alone', () => {
  const update = buildExtensionUpdate({ courseId: 'C', data: {}, cleanAlias: '' });
  assert.ok(!('metaTitle' in update), 'an absent key was written');
});

test('P3: every field obeys presence-not-value, in both directions', () => {
  // Swept rather than spot-checked: one field left on a `!== undefined` test
  // would be invisible until a caller hit exactly it.
  for (const key of EXTENSION_FIELDS) {
    const named = buildExtensionUpdate({
      courseId: 'C', data: { [key]: undefined }, cleanAlias: '',
    });
    assert.ok(key in named, `${key}: named-as-undefined was skipped (value test, not presence)`);

    const absent = buildExtensionUpdate({ courseId: 'C', data: {}, cleanAlias: '' });
    assert.ok(!(key in absent), `${key}: absent key was written`);
  }
});

test('P3: null and empty string are VALUES, and are written too', () => {
  // `null` is a caller saying "clear this", not a caller saying nothing.
  const update = buildExtensionUpdate({
    courseId: 'C', data: { metaTitle: null, ogImage: '' }, cleanAlias: '',
  });
  assert.equal(update.metaTitle, '');
  assert.equal(update.ogImage, '');
});

test('P3 CONTROL: an inherited key does NOT count as present', () => {
  /**
   * `hasOwnProperty` rather than `in`, and this is what the difference buys: a
   * payload built from an object whose PROTOTYPE carries the name must not be
   * read as naming it. `in` walks the chain; hasOwnProperty does not.
   */
  const data = Object.create({ metaTitle: 'from the prototype' });
  data.ogImage = 'own';
  const update = buildExtensionUpdate({ courseId: 'C', data, cleanAlias: '' });
  assert.ok(!('metaTitle' in update), 'an inherited key was treated as sent');
  assert.equal(update.ogImage, 'own');
});

// ── the field list itself ──────────────────────────────────────────────────

test('the writable field list is exactly the nine keys the action may set', () => {
  assert.deepEqual([...EXTENSION_FIELDS].sort(), [
    'gallery', 'isPublished', 'metaDescription', 'metaTitle', 'ogImage',
    'omisePaymentEnabled', 'tags', 'trainingTopicsRich', 'urlAlias',
  ]);
  // `upstreamId` and `formerCodes` are NOT here on purpose. The anchor is
  // decided against what is stored (resolveAnchorWrite) and added to the update
  // by the action; formerCodes is appended only by the rename action. Both
  // survive every save precisely BECAUSE this builder never names them.
  assert.ok(!EXTENSION_FIELDS.includes('upstreamId'));
  assert.ok(!EXTENSION_FIELDS.includes('formerCodes'));
  assert.ok(!EXTENSION_FIELDS.includes('courseId'), 'courseId is the upsert key, not a field');
});
