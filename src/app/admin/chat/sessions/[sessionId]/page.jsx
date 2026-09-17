import { requirePage } from '@/lib/rbac/guard';
import { getPanelSession } from '@/lib/chatPanel/client';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { courseHref, careerPathHref } from '@/lib/utils';
import {
  PANEL_MAX_WIDTH, PanelHeading, PanelFailure, PanelNote, PanelLink, fmtBangkok,
} from '../../_components/panelParts';

export const metadata = { title: 'บทสนทนาแชต AI' };
export const dynamic = 'force-dynamic';

const LIST = '/admin/chat/sessions';

/**
 * /admin/chat/sessions/[sessionId] — one transcript, in order.
 *
 * ── THE ONE READ THE AUDIT TRAIL RECORDS ────────────────────────────────────
 * A `view` row is written when — and only when — this page has a transcript
 * to show: after `requirePage('chat_transcripts')` passed AND the service
 * answered 200. Not on the list, not on a 404, not on a timeout: a row that
 * said "viewed X" for a screen that showed an error would be the trail
 * lying, and the trail's value is that it does not. The write goes through
 * `recordAdminActionAfter` (next/server `after`), so it never delays the
 * response and never fails it. The pair `chat_transcripts|transcript` is
 * `act_only` in the contract: the session id, the actor and the time —
 * no message text is copied anywhere by the act of reading it.
 *
 * ── TEXT IS TEXT ────────────────────────────────────────────────────────────
 * Every string from the service is rendered as a React text node inside a
 * `whitespace-pre-wrap` block, which preserves the line breaks the customer
 * typed and escapes everything else. Nothing here uses
 * dangerouslySetInnerHTML; test/render/chatPanelPages proves `<b>` in a
 * message arrives on the page as the four characters, not as bold.
 *
 * `deps` is the test seam (fixture reader, fixture writer, fixed clock);
 * production passes nothing. See /admin/chat/page.jsx.
 */
export default async function Page({ params }, deps = {}) {
  const { fetchSession = getPanelSession, recordView = recordAdminActionAfter } = deps;

  const session = await requirePage('chat_transcripts');
  const { sessionId: rawId } = (await params) ?? {};
  const sessionId = String(rawId ?? '');

  const result = await fetchSession(sessionId);

  if (result.ok) {
    recordView({
      menu: 'chat_transcripts',
      entity: 'transcript',
      action: 'view',
      recordId: sessionId,
      recordLabel: result.data?.started_at ? `เริ่ม ${fmtBangkok(result.data.started_at)}` : '',
      actor: { id: session?.user?.id, name: session?.user?.name },
    });
  }

  return (
    <div className={PANEL_MAX_WIDTH}>
      <PanelHeading title="บทสนทนาแชต AI" subtitle={<span className="font-mono text-xs">{sessionId}</span>}>
        <PanelLink href={LIST}>← รายการบทสนทนา</PanelLink>
      </PanelHeading>

      {result.ok ? <Transcript data={result.data} /> : <PanelFailure reason={result.reason} />}
    </div>
  );
}

function Transcript({ data }) {
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  return (
    <div className="space-y-4" data-testid="transcript">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="transcript-meta">
        <Meta label="เริ่ม">{fmtBangkok(data?.started_at)}</Meta>
        <Meta label="ข้อความล่าสุด">{fmtBangkok(data?.last_message_at)}</Meta>
        <Meta label="จำนวนข้อความ">{messages.length}</Meta>
      </dl>

      {data?.truncated ? (
        <PanelNote testId="transcript-truncated">
          บทสนทนานี้ยาวเกินกว่าที่บริการส่งมาได้ทั้งหมด — แสดงเฉพาะส่วนที่ได้รับ
        </PanelNote>
      ) : null}

      <ol className="space-y-3" data-testid="transcript-messages">
        {messages.length === 0 ? (
          <li className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">ไม่มีข้อความ</li>
        ) : messages.map((m, i) => <Message key={i} m={m} />)}
      </ol>
    </div>
  );
}

function Meta({ label, children }) {
  return (
    <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] px-4 py-3">
      <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

const ROLE_LABEL = { user: 'ผู้ใช้', assistant: 'ผู้ช่วย', system: 'ระบบ' };

function Message({ m }) {
  const role = m?.role === 'assistant' || m?.role === 'system' ? m.role : 'user';
  const isAssistant = role === 'assistant';
  const cards = isAssistant && m?.cards && typeof m.cards === 'object' ? m.cards : null;
  const vote = isAssistant && m?.vote && typeof m.vote === 'object' && (m.vote.value === 'up' || m.vote.value === 'down') ? m.vote : null;
  return (
    <li
      data-role={role}
      data-error={m?.is_error === true ? 'true' : undefined}
      className={`rounded-9e-lg border px-4 py-3 ${
        isAssistant
          ? 'border-[var(--surface-border)] bg-[var(--surface)]'
          : 'border-9e-brand/30 bg-9e-brand/5'
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
        <span className="font-semibold text-[var(--text-primary)]">{ROLE_LABEL[role]}</span>
        <span className="tabular-nums">{fmtBangkok(m?.created_at)}</span>
        {isAssistant && m?.intent ? <span data-testid="msg-intent">intent: {String(m.intent)}</span> : null}
        {isAssistant && m?.is_error === true ? <span data-testid="msg-error" className="font-semibold text-red-600 dark:text-red-400">ข้อผิดพลาด</span> : null}
        {vote ? (
          <span data-testid="msg-vote">
            {vote.value === 'up' ? '👍 ถูกใจ' : '👎 ไม่ถูกใจ'}
            {vote.reason ? ` — ${String(vote.reason)}` : ''}
          </span>
        ) : null}
        {!isAssistant && m?.page_url ? (
          <a href={String(m.page_url)} className="break-all text-9e-action underline-offset-2 hover:underline" target="_blank" rel="noopener noreferrer">{String(m.page_url)}</a>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm text-[var(--text-primary)]" data-testid="msg-text">{String(m?.text ?? '')}</p>
      {cards ? <CardLinks cards={cards} /> : null}
    </li>
  );
}

/**
 * The cards the assistant showed, as plain links — ids/slugs only, exactly
 * what the service sends. Same href rules as the trends tables.
 */
function CardLinks({ cards }) {
  const list = (k) => (Array.isArray(cards[k]) ? cards[k].map(String).filter(Boolean) : []);
  const groups = [
    { key: 'courses', label: 'หลักสูตร', items: list('courses').map((id) => ({ id, href: courseHref(id.toLowerCase()) })) },
    { key: 'masterclasses', label: 'Masterclass', items: list('masterclasses').map((slug) => ({ id: slug, href: `/masterclass/${slug}` })) },
    { key: 'career_paths', label: 'Career Path', items: list('career_paths').map((slug) => ({ id: slug, href: careerPathHref(slug) })) },
  ].filter((g) => g.items.length > 0);
  if (groups.length === 0) return null;
  return (
    <dl className="mt-2 space-y-1 text-xs" data-testid="msg-cards">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-wrap gap-x-2" data-card-group={g.key}>
          <dt className="text-[var(--text-secondary)]">{g.label}:</dt>
          {g.items.map((it) => (
            <dd key={it.id}><a href={it.href} className="text-9e-action underline-offset-2 hover:underline" target="_blank" rel="noopener noreferrer">{it.id}</a></dd>
          ))}
        </div>
      ))}
    </dl>
  );
}
