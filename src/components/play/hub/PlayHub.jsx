'use client';

import { useEffect, useState } from 'react';

import { loadProgress, seriesProgress } from '@/lib/play/game/progress';
import { BOSS_CHAPTER, levelHref, nextLevelForPlayer } from '@/lib/play/game/map';

import { HowItWorks, HubCta, HubHero, PlanetCards } from './HubParts';
import { MissionMap } from './MissionMap';

const EXCEL_COURSES_HREF = '/excel-all-courses';

// Same space backdrop as the level page — always dark, whatever the site theme.
const SPACE_BG = {
  backgroundColor: '#0D1B2A',
  backgroundImage: [
    'radial-gradient(ellipse 70% 40% at 70% 0%, rgba(72,176,255,0.18), transparent 70%)',
    'radial-gradient(1px 1px at 24px 36px, rgba(255,255,255,0.5), transparent)',
    'radial-gradient(1px 1px at 132px 92px, rgba(255,255,255,0.3), transparent)',
    'radial-gradient(1.5px 1.5px at 210px 168px, rgba(212,247,63,0.4), transparent)',
    'radial-gradient(1px 1px at 76px 204px, rgba(255,255,255,0.35), transparent)',
  ].join(','),
  backgroundSize: '100% 100%, 240px 240px, 240px 240px, 240px 240px, 240px 240px',
};

/**
 * The /play hub. Progress is read from storage after mount, so the server HTML
 * is the fresh-player view (CH.1 current, everything else locked) and the map
 * and the hero CTA catch up on the client. The hero speaks for the first tier.
 */
export function PlayHub({ tiers }) {
  const [progress, setProgress] = useState({});
  useEffect(() => setProgress(loadProgress()), []);

  const { series, levels } = tiers[0];
  const startId = nextLevelForPlayer(levels, seriesProgress(progress, series));
  const chapterCount = new Set(levels.map((l) => l.chapter).filter((c) => c !== BOSS_CHAPTER)).size;

  return (
    <div style={SPACE_BG} className="text-white">
      <div className="mx-auto max-w-[1200px] px-4 pb-24 md:px-6">
        <HubHero startHref={levelHref(series, startId)} levelCount={levels.length} chapterCount={chapterCount} />
        <PlanetCards excelLevelCount={levels.length} />
        <MissionMap tiers={tiers} progress={progress} />
        <HowItWorks />
        <HubCta coursesHref={EXCEL_COURSES_HREF} />
      </div>
    </div>
  );
}
