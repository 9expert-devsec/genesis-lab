import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * THE THREE-STEP PROGRESS INDICATOR for the public registration wizard and the
 * bundle quotation.
 *
 * Lifted out of RegisterWizard.jsx with its markup UNCHANGED — the class
 * strings, the element nesting and the connector's position inside the <li> are
 * all exactly what that component rendered, so the public flow's stepper is
 * byte-for-byte what it was.
 *
 * ══ WHY THIS EXISTS, AND WHY IT DID NOT ABSORB THE OTHER THREE ═════════════
 *
 * A survey found FOUR step indicators in this repo, none of them exported. That
 * shape is what the eleven classroom literals and the five round-date
 * formatters looked like before they cost something, so the bundle quotation
 * does NOT get a fifth. It reads this one.
 *
 * The other three are LEFT ALONE, DELIBERATELY, and each for a reason that
 * survives being written down. They are not an unfinished migration:
 *
 *   InhouseForm.jsx `InhouseStepper`
 *       Same palette and same labels, DIFFERENT MARKUP. Its <ol> and <li>
 *       carry `gap-2` and its number/label spans are direct children of the
 *       <li>; this one wraps them in a `flex flex-col … md:flex-row` div, so
 *       the public stepper STACKS the number above the label on a phone and
 *       the in-house one never does. Measured, not inferred: 1153 rendered
 *       bytes here against 982 there. Adopting this component would silently
 *       change the in-house wizard's mobile layout.
 *
 *   career-path-register/[slug] `Stepper`
 *       A different DESIGN, not a different spelling. It is on the action
 *       palette rather than the brand one (`9e-action`, `9e-navy`,
 *       `9e-slate-dp-50`), it is `my-6` and not centred, and its labels are
 *       `ยืนยันข้อมูล` / `เสร็จสิ้น` rather than `ตรวจสอบ` / `สำเร็จ`.
 *
 *   masterclass/[slug]/register `STEPS`
 *       Structurally unrelated: <div>/<div> rather than <ol>/<li>, a green and
 *       grey palette, `h-7` circles, and a connector positioned absolutely
 *       across each cell instead of sitting between them.
 *
 * Reproducing all four from one component would need parameters for the tag,
 * the palette, the gap, the wrapper, the connector's placement and the circle's
 * size — a four-way switch wearing a shared component's name, harder to read
 * than the four files it replaced. WHETHER THOSE THREE DESIGNS SHOULD CONVERGE
 * IS A DESIGN DECISION, and this module does not make it. If they are ever
 * unified, that is its own round with its own before/after captures.
 *
 * ══ THE STEP-2 LABEL IS A RULE, NOT A STRING ═══════════════════════════════
 *
 * `ตรวจสอบและดำเนินการ` means "review AND PROCEED" — proceed to pay. It is the
 * right label only for a flow that actually takes money, so it is conditional
 * on `takesPayment` rather than hardcoded at either call site. A quotation
 * flow — the bundle, and the ordinary wizard whenever a course has Omise
 * turned off — says plainly `ตรวจสอบ`, because promising a payment step that
 * does not exist is a promise the screen cannot keep.
 *
 * The prop is named for the RULE and not for the vendor: RegisterWizard passes
 * its `omisePaymentEnabled` into it, and the bundle passes nothing at all
 * because a quotation can never take payment — `bundleRegistrationSchema`
 * carries no `paymentMethod` and no `omiseToken`, so there is no value a client
 * could send that would make the other label correct.
 *
 * @param {object} o
 * @param {number} o.currentStep  1, 2 or 3 — the step being shown
 * @param {boolean} [o.takesPayment=false]  does step 2 lead to a charge?
 */
export function RegistrationStepper({ currentStep, takesPayment = false }) {
  const steps = [
    { n: 1, label: "กรอกข้อมูล" },
    { n: 2, label: takesPayment ? "ตรวจสอบและดำเนินการ" : "ตรวจสอบ" },
    { n: 3, label: "สำเร็จ" },
  ];
  return (
    <ol className="mb-8 flex items-center justify-center text-sm">
      {steps.map((s, i) => (
        <li key={s.n} className="flex items-center ">
          <div className="flex flex-col items-center gap-2 md:flex-row">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                currentStep === s.n
                  ? "border-9e-brand bg-9e-brand text-9e-ice"
                  : currentStep > s.n
                    ? "border-9e-brand bg-9e-brand/10 text-9e-action"
                    : "border-[var(--surface-border)] text-[var(--text-muted)]",
              )}
            >
              {currentStep > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
            </span>
            <span
              className={cn(
                "font-medium",
                currentStep >= s.n
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-muted)]",
              )}
            >
              {s.label}
            </span>
          </div>

          {i < steps.length - 1 && (
            <span className="mx-2 h-px w-8 bg-[var(--surface-border)]" />
          )}
        </li>
      ))}
    </ol>
  );
}
