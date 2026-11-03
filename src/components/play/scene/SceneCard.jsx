'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import { capProps, focusRow, matchedSum, platesFor, rateRefs, sceneRows } from '@/lib/play/game/scene';
import { displayValue } from '@/lib/play/game/view';

import { Banknote, Box, C, Coin, ContactShadow, Glass, MiniSvg, Person, StackCoin } from './props';
import styles from './scene.module.css';

/**
 * Right column on a level with a `scene`: a small simulator that acts out the
 * player's fill-down row by row, in place of the scoreboard. Row states come
 * from the grid's own `results` (see sceneRows); the stage is an SVG overlay in
 * a 248×190 viewBox on top of a 3D backdrop image, so everything scales with
 * the card while keeping its aspect ratio.
 */

const VB_W = 248;
const VB_H = 190;
// `!`: globals.css pins every p and span to Google Sans with !important.
const MONO = '!font-[family-name:var(--font-play-mono)]';
const MONO_STYLE = { fontFamily: 'var(--font-play-mono), ui-monospace, monospace' };

const IMAGES = {
  'counter-register': [421, 248],
  'cash-register': [249, 269],
  'coin-jar': [194, 232],
  'pin-dollar': [150, 231],
  'delivery-van': [386, 243],
};

const SCENES = {
  toppings: { name: 'Coffee counter', Stage: ToppingsStage, Props: ToppingsProps, Total: ToppingsTotal },
  checkout: { name: 'Coffee counter', Stage: CheckoutStage, Props: CupsProps, Total: sumTotal('ยอดขายวันนี้'), float: true },
  change: { name: 'Cash register', Stage: ChangeStage, Props: ChangeProps, Total: sumTotal('ทอนไปแล้ว'), float: true },
  split: { name: 'Tip jar', Stage: SplitStage, Props: SplitProps, Total: SplitTotal },
  delivery: { name: 'Delivery van', Stage: DeliveryStage, Props: BoxProps, Total: sumTotal('ออเดอร์ขึ้นรถแล้ว'), float: true },
  vat: { name: 'VAT desk', Stage: VatStage, Props: VatProps, Total: VatTotal },
};

export function SceneCard({ kind, level, results, running, formats, formula }) {
  const scene = SCENES[kind];
  const rows = sceneRows(level, results, { running });
  const fmt = formats[rows[0].ref];
  const ctx = { level, rows, fmt, formula, sheet: level.sheet, vat: kind === 'vat' ? vatContext(level, rows, formula) : null };
  const { Stage, Props, Total } = scene;
  return (
    <section aria-labelledby="play-scene-title" className="rounded-[20px] border border-white/10 bg-[#132638] p-5">
      <p className="font-en text-xs font-bold uppercase tracking-[0.14em] text-white/50">{scene.name}</p>
      <h2 id="play-scene-title" className="mt-1 break-words font-heading text-sm font-bold text-white">
        ด่าน {level.id} · {level.title}
      </h2>

      <div className="relative mx-auto mt-4 aspect-[248/190] w-full max-w-[420px] overflow-hidden rounded-[14px] bg-[#0B1630]" aria-hidden="true">
        <Stage {...ctx} />
      </div>

      <ul className="mt-4 flex flex-col gap-1" aria-label="ผลแต่ละแถว">
        {rows.map((r) => (
          <SceneRow key={r.ref} row={r} fmt={fmt} float={scene.float}>
            <Props row={r} {...ctx} />
          </SceneRow>
        ))}
      </ul>

      <div className="mt-4 rounded-[14px] bg-[#0D1B2A]/70 px-4 py-3" role="status" aria-live="polite">
        <Total {...ctx} />
      </div>
    </section>
  );
}

// ── shared pieces ────────────────────────────────────────────────────────────

const ROW_TONE = {
  match: { bg: '', label: 'text-white/85', value: 'text-[#86EFAC]' },
  current: { bg: 'bg-[#60A5FA]/10', label: 'text-white', value: 'text-[#60A5FA]' },
  error: { bg: 'bg-[#F87171]/[0.08]', label: 'text-white/85', value: 'text-[#F87171]' },
  shadow: { bg: '', label: 'text-white/35', value: 'text-white/30' },
};

