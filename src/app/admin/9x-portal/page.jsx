import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { LoginForm } from './_components/LoginForm';

export const metadata = {
  title: 'Admin Login',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="min-h-dvh bg-9e-ice flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center px-6 py-4 bg-white rounded-9e-lg shadow-9e-sm mb-4">
            <Logo variant="white" href={null} priority />
          </div>
          <h1 className="text-xl font-bold text-9e-navy">9Expert Admin</h1>
          <p className="text-sm text-9e-slate mt-1">
            สำหรับเจ้าหน้าที่ 9Expert Training เท่านั้น
          </p>
        </div>

        <div className="bg-white rounded-9e-lg shadow-9e-sm border border-[var(--surface-border)] p-8">
          <LoginForm />
        </div>

        <p className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-9e-slate hover:text-9e-primary transition-colors"
          >
            ← กลับหน้าหลัก
          </Link>
        </p>
      </div>
    </div>
  );
}
