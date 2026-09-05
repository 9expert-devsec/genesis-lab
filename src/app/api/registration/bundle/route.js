import mongoose from 'mongoose';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';
import { bundleRegistrationSchema } from '@/lib/schemas/register-bundle';
import { getPublishedPageBuilderPageById } from '@/lib/actions/pageBuilder';
import { resolveSectionData } from '@/lib/pageBuilder/resolveSectionData';
import { resolveBundleRequest, isSilentRefusal } from '@/lib/registration/bundleRequest';
import { buildBundleLegs, orderLegsMarkerLast } from '@/lib/registration/bundleLegs';
import { buildAttendees, buildBundleTag } from '@/lib/registration/build-public';
import { sendBundleRegistrationEmail } from '@/lib/email/template-senders/bundle-registration';
import { chooseItemRound } from '@/lib/pageBuilder/chosenRounds';
import { discountPercent } from '@/lib/pageBuilder/bundlePricing';
import { formatBillingAddress } from '@/lib/address/formatBillingAddress';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import { siteCurrentYear, siteTodayKey } from '@/lib/articlePublishTime';
import { formatPrice } from '@/lib/utils';
import { refNo } from '@/lib/refNo';

/**
 * ONE BUNDLE QUOTATION REQUEST → N REGISTRATION ROWS, ATOMICALLY.
 *
 * A quotation request, NOT a payment: Omise is not involved, `pricing` and
 * `payment` stay unset, and `bundleRegistrationSchema` carries no
 * `paymentMethod` or `omiseToken` at all, so there is no value a client could
 * send that would put a bundle down a charge path.
 *
 * ══ THE PAIR IS RE-RESOLVED HERE, NOT TRUSTED FROM THE FORM ═════════════════
 *
 * The page already resolved it once to decide whether to render the form. This
 * resolves it AGAIN, from scratch, because the two moments are different: a
 * round rolls off the upstream feed the morning its first day arrives, an
 * author can unpublish a page or close a bundle while a form sits open in a
 * tab, and the POST body is user input whatever the page did. Nothing about the
 * bundle — not the courses, not the rounds, not the name, not whether it is
 * open — is read from the request.
 *
 * ══ THE WRITE ══════════════════════════════════════════════════════════════
 *
 * Wrapped in a transaction, and ordered marker-last. Those are TWO guards that
 * fail in different worlds, and `orderLegsMarkerLast` carries the argument for
 * keeping both at length — including the comparison to `writeEarlyBird`'s
 * pre-read beside its E11000, which is the same shape. Do not delete the
 * ordering as redundant; read that note first.
 */

/**
 * The one place the transaction is opened.
 *
 * ── IT MUST NEVER DEGRADE TO AN UNWRAPPED WRITE ───────────────────────────
 *
 * A transaction needs a replica set or a sharded cluster. Verified read-only on
 * 2026-09-05 against this deployment — `hello` reports
 * `setName: atlas-jckskf-shard-0`, `logicalSessionTimeoutMinutes: 30`, MongoDB
 * 8.0.30 — so it is supported today. It is NOT guaranteed after a host move or
 * a cluster change.
 *
 * If that ever stops being true, `startSession()` / `withTransaction()` throws
 * `MongoServerError: Transaction numbers are only allowed on a replica set
 * member or mongos` — and the correct response is to FAIL, LOUDLY AND
 * COMPLETELY, on the very first bundle submission. No bundle registers, someone
 * notices within the hour, and NOTHING IS WRITTEN.
 *
 * There is deliberately no `catch` that retries the legs unwrapped. That
 * fallback is the worst available outcome: it would look like a graceful
 * degradation and would in fact be the exact partial-write hazard the
 * transaction exists to prevent, arriving silently and permanently. The catch
 * below LOGS and REPORTS; it never writes.
 */
