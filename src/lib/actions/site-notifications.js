'use server';

/**
 * Server actions for the SiteNotification collection.
 *
 * Writes call `requireAdmin()` first and then `revalidatePath('/', 'layout')`
 * so the root layout's cached top bar payload is busted — without that
 * the bar fetched in `(public)/layout.jsx` and `src/app/page.jsx` would
 * stay stale until the next deploy.
 *
 * Images: topbar uses `bg_image_*`; popup uses `image_*`. The form passes
 * a single File via `_imageFile`, and we route it to the right column
 * based on `display_type`.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import SiteNotification from '@/models/SiteNotification';
import { auth } from '@/lib/auth/options';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';

const ADMIN_PATH = '/admin/notifications';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
}

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function activeNowFilter() {
  const now = new Date();
  return {
    active: true,
    $or: [
      { starts_at: null, ends_at: null },
      { starts_at: { $lte: now }, ends_at: null },
      { starts_at: null, ends_at: { $gte: now } },
      { starts_at: { $lte: now }, ends_at: { $gte: now } },
    ],
  };
}

function revalidateAll() {
  // `revalidatePath('/', 'layout')` busts the root layout cache where
  // the top bar payload is fetched (both `(public)/layout.jsx` and the
  // home page). The bare `/` revalidate is kept as a belt-and-braces
  // hit on the home segment.
  revalidatePath('/');
  revalidatePath('/', 'layout');
  revalidatePath(ADMIN_PATH);
}

// ── Reads ──────────────────────────────────────────────────────────

export async function getActiveTopBars() {
  await dbConnect();
  const docs = await SiteNotification.find({
    ...activeNowFilter(),
    display_type: 'topbar',
  })
    .sort({ weight: 1 })
    .lean();
  return serialize(docs);
}

export async function getActivePopups() {
  await dbConnect();
  const docs = await SiteNotification.find({
    ...activeNowFilter(),
    display_type: 'popup',
  })
    .sort({ weight: 1 })
    .lean();
  return serialize(docs);
}

export async function getAllNotifications() {
  await dbConnect();
  const docs = await SiteNotification.find({})
    .sort({ display_type: 1, weight: 1, createdAt: -1 })
    .lean();
  return serialize(docs);
}

// ── Field sanitisation ─────────────────────────────────────────────

/**
 * Whitelist + coerce the editor payload. Anything not listed here is
 * silently dropped so transient form fields (`_imageFile`, modal helpers)
 * can never land in Mongo.
 */
function shapePayload(data) {
  const pageScope = Array.isArray(data.page_scope)
    ? data.page_scope.map((s) => String(s).trim()).filter(Boolean)
    : [];

  return {
    name:         String(data.name ?? '').trim(),
    display_type: data.display_type === 'topbar' ? 'topbar' : 'popup',
    active:       Boolean(data.active),
    starts_at:    data.starts_at ? new Date(data.starts_at) : null,
    ends_at:      data.ends_at   ? new Date(data.ends_at)   : null,
    weight:       Number.isFinite(Number(data.weight)) ? Number(data.weight) : 0,

    // TopBar
    message:       String(data.message ?? ''),
    dismissible:   data.dismissible !== false,
    bg_color:      String(data.bg_color   ?? '#2486FF'),
    text_color:    String(data.text_color ?? '#FFFFFF'),
    bg_image_size: ['cover', 'contain', 'auto'].includes(data.bg_image_size) ? data.bg_image_size : 'auto',
    btn_label:      String(data.btn_label ?? ''),
    btn_action:     data.btn_action === 'copy' ? 'copy' : 'link',
    btn_href:       String(data.btn_href ?? ''),
    btn_copy_value: String(data.btn_copy_value ?? ''),
    btn_copy_ok:    String(data.btn_copy_ok ?? 'คัดลอกแล้ว!'),
    btn_new_tab:    Boolean(data.btn_new_tab),
    btn_bg_color:   String(data.btn_bg_color ?? ''),
    btn_text_color: String(data.btn_text_color ?? ''),
    countdown_target: data.countdown_target ? new Date(data.countdown_target) : null,

    // Popup
    popup_size:     ['sm', 'md', 'lg'].includes(data.popup_size) ? data.popup_size : 'md',
    click_href:     String(data.click_href ?? ''),
    click_new_tab:  data.click_new_tab !== false,
    trigger:        ['immediate', 'delay', 'exit_intent', 'scroll'].includes(data.trigger) ? data.trigger : 'delay',
    delay_seconds:  Number.isFinite(Number(data.delay_seconds))  ? Number(data.delay_seconds)  : 3,
    scroll_pct:     Number.isFinite(Number(data.scroll_pct))     ? Number(data.scroll_pct)     : 40,
    cooldown_hours: Number.isFinite(Number(data.cooldown_hours)) ? Number(data.cooldown_hours) : 24,

    page_scope: pageScope,
  };
}

