'use client';

import { useEffect, useState } from 'react';
import { renameCourseCode, inspectRenameState } from '@/lib/actions/course-rename';
import { canExecuteRename, aliasStepFor, GATE } from '@/lib/courses/renameExecuteGate';
import { RENAME_STATE } from '@/lib/courses/renameCoursePlan';

/**
 * The write. THE ONLY component in this screen that can perform one.
 *
 * ── WHAT IT ACTS ON ────────────────────────────────────────────────────────
 * The preview ALREADY ON SCREEN, and its token is derived from that object —
 * not from a fresh read. The admin consents to a blast radius they can see. The
 * action recomputes the preview server-side and refuses on a mismatch, and that
 * refusal is rendered as a panel with a re-check, never as a thrown error.
 *
 * ── WHAT IS RENDERED AFTERWARDS, AND WHY UNCONDITIONALLY ───────────────────
 * `inspectRenameState` runs after every attempt, success or failure, and its
 * result is always shown. A HALF-FINISHED rename is exactly what follows a
 * request that appeared to fail, so surfacing it only in the error branch would
 * surface it in the one case the admin already distrusts — and hide it in the
 * case where they have been told everything worked.
 *
 * ── AND BEFOREHAND, ON EVERY PREVIEW INCLUDING A REFUSED ONE ───────────────
 * The panel used to `return null` the moment `preview.ok === false`, which took
 * the two-sided state report down with it. That is backwards: a REFUSED preview
 * is where the divergent states live. The upstream-only state — MSDB renamed,
 * genesis left behind — is refused by the collision guard, because the code
 * upstream now holds is the code the admin is renaming TO. So the one screen
 * built to report that state hid it, and the report the admin got instead was
 * "nothing to change" over eleven waiting rows.
 *
 * The state is therefore fetched whenever the displayed preview changes, and
 * rendered whatever the verdict. The EXECUTE half — the confirmation, the typed
 * code, the button — stays behind `preview.ok` exactly as before: this widens
 * what is REPORTED, not what can be written.
 *
 * NOT fetched when the two codes are identical. `detectRenameState` reads the
 * upstream axis as two independent codes; asked about one code twice it sees
 * `hasOldCode && hasNewCode` — one row, counted twice — and calls it a conflict
 * between two different courses, which is false. That case has its own honest
 * verdict from the preview itself (see the identical-codes branch in
 * buildRenamePreview), so the state report stays quiet rather than wrong.
 */

const CARD = 'rounded-9e-lg border p-4';
const CODE = 'rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-sm font-bold text-[var(--text-primary)]';

function CopyableCode({ value }) {
  // A plain, selectable element rather than a copy button: this screen has no
  // clipboard permission story and a button that silently fails is worse than
  // text the admin can select.
  return <code className={CODE}>{value}</code>;
}

/**
 * WHAT REPLACED THE MSDB OBLIGATION.
 *
 * There used to be an amber card here on every render, before and after the
 * write, telling the admin to go and change `course_id` in MSDB themselves. It
 * is gone because the obligation is gone — the action writes upstream and
 * confirms it by read-back, so nothing is owed afterwards.
 *
 * Deleting it outright would have left the confirmation with nothing to say
 * about REACH, and reach is what actually grew: this button now edits the live
 * public catalogue. So the card is replaced rather than removed, and it says
 * the one thing an admin has to weigh before pressing — this changes both
 * systems at once, immediately, and this tool cannot put it back.
 *
 * `data-testid` deliberately CHANGED from `msdb-obligation`: a test still
 * looking for the old id should go red rather than pass against a card that now
 * says something else entirely.
 */
