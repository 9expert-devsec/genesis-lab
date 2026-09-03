'use client';

/**
 * Wires an RHF-registered, UNCONTROLLED phone <input> to:
 *   - beforeinput character filtering (refuse the character before it is
 *     inserted, per isAllowedPhoneChar in thaiPhone.js)
 *   - beforeinput length capping (refuse an insertion that would push the
 *     digit count past what the value's apparent class allows — see
 *     maxDigitsFor/wouldExceedCap — EXCEPT a native paste, which always
 *     lands whole; see onBeforeInput's own comment)
 *   - paste sanitisation (strip disallowed characters from pasted text)
 *   - live GATED reformatting on input, via formatThaiPhoneProgressive — see
 *     shouldReformatOnInput
 *   - format-on-BLUR, via formatThaiPhone, still the backstop for every case
 *     the input-time gate above skips (caret not at the end, a delete, or a
 *     "+"-led value)
 *
 * WHY THE GATE ON EVERY `input` EVENT — the legacy PHP file's own defect,
 * named so it is not ported: unconditionally rewriting the value on every
 * keystroke moves the caret to the end of the value, which makes editing the
 * middle of a number impossible. `beforeinput` refuses a disallowed character
 * BEFORE it lands, so the caret never has to be repositioned for THAT; the
 * `input`-time reformat only ever runs when shouldReformatOnInput's own caret
 * check confirms the caret was already at the end, so it cannot reintroduce
 * that defect. Every case the gate skips still gets formatted at blur, where
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

import {
  isAllowedPhoneChar,
  sanitizePhoneText,
  formatThaiPhone,
  formatThaiPhoneProgressive,
  MOBILE_PREFIXES,
  LANDLINE_PREFIXES,
} from './thaiPhone';

const guardedInputs = new WeakSet();

/**
 * Whether a native 'input' event should trigger a live reformat of the
 * field's value. Extracted as a pure function (no DOM) so it can be unit
 * tested directly — the runner has no jsdom.
 *
 * ALL of these must hold:
 *   - the caret sits at the very end of the value (both ends of the
 *     selection) — rewriting el.value while the caret is mid-string is what
 *     moves it to the end, the legacy defect this file's docstring already
 *     warns against reintroducing.
 *   - inputType does not start with "delete" — a delete doesn't change which
 *     digits are present, only which separator sits next to them, so
 *     reformatting would rebuild the separator and backspace would appear to
 *     do nothing.
 *   - the value does not start with "+" — formatThaiPhoneProgressive does
 *     not attempt to group foreign/+66 numbers early, so there is nothing
 *     useful to reformat here.
 */
export function shouldReformatOnInput({ value, selectionStart, selectionEnd, inputType }) {
  if (typeof inputType === 'string' && inputType.startsWith('delete')) return false;
  if (String(value ?? '').startsWith('+')) return false;
  const len = String(value ?? '').length;
  return selectionStart === len && selectionEnd === len;
}

/**
 * The digit-count ceiling for `rawValue`'s apparent class, used by
 * wouldExceedCap to refuse a beforeinput insertion that would blow past it.
 * Classification is prefix-based, same MOBILE_PREFIXES/LANDLINE_PREFIXES
 * thaiPhone.js's own classify() uses — no second copy of those lists.
 */
export function maxDigitsFor(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (trimmed.startsWith('+')) return 15; // digits after the "+"
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 2) return 15; // class not yet known — do not block early typing
  const prefix = digits.slice(0, 2);
  if (MOBILE_PREFIXES.has(prefix)) return 10;
  if (LANDLINE_PREFIXES.has(prefix)) return 14; // 9 base + up to 5 extension digits
  return 15; // unmatched prefix — already headed for invalid regardless of length
}

/**
 * Whether inserting `insertedText` into `currentValue` would push the digit
 * count past maxDigitsFor's ceiling. Counts DIGITS, not characters — the
 * value carries "-" and " ต่อ " that must not count against the cap.
 */
export function wouldExceedCap(currentValue, insertedText) {
  const cap = maxDigitsFor(currentValue);
  const currentDigits = String(currentValue ?? '').replace(/\D/g, '').length;
  const insertedDigits = String(insertedText ?? '').replace(/\D/g, '').length;
  return currentDigits + insertedDigits > cap;
}

function onBeforeInput(e) {
  // e.data is null for deletions, composition start/end, and some IME steps —
  // none of those insert literal text, so there is nothing to filter or cap.
  // Deletions are never refused, by the same reasoning.
  if (e.data == null) return;
  for (const ch of e.data) {
    if (!isAllowedPhoneChar(ch)) {
      e.preventDefault();
      return;
    }
  }
  // Paste is exempt from the length cap. When onPaste below finds nothing to
  // strip, it does NOT preventDefault the 'paste' event, so the browser's own
  // native paste proceeds and fires this same beforeinput with
  // inputType "insertFromPaste" and e.data set to the WHOLE pasted text. An
  // over-long paste must land whole and fail validation at the message the
  // customer already sees — never be silently chopped the way the legacy
  // PHP implementation's substring() truncation did. (A paste that DOES
  // contain a disallowed character is intercepted entirely in onPaste,
  // via its own preventDefault + manual splice, so this beforeinput never
  // even fires for that case.)
  if (e.inputType === 'insertFromPaste') return;
  if (wouldExceedCap(e.target.value, e.data)) {
    e.preventDefault();
  }
}

function onInput(e) {
  const el = e.target;
  const shouldReformat = shouldReformatOnInput({
    value: el.value,
    selectionStart: el.selectionStart,
    selectionEnd: el.selectionEnd,
    inputType: e.inputType,
  });
  if (!shouldReformat) return;

  const formatted = formatThaiPhoneProgressive(el.value);
  if (formatted === el.value) return;

  el.value = formatted;
  const caret = formatted.length;
  el.setSelectionRange(caret, caret);
  // No synthetic 'input' redispatch needed here, unlike onPaste below: this
  // handler runs on the SAME native 'input' event that's still dispatching,
  // synchronously before it reaches React's delegated listener (which sits
  // on an ancestor, and DOM bubbling always visits the target's own
  // listeners before an ancestor's) — so RHF reads the already-reformatted
  // value when its own onChange runs moments later on this same event.
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
  el.addEventListener('input', onInput);
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
