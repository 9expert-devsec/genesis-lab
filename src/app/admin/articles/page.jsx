import { getArticles } from '@/lib/actions/articles';
import { ArticlesAdminClient } from './_components/ArticlesAdminClient';

export const metadata = { title: 'จัดการบทความ' };
export const dynamic = 'force-dynamic';

export default async function ArticlesAdminPage() {
  const { items } = await getArticles({ limit: 100 });
  return <ArticlesAdminClient articles={items} />;
}
