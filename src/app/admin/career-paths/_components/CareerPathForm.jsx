'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { BulletTextarea } from '@/components/admin/BulletTextarea';
import {
  createCareerPath,
  updateCareerPath,
} from '@/lib/actions/career-paths';

/**
 * Auto-slug from a Thai/English title: ASCII only, lowercase, dashes.
 * The `-career-path` suffix is appended by the server action.
 */
function slugifyForCareerPath(input) {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Strip the trailing `-career-path` so the admin sees a clean editable
 * slug. The action will reapply it on submit.
 */
function stripCareerPathSuffix(slug) {
  return String(slug ?? '').replace(/-career-path$/, '');
}

/**
 * Pull the editable form-state shape out of an existing CareerPath
 * Mongo document (snake_case) so the form can edit in MSDB-style
 * camelCase locally and re-serialize on submit.
 */
function blocksFromCareerPath(cp) {
  if (!cp || !Array.isArray(cp.curriculum)) return [];
  return cp.curriculum.map((block, idx) => ({
    kind:        block?.kind === 'choice' ? 'choice' : 'fixed',
    title:       block?.title ?? '',
    description: block?.description ?? '',
    chooseMin:   Number.isFinite(block?.chooseMin) ? block.chooseMin : 0,
    chooseMax:   Number.isFinite(block?.chooseMax) ? block.chooseMax : 0,
    sortOrder:   Number.isFinite(block?.sortOrder) ? block.sortOrder : idx,
    items:       Array.isArray(block?.items)
      ? block.items.map((it) => ({
          kind:         it?.kind === 'external' ? 'external' : 'public',
          // The synced curriculum carries a populated `snap` for public
          // courses; we recover the short code so the admin can repick
          // the course in the form.
          course_id:    it?.snap?.code ?? it?.course_id ?? '',
          externalName: it?.externalName ?? '',
          externalUrl:  it?.externalUrl ?? '',
          note:         it?.note ?? '',
        }))
      : [],
  }));
}

const inputCls =
  'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';

const sectionCls =
  'rounded-9e-lg border border-[var(--surface-border)] bg-white p-5 dark:bg-[#111d2c]';

export function CareerPathForm({ careerPath, courses }) {
  const router = useRouter();
  const isEdit = Boolean(careerPath?._id);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  // ── Section 1 — ข้อมูลหลัก ──────────────────────────────────────
  const [title,      setTitle]      = useState(careerPath?.title ?? '');
  const [slug,       setSlug]       = useState(stripCareerPathSuffix(careerPath?.api_slug ?? ''));
  const [status,     setStatus]     = useState(careerPath?.upstream_status === 'active' ? 'active' : 'offline');
  const [isPinned,   setIsPinned]   = useState(Boolean(careerPath?.is_pinned));
  const [sortOrder,  setSortOrder]  = useState(careerPath?.upstream_order ?? 0);
  const [cardDetail, setCardDetail] = useState(careerPath?.short_description ?? '');
  // Track whether the admin has edited the slug. While they haven't, we
  // keep it in lock-step with the title so creating a path requires one
  // less field. The first manual edit pins it.
  const [slugEdited, setSlugEdited] = useState(isEdit);

  // ── Section 2 — รูปภาพ ─────────────────────────────────────────
  const [coverUrl,    setCoverUrl]    = useState(careerPath?.hero_image_url ?? '');
  const [coverAlt,    setCoverAlt]    = useState(careerPath?.hero_image_alt ?? '');
  const [roadmapUrl,  setRoadmapUrl]  = useState(careerPath?.roadmap_image_url ?? '');
  const [roadmapAlt,  setRoadmapAlt]  = useState(careerPath?.roadmap_image_alt ?? '');

  // ── Section 3 — ราคา & ลิงก์ ──────────────────────────────────
  const priceInit = careerPath?.price ?? {};
  const linksInit = careerPath?.links ?? {};
  const [fullPrice,   setFullPrice]   = useState(priceInit.fullPrice ?? '');
  const [salePrice,   setSalePrice]   = useState(priceInit.salePrice ?? '');
  const [discountPct, setDiscountPct] = useState(priceInit.discountPct ?? '');
  const [currency,    setCurrency]    = useState(priceInit.currency ?? 'THB');
  const [detailUrl,   setDetailUrl]   = useState(linksInit.detailUrl ?? '');
  const [signupUrl,   setSignupUrl]   = useState(linksInit.signupUrl ?? '');
  const [outlineUrl,  setOutlineUrl]  = useState(linksInit.outlineUrl ?? '');

  // ── Section 4 — รายละเอียด ────────────────────────────────────
  const [tagline,     setTagline]     = useState(careerPath?.tagline ?? '');
  const [intro,       setIntro]       = useState(careerPath?.intro ?? '');
  const [contentHtml, setContentHtml] = useState(careerPath?.description_html ?? '');

  // ── Section 5 — Curriculum Blocks ─────────────────────────────
  const [blocks, setBlocks] = useState(() => blocksFromCareerPath(careerPath));

  function handleTitleChange(v) {
    setTitle(v);
    if (!slugEdited) setSlug(slugifyForCareerPath(v));
  }

  function handleSlugChange(v) {
    setSlugEdited(true);
    setSlug(v);
  }

  function autoCalcDiscount() {
    const full = Number(fullPrice);
    const sale = Number(salePrice);
    if (full > 0 && sale > 0 && sale < full) {
      setDiscountPct(Math.round(((full - sale) / full) * 100));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!title.trim())    return setError('กรุณากรอกชื่อ Career Path');
    if (!slug.trim())     return setError('กรุณากรอก slug');

    const fd = new FormData();
    fd.set('title',         title);
    fd.set('slug',          slug);
    fd.set('status',        status);
    if (isPinned) fd.set('isPinned', 'on');
    fd.set('sortOrder',     String(sortOrder ?? 0));
    fd.set('cardDetail',    cardDetail);

    fd.set('coverImage_url',   coverUrl);
    fd.set('coverImage_alt',   coverAlt);
    fd.set('roadmapImage_url', roadmapUrl);
    fd.set('roadmapImage_alt', roadmapAlt);

    fd.set('price_fullPrice',   String(fullPrice   || 0));
    fd.set('price_salePrice',   String(salePrice   || 0));
    fd.set('price_discountPct', String(discountPct || 0));
    fd.set('price_currency',    currency);

    fd.set('links_detailUrl',  detailUrl);
    fd.set('links_signupUrl',  signupUrl);
    fd.set('links_outlineUrl', outlineUrl);

    fd.set('detail_tagline',     tagline);
    fd.set('detail_intro',       intro);
    fd.set('detail_contentHtml', contentHtml);
    // BulletTextarea fields are read directly off the underlying form
    // element, so we read them out of the live form here rather than
    // mirroring them into local state.
    const formEl = e.currentTarget;
    fd.set('detail_objectives',    formEl.elements.detail_objectives?.value    ?? '');
    fd.set('detail_suitableFor',   formEl.elements.detail_suitableFor?.value   ?? '');
    fd.set('detail_prerequisites', formEl.elements.detail_prerequisites?.value ?? '');
    fd.set('detail_benefits',      formEl.elements.detail_benefits?.value      ?? '');

    fd.set('curriculum_json', JSON.stringify(blocks));

    startTransition(async () => {
      try {
        const res = isEdit
          ? await updateCareerPath(careerPath.career_path_id, fd, courses)
          : await createCareerPath(fd, courses);
        if (res?.ok === false) {
          setError(res.error || 'บันทึกไม่สำเร็จ');
          return;
        }
        router.push('/admin/career-paths');
        router.refresh();
      } catch (err) {
        setError(err?.message ?? 'บันทึกไม่สำเร็จ');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Section 1 — ข้อมูลหลัก ───────────────────────────── */}
      <section className={sectionCls}>
        <h2 className="mb-4 text-base font-bold text-9e-navy dark:text-white">ข้อมูลหลัก</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">ชื่อ Career Path *</span>
            <input
              required
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">Slug *</span>
            <span className="mt-0.5 block text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
              จะถูกต่อท้ายด้วย <code>-career-path</code> อัตโนมัติ
            </span>
            <input
              required
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="prompt-engineer"
              className={inputCls + ' font-mono'}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div>
            <span className="text-sm font-medium text-9e-navy dark:text-white">สถานะ Upstream</span>
            <div className="mt-1 inline-flex rounded-9e-md border border-[var(--surface-border)] p-0.5">
              {['active', 'offline'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={
                    'rounded-9e-sm px-3 py-1.5 text-xs font-medium ' +
                    (status === s
                      ? 'bg-9e-action text-white'
                      : 'text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]')
                  }
                >
                  {s === 'active' ? 'Active' : 'Offline'}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-end gap-2 text-sm text-9e-navy dark:text-white">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="h-4 w-4"
            />
            ปักหมุด
          </label>

          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">ลำดับ Upstream</span>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-9e-navy dark:text-white">คำอธิบายสั้น (Card Detail)</span>
          <textarea
            rows={2}
            value={cardDetail}
            onChange={(e) => setCardDetail(e.target.value)}
            className={inputCls}
            placeholder="ข้อความสั้นๆ ที่แสดงบน card ในหน้ารวม"
          />
        </label>
      </section>

      {/* ── Section 2 — รูปภาพ ───────────────────────────────── */}
      <section className={sectionCls}>
        <h2 className="mb-4 text-base font-bold text-9e-navy dark:text-white">รูปภาพ</h2>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <ImageUploadField
              name="coverImage_url"
              currentUrl={coverUrl}
              folder="career-paths/covers"
              label="Cover Image"
              hint="แนะนำ 800×450px (16:9)"
              onChange={setCoverUrl}
            />
            <label className="block">
              <span className="text-xs font-medium text-9e-navy dark:text-white">Alt text</span>
              <input
                type="text"
                value={coverAlt}
                onChange={(e) => setCoverAlt(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>

          <div className="space-y-2">
            <ImageUploadField
              name="roadmapImage_url"
              currentUrl={roadmapUrl}
              folder="career-paths/roadmaps"
              label="Roadmap Image"
              hint="แนะนำ 1200×600px (2:1)"
              aspect="2/1"
              onChange={setRoadmapUrl}
            />
            <label className="block">
              <span className="text-xs font-medium text-9e-navy dark:text-white">Alt text</span>
              <input
                type="text"
                value={roadmapAlt}
                onChange={(e) => setRoadmapAlt(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
        </div>
      </section>

      {/* ── Section 3 — ราคา & ลิงก์ ─────────────────────────── */}
      <section className={sectionCls}>
        <h2 className="mb-4 text-base font-bold text-9e-navy dark:text-white">ราคา & ลิงก์</h2>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">ราคาเต็ม</span>
            <input
              type="number"
              value={fullPrice}
              onChange={(e) => setFullPrice(e.target.value)}
              onBlur={autoCalcDiscount}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">ราคาลด</span>
            <input
              type="number"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              onBlur={autoCalcDiscount}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">% ส่วนลด</span>
            <input
              type="number"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">สกุลเงิน</span>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">Detail URL</span>
            <input
              type="text"
              value={detailUrl}
              onChange={(e) => setDetailUrl(e.target.value)}
              placeholder="https://..."
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">Signup URL</span>
            <input
              type="text"
              value={signupUrl}
              onChange={(e) => setSignupUrl(e.target.value)}
              placeholder="https://..."
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">Outline URL</span>
            <span className="mt-0.5 block text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">PDF ดาวน์โหลด</span>
            <input
              type="text"
              value={outlineUrl}
              onChange={(e) => setOutlineUrl(e.target.value)}
              placeholder="https://..."
              className={inputCls}
            />
          </label>
        </div>
      </section>

      {/* ── Section 4 — รายละเอียด ───────────────────────────── */}
      <section className={sectionCls}>
        <h2 className="mb-4 text-base font-bold text-9e-navy dark:text-white">รายละเอียด</h2>

        <div className="grid gap-3">
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">Tagline</span>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">Intro</span>
            <textarea
              rows={3}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              className={inputCls}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <BulletTextarea
              name="detail_objectives"
              defaultValue={careerPath?.objectives ?? []}
              label="วัตถุประสงค์ (Objectives)"
              hint="1 บรรทัด = 1 ข้อ"
            />
            <BulletTextarea
              name="detail_suitableFor"
              defaultValue={careerPath?.suitable_for ?? []}
              label="เหมาะกับ (Suitable For)"
              hint="1 บรรทัด = 1 ข้อ"
            />
            <BulletTextarea
              name="detail_prerequisites"
              defaultValue={careerPath?.prerequisites ?? []}
              label="พื้นฐานที่ควรมี (Prerequisites)"
              hint="1 บรรทัด = 1 ข้อ"
            />
            <BulletTextarea
              name="detail_benefits"
              defaultValue={careerPath?.benefits ?? []}
              label="ประโยชน์ที่ได้รับ (Benefits)"
              hint="1 บรรทัด = 1 ข้อ"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-9e-navy dark:text-white">
                เนื้อหา (HTML)
                <span className="ml-2 text-xs font-normal text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  รองรับ HTML/CSS inline
                </span>
              </label>
              <textarea
                value={contentHtml}
                onChange={(e) => setContentHtml(e.target.value)}
                rows={14}
                spellCheck={false}
                placeholder={'<h2>หัวข้อ</h2>\n<p>รายละเอียด...</p>'}
                className="mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-9e-ice px-3 py-2 font-mono text-xs text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-9e-navy dark:text-white">
                Live Preview
                <span className="ml-2 text-xs font-normal text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  อัปเดตทันทีตามที่พิมพ์
                </span>
              </label>
              <div
                className="prose prose-sm dark:prose-invert mt-1 min-h-[18rem] max-w-none overflow-auto rounded-9e-md border border-[var(--surface-border)] bg-white p-3 text-sm dark:bg-[#0D1B2A] dark:text-white"
                dangerouslySetInnerHTML={{
                  __html: contentHtml || '<span class="text-gray-300">ยังไม่มีเนื้อหา</span>',
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 5 — Curriculum Blocks ─────────────────────── */}
      <section className={sectionCls}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-9e-navy dark:text-white">หลักสูตรในเส้นทาง (Curriculum)</h2>
          <button
            type="button"
            onClick={() =>
              setBlocks((prev) => [
                ...prev,
                {
                  kind: 'fixed',
                  title: '',
                  description: '',
                  chooseMin: 0,
                  chooseMax: 0,
                  sortOrder: prev.length,
                  items: [],
                },
              ])
            }
            className="inline-flex items-center gap-1 rounded-9e-md bg-9e-action px-3 py-1.5 text-xs font-bold text-white hover:bg-9e-brand"
          >
            <Plus className="h-3.5 w-3.5" /> เพิ่มกลุ่ม
          </button>
        </div>

        <CurriculumBlocks blocks={blocks} setBlocks={setBlocks} courses={courses} />
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-10 -mx-6 flex justify-end gap-2 border-t border-[var(--surface-border)] bg-white px-6 py-3 dark:bg-[#111d2c]">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก…' : isEdit ? 'บันทึก' : 'สร้าง'}
        </button>
      </div>
    </form>
  );
}

// ── Curriculum sub-components ────────────────────────────────────

function CurriculumBlocks({ blocks, setBlocks, courses }) {
  function updateBlock(index, patch) {
    setBlocks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...patch } : b))
    );
  }
  function removeBlock(index) {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }
  function moveBlock(index, dir) {
    setBlocks((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((b, i) => ({ ...b, sortOrder: i }));
    });
  }
  function addItem(blockIndex) {
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === blockIndex
          ? {
              ...b,
              items: [
                ...b.items,
                {
                  kind: 'public',
                  course_id: '',
                  externalName: '',
                  externalUrl: '',
                  note: '',
                },
              ],
            }
          : b
      )
    );
  }
  function updateItem(blockIndex, itemIndex, patch) {
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === blockIndex
          ? {
              ...b,
              items: b.items.map((it, j) =>
                j === itemIndex ? { ...it, ...patch } : it
              ),
            }
          : b
      )
    );
  }
  function removeItem(blockIndex, itemIndex) {
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === blockIndex
          ? { ...b, items: b.items.filter((_, j) => j !== itemIndex) }
          : b
      )
    );
  }

  if (blocks.length === 0) {
    return (
      <p className="rounded-9e-md border border-dashed border-[var(--surface-border)] px-3 py-6 text-center text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
        ยังไม่มีกลุ่มหลักสูตร — กด <strong>เพิ่มกลุ่ม</strong> เพื่อสร้างกลุ่มแรก
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, bi) => (
        <div
          key={bi}
          className="rounded-9e-md border border-[var(--surface-border)] bg-9e-ice/40 p-4 dark:bg-[#0D1B2A]/40"
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="inline-flex rounded-9e-md border border-[var(--surface-border)] bg-white p-0.5 dark:bg-[#111d2c]">
              {['fixed', 'choice'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => updateBlock(bi, { kind: k })}
                  className={
                    'rounded-9e-sm px-2.5 py-1 text-xs font-medium ' +
                    (block.kind === k
                      ? 'bg-9e-action text-white'
                      : 'text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]')
                  }
                >
                  {k === 'fixed' ? 'Fixed (เรียนทุกตัว)' : 'Choice (เลือก)'}
                </button>
              ))}
            </div>

            <span className="ml-auto inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveBlock(bi, -1)}
                disabled={bi === 0}
                className="rounded-9e-sm p-1 text-9e-navy hover:bg-9e-ice disabled:opacity-30 dark:text-white dark:hover:bg-[#0D1B2A]"
                aria-label="เลื่อนขึ้น"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => moveBlock(bi, 1)}
                disabled={bi === blocks.length - 1}
                className="rounded-9e-sm p-1 text-9e-navy hover:bg-9e-ice disabled:opacity-30 dark:text-white dark:hover:bg-[#0D1B2A]"
                aria-label="เลื่อนลง"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => removeBlock(bi)}
                className="rounded-9e-sm p-1 text-red-500 hover:bg-red-50"
                aria-label="ลบกลุ่ม"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-9e-navy dark:text-white">ชื่อกลุ่ม</span>
              <input
                type="text"
                value={block.title}
                onChange={(e) => updateBlock(bi, { title: e.target.value })}
                className={inputCls}
              />
            </label>

            {block.kind === 'choice' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">เลือกขั้นต่ำ</span>
                  <input
                    type="number"
                    value={block.chooseMin ?? 0}
                    onChange={(e) =>
                      updateBlock(bi, { chooseMin: Number(e.target.value) || 0 })
                    }
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">เลือกสูงสุด</span>
                  <input
                    type="number"
                    value={block.chooseMax ?? 0}
                    onChange={(e) =>
                      updateBlock(bi, { chooseMax: Number(e.target.value) || 0 })
                    }
                    className={inputCls}
                  />
                </label>
              </div>
            )}
          </div>

          <label className="mt-3 block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">รายละเอียดกลุ่ม</span>
            <textarea
              rows={2}
              value={block.description}
              onChange={(e) => updateBlock(bi, { description: e.target.value })}
              className={inputCls}
            />
          </label>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-9e-navy dark:text-white">
                คอร์สในกลุ่ม ({block.items.length})
              </span>
              <button
                type="button"
                onClick={() => addItem(bi)}
                className="inline-flex items-center gap-1 rounded-9e-md border border-9e-action px-2.5 py-1 text-xs font-medium text-9e-action hover:bg-9e-action hover:text-white"
              >
                <Plus className="h-3 w-3" /> เพิ่มคอร์ส
              </button>
            </div>

            {block.items.length === 0 && (
              <p className="rounded-9e-sm border border-dashed border-[var(--surface-border)] px-3 py-3 text-center text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                ยังไม่มีคอร์สในกลุ่มนี้
              </p>
            )}

            {block.items.map((item, ii) => (
              <CurriculumItemRow
                key={ii}
                item={item}
                courses={courses}
                onChange={(patch) => updateItem(bi, ii, patch)}
                onRemove={() => removeItem(bi, ii)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CurriculumItemRow({ item, courses, onChange, onRemove }) {
  return (
    <div className="rounded-9e-sm border border-[var(--surface-border)] bg-white p-3 dark:bg-[#111d2c]">
      <div className="mb-2 flex items-center gap-2">
        <div className="inline-flex rounded-9e-md border border-[var(--surface-border)] p-0.5">
          {['public', 'external'].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange({ kind: k })}
              className={
                'rounded-9e-sm px-2 py-1 text-[11px] font-medium ' +
                (item.kind === k
                  ? 'bg-9e-action text-white'
                  : 'text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]')
              }
            >
              {k === 'public' ? 'Public Course' : 'ภายนอก'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded-9e-sm p-1 text-red-500 hover:bg-red-50"
          aria-label="ลบคอร์ส"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {item.kind === 'public' ? (
        <CourseSelector
          value={item.course_id}
          onChange={(course_id) => onChange({ course_id })}
          courses={courses}
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          <label className="block">
            <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">ชื่อคอร์ส</span>
            <input
              type="text"
              value={item.externalName}
              onChange={(e) => onChange({ externalName: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">ลิงก์</span>
            <input
              type="text"
              value={item.externalUrl}
              onChange={(e) => onChange({ externalUrl: e.target.value })}
              placeholder="https://..."
              className={inputCls}
            />
          </label>
        </div>
      )}

      <label className="mt-2 block">
        <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">หมายเหตุ</span>
        <input
          type="text"
          value={item.note ?? ''}
          onChange={(e) => onChange({ note: e.target.value })}
          className={inputCls}
        />
      </label>
    </div>
  );
}

function CourseSelector({ value, onChange, courses }) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);

  // The selected course's display row — looked up once per render so the
  // pill stays stable even when the dropdown is closed.
  const selected = useMemo(
    () => courses.find((c) => c.course_id === value) ?? null,
    [courses, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses.slice(0, 30);
    return courses
      .filter((c) => {
        const id   = String(c.course_id ?? '').toLowerCase();
        const name = String(c.course_name ?? c.name ?? '').toLowerCase();
        return id.includes(q) || name.includes(q);
      })
      .slice(0, 30);
  }, [courses, query]);

  return (
    <div className="relative">
      {selected ? (
        <div className="flex items-center gap-2 rounded-9e-sm border border-[var(--surface-border)] bg-9e-ice px-2 py-1.5 text-xs dark:bg-[#0D1B2A]">
          <span className="font-mono text-9e-action">{selected.course_id}</span>
          <span className="flex-1 truncate text-9e-navy dark:text-white">
            {selected.course_name ?? selected.name ?? '—'}
          </span>
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(true);
            }}
            className="text-9e-slate-dp-50 hover:text-red-500"
          >
            เปลี่ยน
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-9e-slate-dp-50" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="ค้นหา course_id หรือชื่อคอร์ส…"
            className={inputCls + ' pl-7'}
          />
          {open && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-9e-md border border-[var(--surface-border)] bg-white shadow-9e-lg dark:bg-[#111d2c]">
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-9e-slate-dp-50">ไม่พบคอร์ส</p>
              )}
              {filtered.map((c) => (
                <button
                  key={c._id || c.course_id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(c.course_id);
                    setQuery('');
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-9e-ice dark:hover:bg-[#0D1B2A]"
                >
                  <span className="font-mono text-9e-action">{c.course_id}</span>
                  <span className="flex-1 truncate text-9e-navy dark:text-white">
                    {c.course_name ?? c.name ?? '—'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
