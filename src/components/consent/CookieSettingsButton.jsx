'use client';

import { requestOpenCookieSettings } from '@/lib/consentBroadcast';

/**
 * The footer's "ตั้งค่าคุกกี้" (round CB-C) — the one way back into the consent
 * settings after a decision. A client island so PublicFooter stays a server
 * component and every page stays static.
 *
 * It only REQUESTS the panel; the banner mount in the root layout owns the
 * panel, the stored choice and the decision flow (src/lib/consentBroadcast.js,
 * open-settings event). A <button>, not a link: it opens a dialog, it does not
 * navigate. Styled by the caller so it matches the policy links beside it.
 */
export function CookieSettingsButton({ className }) {
  return (
    <button type="button" onClick={() => requestOpenCookieSettings()} className={className}>
      ตั้งค่าคุกกี้
    </button>
  );
}
