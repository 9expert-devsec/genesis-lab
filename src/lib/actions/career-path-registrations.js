'use server';

/**
 * Server actions for the CareerPathRegistration collection.
 *
 * `createCareerPathRegistration` is intentionally public — it's how the
 * /career-path-register/[slug] form submits. Reads and the status/delete
 * mutations are admin-gated.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import CareerPathRegistration from '@/models/CareerPathRegistration';
import { requireAdmin } from '@/lib/actions/auth';

const ADMIN_PATH = '/admin/career-path-registrations';

function serialize(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

export async function createCareerPathRegistration(data) {
  await dbConnect();
  const doc = await CareerPathRegistration.create(data);
  revalidatePath(ADMIN_PATH);
  return { ok: true, id: String(doc._id) };
}

export async function getCareerPathRegistrations({
  page = 1,
  limit = 30,
  search = '',
  careerSlug = '',
  status = '',
} = {}) {
  await dbConnect();

  const filter = {};
  if (search) {
    filter.$or = [
      { contactFirstName: { $regex: search, $options: 'i' } },
      { contactLastName:  { $regex: search, $options: 'i' } },
      { contactEmail:     { $regex: search, $options: 'i' } },
    ];
  }
  if (careerSlug) filter.careerSlug = String(careerSlug);
  if (status)     filter.status     = String(status);

  const skip  = (Math.max(1, page) - 1) * limit;
  const [total, items] = await Promise.all([
    CareerPathRegistration.countDocuments(filter),
    CareerPathRegistration.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    items: serialize(items),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getCareerPathRegistrationById(id) {
  if (!id) return null;
  await dbConnect();
  const doc = await CareerPathRegistration.findById(id).lean();
  return doc ? serialize(doc) : null;
}

export async function updateRegistrationStatus(id, status) {
  await requireAdmin('career_path_registrations');
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  await CareerPathRegistration.findByIdAndUpdate(id, { $set: { status } });
  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}`);
  return { ok: true };
}

export async function deleteCareerPathRegistration(id) {
  await requireAdmin('career_path_registrations');
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  await CareerPathRegistration.findByIdAndDelete(id);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
