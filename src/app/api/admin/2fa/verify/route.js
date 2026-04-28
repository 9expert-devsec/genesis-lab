/**
 * /api/admin/2fa/verify
 *
 * Generic OTP verification utility. NOT used by the login flow — the
 * login gate happens inside the credentials provider so no session is
 * granted before OTP is verified. This route is kept for future
 * sensitive-operation step-up flows (e.g., re-confirm before a
 * destructive admin action).
 */

import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';
import { verifyTotp } from '@/lib/totp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { email, token } = body ?? {};
  if (!email || !token) {
    return NextResponse.json(
      { error: 'Missing email or token' },
      { status: 400 }
    );
  }

  await dbConnect();
  const admin = await Admin.findOne({ email })
    .select('+totpSecret totpEnabled')
    .lean();

  if (!admin || !admin.totpEnabled || !admin.totpSecret) {
    return NextResponse.json(
      { error: '2FA not configured' },
      { status: 400 }
    );
  }

  if (!verifyTotp(token, admin.totpSecret)) {
    return NextResponse.json({ error: 'Invalid OTP' }, { status: 401 });
  }

  await Admin.findOneAndUpdate(
    { email },
    { totpVerifiedAt: new Date() }
  );

  return NextResponse.json({ ok: true });
}
