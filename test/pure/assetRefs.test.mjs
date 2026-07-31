import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCloudinaryUrl,
  collectSectionAssetRefs,
  collectPageAssetRefs,
  makeRefAcc,
  computeOrphans,
} from '@/lib/pageBuilder/assetRefs';

// The PURE reference-collection walk for the Cloudinary GC (5b Phase A + the
// fail-loud hardening). The script's DB + Admin-API I/O is smoke-only; only this
// walk is gated — and the walk is where the dangerous completeness rule lives.

const CDN = 'https://res.cloudinary.com/ddva7xvdt/image/upload';
const url = (pid, ver = 'v1712345678') => `${CDN}/${ver}/${pid}.jpg`;

// ── Change 2: extraction over the REAL URL shapes in this repo ───────────────
// Ground truth from a grep of stored Cloudinary URLs. The public_id is everything
// between the version and the extension, FOLDERS KEPT. A basename-only extractor
// fails the nested cases — these pin that it does not regress to basename.
const KNOWN = [
  ['nested one-level (skills)',   `${CDN}/v1758785738/skills/icons/zsnmhvevmg6ovrvdq8f2.svg`,           'skills/icons/zsnmhvevmg6ovrvdq8f2'],
  ['nested one-level (programs)', `${CDN}/v1768899073/programs/icons/zghtwgptohmxlpwah0fv.png`,          'programs/icons/zghtwgptohmxlpwah0fv'],
  ['nested containing base name', `${CDN}/v1778228610/9exp-genesis/atmosphere-photos/e4bvkvg6jxgvv33rxb6z.jpg`, '9exp-genesis/atmosphere-photos/e4bvkvg6jxgvv33rxb6z'],
  ['flat with suffix (fb-logo)',  `${CDN}/v1778832018/fb-logo_zzvc5o.png`,                               'fb-logo_zzvc5o'],
  ['flat with suffix (AI)',       `${CDN}/v1781066417/AI_lkvzpl.png`,                                    'AI_lkvzpl'],
  ['page-builder scoped (.jpg)',  `${CDN}/v1799999999/9exp-genesis/page-builder/abc123.jpg`,            '9exp-genesis/page-builder/abc123'],
  ['no-version fallback',         `${CDN}/9exp-genesis/page-builder/noversion.png`,                      '9exp-genesis/page-builder/noversion'],
];
for (const [name, input, expected] of KNOWN) {
  test(`classify KNOWN → id, folders kept: ${name}`, () => {
    assert.deepEqual(classifyCloudinaryUrl(input), { kind: 'id', publicId: expected });
  });
}

// ── The fail-loud control: unparseable is SURFACED, never guessed ────────────
// Mirrors the house "every check ships a control that proves it can fail" rule —
// here the control proves fail-loud actually fails LOUD instead of guessing an id.
const UNPARSEABLE = [
  ['transform before version', `${CDN}/w_200,c_fill/v123/9exp-genesis/page-builder/x.png`],
  ['unknown delivery type',    'https://res.cloudinary.com/ddva7xvdt/image/fetch/v1/remote/thing.jpg'],
  ['cloudinary host, no delivery type', 'https://res.cloudinary.com/ddva7xvdt/image/'],
  ['version present but nothing after', `${CDN}/v123`],
];
for (const [name, input] of UNPARSEABLE) {
  test(`classify UNPARSEABLE → surfaced, not guessed: ${name}`, () => {
    const r = classifyCloudinaryUrl(input);
    assert.equal(r.kind, 'unparseable', `${input} must not be guessed into an id`);
    assert.equal(r.raw, input);
  });
}

test('classify EXTERNAL → ignored (empty / non-url / non-cloudinary host)', () => {
  assert.deepEqual(classifyCloudinaryUrl(''), { kind: 'external' });
  assert.deepEqual(classifyCloudinaryUrl(undefined), { kind: 'external' });
  assert.deepEqual(classifyCloudinaryUrl('not a url'), { kind: 'external' });
  assert.deepEqual(classifyCloudinaryUrl('https://example.com/a.jpg'), { kind: 'external' });
});

