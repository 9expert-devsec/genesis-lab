import {
  Shield,
  Cookie,
  FileCode,
  Undo2,
  Settings,
  CircleUserRound,
  Clock,
  Check,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  ListChecks,
  CircleHelp,
  Calendar,
  Mail,
} from 'lucide-react';

/**
 * The legal centre's icon vocabulary, resolved from a string key.
 *
 * ── WHY A KEY MAP AND NOT DIRECT IMPORTS ────────────────────────────────────
 * config/policies.js is read by server components, client components and the
 * footer. Storing a component there would drag lucide-react into all three;
 * storing a string keeps that module free of React entirely.
 *
 * ── WHY THIS EXACT SET ──────────────────────────────────────────────────────
 * The four policy keys are the icons the hub's cards already use, so a detail
 * page's hero shows the same glyph as the card the visitor clicked to reach it.
 * That correspondence is the whole reason the heroes share one motif — see
 * PolicyHero. Adding a fifth policy means adding its icon HERE and nowhere
 * else.
 *
 * Everything is rendered with `currentColor` (lucide's default), so colour is
 * inherited from the parent and dark mode needs no separate icon set.
 */
const ICONS = {
  // The four policies — must match POLICY_PAGES[].icon
  shield: Shield,
  cookie: Cookie,
  terms: FileCode,
  refund: Undo2,

  // Hub shortcuts
  settings: Settings,
  dpo: CircleUserRound,

  // Chrome
  clock: Clock,
  check: Check,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  arrowUpRight: ArrowUpRight,
  listChecks: ListChecks,
  help: CircleHelp,
  calendar: Calendar,
  mail: Mail,
};

/**
 * Render one icon by key.
 *
 * Unknown keys render nothing rather than throwing: a missing glyph is a
 * cosmetic defect, but a legal page that 500s because someone typo'd an icon
 * name is a page the visitor cannot read at all.
 */
export function PolicyIcon({ name, className, strokeWidth = 1.75, ...rest }) {
  const Glyph = ICONS[name];
  if (!Glyph) return null;
  return (
    <Glyph className={className} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />
  );
}

export function hasPolicyIcon(name) {
  return Boolean(ICONS[name]);
}
