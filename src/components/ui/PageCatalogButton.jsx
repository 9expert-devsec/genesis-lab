import { HeroPdfButton } from '@/components/ui/HeroPdfButton';
import { CATALOG_DOWNLOAD_LABEL, hasCatalog } from '@/lib/pageCatalog';

/**
 * ดาวน์โหลดแคตตาล็อก — the program page's and the skill page's catalog button.
 *
 * ── ONE COMPONENT, TWO PAGES, ONE PREDICATE ─────────────────────────────────
 * ProgramPageClient and SkillPageClient are two components with two heroes,
 * so the button is shared rather than the page. It renders NOTHING — no
 * disabled state, no placeholder — unless hasCatalog(config) says there is a
 * file, and that predicate is the same function the tests call.
 *
 * ── THE TREATMENT IS THE SITE'S PDF BUTTON ──────────────────────────────────
 * HeroPdfButton is what /training-course's ดาวน์โหลดแคตตาล็อกหลักสูตร and
 * /schedule's PDF already are. Both heroes here are gradient surfaces and
 * both pages' own copy is Thai, so the label follows theirs.
 *
 * ── IT OPENS IN A NEW TAB, LIKE THE OUTLINE ─────────────────────────────────
 * The file is raw Cloudinary delivery through the /files/ rewrite, which
 * sends no Content-Disposition, so the anchor — `target="_blank"` with the
 * noopener/noreferrer pair, the repo's external-link shape — opens the PDF
 * in a tab exactly as the course outline under the same rewrite does. It
 * shipped for one round with a `download` attribute; that was reverted on
 * request, and HeroPdfButton's no-`download` rule stands for every caller.
 */
export function PageCatalogButton({ config, className }) {
  if (!hasCatalog(config)) return null;
  return (
    <HeroPdfButton href={config.catalogPdf.path} className={className}>
      {CATALOG_DOWNLOAD_LABEL}
    </HeroPdfButton>
  );
}
