'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import {
  bossGoal,
  bossSteps,
  capProps,
  countTagged,
  crateCount,
  focusRow,
  matchedSum,
  meetsThreshold,
  platesFor,
  rateRefs,
  receiptScale,
  sceneConfig,
  sceneRows,
  statusTag,
  tierLabel,
  tierPlacement,
  tierRange,
  tierZone,
} from '@/lib/play/game/scene';
import { displayValue } from '@/lib/play/game/view';

import {
  Banknote,
  Box,
  C,
  Coin,
  ContactShadow,
  Coupon,
  Crate,
  Glass,
  HotCup,
  MiniSvg,
  Person,
  Receipt,
  StackCoin,
  StageTag,
  StatusTag,
  TierBadge,
} from './props';
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
// JetBrains Mono ligates >= into one glyph through calt; formulas stay as typed.
const NO_LIGATURES = { fontFeatureSettings: '"calt" 0, "liga" 0' };

const IMAGES = {
  'counter-register': [421, 248],
  'cash-register': [249, 269],
  'coin-jar': [194, 232],
  'pin-dollar': [150, 231],
  'delivery-van': [386, 243],
  shelf: [532, 640],
  'medal-gold': [445, 640],
  'medal-silver': [359, 640],
  trophy: [577, 640],
};

const SCENES = {
  toppings: { name: 'Coffee counter', Stage: ToppingsStage, Props: ToppingsProps, Total: ToppingsTotal },
  checkout: { name: 'Coffee counter', Stage: CheckoutStage, Props: CupsProps, Total: sumTotal('ยอดขายวันนี้'), float: true },
  change: { name: 'Cash register', Stage: ChangeStage, Props: ChangeProps, Total: sumTotal('ทอนไปแล้ว'), float: true },
  split: { name: 'Tip jar', Stage: SplitStage, Props: SplitProps, Total: SplitTotal },
  delivery: { name: 'Delivery van', Stage: DeliveryStage, Props: BoxProps, Total: sumTotal('ออเดอร์ขึ้นรถแล้ว'), float: true },
  vat: { name: 'VAT desk', Stage: VatStage, Props: VatProps, Total: VatTotal },
  stock: { name: 'Stockroom', Stage: StockStage, Props: StockProps, Value: TagValue, Total: StockTotal },
  receipts: { name: 'Receipt rail', Stage: ReceiptsStage, Props: ReceiptsProps, Value: TagValue, Total: ReceiptsTotal },
  discount: { name: 'Cash register', Stage: DiscountStage, Props: DiscountProps, Total: DiscountTotal },
  iced: { name: 'Coffee counter', Stage: IcedStage, Props: IcedProps, Total: IcedTotal },
  tiers: { name: 'Member tiers', Stage: TiersStage, Props: TiersProps, Value: TiersValue, Total: TiersTotal },
  boss: { name: 'Shop summary', Stage: BossStage, Props: CupsProps, Total: BossTotal, float: true },
};

