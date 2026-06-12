import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';

export async function GET(req) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  await dbConnect();
  const doc = await RegisterPublic.findById(id).select('status payment.omiseStatus').lean().catch(() => null);
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ status: doc.status, paymentStatus: doc.payment?.omiseStatus ?? null });
}