async function writeLegsAtomically(orderedLegs) {
  const session = await mongoose.startSession();
  try {
    let created = [];
    await session.withTransaction(async () => {
      // Reset inside the callback: withTransaction MAY RUN IT AGAIN on a
      // transient error, and appending to an array declared outside would
      // return two copies of the legs on a retry.
      created = [];
      /**
       * SEQUENTIAL, in the marker-last order, rather than one array `create`.
       *
       * Inside a transaction the order is invisible — the whole set commits or
       * none of it does. It is written this way so the ORDERING IS OBSERVABLE
       * IN THIS FILE, because the ordering is the guard that survives the
       * transaction being absent. A bulk call would leave `orderLegsMarkerLast`
       * looking like a pointless sort.
       */
      for (const leg of orderedLegs) {
        // eslint-disable-next-line no-await-in-loop
        const [doc] = await RegisterPublic.create([leg], { session });
        created.push(doc);
      }
    });
    return created;
  } finally {
    await session.endSession();
  }
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const parsed = bundleRegistrationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // ── Re-resolve the pair, exactly as the page did ────────────────────────
  const page = await getPublishedPageBuilderPageById(data.pageId);

  // The cheap pass first: a closed or unpublished bundle is refused before any
  // upstream call at all.
  const cheap = resolveBundleRequest({ page, sectionId: data.sectionId });
  if (!cheap.ok) return refusal(cheap.reason);

  const resolvedMap = await resolveSectionData([cheap.section]);
  const resolved = resolvedMap?.[cheap.section.id];
  const todayKey = siteTodayKey();

  const gate = resolveBundleRequest({
    page,
    sectionId: data.sectionId,
    resolved,
    todayKey,
  });
  if (!gate.ok) return refusal(gate.reason);

  const headersList = await headers();
  const ipAddress =
    headersList.get('x-forwarded-for')?.split(',')[0].trim() ||
    headersList.get('x-real-ip') ||
    null;

  /**
   * THE REQUEST ID IS MINTED BEFORE ANY WRITE, and this is what closes the gap
   * the obvious ordering would have opened.
   *
   * `new mongoose.Types.ObjectId()` generates an id client-side with no round
   * trip. It becomes BOTH the marker leg's explicit `_id` AND every leg's
   * `bundle.requestId`, so:
   *
   *   · `requestId === String(markerLeg._id)`, which means `refNo(requestId)`
   *     is a real row's เลขอ้างอิง an admin can actually look up — one
   *     reference number, not two;
   *   · NO LEG EVER EXISTS WITHOUT A requestId. Writing the first leg and then
   *     updating it with its own id would leave a window in which a row is a
   *     bundle leg that nothing can group. There is no such window here,
   *     because the id is known before the first `create`.
   *
   * A String on the tag, never an ObjectId — the type makes `.populate()`
   * impossible so the pointer cannot quietly become a lookup, the same idiom
   * and the same reason as `supersedesRegistrationId`.
   */
  const requestId = new mongoose.Types.ObjectId();

  const bundle = buildBundleTag({
    pageId: String(page._id),
    sectionId: gate.section.id,
    requestId: String(requestId),
    name: gate.content.name,
  });
  // buildBundleTag returns undefined for an incomplete tag. Unreachable here —
  // all three come from a resolved section — so this is a refusal rather than a
  // branch anyone expects to take, and it must never write an untagged leg.
  if (!bundle) return refusal('unresolved_items');

  const attendees = buildAttendees(data);

  const built = buildBundleLegs({
    items: gate.content.items,
    resolved,
    todayKey,
    data,
    attendees,
    bundle,
    ipAddress,
  });
  if (!built.ok) return refusal('unresolved_items');

  const orderedLegs = orderLegsMarkerLast(built.legs, requestId);

  await dbConnect();

  let created;
  try {
    created = await writeLegsAtomically(orderedLegs);
  } catch (err) {
    /**
     * LOG AND REPORT. NEVER RETRY UNWRAPPED — see writeLegsAtomically's note.
     *
     * The marker in the message is deliberate: an unsupported-transaction error
     * is the one failure that would affect EVERY bundle submission rather than
     * one, and it must be greppable the first time it happens.
     */
    console.error(
      '[bundle-reg] ❌ ATOMIC WRITE FAILED — nothing was written.',
      '| legs:', orderedLegs.length,
      '| requestId:', String(requestId),
      '| error:', err?.message,
    );
    return NextResponse.json(
      { error: 'write_failed', message: 'ไม่สามารถบันทึกคำขอได้ กรุณาลองใหม่อีกครั้ง' },
      { status: 500 },
    );
  }

  /**
   * ONE EMAIL, AFTER THE WHOLE SET HAS COMMITTED.
   *
   * ── AFTER, AND THAT ORDER IS THE RULE ────────────────────────────────────
   * Mailing before the commit would tell a customer their request was received
   * and then abort it, which is the one outcome worse than a failed submission:
   * they hold a reference number for a request that does not exist, and the
   * sales team has nothing to find when they ring about it.
   *
   * ── ONE, NOT N ───────────────────────────────────────────────────────────
   * The customer made ONE request. The three rows are a storage shape, and
   * three confirmations would leak it to them — with no way to tell an intended
   * package from three accidental submissions. The sender takes the courses as
   * a list precisely so there is no shape in which it can send per leg.
   *
   * ── AWAITED, like the quote route's own send ─────────────────────────────
   * Same reason: the model is built synchronously inside the sender, and a
   * pending promise would reach the template as `undefined`.
   *
   * ── AND IT CANNOT COST THE CUSTOMER THEIR REQUEST ───────────────────────
   * The rows are already committed by the time this runs. A Postmark outage
   * must not turn a saved request into a 500 that invites the customer to
   * submit it again — which would write a SECOND complete bundle. So a failure
   * here is logged loudly and the response still reports success, because the
   * request genuinely did succeed. This is the opposite ruling from the write
   * above, and deliberately so: that one had nothing saved to protect.
   */
  try {
    await sendBundleRegistrationEmail({
      referenceNumber: refNo(requestId),
      bundleName: gate.content.name ?? '',
      courses: emailCourses(gate.content, resolved, todayKey),
      discount: discountPercent(
        typeof gate.content.listPrice === 'number' ? gate.content.listPrice : null,
        typeof gate.content.netPrice === 'number' ? gate.content.netPrice : null,
      ),
      priceLabelNet: typeof gate.content.netPrice === 'number' ? formatPrice(gate.content.netPrice) : '',
      priceLabelList: typeof gate.content.listPrice === 'number' ? formatPrice(gate.content.listPrice) : '',
      data,
      attendees,
      invoiceCountry: data.invoice?.country ?? 'TH',
      // The shared formatter, not a local join: it takes the WHOLE invoice
      // because it reads `invoice.country` to pick the Thai vs international
      // branch, and it is the only thing that applies the แขวง/เขต prefixes.
      // Hand-rolling this is what put a prefix-less address on customer mail.
      invoiceAddress: formatBillingAddress(data.invoice),
    });
  } catch (err) {
    console.error(
      '[bundle-reg] ⚠ CONFIRMATION EMAIL FAILED — the request IS saved.',
      '| requestId:', String(requestId),
      '| legs:', created.length,
      '| error:', err?.message,
    );
  }

  return NextResponse.json({
    ok: true,
    referenceNumber: refNo(requestId),
    requestId: String(requestId),
    legCount: created.length,
  });
}

