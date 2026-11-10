import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NEUTRAL_STATUS,
  SCHEDULE_STATUS,
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_OPTIONS,
  isClosedRound,
  normalizeScheduleStatus,
  resolveScheduleBadge,
  scheduleStatusLabel,
} from '@/lib/scheduleStatus';
import { scheduleRegistrationHref } from '@/lib/schedule/scheduleRegistrationHref';
import { ROUND_GUARD_MESSAGES, checkRegistrableRound } from '@/lib/registration/roundGuard';
import { listTrainingRounds } from '@/lib/mcp/tools/listTrainingRounds';
import { buildCourseJsonLd } from '@/lib/courses/buildCourseJsonLd';
import { closeRoundWarning, isClosingChange } from '@/lib/schedule/closeRoundWarning';
import {
  activeRegistrationCount,
  summariseRegistrationsByStatus,
} from '@/lib/registrations/summariseByStatus';
import {
  ADMIN_NOTE_MAX,
  SIDECAR_KEYS,
  adminNoteError,
  sidecarSetFields,
} from '@/lib/schedule/scheduleLocalFields';

/**
 * TRAINING-ROUND STATUS `closed` (= CANCELLED, MSDB e7771bc).
 *
 * A closed round is invisible on every public surface and refuses
 * registration; admin sees it as grey ยกเลิก and can reopen it. These are the
 * pure halves: the predicate and status map, the registration guard with its
 * reads stubbed (no network), the two `status=all` public readers that must
 * drop it (MCP here; the career-path transfer is a source guard in
 * test/fs/scheduleClosedWiring), JSON-LD, the close confirm wording, and the
 * admin note's write rules.
 */

// ── (i) the predicate and (v) the status map ──────────────────────────────

test('isClosedRound: closed and its spellings are closed; nothing else is', () => {
  for (const raw of ['closed', 'cancelled', 'canceled']) {
    assert.equal(isClosedRound({ status: raw }), true, raw);
    assert.equal(isClosedRound(raw), true, `${raw} as a bare string`);
  }
  for (const raw of ['open', 'nearly_full', 'full', 'nearFull', '', 'archived', undefined, null]) {
    assert.equal(isClosedRound({ status: raw }), false, String(raw));
  }
  assert.equal(isClosedRound(null), false);
  assert.equal(isClosedRound(undefined), false);
});

test('closed is its OWN state now — no longer an alias of full', () => {
  assert.equal(normalizeScheduleStatus('closed'), 'closed');
  assert.equal(normalizeScheduleStatus('cancelled'), 'closed');
  assert.equal(normalizeScheduleStatus('canceled'), 'closed');
  // CONTROL: full is untouched.
  assert.equal(normalizeScheduleStatus('full'), 'full');
  assert.equal(scheduleStatusLabel('full'), 'เต็ม');
});

test('closed → ยกเลิก (state AND action), in the shared neutral GREY', () => {
  assert.equal(SCHEDULE_STATUS.closed.state, 'ยกเลิก');
  assert.equal(SCHEDULE_STATUS.closed.action, 'ยกเลิก');
  assert.equal(scheduleStatusLabel('closed'), 'ยกเลิก');
  for (const shape of ['dot', 'text', 'solid', 'soft']) {
    assert.equal(SCHEDULE_STATUS.closed[shape], NEUTRAL_STATUS[shape], `${shape} reuses the neutral grey`);
    for (const hex of ['#39b980', '#ffc94a', '#ff4b55', '#d4a017']) {
      assert.equal(SCHEDULE_STATUS.closed[shape].includes(hex), false, `${shape} carries no status colour`);
    }
  }
  const badge = resolveScheduleBadge('closed');
  assert.equal(badge.status, 'closed');
  assert.equal(badge.isKnown, true);
  assert.equal(badge.state, 'ยกเลิก');
});

test('closed is in the vocabulary but NOT in the public /schedule filter', () => {
  assert.ok(SCHEDULE_STATUSES.includes('closed'));
  assert.deepEqual(
    SCHEDULE_STATUS_OPTIONS.map((o) => o.value),
    ['open', 'nearly_full', 'full'],
  );
});