function SceneRow({ row, fmt, float, children }) {
  const tone = ROW_TONE[row.state];
  const text = row.state === 'shadow' ? '—' : displayValue(row.value, fmt);
  return (
    <li className={`relative grid grid-cols-[minmax(0,5rem)_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-sm ${tone.bg}`}>
      <span className={`truncate ${tone.label}`}>{row.label}</span>
      <span className="relative flex min-w-0 items-center gap-1 overflow-hidden">{children}</span>
      <span className={`${MONO} text-right text-sm tabular-nums ${tone.value}`}>{text}</span>
      {float && (row.state === 'current' || row.state === 'match') && (
        <span className={`${MONO} pointer-events-none absolute left-[6rem] top-0 text-xs font-bold text-[#D4F73F] ${styles.float}`} aria-hidden="true">
          +{displayValue(row.value, fmt)}
        </span>
      )}
    </li>
  );
}

/** `+n` overflow label after a capped group of row props. */
const Overflow = ({ n }) => (n ? <span className={`${MONO} text-xs text-white/50`}>×{n}</span> : null);

function BigNumber({ value, unit, tone = 'text-[#86EFAC]', countUp = false, fmt }) {
  const shown = useCountUp(value, countUp);
  return (
    <p className="mt-0.5 flex items-baseline gap-2">
      <span className={`${MONO} text-3xl font-bold tabular-nums ${tone}`}>
        {typeof value === 'number' ? displayValue(countUp ? shown : value, fmt) : value}
      </span>
      {unit && <span className="text-xs text-white/50">{unit}</span>}
    </p>
  );
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/** Counts from the last shown number to `value` over ~400ms; jumps when off. */
function useCountUp(value, enabled) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (!enabled || typeof value !== 'number' || reducedMotion() || from.current === value) {
      from.current = value;
      setShown(value);
      return undefined;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / 400);
      const v = a + (value - a) * (1 - (1 - k) ** 3);
      setShown(k < 1 ? Math.round(v) : value);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, enabled]);
  return shown;
}

function sumTotal(label) {
  return function SumTotal({ rows, fmt }) {
    return (
      <>
        <p className="text-xs text-white/60">{label}</p>
        <BigNumber value={matchedSum(rows)} unit="บาท" fmt={fmt} countUp />
      </>
    );
  };
}

/**
 * Backdrop image, placed in viewBox units so it lines up with the overlay.
 * Only the shown level renders a scene, so its images load eagerly.
 */
function Backdrop({ name, x, y, w }) {
  const [iw, ih] = IMAGES[name];
  const h = (w * ih) / iw;
  const frac = w / VB_W;
  return (
    <Image
      src={`/play/scenes/${name}.webp`}
      alt=""
      width={iw}
      height={ih}
      loading="eager"
      sizes={`(min-width: 1280px) ${Math.round(frac * 240)}px, ${Math.round(frac * 420)}px`}
      className="pointer-events-none absolute select-none"
      style={{ left: `${(x / VB_W) * 100}%`, top: `${(y / VB_H) * 100}%`, width: `${frac * 100}%`, height: `${(h / VB_H) * 100}%` }}
    />
  );
}

function Overlay({ children }) {
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 h-full w-full overflow-visible">
      {children}
    </svg>
  );
}

const sheetNum = (sheet, col, row) => Number(sheet[`${col}${row}`]) || 0;

// ── 1-1 toppings ─────────────────────────────────────────────────────────────

const COUNTER = { x: 6, y: 44, w: 236 };
const CUP_BASE_Y = 101;

function creamFor(sheet, row, max) {
  const t = sheetNum(sheet, 'C', row);
  return t > 0 ? t / max : 0;
}
const maxTopping = (sheet, rows) => Math.max(1, ...rows.map((r) => sheetNum(sheet, 'C', r.row)));

function ToppingsStage({ rows, sheet }) {
  const max = maxTopping(sheet, rows);
  const s = 0.82;
  return (
    <>
      <Backdrop name="counter-register" {...COUNTER} />
      <Overlay>
        {rows.map((r, i) => (
          <Glass
            key={r.ref}
            x={80 + i * 19}
            y={CUP_BASE_Y - 28 * s}
            s={s}
            menu={r.label}
            state={r.state}
            cream={creamFor(sheet, r.row, max)}
          />
        ))}
      </Overlay>
    </>
  );
}

function ToppingsProps({ row, rows, sheet }) {
  return (
    <MiniSvg w={14} h={20} viewBox="-1 -8 22 37">
      <Glass x={0} y={0} menu={row.label} state={row.state} cream={creamFor(sheet, row.row, maxTopping(sheet, rows))} />
    </MiniSvg>
  );
}