/**
 * The course rows the mail lists — the same resolve path the page and the legs
 * used, read once more rather than reconstructed from the written documents.
 *
 * Reading them back off `created` would work and is the wrong source: a leg
 * stores `classDate` as `formatClassDates` renders it for the ADMIN screens,
 * and the mail shows what the CUSTOMER saw on the promotion card, which is
 * `formatRoundDays` with the year rule. Two formatters, two audiences; taking
 * the admin one would mail a customer a date string in a format they have not
 * seen anywhere else.
 */
function emailCourses(content, resolved, todayKey) {
  const items = Array.isArray(content?.items) ? content.items : [];
  const entries = Array.isArray(resolved) ? resolved : [];
  const currentYear = siteCurrentYear();
  return items.map((item, i) => {
    const entry = entries[i] ?? null;
    const round = chooseItemRound(entry?.rounds, item, todayKey);
    return {
      courseName: String(entry?.course?.course_name ?? '').trim(),
      courseId: String(entry?.courseId ?? item?.courseId ?? '').trim(),
      dates: round
        ? formatRoundDays(round.dates, { showMonth: true, showYear: 'auto', currentYear })
        : '',
      type: round?.live?.type ?? 'classroom',
    };
  });
}

/**
 * A refusal, in the two shapes the round decided on.
 *
 * The REASON is returned rather than a sentence, and the client renders the
 * message: the two spoken strings live in `bundleRegistration.js` beside the
 * predicate that decides them, so the page, the form and this route cannot
 * drift into three wordings.
 *
 * 404 for the silent reasons — a pair naming nothing has nothing true to say —
 * and 409 for the spoken ones, which is what the ordinary quote route already
 * returns for `schedule_closed`. A refusal here is a CONFLICT with the state of
 * the world, not a malformed request, and it must not read as a validation
 * error the customer could fix by editing a field.
 */
function refusal(reason) {
  return NextResponse.json(
    { error: 'bundle_refused', reason },
    { status: isSilentRefusal(reason) ? 404 : 409 },
  );
}
