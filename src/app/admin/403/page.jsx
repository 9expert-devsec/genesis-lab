import Link from 'next/link';

export const metadata = {
  title: 'ไม่มีสิทธิ์เข้าถึง',
  robots: { index: false, follow: false },
};

/**
 * Forbidden page — shown by requirePage() (src/lib/rbac/guard.js) when a
 * logged-in admin lacks access to the page they requested. Kept
 * dependency-light so it always renders inside the admin layout.
 */
export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <p className="text-5xl font-bold text-9e-navy dark:text-white">403</p>
        <h1 className="mt-4 text-lg font-bold text-9e-navy dark:text-white">
          ไม่มีสิทธิ์เข้าถึงหน้านี้
        </h1>
        <p className="mt-2 text-sm text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
          บัญชีของคุณไม่ได้รับสิทธิ์ให้เข้าถึงหน้านี้ หากคิดว่าเป็นข้อผิดพลาด
          กรุณาติดต่อผู้ดูแลระบบ
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-9e-action px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-9e-brand dark:bg-9e-lime dark:text-9e-navy dark:hover:bg-9e-lime-dk"
        >
          ← กลับหน้าแดชบอร์ด
        </Link>
      </div>
    </div>
  );
}
