export function DragHandle({ className = '' }) {
  return (
    <div
      className={
        'cursor-grab select-none px-1 text-9e-slate ' +
        'hover:text-9e-navy active:cursor-grabbing dark:hover:text-white ' +
        className
      }
      title="ลากเพื่อเรียงลำดับ"
      aria-label="Drag handle"
    >
      <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
        <circle cx="3" cy="3"  r="1.5" />
        <circle cx="9" cy="3"  r="1.5" />
        <circle cx="3" cy="8"  r="1.5" />
        <circle cx="9" cy="8"  r="1.5" />
        <circle cx="3" cy="13" r="1.5" />
        <circle cx="9" cy="13" r="1.5" />
      </svg>
    </div>
  );
}
