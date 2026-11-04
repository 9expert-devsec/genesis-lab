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
  const doc = await RegisterPublic.findById(id)
    .select('status payment.omiseStatus payment.method pricing.total')
    .lean()
    .catch(() => null);
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });

  // Purchase data ONLY for a paid registration — the same rule and the same
  // reasoning as the masterclass status route: the holder of a PAID
  // registration's id is its buyer, and seeing their own amount and method is
  // acceptable; a pending or failed one leaks nothing. Read by the 3-D Secure
  // return page, the one public paid path that never sees the charge response.
  const purchase =
    doc.status === 'paid'
      ? { value: doc.pricing?.total ?? null, method: doc.payment?.method ?? null }
      : null;

  return NextResponse.json(
    { status: doc.status, paymentStatus: doc.payment?.omiseStatus ?? null, purchase },
    { headers: NO_STORE }
  );
}
