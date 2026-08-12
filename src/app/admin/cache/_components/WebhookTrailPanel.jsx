import { Panel, PanelError } from './Panel';
import { Caveat } from './Caveat';
import {
  classifyRevalidated,
  revalidationCallSummary,
  unknownTypesIn,
} from '@/lib/cache-console/revalidatedEntries';

/**
 * Panel 3 — the webhook revalidation trail.
 *
 * `WebhookLog.revalidated` is a TAGGED UNION with five members, and this panel
 * discriminates on `type` — never on `ok`. Three of the five carry `ok: false`
 * and none of those three is a failed revalidation:
 *
 *   alias-lookup          a database lookup missed (handlers.js:138)
 *   visibility            the incoming row FAILS upstream's own /schedules read
 *                         filter and will never reach a public surface — a FACT
 *   visibility-uncertain  we could not DECIDE whether it will — an OPEN QUESTION
 *
 * WebhookLog.js:31-33 states that definite and possible "must not be read as
 * the same claim", so the two visibility kinds are rendered apart from each
 * other as well as apart from revalidations. A panel that grouped by `ok` would
 * report a perfectly healthy delivery as three failed cache invalidations —
 * wrong about what happened, and wrong in the direction that generates work.
 */

const BADGE = {
  revalidation: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/30 dark:text-sky-300',
  lookup: 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-500/40 dark:bg-orange-950/30 dark:text-orange-300',
  visibility: 'border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-500/40 dark:bg-purple-950/30 dark:text-purple-300',
  uncertain: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-500/40 dark:bg-slate-900/40 dark:text-slate-300',
  unknown: 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300',
};

function EntryChip({ tone, label, target, detail }) {
  return (
    <span
      className={`inline-flex max-w-full items-baseline gap-1.5 rounded-9e-md border px-2 py-0.5 text-xs ${BADGE[tone]}`}
    >
      <span className="font-bold">{label}</span>
      <span className="break-all font-mono">{target}</span>
      {detail && <span className="break-all opacity-80">{detail}</span>}
    </span>
  );
}

function Delivery({ row }) {
  const groups = classifyRevalidated(row.revalidated);
  const calls = revalidationCallSummary(row.revalidated);
  const unknownTypes = unknownTypesIn(row.revalidated);

  return (
    <li className="border-b border-[var(--surface-border)] py-3 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
          {row.event || '(no event)'}
        </span>
        <span className="font-mono text-xs text-[var(--text-muted)]">
          {row.processed_at ? new Date(row.processed_at).toISOString() : '—'}
        </span>
        <span className="font-mono text-xs text-[var(--text-secondary)]">
          delivery status: {row.status}
        </span>
        {row.error && (
          <span className="break-all font-mono text-xs text-red-600 dark:text-red-400">
            {row.error}
          </span>
        )}
      </div>

      {row.revalidated == null ? (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          revalidated: null — handler นี้ไม่ได้คืนรายการอะไรไว้เลย (ไม่ใช่ &quot;ไม่ได้ทำอะไร&quot;)
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {groups.revalidations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {groups.revalidations.map((e, i) => (
                <EntryChip
                  key={`r${i}`}
                  tone="revalidation"
                  label={e.type}
                  target={e.target}
                  detail={e.ok === false ? `เรียกแล้ว throw: ${e.error ?? ''}` : null}
                />
              ))}
            </div>
          )}

          {groups.aliasLookups.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {groups.aliasLookups.map((e, i) => (
                <EntryChip key={`a${i}`} tone="lookup" label="alias-lookup ล้มเหลว" target={e.target} detail={e.error} />
              ))}
            </div>
          )}

          {groups.visibility.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-[var(--text-secondary)]">
                มองไม่เห็นแน่นอน — แถวนี้ตกตัวกรองของ /schedules ที่ต้นทาง จะไม่ขึ้นหน้าสาธารณะ
                (ไม่ใช่การ revalidate ที่ล้มเหลว และไม่ใช่ delivery ที่ล้มเหลว)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {groups.visibility.map((e, i) => (
                  <EntryChip key={`v${i}`} tone="visibility" label={e.target} target={String(e.value ?? '')} detail={e.error} />
                ))}
              </div>
            </div>
          )}

          {groups.visibilityUncertain.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-[var(--text-secondary)]">
                ตัดสินไม่ได้ — <em>อาจ</em> มองไม่เห็น เป็นคำถามที่ยังเปิดอยู่ ไม่ใช่ข้อเท็จจริง
                จึงไม่นับรวมกับกลุ่มด้านบน
              </span>
              <div className="flex flex-wrap gap-1.5">
                {groups.visibilityUncertain.map((e, i) => (
                  <EntryChip key={`u${i}`} tone="uncertain" label={e.target} target={String(e.value ?? '')} detail={e.error} />
                ))}
              </div>
            </div>
          )}

          {groups.unknown.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-red-700 dark:text-red-400">
                type ที่หน้านี้ยังไม่รู้จัก ({unknownTypes.join(', ') || 'ไม่มีชื่อ type'}) —
                แสดงดิบไว้ ไม่ถูกยุบรวมกับกลุ่มอื่น
              </span>
              <div className="flex flex-wrap gap-1.5">
                {groups.unknown.map((e, i) => (
                  <EntryChip key={`k${i}`} tone="unknown" label={String(e?.type ?? 'ไม่มี type')} target={JSON.stringify(e)} />
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-[var(--text-muted)]">
            เรียก revalidate ไป {calls.attempted} ครั้ง, throw {calls.threw} ครั้ง
          </p>
        </div>
      )}
    </li>
  );
}

export function WebhookTrailPanel({ webhooks, limit }) {
  if (!webhooks?.ok) {
    return (
      <Panel title="3. Webhook revalidation trail" subtitle="webhook_logs">
        <PanelError label="webhook_logs" error={webhooks?.error ?? 'unknown'} />
      </Panel>
    );
  }

  const rows = webhooks.data ?? [];

  return (
    <Panel
      title="3. Webhook revalidation trail"
      subtitle={`${limit} รายการล่าสุดจาก webhook_logs (เก็บ 30 วันแล้วหมดอายุอัตโนมัติ)`}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          ยังไม่มี webhook เข้ามาในช่วง 30 วันที่ผ่านมา — หรือยังไม่เคยมีเลย
          ทั้งสองกรณีให้ผลเหมือนกันจากตรงนี้ เพราะ collection นี้หมดอายุตัวเองด้วย TTL
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <Delivery key={row._id} row={row} />
          ))}
        </ul>
      )}

      <Caveat>
        <strong>&quot;เรียกไปกี่ครั้ง&quot; ไม่ใช่ &quot;สำเร็จกี่ครั้ง&quot;</strong> —{' '}
        <code className="font-mono">revalidatePath</code> และ{' '}
        <code className="font-mono">revalidateTag</code> คืนค่า void ทั้งคู่
        แอปจึงบันทึกได้แค่ว่า &quot;เรียกแล้วไม่ throw&quot; ไม่ได้บันทึกว่ามีแคชรายการไหนถูกล้างจริง
        (Both revalidate APIs return void, so `ok: true` means the call did not
        throw — not that any cache entry was cleared. Whether one was is not
        readable from application code.)
      </Caveat>
    </Panel>
  );
}
