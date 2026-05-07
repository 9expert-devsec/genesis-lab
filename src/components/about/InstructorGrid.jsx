'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const VISIBLE = 4;
const GAP_PX = 24;

export function InstructorGrid({ instructors }) {
  const [current, setCurrent] = useState(0);
  const [step, setStep] = useState(0);
  const trackRef = useRef(null);

  useEffect(() => {
    const compute = () => {
      if (!trackRef.current) return;
      const firstCard = trackRef.current.querySelector('[data-card]');
      if (!firstCard) return;
      setStep(firstCard.offsetWidth + GAP_PX);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [instructors]);

  if (!instructors || instructors.length === 0) {
    return (
      <p className="text-center text-sm text-[#5E6A7E]">
        ยังไม่มีข้อมูลอาจารย์
      </p>
    );
  }

  const maxIndex = Math.max(0, instructors.length - VISIBLE);
  const prev = () => setCurrent((i) => Math.max(0, i - 1));
  const next = () => setCurrent((i) => Math.min(maxIndex, i + 1));
  const showArrows = instructors.length > VISIBLE;

  return (
    <div className="relative px-14">
      {showArrows && (
        <>
          <button
            type="button"
            onClick={prev}
            disabled={current === 0}
            aria-label="ก่อนหน้า"
            className="absolute left-0 top-[40%] z-10 -translate-y-1/2
                       w-10 h-10 rounded-full
                       bg-white dark:bg-[#111d2c]
                       border border-[#E2E8F0] dark:border-[#1e3a5f]
                       shadow-md
                       flex items-center justify-center
                       text-[#0D1B2A] dark:text-white
                       hover:bg-[#005CFF] hover:text-white hover:border-[#005CFF]
                       disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all duration-200"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={next}
            disabled={current === maxIndex}
            aria-label="ถัดไป"
            className="absolute right-0 top-[40%] z-10 -translate-y-1/2
                       w-10 h-10 rounded-full
                       bg-white dark:bg-[#111d2c]
                       border border-[#E2E8F0] dark:border-[#1e3a5f]
                       shadow-md
                       flex items-center justify-center
                       text-[#0D1B2A] dark:text-white
                       hover:bg-[#005CFF] hover:text-white hover:border-[#005CFF]
                       disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all duration-200"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      <div className="overflow-hidden" ref={trackRef}>
        <div
          className="flex gap-6 transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${current * step}px)` }}
        >
          {instructors.map((instructor) => (
            <div
              key={instructor._id}
              data-card
              className="flex-shrink-0 w-full sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-4.5rem)/4)]"
            >
              <InstructorCard instructor={instructor} />
            </div>
          ))}
        </div>
      </div>

      {showArrows && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrent(i)}
              aria-label={`สไลด์ ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-300
                ${i === current
                  ? 'w-6 bg-[#005CFF]'
                  : 'w-2 bg-[#E2E8F0] dark:bg-[#1e3a5f] hover:bg-[#5E6A7E]'
                }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InstructorCard({ instructor }) {
  return (
    <div className="group flex flex-col items-center">
      <div className="relative overflow-hidden rounded-2xl w-full aspect-[3/4]
                      ring-2 ring-transparent
                      group-hover:ring-4 group-hover:ring-[#005CFF]
                      group-hover:shadow-[0_0_28px_rgba(0,92,255,0.45)]
                      transition-all duration-300">
        {instructor.image_url ? (
          <Image
            src={instructor.image_url}
            alt={instructor.name}
            fill
            className="object-cover object-top
                       transition-transform duration-500
                       group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[#5E6A7E]">
            ไม่มีรูป
          </div>
        )}
      </div>
      <div className="mt-3 text-center">
        <p className="font-semibold text-[#0D1B2A] dark:text-white
                      group-hover:text-[#005CFF] dark:group-hover:text-[#48B0FF]
                      transition-colors duration-300">
          {instructor.name}
        </p>
        {instructor.title && (
          <p className="text-sm text-[#5E6A7E] dark:text-[#94a3b8] mt-0.5">
            {instructor.title}
          </p>
        )}
      </div>
    </div>
  );
}
