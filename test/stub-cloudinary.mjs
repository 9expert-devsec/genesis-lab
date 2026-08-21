// Stub for `@/lib/cloudinary`. The real module configures the Cloudinary SDK at
// import time from env; nothing under test should reach the network.
//
// Export set matches the real module EXACTLY — no test-control exports, because
// test/fs/stubExportParity treats an extra as a stale export and rejects it. The
// record of what was deleted lives in test/fakeDb.mjs instead.
//
// uploadToCloudinary THROWS rather than resolving benignly: a stub that agrees
// with everything is its own false green. deleteFromCloudinary records, because
// the page-delete path awaits it for real stored assets.
import { recordCloudinaryDelete } from './fakeDb.mjs';

export async function uploadToCloudinary(_file, _subfolder, _options) {
  throw new Error('uploadToCloudinary is not callable under test');
}

export async function deleteFromCloudinary(publicId) {
  recordCloudinaryDelete(publicId);
  return { result: 'ok' };
}
