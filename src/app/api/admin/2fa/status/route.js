/**
 * /api/admin/2fa/status
 *
 * "Does this admin email have 2FA enabled?" — used by clients that
 * want to render the OTP step preemptively. Note: the actual login
 * flow does NOT depend on this endpoint; the credentials provider
 * gates 2FA itself by throwing a typed error when an OTP is missing.
 *
 * Trade-off: this endpoint allows email enumeration against the admin
 * table (caller can probe whether an email exists + has 2FA). For an
 * admin-only login that's a small attack surface, but be aware.
 */

import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ totpEnabled: false });
  }
  const { email } = body ?? {};
  if (!email) {
    return NextResponse.json({ totpEnabled: false });
  }

  await dbConnect();
  const admin = await Admin.findOne({ email }).select('totpEnabled').lean();
  return NextResponse.json({ totpEnabled: admin?.totpEnabled ?? false });
}
