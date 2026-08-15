import { Panel, Field } from './Panel';
import { Caveat } from './Caveat';

/**
 * Panel 5 — in-process caches. Currently one: the /search corpus.
 *
 * ── WHY THIS PANEL SHOWS A CONFIGURATION AND NOT A STATE ────────────────────
 * `searchCorpus.js:183-185` keeps `cached` / `cachedAt` / `pending` at MODULE
 * scope, so each serverless instance holds its own copy. A console rendered by
 * instance A can only ever see instance A's copy, and there is no way from
 * application code to enumerate or reach the others.
 *
 * That makes "how old is the search corpus" unanswerable for the system, only
 * for whichever instance happened to serve this page render. Rendering the
 * local `cachedAt` as if it were the answer would be worse than showing
 * nothing: it would look authoritative and be true of one instance out of an
 * unknown number, and an admin who saw "fresh" would stop looking.
 *
 * So this panel shows the TTL — a constant, true everywhere — and states the
 * per-instance limitation in words. The TTL is passed in from the page, which
 * imports `SEARCH_CORPUS_TTL_MS` from the corpus module so there is one
 * definition rather than a copy that drifts.
 *
 * What is deliberately NOT done is calling `getSearchCorpus()` or reading
 * `cachedAt`. Importing the module is inert — its side effects are three `let`
 * declarations — but CALLING the builder would populate the corpus in whichever
 * instance rendered the admin page, so the act of measuring would create the
 * thing being measured, in an instance that had no other reason to hold it.
 */
export function InProcessPanel({ ttlMs }) {
  const minutes = Math.round(ttlMs / 60000);

  return (
    <Panel
      title="5. In-process caches"
      subtitle="แคชที่อยู่ในหน่วยความจำของแต่ละ instance ไม่ได้อยู่ใน Mongo"
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="แคช" value="/search corpus" mono />
        <Field label="TTL" value={`${minutes} นาที (${ttlMs} ms)`} mono />
        <Field label="ขอบเขต" value="ต่อ 1 process" mono />
      </div>

      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        คอร์ปัสถูกสร้างครั้งแรกที่มีการค้นหาหลัง process เริ่มทำงาน แล้วใช้ซ้ำจนครบ TTL
        ค่า TTL ด้านบนเป็นค่าคงที่ในโค้ด จึงจริงกับทุก instance —
        ต่างจาก &quot;สร้างเมื่อไร&quot; ซึ่งเป็นของแต่ละ instance และหน้านี้ไม่แสดง
      </p>

      <Caveat>
        แคชนี้อยู่ในหน่วยความจำของแต่ละ instance —{' '}
        <strong>สิ่งที่หน้านี้จะบอกได้อย่างมากคือของ instance ที่ render หน้านี้เท่านั้น</strong>{' '}
        ไม่มีทางอ่านหรือสั่งล้างของ instance อื่นจากโค้ดแอปได้เลย
        ด้วยเหตุนี้หน้านี้จึงแสดงเฉพาะค่า TTL ที่เป็นค่าคงที่ ไม่แสดงเวลาที่สร้างคอร์ปัส
        (Per-process, in-memory. Anything this page could show would be true of
        the single instance that rendered it and of no other, so it shows the
        constant TTL and not the build time.)
      </Caveat>
    </Panel>
  );
}
