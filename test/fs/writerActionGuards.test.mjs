import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The actions cannot take injected reads: their arguments arrive from a browser.
 * So test/pure/writerPolicy runs every refusal, and this file proves the actions
 * actually reach those checks, ahead of the write they guard.
 */

const src = readSource('src/lib/actions/writers.js').code;

function body(name) {
  const at = src.indexOf(`export async function ${name}(`);
  assert.notEqual(at, -1, `${name} not found`);
  const next = src.indexOf('\nexport ', at + 1);
  return src.slice(at, next === -1 ? src.length : next);
}

function before(name, earlier, later) {
  const text = body(name);
  const a = text.indexOf(earlier);
  const b = text.indexOf(later);
  assert.notEqual(a, -1, `${name}: ${earlier} is missing`);
  assert.notEqual(b, -1, `${name}: ${later} is missing`);
  assert.ok(a < b, `${name}: ${earlier} must come before ${later}`);
}

for (const [action, write] of [
  ['createWriter', 'Writer.create('],
  ['updateWriter', 'Writer.findByIdAndUpdate('],
  ['setWriterActive', 'Writer.findByIdAndUpdate('],
  ['deleteWriter', 'Writer.findByIdAndDelete('],
]) {
  test(`${action} opens with the writers guard, before it connects or writes`, () => {
    before(action, "requireAdmin('writers')", 'dbConnect()');
    before(action, "requireAdmin('writers')", write);
  });
}

for (const [action, check, write] of [
  ['updateWriter', 'checkWriterUpdate(', 'Writer.findByIdAndUpdate('],
  ['setWriterActive', 'checkSetWriterActive(', 'Writer.findByIdAndUpdate('],
  ['deleteWriter', 'checkDeleteWriter(', 'Writer.findByIdAndDelete('],
]) {
  test(`${action} runs its check, and stops on a refusal, before writing`, () => {
    before(action, check, write);
    before(action, 'if (!check.ok) return check;', write);
  });
}

for (const action of ['listWriters', 'getWriter', 'listInstructorOptions']) {
  test(`${action} is guarded too: it is a server action, reachable by POST`, () => {
    assert.match(body(action), /requireAdmin\('writers'\)/);
  });
}

test('both writes validate through the schema first', () => {
  before('createWriter', 'writerSchema.safeParse(', 'Writer.create(');
  before('updateWriter', 'writerSchema.safeParse(', 'Writer.findByIdAndUpdate(');
});

test('the slug is taken out of what updateWriter writes', () => {
  assert.match(body('updateWriter'), /const \{ slug: _slug, isActive, \.\.\.fields \} = parsed\.data;/);
  assert.doesNotMatch(body('updateWriter'), /\$set: parsed\.data/);
});

test('no action writes isDefault: it only ever appears on the way out', () => {
  const lines = src.split('\n').filter((line) => /\bisDefault\b/.test(line));
  assert.ok(lines.length > 0, 'the audit fields and the list should mention it');
  for (const line of lines) {
    assert.match(line, /sort\(|isDefault: writer\.isDefault/, `unexpected: ${line.trim()}`);
  }
});

test('deactivation is one audit row', () => {
  assert.equal((body('setWriterActive').match(/recordAdminActionAfter\(/g) ?? []).length, 1);
});

test('the old avatar is removed only after the row is durable', () => {
  before('updateWriter', 'Writer.findByIdAndUpdate(', 'removeOldAvatar(');
  before('deleteWriter', 'Writer.findByIdAndDelete(', 'removeOldAvatar(');
});

test('article counts go through the aggregate, not a schema-filtered query', () => {
  assert.match(src, /Article\.aggregate\(writerArticleCountPipeline\(/);
  assert.doesNotMatch(src, /Article\.(?:countDocuments|find)\(/);
});

test('every page is guarded with requirePage', () => {
  for (const rel of [
    'src/app/admin/writers/page.jsx',
    'src/app/admin/writers/new/page.jsx',
    'src/app/admin/writers/[id]/page.jsx',
  ]) {
    assert.match(readSource(rel).code, /await requirePage\('writers'\)/, rel);
  }
});

test('the crop dialog hands over pixels, and the field uploads nothing', () => {
  const field = readSource('src/app/admin/writers/_components/WriterAvatarField.jsx').code;
  assert.match(field, /renderCroppedBlob\(/);
  assert.match(field, /onCrop\(blob\)/);
  assert.doesNotMatch(field, /fetch\(|FormData/);
});

test('only the crop is uploaded, into the writers folder', () => {
  const save = readSource('src/lib/writers/avatarSave.js').code;
  assert.match(save, /fd\.append\('file', blob,/);
  assert.doesNotMatch(save, /fd\.append\('file', file/);
  assert.match(save, /fd\.append\('folder', WRITER_AVATAR_FOLDER\)/);
});

test('บันทึก goes through the pending-avatar save, on both create and update', () => {
  const form = readSource('src/app/admin/writers/_components/WriterForm.jsx').code;
  assert.match(form, /saveWithPendingAvatar\(\{/);
  assert.match(form, /discard: discardWriterAvatarUpload/);
  assert.match(form, /updateWriter\(writer\._id, payload\(id\)\) : createWriter\(payload\(id\)\)/);
});

test('removing the photo only changes the form until บันทึก', () => {
  const form = readSource('src/app/admin/writers/_components/WriterForm.jsx').code;
  assert.match(form, /onRemove=\{\(\) => \{ setPendingAvatar\(null\); setAvatarPublicId\(''\); \}\}/);
});

test('the crop preview revokes its object URL on replace and on unmount', () => {
  const field = readSource('src/app/admin/writers/_components/WriterAvatarField.jsx').code;
  assert.match(field, /const url = URL\.createObjectURL\(pending\);[\s\S]*?return \(\) => URL\.revokeObjectURL\(url\);[\s\S]*?\}, \[pending\]\);/);
});

test('discardWriterAvatarUpload is guarded, and refuses a file any writer uses', () => {
  before('discardWriterAvatarUpload', "requireAdmin('writers')", 'dbConnect()');
  before('discardWriterAvatarUpload', 'isWriterAvatarPublicId(publicId)', 'removeOldAvatar(');
  before('discardWriterAvatarUpload', 'Writer.exists({ avatarPublicId: publicId })', 'removeOldAvatar(');
});

test('avatar removal names the resource type', () => {
  assert.match(src, /deleteFromCloudinary\(previous, \{ resourceType: 'image' \}\)/);
  assert.match(
    readSource('src/lib/cloudinary.js').code,
    /uploader\.destroy\(publicId, \{\s*resource_type: options\.resourceType \?\? 'image'/,
  );
});
