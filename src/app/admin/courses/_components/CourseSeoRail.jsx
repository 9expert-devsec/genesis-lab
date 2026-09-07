'use client';

/**
 * The course editor's right rail — everything that is NOT the MSDB course body.
 *
 * ── ONE STORE, WHICH IS NOW THE WHOLE POINT ─────────────────────────────────
 * Every field below belongs to the genesis-side `course_extensions` collection
 * (model CourseExtension), keyed by the course_id CODE and written by
 * `saveCourseExtension`. They are controlled React state, not form inputs —
 * they never enter the FormData that `shapePayload` reads, and they must not.
 *
 * It briefly held one exception: a `urlSlot` the parent filled with the MSDB
 * `website_urls` input, so the two "where does this course live on the web"
 * fields sat together. `website_urls` has since been retired from the admin
 * entirely, and the slot went with it — leaving this component with a single
 * store and no opinion at all about the MSDB payload.
 */

export function CourseSeoRail({
  courseId,
  courseName,
  urlAlias,
  onUrlAlias,
  aliasError,
  metaTitle,
  onMetaTitle,
  metaDescription,
  onMetaDescription,
  ogImage,
  onOgImage,
  tags,
  onTags,
  isPublished,
  onIsPublished,
}) {
  const input =
    'w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20';

  return (
    <div className="flex flex-col gap-4">
      <RailField label="URL Alias">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-muted)]">/</span>
          <input
            type="text"
            value={urlAlias}
            onChange={(e) => onUrlAlias(e.target.value)}
            placeholder="excel-ai-business-training-course"
            className={
              'flex-1 ' + input + (aliasError ? ' border-red-500 focus:border-red-500' : '')
            }
            aria-invalid={aliasError ? 'true' : undefined}
            aria-describedby={aliasError ? 'alias-error' : undefined}
          />
        </div>
        {/* The refusal belongs HERE, on the box the admin has to change — not
            on course_id, and not in the page-level banner where it reads as a
            failed save rather than a field to fix. */}
        {aliasError && (
          <p id="alias-error" className="mt-1 text-xs text-red-500">
            {aliasError}
          </p>
        )}
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          ถ้าว่างจะใช้ <code>/{String(courseId ?? '').toLowerCase()}-training-course</code> โดยอัตโนมัติ
        </p>
      </RailField>

      <RailField label={`Meta Title (${metaTitle.length}/60)`}>
        <input
          type="text"
          value={metaTitle}
          onChange={(e) => onMetaTitle(e.target.value)}
          maxLength={120}
          placeholder={courseName}
          className={input}
        />
      </RailField>

      <RailField label={`Meta Description (${metaDescription.length}/160)`}>
        <textarea
          value={metaDescription}
          onChange={(e) => onMetaDescription(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="คำอธิบายสั้นสำหรับ Search Engine และ Social Share..."
          className={'resize-none ' + input}
        />
      </RailField>

      <RailField label="OG Image URL">
        <input
          type="url"
          value={ogImage}
          onChange={(e) => onOgImage(e.target.value)}
          placeholder="https://res.cloudinary.com/..."
          className={input}
        />
      </RailField>

      <RailField label="Tags (คั่นด้วย comma)">
        <input
          type="text"
          value={tags}
          onChange={(e) => onTags(e.target.value)}
          placeholder="Excel, AI, Business"
          className={input}
        />
      </RailField>

      {/* ── THE LABEL USED TO SAY "(alias resolution)" AND THAT WAS WRONG ───
          It named a narrower thing than the checkbox does. The field is
          `CourseExtension.isPublished`, and unticking it does not turn off the
          pretty URL — resolveCourse returns null on BOTH branches, so the alias
          URL and the /<code>-training-course URL each answer 404. An admin
          reading the old label would reasonably expect the code URL to keep
          working, discover the alias 404ing, and conclude the course was
          deleted.

          The wording now matches what the rest of this admin already calls this
          exact field: the form header renders เผยแพร่ / ซ่อน from it, and
          lib/courses/courseStatusBadge maps `isPublished === false` to ซ่อน.
          No field renamed, no default changed, no filter behaviour touched. */}
      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => onIsPublished(e.target.checked)}
        />
        เผยแพร่หลักสูตรบนเว็บสาธารณะ
      </label>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        ไม่ติ๊ก = ซ่อนหลักสูตร ทั้ง URL แบบกำหนดเอง และ URL ตามรหัสหลักสูตร จะขึ้น 404 ทั้งคู่
      </p>
    </div>
  );
}

function RailField({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  );
}
