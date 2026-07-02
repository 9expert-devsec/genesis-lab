'use server';

/**
 * Server actions for ProgramPageConfig + SkillPageConfig — admin-managed
 * URL slug + SEO layer on top of the upstream /programs and /skills
 * endpoints. Read functions are public (consumed by the route + metadata);
 * write/list functions require an authenticated admin session.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import ProgramPageConfig from '@/models/ProgramPageConfig';
import SkillPageConfig from '@/models/SkillPageConfig';
import { requireAdmin } from '@/lib/actions/auth';

const ADMIN_PATH = '/admin/page-configs';

function serialize(doc) {
  if (!doc) return null;
  return JSON.parse(JSON.stringify(doc));
}

function normalizeSlug(input) {
  if (!input) return null;
  const trimmed = String(input).trim().replace(/^\/+/, '');
  return trimmed || null;
}

function shapeUpdate(programOrSkillId, key, data) {
  const slug = normalizeSlug(data?.urlSlug);
  return {
    [key]: programOrSkillId,
    urlSlug: slug,
    metaTitle: String(data?.metaTitle ?? '').trim(),
    metaDescription: String(data?.metaDescription ?? '').trim(),
    ogImage: String(data?.ogImage ?? '').trim(),
    isPublished:
      typeof data?.isPublished === 'boolean' ? data.isPublished : true,
  };
}

// ── Programs ────────────────────────────────────────────────────────

export async function getProgramConfig(programId) {
  if (!programId) return null;
  await dbConnect();
  const doc = await ProgramPageConfig.findOne({ programId }).lean();
  return serialize(doc);
}

export async function getProgramConfigBySlug(slug) {
  const cleaned = normalizeSlug(slug);
  if (!cleaned) return null;
  await dbConnect();
  const doc = await ProgramPageConfig.findOne({ urlSlug: cleaned }).lean();
  return serialize(doc);
}

export async function listProgramConfigs() {
  await requireAdmin('page_configs');
  await dbConnect();
  const docs = await ProgramPageConfig.find({}).sort({ updatedAt: -1 }).lean();
  return serialize(docs);
}

export async function saveProgramConfig(programId, data) {
  await requireAdmin('page_configs');
  await dbConnect();

  if (!programId || typeof programId !== 'string') {
    return { ok: false, error: 'Missing programId' };
  }

  try {
    const update = shapeUpdate(programId, 'programId', data);
    const doc = await ProgramPageConfig.findOneAndUpdate(
      { programId },
      update,
      { upsert: true, new: true, runValidators: true }
    );
    revalidatePath(ADMIN_PATH);
    if (update.urlSlug) revalidatePath(`/program/${update.urlSlug}`);
    revalidatePath(`/program/${programId}`);
    // Bust the public layout so the nav (PublicHeader) picks up the new
    // custom slug immediately instead of waiting for the next cron sync.
    revalidatePath('/', 'layout');
    return { ok: true, data: serialize(doc) };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'URL Slug นี้ถูกใช้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function deleteProgramConfig(programId) {
  await requireAdmin('page_configs');
  await dbConnect();
  await ProgramPageConfig.deleteOne({ programId });
  revalidatePath(ADMIN_PATH);
  revalidatePath(`/program/${programId}`);
  revalidatePath('/', 'layout'); // bust the nav so the slug reverts to default
  return { ok: true };
}

// ── Skills ──────────────────────────────────────────────────────────

export async function getSkillConfig(skillId) {
  if (!skillId) return null;
  await dbConnect();
  const doc = await SkillPageConfig.findOne({ skillId }).lean();
  return serialize(doc);
}

export async function getSkillConfigBySlug(slug) {
  const cleaned = normalizeSlug(slug);
  if (!cleaned) return null;
  await dbConnect();
  const doc = await SkillPageConfig.findOne({ urlSlug: cleaned }).lean();
  return serialize(doc);
}

export async function listSkillConfigs() {
  await requireAdmin('page_configs');
  await dbConnect();
  const docs = await SkillPageConfig.find({}).sort({ updatedAt: -1 }).lean();
  return serialize(docs);
}

export async function saveSkillConfig(skillId, data) {
  await requireAdmin('page_configs');
  await dbConnect();

  if (!skillId || typeof skillId !== 'string') {
    return { ok: false, error: 'Missing skillId' };
  }

  try {
    const update = shapeUpdate(skillId, 'skillId', data);
    const doc = await SkillPageConfig.findOneAndUpdate(
      { skillId },
      update,
      { upsert: true, new: true, runValidators: true }
    );
    revalidatePath(ADMIN_PATH);
    if (update.urlSlug) revalidatePath(`/skill/${update.urlSlug}`);
    revalidatePath(`/skill/${skillId}`);
    // Bust the public layout so the nav (PublicHeader) picks up the new
    // custom slug immediately instead of waiting for the next cron sync.
    revalidatePath('/', 'layout');
    return { ok: true, data: serialize(doc) };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'URL Slug นี้ถูกใช้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function deleteSkillConfig(skillId) {
  await requireAdmin('page_configs');
  await dbConnect();
  await SkillPageConfig.deleteOne({ skillId });
  revalidatePath(ADMIN_PATH);
  revalidatePath(`/skill/${skillId}`);
  revalidatePath('/', 'layout'); // bust the nav so the slug reverts to default
  return { ok: true };
}
