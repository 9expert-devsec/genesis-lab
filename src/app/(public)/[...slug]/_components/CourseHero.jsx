import Image from 'next/image';
import Link from 'next/link';
import { Award, Clock, MonitorPlay } from 'lucide-react';

/**
 * Hero for the course detail page.
 *
 * Layout: a contained rounded card inside a page gradient. The
 * `max-w-[1280px]` + `rounded-2xl overflow-hidden` combo clips both the
 * left info panel and the right cover image at the card boundary — no
 * viewport-edge bleed.
 *
 * `heroColor` is the upstream program color (preferred) or the first
 * skill's color (fallback). Dark and saturated colors lighten
 * aggressively so the gradient never competes with the white card.
 */
export function CourseHero({ course, heroColor }) {
  const base = heroColor || '#005CFF';
  const amt = perceivedBrightness(base) < 100 ? 0.7 : 0.15;
  const bgA = lightenColor(base, amt);
  const bgB = lightenColor(base, amt + 0.08);
  const sectionStyle = {
    background: `linear-gradient(180deg, ${bgA} 0%, ${bgB} 100%)`,
  };

  const registrationHref = `/registration/public?course=${String(
    course.course_id
  ).toLowerCase()}`;

  // course_price === 0 means inhouse-only (no public schedule, no public price)
  const isInhouseOnly = !course.course_price || Number(course.course_price) === 0;

  const inhouseHref = `/registration/in-house?course=${String(course.course_id).toLowerCase()}`;

  const hours =
    course.course_traininghours ??
    (course.course_trainingdays ? course.course_trainingdays * 6 : null);

  const hasPromotion =
    course.course_netprice != null &&
    Number(course.course_netprice) > 0 &&
    Number(course.course_netprice) !== Number(course.course_price);

  return (
    <section style={sectionStyle} className="w-full px-4 py-6 lg:px-6">
      <div className="mx-auto max-w-[1200px]">
        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2 lg:gap-6">
          {/* LEFT — standalone rounded white info card */}
          <div className="flex flex-col justify-center rounded-2xl bg-white p-6 shadow-9e-sm lg:p-8">
            <div className="w-full">
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-9e-slate-dp-50">
                {course.course_id}
              </p>

              <h1 className="mb-4 text-xl font-bold leading-tight text-9e-navy lg:text-2xl">
                {course.course_name}
              </h1>

              <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-9e-slate-dp-50">
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span className="font-bold text-9e-navy">
                  {course.course_trainingdays} วัน
                  {hours ? ` (${hours} ชม.)` : ''}
                </span>
                <span>/ ช่วงเวลา 9:00 - 16:00 น.</span>
              </div>

              <div className="mb-5 flex flex-wrap gap-2">
                {course.course_type_public && (
                  <span className="rounded-full border border-9e-brand bg-white px-3 py-1 text-xs font-bold text-9e-brand">
                    Classroom
                  </span>
                )}
                <span className="rounded-full border border-purple-400 bg-white px-3 py-1 text-xs font-bold text-purple-600">
                  Hybrid
                </span>
                {course.course_type_inhouse && (
                  <span className="rounded-full border border-9e-slate-lt-400 dark:border-9e-slate-dp-400 bg-white px-3 py-1 text-xs font-bold text-9e-slate-dp-50">
                    Inhouse
                  </span>
                )}
              </div>

              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-extrabold text-9e-action">
                  {Number(
                    hasPromotion ? course.course_netprice : course.course_price
                  ).toLocaleString('th-TH')}
                </span>
                <span className="text-lg font-bold text-9e-action">บาท</span>
                {hasPromotion && (
                  <span className="text-sm text-9e-slate-dp-50 line-through">
                    ปกติ {Number(course.course_price).toLocaleString('th-TH')}{' '}
                    บาท
                  </span>
                )}
              </div>
              <p className="mb-4 text-xs text-9e-slate-dp-50">
                {isInhouseOnly ? '*รับเฉพาะ InHouse Training เท่านั้น' : '*ราคาดังกล่าวยังไม่รวมภาษีมูลค่าเพิ่ม'}
              </p>

              {(course.course_workshop_status ||
                course.course_certificate_status) && (
                <div className="mb-5 flex flex-wrap gap-4 text-xs text-9e-slate-dp-50">
                  {course.course_workshop_status && (
                    <span className="flex items-center gap-1">
                      <MonitorPlay
                        className="h-3.5 w-3.5 text-9e-action"
                        strokeWidth={2}
                      />
                      Workshop
                    </span>
                  )}
                  {course.course_certificate_status && (
                    <span className="flex items-center gap-1">
                      <Award
                        className="h-3.5 w-3.5 text-9e-action"
                        strokeWidth={2}
                      />
                      e-Certificate
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {!isInhouseOnly && (
                  <Link
                    href={registrationHref}
                    className="rounded-xl bg-9e-action px-5 py-2.5 text-sm font-bold text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-brand"
                  >
                    ลงทะเบียน
                  </Link>
                )}
                <Link
                  href={inhouseHref}
                  className="rounded-xl border-2 border-9e-action px-5 py-2.5 text-sm font-bold text-9e-action transition-colors duration-9e-micro ease-9e hover:bg-9e-action hover:text-white"
                >
                  ขอใบเสนอราคา
                </Link>
              </div>
            </div>
          </div>

          {/* RIGHT — standalone rounded cover image card.
              `overflow-hidden` clips the `fill` image at the rounded
              corners. */}
          <div className="relative hidden min-h-[360px] overflow-hidden rounded-2xl shadow-9e-sm lg:block">
            {course.course_cover_url ? (
              <Image
                src={course.course_cover_url}
                alt={course.course_name}
                fill
                sizes="640px"
                className="object-cover object-center"
                priority
              />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: bgA }}
              >
                {course.program?.programiconurl && (
                  <Image
                    src={course.program.programiconurl}
                    alt=""
                    width={120}
                    height={120}
                    className="object-contain opacity-80"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Perceived brightness (Rec.601) on a 0–255 scale. Used to decide how
 * aggressively to lighten saturated brand colors toward a pastel.
 */
function perceivedBrightness(colorStr) {
  if (!colorStr) return 255;
  let r, g, b;
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    if (hex.length !== 6) return 255;
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (colorStr.startsWith('rgb')) {
    const parts = colorStr.match(/\d+/g);
    if (!parts || parts.length < 3) return 255;
    [r, g, b] = parts.map(Number);
  } else {
    return 255;
  }
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Lighten a color toward white by `amount` (0–1). Accepts `rgb(r,g,b)`
 * or `#rrggbb`. Returns `rgb(r,g,b)`; falls through unchanged for any
 * other input so the caller can treat this as best-effort.
 */
function lightenColor(colorStr, amount) {
  if (!colorStr) return colorStr;
  let r, g, b;
  if (colorStr.startsWith('rgb')) {
    const parts = colorStr.match(/\d+/g);
    if (!parts || parts.length < 3) return colorStr;
    [r, g, b] = parts.map(Number);
  } else if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    if (hex.length !== 6) return colorStr;
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    return colorStr;
  }
  r = Math.min(255, Math.round(r + (255 - r) * amount));
  g = Math.min(255, Math.round(g + (255 - g) * amount));
  b = Math.min(255, Math.round(b + (255 - b) * amount));
  return `rgb(${r},${g},${b})`;
}
