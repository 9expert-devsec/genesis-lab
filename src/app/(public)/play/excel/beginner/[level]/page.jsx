import { notFound } from 'next/navigation';

import { assertPlayEnabled } from '@/lib/play/flag';
import { EXCEL_BEGINNER_CHAPTERS, EXCEL_BEGINNER_LEVELS, getLevel } from '@/lib/play/levels/excel/beginner';
import { PlayLevel } from '@/components/play/PlayLevel';

// The 16 ids are the whole space; anything else is a 404 without a render.
export const dynamicParams = false;

export function generateStaticParams() {
  return EXCEL_BEGINNER_LEVELS.map((l) => ({ level: l.id }));
}

export async function generateMetadata({ params }) {
  const { level: id } = await params;
  const level = getLevel(id);
  return {
    title: level ? `${level.title} · Excel Beginner` : 'Excel Beginner',
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }) {
  assertPlayEnabled();
  const { level: id } = await params;
  const level = getLevel(id);
  if (!level) notFound();

  const index = EXCEL_BEGINNER_LEVELS.indexOf(level);
  const next = EXCEL_BEGINNER_LEVELS[index + 1] || null;

  return (
    <PlayLevel
      level={level}
      chapterName={EXCEL_BEGINNER_CHAPTERS[level.chapter]}
      // Only what the HUD needs (dots, star totals) — not every level's sheet.
      levels={EXCEL_BEGINNER_LEVELS.map(({ id, chapter, order }) => ({ id, chapter, order }))}
      nextLevelId={next ? next.id : null}
    />
  );
}
