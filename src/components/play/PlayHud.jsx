import Image from 'next/image';
import Link from 'next/link';
import { Check, ChevronLeft, Star } from 'lucide-react';

/**
 * The bar under the site header: back to the map, which game/series/chapter
 * this is, the chapter's level dots, and the player's star total over every
 * Beginner level (the max is computed from the level count, boss included).
 */
export function PlayHud({ level, chapterName, chapterLevels, progress, starsTotal, starsMax }) {
  const chapterLabel = level.chapter === 4 ? chapterName : `CH.${level.chapter} ${chapterName}`;
  return (
    <div className="border-b border-white/10 bg-[#0D1B2A]/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-6">
        <Link
          href="/play"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4F73F]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          แผนที่
        </Link>

        <div className="flex min-w-0 items-center gap-3">
          <Image src="/play/icon-excel.webp" alt="" width={96} height={96} className="h-9 w-9 shrink-0 rounded-[8px]" />
          <div className="min-w-0 leading-tight">
            <p className="font-en text-xs font-bold uppercase tracking-widest text-[#D4F73F]">
              Excel <span className="font-thai normal-case tracking-normal">แสนสนุก</span> · Beginner
            </p>
            <p className="truncate font-heading text-sm font-bold text-white">{chapterLabel}</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-5">
          <ol className="flex items-center gap-2" aria-label="ด่านในบทนี้">
            {chapterLevels.map((l) => {
              const current = l.id === level.id;
              const passed = !!progress[l.id];
              const state = current ? 'ด่านปัจจุบัน' : passed ? 'ผ่านแล้ว' : 'ยังไม่ผ่าน';
              let cls = 'border border-white/30 text-white/60';
              if (current) cls = 'bg-[#D4F73F] text-[#0D1B2A]';
              else if (passed) cls = 'border-2 border-[#D4F73F] text-[#D4F73F]';
              return (
                <li key={l.id}>
                  <Link
                    href={`/play/excel/beginner/${l.id}`}
                    aria-current={current ? 'page' : undefined}
                    aria-label={`ด่าน ${l.id} · ${state}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-full font-en text-xs font-bold transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${cls}`}
                  >
                    {passed && !current ? <Check className="h-4 w-4" aria-hidden="true" /> : l.id === 'boss' ? 'B' : l.order}
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="inline-flex items-center gap-1.5 font-en text-sm font-bold text-white" aria-label={`ดาวทั้งหมด ${starsTotal} จาก ${starsMax}`}>
            <Star className="h-5 w-5 fill-[#D4F73F] text-[#D4F73F]" aria-hidden="true" />
            {starsTotal}
            <span className="text-white/40">/ {starsMax}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
