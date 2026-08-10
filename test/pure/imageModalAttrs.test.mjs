import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageModalAttrs } from '@/lib/editor/resizableImage';

/**
 * The image-properties modal's two modes.
 *
 * ── WHAT CHANGED, AND WHY THIS NEEDS A GUARD ────────────────────────────────
 * The modal used to have a single opener — the toolbar's upload handler — so it
 * only ever ran in INSERT mode against `setImage`. Double-clicking an image now
 * opens the same modal in EDIT mode against `updateAttributes`, and the two
 * commands do not want the same payload.
 *
 * The difference is `src`, and it is the one that can corrupt a document. EDIT
 * must not send it: the modal's URL field is read-only, and the value it holds
 * was captured when the modal opened, so sending it lets a stale modal
 * overwrite the node's real source. `setImage` needs it; `updateAttributes`
 * must never see it.
 *
 * ── WHAT IS **NOT** GUARDED HERE, BECAUSE IT IS NOT TRUE ────────────────────
 * A plausible-sounding trap says `updateAttributes` ignores `undefined`, so a
 * cleared width would silently survive and edit mode would need an explicit
 * `null`. That was tested on a live editor and it does NOT reproduce on
 * @tiptap/core 2.27.2: the command spreads `{ ...node.attrs, ...attributes }`,
 * and prosemirror-model's `computeAttrs` substitutes each attribute's declared
 * default for an `undefined`. `{width: undefined}` and `{width: null}` produce
 * identical attributes and identical HTML.
 *
 * So no assertion here pins a null-vs-undefined distinction: there isn't one,
 * and writing a test around an imagined mechanism is how a suite ends up
 * asserting fiction. What IS pinned is the real difference — `src` — plus the
 * trimming both modes share.
 */

test('edit mode omits src; insert mode supplies it', () => {
  const insert = imageModalAttrs({ mode: 'insert', src: '/a.jpg', alt: 'hero', width: '320px' });
  assert.deepEqual(insert, { src: '/a.jpg', alt: 'hero', width: '320px' });

  const edit = imageModalAttrs({ mode: 'edit', src: '/a.jpg', alt: 'hero', width: '320px' });
  assert.deepEqual(edit, { alt: 'hero', width: '320px' });
  assert.equal('src' in edit, false, 'edit must never carry src — the URL field is read-only');

  // Empty boxes send `undefined` in BOTH modes, so ProseMirror falls back to
  // the schema default (null for width, '' for alt) and the tag loses the
  // attribute entirely.
  assert.deepEqual(
    imageModalAttrs({ mode: 'insert', src: '/a.jpg', alt: '', width: '' }),
    { src: '/a.jpg', alt: undefined, width: undefined },
  );
  assert.deepEqual(
    imageModalAttrs({ mode: 'edit', alt: '   ', width: '  ' }),
    { alt: undefined, width: undefined },
  );

  // Whitespace is trimmed, not preserved — an admin who types a trailing space
  // into the width box would otherwise write `style:"width:320px "`.
  assert.deepEqual(
    imageModalAttrs({ mode: 'edit', alt: '  hero ', width: ' 50% ' }),
    { alt: 'hero', width: '50%' },
  );

  // Missing keys behave as empty rather than throwing.
  assert.deepEqual(imageModalAttrs({ mode: 'edit' }), { alt: undefined, width: undefined });
});

test('CONTROL: the src assertion CAN fail', () => {
  // Without this, `'src' in edit === false` would also pass if the function
  // returned nothing at all, or if edit mode silently stopped carrying the
  // fields the modal exists to set.
  const edit = imageModalAttrs({ mode: 'edit', src: '/a.jpg', alt: 'hero', width: '320px' });
  assert.ok('alt' in edit && 'width' in edit, 'edit still carries the fields it owns');
  assert.equal(Object.keys(edit).length, 2, 'and carries exactly those two');

  // And the positive half: insert genuinely does include src, so the assertion
  // above is discriminating between the modes rather than describing both.
  assert.ok('src' in imageModalAttrs({ mode: 'insert', src: '/a.jpg' }));
});
