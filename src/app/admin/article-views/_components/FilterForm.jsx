'use client';

import { useRouter } from 'next/navigation';

/**
 * The filter panel's <form>. It is a plain GET form — without JavaScript it
 * submits natively and the server reads the result from `searchParams` — and
 * with JavaScript it pushes the same URL with empty and default-valued fields
 * dropped, so the address bar stays readable and Back steps through filters.
 *
 * NO STATE: the fields are uncontrolled, rendered with `defaultValue` from the
 * URL by the server page, and keyed on that value so a navigation re-renders
 * them. Nothing here holds a copy of the URL.
 *
 * Selects submit on change (`AutoSubmitSelect`); the search box submits on
 * Enter.
 */
export function FilterForm({ action, defaults = {}, className, children }) {
  const router = useRouter();
  const onSubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget)) {
      const value = String(v).trim();
      if (!value || defaults[k] === value) continue;
      params.set(k, value);
    }
    const qs = params.toString();
    router.push(qs ? `${action}?${qs}` : action);
  };
  return (
    <form method="get" action={action} onSubmit={onSubmit} className={className}>
      {children}
    </form>
  );
}

/** A <select> that submits its form on change. Uncontrolled — see FilterForm. */
export function AutoSubmitSelect(props) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