export function SceneCard({ kind, level, results, running, formats, formula, taskIndex, complete }) {
  const scene = SCENES[kind];
  // Rows are the first task's, so only that task's run can make one blue.
  const rows = sceneRows(level, results, { running: running && taskIndex === 0 });
  const fmt = formats[rows[0].ref];
  const ctx = {
    level,
    rows,
    fmt,
    formula,
    results,
    sheet: level.sheet,
    cfg: sceneConfig(level),
    progress: { taskIndex, complete },
    vat: kind === 'vat' ? vatContext(level, rows, formula) : null,
  };
  const { Stage, Props, Total, Value } = scene;
  return (
    <section aria-labelledby="play-scene-title" className="rounded-[20px] border border-white/10 bg-[#132638] p-5">
      <p className="font-en text-xs font-bold uppercase tracking-[0.14em] text-white/50">{scene.name}</p>
      <h2 id="play-scene-title" className="mt-1 break-words font-heading text-sm font-bold text-white">
        ด่าน {String(level.id).toUpperCase()} · {level.title}
      </h2>

      <div className="relative mx-auto mt-4 aspect-[248/190] w-full max-w-[420px] overflow-hidden rounded-[14px] bg-[#0B1630]" aria-hidden="true">
        <Stage {...ctx} />
      </div>

      <ul className="mt-4 flex flex-col gap-1" aria-label="ผลแต่ละแถว">
        {rows.map((r) => (
          <SceneRow key={r.ref} row={r} fmt={fmt} float={scene.float} value={Value ? <Value row={r} {...ctx} /> : null}>
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

function SceneRow({ row, fmt, float, value, children }) {
  const tone = ROW_TONE[row.state];
  const text = row.state === 'shadow' ? '—' : displayValue(row.value, fmt);
  return (
    <li className={`relative grid grid-cols-[minmax(0,5rem)_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-sm ${tone.bg}`}>
      <span className={`truncate ${tone.label}`}>{row.label}</span>
      <span className="relative flex min-w-0 items-center gap-1 overflow-hidden">{children}</span>
      {value ?? <span className={`${MONO} text-right text-sm tabular-nums ${tone.value}`}>{text}</span>}
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

function BigNumber({ value, unit, tone = 'text-[#86EFAC]', countUp = false, fmt, plain = false }) {
  const shown = useCountUp(value, countUp);
  return (
    <p className="mt-0.5 flex items-baseline gap-2">
      <span className={`${plain ? '' : MONO} text-3xl font-bold tabular-nums ${tone}`}>
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
function Backdrop({ name, x, y, w, className = '' }) {
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
      className={`pointer-events-none absolute select-none ${className}`}
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

// ── 3-1 stock ────────────────────────────────────────────────────────────────

// Where each row's crates stand on the shelf boards: rows 1–2 top, 3–4 middle,
// 5 bottom. (x, y) is the crate pile's left end on the board.
const SHELF_SLOTS = [
  { x: 62, y: 28 },
  { x: 98, y: 23 },
  { x: 62, y: 78 },
  { x: 104, y: 72 },
  { x: 86, y: 122 },
];
const CRATE = { w: 15, h: 12 };

function StockStage({ rows, sheet, cfg }) {
  return (
    <>
      <Backdrop name="shelf" x={36} y={6} w={128} />
      <Overlay>
        {rows.map((r, i) => {
          const slot = SHELF_SLOTS[i];
          return Array.from({ length: crateCount(sheetNum(sheet, 'B', r.row), cfg) }, (_, k) => (
            <Crate key={`${r.ref}-${k}`} x={slot.x + (k % 2) * CRATE.w} y={slot.y - CRATE.h * (1 + Math.floor(k / 2))} s={0.92} state={r.state} />
          ));
        })}
        {rows.map((r, i) => (
          <StageTag key={r.ref} cx={210} cy={18 + i * 21} tag={statusTag(r, cfg)} />
        ))}
        <rect x="176" y="164" width="66" height="16" rx="5" fill="rgba(212,247,63,0.1)" stroke={C.lime} strokeWidth="1" />
        <text x="209" y="175" textAnchor="middle" fontSize="8" fontWeight="700" fill={C.lime}>
          {`< ${cfg.threshold} → สั่ง`}
        </text>
      </Overlay>
    </>
  );
}

function StockProps({ row, sheet, cfg }) {
  const stock = sheetNum(sheet, 'B', row.row);
  return (
    <>
      <Grey>{stock}</Grey>
      <span className="flex items-center gap-0.5">
        {Array.from({ length: crateCount(stock, cfg) }, (_, i) => (
          <MiniSvg key={i} w={10} h={9} viewBox="0 0 16 13">
            <Crate x={0} y={0} state={row.state} />
          </MiniSvg>
        ))}
      </span>
    </>
  );
}

function CountTotal({ label, value, unit, tone }) {
  return (
    <>
      <p className="text-xs text-white/60">{label}</p>
      <BigNumber value={String(value)} unit={unit} tone={tone} />
    </>
  );
}

function StockTotal({ rows, cfg }) {
  return <CountTotal label="ต้องสั่งเพิ่ม" value={countTagged(rows, cfg)} unit="รายการ" tone="text-[#FBBF24]" />;
}

function TagValue({ row, cfg }) {
  return <StatusTag tag={statusTag(row, cfg)} />;
}

/** A number from the sheet, in the row's muted grey. */
const Grey = ({ children }) => <span className={`${MONO} text-xs tabular-nums text-white/45`}>{children}</span>;

// ── 3-2 receipts ─────────────────────────────────────────────────────────────

function ReceiptsStage({ rows, sheet, cfg }) {
  const base = 178;
  const w = 18;
  const { line, heights } = receiptScale(rows.map((r) => sheetNum(sheet, 'B', r.row)), cfg, 126);
  const lineY = base - line;
  return (
    <>
      <Backdrop name="cash-register" x={166} y={100} w={76} />
      <Overlay>
        {rows.map((r, i) => {
          const h = heights[i];
          const x = 16 + i * 28;
          const solid = r.state === 'match' || r.state === 'current';
          return (
            <g key={r.ref}>
              <Receipt x={x} y={base - h} w={w} h={h} state={r.state} />
              {solid && meetsThreshold(sheetNum(sheet, 'B', r.row), cfg) && <Coupon x={x + 3} y={base - h - 12} w={12} text="%" state={r.state} />}
            </g>
          );
        })}
        <line x1="8" x2="164" y1={lineY} y2={lineY} stroke={C.lime} strokeWidth="1.2" strokeDasharray="4 3" />
        <text x="8" y={lineY - 3} fontSize="8" fontWeight="700" fill={C.lime} style={MONO_STYLE}>
          {cfg.threshold}
        </text>
      </Overlay>
    </>
  );
}

function ReceiptsProps({ row, sheet }) {
  return (
    <>
      <MiniSvg w={10} h={13} viewBox="0 0 10 13">
        <Receipt x={0} y={0} w={10} h={13} state={row.state} />
      </MiniSvg>
      <Grey>{sheetNum(sheet, 'B', row.row)}</Grey>
    </>
  );
}

function ReceiptsTotal({ rows, cfg }) {
  const checked = rows.filter((r) => r.state === 'match').length;
  return <CountTotal label="ได้ส่วนลดแล้ว" value={countTagged(rows, cfg)} unit={`จาก ${checked} บิล`} tone="text-[#D4F73F]" />;
}

// ── 3-3 discount ─────────────────────────────────────────────────────────────

const VALUE_FILL = { match: C.green, current: C.blue, error: C.red, shadow: C.shadow };
const VALUE_TONE = { match: 'text-[#86EFAC]', current: 'text-[#60A5FA]', error: 'text-[#F87171]', shadow: 'text-white/30' };

function DiscountStage({ rows, sheet, cfg, fmt }) {
  const focus = focusRow(rows);
  const gap = VB_W / rows.length;
  return (
    <>
      <Backdrop name="cash-register" x={68} y={3} w={112} />
      <Overlay>
        {focus.state !== 'shadow' && (
          <text x="123.5" y="23.5" textAnchor="middle" fontSize="10" fontWeight="700" fill={VALUE_FILL[focus.state]} style={MONO_STYLE}>
            {displayValue(focus.value, fmt)}
          </text>
        )}
        {rows.map((r, i) => {
          const cx = gap * (i + 0.5);
          return (
            <g key={r.ref}>
              <Receipt x={cx - 12} y={138} w={18} h={32} state={r.state} />
              {meetsThreshold(sheetNum(sheet, 'B', r.row), cfg) && <Coupon x={cx - 2} y={131} w={21} text={`-${cfg.amount}`} state={r.state} />}
              <text x={cx - 3} y={182} textAnchor="middle" fontSize="8" fontWeight="700" fill={VALUE_FILL[r.state]} style={MONO_STYLE}>
                {r.state === 'shadow' ? '—' : displayValue(r.value, fmt)}
              </text>
            </g>
          );
        })}
      </Overlay>
    </>
  );
}

function DiscountProps({ row, sheet, cfg }) {
  const bill = sheetNum(sheet, 'B', row.row);
  return (
    <>
      <Grey>{bill}</Grey>
      {meetsThreshold(bill, cfg) && (
        <MiniSvg w={24} h={12} viewBox="0 0 20 10">
          <Coupon x={0} y={0} text={`-${cfg.amount}`} state={row.state} />
        </MiniSvg>
      )}
    </>
  );
}

function DiscountTotal({ rows, sheet, cfg, fmt }) {
  const focus = focusRow(rows);
  const bill = sheetNum(sheet, 'B', focus.row);
  return (
    <>
      <p className="text-xs text-white/60">
        ลูกค้า {focus.index + 1} บิล {bill}
        {bill === cfg.threshold ? ' ถึงเกณฑ์พอดี' : ''}
      </p>
      <BigNumber value={focus.state === 'shadow' ? '—' : focus.value} unit="บาท" tone={VALUE_TONE[focus.state]} fmt={fmt} />
    </>
  );
}

// ── 3-4 iced ─────────────────────────────────────────────────────────────────

const isIced = (row, sheet, cfg) => sheet[`B${row.row}`] === cfg.match;

/** The row's drink: hot mug or iced glass, by the sheet's own type column. */
function Drink({ row, sheet, cfg, x = 0, y = 0, s = 1 }) {
  return isIced(row, sheet, cfg) ? <Glass x={x} y={y} s={s} menu={row.label} state={row.state} iced /> : <HotCup x={x} y={y} s={s} state={row.state} />;
}

function IcedStage({ rows, sheet, cfg }) {
  const s = 0.82;
  const top = CUP_BASE_Y - 28 * s;
  return (
    <>
      <Backdrop name="counter-register" {...COUNTER} />
      <Overlay>
        {rows.map((r, i) => (
          <g key={r.ref}>
            <Drink row={r} sheet={sheet} cfg={cfg} x={80 + i * 19} y={top} s={s} />
            {isIced(r, sheet, cfg) && r.state !== 'shadow' && <Coupon x={79 + i * 19} y={top - 12} w={18} text={`+${cfg.amount}`} state={r.state} />}
          </g>
        ))}
      </Overlay>
    </>
  );
}

function IcedProps({ row, sheet, cfg }) {
  return (
    <>
      <MiniSvg w={13} h={18} viewBox="-1 -1 24 31">
        <Drink row={row} sheet={sheet} cfg={cfg} />
      </MiniSvg>
      <Grey>{sheetNum(sheet, 'C', row.row)}</Grey>
      {isIced(row, sheet, cfg) && (
        <MiniSvg w={24} h={12} viewBox="0 0 20 10">
          <Coupon x={0} y={0} text={`+${cfg.amount}`} state={row.state} />
        </MiniSvg>
      )}
    </>
  );
}

function IcedTotal({ rows, sheet, cfg }) {
  const n = rows.filter((r) => r.state === 'match' && isIced(r, sheet, cfg)).length;
  return <CountTotal label="แก้วเย็นที่บวกแล้ว" value={n} unit="แก้ว" tone="text-[#60A5FA]" />;
}

// ── 3-5 tiers ────────────────────────────────────────────────────────────────

const ZONE_X = [42, 124, 206];
const PERSON_STEP = 24;

function TiersStage({ rows, sheet, cfg }) {
  const placed = tierPlacement(rows, cfg);
  return (
    <>
      {cfg.zones.map(
        (z, i) => z.art && <Backdrop key={z.value} name={z.art} x={ZONE_X[i] - (MEDAL_H * IMAGES[z.art][0]) / IMAGES[z.art][1] / 2} y={6} w={(MEDAL_H * IMAGES[z.art][0]) / IMAGES[z.art][1]} />,
      )}
      <Overlay>
        {cfg.zones.map((z, i) => {
          const cx = ZONE_X[i];
          const people = capProps(placed[i].length, 3);
          const shown = placed[i].slice(0, people.shown);
          return (
            <g key={z.value}>
              {!z.art && <TierBadge x={cx - 25} y={18} s={3.6} tier={z.badge} state="match" />}
              <text x={cx} y="98" textAnchor="middle" fontSize="8" fontWeight="700" fill={C.lime} style={MONO_STYLE}>
                {tierLabel(i, cfg)}
              </text>
              <text x={cx} y="110" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.8)">
                {z.name}
              </text>
              {shown.map((r, k) => {
                const px = cx + (k - (shown.length - 1) / 2) * PERSON_STEP;
                return (
                  <g key={r.ref}>
                    <Person x={px - 7.8} y={124} s={1.3} state={r.state} />
                    {r.state !== 'shadow' && (
                      <text x={px} y="155" textAnchor="middle" fontSize="7.5" fontWeight="700" fill={VALUE_FILL[r.state]} style={MONO_STYLE}>
                        {sheetNum(sheet, 'B', r.row)}
                      </text>
                    )}
                  </g>
                );
              })}
              {people.overflow && (
                <text x={cx} y="170" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.6)" style={MONO_STYLE}>
                  ×{people.overflow}
                </text>
              )}
            </g>
          );
        })}
      </Overlay>
    </>
  );
}

const MEDAL_H = 78;

function TiersProps({ row, sheet }) {
  return <Grey>{sheetNum(sheet, 'B', row.row)}</Grey>;
}

function TiersValue({ row, cfg }) {
  const zone = cfg.zones[tierZone(row.value, cfg)];
  const shadow = row.state === 'shadow';
  return (
    <span className={`flex items-center justify-end gap-1 text-xs ${MONO} ${ROW_TONE[row.state].value}`}>
      {(shadow || zone) && (
        <MiniSvg w={13} h={13} viewBox="0 0 14 14">
          <TierBadge tier={zone?.badge} state={row.state} />
        </MiniSvg>
      )}
      <span className={`${MONO} max-w-[4.5rem] truncate`}>{shadow ? '—' : displayValue(row.value)}</span>
    </span>
  );
}

function TiersTotal({ rows, sheet, cfg }) {
  const focus = rows.find((r) => r.state === 'error') || focusRow(rows);
  const amount = sheetNum(sheet, 'B', focus.row);
  return (
    <>
      <p className="text-xs text-white/60">
        ลูกค้า {focus.index + 1} · {amount} {tierRange(amount, cfg)}
      </p>
      <BigNumber value={focus.state === 'shadow' ? '—' : displayValue(focus.value)} tone={VALUE_TONE[focus.state]} plain />
    </>
  );
}

// ── boss ─────────────────────────────────────────────────────────────────────

const money = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '');
const BAR = { x: 10, y: 30, w: 150, h: 6 };
const STEP_LOOK = {
  match: { fill: 'rgba(134,239,172,0.16)', stroke: C.green, text: C.green },
  current: { fill: 'rgba(96,165,250,0.16)', stroke: C.blue, text: C.blue },
  shadow: { fill: 'transparent', stroke: C.shadow, text: '#94A3B8' },
};

function BossStage({ level, rows, results, cfg, progress }) {
  const steps = bossSteps(level, progress);
  const goal = bossGoal(level, rows, results, progress);
  const s = 0.85;
  const base = 136;
  const targetX = BAR.x + BAR.w * cfg.targetAt;
  let chipX = BAR.x;
  return (
    <>
      <Backdrop name="counter-register" x={-4} y={84} w={208} />
      <Backdrop
        name="trophy"
        x={190}
        y={6}
        w={48}
        className={progress.complete ? styles.glow : 'opacity-40 grayscale'}
      />
      <Overlay>
        {steps.map((state, i) => {
          const look = STEP_LOOK[state];
          const text = `${i + 1} ${cfg.steps[i]}`;
          const w = 12 + cfg.steps[i].length * 4.4;
          const x = chipX;
          chipX += w + 4;
          return (
            <g key={text}>
              <rect x={x} y="8" width={w} height="14" rx="7" fill={look.fill} stroke={look.stroke} strokeWidth="1" strokeDasharray={state === 'shadow' ? '2.5 2' : undefined} />
              <text x={x + w / 2} y="17.6" textAnchor="middle" fontSize="7" fontWeight="700" fill={look.text}>
                {text}
              </text>
            </g>
          );
        })}
        <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx="3" fill="rgba(255,255,255,0.1)" />
        <rect x={BAR.x} y={BAR.y} width={BAR.w * goal.fill} height={BAR.h} rx="3" fill={C.green} />
        <line x1={targetX} x2={targetX} y1={BAR.y - 3} y2={BAR.y + BAR.h + 3} stroke={C.lime} strokeWidth="1.6" />
        <text x={BAR.x} y="48" fontSize="8" fontWeight="700" fill={C.green} style={MONO_STYLE}>
          {money(goal.value)}
        </text>
        <text x={BAR.x + BAR.w + 6} y="48" textAnchor="end" fontSize="7.5" fontWeight="700" fill={C.lime}>
          เป้า {money(cfg.target)}
        </text>
        {rows.map(
          (r, i) => r.state === 'match' && <Glass key={r.ref} x={62 + i * 19} y={base - 28 * s} s={s} menu={r.label} state={r.state} />,
        )}
      </Overlay>
    </>
  );
}

function BossTotal({ level, rows, results, cfg, progress, fmt }) {
  const { taskIndex, complete } = progress;
  if (complete || taskIndex === 2) {
    const { anchor: sumCell } = level.tasks[1];
    const result = results[level.tasks[2].anchor];
    const tone = !result ? 'text-white/30' : result.ok ? 'text-[#86EFAC]' : 'text-[#F87171]';
    return (
      <>
        <p className={`text-xs text-white/60 ${MONO}`} style={NO_LIGATURES}>
          ขั้น 3 · =IF({sumCell}&gt;={cfg.target},…)
        </p>
        <BigNumber value={result ? displayValue(result.value) : '—'} tone={tone} plain />
      </>
    );
  }
  return (
    <>
      <p className="text-xs text-white/60">ขั้น {taskIndex + 1} · ยอดสะสม</p>
      <BigNumber value={bossGoal(level, rows, results, progress).value} unit="บาท" fmt={fmt} countUp />
    </>
  );
}
