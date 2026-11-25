import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSource } from '../sourceScan.mjs';

/**
 * The OpenAI Ads pixel: where its one conversion fires, and the gate in front
 * of its loader. The registration step is never reached in a browser (no test
 * registrations), so the wiring is proved from source here.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function srcFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...srcFiles(p));
    else if (/\.(m?js|jsx)$/.test(name)) out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
  }
  return out;
}

test('registration_completed: in trackRegistration, after the dataLayer push, behind claimOnce, register_public only, optional-chained in a try', () => {
  const code = readSource('src/lib/analytics/conversions.js').code;
  const start = code.indexOf('function trackRegistration(');
  assert.ok(start >= 0, 'trackRegistration not found');
  const body = code.slice(start, code.indexOf('\n}\n', start));

  const iGuard = body.indexOf('if (!claimOnce(event, registrationId)) return;');
  const iPush = body.indexOf('pushEvent(event,');
  const call = /window\.oaiq\?\.\(\s*'measure',\s*'registration_completed',\s*\{\s*type:\s*'customer_action'\s*\}\s*\)/;
  const iCall = body.search(call);
  assert.ok(iGuard >= 0 && iPush > iGuard, 'the existing guard → push order changed');
  assert.ok(iCall > iPush, 'registration_completed is missing or precedes the dataLayer push');

  const before = body.slice(0, iCall);
  assert.ok(before.lastIndexOf('try {') > before.lastIndexOf('if (event === EVENTS.registerPublic)'), 'call is not inside a try within the register_public branch');
  assert.ok(before.includes('if (event === EVENTS.registerPublic)'), 'call is not limited to register_public');
  assert.match(body.slice(iCall), /^[^\n]*\n\s*\}\s*catch\s*\{/, 'the try has no catch right after the call');

  // Only the public flow is wired: the event name appears in no other source file.
  const hits = srcFiles(path.join(ROOT, 'src')).filter((f) => readSource(f).code.includes("'registration_completed'"));
  assert.deepEqual(hits, ['src/lib/analytics/conversions.js']);
});

test('loader: marketing-gated, env-configured, init queued once, debug off only on Vercel production, mounted in the layout', async () => {
  const loader = readSource('src/components/analytics/OaiPixelLoader.jsx').code;
  assert.match(loader, /if \(!pixelId \|\| marketing !== true\) return null;/);
  assert.match(loader, /subscribeConsentDecision\(apply\)/);
  assert.match(readSource('src/app/layout.jsx').code, /<OaiPixel\s*\/>/);
  assert.match(readSource('src/lib/analytics/oaiPixel.js').code, /process\.env\.NEXT_PUBLIC_OAI_PIXEL_ID/);
  assert.equal(srcFiles(path.join(ROOT, 'src')).some((f) => readSource(f).raw.includes('GcpjPW2pjFRLcvX6XnjD8t')), false, 'pixel id hardcoded in src/');

  const lib = await import(pathToFileURL(path.join(ROOT, 'src/lib/analytics/oaiPixel.js')).href);
  assert.equal(lib.oaiPixelDebug({ VERCEL_ENV: 'production' }), false);
  assert.equal(lib.oaiPixelDebug({ VERCEL_ENV: 'preview' }), true);
  assert.equal(lib.oaiPixelDebug({}), true);

  const had = globalThis.window;
  globalThis.window = {};
  try {
    lib.initOaiPixel({ pixelId: '', debug: true });
    assert.equal(globalThis.window.oaiq, undefined, 'no id must install nothing');
    assert.equal(lib.isOaiPixelReady(), false);
    lib.initOaiPixel({ pixelId: 'TESTPIXEL123', debug: false });
    lib.initOaiPixel({ pixelId: 'TESTPIXEL123', debug: false });
    const queued = globalThis.window.oaiq.q.map((a) => [...a]);
    assert.deepEqual(queued, [['init', { pixelId: 'TESTPIXEL123', debug: false }]], 'init must be queued exactly once');
    assert.equal(lib.isOaiPixelReady(), true);
    lib.setOaiPixelConsent(false);
    assert.equal(lib.isOaiPixelReady(), false, 'withdrawal must stop events');
  } finally {
    if (had === undefined) delete globalThis.window; else globalThis.window = had;
  }
});
