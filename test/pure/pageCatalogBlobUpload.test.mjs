import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_CATALOG_MAX_BYTES,
  isPageCatalogFileName,
  pageCatalogFileFor,
  refusePageCatalogBlobUpload,
  refusePageCatalogSize,
} from '@/lib/pageCatalogPaths.mjs';
import {
  MINT,
  refusePageCatalogRecord,
  runPageCatalogMintFlow,
} from '@/lib/pageCatalogUploadFlow.mjs';
import { COPY_ACTION, decidePageCatalogCopy, planPageCatalogCopy } from '@/lib/pageCatalogCopyPlan.mjs';
import { catalogTarget } from '@/lib/pageCatalog';
import { RAW_MAX_BYTES } from '@/lib/legacyUploadPolicy.mjs';

/**
 * CATALOG-UPLOAD BUILD — the pure decisions behind moving page catalogs to Blob:
 * the derived name, the size routing, the server-side checks on what the
 * browser reports, the receipt-gated mint, and the one-time copy planner.
 */

const BASE = 'https://teststore.public.blob.vercel-storage.com';

test('the derived name: catalogTarget → page-catalogs/<kind>-<key>-catalog.pdf; bad keys and kinds refused', () => {
  const t = catalogTarget('program', 'POWER-BI');
  assert.equal(t.ok, true);
  assert.equal(t.blobPathname, 'page-catalogs/program-power-bi-catalog.pdf');
  assert.equal(t.publicPath, '/files/catalog/program-power-bi-catalog.pdf', 'the PUBLIC path is unchanged');
  // `..`, slashes and other kinds never become a file name.
  for (const [kind, key] of [['program', '../x'], ['program', 'a/b'], ['program', 'x.pdf'], ['course', 'x']]) {
    assert.equal(catalogTarget(kind, key).ok, false, `${kind}/${key} was accepted`);
    assert.equal(pageCatalogFileFor(kind, key), null, `${kind}/${key} named a file`);
  }
  assert.equal(isPageCatalogFileName('program-x-catalog.pdf'), true);
  assert.equal(isPageCatalogFileName('program-x-catalog.png'), false, 'non-.pdf');
  assert.equal(isPageCatalogFileName('../program-x-catalog.pdf'), false);
});

test('size routing: this field allows up to 64 MB — past Cloudinary\'s 10 MB — and refuses above', () => {
  assert.equal(PAGE_CATALOG_MAX_BYTES, 64 * 1024 * 1024);
  assert.equal(refusePageCatalogSize(RAW_MAX_BYTES + 1), null, '10 MB + 1 byte must now be accepted');
  assert.equal(refusePageCatalogSize(12 * 1024 * 1024), null);
  assert.equal(refusePageCatalogSize(PAGE_CATALOG_MAX_BYTES), null);
  assert.equal(refusePageCatalogSize(PAGE_CATALOG_MAX_BYTES + 1), 'ไฟล์เกิน 64 MB');
  assert.match(refusePageCatalogSize(0), /ไฟล์ว่าง/);
  // CONTROL: the shared Cloudinary ceiling is untouched.
  assert.equal(RAW_MAX_BYTES, 10 * 1024 * 1024);
});

test('the URL check refuses a URL outside BLOB_PUBLIC_BASE and another page\'s file', () => {
  const file = 'program-power-bi-catalog.pdf';
  const good = `${BASE}/page-catalogs/${file}`;
  assert.equal(refusePageCatalogBlobUpload({ url: good, pathname: `page-catalogs/${file}`, blobBase: BASE, fileName: file }), null);
  assert.match(refusePageCatalogBlobUpload({ url: `https://evil.example/page-catalogs/${file}`, blobBase: BASE, fileName: file }), /Blob store/);
  assert.match(refusePageCatalogBlobUpload({ url: `${BASE}/page-catalogs/program-excel-catalog.pdf`, blobBase: BASE, fileName: file }), /ไม่ตรง/);
  assert.match(refusePageCatalogBlobUpload({ url: good, pathname: 'page-catalogs/program-excel-catalog.pdf', blobBase: BASE, fileName: file }), /ไม่ตรง/);
  assert.match(refusePageCatalogBlobUpload({ url: good, blobBase: '', fileName: file }), /BLOB_PUBLIC_BASE/);
});

