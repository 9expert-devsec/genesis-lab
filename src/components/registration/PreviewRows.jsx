/**
 * Read-only row + list renderers shared by the two step-2 screens:
 * `StepPreview` (toggle OFF, quote-only) and `ReviewAndPayStep`
 * (toggle ON, review + payment).
 *
 * Moved out of RegisterWizard.jsx unchanged so ReviewAndPayStep can use
 * them without importing back into the wizard (which would be circular).
 */

import { formatBillingAddress } from "@/lib/address/formatBillingAddress";
import { formatInvoiceBranchLabel } from "@/lib/registration/branchLabel";
import { orNotSpecified } from "@/lib/orNotSpecified";

export function ReadOnlyRow({ label, value }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
      <div className="text-base font-medium uppercase tracking-wide text-[var(--text-muted)] sm:w-40 sm:flex-none">
        {label}
      </div>
      <div className="text-base text-[var(--text-primary)]">{value || "—"}</div>
    </div>
  );
}

export function AttendeeListView({ data }) {
  const coord = data.coordinator ?? {};
  const attendees = data.attendees ?? [];
  if (!data.attendeesListProvided) {
    return (
      <p className="text-base text-[var(--text-secondary)]">
        ยังไม่ระบุรายชื่อผู้เข้าอบรม — ทีมขายจะติดต่อภายหลัง
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {coord.isAttending && (
        <li className="rounded-9e-md bg-9e-brand/5 p-3 text-sm">
          <div className="font-semibold">
            ท่านที่ 1 · {coord.firstName} {coord.lastName}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {coord.email} · {coord.phone}
          </div>
        </li>
      )}
      {attendees.map((a, i) => (
        <li
          key={i}
          className="rounded-9e-md border border-[var(--surface-border)] p-3 text-sm"
        >
          <div className="font-semibold">
            ท่านที่ {coord.isAttending ? i + 2 : i + 1} · {a.firstName}{" "}
            {a.lastName}
          </div>
          {/* Attendee email/phone are optional — orNotSpecified so a blank one
              reads as "ไม่ได้ระบุ" here instead of leaving a bare " · " with
              nothing on one side. Coordinator's own row above (line 43) is
              untouched: coordinator email/phone stay required and can never
              be blank. */}
          <div className="text-xs text-[var(--text-secondary)]">
            {orNotSpecified(a.email)} · {orNotSpecified(a.phone)}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function InvoiceView({ invoice }) {
  if (!invoice) return null;
  // Derived at READ time from branchType/branchCode (or branchFree abroad, or
  // the legacy free-text `branch` on old documents). Nothing stores a label.
  const branchLabel = formatInvoiceBranchLabel(invoice);
  return (
    <>
      <ReadOnlyRow
        label="ประเภทลูกค้า"
        value={
          invoice.type === "corporate" ? "นิติบุคคล / บริษัท" : "บุคคลทั่วไป"
        }
      />
      <ReadOnlyRow
        label="ประเทศ"
        value={invoice.country === "TH" ? "Thailand" : "Other country"}
      />
      {invoice.type === "individual" ? (
        <ReadOnlyRow
          label="ชื่อ-นามสกุล"
          value={`${invoice.firstName ?? ""} ${invoice.lastName ?? ""}`.trim()}
        />
      ) : (
        <>
          <ReadOnlyRow label="ชื่อบริษัท" value={invoice.companyName} />
          {branchLabel && (
            <ReadOnlyRow label="สาขา" value={branchLabel} />
          )}
        </>
      )}
      {invoice.taxId && (
        <ReadOnlyRow label="เลขประจำตัวผู้เสียภาษี" value={invoice.taxId} />
      )}
      {invoice.country === "TH" && invoice.thaiAddress && (
        <ReadOnlyRow
          label="ที่อยู่"
          // The whole invoice, not invoice.thaiAddress — the formatter reads
          // invoice.country to choose its branch, so passing the sub-object
          // alone would silently take the Thai path for a foreign address.
          value={formatBillingAddress(invoice)}
        />
      )}
      {invoice.country === "OTHER" && invoice.internationalAddress && (
        <ReadOnlyRow
          label="ที่อยู่"
          value={[
            invoice.internationalAddress.line1,
            invoice.internationalAddress.line2,
            invoice.internationalAddress.city,
            invoice.internationalAddress.state,
            invoice.internationalAddress.postalCode,
            invoice.internationalAddress.country,
          ]
            .filter(Boolean)
            .join(", ")}
        />
      )}
    </>
  );
}
