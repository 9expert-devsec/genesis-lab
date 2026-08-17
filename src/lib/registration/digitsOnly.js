/**
 * Digits-only input filtering for react-hook-form's UNCONTROLLED inputs.
 *
 * ── WHY IT WRAPS RHF's onChange RATHER THAN USING register(name, { onChange })
 * The `onChange` option on `register` fires AROUND RHF's own handler, and which
 * side of it is an implementation detail of the version in node_modules. If RHF
 * reads `event.target.value` before our filter mutates it, the DOM shows the
 * stripped value while form state keeps the unstripped one — a divergence that
 * is invisible on screen and only shows up in Mongo.
 *
 * So the registration is wrapped instead: we filter `event.target.value` FIRST,
 * then hand the same event to RHF, which reads the value we already fixed. No
 * ordering assumption, and the input stays uncontrolled — converting these
 * fields to controlled inputs would remount-thrash the whole quotation block.
 *
 * PURE: no env, no db, no network, no React.
 */

/** Strip everything that is not 0-9, then hard-cap the length. */
export function onlyDigits(value, maxLength) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return maxLength ? digits.slice(0, maxLength) : digits;
}

/**
 * @param {object} registration the object returned by RHF's register(name)
 * @param {number} maxLength    the same number the input carries as maxLength
 * @returns {object} a registration whose onChange has already filtered the event
 */
export function digitsOnly(registration, maxLength) {
  return {
    ...registration,
    onChange: (event) => {
      if (event?.target) {
        event.target.value = onlyDigits(event.target.value, maxLength);
      }
      return registration.onChange(event);
    },
  };
}