test('the record check refuses a mismatched, unburned or already-recorded receipt', () => {
  const receipt = { kind: 'program', key: 'power-bi', usedAt: new Date(), recordedAt: null };
  const args = { kind: 'program', key: 'power-bi', url: `${BASE}/page-catalogs/program-power-bi-catalog.pdf`, blobBase: BASE };
  assert.equal(refusePageCatalogRecord({ receipt, ...args }), null);
  assert.match(refusePageCatalogRecord({ receipt: { ...receipt, key: 'excel' }, ...args }), /หน้าอื่น/);
  assert.match(refusePageCatalogRecord({ receipt: { ...receipt, kind: 'skill' }, ...args }), /หน้าอื่น/);
  assert.match(refusePageCatalogRecord({ receipt: { ...receipt, usedAt: null }, ...args }), /ยังไม่ถูกใช้/);
  assert.match(refusePageCatalogRecord({ receipt: { ...receipt, recordedAt: new Date() }, ...args }), /บันทึกไปแล้ว/);
  assert.match(refusePageCatalogRecord({ receipt: null, ...args }), /ไม่พบ/);
});

test('the token route mints ONLY for the pathname re-derived from the burned receipt', async () => {
  let mints = 0;
  const receipt = { kind: 'program', key: 'power-bi', usedAt: null, expiresAt: new Date(Date.now() + 60_000) };
  const deps = (burned) => ({
    burn: async () => burned,
    diagnose: async () => null,
    mint: async () => { mints += 1; return { ok: true }; },
    log: async () => {},
  });
  const payload = JSON.stringify({ receiptId: 'r1' });

  const ok = await runPageCatalogMintFlow(
    { pathname: 'page-catalogs/program-power-bi-catalog.pdf', clientPayload: payload, now: Date.now() }, deps(receipt));
  assert.equal(ok.minted, true);
  assert.equal(mints, 1);

  // A valid receipt for power-bi must not authorise another page's file…
  const other = await runPageCatalogMintFlow(
    { pathname: 'page-catalogs/program-excel-catalog.pdf', clientPayload: payload, now: Date.now() }, deps(receipt));
  assert.equal(other.status, MINT.PATHNAME_MISMATCH);
  // …nor a path outside page-catalogs/, nor run without a receipt.
  const escape = await runPageCatalogMintFlow(
    { pathname: '../program-power-bi-catalog.pdf', clientPayload: payload, now: Date.now() }, deps(receipt));
  assert.equal(escape.status, MINT.PATHNAME_MISMATCH);
  const none = await runPageCatalogMintFlow(
    { pathname: 'page-catalogs/program-power-bi-catalog.pdf', clientPayload: '{}', now: Date.now() }, deps(receipt));
  assert.equal(none.status, MINT.NO_RECEIPT);
  const burnedAlready = await runPageCatalogMintFlow(
    { pathname: 'page-catalogs/program-power-bi-catalog.pdf', clientPayload: payload, now: Date.now() }, deps(null));
  assert.equal(burnedAlready.minted, false);
  assert.equal(mints, 1, 'a refused request reached the mint');
});

test('the copy planner: targets, skips, broken sources and non-catalog paths', () => {
  const plan = planPageCatalogCopy([
    { kind: 'program', id: 'POWER-BI', path: '/files/catalog/program-power-bi-catalog.pdf' },
    { kind: 'skill', id: 'DEV', path: '/files/catalog/skill-dev-catalog.pdf' },
    { kind: 'program', id: 'X', path: '/files/catalog/excel-cover.png' },
    { kind: 'skill', id: 'Y', path: '/files/catalog/program-y-catalog.pdf' }, // kind disagrees
  ], { cloudBase: 'https://res.cloudinary.com/demo', legacyPrefix: '9exp-genesis/legacy', blobBase: BASE });

  assert.equal(plan[0].valid, true);
  assert.equal(plan[0].sourceUrl, 'https://res.cloudinary.com/demo/raw/upload/9exp-genesis/legacy/files/catalog/program-power-bi-catalog.pdf');
  assert.equal(plan[0].blobPathname, 'page-catalogs/program-power-bi-catalog.pdf');
  assert.equal(plan[0].blobUrl, `${BASE}/page-catalogs/program-power-bi-catalog.pdf`);
  assert.equal(plan[1].blobPathname, 'page-catalogs/skill-dev-catalog.pdf');
  assert.equal(plan[2].action, COPY_ACTION.BAD_PATH);
  assert.equal(plan[3].action, COPY_ACTION.BAD_PATH);

  assert.equal(decidePageCatalogCopy({ sourceStatus: 200, sourceBytes: 100, blobBytes: null }), COPY_ACTION.COPY);
  assert.equal(decidePageCatalogCopy({ sourceStatus: 200, sourceBytes: 100, blobBytes: 100 }), COPY_ACTION.SKIP);
  assert.equal(decidePageCatalogCopy({ sourceStatus: 200, sourceBytes: 100, blobBytes: 99 }), COPY_ACTION.OVERWRITE);
  assert.equal(decidePageCatalogCopy({ sourceStatus: 404, sourceBytes: null, blobBytes: null }), COPY_ACTION.SOURCE_MISSING);
});
