'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';

const KEYWORDS = [
  'Power BI',
  'Power Platform',
  'Power Apps',
  'Power Automate',
  'Excel',
  'Python',
  'SQL',
  'Data',
  'AI',
  'Machine Learning',
  'Microsoft',
  'Cloud',
  'Azure',
  'RPA',
  'Tableau',
  'Analytics',
  'Visualization',
  'Business',
  'BI',
];

function deriveChips(title) {
  if (!title) return ['Instructor'];
  const found = [];
  for (const kw of KEYWORDS) {
    const re = new RegExp(`\\b${kw.replace(/\s+/g, '\\s*')}\\b`, 'i');
    if (re.test(title) && !found.includes(kw)) found.push(kw);
    if (found.length === 3) break;
  }
  if (found.length === 0) return ['Expert'];
  return found;
}

export default function InstructorSection2({ instructors = [] }) {
  const canLoop = instructors.length > 4;
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: canLoop,
    align: 'start',
    slidesToScroll: 1,
    containScroll: canLoop ? false : 'trimSnaps',
  });

  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback((api) => {
    if (!api) return;
    setCanPrev(api.canScrollPrev());
    setCanNext(api.canScrollNext());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect(emblaApi);
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
  }, [emblaApi, onSelect]);

  const prev = () => emblaApi?.scrollPrev();
  const next = () => emblaApi?.scrollNext();

  if (!instructors.length) return null;

  return (
    <section className="relative overflow-hidden bg-9e-ice dark:bg-9e-navy py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(0,92,255,0.10) 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-[1200px]">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          {/* <div
            className="mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5"
            style={{
              borderColor: 'rgba(0,92,255,0.3)',
              background: 'rgba(0,92,255,0.05)',
            }}
          >
            <Users className="h-4 w-4 text-[#48B0FF]" />
            <span
              className="text-sm uppercase text-[#48B0FF]"
              style={{ letterSpacing: '0.7px' }}
            >
              ทีมวิทยากรของเรา
            </span>
          </div> */}
          <h2 className="text-3xl font-extrabold leading-normal text-white md:text-5xl">
            <span className="block leading-normal text-9e-navy dark:text-white">เรียนกับ</span>
            <span
              className="leading-normal block bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(90deg,#48B0FF 0%,#005CFF 50%,#48B0FF 100%)',
              }}
            >
              ผู้เชี่ยวชาญตัวจริง
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#99a1af]">
            วิทยากรที่มีประสบการณ์จากอุตสาหกรรมจริง
            พร้อมถ่ายทอดความรู้ให้เข้าใจง่ายและนำไปใช้ได้
          </p>
        </div>

        <div className="relative px-12 lg:px-14">
          <button
            type="button"
            onClick={prev}
            disabled={!canPrev}
            aria-label="ก่อนหน้า"
            className="absolute left-0 top-[40%] z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#1e2939] bg-[#0d1f35] dark:bg-9e-brand dark:hover:bg-[#005CFF] text-white transition-all duration-200 hover:border-[#005CFF] hover:bg-[#005CFF] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={!canNext}
            aria-label="ถัดไป"
            className="absolute right-0 top-[40%] z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#1e2939] bg-[#0d1f35] dark:bg-9e-brand dark:hover:bg-[#005CFF] text-white transition-all duration-200 hover:border-[#005CFF] hover:bg-[#005CFF] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {instructors.map((ins) => (
                <div
                  key={ins._id}
                  className="min-w-0 flex-shrink-0 basis-full sm:basis-[calc((100%-24px)/2)] lg:basis-[calc((100%)/4)] pt-4 pb-14"
                >
                  <InstructorCard ins={ins} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InstructorCard({ ins }) {
  const chips = deriveChips(ins.title);

  return (
    <article
      className="group relative overflow-hidden rounded-3xl border dark:border-none transition-all duration-300 hover:shadow-[0_20px_50px_-12px_rgba(0,92,255,0.45)] mr-3 bg-[linear-gradient(180deg,rgba(255,255,255,0.4)_20%,#005cff_70%)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.1)_20%,#052d73_70%)]"
      // style={{
        
      //   backgroundImage:
      //     'linear-gradient(180deg,rgba(255,255,255,0.4) 20%,rgba(0,92,255) 70%',
      // }}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        {ins.image_url ? (
          <Image
            src={ins.image_url}
            alt={ins.name}
            fill
            sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw"
            className="object-cover object-top transition-transform duration-500 group-hover:scale-105 mt-4"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
            ไม่มีรูป
          </div>
        )}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-9e-action via-9e-action/50 to-transparent dark:from-[#052d73] dark:via-[#052d73]/50"
        />
      </div>

      <div className="relative -mt-12 px-5 pb-5 ">
        <h3 className="text-lg font-bold text-white">{ins.name}</h3>
        {ins.title && (
          <p
            className="mt-1 text-xs font-semibold uppercase text-white h-8"
            style={{ letterSpacing: '1.2px' }}
          >
            {ins.title}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-md border px-2 py-0.5 text-[10px] font-medium text-white"
              style={{
                borderColor: 'rgba(72,176,255)',
                background: 'rgba(72,176,255,0.5)',
              }}
            >
              {chip}
            </span>
          ))}
        </div>

        <div
          aria-hidden
          className="mt-5 h-px w-full bg-gradient-to-r from-transparent via-[#005CFF]/40 to-transparent"
        />
      </div>
    </article>
  );
}