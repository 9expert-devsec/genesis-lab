"use client";
import { useState, useEffect } from "react";

const NAV_ITEMS = [
  { id: "impact", label: "Impact" },
  { id: "learning", label: "Learning" },
  { id: "consulting", label: "Consulting" },
  { id: "awards", label: "Awards" },
  { id: "community", label: "Community" },
];

export default function PortfolioSectionNav() {
  const [visible, setVisible] = useState(false);
  const [activeId, setActiveId] = useState("impact");
  const [onDarkBg, setOnDarkBg] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const first = document.querySelector("#impact");
      const last = document.querySelector("#community");
      if (!first || !last) return;

      const inRange =
        first.getBoundingClientRect().top <= window.innerHeight * 0.55 &&
        last.getBoundingClientRect().bottom >= window.innerHeight * 0.45;
      setVisible(inRange);

      let current = "impact";
      NAV_ITEMS.forEach(({ id }) => {
        const el = document.querySelector(`#${id}`);
        if (el && el.getBoundingClientRect().top <= 160) current = id;
      });
      setActiveId(current);

      const awardsEl = document.querySelector("#awards");
      if (awardsEl) {
        const r = awardsEl.getBoundingClientRect();
        const mid = window.innerHeight / 2;
        setOnDarkBg(r.top < mid && r.bottom > mid);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const lineColor = onDarkBg ? "rgba(255,255,255,0.28)" : "#d8e2ef";
  const dotBase = onDarkBg
    ? "border-white/40 bg-transparent"
    : "border-[#cbd5e1] bg-white dark:bg-9e-navy dark:border-9e-border";
  const labelBase = onDarkBg ? "text-white/70" : "text-[#64748b]";
  const labelActive = onDarkBg ? "text-white" : "text-9e-action";

  // Gap between dots (line space). Label floats outside this gap via CSS.
  const GAP = 20; // px between dot-bottom and next dot-top

  return (
    <nav
      aria-label="Section navigation"
      className={`fixed left-[34px] top-1/2 z-[90] hidden lg:flex
                  -translate-y-1/2 flex-col items-center gap-2
                  transition-all duration-300
                  ${visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
    >
      {NAV_ITEMS.map((item, i) => {
        const isActive = activeId === item.id;
        const isLast = i === NAV_ITEMS.length - 1;

        return (
          <div
            key={item.id}
            className="group relative flex flex-col items-center"
          >
            {/* ── Dot + label stacked ── */}
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .querySelector(`#${item.id}`)
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              aria-label={item.label}
              className="relative flex flex-col items-center"
            >
              {/* Dot */}
              <span
                className={`relative z-[2] flex-none rounded-full border-2
                            transition-all duration-[240ms]
                            ${
                              isActive
                                ? "h-[22px] w-[22px] border-9e-action bg-9e-action shadow-[0_0_0_8px_rgba(0,92,255,0.12),0_0_20px_rgba(0,92,255,0.22)]"
                                : `h-[13px] w-[13px] ${dotBase}
                                 group-hover:h-[16px] group-hover:w-[16px] group-hover:border-9e-action/50`
                            }`}
              />

              {/* Label — directly below dot, outside the line zone */}
              <span
                className={`pointer-events-none select-none
                            w-max max-w-[92px] text-center
                            font-en text-[11px] font-black leading-tight tracking-wide
                            transition-all duration-[200ms]
                            ${
                              isActive
                                ? `mt-[10px] max-h-[20px] opacity-100 translate-y-0 ${labelActive}`
                                : `mt-0 max-h-0 overflow-hidden opacity-0
                   group-hover:mt-[5px] group-hover:max-h-[20px] group-hover:opacity-100 ${labelBase}`
                            }`}
              >
                {item.label}
              </span>
            </a>

            {/* ── Segment line — connects this dot to the next dot ── */}
            {/* Rendered AFTER the label in DOM but positioned between dots */}
            {!isLast && (
              <span
                aria-hidden
                className="block pointer-events-none z-[1]"
                style={{
                  width: "2px",
                  height: `${GAP}px`,
                  background: lineColor,
                  transition: "background 0.3s ease",
                  // small top margin so line starts just below label
                  marginTop: "8px",
                }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
