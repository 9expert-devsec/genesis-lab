/**
 * /admin/cache — read-only cache console.
 *
 * Built against docs/cache-console-inventory.md, whose §E truth table is
 * binding on this screen:
 *
 *   READABLE       real current state, queryable at request time — rendered.
 *   INFERRED       only a proxy exists — rendered WITH its limitation in the
 *                  UI text, not in a comment and not in a tooltip.
 *   NOT OBSERVABLE cannot be read from application code — ABSENT. Not greyed
 *                  out, not "unknown", not a dash. Absent.
 *
 * The third rule is the one that shapes the page. There is no "cache health"
 * summary, no per-route freshness indicator, no "last revalidated" column, and
 * no upstream status light, because every one of those would be a claim about
 * Next's Data Cache or Vercel's ISR entry state — both write-only from
 * application code, since `revalidatePath` and `revalidateTag` return void.
 * Where their absence would leave a panel looking empty, the panel says in
 * words why there is nothing to show.
 *
 * READ-ONLY, with one exception that is not new: the "Sync now" button ported
 * unchanged from /admin/landing-cache. Every other write action — clear, reset,
 * delete, re-sync the others — is round 3.
 *
 * `force-dynamic` because this page is opened to answer "what is true right
 * now"; a cached cache console is a contradiction.
 */

import { requirePage } from '@/lib/rbac/guard';
import { readCacheConsoleState } from '@/lib/cache-console/readCacheState';
import { SEARCH_CORPUS_TTL_MS } from '@/lib/search/searchCorpus';
import { MIRROR_TARGETS } from '@/lib/cache-console/resetTargets';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { SnapshotPanel } from './_components/SnapshotPanel';
import { MirrorPanel } from './_components/MirrorPanel';
import { WebhookTrailPanel } from './_components/WebhookTrailPanel';
import { RouteWindowPanel } from './_components/RouteWindowPanel';
import { InProcessPanel } from './_components/InProcessPanel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Cache Console — Admin',
  robots: { index: false, follow: false },
};

export default async function CacheConsolePage() {
  // Same permission key the landing-cache page used. Deliberately NOT a new
  // key: `Role.pages` stores these strings in Mongo, so minting `cache` would
  // silently remove this screen from every role that had been granted
  // `landing_cache` until someone re-granted it by hand. The key outlives its
  // original name; the label and href are what moved.
  await requirePage('landing_cache');

  const state = await readCacheConsoleState({ webhookLimit: 15 });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Cache Console</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          อ่านอย่างเดียว — หน้านี้ยังไม่มีปุ่มล้างหรือรีเซ็ตแคช ยกเว้นปุ่ม Sync
          หน้า Home ที่ย้ายมาจาก /admin/landing-cache ตามเดิม
        </p>
        {/*
          The scope note is part of the deliverable, not framing. An admin who
          does not know what this screen CANNOT see will read its silence as
          good news — which is the specific failure the inventory was written
          to prevent.
        */}
        <p className="mt-3 max-w-3xl rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">สิ่งที่หน้านี้บอกไม่ได้ —</strong>{' '}
          หน้านี้อ่าน &quot;มีการเขียนอะไรไปเมื่อไร&quot; และ &quot;การเขียนนั้นรายงานอะไร&quot; เท่านั้น
          มันบอกไม่ได้ว่าหน้าเว็บที่ผู้ใช้เห็นอยู่ตอนนี้เป็นข้อมูลล่าสุดหรือยัง
          เพราะสถานะแคชของ Next (Data Cache) และของ Vercel (ISR)
          อ่านจากโค้ดแอปไม่ได้เลย — ทั้งสอง API สั่งล้างได้อย่างเดียว
          และคืนค่า <code className="font-mono">void</code> ไม่มีอะไรกลับมาให้อ่าน
          ด้วยเหตุนี้จึงไม่มีไฟเขียว/ไฟแดงรวม และไม่มีคอลัมน์ &quot;สดหรือไม่&quot; ที่ไหนในหน้านี้
        </p>
      </header>

      {/*
        RecordHistory is an ASYNC server component; the panels are deliberately
        SYNCHRONOUS so the render tier can drive them with renderToStaticMarkup,
        which cannot await a child. So it is mounted HERE, where the page is
        already async, and handed down as a ready-made element. The panels place
        it and know nothing about it — in a render test the prop is absent and
        nothing renders, which is why the existing panel assertions still hold.

        `menu` and `entity` are LITERALS written into this mount point, never
        derived from a URL or from client state, per the widget's own contract.
        The widget re-checks canAccess against the session regardless.
      */}
      <SnapshotPanel
        snapshots={state.snapshots}
        history={
          <RecordHistory
            menu="landing_cache"
            entity="snapshot"
            recordId="homepage_v1"
            title="ประวัติการ override สแนปช็อตหน้าแรก"
          />
        }
      />
      {/*
        Only the three serialisable fields cross to the client. The registry
        entries also carry a model loader and an upstream fetcher, which are
        functions and must not be handed to a client component — and should not
        be, on principle: the client names a target, the server decides what
        that target means.
      */}
      <MirrorPanel
        mirrors={state.mirrors}
        resetTargets={MIRROR_TARGETS.map((t) => ({
          key: t.key, label: t.label, idField: t.idField,
        }))}
        history={
          /*
            All four mirror keys in ONE panel. `recordId` accepts an array —
            the shape `courses` uses for its two key spaces — so one mount
            covers every collection, rather than four panels an admin has to
            scan separately to answer "has anyone purged anything lately".
          */
          <RecordHistory
            menu="landing_cache"
            entity="mirror"
            recordId={MIRROR_TARGETS.map((t) => t.key)}
            title="ประวัติการล้างแถวของทุก collection"
          />
        }
      />
      <WebhookTrailPanel webhooks={state.webhooks} limit={state.webhookLimit} />
      <RouteWindowPanel />
      <InProcessPanel ttlMs={SEARCH_CORPUS_TTL_MS} />
    </div>
  );
}
