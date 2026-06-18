/**
 * GET /api/admin/instructors/all
 * Returns all active instructors for admin dropdown selectors.
 */
import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import Instructor from '@/models/Instructor';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await dbConnect();
    const docs = await Instructor.find({ is_active: true })
      .select('name title image_url specialties')
      .sort({ display_order: 1 })
      .lean();
    return NextResponse.json(JSON.parse(JSON.stringify(docs)));
  } catch (err) {
    console.error('[GET /api/admin/instructors/all]', err);
    return NextResponse.json([], { status: 200 });
  }
}
