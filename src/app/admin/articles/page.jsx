import { requirePage } from '@/lib/rbac/guard';
import { getArticles } from '@/lib/actions/articles';
import { ArticlesAdminClient } from './_components/ArticlesAdminClient';

export const metadata = { title: 'จัดการบทความ' };
export const dynamic = 'force-dynamic';

export default async function ArticlesAdminPage() {
  await requirePage('articles');

  const { items } = await getArticles({ limit: 200 });
  return <ArticlesAdminClient articles={items} />;
}
