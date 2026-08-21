import * as LucideIcons from 'lucide-react';

/**
 * Resolve a Lucide icon NAME (e.g. "Rocket") to its React component, or null.
 *
 * ONE resolver, shared by the card components (stat_card, icon_card) whose
 * `content.icon` is a Lucide name string, matching the existing convention in
 * the admin banner UI (`LucideIcons[name]`).
 *
 * Fail closed AND fail narrow: `lucide-react` also exports non-icon helpers
 * (`createLucideIcon`, `icons`, …). Icon names are PascalCase, so restricting to
 * that shape keeps a mistyped or hostile `content.icon` from resolving to a
 * helper export and rendering something unexpected — an unknown name is simply
 * dropped (the component renders without an icon; the editor warns).
 */
const ICON_NAME_RE = /^[A-Z][A-Za-z0-9]*$/;

export function isKnownIconName(name) {
  return typeof name === 'string' && ICON_NAME_RE.test(name) && typeof LucideIcons[name] !== 'undefined';
}

/**
 * Every name `isKnownIconName` accepts, enumerated — the picker's whole list.
 *
 * ── DERIVED BY CALLING THE VALIDATOR, NOT BY RESTATING IT ──────────────────
 * A picker has to ENUMERATE where a validator only has to TEST, and the obvious
 * way to get a list — hand-curating a nice subset, or re-implementing the
 * predicate here — is the way the two drift apart: a curated list goes stale
 * against a lucide upgrade, and a second predicate disagrees with the first the
 * day either is edited. Offering a name the validator then rejects is the exact
 * failure the picker exists to remove.
 *
 * So the list IS the filter, run over the module's own exports with the very
 * function that judges a stored value. Set equality is true by construction and
 * is asserted in both directions anyway, because "by construction" is a claim
 * about today's code.
 *
 * `Object.keys` is exhaustive here: an ES module namespace object has a null
 * prototype and its own keys are exactly its exports, so there is no name that
 * resolves through `LucideIcons[name]` without appearing in this list.
 *
 * COSTS NOTHING TO BUNDLE. The namespace import above is already unshakeable —
 * `LucideIcons[name]` is a dynamic lookup, so no bundler can prune the library,
 * and every icon is in the client bundle wherever this module is imported.
 * Measured: icons the app never names appear in the built chunks. Enumerating
 * reads keys off a module that is already fully present.
 */
export const ICON_NAMES = Object.freeze(Object.keys(LucideIcons).filter(isKnownIconName));

export function lucideIcon(name) {
  return isKnownIconName(name) ? LucideIcons[name] : null;
}
