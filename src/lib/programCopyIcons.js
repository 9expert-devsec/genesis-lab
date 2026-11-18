import {
  BarChart3,
  Database,
  Truck,
  Users,
  Code,
  Target,
  Headset,
  PieChart,
  Megaphone,
  Briefcase,
  Wallet,
  GraduationCap,
  ShieldCheck,
  Lightbulb,
  Rocket,
  Settings,
  FileText,
  Sparkles,
} from 'lucide-react';

/**
 * THE ICON PRESET for the program page's benefit cards
 * (ProgramPageConfig.benefitCards[].icon).
 *
 * One list, read by all three consumers: the admin picker
 * (PageConfigEditor), the save whitelist (lib/pageConfigUpdate rejects a key
 * not listed here) and the public render (ProgramPageClient). The database
 * stores the KEY, never a component.
 *
 * Its own list, not the banner's FEATURE_TAG_ICONS (lib/schemas/banner.js):
 * that one is keyed by the Lucide component name and serves a different
 * surface. The shape is the same idea — a fixed whitelist mapped to complete
 * component literals — keyed here by a short kebab name the seed sheet uses.
 *
 * An unknown or empty key renders FALLBACK_ICON_KEY and never throws, so a
 * row written before a key is retired still renders.
 */
export const PROGRAM_COPY_ICONS = {
  chart: BarChart3,
  database: Database,
  truck: Truck,
  users: Users,
  code: Code,
  target: Target,
  headset: Headset,
  'pie-chart': PieChart,
  megaphone: Megaphone,
  briefcase: Briefcase,
  wallet: Wallet,
  'graduation-cap': GraduationCap,
  'shield-check': ShieldCheck,
  lightbulb: Lightbulb,
  rocket: Rocket,
  settings: Settings,
  'file-text': FileText,
  sparkles: Sparkles,
};

export const PROGRAM_COPY_ICON_KEYS = Object.freeze(Object.keys(PROGRAM_COPY_ICONS));

export const FALLBACK_ICON_KEY = 'sparkles';

export function isProgramCopyIconKey(key) {
  return typeof key === 'string' && Object.hasOwn(PROGRAM_COPY_ICONS, key);
}

/** The component for a stored key; the fallback for anything unknown. */
export function programCopyIcon(key) {
  return isProgramCopyIconKey(key) ? PROGRAM_COPY_ICONS[key] : PROGRAM_COPY_ICONS[FALLBACK_ICON_KEY];
}
