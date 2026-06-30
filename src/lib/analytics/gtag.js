// Thin wrapper around window.gtag so callers never touch window directly and
// SSR never crashes. Every function is a no-op (silent return) when gtag isn't
// loaded — they must never throw.

export function gtagEvent(action, params = {}) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', action, params);
}

export function gtagPageView(url) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  // GA4 page_view on SPA route change
  window.gtag('event', 'page_view', {
    page_path: url,
    page_location: window.location.href,
    page_title: document.title,
  });
}

// Consent update helper (used later if a consent banner is added)
export function gtagConsentUpdate(consent) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('consent', 'update', consent);
}
