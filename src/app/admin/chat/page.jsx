import { requirePage } from '@/lib/rbac/guard';
import { canAccess } from '@/lib/rbac/access';
import { getPanelSummary, getPanelTrends, TRENDS_LIMIT } from '@/lib/chatPanel/client';
import { readPanelRange } from '@/lib/chatPanel/range';
import { careerPathHref } from '@/lib/utils';
import { courseLinkHref } from '@/lib/courses/courseLinkHref';
import {
  PANEL_MAX_WIDTH, PanelHeading, PanelRangeControl, PanelFailure, PanelLink,
  TotalsRow, PlainTable, RankedTable, fmtInt,
} from './_components/panelParts';

export const metadata = { title: 'สถิติแชต AI' };
// Never cached: every number here is a live read from the chatbot service.
export const dynamic = 'force-dynamic';

const BASE = '/admin/chat';

/**
 * /admin/chat — thumbs, daily counts and the ranked lists, for one window.
 *
 * `deps` is the test seam (the corpus routes' `handleGet(req, deps)` shape):
 * production passes nothing — the RSC renderer calls a page as
 * `Component(props, undefined)` — and the real client runs. A test hands in
 * fixture readers and a fixed clock so the page's own wiring is what is
 * rendered, with no env and no network.
 *
 * The guard runs FIRST and the range is read from searchParams on every
 * request — never copied into state. A non-superadmin without
 * `chat_transcripts` sees no link to the sessions list; the list page guards
 * itself regardless, so the link is a courtesy and not the enforcement.
 */
export default async function Page({ searchParams }, deps = {}) {
  const { fetchSummary = getPanelSummary, fetchTrends = getPanelTrends, now = Date.now } = deps;

  const session = await requirePage('chat_stats');
  const sp = (await searchParams) ?? {};
  const at = now();
  const range = readPanelRange(sp, at);
  const canSeeTranscripts = canAccess(session?.user, 'chat_transcripts');

  const [summary, trends] = await Promise.all([
    fetchSummary({ from: range.from, to: range.to }),
    fetchTrends({ from: range.from, to: range.to, limit: TRENDS_LIMIT.default }),
  ]);

  return (
    <div className={PANEL_MAX_WIDTH}>
      <PanelHeading title="สถิติแชต AI" subtitle="ผลตอบรับและแนวโน้มการค้นหาจากแชตบนเว็บไซต์ — อ่านจากบริการแชตโดยตรง">
        {canSeeTranscripts ? (
          <PanelLink href={`${BASE}/sessions?from=${range.from}&to=${range.to}`}>ดูบทสนทนา →</PanelLink>
        ) : null}
      </PanelHeading>

      <PanelRangeControl basePath={BASE} range={range} now={at} />

      {summary.ok ? <SummaryBlock data={summary.data} /> : <PanelFailure reason={summary.reason} />}
      {trends.ok ? <TrendsBlock data={trends.data} /> : <PanelFailure reason={trends.reason} />}
    </div>
  );
}

function SummaryBlock({ data }) {
  const t = data?.totals ?? {};
  const totals = [
    { key: 'sessions', label: 'บทสนทนา', value: t.sessions },
    { key: 'user_messages', label: 'ข้อความจากผู้ใช้', value: t.user_messages },
    { key: 'assistant_messages', label: 'ข้อความตอบกลับ', value: t.assistant_messages },
    { key: 'error_messages', label: 'ข้อความผิดพลาด', value: t.error_messages },
    { key: 'votes_up', label: '👍 ถูกใจ', value: t.votes_up },
    { key: 'votes_down', label: '👎 ไม่ถูกใจ', value: t.votes_down },
  ];
  const daily = Array.isArray(data?.daily) ? data.daily : [];
  const num = (k) => ({ key: k, className: 'text-right tabular-nums', render: (r) => fmtInt(r[k]) });
  return (
    <>
      <TotalsRow items={totals} />
      <PlainTable
        title="รายวัน"
        testId="panel-daily"
        rowKey="date"
        columns={[
          { key: 'date', label: 'วันที่', className: 'tabular-nums' },
          { ...num('sessions'), label: 'บทสนทนา' },
          { ...num('assistant_messages'), label: 'ข้อความตอบกลับ' },
          { ...num('error_messages'), label: 'ผิดพลาด' },
          { ...num('votes_up'), label: '👍' },
          { ...num('votes_down'), label: '👎' },
        ]}
        rows={daily}
      />
    </>
  );
}

/**
 * Course ids link through `courseLinkHref({ course_id })` — THE function every
 * internal course link goes through (test/fs/courseHrefCensus forbids the
 * string-only `courseHref`). With no alias attached it yields the derived
 * `/<id>-training-course` path, which resolveCourse serves for every current
 * id regardless of casing (getCourseByCodeInsensitive; survey §E3); the day a
 * row carries `urlAlias`, the same call emits the alias. Masterclass and
 * career-path slugs link the way the corpus cards do. Queries and intents are
 * text.
 */
function TrendsBlock({ data }) {
  const list = (k) => (Array.isArray(data?.[k]) ? data[k] : []);
  const courses = list('courses').map((r) => ({ label: String(r.id ?? ''), count: r.count, href: r.id ? courseLinkHref({ course_id: String(r.id) }) : null }));
  const masterclasses = list('masterclasses').map((r) => ({ label: String(r.slug ?? ''), count: r.count, href: r.slug ? `/masterclass/${r.slug}` : null }));
  const careerPaths = list('career_paths').map((r) => ({ label: String(r.slug ?? ''), count: r.count, href: r.slug ? careerPathHref(String(r.slug)) : null }));
  const queries = list('search_queries').map((r) => ({ label: String(r.query ?? ''), count: r.count }));
  const intents = list('intents').map((r) => ({ label: String(r.intent ?? ''), count: r.count }));
  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="panel-trends">
      <RankedTable title="หลักสูตรที่ถูกถามถึง" items={courses} testId="trend-courses" labelHeading="รหัสหลักสูตร" />
      <RankedTable title="Masterclass ที่ถูกถามถึง" items={masterclasses} testId="trend-masterclasses" labelHeading="slug" />
      <RankedTable title="Career Path ที่ถูกถามถึง" items={careerPaths} testId="trend-career-paths" labelHeading="slug" />
      <RankedTable title="คำค้นยอดนิยม" items={queries} testId="trend-queries" labelHeading="คำค้น" />
      <RankedTable title="ประเภทคำถาม (intent)" items={intents} testId="trend-intents" labelHeading="intent" />
    </div>
  );
}
