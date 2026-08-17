import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RenameExecutePanel, RenameOutcomeReport, RenameStateReport } from '@/app/admin/courses/rename/_components/RenameExecutePanel';
import { buildRenamePreview, RENAME_STORES } from '@/lib/courses/renameCoursePreview';

/**
 * The execute panel's FIRST render — the state an admin actually arrives in.
 *
 * ── WHAT THIS TIER CAN AND CANNOT CARRY ────────────────────────────────────
 * `renderToStaticMarkup` gives one render with initial state and no events, so
 * what is checkable here is: the button starts DISABLED, both confirmations are
 * present and distinct, the alias step is a step rather than a footnote, and
 * the MSDB obligation is on screen before anything is clicked.
 *
 * NOT checkable here: that typing the code enables the button, that the write
 * fires, that the post-run state renders. Those need a DOM and an event loop,
 * which this suite forbids. The RULES behind them are pure and are driven for
 * real in test/pure/renameExecuteGate; the wiring between the rules and the
 * markup is asserted from source in test/fs/renameExecuteWiring. Said plainly
 * rather than implied, because a render test that claimed the click path would
 * be claiming something it never exercised.
 */

const preview = (over = {}) => {
  const matches = Object.fromEntries(RENAME_STORES.map((s) => [s.key, []]));
  return buildRenamePreview({
    oldCode: 'ZZTEST-EXCEL-01',
    newCode: 'EXCEL-HR-01',
    msdbCodes: ['ZZTEST-EXCEL-01', 'MSE-L2'],
    extensionCodes: ['ZZTEST-EXCEL-01'],
    urlAlias: '',
    ...over,
    matches: { ...matches, courseExtension: [{ courseId: 'ZZTEST-EXCEL-01' }], ...(over.matches ?? {}) },
  });
};

const render = (p) => renderToStaticMarkup(createElement(RenameExecutePanel, { preview: p }));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// ── When it is not offered at all ───────────────────────────────────────────

test('no preview → no execute panel', () => {
  assert.equal(render(null), '');
});

/**
 * ══ THIS ASSERTION WAS DELIBERATELY NARROWED ═══════════════════════════════
 *
 * It used to read `assert.equal(render(blocked), '')` — no execute panel AND no
 * output whatsoever. The first half is the property that was wanted; the second
 * came free and turned out to be the defect. Returning nothing on a refused
 * preview took the two-sided state report down with it, and the upstream-only
 * state is REFUSED (the code upstream now holds is the code being renamed to),
 * so the one screen built to report that state was the one place it could not
 * appear.
 *
 * WHAT IS GUARANTEED NOW: a refused preview offers no execute affordance — no
 * button, no typed confirmation, no acknowledgement. Not a disabled button: the
 * controls are absent.
 *
 * WHAT IS NO LONGER GUARANTEED, said plainly: that the panel renders nothing.
 * It renders the state report, which cannot write.
 */
test('A BLOCKED preview offers no execute AFFORDANCE', () => {
  const html = render(preview({ newCode: 'MSE-L2' }));
  assert.ok(!/<button/.test(html), 'a refused rename rendered a button');
  assert.ok(!/id="confirm-code"/.test(html), 'a refused rename rendered the typed confirmation');
  assert.ok(!/type="checkbox"/.test(html), 'a refused rename rendered the acknowledgement');
  assert.ok(!/data-testid="rename-execute"/.test(html), 'the execute panel rendered on a refused preview');
});

test('a refused preview still renders somewhere for the two-sided state to land', () => {
  /**
   * The state itself arrives from an effect, which `renderToStaticMarkup` never
   * runs — so what this tier can show is that the branch EXISTS and is not the
   * old `return null`. That the report is mounted into it is a source fact
   * (test/fs/renameExecuteWiring); that it renders each state distinctly is
   * driven from fixtures in test/render/renameStateReport.
   */
  const html = render(preview({ newCode: 'MSE-L2' }));
  assert.notEqual(html, '', 'a refused preview reports nothing at all — the state has nowhere to go');
  assert.match(html, /data-testid="rename-execute-blocked"/);
});

// ── The confirmation ────────────────────────────────────────────────────────

