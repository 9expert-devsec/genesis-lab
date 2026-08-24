'use client';

import { useMemo } from 'react';
import { BANNER_FIELDS } from '@/lib/banners/bannerFormFields';
import { findArticleOption } from '@/lib/banners/pickerMatch';
import { SearchPicker } from './SearchPicker';

/**
 * The `article` type's reference: one `article_slug`.
 *
 * ── THE SLUG, NOT THE ObjectId ─────────────────────────────────────────────
 * It is the public identity (`/articles/<slug>`), it is `unique` on Article, and
 * it survives a re-import that would mint a new `_id`. The resolver looks it up
 * with a plain `$in` on `Article.slug`.
 *
 * ── AND IT IS STORED BYTE-FOR-BYTE ─────────────────────────────────────────
 * 265 of the 488 live slugs contain Thai characters — `local-llm-คืออะไร`,
 * `5-เทคนิคทำให้-excel-เร็วขึ้น`, `9สูตรคำนวณ-ผู้เริ่มต้นใช้งาน-excel`. Nothing in this
 * component or in the payload parser trims, folds, transliterates,
 * percent-encodes or slugifies. An ASCII-sanitising step anywhere on this path
 * would produce a key that matches no Article, and it would do so for more than
 * half the collection — every one of those links breaking at once, silently,
 * because the failure mode of an unresolvable reference is a dropped card and a
 * server log line.
 *
 * The search box is case-folded and nothing else, for the same reason: Thai has
 * no case, so `toLowerCase()` is the identity on it and cannot damage a query.
 *
 * ── ALL 488, NOT THE 6 FLAGGED featuredOnLanding ───────────────────────────
 * That flag drives the BlogSection's own selection and has nothing to do with
 * banners. Limiting the picker to it would be a restriction with no visible
 * cause and no explanation available to the admin who hit it.
 */
export function BannerArticlePicker({
  value,          // the stored slug
  onChange,
  options,
  loadError,
  error,
  inputClassName = '',
}) {
  const slug = String(value ?? '');

  const selected = useMemo(
    () => (slug ? findArticleOption(options, slug) : null),
    [options, slug]
  );

  /** A slug is stored but no article carries it — deleted, or the slug changed. */
  const missing = Boolean(slug) && !selected && !loadError;

  return (
    <div className="space-y-3">
      {/* THE form control. Always rendered while the picker is on screen, so a
          deliberate clear posts '' rather than falling back to the stored slug.
          See the `has()` vs `get()` note in bannerFormPayload. */}
      <input type="hidden" name={BANNER_FIELDS.ARTICLE_SLUG} value={slug} />

      {loadError ? (
        <p className="rounded-9e-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {loadError}
          {slug ? ' — บทความที่บันทึกไว้เดิมยังคงอยู่และจะไม่ถูกล้าง' : ''}
        </p>
      ) : (
        <SearchPicker
          options={Array.isArray(options) ? options : []}
          getKey={(o) => o.slug}
          // Searchable by BOTH, because the slug is what the record stores and
          // the title is what the admin remembers. A picker searchable only by
          // title cannot find a record by the value written in the database.
          getSearchText={(o) => `${o.title} ${o.slug}`.toLowerCase()}
          selected={selected}
          onPick={(o) => onChange(o.slug)}
          onClear={() => onChange('')}
          ariaLabel="ค้นหาบทความ"
          placeholder={`ค้นหาบทความจากชื่อหรือ slug (${(options ?? []).length} บทความ)`}
          emptyLabel="ไม่พบบทความที่ตรงกับคำค้น"
          inputClassName={inputClassName}
          renderOption={(o) => <ArticleRow option={o} />}
          renderSelected={(o) => (
            <div className="rounded-9e-md border border-gray-200 bg-9e-ice/40 p-3">
              <ArticleRow option={o} />
            </div>
          )}
        />
      )}

      {missing && (
        <p className="rounded-9e-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          ไม่พบบทความ slug <code>{slug}</code> — บทความนี้อาจถูกลบหรือเปลี่ยน slug แล้ว
          Banner นี้จะไม่แสดงบนหน้าแรกจนกว่าจะเลือกบทความใหม่
        </p>
      )}

      {selected && !selected.resolvable && (
        <p className="rounded-9e-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>
            {!selected.active
              ? 'บทความนี้ถูกปิดการแสดงผล (inactive)'
              : 'บทความนี้ยังไม่ถึงกำหนดเผยแพร่'}
          </strong>{' '}
          — Banner ที่อ้างถึงบทความที่ยังไม่เผยแพร่จะถูกตัดออกจากหน้าแรกโดยไม่มีข้อความแจ้ง
          ให้เผยแพร่บทความนี้ก่อน หรือเลือกบทความอื่น
        </p>
      )}

      {error && (
        <p className="text-xs text-red-500">
          {Array.isArray(error) ? error[0] : String(error)}
        </p>
      )}
    </div>
  );
}

/** Title, then the slug — the stored value is always visible, never implied. */
function ArticleRow({ option }) {
  return (
    <div className="min-w-0">
      <div className="font-medium text-9e-navy truncate">
        {option.title || <span className="text-9e-slate-dp-50">(ไม่มีชื่อ)</span>}
      </div>
      <div className="text-xs text-9e-slate-dp-50 break-all">
        <code>{option.slug}</code>
        {!option.active && <span className="ml-2 text-amber-700 font-bold">• ปิดการแสดงผล</span>}
        {option.active && !option.published && (
          <span className="ml-2 text-amber-700 font-bold">• ยังไม่เผยแพร่</span>
        )}
      </div>
    </div>
  );
}
