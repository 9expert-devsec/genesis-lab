/**
 * Next.js 15 forbidden boundary for /admin/*.
 * Rendered when a server component calls forbidden() from 'next/navigation'.
 */
export default function AdminForbidden() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <span className="text-3xl">🔒</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">403 — ไม่มีสิทธิ์เข้าถึง</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          คุณไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณาติดต่อผู้ดูแลระบบ
        </p>
      </div>
      <a
        href="/admin"
        className="mt-2 rounded-full bg-9e-action px-6 py-2.5 text-sm font-semibold text-white hover:bg-9e-brand"
      >
        กลับหน้าแดชบอร์ด
      </a>
    </div>
  );
}
