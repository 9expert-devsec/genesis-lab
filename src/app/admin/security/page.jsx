/**
 * /admin/security — manage 2FA for the logged-in admin.
 *
 * Server shell pulls the current `totpEnabled` flag and hands it to
 * the client (which owns the QR-scan + verify flow, or the disable
 * confirmation flow). Auth gate is the global admin middleware
 * (`matcher: ['/admin/:path*']`).
 */

import { auth } from '@/lib/auth/options';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';
import { SecurityClient } from './_components/SecurityClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'ความปลอดภัย — Admin',
  robots: { index: false, follow: false },
};

export default async function SecurityPage() {
  const session = await auth();
  const email = session?.user?.email;

  let totpEnabled = false;
  let totpVerifiedAt = null;
  if (email) {
    await dbConnect();
    const admin = await Admin.findOne({ email })
      .select('totpEnabled totpVerifiedAt')
      .lean();
    totpEnabled = admin?.totpEnabled ?? false;
    totpVerifiedAt = admin?.totpVerifiedAt
      ? new Date(admin.totpVerifiedAt).toISOString()
      : null;
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          ความปลอดภัย — 2FA
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Two-Factor Authentication ด้วย Google Authenticator / Authy /
          1Password — เพิ่มความปลอดภัยอีกชั้นนอกเหนือจากรหัสผ่าน
        </p>
      </div>

      <SecurityClient
        initiallyEnabled={totpEnabled}
        verifiedAt={totpVerifiedAt}
      />
    </div>
  );
}
