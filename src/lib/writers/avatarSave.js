import { WRITER_AVATAR_FOLDER } from './writerFields.js';

/** Send a cropped avatar to the upload route. Resolves to its public_id. */
export async function uploadWriterAvatar(blob) {
  const fd = new FormData();
  fd.append('file', blob, blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg');
  fd.append('folder', WRITER_AVATAR_FOLDER);
  const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `อัปโหลดไม่สำเร็จ (${res.status})`);
  if (!data?.publicId) throw new Error('อัปโหลดสำเร็จแต่ไม่ได้รับรหัสรูป');
  return data.publicId;
}

/**
 * Upload the pending avatar, if there is one, then write the row.
 *
 * The order is what keeps Cloudinary free of orphans: nothing is uploaded until
 * บันทึก, a failed upload stops before the write, and a failed write removes what
 * this save just uploaded. A failed removal is logged and does not replace the
 * error the admin needs to see.
 *
 * @returns {Promise<{res: object, uploadedId: string|null}>}
 */
export async function saveWithPendingAvatar({ blob, upload, write, discard }) {
  const uploadedId = blob ? await upload(blob) : null;

  async function removeUpload() {
    if (!uploadedId) return;
    try {
      await discard(uploadedId);
    } catch (err) {
      console.error('[writers] could not remove the unsaved avatar', uploadedId, err);
    }
  }

  let res;
  try {
    res = await write(uploadedId);
  } catch (err) {
    await removeUpload();
    throw err;
  }
  if (!res?.ok) await removeUpload();
  return { res, uploadedId };
}
