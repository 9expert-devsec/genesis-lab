'use client';

import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { CourseBodyEditor } from '@/components/admin/CourseBodyEditor';
import { seoLengthState } from '@/lib/seo/seoLengths';
import { PROGRAM_COPY_ICON_KEYS, programCopyIcon } from '@/lib/programCopyIcons';
import {
  PROGRAM_COPY_MAX_WHY_ITEMS,
  PROGRAM_COPY_MAX_BENEFIT_CARDS,
} from '@/lib/pageConfigUpdate';

/**
 * "เนื้อหาหน้าโปรแกรม" — the PROGRAM tab's copy editor (ProgramPageConfig
 * introHeading … benefitCards). It edits the EditForm's own `form` state, so
 * the existing บันทึก sends these keys through saveProgramConfig and
 * lib/pageConfigUpdate.shapeProgramCopy, which trims, drops empty rows, caps
 * the lists and rejects an unknown icon.
 *
 * LENGTH GUIDES ARE WARNINGS: the counter turns amber outside the guide and
 * the save still goes through. Counted in graphemes (lib/seo/seoLengths).
 *
 * The intro editor is CourseBodyEditor, which seeds once and never re-seeds
 * (its header records the revert bug that rules out SimpleRichTextEditor).
 * `editorKey` remounts it when the form is reset.
 */

export const EMPTY_PROGRAM_COPY = Object.freeze({
  introHeading: '',
  introHtml: '',
  whyHeading: '',
  whyLead: '',
  whyItems: [],
  benefitHeading: '',
  benefitLead: '',
  benefitCards: [],
});

/** The editor's starting state from a stored config. */
export function programCopyFromConfig(config) {
  return {
    introHeading: config?.introHeading ?? '',
    introHtml: config?.introHtml ?? '',
    whyHeading: config?.whyHeading ?? '',
    whyLead: config?.whyLead ?? '',
    whyItems: (config?.whyItems ?? []).map((r) => ({ title: r?.title ?? '', description: r?.description ?? '' })),
    benefitHeading: config?.benefitHeading ?? '',
    benefitLead: config?.benefitLead ?? '',
    benefitCards: (config?.benefitCards ?? []).map((r) => ({
      icon: r?.icon ?? '',
      title: r?.title ?? '',
      description: r?.description ?? '',
    })),
  };
}

