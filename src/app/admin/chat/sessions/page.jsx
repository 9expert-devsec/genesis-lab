import Link from 'next/link';
import { requirePage } from '@/lib/rbac/guard';
import { listPanelSessions, SESSIONS_PAGE_SIZE } from '@/lib/chatPanel/client';
import { readPanelRange, readPage, readVote, readHasError } from '@/lib/chatPanel/range';
import {
  PANEL_MAX_WIDTH, PanelHeading, PanelRangeControl, PanelFailure, PanelLink,
  PlainTable, PanelPager, fmtInt, fmtBangkok,
} from '../_components/panelParts';

export const metadata = { title: 'บทสนทนาแชต AI' };
export const dynamic = 'force-dynamic';

const BASE = '/admin/chat/sessions';
const VOTE_FILTERS = [
  { value: 'any', label: 'ทั้งหมด' },
  { value: 'up', label: '👍 เท่านั้น' },
  { value: 'down', label: '👎 เท่านั้น' },
];

/**
 * /admin/chat/sessions — one row per conversation in the window, newest
 * first as the service orders them, with a link into each transcript.
 *
 * `chat_transcripts`, not `chat_stats`: the first-message preview is text a
 * customer typed. Every filter (window, vote, has_error, page) is read from
 * searchParams on this request and rendered as links — nothing is state.
 * `deps` is the test seam; see /admin/chat/page.jsx.
 */
export default async function Page({ searchParams }, deps = {}) {
  const { fetchSessions = listPanelSessions, now = Date.now } = deps;

  await requirePage('chat_transcripts');
  const sp = (await searchParams) ?? {};
  const at = now();
  const range = readPanelRange(sp, at);
  const page = readPage(sp);
  const vote = readVote(sp);
  const hasError = readHasError(sp);
  const pageSize = SESSIONS_PAGE_SIZE.default;

  const result = await fetchSessions({ from: range.from, to: range.to, page, pageSize, vote, hasError });

  // The other filters, carried by the range control and the pager so choosing
  // one never drops another. `any` and `false` are the defaults and are
  // omitted so a default URL stays short.
  const carry = { vote: vote === 'any' ? '' : vote, has_error: hasError ? '1' : '' };
  const filterHref = (patch) => {
    const q = new URLSearchParams();
    q.set('from', range.from);
    q.set('to', range.to);
    const next = { ...carry, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    return `${BASE}?${q.toString()}`;
  };

  return (
    <div className={PANEL_MAX_WIDTH}>
      <PanelHeading title="บทสนทนาแชต AI" subtitle="บทสนทนาจากแชตบนเว็บไซต์ — เนื้อหาคือสิ่งที่ลูกค้าพิมพ์ โปรดใช้ด้วยความระมัดระวัง">
        <PanelLink href={`/admin/chat?from=${range.from}&to=${range.to}`}>← สถิติ</PanelLink>
      </PanelHeading>

      <PanelRangeControl basePath={BASE} range={range} carry={carry} now={at} />

      <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="session-filters">
        <span className="text-[var(--text-secondary)]">ผลโหวต:</span>
        {VOTE_FILTERS.map((f) => (
          <FilterLink key={f.value} href={filterHref({ vote: f.value === 'any' ? '' : f.value })} active={vote === f.value}>{f.label}</FilterLink>
        ))}
        <span className="ml-3 text-[var(--text-secondary)]">ข้อผิดพลาด:</span>
        <FilterLink href={filterHref({ has_error: '' })} active={!hasError}>ทั้งหมด</FilterLink>
        <FilterLink href={filterHref({ has_error: '1' })} active={hasError}>เฉพาะที่มีข้อผิดพลาด</FilterLink>
      </div>

      {result.ok ? (
        <SessionsTable data={result.data} page={page} pageSize={pageSize} carry={{ from: range.from, to: range.to, ...carry }} />
      ) : (
        <PanelFailure reason={result.reason} />
      )}
    </div>
  );
}

function FilterLink({ href, active, children }) {
  const cls = active
    ? 'rounded-9e-md bg-9e-navy px-2.5 py-1 font-semibold text-9e-ice'
    : 'rounded-9e-md border border-[var(--surface-border)] px-2.5 py-1 font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]';
  return <Link href={href} className={cls} aria-current={active ? 'true' : undefined}>{children}</Link>;
}

function SessionsTable({ data, page, pageSize, carry }) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const total = Number(data?.total) || 0;
  const columns = [
    { key: 'started_at', label: 'เริ่ม', className: 'whitespace-nowrap tabular-nums', render: (r) => fmtBangkok(r.started_at) },
    { key: 'last_message_at', label: 'ข้อความล่าสุด', className: 'whitespace-nowrap tabular-nums', render: (r) => fmtBangkok(r.last_message_at) },
    { key: 'message_count', label: 'ข้อความ', className: 'text-right tabular-nums', render: (r) => fmtInt(r.message_count) },
    { key: 'votes', label: '👍 / 👎', className: 'whitespace-nowrap text-right tabular-nums', render: (r) => `${fmtInt(r.votes_up)} / ${fmtInt(r.votes_down)}` },
    { key: 'error_count', label: 'ผิดพลาด', className: 'text-right tabular-nums', render: (r) => fmtInt(r.error_count) },
    // Text a customer typed — rendered as text. React escapes it; nothing here
    // ever hands a transcript string to dangerouslySetInnerHTML.
    { key: 'first_user_message', label: 'ข้อความแรก', className: 'max-w-md', render: (r) => <span className="line-clamp-2 break-words">{r.first_user_message || '–'}</span> },
    { key: 'page_url', label: 'หน้าที่เปิดแชต', className: 'max-w-xs', render: (r) => (r.page_url ? <a href={r.page_url} className="break-all text-9e-action underline-offset-2 hover:underline" target="_blank" rel="noopener noreferrer">{r.page_url}</a> : '–') },
    { key: 'open', label: '', className: 'whitespace-nowrap', render: (r) => <Link href={`${BASE}/${encodeURIComponent(r.session_id)}`} className="text-9e-action underline-offset-2 hover:underline">เปิด →</Link> },
  ];
  return (
    <PlainTable
      testId="panel-sessions"
      rowKey="session_id"
      columns={columns}
      rows={items}
      empty="ไม่มีบทสนทนาในช่วงนี้"
      footer={<PanelPager basePath={BASE} page={page} pageSize={pageSize} total={total} carry={carry} />}
    />
  );
}
