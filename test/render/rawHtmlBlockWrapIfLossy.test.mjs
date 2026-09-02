import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TiptapLink from '@tiptap/extension-link';
import { ResizableImage } from '@/lib/editor/resizableImage';
import { StyleNode } from '@/app/admin/pages/_components/extensions/StyleNode';
import { IframeNode } from '@/app/admin/pages/_components/extensions/IframeNode';
import { RawHtmlNode } from '@/app/admin/pages/_components/extensions/RawHtmlNode';
import { wrapIfLossy, lostContent } from '@/lib/customPages/wrapIfLossy';

/**
 * `wrapIfLossy` IS THE FIX FOR THE THREE SITES WHERE ARBITRARY MARKUP MEETS
 * THE EDITOR'S SCHEMA (CustomPageForm's `content:` fixup effect on load,
 * `setContent()` coming back from Source HTML mode, and a save made directly
 * from Source HTML mode). It has to do two things at once, and each is
 * pinned here:
 *
 *   1. Markup the schema can't represent (a hand-written <div> wrapper, with
 *      nested class=/style=/<ul>/<strong>) must survive byte-for-byte by
 *      being wrapped in `<div data-raw-html>` — RawHtmlNode's job.
 *   2. Markup the schema DOES represent must NOT be wrapped, even though the
 *      editor's own extensions routinely reshape it in the process (Link
 *      adds its default rel/target; StarterKit wraps list-item text in a
 *      <p>). Byte-exact "did anything change" is the wrong test for that —
 *      see lostContent's own comment — so this pins the CONTAINMENT check
 *      directly against the two reshapes that motivated it.
 *
 * ── THE ROUND TRIP IS THE REAL ONE, NOT A STAND-IN ──────────────────────────
 * Every assertion here drives an actual mounted `Editor`'s `setContent()` /
 * `getHTML()`, and passes `editor.schema` — not a hand-built extension list —
 * into `wrapIfLossy`, exactly as CustomPageForm.jsx does at all three of its
 * call sites. See wrapIfLossy.js's own comment for why it takes a schema
 * rather than an extension array.
 *
 * ── WHY GLOBAL jsdom, SCOPED PER TEST RATHER THAN FILE-WIDE ─────────────────
 * RawHtmlNode's `renderHTML` returns an actual DOM element built with
 * `.innerHTML =` (the only way to place already-serialised markup back
 * unescaped — see its own file comment), and `toDOM` is never handed the
 * document a particular serialize call is using, so it necessarily reads the
 * ambient global — real at runtime, since this editor only ever runs
 * client-side. jsdom standing in for `window`/`document` here is the same
 * trade test/render/imageNodeViewButton already made.
 *
 * The runner drives every render-tier file in ONE process with concurrency
 * on (test/run.mjs), so a `before`/`after` pair that leaves the globals
 * installed for the whole file would be live while unrelated files' tests
 * interleave — exactly the leak imageNodeViewButton's own `mount()` avoids by
 * installing and restoring inside one synchronous call, never across an
 * `await`. `withGlobalDom` below is that same pattern, generalised to also
 * cover the two tests that call `lostContent` without mounting an editor —
 * `contentMultiset` still needs a global `document`/`Node` to build its DOM
 * fingerprint.
 */
function withGlobalDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    Node: globalThis.Node,
    raf: globalThis.requestAnimationFrame,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  // ProseMirror's focus path schedules through rAF, which jsdom does not
  // provide — same shim as test/render/imageNodeViewButton.
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  try {
    return fn();
  } finally {
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.Node = prev.Node;
    globalThis.requestAnimationFrame = prev.raf;
  }
}

/** The extension set CustomPageForm actually registers, narrowed to what bears on this. */
const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
  TiptapLink.configure({ openOnClick: false, autolink: true }),
  ResizableImage.configure({ inline: false, allowBase64: false }),
  IframeNode,
  StyleNode,
  RawHtmlNode,
];

/** A live editor against a real DOM, mirroring how CustomPageForm mounts one. Must run inside withGlobalDom. */
function mount(extensions, content) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return new Editor({ element, extensions, content });
}

// ── V2: a fixture the schema cannot represent survives byte-for-byte ───────

test('a fixture with nested div/style=/class=/ul/strong wraps, and the wrapped form round-trips unchanged', () => {
  withGlobalDom(() => {
    const fixture =
      '<div class="wrap" style="border:1px solid #000">' +
      '<p>intro</p>' +
      '<ul class="list"><li><strong>bold item</strong> and <em>em</em></li></ul>' +
      '<style>.wrap{color:red}</style>' +
      '</div>';

    const editor = mount(EXTENSIONS, '<p>seed</p>');
    try {
      const wrapped = wrapIfLossy(fixture, editor.schema);
      assert.match(wrapped, /^<div data-raw-html="">/, 'the schema-unrepresentable fixture was not wrapped');
      assert.equal(
        wrapped,
        `<div data-raw-html="">${fixture}</div>`,
        'the payload inside the wrapper was not the fixture verbatim',
      );

      // setContent(wrapped) → getHTML() — the real round trip, via RawHtmlNode.
      editor.commands.setContent(wrapped);
      const out = editor.getHTML();
      assert.equal(out, wrapped, 'setContent(wrapped) -> getHTML() changed the wrapped fixture');
    } finally {
      editor.destroy();
    }
  });
});

