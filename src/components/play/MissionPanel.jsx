import Image from 'next/image';
import Link from 'next/link';
import { Check, Lightbulb } from 'lucide-react';

import { StarIcons } from './Stars';

function goalOf(task) {
  return task.fill || task.anchor;
}

/**
 * Left column: the mascot's speech bubble (the level's story), then the
 * mission card — number, title, goal, the task list on multi-task levels, the
 * hints revealed so far for the active task, and the hint button.
 */
export function MissionPanel({
  level,
  taskIndex,
  complete,
  hints,
  hintsShown,
  stars,
  onHint,
  nextHref,
  nextLabel,
}) {
  const task = level.tasks[taskIndex];
  const missionLabel = level.id === 'boss' ? 'Boss mission' : `Mission ${String(level.order).padStart(2, '0')}`;
  const canHint = !complete && hintsShown < hints.length;
  const multi = level.tasks.length > 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <Image src="/play/mascot-typing.webp" alt="น้องไนน์" width={360} height={400} className="h-auto w-24 shrink-0" priority />
        <p className="relative mb-6 rounded-[16px] rounded-bl-[4px] bg-white px-4 py-3 text-[15px] leading-relaxed text-[#0D1B2A] shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
          {level.story}
        </p>
      </div>

      <section aria-labelledby="play-mission-title" className="rounded-[20px] border border-white/10 bg-[#132638] p-5">
        <p className="font-en text-sm font-bold uppercase tracking-widest text-[#D4F73F]">{missionLabel}</p>
        <h1 id="play-mission-title" className="mt-1 font-heading text-2xl font-bold leading-snug text-white">
          {level.title}
        </h1>

        {multi ? (
          <ol className="mt-4 flex flex-col gap-2">
            {level.tasks.map((t, i) => {
              const done = complete || i < taskIndex;
              const active = !complete && i === taskIndex;
              return (
                <li
                  key={t.id}
                  aria-current={active ? 'step' : undefined}
                  className={`flex items-center gap-3 rounded-[12px] px-3 py-2 text-sm ${
                    active ? 'border border-[#D4F73F]/50 bg-[#D4F73F]/10 text-white' : 'border border-transparent bg-white/5 text-white/60'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-en text-xs font-bold ${
                      done ? 'bg-[#22C55E] text-[#0D1B2A]' : active ? 'bg-[#D4F73F] text-[#0D1B2A]' : 'border border-white/30'
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" aria-label="ผ่านแล้ว" /> : i + 1}
                  </span>
                  <span>
                    ทำให้ <span className="font-mono text-[#D4F73F]">{goalOf(t)}</span> ตรงกับคำตอบเงา
                    {t.mustUse?.length ? <span className="text-white/50"> · ใช้ {t.mustUse.join(', ')}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-4 rounded-[12px] border border-[#D4F73F]/40 bg-[#D4F73F]/10 px-4 py-3 text-sm text-white">
            ทำให้ <span className="font-mono font-bold text-[#D4F73F]">{goalOf(task)}</span> ตรงกับคำตอบเงา
          </p>
        )}

        {hintsShown > 0 && !complete && (
          <ol className="mt-4 flex flex-col gap-2" aria-label="คำใบ้">
            {hints.slice(0, hintsShown).map((h, i) => (
              <li key={i} className="rounded-[12px] border border-[#48B0FF]/40 bg-[#48B0FF]/10 px-3 py-2 text-sm text-white/90">
                <span className="font-en text-xs font-bold text-[#48B0FF]">HINT {i + 1}</span>
                <p className="mt-0.5">{h.text}</p>
                {h.formula && <p className="mt-1 font-mono text-[15px] text-[#48B0FF]">{h.formula}</p>}
              </li>
            ))}
          </ol>
        )}

        {complete ? (
          <Link
            href={nextHref}
            className="mt-5 flex items-center justify-center rounded-full bg-[#D4F73F] px-4 py-2.5 font-bold text-[#0D1B2A] transition-colors hover:bg-[#D8F852] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            ผ่านด่านแล้ว · {nextLabel}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onHint}
            disabled={!canHint}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#48B0FF] px-4 py-2.5 font-bold text-[#48B0FF] transition-colors hover:bg-[#48B0FF]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Lightbulb className="h-4 w-4" aria-hidden="true" />
            {canHint ? 'ขอคำใบ้ (หัก 1 ดาว)' : 'ใช้คำใบ้ครบแล้ว'}
          </button>
        )}

        <p className="mt-3 flex items-center justify-center" aria-label={`ดาวที่จะได้ ${stars} ดาว`}>
          <StarIcons stars={stars} />
        </p>
      </section>
    </div>
  );
}
