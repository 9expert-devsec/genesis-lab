import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubStyleCss, scrubStyleBlocks } from '@/lib/roadmap/sanitizeRoadmapSvg';

// The <style> CSS scrub for inline roadmap SVGs. DOMPurify (script + on* handler
// stripping) is DOM-dependent and verified by a manual node check, not here —
// this gated tier covers the PURE CSS scrub, which is the new security surface.

test('keeps hover CSS + internal paint refs, drops @import/expression/behavior/js', () => {
  const css = `
    .node:hover { fill:#A88429; opacity:.8; transition:fill .2s; cursor:pointer; }
    .g { stroke: url(#desktop___Linear4); }
    @import url("http://evil/x.css");
    .bad { background: url(javascript:alert(1)); width: expression(alert(1)); behavior: url(x.htc); }
    .ext { background: url('https://tracker/leak.png'); }
  `;
  const out = scrubStyleCss(css);
  // KEEPS the hover mechanism
  assert.ok(/:hover/.test(out), 'keeps :hover selector');
  assert.ok(/fill:#A88429/.test(out), 'keeps fill');
  assert.ok(/transition:fill \.2s/.test(out), 'keeps transition');
  assert.ok(/url\(#desktop___Linear4\)/.test(out), 'keeps internal url(#gradient) paint ref');
  // DROPS every dangerous construct
  assert.ok(!/@import/i.test(out), 'drops @import');
  assert.ok(!/expression/i.test(out), 'drops expression()');
  assert.ok(!/behavior/i.test(out), 'drops behavior:');
  assert.ok(!/javascript:/i.test(out), 'drops javascript: scheme');
  assert.ok(!/tracker/i.test(out), 'drops external url() target');
});

test('comment-splitting obfuscation is defeated (comments stripped first)', () => {
  assert.ok(!/import/i.test(scrubStyleCss('@imp/* x */ort url(http://e);')), 'split @import still dropped');
  assert.ok(!/expression/i.test(scrubStyleCss('a{width:expr/**/ession(alert(1))}')), 'split expression dropped');
});

// CONTROL: purely-safe CSS passes through intact — proves the scrub distinguishes
// dangerous from safe, rather than nuking all CSS (which would "pass" the drop
// checks above for the wrong reason and also kill hover).
test('control: purely-safe hover CSS is preserved unchanged', () => {
  const safe = '.n:hover{fill:gold;stroke-width:2;opacity:1}';
  assert.equal(scrubStyleCss(safe), safe);
});

test('scrubStyleBlocks only touches <style> contents, leaves other markup intact', () => {
  const svg = '<svg><style>.n:hover{fill:gold}@import url(http://e);</style>'
    + '<a xlink:href="https://x"><rect class="n"/></a></svg>';
  const out = scrubStyleBlocks(svg);
  assert.ok(out.includes('<a xlink:href="https://x">'), 'anchor + xlink:href untouched');
  assert.ok(/:hover\{fill:gold\}/.test(out), 'hover rule kept');
  assert.ok(!/@import/i.test(out), '@import scrubbed inside <style>');
});
