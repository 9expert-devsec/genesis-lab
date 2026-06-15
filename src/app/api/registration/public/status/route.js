import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';

// Force dynamic — never cache this route
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET(req) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400, headers: NO_STORE });
  await dbConnect();
  const doc = await RegisterPublic.findById(id).select('status payment.omiseStatus').lean().catch(() => null);
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  return NextResponse.json(
    { status: doc.status, paymentStatus: doc.payment?.omiseStatus ?? null },
    { headers: NO_STORE }
  );
}
