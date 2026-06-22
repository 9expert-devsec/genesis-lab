import { PublicHeader } from '@/components/layout/PublicHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { ScrollToTopButton } from '@/components/ui/ScrollToTopButton';

export default async function PublicLayout({ children }) {
  // Masterclass-only mode: TopNotificationBar and SitePopup are full-site
  // features — omitted here to avoid noise and unnecessary DB calls.
  return (
    <div className="relative min-h-[100dvh] flex flex-col">
      <PublicHeader />
      <main id="main" className="flex-1">{children}</main>
      <PublicFooter />
      <ScrollToTopButton />
    </div>
  );
}