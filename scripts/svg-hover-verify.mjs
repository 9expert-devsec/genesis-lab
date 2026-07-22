/**
 * svg-hover-verify.mjs — Prove the converted SVG survives the REAL production
 * sanitize path (sanitizeRoadmapSvg + isomorphic-dompurify), not just on disk.
 *
 * Usage: node scripts/svg-hover-verify.mjs <converted.hover-css.svg>
 *
 * Asserts (Step 5 of the task):
 *   1. <style> survives sanitization; :hover selectors + both colours verbatim.
 *   2. Zero on* attributes remain.
 *   3. Every xlink:href course link survives (expects 3).
 *   4. CONTROL — a dangerous <style> payload IS scrubbed while a benign
 *      url(#gradient) paint ref is preserved. If the payload survives, the
 *      scrubber is broken; we STOP rather than bless the pipeline.
 *   5. Initial-paint check — the gold layer is display:none on first paint
 *      (no flash of hover state before CSS applies).
 */

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import DOMPurify from 'isomorphic-dompurify';
import { sanitizeRoadmapSvg, scrubStyleCss } from '../src/lib/roadmap/sanitizeRoadmapSvg.js';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
};

function styleText(markup) {
  const m = /<style\b[^>]*>([\s\S]*?)<\/style>/i.exec(markup);
  return m ? m[1] : '';
}

function run(inputPath) {
  const raw = readFileSync(inputPath, 'utf8');
  const sanitized = sanitizeRoadmapSvg(raw, DOMPurify);

  console.log(`\n=== verify ${inputPath} ===`);

  // 1. <style> + hover selectors + colours survive.
  const css = styleText(sanitized);
  ok(css.length > 0, '<style> block present after sanitization');
  ok(/:hover/.test(css), ':hover selectors survive');

  // Extract the colours the source actually used and assert each survives.
  const rawCss = styleText(raw);
  const colours = Array.from(new Set(rawCss.match(/#[0-9A-Fa-f]{3,8}\b/g) || []));
  ok(colours.length >= 2, `source <style> declares ≥2 colours (${colours.join(', ') || 'none'})`);
  for (const c of colours) ok(css.includes(c), `colour ${c} survives verbatim`);

  // Every selector in the sanitized CSS must still start with an #id (no leak).
  const selectors = css
    .split('}')
    .map((r) => r.split('{')[0].trim())
    .filter(Boolean);
  ok(
    selectors.every((s) => s.startsWith('#')),
    `every rule is ID-scoped (${selectors.length} rules, none unscoped)`
  );

  // 2. Zero on* handlers.
  const onAttrs = sanitized.match(/\son[a-z]+\s*=/gi) || [];
  ok(onAttrs.length === 0, `zero on* attributes remain (found: ${onAttrs.join(', ') || 'none'})`);

  // 3. xlink:href links survive.
  const dom = new JSDOM(sanitized, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  const links = Array.from(doc.querySelectorAll('a')).filter(
    (a) => a.getAttribute('xlink:href') || a.getAttribute('href')
  );
  ok(links.length === 3, `all course links survive (found ${links.length}, expected 3)`);

  // 5. Initial paint — gold layer hidden on first paint. The CSS must declare
  //    `display: none` for a group, and that group must NOT carry an inline
  //    display that would override it, and the CSS default (non-:hover) rule wins.
  const hiddenRules = css.match(/#([\w-]+)\s*\{[^}]*display\s*:\s*none[^}]*\}/gi) || [];
  ok(hiddenRules.length > 0, 'CSS sets display:none default for the hover group(s)');
  let flashFree = true;
  for (const r of hiddenRules) {
    const id = /#([\w-]+)/.exec(r)[1];
    const el = doc.querySelector(`[id="${id}"]`);
    const inline = (el && el.getAttribute('style')) || '';
    if (/display\s*:/i.test(inline)) {
      flashFree = false;
      console.log(`      note: #${id} still carries inline display — would override the CSS default`);
    }
  }
  ok(flashFree, 'no hover group carries an inline display that would beat the CSS default (no flash)');

  // 4. CONTROL — dangerous payload must be scrubbed; benign paint ref preserved.
  console.log('\n  -- dangerous-payload control --');
  const evilSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
    '<style>.x{background:url(#desktop___Linear1)}' +
    '@import url(//evil/x.css);.y{width:expression(alert(1))};' +
    '.z{behavior:url(x.htc);background:url(javascript:alert(1))}</style>' +
    '<a xlink:href="https://example.com/course"><rect class="x"/></a></svg>';
  const evilOut = sanitizeRoadmapSvg(evilSvg, DOMPurify);
  const evilCss = styleText(evilOut);
  ok(!/@import/i.test(evilOut), 'control: @import stripped');
  ok(!/expression/i.test(evilOut), 'control: expression() stripped');
  ok(!/behavior/i.test(evilOut), 'control: behavior: stripped');
  ok(!/javascript:/i.test(evilOut), 'control: javascript: scheme stripped');
  ok(!/evil/i.test(evilOut), 'control: external @import target removed');
  ok(/url\(#desktop___Linear1\)/.test(evilCss), 'control: benign url(#gradient) paint ref PRESERVED');
  // scrubStyleCss sanity (pure): a clean payload must round-trip unchanged.
  ok(
    scrubStyleCss('#a:hover #b path{fill:#A88429}') === '#a:hover #b path{fill:#A88429}',
    'control: purely-safe CSS passes through unchanged'
  );

  console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
  return failures;
}

const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/svg-hover-verify.mjs <converted.hover-css.svg>');
  process.exit(2);
}
process.exit(run(input) === 0 ? 0 : 1);
