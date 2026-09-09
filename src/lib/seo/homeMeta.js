/**
 * Home's title and description. One spelling, for the tag and for the graph.
 *
 * ── WHY THIS IS ITS OWN MODULE FOR TWO STRINGS ──────────────────────────────
 * Two surfaces name the home page's title: `metadata.title` in app/page.jsx
 * (which becomes <title> and, with no openGraph block, og:title too) and
 * `WebPage.name` in lib/seo/homeJsonLd. homeJsonLd's own comment states the
 * rule it is keeping — it emits "the page's ACTUAL <title>, built the way
 * app/page.jsx builds it, so structured data cannot assert a title the page
 * does not have."
 *
 * That rule only holds while the two are ONE value. They were, when both spelled
 * `${siteConfig.name} — ${siteConfig.tagline}`. The marketing copy below is not
 * derivable from siteConfig, so keeping the rule means giving the copy a home
 * both files can read. page.jsx cannot be that home: homeJsonLd would have to
 * import from the page that imports it, which is a cycle.
 *
 * It is the same argument as lib/seo/siteUrl.js, one level up: not "these two
 * strings look similar" but "these two strings are one value, and a second
 * spelling that merely agrees today is the defect".
 *
 * ── THE COPY IS APPROVED, VERBATIM ──────────────────────────────────────────
 * Supplied by the marketing team and approved by Pirasak S. on 2026-09-09,
 * round ORIGIN-1. Character for character, including the `|` separator and the
 * mixed Thai/English. Do not reword to fit a length budget, to match another
 * page's phrasing, or to add the brand name to the description a second time.
 * A change here changes what Google shows for the site's front door.
 */

/** The <title>, og:title, and the graph's WebPage.name. */
export const HOME_TITLE = 'อบรม AI, Data & Automation โดยผู้เชี่ยวชาญ | 9Expert';

/** The <meta name="description">. */
export const HOME_DESCRIPTION =
  '9Expert Training สถาบันอบรมด้าน Data, AI และ Automation สอนหลักสูตร Power BI, Excel, n8n, Power Platform โดยผู้เชี่ยวชาญตัวจริง';
