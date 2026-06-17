/**
 * GET /api/admin/instructors?ids=id1,id2,id3
 *
 * Returns instructor docs for the given comma-separated ObjectId list.
 * Used by MasterclassDetailClient to hydrate the instructor section.
 * Public read — no auth required (instructor data is non-sensitive).
 */
import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import Instructor from '@/models/Instructor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('ids') ?? '';
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return NextResponse.json([]);

    await dbConnect();
    const docs = await Instructor.find({ _id: { $in: ids }, is_active: true }).lean();
    return NextResponse.json(JSON.parse(JSON.stringify(docs)));
  } catch (err) {
    console.error('[GET /api/admin/instructors]', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
