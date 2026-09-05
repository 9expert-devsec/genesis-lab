import {
  Heading, AlignLeft, Image, MousePointerClick, ListChecks, AlertCircle,
  RectangleHorizontal, SquareStack, Columns2, LayoutGrid, LayoutDashboard, GitCommitHorizontal,
  PanelTop, ChevronsDownUp,
  BadgeDollarSign, BarChart3, Sparkles,
  Code, Frame, Palette, Braces,
  GraduationCap, UserRound, ListFilter, List, Package, CalendarClock,
  Square,
} from 'lucide-react';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. `promotion_bundle`'s glyph: a ticket with a percent sign,
// which is the discount this section is FOR. Deliberately not another box —
// `Package` is `bundle_courses`, and the picker now offers both, so the two
// must be tellable apart at a glance as well as by their labels.
// Verified against lucide-react@0.454.0, like the names above it.
import { TicketPercent } from 'lucide-react';

/**
 * Leading icon per section type — a lucide-react component each.
 *
 * ONE definition, mirroring SECTION_LABELS in sectionLabels.js: the picker reads
 * both to render a type, and two copies would drift under an author's hands. Keys
 * MUST track SECTION_LABELS — every labelled type has an icon here, so a new type
 * gets both at once. Keep this file a lookup table only (map + helper), no logic —
 * the same discipline as sectionLabels.js.
 *
 * These are recognition aids for non-developer authors, not decoration: they read
 * as a quiet muted affordance in the picker (see TypeButton), never a colourful
 * accent. All names verified against lucide-react@0.454.0.
 */
export const SECTION_ICONS = {
  heading:        Heading,
  rich_text:      AlignLeft,
  image:          Image,
  cta:            MousePointerClick,
  checklist:      ListChecks,
  notice:         AlertCircle,

  full_width:     RectangleHorizontal,
  container:      SquareStack,
  two_column:     Columns2,
  card_grid:      LayoutGrid,
  highlight_grid: LayoutDashboard,
  timeline:       GitCommitHorizontal,
  tabs:           PanelTop,
  accordion:      ChevronsDownUp,

  price_card:     BadgeDollarSign,
  stat_card:      BarChart3,
  icon_card:      Sparkles,

  custom_html:    Code,
  embed:          Frame,
  custom_css:     Palette,
  debug_json:     Braces,

  course_card:     GraduationCap,
  instructor_card: UserRound,
  course_selector: ListFilter,
  course_list:     List,
  bundle_courses:  Package,
  course_schedule: CalendarClock,

  promotion_bundle: TicketPercent,
};

/**
 * Icon component for a type, with a neutral fallback for any unmapped type —
 * same shape as labelOf: an unlabelled/uniconed Phase-N type is untidy (a plain
 * square) rather than a crash.
 */
export function iconOf(type) {
  return SECTION_ICONS[type] ?? Square;
}
