import Image from "next/image";
import { photoCropStyle, photoCropValues } from "@/lib/instructors/photoCrop";

/** Show more (<1) or less (>1) of the body for EVERY instructor: multiplies the stored scale and offsetY. */
export const FLOAT_ZOOM = 1;

/**
 * How far the fade layer reaches past each side of the stage, as a fraction of
 * the stage width — arms are wider than the stage and must not meet a hard edge.
 */
const SIDE_BLEED = 0.4;

/** The image box's inline style: the stored crop, zoomed by FLOAT_ZOOM, via the shared helpers. */
export function floatCropStyle(inst) {
  const { scale, offsetY, offsetX } = photoCropValues(inst);
  return photoCropStyle({ scale: scale * FLOAT_ZOOM, offsetY: offsetY * FLOAT_ZOOM, offsetX });
}

/**
 * [K] Instructor — the Masterclass detail page's instructor cards.
 *
 * Its own module so the render tier can mount it without the ~1,100-line page
 * component. `instructors` arrive in the admin's order (getInstructorsByIds
 * re-orders by course.instructor_ids).
 *
 * ── THE FLOATING CUT-OUT, NORMALISED (MC-1b) ───────────────────────────────
 * The photo floats above the card with no box around it, overlaps the card's
 * top edge and fades out at the bottom so the body dissolves into the card —
 * the original Masterclass design. What changed is the image box inside the
 * fixed 260×320 stage: instead of one `object-contain` fit (which made a
 * full-body shot a small figure and a torso shot a large head), it takes the
 * instructor's stored crop through photoCropStyle — the same top / height /
 * width / left percentages the About panel uses — so heads land at one size
 * and height.
 *
 * Layers: stage (260×320, transparent, the layout footprint) → fade layer
 * (stage height, 40% wider on each side, carries the vertical mask: solid to
 * 72%, transparent at the stage's bottom — nothing shows below the stage, the
 * sides are never cut by a vertical edge) → crop reference (stage HEIGHT at the
 * About panel's 336:330 aspect, centred) → image box (the crop) → next/image,
 * `object-contain object-top`.
 *
 * WHY THE CROP REFERENCE IS 336:330 AND NOT THE STAGE. The stored values were
 * tuned in that panel, and `object-contain` decides by the box's aspect whether
 * a photo fits by height or by width. Relative to the taller 260×320 stage both
 * photos fitted by WIDTH (measured: drawn heights 428 vs 672px, where the panel
 * gives 1.41:1 and the admin's alignment), so the heads came out mismatched. At
 * the panel's own aspect the same percentages reproduce the panel exactly,
 * scaled to the stage height — no crop maths changes.
 */
export function MasterclassInstructors({ instructors = [] }) {
  if (instructors.length === 0) return null;
  return (
    // overflow-x-clip: the fade layer's side bleed is wider than a 390px
    // screen; clip (not hidden) so no scroll container is created.
    <section id="mc-instructor" className="overflow-x-clip bg-9e-navy px-4 py-10 md:py-16">
      <div className="max-w-[1200px] mx-auto text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-9e-lime">
          INSTRUCTOR
        </p>
        <h2 className="mt-2 text-xl md:text-3xl font-bold text-white">
          วิทยากรผู้สอน
        </h2>
        <p className="mt-2 text-xs md:text-sm text-9e-air">
          ผู้เชี่ยวชาญประสบการณ์สอนมากกว่า 20 ปี ทั้งภาครัฐและภาคเอกชน
        </p>
        <div
          className={`mt-10 grid items-stretch gap-6 ${
            instructors.length === 1
              ? "mx-auto max-w-[420px]"
              : "mx-auto max-w-3xl grid-cols-1 sm:grid-cols-2"
          }`}
        >
          {instructors.map((inst) => (
            <div key={inst._id} className="relative flex h-full flex-col">
              {inst.image_url && (
                <div data-mc-stage="" className="relative z-20 mx-auto -mb-20 h-[320px] w-[260px]">
                  <div
                    className="absolute inset-y-0 [mask-image:linear-gradient(to_bottom,#000_72%,transparent_100%)]"
                    style={{ left: `${-SIDE_BLEED * 100}%`, right: `${-SIDE_BLEED * 100}%` }}
                  >
                    <div
                      data-mc-crop-ref=""
                      className="absolute inset-y-0 left-1/2 aspect-[336/330] -translate-x-1/2"
                    >
                      <div
                        data-mc-photo=""
                        className="absolute left-1/2 -translate-x-1/2"
                        style={floatCropStyle(inst)}
                      >
                        <Image
                          src={inst.image_url}
                          alt={inst.name}
                          fill
                          className="object-contain object-top"
                          sizes="400px"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="relative z-10 flex flex-1 rounded-[30px] bg-gradient-to-t from-9e-lime to-9e-lime/5 p-0.5">
                <div
                  className={`flex h-full w-full flex-col rounded-[28px] bg-gradient-to-t from-[#24303e] to-[#0e1c2b] px-5 pb-8 text-center ${
                    inst.image_url ? "pt-[85px]" : "pt-8"
                  }`}
                >
                  <h3 className="text-xl md:text-2xl font-bold text-white">
                    {inst.name}
                  </h3>

                  <p className="mt-0.5 text-base md:text-[18px] font-medium text-9e-brand">
                    {inst.title}
                  </p>

                  <div className="flex justify-center">
                    {(() => {
                      const bioLines = inst.bio
                        ? inst.bio
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : (inst.specialties ?? []);

                      return bioLines.length > 0 ? (
                        <ul className="mt-3 space-y-1">
                          {bioLines.map((s, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-2 text-sm md:text-base text-9e-slate-lt-50"
                            >
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-9e-lime" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
