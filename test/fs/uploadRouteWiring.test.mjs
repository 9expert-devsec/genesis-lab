import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The upload route actually USES the per-folder rules, and resolves the folder
 * before it judges the file.
 *
 * ══ WHY THIS FILE EXISTS AT ALL ═════════════════════════════════════════════
 * Round A's lesson, applied one round later. Every assertion in
 * test/pure/uploadRules passes if the route keeps its own inline `if
 * (!isImage && !isPdf)` and never imports `checkUpload` — the table would be a
 * correct, well-tested function that nothing calls, and `avatars` would quietly
 * accept a 4 MB SVG. The pure tier structurally cannot see that.
 *
 * The route cannot be imported here: it pulls in `auth`, and with it NextAuth
 * and its Edge configuration. So this reads the source, through
 * sourceScan.readSource() so a COMMENT mentioning checkUpload cannot satisfy
 * the matcher and CRLF is already normalised.
 *
 * Shape-bound, therefore (test/sourceScan.mjs, defect 7): if you restructure
 * this handler, come back and check these still BIND rather than assuming a
 * green means they passed.
 */

const ROUTE_REL = 'src/app/api/admin/upload/route.js';
// `code` has the imports STRIPPED and `withImports` does not. Each assertion
// below names which it uses, because choosing wrong fails silently in both
// directions: a "does it import X" read from `code` sees no import statements
// at all and passes vacuously, and a "does it CALL X" read from `withImports`
// is satisfied by the import line alone. See readSource's own header.
const { code, withImports } = readSource(ROUTE_REL);

test('the route scan found a real handler, before anything is concluded', () => {
  // A readSource that returned '' would make every "does not contain"
  // assertion below pass vacuously — the exact false green this suite has hit.
  assert.match(code, /export async function POST/, `no POST handler found in ${ROUTE_REL}`);
  assert.ok(code.length > 500, `only ${code.length} chars of code — the read is wrong`);
});

test('avatars is in the folder allowlist', () => {
  // Without the entry the folder silently becomes `uploads`: the request
  // returns 200 and the file lands in the wrong tree. A success that is wrong.
  assert.match(code, /ALLOWED_FOLDERS = new Set\(\[[\s\S]*'avatars'[\s\S]*\]\)/,
    "'avatars' is not in ALLOWED_FOLDERS — uploads would fall through to `uploads`");
});

test('the route delegates to the rules table rather than judging inline', () => {
  // The import, read from `withImports` — `code` has import lines removed.
  assert.match(withImports, /import \{ checkUpload \} from '@\/lib\/uploads\/uploadRules'/,
    'the route does not import the rules table');
  // The CALL, read from `code` — so the import line above cannot satisfy it.
  // This is the assertion that makes the table more than dead code with a full
  // set of passing tests.
  assert.match(code, /checkUpload\(folder, file\)/,
    'the rules table is imported but never called');
});

test('the old inline validation is gone, not merely bypassed', () => {
  // Two copies of one rule is worse than either copy alone: the table would be
  // tested and the inline branch would be the one that ran.
  assert.doesNotMatch(code, /Only image or PDF files allowed/,
    'the old type check is still inline in the route');
  assert.doesNotMatch(code, /file\.size > MAX_BYTES/,
    'the old size check is still inline in the route');
  assert.doesNotMatch(code, /const MAX_BYTES/,
    'the route still owns a size constant the rules table also owns');
});

test('the folder is resolved BEFORE the file is judged', () => {
  // The ordering bug this refactor could introduce: validate first and the
  // DEFAULT rule is applied to an avatar, so a 4 MB PDF passes on its way to
  // being renamed `uploads`. Position in the source is the only way to see it
  // without running a request.
  const resolveAt = code.indexOf('ALLOWED_FOLDERS.has(folderRaw)');
  const checkAt = code.indexOf('checkUpload(folder, file)');
  assert.ok(resolveAt !== -1, 'folder resolution not found');
  assert.ok(checkAt !== -1, 'the rules call not found');
  assert.ok(
    resolveAt < checkAt,
    'the file is validated before the folder is resolved, so avatars would be '
    + 'judged by the default 5 MB image-or-PDF rule',
  );
});

test('the upload still happens into the RESOLVED folder', () => {
  // Guards the other half of the ordering: resolving correctly and then
  // uploading into the raw value would put the file in an unlisted folder.
  assert.match(code, /uploadToCloudinary\(file, folder\)/);
  assert.doesNotMatch(code, /uploadToCloudinary\(file, folderRaw\)/);
});
