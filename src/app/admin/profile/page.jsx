/**
 * /admin/profile — self-service account page.
 *
 * Open to any logged-in admin. Updates their own display name and
 * password (current-password verification required for the latter).
 * 2FA settings live on /admin/security.
 */

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { auth } from '@/lib/auth/options';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';
import { ProfileClient } from './_components/ProfileClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'โปรไฟล์',
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const session = await auth();
  const email = session?.user?.email;

  let me = null;
  if (email) {
    await dbConnect();
    const doc = await Admin.findOne({ email })
      .select('email name role active totpEnabled lastLoginAt createdAt')
      .lean();
    me = doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">โปรไฟล์</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          ข้อมูลบัญชีและการตั้งค่าส่วนตัว
        </p>
      </div>

      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-5">
        <dl className="grid grid-cols-3 gap-y-3 text-sm">
          <dt className="text-[var(--text-muted)]">อีเมล</dt>
          <dd className="col-span-2 text-[var(--text-primary)]">{me?.email ?? '—'}</dd>
          <dt className="text-[var(--text-muted)]">Role</dt>
          <dd className="col-span-2 text-[var(--text-primary)]">{me?.role ?? '—'}</dd>
          <dt className="text-[var(--text-muted)]">สถานะ</dt>
          <dd className="col-span-2 text-[var(--text-primary)]">
            {me?.active ? 'ใช้งาน' : 'ปิดใช้'}
          </dd>
          <dt className="text-[var(--text-muted)]">2FA</dt>
          <dd className="col-span-2 text-[var(--text-primary)]">
            {me?.totpEnabled ? 'เปิดใช้งาน' : 'ปิด'}
          </dd>
        </dl>
      </div>

      <ProfileClient initialName={me?.name ?? ''} />

      <Link
        href="/admin/security"
        className="inline-flex w-fit items-center gap-2 rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
      >
        <ShieldCheck className="h-4 w-4" />
        ตั้งค่า 2FA →
      </Link>
    </div>
  );
}
