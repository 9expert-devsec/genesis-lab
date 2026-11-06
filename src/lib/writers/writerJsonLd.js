import { HOME_BREADCRUMB_LABEL } from '@/lib/seo/infoPageJsonLd';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { WRITER_LIST_PATH, writerImageUrl, writerPath } from '@/lib/writers/writerUrls';

/**
 * Structured data for /writer/[slug]: a ProfilePage about one Person or
 * Organization, and its breadcrumb trail. PURE, like the article builders.
 */

export const WRITER_LIST_NAME = 'ผู้เขียน';

const schemaType = (writer) => (writer.type === 'organization' ? 'Organization' : 'Person');

export function writerProfileUrl(writer, siteUrl = SITE_URL) {
  return `${siteUrl}${writerPath(writer.slug)}`;
}

export function buildWriterProfileJsonLd(writer, siteUrl = SITE_URL) {
  const url = writerProfileUrl(writer, siteUrl);
  const image = writerImageUrl(writer);
  const sameAs = (writer.socialLinks ?? []).map((link) => link.url).filter(Boolean);

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    mainEntity: {
      '@type': schemaType(writer),
      name: writer.displayName,
      url,
      ...(image ? { image } : {}),
      // schema.org defines jobTitle on Person, not on Organization.
      ...(schemaType(writer) === 'Person' && writer.role ? { jobTitle: writer.role } : {}),
      ...(writer.bio ? { description: writer.bio } : {}),
      ...(sameAs.length > 0 ? { sameAs } : {}),
    },
  };
}

export function buildWriterBreadcrumbJsonLd(writer, siteUrl = SITE_URL) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: HOME_BREADCRUMB_LABEL, item: siteUrl },
      { '@type': 'ListItem', position: 2, name: WRITER_LIST_NAME, item: `${siteUrl}${WRITER_LIST_PATH}` },
      { '@type': 'ListItem', position: 3, name: writer.displayName, item: writerProfileUrl(writer, siteUrl) },
    ],
  };
}

/**
 * For a `<script>` body. The bio is free text, and a raw `</script>` in it would
 * end the block early, so `<` goes out as its JSON escape.
 */
export function serializeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
