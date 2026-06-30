import { sendEmail, sendTemplateEmail } from "@/lib/email/postmark";
import { formatTHB } from "@/lib/pricing";
import { formatBillingAddress } from "@/lib/address/formatBillingAddress";
import { buildLicenseModel } from "@/lib/email/buildLicenseModel";

// ── Helpers (copied inline from src/lib/masterclass/send-receipt.js) ──────────

/** Prefer coordinator, fall back to attendee (old records). */
function resolveRecipient(doc) {
  const coord = doc.coordinator;
  if (coord?.email) {
    return {
      to: coord.email,
      firstName: coord.firstName ?? "",
      phone: coord.phone ?? "",
    };
  }
  const att = doc.attendee ?? {};
  return {
    to: att.email ?? "",
    firstName: att.firstName ?? "",
    phone: att.phone ?? "",
  };
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBatchDateShort(dateValue) {
  if (!dateValue) return "";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

// ── Paid receipt (Postmark Template) ──────────────────────────────────────────

/**
 * Idempotently send the paid-receipt email for a Masterclass registration
 * using a Postmark Template. Guards on `payment.receiptSentAt`.
 */
export async function sendMasterclassPaidReceipt(doc) {
  if (!doc || doc.payment?.receiptSentAt) return { skipped: true };

  const recipient = resolveRecipient(doc);
  if (!recipient.to) return { skipped: true, reason: "no_email" };

  const alias = process.env.POSTMARK_TEMPLATE_ALIAS_MC_PAID;
  if (!alias)
    throw new Error("[mc-template] POSTMARK_TEMPLATE_ALIAS_MC_PAID not set");

  const MasterclassCourse = (await import("@/models/MasterclassCourse"))
    .default;
  const courseDoc = await MasterclassCourse.findById(doc.course_id)
    .select("cover_image_url license_options")
    .lean();
  const courseImage = courseDoc?.cover_image_url || "";

  const MasterclassBatch = (await import("@/models/MasterclassBatch")).default;
  const batchDoc = await MasterclassBatch.findById(doc.batch_id)
    .select("dates")
    .lean();
  const batchDateShort = formatBatchDateShort(batchDoc?.dates?.[0]?.date);

  const refNo = String(doc._id).slice(-8).toUpperCase();
  const methodLabel =
    doc.payment?.method === "credit_card" ? "บัตรเครดิต/เดบิต" : "QR PromptPay";

  const billingAddressP = formatBillingAddress(doc.invoice);
  const licenseModel = buildLicenseModel(doc, courseDoc);

  const templateModel = {
    coordinator_name:
      `${doc.coordinator?.firstName ?? ""} ${doc.coordinator?.lastName ?? ""}`.trim() ||
      `${doc.attendee?.firstName ?? ""} ${doc.attendee?.lastName ?? ""}`.trim(),
    coordinator_email: doc.coordinator?.email || doc.attendee?.email || "",
    coordinator_phone: doc.coordinator?.phone || doc.attendee?.phone || "",
    paid_amount: formatTHB(doc.pricing?.total ?? 0),
    payment_method_label: methodLabel,
    ref_no: refNo,
    paid_at_label: fmtDate(doc.payment?.paidAt),
    course_image: courseImage,
    course_name: doc.course_title || "",
    course_date: batchDateShort || doc.batch_date_label || "ตามรอบที่เลือก",
    location: doc.venue_name || "",
    total_participants: doc.attendeesCount ?? 1,
    price_per_seat: formatTHB(doc.pricing?.pricePerSeat ?? 0),
    seats: doc.pricing?.seats ?? doc.attendeesCount ?? 1,
    subtotal: formatTHB(doc.pricing?.subtotal ?? 0),
    vat_amount: formatTHB(doc.pricing?.vatAmount ?? 0),
    total: formatTHB(doc.pricing?.total ?? 0),
    attendee_list:
      doc.attendeesListProvided === true && (doc.attendees ?? []).length > 0
        ? { items: (doc.attendees ?? []).map((a, i) => ({
            index: i + 1,
            name: `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim(),
            email: a.email || "",
            phone: a.phone || "",
            license_label:
              doc.license_scope === "per_attendee" &&
              doc.license_per_attendee?.[i]
                ? [
                    `${doc.license_per_attendee[i].choice || ""}`,
                    `${doc.license_per_attendee[i].level || ""}`,
                  ]
                    .filter(Boolean)
                    .join(" ") || "—"
                : doc.license_level || doc.license_choice || "—",
          })) }
        : false,
    attendee_later:
      doc.attendeesListProvided === false ? { show: true } : false,
    document_requested: Boolean(doc.request_invoice && doc.invoice)
      ? {
          billing_personal:
            doc.invoice?.type === "individual"
              ? {
                  billing_name: `${doc.invoice?.firstName ?? ""} ${doc.invoice?.lastName ?? ""}`.trim(),
                  billing_tax_id: doc.invoice?.taxId || "",
                  billing_address: billingAddressP,
                }
              : false,
          billing_company:
            doc.invoice?.type === "corporate"
              ? {
                  billing_company_name: doc.invoice?.companyName || "",
                  billing_tax_id: doc.invoice?.taxId || "",
                  billing_branch: doc.invoice?.branch || "",
                  billing_address: billingAddressP,
                }
              : false,
        }
      : false,
    billing_notes: doc.notes ? { text: doc.notes } : false,
    ...licenseModel,
  };

  const adminEmail = process.env.POSTMARK_ADMIN_EMAIL;

  // TODO(temp-debug): remove after verifying flat license keys reach Postmark.
  console.log("[mc-license-debug]", JSON.stringify({
    which: alias,
    license_per_attendee_mode: templateModel.license_per_attendee_mode,
    license_show_table: templateModel.license_show_table,
    license_conditions: templateModel.license_conditions,
    attendeesListProvided: doc.attendeesListProvided,
    license_scope: doc.license_scope,
    license_choice: doc.license_choice,
    course_id: String(doc.course_id),
    has_license_options: courseDoc?.license_options?.enabled,
  }));

  await Promise.allSettled([
    sendTemplateEmail({
      to: recipient.to,
      templateAlias: alias,
      templateModel,
    }),
    adminEmail
      ? sendEmail({
          to: adminEmail,
          subject: `[Admin MC ชำระแล้ว] ${refNo} — ${doc.course_title}`,
          text: `เลขอ้างอิง: ${refNo}\nวิธี: ${methodLabel}\nยอด: ${formatTHB(doc.pricing?.total ?? 0)} บาท\nผู้ประสานงาน: ${recipient.firstName} <${recipient.to}>\nเบอร์: ${recipient.phone}`,
        })
      : Promise.resolve(),
  ]);

  await doc.constructor.findByIdAndUpdate(doc._id, {
    $set: { "payment.receiptSentAt": new Date() },
  });
  console.log(
    "[mc-receipt] ✅ sendMasterclassReceipt complete | receiptSentAt set | docId:",
    String(doc._id),
  );
  return { ok: true };
}

// ── Quote confirmation (Postmark Template) ────────────────────────────────────

/**
 * Send a quote-request confirmation immediately after registration using a
 * Postmark Template. No payment at this point.
 */
export async function sendMasterclassQuoteConfirmation(doc, referenceNumber) {
  const recipient = resolveRecipient(doc);
  if (!recipient.to) return { skipped: true, reason: "no_email" };

  const alias = process.env.POSTMARK_TEMPLATE_ALIAS_MC_QUOTE;
  if (!alias)
    throw new Error("[mc-template] POSTMARK_TEMPLATE_ALIAS_MC_QUOTE not set");

  const MasterclassCourse = (await import("@/models/MasterclassCourse"))
    .default;
  const courseDoc = await MasterclassCourse.findById(doc.course_id)
    .select("cover_image_url license_options")
    .lean();
  const courseImage = courseDoc?.cover_image_url || "";

  const MasterclassBatch = (await import("@/models/MasterclassBatch")).default;
  const batchDoc = await MasterclassBatch.findById(doc.batch_id)
    .select("dates")
    .lean();
  const batchDateShort = formatBatchDateShort(batchDoc?.dates?.[0]?.date);

  const refNo = referenceNumber ?? String(doc._id).slice(-8).toUpperCase();

  const billingAddressQ = formatBillingAddress(doc.invoice);
  const licenseModel = buildLicenseModel(doc, courseDoc);

  const templateModel = {
    coordinator_name:
      `${doc.coordinator?.firstName ?? ""} ${doc.coordinator?.lastName ?? ""}`.trim() ||
      `${doc.attendee?.firstName ?? ""} ${doc.attendee?.lastName ?? ""}`.trim(),
    coordinator_email: doc.coordinator?.email || doc.attendee?.email || "",
    coordinator_phone: doc.coordinator?.phone || doc.attendee?.phone || "",
    ref_no: refNo,
    course_image: courseImage,
    course_name: doc.course_title || "",
    course_date: batchDateShort || doc.batch_date_label || "ตามรอบที่เลือก",
    location: doc.venue_name || "",
    total_participants: doc.attendeesCount ?? 1,
    total: formatTHB(doc.pricing?.total ?? 0),
    attendee_list:
      doc.attendeesListProvided === true && (doc.attendees ?? []).length > 0
        ? { items: (doc.attendees ?? []).map((a, i) => ({
            index: i + 1,
            name: `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim(),
            email: a.email || "",
            phone: a.phone || "",
            license_label:
              doc.license_scope === "per_attendee" &&
              doc.license_per_attendee?.[i]
                ? [
                    `${doc.license_per_attendee[i].choice || ""}`,
                    `${doc.license_per_attendee[i].level || ""}`,
                  ]
                    .filter(Boolean)
                    .join(" ") || "—"
                : doc.license_level || doc.license_choice || "—",
          })) }
        : false,
    attendee_later:
      doc.attendeesListProvided === false ? { show: true } : false,
    document_requested: Boolean(doc.request_invoice && doc.invoice)
      ? { show: true }
      : false,
    billing_personal:
      doc.invoice?.type === "individual"
        ? {
            billing_name: `${doc.invoice?.firstName ?? ""} ${doc.invoice?.lastName ?? ""}`.trim(),
            billing_tax_id: doc.invoice?.taxId || "",
            billing_address: billingAddressQ,
          }
        : false,
    billing_company:
      doc.invoice?.type === "corporate"
        ? {
            billing_company_name: doc.invoice?.companyName || "",
            billing_tax_id: doc.invoice?.taxId || "",
            billing_branch: doc.invoice?.branch || "",
            billing_address: billingAddressQ,
          }
        : false,
    billing_notes: doc.notes ? { text: doc.notes } : false,
    ...licenseModel,
  };

  const adminEmail = process.env.POSTMARK_ADMIN_EMAIL;

  // TODO(temp-debug): remove after verifying flat license keys reach Postmark.
  console.log("[mc-license-debug]", JSON.stringify({
    which: alias,
    license_per_attendee_mode: templateModel.license_per_attendee_mode,
    license_show_table: templateModel.license_show_table,
    license_conditions: templateModel.license_conditions,
    attendeesListProvided: doc.attendeesListProvided,
    license_scope: doc.license_scope,
    license_choice: doc.license_choice,
    course_id: String(doc.course_id),
    has_license_options: courseDoc?.license_options?.enabled,
  }));

  await Promise.allSettled([
    sendTemplateEmail({
      to: recipient.to,
      templateAlias: alias,
      templateModel,
    }),
    adminEmail
      ? sendEmail({
          to: adminEmail,
          subject: `[Admin MC ขอใบเสนอราคา] ${refNo} — ${doc.course_title}`,
          text: `เลขอ้างอิง: ${refNo}\nผู้ประสานงาน: ${recipient.firstName} <${recipient.to}>\nเบอร์: ${recipient.phone}\nจำนวน: ${doc.attendeesCount ?? 1} ท่าน\nยอด: ${formatTHB(doc.pricing?.total ?? 0)} บาท`,
        })
      : Promise.resolve(),
  ]);

  return { ok: true };
}
