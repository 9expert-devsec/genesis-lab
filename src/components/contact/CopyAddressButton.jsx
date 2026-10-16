'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

/**
 * A small public copy-to-clipboard button for the /contact-us address cards.
 *
 * Modelled on the admin CopyButton (admin/registrations/_components/detailShell)
 * but deliberately NOT imported from there: that one is styled with the admin
 * surface CSS variables, and this one has to sit on the public light/dark cards.
 *
 * idle → ok | fail, back to idle after ~2s. The result is announced through a
 * polite live region; a missing Clipboard API (old browser, insecure context)
 * lands in the fail state rather than throwing.
 */
export default function CopyAddressButton({ text, label, copiedLabel, failedLabel, ariaLabel }) {
  const [state, setState] = useState('idle'); // 'idle' | 'ok' | 'fail'
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (next) => {
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      flash('ok');
    } catch {
      flash('fail');
    }
  };

  const Icon = state === 'ok' ? Check : state === 'fail' ? X : Copy;
  const visible = state === 'ok' ? copiedLabel : state === 'fail' ? failedLabel : label;

  const tone =
    state === 'ok'
      ? 'border-[#15803D] text-[#15803D] dark:border-[#4ADE80] dark:text-[#4ADE80]'
      : state === 'fail'
        ? 'border-[#B91C1C] text-[#B91C1C] dark:border-[#F87171] dark:text-[#F87171]'
        : 'border-[#CBD5E1] text-[#334155] hover:border-9e-action hover:text-9e-action dark:border-9e-border dark:text-[#cbd5e1] dark:hover:border-9e-air dark:hover:text-9e-air';

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={ariaLabel}
        className={`inline-flex flex-shrink-0 items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${tone}`}
      >
        <Icon aria-hidden className="h-4 w-4" />
        <span aria-hidden>{visible}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {state === 'ok' ? copiedLabel : state === 'fail' ? failedLabel : ''}
      </span>
    </>
  );
}
