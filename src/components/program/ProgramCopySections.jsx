import { CircleCheck } from 'lucide-react';
import { sanitizeRichHtml } from '@/lib/sanitizeRichHtml';
import { programCopyIcon } from '@/lib/programCopyIcons';
import { programTint } from '@/lib/programTint';

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
 *
 * PROGRAM COLOUR (`programColor`, the upstream `programcolor` hex): the accent
 * bars at full opacity and the benefit band's tint come in as INLINE values —
 * a style, or the private custom properties --program-band-light /
 * --program-band-dark read by literal arbitrary classes. An invalid or missing
 * colour (lib/programTint returns null) keeps the lime bar and peach band.
 */

const CONTAINER = 'mx-auto max-w-[1200px] px-4 lg:px-6';
const H2 = 'text-xl font-bold leading-snug text-9e-navy dark:text-white md:text-2xl';
const MUTED = 'text-9e-slate-dp-50 dark:text-[#94a3b8]';

const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';
const rows = (v) => (Array.isArray(v) ? v.filter((r) => nonEmpty(r?.title) || nonEmpty(r?.description)) : []);

/**
 * Benefit band tint, as alpha over the band. Light: over the page, faint
 * enough that white cards and muted text keep their contrast on a yellow
 * program. Dark: over the 9e-card surface, enough to read as the program's
 * hue without lifting the surface into the outlined cards.
 */
export const BAND_ALPHA_LIGHT = 0.08;
export const BAND_ALPHA_DARK = 0.1;

/** The short bar under each heading: the program colour, else brand lime. */
function AccentBar({ className = '', color = null }) {
  const accent = programTint(color, 1);
  if (accent) {
    return (
      <span
        aria-hidden="true"
        data-accent="program"
        className={`block h-1 w-16 rounded-full ${className}`}
        style={{ backgroundColor: accent }}
      />
    );
  }
  return <span aria-hidden="true" data-accent="fallback" className={`block h-1 w-16 rounded-full bg-9e-lime ${className}`} />;
}

export function ProgramIntroSection({ config, programColor = null }) {
  const heading = config?.introHeading ?? '';
  const html = nonEmpty(config?.introHtml) ? sanitizeRichHtml(config.introHtml) : '';
  if (!nonEmpty(heading) && !nonEmpty(html)) return null;

  return (
    <section id="program-intro" className={`${CONTAINER} pt-10 lg:pt-14`}>
      {nonEmpty(heading) && (
        <>
          <h2 className={H2}>{heading}</h2>
          <AccentBar className="mt-3" color={programColor} />
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

export function ProgramWhySection({ config, programColor = null }) {
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
              <AccentBar className="mt-3" color={programColor} />
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

export function ProgramBenefitSection({ config, programColor = null }) {
  const heading = config?.benefitHeading ?? '';
  const lead = config?.benefitLead ?? '';
  const cards = rows(config?.benefitCards);
  if (!nonEmpty(heading) && cards.length === 0) return null;

  // Two complete class literals, picked here, never built. Dark mode is the
  // 9e-card surface either way (it must differ from <main>'s 9e-border); the
  // program colour is layered on it as a flat gradient so it does not replace
  // the surface underneath.
  const light = programTint(programColor, BAND_ALPHA_LIGHT);
  const dark = programTint(programColor, BAND_ALPHA_DARK);
  const tinted = Boolean(light && dark);
  const bandClass = tinted
    ? 'mt-10 py-12 [background-color:var(--program-band-light)] dark:bg-9e-card dark:[background-image:linear-gradient(var(--program-band-dark),var(--program-band-dark))] lg:mt-14 lg:py-16'
    : 'mt-10 bg-9e-orange-900 py-12 dark:bg-9e-card lg:mt-14 lg:py-16';
  const bandStyle = tinted ? { '--program-band-light': light, '--program-band-dark': dark } : undefined;

  return (
    <section
      id="program-benefit"
      data-band={tinted ? 'program' : 'fallback'}
      className={bandClass}
      style={bandStyle}
    >
      <div className={CONTAINER}>
        <div className="flex flex-col items-center text-center">
          {nonEmpty(heading) && (
            <>
              <h2 className={H2}>{heading}</h2>
              <AccentBar className="mt-3" color={programColor} />
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