function ToppingsTotal({ rows }) {
  const done = rows.filter((r) => r.state === 'match' || r.state === 'current').length;
  return (
    <>
      <p className="text-xs text-white/60">คิดราคาแล้ว</p>
      <BigNumber value={String(done)} unit={`/ ${rows.length} แก้ว`} tone="text-[#D4F73F]" />
    </>
  );
}

// ── 1-2 checkout ─────────────────────────────────────────────────────────────

function CheckoutStage({ rows, sheet, fmt }) {
  const focus = focusRow(rows);
  const qty = capProps(sheetNum(sheet, 'C', focus.row), 5);
  const s = 0.82;
  const state = focus.state === 'shadow' ? 'shadow' : focus.state;
  return (
    <>
      <Backdrop name="counter-register" {...COUNTER} />
      <Overlay>
        {Array.from({ length: qty.shown }, (_, i) => (
          <Glass key={`${focus.ref}-${i}`} x={80 + i * 19} y={CUP_BASE_Y - 28 * s} s={s} menu={focus.label} state={state} />
        ))}
        {/* running total on the register's display */}
        <text x="205" y="70.5" textAnchor="middle" fontSize="10" fontWeight="700" fill={C.lime} style={MONO_STYLE}>
          {displayValue(matchedSum(rows), fmt)}
        </text>
      </Overlay>
    </>
  );
}

function CupsProps({ row, sheet }) {
  const qty = capProps(sheetNum(sheet, 'C', row.row));
  return (
    <>
      {Array.from({ length: qty.shown }, (_, i) => (
        <MiniSvg key={i} w={11} h={15} viewBox="-1 -2 22 31">
          <Glass x={0} y={0} menu={row.label} state={row.state} />
        </MiniSvg>
      ))}
      <Overflow n={qty.overflow} />
    </>
  );
}

// ── 1-3 change ───────────────────────────────────────────────────────────────

const stackHeight = (v) => Math.max(1, Math.min(8, Math.round(1 + 2 * Math.log10(Math.max(1, v)))));

function ChangeStage({ rows, fmt }) {
  const gap = VB_W / (rows.length + 1);
  return (
    <>
      <Backdrop name="cash-register" x={74} y={4} w={100} />
      <Overlay>
        {rows.map((r, i) => {
          const cx = gap * (i + 1);
          const n = stackHeight(r.state === 'shadow' ? r.expected : r.value);
          const base = 176;
          const top = base - n * 4 - 2;
          const label = r.state === 'shadow' ? '—' : displayValue(r.value, fmt);
          const tone = { match: C.green, current: C.blue, error: C.red, shadow: C.shadow }[r.state];
          return (
            <g key={r.ref}>
              {r.state !== 'shadow' && <ContactShadow cx={cx} cy={base + 5} rx={13} ry={3} />}
              <g className={r.state === 'shadow' ? undefined : styles.pop}>
                {Array.from({ length: n }, (_, k) => (
                  <StackCoin key={k} x={cx - 9} y={base - (k + 1) * 4} state={r.state === 'error' ? 'shadow' : r.state} />
                ))}
              </g>
              <text x={cx} y={top - 4} textAnchor="middle" fontSize="8" fontWeight="700" fill={tone} style={MONO_STYLE}>
                {label}
              </text>
            </g>
          );
        })}
      </Overlay>
    </>
  );
}

function ChangeProps({ row }) {
  const v = row.state === 'shadow' ? row.expected : row.value;
  if (typeof v !== 'number') return null;
  const notes = capProps(Math.min(6, Math.floor(v / 100)));
  const state = row.state === 'error' ? 'shadow' : row.state;
  return (
    <>
      {Array.from({ length: notes.shown }, (_, i) => (
        <MiniSvg key={i} w={14} h={8} viewBox="0 0 20 11">
          <Banknote x={0} y={0} state={state} />
        </MiniSvg>
      ))}
      <Overflow n={notes.overflow} />
      {v % 100 > 0 && (
        <MiniSvg w={11} h={11} viewBox="0 0 12 12">
          <Coin x={0} y={0} state={state} />
        </MiniSvg>
      )}
    </>
  );
}

// ── 1-4 split ────────────────────────────────────────────────────────────────

