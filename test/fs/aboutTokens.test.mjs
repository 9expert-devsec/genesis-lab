import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * AB-3: the /about-us "Modern" token layer mints no colour. Every --ab-*
 * colour on `.about-page` (light) and `.dark .about-page` (dark) is either a
 * var() to another token or a literal that globals.css already declares
 * somewhere OUTSIDE these two blocks. And the light signal is never lime
 * (1.17:1 on the ice ground).
 */

const ROOT = path.resolve(import.meta.dirname, '../..');
const CSS = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8').replace(/\r\n/g, '\n');

/** The body of the FIRST rule whose selector line is exactly `selector {`. */
function block(selector) {
  const head = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{$`, 'm');
  const m = head.exec(CSS);
  assert.ok(m, `CONTROL: "${selector} {" was found`);
  const start = m.index + m[0].length;
  return { start: m.index, end: CSS.indexOf('\n}', start) + 2, body: CSS.slice(start, CSS.indexOf('\n}', start)) };
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const decls = (body) =>
  [...stripComments(body).matchAll(/(--ab-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => ({ name, value: value.trim() }));

const LIGHT = block('.about-page');
const DARK = block('.dark .about-page');
const OUTSIDE = stripComments(CSS.slice(0, LIGHT.start) + CSS.slice(LIGHT.end, DARK.start) + CSS.slice(DARK.end));
const NOT_COLOURS = new Set(['--ab-dur', '--ab-ease']);

const norm = (s) => s.replace(/\s+/g, '').toLowerCase();
const declaredElsewhere = (literal) => norm(OUTSIDE).includes(norm(literal));

test('both blocks declare the same --ab-* tokens', () => {
  const light = decls(LIGHT.body).map((d) => d.name);
  const dark = decls(DARK.body).map((d) => d.name).concat(['--ab-dur', '--ab-ease']);
  assert.ok(light.length >= 15, `CONTROL: the light block was parsed (${light.length})`);
  assert.deepEqual([...new Set(dark)].sort(), [...new Set(light)].sort());
});

for (const [label, b] of [['light', LIGHT], ['dark', DARK]]) {
  test(`${label}: every --ab-* colour is a var() or a literal already in globals.css`, () => {
    for (const { name, value } of decls(b.body)) {
      if (NOT_COLOURS.has(name)) continue;
      if (/^var\(--[a-z0-9-]+\)$/i.test(value)) {
        const ref = value.slice(4, -1);
        assert.match(OUTSIDE, new RegExp(`${ref}\\s*:`), `${name}: ${ref} is not declared anywhere`);
        continue;
      }
      assert.match(value, /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i, `${name}: "${value}" is neither a var() nor a hex/rgba`);
      assert.ok(declaredElsewhere(value), `${name}: ${value} is a NEW colour — not declared elsewhere in globals.css`);
    }
  });
}

test('light --ab-signal (and the light CTA fill) are not lime', () => {
  const light = Object.fromEntries(decls(LIGHT.body).map((d) => [d.name, d.value]));
  for (const name of ['--ab-signal', '--ab-cta-bg', '--ab-accent']) {
    assert.ok(light[name], `CONTROL: ${name} is declared`);
    assert.doesNotMatch(light[name], /lime|#D4F73F|#D8F852|#B8D930/i, `${name} is lime in light mode`);
  }
});

test('dark --ab-meta is slate-dp-300, never --text-muted (fails AA on the dark ground)', () => {
  const dark = Object.fromEntries(decls(DARK.body).map((d) => [d.name, d.value]));
  assert.equal(dark['--ab-meta'], 'var(--9e-slate-dp-300)');
});

test('CONTROL: the minted-colour probe fires on a colour the file never declares', () => {
  assert.equal(declaredElsewhere('#123457'), false);
  assert.equal(declaredElsewhere('rgba(13, 27, 42, 0.12)'), true);
});
