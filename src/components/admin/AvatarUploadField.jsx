'use client';

import { useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { avatarUrl } from '@/lib/avatar/avatarUrl';

/**
 * AvatarUploadField — pick a profile photo, get back a Cloudinary public_id.
 *
 * ══ WHY THIS IS NOT AN OPTION ON ImageUploadField ═══════════════════════════
 * The obvious move was a prop on the existing control switching it from
 * emitting `url` to emitting `publicId`. It does not work, and the reason is
 * structural rather than cosmetic: ImageUploadField's second input is a
 * "paste a URL here" box, and A PASTED URL CANNOT PRODUCE A public_id. The
 * transformation only runs one way. So the flag would have to hide that field
 * too — and a flag that removes an input, changes the shape of the preview from
 * a 16/9 rectangle to a circle, and inverts what the control emits is not a
 * configuration of a component, it is a second component sharing a filename.
 *
 * Keeping them separate also means the eight existing ImageUploadField call
 * sites (ArticleForm, CareerPathForm ×2, CourseForm, CourseGalleryEditor,
 * MasterclassCourseFormClient ×3) submit exactly what they submitted before,
 * guaranteed by the file not being touched rather than by a test.
 *
 * ── IT DOES NOT PERSIST ─────────────────────────────────────────────────────
 * It uploads and reports; the parent decides what that means. `onChange` fires
 * with a public_id after a successful upload and with `null` after a removal.
 * There is no hidden input and no form submission, because the profile screen
 * saves through a server action rather than a form post.
 *
 * ── PLAIN <img>, NOT next/image ─────────────────────────────────────────────
 * `avatarUrl` already returns an asset at exactly the requested pixel size with
 * f_auto/q_auto, so next/image would run a second optimiser pass over an
 * already-optimised URL, and its srcset would have nothing to choose between
 * when the sizes are allowlisted to four values. It also keeps the `Image`
 * identifier out of a file that imports lucide icons. Do not "upgrade" this.
 */
export function AvatarUploadField({
  value = null,
  onChange,
  size = 128,
  disabled = false,
  busy = false,
}) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const pending = uploading || busy;
  const src = avatarUrl(value, size);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'avatars');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `อัปโหลดไม่สำเร็จ (${res.status})`);
      // THE publicId, NOT the url. The route returns both and the url is the
      // tempting one — it is what every other caller of this endpoint reads.
      // Storing it would defeat the whole point of the field's shape (see
      // Admin.imagePublicId): a finished delivery URL cannot be resized.
      if (!data?.publicId) throw new Error('อัปโหลดสำเร็จแต่ไม่ได้รับ publicId');
      onChange?.(data.publicId);
    } catch (err) {
      setError(err?.message ?? 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
      // Reset so the same file can be picked again after an error, or after a
      // successful upload the user wants to undo and redo.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleRemove() {
    setError('');
    onChange?.(null);
  }

  return (
    <div className="flex items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        // Decorative here: the heading and the buttons beside it already say
        // whose photo this is and what can be done to it, so an alt of "profile
        // photo" would only add noise to a screen reader.
        aria-hidden="true"
        className="shrink-0 rounded-full border border-[var(--surface-border)] object-cover"
        style={{ width: size, height: size }}
      />

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* A real <button> driving a hidden input, rather than a <label>
              wrapping one. A label with a display:none input is clickable but
              reaches neither the tab order nor Enter/Space — the pattern
              ImageUploadField uses, and not one worth copying into a new
              control. */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || pending}
            className="inline-flex items-center gap-2 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-action focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface)] disabled:opacity-50"
          >
            <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {pending ? 'กำลังอัปโหลด…' : 'อัปโหลดรูป'}
          </button>

          {/* Only offered when there is something to remove — a "ลบรูป" that
              deletes the bundled default is a button that cannot do its job. */}
          {value && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled || pending}
              className="inline-flex items-center gap-2 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface)] disabled:opacity-50 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              ลบรูป
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            // A CLIENT HINT, NOT THE GATE. It narrows the file picker to the
            // three types the server accepts for this folder; the refusal that
            // matters is checkUpload in @/lib/uploads/uploadRules, which this
            // cannot and must not be trusted to replace.
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled || pending}
            onChange={handleFile}
            className="hidden"
          />
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          JPG, PNG หรือ WebP · ไม่เกิน 2 MB
        </p>

        {error && (
          <p role="alert" className="rounded-9e-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
