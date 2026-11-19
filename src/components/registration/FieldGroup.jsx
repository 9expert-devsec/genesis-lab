import { Children, cloneElement, isValidElement, useId } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/**
 * FieldGroup — label + control + error message for the registration forms.
 *
 * ONE implementation, shared by InhouseForm, BranchFields and ThaiAddressFields
 * (D26). It used to be three identical local copies, and all three rendered the
 * <label> as a SIBLING of the control with no `htmlFor`: 0 label↔control
 * associations, so a screen reader announced every field by its placeholder or
 * not at all, and clicking a label focused nothing.
 *
 * What it does now, without changing any markup a sighted user sees:
 *   · a `useId()` id for the control, and `htmlFor` on the label;
 *   · `aria-required="true"` on the control when the field is required (the
 *     visual `*` stays). NOT the native `required` attribute — validation and
 *     its messages belong to react-hook-form/zod, unchanged;
 *   · the error <p> gets an id and the control's `aria-describedby` points at
 *     it (merged with any describedby the control already had).
 *
 * WHICH CHILD IS "THE CONTROL": the first top-level child that is an
 * <input>/<select>/<textarea> or the shared <Input>/<Textarea>. A hint <p>
 * after it is left alone. A control the wrapper cannot see — nested inside a
 * positioning <div>, like the แขวง/ตำบล combobox — is wired by the caller:
 * pass `controlId`, put that id on the inner control, and add
 * `${controlId}-error` to its aria-describedby (see `fieldErrorId`).
 * A control that already has its own `id` keeps it, and the label follows it.
 */

const NATIVE_CONTROLS = new Set(['input', 'select', 'textarea']);

function isControl(el) {
  return isValidElement(el) && (NATIVE_CONTROLS.has(el.type) || el.type === Input || el.type === Textarea);
}

/** The id the error message of a FieldGroup with this control id carries. */
export function fieldErrorId(controlId) {
  return `${controlId}-error`;
}

export function FieldGroup({ label, error, required, children, className, controlId }) {
  const autoId = useId();
  const baseId = controlId ?? autoId;
  const errorId = fieldErrorId(baseId);

  let labelFor = controlId ?? null;
  let attached = Boolean(controlId);
  const content = Children.map(children, (child) => {
    if (attached || !isControl(child)) return child;
    attached = true;
    const id = child.props.id ?? baseId;
    labelFor = id;
    const describedBy =
      [child.props['aria-describedby'], error ? errorId : null].filter(Boolean).join(' ') || undefined;
    return cloneElement(child, {
      id,
      'aria-describedby': describedBy,
      ...(required ? { 'aria-required': true } : {}),
    });
  });

  return (
    <div className={className}>
      <Label className="mb-1.5 block" htmlFor={labelFor ?? undefined}>
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {content}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
