import { PublicHeader } from '@/components/layout/PublicHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';

export default function PublicLayout({ children }) {
  return (
    <>
      <PublicHeader />
      <main id="main" className="min-h-[60vh]">{children}</main>
      <PublicFooter />
    </>
  );
}
