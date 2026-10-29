'use server';

/**
 * Server actions for Instructor CRUD.
 *
 * Dual-write semantics:
 *   - Push the record to MSDB (master) so other consumers see it.
 *   - Mirror into local Instructor collection (read path for the
 *     /about-us page + admin list).
 * Cloudinary uploads happen first; the resulting URL is what we
 * forward to MSDB.
 *
 * Field mapping (curl-verified against MSDB):
 *   name             ↔ name
 *   name_en          ↔ name_en
 *   bio              ↔ bio
 *   photo_url        ↔ photo_url        (Genesis local: image_url)
 *   photo_public_id  ↔ photo_public_id  (Genesis local: image_public_id)
 *   programs[]       ↔ programs[]
 * `specialties[]` lives only in Genesis Mongo — MSDB has no such
 * field, so we never send it upstream. Same for the card photo crop
 * (`photo_scale`, `photo_offset_y`, `photo_offset_x`).
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Instructor from '@/models/Instructor';
import { requireAdmin } from '@/lib/actions/auth';
import { msdbCreate, msdbUpdate, msdbDelete } from '@/lib/api/msdb-write';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';
import { listInstructors } from '@/lib/api/instructors';
import { listPrograms } from '@/lib/api/programs';
import {
  PROGRAMS_PRESENT_KEY,
  initialProgramIds,
  toProgramOptions,
  resolveSubmittedPrograms,
} from '@/lib/instructors/instructorPrograms';
import { normalizeSpecialties } from '@/lib/instructors/instructorSpecialties';
import { parsePhotoCrop } from '@/lib/instructors/photoCrop';

const ADMIN_PATH = '/admin/instructors';
// The About page renders the instructor cards (and their program icons).
const ABOUT_PATH = '/about-us';

function serialize(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function toStr(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}
function toBool(v) {
  if (typeof v === 'boolean') return v;
  return v === 'on' || v === 'true' || v === '1';
}
function toStrArr(v) {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  if (typeof v === 'string' && v.length > 0) {
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Read the form fields and optionally upload an image file.
 *
 * Returns:
 *   - msdb:   payload to POST/PUT upstream (no `specialties`,
 *             photo fields named `photo_url` / `photo_public_id`)
 *   - local:  data to mirror into the Mongo Instructor row, which
 *             KEEPS `specialties` and uses Genesis's `image_*` naming
 *   - cloudinary: metadata for the new asset if a file was uploaded
 *                 (so the caller can delete the old asset)
 */
/**
 * The programs list to save — see src/lib/instructors/instructorPrograms.js.
 * With the form's marker: the submitted ids, validated against the upstream
 * /programs list. Without it: the value already stored, read from MSDB for a
 * linked instructor (the local mirror is not synced for this field), so a
 * save that does not carry the picker can never send `programs: []`.
 */
async function resolveProgramsForSave(formData, current) {
  const present = formData.get(PROGRAMS_PRESENT_KEY) === '1';

  let stored = toStrArr(current?.programs);
  if (!present && current?.instructor_id) {
    try {
      const { items } = await listInstructors();
      const upstream = (items ?? []).find((u) => String(u?._id) === String(current.instructor_id));
      if (!upstream) throw new Error('not found upstream');
      stored = initialProgramIds({ local: current, upstream });
    } catch (err) {
      return { ok: false, error: `อ่านโปรแกรมของวิทยากรจาก MSDB ไม่สำเร็จ: ${err?.message ?? 'unknown'}` };
    }
  }

  let validIds = null;
  if (present) {
    try {
      const { items } = await listPrograms();
      validIds = new Set(toProgramOptions(items).map((p) => p.id));
    } catch {
      validIds = null;
    }
  }

  return resolveSubmittedPrograms({
    present,
    submitted: formData.getAll('programs'),
    current: stored,
    validIds,
  });
}

