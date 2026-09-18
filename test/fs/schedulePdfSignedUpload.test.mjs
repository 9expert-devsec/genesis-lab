// The schedule PDF is a signed direct upload to ONE fixed /files address.
//
// Pins, from the code and not from prose: the action derives its target from
// lib/schedule/schedulePdf and builds no path of its own; signs overwrite +
// invalidate; refuses size through the shared policy and returns that message;
// keeps the metadata the old action stored and the two revalidations it
// performed; and no longer destroys anything in Cloudinary — the destroy that
// used to be here never worked (default resource_type), and with a fixed
// public_id there is nothing to clean up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { SCHEDULE_PDF_CATEGORY, SCHEDULE_PDF_FILE_NAME, schedulePdfPublicPath } from '@/lib/schedule/schedulePdf';
import { LEGACY_PUBLIC_ID_PREFIX, legacyPathToPublicId } from '@/lib/legacyPublicId';

const ACTION = 'src/lib/actions/schedule-pdf.js';
const CLIENT = 'src/app/admin/schedule-pdf/_components/SchedulePDFClient.jsx';
const SRC = readSource(ACTION);
const calls = (code, name) => new RegExp(`\\b${name}\\s*\\(`).test(code);

test('the one address', () => {
  assert.equal(SCHEDULE_PDF_CATEGORY, 'schedule');
  assert.equal(SCHEDULE_PDF_FILE_NAME, '9expert-training-schedule.pdf');
  assert.equal(schedulePdfPublicPath(), '/files/schedule/9expert-training-schedule.pdf');
  const { publicId } = legacyPathToPublicId(schedulePdfPublicPath(), 'raw', LEGACY_PUBLIC_ID_PREFIX);
  assert.equal(publicId, '9exp-genesis/legacy/files/schedule/9expert-training-schedule.pdf');
});

test('the action derives, signs overwrite + invalidate, refuses through the shared policy', () => {
  assert.ok(SRC.code.length > 500);
  for (const fn of ['schedulePdfPublicPath', 'legacyPathToPublicId', 'refuseUpload']) {
    assert.ok(calls(SRC.code, fn), `${ACTION} never calls ${fn}()`);
  }
  assert.match(SRC.code, /legacyPathToPublicId\(publicPath, 'raw', LEGACY_PUBLIC_ID_PREFIX\)/);
  assert.equal(/['"`]\/files\//.test(SRC.code), false, 'literal /files path');
  assert.equal(/\.pdf['"`]/.test(SRC.code), false, 'builds a .pdf name itself');
  assert.equal(/9exp-genesis\/(legacy|schedule)/.test(SRC.code), false, 'hardcoded Cloudinary folder');
  const signed = SRC.code.match(/const toSign = \{([\s\S]*?)\};/);
  assert.ok(signed);
  assert.match(signed[1], /overwrite:\s*true/);
  assert.match(signed[1], /invalidate:\s*true/);
  assert.match(SRC.code, /params:\s*\{\s*\.\.\.toSign,\s*signature\s*\}/);
  assert.match(SRC.code, /\/raw\/upload`/);
  assert.match(SRC.code, /if \(refusal\) return \{ ok: false, error: refusal \};/, "refuseUpload's Thai message is what the admin sees");
});

test('the old shape is gone: no MAX_BYTES, no FormData upload, no Cloudinary destroy, no timestamped name', () => {
  assert.equal(/MAX_BYTES|25 \* 1024/.test(SRC.code), false);
  assert.equal(/uploadSchedulePDF\b/.test(SRC.code), false, 'the through-the-function action is gone');
  assert.equal(/deleteFromCloudinary|uploadToCloudinary|uploader\.destroy/.test(SRC.withImports), false, 'nothing is destroyed or streamed through the server');
  assert.equal(/Date\.now\(\)\.pdf|schedule-\$\{/.test(SRC.code), false, 'no timestamped public_id');
  assert.equal(/Best-effort cleanup/.test(SRC.raw), false, 'the comment describing the cleanup went with it');
});

test('metadata and revalidation are kept: filename / uploadedAt / uploadedBy, and both paths', () => {
  const rec = SRC.code.match(/export async function recordSchedulePDFUpload[\s\S]*?\n\}/);
  assert.ok(rec);
  for (const f of ['url: target.publicPath', 'publicId: target.publicId', 'filename:', 'uploadedAt: new Date()', 'uploadedBy: session.user?.email']) {
    assert.ok(rec[0].includes(f), `record does not write ${f}`);
  }
  assert.match(SRC.code, /revalidatePath\('\/schedule'\)/);
  assert.match(SRC.code, /revalidatePath\('\/admin\/schedule-pdf'\)/);
  assert.equal((SRC.code.match(/revalidate\(\);/g) || []).length, 2, 'record and delete both revalidate');
  assert.equal((SRC.code.match(/requireAdmin\('schedule_pdf'\)/g) || []).length, 3, 'sign, record, delete all guard');
  assert.equal((SRC.code.match(/menu:\s*'schedule_pdf'/g) || []).length, 3);
  assert.equal((SRC.code.match(/entity:\s*'pdf'/g) || []).length, 3, "('schedule_pdf','pdf') is the contract's pair");
});

test('the admin client signs, posts the params verbatim to Cloudinary, then records', () => {
  const { code, withImports } = readSource(CLIENT);
  assert.match(withImports, /signSchedulePDFUpload,\s*recordSchedulePDFUpload,\s*deleteSchedulePDF/);
  assert.equal(/uploadSchedulePDF\b/.test(code), false);
  assert.match(code, /signSchedulePDFUpload\(\{ bytes: file\.size \}\)/);
  assert.match(code, /for \(const \[k, v\] of Object\.entries\(signed\.params\)\) body\.append\(k, String\(v\)\)/);
  assert.match(code, /fetch\(signed\.uploadUrl, \{ method: 'POST', body \}\)/);
  assert.match(code, /recordSchedulePDFUpload\(\{\s*filename: file\.name \?\? '',/);
  assert.match(code, /setError\(signed\?\.error \?\? /, 'the sign refusal (size / type) is surfaced verbatim');
});
