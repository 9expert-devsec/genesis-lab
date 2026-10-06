"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { INITIAL_CONSENT, applyAll, toggleCategory } from "@/lib/consentChoices";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CookieSettingsDialog — LAYER 2 of the consent UI (round CB-C).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A real modal: role="dialog", aria-modal, labelled by its heading. Focus moves
 * in on open, is trapped while open, and Esc / × / the scrim close it. Focus
 * going BACK to the opener is the mount's job (it knows what opened this; this
 * component only knows it was asked to close).
 *
 * ── CLOSING IS NOT DECIDING ─────────────────────────────────────────────────
 * Only the three footer buttons call `onDecision`. × / Esc / scrim call
 * `onClose`, which stores nothing and sends no consent update — a visitor who
 * peeks at the settings and backs out has not answered, and layer 1 asks again.
 *
 * ── THE SWITCHES ARE BUTTONS ────────────────────────────────────────────────
 * `<button role="switch" aria-checked>` with the row's title as its accessible
 * name: a native button gets focus, Enter and Space for free, and the role
 * announces it as an on/off control rather than as an action. OFF by default
 * for a first-time visitor (INITIAL_CONSENT); a returning visitor sees what is
 * stored, via `initial`.
 *
 * PRESENTATION ONLY, like layer 1: no cookie, no storage, no gtag here.
 */

const ROWS = [
  {
    key: null,
    title: "คุกกี้ที่จำเป็น",
    body: "ทำให้เว็บทำงานได้และจำสิ่งที่คุณเลือกเอง เช่น การตั้งค่าคุกกี้ การเข้าสู่ระบบ และโหมดสีมืด/สว่าง",
  },
  {
    key: "analytics",
    title: "คุกกี้วิเคราะห์",
    body: "ช่วยให้เรารู้ว่าคอร์สและบทความไหนมีประโยชน์ เพื่อปรับปรุงเนื้อหา (Google Analytics)",
  },
  {
    key: "marketing",
    title: "คุกกี้การตลาด",
    body: "วัดผลโฆษณาและแสดงโปรโมชันที่เกี่ยวข้องบน Google และแพลตฟอร์มอื่น",
  },
];

export const COOKIE_SETTINGS_TITLE = "ตั้งค่าคุกกี้";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const FOOTER_BUTTON = cn(
  "flex min-h-[46px] flex-1 items-center justify-center rounded-[12px] px-4",
  "text-[15px] font-bold leading-tight transition-colors duration-9e-micro ease-9e",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-9e-action",
);
const OUTLINE = cn(
  "border-2 border-[#005CFF] bg-white text-[#005CFF] hover:bg-9e-action-scale-950",
  "dark:border-9e-air dark:bg-transparent dark:text-9e-air dark:hover:bg-white/5",
);
const FILLED = "bg-[#005CFF] text-white hover:brightness-90 dark:bg-9e-air dark:text-9e-navy";

/**
 * @param open        render nothing when false
 * @param initial     the stored choice, or null for a first-time visitor
 * @param onClose     × / Esc / scrim — NOT a decision
 * @param onDecision  (categories, action) where action is 'reject_all' | 'save' | 'accept_all'
 */
export function CookieSettingsDialog({ open, initial = null, onClose, onDecision }) {
  const [state, setState] = useState(initial ?? INITIAL_CONSENT);
  const dialogRef = useRef(null);
  const headingId = useId();

  // Re-seed from the stored choice every time the panel opens, so a re-open
  // from the footer shows what is stored, not what was toggled last time and
  // then abandoned.
  useEffect(() => {
    if (open) setState(initial ?? INITIAL_CONSENT);
  }, [open, initial]);

  // Focus in on open; trap Tab; Esc closes.
  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    dialog?.querySelector("[data-dialog-initial-focus]")?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = dialog.ownerDocument.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog?.ownerDocument.addEventListener("keydown", onKey);

    // Background scroll lock while the modal is open.
    const body = dialog?.ownerDocument.body;
    const previousOverflow = body?.style.overflow;
    if (body) body.style.overflow = "hidden";

    return () => {
      dialog?.ownerDocument.removeEventListener("keydown", onKey);
      if (body) body.style.overflow = previousOverflow ?? "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-6">
      {/* The scrim: a click outside the panel closes it, which is not a decision. */}
      <div
        data-cookie-settings-scrim=""
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-9e-navy/60"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={cn(
          "relative flex max-h-[calc(100dvh-24px)] w-full max-w-[620px] flex-col overflow-y-auto",
          "rounded-[20px] p-[22px]",
          "bg-white text-9e-navy dark:bg-[var(--surface-raised)] dark:text-[var(--text-primary)]",
          "shadow-[0_20px_48px_rgba(15,23,42,0.28)]",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id={headingId}
            tabIndex={-1}
            data-dialog-initial-focus=""
            className="pt-2 text-[20px] font-bold leading-snug text-[var(--text-primary)] focus:outline-none"
          >
            {COOKIE_SETTINGS_TITLE}
          </h2>
          <button
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            className={cn(
              "-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
              "text-[var(--text-secondary)] hover:bg-9e-action-scale-950 dark:hover:bg-white/5",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-9e-action",
            )}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <ul className="mt-4 divide-y divide-9e-slate-lt-300 rounded-[14px] border border-9e-slate-lt-300 dark:divide-9e-border dark:border-9e-border">
          {ROWS.map((row) => {
            const titleId = `${headingId}-${row.key ?? "necessary"}`;
            const on = row.key ? state[row.key] === true : true;
            return (
              <li key={titleId} className="flex items-start gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <h3 id={titleId} className="text-[15px] font-bold text-[var(--text-primary)]">
                    {row.title}
                  </h3>
                  <p className="mt-1 text-[13px] leading-[1.6] text-[var(--text-secondary)]">{row.body}</p>
                </div>
                {row.key ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-labelledby={titleId}
                    data-consent-switch={row.key}
                    onClick={() => setState((prev) => toggleCategory(prev, row.key))}
                    className={cn(
                      "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-9e-action",
                      on ? "bg-[#005CFF] dark:bg-9e-air" : "bg-9e-slate-lt-300 dark:bg-9e-border",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
                        on ? "translate-x-6" : "translate-x-1",
                      )}
                    />
                  </button>
                ) : (
                  <span className="mt-0.5 shrink-0 rounded-full bg-9e-action-scale-950 px-3 py-1 text-[12px] font-bold text-[#005CFF] dark:bg-white/10 dark:text-9e-air">
                    เปิดตลอด
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button type="button" className={cn(FOOTER_BUTTON, OUTLINE)} onClick={() => onDecision?.(applyAll(false), "reject_all")}>
            ปฏิเสธทั้งหมด
          </button>
          <button type="button" className={cn(FOOTER_BUTTON, OUTLINE)} onClick={() => onDecision?.({ ...state }, "save")}>
            บันทึกตัวเลือก
          </button>
          <button type="button" className={cn(FOOTER_BUTTON, FILLED)} onClick={() => onDecision?.(applyAll(true), "accept_all")}>
            ยอมรับทั้งหมด
          </button>
        </div>
      </div>
    </div>
  );
}
