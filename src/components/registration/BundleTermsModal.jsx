'use client';

import {
  BUNDLE_TERMS,
  BUNDLE_TERMS_DISMISS,
  BUNDLE_TERMS_TITLE,
} from '@/lib/registration/bundleTerms';

/**
 * The bundle quotation's terms, behind เงื่อนไขการสมัคร on the review step.
 *
 * ══ WHY THIS IS NOT components/payment/TermsModal ══════════════════════════
 *
 * A BUNDLE MUST NOT POINT AT THE PAYMENT TERMS. That was ruled in an earlier
 * round and it is the reason this file exists: the public modal is titled
 * เงื่อนไขการสมัครและการชำระเงิน and its four clauses are about paying,
 * refunding and rescheduling a PAID seat. A quotation request takes no payment
 * — `bundleRegistrationSchema` carries no `paymentMethod` and no `omiseToken`,
 * so there is no value a client could send that would make it a purchase — and
 * sending a customer to terms for a transaction they have not entered into is a
 * false statement, not a shortcut.
 *
 * ══ WHY THE SHELL IS COPIED RATHER THAN IMPORTED ═══════════════════════════
 *
 * `TermsModal` takes `{ open, onClose }` and NOTHING else: its aria-label, its
 * heading, all four clauses and its dismiss button are hardcoded in its body.
 * There is no `children`, no `title`, no clause prop. Making it serve this
 * screen would mean adding props to it — and it has TWO LIVE CONSUMERS,
 * ReviewAndPayStep and the masterclass register client, so widening it would
 * put a bundle change into two flows this round is forbidden to touch.
 *
 * So the CLASSES are copied and the COMPONENT is not, and that file is left
 * byte-identical — asserted by hash in test/render/bundleTermsModal, not merely
 * intended. The duplication is deliberate and bounded: two modals, two audiences,
 * two sets of copy, and neither able to change the other.
 *
 * ══ THE TRIGGER IS NOT IN HERE, AND THAT IS LOAD-BEARING ═══════════════════
 *
 * The consent checkbox's `<label>` and this modal's opener are SIBLINGS in
 * BundleWizard, not nested. A `<button>` inside a `<label>` is activated by the
 * label as well as by itself in the browsers this was measured in, so a customer
 * reading the terms would silently tick the consent box they had not agreed to
 * yet. See the note at that call site: the fix is the DOM shape, not a
 * stopPropagation over the top of it.
 *
 * ══ THE CLAUSES ARE DATA, VERBATIM ═════════════════════════════════════════
 *
 * From `lib/registration/bundleTerms.js`, which explains the three things a
 * reader will want to "fix" about them and why each stays. This component maps;
 * it does not edit, number, sort or filter. There is no branch here that could
 * drop a clause, which matters: a clause quietly dropped is one nobody agreed to
 * drop.
 */
export function BundleTermsModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={BUNDLE_TERMS_TITLE}
      data-testid="bundle-terms-modal"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      {/*
        Panel. `max-h-[80vh] overflow-y-auto` is the public shell's own, and it
        is what makes ELEVEN clauses safe where that modal carries four: the
        list scrolls inside the panel instead of growing past the viewport.
        Measured at 375 rather than assumed.
      */}
      <div className="relative z-[60] w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--surface-border)] bg-white p-6 shadow-xl dark:bg-[#111d2c]">
        <h2 className="text-base font-bold text-9e-navy dark:text-white mb-4">
          {BUNDLE_TERMS_TITLE}
        </h2>
        <ul
          data-testid="bundle-terms-list"
          className="list-disc space-y-2 pl-5 text-sm text-gray-600 dark:text-gray-300"
        >
          {BUNDLE_TERMS.map((clause) => (
            // Keyed by the CLAUSE, not the index: the list is frozen and every
            // string is distinct, so the text is a stable identity, and an index
            // key would carry a clause's identity to its neighbour if the copy
            // is ever revised.
            <li key={clause}>{clause}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          data-testid="bundle-terms-dismiss"
          className="mt-6 w-full rounded-full bg-9e-action py-2.5 text-sm font-semibold text-white hover:bg-9e-brand"
        >
          {BUNDLE_TERMS_DISMISS}
        </button>
      </div>
    </div>
  );
}
