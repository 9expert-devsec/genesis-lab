'use client';

import { useCallback, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Loader2, Plus, Trash2, Pencil, ArrowRight, RotateCcw } from 'lucide-react';
import {
  saveRedirectRule,
  deleteRedirectRule,
  createRuleFromHit,
  reopenNotFoundHit,
} from '@/lib/actions/redirects';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { validateRule } from '@/lib/redirects/redirectRules';

/**
 * Redirect Panel — the rule table and the 404 worklist.
 *
 * ── NO FILTER LIVES HERE ──────────────────────────────────────────────────
 * `view`, `q`, `hostFilter`, `page` and `includeResolved` are PROPS, read from
 * searchParams on the server. Nothing copies them into state. Changing a filter
 * pushes a URL and the server re-queries; that is the whole mechanism, and it
 * is what keeps the chip and the list from disagreeing after a navigation.
 *
 * The `useState` below is ephemeral UI only — which row's form is open, what a
 * pending action is doing, and the draft being typed. None of it is derived
 * from the URL.
 */

const dtf = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
});
function when(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dtf.format(d);
}

const EMPTY_DRAFT = {
  id: '', host: '', source: '', destination: '', permanent: true, isActive: true, note: '',
};

function FieldError({ children }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-red-700" data-testid="field-error">{children}</p>;
}

/**
 * The add/edit form. Validated with the SAME pure function the server uses, so
 * the refusal an admin sees while typing is the refusal the write would give —
 * the server still re-validates, because a client is never a boundary.
 */
