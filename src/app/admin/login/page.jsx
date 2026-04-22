import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: 'เข้าสู่ระบบ',
  robots: { index: false, follow: false },
};

/**
 * Admin login page.
 * Phase 1: visual shell only. Phase 2: wire react-hook-form + Zod
 * + NextAuth `signIn('credentials', ...)` Server Action.
 */
export default function AdminLoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--page-bg)] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>เข้าสู่ระบบผู้ดูแล</CardTitle>
            <CardDescription>
              สำหรับเจ้าหน้าที่ 9Expert Training เท่านั้น
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="rounded-9e-md border border-dashed border-[var(--surface-border)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-secondary)]">
              Login form จะถูกเปิดใช้งานใน <span className="text-9e-brand font-semibold">Phase 2</span>
              {' '}(react-hook-form + Zod + NextAuth credentials).
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm text-9e-brand hover:underline"
            >
              ← กลับหน้าแรก
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