function UpstreamReach({ from, to }) {
  return (
    <div
      className={`${CARD} border-[var(--surface-border)] bg-[var(--surface-muted)]`}
      data-testid="upstream-reach"
    >
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        การกดปุ่มนี้เปลี่ยนทั้งสองฝั่งพร้อมกัน
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
        ระบบจะเปลี่ยน <span className="font-semibold">course_id</span> ที่ MSDB จาก{' '}
        <CopyableCode value={from} /> เป็น <CopyableCode value={to} /> ให้เอง
        แล้วอ่านกลับมายืนยันว่าเปลี่ยนจริง จากนั้นจึงเขียนฝั่งระบบนี้
        — <span className="font-semibold">ไม่ต้องไปแก้ MSDB ด้วยตนเองอีกแล้ว</span>
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
        ถ้า MSDB ปฏิเสธ จะไม่มีอะไรถูกเขียนเลยทั้งสองฝั่ง
        แต่ถ้าเปลี่ยนสำเร็จแล้ว <span className="font-semibold">เครื่องมือนี้ย้อนกลับให้ไม่ได้</span>
      </p>
    </div>
  );
}

/**
 * `inspectRenameState`'s answer, rendered whatever it says.
 *
 * EXPORTED so the render tier can drive every state from a fixture. The panel's
 * own copy only exists after a run, which that tier cannot trigger — and the
 * states worth asserting (the interval, the reverse divergence, a conflict) are
 * exactly the ones nobody can produce on demand.
 */