test('THE BUTTON STARTS DISABLED', () => {
  const html = render(preview());
  const btn = /<button[^>]*>(?:(?!<\/button>)[\s\S])*เปลี่ยนรหัส[\s\S]*?<\/button>/.exec(html)?.[0];
  assert.ok(btn, 'the rename button did not render');
  assert.match(btn, /disabled/, 'the rename button is enabled on first render');
});

test('THE CONFIRMATION IS TYPED — a text input expecting the new code', () => {
  const html = render(preview());
  const input = /<input[^>]*id="confirm-code"[^>]*>/.exec(html)?.[0];
  assert.ok(input, 'there is no typed confirmation');
  assert.match(input, /type="text"/);
  assert.match(input, /placeholder="EXCEL-HR-01"/, 'the field does not show which code to type');
  assert.match(text(html), /พิมพ์รหัสใหม่อีกครั้ง/);
  // and it tells the admin WHY — the mis-selected course is what this catches
  assert.match(text(html), /เลือกหลักสูตรถูกตัว/);
});

/**
 * ══ WHAT THE ACKNOWLEDGEMENT IS FOR CHANGED ════════════════════════════════
 *
 * It used to be consent to an OBLIGATION — "I will go and change course_id in
 * MSDB myself, and I know a hidden course may resurface meanwhile". There is no
 * second step and no interval, so both of those sentences are now false and
 * asserting them would pin a lie.
 *
 * It is consent to REACH instead: this button edits the live upstream
 * catalogue, immediately, and this tool cannot undo it. That is a bigger thing
 * to agree to than the obligation was — so the control stays, separate, for a
 * better reason than before.
 */
test('THE UPSTREAM-REACH ACKNOWLEDGEMENT IS A SEPARATE CONTROL', () => {
  const html = render(preview());
  assert.match(html, /<input[^>]*type="checkbox"/, 'there is no separate acknowledgement');
  // Two controls, not one: a typed field AND a checkbox.
  assert.equal((html.match(/<input/g) ?? []).length, 2, 'expected exactly two confirmation controls');
  /**
   * SCOPED TO THE LABEL, not the page. An earlier draft asserted the whole
   * rendered text contained no "ด้วยตนเอง" and went red on the REACH card's
   * "ไม่ต้องไปแก้ MSDB ด้วยตนเองอีกแล้ว" — which is the sentence saying the
   * manual step is gone, i.e. exactly what this round wanted. The claim is
   * about what the admin is CONSENTING to, so it is asked of the consent.
   */
  const label = /<label[^>]*>[\s\S]*?type="checkbox"[\s\S]*?<\/label>/.exec(html)?.[0];
  assert.ok(label, 'the acknowledgement is not inside a label');
  const labelText = text(label);
  assert.match(labelText, /จะเปลี่ยน course_id ที่ MSDB/, 'the consent does not name what it reaches');
  assert.match(labelText, /ย้อนกลับให้ไม่ได้/, 'the consent does not say it cannot be undone');
  assert.ok(
    !/ด้วยตนเอง/.test(labelText),
    'the acknowledgement still asks the admin to do the MSDB step themselves'
  );
});

test('the acknowledgement names the consequence that cannot be undone', () => {
  // The specific thing an admin would not guess: this reaches live public data
  // and this screen has no way back.
  assert.match(text(render(preview())), /ย้อนกลับให้ไม่ได้/);
});

// ── The alias as step one ───────────────────────────────────────────────────

test('A DERIVED url renders the alias as STEP ONE, before the write', () => {
  const html = render(preview({ urlAlias: '' }));
  const step = /<li[^>]*data-testid="alias-step"[\s\S]*?<\/li>/.exec(html)?.[0];
  assert.ok(step, 'the alias is not rendered as a step');
  assert.match(step, /ขั้นที่ 1/, 'the alias is not step one');
  assert.match(step, /zztest-excel-01-training-course/);
  assert.match(step, /404/, 'the consequence of skipping it is not stated');
  // and the MSDB write is step two
  assert.match(text(html), /ขั้นที่ 2 — เปลี่ยน course_id ที่ MSDB/);
});

