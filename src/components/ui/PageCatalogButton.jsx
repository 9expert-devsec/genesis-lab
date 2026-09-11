import { HeroPdfButton } from '@/components/ui/HeroPdfButton';
import { CATALOG_DOWNLOAD_LABEL, catalogDownloadName, hasCatalog } from '@/lib/pageCatalog';

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
 * ── IT DOWNLOADS, BY ATTRIBUTE ──────────────────────────────────────────────
 * The file is raw Cloudinary delivery through the /files/ rewrite, which
 * sends no Content-Disposition — the course outline under the same rewrite
 * opens in a tab. `downloadAs` makes this one save instead, named for the
 * program or skill rather than for its key.
 */
export function PageCatalogButton({ config, name, className }) {
  if (!hasCatalog(config)) return null;
  return (
    <HeroPdfButton
      href={config.catalogPdf.path}
      downloadAs={catalogDownloadName(name)}
      className={className}
    >
      {CATALOG_DOWNLOAD_LABEL}
    </HeroPdfButton>
  );
}
