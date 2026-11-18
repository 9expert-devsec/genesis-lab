import { CircleCheck } from 'lucide-react';
import { sanitizeRichHtml } from '@/lib/sanitizeRichHtml';
import { programCopyIcon } from '@/lib/programCopyIcons';

/**
 * The program page's admin-authored copy (ProgramPageConfig introHeading …
 * benefitCards — see the model and lib/pageConfigUpdate.shapeProgramCopy).
 *
 *   ProgramIntroSection      between the hero and the course grid
 *   ProgramWhySection        after the online courses, before the FAQ
 *   ProgramBenefitSection    straight after "why"
 *
 * Each renders NOTHING when its fields are empty, so a program with no copy
 * renders exactly the page it did before these fields existed.
 *
 * introHtml is sanitised here as well as on save: the seed script and any
 * future writer go around the admin save.
 *
 * Every class below is a complete literal (the JIT only emits what it sees).
 */

const CONTAINER = 'mx-auto max-w-[1200px] px-4 lg:px-6';
const H2 = 'text-xl font-bold leading-snug text-9e-navy dark:text-white md:text-2xl';
const MUTED = 'text-9e-slate-dp-50 dark:text-[#94a3b8]';

const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';
const rows = (v) => (Array.isArray(v) ? v.filter((r) => nonEmpty(r?.title) || nonEmpty(r?.description)) : []);

/** The short lime bar under each heading. */
function AccentBar({ className = '' }) {
  return <span aria-hidden="true" className={`block h-1 w-16 rounded-full bg-9e-lime ${className}`} />;
}

export function ProgramIntroSection({ config }) {
  const heading = config?.introHeading ?? '';
  const html = nonEmpty(config?.introHtml) ? sanitizeRichHtml(config.introHtml) : '';
  if (!nonEmpty(heading) && !nonEmpty(html)) return null;

  return (
    <section id="program-intro" className={`${CONTAINER} pt-10 lg:pt-14`}>
      {nonEmpty(heading) && (
        <>
          <h2 className={H2}>{heading}</h2>
          <AccentBar className="mt-3" />
        </>
      )}
      {html && (
        <div
          className="mt-5 text-base leading-relaxed text-9e-slate-dp-50 dark:text-[#94a3b8] [&_p]:mb-4 [&_p:last-child]:mb-0 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1 [&_strong]:font-semibold [&_strong]:text-9e-navy dark:[&_strong]:text-white [&_a]:text-9e-action [&_a]:underline dark:[&_a]:text-9e-air"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </section>
  );
}

export function ProgramWhySection({ config }) {
  const heading = config?.whyHeading ?? '';
  const lead = config?.whyLead ?? '';
  const items = rows(config?.whyItems);
  if (!nonEmpty(heading) && items.length === 0) return null;

  return (
    <section id="program-why" className={`${CONTAINER} pt-10 lg:pt-14`}>
      <div className="grid grid-cols-1 gap-8 rounded-2xl bg-9e-air-scale-900 p-6 dark:bg-9e-card md:grid-cols-[2fr_3fr] md:gap-10 md:p-10">
        <div>
          {nonEmpty(heading) && (
            <>
              <h2 className={H2}>{heading}</h2>
              <AccentBar className="mt-3" />
            </>
          )}
          {nonEmpty(lead) && <p className={`mt-4 text-base leading-relaxed ${MUTED}`}>{lead}</p>}
        </div>
        {items.length > 0 && (
          <ul className="flex flex-col gap-4 border-9e-air-scale-700 dark:border-[#1e3a5f] md:border-l md:pl-10">
            {items.map((it, i) => (
              <li key={i} className="flex items-start gap-3 text-base leading-relaxed text-9e-navy dark:text-white">
                <CircleCheck
                  aria-hidden="true"
                  className="mt-0.5 h-6 w-6 shrink-0 fill-9e-action text-white dark:fill-9e-air dark:text-9e-card"
                />
                <span>
                  <strong className="font-bold">{it.title} :</strong>{' '}
                  <span className={MUTED}>{it.description}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function ProgramBenefitSection({ config }) {
  const heading = config?.benefitHeading ?? '';
  const lead = config?.benefitLead ?? '';
  const cards = rows(config?.benefitCards);
  if (!nonEmpty(heading) && cards.length === 0) return null;

  return (
    <section id="program-benefit" className="mt-10 bg-9e-orange-900 py-12 dark:bg-transparent lg:mt-14 lg:py-16">
      <div className={CONTAINER}>
        <div className="flex flex-col items-center text-center">
          {nonEmpty(heading) && (
            <>
              <h2 className={H2}>{heading}</h2>
              <AccentBar className="mt-3" />
            </>
          )}
          {nonEmpty(lead) && <p className={`mt-4 max-w-2xl text-base leading-relaxed ${MUTED}`}>{lead}</p>}
        </div>
        {cards.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {cards.map((c, i) => {
              const Icon = programCopyIcon(c.icon);
              return (
                <article
                  key={i}
                  className="rounded-2xl border border-transparent bg-white p-6 shadow-9e-md dark:border-[#1e3a5f] dark:bg-transparent dark:shadow-none"
                >
                  <Icon aria-hidden="true" data-icon={c.icon || 'fallback'} className="h-8 w-8 text-9e-brand dark:text-9e-air" />
                  <h3 className="mt-4 text-base font-bold text-9e-navy dark:text-white">{c.title}</h3>
                  <p className={`mt-2 text-sm leading-relaxed ${MUTED}`}>{c.description}</p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
