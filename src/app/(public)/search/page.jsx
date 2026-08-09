import { SearchClient } from './_components/SearchClient';

export const metadata = {
  title: 'ค้นหา | 9Expert Training',
  description: 'ค้นหาหลักสูตร บทความ และตารางอบรมที่ 9Expert Training',
};

export const revalidate = 1800;

/**
 * /search — SHIPS NO CORPUS.
 *
 * This page used to fetch every public course, every schedule, every active
 * article, every career path and every promotion, and hand all of it to the
 * client as props so the client could `.includes()` over it. Two things were
 * wrong with that, and only one of them was performance:
 *
 *  1. Every visitor downloaded the entire searchable corpus BEFORE typing a
 *     character — including the visitors who never typed one.
 *  2. The searchable DEPTH was capped by what was affordable to ship. Course
 *     teasers, objectives and outlines live only on the upstream DETAIL
 *     response and article bodies live in Mongo; neither could ever be in a
 *     payload, so neither could ever be searched. The limit was structural, not
 *     an oversight.
 *
 * Matching now happens on the server (see /api/search and
 * @/lib/search/matchSearch.js) and the client sends a query and receives only
 * matches. `initialQ` is all this page has left to pass.
 *
 * `revalidate` stays at 1800 so the shell is still statically rendered, and so
 * the number lines up with the corpus TTL rather than drifting from it.
 */
export default async function SearchPage({ searchParams }) {
  const sp = await searchParams;
  const initialQ = String(sp?.q ?? '').trim();

  return <SearchClient initialQ={initialQ} />;
}
