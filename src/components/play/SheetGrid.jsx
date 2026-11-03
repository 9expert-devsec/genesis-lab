import { Check, X } from 'lucide-react';

import { displayValue } from '@/lib/play/game/view';

/**
 * The level's sheet. Answer cells show their expected value as a faint ghost
 * until the player's formula lands in them; then green ✓ (match), red ✗ with
 * the produced value (mismatch), or the error code. Every state carries an
 * icon or text, not colour alone.
 *
 * Cells are not focusable on purpose: while the formula input has focus, a
 * tap or click on a cell inserts its ref. The parent prevents the blur on
 * POINTERDOWN (mouse and touch alike) and inserts on CLICK, so a finger that
 * starts on a cell to scroll the grid sideways never inserts anything.
 */
export function SheetGrid({ cols, rows, sheet, formats, answers, results, activeCells, anchor, refCells, onCellPointerDown, onCellClick }) {
  const refSet = new Set(refCells);
  const activeSet = new Set(activeCells);
  return (
    <div className="overflow-x-auto rounded-[16px] border border-white/10 bg-[#132638]">
      <div
        role="grid"
        aria-label="ตารางข้อมูลของด่าน"
        aria-readonly="true"
        className="grid min-w-max font-en text-sm"
        style={{ gridTemplateColumns: `44px repeat(${cols.length}, minmax(112px, 1fr))` }}
      >
        <div role="row" className="contents">
          <div role="columnheader" className="sticky left-0 border-b border-r border-white/10 bg-[#0D1B2A]" aria-label="หัวตาราง" />
          {cols.map((c) => (
            <div key={c} role="columnheader" className="border-b border-r border-white/10 bg-[#0D1B2A] py-1.5 text-center text-xs font-bold text-white/50 last:border-r-0">
              {c}
            </div>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r} role="row" className="contents">
            <div role="rowheader" className="sticky left-0 flex items-center justify-center border-b border-r border-white/10 bg-[#0D1B2A] text-xs font-bold text-white/50">
              {r}
            </div>
            {cols.map((c) => {
              const ref = `${c}${r}`;
              const fmt = formats[ref];
              const result = results[ref];
              const isAnswer = ref in answers;
              const header = r === 1;
              const numeric = typeof (result ? result.value : isAnswer ? answers[ref] : sheet[ref]) === 'number';

              let content;
              let label;
              let tone = header ? 'bg-white/5 font-heading font-bold text-white' : 'text-white/90';
              if (result) {
                const text = displayValue(result.value, fmt);
                const Icon = result.ok ? Check : X;
                tone = result.ok ? 'bg-[#22C55E]/15 text-[#86EFAC]' : 'bg-red-500/15 text-red-300';
                content = (
                  <span className="flex w-full items-center justify-between gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className={numeric ? 'tabular-nums' : ''}>{text}</span>
                  </span>
                );
                label = `${ref} ${result.ok ? 'ถูก' : 'ยังไม่ตรง'} ${text}`;
              } else if (isAnswer) {
                const text = displayValue(answers[ref], fmt);
                tone = 'text-white/25 italic';
                content = text;
                label = `${ref} คำตอบเงา ${text}`;
              } else {
                const text = displayValue(sheet[ref], fmt);
                content = text;
                label = text ? `${ref} ${text}` : `${ref} ว่าง`;
              }

              const ring = refSet.has(ref)
                ? 'ring-2 ring-inset ring-[#48B0FF]'
                : ref === anchor
                  ? 'ring-2 ring-inset ring-[#D4F73F]'
                  : activeSet.has(ref)
                    ? 'outline-dashed outline-1 -outline-offset-4 outline-[#D4F73F]/50'
                    : '';

              return (
                <div
                  key={ref}
                  role="gridcell"
                  aria-label={label}
                  onPointerDown={(e) => onCellPointerDown(e, ref)}
                  onClick={() => onCellClick(ref)}
                  className={`flex min-h-[40px] cursor-cell items-center border-b border-r border-white/10 px-3 py-2 last:border-r-0 ${
                    numeric ? 'justify-end' : 'justify-start'
                  } ${tone} ${ring}`}
                >
                  {content}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SheetLegend() {
  const item = 'inline-flex items-center gap-1.5';
  const swatch = 'inline-block h-3.5 w-3.5 rounded-[3px]';
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/60" aria-label="คำอธิบายสี">
      <li className={item}>
        <span className={`${swatch} border border-white/20 italic`} aria-hidden="true" />
        <span className="italic text-white/40">ตัวเอียงจาง</span> = คำตอบเงา
      </li>
      <li className={item}>
        <Check className="h-3.5 w-3.5 text-[#86EFAC]" aria-hidden="true" />
        <span className={`${swatch} bg-[#22C55E]/30`} aria-hidden="true" /> ถูกต้อง
      </li>
      <li className={item}>
        <X className="h-3.5 w-3.5 text-red-300" aria-hidden="true" />
        <span className={`${swatch} bg-red-500/30`} aria-hidden="true" /> ยังไม่ตรง
      </li>
      <li className={item}>
        <span className={`${swatch} ring-2 ring-inset ring-[#48B0FF]`} aria-hidden="true" /> ช่องที่สูตรอ้างอิง
      </li>
      <li className={item}>
        <span className={`${swatch} ring-2 ring-inset ring-[#D4F73F]`} aria-hidden="true" /> ช่องที่กำลังพิมพ์
      </li>
    </ul>
  );
}
