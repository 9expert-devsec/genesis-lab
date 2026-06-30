// Conversion helpers — centralize the gtag calls so every call site is a
// consistent one-liner. Plain functions ('use client' not needed); each
// delegates to gtagEvent, which is a no-op when gtag isn't loaded.

import { gtagEvent } from '@/lib/analytics/gtag';
import {
  ADS_CONVERSION_LABELS,
  adsSendTo,
  DEFAULT_CURRENCY,
} from '@/lib/analytics/config';

// GA4 purchase event + Google Ads purchase conversion, fired together.
// method: 'credit_card' | 'promptpay'
export function trackPurchase({ method, value, transactionId, items }) {
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
}

// Form-submit lead — fired once when a registration is created (before payment).
export function trackFormSubmitLead({ value, transactionId } = {}) {
  gtagEvent('conversion', {
    send_to: adsSendTo(ADS_CONVERSION_LABELS.masterclassFormSubmit),
    ...(value != null ? { value, currency: DEFAULT_CURRENCY } : {}),
    ...(transactionId ? { transaction_id: transactionId } : {}),
  });
  // GA4 standard lead event (nice for funnels)
  gtagEvent('generate_lead', {
    ...(value != null ? { value, currency: DEFAULT_CURRENCY } : {}),
  });
}

// Course-outline download.
export function trackDownload({ fileName } = {}) {
  gtagEvent('conversion', {
    send_to: adsSendTo(ADS_CONVERSION_LABELS.masterclassDownload),
  });
  gtagEvent('file_download', { file_name: fileName ?? 'course_outline' }); // GA4
}

// Landing-page view conversion (scoped to a specific landing slug by the caller).
export function trackLandingView() {
  gtagEvent('conversion', {
    send_to: adsSendTo(ADS_CONVERSION_LABELS.masterclassLanding),
  });
}
