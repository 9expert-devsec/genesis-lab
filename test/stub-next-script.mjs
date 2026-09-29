// Faithful-enough next/script for the test tiers — see stub-next-link.mjs.
//
// Renders a REAL <script> element, which is the whole point: the claim under
// test in test/render/metaPixelConsentGate is that nothing is requested from
// connect.facebook.net unless marketing consent exists, and that can only be
// observed by looking for the element that would do the requesting.
//
// `strategy` and the lifecycle callbacks are dropped. They are Next's loading
// machinery (afterInteractive injects post-hydration, lazyOnload on idle) and
// there is no framework here to honour them; keeping them as DOM attributes
// would put `strategy="afterInteractive"` into the markup, which next/script
// never emits.
//
// ── THE SCRIPT DOES NOT EXECUTE, AND THAT IS CORRECT HERE ───────────────────
// JSDOM only fetches and runs external scripts when constructed with
// `resources: 'usable'` and `runScripts`, which the drives deliberately do not
// do. So the element exists to be found and fbevents.js never arrives — which
// is exactly the state a real page is in between the tag being written and the
// library landing, and the state the fbq stub's queue exists to survive.
import { createElement } from 'react';

export default function Script({
  src,
  id,
  // eslint-disable-next-line no-unused-vars -- named so they are DROPPED
  strategy, onLoad, onReady, onError, ...rest
}) {
  return createElement('script', { src, id, ...rest }, null);
}
