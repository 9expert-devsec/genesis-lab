// Conversion helpers — centralize the gtag calls so every call site is a
// consistent one-liner. Plain functions ('use client' not needed); each
// delegates to gtagEvent, which is a no-op when gtag isn't loaded.
//
// ── META IS FANNED OUT FROM HERE, NOT FROM THE CALL SITES ───────────────────
// Each helper below now sends to Google AND to Meta. No call site changed, and
// none should: a payment page that has to remember two analytics vendors is a
// payment page that will remember one of them next time somebody edits it.
// This file is the one place that knows a conversion goes to more than one
// destination, which is also the only place the two mappings can be compared.
//
// Every Meta call is a no-op when the pixel is not loaded — the same contract
// gtagEvent has, and a busier one in practice: gtag.js loads for everyone under
// Consent Mode advanced, while fbevents.js is only there for a visitor who
// granted marketing consent. See src/lib/analytics/metaPixel.js.
//
// ── AND THE dataLayer CONTRACT IS PUSHED FROM HERE TOO ──────────────────────
// Each helper also pushes its business event (src/lib/analytics/dataLayer.js),
// in both analytics modes. Without NEXT_PUBLIC_GTM_ID the push is inert and the
// gtag calls below do the work, exactly as before; with it, gtagEvent is
// silent and GTM fires Google's tags off the push. Meta is sent from here in
// both modes (plan D6).
//
// The register* helpers at the bottom send the dataLayer event AND a Meta
// Lead. Meta is code-owned in both modes, so anything Meta should hear must be
// sent from here — GTM never will. They send nothing to Google directly: in
// gtag mode those flows never had a Google conversion (no Ads label exists for
// them yet), and in GTM mode the container maps the dataLayer event.

import { gtagEvent } from '@/lib/analytics/gtag';
import { EVENTS, claimOnce, pushEvent, pushEventOnce, pushPurchase } from '@/lib/analytics/dataLayer';
import {
  metaEventOptions,
  metaPixelTrack,
  metaPixelTrackCustom,
} from '@/lib/analytics/metaPixel';
import {
  ADS_CONVERSION_LABELS,
  adsSendTo,
  DEFAULT_CURRENCY,
} from '@/lib/analytics/config';

// GA4 purchase event + Google Ads purchase conversion, fired together.
// method: 'credit_card' | 'promptpay'
export function trackPurchase({ method, value, transactionId, items, formType = 'masterclass' }) {
  const label =
    method === 'credit_card'
      ? ADS_CONVERSION_LABELS.masterclassCard
      : ADS_CONVERSION_LABELS.masterclassQr;

  // GA4 ecommerce purchase
  gtagEvent('purchase', {
    currency: DEFAULT_CURRENCY,
    value,
    transaction_id: transactionId,
    items: items ?? [],
  });
  // Google Ads conversion
  gtagEvent('conversion', {
    send_to: adsSendTo(label),
    value,
    currency: DEFAULT_CURRENCY,
    transaction_id: transactionId,
  });
  // The contract's purchase — GTM's GA4 purchase and Ads card/QR conversions
  // fire off this, split by payment_method. Once per transaction per tab.
  pushPurchase({ transactionId, value, items: items ?? [], paymentMethod: method, formType });
  /*
   * Meta Purchase. `eventID` carries the SAME transaction id the Ads
   * conversion above uses, so if a Conversions API is ever added server-side
   * the two reports can be deduplicated against each other. There is no CAPI
   * today; the id is here because it cannot be added retroactively to events
   * already sent. See metaEventOptions.
   *
   * `method` is deliberately not forwarded. Meta's Purchase has no field for
   * it, and inventing a custom property would make the two platforms' purchase
   * counts differ by a dimension only one of them has.
   */
  metaPixelTrack(
    'Purchase',
    { value, currency: DEFAULT_CURRENCY },
    metaEventOptions(transactionId),
  );
}

// Form-submit lead — fired once when a registration is created (before payment).
export function trackFormSubmitLead({ value, transactionId, courseCode, leadChannel } = {}) {
  gtagEvent('conversion', {
    send_to: adsSendTo(ADS_CONVERSION_LABELS.masterclassFormSubmit),
    ...(value != null ? { value, currency: DEFAULT_CURRENCY } : {}),
    ...(transactionId ? { transaction_id: transactionId } : {}),
  });
  // GA4 standard lead event (nice for funnels)
  gtagEvent('generate_lead', {
    ...(value != null ? { value, currency: DEFAULT_CURRENCY } : {}),
  });
  pushEventOnce(transactionId, EVENTS.registerMasterclass, {
    form_type: 'masterclass',
    registration_id: transactionId,
    course_code: courseCode,
    ...(value != null ? { value, currency: DEFAULT_CURRENCY } : {}),
    lead_channel: leadChannel,
  });
  /*
   * Meta Lead. value/currency are OMITTED rather than sent as null when the
   * caller has no price yet — a Lead worth ฿0 and a Lead of unknown worth are
   * different facts, and Ads Manager averages the first into the campaign's
   * value while ignoring the second.
   */
  metaPixelTrack(
    'Lead',
    value != null ? { value, currency: DEFAULT_CURRENCY } : {},
    metaEventOptions(transactionId),
  );
}

// Course-outline download.
export function trackDownload({ fileName } = {}) {
  gtagEvent('conversion', {
    send_to: adsSendTo(ADS_CONVERSION_LABELS.masterclassDownload),
  });
  gtagEvent('file_download', { file_name: fileName ?? 'course_outline' }); // GA4
  pushEvent(EVENTS.fileDownload, { file_name: fileName ?? 'course_outline' });
  /*
   * trackCustom, not track: there is no standard Meta event for "downloaded a
   * document". A standard event bent to fit (Lead, ViewContent) would land in
   * the same bucket as a real one and quietly corrupt whichever campaign
   * optimises for it.
   *
   * No fileName. It would be the one property here carrying user-chosen
   * content to Meta, for a custom event nothing is optimising against.
   */
  metaPixelTrackCustom('OutlineDownload');
}