test('wrapping is idempotent: wrapIfLossy on its own output does not add a second layer', () => {
  withGlobalDom(() => {
    const fixture = '<div class="x"><ul><li><strong>Hi</strong></li></ul></div>';
    const editor = mount(EXTENSIONS, '<p>seed</p>');
    try {
      const once = wrapIfLossy(fixture, editor.schema);
      const twice = wrapIfLossy(once, editor.schema);
      assert.equal(twice, once, 'a second wrapIfLossy pass changed already-wrapped content');
      assert.equal((once.match(/data-raw-html/g) ?? []).length, 1, 'the fixture was wrapped more than once');
    } finally {
      editor.destroy();
    }
  });
});

test('CONTROL: without RawHtmlNode in the schema, the same fixture is not merely unwrapped — it is lost', () => {
  withGlobalDom(() => {
    const withoutRawHtmlNode = EXTENSIONS.filter((ext) => ext !== RawHtmlNode);
    const fixture = '<div class="wrap"><ul><li><strong>Hi</strong></li></ul></div>';
    const editor = mount(withoutRawHtmlNode, '<p>seed</p>');
    try {
      editor.commands.setContent(fixture);
      const out = editor.getHTML();
      assert.doesNotMatch(out, /class="wrap"/, 'the control kept the div — it is not exercising the defect');
      assert.match(out, /Hi/, 'the control dropped the whole document, not just the wrapper');
      assert.ok(lostContent(fixture, out), 'lostContent did not notice the missing <div>/class, with RawHtmlNode removed');
    } finally {
      editor.destroy();
    }
  });
});

// ── V3: ordinary WYSIWYG content is never wrapped, even though the schema reshapes it ──

test('an ordinary document — headings, a link, a bullet list, an image — is not wrapped', () => {
  withGlobalDom(() => {
    const ordinary =
      '<h1>Title</h1>' +
      '<p>hello <a href="https://example.com">link</a></p>' +
      '<ul><li>one</li><li>two</li></ul>' +
      '<img src="https://example.com/a.png">';

    const editor = mount(EXTENSIONS, '<p>seed</p>');
    try {
      const result = wrapIfLossy(ordinary, editor.schema);
      assert.equal(result, ordinary, 'an ordinary WYSIWYG document was wrapped');
      assert.doesNotMatch(result, /data-raw-html/, 'an ordinary WYSIWYG document was wrapped');
    } finally {
      editor.destroy();
    }
  });
});

test("a bare link is reshaped by Link's default rel/target, and that reshape alone is not loss", () => {
  withGlobalDom(() => {
    const html = '<p>hello <a href="https://example.com">link</a></p>';
    const editor = mount(EXTENSIONS, html);
    try {
      const roundTripped = editor.getHTML();
      assert.notEqual(
        roundTripped, html,
        "control: Link is no longer adding rel/target by default — this test no longer exercises anything",
      );
      assert.match(roundTripped, /rel="[^"]*noopener/, "expected Link's default rel to appear");
      assert.equal(lostContent(html, roundTripped), false, 'an added rel/target was wrongly counted as lost content');
    } finally {
      editor.destroy();
    }
  });
});

test("bare list-item text gets wrapped in <p> by StarterKit, and that reshape alone is not loss", () => {
  withGlobalDom(() => {
    const html = '<ul><li>one</li><li>two</li></ul>';
    const editor = mount(EXTENSIONS, html);
    try {
      const roundTripped = editor.getHTML();
      assert.notEqual(
        roundTripped, html,
        'control: list items are no longer auto-wrapped in <p> — this test no longer exercises anything',
      );
      assert.match(roundTripped, /<li><p>one<\/p><\/li>/);
      assert.equal(
        lostContent(html, roundTripped), false,
        "StarterKit's <p>-wrapping of list-item text was wrongly counted as lost content",
      );
    } finally {
      editor.destroy();
    }
  });
});

test('CONTROL: lostContent does still catch a genuinely unrecognised element', () => {
  withGlobalDom(() => {
    const html = '<foo-bar class="x">hello</foo-bar>';
    const editor = mount(EXTENSIONS, html);
    try {
      const roundTripped = editor.getHTML();
      assert.ok(lostContent(html, roundTripped), 'an element with no schema entry at all must still be flagged as lost');
    } finally {
      editor.destroy();
    }
  });
});

test('a value that is REWRITTEN, not merely added, is treated as loss (deliberate, conservative bias)', () => {
  withGlobalDom(() => {
    // lostContent operates on plain HTML strings — no schema involved — so
    // this exercises the exported function directly rather than through
    // wrapIfLossy. It still needs the global DOM withGlobalDom installs,
    // since contentMultiset builds its fingerprint with document.createElement.
    assert.ok(
      lostContent('<div class="a"></div>', '<div class="b"></div>'),
      'a rewritten attribute value must count as loss, not merely an addition',
    );
    assert.equal(
      lostContent('<div class="a"></div>', '<div class="a" data-extra="1"></div>'),
      false,
      'a genuinely ADDED attribute must not count as loss',
    );
  });
});
