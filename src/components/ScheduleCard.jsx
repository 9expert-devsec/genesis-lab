"use client";

import { useId } from "react";

const TYPE_STYLES = {
  classroom: { stroke: "#005eff", dot: "#005eff" },
  hybrid:    { stroke: "#a854f7", dot: "#a854f7" },
  online:    { stroke: "#22C55E", dot: "#22C55E" },
};

const STATUS_STYLES = {
  full:     { bg: "bg-[#ff4b55]", text: "text-white", label: "เต็ม" },
  nearFull: { bg: "bg-[#ffc94a]", text: "text-white", label: "ใกล้เต็ม" },
  open:     { bg: "bg-[#39b980]", text: "text-white", label: "รับสมัคร" },
};

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function ScheduleCard({
  dateLabel = "17-18\nOCT",
  type = "classroom",
  status = "open",
  statusLabel,
  className = "",
}) {
  const maskId = useId();
  const typeStyle = TYPE_STYLES[type] || TYPE_STYLES.classroom;
  const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.open;

  const lines = dateLabel.split("\n");

  return (
    <div
      className={cx(
        "relative h-[60px] w-[72px] flex-shrink-0 sm:h-[80px] sm:w-[88px]",
        className
      )}
    >
      <svg
        width="88"
        height="80"
        viewBox="0 0 90 80"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <mask id={maskId} fill="white">
          <path d="M75 0C82.732 1.06302e-06 89 6.26801 89 14V54C89 61.732 82.732 68 75 68H14C6.26801 68 9.6645e-08 61.732 0 54V14C6.09614e-08 13.2684 0.0559054 12.5499 0.164062 11.8486C1.73559 13.1891 3.77256 14 6 14C10.9706 14 15 9.97056 15 5C15 3.15391 14.4437 1.43799 13.4902 0.00976562C13.6594 0.00371008 13.8293 7.64327e-09 14 0H75Z" />
        </mask>
        <path
          d="M75 0C82.732 1.06302e-06 89 6.26801 89 14V54C89 61.732 82.732 68 75 68H14C6.26801 68 9.6645e-08 61.732 0 54V14C6.09614e-08 13.2684 0.0559054 12.5499 0.164062 11.8486C1.73559 13.1891 3.77256 14 6 14C10.9706 14 15 9.97056 15 5C15 3.15391 14.4437 1.43799 13.4902 0.00976562C13.6594 0.00371008 13.8293 7.64327e-09 14 0H75Z"
          className="fill-white dark:fill-9e-border"
        />
        <path
          d="M75 0V-2V-2V0ZM89 14H91H89ZM89 54H91V54H89ZM75 68V70V70V68ZM14 68V70V70V68ZM0 54H-2H0ZM0 14H-2V14H0ZM0.164062 11.8486L1.46197 10.327L-1.26604 8.00011L-1.81257 11.5438L0.164062 11.8486ZM13.4902 0.00976562L13.4187 -1.98895L9.83686 -1.86075L11.8268 1.12019L13.4902 0.00976562ZM14 0V-2V-2V0ZM75 0V2C81.6274 2 87 7.37258 87 14H89H91C91 5.16344 83.8366 -2 75 -2V0ZM89 14H87V54H89H91V14H89ZM89 54H87C87 60.6274 81.6274 66 75 66V68V70C83.8366 70 91 62.8366 91 54H89ZM75 68V66H14V68V70H75V68ZM14 68V66C7.37258 66 2 60.6274 2 54H0H-2C-2 62.8366 5.16345 70 14 70V68ZM0 54H2V14H0H-2V54H0ZM0 14H2C2 13.3705 2.0481 12.7539 2.14069 12.1535L0.164062 11.8486L-1.81257 11.5438C-1.93629 12.346 -2 13.1664 -2 14H0ZM0.164062 11.8486L-1.13384 13.3703C0.784874 15.0069 3.27772 16 6 16V14V12C4.26739 12 2.68631 11.3713 1.46197 10.327L0.164062 11.8486ZM6 14V16C12.0751 16 17 11.0751 17 5H15H13C13 8.86599 9.86599 12 6 12V14ZM15 5H17C17 2.74605 16.3194 0.645684 15.1536 -1.10066L13.4902 0.00976562L11.8268 1.12019C12.5679 2.2303 13 3.56178 13 5H15ZM13.4902 0.00976562L13.5618 2.00849C13.7126 2.00309 13.8581 2 14 2V0V-2C13.8006 -2 13.6063 -1.99567 13.4187 -1.98895L13.4902 0.00976562ZM14 0V2H75V0V-2H14V0Z"
          fill={typeStyle.stroke}
          mask={`url(#${maskId})`}
        />
        <circle cx="6.5" cy="5.5" r="5.5" fill={typeStyle.dot} />
      </svg>

      <div className="pointer-events-none absolute inset-0 z-10 flex -translate-y-[3px] flex-col items-center justify-center gap-[1px] sm:-translate-y-[5px]">
        {lines.map((line, i) => (
          <div
            key={i}
            className={cx(
              "leading-none text-center whitespace-nowrap",
              i === lines.length - 1 && lines.length > 1
                ? "text-[0.6rem] sm:text-[0.72rem] font-bold text-9e-slate-dp-50 dark:text-white"
                : "text-[0.68rem] sm:text-[0.82rem] font-bold text-9e-navy dark:text-white"
            )}
          >
            {line}
          </div>
        ))}

        <div
          className={cx(
            "mt-[1px] rounded-full px-1.5 py-[2px] text-[0.55rem] font-bold leading-none whitespace-nowrap sm:mt-[2px] sm:px-2 sm:py-[3px] sm:text-[0.65rem]",
            statusStyle.bg,
            statusStyle.text
          )}
        >
          {statusLabel || statusStyle.label}
        </div>
      </div>
    </div>
  );
}