function RuleForm({ draft, setDraft, onSave, onCancel, busy, serverErrors }) {
  const local = draft.host || draft.source || draft.destination
    ? validateRule(draft)
    : { ok: true };
  const errors = { ...(local.ok ? {} : local.errors), ...(serverErrors ?? {}) };
  /**
   * A REFUSAL THE ADMIN CAN CLICK PAST IS NOT A REFUSAL.
   *
   * The server re-validates and is the authority — a client is never a
   * boundary. But letting the button fire with a known-bad destination means
   * the open-redirect guard reads as advice, and the admin learns to ignore it.
   * A draft that has not been started yet is not "invalid", it is empty, so the
   * button is only blocked once something has been typed.
   */
  const started = Boolean(draft.host || draft.source || draft.destination);
  const blocked = started && !local.ok;

  return (
    <div className="rounded-9e-md border border-[var(--surface-border)] p-4" data-testid="rule-form">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-9e-navy dark:text-white">โฮสต์</label>
          <input
            type="text"
            value={draft.host}
            onChange={(e) => setDraft({ ...draft, host: e.target.value })}
            placeholder="www.9experttraining.com"
            data-testid="rule-host"
            className="mt-1 w-full rounded-9e-md border border-[var(--surface-border)] px-2 py-1.5 font-mono text-xs"
          />
          <FieldError>{errors.host}</FieldError>
        </div>
        <div>
          <label className="block text-xs font-medium text-9e-navy dark:text-white">พาธเดิม (ตรงตัว)</label>
          <input
            type="text"
            value={draft.source}
            onChange={(e) => setDraft({ ...draft, source: e.target.value })}
            placeholder="/old-page"
            data-testid="rule-source"
            className="mt-1 w-full rounded-9e-md border border-[var(--surface-border)] px-2 py-1.5 font-mono text-xs"
          />
          <FieldError>{errors.source}</FieldError>
        </div>
        <div>
          <label className="block text-xs font-medium text-9e-navy dark:text-white">ปลายทาง (ภายในเว็บ)</label>
          <input
            type="text"
            value={draft.destination}
            onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
            placeholder="/new-page"
            data-testid="rule-destination"
            className="mt-1 w-full rounded-9e-md border border-[var(--surface-border)] px-2 py-1.5 font-mono text-xs"
          />
          <FieldError>{errors.destination}</FieldError>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={draft.permanent}
            onChange={(e) => setDraft({ ...draft, permanent: e.target.checked })}
            data-testid="rule-permanent"
          />
          ถาวร (308)
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
            data-testid="rule-active"
          />
          เปิดใช้งาน
        </label>
        <input
          type="text"
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          placeholder="หมายเหตุ"
          data-testid="rule-note"
          className="flex-1 rounded-9e-md border border-[var(--surface-border)] px-2 py-1.5 text-xs"
        />
      </div>

      <FieldError>{errors.form}</FieldError>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || blocked}
          data-testid="rule-save"
          className="inline-flex items-center gap-1.5 rounded-9e-md bg-9e-action px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          บันทึก
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

/**
 * ── TEST SEAM ONLY. PRODUCTION PASSES NOTHING. ──────────────────────────────
 * The same `deps` idiom recordAdminAction and the version writer already use.
 * It exists because this component's interesting behaviour is what happens
 * AFTER a server action settles — a spinner clearing, a refusal landing on the
 * right field — and `renderToStaticMarkup` runs no effects and presses no
 * buttons. A drive that reimplemented the handlers would be checking a replica;
 * last round that exact mistake shipped a panel with 57 green tests that spun
 * forever on first click.
 */
const REAL_ACTIONS = {
  saveRedirectRule, deleteRedirectRule, createRuleFromHit, reopenNotFoundHit,
};

export function RedirectsAdminClient({
  view, q, hostFilter, page, includeResolved, rules, hits,
  actions = REAL_ACTIONS,
}) {
  const {
    saveRedirectRule: save$ = saveRedirectRule,
    deleteRedirectRule: delete$ = deleteRedirectRule,
    createRuleFromHit: fromHit$ = createRuleFromHit,
    reopenNotFoundHit: reopen$ = reopenNotFoundHit,
  } = actions ?? {};
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState(null);
  const [message, setMessage] = useState(null);
  const [hitDraft, setHitDraft] = useState({ id: '', destination: '' });

  /** Every filter change is a NAVIGATION. Nothing is held locally. */
  const navigate = useCallback((patch) => {
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === null || v === undefined) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    router.push(`${pathname}?${next.toString()}`);
  }, [router, pathname, searchParams]);

  const save = useCallback(async () => {
    setBusy(true);
    setServerErrors(null);
    setMessage(null);
    try {
      const res = await save$(draft);
      if (res?.ok) {
        setDraft(null);
        setMessage('บันทึกกฎแล้ว');
        router.refresh();
      } else {
        setServerErrors(res?.errors ?? { form: 'บันทึกไม่สำเร็จ' });
      }
    } catch (err) {
      setServerErrors({ form: err?.message ?? 'บันทึกไม่สำเร็จ' });
    } finally {
      // The spinner clears on every path — resolve, reject, refusal.
      setBusy(false);
    }
  }, [draft, router, save$]);

  const remove = useCallback(async (id) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await delete$(id);
      setMessage(res?.ok ? 'ลบกฎแล้ว' : (res?.error ?? 'ลบไม่สำเร็จ'));
      if (res?.ok) router.refresh();
    } catch (err) {
      setMessage(err?.message ?? 'ลบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }, [router, delete$]);

  const makeRule = useCallback(async (hitId) => {
    setBusy(true);
    setMessage(null);
    setServerErrors(null);
    try {
      const res = await fromHit$({ hitId, destination: hitDraft.destination });
      if (res?.ok) {
        setHitDraft({ id: '', destination: '' });
        setMessage('สร้างกฎจากรายการ 404 แล้ว');
        router.refresh();
      } else {
        setServerErrors(res?.errors ?? { form: 'สร้างกฎไม่สำเร็จ' });
      }
    } catch (err) {
      setServerErrors({ form: err?.message ?? 'สร้างกฎไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  }, [hitDraft, router, fromHit$]);

  const reopen = useCallback(async (id) => {
    setBusy(true);
    try {
      await reopen$(id);
      router.refresh();
    } catch { /* the list simply does not change */ } finally { setBusy(false); }
  }, [router]);

  const tabClass = (active) =>
    'border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
    (active ? 'border-9e-action text-9e-action' : 'border-transparent text-[var(--text-secondary)]');

  return (
    <div>
      <h1 className="text-2xl font-bold text-9e-navy dark:text-white">Redirect &amp; 404</h1>
      <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
        กฎ redirect แบบระบุพาธตรงตัว และบันทึก URL ที่เข้ามาแล้วไม่พบหน้า
      </p>

      <div className="mt-5 flex gap-2 border-b border-[var(--surface-border)]">
        <button type="button" data-testid="tab-rules" className={tabClass(view === 'rules')}
          onClick={() => navigate({ view: '', q: '', page: '' })}>
          กฎ Redirect{rules ? ` (${rules.total})` : ''}
        </button>
        <button type="button" data-testid="tab-log" className={tabClass(view === 'log')}
          onClick={() => navigate({ view: 'log', q: '', page: '' })}>
          บันทึก 404{hits ? ` (${hits.total})` : ''}
        </button>
      </div>

      {message && (
        <p className="mt-3 text-sm text-9e-action" data-testid="panel-message">{message}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          defaultValue={q}
          placeholder="ค้นหาพาธ"
          data-testid="filter-q"
          onKeyDown={(e) => { if (e.key === 'Enter') navigate({ q: e.currentTarget.value }); }}
          className="rounded-9e-md border border-[var(--surface-border)] px-2 py-1.5 text-xs"
        />
        {view === 'rules' && rules?.hosts?.length > 0 && (
          <select
            value={hostFilter}
            data-testid="filter-host"
            onChange={(e) => navigate({ host: e.target.value })}
            className="rounded-9e-md border border-[var(--surface-border)] px-2 py-1.5 text-xs"
          >
            <option value="">ทุกโฮสต์</option>
            {rules.hosts.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        )}
        {view === 'log' && (
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={includeResolved}
              data-testid="filter-resolved"
              onChange={(e) => navigate({ resolved: e.target.checked ? '1' : '' })}
            />
            แสดงรายการที่จัดการแล้ว
          </label>
        )}
        {view === 'rules' && (
          <button
            type="button"
            data-testid="rule-add"
            onClick={() => { setDraft({ ...EMPTY_DRAFT }); setServerErrors(null); }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-9e-md bg-9e-action px-3 py-1.5 text-xs font-medium text-white"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> เพิ่มกฎ
          </button>
        )}
      </div>

      {draft && (
        <div className="mt-4">
          <RuleForm
            draft={draft} setDraft={setDraft} onSave={save}
            onCancel={() => { setDraft(null); setServerErrors(null); }}
            busy={busy} serverErrors={serverErrors}
          />
        </div>
      )}

      {view === 'rules' && (
        <div className="mt-4 space-y-2" data-testid="rules-list">
          {(rules?.rows ?? []).length === 0 && (
            <p className="rounded-9e-md border border-dashed border-[var(--surface-border)] p-6 text-center text-sm text-[var(--text-secondary)]"
              data-testid="rules-empty">
              ยังไม่มีกฎ redirect — เพิ่มกฎแรก หรือสร้างจากบันทึก 404
            </p>
          )}
          {(rules?.rows ?? []).map((r) => (
            <div key={r._id} className="flex flex-wrap items-center gap-3 rounded-9e-md border border-[var(--surface-border)] px-3 py-2"
              data-testid="rule-row">
              <span className="font-mono text-xs text-[var(--text-muted)]" data-testid="rule-row-host">{r.host}</span>
              <span className="font-mono text-xs text-9e-navy dark:text-white" data-testid="rule-row-source">{r.source}</span>
              <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
              <span className="font-mono text-xs text-9e-action" data-testid="rule-row-destination">{r.destination}</span>
              <span className="text-[11px] text-[var(--text-muted)]" data-testid="rule-row-code">{r.permanent ? '308' : '307'}</span>
              {r.isActive === false && (
                <span className="rounded bg-amber-100 px-1.5 text-[11px] text-amber-800" data-testid="rule-row-off">ปิดอยู่</span>
              )}
              <span className="ml-auto flex gap-1">
                <button type="button" aria-label="แก้ไข" data-testid="rule-edit"
                  onClick={() => { setDraft({ ...EMPTY_DRAFT, ...r, id: r._id }); setServerErrors(null); }}
                  className="rounded border border-[var(--surface-border)] p-1">
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button type="button" aria-label="ลบ" data-testid="rule-delete" disabled={busy}
                  onClick={() => remove(r._id)}
                  className="rounded border border-red-200 p-1 text-red-700 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {view === 'log' && (
        <div className="mt-4 space-y-2" data-testid="log-list">
          {(hits?.rows ?? []).length === 0 && (
            <p className="rounded-9e-md border border-dashed border-[var(--surface-border)] p-6 text-center text-sm text-[var(--text-secondary)]"
              data-testid="log-empty">
              ยังไม่มีบันทึก 404 — ระบบจะเริ่มบันทึกเมื่อมีผู้เข้าถึง URL ที่ไม่มีอยู่จริง
              <br />
              รายการจะถูกลบอัตโนมัติหลังจากไม่มีการเข้าถึงอีก 30 วัน
            </p>
          )}
          {(hits?.rows ?? []).map((h) => (
            <div key={h._id} className="rounded-9e-md border border-[var(--surface-border)] px-3 py-2" data-testid="log-row">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs text-[var(--text-muted)]" data-testid="log-row-host">{h.host}</span>
                <span className="font-mono text-xs text-9e-navy dark:text-white" data-testid="log-row-path">{h.path}</span>
                <span className="text-[11px] text-[var(--text-secondary)]" data-testid="log-row-count">{h.count} ครั้ง</span>
                <span className="text-[11px] text-[var(--text-muted)]" data-testid="log-row-last">{when(h.lastSeen)}</span>
                {h.resolvedAt ? (
                  <button type="button" data-testid="log-reopen" disabled={busy} onClick={() => reopen(h._id)}
                    className="ml-auto inline-flex items-center gap-1 rounded border border-[var(--surface-border)] px-2 py-1 text-[11px]">
                    <RotateCcw className="h-3 w-3" aria-hidden="true" /> จัดการแล้ว
                  </button>
                ) : (
                  <button type="button" data-testid="log-make-rule"
                    onClick={() => { setHitDraft({ id: h._id, destination: '' }); setServerErrors(null); }}
                    className="ml-auto rounded-9e-md border border-9e-action px-2 py-1 text-[11px] text-9e-action">
                    สร้างกฎจากรายการนี้
                  </button>
                )}
              </div>

              {hitDraft.id === h._id && (
                <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="hit-form">
                  <span className="font-mono text-xs text-[var(--text-muted)]">{h.path}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                  <input
                    type="text"
                    value={hitDraft.destination}
                    data-testid="hit-destination"
                    onChange={(e) => setHitDraft({ ...hitDraft, destination: e.target.value })}
                    placeholder="/new-page"
                    className="rounded-9e-md border border-[var(--surface-border)] px-2 py-1.5 font-mono text-xs"
                  />
                  <button type="button" data-testid="hit-save" disabled={busy} onClick={() => makeRule(h._id)}
                    className="inline-flex items-center gap-1.5 rounded-9e-md bg-9e-action px-3 py-1.5 text-xs text-white disabled:opacity-50">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                    สร้างกฎ
                  </button>
                  <FieldError>{serverErrors?.destination ?? serverErrors?.form}</FieldError>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(view === 'rules' ? rules : hits)?.pageCount > 1 && (
        <div className="mt-4 flex items-center gap-2 text-xs" data-testid="pager">
          <button type="button" disabled={page <= 1} onClick={() => navigate({ page: page - 1 })}
            className="rounded border border-[var(--surface-border)] px-2 py-1 disabled:opacity-40">ก่อนหน้า</button>
          <span data-testid="pager-label">
            หน้า {page} / {(view === 'rules' ? rules : hits).pageCount}
          </span>
          <button type="button" disabled={page >= (view === 'rules' ? rules : hits).pageCount}
            onClick={() => navigate({ page: page + 1 })}
            className="rounded border border-[var(--surface-border)] px-2 py-1 disabled:opacity-40">ถัดไป</button>
        </div>
      )}
    </div>
  );
}