test('an ALIASED url has no alias step, and the MSDB write becomes step one', () => {
  const html = render(preview({ urlAlias: '/excel-hr' }));
  assert.ok(!/data-testid="alias-step"/.test(html), 'an aliased course was told an alias will be created');
  assert.match(text(html), /ขั้นที่ 1 — เปลี่ยน course_id ที่ MSDB/);
});

/**
 * ══ THE STEP ORDER INVERTED, AND THE LIST HAS TO SHOW IT ═══════════════════
 *
 * The MSDB step used to be LAST and attributed to the admin — "คุณแก้ ... เอง".
 * It is now the action's own step and it goes FIRST, because a refusal before
 * any genesis mutation is the clean failure this order exists to buy. An admin
 * who reads this list and then reads a failure needs it to say which half can
 * possibly have moved.
 */
test('MSDB is the FIRST write step, performed by the system, and genesis follows it', () => {
  const t = text(render(preview()));
  const msdbAt = t.indexOf('เปลี่ยน course_id ที่ MSDB');
  const genesisAt = t.indexOf('จึงเขียนฝั่งระบบนี้');
  assert.ok(msdbAt !== -1, 'the MSDB step is gone from the list');
  assert.ok(genesisAt !== -1, 'the genesis step is gone from the list');
  assert.ok(msdbAt < genesisAt, 'the list still shows genesis before MSDB');
  assert.match(t, /แล้วอ่านกลับมายืนยัน/, 'the list does not say the write is confirmed by read-back');
  assert.ok(!/คุณแก้ course_id ที่ MSDB เอง/.test(t), 'the MSDB step is still attributed to the admin');
});

// ── The reach is disclosed before anything is clicked ──────────────────────

test('THE REACH renders BEFORE any write, with both codes', () => {
  const html = render(preview());
  assert.match(html, /data-testid="upstream-reach"/, 'the reach is only disclosed after the write');
  assert.ok(!/data-testid="msdb-obligation"/.test(html), 'the retired obligation card is still rendered');
  const t = text(html);
  assert.match(t, /ZZTEST-EXCEL-01/);
  assert.match(t, /EXCEL-HR-01/);
  assert.match(t, /ไม่ต้องไปแก้ MSDB ด้วยตนเองอีกแล้ว/, 'nothing says the manual step is gone');
});

// ── Nothing has run yet ─────────────────────────────────────────────────────

test('no post-run state is rendered before anything has run', () => {
  const html = render(preview());
  assert.ok(!/data-testid="rename-state"/.test(html), 'a post-run state appeared before the run');
  assert.ok(!/data-testid="rename-stale"/.test(html));
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the panel renders something substantial for a runnable preview', () => {
  // Every negative above passes over an empty render.
  const html = render(preview());
  assert.ok(html.length > 800, `the panel rendered ${html.length} chars`);
  assert.match(html, /data-testid="rename-execute"/);
});

test('CONTROL: a runnable and a blocked preview differ completely', () => {
  const runnable = render(preview());
  const refused = render(preview({ newCode: 'MSE-L2' }));
  assert.notEqual(runnable, refused);
  // The runnable one carries every affordance the refused one is checked for
  // above — so those four negatives are measurements, not vacuous truths.
  for (const probe of [/<button/, /id="confirm-code"/, /type="checkbox"/, /data-testid="rename-execute"/]) {
    assert.match(runnable, probe, `${probe} never appears even on a runnable preview`);
  }
});

// ══ THE FOUR OUTCOMES, KEPT APART ═════════════════════════════════════════

/**
 * Three of these cannot be produced for real: MSDB cannot be made to time out,
 * to answer 2xx without applying, or to refuse on demand. They are exactly the
 * states an admin most needs told apart, so they are driven from fixtures.
 *
 * The distinction that matters in every case is WHAT WAS WRITTEN.
 */
const outcome = (result) =>
  renderToStaticMarkup(createElement(RenameOutcomeReport, { result }));
const outcomeAttr = (html) => /data-outcome="([^"]*)"/.exec(html)?.[1] ?? null;

test('no result → the outcome report renders nothing', () => {
  assert.equal(outcome(null), '');
});