test('scheduleRegistrationHref: null for closed, and never the signup_url fallback', () => {
  const round = (status, extra = {}) => ({ _id: 'r1', status, signup_url: 'https://example.test/form', ...extra });
  for (const raw of ['closed', 'cancelled', 'canceled']) {
    assert.equal(scheduleRegistrationHref(round(raw), 'POWER-BI'), null, raw);
    // No id → would have fallen back to signup_url. Must still be null.
    assert.equal(scheduleRegistrationHref(round(raw, { _id: undefined }), 'POWER-BI'), null, `${raw} no id`);
  }
  // CONTROLS: full unchanged, open still links.
  assert.equal(scheduleRegistrationHref(round('full'), 'POWER-BI'), null);
  assert.equal(scheduleRegistrationHref(round('open'), 'POWER-BI'), '/registration/public?course=power-bi&class=r1');
});

// ── (iii) the registration guard, reads stubbed ───────────────────────────

function guardDeps({ rounds = [], course = { _id: 'oid1' }, throwOn = null } = {}) {
  const calls = { listRounds: [], logged: [] };
  return {
    calls,
    deps: {
      getCourse: async (code) => {
        if (throwOn === 'course') throw new Error('upstream down');
        calls.course = code;
        return course;
      },
      listRounds: async (oid, opts) => {
        if (throwOn === 'rounds') throw new Error('upstream down');
        calls.listRounds.push({ oid, opts });
        return { items: rounds };
      },
      logError: (...args) => calls.logged.push(args),
    },
  };
}

const BODY = { courseId: 'POWER-BI', courseCode: 'POWER-BI', classId: 'r1' };

test('guard: an OPEN round passes, and the read is fresh with status=all', async () => {
  const { deps, calls } = guardDeps({ rounds: [{ _id: 'r1', status: 'open' }] });
  const res = await checkRegistrableRound(BODY, deps);
  assert.equal(res.ok, true);
  assert.equal(calls.course, 'POWER-BI');
  assert.equal(calls.listRounds.length, 1);
  assert.equal(calls.listRounds[0].oid, 'oid1');
  assert.equal(calls.listRounds[0].opts.status, 'all', 'a closed round must be SEEN, not merely absent');
  assert.equal(calls.listRounds[0].opts.revalidate, 0, 'never trust a cached copy');
});

test('guard: full and nearly_full are NOT refused here (no new rule for full)', async () => {
  for (const status of ['full', 'nearly_full']) {
    const { deps } = guardDeps({ rounds: [{ _id: 'r1', status }] });
    assert.equal((await checkRegistrableRound(BODY, deps)).ok, true, status);
  }
});

test('guard: a CLOSED round is refused with the cancelled sentence', async () => {
  for (const status of ['closed', 'cancelled']) {
    const { deps } = guardDeps({ rounds: [{ _id: 'r1', status }] });
    const res = await checkRegistrableRound(BODY, deps);
    assert.equal(res.ok, false);
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'round_cancelled');
    assert.equal(res.body.message, 'รอบอบรมนี้ถูกยกเลิกแล้ว กรุณาเลือกรอบอื่น');
  }
});

test('guard: a round the course does not have is refused — no fallback to another round', async () => {
  const { deps } = guardDeps({ rounds: [{ _id: 'other', status: 'open' }] });
  const res = await checkRegistrableRound(BODY, deps);
  assert.equal(res.ok, false);
  assert.equal(res.status, 404);
  assert.equal(res.body.message, 'ไม่พบรอบอบรมนี้ กรุณาเลือกรอบอื่น');
  assert.equal(res.body.message, ROUND_GUARD_MESSAGES.notFound);

  const noCourse = guardDeps({ course: null });
  assert.equal((await checkRegistrableRound(BODY, noCourse.deps)).status, 404);
  assert.equal((await checkRegistrableRound({ ...BODY, classId: '' }, guardDeps().deps)).status, 404);
});

