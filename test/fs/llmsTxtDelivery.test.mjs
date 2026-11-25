import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * /llms.txt and /llms-full.txt are static files in public/. next.config.mjs
 * declares them `text/plain; charset=utf-8` (Thai renders as mojibake without
 * the charset), and the global security-header entry must still match them.
 * No delivery-layer rewrite may claim either path ahead of public/.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PATHS = ['/llms.txt', '/llms-full.txt'];

test('llms files: in public/, served as UTF-8 plain text with the security headers kept and no rewrite in front', async () => {
  const cfg = (await import(pathToFileURL(path.join(ROOT, 'next.config.mjs')).href)).default;
  const headers = await cfg.headers();
  const rewrites = await cfg.rewrites();

  for (const p of PATHS) {
    assert.ok(existsSync(path.join(ROOT, 'public', p.slice(1))), `public${p} missing`);

    const own = headers.find((h) => h.source === p);
    assert.ok(own, `no headers() entry for ${p}`);
    assert.equal(own.has, undefined, `${p} entry must be unconditional`);
    const ct = own.headers.find((h) => h.key.toLowerCase() === 'content-type');
    assert.equal(ct?.value, 'text/plain; charset=utf-8', p);
    assert.equal(own.headers.some((h) => h.key.toLowerCase() === 'x-robots-tag'), false, `${p} must not set X-Robots-Tag`);

    const global = headers.find((h) => h.source === '/:path*');
    assert.ok(global.headers.some((h) => h.key === 'Strict-Transport-Security'), 'security headers entry intact');
    const ownKeys = new Set(own.headers.map((h) => h.key.toLowerCase()));
    for (const h of global.headers) assert.equal(ownKeys.has(h.key.toLowerCase()), false, `${p} entry shadows ${h.key}`);

    const all = Array.isArray(rewrites) ? rewrites : [...(rewrites.beforeFiles ?? []), ...(rewrites.afterFiles ?? []), ...(rewrites.fallback ?? [])];
    assert.equal(all.some((r) => r.source === p), false, `a rewrite claims ${p}`);
  }
});
