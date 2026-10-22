import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripLinkerParam } from '@/lib/analytics/linkerParam';

/**
 * `_gl` out, everything else byte-for-byte. See src/lib/analytics/linkerParam.js.
 *
 * The value below is the shape gtag really writes — `*`-separated, ending in
 * `..` — including the `_up*MQ..` url_passthrough marker.
 */
const GL = '_gl=1*h7w08j*_up*MQ..*_ga*MTIzNDU2Nzg5LjE3Mjk1MDAwMDA.*_ga_ZBWWCS7B6D*MTcyOTUwMDAwMC4xLjAuMTcyOTUwMDAwMC4wLjAuMA..';

test('only _gl: the query string goes entirely, no dangling "?"', () => {
  assert.equal(stripLinkerParam(`/power-bi-training-course?${GL}`), '/power-bi-training-course');
});

test('_gl among other params: every other pair survives, in order, unre-encoded', () => {
  assert.equal(
    stripLinkerParam(`/registration/public/step-1?course=claude-ai&${GL}&class=6720%20a+b&utm_source=line&gclid=Cj0K`),
    '/registration/public/step-1?course=claude-ai&class=6720%20a+b&utm_source=line&gclid=Cj0K',
  );
});

test('_gl first and _gl last', () => {
  assert.equal(stripLinkerParam(`/x?${GL}&course=a&class=b`), '/x?course=a&class=b');
  assert.equal(stripLinkerParam(`/x?course=a&class=b&${GL}`), '/x?course=a&class=b');
});

test('the hash is kept, on relative and absolute URLs', () => {
  assert.equal(stripLinkerParam(`/x?a=1&${GL}#schedule`), '/x?a=1#schedule');
  assert.equal(stripLinkerParam(`/x?${GL}#schedule`), '/x#schedule');
  assert.equal(
    stripLinkerParam(`https://www.9experttraining.com/x?${GL}&a=1#s`),
    'https://www.9experttraining.com/x?a=1#s',
  );
});

test('no _gl: the SAME string comes back — and look-alikes are not _gl', () => {
  for (const url of [
    '/x',
    '/x?course=a&class=b#h',
    '/x?_gla=1&gl=2&x_gl=3',
    '/x#_gl=1',
    'https://www.9experttraining.com/?utm_source=a+b',
  ]) {
    assert.equal(stripLinkerParam(url), url);
  }
});
