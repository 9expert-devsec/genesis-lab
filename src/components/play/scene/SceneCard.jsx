'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import {
  answerState,
  averageParts,
  bossGoal,
  bossSteps,
  capProps,
  coinHeight,
  countTagged,
  crateCount,
  cutSpan,
  dataRows,
  focusRow,
  matchedSum,
  meetsThreshold,
  orderCell,
  ordersAverage,
  ordersTotal,
  phonePair,
  phoneSlots,
  platesFor,
  podiumTags,
  rateRefs,
  receiptScale,
  rowCoins,
  ruleEarned,
  sceneConfig,
  sceneRows,
  stackCoins,
  statusTag,
  stepsFill,
  tierLabel,
  tierPlacement,
  tierRange,
  tierZone,
  zeroDay,
} from '@/lib/play/game/scene';
import { displayValue } from '@/lib/play/game/view';

import {
  Banknote,
  Box,
  C,
  Coin,
  ContactShadow,
  CountBadge,
  Coupon,
  Crate,
  Glass,
  HotCup,
  MiniSvg,
  Person,
  Receipt,
  SizeCup,
  SpikeSlip,
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
 *
 * A `data` scene (CH.2's summaries) is the other shape: its rows are the input
 * data, the answer's state lives in the total box, and a lime bar marks the rows
 * the formula that ran references.
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
  shelf: [532, 640],
  'medal-gold': [445, 640],
  'medal-silver': [359, 640],
  trophy: [577, 640],
  '3d-label-printer': [1024, 1024],
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
  tipjar: { name: 'Tip jar', data: true, Stage: TipJarStage, Props: CoinProps, Total: TipJarTotal },
  average: { name: 'Cash register', data: true, Stage: AverageStage, Props: CoinProps, Total: AverageTotal, tone: averageTone },
  podium: { name: 'Sales podium', data: true, Stage: PodiumStage, Props: CoinProps, Total: PodiumTotal, tone: podiumTone },
  spike: { name: 'Order spike', data: true, Stage: SpikeStage, Props: OrderProps, Value: OrderValue, Total: SpikeTotal, tone: orderTone },
  productCode: { name: 'Product code', labelCol: 'B', Stage: ProductCodeStage, Props: CodeProps, Total: ProductCodeTotal },
  serialNo: { name: 'Serial no.', labelCol: 'B', Stage: SerialNoStage, Props: CodeProps, Total: SerialNoTotal },
  cupSize: { name: 'Cup size', labelCol: 'B', Stage: CupSizeStage, Props: CodeProps, Total: CupSizeTotal },
  phoneCheck: { name: 'Phone check', Stage: PhoneCheckStage, Props: PhoneProps, Value: PhoneValue, Total: PhoneCheckTotal },
  labelPrinter: { name: 'Label printer', labelCol: 'B', Stage: LabelPrinterStage, Props: TypedProps, Value: PrintedValue, Total: LabelPrinterTotal },
  dailyOrders: { name: 'Daily orders', Stage: DailyOrdersStage, Props: OrderTypeProps, Value: OrderAmount, Total: DailyOrdersTotal },
};

export function SceneCard({ kind, level, results, running, formats, formula, taskIndex, complete }) {
  const scene = SCENES[kind];
  // Rows are the first task's, so only that task's run can make one blue.
  const rows = scene.data ? dataRows(level, formula) : sceneRows(level, results, { running: running && taskIndex === 0 });
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
    answers: scene.data ? level.tasks.map((t, i) => answerState(results, t.anchor, { running: running && taskIndex === i })) : null,
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

      {scene.data ? (
        <DataRows scene={scene} ctx={ctx} />
      ) : (
        <ul className="mt-4 flex flex-col gap-1" aria-label="ผลแต่ละแถว">
          {rows.map((r) => (
            <SceneRow key={r.ref} row={scene.labelCol ? { ...r, label: level.sheet[`${scene.labelCol}${r.row}`] } : r} fmt={fmt} float={scene.float} value={Value ? <Value row={r} {...ctx} /> : null}>
              <Props row={r} {...ctx} />
            </SceneRow>
          ))}
        </ul>
      )}

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
  const numberRef = useRef(null);
  const shown = useCountUp(value, countUp, numberRef);
  return (
    <p className="mt-0.5 flex items-baseline gap-2">
      <span ref={numberRef} className={`${plain ? '' : MONO} text-3xl font-bold tabular-nums ${tone}`}>
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

const COUNT_MS = 400;

/**
 * Counts from the last shown number to `value` over COUNT_MS; jumps when off.
 * The count runs on rAF, so an empty Web Animation of the same length keeps it
 * in getAnimations(), and MISSION COMPLETE waits for it like any CSS animation.
 */
function useCountUp(value, enabled, ref) {
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
    const pace = ref.current?.animate(null, COUNT_MS);
    let raf = 0;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / COUNT_MS);
      const v = a + (value - a) * (1 - (1 - k) ** 3);
      setShown(k < 1 ? Math.round(v) : value);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      pace?.cancel();
      from.current = value;
    };
  }, [value, enabled, ref]);
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
  const done = rows.filter((r) => r.state === 'match').length;
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

