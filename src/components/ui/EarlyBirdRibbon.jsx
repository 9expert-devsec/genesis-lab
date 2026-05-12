/**
 * Diagonal "Early Bird" corner ribbon. Pins to the top-left corner of
 * its nearest positioned ancestor — the parent must have
 * `relative overflow-hidden` so the ribbon's tails clip cleanly.
 *
 * Sized for ~83x70px schedule pills. If you reuse this on a larger
 * surface, scale the container/band proportionally.
 */
export function EarlyBirdRibbon({ label = 'Early Bird' }) {
  return (
    <div
      aria-label={label}
      className="pointer-events-none absolute -left-[1px] -top-[1px] z-10 overflow-hidden"
      style={{ width: 56, height: 56 }}
    >
      <div
        className="absolute flex items-center justify-center text-[9px] font-bold leading-none text-9e-navy"
        style={{
          background: '#D4F73F',
          width: 72,
          top: 13,
          left: -20,
          transform: 'rotate(-45deg)',
          padding: '3px 0',
          letterSpacing: '0.03em',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
    </div>
  );
}