test('guard: a failed MSDB read FAILS CLOSED, and is logged', async () => {
  for (const where of ['course', 'rounds']) {
    const { deps, calls } = guardDeps({ throwOn: where, rounds: [{ _id: 'r1', status: 'open' }] });
    const res = await checkRegistrableRound(BODY, deps);
    assert.equal(res.ok, false, where);
    assert.equal(res.status, 503);
    assert.equal(res.body.message, 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง');
    assert.equal(calls.logged.length, 1, `${where}: logged once`);
  }
});

// ── the guard must find ANY round of the course (no false "not found") ────

/**
 * A stub that behaves like MSDB's per-course read: without `from` it keeps only
 * rounds with a day >= today, and it truncates to `limit`. Against the guard's
 * old opts (no `from`, limit 100) the two tests below would answer 404.
 */
function msdbLikeDeps(rounds, today = '2026-11-09') {
  const seen = [];
  return {
    seen,
    deps: {
      getCourse: async () => ({ _id: 'oid1' }),
      listRounds: async (oid, opts) => {
        seen.push(opts);
        const from = opts?.from ?? today;
        const inWindow = rounds.filter((r) => r.dates.some((d) => d >= from));
        return { items: inWindow.slice(0, opts?.limit ?? 20) };
      },
      logError: () => {},
    },
  };
}

test('guard: a round whose days are ALL PAST is still found, and passes', async () => {
  const { deps, seen } = msdbLikeDeps([{ _id: 'r1', status: 'open', dates: ['2026-08-13', '2026-08-14'] }]);
  const res = await checkRegistrableRound(BODY, deps);
  assert.equal(res.ok, true, 'a past round must not be refused as not found — no date rule exists');
  assert.ok(seen[0].from && seen[0].from <= '2000-01-01', `the read must start early, sent from=${seen[0].from}`);
});

test('guard: a round far beyond the old limit is still found', async () => {
  const rounds = Array.from({ length: 150 }, (_, i) => ({
    _id: `x${i}`, status: 'open', dates: ['2027-01-01'],
  }));
  rounds[140] = { _id: 'r1', status: 'open', dates: ['2027-01-01'] };
  const { deps, seen } = msdbLikeDeps(rounds);
  const res = await checkRegistrableRound(BODY, deps);
  assert.equal(res.ok, true, 'round #141 of 150 must be found');
  assert.ok(seen[0].limit >= 1000, `limit ${seen[0].limit} is too small to be safe`);
});

test('guard: a PAST closed round is still refused as cancelled (409), not 404', async () => {
  const { deps } = msdbLikeDeps([{ _id: 'r1', status: 'closed', dates: ['2026-08-13'] }]);
  const res = await checkRegistrableRound(BODY, deps);
  assert.equal(res.status, 409);
  assert.equal(res.body.message, 'รอบอบรมนี้ถูกยกเลิกแล้ว กรุณาเลือกรอบอื่น');
  // CONTROL: truly absent is still 404 under the widened read.
  const absent = msdbLikeDeps([{ _id: 'other', status: 'open', dates: ['2026-08-13'] }]);
  assert.equal((await checkRegistrableRound(BODY, absent.deps)).status, 404);
});

// ── (iv) MCP and JSON-LD drop closed ──────────────────────────────────────

const TODAY = '2026-11-09';
function mcpRound(id, status) {
  return {
    _id: id,
    course: { _id: 'oid-PB', course_id: 'POWER-BI', course_name: 'Power BI' },
    dates: ['2026-12-08T00:00:00.000Z', '2026-12-09T00:00:00.000Z'],
    status,
    type: 'classroom',
  };
}
const mcpDeps = (items) => ({
  listSchedules: async () => ({ items }),
  getCourseByCodeInsensitive: async () => null,
  loadHiddenCourseIds: async () => new Set(),
  todayKey: () => TODAY,
  warn: () => {},
});

test('MCP list_training_rounds never emits a closed round', async () => {
  const items = [mcpRound('open1', 'open'), mcpRound('gone', 'closed'), mcpRound('gone2', 'cancelled'), mcpRound('full1', 'full')];
  const out = await listTrainingRounds({}, mcpDeps(items));
  const json = JSON.stringify(out);
  assert.equal(json.includes('gone'), false, 'no trace of a closed round');
  assert.equal(json.includes('ยกเลิก'), false);
  assert.deepEqual(out.rounds.map((r) => r.status), ['เปิดรับ', 'เต็ม']);
  assert.equal(out.total_matched, 2);
  // CONTROL: full behaves exactly as before.
  const full = out.rounds.find((r) => r.status === 'เต็ม');
  assert.equal(full.registration_open, false);
  assert.equal(full.registration_url, undefined);
  assert.equal(out.rounds.find((r) => r.status === 'เปิดรับ').registration_open, true);
});

test('JSON-LD hasCourseInstance: closed/cancelled dropped, others kept — behaviour unchanged', () => {
  const course = { course_id: 'POWER-BI', course_name: 'Power BI', course_price: 5000 };
  const mk = (id, status) => ({ _id: id, status, dates: ['2026-12-08', '2026-12-09'], type: 'classroom' });
  const ld = buildCourseJsonLd({
    course,
    schedules: [mk('a', 'open'), mk('b', 'closed'), mk('c', 'cancelled'), mk('d', 'full'), mk('e', 'nearly_full')],
    siteUrl: 'https://www.9experttraining.com',
  });
  const instances = Array.isArray(ld?.hasCourseInstance) ? ld.hasCourseInstance : [];
  assert.equal(instances.length, 3, 'open + full + nearly_full survive, exactly as before');
});

// ── the admin close confirm ───────────────────────────────────────────────

test('close confirm: with registrants it names the count and says nobody is told', () => {
  const w = closeRoundWarning(7);
  assert.equal(w.kind, 'close');
  assert.equal(w.title, 'รอบนี้มีผู้ลงทะเบียน 7 คน — ระบบจะไม่แจ้งลูกค้าให้อัตโนมัติ ยืนยันยกเลิกรอบนี้?');
  assert.equal(w.severe, true);
});

test('close confirm: with nobody it still confirms, with no count', () => {
  const w = closeRoundWarning(0);
  assert.equal(w.title, 'ยืนยันยกเลิกรอบนี้? รอบจะไม่แสดงบนเว็บและลงทะเบียนไม่ได้');
  assert.equal(/\d/.test(w.title), false);
  assert.deepEqual(w.dates, []);
});

test('close confirm fires only on a change TO closed', () => {
  assert.equal(isClosingChange({ isEdit: true, previousStatus: 'open', nextStatus: 'closed' }), true);
  assert.equal(isClosingChange({ isEdit: false, previousStatus: undefined, nextStatus: 'closed' }), true);
  assert.equal(isClosingChange({ isEdit: true, previousStatus: 'closed', nextStatus: 'closed' }), false);
  // Reopening needs no confirm — closed is reversible.
  assert.equal(isClosingChange({ isEdit: true, previousStatus: 'closed', nextStatus: 'open' }), false);
  assert.equal(isClosingChange({ isEdit: true, previousStatus: 'open', nextStatus: 'full' }), false);
});

test('active registrations exclude cancelled only', () => {
  const rows = [
    { status: 'pending' }, { status: 'confirmed' }, { status: 'paid' },
    { status: 'cancelled' }, { status: 'cancelled' }, { status: 'weird' },
  ];
  assert.equal(activeRegistrationCount(summariseRegistrationsByStatus(rows)), 4);
  assert.equal(activeRegistrationCount(summariseRegistrationsByStatus([])), 0);
  assert.equal(activeRegistrationCount(null), 0);
});

// ── (vi) the admin note's write rules, and the hidden inputs ──────────────

test('admin_note: a sidecar key, presence-based, trimmed and capped', () => {
  assert.ok(SIDECAR_KEYS.includes('admin_note'));
  const fd = new FormData();
  fd.set('admin_note', '  ยกเลิกเพราะผู้สอนป่วย  ');
  assert.deepEqual(sidecarSetFields(fd), { admin_note: 'ยกเลิกเพราะผู้สอนป่วย' });

  const cleared = new FormData();
  cleared.set('admin_note', '');
  assert.deepEqual(sidecarSetFields(cleared), { admin_note: '' }, 'a cleared textarea clears the note');

  assert.deepEqual(sidecarSetFields(new FormData()), {}, 'absent key → stored note left alone');
});

test('admin_note over 2000 chars is refused server-side', () => {
  assert.equal(ADMIN_NOTE_MAX, 2000);
  const ok = new FormData();
  ok.set('admin_note', 'ก'.repeat(2000));
  assert.equal(adminNoteError(ok), null);
  const over = new FormData();
  over.set('admin_note', 'ก'.repeat(2001));
  assert.match(adminNoteError(over), /2000/);
  assert.equal(adminNoteError(new FormData()), null);
});

test('max_seats DECISION: the modal sends neither seat nor price key, so stored values survive', () => {
  // What the modal now builds: admin_note only (see test/fs/scheduleModalSidecarKeys).
  const fd = new FormData();
  fd.set('admin_note', 'x');
  const out = sidecarSetFields(fd);
  assert.equal('max_seats' in out, false, 'the 8 stored seat counts are not touched');
  assert.equal('price_override' in out, false, 'price_override is not touched');
  assert.equal('instructor_ids' in out, false);
});
