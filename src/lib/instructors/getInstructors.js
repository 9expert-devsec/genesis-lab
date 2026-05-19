/**
 * Read-side helpers for the Instructor collection. All reads come from
 * Mongo; the cron + admin sync paths keep it fresh.
 */

import { dbConnect } from '@/lib/db/connect';
import Instructor from '@/models/Instructor';

function serialize(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

export async function getActiveInstructors() {
  await dbConnect();
  const docs = await Instructor.find({ is_active: true })
    .sort({ display_order: 1, createdAt: -1 })
    .lean();
  return serialize(docs);
}

export async function getAllInstructors() {
  await dbConnect();
  const docs = await Instructor.find({})
    .sort({ display_order: 1, createdAt: -1 })
    .lean();
  return serialize(docs);
}
