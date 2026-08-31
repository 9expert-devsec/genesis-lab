import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { IconCardSection } from '@/components/pageBuilder/sections/icon_card';
import { StatCardSection } from '@/components/pageBuilder/sections/stat_card';
import { SectionContentEditor } from '@/components/pageBuilder/editor/SectionContentEditor';
import { sectionRendersEmpty } from '@/lib/pageBuilder/sectionLabels';
import { sectionSchema } from '@/lib/schemas/pageBuilder';
import { ICON_NAMES, isKnownIconName } from '@/lib/pageBuilder/lucideIcon';

/**
 * ROUND 69 — `icon_card.imageSrc`: an uploaded illustration where the Lucide
 * glyph goes (docs/promotion-page-coverage.md §G step 4, §H).
 *
 * ── THE PROPERTY WITH TEETH IS THE FALL-THROUGH ───────────────────────────
 * §H's rule: a field that ADDS something no page has ever shown defaults OFF
 * and reads ABSENT as OFF. `.lean()` applies no Mongoose defaults and JSON
 * serialisation drops undefined keys, so every card stored before this commit
 * reads `imageSrc` back ABSENT — not `''`. If the renderer read it the way
 * round 50's `showPrice` is read (`!== false`, which makes absent mean ON),
 * every stored icon_card in production would grow a broken <img>. So the
 * controls here are not decoration: each one is a predicate that gets the
 * absent case WRONG, asserted to disagree with the component.
 *
 * ── WHAT IS PINNED, AND WHAT IS DELIBERATELY NOT ──────────────────────────
 * The icon branch is pinned as an exact markup string with the <svg> ELIDED.
 * Everything this commit could have moved — the card wrapper, the chip classes,
 * the heading, the ordering — is byte-for-byte; the glyph's path data is not,
 * because a lucide upgrade redrawing a rocket is not this commit's regression.
 * (The unelided byte-identical proof against the pre-change component, over the
 * whole stored corpus, is scripts/_measure-round69-icon-card-image.mjs.)
 *
 * ── THE PIXELS ARE MEASURED ELSEWHERE ─────────────────────────────────────
 * §F's four-ratios-one-height requirement is a LAYOUT fact and this tier has no
 * layout. What is checkable here is that the box does not depend on the picture
 * — four different images produce one identical wrapper — and that is what the
 * fourth block asserts, with the stripped-constraint control beside it.
 * scripts/_measure-round69-icon-card-box.mjs reads the real
 * getBoundingClientRect out of headless Chrome over four real PNGs.
 */

const IMG = 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1/icon-folders.png';

const render = (content, style = {}) => renderToStaticMarkup(IconCardSection({ content, style }));

/** The markup with the glyph's innards replaced, so a lucide redraw is not a failure. */
const elideSvg = (m) => m.replace(/<svg\b[\s\S]*?<\/svg>/g, '<svg/>');

/**
 * The icon branch, exactly as it renders — and as it rendered before `imageSrc`
 * existed. Pinned so that "absent falls through unchanged" is a byte comparison
 * rather than a claim.
 */
const ICON_BRANCH = '<div class="rounded-9e-lg p-6">'
  + '<div class="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-9e-md '
  + 'bg-[color:var(--pb-accent-fill)]/10 text-[var(--pb-accent-fill)]"><svg/></div>'
  + '<h3 class="font-heading text-lg font-bold">ก</h3>'
  + '<p class="mt-1.5 whitespace-pre-line text-9e-slate-dp-50 dark:text-[#94a3b8]">ข</p>'
  + '</div>';

// ── 1. ABSENT imageSrc RENDERS THE ICON, UNCHANGED ─────────────────────────

test('a card with NO imageSrc key renders the Lucide icon, byte for byte', () => {
  const stored = { icon: 'Rocket', title: 'ก', description: 'ข' }; // no imageSrc — as .lean() hands it back
  assert.equal(Object.hasOwn(stored, 'imageSrc'), false, 'the fixture must not carry the key at all');
  assert.equal(elideSvg(render(stored)), ICON_BRANCH);
});