export function RenameStateReport({ state, from, to, onRerun, busy }) {
  if (!state) return null;

  if (state.partial) {
    return (
      <div className={`${CARD} border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10`} data-testid="rename-state">
        <p className="text-sm font-bold text-red-700 dark:text-red-300">
          เปลี่ยนรหัสค้างอยู่กลางทาง
        </p>
        <p className="mt-1 text-sm text-red-700 dark:text-red-300">
          ยังเหลือที่เก็บข้อมูลที่ใช้รหัสเดิม (<CopyableCode value={from} />) อยู่:
        </p>
        <ul className="mt-2 space-y-1">
          {state.stillOnOldCode.map((s) => (
            <li key={s} className="font-mono text-xs text-red-700 dark:text-red-300">— {s}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">
          สั่งซ้ำได้อย่างปลอดภัย — ทุกขั้นตอนออกแบบให้ทำซ้ำแล้วได้ผลเดิม
          ส่วนที่เขียนไปแล้วจะไม่ถูกเขียนซ้ำ
        </p>
        {/* Rendered on THIS branch too. A partial rename has written, so it is
            not reversible — and the branch that returns early is exactly where
            an "every state says so" rule quietly stops holding. */}
        <p className="mt-2 text-xs text-red-700 dark:text-red-300" data-testid="rename-reversibility">
          ฝั่งระบบนี้เขียนไปแล้ว — ย้อนกลับด้วยเครื่องมือนี้ไม่ได้ ต้องเดินหน้าให้ครบ
        </p>
        <button
          type="button"
          onClick={onRerun}
          disabled={busy}
          className="mt-3 rounded-9e-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? 'กำลังทำซ้ำ…' : 'สั่งซ้ำให้เสร็จ'}
        </button>
      </div>
    );
  }

  /**
   * ── ONE ENTRY PER STATE, EACH WITH ITS OWN ADVICE ──────────────────────
   *
   * The advice is the point. A state name tells the admin where they are; only
   * the advice tells them whether to go forward or back — and those are
   * opposite actions in two states that look almost identical from the genesis
   * side alone.
   */
  const STATES = {
    [RENAME_STATE.NOT_STARTED]: {
      tone: 'plain',
      title: 'ยังไม่ได้เริ่ม — ทั้งสองฝั่งยังใช้รหัสเดิม',
      advice: 'ยังไม่มีอะไรเปลี่ยน เริ่มได้ตามปกติ',
    },
    [RENAME_STATE.UPSTREAM_PENDING]: {
      tone: 'warn',
      title: 'ฝั่งระบบนี้เปลี่ยนแล้ว — MSDB ยังเป็นรหัสเดิม',
      advice: 'ไปแก้ course_id ที่ MSDB เดี๋ยวนี้ นี่คือช่วงที่หลักสูตรซ่อนอาจกลับมาแสดง',
    },
    [RENAME_STATE.COMPLETE]: {
      tone: 'ok',
      title: 'เสร็จแล้ว — ทั้งสองฝั่งตรงกัน',
      advice: 'ไม่ต้องทำอะไรต่อ',
    },
    /**
     * ── THE RESUMABLE ONE, AND IT IS NOW OFFERED RATHER THAN DESCRIBED ────
     *
     * This is the state a failed genesis half leaves behind, and it used to be
     * a dead end on this screen: the preview refused it as a collision, because
     * the code upstream now holds is the code being renamed TO and nothing
     * could tell this course from a different one that had taken the code.
     *
     * `CourseExtension.upstreamId` settles it — the `_id` survives a rename, so
     * matching it against the row holding the new code is a proof of identity
     * rather than an inference from the code. When it matches, the preview
     * stops blocking and the ordinary confirmation below IS the resume: it
     * skips the upstream write (already applied, confirmed by read-back) and
     * catches genesis up.
     *
     * Where the row has NO anchor the preview refuses instead and names it —
     * see the no-anchor branch in buildRenamePreview. It never falls back to
     * comparing codes.
     */
    [RENAME_STATE.UPSTREAM_ONLY]: {
      tone: 'warn',
      title: 'MSDB เปลี่ยนแล้ว — ฝั่งระบบนี้ยังไม่ได้เปลี่ยน',
      advice:
        'ทำต่อให้เสร็จได้เลย: กด "ตรวจสอบผลกระทบ" แล้วยืนยัน ระบบจะข้ามขั้น MSDB '
        + '(เปลี่ยนไปแล้ว) และเขียนเฉพาะฝั่งระบบนี้ให้ตามทัน '
        + 'หรือถ้ายังไม่ต้องการ ให้เปลี่ยน course_id ที่ MSDB กลับเป็นรหัสเดิม — ยกเลิกได้ทั้งหมดตราบใดที่ฝั่งนี้ยังไม่ได้เขียน',
    },
    [RENAME_STATE.UPSTREAM_CONFLICT]: {
      tone: 'bad',
      title: 'MSDB มีทั้งสองรหัสอยู่ — เป็นคนละหลักสูตรกัน',
      advice: 'รหัสใหม่ถูกใช้โดยหลักสูตรอื่นแล้ว ต้องแก้ที่ MSDB ก่อน',
    },
    [RENAME_STATE.UNKNOWN]: {
      tone: 'bad',
      title: 'MSDB ไม่มีทั้งสองรหัส',
      advice: 'ตรวจสอบว่าหลักสูตรยังอยู่ที่ต้นทางหรือไม่ ก่อนทำอะไรต่อ',
    },
  };

  const entry = STATES[state.state] ?? { tone: 'plain', title: state.state, advice: '' };
  const TONE = {
    ok:    'border-[var(--surface-border)] bg-[var(--surface)]',
    plain: 'border-[var(--surface-border)] bg-[var(--surface)]',
    warn:  'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10',
    bad:   'border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10',
  };

  return (
    <div className={`${CARD} ${TONE[entry.tone]}`} data-testid="rename-state" data-state={state.state}>
      <p className="text-xs font-semibold text-[var(--text-secondary)]">สถานะทั้งสองฝั่ง</p>
      <p className="mt-1 text-sm font-bold text-[var(--text-primary)]">{entry.title}</p>
      <p className="mt-1 text-sm text-[var(--text-primary)]">{entry.advice}</p>

      {/* THE REVERSIBILITY FACT, RENDERED — not left for the reader to infer
          from the state name. It is the only thing that says whether going
          BACK is still an option, and it is true exactly while genesis has not
          written. Measured: an upstream-only divergence undoes completely by
          renaming MSDB back. */}
      <p
        className={'mt-2 text-xs leading-relaxed ' + (state.reversible ? 'text-emerald-700 dark:text-emerald-300' : 'text-[var(--text-muted)]')}
        data-testid="rename-reversibility"
      >
        {state.reversible
          ? 'ฝั่งระบบนี้ยังไม่ได้เขียนอะไร — ย้อนกลับได้ทั้งหมดโดยแก้ที่ MSDB อย่างเดียว'
          : 'ฝั่งระบบนี้เขียนไปแล้ว — ย้อนกลับด้วยเครื่องมือนี้ไม่ได้ ต้องเดินหน้าให้ครบ'}
      </p>

      {state.alreadyOnNewCode?.length > 0 && (
        <p className="mt-2 font-mono text-xs text-[var(--text-muted)]">
          ใช้รหัสใหม่แล้ว: {state.alreadyOnNewCode.join(', ')}
        </p>
      )}
    </div>
  );
}

/**
 * WHAT THE ATTEMPT DID — the four outcomes, kept apart.
 *
 * They are not degrees of the same thing and must never render as one. The
 * distinction an admin acts on is WHAT WAS WRITTEN, and it differs in every
 * case:
 *
 *   complete       both sides moved, confirmed by read-back. Nothing owed.
 *   clean refusal  MSDB said no BEFORE anything moved. Nothing was written
 *                  anywhere, so pressing again is safe and is offered.
 *   unknown        the write was sent and no answer came back. Genesis was NOT
 *                  touched, but upstream may or may not have moved. A retry
 *                  here could rename a course that is already renamed, so NO
 *                  RETRY IS OFFERED — the only safe next move is to look.
 *   divergence     both sides moved but the row counts did not match the
 *                  preview. Reported as a failure with the store named.
 *
 * EXPORTED so the render tier can drive all four from fixtures: three of them
 * need an upstream failure to produce, which no test can arrange for real.
 */
export function RenameOutcomeReport({ result }) {
  if (!result) return null;

  const done = result.ok === true;
  const outcome = done ? 'applied' : (result.outcome ?? 'error');
  const rows = Object.values(result.counts ?? {}).reduce((n, v) => n + (v ?? 0), 0);

  if (done) {
    return (
      <div
        className={`${CARD} border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10`}
        data-testid="rename-outcome"
        data-outcome="applied"
      >
        <p className="text-base font-bold text-emerald-900 dark:text-emerald-100">
          เปลี่ยนรหัสเรียบร้อยทั้งสองฝั่ง
        </p>
        <p className="mt-2 text-sm leading-relaxed text-emerald-900 dark:text-emerald-100">
          MSDB เปลี่ยนเป็น <CopyableCode value={result.to} /> แล้ว และอ่านกลับมายืนยันแล้วว่าเปลี่ยนจริง
          — ฝั่งระบบนี้เขียนไป {rows} แถว
          {result.aliasCreated && (
            <> — สร้าง alias <CopyableCode value={result.aliasCreated} /> ให้แล้ว</>
          )}
        </p>
        <p className="mt-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          ไม่ต้องไปแก้ MSDB เองแล้ว — ไม่มีขั้นตอนค้างอยู่
        </p>
        {result.followUps?.length > 0 && (
          <ul className="mt-2 space-y-1">
            {result.followUps.map((f) => (
              <li key={f} className="text-xs leading-relaxed text-emerald-900 dark:text-emerald-100">— {f}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (outcome === 'unknown') {
    return (
      <div
        className={`${CARD} border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/15`}
        data-testid="rename-outcome"
        data-outcome="unknown"
      >
        <p className="text-base font-bold text-amber-900 dark:text-amber-100">
          ยังไม่ทราบผล — ห้ามกดซ้ำ
        </p>
        <p className="mt-2 text-sm leading-relaxed text-amber-900 dark:text-amber-100">
          {result.error}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-amber-900 dark:text-amber-100">
          ฝั่งระบบนี้<span className="font-semibold">ยังไม่ได้เขียนอะไรเลย</span> แต่ฝั่ง MSDB
          อาจเปลี่ยนไปแล้วหรือยังไม่เปลี่ยนก็ได้ — กด &ldquo;ตรวจสอบผลกระทบ&rdquo; ใหม่
          แล้วอ่านสถานะสองฝั่งด้านล่างว่า MSDB ถือรหัสใด ก่อนตัดสินใจทำอะไรต่อ
        </p>
        {/* NO RETRY CONTROL, deliberately. A second attempt could rename a
            course that has already been renamed. */}
      </div>
    );
  }

  const refused = outcome === 'refused' || outcome === 'not-applied';
  return (
    <div
      className={`${CARD} border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10`}
      data-testid="rename-outcome"
      data-outcome={outcome}
    >
      <p className="text-sm font-bold text-red-700 dark:text-red-300">
        {refused ? 'ไม่ได้เปลี่ยนรหัส — ยังไม่มีอะไรถูกเขียนเลย' : result.error}
      </p>
      {refused && <p className="mt-1 text-sm text-red-700 dark:text-red-300">{result.error}</p>}
      {refused && (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">
          ทั้ง MSDB และฝั่งระบบนี้ยังเป็นรหัสเดิม แก้ต้นเหตุแล้วลองใหม่ได้อย่างปลอดภัย
        </p>
      )}
      {result.divergences?.length > 0 && (
        <ul className="mt-2 space-y-1">
          {result.divergences.map((d) => (
            <li key={d.store} className="font-mono text-xs text-red-700 dark:text-red-300">
              {d.store}: คาดไว้ {d.expected} เขียนจริง {d.actual}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RenameExecutePanel({ preview, onPreviewReplaced }) {
  const [typedCode, setTypedCode] = useState('');
  const [ackUpstream, setAckUpstream] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [state, setState] = useState(null);
  const [stale, setStale] = useState(null);
  const [error, setError] = useState(null);

  const gate = canExecuteRename({ preview, typedCode, ackUpstream });
  const alias = aliasStepFor(preview);
  const from = preview?.oldCode ?? '';
  const to = preview?.newCode ?? '';
  const done = result?.ok === true;

  async function run() {
    setBusy(true);
    setError(null);
    setStale(null);
    try {
      const res = await renameCourseCode({
        oldCode: from,
        newCode: to,
        // The token for the preview ON SCREEN — see tokenForPreview.
        previewToken: gate.token,
      });
      setResult(res);
      if (res?.stale) setStale(res);
      /**
       * UNCONDITIONAL. Runs on success and on every kind of failure, because
       * a partial rename is the state that follows a request that looked like
       * it failed.
       */
      const after = await inspectRenameState({ oldCode: from, newCode: to }).catch(() => null);
      setState(after);
    } catch (err) {
      setError(err?.message ?? 'เปลี่ยนรหัสไม่สำเร็จ');
      const after = await inspectRenameState({ oldCode: from, newCode: to }).catch(() => null);
      setState(after);
    } finally {
      setBusy(false);
    }
  }

  /**
   * THE STATE, BEFORE ANY BUTTON IS PRESSED — see the header.
   *
   * Declared below `run` on purpose: `run`'s two calls are the ones that must
   * straddle the try/catch, and keeping them first makes that readable in the
   * file as well as assertable in test/fs/renameExecuteWiring.
   *
   * Keyed on the two codes and the preview's row total, so a re-check that
   * changed the numbers refetches while an unrelated re-render does not.
   * `alive` guards the late resolve that would otherwise overwrite a newer
   * answer with an older one.
   */
  const totalRows = preview?.totalRows ?? null;
  useEffect(() => {
    if (!from || !to || from === to) {
      setState(null);
      return undefined;
    }
    let alive = true;
    inspectRenameState({ oldCode: from, newCode: to })
      .then((s) => { if (alive) setState(s); })
      .catch(() => { if (alive) setState(null); });
    return () => { alive = false; };
  }, [from, to, totalRows]);

  if (!preview) return null;

  /**
   * A REFUSED PREVIEW STILL REPORTS WHERE THE TWO SIDES ARE. Only the write
   * affordances are withheld — see the header for why the old early return was
   * the bug rather than the safeguard.
   */
  if (preview.ok === false) {
    return (
      <div className="space-y-4" data-testid="rename-execute-blocked">
        <RenameStateReport state={state} from={from} to={to} />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="rename-execute">
      {/* ── What actually happened, before anything else ──────────────── */}
      <RenameOutcomeReport result={result} />

      <RenameStateReport state={state} from={from} to={to} onRerun={run} busy={busy} />

      {stale && (
        <div className={`${CARD} border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10`} data-testid="rename-stale">
          <p className="text-sm font-bold text-red-700 dark:text-red-300">
            ข้อมูลเปลี่ยนไปหลังจากที่ตรวจสอบ — ยังไม่ได้เขียนอะไร
          </p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            มีบางอย่างเปลี่ยนระหว่างที่ตรวจสอบกับตอนกดยืนยัน
            กรุณากด &ldquo;ตรวจสอบผลกระทบ&rdquo; ใหม่แล้วอ่านตัวเลขอีกครั้งก่อนยืนยัน
          </p>
        </div>
      )}

      {/* The failure card that used to live here is now RenameOutcomeReport,
          rendered at the top — it distinguishes refusal from unknown from
          divergence, which one red box could not. */}

      {error && (
        <div className={`${CARD} border-red-300 bg-red-50`}>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── The confirmation, while there is still something to confirm ── */}
      {!done && (
        <div className={`${CARD} border-9e-action/40 bg-[var(--surface)]`}>
          <p className="text-sm font-bold text-[var(--text-primary)]">ยืนยันการเปลี่ยนรหัส</p>

          <ol className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            {/* THE ALIAS AS STEP ONE, not a footnote — its ORDER is what makes
                the old URL survive. */}
            {alias && (
              <li data-testid="alias-step">
                <span className="font-semibold text-[var(--text-primary)]">ขั้นที่ 1</span> — สร้าง URL alias{' '}
                <CopyableCode value={alias.path} /> ให้ก่อน
                มิฉะนั้น URL เดิมจะ 404 โดยไม่มีทางเชื่อมกลับ
              </li>
            )}
            {/* THE ORDER SHOWN IS THE ORDER PERFORMED, and it is upstream
                first. An admin who reads this list and then reads a failure
                needs the list to explain which half can possibly have moved. */}
            <li>
              <span className="font-semibold text-[var(--text-primary)]">ขั้นที่ {alias ? 2 : 1}</span> — เปลี่ยน course_id ที่ MSDB
              (<CopyableCode value={from} /> → <CopyableCode value={to} />) แล้วอ่านกลับมายืนยัน
            </li>
            <li>
              <span className="font-semibold text-[var(--text-primary)]">ขั้นที่ {alias ? 3 : 2}</span> — เมื่อยืนยันแล้วเท่านั้น จึงเขียนฝั่งระบบนี้
              และล้างแคชสาธารณะให้
            </li>
          </ol>

          <div className="mt-4">
            <label htmlFor="confirm-code" className="block text-xs font-medium text-[var(--text-secondary)]">
              พิมพ์รหัสใหม่อีกครั้งเพื่อยืนยัน — ตรวจดูด้วยว่าเลือกหลักสูตรถูกตัว
            </label>
            <input
              id="confirm-code"
              type="text"
              value={typedCode}
              onChange={(e) => setTypedCode(e.target.value)}
              placeholder={to}
              autoComplete="off"
              className="mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 font-mono text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
            />
          </div>

          <label className="mt-3 flex items-start gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={ackUpstream}
              onChange={(e) => setAckUpstream(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              เข้าใจแล้วว่าคำสั่งนี้จะเปลี่ยน course_id ที่ MSDB ซึ่งเป็นข้อมูลจริงที่เผยแพร่อยู่
              ทันทีและโดยอัตโนมัติ และเมื่อเปลี่ยนสำเร็จแล้วเครื่องมือนี้ย้อนกลับให้ไม่ได้
            </span>
          </label>

          <button
            type="button"
            onClick={run}
            disabled={!gate.allowed || busy}
            className="mt-4 rounded-9e-md bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'กำลังเปลี่ยน…' : 'เปลี่ยนรหัส (ทั้ง MSDB และระบบนี้)'}
          </button>

          {!gate.allowed && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {gate.reasons.includes(GATE.NOT_TYPED) && 'พิมพ์รหัสใหม่ให้ตรงก่อน '}
              {gate.reasons.includes(GATE.NOT_ACKED) && '· ติ๊กยืนยันว่าเข้าใจว่าจะเปลี่ยน MSDB จริง'}
            </p>
          )}
        </div>
      )}

      {!done && <UpstreamReach from={from} to={to} />}

      {/* Keeps the parent's re-check reachable from down here, where the admin
          is looking when a stale refusal appears. */}
      {stale && onPreviewReplaced && (
        <button
          type="button"
          onClick={onPreviewReplaced}
          className="text-sm font-semibold text-9e-action hover:underline"
        >
          ตรวจสอบผลกระทบใหม่
        </button>
      )}
    </div>
  );
}