function SplitStage({ rows, sheet, fmt }) {
  const focus = focusRow(rows);
  const people = sheetNum(sheet, 'C', focus.row);
  const plates = platesFor(people);
  const state = focus.state === 'error' ? 'shadow' : focus.state;
  const tone = { match: C.green, current: C.blue, shadow: C.shadow }[state];
  const jar = { x: 124, y: 66 };
  const spacing = 62;
  return (
    <>
      <Backdrop name="coin-jar" x={99} y={6} w={50} />
      <Overlay>
        {Array.from({ length: plates.shown }, (_, i) => {
          const cx = jar.x + (i - (plates.shown - 1) / 2) * spacing;
          return (
            <g key={`${focus.ref}-${i}`}>
              <path
                d={`M${jar.x} ${jar.y} Q ${(jar.x + cx) / 2} ${jar.y + 34} ${cx} 118`}
                fill="none"
                stroke={state === 'shadow' ? C.shadow : C.blue}
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <ellipse cx={cx} cy={150} rx={17} ry={5} fill="rgba(96,165,250,0.15)" stroke={state === 'current' ? C.blue : 'rgba(255,255,255,0.3)'} strokeWidth="1" />
              <Person x={cx - 8} y={122} s={1.35} state={state} />
              <Coin x={cx - 4.5} y={142} s={0.75} state={state} />
              <text x={cx} y={170} textAnchor="middle" fontSize="9" fontWeight="700" fill={tone} style={MONO_STYLE}>
                {state === 'shadow' ? '—' : displayValue(focus.value, fmt)}
              </text>
            </g>
          );
        })}
        {plates.overflow && (
          <text x={jar.x + ((plates.shown - 1) / 2) * spacing + 22} y={138} fontSize="9" fontWeight="700" fill="rgba(255,255,255,0.6)" style={MONO_STYLE}>
            ×{plates.overflow}
          </text>
        )}
      </Overlay>
    </>
  );
}

function SplitProps({ row, sheet }) {
  const people = capProps(sheetNum(sheet, 'C', row.row));
  const state = row.state === 'error' ? 'shadow' : row.state;
  return (
    <>
      {Array.from({ length: people.shown }, (_, i) => (
        <MiniSvg key={i} w={10} h={12} viewBox="0 0 12 14">
          <Person x={0} y={0} state={state} />
        </MiniSvg>
      ))}
      <Overflow n={people.overflow} />
    </>
  );
}

function SplitTotal({ rows, sheet, fmt }) {
  const focus = focusRow(rows);
  const bill = sheetNum(sheet, 'B', focus.row);
  const people = sheetNum(sheet, 'C', focus.row);
  const tone = { match: 'text-[#86EFAC]', current: 'text-[#60A5FA]', error: 'text-[#F87171]', shadow: 'text-white/30' }[focus.state];
  return (
    <>
      <p className="text-xs text-white/60">
        บิลกลุ่ม {focus.index + 1} · {displayValue(bill)} บาท ÷ {people} คน
      </p>
      <BigNumber value={focus.state === 'shadow' ? '—' : focus.value} unit="บาท / คน" tone={tone} fmt={fmt} />
    </>
  );
}

// ── 1-5 delivery ─────────────────────────────────────────────────────────────

function DeliveryStage({ rows, sheet }) {
  const focus = focusRow(rows);
  const qty = capProps(sheetNum(sheet, 'D', focus.row), 6);
  const state = focus.state === 'error' ? 'shadow' : focus.state;
  const s = 1.15;
  return (
    <>
      <Backdrop name="delivery-van" x={12} y={26} w={224} />
      <Overlay>
        {state !== 'shadow' && qty.shown > 0 && <ContactShadow cx={48 + Math.min(qty.shown, 3) * 10} cy={101} rx={Math.min(qty.shown, 3) * 12} ry={3} />}
        {Array.from({ length: qty.shown }, (_, i) => {
          const col = i % 3;
          const tier = Math.floor(i / 3);
          return <Box key={`${focus.ref}-${i}`} x={48 + col * 19} y={101 - 14 * s - tier * 15} s={s} state={state} />;
        })}
      </Overlay>
    </>
  );
}

function BoxProps({ row, sheet }) {
  const qty = capProps(sheetNum(sheet, 'D', row.row));
  const state = row.state === 'error' ? 'shadow' : row.state;
  return (
    <>
      {Array.from({ length: qty.shown }, (_, i) => (
        <MiniSvg key={i} w={13} h={12} viewBox="0 0 16 14">
          <Box x={0} y={0} state={state} />
        </MiniSvg>
      ))}
      <Overflow n={qty.overflow} />
    </>
  );
}

// ── 2-5 vat ──────────────────────────────────────────────────────────────────

