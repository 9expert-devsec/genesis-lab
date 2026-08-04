"use client";

import { useState } from "react";
import { ChevronUp, X } from "lucide-react";
import { formatTHB } from "@/lib/pricing";
import { cn } from "@/lib/utils";
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
 */
export function Step2MobileBar({
  pricing,
  canStep2Confirm,
  submitting,
  method,
  onConfirm,
  onBack,
  perSeatLabel = "ราคาต่อที่นั่ง",
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const hasPricing = Boolean(pricing);
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
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--surface-border)] bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] dark:bg-[#0D1B2A] lg:hidden">
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
