'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { OAIQ_SRC, initOaiPixel, setOaiPixelConsent } from '@/lib/analytics/oaiPixel';
import { parseConsent, readConsentCookie } from '@/lib/cookieConsentStore';
import { OPTIONAL_CATEGORY_KEYS } from '@/lib/consentCategories';
import { subscribeConsentDecision } from '@/lib/consentBroadcast';

/**
 * OpenAI Ads pixel — loads oaiq.min.js, and ONLY after marketing consent.
 *
 * MetaPixel.jsx's shape, deliberately: the stored cookie read once on mount
 * (in an effect, so server and first client render agree), plus the
 * 9e:consent-decision broadcast for a decision made in this page view — so a
 * banner accept loads it without a reload. Only a literal `true` loads anything;
 * `null` is "not read yet", not "denied".
 *
 * initOaiPixel installs the stub and queues `init` synchronously BEFORE the
 * <Script> is rendered, so whenever the library lands its queue is in order.
 * Mounted once in the root layout, so it survives client-side navigation and
 * next/script dedupes the element by `id`.
 */
export function OaiPixelLoader({ pixelId, debug }) {
  const [marketing, setMarketing] = useState(null);

  useEffect(() => {
    const apply = (categories) => setMarketing(categories?.marketing === true);
    apply(parseConsent(readConsentCookie(), OPTIONAL_CATEGORY_KEYS));
    return subscribeConsentDecision(apply);
  }, []);

  useEffect(() => {
    if (marketing === null) return;
    if (marketing) initOaiPixel({ pixelId, debug });
    else setOaiPixelConsent(false);
  }, [marketing, pixelId, debug]);

  if (!pixelId || marketing !== true) return null;

  return <Script id="oai-pixel" strategy="afterInteractive" src={OAIQ_SRC} />;
}