// ── THE load-bearing assertion (Part 1 regression) ──────────────────────────
// A duplicated / section-copied image keeps `src` but has its `publicId` STRIPPED
// (reidSection.js #3). The walk MUST still count it, or the eventual delete 404s
// the copy's live image — silently. Missing this is what deletes a live asset.
test('counts BOTH a manual image (src+publicId) AND a stripped copy (src only)', () => {
  const sections = [
    { id: 'orig', type: 'image', content: { src: url('9exp-genesis/page-builder/orig'), publicId: '9exp-genesis/page-builder/orig' } },
    { id: 'copy', type: 'image', content: { src: url('9exp-genesis/page-builder/orig'), publicId: '' } }, // Part 1: token stripped, src kept
    { id: 'other', type: 'image', content: { src: url('9exp-genesis/page-builder/other'), publicId: '' } },
  ];
  const { refs, unparseable } = collectSectionAssetRefs(sections);
  assert.ok(refs.has('9exp-genesis/page-builder/orig'), 'original + its stripped copy both resolve to the owned asset');
  assert.ok(refs.has('9exp-genesis/page-builder/other'), 'a src-only image is counted from src alone');
  assert.equal(unparseable.size, 0);
});

// CONTROL: a walk reading ONLY publicId MUST miss the stripped copy's src-only
// asset that the real walk catches — proving src-counting is load-bearing.
test('control: a publicId-ONLY walk misses the src-only asset the real walk catches', () => {
  const sections = [
    { id: 'copy', type: 'image', content: { src: url('9exp-genesis/page-builder/only-src'), publicId: '' } },
  ];
  const publicIdOnly = new Set();
  for (const s of sections) if (s.type === 'image' && s.content.publicId) publicIdOnly.add(s.content.publicId);

  const { refs } = collectSectionAssetRefs(sections);
  assert.equal(publicIdOnly.has('9exp-genesis/page-builder/only-src'), false); // the miss
  assert.equal(refs.has('9exp-genesis/page-builder/only-src'), true);          // the catch
});

test('recurses containers via slotsOf (nested image is counted, no second walk)', () => {
  const tree = [
    { id: 'grid', type: 'card_grid', content: { children: [
      { id: 'tc', type: 'two_column', content: {
        left:  [{ id: 'li', type: 'image', content: { src: url('9exp-genesis/page-builder/deep'), publicId: '' } }],
        right: [],
      } },
    ] } },
  ];
  const { refs } = collectSectionAssetRefs(tree);
  assert.ok(refs.has('9exp-genesis/page-builder/deep'));
});

test('collectPageAssetRefs: a snapshot pins its sections AND its SEO OG image', () => {
  const snapshot = {
    sections: [{ id: 'i', type: 'image', content: { src: url('9exp-genesis/page-builder/snap-img'), publicId: '9exp-genesis/page-builder/snap-img' } }],
    seo: { ogImage: url('9exp-genesis/page-builder/og'), ogImagePublicId: '9exp-genesis/page-builder/og' },
  };
  const { refs } = collectPageAssetRefs(snapshot);
  assert.ok(refs.has('9exp-genesis/page-builder/snap-img'), 'snapshot section asset joins the reference set');
  assert.ok(refs.has('9exp-genesis/page-builder/og'), 'snapshot OG asset joins the reference set');
});

test('collectPageAssetRefs: non-page / empty is inert (no throw, empty acc)', () => {
  assert.equal(collectPageAssetRefs(null).refs.size, 0);
  assert.equal(collectPageAssetRefs({}).refs.size, 0);
});

// ── End-to-end conservative semantics: unparseable ref PINS (never orphans) ──
// An unparseable src both surfaces in `unparseable` AND, because it could point at
// any listed asset, forces computeOrphans to protect EVERYTHING (empty safe set).
test('an unparseable src surfaces AND makes computeOrphans protect everything', () => {
  const sections = [
    { id: 'weird', type: 'image', content: { src: `${CDN}/w_200/v1/9exp-genesis/page-builder/masked.png`, publicId: '' } },
  ];
  const acc = collectSectionAssetRefs(sections);
  assert.equal(acc.unparseable.size, 1, 'the transform-before-version URL is surfaced, not guessed');

  // A listed asset that NOTHING resolvable references would look orphaned — but
  // the unparseable ref could be exactly it, so the safe set must be empty.
  const listed = ['9exp-genesis/page-builder/masked', '9exp-genesis/page-builder/other'];
  assert.deepEqual(computeOrphans(listed, acc), [], 'unparseable present → nothing is a safe orphan');
});

test('computeOrphans with NO unparseable returns the plain diff', () => {
  const acc = makeRefAcc();
  acc.refs.add('9exp-genesis/page-builder/kept');
  const listed = ['9exp-genesis/page-builder/kept', '9exp-genesis/page-builder/gone'];
  assert.deepEqual(computeOrphans(listed, acc), ['9exp-genesis/page-builder/gone']);
});
