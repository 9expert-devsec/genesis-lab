import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StaticHeader } from '@/components/layout/StaticHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';

/**
 * Root not-found. Next renders this into EVERY page's RSC tree, not only into
 * 404 responses — so nothing here may fetch. `StaticHeader` (logo + links) is
 * the data-free bar; `PublicFooter` is static imports only. `PublicHeader`
 * (nine Mongo reads + the nav catalogue) must never come back here, and must
 * not be reintroduced through a `(public)/not-found.jsx` either — that doubles
 * the header for every page in the group. See StaticHeader's header comment
 * for the measured cost, and test/fs/notFoundChrome.test.mjs for the guard.
 */
export default function NotFound() {
  return (
    <>
      <StaticHeader />
      <main className="mx-auto max-w-[680px] px-4 py-24 text-center lg:py-32">
        <p className="text-xs font-semibold uppercase tracking-wider text-9e-action">
          404 — Page not found
        </p>
        <h1 className="mt-2 text-4xl font-bold text-[var(--text-primary)] md:text-5xl">
          ไม่พบหน้าที่คุณค้นหา
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base text-[var(--text-secondary)]">
          หน้าที่คุณเข้าถึงอาจถูกย้าย ถูกลบ หรือยังไม่ได้สร้างขึ้น
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild>
            <Link href="/">กลับหน้าแรก</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/training-course">ดูหลักสูตรทั้งหมด</Link>
          </Button>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