// Landing-page view conversion (scoped to a specific landing slug by the caller).
export function trackLandingView({ slug } = {}) {
  gtagEvent('conversion', {
    send_to: adsSendTo(ADS_CONVERSION_LABELS.masterclassLanding),
  });
  pushEvent(EVENTS.viewLanding, { landing_slug: slug });
  /*
   * ViewContent, with no parameters. Meta's ViewContent accepts
   * content_ids/content_type for catalogue matching; there is no Meta
   * catalogue behind this site, so sending ids would be sending keys into an
   * empty table. The caller scopes this to a specific landing slug, and that
   * scoping is what the event means — it is not a page view, it is "saw the
   * page we buy traffic for".
   */
  metaPixelTrack('ViewContent');
}

// ── Registration events: dataLayer + Meta Lead ───────────────────────────────
//
// Fired by each flow AFTER its API reported the registration created — never
// on the thank-you step's mount, which a refresh repeats and which a failed
// write never reaches. Each is once per registration id per tab
// (claimOnce). `leadChannel` is the channel the SERVER derived from the
// stored attribution and returned in the response; it is what lets a GA4 count
// be reconciled against the admin's records.

/**
 * One registration: the dataLayer event and a Meta Lead, under ONE dedupe
 * decision — both or neither, once per registration id per tab.
 *
 * Meta Lead follows trackFormSubmitLead's rules: `eventID` is the same
 * registration_id the dataLayer event carries (so a future Conversions API can
 * deduplicate against it), and value/currency are sent only when the value is
 * KNOWN — a Lead worth ฿0 and a Lead of unknown worth are different facts.
 */
function trackRegistration(event, params, { registrationId, value }) {
  if (!claimOnce(event, registrationId)) return;
  pushEvent(event, {
    ...params,
    registration_id: registrationId,
    ...(value != null ? { value, currency: DEFAULT_CURRENCY } : {}),
  });
  metaPixelTrack(
    'Lead',
    value != null ? { value, currency: DEFAULT_CURRENCY } : {},
    metaEventOptions(registrationId),
  );
}

/** Public registration. formType: 'public' (no online payment) | 'public_paid'. */
export function trackRegisterPublic({ formType, registrationId, courseCode, attendeeCount, value, leadChannel } = {}) {
  trackRegistration(EVENTS.registerPublic, {
    form_type: formType,
    course_code: courseCode,
    attendee_count: attendeeCount,
    lead_channel: leadChannel,
  }, { registrationId, value });
}

/** A bundle quotation request — one event for the request, not one per leg. */
export function trackRegisterBundle({ registrationId, bundleId, courseCodes, attendeeCount, value, leadChannel } = {}) {
  trackRegistration(EVENTS.registerBundle, {
    form_type: 'bundle',
    bundle_id: bundleId,
    course_codes: courseCodes,
    course_code: Array.isArray(courseCodes) ? courseCodes.join(',') : undefined,
    attendee_count: attendeeCount,
    lead_channel: leadChannel,
  }, { registrationId, value });
}

/** In-house quotation request. No value: the price is quoted later, by hand. */
export function trackRegisterInhouse({ registrationId, courseCode, attendeeCount, leadChannel } = {}) {
  trackRegistration(EVENTS.registerInhouse, {
    form_type: 'inhouse',
    course_code: courseCode,
    attendee_count: attendeeCount,
    lead_channel: leadChannel,
  }, { registrationId });
}

/** Career path registration. No value: quoted later, by hand. */
export function trackRegisterCareerPath({ registrationId, careerPath, leadChannel } = {}) {
  trackRegistration(EVENTS.registerCareerPath, {
    form_type: 'career_path',
    career_path: careerPath,
    lead_channel: leadChannel,
  }, { registrationId });
}

/**
 * A paid public registration — the dataLayer purchase, a Meta Purchase and,
 * in gtag mode, the GA4 purchase, all under the dataLayer's once-per-
 * transaction decision (pushPurchase returns false for a repeat), so a
 * refreshed step-3 counts the sale nowhere twice.
 *
 * GA4 via gtagEvent: silent in GTM mode (the container maps the dataLayer
 * event); in gtag mode it is what keeps a rollback from losing public
 * purchases. NO Google Ads conversion — there is no label for public purchases
 * yet; the label comes from marketing (plan D5) and is added in the container.
 *
 * Meta: `eventID` is the same transaction id the dataLayer event uses, as for
 * masterclass. formType is 'public'; bundles take no payment (a quotation
 * request only), so there is no bundle purchase to send.
 */
export function trackPublicPurchase({ transactionId, value, method, items } = {}) {
  const sent = pushPurchase({ transactionId, value, items: items ?? [], paymentMethod: method, formType: 'public' });
  if (!sent) return;
  gtagEvent('purchase', {
    currency: DEFAULT_CURRENCY,
    value,
    transaction_id: transactionId,
    items: items ?? [],
  });
  metaPixelTrack(
    'Purchase',
    value != null ? { value, currency: DEFAULT_CURRENCY } : { currency: DEFAULT_CURRENCY },
    metaEventOptions(transactionId),
  );
}

/** A tel: / mailto: / LINE link click, anywhere on the site. */
export function trackContactClick({ method, pagePath } = {}) {
  pushEvent(EVENTS.contactClick, { contact_method: method, page_path: pagePath });
}
