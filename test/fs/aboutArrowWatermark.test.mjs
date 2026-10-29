import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readSource } from '../sourceScan.mjs';

/**
 * AB-2g: the instructor-card watermark is public/about-img/arrow-logo.svg,
 * INLINED in InstructorPhotoPanel (the file's own opacity="0.12" would
 * otherwise multiply with the CSS opacity). This pins the inlined copy to the
 * file, so replacing the asset without updating the component — or the other
 * way round — turns red. It also keeps the asset free of anything that could
 * run or fetch.
 */

const ROOT = path.resolve(import.meta.dirname, '../..');
const SVG = readFileSync(path.join(ROOT, 'public/about-img/arrow-logo.svg'), 'utf8');
const PANEL = readSource('src/components/about/InstructorPhotoPanel.jsx').code;

test('the inlined path and viewBox are exactly the asset\'s', () => {
  const fileD = /<path[^>]*\sd="([^"]+)"/.exec(SVG)?.[1];
  const fileViewBox = /viewBox="([^"]+)"/.exec(SVG)?.[1];
  assert.ok(fileD && fileViewBox, 'CONTROL: the asset was parsed');
  assert.equal(/const ARROW_LOGO_PATH =\s*'([^']+)'/.exec(PANEL)?.[1], fileD);
  assert.equal(/const ARROW_LOGO_VIEWBOX = '([^']+)'/.exec(PANEL)?.[1], fileViewBox);
});

test('the inline copy takes its colour and opacity from CSS, not from the file', () => {
  const svg = PANEL.slice(PANEL.indexOf('<svg'), PANEL.indexOf('</svg>'));
  assert.match(svg, /fill="currentColor"/);
  assert.doesNotMatch(svg, /opacity=|#6FA0FF/i);
  assert.match(svg, /aria-hidden="true"/);
});

test('the asset has no script, style, raster or external reference', () => {
  assert.doesNotMatch(SVG, /<script|<style|<image|<foreignObject|href=|url\(|data:|\son[a-z]+=/i);
});
