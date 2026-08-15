'use client';

import { useState } from 'react';
import { renameCourseCodePhase1, inspectRenameState } from '@/lib/actions/course-rename';
import { canExecuteRename, aliasStepFor, GATE } from '@/lib/courses/renameExecuteGate';

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
 */

const CARD = 'rounded-9e-lg border p-4';
const CODE = 'rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-sm font-bold text-[var(--text-primary)]';

function CopyableCode({ value }) {
  // A plain, selectable element rather than a copy button: this screen has no
  // clipboard permission story and a button that silently fails is worse than
  // text the admin can select.
  return <code className={CODE}>{value}</code>;
}

/** The MSDB obligation. After a complete phase 1 this is the loudest thing here. */
function MsdbObligation({ from, to, loud }) {
  return (
    <div
      className={
        CARD + ' ' +
        (loud
          ? 'border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/15'
          : 'border-[var(--surface-border)] bg-[var(--surface-muted)]')
      }
      data-testid="msdb-obligation"
    >
      <p className={loud ? 'text-base font-bold text-amber-900 dark:text-amber-100' : 'text-sm font-semibold text-[var(--text-primary)]'}>
        {loud ? 'ยังไม่เสร็จ — ต้องแก้ MSDB เดี๋ยวนี้' : 'ขั้นต่อไปหลังเขียนเสร็จ: แก้ MSDB ทันที'}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-amber-900 dark:text-amber-100">
        เปลี่ยน <span className="font-semibold">course_id</span> ที่ MSDB จาก{' '}
        <CopyableCode value={from} /> เป็น <CopyableCode value={to} />
      </p>
      <p className="mt-2 text-sm leading-relaxed text-amber-900 dark:text-amber-100">
        ระหว่างที่ยังไม่แก้: หลักสูตรหลุดจากลำดับของโปรแกรม, Early Bird / ลิงก์โปรโมชั่น /
        ตารางที่แก้ในระบบ / รายการแนะนำ ยังไม่ผูกกับหลักสูตรนี้
        และ <span className="font-semibold">หลักสูตรที่ถูกซ่อนไว้อาจกลับมาแสดงต่อสาธารณะ</span> —
        เป็นนาที ไม่ใช่ชั่วโมง
      </p>
    </div>
  );
}

/** `inspectRenameState`'s answer, rendered whatever it says. */
function StateReport({ state, from, to, onRerun, busy }) {
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

  const LABEL = {
    complete: 'ฝั่ง genesis เปลี่ยนครบแล้ว',
    'not-started': 'ยังไม่ได้เริ่ม — ไม่มีที่เก็บข้อมูลใดใช้รหัสใหม่',
    empty: 'ไม่พบข้อมูลที่ผูกกับรหัสใดเลย',
  };
  return (
    <div className={`${CARD} border-[var(--surface-border)] bg-[var(--surface)]`} data-testid="rename-state">
      <p className="text-xs font-semibold text-[var(--text-secondary)]">สถานะหลังทำงาน</p>
      <p className="mt-1 text-sm text-[var(--text-primary)]">{LABEL[state.state] ?? state.state}</p>
      {state.alreadyOnNewCode?.length > 0 && (
        <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
          ใช้รหัสใหม่แล้ว: {state.alreadyOnNewCode.join(', ')}
        </p>
      )}
    </div>
  );
}

export function RenameExecutePanel({ preview, onPreviewReplaced }) {
  const [typedCode, setTypedCode] = useState('');
  const [ackMsdb, setAckMsdb] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [state, setState] = useState(null);
  const [stale, setStale] = useState(null);
  const [error, setError] = useState(null);

  const gate = canExecuteRename({ preview, typedCode, ackMsdb });
  const alias = aliasStepFor(preview);
  const from = preview?.oldCode ?? '';
  const to = preview?.newCode ?? '';
  const done = result?.ok === true;

  async function run() {
    setBusy(true);
    setError(null);
    setStale(null);
    try {
      const res = await renameCourseCodePhase1({
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

  if (!preview || preview.ok === false) return null;

  return (
    <div className="space-y-4" data-testid="rename-execute">
      {/* ── After a complete phase 1 the obligation leads ─────────────── */}
      {done && <MsdbObligation from={from} to={to} loud />}

      {done && (
        <div className={`${CARD} border-[var(--surface-border)] bg-[var(--surface)]`}>
          <p className="text-sm text-[var(--text-primary)]">
            เขียนฝั่ง genesis แล้ว {Object.values(result.counts ?? {}).reduce((n, v) => n + (v ?? 0), 0)} แถว
            {result.aliasCreated && (
              <> — สร้าง alias <CopyableCode value={result.aliasCreated} /> ให้แล้ว</>
            )}
          </p>
        </div>
      )}

      <StateReport state={state} from={from} to={to} onRerun={run} busy={busy} />

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

      {result && result.ok === false && !stale && (
        <div className={`${CARD} border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10`}>
          <p className="text-sm font-bold text-red-700 dark:text-red-300">{result.error}</p>
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
      )}

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
            <li>
              <span className="font-semibold text-[var(--text-primary)]">ขั้นที่ {alias ? 2 : 1}</span> — เปลี่ยนรหัสในระบบนี้
              (<CopyableCode value={from} /> → <CopyableCode value={to} />)
            </li>
            <li>
              <span className="font-semibold text-[var(--text-primary)]">ขั้นที่ {alias ? 3 : 2}</span> — คุณแก้ course_id ที่ MSDB เอง ทันทีหลังจากนั้น
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
              checked={ackMsdb}
              onChange={(e) => setAckMsdb(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              เข้าใจแล้วว่าต้องไปแก้ course_id ที่ MSDB ด้วยตนเองทันทีหลังจากนี้
              และระหว่างนั้นหลักสูตรที่ซ่อนไว้อาจกลับมาแสดงต่อสาธารณะ
            </span>
          </label>

          <button
            type="button"
            onClick={run}
            disabled={!gate.allowed || busy}
            className="mt-4 rounded-9e-md bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'กำลังเปลี่ยน…' : 'เปลี่ยนรหัส (ฝั่งระบบนี้)'}
          </button>

          {!gate.allowed && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {gate.reasons.includes(GATE.NOT_TYPED) && 'พิมพ์รหัสใหม่ให้ตรงก่อน '}
              {gate.reasons.includes(GATE.NOT_ACKED) && '· ติ๊กยืนยันเรื่อง MSDB'}
            </p>
          )}
        </div>
      )}

      {!done && <MsdbObligation from={from} to={to} loud={false} />}

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
