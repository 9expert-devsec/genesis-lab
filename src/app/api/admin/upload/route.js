/**
 * POST /api/admin/upload
 *
 * Cloudinary upload endpoint for admin forms. Wraps `uploadToCloudinary`
 * with size + MIME validation and an auth gate. Used by:
 *   - <ImageUploadField> in CourseForm (folder: "courses/covers")
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
import { checkUpload } from '@/lib/uploads/uploadRules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Allowlist of subfolders the admin UI may write into. Anything else
// either silently lands in the default folder or, for malformed
// values, is rejected. This stops a stray `folder=../../foo` from
// escaping the upload tree.
const ALLOWED_FOLDERS = new Set([
  'courses/covers',
  'courses/galleries',
  'courses/body',
  'promotions',
  'instructors',
  'banners',
  'articles',
  'custom-pages',
  'page-builder',   // PageBuilder image sections (2B editor)
  // Genesis promotion covers (promotion mode, Phase 1). DELIBERATELY a sibling of
  // 'page-builder', NOT under it: the item-5 Cloudinary GC scopes to
  // '<base>/page-builder/', and promotionCover stores a URL with no publicId
  // reference, so a cover inside that scope would look like an orphan. Keeping it
  // out of scope makes "not GC-tracked yet" (option B) also mean "not at risk".
  'promotion-covers',
  // Round 69 — icon_card illustrations. A SIBLING of page-builder for the same
  // reason promotion-covers is: icon_card.imageSrc stores the secure URL and no
  // publicId, so a file inside the item-5 GC scope would look like an orphan.
  'page-builder-icons',
  'notifications',
  'about',
  'career-paths',
  'masterclass',
  // Admin profile photos. LISTING IT HERE IS NOT OPTIONAL POLISH: without the
  // entry the folder falls through to `uploads` below, the request returns 200,
  // and the file lands in the wrong tree — a success that is wrong, which is
  // the worst failure available here. It also carries its own, stricter rules
  // (see uploadRules.js): JPG/PNG/WebP only, no SVG, no PDF, 2 MB.
  'avatars',
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

  // THE FOLDER IS RESOLVED BEFORE VALIDATION, and the order is the point: the
  // rules are per-folder now, so validating first would apply the DEFAULT rule
  // to an avatar and let a 4 MB PDF through on its way to being renamed
  // `uploads`. Resolve, then judge by what it resolved to.
  const folder = ALLOWED_FOLDERS.has(folderRaw) ? folderRaw : 'uploads';

  // The decision lives in @/lib/uploads/uploadRules — a pure table, testable
  // without a request. Unnamed folders get the pre-existing rule unchanged.
  const verdict = checkUpload(folder, file);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error }, { status: 400 });
  }

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
