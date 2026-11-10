import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * WIRING for training-round status `closed` (cancelled) — the halves only
 * observable in source: which call sites ask the shared predicate, where the
 * registration guard sits relative to the write/charge, and which reads may
 * carry the admin note. The behaviour itself is pinned in
 * test/pure/scheduleClosedStatus.
 */

function bodyOf(code, signature) {
  const at = code.indexOf(signature);
  assert.ok(at >= 0, `"${signature}" not found`);
  // Up to the next top-level export — enough to scope an assertion to one function.
  const next = code.indexOf('\nexport ', at + signature.length);
  return code.slice(at, next < 0 ? undefined : next);
}

test('career-path transfer: a closed round never counts as attended', () => {
  const code = readSource('src/lib/actions/career-paths.js').code;
  const fn = bodyOf(code, 'export async function getCareerPathPastSchedules');
  assert.match(fn, /status:\s*ADMIN_SCHEDULE_STATUSES/, 'precondition: this read is status=all');
  const skip = fn.search(/if\s*\(\s*isClosedRound\(s\)\s*\)\s*continue;/);
  const push = fn.indexOf('pastSchedulesByCourse[canonical].push(');
  assert.ok(skip >= 0, 'the past-round loop does not drop closed rounds');
  assert.ok(push > skip, 'the closed-round skip must come before the push');
});

test('MCP list_training_rounds drops closed through the shared predicate', () => {
  const code = readSource('src/lib/mcp/tools/listTrainingRounds.js').code;
  assert.match(code, /if\s*\(\s*isClosedRound\(row\)\s*\)\s*continue;/);
});

test('admin dashboard: closed rounds are not counted as open', () => {
  const code = readSource('src/app/admin/page.jsx').code;
  assert.match(code, /filter\(\(s\)\s*=>\s*!isClosedRound\(s\)\)\.length/);
});

test('both public submit paths run the round guard BEFORE writing or charging', () => {
  const quote = readSource('src/app/api/registration/public/route.js').code;
  const g1 = quote.indexOf('checkRegistrableRound(data)');
  assert.ok(g1 >= 0, 'submit route does not call the guard');
  assert.ok(g1 < quote.indexOf('RegisterPublic.create('), 'submit: guard must precede the create');
  assert.ok(g1 > quote.indexOf("resolveScheduleStatus(data.classId"), 'the local override check is kept, before it');

  const charge = readSource('src/app/api/registration/public/charge/route.js').code;
  const g2 = charge.indexOf('checkRegistrableRound(data)');
  assert.ok(g2 >= 0, 'charge route does not call the guard');
  for (const later of ['resolveCheckoutPricing(', 'createPaidRegistration(', 'createCardCharge(', 'createPromptPayCharge(']) {
    const at = charge.indexOf(later);
    if (at >= 0) assert.ok(g2 < at, `charge: guard must precede ${later}`);
  }
});