test('absent, empty and whitespace-only imageSrc are the SAME render', () => {
  // `''` is the schema default and absent is what a pre-field document reads
  // back; a stored value of spaces is what an author can leave behind. All
  // three must take the icon branch, because `.trim()` is the guard.
  const base = { icon: 'Rocket', title: 'ก', description: 'ข' };
  const absent = render(base);
  for (const imageSrc of ['', '   ', '\n\t ', null, undefined]) {
    assert.equal(render({ ...base, imageSrc }), absent, `imageSrc=${JSON.stringify(imageSrc)} diverged`);
  }
});

test('CONTROL: a truthiness check that reads ABSENT as SET disagrees with the component', () => {
  /**
   * This is round 50's shape, which is correct for `showPrice` and wrong here:
   * `!== false` answers TRUE for a key that is not there. If the renderer ever
   * adopts it, the assertion below is what says so — and it names the failure
   * rather than leaving a green suite over a broken production card.
   */
  const readsAbsentAsSet = (c) => c?.imageSrc !== false;
  const stored = { icon: 'Rocket', title: 'ก', description: 'ข' };

  assert.equal(readsAbsentAsSet(stored), true,
    'the control predicate is not actually treating absent as set — it discriminates nothing');

  const markup = render(stored);
  assert.match(markup, /<svg[\s>]/, 'the renderer agreed with the WRONG predicate: absent drew no icon');
  assert.equal(/<img[\s>]/.test(markup), false,
    'the renderer agreed with the WRONG predicate: absent drew an image');
});

// ── 2. A SET imageSrc RENDERS THE IMAGE AND NOT THE ICON ───────────────────

test('a set imageSrc renders the image and NOT the icon', () => {
  const markup = render({ icon: 'Rocket', title: 'ก', description: 'ข', imageSrc: IMG });
  assert.match(markup, /<img[\s>]/, 'no image element');
  assert.ok(markup.includes(`src="${IMG}"`), 'the stored URL is not the image source');
  assert.equal(/<svg[\s>]/.test(markup), false,
    'the icon rendered as well — the image is a REPLACEMENT, not an addition');
  assert.equal(markup.includes('--pb-accent-fill'), false,
    'the illustration kept the accent tint, which exists to colour a monochrome glyph');
});

test('the image branch keeps the icon chip’s box: same size classes, same margin', () => {
  const withImage = render({ imageSrc: IMG, title: 'ก' });
  const withIcon = render({ icon: 'Rocket', title: 'ก' });
  const boxOf = (m) => (/class="(mb-3 inline-flex[^"]*)"/.exec(m) ?? [])[1] ?? '';
  const sizeOf = (m) => boxOf(m).split(/\s+/).filter((c) => /^(mb-3|h-11|w-11|inline-flex|rounded-9e-md)$/.test(c)).sort();

  assert.deepEqual(sizeOf(withImage), sizeOf(withIcon),
    'the swap moved the box — a layout change wearing a content change’s clothes');
  assert.deepEqual(sizeOf(withImage), ['h-11', 'inline-flex', 'mb-3', 'rounded-9e-md', 'w-11']);
});

test('an unknown icon NAME does not stop the image rendering', () => {
  // The image branch must not run the resolver at all — a stored bad name is
  // exactly the case round 14 kept the warning for, and it is not the image's
  // problem.
  const markup = render({ icon: 'NotAnIcon_zz', title: 'ก', imageSrc: IMG });
  assert.match(markup, /<img[\s>]/);
  assert.equal(/<svg[\s>]/.test(markup), false);
});

// ── 3. THE EMPTY GUARD, AND ITS MIRROR ─────────────────────────────────────

test('a card carrying ONLY an image renders, and the tree marker agrees', () => {
  const content = { imageSrc: IMG };
  const markup = render(content);
  assert.notEqual(markup, '', 'an image-only card rendered nothing');
  assert.equal(sectionRendersEmpty({ type: 'icon_card', content }), false,
    'the structure tree still marks an image-only card “ว่าง” — the mirror drifted');
});

