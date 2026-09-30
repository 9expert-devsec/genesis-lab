import { SkipLink } from '@/components/layout/SkipLink';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { TopNotificationBar } from '@/components/notifications/TopNotificationBar';
import { SitePopup } from '@/components/notifications/SitePopup';
import { getActiveTopBars } from '@/lib/actions/site-notifications';

export default async function PublicLayout({ children }) {
  // Fetched server-side so the bar paints in the SSR HTML — no flash.
  // Cache is busted via `revalidatePath('/')` from the admin actions.
  const bars = await getActiveTopBars().catch(() => []);

  return (
    <div className="relative min-h-[100dvh] flex flex-col">
      {/* FIRST, ahead of the top bar's own link — see SkipLink. */}
      <SkipLink />
      <TopNotificationBar bars={bars} />
      <PublicHeader />
      {/* tabIndex -1 so the skip link moves focus here; the ring is suppressed
          so a keyboard jump does not outline the whole page. */}
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
      >
        {children}
      </main>
      <PublicFooter />
      <SitePopup />
      {/* The floating dock (back-to-top + chat launcher) is NOT mounted here.
          It is mounted once from src/app/layout.jsx — see the note there. */}
    </div>
  );
}