test('COMPLETE says both sides moved and that nothing is owed', () => {
  const html = outcome({
    ok: true, outcome: 'applied', wroteUpstream: true, wroteGenesis: true,
    from: 'ZZTEST-EXCEL-01', to: 'EXCEL-HR-01',
    counts: { courseExtension: 1, scheduleLocal: 3 },
    followUps: ['แคชสาธารณะถูกล้างแล้ว'],
  });
  assert.equal(outcomeAttr(html), 'applied');
  const t = text(html);
  assert.match(t, /เรียบร้อยทั้งสองฝั่ง/);
  assert.match(t, /อ่านกลับมายืนยันแล้ว/, 'success does not say it was confirmed by read-back');
  assert.match(t, /ไม่ต้องไปแก้ MSDB เองแล้ว/, 'success does not say the manual step is gone');
  assert.match(t, /4 แถว/, 'the genesis row count is not reported');
});

test('A CLEAN REFUSAL says nothing was written ANYWHERE, and a retry is safe', () => {
  const html = outcome({
    ok: false, outcome: 'refused', wroteUpstream: false, wroteGenesis: false,
    error: 'เปลี่ยนรหัสที่ MSDB ไม่สำเร็จ — 400 Bad Request',
  });
  assert.equal(outcomeAttr(html), 'refused');
  const t = text(html);
  assert.match(t, /ยังไม่มีอะไรถูกเขียนเลย/, 'a refusal does not say the systems are untouched');
  assert.match(t, /ลองใหม่ได้อย่างปลอดภัย/, 'a refusal does not say a retry is safe');
});

test('UNKNOWN says do not press again, and OFFERS NO RETRY', () => {
  /**
   * The one outcome where a retry is actively dangerous: the write may have
   * landed, so a second attempt could rename a course that is already renamed.
   * The absence of a control is the assertion.
   */
  const html = outcome({
    ok: false, outcome: 'unknown', wroteUpstream: null, wroteGenesis: false,
    error: 'ยังไม่ทราบผล — คำสั่งถูกส่งไปแล้วแต่ไม่ได้รับคำตอบยืนยัน',
  });
  assert.equal(outcomeAttr(html), 'unknown');
  const t = text(html);
  assert.match(t, /ห้ามกดซ้ำ/, 'an unknown outcome does not forbid a retry');
  assert.match(t, /ยังไม่ได้เขียนอะไรเลย/, 'it does not say genesis is untouched');
  assert.match(t, /ตรวจสอบผลกระทบ/, 'it does not say what to do instead');
  assert.ok(!/<button/.test(html), 'an unknown outcome offers a retry control');
});

test('A DIVERGENCE names the store and the two numbers', () => {
  const html = outcome({
    ok: false, outcome: 'applied', error: 'จำนวนแถวที่เขียนไม่ตรงกับผลตรวจสอบ',
    divergences: [{ store: 'scheduleLocal', expected: 3, actual: 2 }],
  });
  const t = text(html);
  assert.match(t, /scheduleLocal/);
  assert.match(t, /คาดไว้ 3 เขียนจริง 2/);
});

test('CONTROL: the four outcomes render distinguishably', () => {
  const seen = new Set([
    outcomeAttr(outcome({ ok: true, counts: {} })),
    outcomeAttr(outcome({ ok: false, outcome: 'refused', error: 'x' })),
    outcomeAttr(outcome({ ok: false, outcome: 'unknown', error: 'x' })),
    outcomeAttr(outcome({ ok: false, outcome: 'not-applied', error: 'x' })),
  ]);
  assert.equal(seen.size, 4, `outcomes collapsed together: ${[...seen].join(', ')}`);
  assert.equal(outcomeAttr('<div></div>'), null);
});

test('CONTROL: only the UNKNOWN branch withholds a retry control', () => {
  // The negative above is only meaningful if some other branch could have one.
  const partial = renderToStaticMarkup(createElement(RenameStateReport, {
    state: {
      partial: true, stillOnOldCode: ['article'], alreadyOnNewCode: ['courseExtension'],
      state: 'genesis-partial', reversible: false,
    },
    from: 'A', to: 'B', onRerun: () => {},
  }));
  assert.match(partial, /<button/, 'no branch anywhere renders a re-run control');
});
