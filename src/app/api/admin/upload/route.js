/**
 * POST /api/admin/upload
 *
 * Cloudinary upload endpoint for admin forms. Wraps `uploadToCloudinary`
 * with size + MIME validation and an auth gate. Used by:
 *   - <ImageUploadField> in CourseForm (folder: "courses/covers")
 *   - <ImageUploadField> in PromotionModal (folder: "promotions")
 *   - other admin forms as needed
 *
 * Request: multipart/form-data
 *   file:   File   (required, image/*, ≤ 5 MB)
 *   folder: string (optional, allowlisted below)
 *
 * Response:
 *   200 { url, publicId }
 *   400 { error }
 *   401 { error }
 *   500 { error }
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/options';
import { uploadToCloudinary } from '@/lib/cloudinary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Allowlist of subfolders the admin UI may write into. Anything else
// either silently lands in the default folder or, for malformed
// values, is rejected. This stops a stray `folder=../../foo` from
// escaping the upload tree.
const ALLOWED_FOLDERS = new Set([
  'courses/covers',
  'courses/galleries',
  'promotions',
  'instructors',
  'banners',
  'articles',
  'notifications',
  'about',
  'career-paths',
  'uploads',
]);

export async function POST(req) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  const folderRaw = String(formData.get('folder') ?? 'uploads').trim();

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file' }, { status: 400 });
  }

  if (!file.type || !file.type.startsWith('image/')) {
    return NextResponse.json(
      { error: 'Only image files allowed' },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
      { status: 400 }
    );
  }

  const folder = ALLOWED_FOLDERS.has(folderRaw) ? folderRaw : 'uploads';

  try {
    const result = await uploadToCloudinary(file, folder);
    return NextResponse.json({
      url: result?.secure_url ?? '',
      publicId: result?.public_id ?? '',
    });
  } catch (err) {
    console.error('[admin/upload]', err);
    return NextResponse.json(
      { error: err?.message ?? 'Upload failed' },
      { status: 500 }
    );
  }
}
