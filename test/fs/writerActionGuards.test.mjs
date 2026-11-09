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
  // parseWriterInput = writerSchema.safeParse, then the oEmbed title fill.
  before('createWriter', 'await parseWriterInput(', 'Writer.create(');
  before('updateWriter', 'await parseWriterInput(', 'Writer.findByIdAndUpdate(');
  const helper = src.slice(src.indexOf('async function parseWriterInput('), src.indexOf('async function removeOldAvatar('));
  assert.ok(helper.indexOf('writerSchema.safeParse(') >= 0, 'the helper parses through the schema');
  assert.ok(helper.indexOf('writerSchema.safeParse(') < helper.indexOf('fillYouTubeTitles('), 'and parses before any YouTube call');
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

// ── the transfer ────────────────────────────────────────────────────────────

const transfer = src.slice(
  src.indexOf('async function transferArticlesAndDeactivate('),
  src.indexOf('export async function listWriters('),
);

test('getWriterDeactivationPreview is guarded and runs the policy check', () => {
  before('getWriterDeactivationPreview', "requireAdmin('writers')", 'dbConnect()');
  before('getWriterDeactivationPreview', 'checkSetWriterActive(', 'readArticlesForTransfer(');
});

test('deactivating transfers, and activating does not', () => {
  const action = body('setWriterActive');
  assert.match(action, /if \(next\) \{\s*await Writer\.findByIdAndUpdate\(id, \{ \$set: \{ isActive: true \} \}\);\s*\} else \{\s*const transfer = await transferArticlesAndDeactivate\(current\);/);
});

test('a failed transfer stops before the caches and the audit row', () => {
  before('setWriterActive', 'if (!transfer.ok) return transfer;', 'bustWriterCaches(');
  before('setWriterActive', 'if (!transfer.ok) return transfer;', 'recordAdminActionAfter(');
});

test('the transfer runs in one transaction, and the recount is inside it', () => {
  const callback = transfer.indexOf('session.withTransaction(');
  assert.notEqual(callback, -1);
  assert.ok(callback < transfer.indexOf('readArticlesForTransfer(current._id, session)'));
  assert.ok(callback < transfer.indexOf('Article.bulkWrite('));
  assert.ok(callback < transfer.indexOf('Writer.updateOne('));
});

test('articles are written before the writer is switched off', () => {
  assert.ok(transfer.indexOf('Article.bulkWrite(') < transfer.indexOf('Writer.updateOne('));
});

test('every write joins the session', () => {
  assert.match(transfer, /Article\.bulkWrite\(transferBulkOps\(plan, current\._id\), \{\s*session,/);
  assert.match(transfer, /Writer\.updateOne\(\{ _id: current\._id \}, \{ \$set: \{ isActive: false \} \}, \{ session \}\)/);
});

test('the bulk write keeps timestamps off, and nothing names contentUpdatedAt', () => {
  assert.match(transfer, /timestamps: false,/);
  assert.equal(transfer.includes('contentUpdatedAt'), false);
});

test('an article that changed mid-transfer aborts it', () => {
  assert.match(transfer, /result\.modifiedCount !== plan\.writes\.length[\s\S]*?throw new Error\(WRITER_REFUSALS\.transferConflict\)/);
});

test('the session is always ended', () => {
  assert.match(transfer, /finally \{\s*await session\.endSession\(\);/);
});

test('the audit row counts the articles and does not list them', () => {
  const action = body('setWriterActive');
  assert.match(action, /meta: \{ alsoTouched: plan\.writes\.length, sole: plan\.sole, coWritten: plan\.coWritten \}/);
  assert.equal(action.includes('plan.writes.map'), false);
});

test('a transfer revalidates the touched pages and both profiles', () => {
  const action = body('setWriterActive');
  assert.match(action, /bustWriterCaches\(current\.slug\);/);
  assert.match(action, /revalidatePath\(DEFAULT_WRITER_PATH\);/);
  assert.match(action, /revalidatePath\(ADMIN_ARTICLES_PATH\);/);
  assert.match(action, /revalidatePath\(PUBLIC_ARTICLES_PATH\);/);
  assert.match(action, /paths\.forEach\(\(path\) => revalidatePath\(path\)\);/);
  assert.match(action, /revalidatePath\(`\$\{PUBLIC_ARTICLES_PATH\}\/\[slug\]`, 'page'\);/);
});

test('every writer change refreshes the public list', () => {
  assert.match(src, /function bustWriterCaches\(slug\) \{[\s\S]*?revalidatePath\(WRITER_LIST_PATH\);[\s\S]*?revalidatePath\(writerPath\(slug\)\);/);
  for (const action of ['createWriter', 'updateWriter', 'setWriterActive', 'deleteWriter']) {
    assert.match(body(action), /bustWriterCaches\(/, action);
  }
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
