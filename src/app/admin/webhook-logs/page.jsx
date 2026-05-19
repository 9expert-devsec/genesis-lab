import { getWebhookLogs } from '@/lib/actions/webhook-logs';
import { WebhookLogsClient } from './_components/WebhookLogsClient';

export const metadata = {
  title: 'Webhook Logs',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function WebhookLogsPage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const page   = Number(sp.page)   || 1;
  const event  = String(sp.event  ?? '');
  const status = String(sp.status ?? '');

  const data = await getWebhookLogs({ page, event, status });

  return (
    <WebhookLogsClient
      initialLogs={data.logs}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      eventFilter={event}
      statusFilter={status}
    />
  );
}
