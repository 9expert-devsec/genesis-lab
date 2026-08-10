'use client';

/**
 * The course editor's right rail — everything that is NOT the MSDB course body.
 *
 * ── TWO STORES, ONE RAIL, AND THE SEAM IS DELIBERATE ────────────────────────
 * Every field below except one belongs to the genesis-side `course_extensions`
 * collection (model CourseExtension), keyed by the course_id CODE and written
 * by `saveCourseExtension`. They are controlled React state, not form inputs —
 * they never enter the FormData that `shapePayload` reads, and they must not.
 *
 * The exception is `urlSlot`, which the parent fills with the `website_urls`
 * input. That IS an MSDB field, collected from the form like every other one.
 * It sits here because the request put it here and the reason is sound — it and
 * URL Alias are both "where does this course live on the web", and having them
 * a screen apart is how they drifted. The seam is a SLOT rather than an import
 * so this component never grows a second opinion about the MSDB payload: it
 * renders whatever it is handed and knows nothing about `shapePayload`.
 */

export function CourseSeoRail({
  courseId,
  courseName,
  urlAlias,
  onUrlAlias,
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
  /** The `website_urls` field — an MSDB form input, owned by the parent form. */
  urlSlot = null,
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
            className={'flex-1 ' + input}
          />
        </div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          ถ้าว่างจะใช้ <code>/{String(courseId ?? '').toLowerCase()}-training-course</code> โดยอัตโนมัติ
        </p>
      </RailField>

      {/* website_urls — directly under URL Alias, per the request. */}
      {urlSlot}

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

      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => onIsPublished(e.target.checked)}
        />
        แสดงผลในเว็บสาธารณะ (alias resolution)
      </label>
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
