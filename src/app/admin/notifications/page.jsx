import { getAllNotifications } from '@/lib/actions/site-notifications';
import { NotificationsAdminClient } from './_components/NotificationsAdminClient';

export const metadata = { title: 'Notifications & Popups' };
export const dynamic = 'force-dynamic';

export default async function NotificationsAdminPage() {
  const notifications = await getAllNotifications();
  return <NotificationsAdminClient notifications={notifications} />;
}