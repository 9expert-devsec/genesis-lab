/**
 * /api/admin/2fa/setup
 *
 * GET  — generate a fresh TOTP secret + QR code for the logged-in
 *        admin. Secret is NOT persisted yet — it's returned to the
 *        client and only saved when the admin proves they scanned it
 *        successfully via POST below.
 * POST — accept { secret, token }; verify the token against the
 *        secret; if valid, persist + flip totpEnabled = true.
 *
 * Auth: NextAuth v5 `auth()` session check (any logged-in admin).
 */

import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { auth } from '@/lib/auth/options';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';
import {
  generateTotpSecret,
  generateTotpUri,
  verifyTotp,
} from '@/lib/totp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await dbConnect();
  const admin = await Admin.findOne({ email: session.user.email })
    .select('_id email')
    .lean();
  if (!admin) {
    return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
  }

  const secret = generateTotpSecret();
  const uri = generateTotpUri(secret, admin.email);
  const qrDataUrl = await QRCode.toDataURL(uri);

  // Secret returned to client — they MUST hand it back via POST with a
  // valid OTP before we trust it.
  return NextResponse.json({ secret, qrDataUrl });
}

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
  const { secret, token } = body ?? {};
  if (!secret || !token) {
    return NextResponse.json(
      { error: 'Missing secret or token' },
      { status: 400 }
    );
  }

  if (!verifyTotp(token, secret)) {
    return NextResponse.json(
      { error: 'OTP ไม่ถูกต้อง กรุณาลองใหม่' },
      { status: 400 }
    );
  }

  await dbConnect();
  await Admin.findOneAndUpdate(
    { email: session.user.email },
    {
      totpSecret: secret,
      totpEnabled: true,
      totpVerifiedAt: new Date(),
    }
  );

  return NextResponse.json({ ok: true, message: 'เปิดใช้ 2FA เรียบร้อย' });
}