// ── 2-1 to 2-4: data rows, coin stacks, the answer ───────────────────────────

const DATA_TONE = {
  plain: { bg: '', label: 'text-white/85', value: 'text-white/60' },
  ok: { bg: 'bg-[#86EFAC]/10', label: 'text-white', value: 'text-[#86EFAC]' },
  warn: { bg: 'bg-[#FBBF24]/10', label: 'text-white', value: 'text-[#FBBF24]' },
  skip: { bg: '', label: 'text-white/35', value: 'text-white/35' },
};

function DataRows({ scene, ctx }) {
  const { rows, cfg, formula } = ctx;
  const { Props, Value } = scene;
  return (
    <>
      <ul className="mt-4 flex flex-col gap-1 pl-3" aria-label="ข้อมูลแต่ละแถว">
        {rows.map((r, i) => {
          const tone = DATA_TONE[scene.tone?.(r, ctx) ?? 'plain'];
          const top = !rows[i - 1]?.inRange ? 'rounded-t-full' : '';
          const bottom = !rows[i + 1]?.inRange ? 'rounded-b-full' : '';
          return (
            <li key={r.ref} className={`relative grid grid-cols-[minmax(0,5rem)_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-sm ${tone.bg}`}>
              {/* One piece of the range bar; -bottom-1 closes the gap to the next row. */}
              <span
                aria-hidden="true"
                data-range={r.inRange ? 'in' : 'out'}
                className={`absolute -left-3 top-0 w-1 ${i < rows.length - 1 ? '-bottom-1' : 'bottom-0'} ${r.inRange ? `bg-[#D4F73F] ${top} ${bottom}` : 'bg-white/10'}`}
              />
              <span className={`truncate ${tone.label}`}>{r.label}</span>
              <span className="relative flex min-w-0 items-center gap-1 overflow-hidden">
                <Props row={r} {...ctx} />
              </span>
              {Value ? <Value row={r} tone={tone} {...ctx} /> : <span className={`${MONO} text-right text-sm tabular-nums ${tone.value}`}>{displayValue(r.value)}</span>}
            </li>
          );
        })}
      </ul>
      {/* The formula that ran, never the solution: the data range until then. */}
      <p className="mt-2 break-words font-mono text-[11px] text-[#D4F73F]">{formula || `ช่วงข้อมูล ${cfg.data}`}</p>
    </>
  );
}

function CoinProps({ row, cfg }) {
  const n = rowCoins(row.value, cfg);
  return (
    <>
      {Array.from({ length: Math.max(1, n) }, (_, i) => (
        <MiniSvg key={i} w={11} h={11} viewBox="0 0 12 12">
          <Coin x={0} y={0} state={n ? 'match' : 'shadow'} />
        </MiniSvg>
      ))}
    </>
  );
}

const answerText = ({ value }) => (value === null ? '—' : typeof value === 'number' ? money(value) : displayValue(value));

function AnswerTotal({ label, answer, unit }) {
  return (
    <>
      <p className="text-xs text-white/60">{label}</p>
      <BigNumber value={answerText(answer)} unit={unit} tone={VALUE_TONE[answer.state]} />
    </>
  );
}

/** The answer on the stage, in its state's colour. */
function AnswerChip({ x, y, w, h, text, state }) {
  const color = VALUE_FILL[state];
  return (
    <g className={state === 'shadow' ? undefined : styles.pop}>
      <rect x={x} y={y} width={w} height={h} rx="6" fill={state === 'shadow' ? 'transparent' : `${color}1F`} stroke={color} strokeWidth="1" />
      <text x={x + w / 2} y={y + h / 2 + 3.2} textAnchor="middle" fontSize="9" fontWeight="700" fill={state === 'shadow' ? '#94A3B8' : color} style={MONO_STYLE}>
        {text}
      </text>
    </g>
  );
}

const STACK_STEP = 5;

/** One stack per day from x, `gap` apart; `base` is the top of the lowest coin. */
function CoinStacks({ rows, cfg, x, gap, base, looks = {} }) {
  return rows.map((r, i) => {
    const left = x + i * gap;
    const n = stackCoins(r.value, cfg);
    return (
      <g key={r.ref} style={looks[r.ref]}>
        <ContactShadow cx={left + 9} cy={base + 7} rx={11} ry={3} />
        {n === 0 && <StackCoin x={left} y={base} state="shadow" />}
        {Array.from({ length: n }, (_, k) => (
          <StackCoin key={k} x={left} y={base - k * STACK_STEP} state="match" />
        ))}
        <text x={left + 9} y={base + 17} textAnchor="middle" fontSize="7" fill="#94A3B8" style={MONO_STYLE}>
          {displayValue(r.value)}
        </text>
      </g>
    );
  });
}

// 2-1
const ARC = 'M46 104 Q 100 8 166 56';

function TipJarStage({ rows, cfg, answers }) {
  const [answer] = answers;
  const text = answerText(answer);
  const w = Math.max(44, text.length * 5.6 + 14);
  return (
    <>
      <Backdrop name="coin-jar" x={150} y={40} w={92} />
      <Overlay>
        <CoinStacks rows={rows} cfg={cfg} x={14} gap={26} base={150} />
        <path d={ARC} fill="none" stroke={C.lime} strokeOpacity="0.7" strokeWidth="1.2" strokeDasharray="4 3" />
        <path d="M160 48 L167 57 L156 58" fill="none" stroke={C.lime} strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <AnswerChip x={193 - w / 2} y={14} w={w} h={21} text={text} state={answer.state} />
        {answer.state === 'match' &&
          [0, 1, 2].map((i) => (
            <g key={i} className={styles.hop} style={{ offsetPath: `path("${ARC}")`, animationDelay: `${i * 110}ms` }}>
              <Coin x={-6} y={-6} state="match" />
            </g>
          ))}
      </Overlay>
    </>
  );
}

function TipJarTotal({ answers }) {
  return <AnswerTotal label={`${answers[0].ref} · ยอดขายรวม`} answer={answers[0]} unit="บาท" />;
}

// 2-2
const AVERAGE_STACKS = { x: 18, gap: 30, base: 160 };

function AverageStage({ rows, cfg, answers }) {
  const [answer] = answers;
  const { x, gap, base } = AVERAGE_STACKS;
  const zero = zeroDay(rows, answer);
  const lineY = typeof answer.value === 'number' ? base + STACK_STEP - coinHeight(answer.value, cfg, STACK_STEP) : null;
  const zeroX = zero ? x + zero.index * gap + 9 : 0;
  return (
    <>
      <Backdrop name="cash-register" x={176} y={96} w={68} />
      <Overlay>
        <CoinStacks rows={rows} cfg={cfg} {...AVERAGE_STACKS} />
        {lineY !== null && (
          <g>
            <line x1="8" x2="168" y1={lineY} y2={lineY} stroke={C.blue} strokeWidth="1.2" strokeDasharray="4 3" />
            <text x="100" y={lineY - 4} fontSize="7.5" fontWeight="700" fill={C.blue}>
              เฉลี่ย {money(answer.value)}
            </text>
          </g>
        )}
        {zero && (
          <>
            <path d={`M103 31 C 103 80, ${zeroX + 12} 100, ${zeroX} ${base - 4}`} fill="none" stroke={C.amber} strokeWidth="1" strokeDasharray="3 2.5" />
            <StageTag cx={103} cy={21.5} w={82} h={19} tag={{ meaning: 'warning', text: '0 ก็นับเป็น 1 วัน', state: 'match' }} />
          </>
        )}
      </Overlay>
    </>
  );
}

function averageTone(row, { rows, answers }) {
  return zeroDay(rows, answers[0])?.ref === row.ref ? 'warn' : 'plain';
}

function AverageTotal({ rows, answers }) {
  const [answer] = answers;
  const { sum, count } = averageParts(rows);
  const label = answer.state === 'match' ? `${answer.ref} · ${money(sum)} ÷ ${count}` : answer.ref;
  return <AnswerTotal label={label} answer={answer} unit="บาท / วัน" />;
}

// 2-3
const PODIUM_STACKS = { x: 24, gap: 46, base: 166 };
const TROPHY_W = 56;
const MAX_LOOK = { filter: 'brightness(1.2) saturate(1.25)' };
const MIN_LOOK = { opacity: 0.5 };

function PodiumStage({ rows, cfg, answers }) {
  const { x, gap, base } = PODIUM_STACKS;
  const { max, min } = podiumTags(rows, answers);
  const centre = (r) => x + r.index * gap + 9;
  const looks = { ...(min && { [min.ref]: MIN_LOOK }), ...(max && { [max.ref]: MAX_LOOK }) };
  return (
    <>
      {max && <Backdrop name="trophy" x={Math.min(VB_W - TROPHY_W - 4, Math.max(4, centre(max) - TROPHY_W / 2))} y={28} w={TROPHY_W} />}
      <Overlay>
        <CoinStacks rows={rows} cfg={cfg} {...PODIUM_STACKS} looks={looks} />
        {max && <StageTag cx={Math.min(VB_W - 32, Math.max(32, centre(max)))} cy={17.5} w={32} h={19} tag={{ meaning: 'ok', text: 'MAX', state: 'match' }} />}
        {min && (
          <StageTag cx={centre(min)} cy={base - Math.max(0, stackCoins(min.value, cfg) - 1) * STACK_STEP - 13} w={32} h={19} tag={{ meaning: 'warning', text: 'MIN', state: 'match' }} />
        )}
      </Overlay>
    </>
  );
}

function podiumTone(row, { rows, answers }) {
  const { max, min } = podiumTags(rows, answers);
  if (max?.ref === row.ref) return 'ok';
  return min?.ref === row.ref ? 'warn' : 'plain';
}

function PodiumTotal({ answers }) {
  const [max, min] = answers;
  return (
    <>
      <AnswerTotal label={`${max.ref} · MAX`} answer={max} unit="บาท" />
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-xs text-white/60">{min.ref} · MIN</span>
        <span className={`${MONO} text-xl font-bold tabular-nums ${VALUE_TONE[min.state]}`}>{answerText(min)}</span>
        <span className="text-xs text-white/50">บาท</span>
      </p>
    </>
  );
}

// 2-4
const ORDER_KIND = {
  number: { name: 'ตัวเลข', tone: 'text-[#86EFAC]' },
  text: { name: 'ข้อความ', tone: 'text-white/40' },
  blank: { name: 'ช่องว่าง', tone: 'text-white/40' },
};

function SpikeStage({ level, rows, answers }) {
  const [answer] = answers;
  return (
    <>
      <Backdrop name="cash-register" x={168} y={92} w={74} />
      <Overlay>
        {rows.map((r, i) => {
          const kind = orderCell(level, r.ref);
          return (
            <g key={r.ref}>
              <SpikeSlip x={14 + i * 30} y={14} kind={kind} text={kind === 'blank' ? 'ว่าง' : displayValue(r.value)} />
              <CountBadge x={16 + i * 30} y={100} counted={kind === 'number'} />
            </g>
          );
        })}
        <AnswerChip x={14} y={150} w={78} h={21} text={`COUNT = ${answerText(answer)}`} state={answer.state} />
      </Overlay>
    </>
  );
}

function OrderProps({ row, level }) {
  const { name, tone } = ORDER_KIND[orderCell(level, row.ref)];
  return <span className={`text-xs ${tone}`}>{name}</span>;
}

function orderTone(row, { level }) {
  return orderCell(level, row.ref) === 'number' ? 'plain' : 'skip';
}

function OrderValue({ row, level, tone }) {
  const counted = orderCell(level, row.ref) === 'number';
  return <span className={`text-right text-sm font-bold ${counted ? 'text-[#86EFAC]' : tone.value}`}>{counted ? 'นับ' : 'ข้าม'}</span>;
}

function SpikeTotal({ answers }) {
  return <AnswerTotal label={`${answers[0].ref} · ออเดอร์ที่ขายได้`} answer={answers[0]} unit="ออเดอร์" />;
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

// ── Beginner CH.3: text functions ────────────────────────────────────────────

const CHAR = { x: 13, step: 25, y: 24, w: 22, h: 30 };
const OUTPUT_Y = 104;
const OUTPUT_LOOK = {
  match: { fill: 'rgba(134,239,172,0.12)', stroke: 'rgba(134,239,172,0.8)', text: C.green },
  current: { fill: 'rgba(96,165,250,0.12)', stroke: 'rgba(96,165,250,0.8)', text: C.blue },
  error: { fill: 'rgba(248,113,113,0.12)', stroke: 'rgba(248,113,113,0.8)', text: C.red },
  shadow: { fill: 'transparent', stroke: C.shadow, text: '#94A3B8' },
};

const codeOf = (sheet, row) => String(sheet[`A${row.row}`] ?? '');
const rowValue = (row) => (row.state === 'shadow' ? '—' : displayValue(row.value));

/** The focused row's code as numbered boxes; the characters it was cut from light up. */
function CharBoxes({ code, span, state }) {
  const lit = (i) => i + 1 >= span.start && i + 1 < span.start + span.count;
  const hot = state === 'error' ? C.red : C.lime;
  const dim = state === 'shadow';
  return [...code].map((ch, i) => {
    const on = lit(i);
    const x = CHAR.x + i * CHAR.step;
    return (
      <g key={i}>
        <text x={x + CHAR.w / 2} y="19" textAnchor="middle" fontSize="9" fontWeight="500" fill={on ? hot : '#475569'} style={MONO_STYLE}>
          {i + 1}
        </text>
        <rect
          x={x}
          y={CHAR.y}
          width={CHAR.w}
          height={CHAR.h}
          rx="6"
          fill={on ? (dim ? 'rgba(212,247,63,0.16)' : hot) : '#17294A'}
          stroke={on ? hot : 'rgba(255,255,255,0.08)'}
        />
        <text x={x + CHAR.w / 2} y={CHAR.y + 20} textAnchor="middle" fontSize="14" fontWeight="500" fill={on ? (dim ? hot : '#0D1B2A') : '#94A3B8'} style={MONO_STYLE}>
          {ch}
        </text>
      </g>
    );
  });
}

/** Bracket under the cut characters, dashed down to the output slot's top at `toX`. */
function CutBracket({ span, toX }) {
  const left = CHAR.x + (span.start - 1) * CHAR.step;
  const right = CHAR.x + (span.start + span.count - 2) * CHAR.step + CHAR.w;
  const midX = (left + right) / 2;
  return (
    <g fill="none" stroke={C.lime} strokeWidth="1.5">
      <path d={`M${left} 58 V63 H${right} V58`} strokeLinecap="round" />
      <path d={`M${midX} 63 Q ${midX} 82, ${toX} ${OUTPUT_Y - 6}`} strokeDasharray="3 3" />
      <path d={`M${toX - 4} ${OUTPUT_Y - 8} L${toX} ${OUTPUT_Y - 2} L${toX + 4} ${OUTPUT_Y - 8}`} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function OutputSlot({ x, w, row, slot, text }) {
  const look = OUTPUT_LOOK[row.state];
  return (
    <g>
      <rect x={x} y={OUTPUT_Y} width={w} height="46" rx="10" fill={look.fill} stroke={look.stroke} />
      <text x={x + 7} y={OUTPUT_Y + 13} fontSize="9" fill="#94A3B8">
        <tspan style={MONO_STYLE}>{row.ref}</tspan> · {slot}
      </text>
      <text x={x + 7} y={OUTPUT_Y + 35} fontSize="18" fontWeight="500" fill={look.text} style={MONO_STYLE}>
        {text}
      </text>
    </g>
  );
}

/** Lime chip with the lesson's formula, once a row has earned it. */
function RuleChip({ rows, rule }) {
  if (!ruleEarned(rows)) return null;
  const w = rule.length * 6 + 10;
  return (
    <g>
      <rect x="14" y="162" width={w} height="15" rx="4" fill={C.lime} />
      <text x="19" y="173" fontSize="10" fontWeight="500" fill="#0D1B2A" style={MONO_STYLE}>
        {rule}
      </text>
    </g>
  );
}

/** Small outlined tag on the stage, top-left at (x, y). */
function PillTag({ x, y, w, text, color, mono = false }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height="19" rx="6" fill={`${color}29`} stroke={`${color}CC`} />
      <text x={x + w / 2} y={y + 13} textAnchor="middle" fontSize="10" fontWeight="600" fill={color} style={mono ? MONO_STYLE : undefined}>
        {text}
      </text>
    </g>
  );
}

/** Head of the three code-cut stages: boxes and bracket for the focused row. */
function cutOf({ rows, sheet, cfg }) {
  const row = focusRow(rows);
  const code = codeOf(sheet, row);
  return { row, code, span: cutSpan(code, row.state === 'shadow' ? null : row.value, cfg.cut) };
}

function ProductCodeStage(ctx) {
  const { rows, cfg } = ctx;
  const { row, code, span } = cutOf(ctx);
  return (
    <>
      <Backdrop name="shelf" x={147} y={70} w={86} />
      <Overlay>
        <CharBoxes code={code} span={span} state={row.state} />
        <CutBracket span={span} toX={56} />
        <OutputSlot x={14} w={84} row={row} slot={cfg.slot} text={rowValue(row)} />
        <RuleChip rows={rows} rule={cfg.rule} />
      </Overlay>
    </>
  );
}

function SerialNoStage(ctx) {
  const { cfg } = ctx;
  const { row, code, span } = cutOf(ctx);
  const shown = typeof row.value === 'string' && row.state !== 'shadow' ? `"${row.value}"` : rowValue(row);
  return (
    <>
      <Backdrop name="cash-register" x={18} y={78} w={88} />
      <Overlay>
        <CharBoxes code={code} span={span} state={row.state} />
        <CutBracket span={span} toX={193} />
        <OutputSlot x={148} w={90} row={row} slot={cfg.slot} text={shown} />
        {row.state !== 'shadow' && typeof row.value === 'string' && <PillTag x={132} y={160} w={92} text="ข้อความ · 0 ไม่หาย" color={C.green} />}
      </Overlay>
    </>
  );
}

const CUPS = [
  { size: 'S', x: 104, y: 117, w: 26, h: 33 },
  { size: 'M', x: 148, y: 107, w: 34, h: 43 },
  { size: 'L', x: 200, y: 97, w: 42, h: 53 },
];

function CupSizeStage(ctx) {
  const { rows, cfg } = ctx;
  const { row, code, span } = cutOf(ctx);
  const picked = row.state === 'shadow' || row.state === 'error' ? null : row.value;
  return (
    <Overlay>
      <CharBoxes code={code} span={span} state={row.state} />
      <CutBracket span={span} toX={50} />
      <OutputSlot x={14} w={72} row={row} slot={cfg.slot} text={rowValue(row)} />
      {CUPS.map((c) => (
        <g key={c.size}>
          <SizeCup x={c.x} y={c.y} w={c.w} h={c.h} lit={c.size === picked} />
          <text x={c.x + c.w / 2} y="165" textAnchor="middle" fontSize="11" fontWeight="500" fill={c.size === picked ? C.blue : '#94A3B8'} style={MONO_STYLE}>
            {c.size}
          </text>
        </g>
      ))}
      <RuleChip rows={rows} rule={cfg.rule} />
    </Overlay>
  );
}

/** Row props on the code scenes: the code, the part this row cut in lime. */
function CodeProps({ row, sheet, cfg }) {
  const code = codeOf(sheet, row);
  const shadow = row.state === 'shadow';
  const { start, count } = cutSpan(code, shadow ? null : row.value, cfg.cut);
  const part = (text, cls) => <span className={`${MONO} ${cls}`}>{text}</span>;
  return (
    <span className={`${MONO} truncate text-[11px]`}>
      {part(code.slice(0, start - 1), shadow ? 'text-white/30' : 'text-white/55')}
      {part(code.slice(start - 1, start - 1 + count), shadow ? 'text-white/30' : 'text-[#D4F73F]')}
      {part(code.slice(start - 1 + count), shadow ? 'text-white/30' : 'text-white/55')}
    </span>
  );
}

/** The total box of a text scene: a line about the focused row, then its value. */
function TextTotal({ row, label, unit, tone, value }) {
  return (
    <>
      <p className="text-xs text-white/60">{label}</p>
      <BigNumber value={value ?? rowValue(row)} unit={row.state === 'shadow' ? null : unit} tone={tone ?? VALUE_TONE[row.state]} plain />
    </>
  );
}

function ProductCodeTotal({ rows, sheet, cfg }) {
  const row = focusRow(rows);
  return <TextTotal row={row} label={`ลูกค้าสั่ง${sheet[`B${row.row}`]} · รหัส ${codeOf(sheet, row)}`} unit={cfg.unit} />;
}

function SerialNoTotal({ rows, cfg }) {
  return <TextTotal row={focusRow(rows)} label="ผลเป็นข้อความ เลข 0 ข้างหน้าไม่หาย" unit={cfg.unit} />;
}

function CupSizeTotal({ rows, cfg }) {
  const row = focusRow(rows);
  const [start, count] = cfg.cut;
  return <TextTotal row={row} label={`MID เริ่มที่ตัวที่ ${start} แล้วเอามา ${count} ตัว`} unit={cfg.sizes[row.value]} />;
}

// 3-4 phone check

const SLOT = { x: 14, step: 19, w: 16, h: 22 };
const phoneOf = (sheet, row) => String(sheet[`B${row.row}`] ?? '');
const isShort = (row, cfg) => row.state !== 'shadow' && typeof row.value === 'number' && row.value < cfg.digits;

function PhoneLine({ row, sheet, cfg, y, focused }) {
  const counted = row.state !== 'shadow';
  const short = isShort(row, cfg);
  const hot = focused && counted;
  const countColor = short ? C.amber : row.state === 'error' ? C.red : row.state === 'match' ? C.green : C.blue;
  return (
    <g>
      <text x={SLOT.x} y={y + 11} fontSize="11" fill="#94A3B8">
        {row.label}
      </text>
      {phoneSlots(phoneOf(sheet, row), cfg.digits).map((digit, i) => {
        const x = SLOT.x + i * SLOT.step;
        const missing = digit === null;
        let fill = '#17294A';
        let stroke = 'rgba(255,255,255,0.1)';
        if (missing) {
          fill = counted ? 'rgba(251,191,36,0.08)' : 'transparent';
          stroke = counted ? 'rgba(251,191,36,0.9)' : C.shadow;
        } else if (hot) {
          fill = 'rgba(96,165,250,0.18)';
          stroke = 'rgba(96,165,250,0.7)';
        }
        return (
          <g key={i}>
            <rect x={x} y={y + 18} width={SLOT.w} height={SLOT.h} rx="4" fill={fill} stroke={stroke} strokeDasharray={missing ? '3 2' : undefined} />
            {!missing && (
              <text x={x + SLOT.w / 2} y={y + 33} textAnchor="middle" fontSize="11" fontWeight="500" fill={hot ? 'white' : '#94A3B8'} style={MONO_STYLE}>
                {digit}
              </text>
            )}
          </g>
        );
      })}
      <text x="210" y={y + 35} fontSize="16" fontWeight="500" fill={counted ? countColor : '#94A3B8'} style={MONO_STYLE}>
        {counted ? displayValue(row.value) : '?'}
      </text>
    </g>
  );
}

function PhoneCheckStage({ rows, sheet, cfg }) {
  const focus = focusRow(rows);
  const short = phonePair(rows).find((r) => isShort(r, cfg));
  return (
    <Overlay>
      {phonePair(rows).map((r, i) => (
        <PhoneLine key={r.ref} row={r} sheet={sheet} cfg={cfg} y={i * 52} focused={r === focus} />
      ))}
      {short && <PillTag x={14} y={116} w={60} text={`ขาด ${cfg.digits - short.value} หลัก`} color={C.amber} />}
      <RuleChip rows={rows} rule={cfg.rule} />
      {ruleEarned(rows) && <PillTag x={168} y={160} w={55} text={`ครบ = ${cfg.digits}`} color={C.green} />}
    </Overlay>
  );
}

function PhoneProps({ row, sheet, cfg }) {
  return (
    <>
      <span className={`${MONO} truncate text-[11px] ${row.state === 'shadow' ? 'text-white/30' : 'text-white/55'}`}>{phoneOf(sheet, row)}</span>
      {isShort(row, cfg) && <StatusTag tag={{ meaning: 'warning', text: 'ไม่ครบ', state: row.state }} />}
    </>
  );
}

function PhoneValue({ row, cfg }) {
  const tone = isShort(row, cfg) && row.state !== 'error' ? 'text-[#FBBF24]' : ROW_TONE[row.state].value;
  return <span className={`${MONO} text-right text-sm tabular-nums ${tone}`}>{rowValue(row)}</span>;
}

function PhoneCheckTotal({ rows, sheet, cfg }) {
  const row = focusRow(rows);
  const short = isShort(row, cfg);
  return (
    <TextTotal
      row={row}
      label={`${row.label} · ${phoneOf(sheet, row)}`}
      unit={`หลัก · ${short ? 'ไม่ครบ' : 'ครบ'}`}
      tone={short && row.state !== 'error' ? 'text-[#FBBF24]' : undefined}
    />
  );
}

// 3-5 label printer

function LabelPrinterStage({ rows, sheet, cfg }) {
  const row = focusRow(rows);
  const printed = row.state !== 'shadow';
  return (
    <>
      <Backdrop name="3d-label-printer" x={124} y={0} w={124} />
      <Overlay>
        <rect x="10" y="30" width="88" height="40" rx="8" fill="#17294A" stroke="rgba(255,255,255,0.18)" strokeDasharray="3 2" />
        <text x="16" y="42" fontSize="8" fill="#94A3B8">
          <tspan style={MONO_STYLE}>{`A${row.row}`}</tspan> พิมพ์มา
        </text>
        <text x="16" y="60" fontSize="11" fontWeight="500" fill="white" style={MONO_STYLE}>
          {codeOf(sheet, row)}
        </text>
        <g fill="none" stroke={C.lime} strokeWidth="1.5">
          <path d="M100 50 H126" strokeDasharray="3 3" />
          <path d="M123 46 L129 50 L123 54" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <rect x="130" y="124" width="110" height="30" rx="4" fill={printed ? 'white' : 'rgba(255,255,255,0.08)'} stroke={row.state === 'error' ? C.red : 'none'} strokeWidth="1.5" />
        <text x="185" y="144" textAnchor="middle" fontSize="13" fontWeight="500" fill={!printed ? '#94A3B8' : row.state === 'error' ? '#B91C1C' : '#0D1B2A'} style={MONO_STYLE}>
          {rowValue(row)}
        </text>
        <PillTag x={14} y={138} w={93} text="LOWER ทำกลับกัน" color="#94A3B8" />
        <RuleChip rows={rows} rule={cfg.rule} />
      </Overlay>
    </>
  );
}

function TypedProps({ row, sheet }) {
  return <span className={`${MONO} truncate text-[10px] ${row.state === 'shadow' ? 'text-white/30' : 'text-white/55'}`}>{codeOf(sheet, row)}</span>;
}

/** Both codes share one row, so the result runs a step smaller than other scenes'. */
function PrintedValue({ row }) {
  return <span className={`${MONO} text-right text-xs tabular-nums ${ROW_TONE[row.state].value}`}>{rowValue(row)}</span>;
}

function LabelPrinterTotal({ rows }) {
  const row = focusRow(rows);
  return <TextTotal row={row} label={row.state === 'shadow' ? 'ยังไม่ได้พิมพ์ป้ายใหม่' : `ป้ายใหม่ของแถว ${row.row} พิมพ์แล้ว`} />;
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

// Beginner boss: daily orders

const RECEIPT = { x: 10, step: 30, y: 48, w: 26, h: 58 };
const ORDER_BAR = { x: 10, y: 150, w: 228, h: 8 };
const amountOf = (sheet, row) => sheet[`B${row.row}`];

function DailyOrdersStage({ level, rows, results, sheet, cfg, progress }) {
  const steps = bossSteps(level, progress);
  const total = ordersTotal(level, rows, results, progress);
  const average = ordersAverage(level, results, progress);
  let chipX = 8;
  return (
    <>
      <Backdrop name="coin-jar" x={167} y={32} w={68} />
      <Overlay>
        {steps.map((state, i) => {
          const look = STEP_LOOK[state];
          const text = `${i + 1} ${cfg.steps[i]}`;
          const w = 12 + text.length * 5;
          const x = chipX;
          chipX += w + 4;
          return (
            <g key={text}>
              <rect x={x} y="8" width={w} height="19" rx="9.5" fill={look.fill} stroke={look.stroke} strokeWidth="1" strokeDasharray={state === 'shadow' ? '2.5 2' : undefined} />
              <text x={x + w / 2} y="21" textAnchor="middle" fontSize="9.5" fontWeight="600" fill={look.text}>
                {text}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const x = RECEIPT.x + i * RECEIPT.step;
          return (
            <g key={r.ref}>
              <Receipt x={x} y={RECEIPT.y} w={RECEIPT.w} h={RECEIPT.h} state="match" />
              <Coupon x={x - 2} y={RECEIPT.y - 8} w={28} text={r.state === 'shadow' ? '?' : displayValue(r.value)} state={r.state} />
              <text x={x + RECEIPT.w / 2} y={RECEIPT.y + 52} textAnchor="middle" fontSize="9" fontWeight="600" fill="#0D1B2A" style={MONO_STYLE}>
                {amountOf(sheet, r)}
              </text>
            </g>
          );
        })}
        <Coupon x={185} y={114} w={28} text={money(total)} />
        <rect x={ORDER_BAR.x} y={ORDER_BAR.y} width={ORDER_BAR.w} height={ORDER_BAR.h} rx="4" fill="rgba(255,255,255,0.1)" />
        <rect x={ORDER_BAR.x} y={ORDER_BAR.y} width={ORDER_BAR.w * stepsFill(steps)} height={ORDER_BAR.h} rx="4" fill={C.green} />
        <text x={ORDER_BAR.x} y="176" fontSize="10" fontWeight="600" fill={C.blue} style={MONO_STYLE}>
          ยอดรวม {money(total)}
        </text>
        <text x={ORDER_BAR.x + ORDER_BAR.w} y="176" textAnchor="end" fontSize="10" fontWeight="600" fill={average === null ? '#94A3B8' : C.green} style={MONO_STYLE}>
          เฉลี่ย {average === null ? '?' : displayValue(average)}
        </text>
      </Overlay>
    </>
  );
}

function OrderTypeProps({ row }) {
  if (row.state === 'shadow') return null;
  return (
    <MiniSvg w={28} h={14} viewBox="0 0 20 10">
      <Coupon x={0} y={0} text={displayValue(row.value)} state={row.state} />
    </MiniSvg>
  );
}

function OrderAmount({ row, sheet }) {
  return <span className={`${MONO} text-right text-sm tabular-nums ${row.state === 'shadow' ? 'text-white/30' : 'text-[#86EFAC]'}`}>{amountOf(sheet, row)}</span>;
}

function DailyOrdersTotal({ level, rows, results, sheet, progress, fmt }) {
  const { taskIndex, complete } = progress;
  const step = complete ? 2 : taskIndex;
  const task = level.tasks[step];
  if (step === 0) {
    return (
      <>
        <p className="text-xs text-white/60">ขั้น 1 · {task.mission}</p>
        <BigNumber value={ordersTotal(level, rows, results, progress)} unit="บาท" fmt={fmt} countUp />
      </>
    );
  }
  const result = results[task.anchor];
  const tone = !result ? 'text-white/30' : result.ok ? 'text-[#86EFAC]' : 'text-[#F87171]';
  const sum = step === 1 ? ` · ${rows.map((r) => amountOf(sheet, r)).join('+')}` : '';
  return (
    <>
      <p className={`text-xs text-white/60 ${MONO}`}>
        ขั้น {step + 1} · {task.model}{sum}
      </p>
      <BigNumber value={result ? result.value : '—'} unit={result ? 'บาท' : null} tone={tone} fmt={fmt} />
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
        <p className={`text-xs text-white/60 ${MONO}`}>
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
