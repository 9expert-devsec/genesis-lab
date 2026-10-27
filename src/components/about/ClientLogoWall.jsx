/**
 * /about-us client logos as a STATIC wall — deliberately not Home's marquee.
 *
 * Same data as Home (getActiveClientLogos, admin display order), every active
 * logo, no scrolling. Logos rest in greyscale at reduced opacity so the wall
 * reads calm; a hovered cell shows the logo in full colour with a slight lift
 * and a brand-blue glow. In dark mode each cell is a light tile so greyscale
 * marks stay legible. All of that is CSS in globals.css under .about-logo-*.
 *
 * Logos are images, not links (as on Home), so they take no focus.
 */
export default function ClientLogoWall({ logos = [], heading }) {
  const shown = logos.filter((l) => l?.image_url);
  if (!shown.length) return null;

  return (
    <div className="text-center">
      <h2 className="font-heading text-2xl font-bold text-[var(--text-primary)] md:text-[28px]">
        {heading}
      </h2>
      <p className="mx-auto mt-3 max-w-[640px] text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
        ตั้งแต่สถาบันการเงิน พลังงาน ค้าปลีก ไปจนถึงหน่วยงานภาครัฐ เลือกให้ 9Expert พัฒนาทักษะบุคลากร
      </p>
      <ul className="about-logo-wall mt-10">
        {shown.map((logo) => (
          <li key={logo._id}>
            <div className="about-logo-cell">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote admin
                  uploads at arbitrary sizes, same as Home's ClientLogosSection */}
              <img src={logo.image_url} alt={logo.company_name} loading="lazy" decoding="async" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
