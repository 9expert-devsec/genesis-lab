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

export function lucideIcon(name) {
  return isKnownIconName(name) ? LucideIcons[name] : null;
}
