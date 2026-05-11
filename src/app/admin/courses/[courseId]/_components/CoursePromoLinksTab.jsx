'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { ChevronDown, ChevronUp, Save } from 'lucide-react';
import { getActivePromotionsForAdmin } from '@/lib/actions/promotions';
import {
  getAllCoursePromoLinks,
  createCoursePromoLink,
  updateCoursePromoLink,
} from '@/lib/actions/course-promos';

/**
 * CoursePromoLinksTab
 *
 * Shows every active Promotion as a list. Each row has a toggle to
 * include/exclude the promo from THIS course, and an expandable editor
 * for the optional schedule_ids subset.
 *
 * Data model: one CoursePromoLink doc per (course_id + promotion_id).
 * Toggle ON  = upsert with is_active: true
 * Toggle OFF = upsert with is_active: false  (record kept, not deleted)
 */
export function CoursePromoLinksTab({
  courseId,
  initialPromoLinks = [],
  initialPromos = [],
}) {
  // promotion_id → CoursePromoLink doc (or undefined if not yet created)
  const [linkMap, setLinkMap] = useState(() => {
    const map = {};
    initialPromoLinks.forEach((l) => {
      map[l.promotion_id] = l;
    });
    return map;
  });

  const [promos, setPromos] = useState(initialPromos);
  const [loading, setLoading] = useState(initialPromos.length === 0);

  const [expanded, setExpanded] = useState(null);
  const [scheduleText, setScheduleText] = useState({});
  const [feedback, setFeedback] = useState({});

  const [, startTransition] = useTransition();
  const didInit = useRef(false);

  // On first mount: fetch fresh promos + links, then auto-create a
  // CoursePromoLink (is_active: true) for every active promotion that
  // doesn't yet have a record for this course. Without this, the
  // "default ON" UI wouldn't match what `getActiveCoursePromos()` reads
  // from MongoDB — that query filters on `is_active: true` and ignores
  // promotions with no link doc.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const initTab = async () => {
      const [allPromos, links] = await Promise.all([
        getActivePromotionsForAdmin(),
        getAllCoursePromoLinks(courseId),
      ]);

      const fetchedPromos = Array.isArray(allPromos) ? allPromos : [];
      const fetchedLinks = Array.isArray(links) ? links : [];

      setPromos(fetchedPromos);

      const map = {};
      fetchedLinks.forEach((l) => {
        map[l.promotion_id] = l;
      });

      // Only auto-create links for promos that are relevant to this
      // course — a promo is relevant if it has no course restriction
      // (empty related_course_ids) OR explicitly lists this course.
      const missingIds = fetchedPromos
        .filter((p) => {
          if (map[p.promotion_id]) return false;
          const related = p.related_course_ids ?? [];
          return related.length === 0 || related.includes(courseId);
        })
        .map((p) => p.promotion_id);

      if (missingIds.length > 0) {
        await Promise.all(
          missingIds.map((pid) =>
            createCoursePromoLink(courseId, {
              promotion_id: pid,
              schedule_ids: [],
              is_active: true,
            })
          )
        );

        // Re-fetch so the new docs' _id values land in linkMap —
        // subsequent toggle/update calls need them.
        const freshLinks = await getAllCoursePromoLinks(courseId);
        (Array.isArray(freshLinks) ? freshLinks : []).forEach((l) => {
          map[l.promotion_id] = l;
        });
      }

      setLinkMap({ ...map });
      setLoading(false);
    };

    initTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function parseScheduleIds(text) {
    return (text ?? '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function handleExpand(promotionId) {
    if (expanded === promotionId) {
      setExpanded(null);
      return;
    }
    setExpanded(promotionId);
    const link = linkMap[promotionId];
    setScheduleText((prev) => ({
      ...prev,
      [promotionId]: (link?.schedule_ids ?? []).join('\n'),
    }));
  }

  function handleToggle(promotionId, currentActive) {
    const newActive = !currentActive;
    const existing = linkMap[promotionId];
    const schedIds = existing?.schedule_ids ?? [];

    startTransition(async () => {
      let result;
      if (existing?._id) {
        result = await updateCoursePromoLink(existing._id, {
          schedule_ids: schedIds,
          is_active: newActive,
        });
      } else {
        result = await createCoursePromoLink(courseId, {
          promotion_id: promotionId,
          schedule_ids: [],
          is_active: newActive,
        });
      }

      if (result?.ok) {
        // We don't get the new _id back from createCoursePromoLink, so
        // re-fetch the links to pick it up — keeps subsequent toggles
        // pointed at the right doc.
        const refreshed = await getAllCoursePromoLinks(courseId);
        const map = {};
        (Array.isArray(refreshed) ? refreshed : []).forEach((l) => {
          map[l.promotion_id] = l;
        });
        setLinkMap(map);
      }
    });
  }

  function handleSaveSchedules(promotionId) {
    const existing = linkMap[promotionId];
    const schedIds = parseScheduleIds(scheduleText[promotionId]);

    startTransition(async () => {
      let result;
      if (existing?._id) {
        result = await updateCoursePromoLink(existing._id, {
          schedule_ids: schedIds,
          is_active: existing.is_active === true,
        });
      } else {
        result = await createCoursePromoLink(courseId, {
          promotion_id: promotionId,
          schedule_ids: schedIds,
          is_active: true, // active by default
        });
      }

      if (result?.ok) {
        const refreshed = await getAllCoursePromoLinks(courseId);
        const map = {};
        (Array.isArray(refreshed) ? refreshed : []).forEach((l) => {
          map[l.promotion_id] = l;
        });
        setLinkMap(map);
        setFeedback((f) => ({ ...f, [promotionId]: 'ok' }));
        setTimeout(
          () => setFeedback((f) => ({ ...f, [promotionId]: null })),
          2000
        );
      } else {
        setFeedback((f) => ({ ...f, [promotionId]: 'error' }));
      }
    });
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-[var(--text-secondary)]">
        กำลังโหลดรายการโปรโมชัน…
      </div>
    );
  }

  // Only promos that explicitly target this course (or are unrestricted)
  // should appear in the tab — admins shouldn't see noise from promos
  // that upstream has bound to other courses.
  const relevantPromos = promos.filter((p) => {
    const related = p.related_course_ids ?? [];
    return related.length === 0 || related.includes(courseId);
  });

  if (relevantPromos.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--text-secondary)]">
        ยังไม่มีโปรโมชันที่ active — ไปที่{' '}
        <a href="/admin/promotions" className="text-9e-action hover:underline">
          จัดการโปรโมชัน
        </a>{' '}
        เพื่อเปิดใช้งาน
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        เปิด/ปิดโปรโมชันที่ต้องการแสดงในหน้าหลักสูตรนี้ และระบุรอบอบรมที่ร่วมโปรโมชัน
      </p>

      {relevantPromos.map((promo) => {
        const link = linkMap[promo.promotion_id];
        // No link yet = treat as active by default
        const isOn = link ? link.is_active === true : true;
        const isExpanded = expanded === promo.promotion_id;
        const schedCount = link?.schedule_ids?.length ?? 0;

        return (
          <div
            key={promo.promotion_id}
            className={
              'rounded-9e-lg border transition-colors duration-9e-micro ' +
              (isOn
                ? 'border-9e-brand/40 bg-9e-ice dark:bg-9e-signature-950'
                : 'border-[var(--surface-border)] bg-[var(--surface)]')
            }
          >
            <div className="flex items-center gap-3 px-4 py-3">
              {promo.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={promo.thumbnail_url}
                  alt=""
                  className="h-9 w-12 shrink-0 rounded-9e-sm object-cover"
                />
              ) : (
                <div className="h-9 w-12 shrink-0 rounded-9e-sm bg-9e-slate-lt-200 dark:bg-9e-border" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {promo.title || promo.promotion_id}
                </p>
                {schedCount > 0 && (
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {schedCount} รอบอบรมที่ระบุ
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleExpand(promo.promotion_id)}
                aria-label="แก้ไขรอบอบรม"
                className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-9e-slate-dp-50 transition-colors hover:bg-9e-ice hover:text-9e-action dark:hover:bg-9e-border"
              >
                รอบอบรม
                {isExpanded ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={isOn}
                onClick={() => handleToggle(promo.promotion_id, isOn)}
                className={
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-9e-micro ' +
                  (isOn
                    ? 'bg-9e-action'
                    : 'bg-9e-slate-lt-300 dark:bg-9e-slate-dp-200')
                }
              >
                <span
                  className={
                    'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-9e-micro ' +
                    (isOn ? 'translate-x-6' : 'translate-x-1')
                  }
                />
                <span className="sr-only">{isOn ? 'เปิด' : 'ปิด'}</span>
              </button>
            </div>

            {isExpanded && (
              <div className="border-t border-[var(--surface-border)] bg-[var(--surface-muted,var(--surface))] px-4 py-3">
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  Schedule IDs (หนึ่ง ID ต่อบรรทัด)
                </label>
                <textarea
                  value={scheduleText[promo.promotion_id] ?? ''}
                  onChange={(e) =>
                    setScheduleText((prev) => ({
                      ...prev,
                      [promo.promotion_id]: e.target.value,
                    }))
                  }
                  rows={4}
                  placeholder={'65fa1234567890abcdef...\n65fa0987654321fedcba...'}
                  className="w-full resize-none rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:bg-9e-navy"
                />
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  วาง _id ของรอบอบรมที่ต้องการผูกกับโปรโมชันนี้ — ถ้าไม่ระบุ = ทุกรอบ
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleSaveSchedules(promo.promotion_id)}
                    className="btn-9e-cta inline-flex items-center gap-1.5 px-4 py-1.5 text-sm"
                  >
                    <Save size={13} /> บันทึกรอบอบรม
                  </button>
                  {feedback[promo.promotion_id] === 'ok' && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      บันทึกแล้ว ✓
                    </span>
                  )}
                  {feedback[promo.promotion_id] === 'error' && (
                    <span className="text-xs text-red-500">เกิดข้อผิดพลาด</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
