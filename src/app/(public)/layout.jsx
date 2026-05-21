import { PublicHeader } from '@/components/layout/PublicHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { TopNotificationBar } from '@/components/notifications/TopNotificationBar';
import { SitePopup } from '@/components/notifications/SitePopup';
import { ScrollToTopButton } from '@/components/ui/ScrollToTopButton';
import { getActiveTopBars } from '@/lib/actions/site-notifications';

export default async function PublicLayout({ children }) {
  // Fetched server-side so the bar paints in the SSR HTML — no flash.
  // Cache is busted via `revalidatePath('/')` from the admin actions.
  const bars = await getActiveTopBars().catch(() => []);

  return (
    <>
      <TopNotificationBar bars={bars} />
      <PublicHeader />
      <main id="main" className="min-h-[60vh]">{children}</main>
      <PublicFooter />
      <SitePopup />
      <ScrollToTopButton />
    </>
  );
}