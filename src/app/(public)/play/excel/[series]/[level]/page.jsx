import { notFound } from 'next/navigation';

import { assertPlayEnabled } from '@/lib/play/flag';
import { EXCEL_TIERS, getTier } from '@/lib/play/levels/excel/tiers';
import { PlayLevel } from '@/components/play/PlayLevel';

// The tiers' listed levels are the whole space; anything else is a 404 without a render.
export const dynamicParams = false;

export function generateStaticParams() {
  return EXCEL_TIERS.flatMap((t) => t.levels.map((l) => ({ series: t.series, level: l.id })));
}

function find({ series, level: id }) {
  const tier = getTier(series);
  return { tier, level: tier?.levels.find((l) => l.id === id) ?? null };
}

export async function generateMetadata({ params }) {
  const { tier, level } = find(await params);
  return {
    title: level ? `${level.title} · Excel ${tier.label}` : 'Excel',
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }) {
  assertPlayEnabled();
  const { tier, level } = find(await params);
  if (!level) notFound();

  const index = tier.levels.indexOf(level);
  const next = tier.levels[index + 1] || null;

  return (
    <PlayLevel
      level={level}
      tierLabel={tier.label}
      chapterName={tier.chapters[level.chapter].name}
      // Only what the HUD needs (dots, star totals) — not every level's sheet.
      levels={tier.levels.map(({ id, chapter, order }) => ({ id, chapter, order }))}
      nextLevelId={next ? next.id : null}
    />
  );
}
