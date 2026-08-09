"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronUp, X } from "lucide-react";
import { formatTHB } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { setOccupiedBox, clearOccupiedBox } from "@/lib/viewportBottomInset";
import { stickyBarOccupancyHeight } from "@/lib/stickyBarOccupancy";
import { SummaryLine } from "./PaymentAtoms";

/**
 * Step 2 mobile-only bottom bar: collapsed total + CTA, with an expandable
 * summary sheet. A component (not an inline IIFE) so its useState hook is
 * called unconditionally.
 *
 * `pricing` may be null on the public registration wizard (no price for the
 * round). In that case the amount column and the summary sheet are omitted
 * entirely — the back button and the quote CTA still render.
 *
 * `perSeatLabel` exists because the two callers word the line differently:
 * masterclass says "ราคาต่อที่นั่ง" (the default), public registration says
 * "ราคาต่อท่าน".
 *
 * ── `publishesOccupancy` AND WHY IT IS NOT SIMPLY ALWAYS ON ─────────────────
 * This bar covers the bottom edge, so the floating dock has to clear it — and
 * on /registration/* nothing does that today, which is the defect this prop
 * fixes. But the SAME component is also rendered by MasterclassRegisterClient
 * on /masterclass/[slug]/register, and that path is the one and only path
 * `dockLiftsForBottomBar` fires on: the dock is already sitting at bottom-24
 * there because of a hardcoded rule. Publishing from both callers would make
 * the dock DOUBLE-COUNT — static lift plus measured inset — and float roughly
 * 200px above the bar.
 *
 * So it is opt-in, and the caller that opts in is the one with no lift. This
 * prop is temporary in the honest sense: when the static lift is retired in
 * favour of the measured clearance, every caller opts in and the prop goes.
 * Retiring the lift is a separate decision with its own click-testing, so it
 * is not done here.
 */
