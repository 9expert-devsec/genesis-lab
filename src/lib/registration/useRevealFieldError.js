'use client';

import { useCallback, useState } from 'react';

/** The decision itself, as a pure function — unit tested directly. */
export function computeShouldShowError(blurred, isSubmitted) {
  return Boolean(blurred) || Boolean(isSubmitted);
}

/**
 * A per-FIELD, presentation-only alternative to widening RHF's form-wide
 * `reValidateMode`. The underlying error keeps being computed exactly as it
 * always was — this form's `mode`/`reValidateMode` is untouched, and every
 * OTHER field keeps rendering `errors.foo?.message` directly, unconditionally.
 * This hook only decides whether ONE field's already-computed error is
 * RENDERED yet: not until that field has been blurred once, or the form has
 * been submitted once. A half-typed value is not wrong yet, it is unfinished.
 *
 * Usage: compute the registration/props object ONCE (do not call register()
 * twice for the same field), then chain this hook's `reveal` into its onBlur:
 *
 *   const phoneProps = phoneInputProps(register('coordinator.phone'));
 *   const phoneReveal = useRevealFieldError(isSubmitted);
 *   <Input {...phoneProps}
 *     onBlur={(e) => { phoneProps.onBlur(e); phoneReveal.reveal(); }} />
 *   <FieldGroup error={phoneReveal.shouldShow ? err.phone?.message : undefined}>
 *
 * @param {boolean} isSubmitted formState.isSubmitted from the field's OWN
 *   form — submitting reveals every field's error at once, same as a normal
 *   RHF form with no per-field gating would already do on submit.
 */
export function useRevealFieldError(isSubmitted) {
  const [blurred, setBlurred] = useState(false);
  const reveal = useCallback(() => setBlurred(true), []);
  return { shouldShow: computeShouldShowError(blurred, isSubmitted), reveal };
}