/** Resolve image column names based on display type. */
function imageKeys(displayType) {
  return displayType === 'popup'
    ? { url: 'image_url',    pid: 'image_public_id' }
    : { url: 'bg_image_url', pid: 'bg_image_public_id' };
}

// ── Mutations ──────────────────────────────────────────────────────

export async function createNotification(data) {
  await requireAdmin();
  await dbConnect();

  const payload = shapePayload(data);
  const keys = imageKeys(payload.display_type);

  // Default URL/public_id come from the form so the editor can clear
  // the image (empty string) without re-uploading.
  payload[keys.url] = String(data[keys.url] ?? '');
  payload[keys.pid] = String(data[keys.pid] ?? '');

  if (data._imageFile && typeof data._imageFile === 'object' && data._imageFile.size > 0) {
    const uploaded = await uploadToCloudinary(data._imageFile, 'notifications');
    payload[keys.url] = uploaded.secure_url;
    payload[keys.pid] = uploaded.public_id;
  }

  const doc = await SiteNotification.create(payload);
  revalidateAll();
  return { ok: true, data: serialize(doc) };
}

export async function updateNotification(id, data) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };

  const payload = shapePayload(data);
  const keys = imageKeys(payload.display_type);

  payload[keys.url] = String(data[keys.url] ?? '');
  payload[keys.pid] = String(data[keys.pid] ?? '');

  if (data._imageFile && typeof data._imageFile === 'object' && data._imageFile.size > 0) {
    // Replace existing image — delete the old asset first so we don't
    // leak orphaned Cloudinary objects.
    const existing = await SiteNotification.findById(id).lean();
    const oldPid = existing?.[keys.pid];
    if (oldPid) await deleteFromCloudinary(oldPid).catch(() => {});
    const uploaded = await uploadToCloudinary(data._imageFile, 'notifications');
    payload[keys.url] = uploaded.secure_url;
    payload[keys.pid] = uploaded.public_id;
  } else if (!payload[keys.url]) {
    // Editor cleared the image via the UI — drop the existing asset too.
    const existing = await SiteNotification.findById(id).lean();
    const oldPid = existing?.[keys.pid];
    if (oldPid) await deleteFromCloudinary(oldPid).catch(() => {});
    payload[keys.pid] = '';
  }

  const doc = await SiteNotification.findByIdAndUpdate(id, payload, {
    new: true,
  }).lean();
  revalidateAll();
  return { ok: true, data: serialize(doc) };
}

export async function deleteNotification(id) {
  await requireAdmin();
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };

  const doc = await SiteNotification.findByIdAndDelete(id).lean();
  if (doc?.image_public_id) {
    await deleteFromCloudinary(doc.image_public_id).catch(() => {});
  }
  if (doc?.bg_image_public_id) {
    await deleteFromCloudinary(doc.bg_image_public_id).catch(() => {});
  }
  revalidateAll();
  return { ok: true };
}

export async function toggleNotificationActive(id, active) {
  await requireAdmin();
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  await SiteNotification.findByIdAndUpdate(id, { active: Boolean(active) });
  revalidateAll();
  return { ok: true };
}

export async function updateNotificationWeight(id, weight) {
  await requireAdmin();
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  const numeric = Number.isFinite(Number(weight)) ? Number(weight) : 0;
  await SiteNotification.findByIdAndUpdate(id, { weight: numeric });
  revalidateAll();
  return { ok: true };
}