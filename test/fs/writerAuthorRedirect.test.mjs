import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSource } from '../sourceScan.mjs';

/**
 * /writer → /author: the redirect lives in next.config.mjs (not the Redirect
 * Panel), and the public tree really moved.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('next.config redirects /writer and /writer/:slug permanently to /author', async () => {
  const cfg = (await import(pathToFileURL(path.join(ROOT, 'next.config.mjs')).href)).default;
  const rules = await cfg.redirects();
  const find = (source) => rules.find((r) => r.source === source);
  assert.deepEqual(find('/writer'), { source: '/writer', destination: '/author', permanent: true });
  assert.deepEqual(find('/writer/:slug'), { source: '/writer/:slug', destination: '/author/:slug', permanent: true });
});

test('the public routes live under /author, and /writer is gone from the tree', () => {
  assert.ok(existsSync(path.join(ROOT, 'src/app/(public)/author/page.jsx')));
  assert.ok(existsSync(path.join(ROOT, 'src/app/(public)/author/[slug]/page.jsx')));
  assert.equal(existsSync(path.join(ROOT, 'src/app/(public)/writer')), false);
});

test('the deactivated-writer 308 goes to /author/9expert-academy', () => {
  const urls = readSource('src/lib/writers/writerUrls.js').code;
  assert.match(urls, /export const WRITER_LIST_PATH = '\/author';/);
  assert.match(readSource('src/app/(public)/author/[slug]/page.jsx').code, /permanentRedirect\(DEFAULT_WRITER_PATH\)/);
});

test('hero: a 32px / 40px gap under the breadcrumb, literal classes', () => {
  const page = readSource('src/app/(public)/author/[slug]/page.jsx').code;
  assert.match(page, /<div className="mt-8 flex flex-col items-center gap-6 text-center md:mt-10 md:flex-row/);
});

test('thumbnails: i.ytimg.com is allowed by the CSP img-src', () => {
  const cfg = readSource('next.config.mjs').raw;
  assert.match(cfg, /img-src [^"]*https:\/\/i\.ytimg\.com/);
});

test('the public page makes no YouTube call: only the save action fills titles', () => {
  for (const rel of ['src/app/(public)/author/[slug]/page.jsx', 'src/app/(public)/author/_components/WriterProfileBody.jsx']) {
    const code = readSource(rel).code;
    assert.equal(/oembed|fillYouTubeTitles|fetchYouTubeTitle/.test(code), false, rel);
  }
  assert.match(readSource('src/lib/actions/writers.js').code, /await fillYouTubeTitles\(parsed\.data\.youtubeVideos\)/);
});