test('registration page: an unresolved ?class= shows the message, never another round', () => {
  const code = readSource('src/app/(public)/registration/public/RegisterPageContent.jsx').code;
  assert.ok(code.includes('ไม่พบรอบอบรมนี้ หรือรอบถูกยกเลิกแล้ว กรุณาเลือกรอบอื่น'));
  assert.match(code, /classNotFound \? \(\s*<RoundNotFoundNotice courseDetailHref=\{courseDetailHref\}/);
  assert.match(code, /filter\(\s*\(s\)\s*=>\s*!isClosedRound\(s\)\s*\)/, 'override-closed rounds must leave the carousel');
  assert.equal(/signup_url/.test(code), false, 'the page must never fall back to signup_url');
});

test('admin_note: projected out of the unauthenticated read; only the admin read returns it', () => {
  const code = readSource('src/lib/actions/schedules.js').code;
  const pub = bodyOf(code, 'export async function getScheduleLocals(');
  assert.match(pub, /ScheduleLocal\.find\(filter,\s*PUBLIC_LOCAL_PROJECTION\)/);
  assert.match(code, /const PUBLIC_LOCAL_PROJECTION = \{ admin_note: 0 \}/);
  const admin = bodyOf(code, 'export async function getScheduleLocalsForAdmin(');
  assert.match(admin, /await requireAdmin\('schedules'\)/, 'the note-carrying read must be admin-gated');
  assert.match(readSource('src/app/admin/schedules/page.jsx').code, /getScheduleLocalsForAdmin\(\)/);
  // Never into the MSDB payload.
  const payload = bodyOf(code, 'function shapeMsdbPayload');
  assert.equal(payload.slice(0, payload.indexOf('\n}')).includes('admin_note'), false);
});

test('admin_note reaches no public surface: only the admin/sidecar files name it', () => {
  const allowed = new Set([
    'src/models/ScheduleLocal.js',
    'src/lib/schedule/scheduleLocalFields.js',
    'src/lib/actions/schedules.js',
    'src/app/admin/schedules/_components/SchedulesAdminClient.jsx',
  ]);
  const offenders = [];
  for (const { rel, code } of walkSources('src')) {
    if (allowed.has(rel)) continue;
    if (/admin_note/.test(code)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `admin_note named outside the admin sidecar files: ${offenders.join(', ')}`);
});

test('admin save verifies the status MSDB echoed back, before busting caches', () => {
  const code = readSource('src/lib/actions/schedules.js').code;
  const upd = bodyOf(code, 'export async function updateSchedule(');
  const check = upd.indexOf('statusMismatchError(item, body.status)');
  assert.ok(check >= 0, 'update does not verify item.status');
  assert.ok(check < upd.indexOf('bustScheduleCaches('), 'verification must precede the cache bust');
  assert.ok(check < upd.indexOf('upsertLocal('), 'verification must precede the sidecar write');
  const crt = bodyOf(code, 'export async function createSchedule(');
  assert.ok(crt.indexOf('statusMismatchError(finalItem, body.status)') < crt.indexOf('bustScheduleCaches('));
});

test('round caches outside tags: admin save and the schedule webhook both refresh them', () => {
  assert.match(readSource('src/lib/actions/schedules.js').code, /refreshRoundCachesOutsideTags\(\)/);
  const hook = bodyOf(readSource('src/lib/webhooks/handlers.js').code, 'export async function handleScheduleEvent');
  assert.match(hook, /schedules:course:\$\{courseOid\}/, 'the webhook must bust the per-course tag');
  assert.match(hook, /await refreshRoundCaches\(\)/);
  const helper = readSource('src/lib/schedule/scheduleRoundCacheRefresh.js').code;
  assert.match(helper, /resetSearchCorpusCache\(\)/);
  assert.match(helper, /after\(runLandingSync\)/);
});

test('admin modal: a 4th Closed button and the close confirm reuse pendingWarning', () => {
  const code = readSource('src/app/admin/schedules/_components/SchedulesAdminClient.jsx').code;
  assert.match(code, /\{ value: 'closed',\s*label: 'Closed' \}/);
  assert.match(code, /setPendingWarning\(closeRoundWarning\(count\)\)/);
  assert.match(code, /pendingWarning\?\.kind === 'close'/);
  // The only window.confirm left is the pre-existing delete one.
  assert.equal((code.match(/window\.confirm\(/g) ?? []).length, 1);
});

test('listSchedulesByCourse forwards `from`, so the guard\'s early start reaches MSDB', () => {
  // The pure guard tests stub the reader; this is the half they cannot see —
  // that the real adapter puts `from` on the wire rather than dropping it.
  const code = readSource('src/lib/api/schedules.js').code;
  const fn = bodyOf(code, 'export async function listSchedulesByCourse');
  assert.match(fn, /params:\s*\{[\s\S]*?from:\s*options\.from,[\s\S]*?\}/);
  const guard = readSource('src/lib/registration/roundGuard.js').code;
  assert.match(guard, /from:\s*ROUND_LOOKUP_FROM,/);
  assert.match(guard, /limit:\s*ROUND_LOOKUP_LIMIT,/);
});

test('CONTROL: walkSources really enumerates src', () => {
  const files = [...walkSources('src')];
  assert.ok(files.length > 200, `only ${files.length} files enumerated`);
});
