'use client';

/**
 * Wires an RHF-registered, UNCONTROLLED phone <input> to:
 *   - beforeinput character filtering (refuse the character before it is
 *     inserted, per isAllowedPhoneChar in thaiPhone.js)
 *   - paste sanitisation (strip disallowed characters from pasted text)
 *   - format-on-BLUR only, via formatThaiPhone
 *
 * WHY NOT REWRITE THE VALUE ON EVERY `input` EVENT — the legacy PHP file's own
 * defect, named so it is not ported: doing that moves the caret to the end of
 * the value on every keystroke, which makes editing the middle of a number
 * impossible, and it also invites truncating a pasted number that runs longer
 * than expected. `beforeinput` refuses a character BEFORE it lands, so the
 * caret never has to be repositioned; formatting is deferred to blur, where
 * there is no caret position left to disturb.
 *
 * WHY A NATIVE beforeinput/paste LISTENER, NOT React's onBeforeInput prop —
 * React's synthetic onBeforeInput has known cross-browser gaps (notably
 * around IME composition) that a native listener on the actual DOM node does
 * not have. The input stays uncontrolled throughout — see digitsOnly.js for
 * why converting these fields to controlled would remount-thrash the form —
 * so attaching directly to the node via the ref callback is consistent with
 * how this repo already wires uncontrolled inputs.
 *
 * IDEMPOTENT ATTACH. `phoneInputProps` is called fresh on every render (the
 * same convention digitsOnly() uses), so the ref callback identity changes
 * every render and React re-invokes it on the same DOM node. A WeakSet marks
 * nodes that already carry the listeners so a second attach is a no-op rather
 * than a duplicate pair of listeners; nothing needs an explicit detach, since
 * the listeners are element-scoped and are collected with the element itself.
 */

import { isAllowedPhoneChar, sanitizePhoneText, formatThaiPhone } from './thaiPhone';

const guardedInputs = new WeakSet();

function onBeforeInput(e) {
  // e.data is null for deletions, composition start/end, and some IME steps —
  // none of those insert literal text, so there is nothing to filter.
  if (e.data == null) return;
  for (const ch of e.data) {
    if (!isAllowedPhoneChar(ch)) {
      e.preventDefault();
      return;
    }
  }
}

function onPaste(e) {
  const text = e.clipboardData?.getData('text') ?? '';
  const sanitized = sanitizePhoneText(text);
  if (sanitized === text) return; // nothing to strip — let the native paste run

  e.preventDefault();
  const el = e.target;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + sanitized + el.value.slice(end);
  const caret = start + sanitized.length;
  el.setSelectionRange(caret, caret);
  // RHF reads the DOM value on its own onChange/onBlur; dispatching a real
  // input event is what tells it (and any other listener) the value moved.
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function attachPhoneInputGuard(el) {
  if (!el || guardedInputs.has(el)) return;
  guardedInputs.add(el);
  el.addEventListener('beforeinput', onBeforeInput);
  el.addEventListener('paste', onPaste);
}

/**
 * @param {object} registration react-hook-form's register(name) return value
 * @returns {object} spreadable input props: registration + inputMode="tel" +
 *          a combined ref (RHF's + the guard) + a combined onBlur (format,
 *          then RHF's own onBlur so validation runs against the final value)
 */
export function phoneInputProps(registration) {
  return {
    ...registration,
    inputMode: 'tel',
    ref: (el) => {
      registration.ref(el);
      attachPhoneInputGuard(el);
    },
    onBlur: (e) => {
      // "If a value cannot be formatted, leave it as the user typed it and
      // show the error" — formatThaiPhone returns null for exactly that case,
      // so a null result leaves e.target.value untouched.
      const formatted = formatThaiPhone(e.target.value);
      if (formatted != null) e.target.value = formatted;
      registration.onBlur(e);
    },
  };
}
