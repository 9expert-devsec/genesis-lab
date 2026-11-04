'use client';

import { useEffect } from 'react';
import { contactMethodOf } from '@/lib/analytics/dataLayer';
import { trackContactClick } from '@/lib/analytics/conversions';

/**
 * `contact_click` for every tel: / mailto: / LINE link on the site, from ONE
 * delegated listener rather than an onClick on each link.
 *
 * The contact links live in the header, the footer, the floating dock, page
 * builder sections, article bodies and admin-authored rich text — a per-link
 * handler would be missed on whichever of those was written next. A capture
 * listener on the document sees all of them, including links rendered from
 * HTML strings that no React handler could reach.
 *
 * Capture phase, so a component that stops propagation on its own click does
 * not hide the contact. It never prevents anything: the link still does
 * exactly what it did.
 *
 * Inert without GTM (the push goes nowhere), like every other contract event.
 * It is mounted under /admin too — the root layout has no admin split — which
 * is harmless: the container's `/admin` exception keeps every tag off there.
 */
export function ContactClickTracker() {
  useEffect(() => {
    const onClick = (e) => {
      const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!anchor) return;
      const method = contactMethodOf(anchor.getAttribute('href'));
      if (!method) return;
      trackContactClick({ method, pagePath: window.location.pathname });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