test('CONTROL: a card with nothing at all still renders nothing, and the marker still says so', () => {
  for (const content of [{}, { imageSrc: '   ' }, { icon: '', title: '', description: '', imageSrc: '' }]) {
    assert.equal(render(content), '', `${JSON.stringify(content)} rendered something`);
    assert.equal(sectionRendersEmpty({ type: 'icon_card', content }), true,
      `${JSON.stringify(content)}: the marker disagrees with the render`);
  }
});

// ── 4. THE BOX DOES NOT DEPEND ON THE PICTURE ──────────────────────────────

const RATIOS = [
  'https://res.cloudinary.com/x/image/upload/v1/portrait-200x600.png',
  'https://res.cloudinary.com/x/image/upload/v1/landscape-600x200.png',
  'https://res.cloudinary.com/x/image/upload/v1/square-400x400.png',
  'https://res.cloudinary.com/x/image/upload/v1/verywide-1200x150.png',
];

/** The class list of the image's fixed box, and of the image inside it. */
const geometryOf = (markup) => ({
  box: (/<div class="(mb-3 inline-flex[^"]*)"/.exec(markup) ?? [])[1] ?? null,
  img: (/<img[^>]*\sclass="([^"]*)"/.exec(markup) ?? [])[1] ?? null,
});

test('four images of four different shapes produce ONE identical box', () => {
  const shapes = RATIOS.map((imageSrc) => geometryOf(render({ imageSrc, title: 'ก', description: 'ข' })));
  const first = JSON.stringify(shapes[0]);
  assert.ok(shapes[0].box && shapes[0].img, 'the geometry could not be read out of the markup at all');
  for (const [i, s] of shapes.entries()) {
    assert.equal(JSON.stringify(s), first, `image ${i} (${RATIOS[i]}) came out with a different box`);
  }
  assert.match(shapes[0].box, /\bh-11\b/, 'the box lost its fixed height');
  assert.match(shapes[0].box, /\bw-11\b/, 'the box lost its fixed width');
  assert.match(shapes[0].img, /\bobject-contain\b/,
    'the picture is no longer fitted inside the box — a wide upload will be stretched or cropped');
});

test('CONTROL: remove the size constraint and the same check reports the divergence', () => {
  /**
   * Four equal boxes prove nothing unless an unequal one can be seen. The
   * constraint is stripped from ONE of the four — the exact edit that would
   * reintroduce §C's failure (a picture sized by its own intrinsic ratio) — and
   * the predicate above must reject it.
   */
  const strip = (m) => m.replace(' h-11 w-11', '');
  const shapes = RATIOS.map((imageSrc, i) => {
    const m = render({ imageSrc, title: 'ก', description: 'ข' });
    return geometryOf(i === 2 ? strip(m) : m);
  });
  const distinct = new Set(shapes.map((s) => JSON.stringify(s)));
  assert.equal(distinct.size, 2, 'the stripped card was NOT distinguishable — the check above is inert');
  assert.equal(/\bh-11\b/.test(shapes[2].box), false, 'the strip did not actually remove the constraint');
});

// ── 5. THE DEFAULT, AND WHAT CHANGING IT WOULD DO ──────────────────────────

test('the schema default is the EMPTY string, and absent parses to it', () => {
  /**
   * CONTROL FOR THE BYTE-IDENTICAL CLAIM. Change this default to anything
   * non-empty and this test names it — and names the consequence, which is that
   * every stored card rendered through a schema parse grows an <img> pointing
   * at whatever the new default is.
   */
  const parsed = sectionSchema.parse({ id: 'x', type: 'icon_card', content: { icon: 'Rocket' } });
  assert.equal(parsed.content.imageSrc, '',
    'icon_card.imageSrc no longer defaults to the empty string — §H requires a field that ADDS '
    + 'something to default OFF, and a non-empty default puts a picture on every stored card');
  assert.equal(render(parsed.content), render({ icon: 'Rocket' }),
    'a parsed card and a raw stored card no longer render the same thing');
});