/** Lock cell from the model, and per row the reference the ran formula used. */
function vatContext(level, rows, formula) {
  const task = level.tasks[0];
  const model = rateRefs(task.model, rows.slice(0, 1), { lockCell: null, sheet: level.sheet })[0];
  const lockCell = model?.cell ?? null;
  const refs = rateRefs(formula, rows, { lockCell, sheet: level.sheet });
  const firstBroken = rows.findIndex((r, i) => r.state !== 'shadow' && refs[i]?.broken);
  return { lockCell, modelRef: model?.text ?? '', refs, firstBroken };
}

const coinY = (i, n) => 52 + (n > 1 ? (i * 96) / (n - 1) : 0);

function VatStage({ rows, sheet, vat }) {
  const { lockCell, refs, firstBroken } = vat;
  const broken = firstBroken !== -1;
  const chip = { x: 166, y: 46, w: 56, h: 20 };
  const coinX = 120;
  let red = 0;
  return (
    <>
      <Backdrop name="cash-register" x={4} y={50} w={100} />
      {!broken && <Backdrop name="pin-dollar" x={183} y={4} w={24} />}
      <Overlay>
        {rows.map((r, i) => {
          const cy = coinY(i, rows.length);
          const ref = refs[i];
          const isBroken = r.state !== 'shadow' && ref?.broken;
          if (isBroken) {
            const ry = 96 + red * 26;
            red += 1;
            return (
              <g key={r.ref}>
                <path d={`M${coinX + 12} ${cy} C 150 ${cy}, 150 ${ry}, 176 ${ry}`} fill="none" stroke={C.red} strokeWidth="1" strokeDasharray="3 2.5" />
                <rect x="176" y={ry - 7} width="34" height="14" rx="4" fill="rgba(248,113,113,0.12)" stroke={C.red} strokeWidth="1" strokeDasharray="3 2" />
                <text x="193" y={ry + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill={C.red} style={MONO_STYLE}>
                  {ref.cell}
                </text>
                <Coin x={coinX} y={cy - 6} state="match" red />
              </g>
            );
          }
          const shadow = r.state === 'shadow';
          return (
            <g key={r.ref}>
              <path
                d={`M${coinX + 12} ${cy} C 148 ${cy}, 148 ${chip.y + chip.h}, ${chip.x + 10} ${chip.y + chip.h}`}
                fill="none"
                stroke={shadow ? C.shadow : C.lime}
                strokeWidth="1.1"
                strokeDasharray={shadow ? '3 3' : undefined}
              />
              <Coin x={coinX} y={cy - 6} state={r.state === 'error' ? 'shadow' : r.state} />
            </g>
          );
        })}
        <rect x={chip.x} y={chip.y} width={chip.w} height={chip.h} rx="6" fill="#0D1B2A" stroke={C.lime} strokeWidth="1.2" />
        <text x={chip.x + chip.w / 2} y={chip.y + 13.5} textAnchor="middle" fontSize="9" fontWeight="700" style={MONO_STYLE}>
          <tspan fill="rgba(255,255,255,0.6)">{lockCell}</tspan>
          <tspan fill="rgba(255,255,255,0.4)"> · </tspan>
          <tspan fill={C.lime}>{displayValue(sheet[lockCell], 'percent')}</tspan>
        </text>
      </Overlay>
    </>
  );
}

function VatProps({ row, sheet, vat }) {
  const ref = vat.refs[row.index];
  const price = sheetNum(sheet, 'B', row.row);
  let text = vat.modelRef;
  let tone = 'text-white/30';
  if (row.state !== 'shadow' && ref) {
    text = ref.text;
    tone = ref.broken ? 'text-[#F87171]' : 'text-[#D4F73F]';
  }
  return (
    <span className={`${MONO} truncate text-xs`}>
      <span className="text-white/45">{price} × </span>
      <span className={tone}>{text}</span>
    </span>
  );
}

function VatTotal({ rows, fmt, vat }) {
  const { refs, firstBroken } = vat;
  if (firstBroken !== -1) {
    const r = rows[firstBroken];
    const ref = refs[firstBroken];
    return (
      <>
        <p className="break-words text-xs text-[#F87171]">
          แถว {r.row} กลายเป็น <span className={MONO}>{ref.formula}</span>
          {ref.empty ? ' (ช่องว่าง)' : ''}
        </p>
        <BigNumber value={r.value} unit="บาท" tone="text-[#F87171]" fmt={fmt} />
      </>
    );
  }
  return (
    <>
      <p className="text-xs text-white/60">VAT รวม {rows.length} เมนู</p>
      <BigNumber value={matchedSum(rows)} unit="บาท" fmt={fmt} />
    </>
  );
}
