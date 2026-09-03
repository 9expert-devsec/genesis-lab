import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { StyleNode } from '@/app/admin/pages/_components/extensions/StyleNode';
import { RawHtmlNode } from '@/app/admin/pages/_components/extensions/RawHtmlNode';
import { wrapIfLossy } from '@/lib/customPages/wrapIfLossy';
import { formatHTML } from '@/lib/customPages/formatHTML';

/**
 * formatHTML PRETTY-PRINTS THE SOURCE HTML TEXTAREA — AND MUST NEVER TOUCH A
 * rawHtmlBlock's OWN BYTES WHILE DOING IT.
 *
 * "Stable from the second toggle onward" (test/render/rawHtmlBlockWrapIfLossy
 * doesn't claim more than that) is not good enough on its own: the FIRST
 * toggle is the one that rewrites the admin's actual bytes, and whitespace is
 * significant inside a `<pre>` and inside a `<style>` block — reindenting
 * either is not cosmetic, it changes what the page renders. `formatHTML`
 * therefore carves every rawHtmlBlock out before reformatting anything and
 * splices it back verbatim; this pins that on the FIRST pass, not eventually.
 */

let prevWindow;
let prevDocument;
let prevNode;
let prevRaf;
function withGlobalDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  prevWindow = globalThis.window;
  prevDocument = globalThis.document;
  prevNode = globalThis.Node;
  prevRaf = globalThis.requestAnimationFrame;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  try {
    return fn();
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
    globalThis.Node = prevNode;
    globalThis.requestAnimationFrame = prevRaf;
  }
}

const EXTENSIONS = [StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }), StyleNode, RawHtmlNode];

function mount(content) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return new Editor({ element, extensions: EXTENSIONS, content });
}

test('a <pre> with meaningful indentation inside a rawHtmlBlock is byte-identical after normal->source->normal, on the FIRST toggle', () => {
  withGlobalDom(() => {
    const fixture =
      '<div class="wrap">' +
      '<pre>function f() {\n    if (x) {\n        return 1;\n    }\n}</pre>' +
      '<style>.wrap  {  color :  red  ;  }</style>' +
      '</div>';

    const editor = mount('<p>seed</p>');
    try {
      const wrapped = wrapIfLossy(fixture, editor.schema);
      editor.commands.setContent(wrapped);
      const beforeToggle = editor.getHTML();
      assert.equal(beforeToggle, wrapped, 'setup: the fixture did not wrap the way this test expects');

      // normal -> source: this is the FIRST toggle, and formatHTML's own output.
      const sourceHtml = formatHTML(beforeToggle);
      assert.ok(
        sourceHtml.includes(fixture),
        'formatHTML rewrote bytes inside the rawHtmlBlock on the very first toggle',
      );

      // source -> normal
      editor.commands.setContent(wrapIfLossy(sourceHtml, editor.schema));
      const afterToggle = editor.getHTML();
      assert.equal(
        afterToggle, beforeToggle,
        'normal -> source -> normal was not byte-identical on the first toggle',
      );
    } finally {
      editor.destroy();
    }
  });
});

test('ordinary content around a rawHtmlBlock is still pretty-printed', () => {
  withGlobalDom(() => {
    const editor = mount('<p>seed</p>');
    try {
      const wrapped = wrapIfLossy('<div class="x"><ul><li>one</li></ul></div>', editor.schema);
      editor.commands.setContent(`<h1>Title</h1>${wrapped}<p>after</p>`);
      const formatted = formatHTML(editor.getHTML());
      assert.match(formatted, /<h1>Title<\/h1>\n/, 'the heading before the block lost its own line');
      assert.match(formatted, /\n<p>after<\/p>/, 'the paragraph after the block lost its own line');
      assert.ok(formatted.includes(wrapped), 'the block itself must still appear byte-for-byte among the pretty-printed lines');
    } finally {
      editor.destroy();
    }
  });
});

test('a rawHtmlBlock containing its own nested <div> is not truncated at the first inner </div>', () => {
  withGlobalDom(() => {
    // The naive "find the first </div>" approach would cut this off after the
    // inner </div>, losing the outer wrapper's closing tag and everything meant
    // to come after it in the document.
    const fixture = '<div class="outer"><div class="inner">x</div><p>tail</p></div>';
    const editor = mount('<p>seed</p>');
    try {
      const wrapped = wrapIfLossy(fixture, editor.schema);
      editor.commands.setContent(`${wrapped}<p>after</p>`);
      const formatted = formatHTML(editor.getHTML());
      assert.ok(formatted.includes(wrapped), 'the nested-<div> payload was truncated instead of carved out whole');
      assert.match(formatted, /\n<p>after<\/p>/, 'content after the block was swallowed along with it');
    } finally {
      editor.destroy();
    }
  });
});