// ── 6. THE PICKER (round 14) IS UNTOUCHED AND STILL REACHABLE ──────────────

const editorDoc = (content) => new JSDOM(`<!doctype html><body>${renderToStaticMarkup(
  createElement(SectionContentEditor, { type: 'icon_card', content, patch: () => {}, advanced: {}, resolved: null }),
)}</body>`).window.document;

test('the picker still enumerates from the validator that accepts a value', () => {
  // Round 14's property, restated here because round 69 is the first change to
  // reach this editor since: the list IS the filter, so the two cannot drift.
  assert.deepEqual([...ICON_NAMES].sort(), [...ICON_NAMES].filter(isKnownIconName).sort());
  assert.ok(ICON_NAMES.length > 100, 'the enumerated list collapsed — a vacuous equality');
});

test('the icon picker is still reachable on a card that HAS an image', () => {
  // The renderer prefers the image; the editor must not hide the icon control,
  // or clearing the image leaves the author with no way back.
  for (const content of [{ title: 'ก' }, { title: 'ก', imageSrc: IMG }, { title: 'ก', icon: 'Rocket', imageSrc: IMG }]) {
    const trigger = editorDoc(content).querySelector('[data-testid="icon-picker-trigger"]');
    assert.ok(trigger, `the icon picker is gone for ${JSON.stringify(content)}`);
  }
});

test('the editor offers an upload control for the image, and it is not a free-text URL box', () => {
  const doc = editorDoc({ title: 'ก' });
  const file = [...doc.querySelectorAll('input[type="file"]')];
  assert.equal(file.length, 1, 'expected exactly one uploader on icon_card');
  assert.equal(file[0].getAttribute('accept'), 'image/*');
});

// ── 7. §G — THE NEIGHBOURS DO NOT GET THIS ─────────────────────────────────

test('stat_card and instructor_card gained NOTHING — the field is on one type', () => {
  /**
   * §G: the ask is one type, and round 58 §F recorded that widening a shared
   * vocabulary across types re-opens the drift 2C.3 locked with three
   * witnesses. `stat_card` sits in the same schema file and also carries a
   * Lucide `icon`, which is exactly what makes the leak easy; `instructor_card`
   * carries only an id.
   *
   * They do not share a RENDERER — sections/stat_card.jsx and
   * sections/instructor_card.jsx are separate components with their own null
   * guards — so nothing could leak through the render path. What could leak is
   * the SCHEMA, three lines away, and this is what watches it.
   */
  for (const type of ['stat_card', 'instructor_card']) {
    const parsed = sectionSchema.parse({ id: 'x', type, content: {} });
    assert.equal(Object.hasOwn(parsed.content, 'imageSrc'), false,
      `${type} grew an imageSrc default — round 69 was one type, and §G says so`);
  }
  // …and the control: the type that DID get it still has it.
  assert.equal(
    Object.hasOwn(sectionSchema.parse({ id: 'x', type: 'icon_card', content: {} }).content, 'imageSrc'),
    true, 'icon_card lost the field, so the two assertions above prove nothing');
});

test('a stat_card carrying an imageSrc renders no image at all', () => {
  // passthrough() keeps unknown keys, so the schema alone does not answer this.
  // The renderer is the second half: an imageSrc smuggled onto a stat_card is
  // inert, which is what "the change did not leak" means at the render path.
  const markup = renderToStaticMarkup(StatCardSection({
    content: { value: '4', label: 'ก', icon: 'Rocket', imageSrc: IMG }, style: {},
  }));
  assert.notEqual(markup, '', 'the fixture rendered nothing, so the check below is vacuous');
  assert.equal(/<img[\s>]/.test(markup), false, 'stat_card drew an image — the branch leaked');
  assert.match(markup, /<svg[\s>]/, 'stat_card stopped drawing its icon');
});