const INPUT =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-9e-navy dark:text-white';
const SMALL_BTN =
  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-9e-navy hover:bg-9e-ice disabled:opacity-30 dark:border-[#1e3a5f] dark:bg-9e-navy dark:text-white';

/** `{ length, over }` for a min–max guide; an empty value is never amber. */
function guideState(value, min, max) {
  const { length } = seoLengthState(value, max);
  const over = length > 0 && (length > max || (min != null && length < min));
  return { length, over };
}

function Counter({ value, min, max }) {
  const { length, over } = guideState(value, min, max);
  return (
    <span className={'ml-2 font-normal ' + (over ? 'text-amber-600 dark:text-amber-400' : '')}>
      {length}/{min != null ? `${min}–${max}` : `≤${max}`}
    </span>
  );
}

/** Plain text of each <p> in the intro HTML, for the per-paragraph guide. */
function introParagraphs(html) {
  return String(html ?? '')
    .split(/<\/p>/i)
    .map((chunk) => chunk.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim())
    .filter(Boolean);
}

function Label({ children, hint }) {
  return (
    <p className="mb-1 text-xs font-semibold text-9e-slate-dp-50 dark:text-[#94a3b8]">
      {children}
      {hint && <span className="ml-2 font-normal italic">{hint}</span>}
    </p>
  );
}

function move(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function RowControls({ index, count, onMove, onRemove }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" title="เลื่อนขึ้น" className={SMALL_BTN} disabled={index === 0} onClick={() => onMove(index, -1)}>
        <ChevronUp className="h-4 w-4" />
      </button>
      <button type="button" title="เลื่อนลง" className={SMALL_BTN} disabled={index === count - 1} onClick={() => onMove(index, 1)}>
        <ChevronDown className="h-4 w-4" />
      </button>
      <button type="button" title="ลบ" className={`${SMALL_BTN} text-red-600 dark:text-red-400`} onClick={() => onRemove(index)}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddButton({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 self-start rounded-lg border border-dashed border-9e-action/50 px-3 py-1.5 text-xs font-semibold text-9e-action hover:bg-white disabled:opacity-40 dark:text-9e-air dark:hover:bg-9e-navy"
    >
      <Plus className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function IconPicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="ไอคอน" className="flex flex-wrap gap-1">
      {PROGRAM_COPY_ICON_KEYS.map((key) => {
        const Icon = programCopyIcon(key);
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            title={key}
            onClick={() => onChange(key)}
            className={
              'inline-flex h-8 w-8 items-center justify-center rounded-md border ' +
              (active
                ? 'border-9e-action bg-9e-action text-white'
                : 'border-gray-200 bg-white text-9e-navy hover:bg-9e-ice dark:border-[#1e3a5f] dark:bg-9e-navy dark:text-white')
            }
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

function Group({ title, children }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white/60 p-3 dark:border-[#1e3a5f] dark:bg-9e-navy/40">
      <legend className="px-1 text-xs font-bold text-9e-navy dark:text-white">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ProgramCopyPanel({ form, setForm, editorKey }) {
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const onText = (key) => (e) => set(key, e.target.value);

  const setRow = (listKey, i, field, value) =>
    setForm((f) => ({
      ...f,
      [listKey]: f[listKey].map((r, j) => (j === i ? { ...r, [field]: value } : r)),
    }));
  const moveRow = (listKey) => (i, dir) => setForm((f) => ({ ...f, [listKey]: move(f[listKey], i, dir) }));
  const removeRow = (listKey) => (i) => setForm((f) => ({ ...f, [listKey]: f[listKey].filter((_, j) => j !== i) }));
  const addRow = (listKey, row) => setForm((f) => ({ ...f, [listKey]: [...f[listKey], row] }));

  const paragraphs = introParagraphs(form.introHtml);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-9e-action/20 p-3" aria-labelledby="program-copy-title">
      <h3 id="program-copy-title" className="text-sm font-bold text-9e-navy dark:text-white">
        เนื้อหาหน้าโปรแกรม
        <span className="ml-2 text-xs font-normal italic text-9e-slate-dp-50">
          เว้นว่างทั้งกลุ่ม = ไม่แสดงส่วนนั้นบนหน้าเว็บ · ตัวนับสีเหลือง = เตือนเท่านั้น บันทึกได้
        </span>
      </h3>

      {/* ── Section 1: intro ── */}
      <Group title="ส่วนที่ 1 — แนะนำโปรแกรม (ใต้ Hero)">
        <div>
          <Label>
            หัวข้อ (H2)
            <Counter value={form.introHeading} min={50} max={80} />
          </Label>
          <input type="text" value={form.introHeading} onChange={onText('introHeading')} className={INPUT} />
        </div>
        <div>
          <Label hint="แต่ละย่อหน้า 150–320 ตัวอักษร">
            เนื้อหา
            {paragraphs.map((p, i) => (
              <Counter key={i} value={p} min={150} max={320} />
            ))}
          </Label>
          <CourseBodyEditor
            key={editorKey}
            value={form.introHtml}
            onChange={(html) => set('introHtml', html)}
            placeholder="ย่อหน้าแนะนำโปรแกรม…"
          />
        </div>
      </Group>

      {/* ── Why ── */}
      <Group title="ส่วนที่ 2A — ทำไมต้องเรียน (ก่อน FAQ)">
        <div>
          <Label>หัวข้อ (H2)</Label>
          <input type="text" value={form.whyHeading} onChange={onText('whyHeading')} className={INPUT} />
        </div>
        <div>
          <Label>
            คำนำ
            <Counter value={form.whyLead} min={100} max={180} />
          </Label>
          <textarea value={form.whyLead} onChange={onText('whyLead')} rows={2} className={INPUT} />
        </div>
        {form.whyItems.map((row, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2 w-5 shrink-0 text-right text-xs text-9e-slate-dp-50">{i + 1}.</span>
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[2fr_3fr]">
              <div>
                <Label>
                  หัวข้อ
                  <Counter value={row.title} max={45} />
                </Label>
                <input type="text" value={row.title} onChange={(e) => setRow('whyItems', i, 'title', e.target.value)} className={INPUT} />
              </div>
              <div>
                <Label>
                  รายละเอียด
                  <Counter value={row.description} max={90} />
                </Label>
                <input
                  type="text"
                  value={row.description}
                  onChange={(e) => setRow('whyItems', i, 'description', e.target.value)}
                  className={INPUT}
                />
              </div>
            </div>
            <div className="mt-5">
              <RowControls index={i} count={form.whyItems.length} onMove={moveRow('whyItems')} onRemove={removeRow('whyItems')} />
            </div>
          </div>
        ))}
        <AddButton
          onClick={() => addRow('whyItems', { title: '', description: '' })}
          disabled={form.whyItems.length >= PROGRAM_COPY_MAX_WHY_ITEMS}
        >
          เพิ่มเหตุผล ({form.whyItems.length}/{PROGRAM_COPY_MAX_WHY_ITEMS})
        </AddButton>
      </Group>

      {/* ── Benefit ── */}
      <Group title="ส่วนที่ 2B — ประโยชน์ต่อองค์กร (การ์ด)">
        <div>
          <Label>หัวข้อ (H2)</Label>
          <input type="text" value={form.benefitHeading} onChange={onText('benefitHeading')} className={INPUT} />
        </div>
        <div>
          <Label>
            คำนำ
            <Counter value={form.benefitLead} max={110} />
          </Label>
          <input type="text" value={form.benefitLead} onChange={onText('benefitLead')} className={INPUT} />
        </div>
        {form.benefitCards.map((card, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-gray-200 p-2 dark:border-[#1e3a5f]">
            <span className="mt-2 w-5 shrink-0 text-right text-xs text-9e-slate-dp-50">{i + 1}.</span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div>
                <Label>ไอคอน</Label>
                <IconPicker value={card.icon} onChange={(key) => setRow('benefitCards', i, 'icon', key)} />
              </div>
              <div>
                <Label>
                  หัวข้อการ์ด
                  <Counter value={card.title} max={30} />
                </Label>
                <input type="text" value={card.title} onChange={(e) => setRow('benefitCards', i, 'title', e.target.value)} className={INPUT} />
              </div>
              <div>
                <Label>
                  รายละเอียด
                  <Counter value={card.description} max={110} />
                </Label>
                <textarea
                  value={card.description}
                  onChange={(e) => setRow('benefitCards', i, 'description', e.target.value)}
                  rows={2}
                  className={INPUT}
                />
              </div>
            </div>
            <RowControls
              index={i}
              count={form.benefitCards.length}
              onMove={moveRow('benefitCards')}
              onRemove={removeRow('benefitCards')}
            />
          </div>
        ))}
        <AddButton
          onClick={() => addRow('benefitCards', { icon: 'sparkles', title: '', description: '' })}
          disabled={form.benefitCards.length >= PROGRAM_COPY_MAX_BENEFIT_CARDS}
        >
          เพิ่มการ์ด ({form.benefitCards.length}/{PROGRAM_COPY_MAX_BENEFIT_CARDS})
        </AddButton>
      </Group>
    </section>
  );
}
