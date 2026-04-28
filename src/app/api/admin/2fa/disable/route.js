/**
 * /api/admin/2fa/disable
 *
 * Disable 2FA for the logged-in admin. Requires a current valid OTP
 * to confirm — protects against attackers with a stolen session
 * cookie unilaterally turning off 2FA.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/options';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';
import { verifyTotp } from '@/lib/totp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { token } = body ?? {};
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  await dbConnect();
  const admin = await Admin.findOne({ email: session.user.email })
    .select('+totpSecret totpEnabled')
    .lean();

  if (!admin?.totpEnabled) {
    return NextResponse.json({ error: '2FA not enabled' }, { status: 400 });
  }

  if (!verifyTotp(token, admin.totpSecret)) {
    return NextResponse.json({ error: 'Invalid OTP' }, { status: 401 });
  }

  await Admin.findOneAndUpdate(
    { email: session.user.email },
    {
      totpSecret: null,
      totpEnabled: false,
      totpVerifiedAt: null,
    }
  );

  return NextResponse.json({ ok: true, message: 'ปิดใช้ 2FA เรียบร้อย' });
}
