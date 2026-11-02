'use client';

import { useRef } from 'react';
import { Play, RotateCcw } from 'lucide-react';

const REF_TEXT = 'text-[#48B0FF]';

/**
 * Name box, fx, the formula input, Run and Reset.
 *
 * The input's own text is transparent and a mirror underneath paints the same
 * characters with refs in blue — the only way to colour part of an <input>.
 * Both use the same font, size and padding, and the mirror follows the input's
 * horizontal scroll, so the caret always sits on the painted text.
 */
export function FormulaBar({ inputRef, anchor, value, spans, disabled, running, onChange, onRun, onReset }) {
  const mirrorRef = useRef(null);

  const parts = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) parts.push({ text: value.slice(cursor, s.start) });
    parts.push({ text: value.slice(s.start, s.end), ref: true });
    cursor = s.end;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor) });

  return (
    <div className="flex flex-wrap items-stretch gap-2 rounded-[16px] border border-white/10 bg-[#132638] p-2">
      <div
        className="flex min-w-[64px] items-center justify-center rounded-[10px] bg-[#0D1B2A] px-3 font-mono text-sm font-bold text-[#D4F73F]"
        aria-label={`ช่องที่กำลังพิมพ์ ${anchor}`}
      >
        {anchor}
      </div>
      <span className="flex items-center px-1 font-en text-sm font-bold italic text-white/50" aria-hidden="true">
        fx
      </span>
      <div className="relative min-w-[200px] flex-1 rounded-[10px] bg-[#0D1B2A] focus-within:ring-2 focus-within:ring-[#D4F73F]">
        <label htmlFor="play-formula" className="sr-only">
          สูตรสำหรับช่อง {anchor}
        </label>
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre px-3 py-2.5 font-mono text-base leading-6 text-white"
        >
          {parts.map((p, i) => (
            <span key={i} className={p.ref ? REF_TEXT : undefined}>
              {p.text}
            </span>
          ))}
        </div>
        <input
          ref={inputRef}
          id="play-formula"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          disabled={disabled}
          placeholder="พิมพ์สูตร เริ่มด้วย ="
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (mirrorRef.current) mirrorRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onRun();
            }
          }}
          className="relative w-full bg-transparent px-3 py-2.5 font-mono text-base leading-6 text-transparent caret-white outline-none placeholder:font-thai placeholder:text-white/30 disabled:cursor-not-allowed"
        />
      </div>
      <button
        type="button"
        onClick={onRun}
        disabled={disabled || running}
        className="inline-flex items-center gap-2 rounded-[10px] bg-[#D4F73F] px-5 font-bold text-[#0D1B2A] transition-colors hover:bg-[#D8F852] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Play className="h-4 w-4 fill-current" aria-hidden="true" />
        รันสูตร
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={running}
        aria-label="ล้างสูตรและผลลัพธ์"
        title="ล้างสูตร"
        className="inline-flex w-11 items-center justify-center rounded-[10px] border border-white/20 text-white/70 transition-colors hover:border-white hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

const SYMBOLS = ['=', '*', '(', ')', ',', '"', '<', '>', '+', '-'];

/**
 * Keys that insert at the caret. mousedown is prevented so the input keeps
 * focus (and its selection) while the key is pressed.
 */
export function QuickKeys({ functions, disabled, onInsert }) {
  const key =
    'min-w-[40px] rounded-[8px] border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-sm transition-colors hover:border-[#D4F73F] hover:text-[#D4F73F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4F73F] disabled:opacity-40';
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="ปุ่มลัดพิมพ์สูตร">
      <span className="mr-1 font-en text-xs font-bold uppercase tracking-widest text-white/40">Quick keys</span>
      {SYMBOLS.map((s) => (
        <button key={s} type="button" disabled={disabled} className={`${key} text-white`} onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(s)} aria-label={`พิมพ์ ${s}`}>
          {s}
        </button>
      ))}
      {functions.map((fn) => (
        <button
          key={fn}
          type="button"
          disabled={disabled}
          className={`${key} text-[#48B0FF]`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(`${fn}(`)}
          aria-label={`พิมพ์ฟังก์ชัน ${fn}`}
        >
          {fn}
        </button>
      ))}
    </div>
  );
}
