'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * คัดลอกรหัสส่วนลด — the bundle's own button, and the ONE client module the
 * page-builder's public render adds.
 *
 * ── WHY IT IS NOT IN `sections/` ──────────────────────────────────────────
 * Three tests read `src/components/pageBuilder/sections/` with `readdirSync`
 * and turn each `*.jsx` filename into a SECTION TYPE NAME
 * (test/pure/sectionControlAudit, test/render/customColorRender,
 * test/render/settingsPanelTabs). A helper component in that directory is a
 * file claiming to be a type called `CopyCodeButton`, and each of those sweeps
 * would either count it or quietly not — which is worse. So it sits beside
 * `SectionRenderer.jsx` instead, where nothing derives a type from a filename.
 *
 * ── WHY A CLIENT MODULE AT ALL, WHEN course_schedule REFUSED ONE ──────────
 * `sections/course_schedule.jsx` says "No new client module on the public
 * route" and renders server-side rather than reuse the `'use client'`
 * ScheduleCard. That was right there: everything it draws is static markup, so
 * a client bundle would have bought nothing.
 *
 * This is the case that measurement does not cover.
 * docs/promotion-page-coverage.md §"BEHAVIOUR — 1" priced it exactly: the
 * original page ships a `<script>` that binds `[data-copy]`, writes to
 * `navigator.clipboard` and swaps the label to "คัดลอกแล้ว" — "an interaction,
 * a permission-gated browser API, and a transient label change", none of which
 * a string field can express. The doc's cheaper option was to render the code
 * as static text, and this component takes BOTH: the code is always rendered as
 * selectable text by the section itself, and this is the affordance on top.
 *
 * So a visitor with no JavaScript, or a blocked clipboard, still SEES the code
 * and can select it by hand. The button is an accelerator, never the only path
 * to the value — which is what keeps the client cost honest.
 *
 * ── THE FALLBACK IS NOT OPTIONAL ──────────────────────────────────────────
 * `navigator.clipboard` is undefined on insecure origins and throws when the
 * permission is denied, and both are ordinary rather than exotic. On failure
 * the button says so ("คัดลอกไม่สำเร็จ") instead of showing the success tick,
 * because a tick that did not copy is worse than no button: the visitor walks
 * away believing they hold a code they do not.
 *
 * The transient label reverts after two seconds. The timer is cleared on
 * unmount — a bundle can be removed from the canvas while its timeout is in
 * flight, and setting state on an unmounted component is a warning nobody would
 * connect back to this file.
 */
const REVERT_MS = 2000;

export function CopyCodeButton({ code, className }) {
  // 'idle' | 'copied' | 'failed'. Three states, not a boolean: a failure has to
  // be distinguishable from a success, per the header.
  const [state, setState] = useState('idle');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    clearTimeout(timer.current);
    try {
      // Tested BEFORE the call, not caught after it. On an insecure origin
      // `navigator.clipboard` is undefined, so `navigator.clipboard.writeText`
      // is a TypeError thrown synchronously — which a bare `await` would route
      // into the catch anyway, but only by accident of where it was thrown.
      // Asking first makes "there is no clipboard here" an explicit branch.
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(String(code));
      setState('copied');
    } catch {
      setState('failed');
    }
    timer.current = setTimeout(() => setState('idle'), REVERT_MS);
  };

  const label =
    state === 'copied' ? 'คัดลอกแล้ว' : state === 'failed' ? 'คัดลอกไม่สำเร็จ' : 'คัดลอกรหัสส่วนลด';

  return (
    <button
      type="button"
      data-testid="bundle-copy-code"
      data-state={state}
      onClick={copy}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-9e-xl px-6 py-3',
        'font-en font-semibold transition-all duration-9e-micro ease-9e',
        'hover:-translate-y-[2px] hover:shadow-9e-md',
        className,
      )}
    >
      {state === 'copied' ? (
        <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
      ) : (
        <Copy className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      )}
      {label}
    </button>
  );
}