async function readFormAndUpload(formData, current) {
  const get = (k) => formData.get(k);
  const getAll = (k) => formData.getAll(k);

  const name        = toStr(get('name'));
  const name_en     = toStr(get('name_en'));
  const title       = toStr(get('title'));
  const bio         = toStr(get('bio'));
  const specialtiesResult = normalizeSpecialties(toStrArr(getAll('specialties')));
  if (!specialtiesResult.ok) return { error: specialtiesResult.error };
  const { specialties } = specialtiesResult;
  const is_active   = toBool(get('is_active'));

  const programsResult = await resolveProgramsForSave(formData, current);
  if (!programsResult.ok) return { error: programsResult.error };
  const { programs } = programsResult;

  // Card photo crop: validated, empty → null (the default). A submission that
  // does not carry the fields keeps what is stored.
  const cropResult = parsePhotoCrop({
    photo_scale:    formData.has('photo_scale') ? get('photo_scale') : current?.photo_scale,
    photo_offset_y: formData.has('photo_offset_y') ? get('photo_offset_y') : current?.photo_offset_y,
    photo_offset_x: formData.has('photo_offset_x') ? get('photo_offset_x') : current?.photo_offset_x,
  });
  if (!cropResult.ok) return { error: cropResult.error };
  const { photo_scale, photo_offset_y, photo_offset_x } = cropResult.value;

  // Handle the image: either a fresh file upload (Cloudinary) or a
  // URL/existing value to keep.
  let photo_url       = '';
  let photo_public_id = '';
  let cloudinary      = null;

  const file = get('image');
  if (file && typeof file === 'object' && file.size > 0) {
    const result = await uploadToCloudinary(file, 'instructors');
    photo_url       = result?.secure_url ?? '';
    photo_public_id = result?.public_id  ?? '';
    cloudinary      = result;
    if (current?.image_public_id) {
      deleteFromCloudinary(current.image_public_id).catch(() => {});
    }
  } else {
    // Allow callers to pass either MSDB-style (`photo_url`) or
    // Genesis-style (`image_url`) names.
    photo_url =
      toStr(get('photo_url')) ||
      toStr(get('image_url')) ||
      current?.image_url ||
      '';
    photo_public_id =
      toStr(get('photo_public_id')) ||
      toStr(get('image_public_id')) ||
      current?.image_public_id ||
      '';
  }

  const msdb = {
    name,
    name_en,
    bio,
    photo_url,
    photo_public_id,
    programs,
  };

  const local = {
    name,
    name_en,
    title,
    bio,
    image_url:       photo_url,
    image_public_id: photo_public_id,
    specialties,
    programs,
    is_active,
    photo_scale,
    photo_offset_y,
    photo_offset_x,
  };

  return { msdb, local, cloudinary };
}

export async function createInstructor(formData) {
  await requireAdmin('instructors');
  await dbConnect();

  const form = await readFormAndUpload(formData, null);
  if (form.error) return { ok: false, error: form.error };
  const { msdb, local } = form;
  if (!msdb.name) return { ok: false, error: 'กรุณากรอกชื่อวิทยากร' };

  let upstreamId = '';
  try {
    const { item } = await msdbCreate('instructors', msdb);
    upstreamId = String(item?._id ?? '');
  } catch (err) {
    return { ok: false, error: `บันทึก MSDB ไม่สำเร็จ: ${err?.message ?? 'unknown'}` };
  }

  try {
    await Instructor.findOneAndUpdate(
      upstreamId ? { instructor_id: upstreamId } : { name: msdb.name },
      {
        $set: {
          ...local,
          instructor_id: upstreamId,
          synced_at:     new Date(),
        },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    return { ok: false, error: `บันทึก local ไม่สำเร็จ: ${err?.message ?? 'unknown'}` };
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(ABOUT_PATH);
  return { ok: true, id: upstreamId };
}

export async function updateInstructor(localId, formData) {
  await requireAdmin('instructors');
  await dbConnect();
  if (!localId) return { ok: false, error: 'Missing instructor id' };

  const current = await Instructor.findById(localId).lean();
  if (!current) return { ok: false, error: 'ไม่พบวิทยากร' };

  const form = await readFormAndUpload(formData, current);
  if (form.error) return { ok: false, error: form.error };
  const { msdb, local } = form;
  if (!msdb.name) return { ok: false, error: 'กรุณากรอกชื่อวิทยากร' };

  // 1. MSDB update (if we have an upstream id)
  if (current.instructor_id) {
    try {
      await msdbUpdate('instructors', current.instructor_id, msdb);
    } catch (err) {
      return { ok: false, error: `อัปเดต MSDB ไม่สำเร็จ: ${err?.message ?? 'unknown'}` };
    }
  }

  // 2. Local update
  try {
    await Instructor.updateOne(
      { _id: localId },
      {
        $set: {
          ...local,
          synced_at: new Date(),
        },
      }
    );
  } catch (err) {
    return { ok: false, error: `อัปเดต local ไม่สำเร็จ: ${err?.message ?? 'unknown'}` };
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(ABOUT_PATH);
  return { ok: true };
}

export async function deleteInstructor(localId) {
  await requireAdmin('instructors');
  await dbConnect();
  if (!localId) return { ok: false, error: 'Missing instructor id' };

  const current = await Instructor.findById(localId).lean();
  if (!current) return { ok: false, error: 'ไม่พบวิทยากร' };

  if (current.instructor_id) {
    try {
      await msdbDelete('instructors', current.instructor_id);
    } catch (err) {
      return { ok: false, error: `ลบจาก MSDB ไม่สำเร็จ: ${err?.message ?? 'unknown'}` };
    }
  }

  if (current.image_public_id) {
    deleteFromCloudinary(current.image_public_id).catch(() => {});
  }

  await Instructor.deleteOne({ _id: localId });
  revalidatePath(ADMIN_PATH);
  revalidatePath(ABOUT_PATH);
  return { ok: true };
}

export async function listInstructorsForAdmin() {
  await requireAdmin('instructors');
  await dbConnect();
  const docs = await Instructor.find({})
    .sort({ display_order: 1, createdAt: -1 })
    .lean();
  return serialize(docs);
}