export function Step2MobileBar({
  pricing,
  canStep2Confirm,
  submitting,
  method,
  onConfirm,
  onBack,
  perSeatLabel = "ราคาต่อที่นั่ง",
  publishesOccupancy = false,
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const hasPricing = Boolean(pricing);

  // ── Publishing the occupied box ───────────────────────────────────────────
  // Same contract as the course and masterclass bars, and the SAME rule from
  // src/lib/stickyBarOccupancy — a third copy of "is this bar covering the
  // bottom edge" is the duplication this repo keeps paying for.
  //
  // Unconditional hooks, as the docstring above already requires of this
  // component: the opt-out lives inside the effects, not around them.
  const barKey = useId();
  const barRef = useRef(null);
  const [metrics, setMetrics] = useState({
    barHeight: 0,
    bottomOffset: 0,
    barLeft: 0,
    barRight: 0,
  });

  useEffect(() => {
    if (!publishesOccupancy) return undefined;
    const measure = () => {
      const el = barRef.current;
      if (!el) return;
      // `lg:hidden` is handled HERE and nowhere else: a display:none element
      // reports offsetHeight 0, and the shared rule turns a zero height into
      // zero occupancy. No breakpoint is named in this file.
      const barHeight = el.offsetHeight;
      const rect = el.getBoundingClientRect();
      const bottomOffset =
        Number.parseFloat(window.getComputedStyle(el).bottom) || 0;
      // A display:none element also reports an all-zero rect, which is a
      // DEGENERATE span the store refuses outright — and a refusal would strand
      // the previous box rather than zeroing it, leaving the dock lifted at lg
      // after a resize down from mobile. Keep the last known span and let the
      // height carry the answer.
      const usable = rect.right > rect.left;
      setMetrics((prev) => {
        const barLeft = usable ? rect.left : prev.barLeft;
        const barRight = usable ? rect.right : prev.barRight;
        return prev.barHeight === barHeight &&
          prev.bottomOffset === bottomOffset &&
          prev.barLeft === barLeft &&
          prev.barRight === barRight
          ? prev
          : { barHeight, bottomOffset, barLeft, barRight };
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // `method` and `hasPricing` change which controls render, which changes the
    // bar's height.
  }, [publishesOccupancy, method, hasPricing]);

  // Neither `dismissed` nor `revealed` is a state this bar has: it has no X of
  // its own (the X closes the summary sheet) and no reveal window — it is
  // simply there whenever it is mounted and displayed. Passing the constants is
  // honest, and it keeps the lg:hidden case flowing through the rule's
  // zero-height branch instead of a second condition written here.
  const occupancyHeight = stickyBarOccupancyHeight({
    dismissed: false,
    revealed: true,
    cardHeight: metrics.barHeight,
    bottomOffset: metrics.bottomOffset,
  });

  useEffect(() => {
    if (!publishesOccupancy) return;
    setOccupiedBox(barKey, {
      height: occupancyHeight,
      left: metrics.barLeft,
      right: metrics.barRight,
    });
  }, [publishesOccupancy, barKey, occupancyHeight, metrics.barLeft, metrics.barRight]);

  // Teardown only. A no-op when nothing was ever published, so it is safe to
  // run unconditionally — and running it unconditionally means the opt-out
  // cannot leave a box behind by forgetting a branch.
  useEffect(() => () => clearOccupiedBox(barKey), [barKey]);

  return (
    <>
      {/* Expandable summary sheet */}
      {summaryOpen && hasPricing && (
        <div
          className="fixed inset-0 z-[60] flex items-end lg:hidden"
          onClick={() => setSummaryOpen(false)}
        >
          <div
            className="w-full rounded-t-2xl border-t border-[var(--surface-border)] bg-white p-5 shadow-2xl dark:bg-[#0D1B2A]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-9e-navy dark:text-white">
                สรุปยอด
              </h3>
              <button
                type="button"
                onClick={() => setSummaryOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <SummaryLine
                label={`${perSeatLabel} × ${pricing.seats}`}
                value={`${formatTHB(pricing.subtotal)} บาท`}
              />
              <SummaryLine label="ส่วนลด" value={`${formatTHB(0)} บาท`} />
              <SummaryLine
                label="VAT 7%"
                value={`${formatTHB(pricing.vatAmount)} บาท`}
              />
              <div className="mt-2 flex items-baseline justify-between border-t border-[var(--surface-border)] pt-2">
                <span className="font-semibold text-9e-navy dark:text-white">
                  ยอดรวมสุทธิ
                </span>
                <span className="text-xl font-bold text-9e-action">
                  {formatTHB(pricing.total)} บาท
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--surface-border)] bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] dark:bg-[#0D1B2A] lg:hidden"
      >
        <div className="flex items-center gap-2">
          {/* Price + expand toggle — omitted when there is no price to show */}
          {hasPricing ? (
            <button
              type="button"
              onClick={() => setSummaryOpen((v) => !v)}
              className="flex flex-1 flex-col items-start"
            >
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ยอดรวมสุทธิ
              </span>
              <span className="flex items-center gap-1 text-base font-bold text-9e-action">
                {formatTHB(pricing.total)} บาท
                <ChevronUp
                  size={14}
                  className={cn(
                    "transition-transform",
                    summaryOpen && "rotate-180",
                  )}
                />
              </span>
            </button>
          ) : (
            <div className="flex-1" />
          )}
          {/* Back button */}
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="flex shrink-0 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold border border-[var(--surface-border)] text-gray-500 hover:bg-9e-ice dark:hover:bg-white/5"
          >
            ย้อนกลับ
          </button>
          {/* CTA — quote path only */}
          {method === "quote" && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canStep2Confirm || submitting}
              className={cn(
                "rounded-full px-5 py-3 text-sm font-semibold transition-colors",
                canStep2Confirm && !submitting
                  ? "bg-9e-lime text-9e-navy hover:bg-9e-lime/80"
                  : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500",
              )}
            >
              {submitting ? "..." : "ขอใบเสนอราคา"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
